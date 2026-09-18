import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/category/Icon';
import { OySectionHeader } from '../../components/home/oy/OySectionHeader';
import { useLikedProducts } from '../../context/LikedProductsContext';
import { useCart } from '../../context/CartContext';
import { useProduct } from '../../hooks/useProduct';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import { AlternativeCarousel } from '../../components/home/oy/sections/AlternativeCarousel';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { Product } from '../../types';
import { countIngredients, groupIngredients } from '../../utils/ingredients';

/** 처음에 펼쳐 보여줄 성분 개수. 제품당 중앙값이 37개라 20개면 절반쯤 보입니다. */
const PREVIEW_COUNT = 20;

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
  const { id } = useParams();
  const productId = Number(id);
  const { product, loading, error, notFound, reload } = useProduct(productId);
  // 대체품. useProduct와 같은 렌더에서 함께 나가므로 순차 대기가 없다.
  // 기준제품이 도착하면 절약액이 뒤이어 계산된다(재요청 없음).
  const similar = useSimilarProducts(productId, { limit: 10, seedProduct: product });

  const { addRecentlyViewed } = useRecentlyViewed();
  const { isLiked, toggleLike } = useLikedProducts();
  const { addToCart, inCart } = useCart();
  const [showAll, setShowAll] = useState(false);

  // 전성분은 라벨을 분리해 묶음으로 만든다. 기획세트가 아니면 묶음 1개다.
  const groups = useMemo(
    () => (product ? groupIngredients(product.ingredients) : []),
    [product],
  );
  const total = countIngredients(groups);
  const hasLabels = groups.some((g) => g.label !== null);

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
    if (asProduct) addRecentlyViewed(asProduct);
  }, [asProduct, addRecentlyViewed]);

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
        {asProduct && (
          <button
            type="button"
            onClick={() => toggleLike(asProduct)}
            aria-label={liked ? '찜 해제' : '찜하기'}
            className={`active:scale-90 ${liked ? 'text-accent' : 'text-oy-text'}`}
          >
            <Icon name="favorite" size={24} />
          </button>
        )}
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
                {product.reviewCount != null && (
                  <span className="text-oy-sub">
                    리뷰 {product.reviewCount.toLocaleString()}
                  </span>
                )}
              </p>
            )}

            <span className="mt-3 inline-block rounded-full bg-oy-chip px-2.5 py-1 text-xs text-oy-sub">
              {product.category}
            </span>
          </Section>

          <Divider />

          {/* ── 전성분 (핵심 섹션) ───────────────────── */}
          <Section>
            <OySectionHeader title={`전성분 ${total}개`} />
            <p className="-mt-1 mb-4 text-xs text-oy-sub">
              화장품 전성분은 함량이 많은 순서로 표기됩니다.
              {hasLabels && ' 이 상품은 구성품별로 나뉘어 있어요.'}
            </p>

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
                            className="igr-chip neutral"
                            title={ing.nameEn ?? undefined}
                          >
                            {ing.name}
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
          </Section>

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
          <ComingSoon
            title="내 피부와의 궁합"
            reason="피부타입 진단을 연결하면 이 제품이 내 피부에 맞는지 알려드려요."
          />
          <Divider />
          <ComingSoon
            title="리뷰"
            reason="리뷰는 아직 수집하지 않았습니다. 별점과 리뷰 수만 먼저 제공합니다."
          />
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
    </div>
  );
}
