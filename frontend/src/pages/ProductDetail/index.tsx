import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TopNavBar } from '../../components/category/TopNavBar';
import { Icon } from '../../components/category/Icon';
import { ProductCard } from '../../components/category/ProductCard';
import { DragScrollRow } from '../../components/common/DragScrollRow';
import { AnalysisPopup } from './AnalysisPopup';
import placeholderImage from '../../assets/placeholderImage';
import skinMatchCharacter from '../../assets/skin-match-character.png';
import type { CategoryProduct } from '../../components/category/types';

// TODO: 실제 API 연동 전까지 목데이터
const MOCK_PRODUCT = {
  brand: '아누아',
  title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
  price: 16900,
  originalPrice: 70000,
  discountPercent: 53,
  rating: 4.74,
  reviewCount: 5988,
  reviewPositivePercent: 95,
};

const REVIEW_HIGHLIGHTS = [
  { rating: 5, ageGroup: '20대', skinType: '반질반질 물개형', text: '완전 기름기 많은 피부인데 이게 완전 찰떡이에요!!! 다음에 또 구매 할것 같...' },
  { rating: 5, ageGroup: '20대', skinType: '반질반질 물개형', text: '완전 기름기 많은 피부인데 이게 완전 찰떡이에요!!! 다음에 또 구매 할것 같...' },
  { rating: 5, ageGroup: '20대', skinType: '반질반질 물개형', text: '완전 기름기 많은 피부인데 이게 완전 찰떡이에요!!! 다음에 또 구매 할것 같...' },
];

const SIMILAR_PRODUCTS: CategoryProduct[] = [
  {
    id: 'sim1',
    imageUrl: placeholderImage,
    title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
    price: 16900,
    originalPrice: 70000,
    discountPercent: 53,
  },
  {
    id: 'sim2',
    imageUrl: placeholderImage,
    title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
    price: 16900,
    originalPrice: 70000,
    discountPercent: 53,
  },
  {
    id: 'sim3',
    imageUrl: placeholderImage,
    title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
    price: 16900,
    originalPrice: 70000,
    discountPercent: 53,
  },
  {
    id: 'sim4',
    imageUrl: placeholderImage,
    title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
    price: 16900,
    originalPrice: 70000,
    discountPercent: 53,
  },
];

const OTHERS_ALSO_VIEWED: CategoryProduct[] = [
  {
    id: 'ov1',
    imageUrl: placeholderImage,
    title: '정성만점 티트리 카밍 크림 50ml',
    price: 21900,
    originalPrice: 32000,
    discountPercent: 32,
  },
  {
    id: 'ov2',
    imageUrl: placeholderImage,
    title: '수분가득 세라마이드 크림 80ml',
    price: 24800,
    originalPrice: 39000,
    discountPercent: 36,
  },
  {
    id: 'ov3',
    imageUrl: placeholderImage,
    title: '저자극 판테놀 진정 토너 200ml',
    price: 18500,
  },
  {
    id: 'ov4',
    imageUrl: placeholderImage,
    title: '무향 순한 클렌징폼 150ml',
    price: 12900,
    originalPrice: 16000,
    discountPercent: 19,
  },
];

// TODO: 실제 API 연동 전까지 목데이터 (리뷰/성분 탭)
const AI_MATCH = {
  skinType: '쫄깃쫄깃 인절미',
  matchPercent: 92,
  description: '내 피부와 찰떡이에요!! 특히 히알루론 성분이 풍부해서 건조한 피부를 수분 촉촉하게 만들어줘요!!알러지 성분도 거의 없는 순한 제품이에요!!',
  tags: ['히알루론산', '저자극', '알러지 성분 적음'],
};

const INGREDIENT_SUMMARY = {
  productName: '다이브인 저분자 히알루론산 세럼',
  totalCount: 33,
  cautionCount: 0,
  allergyCount: 0,
  interestCount: 0,
  avoidCount: 0,
};

