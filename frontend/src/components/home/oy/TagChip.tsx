interface TagChipProps {
  label: string;
}

/** 상품 태그칩 (BEST/쿠폰/오늘드림/증정 = 연회색, 오특 = 레드) */
export function TagChip({ label }: TagChipProps) {
  const isHot = label === '오특' || label === '세일';
  return (
    <span
      className={`inline-flex items-center px-1.5 h-[18px] rounded text-[11px] font-medium ${
        isHot ? 'bg-oy-red/10 text-oy-red' : 'bg-oy-chip text-oy-sub'
      }`}
    >
      {label}
    </span>
  );
}
