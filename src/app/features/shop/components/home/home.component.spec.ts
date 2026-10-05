import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Home } from './home';
import { HomeContentService } from '@core/services/home-content.service';
import { ProductService } from '@core/services/product.service';
import { CartService } from '@core/services/cart.service';
import type { HeroBanner } from '@core/models/home-content.model';
import type { Product } from '@core/models/product.model';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let homeContentServiceSpy: jasmine.SpyObj<HomeContentService>;
  let productServiceSpy: jasmine.SpyObj<ProductService>;
  let cartServiceSpy: jasmine.SpyObj<CartService>;

  const mockBanner: HeroBanner = {
    id: 'b1',
    title: 'Banner Principal',
    subtitle: 'Ofertas exclusivas',
    buttonText: 'Ver Mas',
    buttonUrl: '/catalog',
    imageUrl: 'https://example.com/single.jpg',
    heroImages: [
      { imageUrl: 'https://example.com/1.jpg' },
      { imageUrl: 'https://example.com/2.jpg' },
    ],
  } as unknown as HeroBanner;

  const mockProducts: Product[] = [
    { id: 'p1', name: 'Producto 1', price: 100 } as Product,
    { id: 'p2', name: 'Producto 2', price: 200 } as Product,
  ];

  beforeEach(async () => {
    homeContentServiceSpy = jasmine.createSpyObj('HomeContentService', ['getHeroBanner']);
    productServiceSpy = jasmine.createSpyObj('ProductService', [
      'getLatestProducts',
      'getProductsByIds',
    ]);
    cartServiceSpy = jasmine.createSpyObj('CartService', ['addToCart']);

    homeContentServiceSpy.getHeroBanner.and.returnValue(of(mockBanner));
    productServiceSpy.getLatestProducts.and.returnValue(of(mockProducts));
    productServiceSpy.getProductsByIds.and.returnValue(of(mockProducts));

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: HomeContentService, useValue: homeContentServiceSpy },
        { provide: ProductService, useValue: productServiceSpy },
        { provide: CartService, useValue: cartServiceSpy },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
  }

  it('should create and load data on init', () => {
    createComponent();
    fixture.detectChanges();

    expect(component).toBeTruthy();
    expect(homeContentServiceSpy.getHeroBanner).toHaveBeenCalled();
    expect(productServiceSpy.getLatestProducts).toHaveBeenCalledWith(10);
    expect(component.heroBanner()).toEqual(mockBanner);
    expect(component.newArrivals()).toEqual(mockProducts);
    expect(component.bannerLoading()).toBeFalse();
    expect(component.productsLoading()).toBeFalse();
  });

  it('should handle errors when loading hero banner and products', () => {
    homeContentServiceSpy.getHeroBanner.and.returnValue(
      throwError(() => new Error('Banner error')),
    );
    productServiceSpy.getLatestProducts.and.returnValue(
      throwError(() => new Error('Product error')),
    );

    createComponent();
    fixture.detectChanges();

    expect(component.heroBanner()).toBeNull();
    expect(component.newArrivals()).toEqual([]);
    expect(component.bannerLoading()).toBeFalse();
    expect(component.productsLoading()).toBeFalse();
    expect(component.featuredProducts()).toEqual([]);
  });

  it('should load featured products when enabled in banner', () => {
    const bannerWithFeatured = {
      ...mockBanner,
      featuredProducts: {
        enabled: true,
        title: 'Productos Estrella',
        productIds: ['p1', 'p2'],
      },
    } as unknown as HeroBanner;
    homeContentServiceSpy.getHeroBanner.and.returnValue(of(bannerWithFeatured));

    createComponent();
    fixture.detectChanges();

    expect(productServiceSpy.getProductsByIds).toHaveBeenCalledWith(['p1', 'p2']);
    expect(component.featuredProducts()).toEqual(mockProducts);
  });

  it('should handle error when loading featured products', () => {
    const bannerWithFeatured = {
      ...mockBanner,
      featuredProducts: {
        enabled: true,
        title: 'Productos Estrella',
        productIds: ['p1', 'p2'],
      },
    } as unknown as HeroBanner;
    homeContentServiceSpy.getHeroBanner.and.returnValue(of(bannerWithFeatured));
    productServiceSpy.getProductsByIds.and.returnValue(
      throwError(() => new Error('Failed to load')),
    );

    createComponent();
    fixture.detectChanges();

    expect(component.featuredProducts()).toEqual([]);
  });

  describe('isCarousel', () => {
    it('should return true if banner has more than 1 hero image', () => {
      createComponent();
      expect(component.isCarousel(mockBanner)).toBeTrue();
    });

    it('should return false if banner has 1 or 0 hero images or is null/undefined', () => {
      createComponent();
      expect(component.isCarousel(null)).toBeFalse();
      expect(component.isCarousel(undefined)).toBeFalse();
      expect(
        component.isCarousel({
          heroImages: [{ imageUrl: 'a' }],
        } as unknown as HeroBanner),
      ).toBeFalse();
    });
  });

  describe('getStaticImage', () => {
    it('should return first heroImage url if present', () => {
      createComponent();
      expect(component.getStaticImage(mockBanner)).toBe('https://example.com/1.jpg');
    });

    it('should fallback to banner.imageUrl if heroImages is empty', () => {
      createComponent();
      const bannerWithoutImages = {
        ...mockBanner,
        heroImages: [],
        imageUrl: 'https://example.com/fallback.jpg',
      } as unknown as HeroBanner;
      expect(component.getStaticImage(bannerWithoutImages)).toBe(
        'https://example.com/fallback.jpg',
      );
    });

    it('should return undefined if no images available', () => {
      createComponent();
      expect(component.getStaticImage(null)).toBeUndefined();
    });
  });

  describe('onButtonMouseMove', () => {
    it('should set CSS custom properties on mousemove', () => {
      createComponent();
      fixture.detectChanges();

      const dummyElement = document.createElement('button');
      spyOn(dummyElement, 'getBoundingClientRect').and.returnValue({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
        right: 110,
        bottom: 70,
        x: 10,
        y: 20,
        toJSON: () => {},
      });

      const mouseEvent = {
        currentTarget: dummyElement,
        clientX: 30,
        clientY: 50,
      } as unknown as MouseEvent;

      component.onButtonMouseMove(mouseEvent);

      expect(dummyElement.style.getPropertyValue('--x')).toBe('20px');
      expect(dummyElement.style.getPropertyValue('--y')).toBe('30px');
    });

    it('should return early if currentTarget is null', () => {
      createComponent();
      const mouseEvent = { currentTarget: null } as unknown as MouseEvent;
      expect(() => component.onButtonMouseMove(mouseEvent)).not.toThrow();
    });
  });
});
