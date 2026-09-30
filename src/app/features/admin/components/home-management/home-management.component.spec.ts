import type { ComponentFixture } from '@angular/core/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { HomeManagement } from './home-management';
import { HomeContentService } from '@core/services/home-content.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { CategoryService } from '@core/services/category.service';
import { ProductService } from '@core/services/product.service';
import { StorageService } from '@core/services/storage.service';
import { HeroImageUploaderService } from './hero-image-uploader.service';
import type { HeroBanner } from '@core/models/home-content.model';
import type { Category } from '@core/models/category.model';
import type { Product } from '@core/models/product.model';

describe('HomeManagement', () => {
  let component: HomeManagement;
  let fixture: ComponentFixture<HomeManagement>;
  let homeContentServiceSpy: jasmine.SpyObj<HomeContentService>;
  let sweetAlertServiceSpy: jasmine.SpyObj<SweetAlertService>;
  let categoryServiceSpy: jasmine.SpyObj<CategoryService>;
  let productServiceSpy: jasmine.SpyObj<ProductService>;
  let heroUploaderSpy: jasmine.SpyObj<HeroImageUploaderService>;
  let storageServiceSpy: jasmine.SpyObj<StorageService>;

  const mockCategories: Category[] = [{ id: 'cat-1', name: 'Ropa', slug: 'ropa' } as Category];

  const mockProducts: Product[] = [{ id: 'prod-1', name: 'Remera Azul', price: 1000 } as Product];

  const mockBanner: HeroBanner = {
    heroImages: [{ imageUrl: 'https://example.com/hero1.jpg', linkType: 'none' }],
    carouselSettings: { interval: 5000, showIndicators: true },
    featuredCategories: [
      { categoryId: 'cat-1', name: 'Ropa', slug: 'ropa', imageUrl: 'https://example.com/cat.jpg' },
    ],
    featuredProducts: {
      enabled: true,
      title: 'Destacados Especiales',
      productIds: ['prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5'],
    },
  };

  beforeEach(async () => {
    homeContentServiceSpy = jasmine.createSpyObj('HomeContentService', [
      'getHeroBanner',
      'saveHomePageContent',
    ]);
    sweetAlertServiceSpy = jasmine.createSpyObj('SweetAlertService', ['error', 'success']);
    categoryServiceSpy = jasmine.createSpyObj('CategoryService', ['getCategories']);
    productServiceSpy = jasmine.createSpyObj('ProductService', ['getProducts']);
    heroUploaderSpy = jasmine.createSpyObj('HeroImageUploaderService', ['processFiles']);
    storageServiceSpy = jasmine.createSpyObj('StorageService', ['uploadFile']);

    homeContentServiceSpy.getHeroBanner.and.returnValue(of(mockBanner));
    categoryServiceSpy.getCategories.and.returnValue(of(mockCategories));
    productServiceSpy.getProducts.and.returnValue(of(mockProducts));

    await TestBed.configureTestingModule({
      imports: [HomeManagement, ReactiveFormsModule],
      providers: [
        { provide: HomeContentService, useValue: homeContentServiceSpy },
        { provide: SweetAlertService, useValue: sweetAlertServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        { provide: ProductService, useValue: productServiceSpy },
        { provide: HeroImageUploaderService, useValue: heroUploaderSpy },
        { provide: StorageService, useValue: storageServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create home management component and load initial data', () => {
    expect(component).toBeTruthy();
    expect(component.isLoading()).toBeFalse();
    expect(component.heroImages.length).toBe(1);
    expect(component.featuredCategories.length).toBe(1);
    expect(component.featuredProductsGroup.value.enabled).toBeTrue();
    expect(component.featuredProductsGroup.value.title).toBe('Destacados Especiales');
    expect(component.featuredProductsGroup.value.productIds.length).toBe(5);
  });

  it('should handle drag and drop events', () => {
    const dragEvent = {
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
      dataTransfer: { files: [] },
    } as unknown as DragEvent;

    component.onDragOver(dragEvent);
    expect(component.isDragOver).toBeTrue();

    component.onDragLeave();
    expect(component.isDragOver).toBeFalse();

    component.onDrop(dragEvent);
    expect(component.isDragOver).toBeFalse();
  });

  it('should add and remove featured categories (max 3)', () => {
    expect(component.featuredCategories.length).toBe(1);

    component.addFeaturedCategory();
    component.addFeaturedCategory();
    component.addFeaturedCategory();

    expect(component.featuredCategories.length).toBe(3);

    component.removeFeaturedCategory(0);
    expect(component.featuredCategories.length).toBe(2);
  });

  it('should handle category selection change', () => {
    component.onCategorySelectionChange(0, {
      target: { value: 'cat-1' },
    } as unknown as Event);

    const fg = component.featuredCategories.at(0);
    expect(fg.get('name')?.value).toBe('Ropa');
    expect(fg.get('slug')?.value).toBe('ropa');
  });

  it('should move hero images up and down', () => {
    component.heroImages = [
      { imageUrl: 'img1.jpg', linkType: 'none' },
      { imageUrl: 'img2.jpg', linkType: 'none' },
    ];
    component.heroImagePreviews = ['img1.jpg', 'img2.jpg'];
    component.selectedHeroFiles = [];

    component.moveHeroImageDown(0);
    expect(component.heroImages[0].imageUrl).toBe('img2.jpg');

    component.moveHeroImageUp(1);
    expect(component.heroImages[0].imageUrl).toBe('img1.jpg');
  });

  it('should remove hero image by index', () => {
    component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];
    component.heroImagePreviews = ['img1.jpg'];
    component.selectedHeroFiles = [];

    component.removeHeroImage(0);
    expect(component.heroImages.length).toBe(0);
  });

  it('should open and close link modal and update link properties', () => {
    component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];
    component.openLinkModal(0);

    expect(component.isLinkModalVisible).toBeTrue();
    expect(component.activeHeroIndex).toBe(0);

    component.updateLinkType('product');
    expect(component.heroImages[0].linkType).toBe('product');

    component.updateLinkId('prod-1');
    expect(component.heroImages[0].linkId).toBe('prod-1');

    component.onProductSearch('Remera');

    component.closeLinkModal();
    expect(component.isLinkModalVisible).toBeFalse();
  });

  it('should show error on submit if no hero images provided', fakeAsync(() => {
    component.heroImages = [];
    void component.onSubmit();
    tick();

    expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
      'Imágenes requeridas',
      jasmine.any(String),
    );
  }));

  it('should save home page content successfully', fakeAsync(() => {
    homeContentServiceSpy.saveHomePageContent.and.returnValue(Promise.resolve());
    component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];

    void component.onSubmit();
    tick();

    expect(homeContentServiceSpy.saveHomePageContent).toHaveBeenCalled();
    expect(sweetAlertServiceSpy.success).toHaveBeenCalled();
  }));

  it('should handle error when saveHomePageContent fails', fakeAsync(() => {
    homeContentServiceSpy.saveHomePageContent.and.returnValue(
      Promise.reject(new Error('Save error')),
    );
    component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];

    void component.onSubmit();
    tick();

    expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith('Error', jasmine.any(String));
  }));

  describe('featured products section validation', () => {
    it('should show error on submit if featured products enabled with fewer than 5 products', fakeAsync(() => {
      component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];
      component.featuredProductsGroup.patchValue({
        enabled: true,
        title: 'Destacados',
        productIds: ['prod-1', 'prod-2'],
      });
      component.featuredProductsGroup.updateValueAndValidity();

      void component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Productos insuficientes',
        jasmine.any(String),
      );
      expect(homeContentServiceSpy.saveHomePageContent).not.toHaveBeenCalled();
    }));

    it('should show error on submit if featured products enabled with more than 15 products', fakeAsync(() => {
      component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];
      const sixteenProducts = Array.from({ length: 16 }, (_, i) => `prod-${i}`);
      component.featuredProductsGroup.patchValue({
        enabled: true,
        title: 'Destacados',
        productIds: sixteenProducts,
      });
      component.featuredProductsGroup.updateValueAndValidity();

      void component.onSubmit();
      tick();

      expect(sweetAlertServiceSpy.error).toHaveBeenCalledWith(
        'Límite de productos excedido',
        jasmine.any(String),
      );
      expect(homeContentServiceSpy.saveHomePageContent).not.toHaveBeenCalled();
    }));

    it('should allow submit when featured products is disabled even if productIds is empty', fakeAsync(() => {
      homeContentServiceSpy.saveHomePageContent.and.returnValue(Promise.resolve());
      component.heroImages = [{ imageUrl: 'img1.jpg', linkType: 'none' }];
      component.featuredProductsGroup.patchValue({
        enabled: false,
        title: '',
        productIds: [],
      });
      component.featuredProductsGroup.updateValueAndValidity();

      void component.onSubmit();
      tick();

      expect(homeContentServiceSpy.saveHomePageContent).toHaveBeenCalled();
      expect(sweetAlertServiceSpy.success).toHaveBeenCalled();
    }));
  });
});
