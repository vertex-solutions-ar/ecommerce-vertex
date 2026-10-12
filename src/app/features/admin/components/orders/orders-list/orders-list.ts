import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  DestroyRef,
  signal,
  Injector,
} from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import type { Order, OrderStatus, DeliveryType } from '@core/models/order.model';
import { OrderService } from '@core/services/order.service';
import type { Observable } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, from, of } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, catchError } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { AuthService } from '@core/services/auth.service';
import { AdminSearchBar } from '@shared/components/admin-search-bar/admin-search-bar';
import { AdminPagination } from '@shared/components/admin-pagination/admin-pagination';

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders-list.html',
  styleUrl: './orders-list.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    TitleCasePipe,
    AdminSearchBar,
    AdminPagination,
  ],
})
export class OrdersList implements OnInit {
  private _orderService = inject(OrderService);
  private _router = inject(Router);
  private _sweetAlertService = inject(SweetAlertService);
  private _authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);

  readonly isStaff = this._authService.isStaff;

  currentPageSubject = new BehaviorSubject<number>(1);
  itemsPerPageSubject = new BehaviorSubject<number>(10);
  searchTermSubject = new BehaviorSubject<string>('');
  filterStatusSubject = new BehaviorSubject<string>('all');
  deliveryFilter = signal<'all' | DeliveryType>('all');

  private refreshTrigger = new BehaviorSubject<void>(undefined);

  itemsPerPageOptions = [5, 10, 20, 50];
  statusOptions: (OrderStatus | 'all')[] = [
    'all',
    'pending',
    'processing',
    'ready_for_pickup',
    'shipped',
    'delivered',
    'cancelled',
  ];

  totalOrders = 0;
  totalPages = 0;

  readonly isLoading = signal<boolean>(true);
  orders$!: Observable<Order[]>;
  private rawOrders$ = new BehaviorSubject<Order[]>([]);

  ngOnInit(): void {
    this.loadOrders();

    this.orders$ = combineLatest([
      this.rawOrders$,
      this.searchTermSubject.pipe(debounceTime(300), distinctUntilChanged()),
      this.filterStatusSubject,
      toObservable(this.deliveryFilter, { injector: this.injector }),
      this.currentPageSubject,
      this.itemsPerPageSubject,
    ]).pipe(
      map(([orders, searchTerm, filterStatus, deliveryFilter, currentPage, itemsPerPage]) => {
        let filteredOrders = orders;

        if (searchTerm) {
          const lowerSearch = searchTerm.toLowerCase();
          filteredOrders = orders.filter(
            (order) =>
              order.clientName.toLowerCase().includes(lowerSearch) ||
              order.id.toLowerCase().includes(lowerSearch) ||
              order.status.toLowerCase().includes(lowerSearch),
          );
        }

        if (filterStatus !== 'all') {
          filteredOrders = filteredOrders.filter((order) => order.status === filterStatus);
        }

        if (deliveryFilter !== 'all') {
          filteredOrders = filteredOrders.filter((order) => {
            const type = order.deliverySelection?.type ?? 'home_delivery';
            return type === deliveryFilter;
          });
        }

        this.totalOrders = filteredOrders.length;
        this.totalPages = Math.ceil(this.totalOrders / itemsPerPage);

        let correctedPage = currentPage;
        if (currentPage > this.totalPages && this.totalPages > 0) {
          correctedPage = this.totalPages;
        } else if (this.totalPages === 0) {
          correctedPage = 1;
        }

        const startIndex = (correctedPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        return filteredOrders.slice(startIndex, endIndex);
      }),
    );
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPageSubject.next(page);
    }
  }

  onItemsPerPageChange(newValue: string | number): void {
    this.itemsPerPageSubject.next(Number(newValue));
    this.currentPageSubject.next(1);
  }

  onSearchTermChange(newValue: string): void {
    this.searchTermSubject.next(newValue);
    this.currentPageSubject.next(1);
  }

  onFilterStatusChange(newValue: string): void {
    this.filterStatusSubject.next(newValue);
    this.currentPageSubject.next(1);
  }

  onDeliveryFilterChange(newValue: string): void {
    this.deliveryFilter.set(newValue as 'all' | DeliveryType);
    this.currentPageSubject.next(1);
  }

  getDeliveryBadge(order: Order): {
    icon: string;
    cssClass: string;
    label: string;
    summary?: string;
  } {
    if (order.deliverySelection?.type === 'store_pickup') {
      return {
        icon: 'bi-shop',
        cssClass: 'badge-delivery-pickup',
        label: 'Retiro en Local',
        summary: order.deliverySelection.pickupAddressFormatted ?? 'Sucursal',
      };
    }
    return {
      icon: 'bi-truck',
      cssClass: 'badge-delivery-home',
      label: 'Envío a Domicilio',
      summary: order.shippingAddress
        ? `${order.shippingAddress.city}, ${order.shippingAddress.state}`
        : '',
    };
  }

  loadOrders(): void {
    this.isLoading.set(true);
    this._orderService
      .getOrders()
      .pipe(
        catchError((err: unknown) => {
          console.error('Error al cargar pedidos:', err);
          return of([] as Order[]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((orders) => {
        this.rawOrders$.next(orders);
        this.isLoading.set(false);
      });
  }

  updateOrderStatus(order: Order, newStatus: OrderStatus): void {
    if (order.status === newStatus) {
      return;
    }

    const previousStatus = order.status;
    const currentOrders = this.rawOrders$.value;
    const updatedOrders = currentOrders.map((o) =>
      o.id === order.id ? { ...o, status: newStatus } : o,
    );
    this.rawOrders$.next(updatedOrders);

    this._orderService.updateOrder(order.id, { status: newStatus }).catch((error: unknown) => {
      console.error('Error al actualizar el estado del pedido:', error);
      const revertedOrders = this.rawOrders$.value.map((o) =>
        o.id === order.id ? { ...o, status: previousStatus } : o,
      );
      this.rawOrders$.next(revertedOrders);
      this._sweetAlertService?.error?.(
        'Error',
        'No se pudo actualizar el estado del pedido. Intenta nuevamente.',
      );
    });
  }

  editOrder(order: Order): void {
    void this._router.navigate(['/admin/orders', order.id]);
  }

  deleteOrder(order: Order): void {
    void this._sweetAlertService
      .confirm('Eliminar Pedido', `¿Estás seguro de que quieres eliminar el pedido ${order.id}?`)
      .then((confirmed) => {
        if (confirmed) {
          from(this._orderService.deleteOrder(order.id))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.loadOrders();
              },
              error: (error: unknown) => {
                console.error('Error al eliminar el pedido:', error);
              },
            });
        }
      });
  }
}
