import { useState } from 'react';
import { OY_HERO_BANNERS } from '../../../../mocks/oliveyoung';
import { NumberIndicator } from '../Pagination';

/** 1. 메인 배너 캐러셀 — 그라데이션 배경 + 제품 이미지 + 카피, 좌우 peek */
export function HeroBannerCarousel() {
  const [idx, setIdx] = useState(0);
  const banners = OY_HERO_BANNERS;

  return (
    <section className="pt-2 pb-1">
      <div
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / (el.scrollWidth / banners.length));
          setIdx(Math.min(i, banners.length - 1));
        }}
      >
        {banners.map((b) => (
          <div
            key={b.id}
            className={`relative shrink-0 w-[88%] aspect-[4/5] rounded-2xl overflow-hidden snap-center bg-gradient-to-b ${b.gradient}`}
          >
            <img src={b.imageUrl} alt={b.title} className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-center">
              <p className="text-2xl font-extrabold text-white drop-shadow">{b.title}</p>
              <p className="text-2xl font-extrabold text-white drop-shadow">{b.subtitle}</p>
              <p className="text-sm text-white/90 mt-2 drop-shadow">{b.caption}</p>
              <div className="mt-3 flex justify-center">
                <span className="bg-white/30 backdrop-blur-sm rounded-full px-3 py-1">
                  <NumberIndicator current={1} total={17} />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 pt-3">
        {banners.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-oy-black' : 'w-1.5 bg-oy-line'}`} />
        ))}
      </div>
    </section>
  );
}
