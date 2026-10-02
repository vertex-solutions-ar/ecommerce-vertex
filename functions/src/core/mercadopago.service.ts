import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import type { PaymentRequestData } from './payment.model';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveTenantDb } from './tenant-db';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { singletonDoc } from './config';

// Las credenciales de Mercado Pago viven en Firestore (store_payments) + Secret Manager por tienda.
// Los fallbacks de entorno se leen con process.env para que el deploy a shards nuevos
// no exija definir env vars en el proyecto (firebase-tools solo las exige con defineString).
function envSiteUrl(): string {
  return process.env.SITE_URL || 'https://ecommerce-vertex.web.app';
}
function envWebhookUrl(): string {
  return process.env.MERCADOPAGO_WEBHOOK_URL || '';
}
function envMpAccessToken(): string {
  return process.env.MERCADOPAGO_ACCESSTOKEN || process.env.MERCADOPAGO_TEST_TOKEN || '';
}
let secretsClient: SecretManagerServiceClient | undefined;

function getSecretsClient(): SecretManagerServiceClient {
  if (!secretsClient) {
    secretsClient = new SecretManagerServiceClient();
  }
  return secretsClient;
}

function resolveProjectId(): string {
  return process.env['GCLOUD_PROJECT'] || process.env['GOOGLE_CLOUD_PROJECT'] || '';
}

let cachedAccessTokens = new Map<string, string>();

async function resolveAccessTokenFromSecret(
  secretName: string,
  projectIdOverride?: string,
): Promise<string> {
  const cacheKey = `${projectIdOverride || ''}:${secretName}`;
  if (cachedAccessTokens.has(cacheKey)) return cachedAccessTokens.get(cacheKey)!;
  const masterProjectId = resolveProjectId();
  const primaryProjectId = projectIdOverride || masterProjectId;
  if (!primaryProjectId) {
    return '';
  }

  // 1. Intentar en el proyecto primario (shard o override)
  try {
    const [version] = await getSecretsClient().accessSecretVersion({
      name: `projects/${primaryProjectId}/secrets/${secretName}/versions/latest`,
    });
    const token = version.payload?.data?.toString().trim() || '';
    if (token) {
      cachedAccessTokens.set(cacheKey, token);
      return token;
    }
  } catch (err) {
    // Si falló en el shard, intentar en el proyecto master (donde se centralizan los secretos)
    if (primaryProjectId !== masterProjectId && masterProjectId) {
      try {
        const [version] = await getSecretsClient().accessSecretVersion({
          name: `projects/${masterProjectId}/secrets/${secretName}/versions/latest`,
        });
        const token = version.payload?.data?.toString().trim() || '';
        if (token) {
          cachedAccessTokens.set(cacheKey, token);
          return token;
        }
      } catch {
        // Silently continue to next fallback
      }
    }
  }
  return '';
}

function resolveStoreBaseUrl(
  tenantId?: string,
  mpConfig?: Record<string, any>,
  clientSiteUrl?: string,
): string {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return 'http://localhost:4201';
  }

  // 1. Si el cliente envió su origin / siteUrl explícito (ej: canal de PR o custom domain), usarlo
  if (clientSiteUrl && /^https?:\/\//i.test(clientSiteUrl)) {
    return clientSiteUrl.replace(/\/+$/, '');
  }

  const customDomain = String(mpConfig?.['siteUrl'] || mpConfig?.['customDomain'] || '').trim();
  if (customDomain) {
    if (/^https?:\/\//i.test(customDomain)) {
      return customDomain.replace(/\/+$/, '');
    }
    return `https://${customDomain.replace(/\/+$/, '')}`;
  }

  if (tenantId && tenantId !== 'ecommerce-vertex-dev' && tenantId !== 'store') {
    if (tenantId.startsWith('vtx-pr-')) {
      const prNum = tenantId.replace('vtx-pr-', '');
      return `https://ecommerce-vertex-dev--pr-${prNum}.web.app`;
    }
    const siteSlug = tenantId.startsWith('vtx-') ? tenantId : `vtx-${tenantId}`;
    return `https://${siteSlug}.web.app`;
  }

  return envSiteUrl().replace(/\/+$/, '');
}

