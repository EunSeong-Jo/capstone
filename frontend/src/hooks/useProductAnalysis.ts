import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { ProductAnalysis, loadAnalysis, peekAnalysis } from '../api/analysis';
import { useCloset } from '../context/closet';
import { useSkinStateSource, type SkinStateSource } from './useSkinStateSource';
import { useSkinType } from './useSkinType';

interface Result {
  analysis: ProductAnalysis | null;
  /** 내 피부 상태(5축)를 어디서 가져왔는가 */
  stateSource: SkinStateSource;
  /** source가 photo일 때 분석 시각 */
  photoAt: string | null;
  /** source가 photo일 때 최근 분석(피부 분류·확장 여부) */
  photo: import('../api/skinPhoto').AnalysisDto | null;
  /** 새 사진 분석을 받은 뒤 이력을 다시 읽는다 */
  reloadPhoto: () => void;
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
  // 내 피부 상태(5축): 최근 AI 사진 분석 우선, 없으면 진단(문답). 출처는 useSkinStateSource가 정한다.
  const { source: stateSource, axes, photoAt, photo, loading: stateLoading, reloadPhoto } = useSkinStateSource();
  // 사진 분석이 출처면 분석된 항목 전부를 서버에 보낸다 ('oiliness:79,moisture:74,…')
  const concerns = useMemo(
    () => (photo ? photo.concerns.map((c) => `${c.key}:${Math.round(c.score)}`).join(',') : ''),
    [photo],
  );
  const axesKey = axes ? Object.values(axes).join(',') : '';
  const closetIds = useMemo(() => items.map((c) => c.id), [items]);
  const closetKey = closetIds.join(',');

  const valid = productId !== undefined && Number.isFinite(productId) && productId > 0;
  const waiting = typeLoading || closetLoading || stateLoading;
  const [nonce, setNonce] = useState(0);
  const key = `${productId}:${skinType ?? ''}:${closetKey}:${axesKey}:${concerns}#${nonce}`;
  const [loaded, setLoaded] = useState<
    { key: string; analysis: ProductAnalysis | null; notFound: boolean; error: boolean } | null
  >(null);

  useEffect(() => {
    if (!valid || waiting) return;
    let alive = true;
    loadAnalysis(productId as number, skinType, closetIds, axes, concerns)
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

  const extra = { stateSource, photoAt, photo, reloadPhoto };
  if (!valid) return { analysis: null, ...extra, loading: false, notFound: true, error: false, reload: () => {} };
  const cached = !waiting ? peekAnalysis(productId as number, skinType, closetIds, axes, concerns) : undefined;
  const current = !waiting && loaded?.key === key ? loaded : null;
  return {
    analysis: current?.analysis ?? cached ?? null,
    ...extra,
    loading: waiting || (!current && !cached),
    notFound: current?.notFound ?? false,
    error: current?.error ?? false,
    reload: () => setNonce((n) => n + 1),
  };
}
