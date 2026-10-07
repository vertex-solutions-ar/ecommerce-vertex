import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Firestore, collection, addDoc, setDoc, doc } from '@angular/fire/firestore';
import type { StoreConfig } from '@core/models/store-config.model';
import { DEFAULT_STORE_CONFIG } from '@core/models/store-config.model';
import { StoreConfigService } from './store-config.service';
import { tenantPath, storeDocId, resolveTenantId } from '@core/utils/tenant';

// ─── Image helpers ────────────────────────────────────────────────────────────

/** Unsplash CDN – specific fashion photo by ID */
function u(id: string, w: number, h: number): string {
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80&auto=format`;
}

// ─── Photo IDs ────────────────────────────────────────────────────────────────

// Hero banners (1920×700)
const HERO = [
  '1558769132-cb1aea458c5e',
  '1483985988355-763728e1935b',
  '1469334031218-e382a71b716b',
  '1445205170230-053b83016050',
  '1490481651871-ab68de25d43d',
];

// Categories (400×400)
const CAT: Record<string, string> = {
  remeras: '1521572163474-6864f9cf17ab',
  pantalones: '1542272604-787c3835535d',
  zapatillas: '1542291026-7eec264c27ff',
  accesorios: '1511499767150-a48a237f0083',
  camperas: '1551028719-00167b16eac5',
};

// Featured categories (600×400)
const FEAT: Record<string, string> = {
  remeras: '1521572163474-6864f9cf17ab',
  zapatillas: '1491553895911-0055eca6402d',
  camperas: '1551537482-f2075a1d41f2',
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SeedContentService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private storeConfigService = inject(StoreConfigService);

  run<T>(fn: () => Promise<T>): Promise<T> {
    return runInInjectionContext(this.injector, fn);
  }

  async seedAttributes(): Promise<void> {
    const list: { name: string; values: string[] }[] = [
      { name: 'Talle (ropa)', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
      { name: 'Talle (calzado)', values: ['36', '37', '38', '39', '40', '41', '42', '43', '44'] },
      { name: 'Talle (pantalón)', values: ['28', '30', '32', '34', '36', '38'] },
      {
        name: 'Color',
        values: [
          'Negro',
          'Blanco',
          'Gris',
          'Azul',
          'Rojo',
          'Verde',
          'Beige',
          'Marrón',
          'Rosa',
          'Caqui',
        ],
      },
      { name: 'Material', values: ['Algodón', 'Poliéster', 'Lino', 'Cuero', 'Denim', 'Lana'] },
    ];
    for (const a of list) {
      await this.run(() =>
        addDoc(collection(this.firestore, tenantPath('attributes')), {
          ...a,
          storeId: resolveTenantId(),
        }),
      );
    }
  }

  async seedCategories(): Promise<Record<string, { id: string; name: string }>> {
    const defs = [
      { slug: 'remeras', name: 'Remeras', attrs: ['talle', 'color'] },
      { slug: 'pantalones', name: 'Pantalones', attrs: ['talle', 'color'] },
      { slug: 'zapatillas', name: 'Zapatillas', attrs: ['talle', 'color'] },
      { slug: 'accesorios', name: 'Accesorios', attrs: ['color'] },
      { slug: 'camperas', name: 'Camperas', attrs: ['talle', 'color'] },
    ];
    const out: Record<string, { id: string; name: string }> = {};
    for (const d of defs) {
      const ref = await this.run(() =>
        addDoc(collection(this.firestore, tenantPath('categories')), {
          name: d.name,
          slug: d.slug,
          parentId: null,
          filterableAttributes: d.attrs,
          imageUrl: u(CAT[d.slug], 400, 400),
          isFeatured: ['remeras', 'camperas', 'zapatillas'].includes(d.slug),
          storeId: resolveTenantId(),
          createdAt: new Date(),
        }),
      );
      out[d.slug] = { id: ref.id, name: d.name };
    }
    return out;
  }

  async seedHeroBanner(cats: Record<string, { id: string; name: string }>): Promise<void> {
    await this.run(() =>
      setDoc(doc(this.firestore, tenantPath('banners'), storeDocId('home')), {
        storeId: resolveTenantId(),
        heroImages: HERO.map((id) => ({ imageUrl: u(id, 1920, 700) })),
        carouselSettings: { interval: 4500, showIndicators: true },
        title: 'Nueva Colección 2026',
        buttonText: 'Explorar todo',
        buttonLink: '/catalog',
        featuredCategories: [
          {
            categoryId: cats['remeras']?.id ?? '',
            name: 'Remeras',
            slug: 'remeras',
            imageUrl: u(FEAT['remeras'], 600, 400),
          },
          {
            categoryId: cats['camperas']?.id ?? '',
            name: 'Camperas',
            slug: 'camperas',
            imageUrl: u(FEAT['camperas'], 600, 400),
          },
          {
            categoryId: cats['zapatillas']?.id ?? '',
            name: 'Zapatillas',
            slug: 'zapatillas',
            imageUrl: u(FEAT['zapatillas'], 600, 400),
          },
        ],
        lastUpdated: new Date(),
      }),
    );
  }

  async seedAboutUs(): Promise<void> {
    const storeName = this.storeConfigService.storeName() || 'Nuestra Tienda';
    await this.run(() =>
      setDoc(doc(this.firestore, tenantPath('pages'), storeDocId('aboutUs')), {
        storeId: resolveTenantId(),
        bannerTitle: 'Quiénes Somos',
        bannerSubtitle: 'Moda argentina con identidad propia y alcance nacional.',
        bannerImageUrl: u('1558769132-cb1aea458c5e', 1920, 600),
        centralTitle: 'Nuestra Historia',
        centralImageUrl: u('1483985988355-763728e1935b', 800, 600),
        centralDescription:
          `${storeName} nació con un objetivo claro: ` +
          'democratizar la moda de calidad. Trabajamos exclusivamente con proveedores certificados, ' +
          'materiales de primera línea y diseños propios que reflejan la identidad urbana argentina.\n\n' +
          'Hoy somos un gran equipo, despachamos a todo el país y contamos con miles de ' +
          'clientes activos que nos eligen por la calidad, el servicio y los precios justos.',
        cardsSectionTitle: '¿Por qué elegirnos?',
        featureCards: [
          {
            icon: 'patch-check',
            title: 'Calidad sin compromiso',
            content:
              'Cada prenda pasa por tres etapas de control de calidad antes de llegar a tus manos. Solo trabajamos con materiales de primera línea y proveedores certificados.',
          },
          {
            icon: 'truck',
            title: 'Envíos en 24-72 hs',
            content:
              'Despachamos a cualquier punto de Argentina en 24 a 72 horas hábiles con seguimiento en tiempo real. Envío sin costo en compras superiores a $30.000.',
          },
          {
            icon: 'arrow-counterclockwise',
            title: 'Cambios sin burocracia',
            content:
              'Si el talle no es el correcto o algo no te convenció, gestionamos el cambio o devolución en menos de 48 horas sin preguntas ni costos adicionales.',
          },
        ],
      }),
    );
  }

  async seedFooter(overrideStoreName?: string): Promise<void> {
    const storeName = overrideStoreName ?? (this.storeConfigService.storeName() || 'Mi Tienda');
    const email = 'contacto@mitiendaonline.com';
    const payload: StoreConfig = {
      ...DEFAULT_STORE_CONFIG,
      tenantId: resolveTenantId(),
      storeId: resolveTenantId(),
      storeName,
      tagline: 'Tu tienda de moda de marca blanca',
      colors: {
        primary: '#ea580c',
        accent: '#ef4444',
        background: '#ffffff',
      },
      payments: {
        mercadoPagoPublicKey: 'TEST-YOUR_PUBLIC_KEY',
      },
      contact: {
        phone: '+54 11 4567-8900',
        email,
        whatsApp: 'https://wa.me/5491145678900',
        instagram: 'https://instagram.com/mitiendaonline',
        facebook: 'https://facebook.com/mitiendaonline',
      },
      seo: {
        metaDescription: 'Bienvenido a nuestra tienda online de marca blanca.',
      },
      setupCompleted: true,

      // Mapeo legacy para mantener compatibilidad
      contactPhone: '+54 11 4567-8900',
      contactEmail: email,
      socialInstagramUrl: 'https://instagram.com/mitiendaonline',
      socialFacebookUrl: 'https://facebook.com/mitiendaonline',
      socialWhatsAppUrl: 'https://wa.me/5491145678900',
      copyrightText: `${storeName}. Todos los derechos reservados.`,
    };
    await this.run(() =>
      setDoc(doc(this.firestore, tenantPath('configuracion'), storeDocId('store')), payload),
    );
  }
}
