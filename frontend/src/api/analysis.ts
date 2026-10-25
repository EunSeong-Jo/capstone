/**
 * 내 제품 성분 분석 (backend/app/api/analysis.py).
 *
 * 상세(`/products/{id}`)가 "이 상품이 무엇인가"라면 이 분석은 "내가 쓰는 이 제품이 내 피부에 어떤가"를 해석한다.
 * 기능별 강도·핵심 성분·주의 성분·전성분 해부도·내 화장대 안의 위치가 한 번에 온다.
 */
import type { SkinType } from '../types';
import type { FitReason, FitVerdict } from './skinFit';
import { request } from './client';
import { load, peek } from './queryCache';

export interface FunctionStrength {
  /** H B S W A O P E U */
  code: string;
  name: string;
  /** 0~100 */
  value: number;
  /** 그 기능을 가진 활성·에몰리언트 성분 수 */
  count: number;
}

export interface KeyIngredient {
  position: number;
  name: string;
  functions: string[];
  /** 내 피부타입의 선호 기능을 가졌는가 */
  recommended: boolean;
}

export type CautionKind = 'listed' | 'fragrance' | 'alcohol' | 'irritant';

export interface CautionGroup {
  kind: CautionKind;
  label: string;
  ingredients: { position: number; name: string }[];
}

export interface AnatomyItem {
  position: number;
  name: string;
  /** a활성 e에몰리언트 s용매 f계면활성 t점증 p방부 x기타. 라벨이 없으면 null */
  role: string | null;
  functions: string[];
  caution: CautionKind | null;
}

export interface ClosetPosition {
  category: string;
  /** 같은 카테고리의 다른 보유 제품 수 */
  ownedCount: number;
  overlaps: { function: string; name: string; products: { id: number; name: string }[] }[];
  gaps: { function: string; name: string }[];
  similar: { id: number; name: string; percent: number }[];
}

/** AI 사진 분석 항목 하나와 이 제품의 대응. 점수는 0~100이고 높을수록 좋다 */
export interface ConcernState {
  key: string;
  name: string;
  score: number;
  /** focus 신경 쓸 부분 · mild 약간 · fine 좋은 편 */
  concern: 'focus' | 'mild' | 'fine';
  level: string;
  need: string[];
  coverage: number;
  /** good 충분히 도움 · some 도움은 되나 부족 · lack 돕는 성분 부족 · fine 신경 쓸 필요 적음 · na 화장품 성분으로 바뀌기 어려운 항목 */
  status: 'good' | 'some' | 'lack' | 'fine' | 'na';
  message: string;
  risk: string | null;
  addressable: boolean;
}

/** 내 피부 상태(진단 5축) 한 축과 이 제품의 대응 */
export interface SkinStateAxis {
  axis: 'moisture' | 'oil' | 'sensitivity' | 'pigmentation' | 'trouble';
  name: string;
  /** 진단 점수 0~10(원본) */
  score: number;
  /** 건강도 0~100(높을수록 좋음) — 사진 분석 점수와 같은 단위 */
  health: number;
  /** focus 신경 쓸 부분 · mild 약간 · fine 괜찮음 */
  concern: 'focus' | 'mild' | 'fine';
  /** '건조한 편' 같은 표현 */
  level: string;
  need: string[];
  coverage: number;
  /** good 충분히 도움 · some 도움은 되나 부족 · lack 돕는 성분 부족 · fine 신경 쓸 필요 적음 */
  status: 'good' | 'some' | 'lack' | 'fine';
  message: string;
  risk: string | null;
}

export interface ProductAnalysis {
  productId: number;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string | null;
  skinType: SkinType | null;
  labeledCount: number;
  totalCount: number;
  fit: { verdict: FitVerdict; score: number | null; reasons: FitReason[] } | null;
  /** 내 피부타입이 중요하게 보는 기능 코드들. 진단 전이면 비어 있다 */
  focusFunctions: string[];
  /** 진단 5축을 보냈을 때만 채워진다 */
  skinState: SkinStateAxis[];
  skinStateSummary: string | null;
  /** 사진 분석 항목을 보냈을 때: 분석된 항목 전부(무료 7개·구독 15개)와 대응 */
  concernState: ConcernState[];
  concernSummary: string | null;
  functions: FunctionStrength[];
  keyIngredients: KeyIngredient[];
  cautions: CautionGroup[];
  anatomy: AnatomyItem[];
  closet: ClosetPosition | null;
}

const FRESH_MS = 5 * 60 * 1000;
const keyOf = (id: number, type: string | null, closet: string, axes: string, concerns: string) =>
  `analysis:${id}:${type ?? ''}:${closet}:${axes}:${concerns}`;

/** 진단 5축. 서버는 다섯 개가 모두 있을 때만 "내 피부 상태와 견주기"를 계산한다. */
export type SkinAxes = Record<'moisture' | 'oil' | 'sensitivity' | 'pigmentation' | 'trouble', number>;
const axesKey = (a?: SkinAxes | null) => (a ? Object.values(a).join(',') : '');

/** closetIds는 화장대 제품 id들. 서버가 같은 카테고리만 골라 쓴다(자기 자신은 무시). */
export function loadAnalysis(
  id: number,
  skinType: SkinType | null,
  closetIds: number[],
  axes?: SkinAxes | null,
  concerns?: string,
): Promise<ProductAnalysis> {
  const ids = closetIds.filter((c) => c !== id).sort((a, b) => a - b).slice(0, 100).join(',');
  return load(
    keyOf(id, skinType, ids, axesKey(axes), concerns ?? ''),
    () =>
      request<ProductAnalysis>(`/api/v1/products/${id}/analysis`, {
        ...(skinType ? { skinType } : {}),
        ...(ids ? { closetIds: ids } : {}),
        ...(axes ?? {}),
        ...(concerns ? { concerns } : {}),
      }),
    FRESH_MS,
  );
}

export function peekAnalysis(
  id: number,
  skinType: SkinType | null,
  closetIds: number[],
  axes?: SkinAxes | null,
  concerns?: string,
): ProductAnalysis | undefined {
  const ids = closetIds.filter((c) => c !== id).sort((a, b) => a - b).slice(0, 100).join(',');
  return peek<ProductAnalysis>(keyOf(id, skinType, ids, axesKey(axes), concerns ?? ''))?.value;
}
