/**
 * 확인/취소 팝업 — 되돌릴 수 없는 동작 앞에 둔다.
 *
 * `open` prop 대신 **부모가 조건부로 렌더**한다. 닫힌 팝업이 상태를 들고
 * 남아 있을 이유가 없고, 저장소의 다른 시트(`ReviewWriteSheet`)와도 같은
 * 방식이다.
 */
interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 지우는 동작처럼 되돌릴 수 없으면 true — 확인 버튼이 경고색이 된다 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = '네',
  cancelLabel = '아니오',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-8"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[300px] rounded-2xl bg-white p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold leading-snug text-gray-100">{title}</p>
        {description && (
          <p className="mt-2 text-[13px] leading-relaxed text-gray-50">{description}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-xl border border-gray-20 text-sm font-bold text-gray-70 transition-transform active:scale-[.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-11 flex-1 rounded-xl text-sm font-bold text-white transition-transform active:scale-[.98] ${
              danger ? 'bg-[#FF5C7A]' : 'bg-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
