import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import type { Product } from '@core/models/product.model';
import { CartService } from '@core/services/cart.service';

const MIN_MARQUEE_ITEMS = 15;
const SECONDS_PER_UNIQUE_PRODUCT = 8;
const MIN_ANIMATION_DURATION_SECONDS = 75;
const MAX_ANIMATION_DURATION_SECONDS = 95;

@Component({
  selector: 'app-featured-slider',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyPipe],
  templateUrl: './featured-slider.html',
  styleUrl: './featured-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturedSlider {
  private cartService = inject(CartService);
  private destroyRef = inject(DestroyRef);
  private timeouts = new Set<ReturnType<typeof setTimeout>>();

  readonly title = input<string>('Destacados');
  readonly products = input<Product[]>([]);

  readonly hasProducts = computed<boolean>(() => this.products().length > 0);

  /**
   * Estado reactivo transitorio para identificar productos recientemente añadidos al carrito
   * y proporcionar confirmación visual inmediata (icono de checkmark / animación).
   */
  readonly addedProductIds = signal<ReadonlySet<string>>(new Set<string>());

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.timeouts.forEach((timer) => clearTimeout(timer));
      this.timeouts.clear();
    });
  }

  /**
   * Comprueba si un producto específico ha sido añadido recientemente.
   */
  isAdded(productId: string): boolean {
    return this.addedProductIds().has(productId);
  }

  /**
   * Gestiona la adición rápida al carrito desde la tarjeta del slider,
   * deteniendo la propagación para evitar la navegación hacia el detalle del producto.
   */
  onAddToCart(event: Event, product: Product): void {
    event.stopPropagation();
    event.preventDefault();

    this.cartService.addToCart(product, 1);

    if (product.id) {
      this.addedProductIds.update((current) => {
        const next = new Set(current);
        next.add(product.id);
        return next;
      });

      const timer = setTimeout(() => {
        this.timeouts.delete(timer);
        this.addedProductIds.update((current) => {
          const next = new Set(current);
          next.delete(product.id);
          return next;
        });
      }, 1500);

      this.timeouts.add(timer);
    }
  }

  /**
   * Garantiza que la pista del carrusel cuente con suficientes elementos duplicados
   * para cubrir pantallas anchas y ultra-wide (3440px+), asegurando un desplazamiento
   * continuo determinista y sin vacíos visuales (mínimo 15 ítems por bloque).
   */
  readonly displayProducts = computed<Product[]>(() => {
    const list = this.products();
    if (list.length === 0) {
      return [];
    }
    let duplicated = [...list];
    while (duplicated.length < MIN_MARQUEE_ITEMS) {
      duplicated = [...duplicated, ...list];
    }
    return duplicated;
  });

  /**
   * Duración dinámica del desplazamiento continuo en un rango sumamente pausado y elegante (~75s a 95s),
   * asignando 8 segundos por producto único para lectura cómoda y fluida de títulos y precios.
   */
  readonly animationDuration = computed<string>(() => {
    const uniqueCount = this.products().length;
    if (uniqueCount === 0) {
      return `${MIN_ANIMATION_DURATION_SECONDS}s`;
    }
    const computedDuration = Math.min(
      MAX_ANIMATION_DURATION_SECONDS,
      Math.max(MIN_ANIMATION_DURATION_SECONDS, uniqueCount * SECONDS_PER_UNIQUE_PRODUCT),
    );
    return `${computedDuration}s`;
  });
}
