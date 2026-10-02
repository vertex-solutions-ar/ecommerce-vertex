import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, collectionPath } from './core/config';
import { OrderItemSchema } from './core/order.model';

const db = getFirestore();

export const cleanupExpiredOrders = onSchedule('every 60 minutes', async (event) => {
  logger.info('Iniciando limpieza de órdenes expiradas...');
  const now = Timestamp.now();

  // Flat orders collection: find expired orders across all stores
  const expiredOrdersQuery = db
    .collection(collectionPath(COLLECTIONS.ORDERS))
    .where('status', '==', 'processing')
    .where('stockDecremented', '==', true)
    .where('mercadopago_expiration_date', '<=', now);

  const snapshot = await expiredOrdersQuery.get();

  if (snapshot.empty) {
    logger.info('No hay órdenes expiradas para limpiar.');
    return;
  }

  logger.info(`Se encontraron ${snapshot.docs.length} órdenes expiradas.`);
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const orderData = doc.data();
    const orderId = doc.id;

    // NUNCA cancelar/revertir órdenes ya pagadas (presencia de paymentId = pago aprobado).
    const paymentDetails = orderData.paymentDetails as Record<string, unknown> | undefined;
    if (paymentDetails?.['paymentId']) {
      logger.info(
        `Orden ${orderId} ya tiene pago aprobado (paymentId). Omitiendo cancelación por expiración.`,
      );
      continue;
    }

    logger.warn(
      `Procesando orden expirada: ${orderId}. El pago fue abandonado. Devolviendo stock.`,
    );

    for (const item of orderData.items) {
      const itemValidation = OrderItemSchema.safeParse(item);
      if (!itemValidation.success) {
        logger.warn(`Item inválido en orden ${orderId} durante limpieza.`, { item });
        continue;
      }
      const validItem = itemValidation.data;

      const productRef = db
        .collection(collectionPath(COLLECTIONS.PRODUCTS))
        .doc(validItem.productId);

      if (!validItem.variantId) {
        batch.update(productRef, {
          stock: FieldValue.increment(validItem.quantity),
          totalStock: FieldValue.increment(validItem.quantity),
        });
      } else {
        const variantRef = productRef
          .collection('variants')
          .doc(validItem.variantId);

        const [productDoc, variantDoc] = await Promise.all([
          productRef.get(),
          variantRef.get(),
        ]);

        if (variantDoc.exists) {
          batch.update(variantRef, {
            stock: FieldValue.increment(validItem.quantity),
          });
        }
        if (productDoc.exists) {
          batch.update(productRef, {
            totalStock: FieldValue.increment(validItem.quantity),
          });
        }
      }
    }

    batch.update(doc.ref, {
      status: 'cancelled',
      stockDecremented: false,
      notes: 'Orden cancelada automáticamente por expiración o abandono de pago.',
    });
  }

  await batch.commit();
  logger.info(
    `Limpieza completada. ${snapshot.docs.length} órdenes actualizadas y stock devuelto.`,
  );
});
