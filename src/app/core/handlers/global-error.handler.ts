import { Injectable } from '@angular/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Injector } from '@angular/core';
import type { ErrorHandler } from '@angular/core';
import { SweetAlertService } from '@core/services/sweet-alert.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector) {}

  handleError(error: unknown): void {
    // Technical log for developer diagnostics
    console.error('[Global Error Intercepted]:', error);

    // 1. Detectar si el error es debido a un redespliegue de la tienda (chunks JS desactualizados)
    if (this.isDeploymentOrChunkError(error)) {
      this.handleDeploymentReload();
      return;
    }

    // 2. Notificación controlada para errores comunes sin bloquear la pantalla
    try {
      const sweetAlert = this.injector.get(SweetAlertService);
      sweetAlert.error(
        '¡Ups! Algo salió mal',
        'El sistema ha experimentado una anomalía inesperada. Nos hemos degradado de forma segura; puedes seguir utilizando la aplicación.',
      );
    } catch (err) {
      console.error('Failed to notify via SweetAlert:', err);
    }
  }

  private isDeploymentOrChunkError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const message =
      error instanceof Error
        ? `${error.message} ${error.name} ${error.stack ?? ''}`
        : String(error);

    return (
      message.includes('Loading chunk') ||
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Importing a module script failed') ||
      message.includes('error loading dynamically imported module') ||
      message.includes('ChunkLoadError') ||
      message.includes('is not a valid JavaScript MIME type')
    );
  }

  private handleDeploymentReload(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const RELOAD_KEY = 'vtx_chunk_reload_ts';
    let lastReload: string | null = null;
    try {
      lastReload = sessionStorage.getItem(RELOAD_KEY);
    } catch {
      // SecurityError in Safari private mode
    }
    const now = Date.now();

    // Evitar loop infinito si hay problemas de red persistentes (mínimo 15s de gracia)
    if (!lastReload || now - Number(lastReload) > 15000) {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(now));
      } catch {
        // Ignorar si sessionStorage está bloqueado
      }
      try {
        const sweetAlert = this.injector.get(SweetAlertService);
        sweetAlert.info(
          'Actualizando Tienda',
          'Se ha desplegado una nueva versión de la tienda. Actualizando la página...',
        );
      } catch {
        // Fallback silencioso si SweetAlert no está listo
      }

      setTimeout(() => {
        this.reloadLocation();
      }, 1200);
    }
  }

  reloadLocation(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}
