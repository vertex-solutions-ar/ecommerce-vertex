import { z } from 'zod';

export const ProductVariantSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  storeId: z.string().optional(),
  sku: z.string().optional(),
  price: z.number().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
  stock: z.number().min(0),
  image: z.string().url().nullable().optional(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const ProductSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  categoryId: z.string(),
  price: z.number(),
  image: z.string(),
  images: z.array(z.string()).optional(),
  hasAttributes: z.boolean().optional(),
  stock: z.number().optional(),
  totalStock: z.number().default(0),
  inStock: z.boolean().optional(),
  variantAttributes: z.array(z.string()).optional(),
  variants: z.array(ProductVariantSchema).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