const RATING_BREAKDOWN = [
  { label: '5점', barPercent: 88 },
  { label: '4점', barPercent: 15 },
  { label: '3점', barPercent: 9 },
  { label: '2점', barPercent: 5 },
  { label: '1점', barPercent: 5 },
];

const REVIEWS = [
  {
    nickname: '멍뭉망뭉',
    skinTags: '지성・여름쿨톤・잡티・미백',
    date: '2026.06.26',
    place: '매장',
    option: '[옵션] 다이브인 저분자 히알루론산 세럼 50ml',
    text: '발림성 좋고 흡수도 빨라서 아침저녁 데일리로 쓰기 딱이에요! 백탁 없고 촉촉해서 재구매 의사 있어요.',
    likes: 16,
  },
  {
    nickname: '수분폭탄',
    skinTags: '건성・겨울웜톤・트러블',
    date: '2026.06.20',
    place: '온라인',
    option: '[옵션] 다이브인 저분자 히알루론산 세럼 50ml',
    text: '건조함이 심한 편인데 이거 바르고 하루종일 촉촉했어요. 향도 거의 없어서 좋아요.',
    likes: 9,
  },
  {
    nickname: '피부요정',
    skinTags: '복합성・봄웜톤',
    date: '2026.06.11',
    place: '매장',
    option: '[옵션] 다이브인 저분자 히알루론산 세럼 50ml',
    text: '가성비 좋고 자극없이 잘 맞아요. 다만 용량이 조금 아쉬워서 큰 사이즈도 나왔으면 좋겠어요.',
    likes: 4,
  },
];

