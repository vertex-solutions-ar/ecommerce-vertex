import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Product } from './product';
import { ProductService } from '@core/services/product.service';
import { CartService } from '@core/services/cart.service';
import { AttributeService } from '@core/services/attribute.service';
import type { Product as ProductModel, ProductVariant } from '@core/models/product.model';
import type { Attribute } from '@core/models/attribute.model';

const mockProductWithVariants: ProductModel = {
  id: 'prod-var-1',
  name: 'Remera Estampada',
  description: 'Remera 100% algodón',
  price: 25000,
  categoryId: 'cat-1',
  image: 'https://example.com/remera.jpg',
  images: ['https://example.com/remera-back.jpg'],
  hasAttributes: true,
  variantAttributes: ['attr-color', 'attr-talle'],
  totalStock: 15,
  inStockAttributes: {},
  createdAt: new Date(),
};

const mockVariants: ProductVariant[] = [
  {
    id: 'var-1',
    productId: 'prod-var-1',
    sku: 'REM-RED-M',
    stock: 5,
    attributes: { 'attr-color': 'Rojo', 'attr-talle': 'M' },
  },
  {
    id: 'var-2',
    productId: 'prod-var-1',
    sku: 'REM-BLUE-L',
    stock: 10,
    attributes: { 'attr-color': 'Azul', 'attr-talle': 'L' },
  },
];

const mockSimpleProduct: ProductModel = {
  id: 'prod-simple-1',
  name: 'Libro de Diseño Web',
  description: 'Guía práctica de diseño',
  price: 18000,
  categoryId: 'cat-books',
  image: 'https://example.com/libro.jpg',
  images: [],
  hasAttributes: false,
  stock: 8,
  totalStock: 8,
  variantAttributes: [],
  inStockAttributes: {},
  createdAt: new Date(),
};

const mockAttributes: Attribute[] = [
  { id: 'attr-color', name: 'Color', values: ['Rojo', 'Azul'] },
  { id: 'attr-talle', name: 'Talle', values: ['M', 'L'] },
];

