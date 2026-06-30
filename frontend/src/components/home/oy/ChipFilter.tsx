import { useState } from 'react';

interface ChipFilterProps {
  chips: string[];
  defaultIndex?: number;
  onSelect?: (chip: string, index: number) => void;
  className?: string;
}

/** 가로 스크롤 칩 필터 — 활성=블랙 배경 흰 글씨 / 비활성=흰 배경 회색 보더 */
export function ChipFilter({ chips, defaultIndex = 0, onSelect, className = '' }: ChipFilterProps) {
  const [active, setActive] = useState(defaultIndex);
  return (
    <div className={`flex gap-2 overflow-x-auto scrollbar-hide ${className}`}>
      {chips.map((chip, i) => {
        const on = i === active;
        return (
          <button
            key={chip}
            onClick={() => {
              setActive(i);
              onSelect?.(chip, i);
            }}
            className={`shrink-0 px-4 h-9 rounded-full text-sm font-medium transition-colors active:scale-95 ${
              on
                ? 'bg-oy-black text-white'
                : 'bg-white text-oy-sub border border-oy-line'
            }`}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
