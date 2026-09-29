import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';

import type { HeroBanner } from '@core/models/home-content.model';
import type { Product } from '@core/models/product.model';
import { HomeContentService } from '@core/services/home-content.service';
import { ProductService } from '@core/services/product.service';
import { Carousel } from '@shared/components/carousel/carousel';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyPipe, Carousel],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  private homeContentService = inject(HomeContentService);
  private productService = inject(ProductService);
  private destroyRef = inject(DestroyRef);

  // Signals: undefined = loading, null = no data, value = loaded
  readonly heroBanner = signal<HeroBanner | null | undefined>(undefined);
  readonly newArrivals = signal<Product[] | undefined>(undefined);

  readonly bannerLoading = computed(() => this.heroBanner() === undefined);
  readonly productsLoading = computed(() => this.newArrivals() === undefined);

  ngOnInit(): void {
    this.homeContentService
      .getHeroBanner()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.heroBanner.set(data),
        error: () => this.heroBanner.set(null),
      });

    this.productService
      .getLatestProducts(10)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.newArrivals.set(data),
        error: () => this.newArrivals.set([]),
      });
    console.log('*** ESTA ES LA VERSION QUE QUEREMOS PROBAR');
  }

  isCarousel(banner: HeroBanner | null | undefined): boolean {
    return banner?.heroImages ? banner.heroImages.length > 1 : false;
  }

  getStaticImage(banner: HeroBanner | null | undefined): string | undefined {
    return banner?.heroImages?.[0]?.imageUrl ?? banner?.imageUrl ?? undefined;
  }

  /**
   * Manejador del evento mousemove para aplicar el efecto de spotlight hover.
   */
  onButtonMouseMove(event: MouseEvent): void {
    const button = event.currentTarget as HTMLElement;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    button.style.setProperty('--x', `${x}px`);
    button.style.setProperty('--y', `${y}px`);
  }
}
