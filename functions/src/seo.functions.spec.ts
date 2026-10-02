import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firebase mocks (must come before importing module under test) ────────────

const { mockDocGet, mockDbDoc } = vi.hoisted(() => {
  const mockDocGet = vi.fn();
  const mockDbDoc = vi.fn(() => ({ get: mockDocGet }));
  return { mockDocGet, mockDbDoc };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: mockDbDoc,
  })),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((optsOrHandler: any, handler?: any) => {
    return typeof optsOrHandler === 'function' ? optsOrHandler : handler;
  }),
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  isCrawlerBot,
  resolveStoreIdFromRequest,
  escapeHtml,
  injectSeoTags,
  stripSocialMetaTags,
  isSvgUrl,
  normalizeToAbsoluteHttps,
  storefrontSeo,
  DEFAULT_STORE_NAME,
  DEFAULT_META_DESCRIPTION,
  DEFAULT_IMAGE_URL,
} from './seo.functions';

describe('SEO Cloud Functions', () => {
  describe('isCrawlerBot', () => {
    it('should detect WhatsApp User-Agent', () => {
      expect(isCrawlerBot('WhatsApp/2.21.12.21 A')).toBe(true);
      expect(isCrawlerBot('WhatsApp/2.19.244 i')).toBe(true);
    });

    it('should detect Facebook externalhit User-Agent', () => {
      expect(
        isCrawlerBot(
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        ),
      ).toBe(true);
    });

    it('should detect Twitterbot, TelegramBot, LinkedInBot, Slackbot, Discordbot', () => {
      expect(isCrawlerBot('Twitterbot/1.0')).toBe(true);
      expect(isCrawlerBot('TelegramBot (like TwitterBot)')).toBe(true);
      expect(isCrawlerBot('LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient)')).toBe(
        true,
      );
      expect(isCrawlerBot('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(
        true,
      );
      expect(isCrawlerBot('Discordbot/2.0; +https://discordapp.com')).toBe(true);
    });

    it('should return false for regular browser User-Agents', () => {
      expect(
        isCrawlerBot(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ),
      ).toBe(false);
      expect(
        isCrawlerBot(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        ),
      ).toBe(false);
    });

    it('should return false for empty or undefined User-Agent', () => {
      expect(isCrawlerBot('')).toBe(false);
      expect(isCrawlerBot(undefined)).toBe(false);
    });
  });

  describe('isSvgUrl', () => {
    it('should detect standard .svg URLs', () => {
      expect(isSvgUrl('https://storage.googleapis.com/logos/store.svg')).toBe(true);
      expect(isSvgUrl('/assets/images/logo.svg')).toBe(true);
      expect(isSvgUrl('logo.svg')).toBe(true);
    });

    it('should detect .svg URLs with query tokens (Firebase Storage tokens)', () => {
      expect(
        isSvgUrl(
          'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/store%2Flogo.svg?alt=media&token=abcdef-12345',
        ),
      ).toBe(true);
      expect(isSvgUrl('https://example.com/vector.svg?v=2&cache=false')).toBe(true);
    });

    it('should detect Firebase Storage SVG URLs with complex query parameters and tokens', () => {
      const storageSvgUrl =
        'https://firebasestorage.googleapis.com/v0/b/ecommerce-vertex.appspot.com/o/stores%2Fsublicup%2Fbrand-logo.svg?alt=media&token=a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(isSvgUrl(storageSvgUrl)).toBe(true);

      const storageSvgUrlWithParams =
        'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/store%2Flogo.SVG?alt=media&token=xyz&v=3';
      expect(isSvgUrl(storageSvgUrlWithParams)).toBe(true);
    });

    it('should be case-insensitive for SVG extension', () => {
      expect(isSvgUrl('https://storage.googleapis.com/logo.SVG')).toBe(true);
      expect(isSvgUrl('https://storage.googleapis.com/logo.Svg?token=xyz')).toBe(true);
    });

    it('should return false for raster formats (.png, .jpg, .jpeg, .webp)', () => {
      expect(isSvgUrl('https://storage.googleapis.com/logo.png')).toBe(false);
      expect(isSvgUrl('https://storage.googleapis.com/logo.jpg')).toBe(false);
      expect(isSvgUrl('https://storage.googleapis.com/logo.jpeg')).toBe(false);
      expect(isSvgUrl('https://storage.googleapis.com/logo.webp')).toBe(false);
      expect(
        isSvgUrl('https://storage.googleapis.com/logo.png?alt=media&token=123'),
      ).toBe(false);
    });

    it('should recognize raster URLs with Firebase Storage query parameters as false', () => {
      const storagePngUrl =
        'https://firebasestorage.googleapis.com/v0/b/ecommerce-vertex.appspot.com/o/stores%2Fsublicup%2Flogo.png?alt=media&token=123456';
      expect(isSvgUrl(storagePngUrl)).toBe(false);

      const storageWebpUrl =
        'https://firebasestorage.googleapis.com/v0/b/ecommerce-vertex.appspot.com/o/stores%2Fsublicup%2Fbanner.webp?alt=media&token=789012';
      expect(isSvgUrl(storageWebpUrl)).toBe(false);

      const storageJpgUrl =
        'https://firebasestorage.googleapis.com/v0/b/ecommerce-vertex.appspot.com/o/stores%2Fsublicup%2Fhero.jpg?alt=media&token=345678';
      expect(isSvgUrl(storageJpgUrl)).toBe(false);
    });

    it('should return false for empty or non-string inputs', () => {
      expect(isSvgUrl('')).toBe(false);
      expect(isSvgUrl(undefined)).toBe(false);
      expect(isSvgUrl(null as any)).toBe(false);
    });
  });

  describe('normalizeToAbsoluteHttps', () => {
    const defaultHost = 'vertex-storefront.web.app';

    it('should return secure HTTPS URLs unaltered', () => {
      const url = 'https://firebasestorage.googleapis.com/bucket/image.png';
      expect(normalizeToAbsoluteHttps(url, defaultHost)).toBe(url);
    });

    it('should upgrade plain HTTP URLs to HTTPS', () => {
      expect(
        normalizeToAbsoluteHttps('http://storage.com/image.png', defaultHost),
      ).toBe('https://storage.com/image.png');
    });

    it('should resolve protocol-relative URLs to HTTPS', () => {
      expect(
        normalizeToAbsoluteHttps('//cdn.example.com/assets/logo.png', defaultHost),
      ).toBe('https://cdn.example.com/assets/logo.png');
    });

    it('should resolve relative paths with leading slash', () => {
      expect(
        normalizeToAbsoluteHttps('/assets/images/logo.png', 'mitienda.com'),
      ).toBe('https://mitienda.com/assets/images/logo.png');
    });

    it('should resolve relative paths without leading slash', () => {
      expect(
        normalizeToAbsoluteHttps('assets/images/banner.jpg', 'mitienda.com'),
      ).toBe('https://mitienda.com/assets/images/banner.jpg');
    });

    it('should sanitize host with protocol or trailing slashes', () => {
      expect(
        normalizeToAbsoluteHttps('/logo.png', 'https://tienda.web.app/'),
      ).toBe('https://tienda.web.app/logo.png');
    });

    it('should return empty string for empty or non-string values', () => {
      expect(normalizeToAbsoluteHttps('', defaultHost)).toBe('');
      expect(normalizeToAbsoluteHttps('   ', defaultHost)).toBe('');
      expect(normalizeToAbsoluteHttps(undefined as any, defaultHost)).toBe('');
    });
  });

  describe('resolveStoreIdFromRequest', () => {
    it('should prioritize explicit query params storeId or tenantId', () => {
      const req = {
        headers: { 'x-forwarded-host': 'mi-tienda.vertex.app' },
        query: { storeId: 'custom-query-store' },
      };
      expect(resolveStoreIdFromRequest(req)).toBe('custom-query-store');

      const reqTenant = {
        headers: {},
        query: { tenantId: 'tenant-query' },
      };
      expect(resolveStoreIdFromRequest(reqTenant)).toBe('tenant-query');
    });

    it('should extract subdomain from x-forwarded-host', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'techstore.vertex.app' },
        }),
      ).toBe('techstore');
    });

    it('should strip vtx- prefix from Firebase Hosting siteIds', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'vtx-calzados.web.app' },
        }),
      ).toBe('calzados');
    });

    it('should strip -vtx suffix from {slug}-vtx pattern', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'indumentaria-vtx.web.app' },
        }),
      ).toBe('indumentaria');
    });

    it('should handle Firebase Hosting preview channels', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'site--pr-108-hash.web.app' },
        }),
      ).toBe('vtx-pr-108');
    });

    it('should fallback to white-label-store for localhost or default platform domains', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'localhost:4200' },
        }),
      ).toBe('white-label-store');

      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'ecommerce-vertex.web.app' },
        }),
      ).toBe('white-label-store');

      expect(
        resolveStoreIdFromRequest({
          headers: {},
        }),
      ).toBe('white-label-store');
    });

    it('should resolve sublicup from hostname vtx-sublicup.web.app', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'vtx-sublicup.web.app' },
        }),
      ).toBe('sublicup');

      expect(
        resolveStoreIdFromRequest({
          headers: {},
          hostname: 'vtx-sublicup.web.app',
        }),
      ).toBe('sublicup');
    });

    it('should resolve sublicup from query parameter ?tenantId=vtx-sublicup and ?storeId=vtx-sublicup', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: {},
          query: { tenantId: 'vtx-sublicup' },
        }),
      ).toBe('sublicup');

      expect(
        resolveStoreIdFromRequest({
          headers: { 'x-forwarded-host': 'ecommerce-vertex.web.app' },
          query: { tenantId: '  vtx-sublicup  ' },
        }),
      ).toBe('sublicup');

      expect(
        resolveStoreIdFromRequest({
          headers: {},
          query: { storeId: 'vtx-sublicup' },
        }),
      ).toBe('sublicup');
    });

    it('should strip -vtx suffix from query parameter', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: {},
          query: { tenantId: 'sublicup-vtx' },
        }),
      ).toBe('sublicup');
    });

    it('should fallback to white-label-store for platform query parameters', () => {
      expect(
        resolveStoreIdFromRequest({
          headers: {},
          query: { tenantId: 'ecommerce-vertex' },
        }),
      ).toBe('white-label-store');

      expect(
        resolveStoreIdFromRequest({
          headers: {},
          query: { tenantId: 'vtx-ecommerce-vertex' },
        }),
      ).toBe('white-label-store');
    });
  });

  describe('escapeHtml and injectSeoTags', () => {
    it('should properly escape HTML special characters to prevent injection', () => {
      expect(escapeHtml('<script>alert("xss") & \'test\'</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;) &amp; &#39;test&#39;&lt;/script&gt;',
      );
    });

    it('should inject Open Graph and Twitter Card tags into HTML head', () => {
      const baseHtml = `<!doctype html><html><head><title>Old Title</title></head><body><app-root></app-root></body></html>`;
      const metadata = {
        storeName: 'Mi Tienda VIP',
        description: 'Venta de zapatillas exclusivas',
        imageUrl: 'https://cdn.example.com/logo.png',
        fullUrl: 'https://mitienda.com/',
      };

      const result = injectSeoTags(baseHtml, metadata);

      expect(result).toContain('<title>Mi Tienda VIP</title>');
      expect(result).toContain('<meta property="og:title" content="Mi Tienda VIP" />');
      expect(result).toContain(
        '<meta property="og:description" content="Venta de zapatillas exclusivas" />',
      );
      expect(result).toContain(
        '<meta property="og:image" content="https://cdn.example.com/logo.png" />',
      );
      expect(result).toContain(
        '<meta property="og:url" content="https://mitienda.com/" />',
      );
      expect(result).toContain('<meta property="og:type" content="website" />');
      expect(result).toContain(
        '<meta name="twitter:card" content="summary_large_image" />',
      );
      expect(result).toContain('<meta name="twitter:title" content="Mi Tienda VIP" />');
    });

    it('should clean pre-existing duplicate og and twitter tags before injection', () => {
      const baseHtml = `<!doctype html><html><head>
        <title>Default</title>
        <meta property="og:title" content="Old OG Title" />
        <meta name="twitter:title" content="Old Twitter Title" />
      </head><body><app-root></app-root></body></html>`;

      const stripped = stripSocialMetaTags(baseHtml);
      expect(stripped).not.toContain('Old OG Title');
      expect(stripped).not.toContain('Old Twitter Title');

      const result = injectSeoTags(baseHtml, {
        storeName: 'Nueva Tienda',
        description: 'Nueva descripción',
        imageUrl: 'https://cdn.example.com/new.png',
        fullUrl: 'https://nuevatienda.com/',
      });

      expect(result).not.toContain('Old OG Title');
      expect(result).not.toContain('Old Twitter Title');
      expect(result).toContain('Nueva Tienda');
    });
  });

  describe('storefrontSeo HTTP handler', () => {
    let mockReq: any;
    let mockRes: any;
    let responseHeaders: Record<string, string>;
    let responseStatus: number;
    let responseBody: string;

    beforeEach(() => {
      vi.clearAllMocks();
      responseHeaders = {};
      responseStatus = 200;
      responseBody = '';

      mockRes = {
        setHeader: vi.fn((key: string, val: string) => {
          responseHeaders[key.toLowerCase()] = val;
          return mockRes;
        }),
        status: vi.fn((code: number) => {
          responseStatus = code;
          return mockRes;
        }),
        send: vi.fn((data: string) => {
          responseBody = data;
          return mockRes;
        }),
      };
    });

    it('should return regular HTML with no-cache headers when request is NOT from a bot', async () => {
      mockReq = {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'x-forwarded-host': 'tienda-test.web.app',
        },
        hostname: 'tienda-test.web.app',
        originalUrl: '/',
      };

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseHeaders['content-type']).toBe('text/html; charset=utf-8');
      expect(responseHeaders['cache-control']).toBe(
        'no-cache, no-store, must-revalidate',
      );
      expect(responseBody).toContain('<app-root>');
      expect(mockDbDoc).not.toHaveBeenCalled();
    });

    it('should query Firestore and inject custom OG metadata for WhatsApp bot', async () => {
      mockReq = {
        headers: {
          'user-agent': 'WhatsApp/2.21.12.21 A',
          'x-forwarded-host': 'libreria-central.web.app',
          'x-forwarded-proto': 'https',
        },
        hostname: 'libreria-central.web.app',
        originalUrl: '/catalogo',
      };

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          storeName: 'Librería Central',
          tagline: 'Libros y novedades literarias',
          logoUrl: 'https://storage.googleapis.com/logos/libreria.png',
        }),
      });

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(mockDbDoc).toHaveBeenCalledWith('configuracion/store_libreria-central');
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseHeaders['cache-control']).toBe(
        'public, max-age=300, s-maxage=600',
      );
      expect(responseBody).toContain('<meta property="og:title" content="Librería Central" />');
      expect(responseBody).toContain(
        '<meta property="og:description" content="Libros y novedades literarias" />',
      );
      expect(responseBody).toContain(
        '<meta property="og:image" content="https://storage.googleapis.com/logos/libreria.png" />',
      );
      expect(responseBody).toContain(
        '<meta property="og:url" content="https://libreria-central.web.app/catalogo" />',
      );
    });

    it('should inject raster bannerUrl when logoUrl is SVG and bannerUrl is raster', async () => {
      mockReq = {
        headers: {
          'user-agent': 'WhatsApp/2.21.12.21 A',
          'x-forwarded-host': 'tienda-svg.web.app',
        },
        hostname: 'tienda-svg.web.app',
        originalUrl: '/',
      };

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          storeName: 'Tienda Vectorial',
          tagline: 'Tienda con logo vectorial',
          logoUrl: 'https://storage.googleapis.com/logos/vector.svg?alt=media&token=123',
          bannerUrl: 'https://storage.googleapis.com/banners/promo-raster.jpg',
        }),
      });

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseBody).toContain(
        '<meta property="og:image" content="https://storage.googleapis.com/banners/promo-raster.jpg" />',
      );
      expect(responseBody).not.toContain('vector.svg');
    });

    it('should inject DEFAULT_IMAGE_URL PNG when both logoUrl and bannerUrl are SVG', async () => {
      mockReq = {
        headers: {
          'user-agent': 'WhatsApp/2.21.12.21 A',
          'x-forwarded-host': 'tienda-all-svg.web.app',
        },
        hostname: 'tienda-all-svg.web.app',
        originalUrl: '/',
      };

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          storeName: 'Tienda Full SVG',
          tagline: 'Solo vectores',
          logoUrl: 'https://storage.googleapis.com/logos/brand.svg',
          bannerUrl: 'https://storage.googleapis.com/banners/hero.svg?alt=media',
        }),
      });

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseBody).toContain(
        `<meta property="og:image" content="${DEFAULT_IMAGE_URL}" />`,
      );
      expect(responseBody).not.toContain('brand.svg');
      expect(responseBody).not.toContain('hero.svg');
    });

    it('should include Vary: User-Agent header for both bot and regular human requests (anti-poisoning)', async () => {
      // 1. Human browser request
      mockReq = {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'x-forwarded-host': 'tienda-human.web.app',
        },
        hostname: 'tienda-human.web.app',
        originalUrl: '/',
      };

      await (storefrontSeo as any)(mockReq, mockRes);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseHeaders['cache-control']).toBe(
        'no-cache, no-store, must-revalidate',
      );

      // 2. Bot request
      responseHeaders = {};
      mockReq = {
        headers: {
          'user-agent': 'facebookexternalhit/1.1',
          'x-forwarded-host': 'tienda-bot.web.app',
        },
        hostname: 'tienda-bot.web.app',
        originalUrl: '/',
      };

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ storeName: 'Bot Store' }),
      });

      await (storefrontSeo as any)(mockReq, mockRes);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseHeaders['cache-control']).toBe(
        'public, max-age=300, s-maxage=600',
      );
    });

    it('should fallback gracefully to defaults when Firestore document does not exist', async () => {
      mockReq = {
        headers: {
          'user-agent': 'facebookexternalhit/1.1',
          'x-forwarded-host': 'tienda-inexistente.web.app',
        },
        hostname: 'tienda-inexistente.web.app',
        originalUrl: '/',
      };

      // Both tenant and fallback white-label-store return exists: false
      mockDocGet.mockResolvedValue({
        exists: false,
        data: () => null,
      });

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseHeaders['cache-control']).toBe(
        'public, max-age=300, s-maxage=600',
      );
      expect(responseBody).toContain(
        `<meta property="og:title" content="${DEFAULT_STORE_NAME}" />`,
      );
      expect(responseBody).toContain(
        `<meta property="og:description" content="${DEFAULT_META_DESCRIPTION}" />`,
      );
      expect(responseBody).toContain(
        `<meta property="og:image" content="${DEFAULT_IMAGE_URL}" />`,
      );
    });

    it('should handle Firestore errors defensively and return 200 with fallback tags', async () => {
      mockReq = {
        headers: {
          'user-agent': 'WhatsApp/2.21.12.21 A',
          'x-forwarded-host': 'tienda-error.web.app',
        },
        hostname: 'tienda-error.web.app',
        originalUrl: '/',
      };

      mockDocGet.mockRejectedValueOnce(new Error('Firestore network timeout'));

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(responseHeaders['vary']).toBe('User-Agent');
      expect(responseHeaders['cache-control']).toBe(
        'public, max-age=300, s-maxage=600',
      );
      expect(responseBody).toContain(
        `<meta property="og:title" content="${DEFAULT_STORE_NAME}" />`,
      );
    });

    it('should resolve tenant sublicup from vtx-sublicup.web.app, fetch store_sublicup, and extract StoreConfig fields', async () => {
      mockReq = {
        headers: {
          'user-agent': 'WhatsApp/2.21.12.21 A',
          'x-forwarded-host': 'vtx-sublicup.web.app',
          'x-forwarded-proto': 'https',
        },
        hostname: 'vtx-sublicup.web.app',
        originalUrl: '/',
      };

      const storagePng =
        'https://firebasestorage.googleapis.com/v0/b/ecommerce-vertex.appspot.com/o/stores%2Fsublicup%2Flogo.png?alt=media&token=abc-123';

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          storeName: 'Sublicup Sublimaciones',
          tagline: 'Tazas personalizadas y merchandising',
          logoUrl: storagePng,
        }),
      });

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(mockDbDoc).toHaveBeenCalledWith('configuracion/store_sublicup');
      expect(responseBody).toContain(
        '<meta property="og:title" content="Sublicup Sublimaciones" />',
      );
      expect(responseBody).toContain(
        '<meta property="og:description" content="Tazas personalizadas y merchandising" />',
      );
      expect(responseBody).toContain(
        `<meta property="og:image" content="${escapeHtml(storagePng)}" />`,
      );
      expect(responseBody).toContain(
        '<meta property="og:url" content="https://vtx-sublicup.web.app/" />',
      );
    });

    it('should respect StoreConfig fallback fields: name fallback and seo.metaDescription fallback', async () => {
      mockReq = {
        headers: {
          'user-agent': 'facebookexternalhit/1.1',
          'x-forwarded-host': 'ecommerce-vertex.web.app',
        },
        hostname: 'ecommerce-vertex.web.app',
        query: { tenantId: 'vtx-sublicup' },
        originalUrl: '/catalogo',
      };

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          name: 'Sublicup Legacy Name',
          seo: {
            metaDescription: 'Descripción desde seo.metaDescription',
          },
        }),
      });

      await (storefrontSeo as any)(mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(mockDbDoc).toHaveBeenCalledWith('configuracion/store_sublicup');
      expect(responseBody).toContain(
        '<meta property="og:title" content="Sublicup Legacy Name" />',
      );
      expect(responseBody).toContain(
        '<meta property="og:description" content="Descripción desde seo.metaDescription" />',
      );
    });
  });
});
