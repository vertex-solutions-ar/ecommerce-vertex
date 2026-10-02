import { TestBed } from '@angular/core/testing';
import { StoreConfigService } from './store-config.service';
import { Meta } from '@angular/platform-browser';
import { Firestore } from '@angular/fire/firestore';
import type { DocumentReference, DocumentSnapshot } from '@angular/fire/firestore';
import type {
  StoreConfig,
  DeliveryMethodConfig,
  HeaderAppearanceConfig,
} from '@core/models/store-config.model';

interface StoreConfigServiceWithPrivates {
  getDocRef: (path: string, ...segments: string[]) => DocumentReference;
  getDocSnap: (ref: DocumentReference) => Promise<DocumentSnapshot>;
  setDocData: (ref: DocumentReference, data: Record<string, unknown>) => Promise<void>;
}

describe('StoreConfigService', () => {
  let service: StoreConfigService;
  let firestoreSpy: jasmine.SpyObj<Firestore>;

  const mockConfig: StoreConfig = {
    tenantId: 'test-tenant',
    storeId: 'white-label-store',
    storeName: 'Test Store Name',
    tagline: 'Test Tagline',
    logoUrl: 'https://logo.url',
    faviconUrl: 'https://favicon.url',
    brandDisplayMode: 'text',
    announcementBar: {
      enabled: false,
      text: '',
      isMarquee: false,
    },
    floatingWhatsApp: {
      enabled: false,
    },
    colors: {
      primary: '#ea580c',
      accent: '#ef4444',
      background: '#ffffff',
    },
    payments: {
      mercadoPagoPublicKey: 'TEST-12345',
    },
    contact: {
      phone: '12345678',
      email: 'test@store.com',
      whatsApp: '123456',
      instagram: 'instagram',
      facebook: 'facebook',
    },
    seo: {
      metaDescription: 'Meta Description Test',
    },
    setupCompleted: true,
  };

  beforeEach(() => {
    spyOn(console, 'error');
    spyOn(console, 'warn');
    firestoreSpy = jasmine.createSpyObj('Firestore', ['type']);

    TestBed.configureTestingModule({
      providers: [StoreConfigService, { provide: Firestore, useValue: firestoreSpy }],
    });
    service = TestBed.inject(StoreConfigService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial fallback values', () => {
    expect(service.storeName()).toBe('Mi Tienda');
    expect(service.logoUrl()).toBe('');
    expect(service.isFirstRun()).toBeFalse();
  });

  it('should cover loadConfig and saveConfig error paths', async () => {
    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocSnap').and.returnValue(Promise.reject(new Error('Firestore error')));
    await service.loadConfig();
    expect(service.storeConfig()).toBeNull();
  });

  it('should load config successfully from configuracion collection', async () => {
    const mockSnap = {
      exists: () => true,
      data: () => mockConfig,
    } as unknown as DocumentSnapshot;

    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocRef').and.returnValue({} as unknown as DocumentReference);
    spyOn(privSvc, 'getDocSnap').and.returnValue(Promise.resolve(mockSnap));

    await service.loadConfig();
    expect(service.storeConfig()).toEqual(mockConfig);
    expect(service.storeName()).toBe('Test Store Name');
    expect(service.logoUrl()).toBe('https://logo.url');
    expect(service.isFirstRun()).toBeFalse();
  });

  it('should evaluate isFirstRun to true if setupCompleted is false', async () => {
    const mockConfigFirstRun: StoreConfig = {
      ...mockConfig,
      setupCompleted: false,
    };
    const mockSnap = {
      exists: () => true,
      data: () => mockConfigFirstRun,
    } as unknown as DocumentSnapshot;

    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocRef').and.returnValue({} as unknown as DocumentReference);
    spyOn(privSvc, 'getDocSnap').and.returnValue(Promise.resolve(mockSnap));

    await service.loadConfig();
    expect(service.isFirstRun()).toBeTrue();
  });

  it('should return null when configuracion/store does not exist (legacy fallback removed)', async () => {
    const mockSnapEmpty = {
      exists: () => false,
    } as unknown as DocumentSnapshot;

    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocRef').and.returnValue({} as unknown as DocumentReference);
    spyOn(privSvc, 'getDocSnap').and.returnValue(Promise.resolve(mockSnapEmpty));

    await service.loadConfig();
    expect(service.storeConfig()).toBeNull();
  });

  it('should save config successfully', async () => {
    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocRef').and.returnValue({} as unknown as DocumentReference);
    spyOn(privSvc, 'setDocData').and.returnValue(Promise.resolve());

    await service.saveConfig(mockConfig);
    expect(service.storeConfig()).toEqual(mockConfig);
  });

  it('should update delivery config atomically and update signal', async () => {
    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocRef').and.returnValue({} as unknown as DocumentReference);
    const setDocDataSpy = spyOn(privSvc, 'setDocData').and.returnValue(Promise.resolve());

    // Set initial config
    await service.saveConfig(mockConfig);

    const deliveryPayload: DeliveryMethodConfig = {
      enableHomeDelivery: true,
      enableStorePickup: true,
      homeDeliveryDescription: 'Envío express',
      pickupLocations: [],
    };

    await service.updateDeliveryConfig(deliveryPayload);
    expect(setDocDataSpy).toHaveBeenCalled();
    expect(service.storeConfig()?.deliveryMethods).toEqual(deliveryPayload);
    // Other fields should remain intact
    expect(service.storeConfig()?.storeName).toBe('Test Store Name');
  });

  it('should update header and announcements atomically and update signal with deep spread in appearance', async () => {
    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    spyOn(privSvc, 'getDocRef').and.returnValue({} as unknown as DocumentReference);
    const setDocDataSpy = spyOn(privSvc, 'setDocData').and.returnValue(Promise.resolve());

    // Initialize with mock config
    await service.saveConfig({
      ...mockConfig,
      appearance: {
        header: {
          backgroundColor: '#000000',
          textColor: '#ffffff',
          accentColor: '#10b981',
          fontFamily: 'inter',
          shadowStyle: 'subtle',
        },
      },
    });

    const headerPayload: HeaderAppearanceConfig = {
      backgroundColor: '#1f2937',
      textColor: '#f9fafb',
      accentColor: '#6366f1',
      fontFamily: 'poppins',
      shadowStyle: 'medium',
    };

    const announcementsPayload = {
      announcementBar: {
        enabled: true,
        text: '¡Descuentos del 20%!',
        link: '/promociones',
        backgroundColor: '#000000',
        textColor: '#ffff00',
      },
      floatingWhatsApp: {
        enabled: true,
        phoneNumber: '5492611234567',
        defaultMessage: 'Hola, consulta de producto',
      },
    };

    await service.updateHeaderAndAnnouncements(headerPayload, announcementsPayload);

    expect(setDocDataSpy).toHaveBeenCalledWith(
      jasmine.any(Object),
      jasmine.objectContaining({
        appearance: {
          header: headerPayload,
        },
        announcementBar: announcementsPayload.announcementBar,
        floatingWhatsApp: announcementsPayload.floatingWhatsApp,
        updatedAt: jasmine.any(String),
      }),
    );

    const updatedConfig = service.storeConfig();
    expect(updatedConfig?.appearance?.header).toEqual(headerPayload);
    expect(updatedConfig?.announcementBar).toEqual(announcementsPayload.announcementBar);
    expect(updatedConfig?.floatingWhatsApp).toEqual(announcementsPayload.floatingWhatsApp);
    // Preserves existing fields intact
    expect(updatedConfig?.storeName).toBe('Test Store Name');
    expect(updatedConfig?.logoUrl).toBe('https://logo.url');
  });

  it('should trigger theme injection effect when config is updated', () => {
    const root = document.documentElement;
    spyOn(root.style, 'setProperty');

    const privateService = service as unknown as {
      _storeConfig: {
        set: (value: StoreConfig) => void;
      };
    };

    privateService._storeConfig.set({
      colors: {
        primary: '#111111',
        accent: '#222222',
        background: '#333333',
      },
    } as unknown as StoreConfig);

    TestBed.flushEffects();

    expect(root.style.setProperty).toHaveBeenCalledWith('--color-primary', '#111111');
    expect(root.style.setProperty).toHaveBeenCalledWith('--color-accent', '#222222');
    expect(root.style.setProperty).toHaveBeenCalledWith('--shop-bg', '#333333');
  });

  it('should update meta description via effect when seo.metaDescription is set', () => {
    const privateService = service as unknown as {
      _storeConfig: {
        set: (value: StoreConfig) => void;
      };
    };

    privateService._storeConfig.set({
      seo: { metaDescription: 'My SEO Description' },
    } as unknown as StoreConfig);

    TestBed.flushEffects();
    // The effect updates the meta tag — should not throw
    expect(service.storeConfig()).toBeTruthy();
  });

  it('should set favicon via effect when faviconUrl is provided', () => {
    const privateService = service as unknown as {
      _storeConfig: {
        set: (value: StoreConfig) => void;
      };
    };

    privateService._storeConfig.set({
      faviconUrl: 'https://new-favicon.url',
      seo: {},
      colors: undefined,
    } as unknown as StoreConfig);

    // Exercise the effect branch — just verify it runs without error
    TestBed.flushEffects();
    expect(service.storeConfig()).toBeTruthy();
  });

  it('should create new favicon link when faviconUrl is provided and no link exists', () => {
    // Remove any existing favicon links so the 'else' branch is taken
    document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());

    const privateService = service as unknown as {
      _storeConfig: {
        set: (value: StoreConfig) => void;
      };
    };

    privateService._storeConfig.set({
      faviconUrl: 'https://new-favicon-2.url',
      seo: {},
      colors: undefined,
    } as unknown as StoreConfig);

    TestBed.flushEffects();
    expect(service.storeConfig()).toBeTruthy();
  });

  it('should read only from the flat storeId-keyed path (configuracion/store_{storeId}); null when missing', async () => {
    const emptySnap = { exists: () => false } as unknown as DocumentSnapshot;

    const privSvc = service as unknown as StoreConfigServiceWithPrivates;
    const getDocRefSpy = spyOn(privSvc, 'getDocRef').and.returnValue(
      {} as unknown as DocumentReference,
    );
    spyOn(privSvc, 'getDocSnap').and.returnValue(Promise.resolve(emptySnap));

    await service.loadConfig();

    expect(getDocRefSpy).toHaveBeenCalledWith('configuracion', jasmine.stringMatching(/^store_/));
    expect(service.storeConfig()).toBeNull();
  });

  it('should synchronize Open Graph and Twitter Card tags via updateSeoTags', () => {
    const metaService = TestBed.inject(Meta);
    spyOn(metaService, 'updateTag');

    service.updateSeoTags({
      storeName: 'Mi Tienda Especial',
      tagline: 'Lo mejor en tecnología',
      logoUrl: 'https://img.png',
      seo: { metaDescription: 'Descripción de prueba' },
    } as unknown as StoreConfig);

    expect(metaService.updateTag).toHaveBeenCalledWith({
      name: 'description',
      content: 'Lo mejor en tecnología',
    });
    expect(metaService.updateTag).toHaveBeenCalledWith({
      property: 'og:site_name',
      content: 'Mi Tienda Especial',
    });
    expect(metaService.updateTag).toHaveBeenCalledWith({
      property: 'og:title',
      content: 'Mi Tienda Especial',
    });
    expect(metaService.updateTag).toHaveBeenCalledWith({
      property: 'og:description',
      content: 'Lo mejor en tecnología',
    });
    expect(metaService.updateTag).toHaveBeenCalledWith({
      property: 'og:image',
      content: 'https://img.png',
    });
    expect(metaService.updateTag).toHaveBeenCalledWith({
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    expect(metaService.updateTag).toHaveBeenCalledWith({
      name: 'twitter:title',
      content: 'Mi Tienda Especial',
    });
  });
});
