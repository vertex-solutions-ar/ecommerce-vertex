import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import type { Injector } from '@angular/core';
import { GlobalErrorHandler } from './global-error.handler';
import { SweetAlertService } from '@core/services/sweet-alert.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let sweetAlertSpy: jasmine.SpyObj<SweetAlertService>;

  beforeEach(() => {
    sweetAlertSpy = jasmine.createSpyObj('SweetAlertService', ['error', 'info']);

    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler, { provide: SweetAlertService, useValue: sweetAlertSpy }],
    });

    handler = TestBed.inject(GlobalErrorHandler);
    sessionStorage.clear();
    spyOn(handler, 'reloadLocation').and.stub();
  });

  it('should be created', () => {
    expect(handler).toBeTruthy();
  });

  it('should catch errors, log them, and trigger SweetAlert error notification', () => {
    spyOn(console, 'error');
    const mockError = new Error('Test Crash');

    handler.handleError(mockError);

    expect(console.error).toHaveBeenCalledWith('[Global Error Intercepted]:', mockError);
    expect(sweetAlertSpy.error).toHaveBeenCalledWith(
      '¡Ups! Algo salió mal',
      'El sistema ha experimentado una anomalía inesperada. Nos hemos degradado de forma segura; puedes seguir utilizando la aplicación.',
    );
  });

  it('should handle chunk / deployment load errors with reload notification and scheduled reload', fakeAsync(() => {
    spyOn(console, 'error');
    const chunkError = new Error('Failed to fetch dynamically imported module: chunk-xyz.js');

    handler.handleError(chunkError);

    expect(sweetAlertSpy.info).toHaveBeenCalledWith(
      'Actualizando Tienda',
      'Se ha desplegado una nueva versión de la tienda. Actualizando la página...',
    );

    tick(1500);
    expect(handler.reloadLocation).toHaveBeenCalled();
  }));

  it('should handle SweetAlert injector failure gracefully without crashing', () => {
    spyOn(console, 'error');
    const failingInjector = {
      get: () => {
        throw new Error('Injection Failed');
      },
    } as unknown as Injector;

    const handlerWithFailingInjector = new GlobalErrorHandler(failingInjector);

    expect(() => {
      handlerWithFailingInjector.handleError(new Error('Another Test'));
    }).not.toThrow();

    expect(console.error).toHaveBeenCalledWith(
      'Failed to notify via SweetAlert:',
      jasmine.any(Error),
    );
  });

  it('should handle sessionStorage throwing errors when handling deployment reload', fakeAsync(() => {
    spyOn(sessionStorage, 'getItem').and.throwError(new Error('SecurityError'));
    spyOn(sessionStorage, 'setItem').and.throwError(new Error('SecurityError'));

    const chunkError = new Error('Failed to fetch dynamically imported module');
    expect(() => handler.handleError(chunkError)).not.toThrow();

    tick(1500);
    expect(handler.reloadLocation).toHaveBeenCalled();
  }));
});
