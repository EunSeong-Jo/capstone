import { Product } from '../types';

// History 허브(최근 본/좋아요 상품 탭) 추천 목업
// TODO: 실제 추천 API 연동 전까지 목데이터

const img = (seed: string, s = 200) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

export const AI_INSIGHT = {
  headline: '스킨케어에 관심이 많으시네요',
  subtext: '최근 7일간 보습 제품 12회 탐색',
};

/** 최근 본 탭 하단 "최근 관심 기반 추천" */
export const RECENT_INTEREST_RECOMMENDATIONS: Product[] = [
  { id: 401, brand: 'DR.G', name: '브라이트닝 업 선크림 SPF50+', category: '스킨케어', imageUrl: img('hist401'), price: 24300, originalPrice: 32000, discountRate: 24, rating: 5.0, reviewCount: 8700 },
  { id: 402, brand: '이니스프리', name: '수분 밸런싱 토너 200ml', category: '스킨케어', imageUrl: img('hist402'), price: 28000, originalPrice: 35000, discountRate: 20, rating: 4.5, reviewCount: 1203 },
  { id: 403, brand: '코스알엑스', name: '히알루론산 수분 토너 EX 150ml', category: '스킨케어', imageUrl: img('hist403'), price: 18000, rating: 4.6, reviewCount: 8210 },
];

/** 좋아요 상품 탭 하단 "이런 상품도 있어요!" */
export const LIKED_ALSO_RECOMMENDATIONS: Product[] = [
  { id: 501, brand: '토니모리', name: '더톡톡 촉촉 베이스 메이크업', category: '뷰티소품', imageUrl: img('hist501'), price: 24300, originalPrice: 34700, discountRate: 30 },
  { id: 502, brand: '토니모리', name: '더톡톡 촉촉 베이스 메이크업', category: '뷰티소품', imageUrl: img('hist502'), price: 24300, originalPrice: 34700, discountRate: 30 },
  { id: 503, brand: '토니모리', name: '더톡톡 촉촉 베이스 메이크업', category: '뷰티소품', imageUrl: img('hist503'), price: 24300, originalPrice: 34700, discountRate: 30 },
  { id: 504, brand: '토니모리', name: '더톡톡 촉촉 베이스 메이크업', category: '뷰티소품', imageUrl: img('hist504'), price: 24300, originalPrice: 34700, discountRate: 30 },
  { id: 505, brand: '토니모리', name: '더톡톡 촉촉 베이스 메이크업', category: '뷰티소품', imageUrl: img('hist505'), price: 24300, originalPrice: 34700, discountRate: 30 },
  { id: 506, brand: '토니모리', name: '더톡톡 촉촉 베이스 메이크업', category: '뷰티소품', imageUrl: img('hist506'), price: 24300, originalPrice: 34700, discountRate: 30 },
];
