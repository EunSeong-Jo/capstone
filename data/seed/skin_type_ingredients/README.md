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

**`injeolmi`의 임상명은 '탄력저하'인데 캐릭터 정의는 '건성·탄력 양호'다.**
남은 슬롯이 하나뿐이라 여기 넣었다. 나머지 7개는 `docs/dev_guidelines.md`의
표와 정확히 일치한다. 태그로 옮길 때 이 의미 차이를 어떻게 다룰지 정해야 한다.

**`injeolmi`만 1,815건으로 다른 타입(225~485)의 4배다.** 키워드 중 `펩타이드`·
`콜라겐`이 지나치게 넓게 걸린 것으로 보인다. 그대로 쓰면 변별력이 없다.

**`excluded.csv`는 앞 5줄이 설명 블록이고 실제 헤더는 7번째 줄이다.**
`csv.DictReader`에 그냥 넣으면 안 된다. 이 파일에는 `created_at`, `updated_at`,
`search_text` 컬럼도 함께 들어 있다.

**집계가 딱 맞아떨어지지는 않는다.** `summary.csv`는 미분류 성분을 약 21,195개로
적지만, 25,923 − 2,592(제외) − 3,223(고유 매칭) = 20,108이다. 참고용으로만 본다.

## 재생성

`criteria.csv`의 키워드로 `ingredients`를 조회하면 된다.

```sql
SELECT id, norm_name, name_ko, name_en, code, ewg_grade, grade, is_allergen
FROM ingredients
WHERE norm_name ILIKE ANY (ARRAY['%히알루론%', '%글리세린%', ...]);
```

## 아직 적재하지 않았다

담을 테이블이 정해지지 않았다. `skin_type_rules`는 성분이 아니라 태그
(`tags.code`) 단위이고, 경유해야 할 `tags`·`ingredient_tags`도 0행이다.
성분을 태그로 환산해 기존 스키마를 채울지, 별도 테이블을 만들지 미정이다.
