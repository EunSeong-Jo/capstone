import { useState } from 'react';
import type { DictIngredient } from '../../api/ingredients';
import { useIngredientsByIds } from '../../hooks/useIngredientDict';
import type { useMyIngredients } from '../../hooks/useMyIngredients';
import { DictIngredientRow } from './DictIngredientRow';
import { IngredientDetailSheet } from './IngredientDetailSheet';

interface MyIngredientsPanelProps {
  my: ReturnType<typeof useMyIngredients>;
  onFindProducts: (name: string) => void;
}

/** 마이 성분: 담아 둔 성분을 설명과 함께 보고, 든 제품을 찾으러 간다. 목록(id)은 이 기기에, 설명은 서버에서 읽는다. */
export function MyIngredientsPanel({ my, onFindProducts }: MyIngredientsPanelProps) {
  const ids = my.items.map((i) => i.id);
  const { items: fetched, loading, error } = useIngredientsByIds(ids);
  const [selected, setSelected] = useState<DictIngredient | null>(null);

  if (my.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 pt-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-20 text-lg font-bold text-gray-50">!</span>
        <p className="text-sm font-semibold text-gray-100">즐겨찾는 성분이 없어요</p>
        <p className="text-xs leading-relaxed text-gray-50">
          성분 사전에서 + 버튼을 눌러
          <br />
          나만의 성분을 관리해 보세요.
        </p>
      </div>
    );
  }

  // 서버 응답이 오기 전·실패했을 때도 담은 이름은 보여 준다(이 기기에 저장된 사본).
  const byId = new Map(fetched.map((d) => [d.id, d]));
  const rows: (DictIngredient | { id: number; name: string })[] = my.items.map((i) => byId.get(i.id) ?? i);

  return (
    <div>
      {error && <p className="mb-2 text-xs text-accent">설명을 불러오지 못했어요. 이름만 보여 드려요.</p>}
      {loading && <p className="mb-2 text-xs text-gray-50">불러오는 중…</p>}
      {rows.map((r) =>
        'productCount' in r ? (
          <DictIngredientRow
            key={r.id}
            ingredient={r}
            saved
            removeOnly
            onOpen={() => setSelected(r)}
            onToggleSave={() => my.remove(r.id)}
          />
        ) : (
          <div key={r.id} className="flex items-center justify-between border-b border-gray-10 py-3.5 last:border-0">
            <span className="text-sm text-gray-100">{r.name}</span>
            <button onClick={() => my.remove(r.id)} aria-label={`${r.name} 삭제`} className="text-sm text-gray-50 active:scale-90">
              ✕
            </button>
          </div>
        ),
      )}

      <IngredientDetailSheet
        ingredient={selected}
        onClose={() => setSelected(null)}
        saved={selected ? my.has(selected.id) : false}
        onToggleSave={() => {
          if (selected) my.remove(selected.id);
          setSelected(null);
        }}
        onFindProducts={(name) => {
          setSelected(null);
          onFindProducts(name);
        }}
      />
    </div>
  );
}
