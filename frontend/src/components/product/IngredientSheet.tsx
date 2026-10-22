import { useEffect } from 'react';
import type { ProductIngredient } from '../../api/products';
import { ingredientNotes } from '../../utils/ingredients';

interface IngredientSheetProps {
  ingredient: ProductIngredient | null;
  onClose: () => void;
  /** 내 피부타입 이름(진단 후). 추천 성분 문구에 쓴다 */
  skinTypeLabel?: string | null;
}

/** 분류 이름. 칩의 title 툴팁에만 있던 설명을 모바일에서도 보이게 옮겼습니다. */
const GRADE_LABEL: Record<string, string> = {
  key: '추천 성분',
  warn: '주의 성분',
  normal: '일반 성분',
};

/**
 * 성분 설명 — 제품 상세의 전성분 칩을 누르면 여는 바텀시트.
 *
 * 설명은 상세 응답에 이미 실려 오므로 여기서 요청을 보내지 않습니다.
 * 구조(z-index·스크롤 잠금·Esc)는 RecommendSetSheet를 따릅니다.
 */
export function IngredientSheet({ ingredient, onClose, skinTypeLabel }: IngredientSheetProps) {
  const open = ingredient !== null;

  // 열려 있는 동안 뒤 배경이 따라 스크롤되지 않게 막는다.
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!ingredient) return null;

  const { name, nameEn, description, keywords, descriptionSource, grade } = ingredient;
  const notes = ingredientNotes(ingredient, skinTypeLabel);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 성분 설명`}
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 animate-slide-up rounded-t-3xl bg-white px-4 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-oy-line" />

        <h2 className="text-[16px] font-extrabold text-oy-text">{name}</h2>
        {nameEn && <p className="mt-0.5 text-[12px] text-oy-sub">{nameEn}</p>}

        {keywords && keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <span key={k} className="igr-chip">
                {k}
              </span>
            ))}
          </div>
        )}

        <p className="mt-3 text-[14px] leading-relaxed text-oy-text">
          {description ?? '이 성분의 설명은 아직 준비 중입니다.'}
        </p>

        <ul className="mt-4 flex flex-col gap-1 border-t border-oy-line pt-3 text-[12px] text-oy-sub">
          {grade && <li className="font-bold text-oy-text">{GRADE_LABEL[grade]}</li>}
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        {descriptionSource === 'llm' && (
          <p className="mt-3 text-[11px] text-oy-sub">AI가 작성한 참고용 설명입니다.</p>
        )}
      </div>
    </>
  );
}