export default function ProductDetailPage() {
  const { id } = useParams();
  void id; // TODO: id로 상품 API 호출

  const [tab, setTab] = useState<'info' | 'review'>('info');
  const [isFavorite, setIsFavorite] = useState(false);
  const [similarProducts, setSimilarProducts] = useState(SIMILAR_PRODUCTS);
  const [othersAlsoViewed, setOthersAlsoViewed] = useState(OTHERS_ALSO_VIEWED);
  const [descExpanded, setDescExpanded] = useState(false);
  const [ingredientExpanded, setIngredientExpanded] = useState(false);
  const [myTypeOnly, setMyTypeOnly] = useState(false);
  const [showAnalysisPopup, setShowAnalysisPopup] = useState(false);
  const [pendingReviewScroll, setPendingReviewScroll] = useState(false);
  const reviewSectionRef = useRef<HTMLDivElement>(null);

  const toggleSimilarFavorite = (pid: string) => {
    setSimilarProducts((prev) => prev.map((p) => (p.id === pid ? { ...p, isFavorite: !p.isFavorite } : p)));
  };

  const toggleOthersAlsoViewedFavorite = (pid: string) => {
    setOthersAlsoViewed((prev) => prev.map((p) => (p.id === pid ? { ...p, isFavorite: !p.isFavorite } : p)));
  };

  const goToReviewSection = () => {
    setTab('review');
    setPendingReviewScroll(true);
  };

  useEffect(() => {
    if (tab === 'review' && pendingReviewScroll) {
      requestAnimationFrame(() => {
        reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      setPendingReviewScroll(false);
    }
  }, [tab, pendingReviewScroll]);

  return (
    <div className="min-h-dvh bg-white pb-[92px]">
      <TopNavBar title="" />

      <div className="w-full h-[416px] bg-gray-10">
        <img src={placeholderImage} alt={MOCK_PRODUCT.title} className="w-full h-full object-cover" />
      </div>

      <div className="flex items-center justify-between px-6 h-[51px]">
        <span className="text-sm text-gray-70">{MOCK_PRODUCT.brand}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFavorite((v) => !v)}
            className={`active:scale-90 transition-transform ${isFavorite ? 'text-accent' : 'text-gray-70'}`}
            aria-label="찜하기"
          >
            <Icon name="favorite" size={24} />
          </button>
          <button type="button" className="text-gray-70 active:scale-90 transition-transform" aria-label="공유">
            <Icon name="upload" size={24} />
          </button>
        </div>
      </div>

      <div className="px-6">
        <p className="text-lg font-semibold text-gray-100 leading-snug">{MOCK_PRODUCT.title}</p>
        <div className="mt-3">
          <div className="text-sm text-gray-50 line-through">{MOCK_PRODUCT.originalPrice.toLocaleString()}원</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-accent">{MOCK_PRODUCT.discountPercent}%</span>
            <span className="text-2xl font-bold text-gray-100">{MOCK_PRODUCT.price.toLocaleString()}원~</span>
          </div>
        </div>
      </div>

      <button type="button" onClick={goToReviewSection} className="flex items-center gap-1.5 px-6 h-10 mt-2">
        <Icon name="star" size={14} className="text-star" />
        <span className="text-sm font-medium text-gray-100">{MOCK_PRODUCT.rating.toFixed(2)}</span>
        <span className="text-sm text-gray-50">({MOCK_PRODUCT.reviewCount.toLocaleString()})</span>
      </button>

      {/* 리뷰 하이라이트 캐러셀 */}
      <section className="px-6 py-4">
        <p className="text-base text-gray-100">
          4점 이상 리뷰가 <span className="font-semibold">{MOCK_PRODUCT.reviewPositivePercent}%</span> 예요
        </p>
        <div className="flex gap-3 mt-4 overflow-x-auto scrollbar-hide">
          {REVIEW_HIGHLIGHTS.map((r, i) => (
            <div key={i} className="flex-shrink-0 w-[260px] rounded-[18px] bg-white shadow-md p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Icon name="star" className="text-star" />
                  <span className="text-sm font-medium text-gray-100">{r.rating}</span>
                </div>
                <div className="flex gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-gray-10 text-[10px] text-[#dea5ab]">{r.ageGroup}</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-10 text-[10px] font-medium text-[#dea5ab]">{r.skinType}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <p className="flex-1 text-xs text-gray-100 leading-relaxed line-clamp-2">{r.text}</p>
                <div className="w-12 h-14 rounded bg-gray-10 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky top-12 z-10 flex bg-white border-b border-gray-20">
        <button
          type="button"
          onClick={() => setTab('info')}
          className={`flex-1 h-[46px] flex items-center justify-center text-sm border-b-2 ${
            tab === 'info' ? 'border-gray-100 text-gray-100 font-bold' : 'border-transparent text-gray-50'
          }`}
        >
          상품정보
        </button>
        <button
          type="button"
          onClick={() => setTab('review')}
          className={`flex-1 h-[46px] flex items-center justify-center text-sm border-b-2 ${
            tab === 'review' ? 'border-gray-100 text-gray-100 font-bold' : 'border-transparent text-gray-50'
          }`}
        >
          리뷰/성분
        </button>
      </div>

      <div className="bg-white px-6 py-6">
        {tab === 'info' ? (
          <>
            {/* 상품 소개: 사진(자리는 도형) + 하단 그라데이션 + 더보기로 펼치기 */}
            <div className="relative">
              <div className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${descExpanded ? 'max-h-[900px]' : 'max-h-[300px]'}`}>
                <div className="w-full h-[300px] bg-gray-10 rounded-md" />
                <div className="w-full h-[300px] bg-gray-10 rounded-md mt-2" />
                <div className="w-full h-[300px] bg-gray-10 rounded-md mt-2" />
              </div>
              {!descExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-b from-transparent to-white pointer-events-none" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="mt-3 w-full h-9 flex items-center justify-center gap-1 rounded-md border border-gray-20 bg-white text-sm text-gray-70"
            >
              {descExpanded ? '접기' : '상품 소개 더보기'}
              <Icon name="keyboard_arrow_down" size={24} className={`text-gray-50 transition-transform ${descExpanded ? 'rotate-180' : ''}`} />
            </button>

            <section className="mt-8">
              <h2 className="text-base font-bold text-gray-100 mb-4">비슷한 상품</h2>
              <DragScrollRow className="flex gap-4 -mx-6 px-6">
                {similarProducts.map((p) => (
                  <div key={p.id} className="w-[140px] flex-shrink-0">
                    <ProductCard product={p} onToggleFavorite={toggleSimilarFavorite} />
                  </div>
                ))}
              </DragScrollRow>
            </section>

            <section className="mt-8">
              <h2 className="text-base font-bold text-gray-100 mb-4">다른 고객이 함께 본 상품</h2>
              <DragScrollRow className="flex gap-4 -mx-6 px-6">
                {othersAlsoViewed.map((p) => (
                  <div key={p.id} className="w-[140px] flex-shrink-0">
                    <ProductCard product={p} onToggleFavorite={toggleOthersAlsoViewedFavorite} />
                  </div>
                ))}
              </DragScrollRow>
            </section>
          </>
        ) : (
          <div className="flex flex-col gap-9">
            {/* 타입별 AI 분석 */}
            <section>
              <h2 className="text-sm font-medium text-gray-100 mb-3">타입별 AI 분석</h2>
              <div className="bg-white rounded-[20px] shadow-md p-5">
                <div className="flex items-center gap-3">
                  <img src={skinMatchCharacter} alt="" className="w-[42px] h-[37px] flex-shrink-0" />
                  <p className="flex-1 text-[11px] font-medium tracking-wide text-gray-100">
                    {AI_MATCH.skinType}타입의 매칭율
                  </p>
                  <span className="text-sm font-medium text-[#2d7a4f]">{AI_MATCH.matchPercent}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[#f3f3f3]">
                  <div className="h-2 rounded-full bg-[#f5c2c7]" style={{ width: `${AI_MATCH.matchPercent}%` }} />
                </div>
                <p className="mt-3 text-xs text-gray-70 leading-relaxed">{AI_MATCH.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {AI_MATCH.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f6f6f6] text-[10px] text-gray-100">
                      <Icon name="check" size={10} className="text-[#2d7a4f]" />
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAnalysisPopup(true)}
                  className="mt-4 w-full h-[26px] flex items-center justify-center gap-0.5 rounded border border-gray-20 text-[10px] text-gray-50"
                >
                  분석 더보기
                  <Icon name="keyboard_arrow_down" size={16} className="text-gray-50" />
                </button>
              </div>
            </section>

            {/* 성분 */}
            <section className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setIngredientExpanded((v) => !v)}
                className="flex items-center justify-between bg-gray-10 rounded-2xl p-5 text-left"
              >
                <span className="text-sm font-medium text-gray-100">{INGREDIENT_SUMMARY.productName}</span>
                <Icon name="keyboard_arrow_down" size={24} className={`text-gray-50 transition-transform ${ingredientExpanded ? 'rotate-180' : ''}`} />
              </button>

              <button type="button" className="flex items-center justify-between bg-gray-10 rounded-2xl p-5">
                <span className="flex items-center gap-3">
                  <Icon name="search" size={24} className="text-[#3B82F6]" />
                  <span className="text-sm font-semibold text-gray-100">이 제품의 성분 비슷템 찾기</span>
                </span>
                <Icon name="arrow_forward_ios" size={24} className="text-gray-50" />
              </button>

              <button type="button" className="flex items-center justify-between">
                <span className="text-base font-medium text-gray-100">성분 구성</span>
                <Icon name="arrow_forward_ios" size={24} className="text-gray-50" />
              </button>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="flex items-center gap-1 text-[11px] text-gray-70">
                  <span className="w-2 h-2 rounded-full bg-[#2d7a4f]" />1-2 낮은 위험
                </span>
                <span className="flex items-center gap-1 text-[11px] text-gray-70">
                  <span className="w-2 h-2 rounded-full bg-[#ffbb00]" />3-6 중간 위험
                </span>
                <span className="flex items-center gap-1 text-[11px] text-gray-70">
                  <span className="w-2 h-2 rounded-full bg-accent" />7-10 높은 위험
                </span>
                <span className="flex items-center gap-1 text-[11px] text-gray-70">
                  <span className="w-2 h-2 rounded-full bg-gray-20" />등급 미정
                </span>
              </div>

              <div className="flex h-2 w-full">
                <div className="h-2 bg-[#2d7a4f] rounded-l" style={{ width: '90%' }} />
                <div className="h-2 bg-[#ffbb00] rounded-r" style={{ width: '10%' }} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-gray-100">전체 성분</span>
                <span className="text-base font-semibold text-gray-100">{INGREDIENT_SUMMARY.totalCount}개</span>
              </div>

              {[
                { icon: null, badge: '20', label: '20가지 주의성분', count: INGREDIENT_SUMMARY.cautionCount },
                { icon: null, badge: 'AL', label: '알레르기 주의성분', count: INGREDIENT_SUMMARY.allergyCount },
                { icon: 'interest' as const, badge: null, label: '내 관심 성분', count: INGREDIENT_SUMMARY.interestCount },
                { icon: 'avoid' as const, badge: null, label: '내 피할 성분', count: INGREDIENT_SUMMARY.avoidCount },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full border border-gray-20 flex items-center justify-center text-gray-50">
                      {row.icon ? <Icon name={row.icon} size={14} /> : <span className="text-[10px] font-medium">{row.badge}</span>}
                    </span>
                    <span className="text-sm text-gray-100">{row.label}</span>
                  </span>
                  <span className="text-sm text-gray-50">{row.count}개</span>
                </div>
              ))}

              <p className="text-xs text-gray-50 leading-relaxed">
                관심 있는 성분이나 피하고 싶은 성분을 <span className="underline">전성분 목록</span>에서 추가할 수 있어요. 즐겨찾기해 두면 성분 구성에서 편하게 확인할 수 있어요.
              </p>
            </section>

            {/* 리뷰 */}
            <section
              ref={reviewSectionRef}
              className="flex flex-col gap-5 -mx-6 px-6 pt-2 border-t-8 border-gray-10 scroll-mt-[94px]"
            >
              <button type="button" className="flex items-center justify-between">
                <span className="text-lg font-medium">
                  리뷰 <span className="text-[#2d7a4f]">{MOCK_PRODUCT.reviewCount.toLocaleString()}</span>
                </span>
                <Icon name="arrow_forward_ios" size={24} className="text-gray-100" />
              </button>

              {/* 평점 요약 */}
              <div className="flex items-center gap-9">
                <div className="text-center flex-shrink-0">
                  <p className="text-4xl font-medium text-gray-100">{MOCK_PRODUCT.rating.toFixed(2)}</p>
                  <div className="flex gap-0.5 mt-1 justify-center">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Icon key={i} name="star" size={16} className={i < Math.round(MOCK_PRODUCT.rating) ? 'text-star' : 'text-gray-20'} />
                    ))}
                  </div>
                </div>
                <div className="w-px h-[46px] bg-gray-20" />
                <div className="flex gap-7 flex-1 justify-between">
                  {RATING_BREAKDOWN.map((r) => (
                    <div key={r.label} className="flex flex-col items-center gap-2">
                      <span className="text-xs font-medium text-gray-100">{r.label}</span>
                      <div className="relative w-1 h-[65px] rounded bg-[#efefef]">
                        <div
                          className="absolute bottom-0 left-0 w-1 rounded bg-[#bfbfbf]"
                          style={{ height: `${r.barPercent}%`, backgroundColor: r.label === '5점' ? '#ffbb00' : '#bfbfbf' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 필터 + 정렬 */}
              <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <button type="button" className="flex items-center gap-1 pl-4 pr-3 py-2.5 rounded-full border border-gray-20 text-[13px] text-gray-100">
                    리뷰 유형
                    <Icon name="arrow_drop_down" size={16} className="text-gray-50" />
                  </button>
                  <button type="button" className="flex items-center gap-1 pl-4 pr-3 py-2.5 rounded-full border border-gray-20 text-[13px] text-gray-100">
                    피부 필터
                    <Icon name="arrow_drop_down" size={16} className="text-gray-50" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMyTypeOnly((v) => !v)}
                    className="flex items-center gap-2"
                  >
                    <span className={`w-10 h-6 rounded-full transition-colors relative ${myTypeOnly ? 'bg-[#2d7a4f]' : 'bg-gray-20'}`}>
                      <span className={`absolute left-0 top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${myTypeOnly ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </span>
                    <span className="text-sm font-medium text-gray-100">내 피부 맞춤</span>
                  </button>
                  <button type="button" className="flex items-center gap-1 text-sm font-medium text-gray-100">
                    유용한 순
                    <Icon name="arrow_drop_down" size={16} className="text-gray-50" />
                  </button>
                </div>
              </div>

              <button type="button" className="self-center text-sm text-gray-70 underline">
                리뷰 쓰기
              </button>

              {/* 리뷰 사진 그리드 */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="relative aspect-square rounded bg-gray-10 overflow-hidden">
                    {i === 7 && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-xs font-medium text-white">
                        더보기
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 리뷰 목록 */}
              <div className="flex flex-col gap-6">
                {REVIEWS.map((r, i) => (
                  <div key={i} className="flex flex-col gap-2.5 pb-6 border-b border-gray-10 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-gray-10 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-100">{r.nickname}</p>
                        <p className="text-[11px] text-gray-50">{r.skinTags}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }, (_, si) => (
                          <Icon key={si} name="star" size={14} className="text-star" />
                        ))}
                      </div>
                      <span className="text-xs text-gray-50">{r.date} | {r.place}</span>
                    </div>
                    <p className="text-xs text-gray-50">{r.option}</p>
                    <p className="text-sm text-gray-100 leading-relaxed">{r.text}</p>
                    <p className="text-[11px] text-gray-50 leading-relaxed">
                      ⓘ 해당 리뷰는 성분과 내용물이 동일한 상품에 작성된 것으로, 용량, 구성(1+1, 증정 등), 패키지 등에 차이가 있을 수 있습니다.
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-50">신고하기</span>
                      <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-20">
                        <Icon name="thumb_up" size={14} className="text-gray-50" />
                        <span className="text-xs font-medium text-gray-50">{r.likes}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* 피부 매칭율 플로팅 배지: 리뷰/성분 탭에서는 숨김 (해당 탭 안에 이미 AI 분석 카드가 있음) */}
      {tab === 'info' && (
        <button
          type="button"
          onClick={() => setShowAnalysisPopup(true)}
          className="fixed right-0 bottom-[92px] z-20 w-[43px] h-[61px] rounded-tl-[20px] bg-[rgba(237,217,185,0.5)] flex flex-col items-center justify-center gap-0.5"
        >
          <img src={skinMatchCharacter} alt="" className="w-8 h-7" />
          <span className="text-[8px] font-medium leading-[1.1] text-[#2d7a4f] text-center">
            피 부<br />매칭율
          </span>
          <Icon name="arrow_forward_ios" size={12} className="text-[#2d7a4f]" />
        </button>
      )}

      {/* 하단 고정 구매바 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-[430px] h-[76px] bg-white border-t border-[#848484]/30 rounded-t-[10px] flex items-center gap-3 px-6">
        <button type="button" className="flex-1 h-[42px] rounded-[7px] border border-[#2d7a4f] bg-white text-sm font-semibold text-[#2d7a4f]">
          장바구니 담기
        </button>
        <button type="button" className="flex-1 h-[42px] rounded-[7px] bg-[#2d7a4f] text-sm font-semibold text-white">
          바로 구매
        </button>
      </div>

      {showAnalysisPopup && (
        <AnalysisPopup
          skinType={AI_MATCH.skinType}
          matchPercent={AI_MATCH.matchPercent}
          onClose={() => setShowAnalysisPopup(false)}
        />
      )}
    </div>
  );
}
