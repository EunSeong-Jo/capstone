import { useState } from 'react';

const TABS = ['홈', '여름특가', '신상위크', '브랜드위크'];

/** 올리브영식 상단 가로 탭 메뉴 — 활성=블랙 볼드 + underline */
export function OyTopTabs() {
  const [active, setActive] = useState(0); // '홈'

  return (
    <nav className="sticky top-14 z-20 bg-white border-b border-oy-line">
      <div className="flex gap-5 px-4 overflow-x-auto scrollbar-hide">
        {TABS.map((tab, i) => {
          const on = i === active;
          return (
            <button
              key={tab}
              onClick={() => setActive(i)}
              className="relative shrink-0 py-3 transition-colors"
            >
              <span className={`text-[17px] ${on ? 'font-extrabold text-oy-black' : 'font-medium text-oy-sub'}`}>
                {tab}
              </span>
              {on && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-oy-black rounded-full" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
