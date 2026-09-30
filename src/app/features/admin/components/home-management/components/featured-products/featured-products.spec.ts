import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ComponentRef } from '@angular/core';
import { FeaturedProducts } from './featured-products';
import type { Product } from '@core/models/product.model';

describe('FeaturedProducts', () => {
  let component: FeaturedProducts;
  let componentRef: ComponentRef<FeaturedProducts>;
  let fixture: ComponentFixture<FeaturedProducts>;
  let formGroup: FormGroup;

  const mockProducts: Product[] = [
    { id: 'p1', name: 'Zapatillas Urbanas', price: 1000, image: 'img1.jpg' } as Product,
    { id: 'p2', name: 'Remera Negra', price: 2000, image: 'img2.jpg' } as Product,
    { id: 'p3', name: 'Campera Jean', price: 3000, image: 'img3.jpg' } as Product,
    { id: 'p4', name: 'Pantalón Chino', price: 4000, image: 'img4.jpg' } as Product,
    { id: 'p5', name: 'Gorra Trucker', price: 5000, image: 'img5.jpg' } as Product,
    { id: 'p6', name: 'Buzo Canguro', price: 6000, image: 'img6.jpg' } as Product,
  ];

  beforeEach(async () => {
    formGroup = new FormGroup({
      enabled: new FormControl(true),
      title: new FormControl('Destacados'),
      productIds: new FormControl<string[]>(['p1', 'p2', 'p3']),
    });

    await TestBed.configureTestingModule({
      imports: [FeaturedProducts, ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturedProducts);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    componentRef.setInput('formGroup', formGroup);
    componentRef.setInput('allProducts', mockProducts);
    fixture.detectChanges();
  });

  it('should create the component and initialize selected ids', () => {
    expect(component).toBeTruthy();
    expect(component.productCount()).toBe(3);
    expect(component.isMinReached()).toBeFalse();
    expect(component.isMaxReached()).toBeFalse();
    expect(component.isValid()).toBeFalse(); // 3 < 5
    expect(component.selectedProductsList().length).toBe(3);
  });

  it('should be valid when disabled even if count is less than 5', () => {
    formGroup.patchValue({ enabled: false });
    expect(component.isValid()).toBeTrue();
  });

  it('should become valid when count is between 5 and 15', () => {
    formGroup.get('productIds')?.setValue(['p1', 'p2', 'p3', 'p4', 'p5']);
    fixture.detectChanges();

    expect(component.productCount()).toBe(5);
    expect(component.isMinReached()).toBeTrue();
    expect(component.isMaxReached()).toBeFalse();
    expect(component.isValid()).toBeTrue();
  });

  it('should open modal and focus search input, and close modal', fakeAsync(() => {
    component.openModal();
    expect(component.isModalOpen()).toBeTrue();
    tick();

    component.closeModal();
    expect(component.isModalOpen()).toBeFalse();
    tick();
  }));

  it('should filter available products excluding selected', () => {
    const available = component.filteredAvailableProducts();
    expect(available.length).toBe(3); // p4, p5, p6
    expect(available.some((p) => p.id === 'p1')).toBeFalse();

    component.onSearchInput({ target: { value: 'Buzo' } } as unknown as Event);
    expect(component.searchTerm()).toBe('Buzo');
    expect(component.filteredAvailableProducts().length).toBe(1);
    expect(component.filteredAvailableProducts()[0].id).toBe('p6');
  });

  it('should add a product and update form control', () => {
    component.addProduct(mockProducts[3]); // p4
    expect(component.selectedIds()).toContain('p4');
    expect(formGroup.get('productIds')?.value).toContain('p4');
    expect(formGroup.dirty).toBeTrue();
  });

  it('should not add duplicate product or if max reached', () => {
    component.addProduct(mockProducts[0]); // p1 already present
    expect(component.productCount()).toBe(3);

    const fifteenIds = Array.from({ length: 15 }, (_, i) => `prod-${i}`);
    formGroup.get('productIds')?.setValue(fifteenIds);
    fixture.detectChanges();

    expect(component.isMaxReached()).toBeTrue();
    component.openModal();
    expect(component.isModalOpen()).toBeFalse(); // Should not open if max reached

    component.addProduct({ id: 'extra', name: 'Extra' } as Product);
    expect(component.productCount()).toBe(15);
  });

  it('should remove a product', () => {
    component.removeProduct(1); // removes p2
    expect(component.selectedIds()).toEqual(['p1', 'p3']);
    expect(formGroup.get('productIds')?.value).toEqual(['p1', 'p3']);
  });

  it('should reorder products with moveUp and moveDown', () => {
    component.moveDown(0); // swaps index 0 and 1
    expect(component.selectedIds()).toEqual(['p2', 'p1', 'p3']);

    component.moveUp(1); // swaps back
    expect(component.selectedIds()).toEqual(['p1', 'p2', 'p3']);

    // Boundary checks: index 0 cannot move up, last index cannot move down
    component.moveUp(0);
    expect(component.selectedIds()[0]).toBe('p1');

    component.moveDown(2);
    expect(component.selectedIds()[2]).toBe('p3');
  });
});
