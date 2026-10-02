import { Injectable, signal, computed, effect, inject, DestroyRef } from '@angular/core';
import type { Product, ProductVariant } from '@core/models/product.model';
import type { Cart, CartItem } from '@core/models/cart.model';
import { SweetAlertService } from './sweet-alert.service';
import { AttributeService } from './attribute.service';
import { ProductService } from './product.service';
import { firstValueFrom, take, timeout, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class CartService {
  private sweetAlertService = inject(SweetAlertService);
  private destroyRef = inject(DestroyRef);
  private attributeService = inject(AttributeService);
  private productService = inject(ProductService);
  private readonly CART_STORAGE_KEY = `cart_${environment.tenantId}`;

  private attributeMap = new Map<string, string>();
  cart = signal<Cart>(this.getCartFromStorage());

  itemCount = computed(() => this.cart().items.reduce((acc, item) => acc + item.quantity, 0));

  constructor() {
    this.loadAttributes();
    effect(() => {
      this.saveCartToStorage(this.cart());
    });
  }

  private loadAttributes(): void {
    this.attributeService
      .getAttributes()
      .pipe(take(1))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((attrs) => {
        attrs.forEach((attr) => {
          if (attr.id) {
            this.attributeMap.set(attr.id, attr.name);
          }
        });
      });
  }

  private getCartFromStorage(): Cart {
    try {
      const cartJson = localStorage.getItem(this.CART_STORAGE_KEY);
      if (cartJson) {
        const cart = JSON.parse(cartJson) as Cart;
        if (!cart.items) {
          return { items: [], total: 0 };
        }
        return cart;
      }
    } catch (error) {
      console.error('Error reading cart from localStorage', error);
      localStorage.removeItem(this.CART_STORAGE_KEY);
    }
    return { items: [], total: 0 };
  }

  private saveCartToStorage(cart: Cart): void {
    try {
      localStorage.setItem(this.CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.error('Error saving cart to localStorage', error);
    }
  }

  private calculateTotal(items: CartItem[]): number {
    return items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }

  getVariantDescription(attributes: { [key: string]: string }): string {
    if (!attributes || Object.keys(attributes).length === 0) {
      return '';
    }

    if (this.attributeMap.size === 0) {
      this.loadAttributes();
    }

    return Object.entries(attributes)
      .map(([id, value]) => {
        const name = this.attributeMap.get(id) ?? id;
        return `${name}: ${value}`;
      })
      .join(' / ');
  }

  addItem(product: Product, variant: ProductVariant | null | undefined, quantity: number): void {
    const availableStock = variant ? variant.stock : (product.stock ?? product.totalStock ?? 0);

    if (quantity > availableStock) {
      this.sweetAlertService.error(
        'Stock insuficiente',
        `No puedes añadir ${quantity}. Stock disponible: ${availableStock}.`,
      );
      return;
    }

    const cartItemId = variant ? variant.id : product.id;

    this.cart.update((currentCart) => {
      const existingItem = currentCart.items.find(
        (item) =>
          item.productId === product.id && (item.variantId ?? null) === (variant?.id ?? null),
      );
      let newItems: CartItem[];

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity > availableStock) {
          this.sweetAlertService.error(
            'Stock insuficiente',
            `No puedes añadir más. Stock disponible: ${availableStock}.`,
          );
          return currentCart;
        }
        newItems = currentCart.items.map((item) =>
          item === existingItem ? { ...item, quantity: newQuantity } : item,
        );
      } else {
        const variantDescription = variant ? this.getVariantDescription(variant.attributes) : '';
        const itemName = variantDescription
          ? `${product.name} (${variantDescription})`
          : product.name;
        const newItem: CartItem = {
          id: cartItemId,
          productId: product.id,
          variantId: variant?.id ?? null,
          name: itemName,
          price: product.price,
          quantity,
          image: variant?.image ?? product.image,
          attributes: variant?.attributes ?? {},
          stock: availableStock,
        };
        newItems = [...currentCart.items, newItem];
      }
      this.sweetAlertService.success('¡Añadido!', 'Producto añadido al carrito.');
      return { items: newItems, total: this.calculateTotal(newItems) };
    });
  }

  updateQuantity(itemId: string, quantity: number): void {
    this.cart.update((currentCart) => {
      const itemToUpdate = currentCart.items.find((item) => item.id === itemId);
      let newQuantity = quantity;

      if (!itemToUpdate) {
        return currentCart;
      }

      if (newQuantity > itemToUpdate.stock) {
        newQuantity = itemToUpdate.stock;
        this.sweetAlertService.error(
          'Stock insuficiente',
          `Solo quedan ${itemToUpdate.stock} unidades de este producto.`,
        );
      }

      if (newQuantity < 1) {
        newQuantity = 1;
      }

      const newItems = currentCart.items.map((item) =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item,
      );

      return { items: newItems, total: this.calculateTotal(newItems) };
    });
  }

  removeItem(itemId: string): void {
    this.cart.update((currentCart) => {
      const newItems = currentCart.items.filter((item) => item.id !== itemId);
      this.sweetAlertService.success('Eliminado', 'El producto ha sido eliminado del carrito.');
      return { items: newItems, total: this.calculateTotal(newItems) };
    });
  }

  /**
   * Valida los items del carrito contra el catálogo actual y elimina los que ya no
   * existen o quedaron sin stock (carritos obsoletos desde localStorage).
   * Devuelve los nombres de los productos removidos. Nunca lanza: ante fallos de red
   * o catálogo vacío, deja el carrito intacto para no bloquear la compra.
   */
  async pruneUnavailableItems(): Promise<string[]> {
    try {
      const products = await firstValueFrom(
        this.productService.getProducts().pipe(
          take(1),
          timeout({
            each: 2000,
            with: () => of([]),
          }),
        ),
      );
      const byId = new Map<string, Product>();
      products.forEach((product) => {
        if (product.id) {
          byId.set(product.id, product);
        }
      });

      const removed: string[] = [];
      this.cart.update((currentCart) => {
        if (!currentCart.items.length) {
          return currentCart;
        }
        const kept = currentCart.items.filter((item) => {
          const product = byId.get(item.productId);
          const available = !!product && product.totalStock > 0;
          if (!available) {
            removed.push(item.name);
          }
          return available;
        });
        if (kept.length === currentCart.items.length) {
          return currentCart;
        }
        return { items: kept, total: this.calculateTotal(kept) };
      });
      return removed;
    } catch (error) {
      console.warn('No se pudo validar el carrito contra el catálogo:', error);
      return [];
    }
  }

  clearCart(): void {
    this.cart.set({ items: [], total: 0 });
  }
}
