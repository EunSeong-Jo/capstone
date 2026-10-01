import { useEffect, useState } from 'react';
import { ProductReviews as Reviews, fetchProductReviews } from '../../api/products';

/**
 * 제품 상세의 후기 섹션.
 *
 * 후기는 **산 제품에만** 쓸 수 있다(`reviews.order_item_id`). 그래서 지금은
 * 대부분의 제품이 빈 목록이고, 그게 정상이다 — 없는 후기를 지어내는 대신
 * 아직 없다고 적는다.
 *
 * 카드 위에 적힌 별점·리뷰 수(`products.reviewCount`)는 크롤링으로 받아 온
 * 올리브영 값이라 이 목록과 다르다. 두 숫자가 섞여 보이지 않도록 여기서는
 * 이 앱에서 쓴 후기만 세어 보여준다.
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
  productId: number;
  reviews: Reviews | null;
}

export function ProductReviews({ productId }: { productId: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchProductReviews(productId, controller.signal)
      .then((reviews) => setLoaded({ productId, reviews }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 후기를 못 불러왔다고 제품 상세 전체를 막을 이유는 없다.
        setLoaded({ productId, reviews: null });
      });

    return () => controller.abort();
  }, [productId]);

  const current = loaded?.productId === productId ? loaded : null;
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

          <ul className="mt-3 divide-y divide-gray-10">
            {data.items.map((r) => (
              <li key={r.id} className="py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-[12px] font-semibold text-gray-100">{r.nickname}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-50">{fmtDate(r.createdAt)}</span>
                </div>
                {r.body && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-gray-70">{r.body}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
