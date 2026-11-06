import type { AfterViewInit, ElementRef } from '@angular/core';
import { Component, EventEmitter, inject, Input, Output, signal, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import type { Order, OrderItem, OrderStatus } from '@core/models/order.model';
import { OrderService } from '@core/services/order.service';
import { StoreConfigService } from '@core/services/store-config.service';
import { SumItemsPipe } from '../../shared/pipes/sum-items/sum-items.pipe';

@Component({
  selector: 'app-receipt-modal',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, SumItemsPipe],
  templateUrl: './receipt-modal.html',
  styleUrl: './receipt-modal.scss',
})
export class ReceiptModal implements AfterViewInit {
  private readonly storeConfig = inject(StoreConfigService);
  private readonly orderService = inject(OrderService, { optional: true });

  @Input() order: Order | undefined;
  @Output() closeModal = new EventEmitter<void>();
  @Output() paymentConfirmed = new EventEmitter<OrderStatus>();

  @ViewChild('confirmBtn') confirmBtn?: ElementRef<HTMLButtonElement>;

  title = 'Recibo de Pedido';
  today = new Date();
  readonly storeName = this.storeConfig.storeName;
  readonly logoUrl = this.storeConfig.logoUrl;
  readonly isConfirming = signal<boolean>(false);

  ngAfterViewInit(): void {
    setTimeout(() => this.confirmBtn?.nativeElement.focus(), 50);
  }

  get subtotal(): number {
    if (!this.order) {
      return 0;
    }
    return (
      this.order.subtotal ??
      this.order.paymentDetails?.subtotal ??
      (this.order.items ?? []).reduce((sum, item) => sum + this.getItemSubtotal(item), 0)
    );
  }

  get discountAmount(): number {
    return this.order?.discountAmount ?? this.order?.paymentDetails?.discountAmount ?? 0;
  }

  get discountPercentage(): number {
    return this.order?.discountPercentage ?? this.order?.paymentDetails?.discountPercentage ?? 0;
  }

  get receiptUrl(): string | undefined {
    return this.order?.receiptUrl ?? this.order?.paymentDetails?.receiptUrl;
  }

  get isTransferOrder(): boolean {
    return (
      this.order?.paymentMethod === 'transfer' ||
      this.order?.paymentDetails?.paymentMethod === 'transfer'
    );
  }

  currencyCode(): string {
    return 'ARS';
  }

  currencySymbol(): string {
    return '$';
  }

  getItemSubtotal(item: OrderItem): number {
    return item.quantity * item.price;
  }

  async confirmPayment(): Promise<void> {
    if (!this.order?.id || this.isConfirming()) {
      return;
    }

    this.isConfirming.set(true);
    try {
      const approvedStatus: OrderStatus = 'processing';
      if (this.orderService) {
        await this.orderService.updateOrder(this.order.id, { status: approvedStatus });
      }
      this.order.status = approvedStatus;
      this.paymentConfirmed.emit(approvedStatus);
      this.close();
    } catch (error) {
      console.error('Error al confirmar el pago del pedido:', error);
    } finally {
      this.isConfirming.set(false);
    }
  }

  close(): void {
    this.closeModal.emit();
  }

  printReceipt(): void {
    window.print();
  }
}
