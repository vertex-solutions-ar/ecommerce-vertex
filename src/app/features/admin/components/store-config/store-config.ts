import { Component, inject, signal, computed, DestroyRef, effect } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import type { FormGroup } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { StoreConfigService } from '@core/services/store-config.service';
import { StorageService } from '@core/services/storage.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { AuthService } from '@core/services/auth.service';
import type { StoreConfig as StoreConfigData } from '@core/models/store-config.model';
import { resolveTenantId } from '@core/utils/tenant';
import { RouterModule } from '@angular/router';
import { createStoreConfigForm } from './store-config.form';

@Component({
  selector: 'app-store-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './store-config.html',
  styleUrl: './store-config.scss',
})
export class StoreConfig {
  private fb = inject(FormBuilder);
  private storeConfigService = inject(StoreConfigService);
  private storageService = inject(StorageService);
  private sweetAlert = inject(SweetAlertService);
  private authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  readonly isOwner = toSignal(this.authService.isOwner$, { initialValue: false });
  readonly isLoading = this.storeConfigService.isLoading;
  isSubmitting = signal(false);

  faviconProgress = signal<number>(0);
  faviconUploading = signal<boolean>(false);

  logoUploadProgress = signal<number>(0);
  isUploadingLogo = signal<boolean>(false);

  form: FormGroup = createStoreConfigForm(this.fb);

  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  readonly liveStoreName = computed(() => this.formValue()?.storeName ?? 'Mi Tienda');
  readonly liveLogoUrl = computed(() => this.formValue()?.logoUrl ?? '');
  readonly liveBrandDisplayMode = computed(() => this.formValue()?.brandDisplayMode ?? 'text');
  readonly liveOgTitle = computed(() => {
    const val = this.formValue();
    const title = val?.ogTitle?.trim();
    if (title) {
      return title;
    }
    const store = this.liveStoreName()?.trim();
    if (store) {
      return store;
    }
    return 'Mi Tienda Online';
  });
  readonly liveOgDescription = computed(() => {
    const val = this.formValue();
    const desc = val?.ogDescription?.trim();
    if (desc) {
      return desc;
    }
    const metaDesc = val?.seo?.metaDescription?.trim();
    if (metaDesc) {
      return metaDesc;
    }
    return 'Visita nuestra tienda online oficial con los mejores productos y ofertas.';
  });
  readonly liveOgImageUrl = computed(() => {
    const val = this.formValue();
    const ogImg = val?.ogImageUrl?.trim();
    if (ogImg) {
      return ogImg;
    }
    return this.liveLogoUrl()?.trim() ?? '';
  });

  removeFavicon(): void {
    this.form.patchValue({ faviconUrl: '' });
    this.form.get('faviconUrl')?.markAsDirty();
    this.form.markAsDirty();
  }

  removeLogo(): void {
    this.form.patchValue({ logoUrl: '' });
    this.form.get('logoUrl')?.markAsDirty();
    this.form.markAsDirty();
  }

  constructor() {
    effect(() => {
      this.populateFormFromConfig(this.storeConfigService.storeConfig());
    });
  }

  private populateFormFromConfig(cfg: StoreConfigData | null): void {
    const currentTenant = resolveTenantId();

    this.patchGeneralSettings(cfg, currentTenant);
    this.patchBrandingAndSocial(cfg);
  }

  private patchGeneralSettings(cfg: StoreConfigData | null, currentTenant: string): void {
    this.form.patchValue({
      tenantId: cfg?.tenantId ?? currentTenant,
      storeId: cfg?.storeId ?? currentTenant,
      storeName: cfg?.storeName ?? 'Mi Tienda',
      setupCompleted: cfg?.setupCompleted ?? true,
      storeOwnerEmail: cfg?.storeOwnerEmail ?? '',
      notificationEmail: cfg?.notificationEmail ?? '',
      emailSenderName: cfg?.emailSenderName ?? '',
      emailSignature: cfg?.emailSignature ?? '',
      seo: { metaDescription: cfg?.seo?.metaDescription ?? 'Bienvenidos a mi tienda virtual.' },
      ogTitle: cfg?.ogTitle ?? '',
      ogDescription: cfg?.ogDescription ?? '',
      ogImageUrl: cfg?.ogImageUrl ?? '',
    });
  }

