import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import type { Product } from '@core/models/product.model';

const MIN_MARQUEE_ITEMS = 12;
const SECONDS_PER_UNIQUE_PRODUCT = 6;
const MIN_ANIMATION_DURATION_SECONDS = 45;
const MAX_ANIMATION_DURATION_SECONDS = 65;

@Component({
  selector: 'app-featured-slider',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyPipe],
  templateUrl: './featured-slider.html',
  styleUrl: './featured-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturedSlider {
  readonly title = input<string>('Destacados');
  readonly products = input<Product[]>([]);

  readonly hasProducts = computed<boolean>(() => this.products().length > 0);

  /**
   * Garantiza que la pista del carrusel cuente con suficientes elementos duplicados
   * para cubrir pantallas anchas y ultra-wide (3440px+), asegurando un desplazamiento
   * continuo determinista y sin vacíos visuales.
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
   * Duración dinámica del desplazamiento continuo en un rango pausado y elegante (~45s a 65s),
   * asignando 6 segundos por producto único para lectura cómoda de títulos y precios.
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
