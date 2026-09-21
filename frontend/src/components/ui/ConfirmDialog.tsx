interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 공용 확인/취소 팝업 — "정말 반품 철회하시겠습니까?" 류의 짧은 의사결정에 쓴다 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '네',
  cancelLabel = '아니오',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-8" onClick={onCancel}>
      <div
        className="w-full max-w-[300px] rounded-2xl bg-white p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold text-gray-100 leading-snug">{title}</p>
        {description && <p className="mt-2 text-[13px] text-gray-50 leading-relaxed">{description}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-gray-20 text-sm font-bold text-gray-70 active:scale-[.98] transition-transform"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 h-11 rounded-xl text-sm font-bold text-white active:scale-[.98] transition-transform ${
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
