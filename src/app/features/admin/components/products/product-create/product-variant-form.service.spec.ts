import { TestBed } from '@angular/core/testing';
import type { FormArray, FormGroup } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import type { ProductFormValue, ProductVariantFormValue } from './product-variant-form.service';
import { ProductVariantFormService } from './product-variant-form.service';
import type { Product, ProductVariant } from '@core/models/product.model';

describe('ProductVariantFormService', () => {
  let service: ProductVariantFormService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [ProductVariantFormService],
    });
    service = TestBed.inject(ProductVariantFormService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.variantSearchControl.value).toBe('');
  });

  it('should create product form with initial controls and validators', () => {
    const form = service.createProductForm();
    expect(form.get('name')).toBeTruthy();
    expect(form.get('description')).toBeTruthy();
    expect(form.get('price')).toBeTruthy();
    expect(form.get('categoryId')).toBeTruthy();
    expect(form.get('image')).toBeTruthy();
    expect(form.get('images')).toBeTruthy();
    expect(form.get('variantAttributes')).toBeTruthy();
    expect(form.get('variants')).toBeTruthy();
  });

  it('should create variant group with selected attribute IDs', () => {
    const variant: ProductVariant = {
      id: 'v1',
      productId: 'p1',
      attributes: { color: 'Rojo', size: 'M' },
      stock: 10,
    };
    const group = service.createVariantGroup(['color', 'size'], variant);

    expect(group.get('id')?.value).toBe('v1');
    expect(group.get('stock')?.value).toBe(10);
    const attrGroup = group.get('attributes') as FormGroup;
    expect(attrGroup.get('color')?.value).toBe('Rojo');
    expect(attrGroup.get('size')?.value).toBe('M');
  });

  it('should build edit changes correctly', () => {
    const formVariants: ProductVariantFormValue[] = [
      { id: 'v1', attributes: { color: 'Azul' }, stock: 5 },
      { id: null, attributes: { color: 'Verde' }, stock: 15 },
    ];

    const initialVariants: ProductVariant[] = [
      { id: 'v1', productId: 'p1', attributes: { color: 'Rojo' }, stock: 10 },
      { id: 'v2', productId: 'p1', attributes: { color: 'Negro' }, stock: 20 },
    ];

    const changes = service.buildEditChanges(formVariants, initialVariants);

    expect(changes.toUpdate.length).toBe(1);
    expect(changes.toUpdate[0]).toEqual({ id: 'v1', attributes: { color: 'Azul' }, stock: 5 });

    expect(changes.toAdd.length).toBe(1);
    expect(changes.toAdd[0]).toEqual({ attributes: { color: 'Verde' }, stock: 15 });

    expect(changes.toDelete).toEqual(['v2']);
  });

  it('should include basePrice in buildEditChanges when provided', () => {
    const formVariants: ProductVariantFormValue[] = [
      { id: 'v1', attributes: { color: 'Azul' }, stock: 5 },
      { id: null, attributes: { color: 'Verde' }, stock: 15 },
    ];
    const initialVariants: ProductVariant[] = [
      { id: 'v1', productId: 'p1', attributes: { color: 'Rojo' }, stock: 10 },
    ];

    const changes = service.buildEditChanges(formVariants, initialVariants, 999);

    expect(changes.toUpdate[0]).toEqual({
      id: 'v1',
      attributes: { color: 'Azul' },
      stock: 5,
      price: 999,
    });
    expect(changes.toAdd[0]).toEqual({
      attributes: { color: 'Verde' },
      stock: 15,
      price: 999,
    });
  });

  it('should build simple product data object with direct stock', () => {
    const formValue: ProductFormValue = {
      name: 'Remera Simple',
      description: 'Descripción',
      price: 2500,
      categoryId: 'cat-1',
      image: 'http://example.com/img.jpg',
      images: ['http://example.com/img2.jpg'],
      hasAttributes: false,
      stock: 15,
      variantAttributes: [],
      variants: [],
    };

    const data = service.buildProductData(formValue);

    expect(data.name).toBe('Remera Simple');
    expect(data.price).toBe(2500);
    expect(data.hasAttributes).toBeFalse();
    expect(data.stock).toBe(15);
    expect(data.totalStock).toBe(15);
    expect(data.variants).toEqual([]);
    expect(data.variantAttributes).toEqual([]);
    expect(data.createdAt).toBeInstanceOf(Date);
  });

  it('should build product data object and calculate totalStock from variants', () => {
    const formValue: ProductFormValue = {
      name: 'Remera',
      description: 'Descripción',
      price: 2500,
      categoryId: 'cat-1',
      image: 'http://example.com/img.jpg',
      images: ['http://example.com/img2.jpg'],
      hasAttributes: true,
      stock: 0,
      variantAttributes: ['color'],
      variants: [
        { id: 'v1', attributes: { color: 'Rojo' }, stock: 8 },
        { id: null, attributes: { color: 'Azul' }, stock: 12 },
      ],
    };

    const data = service.buildProductData(formValue);

    expect(data.name).toBe('Remera');
    expect(data.price).toBe(2500);
    expect(data.hasAttributes).toBeTrue();
    expect(data.totalStock).toBe(20);
    expect(data.createdAt).toBeInstanceOf(Date);
  });

  it('should sync variant attributes on variants FormGroups', () => {
    const vGroup1 = service.createVariantGroup(['color', 'size']);
    const vGroup2 = service.createVariantGroup(['color', 'material']);

    service.syncVariantAttributes([vGroup1, vGroup2], ['color', 'brand']);

    const ag1 = vGroup1.get('attributes') as FormGroup;
    expect(ag1.get('color')).toBeTruthy();
    expect(ag1.get('size')).toBeNull();
    expect(ag1.get('brand')).toBeTruthy();

    const ag2 = vGroup2.get('attributes') as FormGroup;
    expect(ag2.get('color')).toBeTruthy();
    expect(ag2.get('material')).toBeNull();
    expect(ag2.get('brand')).toBeTruthy();
  });

  it('should populate edit form with existing product and variants data and keep it pristine and untouched', () => {
    const form = service.createProductForm();
    const product: Product = {
      id: 'p1',
      name: 'Camisa',
      description: 'Camisa elegante',
      price: 3500,
      categoryId: 'cat-2',
      image: 'http://example.com/camisa.jpg',
      images: ['http://example.com/camisa2.jpg'],
      variantAttributes: ['size'],
    } as unknown as Product;
    const variants: ProductVariant[] = [
      { id: 'v1', productId: 'p1', attributes: { size: 'L' }, stock: 8 },
    ];

    service.populateEditForm(form, product, variants);

    expect(form.get('name')?.value).toBe('Camisa');
    expect((form.get('images') as FormArray).length).toBe(1);
    expect((form.get('variantAttributes') as FormArray).length).toBe(1);
    expect((form.get('variants') as FormArray).length).toBe(1);
    expect(form.pristine).toBeTrue();
    expect(form.untouched).toBeTrue();
  });

  it('should populate edit form correctly for a legacy simple product without hasAttributes field', () => {
    const form = service.createProductForm();
    const legacyProduct: Product = {
      id: 'p-legacy',
      name: 'Taza Cerámica',
      description: 'Taza artesanal',
      price: 1500,
      categoryId: 'cat-home',
      image: 'http://example.com/taza.jpg',
      images: [],
      stock: 25,
      totalStock: 25,
    } as unknown as Product;

    service.populateEditForm(form, legacyProduct, []);

    expect(form.get('name')?.value).toBe('Taza Cerámica');
    expect(form.get('hasAttributes')?.value).toBeFalse();
    expect(form.get('stock')?.value).toBe(25);
    expect((form.get('variants') as FormArray).length).toBe(0);
    expect(form.get('stock')?.valid).toBeTrue();
  });

  it('should update stock validators when toggling hasAttributes', () => {
    const form = service.createProductForm();
    const stockControl = form.get('stock')!;

    // Initial state: hasAttributes = false -> stock is required and >= 0
    service.updateStockValidators(form, false);
    stockControl.setValue(null);
    expect(stockControl.valid).toBeFalse();
    expect(stockControl.hasError('required')).toBeTrue();

    stockControl.setValue(-5);
    expect(stockControl.valid).toBeFalse();
    expect(stockControl.hasError('min')).toBeTrue();

    stockControl.setValue(10);
    expect(stockControl.valid).toBeTrue();

    // Toggle: hasAttributes = true -> stock validators cleared
    service.updateStockValidators(form, true);
    stockControl.setValue(null);
    expect(stockControl.valid).toBeTrue();
  });
});
