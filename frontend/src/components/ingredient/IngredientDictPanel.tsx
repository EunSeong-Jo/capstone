import { useState } from 'react';
import type { DictIngredient } from '../../api/ingredients';
import { useIngredientCategories, useIngredientList } from '../../hooks/useIngredientDict';
import type { useMyIngredients } from '../../hooks/useMyIngredients';
import { MY_INGREDIENT_MAX } from '../../hooks/useMyIngredients';
import { useToast } from '../../context/toast';
import { DictIngredientRow } from './DictIngredientRow';
import { IngredientDetailSheet } from './IngredientDetailSheet';

interface IngredientDictPanelProps {
  my: ReturnType<typeof useMyIngredients>;
  /** 성분 이름으로 제품을 찾으러 간다(검색 화면의 성분검색) */
  onFindProducts: (name: string) => void;
}

const GROUP_TITLE = { function: '기능으로 찾기', caution: '주의해서 볼 성분' } as const;

/** 성분 사전: 분류를 고르거나 이름을 찍어 찾는다. 분류와 설명은 서버(ingredient_functions·descriptions)에서 온다. */
export function IngredientDictPanel({ my, onFindProducts }: IngredientDictPanelProps) {
  const { showToast } = useToast();
  const cats = useIngredientCategories();
  const [catId, setCatId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<DictIngredient | null>(null);

  const term = q.trim();
  const cat = cats.items.find((c) => c.id === catId) ?? null;
  const browsing = catId !== null || term.length > 0;
  const list = useIngredientList({ category: catId ?? undefined, q: term || undefined }, browsing);

  const toggle = (d: DictIngredient) => {
    if (my.has(d.id)) {
      my.remove(d.id);
      return;
    }
    if (!my.add({ id: d.id, name: d.name })) {
      showToast(`마이 성분은 최대 ${MY_INGREDIENT_MAX}개까지 담을 수 있어요`);
      return;
    }
    showToast('마이 성분에 담았어요');
  };

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="성분 이름으로 찾기 (예: 히알루론산)"
        aria-label="성분 이름 검색"
        className="mb-4 h-10 w-full rounded-xl border border-gray-20 bg-white px-3 text-sm outline-none focus:border-primary"
      />

      {!browsing ? (
        cats.loading ? (
          <div className="grid animate-pulse grid-cols-2 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-10" />
            ))}
          </div>
        ) : cats.error ? (
          <div className="pt-12 text-center">
            <p className="text-sm text-gray-70">{cats.error}</p>
            <button onClick={cats.reload} className="mt-3 rounded-xl border border-gray-20 px-4 py-2 text-sm font-medium active:scale-95">
              다시 시도
            </button>
          </div>
        ) : (
          (['function', 'caution'] as const).map((g) => (
            <section key={g} className="mb-5">
              <h3 className="mb-2 text-[13px] font-bold text-gray-100">{GROUP_TITLE[g]}</h3>
              <div className="grid grid-cols-2 gap-2">
                {cats.items
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCatId(c.id)}
                      className="flex items-center gap-2.5 rounded-xl border border-gray-20 bg-white px-3 py-3 text-left active:scale-[.98]"
                    >
                      <span className="text-xl">{c.emoji}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-100">{c.label}</span>
                        <span className="block text-[11px] text-gray-50">{c.count.toLocaleString()}개</span>
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          ))
        )
      ) : (
        <div>
          {cat && (
            <div className="mb-2">
              <button onClick={() => setCatId(null)} className="text-xs text-gray-70 active:opacity-60">
                ‹ 전체 분류
              </button>
              <h3 className="mt-1 flex items-center gap-1.5 text-[15px] font-extrabold text-gray-100">
                <span>{cat.emoji}</span>
                {cat.label}
                <span className="text-xs font-normal text-gray-50">{cat.count.toLocaleString()}개</span>
              </h3>
              <p className="mt-0.5 text-xs text-gray-70">{cat.blurb}</p>
            </div>
          )}
          {!cat && <p className="mb-1 text-xs text-gray-50">{list.loading && list.items.length === 0 ? '찾는 중…' : `검색 결과 ${list.total.toLocaleString()}개`}</p>}

          {list.error && list.items.length === 0 ? (
            <div className="pt-10 text-center">
              <p className="text-sm text-gray-70">{list.error}</p>
              <button onClick={list.reload} className="mt-3 rounded-xl border border-gray-20 px-4 py-2 text-sm font-medium active:scale-95">
                다시 시도
              </button>
            </div>
          ) : !list.loading && list.items.length === 0 ? (
            <p className="pt-10 text-center text-sm text-gray-50">찾는 성분이 없어요. 다른 이름으로 검색해 보세요.</p>
          ) : (
            <>
              {list.items.map((d) => (
                <DictIngredientRow
                  key={d.id}
                  ingredient={d}
                  saved={my.has(d.id)}
                  onOpen={() => setSelected(d)}
                  onToggleSave={() => toggle(d)}
                />
              ))}
              {list.loading && <p className="py-4 text-center text-xs text-gray-50">불러오는 중…</p>}
              {list.hasMore && !list.loading && (
                <button onClick={list.more} className="mt-3 h-10 w-full rounded-xl border border-gray-20 text-sm font-medium text-gray-70 active:scale-[.98]">
                  더 보기 ({list.items.length.toLocaleString()} / {list.total.toLocaleString()})
                </button>
              )}
            </>
          )}
        </div>
      )}

      <IngredientDetailSheet
        ingredient={selected}
        onClose={() => setSelected(null)}
        saved={selected ? my.has(selected.id) : false}
        onToggleSave={() => selected && toggle(selected)}
        onFindProducts={(name) => {
          setSelected(null);
          onFindProducts(name);
        }}
      />
    </div>
  );
}
