import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTenantDb } from './core/tenant-db';
import { singletonDoc } from './core/config';

export const BOT_USER_AGENTS_REGEX =
  /whatsapp|facebookexternalhit|twitterbot|telegrambot|linkedinbot|slackbot|discordbot/i;

export const DEFAULT_STORE_ID = 'white-label-store';
export const DEFAULT_STORE_NAME = 'Vertex Storefront';
export const DEFAULT_META_DESCRIPTION =
  'Descubre nuestra selección de productos con la mejor calidad, ofertas exclusivas y envíos rápidos. Compra online en Vertex Storefront.';
export const DEFAULT_IMAGE_URL =
  'https://vertex-storefront.web.app/assets/images/og-preview.png';

export interface SeoMetadata {
  storeName: string;
  description: string;
  imageUrl: string;
  fullUrl: string;
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  hostname?: string;
  query?: Record<string, unknown>;
  originalUrl?: string;
  url?: string;
  protocol?: string;
}

/**
 * Escapes characters that have special meaning in HTML attribute values.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Detects whether a URL points to an SVG vector graphic, including Firebase Storage URLs with query tokens.
 * Crawlers such as WhatsApp and Facebook strictly reject SVG preview images.
 */
export function isSvgUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean) return false;

  try {
    const parsed = new URL(clean, 'https://dummy.base');
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.svg')) return true;
    try {
      if (decodeURIComponent(pathname).endsWith('.svg')) return true;
    } catch {
      // Ignore decoding errors
    }
    return false;
  } catch {
    const pathWithoutQuery = clean.split('?')[0].split('#')[0].toLowerCase();
    return pathWithoutQuery.endsWith('.svg');
  }
}

/**
 * Normalizes an image or asset URL to an absolute HTTPS URL required by social media and WhatsApp scrapers.
 * - Resolves protocol-relative URLs (//cdn... -> https://cdn...).
 * - Resolves relative paths (/assets/... or assets/... -> https://${host}/...).
 * - Upgrades plain HTTP to HTTPS.
 * - Preserves secure HTTPS URLs unchanged.
 */
export function normalizeToAbsoluteHttps(url: string, host: string): string {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (!clean) return '';

  if (clean.startsWith('//')) {
    return `https:${clean}`;
  }
  if (clean.startsWith('https://')) {
    return clean;
  }
  if (clean.startsWith('http://')) {
    return `https://${clean.slice(7)}`;
  }
  if (clean.toLowerCase().startsWith('https://')) {
    return `https://${clean.slice(8)}`;
  }
  if (clean.toLowerCase().startsWith('http://')) {
    return `https://${clean.slice(7)}`;
  }

  // Limpiar host sin regex
  let cleanHost = (host || 'vertex-storefront.web.app').trim();
  if (cleanHost.startsWith('https://')) {
    cleanHost = cleanHost.slice(8);
  } else if (cleanHost.startsWith('http://')) {
    cleanHost = cleanHost.slice(7);
  }
  const slashIdx = cleanHost.indexOf('/');
  if (slashIdx !== -1) {
    cleanHost = cleanHost.slice(0, slashIdx);
  }

  const cleanPath = clean.startsWith('/') ? clean : `/${clean}`;
  return `https://${cleanHost}${cleanPath}`;
}

/**
 * Determines whether the request User-Agent belongs to a social media / chat preview scraper.
 */
export function isCrawlerBot(userAgent?: string): boolean {
  if (!userAgent || typeof userAgent !== 'string') {
    return false;
  }
  return BOT_USER_AGENTS_REGEX.test(userAgent);
}

/**
 * Resolves the storeId (tenant) from request headers or host, consistent with platform rules.
 */
