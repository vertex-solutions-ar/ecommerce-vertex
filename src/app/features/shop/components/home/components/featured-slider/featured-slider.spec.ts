import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ComponentRef } from '@angular/core';
import { FeaturedSlider } from './featured-slider';
import type { Product } from '@core/models/product.model';
import { CartService } from '@core/services/cart.service';

describe('FeaturedSlider', () => {
  let component: FeaturedSlider;
  let componentRef: ComponentRef<FeaturedSlider>;
  let fixture: ComponentFixture<FeaturedSlider>;
  let cartServiceSpy: jasmine.SpyObj<CartService>;

  const mockProducts: Product[] = [
    { id: 'prod-1', name: 'Zapatillas Urbanas', price: 15000, image: 'img1.jpg' } as Product,
    { id: 'prod-2', name: 'Remera Deportiva', price: 6500, image: 'img2.jpg' } as Product,
    { id: 'prod-3', name: 'Campera Bomber', price: 28000, image: 'img3.jpg' } as Product,
    { id: 'prod-4', name: 'Pantalón Cargo', price: 12000, image: 'img4.jpg' } as Product,
    { id: 'prod-5', name: 'Gorra Snapback', price: 4500, image: 'img5.jpg' } as Product,
  ];

  beforeEach(async () => {
    cartServiceSpy = jasmine.createSpyObj<CartService>('CartService', ['addToCart']);

    await TestBed.configureTestingModule({
      imports: [FeaturedSlider],
      providers: [provideRouter([]), { provide: CartService, useValue: cartServiceSpy }],
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

  it('should set custom title and render products properly without shipping badge', () => {
    componentRef.setInput('title', 'Imperdibles de la Semana');
    componentRef.setInput('products', mockProducts);
    fixture.detectChanges();

    expect(component.hasProducts()).toBeTrue();
    expect(component.title()).toBe('Imperdibles de la Semana');
    expect(component.displayProducts().length).toBeGreaterThanOrEqual(18);
    expect(component.animationDuration()).toContain('s');

    const titleElement: HTMLElement =
      fixture.nativeElement.querySelector('.featured-slider__title');
    expect(titleElement.textContent).toContain('Imperdibles de la Semana');

    const productCards = fixture.nativeElement.querySelectorAll('.marquee__item');
    expect(productCards.length).toBeGreaterThan(0);

    // Verificación de eliminación del texto y etiqueta 'Envío gratis'
    const shippingElements = fixture.nativeElement.querySelectorAll('.product-card__shipping');
    expect(shippingElements.length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Envío gratis');
  });

  it('should handle empty product list gracefully', () => {
    componentRef.setInput('products', []);
    fixture.detectChanges();

    expect(component.hasProducts()).toBeFalse();
    expect(component.displayProducts()).toEqual([]);
    const section = fixture.nativeElement.querySelector('.featured-slider');
    expect(section).toBeNull();
  });

  it('should duplicate items when count is low (7 items) to cover ultra-wide monitors', () => {
    const sevenProducts: Product[] = Array.from({ length: 7 }, (_, i) => ({
      id: `p-${i}`,
      name: `Producto ${i}`,
      price: 1000 * (i + 1),
      image: `img-${i}.jpg`,
    })) as Product[];

    componentRef.setInput('products', sevenProducts);
    fixture.detectChanges();

    // 7 ítems se duplican cíclicamente hasta superar el umbral de 18 ítems (7 -> 14 -> 21)
    expect(component.displayProducts().length).toBe(21);
  });

  it('should not duplicate beyond necessary if already 18 or more products', () => {
    const eighteenProducts: Product[] = Array.from({ length: 18 }, (_, i) => ({
      id: `p-${i}`,
      name: `Producto ${i}`,
      price: 1000 * (i + 1),
      image: `img-${i}.jpg`,
    })) as Product[];

    componentRef.setInput('products', eighteenProducts);
    fixture.detectChanges();

    expect(component.displayProducts().length).toBe(18);
  });

  it('should calibrate animation duration within the ~75s to 95s range dynamically', () => {
    // Caso con pocos productos (5 productos) -> límite inferior 75s
    componentRef.setInput('products', mockProducts);
    expect(component.animationDuration()).toBe('75s');

    // Caso con 10 productos -> 10 * 8s = 80s (dentro del rango 75s - 95s)
    const tenProducts: Product[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      name: `Producto ${i}`,
      price: 1000 * (i + 1),
      image: `img-${i}.jpg`,
    })) as Product[];
    componentRef.setInput('products', tenProducts);
    expect(component.animationDuration()).toBe('80s');

    // Caso con muchos productos (15 productos) -> límite superior 95s (15 * 8s = 120s -> clamp a 95s)
    const fifteenProducts: Product[] = Array.from({ length: 15 }, (_, i) => ({
      id: `p-${i}`,
      name: `Producto ${i}`,
      price: 1000 * (i + 1),
      image: `img-${i}.jpg`,
    })) as Product[];
    componentRef.setInput('products', fifteenProducts);
    expect(component.animationDuration()).toBe('95s');
  });

  it('should render two mirrored blocks (accessible and decorative aria-hidden)', () => {
    componentRef.setInput('products', mockProducts);
    fixture.detectChanges();

    const marquee: HTMLElement = fixture.nativeElement.querySelector('.marquee');
    expect(marquee).toBeTruthy();

    const groups: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll('.marquee__group');
    expect(groups.length).toBe(2);
    expect(groups[0].getAttribute('aria-hidden')).toBeNull();
    expect(groups[1].getAttribute('aria-hidden')).toBe('true');
    expect(groups[0].parentElement).toBe(marquee);
    expect(groups[1].parentElement).toBe(marquee);
  });

  it('should call cartService.addToCart, stopPropagation and preventDefault on onAddToCart', fakeAsync(() => {
    const eventMock = jasmine.createSpyObj<Event>('Event', ['stopPropagation', 'preventDefault']);
    const targetProduct = mockProducts[0];

    component.onAddToCart(eventMock, targetProduct);

    expect(eventMock.stopPropagation).toHaveBeenCalled();
    expect(eventMock.preventDefault).toHaveBeenCalled();
    expect(cartServiceSpy.addToCart).toHaveBeenCalledWith(targetProduct, 1);
    expect(component.isAdded('prod-1')).toBeTrue();

    // Estado reactivo temporal expira tras 1500ms
    tick(1500);
    expect(component.isAdded('prod-1')).toBeFalse();
  }));

  it('should trigger onAddToCart and show checkmark confirmation when clicking quick-add button in template', fakeAsync(() => {
    componentRef.setInput('products', mockProducts);
    fixture.detectChanges();

    const addButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.btn-quick-add');
    expect(addButtons.length).toBeGreaterThan(0);

    const firstButton = addButtons[0];
    firstButton.click();
    fixture.detectChanges();

    expect(cartServiceSpy.addToCart).toHaveBeenCalledWith(mockProducts[0], 1);
    expect(component.isAdded(mockProducts[0].id)).toBeTrue();
    expect(firstButton.classList.contains('btn-quick-add--added')).toBeTrue();
    expect(firstButton.querySelector('.bi-check-lg')).toBeTruthy();

    tick(1500);
    fixture.detectChanges();

    expect(component.isAdded(mockProducts[0].id)).toBeFalse();
    expect(firstButton.classList.contains('btn-quick-add--added')).toBeFalse();
    expect(firstButton.querySelector('.bi-plus-lg')).toBeTruthy();
  }));
});
