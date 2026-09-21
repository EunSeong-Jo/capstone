import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/category/Icon';
import { OySectionHeader } from '../../components/home/oy/OySectionHeader';
import { ProductCardV } from '../../components/home/oy/ProductCardV';
import { AnalysisPopup } from './AnalysisPopup';
import { useLikedProducts } from '../../context/LikedProductsContext';
import { useCart } from '../../context/CartContext';
import { useCloset } from '../../context/ClosetContext';
import { useAuth } from '../../context/AuthContext';
import { useDiagnosis } from '../../context/DiagnosisContext';
import { useProduct } from '../../hooks/useProduct';
import { useProducts } from '../../hooks/useProducts';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import { useMyIngredients } from '../../hooks/useMyIngredients';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { Product, SkinType, SKIN_TYPE_META } from '../../types';
import { skinTypes, RESULT_DETAILS } from '../../data/skinTypes';
import { MOCK_INGREDIENTS } from '../../mocks/alternatives';
import { REVIEWS, RATING_DISTRIBUTION, ReviewItem } from '../../mocks/reviews';
import { countIngredients, groupIngredients } from '../../utils/ingredients';
import { useUserProfile } from '../../context/userProfile';
import { useToast } from '../../components/ui/ToastContext';
import { ReviewWriteSheet, ReviewDraft } from '../../components/reviews/ReviewWriteSheet';
import { HeartIcon, CartIcon } from '../../components/ui/OutlineIcons';

const DEFAULT_SKIN: SkinType = 'ondalsam';

/** 국내 화장품 표시·광고 기재 대상 성분(예시). 실제 고시 목록 연동 전까지 데모용 */
const CAUTION_INGREDIENTS = [
  '살리실릭애씨드', '소듐라우릴설페이트', '벤질알코올', '레티놀', '알파-비사보롤',
  '카민', '과산화화합물', '벤조일퍼옥사이드', '히드로퀴논', '포름알데하이드',
  '아이오도프로피닐부틸카바메이트', '스테아린산아연', '클로로아세타마이드', '천수국꽃추출물',
  '세트리모늄클로라이드', '땅콩오일', '실버나이트레이트', '우레아', '치오글리콜산', '무기자외선차단성분',
];

/** EU 향료 알레르기 유발 성분(예시 26종 일부) */
const ALLERGEN_INGREDIENTS = [
  '리모넨', '리날룰', '시트로넬올', '제라니올', '유제놀', '쿠마린', '신남알', '벤질벤조에이트',
  '벤질살리실레이트', '파네솔',
];

/** 제품·피부타입 조합마다 안정적인 매칭율(70~95%)을 낸다 */
function computeMatchPct(productId: number, type: SkinType): number {
  return 70 + (((productId || 0) + type.length * 7 + type.charCodeAt(0)) % 26);
}


/** 섹션 사이 굵은 구분 띠 — 홈과 같은 리듬 */
function Divider() {
  return <div className="h-2 bg-oy-line" />;
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="px-4 py-5">{children}</section>;
}

function ComingSoon({ title, reason }: { title: string; reason: string }) {
  return (
    <Section>
      <OySectionHeader title={title} />
      <div className="rounded-xl border border-dashed border-oy-line bg-white px-4 py-6 text-center">
        <p className="text-sm text-oy-sub leading-relaxed">{reason}</p>
        <span className="mt-2 inline-block rounded-full bg-oy-chip px-2.5 py-0.5 text-xs text-oy-sub">
          준비 중
        </span>
      </div>
    </Section>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square w-full bg-oy-chip" />
      <div className="px-4 py-5">
        <div className="h-3 w-16 rounded bg-oy-line" />
        <div className="mt-2.5 h-4 w-4/5 rounded bg-oy-line" />
        <div className="mt-1.5 h-4 w-2/5 rounded bg-oy-line" />
        <div className="mt-4 h-6 w-28 rounded bg-oy-line" />
      </div>
      <Divider />
      <div className="px-4 py-5">
        <div className="h-5 w-24 rounded bg-oy-line" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-7 w-20 rounded-full bg-oy-line" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 오류·404 공용 빈 화면 */
function EmptyState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-24 text-center">
      <p className="text-sm text-oy-sub leading-relaxed">{message}</p>
      <div className="flex gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-oy-text/20 px-4 py-1.5 text-sm font-medium active:scale-95"
          >
            다시 시도
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white active:scale-95"
        >
          홈으로
        </button>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M11.25 15.7885V7.3885L8.78475 9.85375L7.73075 8.76925L12 4.5L16.2693 8.76925L15.2153 9.85375L12.75 7.3885V15.7885H11.25ZM6.30775 19.5C5.80258 19.5 5.375 19.325 5.025 18.975C4.675 18.625 4.5 18.1974 4.5 17.6923V14.9808H6V17.6923C6 17.7692 6.03208 17.8398 6.09625 17.9038C6.16025 17.9679 6.23075 18 6.30775 18H17.6923C17.7692 18 17.8398 17.9679 17.9038 17.9038C17.9679 17.8398 18 17.7692 18 17.6923V14.9808H19.5V17.6923C19.5 18.1974 19.325 18.625 18.975 18.975C18.625 19.325 18.1974 19.5 17.6923 19.5H6.30775Z" fill="#17171C" />
    </svg>
  );
}
function ScrapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type Tab = 'info' | 'review';

