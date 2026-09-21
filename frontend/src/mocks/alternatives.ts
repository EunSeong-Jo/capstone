import { Alternative, Ingredient, Product } from '../types';

// 대체품 추천 목업 (성분 기반 + 개인 맞춤)
// TODO: 실제 추천 API 연동 시 교체

const img = (seed: string, s = 200) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

// ===== 성분 사전 =====
export const MOCK_INGREDIENTS: Ingredient[] = [
  { id: 1, name: '히알루론산', grade: 'key', ewg: 1, skinAffinity: { ondalsam: 'good', samak: 'good', subuji: 'good' } },
  { id: 2, name: '베타글루칸', grade: 'key', ewg: 1, skinAffinity: { hwasan: 'good', yuriguseul: 'good' } },
  { id: 3, name: '판테놀', grade: 'key', ewg: 1, skinAffinity: { hwasan: 'good' } },
  { id: 4, name: '세라마이드', grade: 'key', ewg: 1, skinAffinity: { samak: 'good', subuji: 'good' } },
  { id: 5, name: '나이아신아마이드', grade: 'key', ewg: 1, skinAffinity: { memilmuk: 'good', mulgae: 'good' } },
  { id: 6, name: '글리세린', grade: 'normal', ewg: 2 },
  { id: 7, name: '부틸렌글라이콜', grade: 'normal', ewg: 1 },
  { id: 8, name: '향료', grade: 'warn', ewg: 8, skinAffinity: { yuriguseul: 'caution', hwasan: 'caution' } },
];

// ===== 기준제품(seed) 메타 — 결과화면 헤더용 =====
export const SEED_PRODUCTS: Record<number, Product> = {
  1: { id: 1, brand: '이니스프리', name: '수분 밸런싱 토너 200ml', category: '토너', imageUrl: img('seed1'), price: 28000, originalPrice: 35000, discountRate: 20 },
  5: { id: 5, brand: '바이오더마', name: '하이드라비오 토너 250ml', category: '토너', imageUrl: img('seed5'), price: 26500 },
  6: { id: 6, brand: '에스트라', name: '아토베리어365 크림 80ml', category: '크림', imageUrl: img('seed6'), price: 25400 },
  8: { id: 8, brand: '라로슈포제', name: '시카플라스트 밤 B5+ 40ml', category: '밤', imageUrl: img('seed8'), price: 34850 },
  11: { id: 11, brand: '라운드랩', name: '자작나무 수분 크림 80ml', category: '크림', imageUrl: img('seed11'), price: 22000 },
  12: { id: 12, brand: '토리든', name: '다이브인 저분자 히알루론산 세럼', category: '세럼', imageUrl: img('seed12'), price: 22000 },
};

