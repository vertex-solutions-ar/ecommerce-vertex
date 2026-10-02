import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { Carousel } from './carousel';
import type { HeroImage } from '@core/models/home-content.model';

describe('Carousel', () => {
  let component: Carousel;
  let fixture: ComponentFixture<Carousel>;

  const mockImages: HeroImage[] = [
    {
      imageUrl: 'https://example.com/img1.jpg',
      linkType: 'product',
      linkId: 'prod-123',
    },
    {
      imageUrl: 'https://example.com/img2.jpg',
      linkType: 'category',
      linkId: 'cat-456',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Carousel, NoopAnimationsModule],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Carousel);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should initialize autoplay when images length > 1', fakeAsync(() => {
    component.images = mockImages;
    component.interval = 1000;
    fixture.detectChanges();

    expect(component.currentIndex).toBe(0);
    tick(1000);
    expect(component.currentIndex).toBe(1);
    tick(1000);
    expect(component.currentIndex).toBe(0);
    component.ngOnDestroy();
  }));

  it('should navigate to next and previous slides correctly', () => {
    component.images = mockImages;
    fixture.detectChanges();

    component.nextSlide();
    expect(component.currentIndex).toBe(1);

    component.nextSlide();
    expect(component.currentIndex).toBe(0);

    component.prevSlide();
    expect(component.currentIndex).toBe(1);
  });

  it('should go to specified slide index', () => {
    component.images = mockImages;
    fixture.detectChanges();

    component.goToSlide(1);
    expect(component.currentIndex).toBe(1);
  });

  it('should return current image object and calculate slide progress', () => {
    component.images = mockImages;
    fixture.detectChanges();

    expect(component.currentImage?.imageUrl).toBe('https://example.com/img1.jpg');
    expect(component.slideProgress).toBe(50);
  });

  it('should return route and queryParams based on linkType', () => {
    component.images = mockImages;
    fixture.detectChanges();

    expect(component.getRoute(mockImages[0])).toEqual(['/product', 'prod-123']);
    expect(component.getRoute(mockImages[1])).toEqual(['/catalog']);
    expect(component.getRoute(null)).toBeNull();

    expect(component.getQueryParams(mockImages[1])).toEqual({ category: 'cat-456' });
    expect(component.getQueryParams(mockImages[0])).toBeNull();
  });

  it('should pause autoplay on mouseenter and resume on mouseleave when pauseOnHover is true', () => {
    component.images = mockImages;
    component.pauseOnHover = true;
    fixture.detectChanges();

    component.onMouseEnter();
    expect(component.isAutoplayActive).toBeFalse();

    component.onMouseLeave();
    expect(component.isAutoplayActive).toBeTrue();
  });

  it('should not pause autoplay on mouseenter when pauseOnHover is false', () => {
    component.images = mockImages;
    component.pauseOnHover = false;
    fixture.detectChanges();

    expect(component.isAutoplayActive).toBeTrue();
    component.onMouseEnter();
    expect(component.isAutoplayActive).toBeTrue();

    component.onMouseLeave();
    expect(component.isAutoplayActive).toBeTrue();
  });

  it('should handle touch swipe events', () => {
    component.images = mockImages;
    fixture.detectChanges();

    const startEvent = { touches: [{ clientX: 200 }] } as unknown as TouchEvent;
    const endEvent = { changedTouches: [{ clientX: 100 }] } as unknown as TouchEvent;

    component.onTouchStart(startEvent);
    component.onTouchEnd(endEvent);
    expect(component.currentIndex).toBe(1);
  });

  it('should handle aspect ratio getter and setter', () => {
    component.aspectRatio = '4 / 3';
    expect(component.aspectRatio).toBe('4 / 3');
    expect(component.carouselAspectRatio).toBe('4 / 3');
  });

  it('should handle empty images array gracefully', () => {
    component.images = [];
    fixture.detectChanges();

    expect(component.currentImage).toBeNull();
    expect(component.getRoute(null)).toBeNull();
    expect(component.getQueryParams(null)).toBeNull();
  });

  it('should handle mouse events and touch events when images.length is 1', () => {
    component.images = [mockImages[0]];
    component.pauseOnHover = true;
    fixture.detectChanges();

    component.onMouseEnter();
    expect(component.isAutoplayActive).toBeTrue();

    component.onMouseLeave();
    expect(component.isAutoplayActive).toBeTrue();

    const startEvent = { touches: [{ clientX: 200 }] } as unknown as TouchEvent;
    const endEvent = { changedTouches: [{ clientX: 100 }] } as unknown as TouchEvent;

    component.onTouchStart(startEvent);
    component.onTouchEnd(endEvent);
    expect(component.currentIndex).toBe(0);
  });

  it('should handle right swipe (diff < -50) and swipe under threshold (|diff| < 50)', () => {
    component.images = mockImages;
    fixture.detectChanges();

    // Right swipe: diff = 100 - 200 = -100 (< -50) -> prevSlide
    const startRight = { touches: [{ clientX: 100 }] } as unknown as TouchEvent;
    const endRight = { changedTouches: [{ clientX: 200 }] } as unknown as TouchEvent;

    component.onTouchStart(startRight);
    component.onTouchEnd(endRight);
    expect(component.currentIndex).toBe(1);

    // Swipe under threshold: diff = 100 - 110 = -10 (|diff| < 50) -> no change
    const startSmall = { touches: [{ clientX: 100 }] } as unknown as TouchEvent;
    const endSmall = { changedTouches: [{ clientX: 110 }] } as unknown as TouchEvent;

    component.onTouchStart(startSmall);
    component.onTouchEnd(endSmall);
    expect(component.currentIndex).toBe(1);
  });

  it('should return null for getRoute and getQueryParams when linkId is missing or linkType is unknown', () => {
    const noLinkIdImage: HeroImage = { imageUrl: 'x', linkType: 'category' };
    const unknownTypeImage: HeroImage = {
      imageUrl: 'x',
      linkType: 'unknown' as unknown as HeroImage['linkType'],
    };

    expect(component.getRoute(noLinkIdImage)).toBeNull();
    expect(component.getRoute(unknownTypeImage)).toBeNull();

    expect(component.getQueryParams(noLinkIdImage)).toBeNull();
    expect(component.getQueryParams(unknownTypeImage)).toBeNull();
  });
});
