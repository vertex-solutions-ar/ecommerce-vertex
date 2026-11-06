import type { OnInit } from '@angular/core';
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { FormGroup, AbstractControl } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import type { WithFieldValue } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { OrderSummary } from './components/order-summary/order-summary';
import { CartService } from '@core/services/cart.service';
import type { CartItem } from '@core/models/cart.model';
import { PaymentService } from '@core/services/payment.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { OrderService } from '@core/services/order.service';
import { StorageService } from '@core/services/storage.service';
import { ImageValidationService } from '@core/services/image-validation.service';
import type {
  Order,
  OrderItem,
  DeliveryType,
  OrderDeliverySelection,
} from '@core/models/order.model';
import { StoreConfigService } from '@core/services/store-config.service';
import type {
  StorePickupLocation,
  DeliveryMethodConfig,
  BankTransferConfig,
} from '@core/models/store-config.model';
import { DEFAULT_DELIVERY_METHOD_CONFIG } from '@core/models/store-config.model';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, OrderSummary],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checkout implements OnInit {
  private fb = inject(FormBuilder);
  cartService = inject(CartService);
  private paymentService = inject(PaymentService);
  private sweetAlertService = inject(SweetAlertService);
  private orderService = inject(OrderService);
  private storeConfigService = inject(StoreConfigService);
  private storageService = inject(StorageService);
  private imageValidationService = inject(ImageValidationService);
  private router = inject(Router);

  checkoutForm!: FormGroup;
  isProcessingPayment = signal(false);

  // Payment method & discount signals
  readonly storeConfig = this.storeConfigService.storeConfig;
  readonly bankTransferConfig = computed<BankTransferConfig | undefined>(
    () => this.storeConfigService.storeConfig()?.paymentMethods?.bankTransfer,
  );
  readonly isBankTransferEnabled = computed<boolean>(() =>
    Boolean(this.bankTransferConfig()?.enabled),
  );
  selectedPaymentMethod = signal<'mercadopago' | 'transfer'>(
    this.storeConfigService.storeConfig()?.paymentMethods?.bankTransfer?.enabled
      ? 'transfer'
      : 'mercadopago',
  );
  private paymentMethodManuallySelected = false;

  readonly subtotal = computed<number>(() => this.cartService.cart().total);
  readonly hasTransferDiscount = computed<boolean>(() =>
    Boolean(
      this.bankTransferConfig()?.enabled &&
      (this.bankTransferConfig()?.discountPercentage ?? 0) > 0,
    ),
  );
  readonly transferDiscountPercentage = computed<number>(() =>
    this.hasTransferDiscount() ? (this.bankTransferConfig()?.discountPercentage ?? 0) : 0,
  );
  readonly transferSavingsAmount = computed<number>(() => {
    const pct = this.transferDiscountPercentage();
    return pct > 0 ? Math.round(((this.subtotal() * pct) / 100) * 100) / 100 : 0;
  });
  readonly discountAmount = computed<number>(() =>
    this.selectedPaymentMethod() === 'transfer' && this.hasTransferDiscount()
      ? this.transferSavingsAmount()
      : 0,
  );
  readonly finalTotal = computed<number>(() =>
    Math.max(0, Math.round((this.subtotal() - this.discountAmount()) * 100) / 100),
  );

  // Bank transfer UX state (copy alias & receipt upload)
  readonly aliasCopied = signal<boolean>(false);
  readonly receiptFile = signal<File | null>(null);
  readonly receiptPreviewUrl = signal<string | null>(null);
  readonly receiptError = signal<string | null>(null);

  // Delivery method signals
  readonly deliveryConfig = computed<DeliveryMethodConfig>(
    () => this.storeConfigService.storeConfig()?.deliveryMethods ?? DEFAULT_DELIVERY_METHOD_CONFIG,
  );

  readonly availablePickupLocations = computed<StorePickupLocation[]>(() =>
    (this.deliveryConfig().pickupLocations ?? []).filter((location) => location.enabled),
  );

  readonly selectedDeliveryType = signal<DeliveryType>('home_delivery');
  readonly selectedPickupLocationId = signal<string | null>(null);

  readonly selectedPickupLocation = computed<StorePickupLocation | null>(() => {
    const locations = this.availablePickupLocations();
    const id = this.selectedPickupLocationId();
    return locations.find((loc) => loc.id === id) ?? locations[0] ?? null;
  });

  constructor() {
    effect(
      () => {
        const config = this.deliveryConfig();
        const locations = this.availablePickupLocations();

        // Intelligently set delivery type if configuration forces only pickup
        if (config.enableStorePickup && !config.enableHomeDelivery) {
          if (this.selectedDeliveryType() !== 'store_pickup') {
            this.selectedDeliveryType.set('store_pickup');
            this.updateShippingValidators(false);
          }
        } else if (!config.enableStorePickup && config.enableHomeDelivery) {
          if (this.selectedDeliveryType() !== 'home_delivery') {
            this.selectedDeliveryType.set('home_delivery');
            this.updateShippingValidators(true);
          }
        }

        // Initialize selected pickup location ID if null and locations exist
        if (!this.selectedPickupLocationId() && locations.length > 0) {
          this.selectedPickupLocationId.set(locations[0].id);
        }

        // Sync payment method with store configuration
        const transferEnabled = this.isBankTransferEnabled();
        if (!transferEnabled && this.selectedPaymentMethod() === 'transfer') {
          this.selectedPaymentMethod.set('mercadopago');
        } else if (
          transferEnabled &&
          !this.paymentMethodManuallySelected &&
          this.selectedPaymentMethod() !== 'transfer'
        ) {
          this.selectedPaymentMethod.set('transfer');
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.checkoutForm = this.fb.group({
      contactInfo: this.fb.group({
        firstName: ['', [Validators.required, Validators.minLength(2)]],
        lastName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        phone: [
          '',
          [Validators.required, Validators.pattern('^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-s./0-9]*$')],
        ],
        dni: ['', [Validators.required, Validators.pattern('^[0-9]{7,8}$')]],
      }),
      shippingInfo: this.fb.group({
        address: ['', [Validators.required, Validators.minLength(5)]],
        city: ['', [Validators.required, Validators.minLength(3)]],
        zipCode: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9- ]{3,10}$')]],
        province: ['', [Validators.required, Validators.minLength(4)]],
      }),
    });

    if (this.selectedDeliveryType() === 'store_pickup') {
      this.updateShippingValidators(false);
    }
  }

  get contactControls(): { [key: string]: AbstractControl } {
    return (this.checkoutForm.get('contactInfo') as FormGroup).controls;
  }
  get shippingControls(): { [key: string]: AbstractControl } {
    return (this.checkoutForm.get('shippingInfo') as FormGroup).controls;
  }

  setDeliveryType(type: DeliveryType): void {
    this.selectedDeliveryType.set(type);
    if (type === 'store_pickup') {
      if (!this.selectedPickupLocationId() && this.availablePickupLocations().length > 0) {
        this.selectedPickupLocationId.set(this.availablePickupLocations()[0].id);
      }
      this.updateShippingValidators(false);
    } else {
      this.updateShippingValidators(true);
    }
  }

  setPickupLocation(locationId: string): void {
    this.selectedPickupLocationId.set(locationId);
  }

  setPaymentMethod(method: 'mercadopago' | 'transfer'): void {
    this.paymentMethodManuallySelected = true;
    this.selectedPaymentMethod.set(method);
  }

  async copyAlias(alias?: string): Promise<void> {
    const cleanAlias = alias?.trim();
    if (!cleanAlias) {
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanAlias);
      }
      this.aliasCopied.set(true);
      setTimeout(() => {
        this.aliasCopied.set(false);
      }, 2000);
    } catch (error) {
      console.warn('No se pudo copiar el alias al portapapeles:', error);
    }
  }

  onReceiptFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const validation = this.imageValidationService.validateReceiptImage(file);
    if (!validation.valid) {
      const errorMsg = validation.errors.join(' ');
      this.receiptError.set(errorMsg);
      this.receiptFile.set(null);
      this.receiptPreviewUrl.set(null);
      this.sweetAlertService.error('Comprobante inválido', errorMsg);
      input.value = '';
      return;
    }

    this.receiptError.set(null);
    this.receiptFile.set(file);

    const reader = new FileReader();
    reader.onload = (e): void => {
      this.receiptPreviewUrl.set((e.target?.result as string) ?? null);
    };
    reader.readAsDataURL(file);
  }

  removeReceiptFile(): void {
    this.receiptFile.set(null);
    this.receiptPreviewUrl.set(null);
    this.receiptError.set(null);
  }

  private updateShippingValidators(isHomeDelivery: boolean): void {
    if (!this.checkoutForm) {
      return;
    }
    const shippingGroup = this.checkoutForm.get('shippingInfo') as FormGroup;
    if (!shippingGroup) {
      return;
    }

    if (isHomeDelivery) {
      shippingGroup.get('address')?.setValidators([Validators.required, Validators.minLength(5)]);
      shippingGroup.get('city')?.setValidators([Validators.required, Validators.minLength(3)]);
      shippingGroup
        .get('zipCode')
        ?.setValidators([Validators.required, Validators.pattern('^[a-zA-Z0-9- ]{3,10}$')]);
      shippingGroup.get('province')?.setValidators([Validators.required, Validators.minLength(4)]);
    } else {
      shippingGroup.get('address')?.clearValidators();
      shippingGroup.get('city')?.clearValidators();
      shippingGroup.get('zipCode')?.clearValidators();
      shippingGroup.get('province')?.clearValidators();
    }

    Object.keys(shippingGroup.controls).forEach((key) => {
      shippingGroup.get(key)?.updateValueAndValidity();
    });
  }

  async onSubmit(): Promise<void> {
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      this.sweetAlertService.error(
        'Formulario Incompleto',
        'Por favor, completa todos los campos requeridos.',
      );
      return;
    }

    this.isProcessingPayment.set(true);
    this.sweetAlertService.loading('Preparando tu pago...', 'Por favor, espera.');

    const cart = this.cartService.cart();

    if (!cart || cart.items.length === 0) {
      this.sweetAlertService.error('Carrito Vacío', 'No puedes proceder al pago sin productos.');
      this.isProcessingPayment.set(false);
      void this.router.navigate(['/cart']);
      return;
    }

    let orderId: string | null = null;

    try {
      // Quita items obsoletos (producto borrado o sin stock) antes de pagar.
      const removed = await this.cartService.pruneUnavailableItems();
      const cartAfter = this.cartService.cart();

      if (removed.length > 0) {
        this.sweetAlertService.warning(
          'Productos no disponibles',
          `Se quitaron del carrito: ${removed.join(', ')}.`,
        );
      }
      if (!cartAfter || cartAfter.items.length === 0) {
        this.sweetAlertService.error(
          'Carrito Vacío',
          removed.length > 0
            ? 'Los productos de tu carrito ya no están disponibles.'
            : 'No puedes proceder al pago sin productos.',
        );
        this.isProcessingPayment.set(false);
        void this.router.navigate(['/cart']);
        return;
      }

      let uploadedReceiptUrl: string | undefined;
      const isTransfer = this.selectedPaymentMethod() === 'transfer';

      if (isTransfer && this.receiptFile()) {
        const upload = this.storageService.uploadFile(this.receiptFile()!, 'receipts');
        uploadedReceiptUrl = await firstValueFrom(upload.downloadUrl$);
      }

      orderId = await this.createOrder(cartAfter.items, this.finalTotal(), uploadedReceiptUrl);

      if (isTransfer) {
        if (typeof this.paymentService.confirmBankTransferOrder === 'function') {
          await this.paymentService.confirmBankTransferOrder(
            orderId,
            cartAfter.items,
            uploadedReceiptUrl,
          );
        }
        this.sweetAlertService.close?.();
        this.isProcessingPayment.set(false);
        void this.router.navigate(['/order-confirmation', orderId], {
          queryParams: { status: 'approved', method: 'transfer' },
        });
        return;
      }

      const contactValue = this.checkoutForm.get('contactInfo')?.value;
      const payer = {
        firstName: contactValue?.firstName,
        lastName: contactValue?.lastName,
        email: contactValue?.email,
        dni: contactValue?.dni,
      };

      const paymentResult = await this.paymentService.initiatePayment(cart.items, orderId, payer);

      if (paymentResult.success && paymentResult.init_point) {
        window.location.href = paymentResult.init_point;
      } else {
        throw new Error(paymentResult.error ?? 'No se pudo obtener la URL de pago.');
      }
    } catch (error: unknown) {
      console.error('Error en el proceso de checkout:', error);

      // Cancel the orphaned order if it was created before payment failed
      if (orderId) {
        try {
          await this.orderService.updateOrder(orderId, { status: 'cancelled' as const });
        } catch {
          console.warn('No se pudo cancelar la orden huérfana:', orderId);
        }
      }

      let errorMessage = 'Ocurrió un error inesperado al procesar tu pago.';
      const err = error as { code?: string; message?: string };
      if (err.code === 'resource-exhausted' || (err.message ?? '').includes('insuficiente')) {
        errorMessage = `¡Stock insuficiente! ${err.message}. Por favor, revisa tu carrito.`;
      } else if ((err.message ?? '').includes('precio inválido')) {
        errorMessage = `Uno de los productos en tu carrito tiene un precio inválido. Por favor, revisa tu carrito.`;
      } else if (err.message) {
        errorMessage = err.message;
      }

      this.sweetAlertService.error('Pago Rechazado', errorMessage);
      this.isProcessingPayment.set(false);
    }
  }

  private async createOrder(
    cartItems: CartItem[],
    total: number,
    receiptUrl?: string,
  ): Promise<string> {
    const { contactInfo, shippingInfo } = this.checkoutForm.value;

    const orderItems: OrderItem[] = cartItems.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      productName: item.name,
      quantity: item.quantity,
      price: item.price,
      productImage: item.image ?? '',
      attributes: item.attributes,
    }));

    const isPickup = this.selectedDeliveryType() === 'store_pickup';
    const pickupLoc = this.selectedPickupLocation();
    const paymentMethod = this.selectedPaymentMethod();
    const isTransfer = paymentMethod === 'transfer';
    const subtotal = this.subtotal();
    const discountPercentage = isTransfer ? this.transferDiscountPercentage() : 0;
    const discountAmount = isTransfer ? this.discountAmount() : 0;

    const deliverySelection: OrderDeliverySelection = {
      type: this.selectedDeliveryType(),
      pickupLocationId: isPickup ? pickupLoc?.id : undefined,
      pickupAddressFormatted:
        isPickup && pickupLoc
          ? `${pickupLoc.name} - ${pickupLoc.address}, ${pickupLoc.city}`
          : undefined,
      notes: isPickup ? pickupLoc?.notes : undefined,
    };

    const newOrder: WithFieldValue<Omit<Order, 'id'>> = {
      userId: 'anonymous-user',
      clientName: `${contactInfo.firstName} ${contactInfo.lastName}`,
      clientEmail: contactInfo.email,
      clientPhone: contactInfo.phone,
      orderDate: new Date(),
      subtotal,
      discountPercentage,
      discountAmount,
      total,
      paymentMethod,
      receiptUrl,
      status: 'pending',
      items: orderItems,
      shippingAddress:
        isPickup && pickupLoc
          ? {
              street: pickupLoc.address,
              city: pickupLoc.city,
              state: pickupLoc.city,
              zipCode: '0000',
              country: 'Argentina',
            }
          : {
              street: shippingInfo.address,
              city: shippingInfo.city,
              state: shippingInfo.province,
              zipCode: shippingInfo.zipCode,
              country: 'Argentina',
            },
      paymentDetails: {
        paymentMethod,
        subtotal,
        discountPercentage,
        discountAmount,
        receiptUrl,
        shippingCost: 0,
        taxAmount: 0,
      },
      deliverySelection,
      stockDecremented: false,
    };

    try {
      const orderRef = await this.orderService.createOrder(newOrder);
      return orderRef.id;
    } catch (error) {
      console.error('Error al guardar el pedido:', error);
      throw new Error('No pudimos registrar tu pedido. Intenta de nuevo.');
    }
  }
}
