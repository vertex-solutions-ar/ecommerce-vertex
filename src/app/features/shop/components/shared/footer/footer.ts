import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { StoreConfigService } from '@core/services/store-config.service';
import { FooterService } from '@core/services/footer.service';
import {
  normalizeInstagramUrl,
  normalizeFacebookUrl,
  normalizeWhatsAppUrl,
} from '@core/utils/url.utils';
import { version as pkgVersion } from '../../../../../../../package.json';

function getCoalesced(...values: (string | undefined)[]): string {
  for (const v of values) {
    if (v !== undefined && v !== null && v.trim() !== '') {
      return v.trim();
    }
  }
  return '';
}

@Component({
  selector: 'app-shop-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  currentYear = new Date().getFullYear();

  /** Versión del template horneada en el bundle (verificación visual del deploy). */
  readonly storeVersion = `v${pkgVersion}`;

  private storeConfig = inject(StoreConfigService);
  private footerService = inject(FooterService);

  private readonly footerData = toSignal(this.footerService.getFooterData());

  /** Reactive signal exposing the raw FooterData or undefined */
  readonly footer = this.footerData;

  readonly viewData = computed(() => {
    const config = this.storeConfig.storeConfig();
    const footer = this.footerData();
    const contact = config?.contact;
    const storeNameVal = (config?.storeName ?? '').trim();
    const defaultCopyright = storeNameVal
      ? `${storeNameVal}. Todos los derechos reservados.`
      : 'Todos los derechos reservados.';

    const rawInstagram = getCoalesced(
      footer?.socialInstagramUrl,
      config?.socialInstagramUrl,
      contact?.instagram,
    );
    const rawFacebook = getCoalesced(
      footer?.socialFacebookUrl,
      config?.socialFacebookUrl,
      contact?.facebook,
    );
    const rawWhatsApp = getCoalesced(
      footer?.socialWhatsAppUrl,
      config?.socialWhatsAppUrl,
      contact?.whatsApp,
    );

    return {
      contactPhone: getCoalesced(
        footer?.contactPhone,
        config?.contactPhone,
        contact?.phone,
        contact?.whatsApp,
      ),
      contactEmail: getCoalesced(footer?.contactEmail, config?.contactEmail, contact?.email),
      socialInstagramUrl: normalizeInstagramUrl(rawInstagram),
      socialFacebookUrl: normalizeFacebookUrl(rawFacebook),
      socialWhatsAppUrl: normalizeWhatsAppUrl(rawWhatsApp),
      copyrightText: getCoalesced(footer?.copyrightText, config?.copyrightText, defaultCopyright),
    };
  });

  readonly cleanCopyrightText = computed(() => {
    const rawText = this.viewData().copyrightText;
    const cleaned = rawText
      .replace(
        /^(?:(?:©|&copy;|\(c\)|@|copyright)\s*|\d{4}(?:\s*[-–—]\s*\d{4})?\s*[-–—]?\s*)+/i,
        '',
      )
      .trim();

    if (cleaned) {
      return cleaned;
    }

    const storeNameVal = (this.storeConfig.storeConfig()?.storeName ?? '').trim();
    return storeNameVal
      ? `${storeNameVal}. Todos los derechos reservados.`
      : 'Todos los derechos reservados.';
  });
}
