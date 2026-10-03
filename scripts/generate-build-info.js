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

  const buildInfo = {
    version,
    commitSha,
    timestamp: deployTimestamp,
    env,
    deployNumber,
    redeployNumber,
    isRedeploy,
    deployTimestamp,
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
} as const;
`;

  const tsFilePath = path.join(environmentsDir, 'build-info.ts');
  fs.writeFileSync(tsFilePath, tsContent, 'utf-8');
  console.log(`[build-info] Stamped ${tsFilePath} -> v${version} (${commitSha})`);

  // 2. Generar src/assets/version.json
  const jsonContent = JSON.stringify(buildInfo, null, 2) + '\n';
  const jsonFilePath = path.join(assetsDir, 'version.json');
  fs.writeFileSync(jsonFilePath, jsonContent, 'utf-8');
  console.log(`[build-info] Stamped ${jsonFilePath} -> v${version} (${commitSha})`);
}

main();
