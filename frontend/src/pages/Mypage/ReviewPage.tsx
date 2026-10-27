import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { MyReviewDto, OrderDto, fetchMyReviews, fetchOrders, writeReview } from '../../api/personal';
import { ApiError, apiUrl } from '../../api/client';
import { ReviewDraft, ReviewWriteSheet } from '../../components/reviews/ReviewWriteSheet';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { STAGE_LABEL, isClosed } from '../../utils/orderStage';

/**
 * 후기.
 *
 * '작성 가능'은 주문했지만 아직 후기를 안 쓴 항목이고, '작성한 후기'는
 * 반대다. 목록은 `GET /me/orders`(항목마다 `reviewed`)에서, 쓴 내용(본문·
 * 사진)은 `GET /me/reviews`에서 온다.
 *
 * 작성은 주문내역과 같은 `ReviewWriteSheet`(별점·본문·사진 3장)로 한다.
 * 예전에는 이 화면만 별점 하나를 눌러 바로 저장해서 글도 사진도 넣을 수 없었다.
 *
 * 산 제품에만 쓸 수 있다는 규칙은 화면이 아니라 DB가 강제한다
 * (`reviews.order_item_id` FK). 취소·반품한 주문은 서버가 막는다.
 *
 * 배송완료 전 주문은 '작성 가능'에 보이되 버튼을 잠근다(QA 8) — 서버도
 * 배송완료 전에는 409로 막는다. 목록에서 아예 빼면 산 제품이 왜 안 보이는지
 * 알 수 없어서 단계를 같이 보여 준다.
 */

type Tab = 'writable' | 'written';

interface Row {
  orderItemId: number;
  productId: number | null;
  productName: string;
  brandName: string | null;
  placedAt: string;
  /** 주문 단계(paid·preparing·shipping·delivered). 후기는 delivered부터. */
  stage: string;
}

const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

function collect(orders: OrderDto[], reviewed: boolean): Row[] {
  return orders
    .filter((o) => !isClosed(o.status))
    .flatMap((o) =>
      o.items
        .filter((i) => i.reviewed === reviewed && i.productId !== null)
        .map((i) => ({
          orderItemId: i.id,
          productId: i.productId,
          productName: i.productName,
          brandName: i.brandName,
          placedAt: o.placedAt,
          stage: o.stage,
        })),
    );
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const { isUser, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('writable');
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [reviews, setReviews] = useState<MyReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  /** 후기를 쓰는 중인 항목. null이면 시트가 닫혀 있다. */
  const [target, setTarget] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = () =>
    Promise.all([fetchOrders(), fetchMyReviews()])
      .then(([o, r]) => {
        setOrders(o);
        setReviews(r);
      })
      .catch(() => {
        setOrders([]);
        setReviews([]);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    // 비회원은 조회하지 않는다. 아래 로그인 안내 화면으로 빠지므로
    // loading을 되돌릴 필요가 없다.
    if (authLoading || !isUser) return;
    reload();
  }, [isUser, authLoading]);

  const submit = async (draft: ReviewDraft) => {
    if (target === null) return;
    setSaving(true);
    try {
      await writeReview(target.orderItemId, draft.rating, draft.body, draft.photos);
      setTarget(null);
      showToast('후기를 등록했어요 (+100P)');
      setTab('written');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '후기를 저장하지 못했어요');
    } finally {
      setSaving(false);
    }
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
  const reviewOf = (orderItemId: number) => reviews.find((r) => r.orderItemId === orderItemId);

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
          rows.map((row) => {
            const review = tab === 'written' ? reviewOf(row.orderItemId) : undefined;
            return (
              <div key={row.orderItemId} className="mb-2 bg-white p-4">
                <p className="text-sm font-semibold text-gray-100">{row.productName}</p>
                <p className="mt-0.5 text-xs text-gray-50">
                  {row.brandName} · {fmtDate(row.placedAt)} 주문
                </p>

                {tab === 'writable' && row.stage !== 'delivered' && (
                  <div className="mt-3 rounded-lg bg-gray-5 py-2.5 text-center text-[12px] text-gray-50">
                    {STAGE_LABEL[row.stage] ?? row.stage} · 배송이 완료되면 후기를 쓸 수 있어요
                  </div>
                )}

                {tab === 'writable' && row.stage === 'delivered' && (
                  <button
                    onClick={() => setTarget(row)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-[13px] font-bold text-white active:scale-[.98]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8a2 2 0 012-2h1.5l1.2-1.8A1.5 1.5 0 0110 3.5h4a1.5 1.5 0 011.3.7L16.5 6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
                      <circle cx="12" cy="12.5" r="3.2" />
                    </svg>
                    사진·글 후기 쓰기 (+100P)
                  </button>
                )}

                {review && (
                  <div className="mt-3 border-t border-gray-10 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] text-star">
                        {'★'.repeat(review.rating)}
                        <span className="text-gray-20">{'★'.repeat(5 - review.rating)}</span>
                      </span>
                      <span className="text-[11px] text-gray-50">{fmtDate(review.createdAt)} 작성</span>
                    </div>
                    {review.body && (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-gray-70">{review.body}</p>
                    )}
                    {review.photoUrls.length > 0 && (
                      <div className="mt-2 flex gap-1.5">
                        {review.photoUrls.map((url) => (
                          <a key={url} href={apiUrl(url)} target="_blank" rel="noreferrer">
                            <img src={apiUrl(url)} alt="후기 사진" className="h-20 w-20 rounded-lg object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* key로 다시 마운트시켜 별점·본문·사진을 초기화한다. */}
      {target && (
        <ReviewWriteSheet
          key={target.orderItemId}
          productLabel={target.brandName ? `${target.brandName} · ${target.productName}` : target.productName}
          saving={saving}
          onClose={() => setTarget(null)}
          onSubmit={submit}
        />
      )}
    </PageWrapper>
  );
}
