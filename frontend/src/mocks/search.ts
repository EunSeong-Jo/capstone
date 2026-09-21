// 검색 화면 목업 데이터 (jw 디자인 design_ver2.html 기준)
// TODO: 실제 검색/성분 API 연동 전까지 목데이터

const img = (seed: string, s = 96) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

export const POPULAR_SEARCH_FILTERS = ['급상승', '성분', '브랜드'] as const;

/** 필터(급상승/성분/브랜드)별 인기 검색어 랭킹 */
export const POPULAR_SEARCH_RANKING: Record<(typeof POPULAR_SEARCH_FILTERS)[number], string[]> = {
  급상승: [
    '메디큐브', '셀리맥스', '클리오 쿠션', '제로이드', '식물나라',
    '마데카소사이드', '바이오던스', 'PDRN 세럼', '아누아', '퓌 립앤치크',
  ],
  성분: [
    '히알루론산', '나이아신아마이드', '세라마이드', '판테놀', '마데카소사이드',
    '살리실릭애씨드', '레티놀', '펩타이드', '아데노신', 'PDRN',
  ],
  브랜드: [
    '아누아', '토리든', '라운드랩', '코스알엑스', '이니스프리',
    '메디큐브', '닥터지', '라로슈포제', '에스트라', '바이오더마',
  ],
};

export const SEARCH_AD_BANNER = {
  label: 'swappy AD',
  title: '단종템 대체 1등 제품,',
  subtitle: '최저가로 만나보세요',
};

export const REALTIME_BEST = {
  updatedAt: '2026.06.23 18시 기준',
  product: {
    // 상세로 이동하려면 실제 제품 id가 필요합니다. rank(1,2,3…)를 넘기면
    // 엉뚱한 제품이 열립니다. 아래 id는 DB에 있는 실제 토리든 세럼입니다.
    // TODO(Task 6): 이 블록 전체를 /products?sort=popular&size=1 결과로 교체
    id: 216,
    rank: 1,
    brand: '토리든',
    name: '다이브인 저분자 히알루론산 세럼 100ml (+수딩크림)',
    rating: 4.6,
    discountRate: 35,
    price: 28500,
  },
};

export interface IngredientCategory {
  id: string;
  emoji: string;
  label: string;
}

export const INGREDIENT_DICTIONARY: IngredientCategory[] = [
  { id: 'caution20', emoji: '💧', label: '20가지 주의 성분' },
  { id: 'allergy', emoji: '💥', label: '알레르기 유발 주의 성분' },
  { id: 'uv', emoji: '🛡️', label: '자외선 차단 기능 성분' },
];

// ===== 성분 스캔 화면(3c) — 최근 스캔 목업 =====
export interface RecentScan {
  seedId: number; // 클릭 시 /alternatives?seed= 로 연결
  name: string;
  brand: string;
  imageUrl: string;
  ingredientCount: number; // 인식한 성분 개수
  when: string; // "어제", "3일 전"
  safeCount: number;
  cautionCount?: number;
}

export const RECENT_SCANS: RecentScan[] = [
  { seedId: 8, name: '시카플라스트 밤 B5+ 40ml', brand: '라로슈포제', imageUrl: img('seed8'), ingredientCount: 32, when: '어제', safeCount: 30, cautionCount: 2 },
  { seedId: 1, name: '수분 밸런싱 토너 200ml', brand: '이니스프리', imageUrl: img('seed1'), ingredientCount: 24, when: '3일 전', safeCount: 24 },
  { seedId: 6, name: '아토베리어365 크림 80ml', brand: '에스트라', imageUrl: img('seed6'), ingredientCount: 28, when: '5일 전', safeCount: 26, cautionCount: 2 },
  { seedId: 5, name: '하이드라비오 토너 250ml', brand: '바이오더마', imageUrl: img('seed5'), ingredientCount: 21, when: '1주 전', safeCount: 21 },
];
