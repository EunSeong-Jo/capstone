import { useEffect, useState } from 'react';
import {
  ProductReviews as Reviews,
  ReviewSort,
  fetchProductReviews,
} from '../../api/products';
import { apiUrl } from '../../api/client';
import { useSkinType } from '../../hooks/useSkinType';
import { SKIN_TYPE_META, SkinType } from '../../types';

/**
 * 제품 상세의 후기 섹션.
 *
 * 실제 후기는 **산 제품에만** 쓸 수 있다(`reviews.order_item_id`). 시연용으로 제품마다
 * 10개 안팎이 미리 채워져 있고(`reviews.is_sample`, scripts/seed_sample_reviews.py) 화면에서는
 * 구분하지 않는다. 카드의 "리뷰 N"은 이 목록의 총수(`products.registered_review_count`)다 —
 * 올리브영에서 받아 온 `products.review_count`는 인기순 정렬에만 쓴다.
 */
const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

const Stars = ({ rating }: { rating: number }) => (
  <span aria-label={`${rating}점`} className="text-[13px] leading-none">
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={n <= rating ? 'text-[#FFB020]' : 'text-gray-20'}>
        ★
      </span>
    ))}
  </span>
);

/**
 * 결과 한 벌. **어떤 제품의 것인지**를 함께 들고 있다.
 *
 * effect에서 `setData(null)`로 되돌리면 렌더가 한 번 더 돈다
 * (react-hooks/set-state-in-effect). 대신 결과에 productId를 붙여 두고,
 * 지금 보고 있는 제품과 다르면 로딩으로 본다 — 저장소의 다른 훅들과 같은
 * 방식이다(useStats·useOrders 주석 참고).
 */
interface Loaded {
  key: string;
  reviews: Reviews | null;
}

const SORTS: [ReviewSort, string][] = [
  ['latest', '최신순'],
  ['rating_desc', '별점 높은순'],
  ['rating_asc', '별점 낮은순'],
  ['oldest', '오래된순'],
];

/** 작성자 피부타입 표시 — "겉바속촉 수부지" */
const skinLabel = (code: string | null) =>
  code && code in SKIN_TYPE_META ? SKIN_TYPE_META[code as SkinType].label : null;

export function ProductReviews({ productId }: { productId: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sort, setSort] = useState<ReviewSort>('latest');
  const [rating, setRating] = useState<number | null>(null);
  const [sameSkin, setSameSkin] = useState(false);
  const { skinType: mySkin } = useSkinType();

  const skinFilter = sameSkin && mySkin ? mySkin : undefined;
  const key = `${productId}:${sort}:${rating ?? ''}:${skinFilter ?? ''}`;

  useEffect(() => {
    const controller = new AbortController();

    fetchProductReviews(
      productId,
      { sort, rating: rating ?? undefined, skinType: skinFilter },
      controller.signal,
    )
      .then((reviews) => setLoaded({ key, reviews }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 후기를 못 불러왔다고 제품 상세 전체를 막을 이유는 없다.
        setLoaded({ key, reviews: null });
      });

    return () => controller.abort();
  }, [key, productId, sort, rating, skinFilter]);

  // 정렬·필터를 바꾸는 동안에는 이전 결과를 그대로 둔다 — 요약 카드가
  // 스켈레톤으로 깜빡이지 않게. 제품이 바뀌면 이전 결과는 남의 것이다.
  const sameProduct = loaded?.key.startsWith(`${productId}:`) ?? false;
  const current = sameProduct ? loaded : null;
  const refreshing = loaded !== null && loaded.key !== key;
  const data = current?.reviews ?? null;
  // 조회가 끝났는데 결과가 없으면 실패다 — 섹션을 통째로 숨긴다.
  if (current !== null && data === null) return null;

  return (
    <section className="px-4 py-5">
      <h3 className="text-[15px] font-extrabold text-gray-100">
        후기 {data ? `(${data.total})` : ''}
      </h3>

      {data === null ? (
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-16 rounded-xl bg-gray-5" />
          <div className="h-16 rounded-xl bg-gray-5" />
        </div>
      ) : data.total === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-gray-50">
          아직 이 제품에 쓴 후기가 없어요.
          <br />
          구매하신 분만 후기를 쓸 수 있어요.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-4 rounded-2xl bg-gray-5 p-4">
            <div className="shrink-0 text-center">
              <p className="text-[26px] font-extrabold leading-none text-gray-100">
                {data.average?.toFixed(1)}
              </p>
              <div className="mt-1">
                <Stars rating={Math.round(data.average ?? 0)} />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((score) => {
                const n = data.distribution[String(score)] ?? 0;
                const pct = data.total > 0 ? Math.round((n / data.total) * 100) : 0;
                return (
                  <div key={score} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-[11px] text-gray-50">{score}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-20">
                      <div className="h-full rounded-full bg-[#FFB020]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-5 shrink-0 text-right text-[11px] text-gray-50">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 정렬 · 필터 */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12px] text-gray-50">
              {rating !== null || skinFilter ? `조건에 맞는 후기 ${data.matched}개` : `전체 ${data.total}개`}
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ReviewSort)}
              aria-label="후기 정렬"
              className="rounded-lg border border-gray-20 bg-white px-2 py-1 text-[12px] font-semibold text-gray-100 outline-none"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-hide">
            <button
              type="button"
              disabled={!mySkin}
              onClick={() => setSameSkin((v) => !v)}
              title={mySkin ? undefined : '피부타입 진단 후 쓸 수 있어요'}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40 ${
                sameSkin && mySkin ? 'border-primary bg-primary-light text-primary-dark' : 'border-gray-20 bg-white text-gray-70'
              }`}
            >
              내 피부타입과 같은 사람
            </button>
            {[5, 4, 3, 2, 1].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                  rating === n ? 'border-primary bg-primary-light text-primary-dark' : 'border-gray-20 bg-white text-gray-70'
                }`}
              >
                ★ {n}점
              </button>
            ))}
          </div>

          {data.items.length === 0 && (
            <p className="py-8 text-center text-[13px] text-gray-50">조건에 맞는 후기가 없어요</p>
          )}
          <ul className={`mt-1 divide-y divide-gray-10 transition-opacity ${refreshing ? 'opacity-50' : ''}`}>
            {data.items.map((r) => (
              <li key={r.id} className="py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-[12px] font-semibold text-gray-100">{r.nickname}</span>
                    {skinLabel(r.skinType) && (
                      <span className="text-[11px] text-gray-50">{skinLabel(r.skinType)}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-50">{fmtDate(r.createdAt)}</span>
                </div>
                {r.body && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-gray-70">{r.body}</p>
                )}
                {r.photoUrls?.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {r.photoUrls.map((url) => (
                      <a key={url} href={apiUrl(url)} target="_blank" rel="noreferrer">
                        <img src={apiUrl(url)} alt="후기 사진" className="h-20 w-20 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
