import type { WritableSignal } from '@angular/core';
import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Shop } from './shop';
import { CartService } from '@core/services/cart.service';
import { StoreConfigService } from '@core/services/store-config.service';
import { CategoryService } from '@core/services/category.service';
import { AuthService } from '@core/services/auth.service';
import { FooterService } from '@core/services/footer.service';
import type { StoreConfig } from '@core/models/store-config.model';
import type { Cart } from '@core/models/cart.model';

describe('Shop', () => {
  let component: Shop;
  let fixture: ComponentFixture<Shop>;
  let mockStoreConfigSignal: WritableSignal<StoreConfig | null>;
  let mockCartSignal: WritableSignal<Cart>;

  beforeEach(async () => {
    mockStoreConfigSignal = signal<StoreConfig | null>({
      storeName: 'Mi Tienda',
      logoUrl: 'logo.png',
      floatingWhatsApp: {
        enabled: false,
      },
    } as unknown as StoreConfig);

    mockCartSignal = signal<Cart>({ items: [], total: 0 });

    const cartServiceSpy = jasmine.createSpyObj('CartService', [], {
      cart: mockCartSignal,
      itemCount: signal(0),
    });
    const storeConfigServiceSpy = jasmine.createSpyObj('StoreConfigService', [], {
      storeConfig: mockStoreConfigSignal,
      storeName: signal('Mi Tienda'),
      logoUrl: signal('logo.png'),
    });
    const categoryServiceSpy = jasmine.createSpyObj('CategoryService', ['getCategories']);
    categoryServiceSpy.getCategories.and.returnValue(of([]));

    const authServiceSpy = jasmine.createSpyObj('AuthService', [], {
      currentUser$: of(null),
    });
    const footerServiceSpy = jasmine.createSpyObj('FooterService', ['getFooterData']);
    footerServiceSpy.getFooterData.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [Shop],
      providers: [
        provideRouter([]),
        { provide: CartService, useValue: cartServiceSpy },
        { provide: StoreConfigService, useValue: storeConfigServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: FooterService, useValue: footerServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Shop);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the shop layout component', () => {
    expect(component).toBeTruthy();
  });

  describe('floating whatsapp button', () => {
    it('should return null when floatingWhatsApp is disabled', () => {
      mockStoreConfigSignal.set({
        floatingWhatsApp: { enabled: false },
      } as StoreConfig);
      fixture.detectChanges();

      expect(component.whatsAppUrl()).toBeNull();

      const btn = fixture.debugElement.query(By.css('.floating-whatsapp'));
      expect(btn).toBeNull();
    });

    it('should generate whatsapp URL using floatingWhatsApp.phoneNumber and default message', () => {
      mockStoreConfigSignal.set({
        floatingWhatsApp: {
          enabled: true,
          phoneNumber: '+54 (911) 1234-5678',
          defaultMessage: 'Hola, tengo una pregunta',
        },
      } as StoreConfig);
      fixture.detectChanges();

      expect(component.whatsAppUrl()).toBe(
        'https://wa.me/5491112345678?text=Hola%2C%20tengo%20una%20pregunta',
      );

      const btn = fixture.debugElement.query(By.css('.floating-whatsapp'));
      expect(btn).not.toBeNull();
      expect(btn.nativeElement.getAttribute('href')).toBe(
        'https://wa.me/5491112345678?text=Hola%2C%20tengo%20una%20pregunta',
      );
    });

    it('should NOT render floating whatsapp button if floatingWhatsApp.phoneNumber is missing or empty even if contact.whatsApp is set', () => {
      mockStoreConfigSignal.set({
        floatingWhatsApp: {
          enabled: true,
          phoneNumber: '',
        },
        contact: {
          whatsApp: '+54 9 11 9876-5432',
        },
      } as StoreConfig);
      fixture.detectChanges();

      expect(component.whatsAppUrl()).toBeNull();
      const btn = fixture.debugElement.query(By.css('.floating-whatsapp'));
      expect(btn).toBeNull();
    });
  });
});
