import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import type { WritableSignal } from '@angular/core';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { StoreConfig } from './store-config';
import { StoreConfigService } from '@core/services/store-config.service';
import { StorageService } from '@core/services/storage.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { AuthService } from '@core/services/auth.service';
import type { StoreConfig as StoreConfigModel } from '@core/models/store-config.model';

import { RouterTestingModule } from '@angular/router/testing';
import { By } from '@angular/platform-browser';

describe('StoreConfig', () => {
  let component: StoreConfig;
  let fixture: ComponentFixture<StoreConfig>;
  let storeConfigServiceSpy: jasmine.SpyObj<StoreConfigService>;
  let storageServiceSpy: jasmine.SpyObj<StorageService>;
  let sweetAlertSpy: jasmine.SpyObj<SweetAlertService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let mockConfigSignal: WritableSignal<StoreConfigModel | null>;

  const mockConfig: StoreConfigModel = {
    tenantId: 'store',
    storeId: 'white-label-store',
    storeName: 'Test Store',
    tagline: 'Test Tagline',
    logoUrl: 'http://example.com/logo.png',
    faviconUrl: 'http://example.com/favicon.png',
    colors: {
      primary: '#ea580c',
      accent: '#ef4444',
      background: '#ffffff',
    },
    payments: {
      mercadoPagoPublicKey: 'TEST-PUBLIC-KEY',
    },
    contact: {
      phone: '+54 11 1234-5678',
      email: 'test@store.com',
      whatsApp: '+5491112345678',
      instagram: 'https://instagram.com/test',
      facebook: 'https://facebook.com/test',
    },
    seo: {
      metaDescription: 'Test SEO Description',
    },
    setupCompleted: true,
  };

  beforeEach(async () => {
    spyOn(console, 'error');
    spyOn(console, 'warn');
    storeConfigServiceSpy = jasmine.createSpyObj('StoreConfigService', [
      'loadConfig',
      'saveConfig',
    ]);
    storageServiceSpy = jasmine.createSpyObj('StorageService', ['uploadFile']);
    sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['success', 'error']);
    authServiceSpy = jasmine.createSpyObj('AuthService', [], {
      isOwner$: of(true),
    });

    // Mock signals
    mockConfigSignal = signal<StoreConfigModel | null>(mockConfig);
    const mockStoreNameSignal = signal<string>('Test Store');
    const mockLogoUrlSignal = signal<string>('http://example.com/logo.png');
    const mockIsFirstRunSignal = signal<boolean>(false);
    const mockIsLoadingSignal = signal<boolean>(false);

    Object.defineProperty(storeConfigServiceSpy, 'storeConfig', {
      value: mockConfigSignal.asReadonly(),
      configurable: true,
    });
    Object.defineProperty(storeConfigServiceSpy, 'storeName', {
      value: mockStoreNameSignal.asReadonly(),
      configurable: true,
    });
    Object.defineProperty(storeConfigServiceSpy, 'logoUrl', {
      value: mockLogoUrlSignal.asReadonly(),
      configurable: true,
    });
    Object.defineProperty(storeConfigServiceSpy, 'isFirstRun', {
      value: mockIsFirstRunSignal.asReadonly(),
      configurable: true,
    });
    Object.defineProperty(storeConfigServiceSpy, 'isLoading', {
      value: mockIsLoadingSignal.asReadonly(),
      configurable: true,
    });

    storeConfigServiceSpy.saveConfig.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [StoreConfig, ReactiveFormsModule, RouterTestingModule],
      providers: [
        { provide: StoreConfigService, useValue: storeConfigServiceSpy },
        { provide: StorageService, useValue: storageServiceSpy },
        { provide: SweetAlertService, useValue: sweetAlertSpy },
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StoreConfig);
    component = fixture.componentInstance;
    TestBed.flushEffects();
    fixture.detectChanges();
  });

  it('should initialize form with values from StoreConfigService', () => {
    expect(component.form.get('storeName')?.value).toBe('Test Store');
    expect(component.form.get('colors.primary')?.value).toBe('#ea580c');
    expect(component.form.get('payments.mercadoPagoPublicKey')?.value).toBe('TEST-PUBLIC-KEY');
    expect(component.form.get('contact.email')?.value).toBe('test@store.com');
  });

  it('should show error alert if form is invalid on submit', async () => {
    component.form.patchValue({ storeName: '' }); // Invalid
    await component.onSubmit();
    expect(sweetAlertSpy.error).toHaveBeenCalled();
    expect(storeConfigServiceSpy.saveConfig).not.toHaveBeenCalled();
  });

  it('should call saveConfig and show success alert on valid submit', async () => {
    component.form.markAsDirty();
    await component.onSubmit();
    expect(storeConfigServiceSpy.saveConfig).toHaveBeenCalled();
    expect(sweetAlertSpy.success).toHaveBeenCalled();
  });

  it('should handle successful favicon upload', () => {
    const file = new File([''], 'favicon.png', { type: 'image/png' });
    const event = {
      target: {
        files: [file],
      },
    } as unknown as Event;

    const mockUpload = {
      progress$: of(50, 100),
      downloadUrl$: of('http://example.com/new-favicon.png'),
    };
    storageServiceSpy.uploadFile.and.returnValue(
      mockUpload as unknown as ReturnType<StorageService['uploadFile']>,
    );

    component.onFaviconUpload(event);

    expect(storageServiceSpy.uploadFile).toHaveBeenCalledWith(file, jasmine.any(String));
    expect(component.form.get('faviconUrl')?.value).toBe('http://example.com/new-favicon.png');
    expect(component.form.get('faviconUrl')?.dirty).toBeTrue();
    expect(component.form.dirty).toBeTrue();
    expect(component.faviconUploading()).toBeFalse();
    expect(sweetAlertSpy.success).toHaveBeenCalled();
  });

  it('should handle failed favicon upload', () => {
    const file = new File([''], 'favicon.png', { type: 'image/png' });
    const event = {
      target: {
        files: [file],
      },
    } as unknown as Event;

    const mockUpload = {
      progress$: of(50),
      downloadUrl$: throwError(() => new Error('Upload error')),
    };
    storageServiceSpy.uploadFile.and.returnValue(
      mockUpload as unknown as ReturnType<StorageService['uploadFile']>,
    );

    component.onFaviconUpload(event);

    expect(component.faviconUploading()).toBeFalse();
    expect(sweetAlertSpy.error).toHaveBeenCalled();
  });

  it('should initialize form with defaults via effect when config is null', () => {
    mockConfigSignal.set(null);
    TestBed.flushEffects();
    expect(component.form.get('storeName')?.value).toBe('Mi Tienda');
  });

  it('should use fallback values via effect when config is empty or missing properties', () => {
    mockConfigSignal.set({} as StoreConfigModel);
    TestBed.flushEffects();
    expect(component.form.get('storeName')?.value).toBe('Mi Tienda');
    expect(component.form.get('colors.primary')?.value).toBe('#ea580c');
    expect(component.form.get('contact.phone')?.value).toBe('+54 11 1234-5678');
    expect(component.form.get('contact.email')?.value).toBe('contacto@mitienda.com');
  });

  it('should return early onFaviconUpload if no files are selected', () => {
    const event = {
      target: {
        files: [],
      },
    } as unknown as Event;

    storageServiceSpy.uploadFile.calls.reset();
    component.onFaviconUpload(event);
    expect(storageServiceSpy.uploadFile).not.toHaveBeenCalled();
  });

  it('should handle saveConfig error on submit', async () => {
    storeConfigServiceSpy.saveConfig.and.returnValue(Promise.reject(new Error('Save error')));
    component.form.markAsDirty();

    await component.onSubmit();

    expect(sweetAlertSpy.error).toHaveBeenCalledWith(
      'Error',
      'No se pudo guardar la configuración de la tienda.',
    );
    expect(component.isSubmitting()).toBeFalse();
  });

  describe('Branding and Favicon removal', () => {
    it('removeFavicon() should clear faviconUrl control and mark dirty', () => {
      component.form.patchValue({ faviconUrl: 'http://example.com/fav.ico' });
      component.removeFavicon();

      expect(component.form.get('faviconUrl')?.value).toBe('');
      expect(component.form.get('faviconUrl')?.dirty).toBeTrue();
      expect(component.form.dirty).toBeTrue();
    });

    it('onFaviconUpload() should show error alert when file type is invalid', () => {
      const file = new File(['hello'], 'document.txt', { type: 'text/plain' });
      const event = {
        target: {
          files: [file],
        },
      } as unknown as Event;

      component.onFaviconUpload(event);

      expect(sweetAlertSpy.error).toHaveBeenCalledWith(
        'Formato no válido',
        'Selecciona un archivo válido (.ico, .png, .svg, .jpg).',
      );
      expect(storageServiceSpy.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe('Brand Logo and Display Mode', () => {
    it('should initialize form with brandDisplayMode defaults', () => {
      expect(component.form.get('brandDisplayMode')?.value).toBe('text');
    });

    it('removeLogo() should clear logoUrl control and mark dirty', () => {
      component.form.patchValue({ logoUrl: 'http://example.com/logo.png' });
      component.removeLogo();

      expect(component.form.get('logoUrl')?.value).toBe('');
      expect(component.form.get('logoUrl')?.dirty).toBeTrue();
      expect(component.form.dirty).toBeTrue();
    });

    it('onLogoUpload() should return early if no file is selected', () => {
      const event = { target: { files: [] } } as unknown as Event;
      storageServiceSpy.uploadFile.calls.reset();
      component.onLogoUpload(event);
      expect(storageServiceSpy.uploadFile).not.toHaveBeenCalled();
    });

    it('onLogoUpload() should show error alert when file format is invalid', () => {
      const file = new File([''], 'doc.pdf', { type: 'application/pdf' });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onLogoUpload(event);

      expect(sweetAlertSpy.error).toHaveBeenCalledWith(
        'Formato no válido',
        'Selecciona una imagen válida (.png, .svg, .jpg, .webp).',
      );
      expect(storageServiceSpy.uploadFile).not.toHaveBeenCalled();
    });

    it('onLogoUpload() should handle successful logo upload to stores/{tenantId}/branding/logo.{ext}', () => {
      const file = new File(['image'], 'logo.webp', { type: 'image/webp' });
      const event = { target: { files: [file] } } as unknown as Event;

      const mockUpload = {
        progress$: of(50, 100),
        downloadUrl$: of('http://example.com/new-logo.webp'),
      };
      storageServiceSpy.uploadFile.and.returnValue(
        mockUpload as unknown as ReturnType<StorageService['uploadFile']>,
      );

      component.onLogoUpload(event);

      expect(storageServiceSpy.uploadFile).toHaveBeenCalledWith(
        file,
        jasmine.stringMatching(/stores\/.*\/branding\/logo\.webp/),
      );
      expect(component.form.get('logoUrl')?.value).toBe('http://example.com/new-logo.webp');
      expect(component.form.get('logoUrl')?.dirty).toBeTrue();
      expect(component.isUploadingLogo()).toBeFalse();
      expect(sweetAlertSpy.success).toHaveBeenCalledWith(
        'Logotipo subido',
        'El logotipo de marca fue cargado exitosamente.',
      );
    });

    it('onLogoUpload() should handle upload failure gracefully', () => {
      const file = new File(['image'], 'logo.png', { type: 'image/png' });
      const event = { target: { files: [file] } } as unknown as Event;

      const mockUpload = {
        progress$: of(10),
        downloadUrl$: throwError(() => new Error('Upload error')),
      };
      storageServiceSpy.uploadFile.and.returnValue(
        mockUpload as unknown as ReturnType<StorageService['uploadFile']>,
      );

      component.onLogoUpload(event);

      expect(component.isUploadingLogo()).toBeFalse();
      expect(sweetAlertSpy.error).toHaveBeenCalledWith(
        'Error de subida',
        'No se pudo cargar el logotipo de marca.',
      );
    });

    it('should populate form when config contains brandDisplayMode', () => {
      mockConfigSignal.set({
        ...mockConfig,
        brandDisplayMode: 'both',
      });

      TestBed.flushEffects();
      fixture.detectChanges();

      expect(component.form.get('brandDisplayMode')?.value).toBe('both');
    });
  });

  describe('Save button UI and interaction', () => {
    it('should render the save button in save-action-container with correct classes and initial text', () => {
      const container = fixture.debugElement.query(By.css('.save-action-container'));
      expect(container).toBeTruthy();

      const button = container.query(By.css('button.btn-save-primary'));
      expect(button).toBeTruthy();
      expect(button.nativeElement.classList.contains('ms-auto')).toBeFalse();
      expect(button.nativeElement.textContent).toContain('Guardar Identidad de Marca');

      const icon = button.query(By.css('i.bi-check2-circle'));
      expect(icon).toBeTruthy();
      expect(icon.nativeElement.classList.contains('d-none')).toBeFalse();
    });

    it('should be disabled when form is pristine', () => {
      const button = fixture.debugElement.query(By.css('.btn-save-primary'));
      expect(component.form.pristine).toBeTrue();
      expect(button.nativeElement.disabled).toBeTrue();
    });

    it('should be enabled when form is dirty and valid', () => {
      component.form.markAsDirty();
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.btn-save-primary'));
      expect(component.form.valid).toBeTrue();
      expect(button.nativeElement.disabled).toBeFalse();
    });

    it('should be disabled when form is invalid even if dirty', () => {
      component.form.patchValue({ storeName: '' });
      component.form.markAsDirty();
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.btn-save-primary'));
      expect(component.form.dirty).toBeTrue();
      expect(component.form.invalid).toBeTrue();
      expect(button.nativeElement.disabled).toBeTrue();
    });

    it('should show spinner and "Guardando..." when isSubmitting signal is true', () => {
      component.isSubmitting.set(true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.btn-save-primary'));
      expect(button.nativeElement.disabled).toBeTrue();
      expect(button.nativeElement.textContent).toContain('Guardando...');

      const spinner = button.query(By.css('.spinner-border'));
      expect(spinner).toBeTruthy();

      const icon = button.query(By.css('i.bi-check2-circle'));
      expect(icon.nativeElement.classList.contains('d-none')).toBeTrue();
    });
  });

  describe('Bank Transfer Discount Configuration', () => {
    it('should initialize discountPercentage control with 0 and min(0)/max(100) validators', () => {
      const ctrl = component.form.get('paymentMethods.bankTransfer.discountPercentage');
      expect(ctrl).toBeTruthy();
      expect(ctrl?.value).toBe(0);

      ctrl?.setValue(-5);
      expect(ctrl?.valid).toBeFalse();

      ctrl?.setValue(105);
      expect(ctrl?.valid).toBeFalse();

      ctrl?.setValue(10);
      expect(ctrl?.valid).toBeTrue();
    });

    it('should patch paymentMethods.bankTransfer.discountPercentage from StoreConfig', () => {
      mockConfigSignal.set({
        ...mockConfig,
        paymentMethods: {
          bankTransfer: {
            enabled: true,
            discountPercentage: 15,
            bankName: 'Banco Test',
            alias: 'test.alias',
          },
        },
      });
      TestBed.flushEffects();
      fixture.detectChanges();

      expect(component.form.get('paymentMethods.bankTransfer.enabled')?.value).toBeTrue();
      expect(component.form.get('paymentMethods.bankTransfer.discountPercentage')?.value).toBe(15);
      expect(component.form.get('paymentMethods.bankTransfer.bankName')?.value).toBe('Banco Test');
    });

    it('should focus discountInput when bank transfer switch is enabled', fakeAsync(() => {
      component.form.get('paymentMethods.bankTransfer.enabled')?.setValue(true);
      fixture.detectChanges();

      const inputEl = component.discountInput?.nativeElement;
      expect(inputEl).toBeTruthy();
      const focusSpy = spyOn(inputEl!, 'focus');

      component.onBankTransferToggle(true);
      tick(50);

      expect(focusSpy).toHaveBeenCalled();

      focusSpy.calls.reset();
      component.onBankTransferToggle(false);
      tick(50);
      expect(focusSpy).not.toHaveBeenCalled();
    }));

    it('should compute liveOgTitle, liveOgDescription, and liveOgImageUrl across custom and fallback branches', () => {
      component.form.patchValue({
        ogTitle: 'Título OG Personalizado',
        ogDescription: 'Descripción OG Personalizada',
        ogImageUrl: 'https://example.com/og.jpg',
      });
      expect(component.liveOgTitle()).toBe('Título OG Personalizado');
      expect(component.liveOgDescription()).toBe('Descripción OG Personalizada');
      expect(component.liveOgImageUrl()).toBe('https://example.com/og.jpg');

      component.form.patchValue({
        storeName: '   ',
        logoUrl: '',
        ogTitle: '',
        ogDescription: '',
        ogImageUrl: '',
        seo: { metaDescription: '' },
      });
      expect(component.liveOgTitle()).toBe('Mi Tienda Online');
      expect(component.liveOgDescription()).toContain('Visita nuestra tienda online oficial');
      expect(component.liveOgImageUrl()).toBe('');
    });
  });
});
