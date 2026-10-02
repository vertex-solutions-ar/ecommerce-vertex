import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { PaymentRequestSchema } from './core/payment.model';
import { createPreference, getPaymentDetails } from './core/mercadopago.service';
import { COLLECTIONS, collectionPath } from './core/config';
import { OrderItemSchema, OrderSchema } from './core/order.model';
import { resolveTenantDb } from './core/tenant-db';
import { sendOrderNotificationEmailsDirect } from './notifications.functions';
import { upsertClientFromOrder } from './client-registry';
import * as crypto from 'crypto';

const db = getFirestore();
const secretsClient = new SecretManagerServiceClient();
const secretCache = new Map<string, string>();

function resolveProjectId(): string {
  return process.env['GCLOUD_PROJECT'] || process.env['GOOGLE_CLOUD_PROJECT'] || '';
}

function maskToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

async function upsertSecret(secretId: string, payload: string): Promise<void> {
  const projectId = resolveProjectId();
  if (!projectId) throw new Error('No se pudo resolver el projectId para Secret Manager.');

  const parent = `projects/${projectId}`;
  const secretName = `${parent}/secrets/${secretId}`;

  try {
    await secretsClient.createSecret({
      parent,
      secretId,
      secret: { replication: { automatic: {} } },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('already exists') && !msg.includes('409')) {
      throw err;
    }
  }

  await secretsClient.addSecretVersion({
    parent: secretName,
    payload: { data: Buffer.from(payload, 'utf8') },
  });

  // Update memory cache
  secretCache.set(secretId, payload.trim());
}

async function resolveSecret(secretId: string): Promise<string> {
  if (secretCache.has(secretId)) {
    return secretCache.get(secretId)!;
  }
  const projectId = resolveProjectId();
  if (!projectId) return '';
  try {
    const [version] = await secretsClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretId}/versions/latest`,
    });
    const val = version.payload?.data?.toString().trim() || '';
    if (val) {
      secretCache.set(secretId, val);
    }
    return val;
  } catch (error) {
    logger.warn(`No se pudo leer el secreto ${secretId} de Secret Manager:`, error);
    return '';
  }
}

export const validateMercadoPagoCredentials = onCall(
  { cors: true, invoker: 'public' },
  async (request) => {
    if (!request.auth?.token?.['admin'] || !request.auth.token['tenantId']) {
      throw new HttpsError(
        'permission-denied',
        'Solo admins de tienda pueden validar credenciales de Mercado Pago.',
      );
    }

    const accessToken = String(request.data?.accessToken || '').trim();
    const webhook = String(request.data?.webhookUrl || '').trim();

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'El access token de Mercado Pago es obligatorio.');
    }

    if (webhook && !/^https:\/\//i.test(webhook)) {
      throw new HttpsError('invalid-argument', 'El webhook debe comenzar con https://');
    }

    try {
      const res = await fetch('https://api.mercadopago.com/users/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Mercado Pago respondió ${res.status}: ${text}`);
      }

      const user = (await res.json()) as { id?: number | string; email?: string };
      return {
        valid: true,
        accountEmail: user.email || undefined,
        userId: user.id ? String(user.id) : undefined,
        message: `Credenciales válidas para la cuenta ${user.email || 'sin email'}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError(
        'invalid-argument',
        `No se pudieron validar las credenciales de Mercado Pago. ${msg}`,
      );
    }
  },
);

export const upsertMercadoPagoCredentials = onCall(
  { cors: true, invoker: 'public' },
  async (request) => {
    if (!request.auth?.token?.['admin'] || !request.auth.token['tenantId']) {
      throw new HttpsError(
        'permission-denied',
        'Solo admins de tienda pueden actualizar credenciales de Mercado Pago.',
      );
    }

    const accessToken = String(request.data?.accessToken || '').trim();
    const webhook = String(request.data?.webhookUrl || '').trim();
    const tenantId = String(request.data?.tenantId || '').trim();

    // Scoping estricto: un admin SOLO puede configurar las credenciales de SU propia tienda.
    if (request.auth.token['tenantId'] !== tenantId) {
      throw new HttpsError(
        'permission-denied',
        'No tenés permisos para configurar las credenciales de esta tienda.',
      );
    }

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'El access token de Mercado Pago es obligatorio.');
    }

    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'El tenantId es obligatorio.');
    }

    if (webhook && !/^https:\/\//i.test(webhook)) {
      throw new HttpsError('invalid-argument', 'El webhook debe comenzar con https://');
    }

    try {
      const res = await fetch('https://api.mercadopago.com/users/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Mercado Pago respondió ${res.status}: ${text}`);
      }

      const user = (await res.json()) as { id?: number | string; email?: string };
      // Secreto por tienda: evita token-confusion entre tenants en el caché compartido.
      const secretName = `mp-access-token-${tenantId}`;
      await upsertSecret(secretName, accessToken);

      // Persist the secret reference in the store's Firestore config so getMercadoPagoRuntimeConfig can find it
      // Los datos de pago se guardan en un documento PRIVADO (store_payments/{storeId}),
      // nunca en el doc público de configuración de la tienda.
      const configRef = db.collection('store_payments').doc(tenantId);
      await configRef.set(
        {
          payments: {
            mercadoPago: {
              accessTokenSecret: secretName,
              accessTokenMasked: maskToken(accessToken),
              accountEmail: user.email || '',
              accountUserId: user.id ? String(user.id) : '',
              validationStatus: 'valid',
              validationMessage: 'Validado correctamente',
              validatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      return {
        valid: true,
        accountEmail: user.email || undefined,
        userId: user.id ? String(user.id) : undefined,
        secretName,
        maskedToken: maskToken(accessToken),
        message: `Credenciales válidas para la cuenta ${user.email || 'sin email'} y guardadas en Secret Manager.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpsError(
        'invalid-argument',
        `No se pudieron validar o guardar las credenciales de Mercado Pago. ${msg}`,
      );
    }
  },
);

async function revertStockOnFailure(orderId: string, projectId?: string) {
  logger.info(`Iniciando reversón de stock para pedido cancelado/fallido: ${orderId}`);

  const tenantDb = resolveTenantDb(projectId);
  const orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);

  try {
    await tenantDb.runTransaction(async (transaction) => {
      const freshOrderDoc = await transaction.get(orderRef);
      if (!freshOrderDoc.exists) {
        logger.error(`Pedido ${orderId} no existe. No se puede revertir stock.`);
        return;
      }

      const orderData = freshOrderDoc.data();
      if (!orderData) {
        logger.error(`Pedido ${orderId} sin datos. No se puede revertir stock.`);
        return;
      }

      if (!orderData.stockDecremented) {
        logger.info(`Stock para pedido ${orderId} no fue decrementado. No se revierte.`);
        transaction.update(orderRef, {
          status: 'CANCELLED_UNPAID',
          paymentStatus: orderData.paymentStatus && orderData.paymentStatus !== 'pending'
            ? orderData.paymentStatus
            : 'cancelled',
          isPaid: false,
          notes: 'Pago rechazado, cancelado o expirado. Sin impacto en inventario ni métricas.',
        });
        return;
      }

      for (const item of orderData.items) {
        const itemValidation = OrderItemSchema.safeParse(item);
        if (!itemValidation.success) {
          logger.warn(`Item inválido en pedido ${orderId} durante reversión.`, { item });
          continue;
        }
        const validItem = itemValidation.data;

        const productRef = tenantDb
          .collection(collectionPath(COLLECTIONS.PRODUCTS))
          .doc(validItem.productId);

        if (!validItem.variantId) {
          transaction.update(productRef, {
            stock: FieldValue.increment(validItem.quantity),
            totalStock: FieldValue.increment(validItem.quantity),
          });
        } else {
          const variantRef = productRef
            .collection('variants')
            .doc(validItem.variantId);

          const [productDoc, variantDoc] = await Promise.all([
            transaction.get(productRef),
            transaction.get(variantRef),
          ]);

          if (variantDoc.exists) {
            transaction.update(variantRef, {
              stock: FieldValue.increment(validItem.quantity),
            });
          }
          if (productDoc.exists) {
            transaction.update(productRef, {
              totalStock: FieldValue.increment(validItem.quantity),
            });
          }
        }
      }

      transaction.update(orderRef, {
        status: 'CANCELLED_UNPAID',
        paymentStatus: orderData.paymentStatus && orderData.paymentStatus !== 'pending'
          ? orderData.paymentStatus
          : 'cancelled',
        stockDecremented: false,
        isPaid: false,
        notes: 'Pago rechazado o cancelado. Stock devuelto.',
      });

      logger.info(`Stock revertido exitosamente para pedido ${orderId}.`);
    });
  } catch (error) {
    logger.error(`Error en transacción de reversión de stock para ${orderId}:`, error);
  }
}

export const createPaymentPreference = onCall(
  { cors: true, invoker: 'public' },
  async (request) => {
    const validationResult = PaymentRequestSchema.safeParse(request.data);
    if (!validationResult.success) {
      logger.warn('Solicitud de pago con datos inválidos.', {
        errors: validationResult.error.flatten(),
      });
      throw new HttpsError(
        'invalid-argument',
        'Los datos proporcionados para el pago no son válidos.',
      );
    }

    const paymentData = validationResult.data;
    const orderId = paymentData.external_reference;
    // Datos de la tienda (orden/catálogo) viven en el proyecto del shard.
    const tenantDb = resolveTenantDb(paymentData.projectId);

    logger.info(`Iniciando creación de preferencia para el pedido: ${orderId}`);

    // Resolve order document in the flat orders collection
    const orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);

    try {
      const preference = await tenantDb.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) {
          logger.error(`Intento de pago para una orden no existente: ${orderId}`);
          throw new HttpsError('not-found', `La orden con ID ${orderId} no fue encontrada.`);
        }

        const orderData = orderDoc.data();
        if (!orderData) throw new HttpsError('internal', 'Datos de orden corruptos.');

        const orderStatus = String(orderData.status || '');
        const hasExistingPreference =
          typeof orderData['mercadopago_preference_id'] === 'string' &&
          typeof orderData['mercadopago_init_point'] === 'string';

        // Una preferencia vencida NO se reutiliza: si el cliente vuelve después de la
        // expiración (24 h), se genera una nueva (en vez de devolverle un link muerto).
        let preferenceIsValid = true;
        const expRaw = orderData['mercadopago_expiration_date'] as unknown;
        if (expRaw) {
          let expMillis = NaN;
          if (expRaw instanceof Date) expMillis = expRaw.getTime();
          else if (typeof expRaw === 'object' && expRaw !== null && 'toMillis' in expRaw) {
            expMillis = (expRaw as { toMillis(): number }).toMillis();
          } else if (typeof expRaw === 'string') expMillis = new Date(expRaw).getTime();
          if (Number.isFinite(expMillis) && expMillis < Date.now()) {
            preferenceIsValid = false;
            logger.info(
              `Pedido ${orderId}: preferencia previa vencida. Se generará una nueva.`,
            );
          }
        }

        // Re-entrancia: si la orden ya tiene una preferencia VIGENTE (refresh del checkout o
        // reintento de red), se retorna SIEMPRE la misma — nunca duplicar links de pago.
        if (
          hasExistingPreference &&
          preferenceIsValid &&
          (orderStatus === 'pending' ||
            orderStatus === 'PENDING_PAYMENT' ||
            orderStatus === 'processing')
        ) {
          logger.info(
            `Pedido ${orderId} ya tenía preferencia creada. Retornando preferencia existente.`,
          );
          return {
            id: orderData['mercadopago_preference_id'] as string,
            init_point: orderData['mercadopago_init_point'] as string,
            date_of_expiration: undefined,
          };
        }

        if (orderStatus !== 'pending' && orderStatus !== 'PENDING_PAYMENT') {
          logger.warn(`Pedido ${orderId} ya procesado o en proceso. Estado: ${orderStatus}`);
          throw new HttpsError('failed-precondition', 'Este pedido ya fue procesado.');
        }

        // Precios SIEMPRE desde el catálogo del servidor — nunca del payload del cliente.
        const serverItems: typeof paymentData.items = [];

        for (const item of paymentData.items) {
          const productRef = tenantDb
            .collection(collectionPath(COLLECTIONS.PRODUCTS))
            .doc(item.productId);

          const hasVariant = typeof item.variantId === 'string' && item.variantId.trim().length > 0;
          const variantRef = hasVariant
            ? productRef.collection('variants').doc(item.variantId!)
            : null;

          const [productDoc, variantDoc] = await Promise.all([
            transaction.get(productRef),
            variantRef ? transaction.get(variantRef) : Promise.resolve(null),
          ]);

          if (!productDoc.exists) {
            logger.error(
              `Producto ${item.productId} no encontrado en el catálogo.`,
            );
            throw new HttpsError('not-found', `Producto ${item.title} no disponible.`);
          }

          const productData = productDoc.data() ?? {};

          if (variantDoc && variantDoc.exists) {
            const variantData = variantDoc.data();
            if (!variantData || variantData.stock < item.quantity) {
              logger.warn(
                `Stock insuficiente para variante ${item.variantId} de ${item.title}. Solicitado: ${item.quantity}, Disponible: ${variantData?.stock || 0}`,
              );
              throw new HttpsError(
                'resource-exhausted',
                `Stock insuficiente para ${item.title}. Solo quedan ${variantData?.stock || 0}.`,
              );
            }

            const productBasePrice =
              (productData['price'] as number | undefined) ??
              (productData['finalPrice'] as number | undefined);

            const serverPrice =
              typeof productBasePrice === 'number'
                ? productBasePrice
                : ((variantData['price'] as number | undefined) ?? 0);

            serverItems.push({
              productId: item.productId,
              variantId: item.variantId,
              title: item.title,
              quantity: item.quantity,
              unit_price: serverPrice,
            });
          } else {
            // Producto Simple (sin variantId o sin variante en subcolección)
            const availableStock =
              (productData['stock'] as number | undefined) ??
              (productData['totalStock'] as number | undefined) ??
              0;

            if (availableStock < item.quantity) {
              logger.warn(
                `Stock insuficiente para producto simple ${item.title}. Solicitado: ${item.quantity}, Disponible: ${availableStock}`,
              );
              throw new HttpsError(
                'resource-exhausted',
                `Stock insuficiente para ${item.title}. Solo quedan ${availableStock}.`,
              );
            }

            const serverPrice =
              (productData['price'] as number | undefined) ??
              (productData['finalPrice'] as number | undefined) ??
              0;

            serverItems.push({
              productId: item.productId,
              variantId: item.variantId ?? null,
              title: item.title,
              quantity: item.quantity,
              unit_price: serverPrice,
            });
          }
        }

        // REGLA VERTEX (stock integro): el inventario NUNCA se descuenta al crear la
        // preferencia/link de pago. La única ventana de descuento es el webhook con
        // pago 'approved'. La orden queda PENDING_PAYMENT + stockDecremented:false.
        const storeId = (orderData as Record<string, unknown>)['storeId'] as string | undefined;
        const mpPreference = await createPreference(
          { ...paymentData, items: serverItems },
          storeId,
        );
        logger.info(
          `[MercadoPago:Preference] Preferencia ${mpPreference.id} creada exitosamente para pedido ${orderId}. Total items: ${serverItems.length}. Stock NO descontado (se descuenta en webhook approved).`,
        );

        transaction.update(orderRef, {
          mercadopago_preference_id: mpPreference.id,
          mercadopago_init_point: mpPreference.init_point,
          mercadopago_expiration_date: mpPreference.date_of_expiration
            ? Timestamp.fromDate(new Date(mpPreference.date_of_expiration))
            : null,
          status: 'PENDING_PAYMENT',
          paymentStatus: 'pending',
          stockDecremented: false,
          isPaid: false,
          checkoutStartedAt: new Date(),
        });

        return mpPreference;
      });

      return {
        id: preference.id,
        init_point: preference.init_point,
      };
    } catch (error: any) {
      logger.error(`Error crítico al crear la preferencia de pago para ${orderId}:`, {
        errorMessage: error?.message,
        errorStack: error?.stack,
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      const errMsg = typeof error?.message === 'string' ? error.message : '';
      if (errMsg.includes('Mercado Pago no está configurado')) {
        throw new HttpsError('failed-precondition', errMsg);
      }

      if (errMsg.toLowerCase().includes('mercado pago') || errMsg.toLowerCase().includes('mercadopago') || error?.cause) {
        throw new HttpsError(
          'invalid-argument',
          `Error al crear preferencia de Mercado Pago: ${errMsg || 'Validación de pago fallida.'}`,
          { error: 'MP_ERROR', details: errMsg },
        );
      }

      throw new HttpsError('internal', `No se pudo procesar la solicitud de pago: ${errMsg || 'Error interno.'}`);
    }
  },
);

/**
 * Cloud Function HTTP que recibe y procesa las notificaciones webhook enviadas por Mercado Pago.
 *
 * Flujo y Resiliencia:
 * 1. Valida la firma HMAC-SHA256 (`x-signature`) contra `mp-webhook-secret` almacenado en Secret Manager.
 * 2. Extrae el `paymentId` y consulta la API de Mercado Pago con las credenciales del tenant.
 * 3. Actualiza el documento del pedido en la colección `orders` del shard correspondiente y ajusta el stock.
 * 4. Retorna SIEMPRE `HTTP 200 OK` (incluso ante errores internos de procesamiento) para prevenir
 *    reintentos infinitos por parte de los servidores de Mercado Pago.
 *
 * @param request Solicitud HTTP entrante desde Mercado Pago (POST/GET).
 * @param response Respuesta HTTP devuelta a Mercado Pago.
 */
export const mercadoPagoWebhookHandler = onRequest(
  { maxInstances: 5, cors: true, invoker: 'public' },
  async (request, response) => {
    const incomingAction = String(request.body?.action ?? request.query.topic ?? '');
    const incomingPaymentId = String(request.body?.data?.id ?? request.query.id ?? '');
    logger.info(
      `Mercado Pago Webhook recibido: action=${incomingAction} paymentId=${incomingPaymentId}`,
    );

    // 1. Validar firma del webhook (fail-closed: sin secreto configurado NO se procesa)
    // La validación de firma es un refuerzo, NO un bloqueo: el webhook siempre vuelve a
    // consultar el estado real del pago contra la API de Mercado Pago (getPaymentDetails),
    // así que una falla de IAM/lectura del secreto NO debe abortar el procesamiento
    // (si abortara, los pedidos pagados jamás confirmarían stock, estado ni emails).
    let webhookSecret: string | null = null;
    try {
      webhookSecret = await resolveSecret('mp-webhook-secret');
    } catch (err) {
      logger.error(
        'No se pudo leer mp-webhook-secret (IAM/Secret Manager). Se continúa sin validar firma.',
        err,
      );
      webhookSecret = null;
    }
    if (!webhookSecret) {
      logger.warn(
        "'mp-webhook-secret' no está configurado en Secret Manager. Se omite la validación de firma.",
      );
    }

    const signature = request.headers['x-signature'] as string | undefined;
    const requestId = request.headers['x-request-id'] as string | undefined;

    if (webhookSecret && (!signature || !requestId)) {
      logger.warn('Firma de webhook faltante. Se ignora la notificación.');
      response.status(200).send('Webhook recibido.');
      return;
    }

    if (webhookSecret) {
      try {
      const parts = signature!.split(',');
      const tsPart = parts.find((p) => p.startsWith('ts='));
      const v1Part = parts.find((p) => p.startsWith('v1='));

      if (!tsPart || !v1Part) {
        logger.warn('Formato de x-signature inválido o incompleto.');
        response.status(200).send('Webhook recibido.');
        return;
      }

      const ts = tsPart.split('=')[1];
      const v1 = v1Part.split('=')[1];

      // Obtener el ID del recurso (se prefiere el del body o query)
      let resourceId = '';
      if (request.rawBody) {
        try {
          const parsed = JSON.parse(request.rawBody.toString('utf8'));
          resourceId = String(parsed.data?.id || request.query.id || '');
        } catch {
          resourceId = String(request.query.id || '');
        }
      } else {
        resourceId = String(request.query.id || '');
      }

      const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
      const hmac = crypto.createHmac('sha256', webhookSecret);
      hmac.update(manifest);
      const expectedSignature = hmac.digest('hex');

      let match = false;
      try {
        const expectedBuf = Buffer.from(expectedSignature, 'hex');
        const receivedBuf = Buffer.from(v1, 'hex');
        if (expectedBuf.length === receivedBuf.length) {
          match = crypto.timingSafeEqual(expectedBuf, receivedBuf);
        }
      } catch {
        match = false;
      }

      if (!match) {
        logger.error('La firma calculada no coincide con x-signature v1.', {
          expected: expectedSignature,
          received: v1,
        });
        response.status(200).send('Webhook recibido.');
        return;
      }

      logger.info('Firma de webhook de Mercado Pago validada con éxito.');
    } catch (err) {
      logger.error('Error al validar la firma de Mercado Pago:', err);
      response.status(200).send('Webhook recibido.');
      return;
      }
    }

    // Mercado Pago envía notificaciones POST ({"action":"payment.created","data":{"id":"..."}})
    // y también GET legacy (?topic=payment&id=...). Se prioriza el body y se respalda con query.
    const topic = String(request.body?.type ?? request.query.topic ?? '');
    const paymentId = String(incomingPaymentId || request.query.id || '');

    if ((topic !== 'payment' && topic !== 'payment.created') || !paymentId) {
      logger.warn("Webhook ignorado. No es un 'payment' o no tiene 'id'.", { topic });
      response.status(200).send('Webhook ignorado.');
      return;
    }

    try {
      // El tenant (tienda) viene en el query del notification_url (configurado por
      // createPreference) junto al projectId del shard — necesario para resolver el access
      // token REAL de la tienda antes de consultar el pago.
      const tenantFromQuery = String(request.query.tenant || request.query.tenantId || '');
      const projectFromQuery = String(
        request.query.projectId || request.query.tenantProjectId || '',
      ).trim();
      const payment = await getPaymentDetails(paymentId, tenantFromQuery, projectFromQuery || undefined);
      if (!payment) {
        throw new Error(`Detalles del pago ${paymentId} no encontrados.`);
      }

      // El shard (projectId del Firestore de la tienda) viaja en la metadata del pago.
      const paymentMeta = (payment as { metadata?: Record<string, string> }).metadata ?? {};
      const tenantProjectId = String(paymentMeta.project_id || paymentMeta.projectId || '');
      const tenantDb = resolveTenantDb(tenantProjectId);

      const orderId = payment.external_reference;
      const paymentStatus = payment.status;

      if (!orderId) {
        logger.error(`El pago ${paymentId} no tiene external_reference (orderId).`, { payment });
        response.status(200).send('Pago sin orderId.');
        return;
      }

      // Resolve order in the flat orders collection (Firestore del shard de la tienda)
      const orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);

      if (paymentStatus === 'approved') {
        logger.info(
          `Pago ${paymentId} (pedido ${orderId}) aprobado. Descontando stock (única ventana de descuento).`,
        );

        await tenantDb.runTransaction(async (transaction) => {
          const freshOrderDoc = await transaction.get(orderRef);
          if (!freshOrderDoc.exists) {
            logger.error(`Pedido ${orderId} no existe en webhook approved.`);
            return;
          }
          const orderData = freshOrderDoc.data();
          if (!orderData) return;

          // Idempotencia estricta DENTRO de la transacción: si ya se descontó
          // (webhook duplicado o reintento de MP), solo registrar el paymentId.
          if (orderData.stockDecremented === true) {
            transaction.update(orderRef, {
              'paymentDetails.paymentId': paymentId,
              status: 'processing',
              paymentStatus: 'approved',
              isPaid: true,
              paidAt: new Date(),
            });
            return;
          }

          const shortfall: string[] = [];
          for (const item of orderData.items) {
            const itemValidation = OrderItemSchema.safeParse(item);
            if (!itemValidation.success) continue;
            const validItem = itemValidation.data;

            const productRef = tenantDb
              .collection(collectionPath(COLLECTIONS.PRODUCTS))
              .doc(validItem.productId);

            if (!validItem.variantId) {
              const productDoc = await transaction.get(productRef);
              if (productDoc.exists) {
                const pData = productDoc.data();
                const currentStock = Number(pData?.['stock'] ?? pData?.['totalStock'] ?? 0);
                if (currentStock < validItem.quantity) {
                  shortfall.push(
                    `${validItem.productName || validItem.productId} (producto, faltan ${validItem.quantity - Math.max(0, currentStock)})`,
                  );
                }
                transaction.update(productRef, {
                  stock: FieldValue.increment(-validItem.quantity),
                  totalStock: FieldValue.increment(-validItem.quantity),
                });
              }
            } else {
              const variantRef = productRef
                .collection('variants')
                .doc(validItem.variantId);

              const [productDoc, variantDoc] = await Promise.all([
                transaction.get(productRef),
                transaction.get(variantRef),
              ]);

              if (variantDoc.exists) {
                const variantStock = Number(variantDoc.data()?.['stock'] ?? 0);
                const variantToDeduct = Math.max(0, Math.min(validItem.quantity, variantStock));
                if (variantToDeduct > 0) {
                  transaction.update(variantRef, {
                    stock: FieldValue.increment(-variantToDeduct),
                  });
                }
                if (variantToDeduct < validItem.quantity) {
                  shortfall.push(
                    `${validItem.productName || validItem.variantId} (variante, faltan ${validItem.quantity - variantToDeduct})`,
                  );
                }
              }
              if (productDoc.exists) {
                const productStock = Number(productDoc.data()?.['totalStock'] ?? 0);
                const productToDeduct = Math.max(0, Math.min(validItem.quantity, productStock));
                if (productToDeduct > 0) {
                  transaction.update(productRef, {
                    totalStock: FieldValue.increment(-productToDeduct),
                  });
                }
                if (productToDeduct < validItem.quantity) {
                  shortfall.push(
                    `${validItem.productName || validItem.productId} (producto, faltan ${validItem.quantity - productToDeduct})`,
                  );
                }
              }
            }
          }

          const update: Record<string, unknown> = {
            'paymentDetails.paymentId': paymentId,
            status: 'processing',
            paymentStatus: 'approved',
            isPaid: true,
            paidAt: new Date(),
            stockDecremented: true,
            stockDeductedAt: new Date(),
          };
          if (shortfall.length > 0) {
            update['stockShortfall'] = shortfall;
            logger.error(
              `[Stock Shortfall] Pedido ${orderId} aprobado sin stock suficiente: ${shortfall.join('; ')}. ` +
                'El stock disponible fue descontado sin generar negativos. Revisar inventario.',
            );
          }
          transaction.update(orderRef, update);
        });

        // Registrar/actualizar cliente en el SHARD (la sección Clientes del dashboard)
        // y enviar notificaciones por email al comprador y vendedor.
        try {
          const updatedOrderDoc = await orderRef.get();
          if (updatedOrderDoc.exists) {
            const rawData = updatedOrderDoc.data();
            if (rawData) {
              try {
                await upsertClientFromOrder(tenantDb, orderId, rawData);
              } catch (clientErr) {
                logger.warn(
                  `[Webhook] No se pudo registrar cliente para pedido #${orderId}:`,
                  clientErr,
                );
              }
            }
            if (rawData && !rawData['notificationsSent']) {
              const parsed = OrderSchema.safeParse({ id: orderId, ...rawData });
              if (parsed.success) {
                await sendOrderNotificationEmailsDirect(
                  orderId,
                  parsed.data,
                  tenantDb,
                  tenantFromQuery || String(rawData['storeId'] || ''),
                  tenantProjectId,
                );
              }
            }
          }
        } catch (emailErr) {
          logger.warn(
            `[Webhook] No se pudieron enviar emails para pedido #${orderId} de forma directa:`,
            emailErr,
          );
        }
      } else if (paymentStatus === 'cancelled' || paymentStatus === 'rejected') {
        logger.warn(
          `Pago ${paymentId} (pedido ${orderId}) fue ${paymentStatus}. Revertiendo stock si es necesario.`,
        );
        await revertStockOnFailure(orderId, tenantProjectId);
      } else {
        logger.info(
          `Pago ${paymentId} (pedido ${orderId}) está en estado ${paymentStatus}. No se toma acción.`,
        );
      }

      logger.info(`Webhook para pago ${paymentId} procesado exitosamente.`);
      response.status(200).send('Webhook procesado.');
    } catch (error) {
      logger.error(`Error al procesar el webhook para pago ${paymentId}:`, error);
      // Responder HTTP 200 OK para evitar bucles de reintento en webhooks de Mercado Pago
      response.status(200).send('Webhook procesado con observaciones.');
    }
  },
);

