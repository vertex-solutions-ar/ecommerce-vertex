import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Header } from '@features/shop/components/shared/header/header';
import { Footer } from '@features/shop/components/shared/footer/footer';
import { StoreConfigService } from '@core/services/store-config.service';

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule, RouterModule, Header, Footer],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
})
export class Shop {
  private readonly storeConfigService = inject(StoreConfigService);
  readonly storeConfig = this.storeConfigService.storeConfig;

  readonly whatsAppUrl = computed(() => {
    const config = this.storeConfig();
    const floatingWhatsApp = config?.floatingWhatsApp;
    if (!floatingWhatsApp?.enabled) {
      return null;
    }

    const rawPhone = floatingWhatsApp.phoneNumber;
    if (!rawPhone?.trim()) {
      return null;
    }

    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      return null;
    }

    const defaultMsg = floatingWhatsApp.defaultMessage;
    if (defaultMsg?.trim()) {
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultMsg.trim())}`;
    }

    return `https://wa.me/${cleanPhone}`;
  });
}
