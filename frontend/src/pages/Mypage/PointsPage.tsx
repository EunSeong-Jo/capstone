import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { PointsDto, fetchPoints } from '../../api/personal';
import { useAuth } from '../../context/auth';

/**
 * 포인트.
 *
 * `GET /api/v1/me/points`가 전부다. 잔액은 내역의 합이라 두 값이 어긋날
 * 수 없다(서버가 SUM한다).
 *
 * 예전에는 소멸 예정·도착지연 보상 같은 10건이 하드코딩돼 있었다. 유효기간
 * 개념이 없으므로 '예정'·'소멸' 탭도 뺐다 — 근거가 없는 분류다.
 *
 * 적립은 두 가지뿐이다: 주문 1%, 후기 작성 100P. 계산식은 백엔드
 * `app/api/personal.py`의 POINT_RATE·REVIEW_POINT 한 곳에 있다.
 */

const REASON_LABEL: Record<string, string> = {
  order: '주문 적립',
  review: '후기 작성 적립',
  order_cancel: '주문 취소 · 적립 회수',
  order_return: '반품 · 적립 회수',
};

const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

export default function PointsPage() {
  const navigate = useNavigate();
  const { isUser, loading: authLoading } = useAuth();
  const [data, setData] = useState<PointsDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 비회원은 조회하지 않는다. 아래 로그인 안내 화면으로 빠진다.
    if (authLoading || !isUser) return;
    fetchPoints()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [isUser, authLoading]);

  if (!authLoading && !isUser) {
    return (
      <PageWrapper>
        <Header showBack title="포인트" />
        <div className="px-4 py-20 text-center">
          <p className="text-sm text-gray-70">포인트는 로그인 후에 볼 수 있어요.</p>
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

  return (
    <PageWrapper>
      <Header showBack title="포인트" />

      <div className="bg-white px-4 py-7 text-center">
        <p className="text-sm text-gray-50">사용 가능 포인트</p>
        <p className="mt-1 text-[32px] font-black text-gray-100">
          {loading ? '—' : `${(data?.balance ?? 0).toLocaleString()}P`}
        </p>
        <p className="mt-2 text-[12px] text-gray-50">
          주문하면 결제액의 1%, 후기를 쓰면 100P가 쌓여요
        </p>
      </div>

      <div className="mt-2 flex-1 bg-white">
        {loading ? (
          <div className="animate-pulse space-y-2 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-5" />
            ))}
          </div>
        ) : !data || data.transactions.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <span className="text-5xl">🪙</span>
            <p className="mt-3 text-base font-semibold text-gray-100">아직 포인트 내역이 없어요</p>
            <p className="mt-1 text-sm text-gray-50">주문하거나 후기를 쓰면 쌓여요</p>
          </div>
        ) : (
          data.transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between border-b border-gray-10 px-4 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-100">
                  {REASON_LABEL[tx.reason] ?? tx.reason}
                </p>
                <p className="mt-0.5 text-xs text-gray-50">{fmtDate(tx.createdAt)}</p>
              </div>
              <span
                className={`text-[15px] font-bold ${tx.amount >= 0 ? 'text-primary' : 'text-accent'}`}
              >
                {tx.amount >= 0 ? '+' : ''}
                {tx.amount.toLocaleString()}P
              </span>
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
}
