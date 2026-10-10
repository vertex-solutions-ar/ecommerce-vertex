import { bootstrapApplication } from '@angular/platform-browser';
import type { FirebaseOptions } from 'firebase/app';
import { createAppConfig } from './app/app.config';
import { App } from './app/app';
import { normalizeFirebaseOptions } from './app/core/utils/firebase-config.util';
import { environment } from './environments/environment';
import { STORE_CONFIG } from './environments/store.config';

import { resolveTenantId } from './app/core/utils/tenant';
import { version as pkgVersion } from '../package.json';
import { BUILD_INFO } from './environments/build-info';
import { formatStorefrontBanner } from './app/core/utils/deploy-info.util';

// 0. Versión y estampado del build (build stamping con trazabilidad absoluta).
//    Expuesta para verificación: console estilizado, window.__VERTEX_BUILD__ y <meta>.
const APP_VERSION = `v${pkgVersion}`;
try {
  // eslint-disable-next-line no-console
  console.log(
    `%c${formatStorefrontBanner(BUILD_INFO)}`,
    'background: #111827; color: #10b981; font-weight: bold; padding: 4px 8px; border-radius: 4px;',
  );
  (globalThis as Record<string, unknown>)['__VERTEX_STORE_VERSION__'] = APP_VERSION;
  (globalThis as Record<string, unknown>)['__VERTEX_BUILD__'] = BUILD_INFO;
  if (typeof window !== 'undefined') {
    (window as unknown as { __VERTEX_BUILD__?: typeof BUILD_INFO }).__VERTEX_BUILD__ = BUILD_INFO;
  }
  const meta = document.createElement('meta');
  meta.name = 'app-version';
  meta.content = APP_VERSION;
  document.head.appendChild(meta);

  // Procedencia del build: permite verificar desde el sitio qué ref se compiló realmente
  // (una rama de prueba no debe verse como una release). Ver deployment-source.ts.
  const sourceRef = (BUILD_INFO as { sourceRef?: string }).sourceRef ?? '';
  const sourceKind = (BUILD_INFO as { sourceKind?: string }).sourceKind ?? 'release';
  (globalThis as Record<string, unknown>)['__VERTEX_STORE_SOURCE__'] = {
    kind: sourceKind,
    ref: sourceRef || APP_VERSION,
  };
  if (sourceRef) {
    const sourceMeta = document.createElement('meta');
    sourceMeta.name = 'app-source-ref';
    sourceMeta.content = sourceRef;
    document.head.appendChild(sourceMeta);
  }
  const sourceKindMeta = document.createElement('meta');
  sourceKindMeta.name = 'app-source-kind';
  sourceKindMeta.content = sourceKind;
  document.head.appendChild(sourceKindMeta);
} catch {
  // Non-fatal: la app arranca igual sin los expositores de versión.
}

// 1. Dynamic Tenant ID inference
const resolvedTenant = resolveTenantId();
if (resolvedTenant) {
  environment.tenantId = resolvedTenant;
}

function inferStoreNameFromHostname(): string {
  const host = (globalThis.location?.hostname ?? '').trim().toLowerCase();
  if (!host) {
    return '';
  }

  let firstLabel = host.split('.')[0] ?? '';
  if (!firstLabel || firstLabel === 'localhost') {
    return '';
  }

  if (firstLabel.startsWith('vtx-')) {
    firstLabel = firstLabel.substring(4);
  }

  return firstLabel
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const bootTitle = STORE_CONFIG.storeName?.trim() || inferStoreNameFromHostname();
if (bootTitle) {
  document.title = bootTitle;
}

fetch('/firebase-config.json?t=' + new Date().getTime())
  .then((r) => (r.ok ? (r.json() as Promise<FirebaseOptions>) : Promise.reject(r.status)))
  .then((config) => {
    if (config && !config.projectId) {
      const inferredProject =
        config.authDomain?.trim().split('.')[0] ?? config.storageBucket?.trim().split('.')[0];
      if (inferredProject) {
        config.projectId = inferredProject;
      }
    }
    if (
      !config?.apiKey ||
      !config.projectId ||
      config.apiKey === 'test' ||
      config.projectId === 'ci-stub'
    ) {
      throw new Error('Invalid, incomplete, or stub firebase-config.json');
    }
    return config;
  })
  .catch(() => environment.firebaseConfig)
  .then((firebaseConfig) => {
    const normalized = normalizeFirebaseOptions(firebaseConfig);
    // Sincronizar el objeto global environment.firebaseConfig con la configuración real del shard
    Object.assign(environment.firebaseConfig, normalized);
    try {
      (globalThis as Record<string, unknown>)['__VERTEX_FIREBASE_PROJECT_ID__'] =
        normalized.projectId;
    } catch {
      // Ignorar en entornos sin window
    }
    return bootstrapApplication(App, createAppConfig(normalized));
  })
  .catch((err) => {
    console.error('Failed to load Firebase config:', err);
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#6b7280">Store configuration unavailable. Please try again later.</div>';
  });
