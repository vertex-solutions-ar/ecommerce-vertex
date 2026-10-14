import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Dashboard } from './dashboard';
import { ProductService } from '@core/services/product.service';
import { OrderService } from '@core/services/order.service';
import { ClientService } from '@core/services/client.service';
import { AuthService } from '@core/services/auth.service';
import type { Order } from '@core/models/order.model';
import type { Product } from '@core/models/product.model';
import type { Client } from '@core/models/client.model';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;
  let productServiceSpy: jasmine.SpyObj<ProductService>;
  let orderServiceSpy: jasmine.SpyObj<OrderService>;
  let clientServiceSpy: jasmine.SpyObj<ClientService>;

  const mockOrders: Order[] = [{ id: 'o1', total: 1000 } as Order];
  const mockProducts: Product[] = [{ id: 'p1', name: 'Prod 1', stock: 2 } as unknown as Product];
  const mockClients: Client[] = [{ id: 'c1', firstName: 'Juan' } as unknown as Client];

  beforeEach(async () => {
    productServiceSpy = jasmine.createSpyObj('ProductService', [
      'getProductsLowInStock',
      'getLatestProducts',
    ]);
    orderServiceSpy = jasmine.createSpyObj('OrderService', [
      'getMonthlySalesAndOrders',
      'getGlobalSalesAndOrders',
      'getPendingOrProcessingOrders',
      'getLatestOrders',
    ]);
    clientServiceSpy = jasmine.createSpyObj('ClientService', [
      'getNewClientsThisMonth',
      'getTotalClients',
      'getLatestClients',
    ]);

    orderServiceSpy.getMonthlySalesAndOrders.and.returnValue(
      of({ monthlySales: 5000, monthlyOrders: 10 }),
    );
    clientServiceSpy.getNewClientsThisMonth.and.returnValue(of(3));

    orderServiceSpy.getGlobalSalesAndOrders.and.returnValue(
      of({ totalSales: 50000, totalOrders: 100 }),
    );
    clientServiceSpy.getTotalClients.and.returnValue(of(45));

    orderServiceSpy.getPendingOrProcessingOrders.and.returnValue(of(mockOrders));
    productServiceSpy.getProductsLowInStock.and.returnValue(of(mockProducts));
    orderServiceSpy.getLatestOrders.and.returnValue(of(mockOrders));
    clientServiceSpy.getLatestClients.and.returnValue(of(mockClients));
    productServiceSpy.getLatestProducts.and.returnValue(of(mockProducts));

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAdmin$: of(true),
            isStaff$: of(false),
            isStaff: () => false,
          },
        },
        { provide: ProductService, useValue: productServiceSpy },
        { provide: OrderService, useValue: orderServiceSpy },
        { provide: ClientService, useValue: clientServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create dashboard component', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('orders');
  });

  it('should load monthly metrics successfully', (done) => {
    component.monthlyMetrics$.subscribe((metrics) => {
      expect(metrics).toEqual({ sales: 5000, orders: 10, newClients: 3 });
      done();
    });
  });

  it('should handle errors in monthly metrics gracefully', (done) => {
    orderServiceSpy.getMonthlySalesAndOrders.and.returnValue(
      throwError(() => new Error('Error monthly')),
    );
    component.ngOnInit();

    component.monthlyMetrics$.subscribe((metrics) => {
      expect(metrics).toEqual({ sales: 0, orders: 0, newClients: 0 });
      done();
    });
  });

  it('should load global metrics successfully', (done) => {
    component.globalMetrics$.subscribe((metrics) => {
      expect(metrics).toEqual({ totalSales: 50000, totalOrders: 100, totalClients: 45 });
      done();
    });
  });

  it('should handle errors in global metrics gracefully', (done) => {
    clientServiceSpy.getTotalClients.and.returnValue(throwError(() => new Error('Error global')));
    component.ngOnInit();

    component.globalMetrics$.subscribe((metrics) => {
      expect(metrics).toEqual({ totalSales: 0, totalOrders: 0, totalClients: 0 });
      done();
    });
  });

  it('should change activeTab and activeRecentTab via setTab', () => {
    component.setTab('orders');
    expect(component.activeTab()).toBe('orders');
    expect(component.activeRecentTab()).toBe(0);

    component.setTab('clients');
    expect(component.activeTab()).toBe('clients');
    expect(component.activeRecentTab()).toBe(1);

    component.setTab('products');
    expect(component.activeTab()).toBe('products');
    expect(component.activeRecentTab()).toBe(2);
  });

  it('should update screenWidth on window resize listener', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(500);
    component.onResize();

    expect(component.screenWidth()).toBe(500);
    expect(component.isMobile()).toBeTrue();
  });

  it('should change tab and scroll track on selectRecentTab with slides', () => {
    const mockTrack = document.createElement('div');
    const slide1 = document.createElement('div');
    slide1.className = 'activity-card-slide';
    const slide2 = document.createElement('div');
    slide2.className = 'activity-card-slide';
    mockTrack.appendChild(slide1);
    mockTrack.appendChild(slide2);
    spyOn(mockTrack, 'scrollTo');
    component.activitiesTrack = { nativeElement: mockTrack };

    component.selectRecentTab(1);

    expect(component.activeRecentTab()).toBe(1);
    expect(component.activeTab()).toBe('clients');
    expect(mockTrack.scrollTo).toHaveBeenCalled();

    // Call again to test clearTimeout when timer is already active
    component.selectRecentTab(0);
    expect(component.activeRecentTab()).toBe(0);
  });

  it('should handle selectRecentTab when track has no slides (fallback)', () => {
    const emptyTrack = document.createElement('div');
    spyOn(emptyTrack, 'scrollTo');
    component.activitiesTrack = { nativeElement: emptyTrack };

    component.selectRecentTab(1);
    expect(emptyTrack.scrollTo).toHaveBeenCalled();
  });

  it('should clamp selectRecentTab index if out of bounds', () => {
    component.activitiesTrack = undefined;
    component.selectRecentTab(-5);
    expect(component.activeRecentTab()).toBe(0);

    component.selectRecentTab(99);
    expect(component.activeRecentTab()).toBe(2);
  });

  it('should clean up timer on ngOnDestroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('should ignore onActivitiesScroll when programmatic scroll is active', () => {
    const mockTrack = document.createElement('div');
    spyOn(mockTrack, 'scrollTo');
    component.activitiesTrack = { nativeElement: mockTrack };
    component.selectRecentTab(1);

    component.onActivitiesScroll();
    expect(component.activeRecentTab()).toBe(1);
  });

  it('should handle onActivitiesScroll when activitiesTrack is undefined or clientWidth is 0', () => {
    component.activitiesTrack = undefined;
    expect(() => component.onActivitiesScroll()).not.toThrow();

    component.activitiesTrack = {
      nativeElement: { clientWidth: 0, scrollLeft: 0 } as unknown as HTMLElement,
    };
    expect(() => component.onActivitiesScroll()).not.toThrow();
  });

  it('should update activeRecentTab on activities scroll when position changes', () => {
    component.activitiesTrack = {
      nativeElement: {
        clientWidth: 400,
        scrollLeft: 400,
      } as unknown as HTMLElement,
    };

    component.onActivitiesScroll();
    expect(component.activeRecentTab()).toBe(1);
    expect(component.activeTab()).toBe('clients');

    // Call again with same position to hit branch when activeRecentTab === safeIndex
    component.onActivitiesScroll();
    expect(component.activeRecentTab()).toBe(1);
  });
});
