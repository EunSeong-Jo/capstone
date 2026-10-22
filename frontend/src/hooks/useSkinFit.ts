import { useEffect, useState } from 'react';
import { SkinFit, loadSkinFit, peekSkinFit } from '../api/skinFit';
import { useSkinType } from './useSkinType';

interface UseSkinFitResult {
  fit: SkinFit | null;
  /** 판정 요청 중 */
  loading: boolean;
  /** 진단 결과를 아직 모르거나 진단을 한 적이 없으면 판정할 수 없다 */
  needsDiagnosis: boolean;
  error: boolean;
}

/**
 * 이 제품이 내 피부에 맞는가.
 *
 * 피부타입은 진단 결과(없으면 데모 페르소나)를 쓴다. 판정은 피부타입만으로 정한다 — 목록 정렬·배지·전성분 칩이
 * 같은 값을 보게 하려는 것이다(진단 5축 보정은 쓰지 않는다).
 * 진단을 안 한 사람에게 기본 타입으로 판정해 주지 않는다 — 단정이 되기 때문이다.
 */
export function useSkinFit(productId: number | undefined): UseSkinFitResult {
  const { skinType, loading: typeLoading } = useSkinType();
  const valid = productId !== undefined && Number.isFinite(productId) && productId > 0;

  const key = valid && skinType ? `${productId}:${skinType}` : null;
  const [loaded, setLoaded] = useState<{ key: string; fit: SkinFit | null; error: boolean } | null>(null);

  useEffect(() => {
    if (!key || !valid || !skinType) return;
    let alive = true;
    loadSkinFit(productId as number, skinType)
      .then((fit) => alive && setLoaded({ key, fit, error: false }))
      .catch(() => alive && setLoaded({ key, fit: null, error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!valid) return { fit: null, loading: false, needsDiagnosis: false, error: false };
  if (typeLoading) return { fit: null, loading: true, needsDiagnosis: false, error: false };
  if (!skinType) return { fit: null, loading: false, needsDiagnosis: true, error: false };

  const cached = peekSkinFit(productId as number, skinType);
  const current = loaded?.key === key ? loaded : null;
  return {
    fit: current?.fit ?? cached ?? null,
    loading: !current && !cached,
    needsDiagnosis: false,
    error: current?.error ?? false,
  };
}
