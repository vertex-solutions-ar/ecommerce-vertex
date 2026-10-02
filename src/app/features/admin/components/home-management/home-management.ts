import type { OnInit } from '@angular/core';
import { Component, inject, ChangeDetectorRef, DestroyRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  AbstractControl,
  FormArray,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, take } from 'rxjs/operators';
import { BehaviorSubject, combineLatest } from 'rxjs';
import type { Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { StorageService } from '@core/services/storage.service';
import { HomeContentService } from '@core/services/home-content.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { patchAndMarkDirty } from '@core/utils/form.util';
import { CategoryService } from '@core/services/category.service';
import { ProductService } from '@core/services/product.service';
import { HeroLinkModal } from './components/hero-link-modal/hero-link-modal';
import { FeaturedCategories } from './components/featured-categories/featured-categories';
import { FeaturedProducts } from './components/featured-products/featured-products';
import type {
  CarouselSettings,
  FeaturedCategory,
  HeroBanner,
  HeroImage,
} from '@core/models/home-content.model';
import type { Category } from '@core/models/category.model';
import type { Product } from '@core/models/product.model';
import { HeroImageUploaderService, MAX_HERO_IMAGES } from './hero-image-uploader.service';

export const featuredProductsSectionValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const enabled = control.get('enabled')?.value;
  if (!enabled) {
    return null;
  }
  const title = control.get('title')?.value;
  if (!title || !String(title).trim()) {
    return { requiredTitle: true };
  }
  const productIds = control.get('productIds')?.value as string[] | undefined;
  const count = productIds?.length ?? 0;
  if (count < 5) {
    return { minProducts: { required: 5, actual: count } };
  }
  if (count > 15) {
    return { maxProducts: { required: 15, actual: count } };
  }
  return null;
};

@Component({
  selector: 'app-home-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HeroLinkModal, FeaturedCategories, FeaturedProducts],
  templateUrl: './home-management.html',
  styleUrl: './home-management.scss',
})
export class HomeManagement implements OnInit {
  private fb = inject(FormBuilder);
  private homeContentService = inject(HomeContentService);
  private sweetAlertService = inject(SweetAlertService);
  private categoryService = inject(CategoryService);
  private productService = inject(ProductService);
  private heroUploader = inject(HeroImageUploaderService);
  private cdr = inject(ChangeDetectorRef);
  private storageService = inject(StorageService);
  private destroyRef = inject(DestroyRef);

  bannerForm!: FormGroup;
  isSubmitting = false;
  readonly isLoading = signal(true);
  categories$!: Observable<Category[]>;
  products$!: Observable<Product[]>;
  productSearchTerm$ = new BehaviorSubject<string>('');
  filteredProducts$!: Observable<Product[]>;

  heroImages: HeroImage[] = [];
  selectedHeroFiles: File[] = [];
  heroImagePreviews: string[] = [];
  isDragOver = false;
  carouselSettings: CarouselSettings = { interval: 4000, showIndicators: true };
  selectedCategoryFiles: (File | null)[] = [];
  categoryPreviewUrls: (string | null)[] = [];
  heroUploadProgress = new Map<string, number>();

  get isAnyHeroUploading(): boolean {
    return this.heroUploadProgress.size > 0;
  }
  isLinkModalVisible = false;
  activeHeroIndex = -1;

  private categoryMap = new Map<string, { name: string; slug: string }>();
  private readonly MAX_HERO = MAX_HERO_IMAGES;

  ngOnInit(): void {
    this.initializeForm();
    this.categories$ = this.categoryService.getCategories().pipe(
      take(1),
      map((categories: Category[]) => {
        this.categoryMap.clear();
        categories.forEach((cat) =>
          this.categoryMap.set(cat.id!, { name: cat.name, slug: cat.slug }),
        );
        return categories;
      }),
    );
    this.products$ = this.productService.getProducts();
    this.filteredProducts$ = combineLatest([this.products$, this.productSearchTerm$]).pipe(
      map(([products, term]) =>
        !term
          ? products
          : products.filter((p) => p.name.toLowerCase().includes(term.toLowerCase())),
      ),
    );
    this.loadContentData();
  }

  private initializeForm(): void {
    this.bannerForm = this.fb.group({
      carouselSettings: this.fb.group({
        interval: [4000, [Validators.required, Validators.min(1000)]],
        showIndicators: [true],
      }),
      featuredCategories: this.fb.array([]),
      featuredProducts: this.fb.group(
        {
          enabled: [false],
          title: ['Destacados'],
          productIds: [[] as string[]],
        },
        { validators: [featuredProductsSectionValidator] },
      ),
    });

    this.bannerForm
      .get('featuredProducts.enabled')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((enabled) => {
        const titleControl = this.featuredProductsGroup.get('title');
        if (enabled) {
          titleControl?.setValidators([Validators.required]);
        } else {
          titleControl?.clearValidators();
        }
        titleControl?.updateValueAndValidity();
        this.featuredProductsGroup.updateValueAndValidity();
        this.bannerForm.markAsDirty();
        this.cdr.markForCheck();
      });
  }

