import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/category/Icon';
import { OySectionHeader } from '../../components/home/oy/OySectionHeader';
import { useLikedProducts } from '../../context/liked';
import { useCart } from '../../context/cart';
import { HeaderActions } from '../../components/layout/HeaderActions';
import { useProduct } from '../../hooks/useProduct';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import { AlternativeCarousel } from '../../components/home/oy/sections/AlternativeCarousel';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { Product } from '../../types';
import { countIngredients, groupIngredients, ingredientNotes } from '../../utils/ingredients';
import { readSimilarTo } from '../../utils/alternatives';
import { skinTypes } from '../../data/skinTypes';
import type { ProductIngredient } from '../../api/products';
import { ProductReviews } from '../../components/product/ProductReviews';
import { IngredientSheet } from '../../components/product/IngredientSheet';
import { useMyIngredients } from '../../hooks/useMyIngredients';
import { SkinFitCard } from '../../components/product/SkinFitCard';
import { OptionPicker } from '../../components/product/OptionPicker';
import { KEEP_SCROLL } from '../../components/layout/keepScroll';
import { useSkinType } from '../../hooks/useSkinType';

/** 처음에 펼쳐 보여줄 성분 개수. 제품당 중앙값이 37개라 20개면 절반쯤 보입니다. */
const PREVIEW_COUNT = 20;

/**
 * 성분 칩 색.
 *
 * grade가 없는 성분은 **중립**으로 둡니다. 분류 근거가 없다는 뜻이지
 * 안전하다는 뜻이 아니므로, 초록으로 칠해 안심시키면 안 됩니다.
 * 추천(key)은 내 피부타입을 알 때만 나옵니다 — 진단 전에는 모두 중립이고 주의(warn)만 보입니다.
 */
function chipClass(grade: ProductIngredient['grade'], highlighted: boolean): string {
  const base = grade === 'warn' ? 'warn' : grade === 'key' ? '' : 'neutral';
  return highlighted ? `${base} hl` : base;
}

/** 칩에 마우스를 올렸을 때의 설명. 서버 판정의 근거를 말로 옮깁니다. */
function chipTitle(ing: ProductIngredient, skinTypeLabel?: string | null): string {
  const head = ing.grade === 'warn' ? '주의 성분' : ing.grade === 'key' ? '추천 성분' : null;
  return [ing.nameEn, head, ...ingredientNotes(ing, skinTypeLabel)].filter(Boolean).join(' · ');
}

/** 섹션 사이 굵은 구분 띠 — 홈과 같은 리듬 */
function Divider() {
  return <div className="h-2 bg-oy-line" />;
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="px-4 py-5">{children}</section>;
}

/**
 * 아직 데이터가 없는 섹션.
 *
 * 빈 회색 상자 대신 '왜' 비어 있는지 적습니다. 미구현과 의도된 순서를
 * 구분할 수 있어야 리뷰에서도 심사에서도 오해가 없습니다.
 */
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
function EmptyState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
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

