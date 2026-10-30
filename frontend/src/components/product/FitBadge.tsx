import { useEffect, useState } from 'react';
import { loadFitBrief, peekFitBrief, type FitBrief } from '../../api/skinFit';
import { useSkinType } from '../../hooks/useSkinType';

/**
 * 상품 카드의 '내 피부 궁합' 사전 표시.
 *
 * 유사도 %처럼 목록에서 상세를 열기 전에 보이게 한다. 잘 맞음과 주의만 보여 준다 — 무난·판단 불가까지
 * 전부 붙이면 카드마다 배지가 달려 오히려 눈에 안 들어온다. 진단 전이거나 판정이 없으면 아무것도 그리지 않는다.
 * 요청은 `api/skinFit.ts`가 모아서 한 번에 보낸다.
 */
export function FitBadge({ productId, className = '' }: { productId: number; className?: string }) {
  const { skinType } = useSkinType();
  const key = skinType ? `${productId}:${skinType}` : null;
  const [loaded, setLoaded] = useState<{ key: string; brief?: FitBrief } | null>(null);

  useEffect(() => {
    if (!key || !skinType) return;
    let alive = true;
    loadFitBrief(productId, skinType)
      .then((brief) => alive && setLoaded({ key, brief }))
      .catch(() => alive && setLoaded({ key }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!skinType) return null;
  const brief = (loaded?.key === key ? loaded.brief : undefined) ?? peekFitBrief(productId, skinType);
  if (!brief || (brief.verdict !== 'good' && brief.verdict !== 'caution')) return null;

  return <FitPill verdict={brief.verdict} className={className} />;
}

/** 판정을 이미 아는 곳(대체품 카드 등)에서 쓰는 표시 부분. 좋음·주의가 아니면 그리지 않는다. */
export function FitPill({ verdict, className = '' }: { verdict?: string; className?: string }) {
  if (verdict !== 'good' && verdict !== 'caution') return null;
  const good = verdict === 'good';
  return (
    <span
      className={`inline-flex items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-1 text-center text-[11px] font-bold leading-none ${
        good ? 'bg-primary text-white' : 'bg-caution-strong text-white'
      } ${className}`}
    >
      {good ? '궁합 좋음' : '피부 주의'}
    </span>
  );
}
