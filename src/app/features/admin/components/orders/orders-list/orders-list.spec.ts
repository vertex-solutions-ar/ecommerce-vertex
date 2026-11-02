import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OrdersList } from './orders-list';
import { OrderService } from '@core/services/order.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { AuthService } from '@core/services/auth.service';
import type { Order } from '@core/models/order.model';

describe('OrdersList', () => {
  let component: OrdersList;
  let fixture: ComponentFixture<OrdersList>;
  let orderServiceSpy: jasmine.SpyObj<OrderService>;
  let sweetAlertServiceSpy: jasmine.SpyObj<SweetAlertService>;
  let router: Router;

  const mockOrders: Order[] = [
    {
      id: 'ORD-001',
      userId: 'user-1',
      clientName: 'Alice Smith',
      clientEmail: 'alice@example.com',
      clientPhone: '11111111',
      orderDate: new Date('2026-01-01'),
      total: 1000,
      status: 'pending',
      items: [],
      shippingAddress: {
        street: 'Calle 1',
        city: 'Buenos Aires',
        state: 'CABA',
        zipCode: '1000',
        country: 'Argentina',
      },
      paymentDetails: {
        paymentMethod: 'Mercado Pago',
        subtotal: 1000,
        shippingCost: 0,
        taxAmount: 0,
      },
      deliverySelection: {
        type: 'store_pickup',
        pickupLocationId: 'loc-1',
        pickupAddressFormatted: 'Sucursal Centro - Calle 123',
      },
    },
    {
      id: 'ORD-002',
      userId: 'user-2',
      clientName: 'Bob Jones',
      clientEmail: 'bob@example.com',
      clientPhone: '22222222',
      orderDate: new Date('2026-01-02'),
      total: 2000,
      status: 'processing',
      items: [],
      shippingAddress: {
        street: 'Calle 2',
        city: 'Cordoba',
        state: 'Cordoba',
        zipCode: '5000',
        country: 'Argentina',
      },
      paymentDetails: {
        paymentMethod: 'Mercado Pago',
        subtotal: 2000,
        shippingCost: 0,
        taxAmount: 0,
      },
      deliverySelection: {
        type: 'home_delivery',
      },
    },
    {
      id: 'ORD-003',
      userId: 'user-3',
      clientName: 'Charlie Brown',
      clientEmail: 'charlie@example.com',
      clientPhone: '33333333',
      orderDate: new Date('2026-01-03'),
      total: 3000,
      status: 'ready_for_pickup',
      items: [],
      shippingAddress: {
        street: 'Calle 3',
        city: 'Mendoza',
        state: 'Mendoza',
        zipCode: '5500',
        country: 'Argentina',
      },
      paymentDetails: {
        paymentMethod: 'Mercado Pago',
        subtotal: 3000,
        shippingCost: 0,
        taxAmount: 0,
      },
    },
  ];

  beforeEach(async () => {
    orderServiceSpy = jasmine.createSpyObj('OrderService', [
      'getOrders',
      'updateOrder',
      'deleteOrder',
    ]);
    sweetAlertServiceSpy = jasmine.createSpyObj('SweetAlertService', ['confirm']);

    orderServiceSpy.getOrders.and.returnValue(of(mockOrders));
    orderServiceSpy.updateOrder.and.returnValue(Promise.resolve());
    orderServiceSpy.deleteOrder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [OrdersList],
      providers: [
        provideRouter([]),
        { provide: OrderService, useValue: orderServiceSpy },
        { provide: SweetAlertService, useValue: sweetAlertServiceSpy },
        {
          provide: AuthService,
          useValue: {
            isAdmin$: of(true),
            isStaff$: of(false),
            isStaff: () => false,
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(OrdersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  describe('deliveryFilter', () => {
    it('should filter orders when deliveryFilter is set to store_pickup', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      expect(result.length).toBe(3);

      component.onDeliveryFilterChange('store_pickup');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ORD-001');
      expect(result[0].deliverySelection?.type).toBe('store_pickup');
    }));

    it('should filter orders when deliveryFilter is set to home_delivery including legacy orders', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onDeliveryFilterChange('home_delivery');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(2);
      expect(result.map((o) => o.id)).toEqual(['ORD-002', 'ORD-003']);
    }));

    it('should show all orders when deliveryFilter is reset to all', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onDeliveryFilterChange('store_pickup');
      fixture.detectChanges();
      tick(300);
      expect(result.length).toBe(1);

      component.onDeliveryFilterChange('all');
      fixture.detectChanges();
      tick(300);
      expect(result.length).toBe(3);
    }));
  });

  describe('getDeliveryBadge', () => {
    it('should return store pickup badge info when deliveryType is store_pickup with address', () => {
      const badge = component.getDeliveryBadge(mockOrders[0]);
      expect(badge.icon).toBe('bi-shop');
      expect(badge.cssClass).toContain('badge-delivery-pickup');
      expect(badge.label).toBe('Retiro en Local');
      expect(badge.summary).toBe('Sucursal Centro - Calle 123');
    });

    it('should fallback to "Sucursal" for store_pickup order missing pickupAddressFormatted', () => {
      const orderNoAddress: Order = {
        ...mockOrders[0],
        deliverySelection: {
          type: 'store_pickup',
          pickupLocationId: 'loc-1',
        },
      };
      const badge = component.getDeliveryBadge(orderNoAddress);
      expect(badge.summary).toBe('Sucursal');
    });

    it('should return home delivery badge info for home_delivery order', () => {
      const badge = component.getDeliveryBadge(mockOrders[1]);
      expect(badge.icon).toBe('bi-truck');
      expect(badge.cssClass).toContain('badge-delivery-home');
      expect(badge.label).toBe('Envío a Domicilio');
      expect(badge.summary).toBe('Cordoba, Cordoba');
    });

    it('should return home delivery badge info for legacy order without deliverySelection', () => {
      const badge = component.getDeliveryBadge(mockOrders[2]);
      expect(badge.icon).toBe('bi-truck');
      expect(badge.cssClass).toContain('badge-delivery-home');
      expect(badge.label).toBe('Envío a Domicilio');
      expect(badge.summary).toBe('Mendoza, Mendoza');
    });

    it('should return empty summary if home delivery order has no shippingAddress', () => {
      const orderNoShipping: Order = {
        ...mockOrders[1],
        shippingAddress: undefined as unknown as Order['shippingAddress'],
      };
      const badge = component.getDeliveryBadge(orderNoShipping);
      expect(badge.summary).toBe('');
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status to ready_for_pickup and trigger refresh', fakeAsync(() => {
      component.updateOrderStatus(mockOrders[0], 'ready_for_pickup');
      tick();

      expect(orderServiceSpy.updateOrder).toHaveBeenCalledWith('ORD-001', {
        status: 'ready_for_pickup',
      });
    }));

    it('should not call updateOrder if target status is identical to current status', () => {
      component.updateOrderStatus(mockOrders[0], 'pending');
      expect(orderServiceSpy.updateOrder).not.toHaveBeenCalled();
    });

    it('should catch error when updateOrder fails', fakeAsync(() => {
      const spyError = spyOn(console, 'error');
      orderServiceSpy.updateOrder.and.returnValue(Promise.reject(new Error('Update failed')));

      component.updateOrderStatus(mockOrders[0], 'ready_for_pickup');
      tick();

      expect(spyError).toHaveBeenCalledWith(
        'Error al actualizar el estado del pedido:',
        jasmine.any(Error),
      );
    }));
  });

  describe('Additional Controls & Filtering', () => {
    it('should filter orders by search term', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onSearchTermChange('Bob');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(1);
      expect(result[0].clientName).toBe('Bob Jones');
    }));

    it('should filter orders by status option', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onFilterStatusChange('ready_for_pickup');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ORD-003');
    }));

    it('should handle pagination controls correctly', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onItemsPerPageChange(1);
      fixture.detectChanges();
      tick(300);

      expect(component.totalPages).toBe(3);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ORD-001');

      component.goToPage(2);
      fixture.detectChanges();
      tick(300);
      expect(result[0].id).toBe('ORD-002');
    }));

    it('should navigate on editOrder', () => {
      const navigateSpy = spyOn(router, 'navigate');
      component.editOrder(mockOrders[0]);
      expect(navigateSpy).toHaveBeenCalledWith(['/admin/orders', 'ORD-001']);
    });

    it('should delete order when confirmed', fakeAsync(() => {
      sweetAlertServiceSpy.confirm.and.returnValue(Promise.resolve(true));

      component.deleteOrder(mockOrders[0]);
      tick();

      expect(sweetAlertServiceSpy.confirm).toHaveBeenCalled();
      expect(orderServiceSpy.deleteOrder).toHaveBeenCalledWith('ORD-001');
    }));

    it('should not delete order when cancelled in confirmation', fakeAsync(() => {
      sweetAlertServiceSpy.confirm.and.returnValue(Promise.resolve(false));

      component.deleteOrder(mockOrders[0]);
      tick();

      expect(sweetAlertServiceSpy.confirm).toHaveBeenCalled();
      expect(orderServiceSpy.deleteOrder).not.toHaveBeenCalled();
    }));

    it('should catch error when getOrders fails', fakeAsync(() => {
      const spyError = spyOn(console, 'error');
      orderServiceSpy.getOrders.and.returnValue(throwError(() => new Error('Load failed')));

      component.ngOnInit();
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      expect(spyError).toHaveBeenCalled();
      expect(result).toEqual([]);
    }));

    it('should catch error when deleteOrder fails after confirmation', fakeAsync(() => {
      const spyError = spyOn(console, 'error');
      sweetAlertServiceSpy.confirm.and.returnValue(Promise.resolve(true));
      orderServiceSpy.deleteOrder.and.returnValue(Promise.reject(new Error('Delete error')));

      component.deleteOrder(mockOrders[0]);
      tick();

      expect(orderServiceSpy.deleteOrder).toHaveBeenCalledWith('ORD-001');
      expect(spyError).toHaveBeenCalledWith('Error al eliminar el pedido:', jasmine.any(Error));
    }));

    it('should filter orders by order ID or status in search term', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onSearchTermChange('ORD-002');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ORD-002');

      component.onSearchTermChange('pending');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ORD-001');
    }));

    it('should set totalPages to 0 and correctedPage to 1 when search yields no results', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.onSearchTermChange('NONEXISTENT_QUERY');
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(0);
      expect(component.totalOrders).toBe(0);
      expect(component.totalPages).toBe(0);
    }));

    it('should ignore out of bound page numbers in goToPage()', () => {
      expect(component.currentPageSubject.value).toBe(1);

      component.goToPage(0);
      expect(component.currentPageSubject.value).toBe(1);

      component.goToPage(999);
      expect(component.currentPageSubject.value).toBe(1);
    });

    it('should clamp correctedPage to totalPages when currentPage exceeds totalPages', fakeAsync(() => {
      let result: Order[] = [];
      component.orders$.subscribe((orders) => {
        result = orders;
      });
      tick(300);

      component.itemsPerPageSubject.next(1); // totalPages = 3
      component.currentPageSubject.next(5); // 5 > 3
      fixture.detectChanges();
      tick(300);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ORD-003');
    }));

    it('should identify transfer orders and render Transferencia (-Y%) badge', fakeAsync(() => {
      const transferOrder: Order = {
        ...mockOrders[0],
        id: 'ORD-TRANSFER',
        paymentMethod: 'transfer',
        discountPercentage: 15,
        discountAmount: 150,
        total: 850,
      };
      orderServiceSpy.getOrders.and.returnValue(of([transferOrder]));

      const localFixture = TestBed.createComponent(OrdersList);
      const localComponent = localFixture.componentInstance;
      localFixture.detectChanges();
      tick(300);
      localFixture.detectChanges();

      expect(localComponent.isTransferOrder(transferOrder)).toBeTrue();
      expect(localComponent.getTransferDiscountPercentage(transferOrder)).toBe(15);

      const el = localFixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Transferencia (-15%)');
    }));

    it('should cover paymentDetails fallback branches in isTransferOrder and getTransferDiscountPercentage', () => {
      const fallbackTransferOrder: Order = {
        ...mockOrders[0],
        paymentMethod: undefined,
        discountPercentage: undefined,
        paymentDetails: {
          paymentMethod: 'transfer',
          subtotal: 1000,
          discountPercentage: 10,
          shippingCost: 0,
          taxAmount: 0,
        },
      };

      expect(component.isTransferOrder(fallbackTransferOrder)).toBeTrue();
      expect(component.getTransferDiscountPercentage(fallbackTransferOrder)).toBe(10);
      expect(component.isTransferOrder(mockOrders[0])).toBeFalse();
      expect(component.getTransferDiscountPercentage(mockOrders[0])).toBe(0);
    });
  });
});
