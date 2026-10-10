import {
  formatDeployTimestamp,
  getDeployLabel,
  formatStorefrontBanner,
  getEnvironmentBadgeInfo,
} from './deploy-info.util';

describe('deploy-info.util', () => {
  describe('formatDeployTimestamp', () => {
    it('returns empty string when given empty or undefined input', () => {
      expect(formatDeployTimestamp('')).toBe('');
      expect(formatDeployTimestamp(undefined)).toBe('');
    });

    it('returns original input when given invalid date string', () => {
      expect(formatDeployTimestamp('invalid-date')).toBe('invalid-date');
    });

    it('formats ISO timestamp to DD/MM/YYYY HH:mm:ss', () => {
      const iso = new Date(2026, 9, 2, 21, 59, 11).toISOString();
      const formatted = formatDeployTimestamp(iso);
      expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
      expect(formatted).toContain('02/10/2026');
    });
  });

  describe('getDeployLabel', () => {
    it('returns "Despliegue 1" by default when isRedeploy is false', () => {
      expect(getDeployLabel({})).toBe('Despliegue 1');
      expect(
        getDeployLabel({
          deployNumber: 1,
          redeployNumber: 0,
          isRedeploy: false,
        }),
      ).toBe('Despliegue 1');
    });

    it('returns "Despliegue N" when deployNumber is provided and not redeploy', () => {
      expect(
        getDeployLabel({
          deployNumber: 5,
          isRedeploy: false,
        }),
      ).toBe('Despliegue 5');
    });

    it('returns "Redespliegue N" when isRedeploy is true and redeployNumber > 0', () => {
      expect(
        getDeployLabel({
          deployNumber: 2,
          redeployNumber: 1,
          isRedeploy: true,
        }),
      ).toBe('Redespliegue 1');

      expect(
        getDeployLabel({
          deployNumber: 5,
          redeployNumber: 4,
          isRedeploy: true,
        }),
      ).toBe('Redespliegue 4');
    });
  });

  describe('formatStorefrontBanner', () => {
    it('formats initial deployment banner correctly', () => {
      const date = new Date(2026, 9, 2, 21, 59, 11);
      const banner = formatStorefrontBanner({
        version: 'v0.9.3',
        deployNumber: 1,
        redeployNumber: 0,
        isRedeploy: false,
        deployTimestamp: date.toISOString(),
      });

      expect(banner).toContain('[Vertex Storefront] v0.9.3 | Despliegue 1 | ');
      expect(banner).toContain('02/10/2026');
    });

    it('formats redeployment banner correctly', () => {
      const date = new Date(2026, 9, 2, 22, 15, 30);
      const banner = formatStorefrontBanner({
        version: '0.9.3',
        deployNumber: 2,
        redeployNumber: 1,
        isRedeploy: true,
        timestamp: date.toISOString(),
      });

      expect(banner).toContain('[Vertex Storefront] v0.9.3 | Redespliegue 1 | ');
      expect(banner).toContain('02/10/2026');
    });

    it('formats banner with fallback if timestamp is missing', () => {
      const banner = formatStorefrontBanner({
        version: '0.9.3',
        deployNumber: 3,
      });

      expect(banner).toBe('[Vertex Storefront] v0.9.3 | Despliegue 3');
    });
  });

  describe('getEnvironmentBadgeInfo', () => {
    it('identifies PR preview channels correctly', () => {
      const badge = getEnvironmentBadgeInfo(
        { commitSha: 'abcdef123456' },
        'ecommerce-vertex-dev--pr-45-xyz.web.app',
      );
      expect(badge.isSpecialDeploy).toBeTrue();
      expect(badge.type).toBe('preview');
      expect(badge.label).toBe('Preview PR #45');
      expect(badge.details).toBe('Commit abcdef1');
    });

    it('identifies PR preview channels without pr number fallback', () => {
      const badge = getEnvironmentBadgeInfo({ commitSha: 'unknown' }, 'site--pr-.web.app');
      expect(badge.isSpecialDeploy).toBeTrue();
      expect(badge.type).toBe('preview');
      expect(badge.label).toBe('Preview PR Preview');
      expect(badge.details).toBe('Canal Efímero');
    });

    it('identifies branch or test redeploys correctly on localhost / dev', () => {
      const badge = getEnvironmentBadgeInfo(
        { version: '0.9.4', commitSha: '1234567', isRedeploy: true, redeployNumber: 2 },
        'localhost',
      );
      expect(badge.isSpecialDeploy).toBeTrue();
      expect(badge.type).toBe('branch');
      expect(badge.label).toBe('Test / Rama [Redespliegue 2]');
      expect(badge.details).toBe('Commit 1234567');
    });

    it('returns test/branch info without commit fallback', () => {
      const badge = getEnvironmentBadgeInfo(
        { version: '0.9.4', commitSha: 'unknown', isRedeploy: true, redeployNumber: 1 },
        'localhost',
      );
      expect(badge.isSpecialDeploy).toBeTrue();
      expect(badge.type).toBe('branch');
      expect(badge.details).toBe('v0.9.4');
    });

    it('returns standard badge info on production standard hosts', () => {
      const badge = getEnvironmentBadgeInfo(
        { version: 'v0.9.4', commitSha: '1234567', isRedeploy: false },
        'mitienda.com',
      );
      expect(badge.isSpecialDeploy).toBeFalse();
      expect(badge.type).toBe('standard');
      expect(badge.label).toBe('v0.9.4');
    });

    it('works with default hostname and no params', () => {
      const badge = getEnvironmentBadgeInfo({});
      expect(badge).toBeDefined();
    });
  });
});
