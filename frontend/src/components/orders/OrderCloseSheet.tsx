import { useState } from 'react';
import { CANCEL_REASONS, RETURN_REASONS } from '../../utils/orderStage';

interface OrderCloseSheetProps {
  kind: 'cancel' | 'return';
  /** "라운드랩 토너 외 1건" */
  orderLabel: string;
  total: number;
  saving: boolean;
  onClose: () => void;
  onSubmit: (reason: string | undefined) => void;
}

/** 주문 취소·반품 신청 시트. 사유를 고르고 확인한다. */
export function OrderCloseSheet({ kind, orderLabel, total, saving, onClose, onSubmit }: OrderCloseSheetProps) {
  const reasons = kind === 'cancel' ? CANCEL_REASONS : RETURN_REASONS;
  const [reason, setReason] = useState<string | undefined>(undefined);
  const title = kind === 'cancel' ? '주문 취소' : '반품 신청';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => !saving && onClose()}>
      <div
        className="rounded-t-3xl bg-white px-5 pt-3.5"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-gray-20" />
        <h3 className="text-[15px] font-extrabold text-gray-100">{title}</h3>
        <p className="mt-1 text-xs text-gray-50">{orderLabel}</p>

        <p className="mt-4 text-[13px] font-bold text-gray-100">사유를 골라 주세요</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              disabled={saving}
              onClick={() => setReason(reason === r ? undefined : r)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                reason === r ? 'border-primary bg-primary-light text-primary-dark' : 'border-gray-20 text-gray-70'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-surface-warm p-3 text-[12px] leading-relaxed text-gray-70">
          환불 예정 금액 <b className="text-gray-100">{total.toLocaleString()}원</b>
          <br />
          주문으로 적립된 포인트는 회수돼요.
          {kind === 'return' && ' 반품은 신청 즉시 완료로 처리돼요.'}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="h-[52px] flex-1 rounded-full border border-gray-20 text-[15px] font-bold text-gray-100 active:scale-[.98] disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSubmit(reason)}
            className="h-[52px] flex-[2] rounded-full bg-[#F8174A] text-[15px] font-bold text-white active:scale-[.98] disabled:opacity-50"
          >
            {saving ? '처리 중…' : `${title}하기`}
          </button>
        </div>
      </div>
    </div>
  );
}