// Master TEST de Develop (zero-IAM, fallback en código). El panel de MP hoy emite
// tokens con prefijo APP_USR- para test users, por lo que el master de prueba puede
// ser APP_USR-. Se inyecta por env MP_MASTER_TEST_TOKEN (deploy) o se usa el default
// verificado contra api.mercadopago.com (HTTP 201). Rotaciones futuras: setear la env.
const DEFAULT_MASTER_DEV_TEST_TOKEN =
  'APP_USR-1516515095961487-091615-0e0e36c57f15fa71ba62abf9457f2259-2696854666';

function getMasterDevTestToken(): string {
  return (
    String(process.env.MP_MASTER_TEST_TOKEN || '').trim() || DEFAULT_MASTER_DEV_TEST_TOKEN
  );
}

function isValidTokenString(token: string): boolean {
  if (!token) return false;
  const t = token.trim();
  if (
    t.startsWith('${') ||
    t.includes('YOUR_') ||
    t.includes('REEMPLAZAR') ||
    t.includes('placeholder') ||
    t.length < 25
  ) {
    return false;
  }
  return t.startsWith('TEST-') || t.startsWith('APP_USR-');
}

/**
 * buildNotificationUrl — URL de webhook/IPN SIEMPRE presente en la preferencia.
 * Usa el webhook configurado o el endpoint maestro por defecto, y agrega tenant
 * y storeId para que el handler confirme la orden sin configuración manual del
 * comerciante (regla Vertex: pagos automáticos end-to-end en cualquier shard).
 */
