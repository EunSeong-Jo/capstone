export interface CategoryProduct {
  id: string;
  imageUrl?: string;
  title: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  isFavorite?: boolean;
}
