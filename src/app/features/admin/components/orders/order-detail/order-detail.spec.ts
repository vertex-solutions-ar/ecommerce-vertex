import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { WritableSignal } from '@angular/core';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { OrderDetail } from './order-detail';
import { OrderService } from '@core/services/order.service';
import { StoreConfigService } from '@core/services/store-config.service';
import { AuthService } from '@core/services/auth.service';
import type { Order, OrderItem } from '@core/models/order.model';
import type { StoreConfig } from '@core/models/store-config.model';

describe('OrderDetail', () => {
  let component: OrderDetail;
  let fixture: ComponentFixture<OrderDetail>;
  let orderServiceSpy: jasmine.SpyObj<OrderService>;
  let storeConfigServiceSpy: jasmine.SpyObj<StoreConfigService>;
  let router: Router;
  let paramMapSubject: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let mockStoreConfigSignal: WritableSignal<StoreConfig | null>;

  const mockConfig: StoreConfig = {
    tenantId: 'tenant-1',
    storeId: 'store-1',
    storeName: 'Test Store',
    tagline: 'Test Tagline',
    logoUrl: '',
    faviconUrl: '',
    colors: {
      primary: '#ea580c',
      accent: '#ef4444',
      background: '#ffffff',
    },
    payments: {
      mercadoPagoPublicKey: '',
    },
    contact: {
      phone: '',
      email: '',
      whatsApp: '',
      instagram: '',
      facebook: '',
    },
    seo: {
      metaDescription: '',
    },
    setupCompleted: true,
  };

  const mockOrderPickup: Order = {
    id: 'ORD-1001',
    userId: 'user-1',
    clientName: 'María Pérez',
    clientEmail: 'maria@example.com',
    clientPhone: '1198765432',
    orderDate: new Date(),
    total: 5000,
    status: 'pending',
    items: [
      {
        productId: 'p1',
        variantId: 'v1',
        productName: 'Producto 1',
        quantity: 2,
        price: 2500,
        attributes: {},
      },
    ],
    shippingAddress: {
      street: 'Av. Cabildo 2000',
      city: 'CABA',
      state: 'CABA',
      zipCode: '0000',
      country: 'Argentina',
    },
    paymentDetails: {
      paymentMethod: 'Mercado Pago',
      subtotal: 5000,
      shippingCost: 0,
      taxAmount: 0,
    },
    deliverySelection: {
      type: 'store_pickup',
      pickupLocationId: 'loc-1',
      pickupAddressFormatted: 'Sucursal Belgrano - Av. Cabildo 2000, CABA',
    },
  };

  const mockOrderHomeDelivery: Order = {
    ...mockOrderPickup,
    id: 'ORD-1002',
    deliverySelection: {
      type: 'home_delivery',
    },
  };

  const mockOrderLegacy: Order = {
    ...mockOrderPickup,
    id: 'ORD-1003',
    deliverySelection: undefined,
  };

  beforeEach(async () => {
    paramMapSubject = new BehaviorSubject(convertToParamMap({ id: 'ORD-1001' }));
    mockStoreConfigSignal = signal<StoreConfig | null>(mockConfig);

    orderServiceSpy = jasmine.createSpyObj('OrderService', ['getOrderById', 'updateOrder']);
    storeConfigServiceSpy = jasmine.createSpyObj('StoreConfigService', [], {
      storeConfig: mockStoreConfigSignal,
      storeName: signal('Test Store'),
      logoUrl: signal(''),
    });

    orderServiceSpy.getOrderById.and.returnValue(of(mockOrderPickup));
    orderServiceSpy.updateOrder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [OrderDetail],
      providers: [
        { provide: OrderService, useValue: orderServiceSpy },
        { provide: StoreConfigService, useValue: storeConfigServiceSpy },
        {
          provide: AuthService,
          useValue: {
            isAdmin$: of(true),
            isStaff$: of(false),
            isStaff: () => false,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMapSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(OrderDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component and load order', () => {
    expect(component).toBeTruthy();
    expect(component.orderId).toBe('ORD-1001');
    expect(component.currentStatus).toBe('pending');
  });

  describe('isStorePickup', () => {
    it('should return true when order deliverySelection type is store_pickup', () => {
      expect(component.isStorePickup(mockOrderPickup)).toBeTrue();
    });

    it('should return false when order deliverySelection type is home_delivery', () => {
      expect(component.isStorePickup(mockOrderHomeDelivery)).toBeFalse();
    });

    it('should return false when order is legacy (deliverySelection is undefined)', () => {
      expect(component.isStorePickup(mockOrderLegacy)).toBeFalse();
    });
  });

  describe('onStatusChange', () => {
    it('should update status to ready_for_pickup when select element fires change event', fakeAsync(() => {
      const event = {
        target: { value: 'ready_for_pickup' } as unknown as HTMLSelectElement,
      } as unknown as Event;

      component.onStatusChange(event);
      tick();

      expect(orderServiceSpy.updateOrder).toHaveBeenCalledWith('ORD-1001', {
        status: 'ready_for_pickup',
      });
      expect(component.currentStatus).toBe('ready_for_pickup');
    }));

    it('should update status to shipped when select element changes', fakeAsync(() => {
      const event = {
        target: { value: 'shipped' } as unknown as HTMLSelectElement,
      } as unknown as Event;

      component.onStatusChange(event);
      tick();

      expect(orderServiceSpy.updateOrder).toHaveBeenCalledWith('ORD-1001', { status: 'shipped' });
      expect(component.currentStatus).toBe('shipped');
    }));

    it('should not update status if new status is same as current status', () => {
      const event = {
        target: { value: 'pending' } as unknown as HTMLSelectElement,
      } as unknown as Event;

      component.onStatusChange(event);
      expect(orderServiceSpy.updateOrder).not.toHaveBeenCalled();
    });

    it('should handle error when updateOrder fails during onStatusChange', fakeAsync(() => {
      const spyError = spyOn(console, 'error');
      orderServiceSpy.updateOrder.and.returnValue(Promise.reject(new Error('Update failed')));

      const event = {
        target: { value: 'ready_for_pickup' } as unknown as HTMLSelectElement,
      } as unknown as Event;

      component.onStatusChange(event);
      tick();

      expect(spyError).toHaveBeenCalledWith(
        'Error al actualizar el estado del pedido:',
        jasmine.any(Error),
      );
      expect(component.currentStatus).toBe('pending');
    }));
  });

  describe('Navigation & Methods', () => {
    it('should navigate back to /admin/orders on goBack()', () => {
      const navigateSpy = spyOn(router, 'navigate');
      component.goBack();
      expect(navigateSpy).toHaveBeenCalledWith(['/admin/orders']);
    });

    it('should calculate item subtotal correctly', () => {
      const item: OrderItem = {
        productId: 'p1',
        variantId: 'v1',
        productName: 'Producto',
        quantity: 3,
        price: 1500,
        attributes: {},
      };
      expect(component.getItemSubtotal(item)).toBe(4500);
    });

    it('should toggle receipt modal display', () => {
      expect(component.showReceipt).toBeFalse();
      expect(component.receiptOrder).toBeUndefined();

      component.generateReceipt(mockOrderPickup);
      expect(component.showReceipt).toBeTrue();
      expect(component.receiptOrder).toEqual(mockOrderPickup);

      component.closeReceipt();
      expect(component.showReceipt).toBeFalse();
    });

    it('should set pageTitle to "Pedido No Encontrado" if order is undefined', () => {
      orderServiceSpy.getOrderById.and.returnValue(of(undefined));
      component.ngOnInit();
      component.order$.subscribe();
      expect(component.pageTitle).toBe('Pedido No Encontrado');
    });

    it('should set pageTitle to "Error: ID de Pedido Faltante" and navigate away if route has no id', () => {
      const navigateSpy = spyOn(router, 'navigate');
      paramMapSubject.next(convertToParamMap({}));

      component.ngOnInit();
      component.order$.subscribe();

      expect(component.pageTitle).toBe('Error: ID de Pedido Faltante');
      expect(navigateSpy).toHaveBeenCalledWith(['/admin/orders']);
    });

    it('onStatusChange should do nothing if orderId is null', () => {
      component.orderId = null;
      const event = {
        target: { value: 'cancelled' } as unknown as HTMLSelectElement,
      } as unknown as Event;

      component.onStatusChange(event);

      expect(orderServiceSpy.updateOrder).not.toHaveBeenCalled();
    });

    it('onStatusChange should update status to processing, delivered, and cancelled', fakeAsync(() => {
      const statuses: Array<'processing' | 'delivered' | 'cancelled'> = [
        'processing',
        'delivered',
        'cancelled',
      ];
      for (const st of statuses) {
        const event = {
          target: { value: st } as unknown as HTMLSelectElement,
        } as unknown as Event;

        component.onStatusChange(event);
        tick();

        expect(orderServiceSpy.updateOrder).toHaveBeenCalledWith('ORD-1001', { status: st });
        expect(component.currentStatus).toBe(st);
      }
    }));

    it('should render transfer discount row, receipt badge, and open receipt-modal on click', () => {
      const transferOrder: Order = {
        ...mockOrderPickup,
        id: 'ORD-TRANSFER-1',
        paymentMethod: 'transfer',
        subtotal: 5000,
        discountPercentage: 10,
        discountAmount: 500,
        total: 4500,
        receiptUrl: 'https://example.com/comprobante.jpg',
        paymentDetails: {
          paymentMethod: 'transfer',
          subtotal: 5000,
          discountPercentage: 10,
          discountAmount: 500,
          receiptUrl: 'https://example.com/comprobante.jpg',
          shippingCost: 0,
          taxAmount: 0,
        },
      };

      orderServiceSpy.getOrderById.and.returnValue(of(transferOrder));
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.isTransferOrder(transferOrder)).toBeTrue();
      expect(component.hasReceipt(transferOrder)).toBeTrue();
      expect(component.getDiscountAmount(transferOrder)).toBe(500);
      expect(component.getDiscountPercentage(transferOrder)).toBe(10);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Transferencia Bancaria');
      expect(el.textContent).toContain('10% OFF');
      expect(el.textContent).toContain('Descuento por Transferencia');
      expect(el.textContent).toContain('Comprobante adjunto');

      const receiptBtn = el.querySelector('.badge-receipt-action') as HTMLButtonElement | null;
      expect(receiptBtn).toBeTruthy();
      receiptBtn?.click();
      fixture.detectChanges();

      expect(component.showReceipt).toBeTrue();
      expect(component.receiptOrder).toEqual(transferOrder);

      component.onPaymentConfirmed('processing');
      expect(component.currentStatus).toBe('processing');
    });

    it('should cover paymentDetails fallback branches for transfer helpers', () => {
      const fallbackOrder: Order = {
        ...mockOrderPickup,
        paymentMethod: undefined,
        receiptUrl: undefined,
        discountAmount: undefined,
        discountPercentage: undefined,
        paymentDetails: {
          paymentMethod: 'transfer',
          subtotal: 5000,
          discountAmount: 250,
          discountPercentage: 5,
          receiptUrl: 'https://example.com/fallback.jpg',
          shippingCost: 0,
          taxAmount: 0,
        },
      };

      expect(component.isTransferOrder(fallbackOrder)).toBeTrue();
      expect(component.hasReceipt(fallbackOrder)).toBeTrue();
      expect(component.getDiscountAmount(fallbackOrder)).toBe(250);
      expect(component.getDiscountPercentage(fallbackOrder)).toBe(5);

      expect(component.isTransferOrder(mockOrderPickup)).toBeFalse();
      expect(component.hasReceipt(mockOrderPickup)).toBeFalse();
      expect(component.getDiscountAmount(mockOrderPickup)).toBe(0);
      expect(component.getDiscountPercentage(mockOrderPickup)).toBe(0);
    });
  });
});
