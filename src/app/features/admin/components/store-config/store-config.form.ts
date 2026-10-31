import type { FormBuilder, FormGroup } from '@angular/forms';
import { Validators } from '@angular/forms';
import { resolveTenantId } from '@core/utils/tenant';

export function createStoreConfigForm(fb: FormBuilder): FormGroup {
  return fb.group({
    tenantId: [''],
    storeId: [resolveTenantId()],
    storeName: ['', Validators.required],
    logoUrl: [''],
    faviconUrl: [''],
    brandDisplayMode: ['text'],
    colors: fb.group({
      primary: ['#ea580c', Validators.required],
      accent: ['#ef4444', Validators.required],
      background: ['#ffffff', Validators.required],
    }),
    payments: fb.group({ mercadoPagoPublicKey: [''] }),
    contact: fb.group({
      phone: [''],
      email: [''],
      whatsApp: [''],
      instagram: [''],
      facebook: [''],
    }),
    seo: fb.group({ metaDescription: [''] }),
    setupCompleted: [true],
    storeOwnerEmail: [''],
    notificationEmail: [''],
    emailSenderName: [''],
    emailSignature: [''],
    ogTitle: [''],
    ogDescription: [''],
    ogImageUrl: [''],
  });
}
