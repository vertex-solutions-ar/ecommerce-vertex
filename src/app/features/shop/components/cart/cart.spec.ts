import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { Cart } from './cart';
import { CartService } from '@core/services/cart.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import type { Cart as CartModel, CartItem } from '@core/models/cart.model';

const makeCartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'var-1',
  productId: 'prod-1',
  variantId: 'var-1',
  name: 'Test Product (Color: Red)',
  price: 100,
  unitPrice: 100,
  quantity: 2,
  image: 'https://example.com/img.jpg',
  attributes: { color: 'Red' },
  stock: 10,
  ...overrides,
});

describe('Cart', () => {
  let component: Cart;
  let fixture: ComponentFixture<Cart>;
  let cartServiceSpy: jasmine.SpyObj<CartService>;
  let sweetAlertSpy: jasmine.SpyObj<SweetAlertService>;
  let router: Router;

  let cartSignal: ReturnType<typeof signal<CartModel>>;

  beforeEach(async () => {
    cartSignal = signal<CartModel>({ items: [], total: 0 });

    cartServiceSpy = jasmine.createSpyObj('CartService', ['updateQuantity', 'removeItem'], {
      cart: cartSignal,
    });
    sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['warning', 'error', 'success']);

    await TestBed.configureTestingModule({
      imports: [Cart],
      providers: [
        provideRouter([]),
        { provide: CartService, useValue: cartServiceSpy },
        { provide: SweetAlertService, useValue: sweetAlertSpy },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(Cart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should reflect an empty cart initially', () => {
    expect(component.cart().items).toEqual([]);
    expect(component.cart().total).toBe(0);
  });

  it('should render cart items from the signal', () => {
    cartSignal.set({ items: [makeCartItem()], total: 200 });
    fixture.detectChanges();

    expect(component.cart().items.length).toBe(1);
    expect(component.cart().items[0].name).toBe('Test Product (Color: Red)');
  });

  it('goToCheckout() should navigate to /shop/checkout', () => {
    component.goToCheckout();
    expect(router.navigate).toHaveBeenCalledWith(['/checkout']);
  });

  it('onRemoveItem() should call cartService.removeItem with the correct id', () => {
    component.onRemoveItem('var-1');
    expect(cartServiceSpy.removeItem).toHaveBeenCalledWith('var-1');
  });

  it('onUpdateQuantity() should call cartService.updateQuantity with parsed value', () => {
    const item = makeCartItem();
    const fakeEvent = { target: { value: '5' } } as unknown as Event;

    component.onUpdateQuantity(item, fakeEvent);

    expect(cartServiceSpy.updateQuantity).toHaveBeenCalledWith('var-1', 5);
  });

  it('onUpdateQuantity() should default to 1 for non-numeric input', () => {
    const item = makeCartItem();
    const fakeEvent = { target: { value: 'abc' } } as unknown as Event;

    component.onUpdateQuantity(item, fakeEvent);

    expect(cartServiceSpy.updateQuantity).toHaveBeenCalledWith('var-1', 1);
  });

  it('onUpdateQuantity() should cap at item.stock and update input value', () => {
    const item = makeCartItem({ stock: 3 });
    const inputEl = { value: '10' };
    const fakeEvent = { target: inputEl } as unknown as Event;

    component.onUpdateQuantity(item, fakeEvent);

    expect(cartServiceSpy.updateQuantity).toHaveBeenCalledWith('var-1', 3);
    expect(inputEl.value).toBe('3');
  });

  it('onUpdateQuantity() should enforce minimum of 1', () => {
    const item = makeCartItem();
    const inputEl = { value: '0' };
    const fakeEvent = { target: inputEl } as unknown as Event;

    component.onUpdateQuantity(item, fakeEvent);

    expect(cartServiceSpy.updateQuantity).toHaveBeenCalledWith('var-1', 1);
    expect(inputEl.value).toBe('1');
  });

  it('onButtonMouseMove() should set CSS custom properties --x and --y', () => {
    const fakeButton = document.createElement('button');
    spyOn(fakeButton, 'getBoundingClientRect').and.returnValue({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      x: 10,
      y: 20,
      bottom: 70,
      right: 110,
      toJSON: () => {},
    });
    const fakeEvent = {
      currentTarget: fakeButton,
      clientX: 25,
      clientY: 35,
    } as unknown as MouseEvent;

    component.onButtonMouseMove(fakeEvent);

    expect(fakeButton.style.getPropertyValue('--x')).toBe('15px');
    expect(fakeButton.style.getPropertyValue('--y')).toBe('15px');
  });

  it('onButtonMouseMove() should return early if currentTarget is null', () => {
    const fakeEvent = { currentTarget: null } as unknown as MouseEvent;
    expect(() => component.onButtonMouseMove(fakeEvent)).not.toThrow();
  });

  describe('ngOnInit Payment Reference Handling', () => {
    it('should show warning alert and clean query params when preference_id exists with rejected status', () => {
      TestBed.resetTestingModule();
      cartSignal = signal<CartModel>({ items: [], total: 0 });
      cartServiceSpy = jasmine.createSpyObj('CartService', ['updateQuantity', 'removeItem'], {
        cart: cartSignal,
      });
      sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['warning']);

      TestBed.configureTestingModule({
        imports: [Cart],
        providers: [
          provideRouter([]),
          { provide: CartService, useValue: cartServiceSpy },
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: {
                  has: (key: string) => key === 'preference_id',
                  get: (key: string) => (key === 'status' ? 'rejected' : null),
                },
              },
            },
          },
        ],
      });

      const navRouter = TestBed.inject(Router);
      spyOn(navRouter, 'navigate').and.returnValue(Promise.resolve(true));

      const fix = TestBed.createComponent(Cart);
      fix.detectChanges();

      expect(sweetAlertSpy.warning).toHaveBeenCalledWith(
        'Pago no completado',
        'El proceso de pago fue cancelado o no se completó. Tus productos continúan guardados en el carrito.',
      );
      expect(navRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: jasmine.anything(),
        queryParams: {},
        replaceUrl: true,
      });
    });

    it('should show warning alert when external_reference exists with cancelled status', () => {
      TestBed.resetTestingModule();
      cartSignal = signal<CartModel>({ items: [], total: 0 });
      cartServiceSpy = jasmine.createSpyObj('CartService', ['updateQuantity', 'removeItem'], {
        cart: cartSignal,
      });
      sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['warning']);

      TestBed.configureTestingModule({
        imports: [Cart],
        providers: [
          provideRouter([]),
          { provide: CartService, useValue: cartServiceSpy },
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: {
                  has: (key: string) => key === 'external_reference',
                  get: (key: string) => (key === 'collection_status' ? 'cancelled' : null),
                },
              },
            },
          },
        ],
      });

      const navRouter = TestBed.inject(Router);
      spyOn(navRouter, 'navigate').and.returnValue(Promise.resolve(true));

      const fix = TestBed.createComponent(Cart);
      fix.detectChanges();

      expect(sweetAlertSpy.warning).toHaveBeenCalled();
      expect(navRouter.navigate).toHaveBeenCalled();
    });

    it('should clean query params without showing warning if payment status is approved', () => {
      TestBed.resetTestingModule();
      cartSignal = signal<CartModel>({ items: [], total: 0 });
      cartServiceSpy = jasmine.createSpyObj('CartService', ['updateQuantity', 'removeItem'], {
        cart: cartSignal,
      });
      sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['warning']);

      TestBed.configureTestingModule({
        imports: [Cart],
        providers: [
          provideRouter([]),
          { provide: CartService, useValue: cartServiceSpy },
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: {
                  has: (key: string) => key === 'preference_id',
                  get: (key: string) => (key === 'status' ? 'approved' : null),
                },
              },
            },
          },
        ],
      });

      const navRouter = TestBed.inject(Router);
      spyOn(navRouter, 'navigate').and.returnValue(Promise.resolve(true));

      const fix = TestBed.createComponent(Cart);
      fix.detectChanges();

      expect(sweetAlertSpy.warning).not.toHaveBeenCalled();
      expect(navRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: jasmine.anything(),
        queryParams: {},
        replaceUrl: true,
      });
    });
  });
});
