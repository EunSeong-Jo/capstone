/**
 * 제품 ↔ 내 피부 궁합 (backend/app/api/skin_fit.py).
 *
 * 판정은 서버가 성분 기능 라벨(ingredient_functions)로 한다. 클라이언트는 피부타입만 넘긴다 —
 * 목록 정렬·배지·카드·전성분 칩이 같은 값을 보게 하려고 진단 5축 보정은 쓰지 않는다.
 */
import type { SkinType } from '../types';
import { request } from './client';
import { load, peek } from './queryCache';

/** good 잘 맞음 · ok 무난 · caution 주의 · unknown 판단 근거 부족 */
export type FitVerdict = 'good' | 'ok' | 'caution' | 'unknown';

/** 이유를 만든 성분. position은 전성분 표기 순서(1부터)라 목록 칩을 강조하는 데 쓴다 */
export interface FitIngredient {
  position: number;
  name: string;
}

export interface FitReason {
  kind: 'plus' | 'minus';
  text: string;
  ingredients: FitIngredient[];
}

export interface SkinFit {
  productId: number;
  skinType: SkinType;
  verdict: FitVerdict;
  /** 0~100. 판단 근거가 부족하면 null */
  score: number | null;
  reasons: FitReason[];
}

const FRESH_MS = 30 * 60 * 1000;

const keyOf = (id: number, t: SkinType) => `skinfit:${id}:${t}`;

export function loadSkinFit(id: number, skinType: SkinType): Promise<SkinFit> {
  return load(
    keyOf(id, skinType),
    () => request<SkinFit>(`/api/v1/products/${id}/skin-fit`, { skinType }),
    FRESH_MS,
  );
}

export function peekSkinFit(id: number, skinType: SkinType): SkinFit | undefined {
  return peek<SkinFit>(keyOf(id, skinType))?.value;
}

// ── 목록 카드 배지용 요약 (여러 제품을 한 번에) ─────────────────────────

export interface FitBrief {
  productId: number;
  verdict: FitVerdict;
  score: number | null;
}

const briefKey = (id: number, t: SkinType) => `skinfitb:${id}:${t}`;

interface Pending {
  ids: Set<number>;
  promise: Promise<Map<number, FitBrief>>;
}
const pending = new Map<string, Pending>();

/**
 * 같은 틱 안에 들어온 요청을 모아 한 번에 보낸다.
 *
 * 카드 서른 장이 각자 배지를 묻는데, 제품마다 요청을 보내면 서른 번이다. 그래서 짧게(30ms) 모았다가
 * 피부타입·5축이 같은 것끼리 묶어 `/api/v1/skin-fit?ids=`로 보낸다(서버 한도 60개씩).
 */
function enqueue(id: number, skinType: SkinType): Promise<FitBrief | undefined> {
  const group = skinType;
  let p = pending.get(group);
  if (!p) {
    const ids = new Set<number>();
    const promise = new Promise<Map<number, FitBrief>>((resolve, reject) => {
      setTimeout(async () => {
        pending.delete(group);
        const all = [...ids];
        const out = new Map<number, FitBrief>();
        try {
          for (let i = 0; i < all.length; i += 60) {
            const chunk = all.slice(i, i + 60);
            const res = await request<{ items: FitBrief[] }>('/api/v1/skin-fit', {
              ids: chunk.join(','),
              skinType,
            });
            res.items.forEach((it) => out.set(it.productId, it));
          }
          resolve(out);
        } catch (e) {
          reject(e);
        }
      }, 30);
    });
    p = { ids, promise };
    pending.set(group, p);
  }
  p.ids.add(id);
  return p.promise.then((m) => m.get(id));
}

export function loadFitBrief(id: number, skinType: SkinType): Promise<FitBrief | undefined> {
  return load(briefKey(id, skinType), () => enqueue(id, skinType), FRESH_MS);
}

export function peekFitBrief(id: number, skinType: SkinType): FitBrief | undefined {
  return peek<FitBrief | undefined>(briefKey(id, skinType))?.value;
}
