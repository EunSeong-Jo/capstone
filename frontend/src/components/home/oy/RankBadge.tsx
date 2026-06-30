interface RankBadgeProps {
  rank: number; // 1-based
}

/** 올리브영식 블랙 사각 순위 뱃지 */
export function RankBadge({ rank }: RankBadgeProps) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 bg-oy-black text-white text-xs font-bold rounded-[3px]">
      {rank}
    </span>
  );
}
