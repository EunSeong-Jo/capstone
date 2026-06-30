import { ReactNode } from 'react';
import { Alternative } from '../../../../types';
import { OySectionHeader } from '../OySectionHeader';
import { HScroll } from '../HScroll';
import { AlternativeCardV } from '../../../alternatives/AlternativeCardV';

interface AlternativeCarouselProps {
  title: ReactNode;
  subtitle?: ReactNode;
  alternatives: Alternative[];
  onMore?: () => void;
}

/** 홈 대체품 추천 캐러셀 — 세로 대체품 카드 가로 스크롤 */
export function AlternativeCarousel({ title, subtitle, alternatives, onMore }: AlternativeCarouselProps) {
  return (
    <section className="px-4 py-5">
      <OySectionHeader title={title} subtitle={subtitle} onMore={onMore} />
      <HScroll>
        {alternatives.map((a) => (
          <AlternativeCardV key={a.id} alt={a} />
        ))}
      </HScroll>
    </section>
  );
}
