export interface FeaturedCategory {
  categoryId: string;
  name: string;
  slug: string;
  imageUrl: string;
}

export interface CarouselSettings {
  interval: number;
  showIndicators: boolean;
}

export interface HeroImage {
  imageUrl: string;
  linkType?: 'product' | 'category' | 'none';
  linkId?: string;
}

export interface FeaturedProductsSection {
  enabled: boolean;
  title: string;
  productIds: string[];
}

export interface HomeContent {
  id?: string;
  imageUrl?: string;
  heroImages?: HeroImage[];
  carouselSettings?: CarouselSettings;
  title?: string;
  buttonText?: string;
  buttonLink?: string;
  featuredCategories?: FeaturedCategory[];
  featuredProducts?: FeaturedProductsSection;
  lastUpdated?: Date;
  storeId?: string;
}

export interface HeroBanner extends HomeContent {}
