export type ProductSize = 'S' | 'M' | 'L' | 'XL';

export interface SizeStock {
  size: ProductSize;
  stock: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  sample_price_label: string;
  fabric: string;
  is_sample: boolean;
  description: string;
  images: string[];
  sizes: SizeStock[];
  placeholderBgColor: string;
  placeholderTextColor: string;
}
