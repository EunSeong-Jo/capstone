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

# 텍스트 유사도(pg_trgm) vs 이미지 유사도(pHash) 가중치. 텍스트 쪽을 더 믿는 이유:
# 매대 사진은 정품 스튜디오컷과 각도·배경·조명이 달라 pHash가 구조적으로 불리하다.
TEXT_WEIGHT = 0.7
IMAGE_WEIGHT = 0.3


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


def combine_score(text_sim: float, image_sim: float | None) -> float:
    """text_sim·image_sim(0~1)을 가중합한다. 이미지 비교 실패 시 텍스트만으로 채점."""
    if image_sim is None:
        return text_sim
    return TEXT_WEIGHT * text_sim + IMAGE_WEIGHT * image_sim


def _text_shortlist(candidates: list[TextField], dsn: str, limit: int = 15) -> dict[int, dict]:
    """OCR 후보 전체를 한 문자열로 합쳐 pg_trgm similarity()로 한 번에 조회한다.

    후보별로 따로 조회해 최고점만 남기면 "2"·"5"·브랜드명 단독처럼 흔한
    단어가 자기 혼자 부른 질의에서 비정상적으로 높은 점수를 받아(같은 브랜드
    제품 전체가 비슷하게 채점됨) 정답보다 앞서는 문제가 있었다. 합쳐서 한 번에
    비교하면 브랜드+제품명이 같이 들어있는 진짜 정답이 이긴다(실측으로 확인).
    """
    import psycopg2

    words = []
    for c in candidates:
        if len(c.text) < 2:
            continue  # trigram은 2글자 미만이면 무의미
        words.append(c.text)
        if re.search(r"[a-zA-Z]{2,}", c.text):
            words.append(transliterate(c.text))  # 영문 후보는 한글 발음도 같이 대조
    query_text = " ".join(words)
    if not query_text:
        return {}
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, COALESCE(display_name, name), image_url,
                   similarity(COALESCE(display_name, name), %s) AS sim
            FROM products
            WHERE status = 'active'
            ORDER BY sim DESC
            LIMIT %s
            """,
            (query_text, limit),
        )
        return {
            pid: {"id": pid, "name": name, "image_url": image_url, "text_sim": float(sim)}
            for pid, name, image_url, sim in cur.fetchall()
        }


def _image_sim(photo_hash, image_url: str, timeout: float = 10) -> float | None:
    """제품 이미지를 내려받아 pHash 해밍 거리를 0~1 유사도로 변환한다. 실패하면 None."""
    import imagehash
    import requests
    from io import BytesIO
    from PIL import Image

    try:
        resp = requests.get(image_url, timeout=timeout)
        resp.raise_for_status()
        product_hash = imagehash.phash(Image.open(BytesIO(resp.content)).convert("RGB"))
    except Exception:
        return None
    return 1 - (photo_hash - product_hash) / len(photo_hash.hash) ** 2


def match_products(image_path: Path, candidates: list[TextField], dsn: str, top_n: int = 3) -> list[dict]:
    """OCR 후보 텍스트로 DB를 좁힌 뒤, 후보 제품 이미지와 실물 사진을 pHash로 대조해 재정렬한다."""
    import imagehash
    from PIL import Image, ImageOps

    shortlist = _text_shortlist(candidates, dsn)
    if not shortlist:
        return []

    photo_hash = imagehash.phash(ImageOps.exif_transpose(Image.open(image_path)).convert("RGB"))
    for row in shortlist.values():
        row["image_sim"] = _image_sim(photo_hash, row["image_url"]) if row["image_url"] else None
        row["score"] = combine_score(row["text_sim"], row["image_sim"])

    return sorted(shortlist.values(), key=lambda r: r["score"], reverse=True)[:top_n]


def demo() -> None:
    """rank_by_height()만 검증하는 자체 테스트 (API 호출 없음)."""
    fake_fields = [
        {"inferText": "1매당", "boundingPoly": {"vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 20}]}},
        {"inferText": "이니스프리", "boundingPoly": {"vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 80}]}},
        {"inferText": "그린티씨드세럼", "boundingPoly": {"vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 50}]}},
    ]
    ranked = rank_by_height(fake_fields)
    assert [t.text for t in ranked] == ["이니스프리", "그린티씨드세럼", "1매당"], ranked

    assert combine_score(0.8, None) == 0.8  # 이미지 비교 실패 시 텍스트만
    assert abs(combine_score(1.0, 1.0) - 1.0) < 1e-9
    assert abs(combine_score(0.0, 1.0) - IMAGE_WEIGHT) < 1e-9

    assert transliterate("bifida") == "비피다"  # DB 표기와 정확히 일치하는 케이스
    assert transliterate("torriden")[:2] == "토리"  # 근사치라 끝 음절까지는 안 맞아도 앞은 맞아야 함
    assert all("가" <= ch <= "힣" for ch in transliterate("hyaluronic"))  # 전부 완성형 한글이어야 함

    print("demo OK:", [(t.text, t.height) for t in ranked])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", nargs="?", type=Path, help="제품 정면 사진 경로")
    parser.add_argument("--top", type=int, default=10, help="후보 개수 (기본 10)")
    parser.add_argument("--draw", action="store_true", help="추출 영역을 박스로 그린 이미지를 output/에 저장")
    parser.add_argument("--search", action="store_true", help="전체 후보 텍스트 + 제품 이미지로 DB 대조, 최유사 3개 출력")
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
        matches = match_products(args.image, candidates, dsn)
        print(f"\nDB 대조 결과 (텍스트 {TEXT_WEIGHT} + 이미지 {IMAGE_WEIGHT} 가중):")
        for m in matches:
            img_sim = "n/a" if m["image_sim"] is None else f"{m['image_sim']:.2f}"
            print(
                f"  - {m['name']} (id={m['id']}, score={m['score']:.2f}, "
                f"text={m['text_sim']:.2f}, image={img_sim})"
            )
