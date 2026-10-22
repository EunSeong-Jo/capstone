import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { cancelSubscription, startSubscription } from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { invalidateSkinPhoto, useSubscription } from '../../hooks/useSkinPhoto';

/**
 * 구독(멤버십) 안내 모달과 시작·해지.
 *
 * 마이 화면의 '구독 관리'와 AI 피부관리 화면의 구독 버튼이 같이 쓴다. **구독은 결제 없이 기록만
 * 만드는 데모다**(PG 연동이 없다).
 *
 * ⚠️ 표의 혜택 가운데 AI 피부 분석 횟수·항목 수만 실제로 동작한다. 사진으로 찾기 하루 횟수, 포인트
 * 적립률, 화장대 보관 개수는 **안내(UI)만 있고 아직 한도·적립에 반영되지 않았다**
 * (`ocr_quota.py`·`personal.py`의 POINT_RATE·화장대 추가는 구독을 보지 않는다).
 */
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

const BENEFITS = [
  { label: 'AI 피부 분석', free: '월 1회', paid: '월 4회', note: '주 1회씩 촬영하는 걸 추천해요' },
  { label: '분석 항목', free: '8가지', paid: '16가지', note: '점수 15개 + 피부 분류' },
  { label: '사진으로 찾기', free: '하루 3회', paid: '하루 15회', note: '제품 사진으로 찾는 횟수' },
  { label: '포인트 적립', free: '1%', paid: '5%', note: '주문 금액 기준' },
  { label: '화장대 보관', free: '20개', paid: '200개', note: '내 화장대에 담을 수 있는 제품' },
];
const EXTRA_ITEMS = ['탄력', '광채', '피부결', '다크서클', '눈밑 불룩', '윗·아랫눈꺼풀 처짐', '눈밑 꺼짐'];

/** Swappy 멤버십 — 구독하면 무엇이 달라지는지 보여 주고 시작·해지로 이어 준다. 결제는 없다(데모) */
function MembershipModal({
  loading,
  subscribed,
  cancelled,
  periodEnd,
  busy,
  onClose,
  onStart,
  onCancel,
}: {
  loading: boolean;
  subscribed: boolean;
  cancelled: boolean;
  periodEnd: string | null;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/45" onClick={busy ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Swappy 멤버십"
        className="relative max-h-[min(480px,68dvh)] w-full max-w-[380px] overflow-y-auto rounded-3xl bg-white px-5 py-5"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-50 active:bg-gray-5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <p className="text-[12px] font-semibold text-ob-green-deep">Swappy 멤버십</p>
        <h2 className="mt-1 text-[18px] font-extrabold leading-snug text-gray-100">
          구독하면 이렇게 달라져요
        </h2>

        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-10">
          <div className="grid grid-cols-[1fr_60px_60px] bg-gray-5 px-3 py-2 text-[11px] font-bold text-gray-50">
            <span />
            <span className="text-center">무료</span>
            <span className="text-center text-ob-green-deep">구독</span>
          </div>
          {BENEFITS.map((b) => (
            <div key={b.label} className="grid grid-cols-[1fr_60px_60px] items-center border-t border-gray-10 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-gray-100">{b.label}</span>
                <span className="block text-[10px] text-gray-50">{b.note}</span>
              </span>
              <span className="text-center text-[13px] font-semibold text-gray-70">{b.free}</span>
              <span className="text-center text-[14px] font-extrabold text-ob-green-deep">{b.paid}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-2xl bg-ob-surface px-4 py-3">
          <p className="text-[12px] font-extrabold text-ob-green-deep">구독하면 추가로 분석해요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-70">{EXTRA_ITEMS.join(' · ')}</p>
        </div>

        <ul className="mt-3 flex flex-col gap-1 text-[12px] leading-relaxed text-gray-70">
          <li>· 분석 기록에서 날짜별로 지난 결과와 이전·현재 분석 이미지를 비교할 수 있어요</li>
          <li>· 한도는 매달 처음으로 돌아와요</li>
        </ul>

        {subscribed && periodEnd && (
          <p className="mt-3 rounded-xl bg-gray-5 px-3 py-2 text-[12px] text-gray-70">
            {cancelled
              ? `해지했어요. ${fmtDate(periodEnd)}까지는 계속 쓸 수 있어요.`
              : `${fmtDate(periodEnd)}까지 이용할 수 있어요.`}
          </p>
        )}

        {subscribed && !cancelled ? (
          <button
            type="button"
            disabled={busy || loading}
            onClick={onCancel}
            className="mt-4 h-12 w-full rounded-xl border border-gray-20 text-[14px] font-semibold text-gray-70 active:scale-[.98] disabled:opacity-50"
          >
            구독 해지
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || loading}
            onClick={onStart}
            className="mt-4 h-12 w-full rounded-xl bg-ob-green text-[14px] font-semibold text-white active:scale-[.98] disabled:opacity-50"
          >
            {subscribed ? '해지 취소하고 계속 이용' : '구독 시작하기'}
          </button>
        )}
      </div>
    </div>
  );
}

interface MembershipManagerProps {
  onClose: () => void;
  /** 구독을 시작·해지한 뒤. 열려 있는 화면이 한도 표시를 다시 받게 한다 */
  onChanged?: () => void;
}

export default function MembershipManager({ onClose, onChanged }: MembershipManagerProps) {
  const { scope } = useAuth();
  const { showToast } = useToast();
  const { subscription, loading, reload } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const subscribed = subscription?.active === true;
  const cancelled = subscription?.status === 'cancelled';

  /** 성공하면 true — 실패하면 토스트를 띄우고 false(모달은 열어 둔다) */
  const run = async (job: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(true);
    try {
      await job();
      invalidateSkinPhoto(scope);
      reload();
      onChanged?.();
      showToast(done);
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (confirmCancel) {
    return (
      <ConfirmDialog
        title="구독을 해지할까요?"
        description="이번 이용 기간이 끝날 때까지는 계속 쓸 수 있어요."
        confirmLabel="해지"
        cancelLabel="유지"
        danger
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          void run(cancelSubscription, '구독을 해지했어요').then((ok) => {
            if (ok) onClose();
            else setConfirmCancel(false);
          });
        }}
      />
    );
  }

  return (
    <MembershipModal
      loading={loading}
      subscribed={subscribed}
      cancelled={cancelled}
      periodEnd={subscription?.currentPeriodEnd ?? null}
      busy={busy}
      onClose={onClose}
      onStart={() => {
        void run(startSubscription, subscribed ? '구독을 다시 시작했어요' : '구독을 시작했어요').then(
          (ok) => ok && onClose(),
        );
      }}
      onCancel={() => setConfirmCancel(true)}
    />
  );
}
