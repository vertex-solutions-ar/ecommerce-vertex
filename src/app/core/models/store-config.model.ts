export const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const TIME_SLOTS = [
  '07:00',
  '07:30',
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
  '22:30',
  '23:00',
];

export interface StorePickupLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  schedule: string; // Ej: "Lun a Vie: 09:00 a 13:00 / 16:30 a 20:30"
  notes?: string; // Ej: "Presentar DNI y número de pedido"
  enabled: boolean;
  days?: string[];
  timeFrom1?: string;
  timeTo1?: string;
  hasSplitSchedule?: boolean;
  timeFrom2?: string;
  timeTo2?: string;
}

export interface DeliveryMethodConfig {
  enableStorePickup: boolean;
  enableHomeDelivery: boolean;
  homeDeliveryDescription?: string; // Ej: "Coordinamos el envío y costo por WhatsApp"
  pickupLocations: StorePickupLocation[];
}

export const DEFAULT_DELIVERY_METHOD_CONFIG: DeliveryMethodConfig = {
  enableStorePickup: false,
  enableHomeDelivery: true,
  homeDeliveryDescription: 'Coordinamos el envío y costo por WhatsApp',
  pickupLocations: [],
};

export type HeaderFontPreset =
  | 'system'
  | 'inter'
  | 'montserrat'
  | 'poppins'
  | 'raleway'
  | 'playfair'
  | 'dancing-script'
  | 'bebas-neue'
  | 'cormorant'
  | 'cinzel'
  | 'tenor-sans'
  | 'quicksand'
  | 'comfortaa'
  | 'space-grotesk'
  | 'oswald';

export type HeaderShadowPreset = 'none' | 'border-bottom' | 'subtle' | 'medium' | 'floating';

export interface HeaderAppearanceConfig {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: HeaderFontPreset;
  shadowStyle: HeaderShadowPreset;
}

export interface StoreAppearanceConfig {
  header: HeaderAppearanceConfig;
}

export const DEFAULT_HEADER_APPEARANCE: HeaderAppearanceConfig = {
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  accentColor: '#000000',
  fontFamily: 'system',
  shadowStyle: 'subtle',
};

export const DEFAULT_STORE_APPEARANCE: StoreAppearanceConfig = {
  header: DEFAULT_HEADER_APPEARANCE,
};

export interface StoreConfig {
  readonly tenantId: string;
  storeId: string;
  storeName: string;
  tagline: string;
  logoUrl?: string;
  faviconUrl: string;
  brandDisplayMode?: 'text' | 'logo' | 'both';
  announcementBar?: {
    enabled: boolean;
    text: string;
    isMarquee?: boolean;
    link?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  floatingWhatsApp?: {
    enabled: boolean;
    phoneNumber?: string;
    defaultMessage?: string;
  };
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface?: string;
    text?: string;
  };
  payments: {
    mercadoPagoPublicKey: string;
    mercadoPago?: {
      publicKey?: string;
      accessTokenSecret?: string;
      accessTokenMasked?: string;
      accountEmail?: string;
      validationStatus?: string;
    };
  };
  contact: {
    phone: string;
    email: string;
    whatsApp: string;
    instagram: string;
    facebook: string;
  };
  seo: {
    metaDescription: string;
  };
  appearance?: StoreAppearanceConfig;
  setupCompleted: boolean;

  // Métodos de entrega
  deliveryMethods?: DeliveryMethodConfig;

  // Configuración de emails (editable desde /admin/store-config)
  storeOwnerEmail?: string;
  notificationEmail?: string;
  emailSenderName?: string;
  emailSignature?: string;

  // Redes Sociales & Open Graph (WhatsApp, Facebook, Twitter)
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;

  // Legacy compatibility fields
  contactPhone?: string;
  contactEmail?: string;
  socialInstagramUrl?: string;
  socialFacebookUrl?: string;
  socialWhatsAppUrl?: string;
  copyrightText?: string;
}

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  tenantId: 'white-label-store',
  storeId: 'white-label-store',
  storeName: 'Mi Tienda Online',
  tagline: 'Tu tienda de moda de marca blanca',
  logoUrl: '',
  faviconUrl: '',
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
    mercadoPagoPublicKey: '',
  },
  contact: {
    phone: '',
    email: '',
    whatsApp: '',
    instagram: '',
    facebook: '',
  },
  seo: {
    metaDescription: 'Bienvenido a nuestra tienda online.',
  },
  appearance: DEFAULT_STORE_APPEARANCE,
  setupCompleted: false,
  deliveryMethods: DEFAULT_DELIVERY_METHOD_CONFIG,
};
