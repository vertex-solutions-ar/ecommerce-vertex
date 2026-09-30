import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ComponentRef } from '@angular/core';
import { FeaturedSlider } from './featured-slider';
import type { Product } from '@core/models/product.model';

describe('FeaturedSlider', () => {
  let component: FeaturedSlider;
  let componentRef: ComponentRef<FeaturedSlider>;
  let fixture: ComponentFixture<FeaturedSlider>;

  const mockProducts: Product[] = [
    { id: 'prod-1', name: 'Zapatillas Urbanas', price: 15000, image: 'img1.jpg' } as Product,
    { id: 'prod-2', name: 'Remera Deportiva', price: 6500, image: 'img2.jpg' } as Product,
    { id: 'prod-3', name: 'Campera Bomber', price: 28000, image: 'img3.jpg' } as Product,
    { id: 'prod-4', name: 'Pantalón Cargo', price: 12000, image: 'img4.jpg' } as Product,
    { id: 'prod-5', name: 'Gorra Snapback', price: 4500, image: 'img5.jpg' } as Product,
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturedSlider],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturedSlider);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
  });

  it('should create the featured slider component', () => {
    expect(component).toBeTruthy();
    expect(component.hasProducts()).toBeFalse();
    expect(component.displayProducts()).toEqual([]);
  });

  it('should set custom title and render products properly', () => {
    componentRef.setInput('title', 'Imperdibles de la Semana');
    componentRef.setInput('products', mockProducts);
    fixture.detectChanges();

    expect(component.hasProducts()).toBeTrue();
    expect(component.title()).toBe('Imperdibles de la Semana');
    expect(component.displayProducts().length).toBeGreaterThanOrEqual(10);
    expect(component.animationDuration()).toContain('s');

    const titleElement: HTMLElement =
      fixture.nativeElement.querySelector('.featured-slider__title');
    expect(titleElement.textContent).toContain('Imperdibles de la Semana');

    const productCards = fixture.nativeElement.querySelectorAll('.marquee__item');
    expect(productCards.length).toBeGreaterThan(0);
  });

  it('should handle empty product list gracefully', () => {
    componentRef.setInput('products', []);
    fixture.detectChanges();

    expect(component.hasProducts()).toBeFalse();
    expect(component.displayProducts()).toEqual([]);
    const section = fixture.nativeElement.querySelector('.featured-slider');
    expect(section).toBeNull();
  });

  it('should not duplicate beyond necessary if already 10 or more products', () => {
    const manyProducts: Product[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p-${i}`,
      name: `Producto ${i}`,
      price: 1000 * (i + 1),
      image: `img-${i}.jpg`,
    })) as Product[];

    componentRef.setInput('products', manyProducts);
    fixture.detectChanges();

    expect(component.displayProducts().length).toBe(12);
  });
});
