import { Injectable, inject } from '@angular/core';
import type { FormArray, FormGroup } from '@angular/forms';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import type { WithFieldValue } from '@angular/fire/firestore';
import type { Product, ProductVariant } from '@core/models/product.model';

export interface ProductVariantFormValue {
  id: string | null;
  attributes: Record<string, string>;
  stock: number;
}

export interface ProductFormValue {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  image: string;
  images: string[];
  hasAttributes: boolean;
  stock?: number;
  variantAttributes: string[];
  variants: ProductVariantFormValue[];
}

export interface EditVariantChanges {
  toUpdate: (Partial<ProductVariant> & { id: string })[];
  toAdd: WithFieldValue<Omit<ProductVariant, 'id' | 'productId'>>[];
  toDelete: string[];
}

@Injectable({ providedIn: 'root' })
export class ProductVariantFormService {
  private fb = inject(FormBuilder);
  readonly variantSearchControl = new FormControl('', { nonNullable: true });

  createProductForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.maxLength(500)]],
      price: [null, [Validators.required, Validators.min(0.01)]],
      categoryId: [null, Validators.required],
      image: ['', [Validators.required]],
      images: this.fb.array([]),
      hasAttributes: [false],
      stock: [0, [Validators.required, Validators.min(0)]],
      variantAttributes: this.fb.array([]),
      variants: this.fb.array([]),
    });
  }

  updateStockValidators(form: FormGroup, hasAttributes: boolean): void {
    const stockControl = form.get('stock');
    const variantsArray = form.get('variants') as FormArray | null;
    const variantAttributesArray = form.get('variantAttributes') as FormArray | null;

    if (!hasAttributes) {
      stockControl?.setValidators([Validators.required, Validators.min(0)]);
      if (variantsArray) {
        variantsArray.controls.forEach((group) => {
          if (group instanceof FormBuilder || 'controls' in group) {
            const fg = group as FormGroup;
            fg.get('stock')?.clearValidators();
            fg.get('stock')?.updateValueAndValidity();
            const attrGroup = fg.get('attributes') as FormGroup | null;
            if (attrGroup?.controls) {
              Object.keys(attrGroup.controls).forEach((key) => {
                attrGroup.get(key)?.clearValidators();
                attrGroup.get(key)?.updateValueAndValidity();
              });
            }
          }
        });
        variantsArray.clearValidators();
        variantsArray.updateValueAndValidity();
      }
      if (variantAttributesArray) {
        variantAttributesArray.clearValidators();
        variantAttributesArray.updateValueAndValidity();
      }
    } else {
      stockControl?.clearValidators();
      if (variantsArray) {
        const selectedAttrIds = (variantAttributesArray?.value as string[]) ?? [];
        variantsArray.controls.forEach((group) => {
          if ('controls' in group) {
            const fg = group as FormGroup;
            fg.get('stock')?.setValidators([Validators.required, Validators.min(0)]);
            fg.get('stock')?.updateValueAndValidity();
            const attrGroup = fg.get('attributes') as FormGroup | null;
            if (attrGroup?.controls) {
              selectedAttrIds.forEach((id) => {
                attrGroup.get(id)?.setValidators(Validators.required);
                attrGroup.get(id)?.updateValueAndValidity();
              });
            }
          }
        });
        variantsArray.updateValueAndValidity();
      }
    }
    stockControl?.updateValueAndValidity();
    form.updateValueAndValidity();
  }

  createVariantGroup(selectedIds: string[], variant?: ProductVariant): FormGroup {
    const attributesGroup = this.fb.group({});
    const ids = selectedIds ?? [];
    ids.forEach((id) => {
      attributesGroup.addControl(
        id,
        this.fb.control(variant?.attributes?.[id] ?? null, Validators.required),
      );
    });
    return this.fb.group({
      id: [variant?.id ?? null],
      attributes: attributesGroup,
      stock: [variant?.stock ?? 0, [Validators.required, Validators.min(0)]],
    });
  }

  buildEditChanges(
    formVariants: ProductVariantFormValue[],
    initialVariants: ProductVariant[],
    basePrice?: number,
  ): EditVariantChanges {
    const toUpdate: (Partial<ProductVariant> & { id: string })[] = [];
    const toAdd: WithFieldValue<Omit<ProductVariant, 'id' | 'productId'>>[] = [];
    const currentIds = new Set<string>();

    formVariants.forEach((v) => {
      const variantPayload: Partial<ProductVariant> = {
        attributes: v.attributes,
        stock: v.stock,
      };
      if (typeof basePrice === 'number') {
        variantPayload.price = basePrice;
      }
      if (v.id) {
        toUpdate.push({ id: v.id, ...variantPayload });
        currentIds.add(v.id);
      } else {
        toAdd.push({
          attributes: v.attributes,
          stock: v.stock,
          ...(typeof basePrice === 'number' ? { price: basePrice } : {}),
        });
      }
    });

    const toDelete = initialVariants.filter((iv) => !currentIds.has(iv.id)).map((iv) => iv.id);

    return { toUpdate, toAdd, toDelete };
  }

  buildProductData(formValue: ProductFormValue): WithFieldValue<Omit<Product, 'id'>> {
    if (!formValue.hasAttributes) {
      const stock = Number(formValue.stock ?? 0);
      return {
        name: formValue.name,
        description: formValue.description,
        price: formValue.price,
        categoryId: formValue.categoryId,
        image: formValue.image,
        images: formValue.images ?? [],
        hasAttributes: false,
        stock,
        totalStock: stock,
        variants: [],
        variantAttributes: [],
        createdAt: new Date(),
        inStockAttributes: {},
      };
    }

    const totalStock = (formValue.variants ?? []).reduce(
      (sum, v) => sum + (Number(v.stock) || 0),
      0,
    );
    return {
      name: formValue.name,
      description: formValue.description,
      price: formValue.price,
      categoryId: formValue.categoryId,
      image: formValue.image,
      images: formValue.images ?? [],
      hasAttributes: true,
      totalStock,
      variantAttributes: formValue.variantAttributes ?? [],
      createdAt: new Date(),
      inStockAttributes: {},
    };
  }

  syncVariantAttributes(variants: FormGroup[], selectedIds: string[]): void {
    const ids = selectedIds ?? [];
    variants.forEach((control) => {
      const ag = control.get('attributes') as FormGroup | null;
      if (!ag?.controls) {
        return;
      }
      const curIds = Object.keys(ag.controls);
      curIds.filter((id) => !ids.includes(id)).forEach((id) => ag.removeControl(id));
      ids
        .filter((id) => !curIds.includes(id))
        .forEach((id) => ag.addControl(id, this.fb.control(null, Validators.required)));
    });
  }

  populateEditForm(form: FormGroup, product: Product, variants: ProductVariant[]): void {
    const isSimple =
      product.hasAttributes === false ||
      (product.hasAttributes === undefined && (!variants || variants.length === 0));

    const stockValue = product.stock ?? product.totalStock ?? 0;

    form.patchValue(
      {
        name: product.name,
        description: product.description,
        price: product.price,
        categoryId: product.categoryId,
        image: product.image,
        hasAttributes: !isSimple,
        stock: stockValue,
      },
      { emitEvent: false },
    );

    const imgControls = (product.images ?? []).map((img) =>
      this.fb.control(img, [Validators.required, Validators.pattern('https?://.+')]),
    );
    form.setControl('images', this.fb.array(imgControls), { emitEvent: false });

    const attrControls = (!isSimple ? (product.variantAttributes ?? []) : []).map((attrId) =>
      this.fb.control(attrId),
    );
    form.setControl('variantAttributes', this.fb.array(attrControls), { emitEvent: false });

    const vControls = !isSimple
      ? variants.map((v) => this.createVariantGroup(product.variantAttributes ?? [], v))
      : [];
    form.setControl('variants', this.fb.array(vControls), { emitEvent: false });

    this.updateStockValidators(form, !isSimple);

    form.updateValueAndValidity({ emitEvent: false });
    form.markAsPristine();
    form.markAsUntouched();
  }
}
