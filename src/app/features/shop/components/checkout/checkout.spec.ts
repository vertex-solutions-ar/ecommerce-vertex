import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import type { WritableSignal } from '@angular/core';
import { signal } from '@angular/core';
import { Checkout } from './checkout';
import { CartService } from '@core/services/cart.service';
import { PaymentService } from '@core/services/payment.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { OrderService } from '@core/services/order.service';
import { StoreConfigService } from '@core/services/store-config.service';
import type { Cart, CartItem } from '@core/models/cart.model';
import type { StoreConfig } from '@core/models/store-config.model';

describe('Checkout', () => {
  let component: Checkout;
  let fixture: ComponentFixture<Checkout>;
  let cartServiceSpy: jasmine.SpyObj<CartService>;
  let paymentServiceSpy: jasmine.SpyObj<PaymentService>;
  let sweetAlertServiceSpy: jasmine.SpyObj<SweetAlertService>;
  let orderServiceSpy: jasmine.SpyObj<OrderService>;
  let storeConfigServiceSpy: jasmine.SpyObj<StoreConfigService>;
  let router: Router;
  let mockCartSignal: WritableSignal<Cart>;
  let mockStoreConfigSignal: WritableSignal<StoreConfig | null>;

  const mockPickupLocation1 = {
    id: 'loc-centro-1',
    name: 'Sucursal Centro',
    address: 'Av. Corrientes 1234',
    city: 'CABA',
    schedule: 'Lun a Vie 9 a 18 hs',
    notes: 'Retiro por mostrador',
    enabled: true,
  };

  const mockPickupLocation2 = {
    id: 'loc-norte-2',
    name: 'Sucursal Belgrano',
    address: 'Av. Cabildo 2000',
    city: 'CABA',
    schedule: 'Lun a Sab 10 a 20 hs',
    notes: 'Estacionamiento propio',
    enabled: true,
  };

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
    deliveryMethods: {
      enableHomeDelivery: true,
      enableStorePickup: true,
      homeDeliveryDescription: 'Envío a domicilio',
      pickupLocations: [mockPickupLocation1, mockPickupLocation2],
    },
  };

  const mockCartItem: CartItem = {
    id: 'item-1',
    productId: 'prod-1',
    variantId: 'var-1',
    name: 'Producto Test',
    price: 1500,
    unitPrice: 1500,
    quantity: 2,
    image: 'https://example.com/img.jpg',
    attributes: {},
    stock: 10,
  };

  beforeEach(async () => {
    mockCartSignal = signal<Cart>({
      items: [mockCartItem],
      total: 3000,
    });

    mockStoreConfigSignal = signal<StoreConfig | null>(mockConfig);

    cartServiceSpy = jasmine.createSpyObj('CartService', ['clearCart', 'pruneUnavailableItems'], {
      cart: mockCartSignal,
    });
    cartServiceSpy.pruneUnavailableItems.and.returnValue(Promise.resolve([]));
    paymentServiceSpy = jasmine.createSpyObj('PaymentService', ['initiatePayment']);
    sweetAlertServiceSpy = jasmine.createSpyObj('SweetAlertService', [
      'loading',
      'error',
      'success',
      'warning',
    ]);
    orderServiceSpy = jasmine.createSpyObj('OrderService', ['createOrder', 'updateOrder']);
    storeConfigServiceSpy = jasmine.createSpyObj('StoreConfigService', [], {
      storeConfig: mockStoreConfigSignal,
    });

    paymentServiceSpy.initiatePayment.and.returnValue(
      Promise.resolve({ success: false, error: 'Payment prevented in test environment' }),
    );
    orderServiceSpy.createOrder.and.returnValue(
      Promise.resolve({ id: 'order-999' } as unknown as ReturnType<OrderService['createOrder']>),
    );
    orderServiceSpy.updateOrder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [Checkout, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        { provide: CartService, useValue: cartServiceSpy },
        { provide: PaymentService, useValue: paymentServiceSpy },
        { provide: SweetAlertService, useValue: sweetAlertServiceSpy },
        { provide: OrderService, useValue: orderServiceSpy },
        { provide: StoreConfigService, useValue: storeConfigServiceSpy },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component and initialize with available pickup locations', () => {
    expect(component).toBeTruthy();
    expect(component.availablePickupLocations().length).toBe(2);
    expect(component.availablePickupLocations()[0].id).toBe('loc-centro-1');
  });

  it('should toggle selectedDeliveryType when setDeliveryType() is called', () => {
    expect(component.selectedDeliveryType()).toBe('home_delivery');

    component.setDeliveryType('store_pickup');
    expect(component.selectedDeliveryType()).toBe('store_pickup');

    component.setDeliveryType('home_delivery');
    expect(component.selectedDeliveryType()).toBe('home_delivery');
  });

  it('should relax shipping address validators when selectedDeliveryType is store_pickup', () => {
    const shippingGroup = component.checkoutForm.get('shippingInfo');
    expect(shippingGroup?.valid).toBeFalse();

    component.setDeliveryType('store_pickup');
    expect(shippingGroup?.valid).toBeTrue();

    component.setDeliveryType('home_delivery');
    expect(shippingGroup?.valid).toBeFalse();
  });

  it('should generate order payload with store_pickup deliverySelection in createOrder', fakeAsync(() => {
    component.checkoutForm.get('contactInfo')?.patchValue({
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
      phone: '1122334455',
      dni: '12345678',
    });

    component.setDeliveryType('store_pickup');

    expect(component.checkoutForm.valid).toBeTrue();

    component.onSubmit();
    tick();

    expect(orderServiceSpy.createOrder).toHaveBeenCalled();
    const createdOrderArg = orderServiceSpy.createOrder.calls.mostRecent().args[0];

    expect(createdOrderArg.deliverySelection).toEqual({
      type: 'store_pickup',
      pickupLocationId: 'loc-centro-1',
      pickupAddressFormatted: 'Sucursal Centro - Av. Corrientes 1234, CABA',
      notes: 'Retiro por mostrador',
    });
    expect(createdOrderArg.shippingAddress).toEqual({
      street: 'Av. Corrientes 1234',
      city: 'CABA',
      state: 'CABA',
      zipCode: '0000',
      country: 'Argentina',
    });
  }));

  it('should generate order payload with home_delivery in createOrder', fakeAsync(() => {
    component.checkoutForm.get('contactInfo')?.patchValue({
      firstName: 'Laura',
      lastName: 'García',
      email: 'laura@example.com',
      phone: '1199887766',
      dni: '87654321',
    });
    component.checkoutForm.get('shippingInfo')?.patchValue({
      address: 'Av. Libertador 5000',
      city: 'Buenos Aires',
      province: 'CABA',
      zipCode: '1426',
    });

    component.setDeliveryType('home_delivery');

    expect(component.checkoutForm.valid).toBeTrue();

    component.onSubmit();
    tick();

    expect(orderServiceSpy.createOrder).toHaveBeenCalled();
    const createdOrderArg = orderServiceSpy.createOrder.calls.mostRecent().args[0];

    expect(createdOrderArg.deliverySelection).toEqual({
      type: 'home_delivery',
      pickupLocationId: undefined,
      pickupAddressFormatted: undefined,
      notes: undefined,
    });
    expect(createdOrderArg.shippingAddress).toEqual({
      street: 'Av. Libertador 5000',
      city: 'Buenos Aires',
      state: 'CABA',
      zipCode: '1426',
      country: 'Argentina',
    });
  }));

  describe('Delivery Configuration Reactive Signals', () => {
    it('should automatically set deliveryType to store_pickup when store only enables store pickup', () => {
      mockStoreConfigSignal.set({
        ...mockConfig,
        deliveryMethods: {
          enableHomeDelivery: false,
          enableStorePickup: true,
          pickupLocations: [mockPickupLocation1],
        },
      });

      fixture.detectChanges();
      TestBed.flushEffects();

      expect(component.selectedDeliveryType()).toBe('store_pickup');
      const shippingGroup = component.checkoutForm.get('shippingInfo');
      expect(shippingGroup?.valid).toBeTrue();
    });

    it('should automatically set deliveryType to home_delivery when store only enables home delivery', () => {
      component.setDeliveryType('store_pickup');
      expect(component.selectedDeliveryType()).toBe('store_pickup');

      mockStoreConfigSignal.set({
        ...mockConfig,
        deliveryMethods: {
          enableHomeDelivery: true,
          enableStorePickup: false,
          pickupLocations: [],
        },
      });

      fixture.detectChanges();
      TestBed.flushEffects();

      expect(component.selectedDeliveryType()).toBe('home_delivery');
    });
  });

  describe('Pickup Location Selection', () => {
    it('should change branch when setPickupLocation(locationId) is called', () => {
      expect(component.selectedPickupLocationId()).toBe('loc-centro-1');
      expect(component.selectedPickupLocation()?.name).toBe('Sucursal Centro');

      component.setPickupLocation('loc-norte-2');

      expect(component.selectedPickupLocationId()).toBe('loc-norte-2');
      expect(component.selectedPickupLocation()?.name).toBe('Sucursal Belgrano');
      expect(component.selectedPickupLocation()?.address).toBe('Av. Cabildo 2000');
    });

    it('should initialize selectedPickupLocationId if setDeliveryType is store_pickup when locationId was null', () => {
      component['selectedPickupLocationId'].set(null);
      component.setDeliveryType('store_pickup');
      expect(component.selectedPickupLocationId()).toBe('loc-centro-1');
    });
  });

  describe('Form Submission & Payment Flow', () => {
    it('should show error alert if form is invalid on submit', fakeAsync(() => {
      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Formulario Incompleto',
        'Por favor, completa todos los campos requeridos.',
      );
      expect(orderServiceSpy.createOrder).not.toHaveBeenCalled();
    }));

    it('should show error alert and navigate to cart if cart is empty on submit', fakeAsync(() => {
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      mockCartSignal.set({ items: [], total: 0 });
      const navigateSpy = spyOn(router, 'navigate');

      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Carrito Vacío',
        'No puedes proceder al pago sin productos.',
      );
      expect(navigateSpy).toHaveBeenCalledWith(['/cart']);
      expect(component.isProcessingPayment()).toBeFalse();
    }));

    it('should cancel orphaned order and display error if payment fails', fakeAsync(() => {
      spyOn(console, 'error');
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      paymentServiceSpy.initiatePayment.and.returnValue(
        Promise.resolve({ success: false, error: 'Tarjeta rechazada' }),
      );

      component.onSubmit();
      tick();

      expect(orderServiceSpy.createOrder).toHaveBeenCalled();
      expect(orderServiceSpy.updateOrder).toHaveBeenCalledWith('order-999', {
        status: 'cancelled',
      });
      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Pago Rechazado',
        'Tarjeta rechazada',
      );
      expect(component.isProcessingPayment()).toBeFalse();
    }));

    it('should handle warning log when cancel orphaned order fails', fakeAsync(() => {
      spyOn(console, 'error');
      const spyWarn = spyOn(console, 'warn');
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      paymentServiceSpy.initiatePayment.and.returnValue(
        Promise.resolve({ success: false, error: 'Payment failure' }),
      );
      orderServiceSpy.updateOrder.and.returnValue(Promise.reject(new Error('Cancel failed')));

      component.onSubmit();
      tick();

      expect(spyWarn).toHaveBeenCalledWith('No se pudo cancelar la orden huérfana:', 'order-999');
    }));

    it('should handle stock error message when payment fails', fakeAsync(() => {
      spyOn(console, 'error');
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      paymentServiceSpy.initiatePayment.and.rejectWith({
        code: 'resource-exhausted',
        message: 'Stock insuficiente para el producto',
      });

      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Pago Rechazado',
        jasmine.stringMatching(/Stock insuficiente/),
      );
    }));

    it('should handle invalid price error message when payment fails', fakeAsync(() => {
      spyOn(console, 'error');
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      paymentServiceSpy.initiatePayment.and.rejectWith({
        message: 'precio inválido detectado',
      });

      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Pago Rechazado',
        jasmine.stringMatching(/precio inválido/),
      );
    }));

    it('should handle error when createOrder fails', fakeAsync(() => {
      spyOn(console, 'error');
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      orderServiceSpy.createOrder.and.rejectWith(new Error('Firestore error'));

      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Pago Rechazado',
        'No pudimos registrar tu pedido. Intenta de nuevo.',
      );
      expect(component.isProcessingPayment()).toBeFalse();
    }));

    it('should show warning alert when cart items are pruned before payment', fakeAsync(() => {
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      cartServiceSpy.pruneUnavailableItems.and.returnValue(Promise.resolve(['Prod A (Agotado)']));

      paymentServiceSpy.initiatePayment.and.returnValue(
        Promise.resolve({ success: false, error: 'Rechazado' }),
      );
      spyOn(console, 'error');

      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.warning).toHaveBeenCalledWith(
        'Productos no disponibles',
        'Se quitaron del carrito: Prod A (Agotado).',
      );
    }));

    it('should show error and navigate to cart if all items are pruned', fakeAsync(() => {
      component.checkoutForm.get('contactInfo')?.patchValue({
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '1122334455',
        dni: '12345678',
      });
      component.setDeliveryType('store_pickup');

      cartServiceSpy.pruneUnavailableItems.and.callFake(async () => {
        mockCartSignal.set({ items: [], total: 0 });
        return ['Prod A (Agotado)'];
      });

      const navigateSpy = spyOn(router, 'navigate');

      component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.warning).toHaveBeenCalled();
      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Carrito Vacío',
        'Los productos de tu carrito ya no están disponibles.',
      );
      expect(navigateSpy).toHaveBeenCalledWith(['/cart']);
      expect(component.isProcessingPayment()).toBeFalse();
    }));

    it('should access contactControls and shippingControls getters', () => {
      expect(component.contactControls['firstName']).toBeTruthy();
      expect(component.shippingControls['address']).toBeTruthy();
    });

    it('should fallback to default pickup location when unknown ID is selected', () => {
      component.setPickupLocation('unknown-location-id');
      expect(component.selectedPickupLocation()?.id).toBe('loc-centro-1');
    });

    it('should fallback to default delivery config when storeConfig is null', () => {
      mockStoreConfigSignal.set(null);
      fixture.detectChanges();
      TestBed.flushEffects();

      expect(component.deliveryConfig().enableHomeDelivery).toBeTrue();
    });
  });
});
