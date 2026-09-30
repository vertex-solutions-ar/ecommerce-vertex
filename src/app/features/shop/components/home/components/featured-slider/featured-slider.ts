import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import type { Product } from '@core/models/product.model';

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
   * para cubrir pantallas anchas y permitir un desplazamiento continuo sin saltos visuales.
   */
  readonly displayProducts = computed<Product[]>(() => {
    const list = this.products();
    if (list.length === 0) {
      return [];
    }
    let duplicated = [...list];
    while (duplicated.length < 10) {
      duplicated = [...duplicated, ...list];
    }
    return duplicated;
  });

  /**
   * Duración dinámica del desplazamiento continuo según la cantidad de ítems.
   */
  readonly animationDuration = computed<string>(() => {
    const count = this.displayProducts().length;
    return `${Math.max(25, count * 3.5)}s`;
  });
}
