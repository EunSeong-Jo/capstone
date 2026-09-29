import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GiftDto, fetchSentGifts } from '../../api/personal';

/**
 * 보낸 선물 (`GET /api/v1/me/gifts/sent`).
 *
 * 예전 선물함은 localStorage에 쌓은 기록과 예시 데이터를 합쳐 보여줬다.
 * 지금은 서버가 전부이고, **보낸 적이 없으면 빈 화면이 맞다.**
 *
 * `status`는 아직 'pending' 하나뿐이라 배지 대신 안내 문구로 적는다 —
 * 상태가 여럿인 척하면 전달이 진행되는 것처럼 보인다.
 */
const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

export default function SentGiftsPage() {
  const navigate = useNavigate();
  const [gifts, setGifts] = useState<GiftDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchSentGifts()
      .then((rows) => alive && setGifts(rows))
      .catch(() => alive && setGifts([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="보낸 선물" />

      {loading ? (
        <div className="animate-pulse space-y-2 p-4">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white" />
          ))}
        </div>
      ) : gifts.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <span className="text-5xl">🎁</span>
          <p className="mt-3 text-base font-semibold text-gray-100">보낸 선물이 없어요</p>
          <p className="mt-1 text-sm text-gray-50">제품 상세에서 선물할 수 있어요</p>
          <button
            onClick={() => navigate('/search')}
            className="mt-4 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
          >
            제품 찾아보기
          </button>
        </div>
      ) : (
        <div className="space-y-2 p-4">
          <p className="pb-1 text-[12px] leading-relaxed text-gray-50">
            결제와 실제 전달은 아직 연결하지 않았어요. 아래는 보내려고 적어 둔 기록이에요.
          </p>
          {gifts.map((g) => (
            <button
              key={g.id}
              type="button"
              disabled={g.productId === null}
              onClick={() => g.productId !== null && navigate(`/detail/${g.productId}`)}
              className="w-full rounded-2xl border border-[#ECEEE8] bg-white p-4 text-left disabled:cursor-default"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-gray-100">
                  {g.recipientName}님께
                </span>
                <span className="text-[11px] text-gray-50">{fmtDate(g.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-snug text-gray-100">
                {g.productName}
              </p>
              {g.brandName && <p className="mt-0.5 text-xs text-gray-50">{g.brandName}</p>}
              <p className="mt-1 text-sm font-bold text-gray-100">
                {g.unitPrice.toLocaleString()}원
              </p>
              {g.message && (
                <p className="mt-2 rounded-xl bg-surface-warm p-2.5 text-[12px] leading-relaxed text-gray-70">
                  “{g.message}”
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
