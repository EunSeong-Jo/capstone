interface PriceTagProps {
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  /** stacked: 원가(위) / 할인율+현재가(아래) — 그리드 카드용. inline: 한 줄에 할인율 현재가 원가 — 랭킹 카드용 */
  layout?: 'stacked' | 'inline';
}

function won(n: number) {
  return `${n.toLocaleString()}원`;
}

export function PriceTag({ price, originalPrice, discountPercent, layout = 'stacked' }: PriceTagProps) {
  if (layout === 'inline') {
    return (
      <div className="flex items-baseline gap-1">
        {discountPercent !== undefined && (
          <span className="text-sm font-bold text-accent">{discountPercent}%</span>
        )}
        <span className="text-base font-bold text-gray-100">{won(price)}</span>
        {originalPrice !== undefined && (
          <span className="text-xs text-gray-50 line-through">{won(originalPrice)}</span>
        )}
      </div>
    );
  }

  return (
    <div>
      {originalPrice !== undefined && (
        <div className="text-xs text-gray-50 line-through">{won(originalPrice)}</div>
      )}
      <div className="flex items-baseline gap-1">
        {discountPercent !== undefined && (
          <span className="text-sm font-bold text-accent">{discountPercent}%</span>
        )}
        <span className="text-base font-bold text-gray-100">{won(price)}</span>
      </div>
    </div>
  );
}
