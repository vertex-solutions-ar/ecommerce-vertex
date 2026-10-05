import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
  ViewChild,
  type ElementRef,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ReactiveFormsModule, type FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Product } from '@core/models/product.model';

@Component({
  selector: 'app-featured-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe],
  templateUrl: './featured-products.html',
  styleUrl: './featured-products.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturedProducts implements OnInit {
  private destroyRef = inject(DestroyRef);

  readonly formGroup = input.required<FormGroup>();
  readonly allProducts = input<Product[]>([]);

  @ViewChild('productSearchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('addBtn') addBtn?: ElementRef<HTMLButtonElement>;

  readonly isModalOpen = signal<boolean>(false);
  readonly searchTerm = signal<string>('');
  readonly selectedIds = signal<string[]>([]);

  readonly productCount = computed<number>(() => this.selectedIds().length);
  readonly isMinReached = computed<boolean>(() => this.productCount() >= 5);
  readonly isMaxReached = computed<boolean>(() => this.productCount() >= 15);

  readonly isValid = computed<boolean>(() => {
    const enabled = this.formGroup().get('enabled')?.value;
    if (!enabled) {
      return true;
    }
    const count = this.productCount();
    return count >= 5 && count <= 15;
  });

  readonly selectedProductsList = computed<Product[]>(() => {
    const ids = this.selectedIds();
    const products = this.allProducts();
    const map = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => map.get(id)).filter((p): p is Product => p !== undefined);
  });

  readonly matchingSelectedProducts = computed<Product[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return [];
    }
    return this.selectedProductsList().filter(
      (p) => p.name.toLowerCase().includes(term) || p.id?.toLowerCase().includes(term),
    );
  });

  readonly filteredAvailableProducts = computed<Product[]>(() => {
    const selectedSet = new Set(this.selectedIds());
    const term = this.searchTerm().trim().toLowerCase();
    return this.allProducts().filter((p) => {
      if (selectedSet.has(p.id)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return p.name.toLowerCase().includes(term) || p.id?.toLowerCase().includes(term);
    });
  });

  isProductSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  ngOnInit(): void {
    const initialIds = (this.formGroup().get('productIds')?.value as string[]) || [];
    this.selectedIds.set(initialIds);

    this.formGroup()
      .get('productIds')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ids: string[]) => {
        const nextIds = ids || [];
        // Only update if actually different to prevent signal thrashing
        if (JSON.stringify(this.selectedIds()) !== JSON.stringify(nextIds)) {
          this.selectedIds.set(nextIds);
        }
      });
  }

  openModal(): void {
    if (this.isMaxReached()) {
      return;
    }
    this.searchTerm.set('');
    this.isModalOpen.set(true);
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 0);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    setTimeout(() => {
      this.addBtn?.nativeElement.focus();
    }, 0);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.value = '';
      this.searchInput.nativeElement.focus();
    }
  }

  addProduct(product: Product): void {
    if (this.isMaxReached() || this.selectedIds().includes(product.id)) {
      return;
    }
    const updated = [...this.selectedIds(), product.id];
    this.selectedIds.set(updated);
    this.updateFormControl(updated);

    if (updated.length >= 15) {
      this.closeModal();
    }
  }

  removeProduct(index: number): void {
    const updated = this.selectedIds().filter((_, i) => i !== index);
    this.selectedIds.set(updated);
    this.updateFormControl(updated);
  }

  moveUp(index: number): void {
    if (index <= 0) {
      return;
    }
    const updated = [...this.selectedIds()];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    this.selectedIds.set(updated);
    this.updateFormControl(updated);
  }

  moveDown(index: number): void {
    if (index >= this.selectedIds().length - 1) {
      return;
    }
    const updated = [...this.selectedIds()];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    this.selectedIds.set(updated);
    this.updateFormControl(updated);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  private updateFormControl(ids: string[]): void {
    const control = this.formGroup().get('productIds');
    if (control) {
      control.setValue(ids);
      control.markAsDirty();
      control.updateValueAndValidity();
    }
    this.formGroup().markAsDirty();
    this.formGroup().root?.markAsDirty();
  }
}
