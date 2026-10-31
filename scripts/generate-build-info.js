/**
 * Genera metadatos del build para trazabilidad absoluta de redeploys.
 * Genera:
 *   - src/environments/build-info.ts (tipado TypeScript)
 *   - src/assets/version.json (endpoint HTTP accesible vía CDN)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getCommitSha() {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.substring(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getPackageVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getEnvironmentName() {
  return process.env.NODE_ENV || process.env.VERCEL_ENV || process.env.ENVIRONMENT || 'production';
}

/**
 * Procedencia real del build: de qué ref de git se compiló.
 *
 * El workflow de provisión exporta DEPLOY_SOURCE_KIND / DEPLOY_SOURCE_REF a partir del
 * `client_payload.ref` despachado por la plataforma:
 *  - `release` → tag publicado `vX.Y.Z` (canal estable)
 *  - `branch`  → rama (ej. `develop`, `feat/x`) — despliegue de prueba, sin tag
 *  - `commit`  → SHA puntual — despliegue de prueba, sin tag
 *
 * Sin estas variables (build local o `deploy-all-stores`) se asume `release`, que es el
 * caso histórico: compilar un tag/release.
 */
function getSourceKind() {
  const raw = (process.env.DEPLOY_SOURCE_KIND || '').trim().toLowerCase();
  return ['release', 'branch', 'commit'].includes(raw) ? raw : 'release';
}

function getSourceRef() {
  return (process.env.DEPLOY_SOURCE_REF || '').trim();
}

/**
 * Tenant que el bundle va a resolver en runtime: se lee del archivo de environment
 * con el que se compila (el workflow de provisión reescribe `environment.prod.ts` con
 * el `tenantId` de la tienda antes de buildear).
 */
function getResolvedTenantId() {
  const candidates = [
    'environment.prod.ts',
    'environment.dev-template.ts',
    'environment.store.ts',
    'environment.ts',
  ];
  const dir = path.resolve(__dirname, '../src/environments');
  for (const file of candidates) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) continue;
    const match = fs
      .readFileSync(filePath, 'utf-8')
      .match(new RegExp('tenantId:\\s*[\'"]([^\'"]*)[\'"]'));
    if (match && match[1]) return match[1];
  }
  return '';
}

/**
 * Guarda de wiring del tenant (prevención de un incidente real en producción).
 *
 * El pipeline de provisión declara el tenant esperado en `DEPLOY_TENANT_ID`. Si el
 * environment compilado resuelve otro tenant — o el placeholder `store`, que hace que
 * el storefront resuelva por hostname y lea datos de OTRA tienda — se aborta el build
 * antes de publicar nada. Sólo se aplica cuando el pipeline declara la expectativa: los
 * builds de plantilla resuelven el tenant en runtime a propósito.
 */
function assertTenantWiring(resolvedTenantId) {
  const expected = (process.env.DEPLOY_TENANT_ID || '').trim();
  if (!expected) return;
  if (!resolvedTenantId) {
    throw new Error(
      `[build-info] WRONG_TENANT: el build no expone tenantId y se esperaba '${expected}'. ` +
        'Revisá la inyección de `tenantId` en el environment antes de desplegar.',
    );
  }
  if (resolvedTenantId !== expected) {
    throw new Error(
      `[build-info] WRONG_TENANT: el bundle resolvería el tenant '${resolvedTenantId}' pero se ` +
        `esperaba '${expected}'. Un tenant distinto hace que el storefront lea datos de otra ` +
        'tienda. Build abortado.',
    );
  }
}

function main() {
  const version = getPackageVersion();
  const commitSha = getCommitSha();
  const deployTimestamp = process.env.DEPLOY_TIMESTAMP || new Date().toISOString();
  const env = getEnvironmentName();
  const deployNumber = parseInt(process.env.DEPLOY_NUMBER || '1', 10) || 1;
  const redeployNumber = parseInt(process.env.REDEPLOY_NUMBER || '0', 10) || 0;
  const isRedeploy =
    process.env.IS_REDEPLOY !== undefined
      ? process.env.IS_REDEPLOY === 'true' || process.env.IS_REDEPLOY === '1'
      : redeployNumber > 0;
  const sourceKind = getSourceKind();
  const sourceRef = getSourceRef();
  const tenantId = getResolvedTenantId();
  assertTenantWiring(tenantId);

  const buildInfo = {
    version,
    commitSha,
    timestamp: deployTimestamp,
    env,
    deployNumber,
    redeployNumber,
    isRedeploy,
    deployTimestamp,
    sourceKind,
    sourceRef,
    tenantId,
  };

  const environmentsDir = path.resolve(__dirname, '../src/environments');
  const assetsDir = path.resolve(__dirname, '../src/assets');

  if (!fs.existsSync(environmentsDir)) {
    fs.mkdirSync(environmentsDir, { recursive: true });
  }

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // 1. Generar src/environments/build-info.ts
  const tsContent = `// Auto-generated build stamping metadata
export const BUILD_INFO = {
  version: '${version}',
  commitSha: '${commitSha}',
  timestamp: '${deployTimestamp}',
  env: '${env}',
  deployNumber: ${deployNumber},
  redeployNumber: ${redeployNumber},
  isRedeploy: ${isRedeploy},
  deployTimestamp: '${deployTimestamp}',
  sourceKind: '${sourceKind}',
  sourceRef: '${sourceRef}',
  tenantId: '${tenantId}',
} as const;
`;

  const tsFilePath = path.join(environmentsDir, 'build-info.ts');
  fs.writeFileSync(tsFilePath, tsContent, 'utf-8');
  console.log(
    `[build-info] Stamped ${tsFilePath} -> v${version} (${commitSha}) · tenant:'${tenantId}'`,
  );

  // 2. Generar src/assets/version.json
  const jsonContent = JSON.stringify(buildInfo, null, 2) + '\n';
  const jsonFilePath = path.join(assetsDir, 'version.json');
  fs.writeFileSync(jsonFilePath, jsonContent, 'utf-8');
  console.log(`[build-info] Stamped ${jsonFilePath} -> v${version} (${commitSha})`);
}

main();
