import { z } from 'zod';

export const PayerSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  dni: z.string().optional(),
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      zipCode: z.string().optional(),
    })
    .optional(),
});

export const PaymentRequestSchema = z.object({
  external_reference: z.string().min(1, 'La referencia externa (orderId) es requerida.'),
  // Proyecto del shard donde viven los datos de la tienda (orden/catálogo).
  projectId: z.string().optional(),
  siteUrl: z.string().optional(),
  payer: PayerSchema.optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().nullable().optional(),
        title: z.string(),
        quantity: z.number().positive(),
        unit_price: z.number().nonnegative(),
      }),
    )
    .min(1, 'La solicitud debe incluir al menos un producto.')
    .max(100, 'Máximo 100 ítems por pedido.'),
});

export type PaymentRequestData = z.infer<typeof PaymentRequestSchema>;
