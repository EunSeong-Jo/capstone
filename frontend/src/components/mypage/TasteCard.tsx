import { useState } from 'react';
import { fetchIngredients, type DictIngredient } from '../../api/ingredients';
import type { PreferenceIngredient } from '../../api/personalAi';
import { IngredientSheet } from '../product/IngredientSheet';
import { useToast } from '../../context/toast';
import { dictToProductIngredient } from '../../utils/ingredients';
import { usePreferences } from '../../hooks/usePersonalAi';

const SOURCE_LABEL: Record<string, string> = { review: '후기', repeat: '재구매', like: '찜', closet: '화장대' };

/**
 * "내 취향 성분" — 후기·찜·재구매·화장대에서 서버가 배운 내 성분 취향(읽기 전용, 카드 안 섹션).
 *
 * 신호가 모자라면(`active=false`) 취향이 있는 척하지 않고 어떻게 쌓는지만 안내한다. 켜지면 좋아하는 성분을 칩으로,
 * 어떤 신호에서 배웠는지를 한 줄로 보여 준다("왜 이 제품이 나에게 맞아 보이는지"를 성분 이름으로 설명할 수 있는 개인 모델).
 */
export function TasteCard() {
  const { preferences: p, loading } = usePreferences();
  const { showToast } = useToast();
  const [open, setOpen] = useState<{ pick: PreferenceIngredient; info: DictIngredient } | null>(null);

  // 칩을 누르면 성분 사전의 설명을 불러와 시트로 보여 준다(내가 좋아한 제품을 함께).
  const show = async (pick: PreferenceIngredient) => {
    try {
      const info = (await fetchIngredients({ ids: [pick.ingredientId], size: 1 })).items[0];
      if (!info) throw new Error('none');
      setOpen({ pick, info });
    } catch {
      showToast('성분 설명을 불러오지 못했어요.');
    }
  };

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-gray-10" aria-hidden />;
  if (!p) return null;

  const sources = Object.entries(p.sources)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`)
    .join(' · ');

  return (
    <section aria-label="내 취향 성분">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-extrabold text-gray-100">내 취향 성분</p>
        <span className="text-[11px] text-gray-50">{p.active ? '자동으로 배운 취향' : `신호 ${p.signalCount}/${p.minSignals}`}</span>
      </div>

      {!p.active ? (
        <p className="mt-2 text-[12px] leading-relaxed text-gray-50">{p.message}</p>
      ) : (
        <>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {p.liked.slice(0, 6).map((i) => (
              <li key={i.ingredientId}>
                <button
                  type="button"
                  onClick={() => show(i)}
                  className="rounded-full bg-ob-surface px-2.5 py-1 text-[12px] font-bold text-ob-green-deep active:scale-95"
                >
                  {i.name}
                </button>
              </li>
            ))}
          </ul>
          {p.disliked.length > 0 && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-gray-50">
              별로였던 제품에 많던 성분: <span className="font-semibold text-gray-70">{p.disliked.slice(0, 3).map((i) => i.name).join(', ')}</span>
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-gray-50">{sources}에서 배웠어요 · 성분을 누르면 설명이 나와요</p>
        </>
      )}
      <IngredientSheet
        ingredient={open ? dictToProductIngredient(open.info) : null}
        onClose={() => setOpen(null)}
        footer={
          open &&
          open.pick.products.length > 0 && (
            <div className="rounded-xl bg-ob-surface px-3.5 py-3">
              <p className="text-[12px] font-extrabold text-ob-green-deep">내가 좋아한 제품에 들어 있어요</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {open.pick.products.slice(0, 4).map((x) => (
                  <li key={x.id} className="text-[12px] leading-snug text-gray-70">
                    · {x.name}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      />
    </section>
  );
}
