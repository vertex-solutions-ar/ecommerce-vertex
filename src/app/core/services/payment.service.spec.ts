import { TestBed } from '@angular/core/testing';
import { PaymentService } from './payment.service';
import { Functions } from '@angular/fire/functions';

describe('PaymentService', () => {
  let service: PaymentService;
  let functionsSpy: jasmine.SpyObj<Functions>;

  beforeEach(() => {
    functionsSpy = jasmine.createSpyObj('Functions', ['type']);
    spyOn(console, 'warn');

    TestBed.configureTestingModule({
      providers: [PaymentService, { provide: Functions, useValue: functionsSpy }],
    });

    service = TestBed.inject(PaymentService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should resolve immediately if the promise-returning function succeeds on first try', async () => {
    const mockFn = jasmine.createSpy('mockFn').and.returnValue(Promise.resolve('Success'));

    const privateService = service as unknown as {
      retryWithBackoff<T>(fn: () => Promise<T>, retries?: number, delay?: number): Promise<T>;
    };

    const result = await privateService.retryWithBackoff(mockFn);

    expect(result).toBe('Success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry and eventually resolve if the function fails first but then succeeds', async () => {
    let callCount = 0;
    const mockFn = jasmine.createSpy('mockFn').and.callFake(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Transient Network Error'));
      }
      return Promise.resolve('Success after retry');
    });

    const privateService = service as unknown as {
      retryWithBackoff<T>(fn: () => Promise<T>, retries?: number, delay?: number): Promise<T>;
    };

    const result = await privateService.retryWithBackoff(mockFn, 3, 1);

    expect(result).toBe('Success after retry');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should fail and throw an error after all retries are exhausted', async () => {
    const mockFn = jasmine
      .createSpy('mockFn')
      .and.returnValue(Promise.reject(new Error('Persistent Error')));

    const privateService = service as unknown as {
      retryWithBackoff<T>(fn: () => Promise<T>, retries?: number, delay?: number): Promise<T>;
    };

    await expectAsync(privateService.retryWithBackoff(mockFn, 2, 1)).toBeRejectedWithError(
      'Persistent Error',
    );
    expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  describe('initiatePayment', () => {
    const mockItems = [
      {
        id: '1',
        productId: 'p1',
        variantId: 'v1',
        name: 'Producto 1',
        price: 1000,
        unitPrice: 1000,
        quantity: 2,
        image: '',
        attributes: {},
        stock: 5,
      },
    ];

    it('should return success and init_point when fetch succeeds', async () => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(JSON.stringify({ result: { init_point: 'https://mp.com/checkout/123' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const res = await service.initiatePayment(mockItems, 'ORD-1', {
        firstName: 'Juan',
        email: 'juan@test.com',
      });

      expect(res.success).toBeTrue();
      expect(res.init_point).toBe('https://mp.com/checkout/123');
    });

    it('should return error message when fetch returns non-ok response with error body', async () => {
      spyOn(console, 'error');
      const privateService = service as unknown as {
        retryWithBackoff: <T>(fn: () => Promise<T>) => Promise<T>;
      };
      spyOn(privateService, 'retryWithBackoff').and.callFake((fn) => fn());
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'Stock insuficiente' } }), {
            status: 400,
          }),
        ),
      );

      const res = await service.initiatePayment(mockItems, 'ORD-1');

      expect(res.success).toBeFalse();
      expect(res.error).toBe('Stock insuficiente');
    });

    it('should fallback to HTTP status when non-ok response has invalid JSON', async () => {
      spyOn(console, 'error');
      const privateService = service as unknown as {
        retryWithBackoff: <T>(fn: () => Promise<T>) => Promise<T>;
      };
      spyOn(privateService, 'retryWithBackoff').and.callFake((fn) => fn());
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response('Internal Error', { status: 500 })),
      );

      const res = await service.initiatePayment(mockItems, 'ORD-1');

      expect(res.success).toBeFalse();
      expect(res.error).toBe('HTTP 500');
    });
  });

  describe('confirmBankTransferOrder', () => {
    const mockItems = [
      {
        id: '1',
        productId: 'p1',
        variantId: 'v1',
        name: 'Producto 1',
        price: 1000,
        unitPrice: 1000,
        quantity: 1,
        image: '',
        attributes: {},
        stock: 5,
      },
    ];

    it('should return success and total when confirmBankTransferOrder succeeds', async () => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(JSON.stringify({ result: { total: 900 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const res = await service.confirmBankTransferOrder(
        'ORD-1',
        mockItems,
        'https://example.com/receipt.png',
      );

      expect(res.success).toBeTrue();
      expect(res.total).toBe(900);
    });

    it('should return error when confirmBankTransferOrder returns non-ok status', async () => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'Orden inválida' } }), { status: 400 }),
        ),
      );

      const res = await service.confirmBankTransferOrder('ORD-1', mockItems);

      expect(res.success).toBeFalse();
      expect(res.error).toBe('Orden inválida');
    });

    it('should fallback to HTTP status when confirmBankTransferOrder returns non-JSON error', async () => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response('Bad Gateway', { status: 502 })),
      );

      const res = await service.confirmBankTransferOrder('ORD-1', mockItems);

      expect(res.success).toBeFalse();
      expect(res.error).toBe('HTTP 502');
    });

    it('should gracefully return success: true when fetch throws network error', async () => {
      spyOn(window, 'fetch').and.returnValue(Promise.reject(new Error('Network offline')));

      const res = await service.confirmBankTransferOrder('ORD-1', mockItems);

      expect(res.success).toBeTrue();
    });
  });
});
