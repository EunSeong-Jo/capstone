export type SkinType =
  | 'ondalsam'
  | 'mulgae'
  | 'subuji'
  | 'hwasan'
  | 'samak'
  | 'injeolmi'
  | 'yuriguseul'
  | 'memilmuk';

export const SKIN_TYPE_META: Record<SkinType, { label: string; emoji: string; summary: string }> = {
  ondalsam:    { label: '수분팡팡 옹달샘', emoji: '💧', summary: '수분·유분 균형, 이상적 피부' },
  mulgae:      { label: '반질반질 물개',   emoji: '🦭', summary: '지성, 번들거림, 모공' },
  subuji:      { label: '겉바속촉 수부지', emoji: '🌊', summary: '속건조 + 겉번들' },
  hwasan:      { label: '울긋불긋 화산',   emoji: '🌋', summary: '트러블·홍조·염증' },
  samak:       { label: '바스락 사막',     emoji: '🏜️', summary: '극건성, 당김' },
  injeolmi:    { label: '말랑말랑 인절미', emoji: '🍡', summary: '건성·탄력 양호' },
  yuriguseul:  { label: '조심조심 유리구슬', emoji: '🫧', summary: '민감성, 자극 반응' },
  memilmuk:    { label: '얼룩덜룩 메밀묵', emoji: '🌑', summary: '색소침착·잡티' },
};

export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string;
  price: number;
  originalPrice?: number;
  discountRate?: number;
  rating?: number;
  reviewCount?: number;
  isNew?: boolean;
  isBest?: boolean;
}

export interface Alternative extends Product {
  similarityScore: number; // 0~100
}

export interface User {
  id: number;
  email: string;
  nickname?: string;
  skinType?: SkinType;
}
