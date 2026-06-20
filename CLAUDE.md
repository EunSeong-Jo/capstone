# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

---

## 프로젝트 태스크 현황 (2026-06-20 기준)

현재 브랜치: `home_es` — 메인 화면(Home) 개발 작업 중

| ID | 제목 | 상태 | 우선순위 |
|----|------|------|---------|
| 1.1~1.5 | Docker 환경 설정 (Compose, Dockerfile, 볼륨, 검증) | ✅ done | P0 |
| 1.6 | Sentry 에러 추적 + structlog 구조화 로깅 | 🔄 in-progress | P0 |
| 2 | 제품 데이터 수집기 (식약처 API + 올리브영 크롤러) | ⏳ pending | P0 |
| 3 | 성분 유사도 분석 엔진 (TF-IDF / Jaccard / RBO) | ⏳ pending | P0 |
| 4 | 이미지 인식 모듈 (Tesseract + EasyOCR + OpenCV) | ⏳ pending | P0 |
| 5 | 프론트엔드 메인 개발 (검색·상세·마이페이지 등) | ⏳ pending | P0 |
| 6 | 백엔드 API 개발 (FastAPI) | ⏳ pending | P0 |
| 10 | DB 스키마 및 최적화 | ⏳ pending | P0 |
| 11 | 온보딩·피부타입 QnA 페이지 | ⏳ pending | P0 |
| 12 | 사용자 프로필·인증 API (JWT + Soft-gate) | ⏳ pending | P0 |
| 7 | AI 챗봇 (Claude API + 프로필 컨텍스트 주입) | ⏳ pending | P1 |
| 8 | 성분 필터링 기능 | ⏳ pending | P1 |
| 9 | 모니터링 (Prometheus + Grafana, AWS 배포) | ⏳ pending | P1 |
| 14 | 피부타입 매칭·예산 가이드 엔진 (P1a) | ⏳ pending | P1a |
| 13 | 회원 피드백·지속적 학습 파이프라인 | ⏳ pending | P1 |
| 15 | 프로덕션 데이터 모니터링 | ⏳ pending | P2 |

---

## GitHub 이슈 #8 개선 항목 (미반영 — home_es 브랜치에서 작업 예정)

출처: [이슈 #8: 캡스톤디자인 개선 방향 정리 (06/02)](https://github.com/EunSeong-Jo/capstone/issues/8)

### 📱 메인 화면
- [ ] 메인 화면 문구 3개 제거
- [ ] 스플래시(시작) 화면 추가 — 로고 포함, 앱 진입 시 표시
- [ ] 로그인 버튼 텍스트 변경 → "로그인하고 피부타입 진단해보기"

### 🎨 디자인
- [ ] 현재보다 더 연한 초록 계열로 색상 조정 (추후 확정)

### 📋 피부 진단 (QnA)
- [ ] "타입 미리 정하기" 버튼 추가 — 피부타입을 이미 아는 사용자 대상

### 📊 진단 결과
- [ ] 피부타입 2순위·3순위 결과 표시 추가

### 🛍️ 추천 화장품 (Home)
- [ ] 제품 사진 추가
- [ ] "전체보기" 버튼 → "장바구니" 버튼 교체 (`frontend/src/pages/Home/index.tsx:86`)
- [ ] 정렬 옵션 추가 — 가격순 / 추천순

### 👤 마이페이지
- [ ] 피부타입 및 추천 항목 상단 고정

### 🔻 하단 내비게이션
- [ ] 카테고리 탭 추가 (`frontend/src/components/layout/BottomNav.tsx`)
- [ ] 히스토리 탭 추가 (`frontend/src/components/layout/BottomNav.tsx`)
