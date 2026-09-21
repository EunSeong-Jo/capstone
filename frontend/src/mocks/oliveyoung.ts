import { Product } from '../types';

// 홈 목업 데이터 (placeholder 이미지 + 한글 목업 카피)
// TODO: 실제 API 연동 시 교체

const img = (seed: string, w = 400, h = 400) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

// ===== 상단 도메인 전환 (swappy ▾ 드롭다운) =====
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

// ===== 메인 배너 캐러셀 =====
export interface HeroBanner {
  id: number;
  title: string;
  subtitle: string;
  caption: string;
  gradient: string; // tailwind gradient classes
  imageUrl: string;
}
export const OY_HERO_BANNERS: HeroBanner[] = [
  { id: 1, title: '신상 15% 쿠폰', subtitle: '리뷰 1만P 혜택까지!', caption: '6월 swappy 신상위크', gradient: 'from-emerald-300 to-stone-300', imageUrl: img('oy-hero1', 600, 600) },
  { id: 2, title: '여름 수분 충전', subtitle: '베스트 토너 모음전', caption: '오늘드림 무료배송', gradient: 'from-sky-300 to-indigo-200', imageUrl: img('oy-hero2', 600, 600) },
  { id: 3, title: '선크림 페스타', subtitle: '자외선 차단 필수템', caption: '최대 40% 할인', gradient: 'from-amber-200 to-rose-200', imageUrl: img('oy-hero3', 600, 600) },
];

// ===== 카테고리 아이콘 그리드 (2x5) =====
export interface OyCategory {
  id: string;
  label: string;
  imageUrl: string;
  isNew?: boolean;
}
export const OY_CATEGORIES: OyCategory[] = [
  { id: 'skincare', label: '스킨케어', imageUrl: img('cat-skin') },
  { id: 'cleansing', label: '클렌징', imageUrl: img('cat-cleansing') },
  { id: 'suncare', label: '선케어', imageUrl: img('cat-sun') },
  { id: 'makeup', label: '메이크업', imageUrl: img('cat-makeup') },
  { id: 'bodyhair', label: '바디·헤어', imageUrl: img('cat-bodyhair') },
];

// ===== 공용 상품 풀 =====
export const OY_PRODUCTS: Product[] = [
  { id: 1, brand: '메디힐', name: '[6월 대체픽/15년 연속 1위] 에센셜 마스크팩 10+1매', category: '마스크팩', imageUrl: img('p1'), price: 10000, originalPrice: 20000, discountRate: 50, rating: 4.9, reviewCount: 99999, tags: ['오늘드림', 'BEST', '쿠폰'], isBest: true },
  { id: 2, brand: 'CJ', name: 'CJ 바이오코어 피부면역 유산균 100억 30+10포', category: '건강식품', imageUrl: img('p2'), price: 27900, rating: 4.8, reviewCount: 9817, tags: ['오늘드림', 'BEST'], isBest: true },
  { id: 3, brand: '닥터자르트', name: '세라마이드 수분 크림 60ml 대용량 기획', category: '크림', imageUrl: img('p3'), price: 42000, rating: 4.9, reviewCount: 3241, tags: ['BEST'], isNew: true },
  { id: 4, brand: '파티온', name: '[6월 대체픽/대용량] 노스카나인 흉터 세럼 10ml', category: '세럼', imageUrl: img('p4'), price: 32300, originalPrice: 53800, discountRate: 40, rating: 4.7, reviewCount: 5210, tags: ['쿠폰'] },
  { id: 5, brand: '바이오더마', name: '[6월 대체픽] 하이드라비오 토너 250ml 2종 기획', category: '토너', imageUrl: img('p5'), price: 26500, originalPrice: 37800, discountRate: 30, rating: 4.8, reviewCount: 7495, tags: ['오늘드림', 'BEST'] },
  { id: 6, brand: '에스트라', name: '[업그레이드] 아토베리어365 크림 80ml', category: '크림', imageUrl: img('p6'), price: 25400, originalPrice: 33000, discountRate: 23, rating: 4.9, reviewCount: 3200, tags: ['BEST', '증정'] },
  { id: 7, brand: '에스트라', name: '아토베리어365 로션 150ml 대용량', category: '로션', imageUrl: img('p7'), price: 25200, originalPrice: 32700, discountRate: 23, rating: 4.8, reviewCount: 2980, tags: ['오늘드림'] },
  { id: 8, brand: '라로슈포제', name: '시카플라스트 밤 B5+ 40ml', category: '밤', imageUrl: img('p8'), price: 34850, originalPrice: 41000, discountRate: 15, rating: 4.9, reviewCount: 6120, tags: ['쿠폰'] },
  { id: 9, brand: '웰라쥬', name: '[속건조필수템] 리얼 히알루로닉 블루 100 앰플', category: '앰플', imageUrl: img('p9'), price: 29800, originalPrice: 50000, discountRate: 40, rating: 4.8, reviewCount: 7495, tags: ['오늘드림', 'BEST'] },
  { id: 10, brand: '질레트', name: '[6월 대체픽] 프로쉴드 옐로우 면도날 4입', category: '면도', imageUrl: img('p10'), price: 28400, originalPrice: 33200, discountRate: 14, rating: 4.9, reviewCount: 3130, tags: ['오늘드림', '증정'] },
  { id: 11, brand: '덴프스', name: '트루오메가600 1/2/3박스 (1/2/3개월분)', category: '건강식품', imageUrl: img('p11'), price: 9500, discountRate: 13, rating: 4.7, reviewCount: 1820, tags: [] },
  { id: 12, brand: '믹순', name: '[가성비겔마스크] PDRN 겔 마스크 1매/5매', category: '마스크팩', imageUrl: img('p12'), price: 3000, discountRate: 25, rating: 4.6, reviewCount: 980, tags: [] },
];

// ===== 순위(랭킹) =====
export const OY_RANKING: Product[] = [
  { id: 21, brand: '삼대오백', name: '트라이탄 쉐이커 600ml 3종 택 1', category: '홈리빙', imageUrl: img('r1'), price: 11610, discountRate: 22 },
  { id: 22, brand: '삼대오백', name: '쉐이커 1L 3종 택1', category: '홈리빙', imageUrl: img('r2'), price: 4500, discountRate: 8 },
  { id: 23, brand: '레고트', name: '[망곰 콜라보] 루프 텀블러 멀티 400ml', category: '홈리빙', imageUrl: img('r3'), price: 20740, discountRate: 50 },
  { id: 24, brand: '레고트', name: '루프 텀블러 멀티 600ml 콜라보 어워즈 한정', category: '홈리빙', imageUrl: img('r4'), price: 22500, discountRate: 50 },
  { id: 25, brand: '루메나', name: '[쿨썸머] 무선 써큘레이터 FAN PRIME 3', category: '가전', imageUrl: img('r5'), price: 52110 },
];

// ===== 칩 필터(섹션별 카테고리) =====
export const OY_RANK_CHIPS = ['건강용품', '위생용품', '패션', '홈리빙/가전', '취미'];
