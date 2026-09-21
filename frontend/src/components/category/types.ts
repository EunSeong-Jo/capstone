export interface CategoryProduct {
  /**
   * 실제 카탈로그 제품 id.
   *
   * 예전에는 `'b1'`, `'r1'` 같은 문자열 목업 id였다. 카드가
   * `/detail/${id}`로 이동하는데 `Number('b1')`이 NaN이라 상세 화면이
   * "없는 제품"으로 떨어졌다. 숫자로 고정해 그 경로를 막는다.
   */
  id: number;
  imageUrl?: string;
  title: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  isFavorite?: boolean;
}
