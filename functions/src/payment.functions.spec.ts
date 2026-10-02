import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firebase & SDK mocks ───────────────────────────────────────────────────

const { mockRunTransaction, mockTenantDbCollection, mockCreatePreference } = vi.hoisted(() => {
  const mockRunTransaction = vi.fn();
  const mockTenantDbCollection = vi.fn();
  const mockCreatePreference = vi.fn();
  return {
    mockRunTransaction,
    mockTenantDbCollection,
    mockCreatePreference,
  };
});

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn((opts, name) => ({ name, opts })),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase-admin/firestore', () => {
  const mockDb = {
    collection: vi.fn((colName: string) => mockTenantDbCollection(colName)),
    runTransaction: vi.fn((cb: any) => mockRunTransaction(cb)),
  };
  return {
    getFirestore: vi.fn(() => mockDb),
    FieldValue: {
      increment: vi.fn((val: number) => ({ increment: val })),
      serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    },
    Timestamp: {
      fromDate: vi.fn((d: Date) => d),
    },
  };
});

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((optsOrHandler: any, handler?: any) => {
    const fn = typeof optsOrHandler === 'function' ? optsOrHandler : handler;
    // We register callables by testing context if needed
    return fn;
  }),
  onRequest: vi.fn((optsOrHandler: any, handler?: any) => {
    return typeof optsOrHandler === 'function' ? optsOrHandler : handler;
  }),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./core/mercadopago.service', () => ({
  createPreference: vi.fn((...args: any[]) => mockCreatePreference(...args)),
  getPaymentDetails: vi.fn(),
}));

