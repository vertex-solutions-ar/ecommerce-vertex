import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import type { Observable } from 'rxjs';
import { map, combineLatest, of, catchError, firstValueFrom } from 'rxjs';
import { Firestore, collectionData, docData } from '@angular/fire/firestore';
import type {
  WithFieldValue,
  QueryConstraint,
  CollectionReference,
  DocumentReference,
  DocumentData,
} from '@angular/fire/firestore';
import {
  doc,
  collection,
  deleteDoc,
  getDoc,
  writeBatch,
  query,
  where,
} from '@angular/fire/firestore';
import type { Product, ProductVariant } from '../models/product.model';
import { convertTimestampsToDates } from '@core/utils/date-converter';
import { tenantPath, storeIdFilter, resolveTenantId } from '@core/utils/tenant';
import { generateShortId } from '@core/utils/id-generator';
import { StorageService } from './storage.service';
import { shareReplay } from 'rxjs/operators';

export interface ProductFilters {
  categoryId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  includeOutOfStock?: boolean;
  dynamicFilters: { [key: string]: string[] };
}

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private firestore: Firestore = inject(Firestore);
  private injector = inject(Injector);
  private storageService = inject(StorageService);
  private readonly collectionName = 'products';

  private get collectionRef(): CollectionReference<DocumentData> {
    return collection(this.firestore, tenantPath(this.collectionName));
  }

  getProducts(): Observable<Product[]> {
    return runInInjectionContext(this.injector, () => {
      const q = query(this.collectionRef, storeIdFilter());
      const data$ = (collectionData(q, { idField: 'id' }) as Observable<Product[]>).pipe(
        map((items) => items.map((item) => convertTimestampsToDates(item) as Product)),
        map((products) =>
          [...products].sort((a, b) => {
            const dateA =
              a.createdAt instanceof Date
                ? a.createdAt.getTime()
                : new Date(a.createdAt).getTime() || 0;
            const dateB =
              b.createdAt instanceof Date
                ? b.createdAt.getTime()
                : new Date(b.createdAt).getTime() || 0;
            if (dateA && dateB) {
              return dateB - dateA;
            }
            return (a.name || '').localeCompare(b.name || '');
          }),
        ),
        catchError((err) => {
          console.warn('Unable to load products:', err);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
      return data$;
    });
  }

  getProductsByIds(ids: string[]): Observable<Product[]> {
    if (!ids || ids.length === 0) {
      return of([]);
    }
    return this.getProducts().pipe(
      map((products) => {
        const productMap = new Map(products.map((p) => [p.id, p]));
        return ids.map((id) => productMap.get(id)).filter((p): p is Product => p !== undefined);
      }),
      catchError((err) => {
        console.warn('Unable to load products by IDs:', err);
        return of([]);
      }),
    );
  }

  getProductsByQuery(categoryId: string | null): Observable<Product[]> {
    return runInInjectionContext(this.injector, () => {
      const constraints: QueryConstraint[] = [storeIdFilter()];
      if (categoryId && categoryId !== 'all') {
        constraints.push(where('categoryId', '==', categoryId));
      }
      const q = query(this.collectionRef, ...constraints);
      return (collectionData(q, { idField: 'id' }) as Observable<Product[]>).pipe(
        map((items) => items.map((item) => convertTimestampsToDates(item) as Product)),
        catchError((err) => {
          console.warn(`Unable to load products with query category ${categoryId}:`, err);
          return of([]);
        }),
      );
    });
  }

  getProductById(id: string): Observable<Product | undefined> {
    return runInInjectionContext(this.injector, () => {
      const docRef: DocumentReference<DocumentData> = doc(
        this.firestore,
        tenantPath(this.collectionName),
        id,
      );
      return (docData(docRef, { idField: 'id' }) as Observable<Product | undefined>).pipe(
        map((item) => (item ? (convertTimestampsToDates(item) as Product) : undefined)),
        catchError((err) => {
          console.warn(`Unable to load product ${id}:`, err);
          return of(undefined);
        }),
      );
    });
  }

  getProductWithVariants(
    id: string,
  ): Observable<{ product: Product; variants: ProductVariant[] } | undefined> {
    return runInInjectionContext(this.injector, () => {
      const product$ = this.getProductById(id);
      const productRef = doc(this.firestore, tenantPath(this.collectionName), id);
      const variantsCollectionRef = collection(productRef, 'variants');
      const variants$ = (
        collectionData(variantsCollectionRef, { idField: 'id' }) as Observable<ProductVariant[]>
      ).pipe(
        catchError((err) => {
          console.warn(`Unable to load variants for product ${id}:`, err);
          return of([]);
        }),
      );

      return combineLatest([product$, variants$]).pipe(
        map(([product, variants]) => {
          if (!product) {
            return undefined;
          }
          return {
            product,
            variants: variants.map((v) => convertTimestampsToDates(v) as ProductVariant),
          };
        }),
        catchError((err) => {
          console.warn(`Unable to resolve product and variants combined for product ${id}:`, err);
          return of(undefined);
        }),
      );
    });
  }

  async createProductWithVariants(
    product: WithFieldValue<Omit<Product, 'id'>>,
    variants: WithFieldValue<Omit<ProductVariant, 'id' | 'productId'>>[],
  ): Promise<string> {
    const batch = writeBatch(this.firestore);
    const productId = generateShortId(8);
    const newProductRef = doc(this.collectionRef, productId);

    const computedTotalStock = variants.reduce(
      (sum, v) => sum + (Number((v as { stock?: number }).stock) || 0),
      0,
    );
    const inStockAttributes: Record<string, string[]> = {};
    variants.forEach((v) => {
      const vStock = Number((v as { stock?: number }).stock) || 0;
      const vAttrs = (v as { attributes?: Record<string, string> }).attributes;
      if (vStock > 0 && vAttrs) {
        Object.entries(vAttrs).forEach(([attrId, attrVal]) => {
          if (typeof attrVal === 'string') {
            if (!inStockAttributes[attrId]) {
              inStockAttributes[attrId] = [];
            }
            if (!inStockAttributes[attrId].includes(attrVal)) {
              inStockAttributes[attrId].push(attrVal);
            }
          }
        });
      }
    });

    const explicitTotalStock = (product as Record<string, unknown>)['totalStock'];
    const totalStock =
      variants.length > 0
        ? computedTotalStock
        : typeof explicitTotalStock === 'number' && explicitTotalStock >= 0
          ? explicitTotalStock
          : computedTotalStock;

    batch.set(newProductRef, {
      ...(product as Record<string, unknown>),
      totalStock,
      inStockAttributes,
      inStock: totalStock > 0,
      storeId: resolveTenantId(),
    } as unknown as WithFieldValue<Omit<Product, 'id'>>);

    variants.forEach((variantData) => {
      const variantId = generateShortId(8);
      const newVariantRef = doc(collection(newProductRef, 'variants'), variantId);
      const variantWithId = {
        ...variantData,
        productId: newProductRef.id,
        storeId: resolveTenantId(),
      } as unknown as WithFieldValue<Omit<ProductVariant, 'id'>>;
      batch.set(newVariantRef, variantWithId);
    });

    await batch.commit();
    return newProductRef.id;
  }

  async updateProductWithVariants(
    productId: string,
    productData: Partial<Product>,
    variantsToUpdate: (Partial<ProductVariant> & { id: string })[],
    variantsToAdd: WithFieldValue<Omit<ProductVariant, 'id' | 'productId'>>[],
    variantIdsToDelete: string[],
  ): Promise<void> {
    const batch = writeBatch(this.firestore);
    const productRef = doc(this.firestore, tenantPath(this.collectionName), productId);

    const variantsCollectionRef = collection(productRef, 'variants');

    variantsToUpdate.forEach((variant) => {
      const variantRef = doc(variantsCollectionRef, variant.id);
      batch.update(variantRef, variant);
    });

    variantsToAdd.forEach((variantData) => {
      const variantId = generateShortId(8);
      const newVariantRef = doc(variantsCollectionRef, variantId);
      const variantWithId = {
        ...variantData,
        productId,
        storeId: resolveTenantId(),
      } as unknown as WithFieldValue<Omit<ProductVariant, 'id'>>;
      batch.set(newVariantRef, variantWithId);
    });

    variantIdsToDelete.forEach((variantId) => {
      const variantRef = doc(variantsCollectionRef, variantId);
      batch.delete(variantRef);
    });

    // Compute updated totalStock & inStockAttributes from remaining active variants
    const allRemainingVariants = [
      ...variantsToUpdate.map((v) => ({ ...v, stock: Number(v.stock) || 0 })),
      ...variantsToAdd.map((v) => ({ ...v, stock: Number((v as { stock?: number }).stock) || 0 })),
    ];
    const computedTotalStock = allRemainingVariants.reduce(
      (sum, v) => sum + (Number(v.stock) || 0),
      0,
    );
    const inStockAttributes: Record<string, string[]> = {};
    allRemainingVariants.forEach((v) => {
      if ((v.stock || 0) > 0 && v.attributes) {
        Object.entries(v.attributes).forEach(([attrId, attrVal]) => {
          if (typeof attrVal === 'string') {
            if (!inStockAttributes[attrId]) {
              inStockAttributes[attrId] = [];
            }
            if (!inStockAttributes[attrId].includes(attrVal)) {
              inStockAttributes[attrId].push(attrVal);
            }
          }
        });
      }
    });

    const totalStock =
      allRemainingVariants.length > 0
        ? computedTotalStock
        : typeof productData.totalStock === 'number' && productData.totalStock >= 0
          ? productData.totalStock
          : computedTotalStock;

    batch.update(productRef, {
      ...productData,
      totalStock,
      inStockAttributes,
      inStock: totalStock > 0,
      updatedAt: new Date(),
    });

    return batch.commit();
  }

  async deleteProduct(id: string): Promise<void> {
    // Elimina primero las imágenes asociadas de Firebase Storage para evitar archivos huérfanos
    try {
      const productSnap = await getDoc(doc(this.firestore, tenantPath(this.collectionName), id));
      if (productSnap.exists()) {
        const data = productSnap.data();
        const imageUrls = new Set<string>();
        if (typeof data['image'] === 'string' && data['image']) {
          imageUrls.add(data['image']);
        }
        (Array.isArray(data['images']) ? data['images'] : []).forEach((u: unknown) => {
          if (typeof u === 'string' && u) {
            imageUrls.add(u);
          }
        });
        for (const url of imageUrls) {
          try {
            await firstValueFrom(this.storageService.deleteFileByUrl(url));
          } catch (err) {
            console.warn(`Unable to delete product image from storage: ${url}`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`Unable to load product ${id} for image cleanup:`, err);
    }

    const docRef = doc(this.firestore, tenantPath(this.collectionName), id);
    return deleteDoc(docRef);
  }

  getProductsLowInStock(threshold: number = 5): Observable<Product[]> {
    return this.getProducts().pipe(
      map((products) =>
        products
          .filter((p) => (p.totalStock ?? 0) >= 0 && (p.totalStock ?? 0) <= threshold)
          .sort((a, b) => (a.totalStock ?? 0) - (b.totalStock ?? 0)),
      ),
      catchError((err) => {
        console.warn('Unable to load products low in stock:', err);
        return of([]);
      }),
    );
  }

  getLatestProducts(count: number = 10): Observable<Product[]> {
    return this.getProducts().pipe(
      map((products) => products.slice(0, count)),
      catchError((err) => {
        console.warn('Unable to load latest products:', err);
        return of([]);
      }),
    );
  }

  checkStockAvailability(
    productId: string,
    variantId: string,
    quantity: number,
  ): Observable<boolean> {
    return runInInjectionContext(this.injector, () => {
      const productRef = doc(this.firestore, tenantPath(this.collectionName), productId);
      const variantRef = doc(collection(productRef, 'variants'), variantId);
      return (docData(variantRef) as Observable<{ stock?: number } | undefined>).pipe(
        map((variant) => {
          if (!variant) {
            return false;
          }
          return (variant.stock ?? 0) >= quantity;
        }),
        catchError((err) => {
          console.warn(
            `Unable to check stock availability for variant ${variantId} of product ${productId}:`,
            err,
          );
          return of(false);
        }),
      );
    });
  }
}
