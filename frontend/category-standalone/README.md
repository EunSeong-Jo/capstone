# category-standalone

`frontend/src`에 구현된 카테고리 메인/리스트 + 상품 상세(리뷰·성분) 화면만 따로 떼어
독립적으로 실행할 수 있게 만든 스냅샷입니다. 다른 팀원 작업이 `frontend/src`에 합쳐지는
동안 이 화면들을 그대로 확인하거나 데모하고 싶을 때 사용하세요.

## 실행

```bash
cd frontend/category-standalone
npm install
npm run dev       # http://localhost:3001
```

## 포함된 화면

| 경로 | 화면 |
|------|------|
| `/category` | 카테고리 메인 (사이드바 + 서브카테고리) |
| `/category/skincare` | 카테고리 리스트 (BEST 랭킹 / 전체상품, 필터 탭으로 전환) |
| `/detail/:id` | 상품 상세 (상품정보 / 리뷰·성분 탭, AI 매칭 분석 팝업) |

## 참고

- `frontend/src`에 있는 실제 소스 코드를 그대로 복사한 것이라, 정식 반영 시에는
  이 폴더는 삭제하고 `frontend/src` 쪽 코드만 유지하면 됩니다.
- 목데이터로만 동작하며, 실제 API 연동은 되어 있지 않습니다.
