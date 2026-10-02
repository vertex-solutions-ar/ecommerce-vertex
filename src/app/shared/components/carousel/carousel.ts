import type { OnDestroy, OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  HostListener,
  Input,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import type { Subscription } from 'rxjs';
import { interval } from 'rxjs';
import type { HeroImage } from '@core/models/home-content.model';

@Component({
  selector: 'app-carousel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './carousel.html',
  styleUrl: './carousel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Carousel implements OnInit, OnDestroy {
  @Input()
  images: HeroImage[] = [];
  @Input()
  interval: number = 4000;
  @Input()
  showIndicators: boolean = true;
  @Input()
  showArrows: boolean = true;
  @Input()
  pauseOnHover: boolean = false;
  @Input()
  set aspectRatio(value: string) {
    this._aspectRatio = value;
  }
  get aspectRatio(): string {
    return this._aspectRatio;
  }
  private _aspectRatio: string = '16 / 9';

  @HostBinding('style.--carousel-aspect-ratio')
  get carouselAspectRatio(): string {
    return this._aspectRatio;
  }

  currentIndex: number = 0;
  isAutoplayActive: boolean = true;
  private cdr = inject(ChangeDetectorRef);
  private autoplaySub: Subscription | null = null;
  private touchStartX: number = 0;
  private touchEndX: number = 0;

  ngOnInit(): void {
    if (this.images.length > 1) {
      this.startAutoplay();
    }
  }

  ngOnDestroy(): void {
    this.stopAutoplay();
  }

  private startAutoplay(): void {
    this.stopAutoplay();
    this.isAutoplayActive = true;
    this.autoplaySub = interval(this.interval).subscribe(() => {
      this.nextSlide();
    });
  }

  private stopAutoplay(): void {
    if (this.autoplaySub) {
      this.autoplaySub.unsubscribe();
      this.autoplaySub = null;
    }
    this.isAutoplayActive = false;
  }

  @HostListener('mouseenter')
  onMouseEnter(): void {
    if (this.pauseOnHover && this.images.length > 1) {
      this.stopAutoplay();
    }
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    if (this.pauseOnHover && this.images.length > 1) {
      this.startAutoplay();
    }
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    if (this.images.length > 1) {
      this.stopAutoplay();
    }
  }

  onTouchEnd(event: TouchEvent): void {
    this.touchEndX = event.changedTouches[0].clientX;
    this.handleSwipe();
    if (this.images.length > 1) {
      this.startAutoplay();
    }
  }

  private handleSwipe(): void {
    const swipeThreshold = 50;
    const diff = this.touchStartX - this.touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        this.nextSlide();
      } else {
        this.prevSlide();
      }
    }
  }

  nextSlide(): void {
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    this.cdr.markForCheck();
  }

  prevSlide(): void {
    this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
    this.cdr.markForCheck();
  }

  goToSlide(index: number): void {
    this.currentIndex = index;
    this.cdr.markForCheck();
    if (this.images.length > 1) {
      this.stopAutoplay();
      this.startAutoplay();
    }
  }

  get currentImage(): HeroImage | null {
    return this.images[this.currentIndex] || null;
  }

  get slideProgress(): number {
    return ((this.currentIndex + 1) / this.images.length) * 100;
  }

  getRoute(image: HeroImage | null): string[] | null {
    if (!image) {
      return null;
    }
    if (image.linkType === 'product' && image.linkId) {
      return ['/product', image.linkId];
    }
    if (image.linkType === 'category' && image.linkId) {
      return ['/catalog'];
    }
    return null;
  }

  getQueryParams(image: HeroImage | null): Record<string, string> | null {
    if (!image) {
      return null;
    }
    if (image.linkType === 'category' && image.linkId) {
      return { category: image.linkId };
    }
    return null;
  }
}
