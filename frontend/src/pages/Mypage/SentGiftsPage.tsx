import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GiftDto, fetchReceivedGifts, fetchSentGifts } from '../../api/personal';

/**
 * 보낸/받은 선물 (`GET /me/gifts/sent`, `GET /me/gifts/received`).
 *
 * 받는 사람은 보낼 때 닉네임으로 지정한 swappy 계정이다. 닉네임 지정이
 * 생기기 전에 이름만 적어 보낸 선물은 받은 쪽 목록에 나오지 않는다.
 *
 * 결제·실물 전달은 아직 없어서 '보낸/받은 기록'이다.
 */
type GiftTab = 'sent' | 'received';

const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

interface Loaded {
  tab: GiftTab;
  gifts: GiftDto[];
}

export default function SentGiftsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<GiftTab>('sent');
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    (tab === 'sent' ? fetchSentGifts() : fetchReceivedGifts())
      .then((gifts) => alive && setLoaded({ tab, gifts }))
      .catch(() => alive && setLoaded({ tab, gifts: [] }));
    return () => {
      alive = false;
    };
  }, [tab]);

  const loading = loaded?.tab !== tab;
  const gifts = loading ? [] : loaded.gifts;

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="보낸/받은 선물" />

      <div className="flex border-b border-gray-10 bg-surface-warm px-4">
        {([
          ['sent', '보낸 선물'],
          ['received', '받은 선물'],
        ] as [GiftTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`mr-5 border-b-2 px-1 py-2.5 text-sm transition-colors ${
              tab === key ? 'border-primary font-extrabold text-primary-dark' : 'border-transparent font-semibold text-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2 p-4">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white" />
          ))}
        </div>
      ) : gifts.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <span className="text-5xl">🎁</span>
          <p className="mt-3 text-base font-semibold text-gray-100">
            {tab === 'sent' ? '보낸 선물이 없어요' : '받은 선물이 없어요'}
          </p>
          <p className="mt-1 text-sm text-gray-50">
            {tab === 'sent'
              ? '제품 상세에서 친구 닉네임으로 선물할 수 있어요'
              : '친구가 내 닉네임으로 선물하면 여기에 떠요'}
          </p>
          {tab === 'sent' && (
            <button
              onClick={() => navigate('/search')}
              className="mt-4 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
            >
              제품 찾아보기
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-4">
          <p className="pb-1 text-[12px] leading-relaxed text-gray-50">
            결제와 실물 전달은 아직 연결하지 않았어요. 아래는 주고받은 선물 기록이에요.
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
                  {tab === 'sent' ? `${g.recipientName}님께` : `${g.senderNickname ?? '익명'}님이 보냄`}
                </span>
                <span className="text-[11px] text-gray-50">{fmtDate(g.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-snug text-gray-100">{g.productName}</p>
              {g.brandName && <p className="mt-0.5 text-xs text-gray-50">{g.brandName}</p>}
              <p className="mt-1 text-sm font-bold text-gray-100">{g.unitPrice.toLocaleString()}원</p>
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
