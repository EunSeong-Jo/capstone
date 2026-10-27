import type { DictIngredient } from '../../api/ingredients';
import { dictToProductIngredient, functionNames } from '../../utils/ingredients';

interface DictIngredientRowProps {
  ingredient: DictIngredient;
  /** 마이 성분에 담겨 있는가 */
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
  /** 마이 성분 목록처럼 빼기만 하는 행이면 + 대신 ✕를 보인다 */
  removeOnly?: boolean;
}

/** 성분 사전의 한 줄: 이름·기능 칩·한 줄 설명 + 마이 성분 담기. 행을 누르면 설명 시트가 열린다. */
export function DictIngredientRow({ ingredient: d, saved, onOpen, onToggleSave, removeOnly }: DictIngredientRowProps) {
  const funcs = functionNames(dictToProductIngredient(d));
  return (
    <div className="flex items-start gap-3 border-b border-gray-10 py-3.5 last:border-0">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left active:opacity-60 transition-opacity">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold text-gray-100">{d.name}</span>
          {d.isAllergen && <span className="shrink-0 text-[11px] text-accent">⚠ 알레르기 주의</span>}
        </div>
        {d.nameEn && <p className="mt-0.5 truncate text-[11px] text-gray-50">{d.nameEn}</p>}
        {(funcs.length > 0 || d.flags.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {funcs.map((f) => (
              <span key={f} className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-medium text-primary">
                {f}
              </span>
            ))}
            {d.flags.includes('I') && (
              <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-medium text-accent">자극 소지</span>
            )}
            {d.flags.includes('F') && !d.isAllergen && (
              <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-medium text-accent">향료</span>
            )}
            {d.flags.includes('L') && (
              <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-medium text-accent">건조 알코올</span>
            )}
          </div>
        )}
        <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-gray-70">
          {d.description ?? '설명은 아직 준비 중이에요.'}
        </p>
        <p className="mt-1 text-[11px] text-gray-50">제품 {d.productCount.toLocaleString()}개에 들어 있어요</p>
      </button>
      <button
        type="button"
        onClick={onToggleSave}
        aria-label={removeOnly ? `${d.name} 삭제` : saved ? `${d.name} 마이 성분에서 빼기` : `${d.name} 마이 성분에 추가`}
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors ${
          removeOnly
            ? 'border-gray-20 text-gray-50'
            : saved
              ? 'border-primary bg-primary-light text-primary'
              : 'border-gray-20 text-gray-50'
        }`}
      >
        {removeOnly ? '✕' : saved ? '✓' : '+'}
      </button>
    </div>
  );
}
