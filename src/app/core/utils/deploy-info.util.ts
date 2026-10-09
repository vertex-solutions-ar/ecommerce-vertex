/**
 * Utility to format storefront build & deploy stamping information.
 */

export interface BuildInfoLike {
  version?: string;
  commitSha?: string;
  timestamp?: string;
  deployTimestamp?: string;
  deployNumber?: number;
  redeployNumber?: number;
  isRedeploy?: boolean;
}

export function formatDeployTimestamp(isoString?: string): string {
  if (!isoString) {
    return '';
  }
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return isoString;
  }

  // Usar formato es-AR con fallback ordenado DD/MM/YYYY HH:mm:ss
  try {
    const pad = (n: number): string => n.toString().padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return date.toLocaleString('es-AR');
  }
}

export function getDeployLabel(info: BuildInfoLike): string {
  const redeployNumber = info.redeployNumber ?? 0;
  const isRedeploy = info.isRedeploy ?? redeployNumber > 0;

  if (isRedeploy && redeployNumber > 0) {
    return `Redespliegue ${redeployNumber}`;
  }

  const deployNumber = info.deployNumber ?? 1;
  return `Despliegue ${deployNumber}`;
}

export function getEnvironmentBadgeInfo(
  info: BuildInfoLike,
  hostnameOverride?: string,
): {
  isSpecialDeploy: boolean;
  label: string;
  details: string;
  type: 'preview' | 'branch' | 'standard';
} {
  const host =
    (hostnameOverride ??
      (typeof globalThis !== 'undefined' ? globalThis.location?.hostname : '')) ||
    '';
  const commit =
    info.commitSha && info.commitSha !== 'unknown' ? info.commitSha.substring(0, 7) : '';

  if (host.includes('--pr-')) {
    const prPart = host.split('--pr-')[1]?.split('.')[0]?.split('-')[0] || '';
    const prText = prPart ? `PR #${prPart}` : 'PR Preview';
    return {
      isSpecialDeploy: true,
      label: `Preview ${prText}`,
      details: commit ? `Commit ${commit}` : 'Canal Efímero',
      type: 'preview',
    };
  }

  // Branch o prueba sin tag (por commit o flag de redeploy/dev)
  const isDevOrTest = host.includes('dev') || host === 'localhost' || host === '127.0.0.1';
  if (info.isRedeploy || isDevOrTest) {
    const deployLabel = getDeployLabel(info);
    const detailText = commit ? `Commit ${commit}` : `v${info.version ?? '0.0.0'}`;
    return {
      isSpecialDeploy: true,
      label: `Test / Rama [${deployLabel}]`,
      details: detailText,
      type: 'branch',
    };
  }

  const ver = (info.version ?? '0.0.0').replace(/^v/, '');
  return {
    isSpecialDeploy: false,
    label: `v${ver}`,
    details: commit,
    type: 'standard',
  };
}

export function formatStorefrontBanner(info: BuildInfoLike): string {
  const version = (info.version ?? '0.0.0').replace(/^v/, '');
  const deployLabel = getDeployLabel(info);
  const rawTimestamp = info.deployTimestamp ?? info.timestamp;
  const formattedTimestamp = formatDeployTimestamp(rawTimestamp);

  if (formattedTimestamp) {
    return `[Vertex Storefront] v${version} | ${deployLabel} | ${formattedTimestamp}`;
  }
  return `[Vertex Storefront] v${version} | ${deployLabel}`;
}
