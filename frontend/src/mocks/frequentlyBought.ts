import { Product } from '../types';

// 자주 구매 목업 (주문/결제 API 연동 전까지)
// TODO: 실제 주문 이력 API 연동 시 교체

const img = (seed: string, s = 200) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

export const FREQUENT_PURCHASE_CATEGORIES = ['전체', '스킨케어', '마스크팩', '뷰티소품'];

export const FREQUENTLY_BOUGHT_PRODUCTS: Product[] = [
  { id: 201, brand: '아누아', name: '피디알엔 히알루론산 수분 앰플 100ml', category: '스킨케어', imageUrl: img('freq201'), price: 16900, originalPrice: 32000, discountRate: 47, rating: 4.7, reviewCount: 5988, purchaseCount: 5 },
  { id: 202, brand: '메디힐', name: '엔젤 부스터 마스크팩 10매', category: '마스크팩', imageUrl: img('freq202'), price: 12900, rating: 4.6, reviewCount: 3120, purchaseCount: 4 },
  { id: 203, brand: '닥터지', name: '브라이트닝 업 선크림 SPF50+', category: '스킨케어', imageUrl: img('freq203'), price: 24300, originalPrice: 32000, discountRate: 24, rating: 5.0, reviewCount: 8700, purchaseCount: 3 },
  { id: 204, brand: '이니스프리', name: '수분 밸런싱 토너 200ml', category: '스킨케어', imageUrl: img('freq204'), price: 28000, originalPrice: 35000, discountRate: 20, rating: 4.5, reviewCount: 1203, purchaseCount: 3 },
  { id: 205, brand: '토니모리', name: '코튼 퍼프 100매', category: '뷰티소품', imageUrl: img('freq205'), price: 3900, rating: 4.4, reviewCount: 640, purchaseCount: 2 },
  { id: 206, brand: '메디힐', name: '티트리 카밍 크림 50ml', category: '스킨케어', imageUrl: img('freq206'), price: 21900, originalPrice: 32000, discountRate: 32, rating: 4.5, reviewCount: 980, purchaseCount: 2 },
];

/** 자주 구매 목록 하단 "재구매가 많은 다른 상품도 있어요!" 추천 행 */
export const FREQUENT_PURCHASE_RECOMMENDATIONS: Product[] = [
  { id: 301, brand: '코스알엑스', name: '히알루론산 수분 토너 EX 150ml', category: '스킨케어', imageUrl: img('freqrec301'), price: 18000, rating: 4.6, reviewCount: 8210 },
  { id: 302, brand: '라운드랩', name: '자작나무 수분 크림 80ml', category: '스킨케어', imageUrl: img('freqrec302'), price: 19800, rating: 4.5, reviewCount: 4520 },
  { id: 303, brand: '스킨푸드', name: '블랙슈가 클렌징폼 150ml', category: '스킨케어', imageUrl: img('freqrec303'), price: 12900, originalPrice: 16000, discountRate: 19, rating: 4.4, reviewCount: 2310 },
];
