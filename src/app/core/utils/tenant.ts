import { environment } from '../../../environments/environment';
import { where, type QueryConstraint } from '@angular/fire/firestore';

/**
 * Returns the flat root-level collection name for the storefront's Firestore.
 * Multi-tenant isolation is enforced via the `storeId` field on every document
 * (see storeIdFilter()), not via namespaced `tenants/{tenantId}/...` paths.
 */
export function tenantPath(collection: string): string {
  return collection;
}

/**
 * Builds the deterministic storeId-keyed document id for singleton content docs
 * (e.g. `footer_<storeId>`, `hero_<storeId>`, `store_<storeId>`, `home_<storeId>`, `aboutUs_<storeId>`).
 */
export function storeDocId(base: string): string {
  return `${base}_${resolveTenantId()}`;
}

/**
 * Query constraint that filters a flat collection to the active store's documents.
 * Apply this to every Firestore query in catalog services:
 * `query(collection(this.firestore, 'products'), storeIdFilter())`.
 */
export function storeIdFilter(): QueryConstraint {
  return where('storeId', '==', resolveTenantId());
}

/**
 * Resolves the tenant ID with the following priority:
 * 1. environment.tenantId (baked at build time, or set by provisioning)
 * 2. Hostname parsing: supports {slug}-vtx and vtx-{slug} patterns
 * 3. Query parameter ?tenantId= override (non-production only)
 * 4. Empty string fallback
 *
 * @param locationOverride Optional Location-like object for testing (defaults to globalThis.location)
 */
export function resolveTenantId(locationOverride?: { hostname: string; search: string }): string {
  // Priority 1: explicit tenantId from environment
  if (environment.tenantId && environment.tenantId !== 'store') {
    return environment.tenantId;
  }

  const loc =
    locationOverride ?? (typeof globalThis !== 'undefined' ? globalThis.location : undefined);

  let resolvedId = '';

  // Priority 2: infer from hostname
  if (loc) {
    const host = loc.hostname?.trim().toLowerCase();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      // Handle Firebase Hosting Preview Channels (e.g. site--pr-12-hash.web.app)
      if (host.includes('--pr-')) {
        const match = host.match(/--pr-(\d+)/);
        if (match?.[1]) {
          resolvedId = `vtx-pr-${match[1]}`;
        }
      }

      if (!resolvedId) {
        const firstLabel = host.split('.')[0] ?? '';

        // Handle {slug}-vtx pattern (e.g., "tienda-a-vtx" → "tienda-a")
        if (firstLabel.endsWith('-vtx') && firstLabel.length > 4) {
          resolvedId = firstLabel.slice(0, -4);
        } else if (
          firstLabel &&
          firstLabel !== 'ecommerce-vertex' &&
          firstLabel !== 'ecommerce-vertex-dev'
        ) {
          // Strip vtx- prefix: Firebase Hosting siteIds for stores use the pattern
          // "vtx-{slug}" but the actual tenantId in Firestore/admin_roles is "{slug}".
          // This mirrors the server-side strip in role.functions.ts resolveTenantId().
          resolvedId = firstLabel.startsWith('vtx-') ? firstLabel.substring(4) : firstLabel;
        }
      }
    }

    // Priority 3: query param override (non-production only)
    if (!resolvedId && !environment.production) {
      const urlParams = new URLSearchParams(loc.search);
      const queryTenantId = urlParams.get('tenantId');
      if (queryTenantId) {
        resolvedId = queryTenantId.trim();
      }
    }
  }

  // Priority 3.5: localStorage persistence and fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    if (resolvedId) {
      window.localStorage.setItem('vertex_tenant_id', resolvedId);
    } else {
      const stored = window.localStorage.getItem('vertex_tenant_id');
      if (stored) {
        resolvedId = stored;
      }
    }
  }

  // Priority 4: fall back to whatever environment has (even if empty)
  return resolvedId || environment.tenantId || '';
}
