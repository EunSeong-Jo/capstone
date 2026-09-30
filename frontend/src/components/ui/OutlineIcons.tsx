/**
 * 선 굵기 1.8로 통일한 공용 아이콘.
 *
 * 같은 SVG가 여러 화면에 통째로 복사돼 있었다. 한쪽만 고치면 굵기나 색이
 * 어긋난다. 장바구니 아이콘은 `ProductActionIcons.tsx`의 카트 모양으로 옮겼다.
 *
 * 색은 `currentColor`라 쓰는 쪽이 `text-*`로 정한다. 그래야 같은 아이콘을
 * 밝은 배경과 어두운 배경에서 다시 만들지 않아도 된다.
 */
interface OutlineIconProps {
  size?: number;
  className?: string;
}

/** 하트(찜). `filled`면 안이 채워진다 — 찜한 상태. */
export function HeartIcon({
  size = 20,
  filled = false,
  className = '',
}: OutlineIconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      className={className}
    >
      <path
        d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
