export interface ProductVariant {
  id: string;
  productId: string;
  sku?: string;
  attributes: { [key: string]: string };
  stock: number;
  image?: string;
  price?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  image: string;
  images?: string[];
  createdAt: Date;
  updatedAt?: Date;

  hasAttributes?: boolean;
  stock?: number;
  totalStock: number;
  inStock?: boolean;
  inStockAttributes: { [key: string]: string[] };
  variantAttributes: string[];
  variants?: ProductVariant[];
}
