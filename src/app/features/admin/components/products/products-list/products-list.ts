import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, CurrencyPipe, TitleCasePipe, ViewportScroller } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ProductService } from '@core/services/product.service';
import { SweetAlertService } from '@core/services/sweet-alert.service';
import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, of } from 'rxjs';
import type { Product } from '@core/models/product.model';
import { debounceTime, distinctUntilChanged, map, catchError } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { TruncatePipe } from '../../shared/pipes/truncate.pipe';
import { CategoryService } from '@core/services/category.service';
import type { Category } from '@core/models/category.model';
import { AdminSearchBar } from '@shared/components/admin-search-bar/admin-search-bar';
import { AdminPagination } from '@shared/components/admin-pagination/admin-pagination';

export type CatalogDensity = 'compact' | 'comfortable' | 'list';
export const ALLOWED_PAGE_SIZES = [12, 24, 48] as const;
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];
export const STORAGE_KEY_PAGE_SIZE = 'admin_catalog_page_size';
export const DEFAULT_PAGE_SIZE: AllowedPageSize = 12;

@Component({
  selector: 'app-products-list',
  templateUrl: './products-list.html',
  styleUrl: './products-list.scss',
  imports: [
    CommonModule,
    RouterModule,
    CurrencyPipe,
    FormsModule,
    TitleCasePipe,
    TruncatePipe,
    AdminSearchBar,
    AdminPagination,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsList implements OnInit {
  readonly densityMode = signal<CatalogDensity>(this.getInitialDensity());
  products$!: Observable<Product[]>;
  private rawProducts$ = new BehaviorSubject<Product[]>([]);
  readonly isLoading = signal<boolean>(true);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private router = inject(Router);
  private sweetAlertService = inject(SweetAlertService);
  private viewportScroller = inject(ViewportScroller);
  private destroyRef = inject(DestroyRef);

  searchTermSubject = new BehaviorSubject<string>('');
  filterCategorySubject = new BehaviorSubject<string>('all');
  categories$!: Observable<Category[]>;
  private categoriesMap: Map<string, string> = new Map();

  currentPageSubject = new BehaviorSubject<number>(1);
  itemsPerPageSubject = new BehaviorSubject<number>(this.getInitialPageSize());

  totalProducts = 0;
  totalPages = 0;

  ngOnInit(): void {
    this.categories$ = this.categoryService.getCategories().pipe(
      map((categories) => {
        this.categoriesMap.clear();
        categories.forEach((cat) => this.categoriesMap.set(cat.id!, cat.name));
        return categories;
      }),
      catchError(() => of([])),
    );

    this.loadProducts();

    this.products$ = combineLatest([
      this.rawProducts$,
      this.categories$,
      this.searchTermSubject.pipe(debounceTime(300), distinctUntilChanged()),
      this.filterCategorySubject,
      this.currentPageSubject,
      this.itemsPerPageSubject,
    ]).pipe(
      map(([allProducts, _categories, searchTerm, filterCategoryId, currentPage, itemsPerPage]) => {
        let filteredProducts = allProducts;

        if (searchTerm) {
          const lowerCaseSearchTerm = searchTerm.toLowerCase();
          filteredProducts = filteredProducts.filter(
            (product) =>
              product.name.toLowerCase().includes(lowerCaseSearchTerm) ||
              product.description.toLowerCase().includes(lowerCaseSearchTerm),
          );
        }

        if (filterCategoryId !== 'all') {
          filteredProducts = filteredProducts.filter(
            (product) => product.categoryId === filterCategoryId,
          );
        }

        this.totalProducts = filteredProducts.length;
        this.totalPages = Math.ceil(this.totalProducts / itemsPerPage);

        if (currentPage > this.totalPages && this.totalPages > 0) {
          const corrected = this.totalPages;
          currentPage = corrected;
          void Promise.resolve().then(() => this.currentPageSubject.next(corrected));
        } else if (this.totalPages === 0 && currentPage !== 1) {
          currentPage = 1;
          void Promise.resolve().then(() => this.currentPageSubject.next(1));
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
      }),
    );
  }

  getCategoryName(categoryId: string): string {
    return this.categoriesMap.get(categoryId) ?? 'Sin Categoría';
  }

  onSearchChange(newValue: string): void {
    this.searchTermSubject.next(newValue);
    this.currentPageSubject.next(1);
  }

  onFilterCategoryChange(newValue: string): void {
    this.filterCategorySubject.next(newValue);
    this.currentPageSubject.next(1);
  }

  onPageSizeChange(newSize: number): void {
    this.itemsPerPageSubject.next(newSize);
    this.currentPageSubject.next(1);
    this.savePageSize(newSize);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPageSubject.next(page);

      setTimeout(() => {
        this.viewportScroller.scrollToPosition([0, 0]);

        const container = document.querySelector('.admin-shell__main');
        if (container) {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 50);
    }
  }

  loadProducts(): void {
    this.isLoading.set(true);
    this.productService
      .getProducts()
      .pipe(
        catchError((err) => {
          console.error('Error al cargar productos:', err);
          return of([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((products) => {
        this.rawProducts$.next(products);
        this.isLoading.set(false);
      });
  }

  async confirmDelete(product: Product): Promise<void> {
    const isConfirmed = await this.sweetAlertService.confirm(
      'Confirmar Eliminación de Producto',
      `¿Estás seguro de que deseas eliminar el producto "${product.name}"? Esta acción no se puede deshacer.`,
    );
    if (isConfirmed && product.id) {
      try {
        await this.productService.deleteProduct(product.id);
        this.sweetAlertService.success('Eliminado', 'El producto ha sido eliminado.');
        this.loadProducts();
      } catch {
        this.sweetAlertService.error('Error', 'Hubo un problema al eliminar el producto.');
      }
    }
  }

  newProduct(): void {
    void this.router.navigate(['/admin/products/create']);
  }

  goToDetail(productId: string | undefined): void {
    if (productId) {
      void this.router.navigate(['/admin/products', productId]);
    }
  }

  setDensity(mode: CatalogDensity): void {
    this.densityMode.set(mode);
    if (typeof window !== 'undefined' && !!window.localStorage) {
      try {
        window.localStorage.setItem('admin_catalog_density', mode);
      } catch (error) {
        console.warn('Could not save admin_catalog_density to localStorage:', error);
      }
    }
  }

  private getInitialDensity(): CatalogDensity {
    if (typeof window !== 'undefined' && !!window.localStorage) {
      try {
        const saved = window.localStorage.getItem('admin_catalog_density');
        if (saved === 'compact' || saved === 'comfortable' || saved === 'list') {
          return saved;
        }
      } catch (error) {
        console.warn('Could not read admin_catalog_density from localStorage:', error);
      }
    }
    return 'comfortable';
  }

  private getInitialPageSize(): number {
    if (typeof window !== 'undefined' && !!window.localStorage) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY_PAGE_SIZE);
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (ALLOWED_PAGE_SIZES.includes(parsed as AllowedPageSize)) {
            return parsed;
          }
        }
      } catch (error) {
        console.warn('Could not read admin_catalog_page_size from localStorage:', error);
      }
    }
    return DEFAULT_PAGE_SIZE;
  }

  private savePageSize(size: number): void {
    if (typeof window !== 'undefined' && !!window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY_PAGE_SIZE, size.toString());
      } catch (error) {
        console.warn('Could not save admin_catalog_page_size to localStorage:', error);
      }
    }
  }
}
