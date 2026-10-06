import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { OrderSummary } from './order-summary';
import type { CartItem } from '@core/models/cart.model';

describe('OrderSummary', () => {
  let component: OrderSummary;
  let fixture: ComponentFixture<OrderSummary>;

  const mockItems: CartItem[] = [
    {
      id: 'i1',
      productId: 'p1',
      variantId: 'v1',
      name: 'Remera',
      price: 2000,
      unitPrice: 2000,
      quantity: 2,
      image: 'img.jpg',
      attributes: {},
      stock: 10,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderSummary],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderSummary);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with default inputs', () => {
    expect(component).toBeTruthy();
    expect(component.items).toEqual([]);
    expect(component.total).toBe(0);
  });

  it('should accept items and total inputs', () => {
    component.items = mockItems;
    component.total = 4000;
    fixture.detectChanges();

    expect(component.items.length).toBe(1);
    expect(component.total).toBe(4000);
  });
});
