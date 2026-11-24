# swappy 문서

문서는 **주제마다 정본이 하나**입니다. 같은 내용이 다른 문서에도 요약돼 있을 수 있지만, 값이 다르면 아래 표의 정본이 맞습니다.
내용을 고칠 때도 정본을 먼저 고치고, 요약하는 쪽은 링크로 넘기는 것을 원칙으로 합니다.

## 주제별 정본

| 주제 | 정본 | 요약·안내만 하는 곳 |
|---|---|---|
| 프로젝트 전체 · 기능 카탈로그 · 결정 기록 | [architecture/PROJECT_OVERVIEW.md](architecture/PROJECT_OVERVIEW.md) | [루트 README](../README.md) |
| 구성도 · 흐름도 · 시나리오 그림 | [architecture/diagrams.md](architecture/diagrams.md) | 루트 README(시스템 구성도만) |
| DB 스키마 · 적재 파이프라인 | [architecture/db-schema.md](architecture/db-schema.md) | backend/README, PROJECT_OVERVIEW §7 |
| AI · 점수 로직(가중치 · 임계값) | [algorithms/ai-and-scoring-logic.md](algorithms/ai-and-scoring-logic.md) | 루트 README, PROJECT_OVERVIEW §4 |
| 성분 유사도 엔진 · 평가 | [algorithms/similarity.md](algorithms/similarity.md) | ai-and-scoring-logic §5 |
| 요구사항 | [product/PRD_swappy_v1.8.md](product/PRD_swappy_v1.8.md) | — (§7.9 스키마는 설계 시점 안이라 실제와 다름) |
| 백엔드 개발 (세팅 · Alembic · 테스트) | [../backend/README.md](../backend/README.md) | — |
| 프론트 개발 (화면 규격 · 컨벤션 · APK) | [../frontend/README.md](../frontend/README.md) | guides/frontend-component-guide, guides/dev_guidelines |
| 작업 규칙 · 현황 | [../CLAUDE.md](../CLAUDE.md) | — |

## 폴더

| 폴더 | 무엇이 있나 |
|---|---|
| [`architecture/`](architecture/) | 시스템 전체 그림 — 프로젝트 총정리, 구성도 모음, DB 스키마 |
| [`algorithms/`](algorithms/) | 점수·추천·유사도 로직과 그 평가 |
| [`guides/`](guides/) | 따라 하는 문서 — [데모 시나리오](guides/demo-scenario.md), [Windows 단독 실행](guides/로컬실행.md), [운영 DB(AWS) 이전](guides/aws-db-migration.md), [프론트 컴포넌트 가이드](guides/frontend-component-guide.md), [디자인·화면 체크리스트](guides/dev_guidelines.md) |
| [`product/`](product/) | 요구사항(PRD). 지난 판은 `archive/` |
| [`design/`](design/) | 디자인 원본 — 캐릭터·마스코트 이미지, 화면 참고 자료, 프로토타입 |
| [`deliverables/`](deliverables/) | 발표·제출용 슬라이드(pptx) |

## 문서가 아닌 기록

| 위치 | 내용 |
|---|---|
| [`../research/eval/`](../research/eval/) | 평가 스위트 · 결과 리포트(`report/index.html`) |
| [`../research/ocr/OCR_SUMMARY.md`](../research/ocr/OCR_SUMMARY.md) | OCR 엔진 벤치마크 요약 |
| [`../research/image-match/IMAGE_MATCH_SUMMARY.md`](../research/image-match/IMAGE_MATCH_SUMMARY.md) | 제품 이미지 유사도 측정 |
| [`../data/eval/DATASHEET.md`](../data/eval/DATASHEET.md) | 평가 데이터셋 설명 |
