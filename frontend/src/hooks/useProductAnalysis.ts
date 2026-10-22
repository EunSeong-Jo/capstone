import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { ProductAnalysis, loadAnalysis, peekAnalysis } from '../api/analysis';
import { useCloset } from '../context/closet';
import { useDiagnosis } from '../context/diagnosis';
import { useSkinType } from './useSkinType';

interface Result {
  analysis: ProductAnalysis | null;
  /** 사진 분석이 반영된 진단인가 */
  photoUsed: boolean;
  loading: boolean;
  notFound: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * 내 제품 성분 분석 조회.
 *
 * 내 피부타입(진단 후)과 화장대의 다른 제품 id를 함께 보낸다 — 서버가 같은 카테고리만 골라 "내 화장대 안에서의 위치"를
 * 계산한다. 피부타입·화장대를 아직 모르는 동안에는 요청을 미뤄 두 번 받지 않는다.
 */
export function useProductAnalysis(productId: number | undefined): Result {
  const { skinType, loading: typeLoading } = useSkinType();
  const { items, loading: closetLoading } = useCloset();
  // 내 피부 분석 결과(문답 + 얼굴 사진 분석을 합친 진단 5축). 진단 전이면 없다.
  const diag = useDiagnosis().result;
  const axes = diag?.scores ?? null;
  const axesKey = axes ? Object.values(axes).join(',') : '';
  const closetIds = useMemo(() => items.map((c) => c.id), [items]);
  const closetKey = closetIds.join(',');

  const valid = productId !== undefined && Number.isFinite(productId) && productId > 0;
  const waiting = typeLoading || closetLoading;
  const [nonce, setNonce] = useState(0);
  const key = `${productId}:${skinType ?? ''}:${closetKey}:${axesKey}#${nonce}`;
  const [loaded, setLoaded] = useState<
    { key: string; analysis: ProductAnalysis | null; notFound: boolean; error: boolean } | null
  >(null);

  useEffect(() => {
    if (!valid || waiting) return;
    let alive = true;
    loadAnalysis(productId as number, skinType, closetIds, axes)
      .then((analysis) => alive && setLoaded({ key, analysis, notFound: false, error: false }))
      .catch((e: unknown) => {
        if (!alive) return;
        const notFound = e instanceof ApiError && e.status === 404;
        setLoaded({ key, analysis: null, notFound, error: !notFound });
      });
    return () => {
      alive = false;
    };
    // closetIds·axes는 key에 값으로 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, waiting]);

  const photoUsed = !!diag?.photoUsed;
  if (!valid) return { analysis: null, photoUsed, loading: false, notFound: true, error: false, reload: () => {} };
  const cached = !waiting ? peekAnalysis(productId as number, skinType, closetIds, axes) : undefined;
  const current = !waiting && loaded?.key === key ? loaded : null;
  return {
    analysis: current?.analysis ?? cached ?? null,
    photoUsed,
    loading: waiting || (!current && !cached),
    notFound: current?.notFound ?? false,
    error: current?.error ?? false,
    reload: () => setNonce((n) => n + 1),
  };
}
