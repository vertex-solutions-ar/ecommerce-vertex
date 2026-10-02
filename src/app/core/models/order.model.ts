export type OrderStatus =
  'pending' | 'processing' | 'shipped' | 'ready_for_pickup' | 'delivered' | 'cancelled';

export type DeliveryType = 'home_delivery' | 'store_pickup';

export interface OrderDeliverySelection {
  type: DeliveryType;
  pickupLocationId?: string;
  pickupAddressFormatted?: string;
  notes?: string;
}

export interface OrderItem {
  productId: string;
  variantId?: string | null;
  productName: string;
  quantity: number;
  price: number;
  productImage?: string;
  attributes: { [key: string]: string };
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface PaymentDetails {
  paymentMethod: string;
  shippingCost: number;
  taxAmount: number;
  subtotal: number;
  paymentId?: string;
}

export interface Order {
  id: string;
  userId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  orderDate: Date;
  total: number;
  status: OrderStatus;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  billingAddress?: ShippingAddress;
  paymentDetails?: PaymentDetails;
  deliverySelection?: OrderDeliverySelection;
  mercadopago_preference_id?: string;
  mercadopago_init_point?: string;
  mercadopago_expiration_date?: Date;
  stockDecremented?: boolean;
  notes?: string;
}
