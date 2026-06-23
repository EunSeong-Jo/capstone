import {
  HomeCategory,
  Product,
  SkinCareTipMap,
  SkinType,
  WeatherCondition,
  WeatherInfo,
} from '../types';

// TODO: Task 14 완료 후 실제 API(날씨/랭킹/카테고리)로 교체

export const MOCK_WEATHER: WeatherInfo = {
  condition: 'sunny',
  conditionLabel: 'Sunny',
  temperature: 25,
  season: 'summer',
  seasonLabel: '초여름',
  humidity: 48,
};

export const MOCK_RANKING_PRODUCTS: Product[] = [
  { id: 1, name: '수분 밸런싱 토너 200ml', brand: '이니스프리', category: '토너', imageUrl: 'https://picsum.photos/seed/prod1/200/200', price: 28000, originalPrice: 35000, discountRate: 20, rating: 4.5, reviewCount: 1203, isBest: true },
  { id: 2, name: '세라마이드 수분 크림 60ml', brand: '닥터자르트', category: '크림', imageUrl: 'https://picsum.photos/seed/prod2/200/200', price: 42000, rating: 4.7, reviewCount: 892, isNew: true },
  { id: 3, name: '히알루론산 에센스 50ml', brand: '코스알엑스', category: '에센스', imageUrl: 'https://picsum.photos/seed/prod3/200/200', price: 18000, originalPrice: 22000, discountRate: 18, rating: 4.3, reviewCount: 2341 },
  { id: 4, name: '순한 거품 클렌저 150ml', brand: '아벤느', category: '클렌저', imageUrl: 'https://picsum.photos/seed/prod4/200/200', price: 15000, rating: 4.4, reviewCount: 567 },
  { id: 5, name: '시카 진정 앰플 30ml', brand: '라운드랩', category: '앰플', imageUrl: 'https://picsum.photos/seed/prod5/200/200', price: 24000, originalPrice: 30000, discountRate: 20, rating: 4.6, reviewCount: 1820 },
  { id: 6, name: '데일리 마일드 선크림 SPF50+', brand: '에스트라', category: '선크림', imageUrl: 'https://picsum.photos/seed/prod6/200/200', price: 21000, rating: 4.5, reviewCount: 974 },
];

export const MOCK_HOME_CATEGORIES: HomeCategory[] = [
  { id: 'skincare', label: '스킨케어', iconKey: '🧴' },
  { id: 'makeup', label: '메이크업', iconKey: '💄' },
  { id: 'cleansing', label: '클렌징', iconKey: '🫧' },
  { id: 'suncare', label: '선케어', iconKey: '☀️' },
  { id: 'mask', label: '마스크팩', iconKey: '🧖' },
  { id: 'serum', label: '세럼', iconKey: '💧' },
  { id: 'lip', label: '립케어', iconKey: '👄' },
];

/** 피부타입 × 날씨 → 오늘의 맞춤 케어 메시지 */
export const SKIN_CARE_TIPS: SkinCareTipMap = {
  ondalsam: { sunny: '자외선 차단만 챙기면 완벽한 하루예요.', rainy: '습한 날엔 가벼운 수분 마무리를 추천해요.' },
  mulgae: { sunny: '유분이 많은 날, 산뜻한 젤 타입으로 마무리하세요.', cloudy: '피지 조절 토너로 번들거림을 잡아보세요.' },
  subuji: { sunny: '속건조엔 수분, 겉번들엔 가벼운 마무리가 핵심이에요.', rainy: '레이어링으로 속부터 촉촉하게 채워주세요.' },
  hwasan: { sunny: '진정 성분 위주로 자극을 줄여주세요.', cloudy: '시카·판테놀로 붉은기를 가라앉혀 보세요.' },
  samak: { sunny: '오일 한 방울로 건조함을 막아주세요.', snowy: '고보습 크림으로 장벽을 단단히 지켜요.' },
  injeolmi: { sunny: '탄력 케어와 함께 자외선을 차단하세요.', cloudy: '수분·영양 밸런스를 유지해 주세요.' },
  yuriguseul: { sunny: '저자극 선크림으로 민감한 피부를 보호하세요.', rainy: '성분이 단순한 진정 제품을 추천해요.' },
  memilmuk: { sunny: '비타민C와 자외선 차단으로 잡티를 관리하세요.', cloudy: '브라이트닝 케어를 꾸준히 이어가세요.' },
};

/** 피부타입 + 날씨 조합으로 오늘의 케어 메시지 도출 (폴백 포함) */
export function getSkinCareTip(skinType: SkinType, condition: WeatherCondition): string {
  return (
    SKIN_CARE_TIPS[skinType]?.[condition] ??
    SKIN_CARE_TIPS[skinType]?.sunny ??
    '오늘도 피부 컨디션에 맞는 케어를 추천해 드릴게요.'
  );
}