  private loadContentData(): void {
    this.homeContentService
      .getHeroBanner()
      .pipe(take(1))
      .subscribe({
        next: (content) => {
          this.isLoading.set(false);
          if (!content) {
            return;
          }
          if (content.heroImages?.length) {
            this.heroImages = content.heroImages.map((img: string | HeroImage) =>
              typeof img === 'string' ? { imageUrl: img, linkType: 'none' } : img,
            );
            this.heroImagePreviews = this.heroImages.map((h) => h.imageUrl);
            this.selectedHeroFiles = [];
          }
          if (content.carouselSettings) {
            this.carouselSettings = { ...content.carouselSettings };
          }
          this.bannerForm.patchValue({ carouselSettings: this.carouselSettings });
          this.featuredCategories.clear();
          this.selectedCategoryFiles = [];
          this.categoryPreviewUrls = [];
          content.featuredCategories?.forEach((cat) => this.addFeaturedCategory(cat));
          if (content.featuredProducts) {
            const enabled = content.featuredProducts.enabled ?? false;
            const titleControl = this.featuredProductsGroup.get('title');
            if (enabled) {
              titleControl?.setValidators([Validators.required]);
            } else {
              titleControl?.clearValidators();
            }
            this.featuredProductsGroup.patchValue({
              enabled,
              title: content.featuredProducts.title || 'Destacados',
              productIds: content.featuredProducts.productIds || [],
            });
            titleControl?.updateValueAndValidity();
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  get featuredCategories(): FormArray {
    return this.bannerForm.get('featuredCategories') as FormArray;
  }
  get carouselSettingsGroup(): FormGroup {
    return this.bannerForm.get('carouselSettings') as FormGroup;
  }
  get featuredProductsGroup(): FormGroup {
    return this.bannerForm.get('featuredProducts') as FormGroup;
  }
  get emptySlots(): null[] {
    return Array(Math.max(0, this.MAX_HERO - this.heroImagePreviews.length)).fill(null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.heroImages.length < this.MAX_HERO) {
      this.isDragOver = true;
    }
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    if (this.heroImages.length >= this.MAX_HERO) {
      return;
    }
    const files = event.dataTransfer?.files;
    if (files?.length) {
      void this.onHeroImagesSelected({ target: { files } } as unknown as Event);
    }
  }

  private newFeaturedCategory(category?: FeaturedCategory): FormGroup {
    return this.fb.group({
      categoryId: [category?.categoryId ?? null, Validators.required],
      name: [category?.name ?? ''],
      slug: [category?.slug ?? ''],
      imageUrl: [category?.imageUrl ?? '', [Validators.pattern('https?://.+')]],
    });
  }

  addFeaturedCategory(category?: FeaturedCategory): void {
    if (this.featuredCategories.length < 3) {
      this.featuredCategories.push(this.newFeaturedCategory(category));
      this.selectedCategoryFiles.push(null);
      this.categoryPreviewUrls.push(null);
    }
  }

  removeFeaturedCategory(index: number): void {
    this.featuredCategories.removeAt(index);
    this.selectedCategoryFiles.splice(index, 1);
    this.categoryPreviewUrls.splice(index, 1);
  }

  onCategorySelectionChange(index: number, event: Event): void {
    const selectedId = (event.target as HTMLSelectElement).value;
    const categoryData = this.categoryMap.get(selectedId);
    if (categoryData) {
      patchAndMarkDirty(this.featuredCategories.at(index) as FormGroup, {
        name: categoryData.name,
        slug: categoryData.slug,
      });
    }
  }

  async onHeroImagesSelected(event: Event): Promise<void> {
    const batch = await this.heroUploader.processFiles(event, this.heroImages.length);
    if (!batch) {
      return;
    }
    batch.files.forEach((file, i) => {
      const tempId = batch.ids[i];
      const preview = batch.previews[i];
      this.heroImages.push({ imageUrl: tempId, linkType: 'none' });
      this.heroImagePreviews.push(preview);
      this.heroUploadProgress.set(tempId, 0);
      this.cdr.markForCheck();

      const heroImagePath = `site-images/hero-carousel-${Date.now()}-${i}`;
      const upload = this.storageService.uploadFile(file, heroImagePath);
      upload.progress$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (p) => {
          this.heroUploadProgress.set(tempId, Math.round(p));
          this.cdr.markForCheck();
        },
      });
      upload.downloadUrl$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (url) => {
          const idx = this.heroImages.findIndex((img) => img.imageUrl === tempId);
          if (idx !== -1) {
            this.heroImages[idx] = { imageUrl: url, linkType: 'none' };
            this.heroImagePreviews[idx] = url;
          }
          this.heroUploadProgress.delete(tempId);
          this.bannerForm.markAsDirty();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error uploading hero image:', err);
          const idx = this.heroImages.findIndex((img) => img.imageUrl === tempId);
          if (idx !== -1) {
            this.removeHeroImage(idx);
          }
          this.heroUploadProgress.delete(tempId);
          this.cdr.markForCheck();
        },
      });
    });
  }

  removeHeroImage(index: number): void {
    const img = this.heroImages[index];
    if (img?.imageUrl) {
      this.heroUploadProgress.delete(img.imageUrl);
    }
    this.heroImages.splice(index, 1);
    this.heroImagePreviews.splice(index, 1);
    this.selectedHeroFiles.splice(index, 1);
    this.bannerForm.markAsDirty();
  }

  moveHeroImageUp(index: number): void {
    if (index > 0) {
      this.swapHeroImages(index, index - 1);
    }
  }

  moveHeroImageDown(index: number): void {
    if (index < this.heroImages.length - 1) {
      this.swapHeroImages(index, index + 1);
    }
  }

  private swapHeroImages(a: number, b: number): void {
    [this.heroImages[a], this.heroImages[b]] = [this.heroImages[b], this.heroImages[a]];
    [this.heroImagePreviews[a], this.heroImagePreviews[b]] = [
      this.heroImagePreviews[b],
      this.heroImagePreviews[a],
    ];
    [this.selectedHeroFiles[a], this.selectedHeroFiles[b]] = [
      this.selectedHeroFiles[b],
      this.selectedHeroFiles[a],
    ];
    this.bannerForm.markAsDirty();
  }

  openLinkModal(index: number): void {
    this.activeHeroIndex = index;
    this.productSearchTerm$.next('');
    this.isLinkModalVisible = true;
  }

  closeLinkModal(): void {
    this.isLinkModalVisible = false;
    this.activeHeroIndex = -1;
  }

  updateLinkType(type: 'product' | 'category' | 'none'): void {
    this.heroImages[this.activeHeroIndex].linkType = type;
    delete this.heroImages[this.activeHeroIndex].linkId;
    if (type === 'product') {
      this.productSearchTerm$.next('');
    }
    this.bannerForm.markAsDirty();
  }

  updateLinkId(id: string): void {
    this.heroImages[this.activeHeroIndex].linkId = id;
    this.bannerForm.markAsDirty();
  }

  onProductSearch(term: string): void {
    this.productSearchTerm$.next(term);
  }

  async onSubmit(): Promise<void> {
    if (this.heroImages.length === 0) {
      this.sweetAlertService.error(
        'Imágenes requeridas',
        'Debes agregar al menos una imagen al carrusel hero.',
      );
      return;
    }
    if (this.bannerForm.invalid) {
      this.bannerForm.markAllAsTouched();
      const featuredErrors = this.featuredProductsGroup.errors;
      if (featuredErrors?.['minProducts']) {
        this.sweetAlertService.error(
          'Productos insuficientes',
          'Debes seleccionar al menos 5 productos para la sección de Destacados.',
        );
        return;
      }
      if (featuredErrors?.['maxProducts']) {
        this.sweetAlertService.error(
          'Límite de productos excedido',
          'La sección de Destacados permite un máximo de 15 productos.',
        );
        return;
      }
      if (featuredErrors?.['requiredTitle'] || this.featuredProductsGroup.get('title')?.invalid) {
        this.sweetAlertService.error(
          'Título requerido',
          'Debes ingresar un título para la sección de Destacados.',
        );
        return;
      }
      this.sweetAlertService.error(
        'Formulario Inválido',
        'Por favor revisa los campos marcados en rojo.',
      );
      return;
    }
    this.isSubmitting = true;
    try {
      this.carouselSettings = this.carouselSettingsGroup.value;
      const contentData: HeroBanner = {
        ...this.bannerForm.value,
        heroImages: this.heroImages,
        carouselSettings: this.carouselSettings,
        lastUpdated: new Date(),
      };
      await this.homeContentService.saveHomePageContent(
        contentData,
        null,
        this.selectedCategoryFiles,
        this.selectedHeroFiles,
      );
      this.sweetAlertService.success('¡Éxito!', 'La configuración de la Home ha sido guardada.');
      this.selectedCategoryFiles.fill(null);
      this.categoryPreviewUrls.fill(null);
      this.selectedHeroFiles = [];
      this.bannerForm.markAsPristine();
    } catch (error) {
      console.error('Error saving home page content:', error);
      this.sweetAlertService.error('Error', 'No se pudo guardar la configuración.');
    } finally {
      this.isSubmitting = false;
    }
  }
}
