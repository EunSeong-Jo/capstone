/**
 * 내 화장대와 비슷한 추천 — 화장대 **전체**를 기준으로.
 *
 * 예전 홈은 화장대 첫 항목 하나만 기준으로 삼아서, 스킨케어를 여러 개 써도 맨 앞 제품(선크림일 수도 있다)의
 * 대체품만 나왔다. 여기서는 화장대 항목마다 `/similar`(같은 카테고리 안에서 계산된 결과)를 물어 합친다.
 *
 *   - 후보마다 **가장 비슷한 화장대 제품**과의 점수를 쓰고, 어느 제품 기준인지(`basedOn`)를 함께 낸다
 *   - 이미 화장대에 있는 제품과 같은 제품의 다른 용량은 뺀다 (안 빼면 쓰던 제품이 "100% 비슷"으로 나온다)
 *   - 점수 내림차순. 서로 다른 카테고리는 섞여도 각자 자기 카테고리 안에서 계산된 점수라 비교할 수 있다
 *
 * 결과는 **카테고리별**로 나눈다(스킨케어·마스크팩·클렌징·선케어). 홈이 카테고리마다 구역을 따로 그린다.
 *
 * useSwapSuggestion과 같은 이유로 항목 수를 제한한다. 요청은 queryCache가 공유해 홈의 다른 구역이 같은 제품을 물어도
 * 한 번만 나간다.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadSimilarProducts } from '../api/similar';
import { load, peek } from '../api/queryCache';
import type { ClosetItem } from '../context/closet';
import type { Alternative, SkinType } from '../types';
import { splitSameProductVariants, toAlternative } from '../utils/alternatives';

/**
 * 카테고리마다 물어볼 화장대 항목 수. 최근에 넣은 것일수록 지금 쓰는 제품일 가능성이 높다.
 * 전체로 자르면 한 카테고리가 다른 카테고리를 밀어내므로 카테고리 안에서 자른다.
 */
const SEEDS_PER_CATEGORY = 4;
const PER_SEED_LIMIT = 10;
/** 카테고리 구역마다 보여 줄 개수 */
const SHOW = 10;
const FRESH_MS = 30 * 60 * 1000;
export interface ClosetSimilarGroup {
  category: string;
  /** 이 카테고리에서 화장대에 있는 제품 수 */
  ownedCount: number;
  alternatives: Alternative[];
  /** 더보기로 보낼 기준 제품: 1위 후보가 비슷했던 화장대 제품 */
  seedId: number | undefined;
}

const EMPTY: ClosetSimilarGroup[] = [];

interface Seed {
  id: number;
  brand: string;
  name: string;
  price: number;
  category: string;
}

async function compute(
  seeds: Seed[],
  owned: Set<number>,
  fitFor?: SkinType,
): Promise<ClosetSimilarGroup[]> {
  const results = await Promise.all(
    seeds.map(async (seed) => {
      try {
        const res = await loadSimilarProducts(seed.id, { limit: PER_SEED_LIMIT, fitFor });
        const mapped = res.items.map((item) => toAlternative(item, seed, fitFor));
        // 같은 제품의 다른 용량은 대체품이 아니다
        const { alternatives } = splitSameProductVariants(seed, mapped);
        return alternatives.map((a) => ({ ...a, basedOn: seed.name }));
      } catch {
        // 화장대에 저장된 id가 카탈로그에 없거나(404) 일시 오류 — 그 항목만 건너뛴다
        return [] as Alternative[];
      }
    }),
  );

  // 같은 제품이 여러 화장대 제품에서 뽑히면 가장 비슷했던 쪽만 남긴다
  const best = new Map<number, Alternative>();
  for (const a of results.flat()) {
    if (owned.has(a.id)) continue;
    const prev = best.get(a.id);
    if (!prev || a.similarityScore > prev.similarityScore) best.set(a.id, a);
  }

  const byCategory = new Map<string, Alternative[]>();
  for (const a of best.values()) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }
  const ownedByCategory = new Map<string, number>();
  for (const s of seeds) ownedByCategory.set(s.category, (ownedByCategory.get(s.category) ?? 0) + 1);

  return [...byCategory.entries()]
    .map(([category, list]) => {
      const alternatives = list.sort((a, b) => b.similarityScore - a.similarityScore).slice(0, SHOW);
      return {
        category,
        ownedCount: ownedByCategory.get(category) ?? 0,
        alternatives,
        seedId: alternatives[0]?.seedId,
      };
    })
    // 화장대에 많이 가진 카테고리부터
    .sort((a, b) => b.ownedCount - a.ownedCount || a.category.localeCompare(b.category));
}

export function useClosetSimilar(
  items: ClosetItem[],
  loadingCloset: boolean,
  fitFor?: SkinType,
): { groups: ClosetSimilarGroup[]; loading: boolean } {
  const seedKey = useMemo(() => {
    const perCategory = new Map<string, number>();
    const picked = [...items]
      .sort((a, b) => b.addedAt - a.addedAt)
      .filter((c) => {
        const n = perCategory.get(c.category) ?? 0;
        if (n >= SEEDS_PER_CATEGORY) return false;
        perCategory.set(c.category, n + 1);
        return true;
      })
      .map<Seed>((c) => ({
        id: c.id,
        brand: c.brand,
        name: c.name,
        price: c.price ?? 0,
        category: c.category,
      }));
    return JSON.stringify(picked);
  }, [items]);
  const ownedKey = useMemo(() => items.map((c) => c.id).sort((a, b) => a - b).join(','), [items]);
  const cacheKey = `closetSimilar:${seedKey}:${ownedKey}:${fitFor ?? ''}`;
  const empty = seedKey === '[]';

  const [loaded, setLoaded] = useState<{ key: string; groups: ClosetSimilarGroup[] } | null>(null);

  useEffect(() => {
    if (empty || loadingCloset) return;
    let alive = true;
    load(
      cacheKey,
      () =>
        compute(
          JSON.parse(seedKey) as Seed[],
          new Set(ownedKey ? ownedKey.split(',').map(Number) : []),
          fitFor,
        ),
      FRESH_MS,
    )
      .then((groups) => alive && setLoaded({ key: cacheKey, groups }))
      .catch(() => alive && setLoaded({ key: cacheKey, groups: EMPTY }));
    return () => {
      alive = false;
    };
  }, [cacheKey, seedKey, ownedKey, empty, loadingCloset, fitFor]);

  if (empty) return { groups: EMPTY, loading: false };
  const cached = peek<ClosetSimilarGroup[]>(cacheKey)?.value;
  const groups = loaded?.key === cacheKey ? loaded.groups : cached;
  return { groups: groups ?? EMPTY, loading: groups === undefined };
}