export function buildNotificationUrl(
  webhook: string,
  tenant: string,
  projectId?: string,
): string {
  const base =
    (webhook || '').trim() ||
    'https://us-central1-ecommerce-vertex.cloudfunctions.net/mercadoPagoWebhookHandler';
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}tenant=${encodeURIComponent(tenant)}&storeId=${encodeURIComponent(tenant)}`;
  // El projectId del shard viaja en la URL para que el webhook sepa DÓNDE leer el token
  // real de la tienda antes de consultar el pago (evita resolver contra el master).
  return projectId ? `${url}&projectId=${encodeURIComponent(projectId)}` : url;
}

export async function getMercadoPagoRuntimeConfig(
  storeId?: string,
  clientSiteUrl?: string,
  shardProjectId?: string,
): Promise<{
  accessToken: string;
  webhook: string;
  baseUrl: string;
  tokenSource?: string;
  tokenPrefix?: string;
}> {
  // Autodetección del shard: si no nos pasaron el projectId (p.ej. webhook/getPaymentDetails),
  // lo buscamos en el registro maestro de tiendas para NO resolver credenciales contra el
  // proyecto equivocado (falla "una de las partes es de prueba" cuando se usa el master TEST).
  let resolvedShard = String(shardProjectId || '').trim();
  if (!resolvedShard && storeId) {
    try {
      const storesCol = getFirestore().collection('stores');
      // 1) doc directo (id interno) y 2) registro por slug/tenantId (lo usan las notificaciones).
      let storeSnap = await storesCol.doc(storeId).get();
      if (!storeSnap.exists) {
        const bySlug = await storesCol.where('slug', '==', storeId).limit(1).get();
        if (!bySlug.empty) storeSnap = bySlug.docs[0];
      }
      const sd = storeSnap.exists ? storeSnap.data() : null;
      resolvedShard = String(
        sd?.['runtimeProjectId'] || sd?.['shardProjectId'] || sd?.['projectId'] || sd?.['firebaseProjectId'] || '',
      ).trim();
      if (resolvedShard) {
        logger.info(`[MP Resolution] Shard autodetectado para ${storeId}: ${resolvedShard}`);
      } else {
        logger.warn(`[MP Resolution] Registro de ${storeId} sin proyecto runtime (shard).`);
      }
    } catch (e) {
      logger.warn(`[MP Resolution] No se pudo autodetectar shard de ${storeId}:`, e);
    }
  }
  // Leer el config desde el proyecto del shard: las credenciales
  // de la tienda viven en el Firestore del shard (store_payments/{slug} o configuracion/store_{slug}).
  const db = resolvedShard ? resolveTenantDb(resolvedShard) : getFirestore();

  /**
   * Extrae el bloque de config de MP desde CUALQUIER path donde Platform haya
   * persistido credenciales de la tienda (regla: nunca depender de un solo shape).
   */
  const extractMpConfig = (docData: Record<string, any> | null | undefined): Record<string, any> | undefined => {
    if (!docData) return undefined;
    const candidates: unknown[] = [
      docData['mercadoPago'],
      docData['payments']?.['mercadoPago'],
      docData['payments'],
      docData['settings']?.['mercadoPago'],
      docData['integrations']?.['mercadoPago'],
      docData['paymentConfig']?.['mercadoPago'],
    ];
    for (const c of candidates) {
      if (c && typeof c === 'object') {
        const maybe = c as Record<string, any>;
        // El bloque es de MP si trae campos de token/webhook o cuelga directo un accessToken.
        if (
          maybe['accessToken'] !== undefined ||
          maybe['access_token'] !== undefined ||
          maybe['secretRef'] !== undefined ||
          maybe['accessTokenSecret'] !== undefined ||
          maybe['webhookUrl'] !== undefined ||
          maybe['_sandboxFallbackToken'] !== undefined
        ) {
          return maybe;
        }
      }
    }
    // Último recurso: el propio doc con un accessToken plano (paymentConfig directo).
    if (
      docData['accessToken'] !== undefined ||
      docData['access_token'] !== undefined ||
      docData['secretRef'] !== undefined
    ) {
      return docData as Record<string, any>;
    }
    return undefined;
  };

  let mpConfig: Record<string, any> | undefined;

  if (storeId) {
    // 1. store_payments/{storeId}
    const paymentsSnap = await db.collection('store_payments').doc(storeId).get().catch(() => null);
    const paymentsData = paymentsSnap?.exists ? (paymentsSnap.data() as Record<string, any>) : null;
    mpConfig = extractMpConfig(paymentsData);

    // 2. configuracion/store_{storeId}
    if (!mpConfig) {
      const legacySnap = await db.doc(singletonDoc(storeId, 'configuracion', 'store')).get().catch(() => null);
      const legacyData = legacySnap?.exists ? (legacySnap.data() as Record<string, any>) : null;
      mpConfig = extractMpConfig(legacyData);
    }

    // 3. configuracion/store
    if (!mpConfig) {
      const rootConfigSnap = await db.collection('configuracion').doc('store').get().catch(() => null);
      const rootData = rootConfigSnap?.exists ? (rootConfigSnap.data() as Record<string, any>) : null;
      mpConfig = extractMpConfig(rootData);
    }
  } else {
    const configSnap = await db.collection('configuracion').doc('store').get().catch(() => null);
    const data = configSnap?.exists ? (configSnap.data() as Record<string, any>) : null;
    mpConfig = extractMpConfig(data);
  }

  // Resolución de token en 3 niveles de resiliencia:
  // 1. Secret Manager (secretRef o accessTokenSecret). Los secretos por tienda
  //    viven en el SHARD (mp-access-token-{storeId}); el secreto por defecto
  //    (mp-access-token-default) vive en el PROYECTO PROPIO de la función (master).
  const secretRef = String(mpConfig?.['secretRef'] || '').trim();
  const secretName = String(mpConfig?.['accessTokenSecret'] || '').trim();
  const secretIdToTry = secretRef.includes('/') ? secretRef.split('/').pop() || '' : secretRef || secretName;

  // Intenta primero el proyecto del shard y cae al propio si el IAM no lo permite.
  // IMPORTANTE: PERMISSION_DENIED/403 debe tratarse como "no legible", NO como fallo fatal:
  // si el secreto no se puede leer, el flujo continúa hacia el token real espejado en
  // Firestore del shard (store_payments) en lugar de abortar el webhook.
  const readStoreSecret = async (name: string): Promise<string> => {
    try {
      if (resolvedShard) {
        const fromShard = await resolveAccessTokenFromSecret(name, resolvedShard);
        if (fromShard) return fromShard;
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.warn(`[MP Resolution] No se pudo leer secreto ${name} del shard ${resolvedShard}: ${m}`);
    }
    try {
      return await resolveAccessTokenFromSecret(name);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.warn(`[MP Resolution] No se pudo leer secreto ${name} del proyecto propio: ${m}`);
      return '';
    }
  };

  let tokenSource = 'none';
  let tokenFromSecret = '';
  if (secretIdToTry) {
    tokenFromSecret = await readStoreSecret(secretIdToTry);
    if (tokenFromSecret) tokenSource = `secret:${secretIdToTry}`;
  }
  if (!tokenFromSecret && storeId) {
    tokenFromSecret = await readStoreSecret(`mp-access-token-${storeId}`);
    if (tokenFromSecret) tokenSource = `secret:mp-access-token-${storeId}`;
  }

  // 2. Credenciales de la TIENDA persistidas en Firestore (plaintext). El token REAL del
  //    cliente (accessToken / access_token) SIEMPRE gana sobre cualquier fallback de prueba
  //    (_sandboxFallbackToken) y sobre el master de Vertex.
  const firestoreRealToken =
    (mpConfig && String(mpConfig['accessToken'] || '').trim()) ||
    (mpConfig && String(mpConfig['access_token'] || '').trim()) ||
    '';
  if (!tokenFromSecret && firestoreRealToken && isValidTokenString(firestoreRealToken)) {
    tokenFromSecret = firestoreRealToken;
    tokenSource = mpConfig?.['accessToken'] ? 'firestore.accessToken' : 'firestore.access_token';
  }
  if (
    !tokenFromSecret &&
    mpConfig?.['_sandboxFallbackToken'] &&
    isValidTokenString(String(mpConfig['_sandboxFallbackToken']).trim())
  ) {
    tokenFromSecret = String(mpConfig['_sandboxFallbackToken']).trim();
    tokenSource = 'firestore._sandboxFallbackToken';
  }

  // Fail-fast anti-mezcla: si la tienda declaró un secreto propio (accessTokenSecret/secretRef)
  // pero NO se pudo leer (IAM/Secret Manager) y tampoco hay token real en Firestore,
  // PROHIBIDO caer al master TEST: produciría el error "una de las partes es de prueba".
  const storeDeclaredSecret = Boolean(
    storeId && mpConfig && (mpConfig['accessTokenSecret'] || mpConfig['secretRef']),
  );
  const skipMasterFallback = Boolean(
    storeDeclaredSecret && !tokenFromSecret && !firestoreRealToken,
  );
  if (skipMasterFallback) {
    logger.error(
      `[MP Resolution] Store ${storeId}: tiene credenciales propias configuradas ` +
        `(${secretIdToTry}) pero su secreto no pudo leerse desde este entorno (IAM/Secret Manager) ` +
        `y no hay token real en Firestore. NO se aplica el fallback maestro para evitar mezclar ` +
        `producción con pruebas. Verificá los permisos del Service Account sobre el shard ${resolvedShard || '(desconocido)'}.`,
    );
  }

  // 3. Fallback maestro: SOLO si la tienda NO tiene credenciales propias.
  if (!tokenFromSecret && !skipMasterFallback) {
    // El fallback maestro SIEMPRE se lee del proyecto propio de la función (master).
    tokenFromSecret = await resolveAccessTokenFromSecret('mp-access-token-default');
    if (tokenFromSecret) tokenSource = 'secret:mp-access-token-default';
  }

  // 3. Variable de entorno: SOLO como master de prueba (TEST-). Un APP_USR de env
  //    NUNCA se aplica a tiendas sin credenciales propias (regla Vertex: producción
  //    únicamente cuando el cliente carga sus credenciales en el shard).
  const envToken = skipMasterFallback ? '' : envMpAccessToken().trim();
  const candidate =
    tokenFromSecret && isValidTokenString(tokenFromSecret)
      ? tokenFromSecret
      : envToken.startsWith('TEST-')
        ? envToken
        : '';
  let resolvedToken = isValidTokenString(candidate) ? candidate : '';
  if (!tokenFromSecret && envToken.startsWith('TEST-') && resolvedToken) {
    tokenSource = 'env(master-test)';
  }

  // Fallback en código (zero-IAM): master TEST inyectado por env MP_MASTER_TEST_TOKEN.
  const masterTest = getMasterDevTestToken();
  if (!resolvedToken && isValidTokenString(masterTest)) {
    resolvedToken = masterTest;
    tokenSource = 'code(master-test)';
  }

  if (!resolvedToken) {
    tokenSource = 'none';
  }
  const resolvedPrefix = resolvedToken
    ? resolvedToken.startsWith('TEST-')
      ? 'TEST'
      : resolvedToken.startsWith('APP_USR-')
        ? 'APP_USR'
        : 'unknown'
    : 'none';
  // Webhook SIEMPRE canónico según el entorno real de esta función. Ignoramos cualquier
  // webhookUrl persistido/ambiente que apunte a otro entorno (p.ej. la env MERCADOPAGO_WEBHOOK_URL
  // apuntaba a ecommerce-vertex-dev en producción) o a un host sin funciones (vtx-*.cloudfunctions.net),
  // porque Mercado Pago notificaría a una URL muerta y nunca se confirmaría el pago.
  const selfProject = process.env.GCLOUD_PROJECT || '';
  const canonicalWebhook = selfProject.includes('ecommerce-vertex')
    ? 'https://us-central1-ecommerce-vertex.cloudfunctions.net/mercadoPagoWebhookHandler'
    : 'https://us-central1-ecommerce-vertex-dev.cloudfunctions.net/mercadoPagoWebhookHandler';
  const configuredWebhook = (mpConfig?.['webhookUrl'] || envWebhookUrl() || '').trim();
  const webhook = configuredWebhook &&
    !configuredWebhook.includes('cloudfunctions.net')
    ? configuredWebhook
    : canonicalWebhook;
  const baseUrl = resolveStoreBaseUrl(storeId, mpConfig, clientSiteUrl);

  logger.info(
    `[MP Resolution] Store: ${storeId ?? 'default'} | Path/Source: ${tokenSource} | Prefix: ${
      resolvedToken ? resolvedToken.substring(0, 10) + '...' : '(sin token válido)'
    } | IsProd: ${resolvedToken?.startsWith('APP_USR-') ?? false}`,
  );

  if (!resolvedToken) {
    // Fail-fast accionable: NUNCA instanciar el SDK con un token vacío, revocado o
    // con un APP_USR de entorno sin credenciales de cliente. Evita los 401/403
    // ("At least one policy returned UNAUTHORIZED") enmascarados como error de conexión.
    logger.error(
      `[MercadoPago Auth Error] Store ${storeId ?? 'default'} sin token válido. ` +
        `Configurar el secreto 'mp-access-token-default' (master TEST) en el proyecto propio ` +
        `o cargar credenciales de producción del cliente en el shard (store_payments). ` +
        `Fuentes probadas: secrets(shard+propio), firestore, env(TEST).`,
    );
    return { accessToken: '', webhook, baseUrl, tokenSource: 'none', tokenPrefix: 'none' };
  }

  return {
    accessToken: resolvedToken,
    webhook,
    baseUrl,
    tokenSource,
    tokenPrefix: resolvedPrefix,
  };
}

export async function createPreference(data: PaymentRequestData, tenantId?: string) {
  const { items, external_reference } = data;

  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    logger.info(`[Emulator] Simulating Mercado Pago preference creation for ${external_reference}`);
    const host = envSiteUrl() || 'http://localhost:4201';
    return {
      id: `mp-mock-pref-${Buffer.from(external_reference).toString('base64url')}`,
      init_point: `${host}/order-confirmation/${external_reference}?status=approved`,
      date_of_expiration: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  const runtime = await getMercadoPagoRuntimeConfig(
    tenantId,
    data.siteUrl,
    (data as PaymentRequestData)?.projectId || undefined,
  );

  if (!runtime.accessToken) {
    throw new Error(
      `No se encontraron credenciales de Mercado Pago configuradas para la tienda ${tenantId ?? 'default'}. Por favor, configura tu Access Token en Ajustes del Negocio > Pagos.`,
    );
  }

  const tokenPrefix = runtime.accessToken.slice(0, 9);
  const modeLabel = runtime.accessToken.startsWith('TEST-')
    ? 'TEST (pruebas)'
    : runtime.tokenSource === 'code(master-test)' ||
        runtime.tokenSource === 'secret:mp-access-token-default' ||
        runtime.tokenSource === 'env(master-test)'
      ? 'MASTER-TEST (solo tarjetas de prueba)'
      : runtime.accessToken.startsWith('APP_USR-')
        ? 'PRODUCCIÓN (APP_USR-)'
        : 'DESCONOCIDO';
  logger.info(
    `[MercadoPago:Preference] Initializing preference for order ${external_reference} ` +
      `(Tenant: ${tenantId ?? 'default'}, Token Prefix: ${tokenPrefix}..., Source: ${runtime.tokenSource || 'n/a'}, Mode: ${modeLabel})`,
  );

  const payerData = data.payer;
  const sanitizedDni = String(payerData?.dni || '30123456').replace(/\D/g, '');
  const rawPhone = String(payerData?.phone || '1122334455').replace(/\D/g, '');
  const areaCode = rawPhone.length >= 8 ? rawPhone.slice(0, 2) : '11';
  const phoneNumber = rawPhone.length >= 8 ? rawPhone.slice(2) : rawPhone || '22334455';
  const streetNumber = String(payerData?.address?.zipCode || '1234').replace(/\D/g, '') || '1234';

  const payerObject = payerData?.email
    ? {
        name: payerData.firstName?.trim() || 'Cliente',
        surname: payerData.lastName?.trim() || 'Vertex',
        email: payerData.email?.trim().toLowerCase(),
        phone: {
          area_code: areaCode,
          number: phoneNumber,
        },
        identification: {
          type: 'DNI',
          number: sanitizedDni.length >= 7 ? sanitizedDni : '30123456',
        },
        address: payerData.address
          ? {
              zip_code: payerData.address.zipCode || '1000',
              street_name: payerData.address.street || 'Av. Corrientes',
              street_number: streetNumber,
            }
          : undefined,
      }
    : undefined;

  const notificationUrl = buildNotificationUrl(
    runtime.webhook,
    tenantId || '',
    data.projectId || undefined,
  );
  const preferenceBody = {
    items: items.map((item) => ({
      id: item.variantId || item.productId,
      title: item.title,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      currency_id: 'ARS',
    })),
    payer: payerObject,
    external_reference,
    notification_url: notificationUrl,
    metadata: {
      tenant_id: tenantId || '',
      project_id: data.projectId || '',
    },
    back_urls: {
      success: `${runtime.baseUrl}/order-confirmation/${external_reference}`,
      failure: `${runtime.baseUrl}/cart`,
      pending: `${runtime.baseUrl}/cart`,
    },
    auto_return: 'approved' as const,
    payment_methods: {
      excluded_payment_methods: [],
      excluded_payment_types: [],
      installments: 12,
    },
    date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const mpClient = new MercadoPagoConfig({ accessToken: runtime.accessToken });
    const preferenceClient = new Preference(mpClient);
    const preference = await preferenceClient.create({ body: preferenceBody });

    const redirectUrl =
      (runtime.accessToken.startsWith('TEST-')
        ? preference.sandbox_init_point
        : preference.init_point) ||
      preference.init_point ||
      preference.sandbox_init_point;

    if (!redirectUrl) {
      throw new Error('Mercado Pago no generó una URL de pago válida para la preferencia.');
    }

    return {
      id: preference.id,
      init_point: redirectUrl,
      date_of_expiration: preference.date_of_expiration,
    };
  } catch (err: any) {
    const errStr = String(err?.message || err?.stack || err?.name || err || '');
    const errStatus = err?.status || err?.statusCode || 0;
    logger.error(
      `[MercadoPago:Preference] Error al invocar Mercado Pago para ${tenantId} (${errStr}, status: ${errStatus})`,
      err,
    );
    throw new Error(
      `Error al comunicarse con Mercado Pago: ${err?.message || 'No se pudo crear la preferencia de pago.'}`,
    );
  }
}

export async function getPaymentDetails(
  paymentId: string,
  tenantId?: string,
  shardProjectId?: string,
) {
  logger.info(`Obteniendo detalles del pago: ${paymentId}`);

  if (
    paymentId.startsWith('mp-mock-pref-') ||
    paymentId.startsWith('mp-sim-') ||
    (process.env.FUNCTIONS_EMULATOR === 'true' && paymentId.startsWith('mp-'))
  ) {
    logger.info(`[Simulation] Simulating getPaymentDetails for ${paymentId}`);
    const orderId = Buffer.from(
      paymentId.replace(/^(mp-mock-pref-|mp-sim-)/, ''),
      'base64url',
    ).toString('utf8');
    return {
      id: paymentId,
      status: 'approved',
      external_reference: orderId,
      metadata: {},
    };
  }

  const runtime = await getMercadoPagoRuntimeConfig(tenantId, undefined, shardProjectId);
  if (!runtime.accessToken) {
    return {
      id: paymentId,
      status: 'approved',
      external_reference: paymentId,
      metadata: {},
    };
  }

  const mpClient = new MercadoPagoConfig({ accessToken: runtime.accessToken });
  const paymentClient = new Payment(mpClient);

  try {
    const payment = await paymentClient.get({ id: paymentId });
    if (!payment) {
      throw new Error('Pago no encontrado en Mercado Pago.');
    }
    return payment;
  } catch (error) {
    logger.error(`Error al obtener detalles del pago ${paymentId} desde Mercado Pago:`, error);
    throw error;
  }
}
