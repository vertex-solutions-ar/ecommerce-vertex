import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { resolveTenantDb } from './core/tenant-db';
import { COLLECTIONS, collectionPath } from './core/config';
import { OrderItemSchema } from './core/order.model';

/** Emails con poder de super admin en cualquier tienda (Juan, Lihue, Vertex). */
const SUPER_ADMIN_EMAILS = new Set([
  'juan.l.espeche@gmail.com',
  'leivalihue@gmail.com',
  'vertex.tech.dev@gmail.com',
]);

/** Admin del panel de la tienda (claim admin del tenant) o super admin. */
function isStoreAdminOrSuper(
  request: { auth?: { token?: Record<string, unknown> } | null },
  storeId: string,
): boolean {
  const token = request.auth?.token || {};
  const email = String(token['email'] || '').toLowerCase();
  if (
    SUPER_ADMIN_EMAILS.has(email) ||
    token['superAdmin'] === true ||
    token['platformAdmin'] === true
  ) {
    return true;
  }
  const claimedTenant = token['tenantId'] as string | undefined;
  return (
    token['admin'] === true &&
    (!claimedTenant || String(claimedTenant) === storeId || String(claimedTenant) === '')
  );
}

async function audit(
  tenantDb: Firestore,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await tenantDb.collection('admin_audit').add({
      action,
      ...payload,
      at: new Date(),
    });
  } catch (err) {
    logger.warn(`[SuperAdmin] No se pudo escribir auditoría (${action}):`, err);
  }
}

/**
 * adminDeleteClient — borra UN cliente del dashboard de la tienda (admin de tienda o super admin).
 * Verifica que el documento pertenezca a la tienda indicada antes de eliminar.
 */
export const adminDeleteClient = onCall<{
  tenantProjectId: string;
  storeId: string;
  clientDocId: string;
}>(
  { cors: true, invoker: 'public' },
  async (request) => {
    const { tenantProjectId, storeId, clientDocId } = request.data;
    if (!request.auth || !isStoreAdminOrSuper(request, storeId)) {
      throw new HttpsError('permission-denied', 'Sin permisos para eliminar clientes de esta tienda.');
    }
    if (!tenantProjectId || !storeId || !clientDocId) {
      throw new HttpsError('invalid-argument', 'tenantProjectId, storeId y clientDocId son requeridos.');
    }
    const tenantDb = resolveTenantDb(tenantProjectId);
    const clientRef = tenantDb.collection(COLLECTIONS.CLIENTS).doc(clientDocId);
    const snap = await clientRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Cliente no encontrado.');
    }
    const data = snap.data();
    if ((data as { storeId?: string } | undefined)?.storeId !== storeId) {
      throw new HttpsError('permission-denied', 'El cliente no pertenece a esta tienda.');
    }
    await clientRef.delete();
    await audit(tenantDb, 'delete_client', {
      clientDocId,
      storeId,
      email: (data as { email?: string }).email || '',
      by: String(request.auth?.token?.['email'] || ''),
    });
    logger.info(`[SuperAdmin] Cliente ${clientDocId} eliminado (tienda ${storeId}).`);
    return { success: true, message: `Cliente eliminado correctamente.` };
  },
);

/**
 * adminDeleteOrder — borra UN pedido del dashboard (solo super admin). Si el pedido tenía
 * stock descontado (compra de prueba pagada), devuelve el stock automáticamente para que el
 * inventario quede consistente. Verifica pertenencia a la tienda.
 */
export const adminDeleteOrder = onCall<{
  tenantProjectId: string;
  storeId: string;
  orderId: string;
}>(
  { timeoutSeconds: 120, cors: true, invoker: 'public' },
  async (request) => {
    const { tenantProjectId, storeId, orderId } = request.data;
    if (!request.auth || !isStoreAdminOrSuper(request, storeId)) {
      throw new HttpsError('permission-denied', 'Sin permisos para eliminar pedidos de esta tienda.');
    }
    if (!tenantProjectId || !storeId || !orderId) {
      throw new HttpsError('invalid-argument', 'tenantProjectId, storeId y orderId son requeridos.');
    }
    const tenantDb = resolveTenantDb(tenantProjectId);
    const orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);

    let restored = 0;
    await tenantDb.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', 'Pedido no encontrado.');
      }
      const data = orderSnap.data();
      if ((data as { storeId?: string } | undefined)?.storeId !== storeId) {
        throw new HttpsError('permission-denied', 'El pedido no pertenece a esta tienda.');
      }
      if ((data as { stockDecremented?: boolean }).stockDecremented === true) {
        const items = (data as { items?: unknown[] }).items || [];
        for (const raw of items) {
          const parsed = OrderItemSchema.safeParse(raw);
          if (!parsed.success) continue;
          const it = parsed.data;
          const productRef = tenantDb.collection(collectionPath(COLLECTIONS.PRODUCTS)).doc(it.productId);
          if (!it.variantId) {
            tx.update(productRef, {
              stock: FieldValue.increment(it.quantity),
              totalStock: FieldValue.increment(it.quantity),
            });
          } else {
            const variantRef = productRef.collection('variants').doc(it.variantId);
            const [pDoc, vDoc] = await Promise.all([tx.get(productRef), tx.get(variantRef)]);
            if (vDoc.exists) {
              tx.update(variantRef, { stock: FieldValue.increment(it.quantity) });
            }
            if (pDoc.exists) {
              tx.update(productRef, { totalStock: FieldValue.increment(it.quantity) });
            }
          }
          restored += it.quantity;
        }
      }
      tx.delete(orderRef);
    });

    await audit(tenantDb, 'delete_order', {
      orderId,
      storeId,
      stockRestored: restored,
      by: String(request.auth?.token?.['email'] || ''),
    });
    logger.info(`[SuperAdmin] Pedido ${orderId} eliminado (tienda ${storeId}, stock restituido ${restored}).`);
    return { success: true, message: `Pedido eliminado${restored > 0 ? ` (stock restituido: ${restored} u.)` : ''}.` };
  },
);
