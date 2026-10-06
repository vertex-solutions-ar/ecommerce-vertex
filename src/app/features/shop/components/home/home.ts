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
import { Router, RouterModule } from '@angular/router';
import type { HeroBanner } from '@core/models/home-content.model';
import type { Product } from '@core/models/product.model';
import { HomeContentService } from '@core/services/home-content.service';
import { ProductService } from '@core/services/product.service';
import { CartService } from '@core/services/cart.service';
import { Carousel } from '@shared/components/carousel/carousel';
import { FeaturedSlider } from './components/featured-slider/featured-slider';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyPipe, Carousel, FeaturedSlider],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  private readonly homeContentService = inject(HomeContentService);
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();

  // Signals: undefined = loading, null = no data, value = loaded
  readonly heroBanner = signal<HeroBanner | null | undefined>(undefined);
  readonly newArrivals = signal<Product[] | undefined>(undefined);
  readonly featuredProducts = signal<Product[]>([]);
  readonly addedProductIds = signal<ReadonlySet<string>>(new Set());

  readonly bannerLoading = computed(() => this.heroBanner() === undefined);
  readonly productsLoading = computed(() => this.newArrivals() === undefined);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.timeouts.forEach((timer) => clearTimeout(timer));
      this.timeouts.clear();
    });
  }

  ngOnInit(): void {
    this.homeContentService
      .getHeroBanner()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.heroBanner.set(data);
          this.loadFeaturedProducts(data);
        },
        error: () => {
          this.heroBanner.set(null);
          this.featuredProducts.set([]);
        },
      });

    this.productService
      .getLatestProducts(10)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.newArrivals.set(data),
        error: () => this.newArrivals.set([]),
      });
  }

  private loadFeaturedProducts(banner: HeroBanner | null): void {
    const section = banner?.featuredProducts;
    if (!section?.enabled || !section.productIds || section.productIds.length === 0) {
      this.featuredProducts.set([]);
      return;
    }

    this.productService
      .getProductsByIds(section.productIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => this.featuredProducts.set(products),
        error: (err) => {
          console.warn('Unable to load featured products:', err);
          this.featuredProducts.set([]);
        },
      });
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

  /**
   * Comprueba si un producto específico ha sido añadido recientemente al carrito.
   */
  isAdded(productId: string): boolean {
    return this.addedProductIds().has(productId);
  }

  /**
   * Manejador para agregar un producto al carrito de forma rápida (Quick-Add a 1 clic).
   * Detiene la propagación del evento para evitar la navegación a la página de detalle.
   * Si el producto requiere selección obligatoria de variantes, redirige al detalle.
   */
  onAddToCart(event: Event, product: Product): void {
    event.stopPropagation();
    event.preventDefault();

    if (product.variants && product.variants.length > 1) {
      void this.router.navigate(['/product', product.id]);
      return;
    }

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
}
