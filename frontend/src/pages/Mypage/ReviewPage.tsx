import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OrderDto, fetchOrders, writeReview } from '../../api/personal';
import { useAuth } from '../../context/auth';

/**
 * 후기.
 *
 * '작성 가능'은 주문했지만 아직 후기를 안 쓴 항목이고, '작성한 후기'는
 * 반대다. 둘 다 `GET /api/v1/me/orders` 하나에서 나온다 — 서버가 항목마다
 * `reviewed`를 내려주기 때문이다.
 *
 * 산 제품에만 쓸 수 있다는 규칙은 화면이 아니라 DB가 강제한다
 * (`reviews.order_item_id` FK). 예전에는 작성 가능 목록 자체가 하드코딩이라
 * 사지도 않은 제품에 후기를 쓸 수 있는 것처럼 보였다.
 */

type Tab = 'writable' | 'written';

interface Row {
  orderItemId: number;
  productName: string;
  brandName: string | null;
  placedAt: string;
}

const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

function collect(orders: OrderDto[], reviewed: boolean): Row[] {
  return orders.flatMap((o) =>
    o.items
      .filter((i) => i.reviewed === reviewed && i.productId !== null)
      .map((i) => ({
        orderItemId: i.id,
        productName: i.productName,
        brandName: i.brandName,
        placedAt: o.placedAt,
      })),
  );
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const { isUser, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('writable');
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const reload = () =>
    fetchOrders()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    // 비회원은 조회하지 않는다. 아래 로그인 안내 화면으로 빠지므로
    // loading을 되돌릴 필요가 없다.
    if (authLoading || !isUser) return;
    reload();
  }, [isUser, authLoading]);

  const submit = async (orderItemId: number) => {
    setSaving(orderItemId);
    await writeReview(orderItemId, rating[orderItemId] ?? 5).catch(() => undefined);
    setSaving(null);
    reload();
  };

  if (!authLoading && !isUser) {
    return (
      <PageWrapper>
        <Header showBack title="후기" />
        <div className="px-4 py-20 text-center">
          <p className="text-sm text-gray-70">후기는 로그인 후에 쓸 수 있어요.</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white active:scale-95"
          >
            로그인
          </button>
        </div>
      </PageWrapper>
    );
  }

  const rows = collect(orders, tab === 'written');

  return (
    <PageWrapper>
      <Header showBack title="후기" />

      <div className="flex border-b border-gray-20 bg-white px-4">
        {(
          [
            ['writable', '작성 가능'],
            ['written', '작성한 후기'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-3 text-sm border-b-2 ${
              tab === key
                ? 'border-primary font-bold text-primary'
                : 'border-transparent text-gray-50'
            }`}
          >
            {label} {collect(orders, key === 'written').length}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-surface">
        {loading ? (
          <div className="animate-pulse space-y-2 p-4">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <span className="text-5xl">✍️</span>
            <p className="mt-3 text-base font-semibold text-gray-100">
              {tab === 'writable' ? '쓸 수 있는 후기가 없어요' : '작성한 후기가 없어요'}
            </p>
            <p className="mt-1 text-sm text-gray-50">주문한 제품에만 후기를 쓸 수 있어요</p>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.orderItemId} className="mb-2 bg-white p-4">
              <p className="text-sm font-semibold text-gray-100">{row.productName}</p>
              <p className="mt-0.5 text-xs text-gray-50">
                {row.brandName} · {fmtDate(row.placedAt)} 주문
              </p>

              {tab === 'writable' && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRating((r) => ({ ...r, [row.orderItemId]: n }))}
                        aria-label={`${n}점`}
                        className="text-[20px] leading-none"
                      >
                        {(rating[row.orderItemId] ?? 5) >= n ? '★' : '☆'}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={saving === row.orderItemId}
                    onClick={() => submit(row.orderItemId)}
                    className="ml-auto rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white active:scale-95 disabled:opacity-50"
                  >
                    {saving === row.orderItemId ? '저장 중…' : '후기 쓰기 (+100P)'}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
}
