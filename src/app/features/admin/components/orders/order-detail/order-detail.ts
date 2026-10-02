import type { OnInit, Signal } from '@angular/core';
import { Component, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import type { Order, OrderItem, OrderStatus } from '@core/models/order.model';
import { OrderService } from '@core/services/order.service';
import type { Observable } from 'rxjs';
import { of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { SumItemsPipe } from '../../shared/pipes/sum-items/sum-items.pipe';
import { ReceiptModal } from '../receipt-modal/receipt-modal';

import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-order-details',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    TitleCasePipe,
    SumItemsPipe,
    ReceiptModal,
  ],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private orderService = inject(OrderService);
  private authService = inject(AuthService);

  readonly isStaff: Signal<boolean> = this.authService.isStaff;

  showReceipt = false;
  receiptOrder: Order | undefined;
  order$!: Observable<Order | undefined>;
  orderId: string | null = null;
  pageTitle: string = 'Detalles del Pedido';

  currentStatus: OrderStatus = 'pending';
  statusOptions: OrderStatus[] = [
    'pending',
    'processing',
    'ready_for_pickup',
    'shipped',
    'delivered',
    'cancelled',
  ];

  ngOnInit(): void {
    this.order$ = this.route.paramMap.pipe(
      switchMap((params) => {
        this.orderId = params.get('id');

        if (this.orderId) {
          return this.orderService.getOrderById(this.orderId).pipe(
            tap((order) => {
              if (order) {
                this.currentStatus = order.status;
              } else {
                this.pageTitle = 'Pedido No Encontrado';
              }
            }),
          );
        } else {
          this.pageTitle = 'Error: ID de Pedido Faltante';
          void this.router.navigate(['/admin/orders']);
          return of(undefined);
        }
      }),
    );
  }

  goBack(): void {
    void this.router.navigate(['/admin/orders']);
  }

  onStatusChange(event: Event): void {
    const newStatus = (event.target as HTMLSelectElement).value as OrderStatus;
    if (this.orderId && newStatus !== this.currentStatus) {
      this.orderService
        .updateOrder(this.orderId, { status: newStatus })
        .then(() => {
          this.currentStatus = newStatus;
        })
        .catch((error) => {
          console.error('Error al actualizar el estado del pedido:', error);
        });
    }
  }

  getItemSubtotal(item: OrderItem): number {
    return item.quantity * item.price;
  }

  isStorePickup(order: Order): boolean {
    return order.deliverySelection?.type === 'store_pickup';
  }

  generateReceipt(order: Order): void {
    this.receiptOrder = order;
    this.showReceipt = true;
  }

  closeReceipt(): void {
    this.showReceipt = false;
  }
}