export function resolveStoreIdFromRequest(req: RequestLike): string {
  // 1. Explicit query param override (useful for non-prod testing and verification)
  const rawQuery =
    (req.query?.['storeId'] as string) || (req.query?.['tenantId'] as string);
  if (rawQuery && typeof rawQuery === 'string' && rawQuery.trim()) {
    let cleanQuery = rawQuery.trim();
    if (cleanQuery.startsWith('vtx-') && cleanQuery.length > 4) {
      cleanQuery = cleanQuery.substring(4);
    } else if (cleanQuery.endsWith('-vtx') && cleanQuery.length > 4) {
      cleanQuery = cleanQuery.slice(0, -4);
    }

    const lowerQuery = cleanQuery.toLowerCase();
    if (
      cleanQuery &&
      lowerQuery !== 'ecommerce-vertex' &&
      lowerQuery !== 'ecommerce-vertex-dev' &&
      lowerQuery !== 'localhost' &&
      lowerQuery !== '127.0.0.1'
    ) {
      return cleanQuery;
    }
    return DEFAULT_STORE_ID;
  }

  // 2. Parse host from headers (x-forwarded-host has priority behind reverse proxies / CDN)
  const rawForwarded = req.headers['x-forwarded-host'];
  const forwardedHost = Array.isArray(rawForwarded)
    ? rawForwarded[0]
    : typeof rawForwarded === 'string'
      ? rawForwarded.split(',')[0]
      : undefined;

  const rawHost = forwardedHost || req.hostname || (req.headers['host'] as string) || '';
  const host = rawHost.split(':')[0].trim().toLowerCase();

  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return DEFAULT_STORE_ID;
  }

  // Handle Firebase Hosting Preview Channels (e.g. site--pr-12-hash.web.app)
  if (host.includes('--pr-')) {
    const prPart = host.split('--pr-')[1]?.split('.')[0]?.split('-')[0];
    if (prPart) {
      return `vtx-pr-${prPart}`;
    }
  }

  const firstLabel = host.split('.')[0] ?? '';

  let resolvedId = '';

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

  if (
    !resolvedId ||
    resolvedId === 'ecommerce-vertex' ||
    resolvedId === 'ecommerce-vertex-dev' ||
    resolvedId === 'localhost' ||
    resolvedId === '127.0.0.1'
  ) {
    return DEFAULT_STORE_ID;
  }

  return resolvedId;
}

