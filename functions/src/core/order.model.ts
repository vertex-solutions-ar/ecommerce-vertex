import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'pending',
  'processing',
  'shipped',
  'ready_for_pickup',
  'delivered',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const DeliveryTypeSchema = z.enum(['home_delivery', 'store_pickup']);
export type DeliveryType = z.infer<typeof DeliveryTypeSchema>;

export const OrderDeliverySelectionSchema = z.object({
  type: DeliveryTypeSchema,
  pickupLocationId: z.string().optional(),
  pickupAddressFormatted: z.string().optional(),
  notes: z.string().optional(),
});
export type OrderDeliverySelection = z.infer<typeof OrderDeliverySelectionSchema>;

export const OrderItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().nullable().optional(),
  productName: z.string(),
  quantity: z.number(),
  price: z.number(),
  productImage: z.string().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const ShippingAddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  country: z.string(),
});
export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

export const PaymentDetailsSchema = z.object({
  paymentMethod: z.string(),
  shippingCost: z.number(),
  taxAmount: z.number(),
  subtotal: z.number(),
  paymentId: z.string().optional(),
});
export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;

export const OrderSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  storeId: z.string().optional(),
  clientName: z.string(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  orderDate: z.any(),
  total: z.number(),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  shippingAddress: ShippingAddressSchema,
  billingAddress: ShippingAddressSchema.optional(),
  paymentDetails: PaymentDetailsSchema.optional(),
  deliverySelection: OrderDeliverySelectionSchema.optional(),
  mercadopago_preference_id: z.string().optional(),
  mercadopago_init_point: z.string().optional(),
  mercadopago_expiration_date: z.any().optional(),
  stockDecremented: z.boolean().optional(),
  notes: z.string().optional(),
});
export type Order = z.infer<typeof OrderSchema>;