export default function ProductDetailPage() {
  const navigate = useNavigate();
  const { requireLogin } = useLoginPrompt();
  const { id } = useParams();
  const productId = Number(id);
  // 홈 '내 화장대와 비슷한 추천' 카드에서 들어왔으면 어느 제품과 비슷한지 알려 준다
  const similarTo = readSimilarTo(useLocation().state, productId);
  // 전성분의 추천·주의 분류는 내 피부타입 기준이다. 타입을 알 때까지 요청을 미뤄 두 번 받지 않는다.
  const { skinType, loading: typeLoading } = useSkinType();
  const { product, loading, error, notFound, reload } = useProduct(productId, {
    skinType,
    wait: typeLoading,
  });
  const skinTypeLabel = skinTypes.find((t) => t.id === skinType)?.label ?? null;

  // 옵션형 묶음의 원본(옛 링크·화장대·스캔 기록)이면 첫 옵션으로 보낸다. 원본의 전성분은 모든 옵션의 합집합이라 보여 줄 수 없다.
  const firstOptionId = product?.composition === 'optgroup' ? product.options?.[0]?.id : undefined;
  useEffect(() => {
    if (firstOptionId !== undefined) navigate(`/detail/${firstOptionId}`, { replace: true, state: KEEP_SCROLL });
  }, [firstOptionId, navigate]);
  // 옵션을 고르면 그 옵션의 상세로 바꾼다(전성분·궁합·대체품이 그 옵션 기준으로 바뀐다). 스크롤은 그대로 둔다.
  const pickOption = (id: number) => navigate(`/detail/${id}`, { replace: true, state: KEEP_SCROLL });
  // 대체품. useProduct와 같은 렌더에서 함께 나가므로 순차 대기가 없다.
  // 기준제품이 도착하면 절약액이 뒤이어 계산된다(재요청 없음).
  const similar = useSimilarProducts(productId, {
    limit: 10,
    seedProduct: product,
    fitFor: skinType ?? undefined,
  });

  const { addRecentlyViewed } = useRecentlyViewed();
  const { isLiked, toggleLike } = useLikedProducts();
  const { addToCart, inCart } = useCart();
  const [showAll, setShowAll] = useState(false);
  // 궁합 카드의 이유를 눌렀을 때 강조할 성분(전성분 표기 순서). 칩 key의 id는 겹칠 수 있어 position으로 센다.
  const [highlight, setHighlight] = useState<ReadonlySet<number>>(new Set());
  const ingredientsRef = useRef<HTMLElement | null>(null);
  const onReasonClick = useCallback((positions: number[]) => {
    setHighlight(new Set(positions));
    setShowAll(true); // 접힌 구간(21번째~)에 있는 성분도 보이게
    requestAnimationFrame(() =>
      ingredientsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, []);
  // 잠깐 보여 주고 거둔다
  useEffect(() => {
    if (highlight.size === 0) return;
    const t = setTimeout(() => setHighlight(new Set()), 6000);
    return () => clearTimeout(t);
  }, [highlight]);
  // 설명 시트에 띄울 성분. 시트의 useEffect가 onClose에 의존하므로 참조를 고정한다.
  const [selected, setSelected] = useState<ProductIngredient | null>(null);
  const myIngredients = useMyIngredients();
  const closeSheet = useCallback(() => setSelected(null), []);

  // 전성분은 라벨을 분리해 묶음으로 만든다. 기획세트가 아니면 묶음 1개다.
  const groups = useMemo(
    () => (product ? groupIngredients(product.ingredients) : []),
    [product],
  );
  const total = countIngredients(groups);
  const hasLabels = groups.some((g) => g.label !== null);
  // 이 제품의 전성분 중 내가 마이 성분으로 담아 둔 것의 개수(같은 성분이 묶음마다 나와도 한 번만 센다)
  const mineCount = useMemo(
    () => new Set(groups.flatMap((g) => g.items.map((i) => i.id)).filter((id) => myIngredients.has(id))).size,
    [groups, myIngredients],
  );

  // 등급별 개수. 근거가 있는 것만 세고, 분류 미정은 세지 않는다.
  const gradeCount = useMemo(() => {
    const all = groups.flatMap((g) => g.items);
    return {
      key: all.filter((i) => i.grade === 'key').length,
      warn: all.filter((i) => i.grade === 'warn').length,
      allergen: all.filter((i) => i.isAllergen).length,
    };
  }, [groups]);

  // 찜·최근 본 상품은 목록 카드와 같은 Product 모양을 요구한다.
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
    if (asProduct) addRecentlyViewed(asProduct, product?.optionParentId);
  }, [asProduct, product?.optionParentId, addRecentlyViewed]);

  const liked = asProduct ? isLiked(asProduct.id) : false;

  return (
    <div
      className="flex min-h-dvh flex-col bg-surface-warm font-sans text-oy-text"
      style={{ paddingBottom: 'calc(76px + var(--safe-bottom))' }}
    >
      {/* ── 헤더 52px (7-1 규격) ───────────────────────── */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center gap-4 bg-surface-warm px-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="뒤로"
          className="active:scale-90"
        >
          <Icon name="arrow_back" size={24} />
        </button>
        <div className="flex-1" />
        <HeaderActions showHome />
      </header>

      {loading && <DetailSkeleton />}

      {!loading && notFound && (
        <EmptyState message="제품을 찾을 수 없습니다. 삭제되었거나 잘못된 주소예요." />
      )}

      {!loading && !notFound && error && (
        <EmptyState message={error} onRetry={reload} />
      )}

      {!loading && product && (
        <main>
          {/* ── 대표 이미지 ─────────────────────────── */}
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="aspect-square w-full bg-oy-chip object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-oy-chip text-5xl">
              🧴
            </div>
          )}

          {/* ── 브랜드 · 이름 · 가격 ─────────────────── */}
          <Section>
            <p className="text-sm text-oy-sub">{product.brand}</p>
            <h1 className="mt-1.5 text-xl font-bold leading-snug">
              {product.name}
            </h1>
            {product.options && product.options.length > 1 && (
              <div className="mt-3">
                <OptionPicker options={product.options} currentId={product.id} onPick={pickOption} />
              </div>
            )}

            {/* 할인율·정가는 크롤러가 수집하지 않아 표시하지 않는다 */}
            <p className="mt-3 text-2xl font-extrabold">
              {product.price.toLocaleString()}
              <span className="text-lg font-bold">원</span>
            </p>

            {product.rating != null && (
              <p className="mt-2 flex items-center gap-1.5 text-sm">
                <span className="text-star">
                  <Icon name="star" size={14} />
                </span>
                <span className="font-semibold">{product.rating.toFixed(1)}</span>
                {!!product.reviewCount && (
                  <span className="text-oy-sub">
                    리뷰 {product.reviewCount.toLocaleString()}
                  </span>
                )}
              </p>
            )}

            <span className="mt-3 inline-block rounded-full bg-oy-chip px-2.5 py-1 text-xs text-oy-sub">
              {product.category}
            </span>

            {similarTo && (
              <button
                type="button"
                onClick={() => navigate(`/compare?a=${similarTo.seedId}&b=${productId}`, { state: { similarTo } })}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-primary-light px-3.5 py-2.5 text-left active:scale-[.99]"
              >
                <span className="min-w-0">
                  {/* 긴 제품명은 한 줄에서 자르고, 설명은 짧게 */}
                  <span className="block truncate text-sm font-bold text-primary">{similarTo.seedName}</span>
                  <span className="block text-xs text-oy-text">
                    내 화장대 제품과 성분 <b>{similarTo.score}%</b> 비슷해요
                  </span>
                  {similarTo.saving !== undefined && (
                    <span className="mt-0.5 block text-xs font-bold text-accent">
                      {similarTo.saving.toLocaleString()}원 더 저렴해요
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-bold text-primary">비교 ›</span>
              </button>
            )}
          </Section>

          <Divider />

          {/* ── 내 피부와의 궁합 — 전성분보다 먼저 ───────── */}
          <SkinFitCard productId={product.id} onReasonClick={onReasonClick} />
          {/* 성분 분석 — 기능 강도·핵심/주의 성분·전성분 해부도·내 피부 상태와 견주기·내 화장대와 견주기 */}
          <div className="-mt-2 px-4 pb-5">
            {/* 스와피 로고의 연한 물결 색(#9DCDB8) + 진한 물결 색(#2B6B52) 글자 */}
            <button
              type="button"
              onClick={() => navigate(`/analysis/${product.id}`)}
              className="flex w-full items-center gap-3 rounded-2xl bg-[#9DCDB8] px-4 py-3.5 text-left shadow-sm active:scale-[.98]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-[#2B6B52]">이 제품 성분 분석 보기</span>
                <span className="block text-xs text-[#2B6B52]/80">기능별 강도 · 핵심·주의 성분 · 전성분 해부도</span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#2B6B52]">분석 ›</span>
            </button>
          </div>
          <Divider />

          {/* ── 전성분 (핵심 섹션) ───────────────────── */}
          <section ref={ingredientsRef} className="px-4 py-5 scroll-mt-14">
            <OySectionHeader
              title={`전성분 ${total}개`}
              aside={
                mineCount > 0 && (
                  <span className="text-sm font-semibold text-primary" title="이 제품에 든 마이 성분" aria-label={`마이 성분 ${mineCount}개`}>
                    ♥ {mineCount}
                  </span>
                )
              }
            />
            <p className="-mt-1 mb-3 text-xs text-oy-sub">
              화장품 전성분은 함량이 많은 순서로 표기됩니다.
              {hasLabels && ' 이 상품은 구성품별로 나뉘어 있어요.'}
            </p>

            {(gradeCount.key > 0 || gradeCount.warn > 0 || !skinType) && (
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {gradeCount.key > 0 && (
                  <span className="text-primary">추천 성분 {gradeCount.key}개</span>
                )}
                {gradeCount.warn > 0 && (
                  <span className="text-accent">
                    주의 성분 {gradeCount.warn}개
                    {gradeCount.allergen > 0 && ` (알레르기 유발 착향제 ${gradeCount.allergen}개)`}
                  </span>
                )}
                <span className="text-oy-sub">
                  {skinType
                    ? `${skinTypeLabel ?? '내 피부타입'} 기준이에요`
                    : '피부타입 진단을 하면 추천 성분도 알려드려요'}
                </span>
              </div>
            )}

            {total === 0 ? (
              <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-oy-sub">
                전성분 정보가 없습니다.
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map((group, gi) => {
                  const items = showAll
                    ? group.items
                    : group.items.slice(0, PREVIEW_COUNT);
                  return (
                    <div key={group.label ?? `g${gi}`}>
                      {group.label && (
                        <h3 className="mb-2 text-sm font-bold text-oy-text">
                          {group.label}
                          <span className="ml-1.5 font-normal text-oy-sub">
                            {group.items.length}개
                          </span>
                        </h3>
                      )}
                      <ul className="flex flex-wrap gap-1.5">
                        {items.map((ing, ii) => (
                          <li
                            // 한 원본 항목이 라벨 기준으로 둘로 쪼개지면 id·position이
                            // 겹치므로 인덱스를 함께 쓴다.
                            key={`${gi}-${ii}-${ing.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelected(ing)}
                              className={`igr-chip ${chipClass(ing.grade, highlight.has(ing.position))} active:scale-95`}
                              title={chipTitle(ing, skinTypeLabel)}
                            >
                              {ing.name}
                              {ing.isAllergen && <span className="ml-1">⚠</span>}
                              {myIngredients.has(ing.id) && (
                                <span className="ml-1" title="마이 성분" aria-label="마이 성분">
                                  ♥
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {total > PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-4 flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-oy-line bg-white text-sm font-medium active:scale-[.99]"
              >
                {showAll ? '접기' : `전체 ${total}개 보기`}
                <span className={showAll ? 'rotate-180' : ''}>
                  <Icon name="keyboard_arrow_down" size={18} />
                </span>
              </button>
            )}
          </section>

          <Divider />

          {/* ── 상품정보제공고시 ─────────────────────── */}
          <Section>
            <OySectionHeader title="상품 정보" />
            <dl className="overflow-hidden rounded-xl bg-white">
              {[
                ['용량', product.volume],
                ['제조국', product.country],
                ['제조사', product.manufacturer],
                ['사용기한', product.expiry],
                ['보고번호', product.reportNo],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div
                    key={label}
                    className="flex gap-3 border-b border-oy-line px-4 py-3 last:border-b-0"
                  >
                    <dt className="w-16 shrink-0 text-sm text-oy-sub">{label}</dt>
                    <dd className="flex-1 break-words text-sm leading-relaxed">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          </Section>

          <Divider />

          {/* 성분이 비슷한 제품.
              로딩 중에는 그리지 않는다 — 페이지가 이미 DetailSkeleton을 거쳐
              왔고, 여기서 또 자리를 잡았다 놓으면 레이아웃이 뛴다. */}
          {!similar.loading &&
            (similar.alternatives.length > 0 ? (
              <AlternativeCarousel
                title="성분이 비슷한 제품"
                subtitle="전성분을 비교해 골랐어요"
                alternatives={similar.alternatives}
                onMore={() => navigate(`/alternatives?seed=${product.id}&from=detail`)}
              />
            ) : (
              <ComingSoon
                title="성분이 비슷한 제품"
                reason={
                  similar.error
                    ? '대체품을 불러오지 못했습니다.'
                    : '이 제품은 아직 성분 유사도 분석 전입니다.'
                }
              />
            ))}
          <Divider />
          <ProductReviews productId={product.id} />
        </main>
      )}

      {/* ── 하단 고정 CTA ─────────────────────────── */}
      {!loading && product && (
        <div
          className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[430px] -translate-x-1/2 gap-2 border-t border-oy-line bg-white px-4 pt-3"
          style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
        >
          {asProduct && (
            <button
              type="button"
              onClick={() => toggleLike(asProduct)}
              aria-label={liked ? '찜 해제' : '찜하기'}
              aria-pressed={liked}
              className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-oy-line active:scale-[.98] ${liked ? 'text-accent' : 'text-oy-text'}`}
            >
              <Icon name="favorite" size={22} />
            </button>
          )}
          <button
            type="button"
            aria-label="선물하기"
            onClick={() => {
              if (requireLogin('선물하기는 로그인하면 할 수 있어요')) return;
              navigate(`/gift/${product.id}`);
            }}
            className="h-[46px] w-[46px] shrink-0 rounded-xl border border-oy-line text-lg active:scale-[.98]"
          >
            🎁
          </button>
          <button
            type="button"
            onClick={() => {
              addToCart({
                id: product.id,
                name: product.name,
                brand: product.brand,
                price: product.price,
                imageUrl: product.imageUrl,
              });
              navigate('/cart');
            }}
            className="h-[46px] flex-1 rounded-xl border border-primary text-sm font-bold text-primary active:scale-[.98]"
          >
            {inCart(product.id) ? '장바구니에 담김' : '장바구니'}
          </button>
          <button
            type="button"
            onClick={() => {
              addToCart({
                id: product.id,
                name: product.name,
                brand: product.brand,
                price: product.price,
                imageUrl: product.imageUrl,
              });
              navigate('/cart');
            }}
            className="flex h-[46px] flex-[2] items-center justify-center rounded-xl bg-primary text-sm font-bold text-white active:scale-[.98]"
          >
            바로 구매
          </button>
        </div>
      )}

      <IngredientSheet
        ingredient={selected}
        onClose={closeSheet}
        skinTypeLabel={skinTypeLabel}
        isMine={selected !== null && myIngredients.has(selected.id)}
      />
    </div>
  );
}
