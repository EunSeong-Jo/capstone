/**
 * 카탈로그 카테고리 — DB에 실제로 있는 4종.
 *
 * `categories` 테이블에 4행뿐이고, 수집기(scripts/load_products.py)가
 * `ALLOWED_CATEGORIES = {스킨케어, 마스크팩, 클렌징, 선케어}`로 얼굴용만
 * 남기기 때문이다. 메이크업·바디케어·헤어케어는 **데이터가 없다** —
 * 화면에 그리면 눌렀을 때 빈 목록이 나온다.
 *
 * 스킨케어 2,099건에 소분류(토너/세럼/크림)가 없다는 것도 같은 이유다.
 * `categories.parent_id`가 준비돼 있으니 2단계가 적재되면 여기에 더한다.
 */
export interface CategoryDef {
  /** URL 조각. 기존 /category/skincare 링크를 그대로 살린다. */
  slug: string;
  /** API `category` 파라미터로 그대로 넘기는 값 */
  label: string;
}

export const CATEGORIES: CategoryDef[] = [
  { slug: 'skincare', label: '스킨케어' },
  { slug: 'maskpack', label: '마스크팩' },
  { slug: 'cleansing', label: '클렌징' },
  { slug: 'suncare', label: '선케어' },
];

export function findCategory(slug: string | undefined): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