export default function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = Number(id);
  const { product, loading, error, notFound, reload } = useProduct(productId);
  const similar = useSimilarProducts(productId, { limit: 10, seedProduct: product });
  const pool = useProducts({ size: 12, sort: 'popular' });

  const { addRecentlyViewed } = useRecentlyViewed();
  const { isLiked, toggleLike } = useLikedProducts();
  const { addToCart, inCart, count: cartCount } = useCart();
  const { hasItem: inCloset, addItem: addToCloset } = useCloset();
  const { items: myIngredients } = useMyIngredients();
  const { user: persona } = useAuth();
  const { skinType: diagType } = useDiagnosis();
  const skinType: SkinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;
  const { profile } = useUserProfile();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('info');
  const [showAll, setShowAll] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [ingredientOpen, setIngredientOpen] = useState(true);
  const [reviews, setReviews] = useState<ReviewItem[]>(REVIEWS);
  const [likedReviewIds, setLikedReviewIds] = useState<Set<number>>(new Set());
  const [reviewTypeFilter, setReviewTypeFilter] = useState<'all' | 'photo' | 5 | 4 | 3 | 2 | 1>('all');
  const [reviewTypeOpen, setReviewTypeOpen] = useState(false);
  const [skinFilter, setSkinFilter] = useState<string | null>(null);
  const [skinFilterOpen, setSkinFilterOpen] = useState(false);
  const [reviewWriteOpen, setReviewWriteOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReviewItem | null>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const groups = useMemo(() => (product ? groupIngredients(product.ingredients) : []), [product]);
  const total = countIngredients(groups);
  const hasLabels = groups.some((g) => g.label !== null);

  const asProduct: Product | null = useMemo(
    () =>
      product
        ? {
            id: product.id,
            name: product.name,
            brand: product.brand,
            category: product.category,
            imageUrl: product.imageUrl,
            price: product.price,
            rating: product.rating,
            reviewCount: product.reviewCount,
          }
        : null,
    [product],
  );

  useEffect(() => {
    if (asProduct) addRecentlyViewed(asProduct);
  }, [asProduct, addRecentlyViewed]);

  const liked = asProduct ? isLiked(asProduct.id) : false;

  // 추천 카드 풀 — 실제 유사도 데이터가 없으면(백엔드 미기동) 인기 상품 풀로 대신한다
  const poolExcl = pool.products.filter((p) => p.id !== productId);
  const similarCards = similar.alternatives.length > 0 ? similar.alternatives : poolExcl.slice(0, 6);
  const alsoViewedCards = poolExcl.slice(6, 12).length > 0 ? poolExcl.slice(6, 12) : poolExcl.slice(0, 6);

  // ── 성분 구성 위험도(1~10) — 큐레이션된 소수 성분만 등급이 있고 나머지는 "등급 미정" ──
  const riskBuckets = useMemo(() => {
    const buckets = { low: 0, mid: 0, high: 0, unrated: 0 };
    for (const ing of product?.ingredients ?? []) {
      const known = MOCK_INGREDIENTS.find((m) => m.name === ing.name);
      const ewg = known?.ewg;
      if (ewg == null) buckets.unrated += 1;
      else if (ewg <= 2) buckets.low += 1;
      else if (ewg <= 6) buckets.mid += 1;
      else buckets.high += 1;
    }
    return buckets;
  }, [product]);
  const riskTotal = Math.max(1, total);
  const cautionCount = (product?.ingredients ?? []).filter((i) => CAUTION_INGREDIENTS.includes(i.name)).length;
  const allergenCount = (product?.ingredients ?? []).filter((i) => ALLERGEN_INGREDIENTS.includes(i.name)).length;
  const myInterestCount = (product?.ingredients ?? []).filter((i) =>
    myIngredients.some((m) => i.name.includes(m)),
  ).length;

  // ── 피부타입 매칭 분석 — 실제 RESULT_DETAILS 문구를 그대로 활용 ──
  const skinChar = skinTypes.find((s) => s.id === skinType) ?? skinTypes[0];
  const detail = RESULT_DETAILS[skinType];
  const matchPct = computeMatchPct(productId, skinType);
  const matchTags = Array.from(new Set(detail.ingredients.map((i) => i.tag))).slice(0, 2);
  const hasFragrance = (product?.ingredients ?? []).some((i) => i.name.includes('향료'));
  if (!hasFragrance) matchTags.push('저자극');

  const REVIEW_TYPE_OPTIONS: { key: typeof reviewTypeFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'photo', label: '사진 포함' },
    { key: 5, label: '별점 5점' },
    { key: 4, label: '별점 4점' },
    { key: 3, label: '별점 3점' },
    { key: 2, label: '별점 2점' },
    { key: 1, label: '별점 1점' },
  ];
  const SKIN_FILTER_OPTIONS = Object.values(SKIN_TYPE_META).map((m) => m.label);

  const visibleReviews = reviews.filter((r) => {
    if (skinFilter && !r.skinTags.includes(skinFilter)) return false;
    if (reviewTypeFilter === 'photo' && r.photos <= 0) return false;
    if (typeof reviewTypeFilter === 'number' && r.rating !== reviewTypeFilter) return false;
    return true;
  });

  const toggleReviewLike = (id: number) => {
    setLikedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, likeCount: r.likeCount + (likedReviewIds.has(id) ? -1 : 1) } : r)));
  };

  const submitNewReview = (draft: ReviewDraft) => {
    setReviews((prev) => [
      {
        id: Date.now(),
        author: profile.nickname,
        skinTags: [skinChar.label],
        rating: draft.rating,
        date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\.$/, ''),
        channel: '온라인',
        option: REVIEWS[0]?.option ?? '',
        photos: draft.photos.length,
        body: draft.text,
        likeCount: 0,
      },
      ...prev,
    ]);
    setReviewWriteOpen(false);
    showToast('후기가 등록되었어요');
  };

  return (
    <div
      className="flex min-h-dvh flex-col bg-surface-warm font-sans text-oy-text"
      style={{ paddingBottom: 'calc(76px + var(--safe-bottom))' }}
    >
      {/* ── 헤더 52px ───────────────────────── */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center gap-4 bg-surface-warm px-4">
        <button type="button" onClick={() => navigate(-1)} aria-label="뒤로" className="active:scale-90">
          <Icon name="arrow_back" size={24} />
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => navigate('/search')} aria-label="검색" className="active:scale-90">
          <Icon name="search" size={22} />
        </button>
        <button type="button" onClick={() => navigate('/cart')} aria-label="장바구니" className="relative active:scale-90">
          <CartIcon size={22} />
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[15px] h-[15px] px-1 items-center justify-center rounded-full bg-oy-red text-[9px] font-extrabold text-white">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
      </header>

      {loading && <DetailSkeleton />}

      {!loading && notFound && (
        <EmptyState message="제품을 찾을 수 없습니다. 삭제되었거나 잘못된 주소예요." />
      )}

      {!loading && !notFound && error && <EmptyState message={error} onRetry={reload} />}

      {!loading && product && (
        <main>
          {/* ── 대표 이미지 ─────────────────────────── */}
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="aspect-square w-full bg-oy-chip object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-oy-chip text-5xl">🧴</div>
          )}

          {/* ── 브랜드 · 액션 아이콘 · 이름 · 가격 ─────────────────── */}
          <Section>
            <div className="flex items-center justify-between">
              <p className="text-sm text-oy-sub">{product.brand}</p>
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    const already = inCloset(product.id);
                    if (!already) {
                      addToCloset({
                        id: product.id,
                        brand: product.brand,
                        name: product.name,
                        category: product.category,
                        price: product.price,
                        imageUrl: product.imageUrl,
                        addedVia: 'search',
                      });
                    }
                    showToast(already ? '이미 내 화장대에 있어요' : '내 화장대에 추가했어요', {
                      label: '내 화장대로 이동하기',
                      onClick: () => navigate('/closet'),
                    });
                  }}
                  aria-label="내 화장대에 추가"
                  className={`active:scale-90 ${inCloset(product.id) ? 'text-primary-dark' : 'text-oy-text'}`}
                >
                  <ScrapIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!asProduct) return;
                    const wasLiked = liked;
                    toggleLike(asProduct);
                    showToast(wasLiked ? '찜을 해제했어요' : '찜 목록에 추가했어요');
                  }}
                  aria-label={liked ? '찜 해제' : '찜하기'}
                  className={`active:scale-90 ${liked ? 'text-accent' : 'text-oy-text'}`}
                >
                  <HeartIcon size={20} filled={liked} />
                </button>
                <button type="button" onClick={() => setShareOpen(true)} aria-label="공유" className="active:scale-90">
                  <ShareIcon />
                </button>
              </div>
            </div>

            <h1 className="mt-1.5 text-xl font-bold leading-snug">{product.name}</h1>

            {product.originalPrice && (
              <p className="mt-3 text-sm text-oy-sub line-through">{product.originalPrice.toLocaleString()}원</p>
            )}
            <p className="mt-0.5 flex items-baseline gap-1.5">
              {product.discountRate && (
                <span className="text-2xl font-extrabold text-accent">{product.discountRate}%</span>
              )}
              <span className="text-2xl font-extrabold">
                {product.price.toLocaleString()}
                <span className="text-lg font-bold">원{!product.discountRate && '~'}</span>
              </span>
            </p>

            {product.rating != null && (
              <p className="mt-2 flex items-center gap-1.5 text-sm">
                <span className="text-star">
                  <Icon name="star" size={14} />
                </span>
                <span className="font-semibold">{product.rating.toFixed(1)}</span>
                {product.reviewCount != null && (
                  <span className="text-oy-sub">리뷰 {product.reviewCount.toLocaleString()}</span>
                )}
              </p>
            )}
          </Section>

          {/* ── 탭 ─────────────────────────── */}
          <div className="sticky top-[52px] z-20 flex bg-surface-warm border-b border-oy-line px-4">
            {([['info', '상품정보'], ['review', '리뷰/성분']] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`mr-6 py-3 text-sm border-b-2 transition-colors ${
                  tab === key ? 'font-extrabold text-oy-text border-oy-text' : 'font-medium text-oy-sub border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'info' ? (
            <>
              <Section>
                <div className="rounded-xl bg-white min-h-[280px] flex items-center justify-center overflow-hidden">
                  {product.imageUrl && (
                    <img src={product.imageUrl} alt="" className="w-full h-full object-cover opacity-90" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIntroOpen((v) => !v)}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-oy-line bg-white text-sm font-medium active:scale-[.99]"
                >
                  상품 소개 더보기
                  <span className={introOpen ? 'rotate-180' : ''}>
                    <Icon name="keyboard_arrow_down" size={18} />
                  </span>
                </button>

                {introOpen && (
                  <dl className="mt-3 overflow-hidden rounded-xl bg-white">
                    {[
                      ['용량', product.volume],
                      ['제조국', product.country],
                      ['제조사', product.manufacturer],
                      ['사용기한', product.expiry],
                      ['보고번호', product.reportNo],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="flex gap-3 border-b border-oy-line px-4 py-3 last:border-b-0">
                          <dt className="w-16 shrink-0 text-sm text-oy-sub">{label}</dt>
                          <dd className="flex-1 break-words text-sm leading-relaxed">{value}</dd>
                        </div>
                      ))}
                  </dl>
                )}
              </Section>

              <Divider />

              {similarCards.length > 0 && (
                <Section>
                  <OySectionHeader title="비슷한 상품" />
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
                    {similarCards.map((p) => (
                      <ProductCardV key={p.id} product={p} />
                    ))}
                  </div>
                </Section>
              )}

              <Divider />

              {alsoViewedCards.length > 0 && (
                <Section>
                  <OySectionHeader title="다른 고객이 함께 본 상품" />
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
                    {alsoViewedCards.map((p) => (
                      <ProductCardV key={p.id} product={p} />
                    ))}
                  </div>
                </Section>
              )}
            </>
          ) : (
            <>
              {/* ── AI 타입별 매칭 분석 ─────────────────────────── */}
              <Section>
                <p className="text-[15px] font-extrabold text-oy-text mb-3">타입별 AI 분석</p>
                <div className="rounded-2xl bg-white border border-oy-line p-4">
                  <div className="flex items-center gap-3">
                    <img src={skinChar.image} alt="" className="h-12 w-12 shrink-0 object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-oy-text truncate">
                        {skinChar.label} 타입의 매칭율
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-extrabold text-accent">{matchPct}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-oy-chip overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#FFB199] to-[#FF6B6B]"
                      style={{ width: `${matchPct}%` }}
                    />
                  </div>

                  <div className="mt-3 rounded-xl bg-surface-warm p-3">
                    <p className="text-[13px] leading-relaxed text-oy-text">
                      내 피부와 찰떡이에요!! {detail.taglineLead} {detail.taglineRest}
                      <b>{detail.taglineHighlight}</b>
                      {detail.taglineTail}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {matchTags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-md bg-primary-light px-2 py-1 text-xs font-bold text-primary"
                      >
                        <Icon name="check" size={10} />
                        {t}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAnalysisOpen(true)}
                    className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-oy-line text-xs font-medium active:scale-[.99]"
                  >
                    분석 더보기
                    <Icon name="keyboard_arrow_down" size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/alternatives?seed=${product.id}&from=detail`)}
                  className="mt-3 flex w-full items-center gap-2.5 rounded-xl bg-white border border-oy-line px-4 py-3.5"
                >
                  <Icon name="search" size={16} className="shrink-0 text-oy-sub" />
                  <span className="flex-1 text-left text-sm font-semibold text-oy-text">이 제품의 성분 비슷한템 찾기</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </Section>

              <Divider />

              {/* ── 성분 구성 ─────────────────────────── */}
              <Section>
                <button
                  type="button"
                  onClick={() => setIngredientOpen((v) => !v)}
                  className="flex w-full items-center justify-between"
                >
                  <span className="text-[15px] font-extrabold text-oy-text">성분 구성</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={ingredientOpen ? '' : 'rotate-180'}>
                    <path d="M6 15l6-6 6 6" stroke="#17171C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {ingredientOpen && (
                  <>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-oy-sub flex-wrap">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />1-2 낮은 위험</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />3-6 중간 위험</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />7-10 높은 위험</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-oy-line" />등급 미정</span>
                    </div>
                    <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-oy-line">
                      {riskBuckets.low > 0 && <div className="bg-primary h-full" style={{ width: `${(riskBuckets.low / riskTotal) * 100}%` }} />}
                      {riskBuckets.mid > 0 && <div className="bg-warning h-full" style={{ width: `${(riskBuckets.mid / riskTotal) * 100}%` }} />}
                      {riskBuckets.high > 0 && <div className="bg-accent h-full" style={{ width: `${(riskBuckets.high / riskTotal) * 100}%` }} />}
                    </div>

                    <p className="mt-4 text-[15px] font-extrabold text-oy-text">전체 성분 {total}개</p>
                    <div className="mt-2 rounded-xl bg-white border border-oy-line">
                      {[
                        ['20', '20가지 주의성분', cautionCount],
                        ['AL', '알레르기 주의성분', allergenCount],
                        ['👍', '내 관심 성분', myInterestCount],
                        ['👎', '내 피할 성분', 0],
                      ].map(([badge, label, count], i, arr) => (
                        <div key={label} className={`flex items-center gap-2.5 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-oy-line' : ''}`}>
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-oy-chip text-[11px] font-bold text-oy-sub">
                            {badge}
                          </span>
                          <span className="flex-1 text-sm text-oy-text">{label}</span>
                          <span className="text-sm font-semibold text-oy-sub">{count}개</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-oy-sub">
                      관심 있는 성분이나 피하고 싶은 성분을 전성분 목록에서 추가할 수 있어요. 즐겨찾기 해두면 성분 구성에서 편하게 확인할 수 있어요.
                    </p>

                    {total === 0 ? (
                      <p className="mt-4 rounded-xl bg-white px-4 py-6 text-center text-sm text-oy-sub">전성분 정보가 없습니다.</p>
                    ) : (
                      <div className="mt-4 flex flex-col gap-5">
                        {groups.map((group, gi) => {
                          const items = showAll ? group.items : group.items.slice(0, 20);
                          return (
                            <div key={group.label ?? `g${gi}`}>
                              {group.label && (
                                <h3 className="mb-2 text-sm font-bold text-oy-text">
                                  {group.label}
                                  <span className="ml-1.5 font-normal text-oy-sub">{group.items.length}개</span>
                                  {hasLabels && ''}
                                </h3>
                              )}
                              <ul className="flex flex-wrap gap-1.5">
                                {items.map((ing, ii) => (
                                  <li key={`${gi}-${ii}-${ing.id}`} className="igr-chip neutral" title={ing.nameEn ?? undefined}>
                                    {ing.name}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                        {total > 20 && (
                          <button
                            type="button"
                            onClick={() => setShowAll((v) => !v)}
                            className="flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-oy-line bg-white text-sm font-medium active:scale-[.99]"
                          >
                            {showAll ? '접기' : `전체 ${total}개 보기`}
                            <span className={showAll ? 'rotate-180' : ''}>
                              <Icon name="keyboard_arrow_down" size={18} />
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Section>

              <Divider />

              {/* ── 리뷰 ─────────────────────────── */}
              <Section>
                <p className="text-[19px] font-extrabold text-oy-text">리뷰 {(product.reviewCount ?? REVIEWS.length).toLocaleString()}</p>
                <div className="mt-3 flex items-center gap-4">
                  <div className="text-center shrink-0">
                    <p className="text-3xl font-extrabold text-oy-text">{(product.rating ?? 4.7).toFixed(2)}</p>
                    <p className="mt-0.5 text-star text-sm">★★★★★</p>
                  </div>
                  <div className="flex flex-1 items-end gap-2.5 h-14">
                    {RATING_DISTRIBUTION.map((pct, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className="w-full rounded-t"
                            style={{ height: `${Math.max(pct, 3)}%`, background: i === 0 ? 'var(--warning, #FF9500)' : '#EEEEEE' }}
                          />
                        </div>
                        <span className="text-[10px] text-oy-sub">{5 - i}점</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setReviewTypeOpen((v) => !v); setSkinFilterOpen(false); }}
                      className="inline-flex items-center gap-1 rounded-full border border-oy-line px-3 h-8 text-xs font-medium text-oy-text"
                    >
                      {REVIEW_TYPE_OPTIONS.find((o) => o.key === reviewTypeFilter)?.label ?? '리뷰 유형'}
                      <Icon name="keyboard_arrow_down" size={14} />
                    </button>
                    {reviewTypeOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1.5 w-32 overflow-hidden rounded-xl border border-oy-line bg-white shadow-lg">
                        {REVIEW_TYPE_OPTIONS.map((o) => (
                          <button
                            key={String(o.key)}
                            onClick={() => { setReviewTypeFilter(o.key); setReviewTypeOpen(false); }}
                            className={`block w-full px-3.5 py-2.5 text-left text-xs ${
                              reviewTypeFilter === o.key ? 'font-bold text-primary-dark' : 'text-oy-text'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setSkinFilterOpen((v) => !v); setReviewTypeOpen(false); }}
                      className="inline-flex items-center gap-1 rounded-full border border-oy-line px-3 h-8 text-xs font-medium text-oy-text"
                    >
                      {skinFilter ?? '피부 필터'}
                      <Icon name="keyboard_arrow_down" size={14} />
                    </button>
                    {skinFilterOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1.5 w-40 max-h-64 overflow-y-auto rounded-xl border border-oy-line bg-white shadow-lg">
                        <button
                          onClick={() => { setSkinFilter(null); setSkinFilterOpen(false); }}
                          className={`block w-full border-b border-oy-line px-3.5 py-2.5 text-left text-xs ${!skinFilter ? 'font-bold text-primary-dark' : 'text-oy-text'}`}
                        >
                          전체
                        </button>
                        {SKIN_FILTER_OPTIONS.map((label) => (
                          <button
                            key={label}
                            onClick={() => { setSkinFilter(label); setSkinFilterOpen(false); }}
                            className={`block w-full px-3.5 py-2.5 text-left text-xs ${skinFilter === label ? 'font-bold text-primary-dark' : 'text-oy-text'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setReviewWriteOpen(true)}
                    className="ml-auto text-xs font-semibold text-oy-sub underline underline-offset-2"
                  >
                    리뷰 쓰기
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSkinFilter(skinFilter === skinChar.label ? null : skinChar.label)}
                  className="mt-3 flex items-center gap-2.5"
                >
                  <span
                    role="switch"
                    aria-checked={skinFilter === skinChar.label}
                    className="relative h-[24px] w-[40px] shrink-0 rounded-full transition-colors"
                    style={{ background: skinFilter === skinChar.label ? 'var(--primary)' : '#E8EAED' }}
                  >
                    <span
                      className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all"
                      style={{ left: skinFilter === skinChar.label ? '19px' : '3px' }}
                    />
                  </span>
                  <span className="text-sm text-oy-text">내 피부 맞춤 ({skinChar.label})</span>
                </button>

                <div className="mt-4 grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPhotoViewerOpen(true)}
                      className="relative aspect-square rounded-lg bg-oy-chip overflow-hidden"
                    >
                      {i === 7 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white">
                          더보기
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-col">
                  {visibleReviews.map((r, i) => (
                    <div key={r.id} className={`py-4 ${i < visibleReviews.length - 1 ? 'border-b border-oy-line' : ''}`}>
                      <p className="text-sm font-bold text-oy-text">{r.author}</p>
                      <p className="mt-0.5 text-xs text-oy-sub">{r.skinTags.join(' · ')}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-oy-sub">
                        <span className="text-star">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                        <span>{r.date} | {r.channel}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-oy-sub">[옵션] {r.option}</p>
                      {r.photos > 0 && (
                        <div className="mt-2 flex gap-1.5">
                          {Array.from({ length: r.photos }, (_, pi) => (
                            <button key={pi} type="button" onClick={() => setPhotoViewerOpen(true)} className="h-16 w-16 rounded-lg bg-oy-chip" />
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-sm leading-relaxed text-oy-text">{r.body}</p>
                      <p className="mt-2 text-[11px] text-oy-sub leading-relaxed">
                        ⓘ 해당 리뷰는 성분과 내용물이 동일한 상품에 작성된 것으로, 용량, 구성(1+1), 증정 등), 패키지 등에 차이가 있을 수 있습니다.
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <button type="button" onClick={() => setReportTarget(r)} className="text-xs text-oy-sub underline underline-offset-2">
                          신고하기
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleReviewLike(r.id)}
                          className={`inline-flex items-center gap-1 text-xs ${likedReviewIds.has(r.id) ? 'font-bold text-primary-dark' : 'text-oy-sub'}`}
                        >
                          👍 {r.likeCount}
                        </button>
                      </div>
                    </div>
                  ))}
                  {visibleReviews.length === 0 && (
                    <p className="py-8 text-center text-sm text-oy-sub">조건에 맞는 리뷰가 아직 없어요.</p>
                  )}
                </div>
              </Section>
            </>
          )}

          {tab === 'info' && (
            <>
              <Divider />
              <ComingSoon
                title="내 피부와의 궁합"
                reason="피부타입 진단을 연결하면 이 제품이 내 피부에 맞는지 알려드려요."
              />
            </>
          )}
        </main>
      )}

      {/* ── 하단 고정 CTA ─────────────────────────── */}
      {!loading && product && (
        <div
          className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[430px] -translate-x-1/2 gap-2 border-t border-oy-line bg-white px-4 pt-3"
          style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
        >
          <button
            type="button"
            onClick={() => {
              addToCart({ id: product.id, name: product.name, brand: product.brand, price: product.price, imageUrl: product.imageUrl });
              showToast('장바구니에 담았어요', { label: '장바구니로 이동하기', onClick: () => navigate('/cart') });
            }}
            className="h-[46px] flex-1 rounded-xl border border-primary text-sm font-bold text-primary active:scale-[.98]"
          >
            {inCart(product.id) ? '장바구니에 담김' : '장바구니'}
          </button>
          <button
            type="button"
            onClick={() => {
              addToCart({ id: product.id, name: product.name, brand: product.brand, price: product.price, imageUrl: product.imageUrl });
              navigate('/cart');
            }}
            className="flex h-[46px] flex-[2] items-center justify-center rounded-xl bg-primary text-sm font-bold text-white active:scale-[.98]"
          >
            바로 구매
          </button>
        </div>
      )}

      {/* ── 분석 더보기 모달 ─────────────────────────── */}
      {analysisOpen && product && (
        <AnalysisPopup
          skinType={skinChar.label}
          matchPercent={matchPct}
          onClose={() => setAnalysisOpen(false)}
        />
      )}

      {/* ── 리뷰 쓰기 ─────────────────────────── */}
      {product && (
        <ReviewWriteSheet
          open={reviewWriteOpen}
          onClose={() => setReviewWriteOpen(false)}
          onSubmit={submitNewReview}
          productLabel={`${product.brand} · ${product.name}`}
        />
      )}

      {/* ── 신고하기 ─────────────────────────── */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8" onClick={() => setReportTarget(null)}>
          <div className="w-full max-w-[300px] rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-bold text-oy-text">리뷰 신고하기</p>
            <p className="mt-1 text-xs text-oy-sub">{reportTarget.author}님의 리뷰를 신고할게요.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {['광고·홍보성 리뷰', '욕설·비방', '허위·과장 정보', '기타'].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    setReportTarget(null);
                    showToast('신고가 접수되었어요');
                  }}
                  className="rounded-lg border border-oy-line px-3.5 py-2.5 text-left text-sm text-oy-text active:bg-oy-chip"
                >
                  {reason}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReportTarget(null)}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-oy-sub"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ── 리뷰 사진 뷰어 (아직 실제 사진은 없음) ─────────────────────────── */}
      {photoViewerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={() => setPhotoViewerOpen(false)}>
          <div className="flex h-[70vw] max-h-[360px] w-[70vw] max-w-[360px] items-center justify-center rounded-2xl bg-white/10 text-5xl">
            🖼️
          </div>
          <button
            type="button"
            onClick={() => setPhotoViewerOpen(false)}
            aria-label="닫기"
            className="absolute right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90"
            style={{ top: 'calc(var(--safe-top) + 16px)' }}
          >
            <Icon name="close" size={22} />
          </button>
        </div>
      )}

      {/* ── 공유 바텀시트 ─────────────────────────── */}
      {shareOpen && product && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45" onClick={() => setShareOpen(false)}>
          <div
            className="rounded-t-3xl bg-white px-5 pt-4"
            style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-oy-line" />
            <p className="mb-4 text-center text-[15px] font-bold text-oy-text">공유하기</p>
            <div className="grid grid-cols-4 gap-2 pb-2">
              {[
                { emoji: '🎁', label: '선물하기', onClick: () => { setShareOpen(false); navigate(`/gift/${product.id}`); } },
                {
                  emoji: '🔗',
                  label: '링크 공유',
                  onClick: () => {
                    setShareOpen(false);
                    navigator.clipboard?.writeText(window.location.href).catch(() => {});
                    showToast('링크가 복사되었어요');
                  },
                },
                { emoji: '💬', label: '카카오톡 공유', onClick: () => { setShareOpen(false); showToast('준비 중이에요'); } },
                { emoji: '👥', label: '같이 공유', onClick: () => { setShareOpen(false); showToast('준비 중이에요'); } },
              ].map((opt) => (
                <button key={opt.label} type="button" onClick={opt.onClick} className="flex flex-col items-center gap-1.5">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-oy-chip text-2xl">{opt.emoji}</span>
                  <span className="text-xs font-medium text-oy-text">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
