// 검색 화면 목업 데이터 (jw 디자인 design_ver2.html 기준)
// TODO: 실제 검색/성분 API 연동 전까지 목데이터

const img = (seed: string, s = 96) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

export const POPULAR_SEARCH_FILTERS = ['급상승', '성분', '브랜드'] as const;

export const POPULAR_SEARCH_RANKING = [
  '메디큐브', '셀리맥스', '클리오 쿠션', '제로이드', '식물나라',
  '마데카소사이드', '바이오던스', 'PDRN 세럼', '아누아', '퓌 립앤치크',
];

export const SEARCH_AD_BANNER = {
  label: 'swappy AD',
  title: '단종템 대체 1등 제품,',
  subtitle: '최저가로 만나보세요',
};

export const REALTIME_BEST = {
  updatedAt: '2026.06.23 18시 기준',
  product: {
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
];
