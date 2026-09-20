/**
 * 상단 'swappy ▾' 드롭다운의 도메인 목록.
 *
 * 제품 데이터가 아니라 서비스 확장 계획을 보여주는 정적 문구다(PRD 도메인 확장).
 * 화장품 외에는 "추후 오픈 예정" 안내로만 쓰인다.
 *
 * 예전에는 이 파일에 OY_PRODUCTS(id 1~12)·OY_RANKING 같은 가짜 제품 풀도
 * 있었다. 그 id가 실재 카탈로그 id와 겹쳐 있었고, 어느 화면도 쓰지 않는데
 * 남아 있었다.
 */
export interface Vertical {
  id: string;
  label: string;
  icon: string;
  desc: string;
}

export const OY_VERTICALS: Vertical[] = [
  { id: 'cosmetics', label: '화장품', icon: '💄', desc: '성분 기반 화장품 대체품 추천' },
  { id: 'health', label: '건강기능식품', icon: '💊', desc: '영양제·건강식품 대체 추천' },
  { id: 'fashion', label: '의류', icon: '👕', desc: '패션·잡화 대체 추천' },
  { id: 'food', label: '푸드', icon: '🍎', desc: '식품·간식 대체 추천' },
  { id: 'life', label: '리빙', icon: '🛋️', desc: '생활용품 대체 추천' },
];
