# 피부타입별 성분 분류 데이터

출처: PR #36 (mill-5). 원본은 저장소 루트 `8TYPE_ingredient/`에 한글 파일명으로
올라온 CSV 14개였고, 여기서는 경로를 옮기고 소문자 ASCII로 이름을 바꿨다.
**내용은 원본 그대로다** — 바이트 단위로 대조해 옮겼다.

평문 CSV로 커밋한다. git이 zlib으로 팩하므로 미리 gzip해 두는 것보다 저장소가
오히려 작고, PR에서 어떤 성분이 늘고 줄었는지 diff로 볼 수 있다.

## 이게 무엇인가

`ingredients` 테이블(25,923건)을 피부타입별 기능성 키워드로 `ILIKE` 조회한
결과다. 새로 수집한 데이터가 아니라 **기존 DB에서 뽑아낸 분류**다.

따라서 정본은 `criteria.csv` 하나다. 나머지 타입별 파일은 그 키워드로
다시 조회하면 재생성된다.

## 파일

| 파일 | 원본 이름 | 행수 | 내용 |
|---|---|---|---|
| `criteria.csv` | 분류 기준 및 근거 요약표.csv | 8 | **정본.** 타입 × 케어 목적 × 매칭 키워드 × 공인 출처 |
| `summary.csv` | 요약 (Summary).csv | 13 | 집계 |
| `multi_type.csv` | 중복 매칭 성분 (479건).csv | 479 | 2개 이상 타입에 걸친 성분 |
| `excluded.csv` | 제외 권장 데이터 (2592건).csv | 2,592 | 개별 성분으로 쓰기 어려운 행 목록 |

타입별 파일은 캐릭터 ID로 이름을 붙였다 (`docs/dev_guidelines.md` §2.4 기준).

| 파일 | 원본 이름 | 성분 수 | 핵심 키워드 |
|---|---|---|---|
| `subuji.csv` | 수부지.csv | 485 | 히알루론, 글리세린, 판테놀 |
| `samak.csv` | 건성.csv | 333 | 세라마이드, 시어버터, 스쿠알란 |
| `hwasan.csv` | 트러블.csv | 326 | 살리실릭애씨드, 병풀, 티트리 |
| `yuriguseul.csv` | 민감성.csv | 319 | 마데카소사이드, 세라마이드, 비사보롤 |
| `ondalsam.csv` | 건강한 피부.csv | 297 | 토코페롤, 비피다, 갈락토미세스 |
| `mulgae.csv` | 지성.csv | 254 | 징크피씨에이, 실리카, 위치하젤 |
| `memilmuk.csv` | 색소침착.csv | 225 | 나이아신아마이드, 알부틴 |
| `injeolmi.csv` | 탄력저하.csv | 1,815 | 레티놀, 펩타이드, 콜라겐 |

컬럼은 `ingredients` 테이블 조회 결과 그대로다:
`id, norm_name, name_ko, name_en, code, ewg_grade, grade, is_allergen`.
`multi_type`에는 `해당_피부타입_목록`, `중복_타입_수`가 더 붙는다.

## 쓰기 전에 알아야 할 것

**`injeolmi`의 임상명 '탄력저하'가 캐릭터 정의 '건성·탄력 양호'와 반대였다.**
남은 슬롯이 하나뿐이라 여기 넣은 것인데, 캐릭터 쪽을 '건성·탄력 저하, 주름'으로
맞춰 정리했다(`docs/dev_guidelines.md` §2.4 · `frontend/src/data/skinTypes.ts`).
나머지 7개는 처음부터 일치했다.

**`injeolmi`만 1,815건으로 다른 타입(225~485)의 4배다.** 키워드 중 `펩타이드`·
`콜라겐`이 지나치게 넓게 걸린 것으로 보인다. 아래 '태깅 대상' 절에 적은 대로
제품에 실제 쓰이는 성분으로 좁히면 167종이 되어 해소된다.

**`excluded.csv`는 앞 5줄이 설명 블록이고 실제 헤더는 7번째 줄이다.**
`csv.DictReader`에 그냥 넣으면 안 된다. 이 파일에는 `created_at`, `updated_at`,
`search_text` 컬럼도 함께 들어 있다.

**집계가 딱 맞아떨어지지는 않는다.** `summary.csv`는 미분류 성분을 약 21,195개로
적지만, 25,923 − 2,592(제외) − 3,223(고유 매칭) = 20,108이다. 참고용으로만 본다.

## 적재

```bash
python scripts/seed_skin_type_tags.py --dry-run   # 집계만
python scripts/seed_skin_type_tags.py            # tags · ingredient_tags · skin_type_rules
```

멱등하다. 적재 경로와 결과 건수는 [docs/db-schema.md](../../../docs/db-schema.md)의
`tags` · `skin_type_rules` 절에 있다.

### 타입별 CSV를 읽지 않는다

`criteria.csv`의 키워드로 **현재 DB를 다시 조회한다.** 타입별 CSV 8개는 성분
25,923건 시절의 스냅샷이고, 그 뒤 파서 보강·오타 병합으로 23,634건이 되면서
일치율이 이렇게 떨어졌다.

| 매칭 방식 | 일치 |
|---|---:|
| `id` 기준 | 2,815 / 3,223 (74%) |
| `norm_name` 기준 | 2,444 / 3,223 (76%) |

**id는 이미 다른 성분을 가리킨다.** 키워드 재조회는 이 문제가 없고, 성분이
바뀔 때마다 재실행으로 따라간다.

### 함께 쓰는 파일 4개

| 파일 | 내용 |
|---|---|
| `tag_map.csv` | 피부타입 → 추천 `tags.code` · `tags.label` · 캐릭터 ID |
| `criteria_overrides.csv` | 협회 표준명과 철자가 다른 키워드 7개 교정 |
| `exclusion_criteria.csv` | 기피 태그 3종 정의 — 매칭 성분과 출처 |
| `skin_type_exclusions.csv` | 피부타입 → 기피 태그 배정과 근거 |

**기피 태그는 이름이 정확히 일치할 때만 붙입니다.** 추천 태그처럼 부분 일치로
찾으면 `'알코올'`이 세틸알코올·세테아릴알코올까지 잡는데, 그건 휘발성 알코올이
아니라 보습제다. 근거가 가장 단단한 것은 `allergen_fragrance`로, 식약처가
표시를 의무화한 착향제 26종이다 — 그중 협회 사전에 있고 제품에 실제 쓰이는
23종이 붙는다.

`criteria.csv`는 PR #36 원본 그대로 둔다. 교정은 별도 파일에 쌓아 원본과
무엇이 달라졌는지 한눈에 보이게 한다.

### 태깅 대상은 제품에 실제 쓰이는 성분뿐

성분 마스터 23,634종 중 80.6%는 어떤 제품에도 등장하지 않는 협회 사전 어휘다.
`ingredient_tags`는 '이 제품의 성분 중 태그 X가 몇 개인가'를 세는 데 쓰이므로
안 쓰이는 성분을 태깅해도 조인되지 않는다.

위에 적은 **`injeolmi` 1,815건 문제도 여기서 풀린다** — `펩타이드`는 마스터
1,517종 중 제품에 쓰이는 게 137종(9%)뿐이라, 실제 태깅은 167종이 된다.

## 재생성

`criteria.csv`의 키워드로 `ingredients`를 조회하면 된다.

```sql
SELECT id, norm_name, name_ko, name_en, code, ewg_grade, grade, is_allergen
FROM ingredients
WHERE norm_name ILIKE ANY (ARRAY['%하이알루로%', '%글리세린%', ...]);
```
