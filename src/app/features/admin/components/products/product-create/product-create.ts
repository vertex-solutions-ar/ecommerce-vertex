import {
  Component,
  inject,
  ViewChild,
  ViewChildren,
  DestroyRef,
  ChangeDetectorRef,
  signal,
  type OnInit,
  type QueryList,
  type ElementRef,
  type AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  FormsModule,
  type FormGroup,
  type FormArray,
  type AbstractControl,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { startWith, take, BehaviorSubject, type Observable } from 'rxjs';
import { ProductService } from '@core/services/product.service';
import { CategoryService } from '@core/services/category.service';
import type { ProductVariant } from '@core/models/product.model';
import type { Category } from '@core/models/category.model';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import { AttributeService } from '@core/services/attribute.service';
import type { Attribute } from '@core/models/attribute.model';
import type { WithFieldValue } from '@angular/fire/firestore';
import { ProductVariantFormService, type ProductFormValue } from './product-variant-form.service';
import { ProductMediaService } from './product-media.service';

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './product-create.html',
  styleUrl: './product-create.scss',
})
export class ProductCreate implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private attributeService = inject(AttributeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private sweetAlertService = inject(SweetAlertService);
  private mediaService = inject(ProductMediaService);
  private variantFormService = inject(ProductVariantFormService);
  private cdr = inject(ChangeDetectorRef);
  private focusNewImage = false;
  private focusNewVariant = false;

  @ViewChild('stockInput') stockInput?: ElementRef<HTMLInputElement>;
  @ViewChildren('galleryInput') galleryInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChildren('variantSelect') variantSelects!: QueryList<ElementRef<HTMLSelectElement>>;
  @ViewChildren('variantStock') variantStocks!: QueryList<ElementRef<HTMLInputElement>>;

  productForm!: FormGroup;
  categories$!: Observable<Category[]>;

  showAttributeForm = false;
  newAttributeName = '';
  private attributesSubject = new BehaviorSubject<Attribute[]>([]);
  attributes$ = this.attributesSubject.asObservable();

  isSubmitting = false;
  isEditMode = false;
  productId: string | null = null;
  pageTitle = 'Crear Nuevo Producto';
  readonly isLoadingProduct = signal(false);
  uploadProgress: number | null = null;
  galleryUploadProgress: Record<number, number | null> = {};
  private initialVariants: ProductVariant[] = [];

  currentPage = 1;
  pageSize = 5;
  readonly variantSearchControl = this.variantFormService.variantSearchControl;

  get filteredVariantsControls(): AbstractControl[] {
    const query = (this.variantSearchControl.value ?? '').trim().toLowerCase();
    const allControls = this.variants.controls;
    if (!query) {
      return allControls;
    }
    return allControls.filter((group) => {
      const rawVal = group.value as {
        id?: string;
        stock?: number;
        attributes?: Record<string, string>;
      };
      const stockStr = String(rawVal.stock ?? '');
      const attrValues = Object.values(rawVal.attributes ?? {})
        .join(' ')
        .toLowerCase();
      const idStr = String(rawVal.id ?? '').toLowerCase();
      return stockStr.includes(query) || attrValues.includes(query) || idStr.includes(query);
    });
  }

  get totalPages(): number {
    return Math.ceil(this.filteredVariantsControls.length / this.pageSize) || 1;
  }
  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }
  get paginatedVariantsControls(): AbstractControl[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredVariantsControls.slice(start, start + this.pageSize);
  }
  getVariantRealIndex(control: AbstractControl): number {
    return this.variants.controls.indexOf(control);
  }

  get name(): AbstractControl {
    return this.productForm.get('name')!;
  }
  get price(): AbstractControl {
    return this.productForm.get('price')!;
  }
  get categoryId(): AbstractControl {
    return this.productForm.get('categoryId')!;
  }
  get image(): AbstractControl {
    return this.productForm.get('image')!;
  }
  get variants(): FormArray {
    return this.productForm.get('variants') as FormArray;
  }
  get images(): FormArray {
    return this.productForm.get('images') as FormArray;
  }
  get variantAttributes(): FormArray {
    return this.productForm.get('variantAttributes') as FormArray;
  }

  onHasAttributesChange(): void {
    const hasAttr = Boolean(this.productForm.get('hasAttributes')?.value);
    this.variantFormService.updateStockValidators(this.productForm, hasAttr);
    if (!hasAttr) {
      setTimeout(() => this.stockInput?.nativeElement.focus(), 0);
    }
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.categories$ = this.categoryService.getCategories();
    this.attributeService
      .getAttributes()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((attrs) => {
        this.attributesSubject.next(attrs);
        this.cdr.markForCheck();
      });
    this.variantSearchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentPage = 1;
        this.cdr.markForCheck();
      });
    this.productForm = this.variantFormService.createProductForm();
    this.productForm
      .get('hasAttributes')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((hasAttr: boolean) => {
        this.variantFormService.updateStockValidators(this.productForm, hasAttr);
        if (!hasAttr) {
          setTimeout(() => this.stockInput?.nativeElement.focus(), 0);
        }
        this.cdr.markForCheck();
      });
    this.onAttributeSelectionChange();
    this.checkEditMode();
  }

  ngAfterViewInit(): void {
    this.galleryInputs.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ql: QueryList<ElementRef<HTMLInputElement>>) => {
        if (this.focusNewImage && ql.last) {
          ql.last.nativeElement.focus();
          this.focusNewImage = false;
          this.cdr.markForCheck();
        }
      });
    this.variantSelects.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ql: QueryList<ElementRef<HTMLSelectElement>>) => {
        if (!this.focusNewVariant) {
          return;
        }
        const targetIdx = ql.toArray().length - this.variantAttributes.length;
        if (targetIdx >= 0 && ql.toArray()[targetIdx]) {
          ql.toArray()[targetIdx].nativeElement.focus();
        } else if (this.variantStocks.last) {
          this.variantStocks.last.nativeElement.focus();
        }
        this.focusNewVariant = false;
        this.cdr.markForCheck();
      });
  }

  private checkEditMode(): void {
    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.productId) {
      this.isEditMode = true;
      this.loadProductForEdit(this.productId);
    }
  }

  private loadProductForEdit(id: string): void {
    this.isLoadingProduct.set(true);
    this.productService
      .getProductWithVariants(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.isLoadingProduct.set(false);
          if (!data) {
            this.sweetAlertService.error('Error', 'Producto no encontrado.');
            void this.router.navigate(['/admin/products']);
            return;
          }
          this.initialVariants = data.variants;
          this.pageTitle = `Editar: ${data.product.name}`;
          this.variantFormService.populateEditForm(this.productForm, data.product, data.variants);
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingProduct.set(false);
          this.sweetAlertService.error('Error', 'No se pudo cargar el producto.');
          void this.router.navigate(['/admin/products']);
        },
      });
  }

  onAttributeSelectionChange(): void {
    this.variantAttributes.valueChanges
      .pipe(
        startWith(this.variantAttributes.value as string[]),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((selectedIds: string[] | null) => {
        this.variantFormService.syncVariantAttributes(
          this.variants.controls as FormGroup[],
          selectedIds ?? [],
        );
        this.cdr.markForCheck();
      });
  }

  onAttributeCheckboxChange(event: Event, attrId: string): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const current = (this.variantAttributes.value as string[]) ?? [];
    if (isChecked) {
      if (!current.includes(attrId)) {
        this.variantAttributes.push(this.fb.control(attrId));
      }
    } else {
      const idx = current.indexOf(attrId);
      if (idx > -1) {
        this.variantAttributes.removeAt(idx);
      }
    }
  }

  toggleAttributeForm(): void {
    this.showAttributeForm = !this.showAttributeForm;
    this.newAttributeName = '';
  }

  async createAttribute(): Promise<void> {
    const name = this.newAttributeName.trim();
    if (!name || name.length < 2) {
      this.sweetAlertService.warning(
        'Aviso',
        'El nombre del atributo debe tener al menos 2 caracteres.',
      );
      return;
    }
    try {
      await this.attributeService.addAttribute({ name, values: [] } as unknown as Attribute);
      this.sweetAlertService.success('¡Éxito!', 'Atributo creado.');
      this.newAttributeName = '';
      this.showAttributeForm = false;
      this.attributeService
        .getAttributes()
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((a) => {
          this.attributesSubject.next(a);
          this.cdr.markForCheck();
        });
    } catch {
      this.sweetAlertService.error('Error', 'No se pudo crear el atributo.');
    }
  }

  getFirstActiveAttributeId(attributes: Attribute[]): string | null {
    const selectedIds = this.variantAttributes.value as string[];
    return attributes.find((a) => a.id && selectedIds.includes(a.id))?.id ?? null;
  }

  addVariant(variant?: ProductVariant): void {
    this.focusNewVariant = true;
    this.variants.push(
      this.variantFormService.createVariantGroup(this.variantAttributes.value, variant),
    );
    this.currentPage = this.totalPages;
    this.cdr.markForCheck();
  }

  async removeVariant(index: number, event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const isConfirmed = await this.sweetAlertService.confirm(
      '¿Estás seguro?',
      '¿Estás seguro de eliminar la variante?',
    );
    if (!isConfirmed) {
      return;
    }
    this.variants.removeAt(index);
    if (this.currentPage > this.totalPages) {
      this.currentPage = Math.max(1, this.totalPages);
    }
    this.cdr.detectChanges();
  }

  addImage(imageUrl: string = ''): void {
    if (this.images.length > 0 && !this.images.at(this.images.length - 1).value) {
      this.sweetAlertService.warning(
        'Advertencia',
        'Debes cargar la imagen actual antes de solicitar otra.',
      );
      return;
    }
    this.focusNewImage = true;
    this.images.push(this.mediaService.createImageControl(this.fb, imageUrl));
    this.cdr.markForCheck();
  }

  async removeImage(index: number): Promise<void> {
    if (await this.mediaService.confirmRemoveImage(this.images, index)) {
      this.cdr.markForCheck();
    }
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    this.uploadProgress = 0;
    this.cdr.markForCheck();
    this.mediaService
      .uploadMainImage(
        file,
        this.productId ?? 'new',
        (p) => {
          this.uploadProgress = p;
          this.cdr.markForCheck();
        },
        (url) => {
          this.productForm.get('image')?.setValue(url);
          this.uploadProgress = null;
          this.cdr.markForCheck();
        },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.uploadProgress = null;
          this.cdr.markForCheck();
        },
      });
  }

  onGalleryFileSelected(event: Event, index: number): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const control = this.images.at(index);
    if (!file || !control) {
      return;
    }
    this.galleryUploadProgress[index] = 0;
    this.cdr.markForCheck();
    this.mediaService
      .uploadGalleryImage(
        file,
        this.productId ?? 'new',
        index,
        (idx, p) => {
          this.galleryUploadProgress[idx] = p;
          this.cdr.markForCheck();
        },
        (url) => {
          control.setValue(url);
          this.galleryUploadProgress[index] = null;
          this.cdr.markForCheck();
        },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.galleryUploadProgress[index] = null;
          this.cdr.markForCheck();
        },
      });
  }

  async onSubmit(): Promise<void> {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      this.sweetAlertService.error('Formulario Inválido', 'Revisa todos los campos.');
      return;
    }

    const formValue = this.productForm.getRawValue() as ProductFormValue;
    const hasAttributes = Boolean(formValue.hasAttributes);

    if (hasAttributes && (!formValue.variants || formValue.variants.length === 0)) {
      this.sweetAlertService.error(
        'Variantes Requeridas',
        'Debes añadir al menos una variante o desactivar la opción de variantes.',
      );
      return;
    }

    this.isSubmitting = true;
    const stockVal = Number(formValue.stock) || 0;
    const totalStock = hasAttributes
      ? (formValue.variants || []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
      : stockVal;

    try {
      if (this.isEditMode && this.productId) {
        let toUpdate: (Partial<ProductVariant> & { id: string })[] = [];
        let toAdd: WithFieldValue<Omit<ProductVariant, 'id' | 'productId'>>[] = [];
        let toDelete: string[] = [];

        if (hasAttributes) {
          const editChanges = this.variantFormService.buildEditChanges(
            formValue.variants,
            this.initialVariants,
            formValue.price,
          );
          toUpdate = editChanges.toUpdate;
          toAdd = editChanges.toAdd;
          toDelete = editChanges.toDelete;
        } else {
          toDelete = this.initialVariants.map((iv) => iv.id);
        }

        const { name, description, price, categoryId, image, images } = formValue;
        const variantAttributes = hasAttributes ? (formValue.variantAttributes ?? []) : [];

        await this.productService.updateProductWithVariants(
          this.productId,
          {
            name,
            description,
            price,
            categoryId,
            image,
            images,
            variantAttributes,
            hasAttributes,
            stock: hasAttributes ? undefined : stockVal,
            totalStock,
          },
          toUpdate,
          toAdd,
          toDelete,
        );
        this.sweetAlertService.success('¡Éxito!', 'Producto actualizado.');
        void this.router.navigate(['/admin/products', this.productId]);
      } else {
        const productData = this.variantFormService.buildProductData(formValue);
        const variantsData =
          hasAttributes && formValue.variants && formValue.variants.length > 0
            ? formValue.variants.map((v) => ({
                attributes: v.attributes ?? {},
                stock: Number(v.stock) || 0,
              }))
            : [];
        const newId = await this.productService.createProductWithVariants(
          productData,
          variantsData,
        );
        this.sweetAlertService.success('¡Éxito!', 'Producto creado.');
        void this.router.navigate(['/admin/products', newId]);
      }
    } catch (error) {
      console.error('Error submitting product:', error);
      this.sweetAlertService.error('Error', 'No se pudo guardar el producto.');
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  onCancel(): void {
    const target =
      this.isEditMode && this.productId ? ['/admin/products', this.productId] : ['/admin/products'];
    void this.router.navigate(target);
  }
}