// ===== seed별 대체품 리스트 =====
export const MOCK_ALTERNATIVES: Record<number, Alternative[]> = {
  // 이니스프리 수분 밸런싱 토너(28,000원) 대신
  1: [
    {
      id: 102, brand: '코스알엑스', name: '히알루론산 수분 토너 EX 150ml', category: '토너',
      imageUrl: img('alt102'), price: 18000, rating: 4.6, reviewCount: 8210,
      similarityScore: 92, seedId: 1, priceDelta: -10000, savingRate: 36,
      skinMatch: { skinType: 'ondalsam', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['히알루론산', '판테놀'],
      reasonTags: [
        { type: 'similarity', label: '유사도 92%', emphasis: true },
        { type: 'priceSave', label: '36% 저렴' },
        { type: 'skinMatch', label: '옹달샘 궁합' },
      ],
    },
    {
      id: 103, brand: '닥터자르트', name: '딥 하이드레이션 토너 200ml', category: '토너',
      imageUrl: img('alt103'), price: 32000, rating: 4.7, reviewCount: 3120,
      similarityScore: 78, seedId: 1, priceDelta: 4000,
      skinMatch: { skinType: 'ondalsam', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['히알루론산'],
      reasonTags: [
        { type: 'similarity', label: '유사도 78%', emphasis: true },
        { type: 'skinMatch', label: '옹달샘 궁합' },
      ],
    },
    {
      id: 104, brand: '토리든', name: '다이브인 저분자 히알루론산 토너 300ml', category: '토너',
      imageUrl: img('alt104'), price: 22000, rating: 4.8, reviewCount: 15400,
      similarityScore: 71, seedId: 1, priceDelta: -6000, savingRate: 21, situation: null,
      sharedKeyIngredients: ['히알루론산'],
      reasonTags: [
        { type: 'similarity', label: '유사도 71%', emphasis: true },
        { type: 'priceSave', label: '21% 저렴' },
      ],
    },
  ],

  // 바이오더마 하이드라비오 토너(26,500원) 대신
  5: [
    {
      id: 105, brand: '라운드랩', name: '1025 독도 토너 200ml', category: '토너',
      imageUrl: img('alt105'), price: 18900, rating: 4.7, reviewCount: 42100,
      similarityScore: 88, seedId: 5, priceDelta: -7600, savingRate: 29,
      skinMatch: { skinType: 'ondalsam', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['판테놀', '베타글루칸'],
      reasonTags: [
        { type: 'similarity', label: '유사도 88%', emphasis: true },
        { type: 'priceSave', label: '29% 저렴' },
        { type: 'skinMatch', label: '옹달샘 궁합' },
      ],
    },
    {
      id: 106, brand: '아벤느', name: '떼르말 스프링 워터 토너 200ml', category: '토너',
      imageUrl: img('alt106'), price: 24000, rating: 4.6, reviewCount: 5300,
      similarityScore: 74, seedId: 5, priceDelta: -2500, savingRate: 9,
      skinMatch: { skinType: 'yuriguseul', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['베타글루칸'],
      reasonTags: [
        { type: 'similarity', label: '유사도 74%', emphasis: true },
        { type: 'skinMatch', label: '민감성 진정' },
      ],
    },
  ],

  // 에스트라 아토베리어365 크림(25,400원) — 단종 상황 대응 예시
  6: [
    {
      id: 107, brand: '라로슈포제', name: '톨러리안 더블 리페어 모이스처라이저 75ml', category: '크림',
      imageUrl: img('alt107'), price: 29000, rating: 4.8, reviewCount: 9120,
      similarityScore: 90, seedId: 6, priceDelta: 3600,
      skinMatch: { skinType: 'samak', verdict: 'good' }, situation: 'discontinued',
      sharedKeyIngredients: ['세라마이드', '나이아신아마이드'],
      reasonTags: [
        { type: 'similarity', label: '유사도 90%', emphasis: true },
        { type: 'situation', label: '단종 대응' },
        { type: 'skinMatch', label: '사막 보습' },
      ],
    },
    {
      id: 108, brand: '일리윤', name: '세라마이드 아토 농축 크림 200ml', category: '크림',
      imageUrl: img('alt108'), price: 17500, rating: 4.6, reviewCount: 23800,
      similarityScore: 83, seedId: 6, priceDelta: -7900, savingRate: 31,
      skinMatch: { skinType: 'samak', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['세라마이드'],
      reasonTags: [
        { type: 'similarity', label: '유사도 83%', emphasis: true },
        { type: 'priceSave', label: '31% 저렴' },
        { type: 'skinMatch', label: '사막 보습' },
      ],
    },
  ],

  // 라로슈포제 시카플라스트 밤(34,850원) 대신
  8: [
    {
      id: 109, brand: '에스트라', name: '아토베리어365 크림 80ml', category: '크림',
      imageUrl: img('alt109'), price: 25400, rating: 4.9, reviewCount: 3200,
      similarityScore: 81, seedId: 8, priceDelta: -9450, savingRate: 27,
      skinMatch: { skinType: 'hwasan', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['판테놀', '세라마이드'],
      reasonTags: [
        { type: 'similarity', label: '유사도 81%', emphasis: true },
        { type: 'priceSave', label: '27% 저렴' },
        { type: 'skinMatch', label: '화산 진정' },
      ],
    },
  ],

  // 라운드랩 자작나무 수분 크림(22,000원) 대신
  11: [
    {
      id: 110, brand: '토리든', name: '다이브인 저분자 히알루론산 크림 80ml', category: '크림',
      imageUrl: img('alt110'), price: 15500, rating: 4.7, reviewCount: 6200,
      similarityScore: 88, seedId: 11, priceDelta: -6500, savingRate: 30,
      skinMatch: { skinType: 'ondalsam', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['자작나무 수액', '히알루론산'],
      reasonTags: [
        { type: 'similarity', label: '유사도 88%', emphasis: true },
        { type: 'priceSave', label: '30% 저렴' },
        { type: 'skinMatch', label: '옹달샘 궁합' },
      ],
    },
  ],

  // 토리든 다이브인 저분자 히알루론산 세럼(22,000원) 대신
  12: [
    {
      id: 111, brand: '아누아', name: '어성초 77 히알루론산 수분 진정 토너 350ml', category: '토너',
      imageUrl: img('alt111'), price: 22800, rating: 4.7, reviewCount: 41200,
      similarityScore: 76, seedId: 12,
      skinMatch: { skinType: 'yuriguseul', verdict: 'good' }, situation: null,
      sharedKeyIngredients: ['히알루론산'],
      reasonTags: [
        { type: 'similarity', label: '유사도 76%', emphasis: true },
        { type: 'skinMatch', label: '유리구슬 궁합' },
      ],
    },
  ],
};

// ===== 홈 "내 화장대와 비슷한 추천" — 등록물품 기준 평탄화 피드 =====
export const MOCK_ALTERNATIVES_FOR_REGISTRY: Alternative[] = [
  MOCK_ALTERNATIVES[6][0], // 아토베리어 크림 → 톨러리안 (단종 대응)
  MOCK_ALTERNATIVES[5][0], // 하이드라비오 토너 → 독도 토너 (가성비)
  MOCK_ALTERNATIVES[8][0], // 시카플라스트 밤 → 아토베리어 크림
  MOCK_ALTERNATIVES[6][1], // 아토베리어 크림 → 일리윤
  MOCK_ALTERNATIVES[5][1], // 하이드라비오 토너 → 아벤느
  MOCK_ALTERNATIVES[1][0], // (참고) 수분토너 → 코스알엑스
];

// ===== 홈 "더 저렴한 대체품" — 가격절약 강조 피드 (savingRate 내림차순) =====
export const MOCK_CHEAPER_ALTERNATIVES: Alternative[] = [
  MOCK_ALTERNATIVES[1][0], // 코스알엑스 36%
  MOCK_ALTERNATIVES[6][1], // 일리윤 31%
  MOCK_ALTERNATIVES[5][0], // 독도 토너 29%
  MOCK_ALTERNATIVES[8][0], // 아토베리어 27%
  MOCK_ALTERNATIVES[1][2], // 토리든 21%
].sort((a, b) => (b.savingRate ?? 0) - (a.savingRate ?? 0));