  private patchBrandingAndSocial(cfg: StoreConfigData | null): void {
    this.patchBrandingAndColors(cfg);
    this.patchContactInfo(cfg);
  }

  private patchBrandingAndColors(cfg: StoreConfigData | null): void {
    this.form.patchValue({
      logoUrl: cfg?.logoUrl ?? '',
      faviconUrl: cfg?.faviconUrl ?? '',
      brandDisplayMode: cfg?.brandDisplayMode ?? 'text',
      colors: {
        primary: cfg?.colors?.primary ?? '#ea580c',
        accent: cfg?.colors?.accent ?? '#ef4444',
        background: cfg?.colors?.background ?? '#ffffff',
      },
      payments: { mercadoPagoPublicKey: cfg?.payments?.mercadoPagoPublicKey ?? '' },
    });
  }

  private patchContactInfo(cfg: StoreConfigData | null): void {
    this.form.patchValue({
      contact: {
        phone: cfg?.contact?.phone ?? '+54 11 1234-5678',
        email: cfg?.contact?.email ?? 'contacto@mitienda.com',
        whatsApp: cfg?.contact?.whatsApp ?? '',
        instagram: cfg?.contact?.instagram ?? '',
        facebook: cfg?.contact?.facebook ?? '',
      },
    });
  }

  onFaviconUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }
    const file = input.files[0];
    const allowed = [
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/png',
      'image/svg+xml',
      'image/jpeg',
    ];
    if (!allowed.includes(file.type) && !file.name.endsWith('.ico')) {
      this.sweetAlert.error(
        'Formato no válido',
        'Selecciona un archivo válido (.ico, .png, .svg, .jpg).',
      );
      return;
    }

    const storeId = resolveTenantId() ?? 'store';
    this.faviconUploading.set(true);
    this.faviconProgress.set(0);

    const upload = this.storageService.uploadFile(file, `tenants/${storeId}/branding/favicon`);
    upload.progress$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.faviconProgress.set(Math.round(p)));
    upload.downloadUrl$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (url) => {
        this.form.patchValue({ faviconUrl: url });
        this.form.get('faviconUrl')?.markAsDirty();
        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          link.type = 'image/x-icon';
          document.head.appendChild(link);
        }
        link.href = url;
        this.faviconUploading.set(false);
        this.sweetAlert.success(
          'Favicon subido',
          'El favicon corporativo fue cargado exitosamente.',
        );
      },
      error: () => {
        this.faviconUploading.set(false);
        this.sweetAlert.error('Error de subida', 'No se pudo cargar el favicon.');
      },
    });
  }

  onLogoUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }
    const file = input.files[0];
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.sweetAlert.error(
        'Formato no válido',
        'Selecciona una imagen válida (.png, .svg, .jpg, .webp).',
      );
      return;
    }

    const storeId = resolveTenantId() ?? 'store';
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    this.isUploadingLogo.set(true);
    this.logoUploadProgress.set(0);

    const upload = this.storageService.uploadFile(file, `stores/${storeId}/branding/logo.${ext}`);
    upload.progress$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.logoUploadProgress.set(Math.round(p)));
    upload.downloadUrl$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (url) => {
        this.form.patchValue({ logoUrl: url });
        this.form.get('logoUrl')?.markAsDirty();
        this.form.markAsDirty();
        this.isUploadingLogo.set(false);
        this.sweetAlert.success(
          'Logotipo subido',
          'El logotipo de marca fue cargado exitosamente.',
        );
      },
      error: () => {
        this.isUploadingLogo.set(false);
        this.sweetAlert.error('Error de subida', 'No se pudo cargar el logotipo de marca.');
      },
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.sweetAlert.error('Formulario inválido', 'Revisá los campos obligatorios.');
      return;
    }
    this.isSubmitting.set(true);
    try {
      const currentConfig = this.storeConfigService.storeConfig() ?? ({} as StoreConfigData);
      const updatedConfig: StoreConfigData = {
        ...currentConfig,
        ...(this.form.getRawValue() as Record<string, unknown>),
      } as StoreConfigData;

      await this.storeConfigService.saveConfig(updatedConfig);
      await this.storeConfigService.loadConfig();
      this.form.markAsPristine();
      this.sweetAlert.success('¡Listo!', 'La configuración fue guardada con éxito.');
    } catch (err) {
      console.error('Error al guardar la configuración:', err);
      this.sweetAlert.error('Error', 'No se pudo guardar la configuración de la tienda.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
