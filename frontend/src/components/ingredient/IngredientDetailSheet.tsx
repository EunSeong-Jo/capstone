import type { DictIngredient } from '../../api/ingredients';
import { IngredientSheet } from '../product/IngredientSheet';
import { dictToProductIngredient } from '../../utils/ingredients';

interface IngredientDetailSheetProps {
  ingredient: DictIngredient | null;
  onClose: () => void;
  saved: boolean;
  onToggleSave: () => void;
  onFindProducts: (name: string) => void;
}

/** 성분 사전·마이 성분이 같이 쓰는 설명 시트: 전성분 칩의 시트에 "마이 성분 담기 / 든 제품 보기"를 붙인다. */
export function IngredientDetailSheet({ ingredient, onClose, saved, onToggleSave, onFindProducts }: IngredientDetailSheetProps) {
  return (
    <IngredientSheet
      ingredient={ingredient ? dictToProductIngredient(ingredient) : null}
      onClose={onClose}
      isMine={saved}
      footer={
        ingredient && (
          <>
            <button
              type="button"
              onClick={() => onFindProducts(ingredient.name)}
              className="h-11 rounded-xl bg-primary text-sm font-semibold text-white active:scale-[.98]"
            >
              이 성분이 든 제품 보기 ({ingredient.productCount.toLocaleString()})
            </button>
            <button
              type="button"
              onClick={onToggleSave}
              className={`h-11 rounded-xl border text-sm font-semibold active:scale-[.98] ${
                saved ? 'border-primary bg-primary-light text-primary' : 'border-gray-20 text-gray-100'
              }`}
            >
              {saved ? '✓ 마이 성분에 담겼어요 (누르면 빼기)' : '+ 마이 성분에 담기'}
            </button>
          </>
        )
      }
    />
  );
}
