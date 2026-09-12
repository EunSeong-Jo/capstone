/** 단가 표기.
 *
 * 마스크팩에 '20매' 같은 대용량이 섞여 있어 총액만으로는 비교가 어긋난다 —
 * 80,000원/20매가 3,000원/1매보다 27배 비싼 것처럼 보인다. 총액 아래에
 * 단가를 한 줄 덧붙여 그 착시를 없앤다.
 *
 * 서버는 라벨을 코드(`sheet`·`ml10`…)로 내고 문구는 여기서 정한다.
 * 서버가 '1매당'을 내면 문구를 바꿀 때마다 서버를 고쳐야 한다.
 */
const UNIT_LABEL: Record<string, string> = {
  sheet: '1매당',
  ml10: '10ml당',
  g10: '10g당',
  piece: '1개당',
};

/** '1매당 4,000원'. 단가를 못 내는 제품은 null이라 줄 자체를 그리지 않는다. */
export function formatUnitPrice(
  unitPrice?: number | null,
  unitLabel?: string | null,
): string | null {
  if (unitPrice == null || !unitLabel) return null;
  const label = UNIT_LABEL[unitLabel];
  if (!label) return null; // 서버가 새 코드를 내도 화면이 깨지지 않는다
  return `${label} ${Math.round(unitPrice).toLocaleString()}원`;
}