describe('Product Component (Storefront)', () => {
  let component: Product;
  let fixture: ComponentFixture<Product>;
  let productServiceSpy: jasmine.SpyObj<ProductService>;
  let cartServiceSpy: jasmine.SpyObj<CartService>;
  let attributeServiceSpy: jasmine.SpyObj<AttributeService>;

  const setupTestBed = (productData: { product: ProductModel; variants: ProductVariant[] }) => {
    productServiceSpy = jasmine.createSpyObj('ProductService', ['getProductWithVariants']);
    cartServiceSpy = jasmine.createSpyObj('CartService', ['addItem']);
    attributeServiceSpy = jasmine.createSpyObj('AttributeService', ['getAttributes']);

    productServiceSpy.getProductWithVariants.and.returnValue(of(productData));
    attributeServiceSpy.getAttributes.and.returnValue(of(mockAttributes));

    TestBed.configureTestingModule({
      imports: [Product],
      providers: [
        { provide: ProductService, useValue: productServiceSpy },
        { provide: CartService, useValue: cartServiceSpy },
        { provide: AttributeService, useValue: attributeServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: productData.product.id })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Product);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  describe('Products with variants', () => {
    beforeEach(() => {
      setupTestBed({ product: mockProductWithVariants, variants: mockVariants });
    });

    it('should create and load product with variants', () => {
      expect(component).toBeTruthy();
      expect(component.product()?.name).toBe('Remera Estampada');
      expect(component.attributes().length).toBe(2);
      expect(component.selectedVariant()).toBeUndefined();
    });

    it('should allow selecting attributes and resolve selectedVariant', () => {
      component.selectAttribute('attr-color', 'Rojo');
      component.selectAttribute('attr-talle', 'M');

      expect(component.selectedVariant()?.id).toBe('var-1');
    });

    it('should call cartService.addItem when variant is selected and addToCart is clicked', () => {
      component.selectAttribute('attr-color', 'Rojo');
      component.selectAttribute('attr-talle', 'M');
      component.increaseQuantity();
      component.addToCart();

      expect(cartServiceSpy.addItem).toHaveBeenCalledWith(
        mockProductWithVariants,
        mockVariants[0],
        2,
      );
    });

    it('should change main image when changeMainImage is called', () => {
      component.changeMainImage('https://example.com/remera-back.jpg');
      expect(component.mainImage()).toBe('https://example.com/remera-back.jpg');
    });

    it('should toggle attribute selection off if same value is clicked twice', () => {
      component.selectAttribute('attr-color', 'Rojo');
      expect(component.attributes().find((a) => a.id === 'attr-color')?.selectedValue).toBe('Rojo');

      component.selectAttribute('attr-color', 'Rojo');
      expect(component.attributes().find((a) => a.id === 'attr-color')?.selectedValue).toBeNull();
    });

    it('should reset incompatible attribute values when changing selections', () => {
      component.selectAttribute('attr-color', 'Rojo');
      component.selectAttribute('attr-talle', 'M');

      // Now change color to Azul (which only has talle L)
      component.selectAttribute('attr-color', 'Azul');

      // talle M is incompatible with Azul, so talle selectedValue should be reset to null
      expect(component.attributes().find((a) => a.id === 'attr-talle')?.selectedValue).toBeNull();
    });

    it('should check option visibility via isOptionVisible()', () => {
      expect(component.isOptionVisible('nonexistent', 'Val')).toBeFalse();
      expect(component.isOptionVisible('attr-color', 'Rojo')).toBeTrue();
    });

    it('should get values for attribute via getValuesForAttribute()', () => {
      const attrSelection = component.attributes().find((a) => a.id === 'attr-color')!;
      const values = component.getValuesForAttribute(attrSelection);
      expect(values).toEqual(['Azul', 'Rojo']);
    });

    it('should calculate isMaxQuantityReached correctly', () => {
      expect(component.isMaxQuantityReached).toBeTrue(); // No variant selected yet

      component.selectAttribute('attr-color', 'Rojo');
      component.selectAttribute('attr-talle', 'M'); // stock 5

      expect(component.isMaxQuantityReached).toBeFalse();

      component.quantity.set(5);
      expect(component.isMaxQuantityReached).toBeTrue();

      component.increaseQuantity(); // Should not increase beyond stock 5
      expect(component.quantity()).toBe(5);
    });
  });

  describe('Simple products without attributes', () => {
    beforeEach(() => {
      setupTestBed({ product: mockSimpleProduct, variants: [] });
    });

    it('should identify simple product and not require attribute selection or variant', () => {
      expect(component).toBeTruthy();
      expect(component.product()?.name).toBe('Libro de Diseño Web');
      expect(component.isSimpleProduct()).toBeTrue();
      expect(component.attributes().length).toBe(0);
      expect(component.selectedVariant()).toBeNull();
      expect(component.maxAvailableStock()).toBe(8);
      expect(component.isOutOfStock()).toBeFalse();
    });

    it('should allow immediate addition to cart for simple products with null variant', () => {
      component.addToCart();
      expect(cartServiceSpy.addItem).toHaveBeenCalledWith(mockSimpleProduct, null, 1);
    });

    it('should respect quantity increment and decrement', () => {
      component.increaseQuantity();
      expect(component.quantity()).toBe(2);

      component.decreaseQuantity();
      expect(component.quantity()).toBe(1);

      component.decreaseQuantity();
      expect(component.quantity()).toBe(1); // Min 1
    });
  });

  describe('Fallback and Edge Cases', () => {
    it('should treat simple product without variants as simple product with direct stock', () => {
      setupTestBed({ product: mockSimpleProduct, variants: [] });

      expect(component.isSimpleProduct()).toBeTrue();
      expect(component.selectedVariant()).toBeNull();
      expect(component.maxAvailableStock()).toBe(8);
      expect(component.isOutOfStock()).toBeFalse();
    });

    it('should treat legacy product as simple product when hasAttributes is undefined and variants is empty', () => {
      const legacyProduct: ProductModel = {
        ...mockSimpleProduct,
        hasAttributes: undefined,
      };
      setupTestBed({ product: legacyProduct, variants: [] });

      expect(component.isSimpleProduct()).toBeTrue();
      expect(component.selectedVariant()).toBeNull();
      expect(component.maxAvailableStock()).toBe(8);
    });

    it('should handle route with missing id parameter', () => {
      productServiceSpy = jasmine.createSpyObj('ProductService', ['getProductWithVariants']);
      cartServiceSpy = jasmine.createSpyObj('CartService', ['addItem']);
      attributeServiceSpy = jasmine.createSpyObj('AttributeService', ['getAttributes']);

      TestBed.configureTestingModule({
        imports: [Product],
        providers: [
          { provide: ProductService, useValue: productServiceSpy },
          { provide: CartService, useValue: cartServiceSpy },
          { provide: AttributeService, useValue: attributeServiceSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(convertToParamMap({})),
            },
          },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(Product);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.product()).toBeUndefined();
      expect(productServiceSpy.getProductWithVariants).not.toHaveBeenCalled();
    });

    it('getValuesForAttribute should fallback to allAttr values when variantValues is empty', () => {
      setupTestBed({
        product: { ...mockProductWithVariants, variantAttributes: ['attr-color'] },
        variants: [],
      });

      const attrSelection = {
        id: 'attr-color',
        name: 'Color',
        values: [],
        allValues: [],
        selectedValue: null,
      };

      const values = component.getValuesForAttribute(attrSelection);
      expect(values).toEqual(['Rojo', 'Azul']);
    });

    it('isOptionVisible should fallback to attribute definition values when variants is empty', () => {
      setupTestBed({
        product: { ...mockProductWithVariants, variantAttributes: ['attr-color'] },
        variants: [],
      });

      expect(component.isOptionVisible('attr-color', 'Rojo')).toBeTrue();
      expect(component.isOptionVisible('attr-color', 'Verde')).toBeFalse();
    });

    it('addToCart should not call cartService.addItem if product with variants has no selected variant', () => {
      setupTestBed({ product: mockProductWithVariants, variants: mockVariants });
      component.selectedVariant.set(undefined);
      cartServiceSpy.addItem.calls.reset();

      component.addToCart();

      expect(cartServiceSpy.addItem).not.toHaveBeenCalled();
    });
  });
});
