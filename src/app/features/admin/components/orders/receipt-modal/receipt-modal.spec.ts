import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { ReceiptModal } from './receipt-modal';
import { OrderService } from '@core/services/order.service';
import { StoreConfigService } from '@core/services/store-config.service';
import type { Order } from '@core/models/order.model';

describe('ReceiptModal', () => {
  let component: ReceiptModal;
  let fixture: ComponentFixture<ReceiptModal>;
  let orderServiceSpy: jasmine.SpyObj<OrderService>;

  const makeOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: 'ABC12345',
      userId: 'u1',
      clientName: 'Juan',
      clientEmail: 'j@x.com',
      clientPhone: '54911',
      orderDate: new Date('2026-01-01T00:00:00Z'),
      subtotal: 350,
      total: 350,
      status: 'pending',
      items: [
        {
          productId: 'p1',
          variantId: 'v1',
          productName: 'Prod',
          quantity: 2,
          price: 100,
          productImage: '',
          attributes: {},
        },
        {
          productId: 'p2',
          variantId: 'v2',
          productName: 'Prod2',
          quantity: 3,
          price: 50,
          productImage: '',
          attributes: {},
        },
      ],
      paymentDetails: {
        paymentMethod: 'Mercado Pago',
        subtotal: 350,
        shippingCost: 0,
        taxAmount: 0,
      },
      shippingAddress: { street: 'x', city: 'y', state: 'z', zipCode: '0000', country: 'AR' },
      stockDecremented: true,
      ...overrides,
    }) as Order;

  beforeEach(async () => {
    orderServiceSpy = jasmine.createSpyObj('OrderService', ['updateOrder']);
    orderServiceSpy.updateOrder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [ReceiptModal],
      providers: [
        provideNoopAnimations(),
        { provide: OrderService, useValue: orderServiceSpy },
        {
          provide: StoreConfigService,
          useValue: { storeName: signal('Mi Tienda'), logoUrl: signal('https://x.com/logo.png') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptModal);
    component = fixture.componentInstance;
    component.order = makeOrder();
    fixture.detectChanges();
  });

  it('should render the store name and order id', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mi Tienda');
    expect(el.textContent).toContain('ABC12345');
  });

  it('getItemSubtotal() should compute price * quantity', () => {
    const item = makeOrder().items[0];
    expect(component.getItemSubtotal(item)).toBe(200);
  });

  it('printReceipt() should call window.print', () => {
    spyOn(window, 'print');
    component.printReceipt();
    expect(window.print).toHaveBeenCalled();
  });

  it('currencyCode() should return ARS and currencySymbol() should return $', () => {
    expect(component.currencyCode()).toBe('ARS');
    expect(component.currencySymbol()).toBe('$');
  });

  it('close() should emit closeModal event', () => {
    spyOn(component.closeModal, 'emit');
    component.close();
    expect(component.closeModal.emit).toHaveBeenCalled();
  });

  it('should handle undefined order gracefully', () => {
    fixture.componentRef.setInput('order', undefined);
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.subtotal).toBe(0);
    expect(component.discountAmount).toBe(0);
    expect(component.discountPercentage).toBe(0);
  });

  it('should expose and render transfer discount breakdown when order has discountAmount and discountPercentage', () => {
    fixture.componentRef.setInput(
      'order',
      makeOrder({
        paymentMethod: 'transfer',
        subtotal: 1000,
        discountPercentage: 10,
        discountAmount: 100,
        total: 900,
        receiptUrl: 'https://x.com/receipt.jpg',
      }),
    );
    fixture.detectChanges();

    expect(component.subtotal).toBe(1000);
    expect(component.discountAmount).toBe(100);
    expect(component.discountPercentage).toBe(10);
    expect(component.isTransferOrder).toBeTrue();
    expect(component.receiptUrl).toBe('https://x.com/receipt.jpg');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Descuento por Transferencia');
    expect(el.textContent).toContain('10% OFF');
    expect(el.textContent).toContain('Total transferido esperado:');
  });

  it('should focus #confirmBtn automatically after 50ms on ngAfterViewInit', fakeAsync(() => {
    const btnEl = component.confirmBtn?.nativeElement;
    expect(btnEl).toBeTruthy();
    const focusSpy = spyOn(btnEl!, 'focus');

    component.ngAfterViewInit();
    tick(50);

    expect(focusSpy).toHaveBeenCalled();
  }));

  it('confirmPayment() should update order status via OrderService and close modal', fakeAsync(() => {
    const closeSpy = spyOn(component.closeModal, 'emit');
    const confirmedSpy = spyOn(component.paymentConfirmed, 'emit');

    void component.confirmPayment();
    tick();

    expect(orderServiceSpy.updateOrder).toHaveBeenCalledWith('ABC12345', { status: 'processing' });
    expect(component.order?.status).toBe('processing');
    expect(confirmedSpy).toHaveBeenCalledWith('processing');
    expect(closeSpy).toHaveBeenCalled();
    expect(component.isConfirming()).toBeFalse();
  }));

  it('confirmPayment() should handle errors gracefully without closing modal', fakeAsync(() => {
    const errorSpy = spyOn(console, 'error');
    const closeSpy = spyOn(component.closeModal, 'emit');
    orderServiceSpy.updateOrder.and.returnValue(Promise.reject(new Error('Firestore error')));

    void component.confirmPayment();
    tick();

    expect(errorSpy).toHaveBeenCalledWith(
      'Error al confirmar el pago del pedido:',
      jasmine.any(Error),
    );
    expect(closeSpy).not.toHaveBeenCalled();
    expect(component.isConfirming()).toBeFalse();
  }));

  it('should cover fallback branches for subtotal, discount, receiptUrl, and isTransferOrder from paymentDetails or items', () => {
    fixture.componentRef.setInput(
      'order',
      makeOrder({
        subtotal: undefined,
        discountAmount: undefined,
        discountPercentage: undefined,
        receiptUrl: undefined,
        paymentMethod: undefined,
        paymentDetails: {
          paymentMethod: 'transfer',
          subtotal: 420,
          discountAmount: 42,
          discountPercentage: 10,
          receiptUrl: 'https://x.com/fallback-receipt.png',
          shippingCost: 0,
          taxAmount: 0,
        },
      }),
    );
    fixture.detectChanges();

    expect(component.subtotal).toBe(420);
    expect(component.discountAmount).toBe(42);
    expect(component.discountPercentage).toBe(10);
    expect(component.receiptUrl).toBe('https://x.com/fallback-receipt.png');
    expect(component.isTransferOrder).toBeTrue();

    // Fallback to items reduction when both order.subtotal and paymentDetails.subtotal are undefined
    fixture.componentRef.setInput(
      'order',
      makeOrder({
        subtotal: undefined,
        paymentDetails: undefined,
      }),
    );
    expect(component.subtotal).toBe(350);

    // Fallback when items is undefined
    fixture.componentRef.setInput(
      'order',
      makeOrder({
        subtotal: undefined,
        items: undefined as unknown as Order['items'],
        paymentDetails: undefined,
      }),
    );
    expect(component.subtotal).toBe(0);
  });

  it('confirmPayment() should return early if order has no id or is already confirming', async () => {
    component.isConfirming.set(true);
    await component.confirmPayment();
    expect(orderServiceSpy.updateOrder).not.toHaveBeenCalled();

    component.isConfirming.set(false);
    fixture.componentRef.setInput('order', undefined);
    await component.confirmPayment();
    expect(orderServiceSpy.updateOrder).not.toHaveBeenCalled();
  });
});
