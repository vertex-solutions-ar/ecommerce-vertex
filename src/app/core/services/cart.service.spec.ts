import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CartService } from './cart.service';
import { SweetAlertService } from './sweet-alert.service';
import { AttributeService } from './attribute.service';
import { ProductService } from './product.service';
import type { Product, ProductVariant } from '@core/models/product.model';
import { environment } from '../../../environments/environment';

const CART_KEY = `cart_${environment.tenantId}`;

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-1',
  name: 'Test Product',
  description: 'A product',
  price: 100,
  categoryId: 'cat-1',
  image: 'https://example.com/img.jpg',
  images: [],
  variantAttributes: [],
  totalStock: 10,
  inStockAttributes: {},
  createdAt: new Date(),
  ...overrides,
});

const makeVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'var-1',
  productId: 'prod-1',
  attributes: { color: 'Red' },
  stock: 10,
  ...overrides,
});

describe('CartService', () => {
  let service: CartService;
  let sweetAlertSpy: jasmine.SpyObj<SweetAlertService>;
  let attributeServiceSpy: jasmine.SpyObj<AttributeService>;
  let productServiceSpy: jasmine.SpyObj<ProductService>;

  beforeEach(() => {
    localStorage.clear();

    sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['success', 'error']);
    attributeServiceSpy = jasmine.createSpyObj('AttributeService', ['getAttributes']);
    attributeServiceSpy.getAttributes.and.returnValue(of([]));
    productServiceSpy = jasmine.createSpyObj('ProductService', ['getProducts']);
    productServiceSpy.getProducts.and.returnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        CartService,
        { provide: SweetAlertService, useValue: sweetAlertSpy },
        { provide: AttributeService, useValue: attributeServiceSpy },
        { provide: ProductService, useValue: productServiceSpy },
      ],
    });

    service = TestBed.inject(CartService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with an empty cart', () => {
    expect(service.cart().items).toEqual([]);
    expect(service.cart().total).toBe(0);
    expect(service.itemCount()).toBe(0);
  });

  describe('addItem()', () => {
    it('should add a new item to the cart', () => {
      service.addItem(makeProduct(), makeVariant(), 1);

      expect(service.cart().items.length).toBe(1);
      expect(service.cart().items[0].productId).toBe('prod-1');
      expect(service.cart().items[0].quantity).toBe(1);
    });

    it('should calculate the total correctly', () => {
      service.addItem(makeProduct({ price: 50 }), makeVariant(), 3);

      expect(service.cart().total).toBe(150);
    });

    it('should increase quantity when same variant is added again', () => {
      service.addItem(makeProduct(), makeVariant(), 2);
      service.addItem(makeProduct(), makeVariant(), 3);

      expect(service.cart().items.length).toBe(1);
      expect(service.cart().items[0].quantity).toBe(5);
    });

    it('should show error and not add item when quantity exceeds stock', () => {
      service.addItem(makeProduct(), makeVariant({ stock: 2 }), 5);

      expect(service.cart().items).toEqual([]);
      expect(sweetAlertSpy.error).toHaveBeenCalled();
    });

    it('should show error and not update when adding to existing item exceeds stock', () => {
      service.addItem(makeProduct(), makeVariant({ stock: 5 }), 3);
      service.addItem(makeProduct(), makeVariant({ stock: 5 }), 3); // 3+3=6 > 5

      expect(service.cart().items[0].quantity).toBe(3);
      expect(sweetAlertSpy.error).toHaveBeenCalled();
    });

    it('should update itemCount computed signal', () => {
      service.addItem(makeProduct(), makeVariant(), 4);
      expect(service.itemCount()).toBe(4);
    });

    it('should correctly map existing items during addition when cart has multiple different items', () => {
      service.addItem(makeProduct({ id: 'prod-1' }), makeVariant({ id: 'var-1' }), 1);
      service.addItem(makeProduct({ id: 'prod-2' }), makeVariant({ id: 'var-2' }), 1);
      service.addItem(makeProduct({ id: 'prod-1' }), makeVariant({ id: 'var-1' }), 1);

      expect(service.cart().items.length).toBe(2);
      expect(service.cart().items.find((item) => item.id === 'var-1')?.quantity).toBe(2);
      expect(service.cart().items.find((item) => item.id === 'var-2')?.quantity).toBe(1);
    });
  });

  describe('removeItem()', () => {
    it('should remove the item from the cart', () => {
      service.addItem(makeProduct(), makeVariant(), 1);
      service.removeItem('var-1');

      expect(service.cart().items).toEqual([]);
      expect(service.cart().total).toBe(0);
    });

    it('should show success alert when removing', () => {
      service.addItem(makeProduct(), makeVariant(), 1);
      service.removeItem('var-1');

      // 1 for addItem + 1 for removeItem
      expect(sweetAlertSpy.success).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateQuantity()', () => {
    it('should update quantity of an existing item', () => {
      service.addItem(makeProduct({ price: 10 }), makeVariant(), 1);
      service.updateQuantity('var-1', 5);

      expect(service.cart().items[0].quantity).toBe(5);
      expect(service.cart().total).toBe(50);
    });

    it('should cap quantity at available stock', () => {
      service.addItem(makeProduct(), makeVariant({ stock: 3 }), 1);
      service.updateQuantity('var-1', 10);

      expect(service.cart().items[0].quantity).toBe(3);
      expect(sweetAlertSpy.error).toHaveBeenCalled();
    });

    it('should enforce minimum quantity of 1', () => {
      service.addItem(makeProduct(), makeVariant(), 3);
      service.updateQuantity('var-1', 0);

      expect(service.cart().items[0].quantity).toBe(1);
    });

    it('should do nothing when item id does not exist', () => {
      service.addItem(makeProduct(), makeVariant(), 2);
      service.updateQuantity('non-existent-id', 5);

      expect(service.cart().items[0].quantity).toBe(2);
    });

    it('should correctly map other items during quantity update when cart has multiple different items', () => {
      service.addItem(makeProduct({ id: 'prod-1' }), makeVariant({ id: 'var-1' }), 1);
      service.addItem(makeProduct({ id: 'prod-2' }), makeVariant({ id: 'var-2' }), 1);

      service.updateQuantity('var-1', 4);

      expect(service.cart().items.find((item) => item.id === 'var-1')?.quantity).toBe(4);
      expect(service.cart().items.find((item) => item.id === 'var-2')?.quantity).toBe(1);
    });
  });

  describe('clearCart()', () => {
    it('should empty the cart completely', () => {
      service.addItem(makeProduct(), makeVariant(), 2);
      service.clearCart();

      expect(service.cart().items).toEqual([]);
      expect(service.cart().total).toBe(0);
      expect(service.itemCount()).toBe(0);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist the cart to localStorage on changes', () => {
      service.addItem(makeProduct(), makeVariant(), 1);
      TestBed.flushEffects();

      const stored = localStorage.getItem(CART_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.items.length).toBe(1);
    });

    it('should load the cart from localStorage on init', () => {
      const cart = { items: [{ id: 'var-1', quantity: 2, price: 50 }], total: 100 };
      localStorage.setItem(CART_KEY, JSON.stringify(cart));

      // Re-create service to trigger constructor load
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CartService,
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          { provide: AttributeService, useValue: attributeServiceSpy },
          { provide: ProductService, useValue: productServiceSpy },
        ],
      });
      const newService = TestBed.inject(CartService);

      expect(newService.cart().items.length).toBe(1);
    });

    it('should return empty cart when stored JSON has no items array', () => {
      localStorage.setItem(CART_KEY, JSON.stringify({ total: 0 }));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CartService,
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          { provide: AttributeService, useValue: attributeServiceSpy },
          { provide: ProductService, useValue: productServiceSpy },
        ],
      });
      const newService = TestBed.inject(CartService);

      expect(newService.cart().items).toEqual([]);
    });

    it('should return empty cart when stored JSON is malformed', () => {
      spyOn(console, 'error');
      localStorage.setItem(CART_KEY, 'not-valid-json');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CartService,
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          { provide: AttributeService, useValue: attributeServiceSpy },
          { provide: ProductService, useValue: productServiceSpy },
        ],
      });
      const newService = TestBed.inject(CartService);

      expect(newService.cart().items).toEqual([]);
    });
  });

  describe('getVariantDescription()', () => {
    it('should return formatted attribute names when attributeMap is loaded', () => {
      attributeServiceSpy.getAttributes.and.returnValue(
        of([{ id: 'color', name: 'Color', values: ['Red'] }]),
      );

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CartService,
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          { provide: AttributeService, useValue: attributeServiceSpy },
          { provide: ProductService, useValue: productServiceSpy },
        ],
      });
      const newService = TestBed.inject(CartService);

      const description = newService.getVariantDescription({ color: 'Red' });
      expect(description).toBe('Color: Red');
    });

    it('should fall back to attribute id when name is not in map', () => {
      const description = service.getVariantDescription({ unknownId: 'Blue' });
      expect(description).toBe('unknownId: Blue');
    });

    it('should ignore attributes without an id when loading', () => {
      attributeServiceSpy.getAttributes.and.returnValue(
        of([{ id: undefined as unknown as string, name: 'NoId', values: [] }]),
      );

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CartService,
          { provide: SweetAlertService, useValue: sweetAlertSpy },
          { provide: AttributeService, useValue: attributeServiceSpy },
          { provide: ProductService, useValue: productServiceSpy },
        ],
      });
      const newService = TestBed.inject(CartService);
      const description = newService.getVariantDescription({ x: 'y' });
      expect(description).toBe('x: y');
    });
  });

  describe('localStorage error handling', () => {
    it('should not throw when localStorage.setItem fails', () => {
      spyOn(console, 'error');
      spyOn(localStorage, 'setItem').and.callFake(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => {
        service.clearCart();
        TestBed.flushEffects();
      }).not.toThrow();
    });
  });

  describe('localStorage error handling extra', () => {
    it('should handle error when localStorage.getItem throws', () => {
      spyOn(console, 'error');
      spyOn(localStorage, 'getItem').and.callFake(() => {
        throw new Error('SecurityError');
      });
      const spyRemove = spyOn(localStorage, 'removeItem');

      TestBed.runInInjectionContext(() => {
        const newService = new CartService();
        expect(newService.cart().items).toEqual([]);
        expect(spyRemove).toHaveBeenCalledWith(`cart_${environment.tenantId}`);
      });
    });
  });

  describe('addItem image fallback', () => {
    it('should use variant image if present, otherwise fall back to product image', () => {
      const product = makeProduct({ image: 'https://example.com/prod.jpg' });
      const variantNoImage = makeVariant({ image: undefined });
      service.addItem(product, variantNoImage, 1);
      expect(service.cart().items[0].image).toBe('https://example.com/prod.jpg');

      service.clearCart();
      const variantWithImage = makeVariant({ id: 'var-2', image: 'https://example.com/var.jpg' });
      service.addItem(product, variantWithImage, 1);
      expect(service.cart().items[0].image).toBe('https://example.com/var.jpg');
    });
  });

  describe('simple products without attributes', () => {
    it('should format cart item name cleanly without empty parenthesis when attributes is empty', () => {
      const product = makeProduct({ name: 'Libro de Filosofía' });
      const simpleVariant = makeVariant({ id: 'var-simple', attributes: {} });
      service.addItem(product, simpleVariant, 1);

      expect(service.cart().items[0].name).toBe('Libro de Filosofía');
      expect(service.cart().items[0].name).not.toContain('()');
    });

    it('should return empty string from getVariantDescription when attributes is empty or null', () => {
      expect(service.getVariantDescription({})).toBe('');
      expect(service.getVariantDescription(null as unknown as { [key: string]: string })).toBe('');
    });
  });

  describe('pruneUnavailableItems', () => {
    it('should remove items whose product no longer exists in the catalog', async () => {
      const product = makeProduct({ id: 'prod-keep', name: 'Producto Vivo', totalStock: 5 });
      const keepItem = {
        id: 'var-keep',
        productId: 'prod-keep',
        variantId: 'var-keep',
        name: 'Producto Vivo',
        price: 100,
        quantity: 1,
        attributes: {},
        stock: 5,
      };
      const ghostItem = {
        id: 'var-ghost',
        productId: 'prod-borrado',
        variantId: 'var-ghost',
        name: 'Producto Borrado',
        price: 100,
        quantity: 1,
        attributes: {},
        stock: 1,
      };
      service.cart.set({ items: [keepItem, ghostItem], total: 200 });
      productServiceSpy.getProducts.and.returnValue(of([product]));

      const removed = await service.pruneUnavailableItems();

      expect(removed).toEqual(['Producto Borrado']);
      expect(service.cart().items).toEqual([jasmine.objectContaining({ id: 'var-keep' })]);
      expect(service.cart().total).toBe(100);
    });

    it('should remove items whose product is out of stock (totalStock 0)', async () => {
      const product = makeProduct({ id: 'prod-sin-stock', name: 'Sin Stock', totalStock: 0 });
      productServiceSpy.getProducts.and.returnValue(of([product]));
      service.cart.set({
        items: [
          {
            id: 'var-sin',
            productId: 'prod-sin-stock',
            variantId: 'var-sin',
            name: 'Sin Stock',
            price: 100,
            quantity: 1,
            attributes: {},
            stock: 0,
          },
        ],
        total: 100,
      });

      const removed = await service.pruneUnavailableItems();

      expect(removed).toEqual(['Sin Stock']);
      expect(service.cart().items.length).toBe(0);
      expect(service.cart().total).toBe(0);
    });

    it('should keep the cart intact when catalog fetch fails', fakeAsync(() => {
      spyOn(console, 'warn');
      spyOn(console, 'error');
      const product = makeProduct({ id: 'prod-ok', name: 'Ok', totalStock: 3 });
      service.addItem(product, makeVariant({ id: 'var-ok', productId: 'prod-ok', stock: 3 }), 1);
      productServiceSpy.getProducts.and.returnValue(throwError(() => new Error('red caída')));

      let removed: string[] = [];
      service.pruneUnavailableItems().then((res) => {
        removed = res;
      });
      tick();

      expect(removed).toEqual([]);
      expect(service.cart().items.length).toBe(1);
    }));
  });

  describe('Simple products support (ticket #497)', () => {
    it('should add a simple product without variant assigning stock and null variantId', () => {
      const simpleProd = makeProduct({
        id: 'prod-simple-1',
        name: 'Libro',
        stock: 12,
        totalStock: 12,
      });
      service.addItem(simpleProd, null, 2);

      const cartItems = service.cart().items;
      expect(cartItems.length).toBe(1);
      expect(cartItems[0].id).toBe('prod-simple-1');
      expect(cartItems[0].productId).toBe('prod-simple-1');
      expect(cartItems[0].variantId).toBeNull();
      expect(cartItems[0].quantity).toBe(2);
      expect(cartItems[0].stock).toBe(12);
      expect(cartItems[0].name).toBe('Libro');
    });

    it('should merge quantity when adding duplicate simple product without variant', () => {
      const simpleProd = makeProduct({
        id: 'prod-simple-2',
        name: 'Vela',
        stock: 10,
        totalStock: 10,
      });
      service.addItem(simpleProd, null, 2);
      service.addItem(simpleProd, null, 3);

      const cartItems = service.cart().items;
      expect(cartItems.length).toBe(1);
      expect(cartItems[0].quantity).toBe(5);
    });

    it('should reject addition when quantity exceeds simple product stock', () => {
      const simpleProd = makeProduct({ id: 'prod-simple-3', stock: 3, totalStock: 3 });
      service.addItem(simpleProd, null, 4);

      expect(service.cart().items.length).toBe(0);
      expect(sweetAlertSpy.error).toHaveBeenCalledWith(
        'Stock insuficiente',
        'No puedes añadir 4. Stock disponible: 3.',
      );
    });
  });
});
