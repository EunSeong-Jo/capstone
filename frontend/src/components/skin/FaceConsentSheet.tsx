import { useEffect } from 'react';
import { FACE_CONSENT_ITEMS, FACE_CONSENT_TITLE } from '../../data/faceConsent';

/** 동의 내용 목록. 가입 시트·촬영 직전 카드·구독 화면이 같은 문구를 쓴다 */
export function FaceConsentList({ className = '' }: { className?: string }) {
  return (
    <dl className={`flex flex-col gap-2.5 ${className}`}>
      {FACE_CONSENT_ITEMS.map((item) => (
        <div key={item.label}>
          <dt className="text-[12px] font-bold text-gray-100">{item.label}</dt>
          <dd className="mt-0.5 text-[12px] leading-relaxed text-gray-50">{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}

interface FaceConsentSheetProps {
  onClose: () => void;
}

/**
 * 동의 내용을 읽는 바텀시트 (읽기 전용).
 *
 * 가입 화면에서 약관 페이지로 **이동하지 않고** 읽게 하려는 것이다 — 이동하면 입력하던
 * 닉네임·이메일이 사라진다. 구조(z-index·스크롤 잠금·Esc)는 `IngredientSheet`를 따른다.
 */
export function FaceConsentSheet({ onClose }: FaceConsentSheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={FACE_CONSENT_TITLE}
        className="fixed bottom-0 left-1/2 z-50 max-h-[80dvh] w-full max-w-[430px] -translate-x-1/2 animate-slide-up overflow-y-auto rounded-t-3xl bg-white px-5 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-gray-20" />
        <h2 className="text-[16px] font-extrabold text-gray-100">{FACE_CONSENT_TITLE}</h2>
        <FaceConsentList className="mt-4" />
        <p className="mt-4 text-[11px] leading-relaxed text-gray-50">
          선택 항목이라 동의하지 않아도 가입할 수 있어요.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-12 w-full rounded-xl bg-ob-green text-[14px] font-semibold text-white active:scale-[.98]"
        >
          확인
        </button>
      </div>
    </>
  );
}
