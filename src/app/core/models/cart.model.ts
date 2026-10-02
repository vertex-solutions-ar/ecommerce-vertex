export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  attributes: { [key: string]: string };
  stock: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
}
