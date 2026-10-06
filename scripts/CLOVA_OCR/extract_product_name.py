"""제품 정면 사진에서 브랜드/제품명 텍스트를 추출한다.

성분표 전체를 읽는 기존 벤치마크(engines_clova.py)와 달리, 여기서는 CLOVA OCR이
반환하는 각 텍스트의 boundingPoly 높이를 봐서 "가장 크게 인쇄된 글자"를 브랜드/
제품명 후보로 고른다 — 화장품 패키지 정면은 보통 제품명이 가장 큰 글씨이기 때문.

그림으로만 된 로고(글자가 아닌 심볼)는 OCR로 못 읽는다. 실제 제품 사진을 받아보고
필요하면 별도 이미지 매칭(로고 데이터셋 필요)을 추가한다.
"""
import argparse
import base64
import os
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

_FORMATS = {".png": "png", ".jpg": "jpg", ".jpeg": "jpg"}


# ── 영어 → 한글 발음 전사 ──────────────────────────────────────────────
# DB(products.name·brands.name)는 전부 한글인데 포장은 영문인 경우(Torriden,
# ma:nyo 등)가 있어, pg_trgm 대조 전에 영문 후보를 한글 발음으로 근사 변환한다.

_CHOSEONG = list("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")
_JUNGSEONG = list("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
_JONGSEONG = [""] + list("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ")

_ONSET = {  # 로마자 자음 → 초성. 2글자 다이그래프를 먼저 조회해야 해서 딕셔너리 하나에 섞어두고 길이순으로 조회한다.
    "ch": "ㅊ", "sh": "ㅅ", "th": "ㅆ", "ph": "ㅍ", "wh": "ㅎ", "ck": "ㅋ",
    "b": "ㅂ", "c": "ㅋ", "d": "ㄷ", "f": "ㅍ", "g": "ㄱ", "h": "ㅎ", "j": "ㅈ",
    "k": "ㅋ", "l": "ㄹ", "m": "ㅁ", "n": "ㄴ", "p": "ㅍ", "q": "ㅋ", "r": "ㄹ",
    "s": "ㅅ", "t": "ㅌ", "v": "ㅂ", "w": "ㅇ", "x": "ㅋ", "y": "ㅇ", "z": "ㅈ",
}
_CODA = {"p": "ㅂ", "t": "ㅅ", "k": "ㄱ", "m": "ㅁ", "n": "ㄴ", "l": "ㄹ", "ng": "ㅇ"}
_VOWEL = {
    "ee": "ㅣ", "ea": "ㅣ", "oo": "ㅜ", "ou": "ㅜ", "ow": "ㅗ",
    "a": "ㅏ", "e": "ㅔ", "i": "ㅣ", "o": "ㅗ", "u": "ㅜ", "y": "ㅣ",
}


def _compose_hangul(cho: str, jung: str, jong: str = "") -> str:
    return chr(0xAC00 + (_CHOSEONG.index(cho) * 21 + _JUNGSEONG.index(jung)) * 28 + _JONGSEONG.index(jong))


def transliterate(word: str) -> str:
    """영어 단어를 한글 발음으로 대략 옮긴다 — 국립국어원 외래어 표기법의 정밀한
    구현이 아니라, 자음+모음을 그리디하게 묶어 한글 음절을 만드는 규칙 근사치다.

    ponytail: 규칙 기반 근사치라 실제 표기와 어긋날 수 있다(예: "torriden" →
    이 로직은 "토리덴", DB 실제 표기는 "토리든" — 마지막 모음이 다르다). "ma:nyo"
    →"마녀공장"처럼 발음과 무관하게 지어진 브랜드명은 애초에 전사로 못 맞힌다.
    그래도 trigram 퍼지 매칭에서 0점보다는 훨씬 낫다(실측: 이 정도 근사만으로도
    유사도가 0에서 유의미하게 올라감). 정밀도가 더 필요해지면 브랜드 별칭
    테이블이나 실제 G2P 라이브러리로 교체할 것.
    """
    word = re.sub(r"(.)\1", r"\1", re.sub(r"[^a-z]", "", word.lower()))  # 겹자음/겹모음은 소리가 하나뿐(torriden→toriden)
    syllables = []
    i, n = 0, len(word)
    while i < n:
        onset = "ㅇ"
        for length in (2, 1):
            cluster = word[i:i + length]
            if cluster in _ONSET:
                onset, i = _ONSET[cluster], i + length
                break

        vowel = "ㅡ"  # 모음 없이 자음이 이어지면 채움모음을 넣는다 (cream → 크림)
        for length in (2, 1):
            cluster = word[i:i + length]
            if cluster in _VOWEL:
                vowel, i = _VOWEL[cluster], i + length
                break

        coda = ""
        for length in (2, 1):
            cluster = word[i:i + length]
            if cluster in _CODA and word[i + length:i + length + 1] not in tuple("aeiouy"):
                coda, i = _CODA[cluster], i + length
                break

        syllables.append(_compose_hangul(onset, vowel, coda))
    return "".join(syllables)


@dataclass
class TextField:
    text: str
    height: float  # boundingPoly 평균 높이(px). 값이 클수록 큰 글씨.
    box: list[tuple[float, float]] | None = None  # boundingPoly 꼭짓점 (--draw용)


def _call_clova(image_path: Path, secret_key: str, invoke_url: str, lang: str = "ko") -> list[dict]:
    import requests

    fmt = _FORMATS.get(image_path.suffix.lower(), "jpg")
    payload = {
        "version": "V2",
        "requestId": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "lang": lang,
        "images": [{
            "format": fmt,
            "name": image_path.stem,
            "data": base64.standard_b64encode(image_path.read_bytes()).decode("utf-8"),
        }],
    }
    headers = {"Content-Type": "application/json", "X-OCR-SECRET": secret_key}
    response = requests.post(invoke_url, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()["images"][0].get("fields", [])


def _field_height(field: dict) -> float:
    ys = [v["y"] for v in field["boundingPoly"]["vertices"]]
    return max(ys) - min(ys)


def rank_by_height(fields: list[dict]) -> list[TextField]:
    """CLOVA raw fields를 글자 높이 내림차순으로 정렬한다 (제일 큰 글씨 = 제품명/브랜드 후보)."""
    ranked = [
        TextField(
            text=f["inferText"],
            height=_field_height(f),
            box=[(v["x"], v["y"]) for v in f["boundingPoly"]["vertices"]],
        )
        for f in fields
    ]
    return sorted(ranked, key=lambda t: t.height, reverse=True)


def extract(image_path: Path, secret_key: str, invoke_url: str, top_n: int = 3) -> tuple[list[TextField], list[TextField]]:
    """(top_n 후보, 전체 필드) 반환."""
    ranked = rank_by_height(_call_clova(image_path, secret_key, invoke_url))
    return ranked[:top_n], ranked


def draw(image_path: Path, top: list[TextField], everything: list[TextField], out_path: Path) -> None:
    """전체 인식 영역은 회색, 후보 top-N은 빨간 굵은 박스+순위로 표시해 저장한다."""
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    img = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")  # 폰 사진 회전 반영 (CLOVA가 보는 방향과 동일)
    d = ImageDraw.Draw(img)
    w = max(2, img.width // 400)
    try:
        font = ImageFont.truetype("malgun.ttf", max(20, img.width // 40))  # 한글 지원 (Windows)
    except OSError:
        font = ImageFont.load_default()
    for t in everything:
        d.polygon(t.box, outline=(160, 160, 160), width=max(1, w // 2))
    for rank, t in enumerate(top, 1):
        d.polygon(t.box, outline=(255, 0, 0), width=w * 2)
        x, y = t.box[0]
        d.text((x, max(0, y - font.size - 4)), f"{rank}. {t.text}", fill=(255, 0, 0), font=font)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)


def _candidate_tokens(candidates: list[TextField]) -> set[str]:
    """2글자 이상 후보 텍스트 + 영문 후보의 한글 전사(transliterate)를 모은다."""
    tokens = set()
    for c in candidates:
        if len(c.text) < 2:
            continue
        tokens.add(c.text)
        if re.search(r"[a-zA-Z]{2,}", c.text):
            tokens.add(transliterate(c.text))
    return tokens


def match_products_by_overlap(candidates: list[TextField], dsn: str, top_n: int = 3) -> list[dict]:
    """OCR 후보 텍스트가 제품명에 몇 개나 그대로 포함되는지 세어, 가장 많이 겹치는 top_n을 반환한다.

    활성 제품이 수천 건 수준이라 파이썬에서 전수 스캔해도 비용이 무시할 만하다. pg_trgm
    유사도와 달리 원문 그대로 겹치는지만 보므로 오탐은 적지만, 붙여쓰기 차이("자작나무수분토너"
    vs DB의 "자작나무 수분 토너")에는 약하다 — match_products_by_trigram()과 병행해서 본다.
    """
    import psycopg2

    tokens = _candidate_tokens(candidates)
    if not tokens:
        return []

    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, COALESCE(display_name, name) FROM products WHERE status = 'active'")
        rows = cur.fetchall()

    scored = []
    for pid, name in rows:
        matched = [t for t in tokens if t in name]
        if matched:
            scored.append({"id": pid, "name": name, "overlap": len(matched), "matched": matched})

    return sorted(scored, key=lambda r: r["overlap"], reverse=True)[:top_n]


def match_products_by_trigram(candidates: list[TextField], dsn: str, top_n: int = 3) -> list[dict]:
    """OCR 후보 전체를 한 문자열로 합쳐 pg_trgm similarity()로 대조한다 (겹침 개수 방식의 보완용).

    붙여쓰기·어순 차이에 강하지만, 흔한 단어 하나가 튀면 오탐이 날 수 있다 — 후보를
    합쳐서 한 번에 비교해 그 영향을 줄인다(브랜드+제품명이 같이 들어있는 진짜 정답이 이김).
    """
    import psycopg2

    tokens = _candidate_tokens(candidates)
    query_text = " ".join(tokens)
    if not query_text:
        return []

    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, COALESCE(display_name, name), similarity(COALESCE(display_name, name), %s) AS sim
            FROM products
            WHERE status = 'active'
            ORDER BY sim DESC
            LIMIT %s
            """,
            (query_text, top_n),
        )
        return [{"id": pid, "name": name, "sim": float(sim)} for pid, name, sim in cur.fetchall()]


def match_products_by_name_en(candidates: list[TextField], dsn: str, top_n: int = 3) -> list[dict]:
    """OCR 후보를 **영문 제품명 그대로** 대조한다 (product_names_en).

    포장이 영문일 때 이 경로가 가장 정확하다. 실측(scripts/eval_product_match.py,
    표본 200건):

        영문명 직접 대조        top-1 82.5%  top-3 98.0%  후보 0건 0.0%
        한글 발음 전사 후 대조   top-1  4.5%  top-3  8.5%  후보 0건 83.5%

    전사 방식(match_products_by_trigram)이 이렇게 약한 이유는 두 가지다 —
    `Low Molecular → 저분자`처럼 한글명이 음차가 아니라 **번역**인 경우가 많고,
    음차인 경우에도 점수가 0.15 구간에 깔려 임계값을 세울 수 없다.

    영문명이 없는 제품(약 970개)에는 이 함수가 아무것도 내지 않는다. 그래서
    전사 방식을 지우지 않고 병행한다.
    """
    import psycopg2

    query_text = " ".join(_candidate_tokens(candidates))
    if not query_text:
        return []

    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.product_id,
                   COALESCE(p.display_name, p.name),
                   e.name_en,
                   similarity(lower(e.name_en), lower(%s)) AS sim
            FROM product_names_en e
            JOIN products p ON p.id = e.product_id
            WHERE p.status = 'active'
            ORDER BY sim DESC, e.product_id
            LIMIT %s
            """,
            (query_text, top_n),
        )
        return [
            {"id": pid, "name": name, "name_en": name_en, "sim": float(sim)}
            for pid, name, name_en, sim in cur.fetchall()
        ]


def demo() -> None:
    """rank_by_height()만 검증하는 자체 테스트 (API 호출 없음)."""
    fake_fields = [
        {"inferText": "1매당", "boundingPoly": {"vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 20}]}},
        {"inferText": "이니스프리", "boundingPoly": {"vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 80}]}},
        {"inferText": "그린티씨드세럼", "boundingPoly": {"vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 50}]}},
    ]
    ranked = rank_by_height(fake_fields)
    assert [t.text for t in ranked] == ["이니스프리", "그린티씨드세럼", "1매당"], ranked

    assert transliterate("bifida") == "비피다"  # DB 표기와 정확히 일치하는 케이스
    assert transliterate("torriden")[:2] == "토리"  # 근사치라 끝 음절까지는 안 맞아도 앞은 맞아야 함
    assert all("가" <= ch <= "힣" for ch in transliterate("hyaluronic"))  # 전부 완성형 한글이어야 함

    print("demo OK:", [(t.text, t.height) for t in ranked])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", nargs="?", type=Path, help="제품 정면 사진 경로")
    parser.add_argument("--top", type=int, default=10, help="후보 개수 (기본 10)")
    parser.add_argument("--draw", action="store_true", help="추출 영역을 박스로 그린 이미지를 output/에 저장")
    parser.add_argument("--search", action="store_true", help="전체 후보 텍스트로 DB 대조 (겹침 개수 + 영문명 + pg_trgm 유사도 병행), 각 3개 출력")
    parser.add_argument("--demo", action="store_true", help="API 호출 없이 자체 테스트만 실행")
    args = parser.parse_args()

    if args.demo or not args.image:
        demo()
        raise SystemExit

    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    secret = os.environ["CLOVA_OCR_SECRET"]
    url = os.environ["CLOVA_OCR_INVOKE_URL"]

    candidates, everything = extract(args.image, secret, url, top_n=args.top)
    for i, c in enumerate(candidates, 1):
        print(f"{i}. {c.text!r}  (height={c.height:.0f}px)")

    if args.draw:
        out = Path(__file__).resolve().parent / "output" / f"{args.image.stem}_boxes.png"
        draw(args.image, candidates, everything, out)
        print(f"\n박스 이미지: {out}")

    if args.search and candidates:
        dsn = os.environ["DATABASE_DSN"]

        print("\nDB 대조 결과 — 겹치는 텍스트 개수순:")
        for m in match_products_by_overlap(candidates, dsn):
            print(f"  - {m['name']} (id={m['id']}, overlap={m['overlap']}, matched={m['matched']})")

        print("\nDB 대조 결과 — 영문명 직접 대조:")
        for m in match_products_by_name_en(candidates, dsn):
            print(f"  {m['sim']:.3f}  {m['name']}  ← {m['name_en']}")

        print("\nDB 대조 결과 — pg_trgm 유사도순(한글 발음 전사):")
        for m in match_products_by_trigram(candidates, dsn):
            print(f"  - {m['name']} (id={m['id']}, sim={m['sim']:.2f})")