const DEFAULT_BASE_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${DEFAULT_STORE_NAME}</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${DEFAULT_META_DESCRIPTION}" />
    <link rel="canonical" href="https://vertex-storefront.web.app/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${DEFAULT_STORE_NAME}" />
    <meta property="og:title" content="${DEFAULT_STORE_NAME}" />
    <meta property="og:description" content="${DEFAULT_META_DESCRIPTION}" />
    <meta property="og:image" content="${DEFAULT_IMAGE_URL}" />
    <meta property="og:image:secure_url" content="${DEFAULT_IMAGE_URL}" />
    <meta property="og:url" content="https://vertex-storefront.web.app/" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${DEFAULT_STORE_NAME}" />
    <meta name="twitter:description" content="${DEFAULT_META_DESCRIPTION}" />
    <meta name="twitter:image" content="${DEFAULT_IMAGE_URL}" />
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>`;

let cachedBaseHtml: string | null = null;

/**
 * Loads base HTML template, attempting to read from disk if available, or using fallback.
 */
export function getBaseHtml(): string {
  if (cachedBaseHtml) {
    return cachedBaseHtml;
  }

  const candidatePaths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, '../public/index.html'),
    path.join(__dirname, '../../dist/ecommerce-vertex/browser/index.html'),
    path.join(process.cwd(), 'dist/ecommerce-vertex/browser/index.html'),
    path.join(process.cwd(), 'src/index.html'),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        cachedBaseHtml = fs.readFileSync(candidate, 'utf-8');
        return cachedBaseHtml;
      }
    } catch {
      // Ignore file system read errors and try next candidate
    }
  }

  cachedBaseHtml = DEFAULT_BASE_HTML;
  return cachedBaseHtml;
}

export function stripSocialMetaTags(html: string): string {
  // Un solo cuantificador determinista [^>]* sin backtracking ambiguo
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const isSocialTag =
      tag.includes('property="og:') ||
      tag.includes("property='og:") ||
      tag.includes('name="og:') ||
      tag.includes("name='og:") ||
      tag.includes('name="twitter:') ||
      tag.includes("name='twitter:") ||
      tag.includes('property="twitter:') ||
      tag.includes("property='twitter:");
    return isSocialTag ? '' : tag;
  });
}

/**
 * Injects Open Graph and Twitter Card tags cleanly into the HTML head.
 * Removes existing og:* and twitter:* tags to prevent scraper confusion or duplicate metadata.
 */
export function injectSeoTags(baseHtml: string, metadata: SeoMetadata): string {
  const title = escapeHtml(metadata.storeName);
  const desc = escapeHtml(metadata.description);
  const img = escapeHtml(metadata.imageUrl);
  const url = escapeHtml(metadata.fullUrl);

  // 1. Remove existing Open Graph and Twitter Card tags to ensure clean injection
  let cleanHtml = stripSocialMetaTags(baseHtml);

  // 2. Replace document <title> if present
  if (/<title>.*?<\/title>/i.test(cleanHtml)) {
    cleanHtml = cleanHtml.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  }

  // 3. Build injected SEO tags block
  const injectedTags = `
    <!-- Dynamic Injected Open Graph / WhatsApp Preview Tags -->
    <meta name="description" content="${desc}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${title}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${img}" />
  `;

  // 4. Inject before </head> or append
  if (/<\/head>/i.test(cleanHtml)) {
    return cleanHtml.replace(/<\/head>/i, `${injectedTags}\n  </head>`);
  }

  return cleanHtml + injectedTags;
}

/**
 * Cloud Function HTTPS to handle dynamic SEO previews for WhatsApp and social bots.
 */
export const storefrontSeo = onRequest(
  { cors: true, invoker: 'public' },
  async (req, res) => {
    try {
      // Anti-cache poisoning: vary responses by User-Agent for intermediate proxies and CDN
      res.setHeader('Vary', 'User-Agent');

      const userAgent = (req.headers['user-agent'] as string) || '';
      const isBot = isCrawlerBot(userAgent);

      const baseHtml = getBaseHtml();

      // Normal browser flow: dispatch regular HTML
      if (!isBot) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).send(baseHtml);
        return;
      }

      // Crawler / Bot flow: resolve store and inject custom OG tags
      const storeId = resolveStoreIdFromRequest(req);
      const host =
        (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
        req.hostname ||
        'vertex-storefront.web.app';
      const protocol =
        (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const fullUrl = `${protocol}://${host}${req.originalUrl || req.url || '/'}`;

      let storeName = DEFAULT_STORE_NAME;
      let description = DEFAULT_META_DESCRIPTION;
      let imageUrl = normalizeToAbsoluteHttps(DEFAULT_IMAGE_URL, host);

      try {
        const db = resolveTenantDb();
        const storeDocRef = db.doc(singletonDoc(storeId, 'configuracion', 'store'));
        let snap = await storeDocRef.get();

        // Fallback to white-label-store if custom tenant document doesn't exist
        if (!snap.exists && storeId !== DEFAULT_STORE_ID) {
          snap = await db
            .doc(singletonDoc(DEFAULT_STORE_ID, 'configuracion', 'store'))
            .get();
        }

        if (snap.exists) {
          const data = snap.data() || {};
          const rawName = data['storeName'] || data['name'];
          storeName =
            typeof rawName === 'string' && rawName.trim()
              ? rawName.trim()
              : DEFAULT_STORE_NAME;

          const rawDesc =
            data['tagline'] ||
            data['seo']?.['metaDescription'] ||
            data['metaDescription'];
          description =
            typeof rawDesc === 'string' && rawDesc.trim()
              ? rawDesc.trim()
              : DEFAULT_META_DESCRIPTION;

          // Strict raster image fallback cascade for WhatsApp & Facebook (SVGs strictly rejected)
          const rawLogo =
            typeof data['logoUrl'] === 'string' ? data['logoUrl'].trim() : '';
          const rawBanner =
            typeof data['bannerUrl'] === 'string' ? data['bannerUrl'].trim() : '';

          const selectedImage =
            rawLogo && !isSvgUrl(rawLogo)
              ? rawLogo
              : rawBanner && !isSvgUrl(rawBanner)
                ? rawBanner
                : DEFAULT_IMAGE_URL;

          imageUrl = normalizeToAbsoluteHttps(selectedImage, host);
        }
      } catch (dbErr) {
        logger.warn(
          `[storefrontSeo] Error fetching store config for tenant "${storeId}":`,
          dbErr,
        );
        // Retain default values defensively
      }

      const injectedHtml = injectSeoTags(baseHtml, {
        storeName,
        description,
        imageUrl,
        fullUrl,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
      res.status(200).send(injectedHtml);
    } catch (err) {
      logger.error('[storefrontSeo] Unexpected error in SEO handler:', err);
      // Fallback safely to base HTML
      res.setHeader('Vary', 'User-Agent');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.status(200).send(DEFAULT_BASE_HTML);
    }
  },
);
