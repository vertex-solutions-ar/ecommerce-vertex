import { TestBed } from '@angular/core/testing';
import { ProductService } from './product.service';
import { Firestore } from '@angular/fire/firestore';
import { StorageService } from './storage.service';
import { of } from 'rxjs';
import type { Product } from '../models/product.model';

describe('ProductService', () => {
  let service: ProductService;
  let firestoreSpy: jasmine.SpyObj<Firestore>;
  let storageServiceSpy: jasmine.SpyObj<StorageService>;

  const mockProducts: Product[] = [
    {
      id: 'p1',
      name: 'Remera Algodón',
      description: 'Remera de algodón 100%',
      price: 2500,
      categoryId: 'cat1',
      totalStock: 3,
      createdAt: new Date('2026-01-01'),
      image: 'http://img.jpg/p1.jpg',
      inStockAttributes: { color: ['rojo'] },
      variantAttributes: ['color'],
    },
    {
      id: 'p2',
      name: 'Pantalón Jean',
      description: 'Jean clásico',
      price: 5000,
      categoryId: 'cat2',
      totalStock: 15,
      createdAt: new Date('2026-02-01'),
      image: 'http://img.jpg/p2.jpg',
      inStockAttributes: { talle: ['40'] },
      variantAttributes: ['talle'],
    },
  ];

  beforeEach(() => {
    firestoreSpy = jasmine.createSpyObj('Firestore', [
      'collection',
      'doc',
      'getDocs',
      'getDoc',
      'setDoc',
      'updateDoc',
      'deleteDoc',
      'query',
      'where',
    ]);
    storageServiceSpy = jasmine.createSpyObj('StorageService', ['deleteFileByUrl', 'uploadFile']);

    TestBed.configureTestingModule({
      providers: [
        ProductService,
        { provide: Firestore, useValue: firestoreSpy },
        { provide: StorageService, useValue: storageServiceSpy },
      ],
    });

    service = TestBed.inject(ProductService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getProducts', () => {
    it('should return products sorted by createdAt descending', (done) => {
      const sorted = [...mockProducts].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      spyOn(service, 'getProducts').and.returnValue(of(sorted));

      service.getProducts().subscribe((products) => {
        expect(products.length).toBe(2);
        expect(products[0].id).toBe('p2'); // Feb 1 is newer than Jan 1
        expect(products[1].id).toBe('p1');
        done();
      });
    });

    it('should handle errors and return empty array', (done) => {
      spyOn(service, 'getProducts').and.returnValue(of([]));

      service.getProducts().subscribe((products) => {
        expect(products).toEqual([]);
        done();
      });
    });
  });

  describe('getProductsByIds', () => {
    it('should return empty array if ids is empty or null', (done) => {
      service.getProductsByIds([]).subscribe((products) => {
        expect(products).toEqual([]);
        done();
      });
    });

    it('should return matching products in the order requested', (done) => {
      spyOn(service, 'getProducts').and.returnValue(of(mockProducts));

      service.getProductsByIds(['p2', 'p1']).subscribe((products) => {
        expect(products.length).toBe(2);
        expect(products[0].id).toBe('p2');
        expect(products[1].id).toBe('p1');
        done();
      });
    });

    it('should ignore non-existent product IDs', (done) => {
      spyOn(service, 'getProducts').and.returnValue(of(mockProducts));

      service.getProductsByIds(['p1', 'non-existent']).subscribe((products) => {
        expect(products.length).toBe(1);
        expect(products[0].id).toBe('p1');
        done();
      });
    });
  });

  describe('getProductById', () => {
    it('should return product by ID if found', (done) => {
      spyOn(service, 'getProductById').and.callFake((id) =>
        of(mockProducts.find((p) => p.id === id)),
      );

      service.getProductById('p1').subscribe((product) => {
        expect(product?.name).toBe('Remera Algodón');
        done();
      });
    });

    it('should return undefined if product is not found or errors', (done) => {
      spyOn(service, 'getProductById').and.returnValue(of(undefined));

      service.getProductById('invalid').subscribe((product) => {
        expect(product).toBeUndefined();
        done();
      });
    });
  });

  describe('getProductsLowInStock', () => {
    it('should filter products with totalStock <= threshold', (done) => {
      spyOn(service, 'getProducts').and.returnValue(of(mockProducts));

      service.getProductsLowInStock(5).subscribe((lowStock) => {
        expect(lowStock.length).toBe(1);
        expect(lowStock[0].id).toBe('p1'); // stock 3 <= 5
        done();
      });
    });
  });

  describe('getLatestProducts', () => {
    it('should slice latest N products', (done) => {
      spyOn(service, 'getProducts').and.returnValue(of(mockProducts));

      service.getLatestProducts(1).subscribe((latest) => {
        expect(latest.length).toBe(1);
        done();
      });
    });
  });

  describe('checkStockAvailability', () => {
    it('should return true if stock is greater than or equal to requested quantity', (done) => {
      spyOn(service, 'checkStockAvailability').and.returnValue(of(true));

      service.checkStockAvailability('p1', 'v1', 5).subscribe((available) => {
        expect(available).toBeTrue();
        done();
      });
    });

    it('should return false if stock is less than requested quantity', (done) => {
      spyOn(service, 'checkStockAvailability').and.returnValue(of(false));

      service.checkStockAvailability('p1', 'v1', 5).subscribe((available) => {
        expect(available).toBeFalse();
        done();
      });
    });
  });
});
