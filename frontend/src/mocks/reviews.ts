// 상품 상세 "리뷰/성분" 탭 리뷰 목업
// TODO: 실제 리뷰 API 연동 전까지 목데이터

export interface ReviewItem {
  id: number;
  author: string;
  skinTags: string[];
  rating: number;
  date: string;
  channel: string;
  option: string;
  photos: number;
  body: string;
  likeCount: number;
}

export const REVIEWS: ReviewItem[] = [
  {
    id: 1,
    author: '멍뭉망뭉',
    skinTags: ['반질반질 물개', '여름쿨톤', '잡티'],
    rating: 5,
    date: '2026.06.26',
    channel: '매장',
    option: '다이브인 저분자 히알루론산 세럼 50ml',
    photos: 2,
    body: '발림성 좋고 흡수도 빨라서 아침저녁 데일리로 쓰기 딱이에요! 백탁 없고 촉촉해서 재구매 의사 있어요.',
    likeCount: 16,
  },
  {
    id: 2,
    author: '수분폭탄',
    skinTags: ['바스락 사막', '겨울웜톤'],
    rating: 5,
    date: '2026.06.20',
    channel: '온라인',
    option: '다이브인 저분자 히알루론산 세럼 50ml',
    photos: 2,
    body: '건조함이 심한 편인데 이거 바르고 하루종일 촉촉했어요. 향도 거의 없어서 좋아요.',
    likeCount: 9,
  },
  {
    id: 3,
    author: '피부요정',
    skinTags: ['겉바속촉 수부지', '봄웜톤'],
    rating: 4,
    date: '2026.06.11',
    channel: '매장',
    option: '다이브인 저분자 히알루론산 세럼 50ml',
    photos: 0,
    body: '가성비 좋고 자극없이 잘 맞아요. 다만 용량이 조금 아쉬워서 큰 사이즈도 나왔으면 좋겠어요.',
    likeCount: 4,
  },
  {
    id: 4,
    author: '민감보스',
    skinTags: ['조심조심 유리구슬', '가을웜톤'],
    rating: 5,
    date: '2026.06.05',
    channel: '온라인',
    option: '다이브인 저분자 히알루론산 세럼 50ml',
    photos: 1,
    body: '예민성인데도 트러블 없이 순하게 잘 맞았어요. 진정 효과도 있는 것 같아요.',
    likeCount: 7,
  },
];

/** 별점 분포 비율(5→1점). 평균 별점이 높은 인기 제품 패턴을 가정한 값 */
export const RATING_DISTRIBUTION = [88, 7, 3, 1, 1];
