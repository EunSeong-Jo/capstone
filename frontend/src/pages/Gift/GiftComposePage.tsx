import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { sendGift } from '../../api/personal';
import { ApiError } from '../../api/client';
import { useToast } from '../../context/toast';
import { useProduct } from '../../hooks/useProduct';

/**
 * 선물하기 (`POST /api/v1/gifts`).
 *
 * **결제도 전달도 없다.** 주문과 같은 처지이고 이유도 같다 — '보낸 선물'
 * 목록이 이 기록에서 파생된다. 예전에는 localStorage(`swappy:sentGifts:v1`)에
 * 쌓고 선물함이 예시 데이터와 합쳐 보여줬다.
 *
 * 받는 분 연락처는 묻지 않는다
 * ---------------------------
 * 원본 화면에는 연락처 입력란이 있었는데, 전달 경로가 없어 **아무 데도
 * 쓰이지 않는다.** 쓰이지도 않는 제3자의 개인정보를 받아 두지 않는다.
 * 실제 발송(문자·카카오)을 붙일 때 그 수단에 맞게 다시 넣는다.
 */
const MAX_NAME = 30;
const MAX_MESSAGE = 200;

export default function GiftComposePage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { product, loading } = useProduct(Number(productId));

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const valid = name.trim().length > 0 && !sending && product !== null;

  const send = async () => {
    if (product === null) return;
    setSending(true);
    setError(null);
    try {
      await sendGift(product.id, name.trim(), message.trim() || undefined);
      showToast('선물 기록을 남겼어요', {
        label: '보낸/받은 선물',
        onClick: () => navigate('/mypage/gifts'),
      });
      navigate(-1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('로그인 후에 보낼 수 있어요.');
      } else if (err instanceof ApiError && [404, 409, 422].includes(err.status)) {
        // 없는 닉네임·겹치는 닉네임·나 자신 — 서버 문구가 그대로 안내가 된다.
        setError(err.message);
      } else {
        setError('선물을 보내지 못했어요.');
      }
      setSending(false);
    }
  };

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="선물하기" />

      {!loading && product && (
        <div className="flex gap-3 border-b border-oy-line px-4 py-4">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-16 w-16 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-oy-chip text-2xl">
              🧴
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-oy-sub">{product.brand}</p>
            <p className="truncate text-sm font-semibold text-oy-text">{product.name}</p>
            <p className="mt-0.5 text-sm font-bold text-oy-text">
              {product.price.toLocaleString()}원
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 py-5">
        <label className="mb-1.5 block text-[13px] font-bold text-oy-text">받는 분 닉네임</label>
        <input
          value={name}
          disabled={sending}
          onChange={(e) => {
            setName(e.target.value.slice(0, MAX_NAME));
            setError(null);
          }}
          placeholder="받는 분의 swappy 닉네임"
          className="mb-4 h-12 w-full rounded-xl border border-oy-line bg-white px-3.5 text-sm text-oy-text outline-none focus:border-primary disabled:opacity-60"
        />

        <label className="mb-1.5 block text-[13px] font-bold text-oy-text">
          선물 메시지 (선택)
        </label>
        <textarea
          value={message}
          disabled={sending}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          placeholder="따뜻한 메시지를 남겨보세요"
          className="h-24 w-full resize-none rounded-xl border border-oy-line bg-white p-3.5 text-sm text-oy-text outline-none focus:border-primary disabled:opacity-60"
        />
        <p className="mt-1 text-right text-[11px] text-gray-50">
          {message.length} / {MAX_MESSAGE}
        </p>

        <p className="mt-4 rounded-xl bg-white p-3.5 text-[12px] leading-relaxed text-gray-50">
          선물은 받는 분의 <span className="font-semibold text-gray-100">받은 선물함</span>에
          기록돼요. 결제와 실물 배송은 아직 연결하지 않았어요.
        </p>

        {error && <p className="mt-3 text-[12px] font-semibold text-[#D64545]">{error}</p>}
      </div>

      <div className="px-4 pb-[calc(16px+var(--safe-bottom))]">
        <button
          type="button"
          disabled={!valid}
          onClick={send}
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-40"
        >
          {sending ? '보내는 중…' : '선물 기록하기'}
        </button>
      </div>
    </PageWrapper>
  );
}