/**
 * executeStockAndMetricsRestorationAdmin — Saneamiento nativo en la nube (sin ADC local).
 * Restituye inventario de órdenes que quedaron con stock descontado SIN pago aprobado
 * (legacy checkout) y las marca CANCELLED_UNPAID. Si la tienda vive en un shard, se
 * ejecuta con la SA del proyecto desplegado (orchestrator), sin credenciales locales.
 *
 * Guard: admin (vertex.tech.dev@gmail.com o claim platformAdmin) o secret token admin.
 * Params: { tenantProjectId?: string; storeId?: string; dryRun?: boolean }
 * - tenantProjectId: shard Firestore de la tienda (se resuelve solo si se omite y se
 *   pasa storeId: busca el doc en 'stores' del proyecto propio).
 * - dryRun: default false (ejecuta la restitución).
 * Reporte: [{ orderId, restoredItems: [{ productId, qty }] }]
 */
export const executeStockAndMetricsRestorationAdmin = onCall(
  { timeoutSeconds: 300, memory: '512MiB', cors: true, invoker: 'public' },
  async (request) => {
    const email = String(request.auth?.token?.email || '');
    const isAdmin =
      email === 'vertex.tech.dev@gmail.com' || Boolean(request.auth?.token?.['platformAdmin']);
    const rawHeaders = (request as any).rawRequest?.headers || {};
    const adminSecret = String(
      rawHeaders['x-admin-token'] || rawHeaders['admin-token'] || rawHeaders['X-Admin-Token'] || '',
    );
    const masterSecret = String(process.env.RESTORE_ADMIN_TOKEN || '');
    if (!request.auth || (!isAdmin && (!masterSecret || adminSecret !== masterSecret))) {
      throw new HttpsError('permission-denied', 'Operación restringida a administradores.');
    }

    const { tenantProjectId, storeId, dryRun = false } = (request.data || {}) as {
      tenantProjectId?: string;
      storeId?: string;
      dryRun?: boolean;
    };

    // Descubrimiento del shard: doc de la tienda en el proyecto propio (ecommerce master).
    let shardProjectId = String(tenantProjectId || '').trim();
    if (!shardProjectId && storeId) {
      const storeSnap = await getFirestore()
        .collection('stores')
        .doc(String(storeId))
        .get()
        .catch(() => null);
      const storeData = storeSnap?.exists ? storeSnap.data() : null;
      shardProjectId = String(
        storeData?.['shardProjectId'] || storeData?.['projectId'] || storeData?.['runtimeProjectId'] || '',
      ).trim();
    }

    if (!shardProjectId) {
      throw new HttpsError(
        'invalid-argument',
        'No se pudo resolver el shard de la tienda. Enviar tenantProjectId o storeId válido.',
      );
    }

    const tenantDb = resolveTenantDb(shardProjectId);
    const ordersRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS));
    const liveStates = new Set(['pending', 'processing', 'PENDING_PAYMENT']);
    const paidStatuses = new Set(['approved', 'paid']);
    const report: Array<{ orderId: string; restoredItems: Array<{ productId: string; qty: number }> }> = [];

    const snap = await ordersRef.where('stockDecremented', '==', true).limit(500).get();

    for (const doc of snap.docs) {
      const o = doc.data() as Record<string, any>;
      const status = String(o.status || '');
      const paymentStatus = String(o.paymentStatus || '');
      if (!liveStates.has(status)) continue;
      if (paidStatuses.has(paymentStatus) || o.paidAt) continue;
      if ((o.paymentDetails as any)?.paymentId) continue; // pagada en legacy (webhook confirmó)

      const items: any[] = Array.isArray(o.items) ? o.items : [];
      const restoredItems: Array<{ productId: string; qty: number }> = [];
      for (const it of items) {
        const productId = it.productId;
        const qty = Number(it.quantity || 0);
        if (!productId || qty <= 0) continue;
        restoredItems.push({ productId, qty });
      }

      if (dryRun) {
        report.push({ orderId: doc.id, restoredItems });
        continue;
      }

      await tenantDb.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const freshData = fresh.data();
        if (!freshData) return;
        if (freshData.stockDecremented !== true) return;
        const fs = String(freshData.status || '');
        if (!liveStates.has(fs)) return;
        if (freshData.paymentStatus && paidStatuses.has(String(freshData.paymentStatus))) return;
        if (freshData.paidAt) return;
        if (freshData.paymentDetails?.paymentId) return;

        for (const it of items) {
          const productId = it.productId;
          const variantId = it.variantId || null;
          const qty = Number(it.quantity || 0);
          if (!productId || qty <= 0) continue;
          const productRef = tenantDb.collection(collectionPath(COLLECTIONS.PRODUCTS)).doc(productId);
          if (!variantId) {
            tx.update(productRef, {
              stock: FieldValue.increment(qty),
              totalStock: FieldValue.increment(qty),
            });
          } else {
            const variantRef = productRef.collection('variants').doc(variantId);
            const [pDoc, vDoc] = await Promise.all([tx.get(productRef), tx.get(variantRef)]);
            if (vDoc.exists) {
              tx.update(variantRef, { stock: FieldValue.increment(qty) });
            }
            if (pDoc.exists) {
              tx.update(productRef, { totalStock: FieldValue.increment(qty) });
            }
          }
        }
        tx.update(doc.ref, {
          status: 'CANCELLED_UNPAID',
          paymentStatus: 'cancelled',
          stockDecremented: false,
          isPaid: false,
          restoredAt: new Date(),
          notes: 'Stock restituido por executeStockAndMetricsRestorationAdmin (pedido nunca pagado).',
        });
      });
      report.push({ orderId: doc.id, restoredItems });
    }

    logger.info(
      `[StockRestoration] Shard ${shardProjectId} | dryRun=${dryRun} | ordenes saneadas: ${report.length}`,
    );
    return { success: true, shardProjectId, dryRun, restored: report };
  },
);