import { createPaymentPreference } from './payment.functions';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createPaymentPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const paymentHandler = createPaymentPreference as unknown as (request: any) => Promise<any>;

  it('fails with invalid-argument if validation fails', async () => {
    await expect(
      paymentHandler({
        data: {
          items: [],
          external_reference: '',
        },
      }),
    ).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('creates payment preference using tenantDb for orders, products and variants', async () => {
    const validData = {
      items: [
        {
          productId: 'prod-1',
          variantId: 'var-1',
          title: 'Camiseta Test',
          quantity: 2,
          unit_price: 1500,
        },
      ],
      external_reference: 'order-123',
      projectId: 'vtx-sd-c3732d17',
    };

    const mockOrderData = {
      status: 'pending',
      storeId: 'store-test',
    };

    const mockProductData = {
      price: 1500,
      finalPrice: 1500,
    };

    const mockVariantData = {
      stock: 10,
    };

    const mockTransaction = {
      get: vi.fn().mockImplementation(async (ref: any) => {
        if (ref.id === 'order-123') {
          return { exists: true, data: () => mockOrderData };
        }
        if (ref.id === 'prod-1') {
          return { exists: true, data: () => mockProductData };
        }
        if (ref.id === 'var-1') {
          return { exists: true, data: () => mockVariantData };
        }
        return { exists: false, data: () => null };
      }),
      update: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (cb: any) => {
      return await cb(mockTransaction);
    });

    mockCreatePreference.mockResolvedValueOnce({
      id: 'pref-mp-123',
      init_point: 'https://mercadopago.com/checkout/123',
      date_of_expiration: new Date().toISOString(),
    });

    const mockDoc = (docId: string) => ({
      id: docId,
      collection: vi.fn(() => ({
        doc: (vId: string) => mockDoc(vId),
      })),
    });

    mockTenantDbCollection.mockImplementation((colName: string) => ({
      doc: (docId: string) => mockDoc(docId),
    }));

    const response = await paymentHandler({ data: validData });

    expect(mockRunTransaction).toHaveBeenCalled();
    expect(mockCreatePreference).toHaveBeenCalledWith(
      expect.objectContaining({
        external_reference: 'order-123',
        items: [
          {
            productId: 'prod-1',
            variantId: 'var-1',
            title: 'Camiseta Test',
            quantity: 2,
            unit_price: 1500,
          },
        ],
      }),
      'store-test',
    );
    expect(response).toEqual({
      id: 'pref-mp-123',
      init_point: 'https://mercadopago.com/checkout/123',
    });
  });

  it('creates payment preference for simple products without variant documents', async () => {
    const validData = {
      items: [
        {
          productId: 'prod-simple-1',
          variantId: 'default',
          title: 'Bandeja Cemento',
          quantity: 1,
          unit_price: 2500,
        },
      ],
      external_reference: 'order-456',
      projectId: 'vtx-sd-c3732d17',
    };

    const mockOrderData = {
      status: 'pending',
      storeId: 'store-test',
    };

    const mockProductData = {
      price: 2500,
      totalStock: 5,
    };

    const mockTransaction = {
      get: vi.fn().mockImplementation(async (ref: any) => {
        if (ref.id === 'order-456') {
          return { exists: true, data: () => mockOrderData };
        }
        if (ref.id === 'prod-simple-1') {
          return { exists: true, data: () => mockProductData };
        }
        // Subcollection variant does NOT exist
        return { exists: false, data: () => null };
      }),
      update: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (cb: any) => {
      return await cb(mockTransaction);
    });

    mockCreatePreference.mockResolvedValueOnce({
      id: 'pref-mp-456',
      init_point: 'https://mercadopago.com/checkout/456',
      date_of_expiration: new Date().toISOString(),
    });

    const mockDoc = (docId: string) => ({
      id: docId,
      collection: vi.fn(() => ({
        doc: (vId: string) => mockDoc(vId),
      })),
    });

    mockTenantDbCollection.mockImplementation((colName: string) => ({
      doc: (docId: string) => mockDoc(docId),
    }));

    const response = await paymentHandler({ data: validData });

    expect(mockRunTransaction).toHaveBeenCalled();
    expect(mockCreatePreference).toHaveBeenCalledWith(
      expect.objectContaining({
        external_reference: 'order-456',
        items: [
          {
            productId: 'prod-simple-1',
            variantId: 'default',
            title: 'Bandeja Cemento',
            quantity: 1,
            unit_price: 2500,
          },
        ],
      }),
      'store-test',
    );
    expect(response).toEqual({
      id: 'pref-mp-456',
      init_point: 'https://mercadopago.com/checkout/456',
    });
    // REGLA VERTEX: el stock NO se descuenta al crear la preferencia. La orden
    // queda PENDING_PAYMENT + stockDecremented:false; el descuento ocurre solo
    // en el webhook con pago 'approved'.
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-456' }),
      expect.objectContaining({
        status: 'PENDING_PAYMENT',
        paymentStatus: 'pending',
        stockDecremented: false,
      }),
    );
    // Verifica que NO se tocó el stock del producto durante la creación.
    const productUpdates = mockTransaction.update.mock.calls.filter(
      (c: any[]) => c[0]?.id === 'prod-simple-1',
    );
    expect(productUpdates).toHaveLength(0);
  });

  it('creates payment preference for simple products with null variantId validating stock against productData.stock', async () => {
    const validData = {
      items: [
        {
          productId: 'prod-simple-null-variant',
          variantId: null,
          title: 'Vela Aromática',
          quantity: 2,
          unit_price: 1200,
        },
      ],
      external_reference: 'order-789',
      projectId: 'vtx-sd-c3732d17',
    };

    const mockOrderData = {
      status: 'pending',
      storeId: 'store-test',
    };

    const mockProductData = {
      price: 1200,
      hasAttributes: false,
      stock: 8,
      totalStock: 8,
    };

    const mockTransaction = {
      get: vi.fn().mockImplementation(async (ref: any) => {
        if (ref.id === 'order-789') {
          return { exists: true, data: () => mockOrderData };
        }
        if (ref.id === 'prod-simple-null-variant') {
          return { exists: true, data: () => mockProductData };
        }
        return { exists: false, data: () => null };
      }),
      update: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (cb: any) => {
      return await cb(mockTransaction);
    });

    mockCreatePreference.mockResolvedValueOnce({
      id: 'pref-mp-789',
      init_point: 'https://mercadopago.com/checkout/789',
      date_of_expiration: new Date().toISOString(),
    });

    const mockDoc = (docId: string) => ({
      id: docId,
      collection: vi.fn(() => ({
        doc: (vId: string) => mockDoc(vId),
      })),
    });

    mockTenantDbCollection.mockImplementation((_colName: string) => ({
      doc: (docId: string) => mockDoc(docId),
    }));

    const response = await paymentHandler({ data: validData });

    expect(mockRunTransaction).toHaveBeenCalled();
    expect(mockCreatePreference).toHaveBeenCalledWith(
      expect.objectContaining({
        external_reference: 'order-789',
        items: [
          {
            productId: 'prod-simple-null-variant',
            variantId: null,
            title: 'Vela Aromática',
            quantity: 2,
            unit_price: 1200,
          },
        ],
      }),
      'store-test',
    );
    expect(response).toEqual({
      id: 'pref-mp-789',
      init_point: 'https://mercadopago.com/checkout/789',
    });
  });

  it('fails with resource-exhausted if simple product stock is insufficient', async () => {
    const validData = {
      items: [
        {
          productId: 'prod-simple-low-stock',
          variantId: null,
          title: 'Taza Cerámica',
          quantity: 10,
          unit_price: 500,
        },
      ],
      external_reference: 'order-low-stock',
      projectId: 'vtx-sd-c3732d17',
    };

    const mockOrderData = {
      status: 'pending',
      storeId: 'store-test',
    };

    const mockProductData = {
      price: 500,
      stock: 2,
      totalStock: 2,
    };

    const mockTransaction = {
      get: vi.fn().mockImplementation(async (ref: any) => {
        if (ref.id === 'order-low-stock') {
          return { exists: true, data: () => mockOrderData };
        }
        if (ref.id === 'prod-simple-low-stock') {
          return { exists: true, data: () => mockProductData };
        }
        return { exists: false, data: () => null };
      }),
      update: vi.fn(),
    };

    mockRunTransaction.mockImplementation(async (cb: any) => {
      return await cb(mockTransaction);
    });

    const mockDoc = (docId: string) => ({
      id: docId,
      collection: vi.fn(() => ({
        doc: (vId: string) => mockDoc(vId),
      })),
    });

    mockTenantDbCollection.mockImplementation((_colName: string) => ({
      doc: (docId: string) => mockDoc(docId),
    }));

    await expect(paymentHandler({ data: validData })).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });
});

