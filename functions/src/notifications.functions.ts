import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { OrderSchema } from './core/order.model';
import type { Order } from './core/order.model';
import { COLLECTIONS, DOCS, collectionPath, singletonDoc } from './core/config';
import { sendEmail, getNotificationEmail } from './core/email.service';
import { resolveTenantDb } from './core/tenant-db';

function envSiteUrl(): string {
  return process.env.SITE_URL || 'https://ecommerce-vertex.web.app';
}

async function getEmailConfig(storeId: string, tenantDb: Firestore) {
  // 1) Config pública del storefront (configuracion/store_*) — datos de display.
  let publicSnap = await tenantDb.doc(singletonDoc(storeId, 'configuracion', 'store')).get();
  if (!publicSnap.exists) {
    publicSnap = await tenantDb.doc('configuracion/store').get();
  }
  const merged: Record<string, unknown> = publicSnap.exists
    ? ((publicSnap.data() as Record<string, unknown>) ?? {})
    : {};

  // 2) Gestión de Emails (settings/emailTemplates_*) — fuente de verdad de emails.
  // Gana sobre la config pública para los campos de email, así el vendedor recibe
  // las notificaciones al email real configurado (no a placeholders de seed).
  let configDoc = await tenantDb
    .doc(singletonDoc(storeId, COLLECTIONS.SETTINGS, DOCS.EMAIL_TEMPLATES))
    .get();
  if (!configDoc.exists) {
    configDoc = await tenantDb.doc(`${COLLECTIONS.SETTINGS}/${DOCS.EMAIL_TEMPLATES}`).get();
  }
  if (configDoc.exists) {
    const settings = configDoc.data() as Record<string, unknown>;
    if (settings) {
      if (settings['storeOwnerEmail']) merged['storeOwnerEmail'] = settings['storeOwnerEmail'];
      if (settings['notificationEmail']) merged['notificationEmail'] = settings['notificationEmail'];
      if (settings['emailSenderName']) merged['emailSenderName'] = settings['emailSenderName'];
      if (settings['emailSignature']) merged['emailSignature'] = settings['emailSignature'];
      if (settings['storeWhatsappNumber']) merged['storeWhatsappNumber'] = settings['storeWhatsappNumber'];
      if (settings['adminNotification']) merged['adminNotification'] = settings['adminNotification'];
      if (settings['customerConfirmation']) {
        merged['customerConfirmation'] = settings['customerConfirmation'];
      }
      if (settings['storeName']) merged['storeName'] = settings['storeName'];
    }
  }

  // 3) Contacto de la config pública como respaldo si no hay emails definidos.
  const pub = publicSnap.exists ? (publicSnap.data() as Record<string, unknown>) : null;
  if (pub) {
    if (pub['contact'] && typeof pub['contact'] === 'object') {
      const contact = pub['contact'] as Record<string, unknown>;
      if (contact['email'] && !merged['storeOwnerEmail']) {
        merged['storeOwnerEmail'] = contact['email'];
      }
      if (contact['whatsApp'] && !merged['storeWhatsappNumber']) {
        merged['storeWhatsappNumber'] = contact['whatsApp'];
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

async function getAttributeMap(storeId: string, tenantDb: Firestore): Promise<Map<string, string>> {
  const attributeMap = new Map<string, string>();
  try {
    const attributesSnapshot = await tenantDb
      .collection(collectionPath(COLLECTIONS.ATTRIBUTES))
      .where('storeId', '==', storeId)
      .get();
    attributesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.name) {
        attributeMap.set(doc.id, data.name);
      }
    });
  } catch (error) {
    logger.error('Error fetching attributes for email generation:', error);
  }
  return attributeMap;
}

function getVariantDescription(
  attributes: { [key: string]: string },
  attributeMap: Map<string, string>,
): string {
  return Object.entries(attributes)
    .map(([key, value]) => {
      const name = attributeMap.get(key) || key;
      return `${name}: ${value}`;
    })
    .join(' / ');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envuelve el contenido de un email en una plantilla moderna y profesional
 * (tablas + estilos inline = email-safe en Gmail/Outlook/Apple Mail).
 * `body` ya viene con HTML; `footer` típicamente la firma de la tienda.
 */
function buildEmailShell(
  body: string,
  opts: { storeName: string; subject: string; footer?: string; storeSupportEmail?: string },
): string {
  const footer = (opts.footer || '').trim();
  const supportEmail = (opts.storeSupportEmail || '').trim();
  return `
  <div style="background-color:#f1f5f9;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(15,23,42,0.04);">
      <tr>
        <td style="background-color:#1e1b4b;background-image:linear-gradient(135deg,#312e81 0%,#4f46e5 50%,#06b6d4 100%);padding:28px 32px;">
          <div style="font-size:22px;line-height:1.25;color:#ffffff;font-weight:800;letter-spacing:-0.3px;">${opts.storeName}</div>
          <div style="margin-top:6px;font-size:13px;line-height:1.4;color:rgba(255,255,255,0.9);">${opts.subject}</div>
          <div style="margin-top:12px;display:inline-block;background-color:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.35);border-radius:999px;padding:4px 12px;font-size:11px;font-weight:600;color:#ffffff;letter-spacing:0.02em;">🔒 Compra Protegida con Encriptación SSL</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 24px;color:#0f172a;font-size:14px;line-height:1.65;">${body}</td>
      </tr>
      <tr>
        <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;text-align:center;">
          ${footer ? `<div style="margin-bottom:8px;font-weight:500;color:#475569;">${footer}</div>` : ''}
          <div style="margin-bottom:4px;">Recibiste este correo porque realizaste una compra en <strong>${opts.storeName}</strong> a través de la plataforma Vertex.</div>
          ${supportEmail ? `<div style="margin-bottom:6px;">Contacto de soporte de la tienda: <a href="mailto:${supportEmail}" style="color:#4f46e5;text-decoration:underline;">${supportEmail}</a></div>` : ''}
          <div style="margin-top:8px;font-weight:600;color:#475569;">Procesado de forma segura por Vertex Platform</div>
        </td>
      </tr>
    </table>
  </div>`;
}

function buildEmailHtml(
  template: string,
  order: Order,
  orderId: string,
  attributeMap: Map<string, string>,
  extras: { manageButtonUrl?: string | null; whatsappUrl?: string | null } = {},
  shell: {
    storeName: string;
    subject: string;
    footer?: string;
    storeSupportEmail?: string;
  } = {
    storeName: 'Vertex Store',
    subject: 'Notificación de pedido',
  },
): string {
  const safeTemplate = typeof template === 'string' ? template : '';
  const itemsHtml = order.items
    .map((item) => {
      const description = getVariantDescription(item.attributes, attributeMap);
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:600;">
          ${escapeHtml(item.productName)}
          ${description ? `<br/><span style="color:#64748b;font-size:12px;font-weight:normal;">${escapeHtml(description)}</span>` : ''}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;white-space:nowrap;">
          <span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;">x${item.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:700;text-align:right;white-space:nowrap;">
          $${(item.price * item.quantity).toFixed(2)}
        </td>
      </tr>`;
    })
    .join('');

  const isPickup = order.deliverySelection?.type === 'store_pickup';
  const pickupAddress = order.deliverySelection?.pickupAddressFormatted || 'Sucursal Comercial / Showroom';
  const notes = order.deliverySelection?.notes;

  const deliveryTable = `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:12px 0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Modalidad de Entrega:</td>
          <td style="font-size:13px;font-weight:700;color:#0f172a;text-align:right;padding-bottom:6px;">
            ${isPickup ? '🏬 Retiro en el Local' : '🚚 Envío a Domicilio'}
          </td>
        </tr>
        ${isPickup ? `
        <tr>
          <td style="font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding:8px 0 4px;">Punto de Retiro:</td>
          <td style="font-size:13px;font-weight:600;color:#0f172a;text-align:right;border-top:1px solid #e2e8f0;padding:8px 0 4px;">
            ${escapeHtml(pickupAddress)}
          </td>
        </tr>
        ${notes ? `
        <tr>
          <td colspan="2" style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:6px;">
            <em>Instrucciones: ${escapeHtml(notes)}</em>
          </td>
        </tr>` : ''}
        ` : `
        <tr>
          <td colspan="2" style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:6px;">
            Coordinaremos los detalles de envío y seguimiento con vos a la brevedad.
          </td>
        </tr>
        `}
      </table>
    </div>`;

  let emailBody = safeTemplate
    .replace(/{orderId}/g, escapeHtml(orderId))
    .replace(/{clientName}/g, escapeHtml(order.clientName))
    .replace(/{clientEmail}/g, escapeHtml(order.clientEmail || 'N/A'))
    .replace(/{clientPhone}/g, escapeHtml(order.clientPhone || 'N/A'))
    .replace(
      /{itemsList}/g,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tbody>${itemsHtml}</tbody></table>`,
    )
    .replace(/{deliverySection}/g, deliveryTable)
    .replace(/{totalAmount}/g, order.total.toFixed(2));

  if (!safeTemplate.includes('{deliverySection}')) {
    emailBody += deliveryTable;
  }

  const buttonPrimary = `style="display:inline-block;padding:12px 22px;margin:8px 10px 8px 0;font-size:14px;font-weight:700;color:#ffffff;background-color:#4f46e5;border-radius:10px;text-decoration:none;box-shadow:0 2px 6px rgba(79,70,229,0.25);"`;
  const buttonWhatsapp = `style="display:inline-block;padding:12px 22px;margin:8px 10px 8px 0;font-size:14px;font-weight:700;color:#ffffff;background-color:#16a34a;border-radius:10px;text-decoration:none;box-shadow:0 2px 6px rgba(22,163,74,0.25);"`;

  let buttonsHtml = '<div style="margin-top: 24px; text-align: left;">';
  if (extras.manageButtonUrl) {
    buttonsHtml += `<a href="${extras.manageButtonUrl}" ${buttonPrimary}>Gestionar Pedido</a>`;
  }
  if (extras.whatsappUrl) {
    buttonsHtml += `<a href="${extras.whatsappUrl}" ${buttonWhatsapp}>Contactar por WhatsApp</a>`;
  }
  buttonsHtml += '</div>';

  return buildEmailShell(emailBody + buttonsHtml, {
    storeName: shell.storeName,
    subject: shell.subject,
    footer: shell.footer,
    storeSupportEmail: shell.storeSupportEmail,
  });
}

export async function sendOrderNotificationEmailsDirect(
  orderId: string,
  orderData: Order,
  tenantDb: Firestore,
  storeId?: string,
  tenantProjectId?: string,
): Promise<{ success: boolean; adminSent: boolean; customerSent: boolean; error?: string }> {
  const orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);
  let deliveryClaimed = false;

  try {
    const effectiveStoreId =
      storeId ||
      ((orderData as unknown as Record<string, unknown>)['storeId'] as string) ||
      'store';
    logger.info(
      `[OrderNotifications] Enviando emails para pedido #${orderId} (store: ${effectiveStoreId}, shard: ${tenantProjectId || 'default'})...`,
    );

    deliveryClaimed = await tenantDb.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      const orderRaw = orderSnap.data() as Record<string, unknown> | undefined;

      if (!orderSnap.exists || orderRaw?.['emailDirectSent'] === true) {
        return false;
      }

      if (orderRaw?.['emailDispatchState'] === 'sending') {
        return false;
      }

      transaction.update(orderRef, {
        emailDispatchState: 'sending',
        emailDispatchStartedAt: new Date(),
      });
      return true;
    });

    if (!deliveryClaimed) {
      logger.info(`[OrderNotifications] El pedido #${orderId} ya tiene un envío de email en curso o completado. Omitiendo.`);
      return { success: true, adminSent: false, customerSent: false };
    }

    const config = await getEmailConfig(effectiveStoreId, tenantDb);
    const attributeMap = await getAttributeMap(effectiveStoreId, tenantDb);

    // Deliverabilidad: el remitente DEBE ser la cuenta SMTP autenticada (Gmail aplica SPF/DKIM
    // sobre el envelope). Un dominio no autenticado (no-reply@ecommerce-vertex…) rompe la
    // alineación y los mails caen en SPAM. El nombre visible sigue siendo el de la tienda.
    const smtpUser = (process.env.SMTP_USER || 'vertex.tech.dev@gmail.com').trim();
    const storeName = (config?.['storeName'] as string) || 'Vertex Store';
    const cleanStoreName = storeName.replace(/"/g, '').trim();
    const fromAddress = `"${cleanStoreName} | Vertex" <${smtpUser}>`;
    const emailSignature = ((config?.['emailSignature'] as string) || '').trim();
    const storeSupportEmail =
      ((config?.['storeOwnerEmail'] as string) || (config?.['notificationEmail'] as string) || '').trim();

    let adminSent = false;
    let customerSent = false;

    // 1. Recolección de Destinatarios de Tienda (Owner + Staff activo)
    const staffRecipients = new Set<string>();

    const primaryOwnerEmail = (
      (config?.['storeOwnerEmail'] as string) ||
      (config?.['notificationEmail'] as string) ||
      getNotificationEmail()
    )?.trim().toLowerCase();

    if (primaryOwnerEmail && primaryOwnerEmail.includes('@')) {
      staffRecipients.add(primaryOwnerEmail);
    }

    // Consultar todos los administradores y empleados activos de la tienda en admin_roles
    try {
      const allowedRoles = new Set(['owner', 'admin', 'staff', 'employee']);
      // 1. Consulta por storeId / tenantId directo
      const rolesSnap = await tenantDb
        .collection(COLLECTIONS.ADMIN_ROLES)
        .where('storeId', '==', effectiveStoreId)
        .get();

      rolesSnap.forEach((doc) => {
        const d = doc.data();
        const role = String(d?.['role'] || '').trim().toLowerCase();
        const status = String(d?.['status'] || 'active').trim().toLowerCase();
        const email = String(d?.['email'] || (doc.id.includes('_') ? doc.id.split('_').slice(1).join('_') : doc.id))
          .trim()
          .toLowerCase();

        if (email.includes('@') && allowedRoles.has(role) && status !== 'inactive' && status !== 'suspended') {
          staffRecipients.add(email);
        }
      });

      // 2. Fallback de claves compuestas {tenantId}_{email} por si storeId no fue indexado
      if (staffRecipients.size === 0 || (staffRecipients.size === 1 && primaryOwnerEmail)) {
        const allRolesSnap = await tenantDb.collection(COLLECTIONS.ADMIN_ROLES).get();
        allRolesSnap.forEach((doc) => {
          if (doc.id.startsWith(`${effectiveStoreId}_`)) {
            const d = doc.data();
            const role = String(d?.['role'] || '').trim().toLowerCase();
            const status = String(d?.['status'] || 'active').trim().toLowerCase();
            const email = String(d?.['email'] || doc.id.slice(`${effectiveStoreId}_`.length))
              .trim()
              .toLowerCase();
            if (email.includes('@') && allowedRoles.has(role) && status !== 'inactive' && status !== 'suspended') {
              staffRecipients.add(email);
            }
          }
        });
      }
    } catch (staffErr) {
      logger.warn(
        `[OrderNotifications] Error consultando staff activo para ${effectiveStoreId}:`,
        staffErr,
      );
    }

    const recipientList = Array.from(staffRecipients);

    if (recipientList.length > 0) {
      const adminConfig = (config?.['adminNotification'] as {
        subject?: string;
        template?: string;
        showManageButton?: boolean;
        showWhatsappButton?: boolean;
      }) || {
        subject: `Nueva venta aprobada #${orderId} - ${cleanStoreName}`,
        template: `<p>Has recibido una nueva venta aprobada para el pedido #{orderId} de {clientName}.</p><p>Total: $${orderData.total}</p>{itemsList}`,
        showManageButton: true,
        showWhatsappButton: true,
      };

      const manageButtonUrl = adminConfig.showManageButton
        ? `${envSiteUrl()}/admin/orders/detail/${orderId}`
        : null;
      const whatsappMessage = encodeURIComponent(
        `Hola ${orderData.clientName}, te contacto sobre tu pedido #${orderId}.`,
      );
      const whatsappUrl =
        adminConfig.showWhatsappButton && orderData.clientPhone
          ? `https://wa.me/${orderData.clientPhone.replace(/[^0-9]/g, '')}?text=${whatsappMessage}`
          : null;

      const adminHtml = buildEmailHtml(
        adminConfig.template || `<p>Nueva venta #{orderId}</p>{itemsList}`,
        orderData,
        orderId,
        attributeMap,
        { manageButtonUrl, whatsappUrl },
        {
          storeName: cleanStoreName,
          subject: `Nueva venta #${orderId} - ${cleanStoreName}`,
          footer: emailSignature,
          storeSupportEmail,
        },
      );

      const rawAdminSubject =
        adminConfig.subject || `Nueva venta aprobada #${orderId} - ${cleanStoreName}`;
      const adminSubject = rawAdminSubject
        .replace(/{orderId}/g, orderId)
        .replace(/{storeName}/g, cleanStoreName);

      // Despacho concurrente a todo el equipo administrativo
      const results = await Promise.allSettled(
        recipientList.map((targetEmail) =>
          sendEmail({
            to: targetEmail,
            from: fromAddress,
            subject: adminSubject,
            html: adminHtml,
            replyTo: orderData.clientEmail || storeSupportEmail,
          }),
        ),
      );

      const successfulSends = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      );
      adminSent = successfulSends.length > 0;

      logger.info(
        `[OrderNotifications] Emails despachados a equipo de tienda (${recipientList.join(
          ', ',
        )}): ${successfulSends.length}/${recipientList.length} exitosos.`,
      );
    } else {
      logger.warn(
        `[OrderNotifications] No se encontraron destinatarios de staff o dueño para la tienda ${effectiveStoreId}.`,
      );
    }

    // 2. Email al Comprador / Cliente
    if (orderData.clientEmail) {
      const customerConfig = (config?.['customerConfirmation'] as {
        subject?: string;
        template?: string;
        showWhatsappButton?: boolean;
      }) || {
        subject: `Pedido #${orderId} confirmado - ${cleanStoreName}`,
        template: `<p>¡Hola {clientName}! Gracias por tu compra.</p><p>Tu pedido #{orderId} fue recibido y se está procesando.</p>{itemsList}`,
        showWhatsappButton: true,
      };

      const isPickup = orderData.deliverySelection?.type === 'store_pickup';
      const customerWaMsg = encodeURIComponent(
        isPickup
          ? `Hola! Hice el pedido #${orderId} para retirar por el local (${orderData.deliverySelection?.pickupAddressFormatted || 'Sucursal seleccionada'}). ¿Cuándo puedo pasar a buscarlo?`
          : `Hola! Hice el pedido #${orderId} y quisiera coordinar el envío a domicilio.`,
      );
      const cleanStoreWa = ((config?.['storeWhatsappNumber'] as string) || '').replace(
        /[^0-9]/g,
        '',
      );
      const whatsappUrl =
        customerConfig.showWhatsappButton && cleanStoreWa
          ? `https://wa.me/${cleanStoreWa}?text=${customerWaMsg}`
          : null;

      const customerHtml = buildEmailHtml(
        customerConfig.template || `<p>¡Gracias por tu compra #{orderId}!</p>{itemsList}`,
        orderData,
        orderId,
        attributeMap,
        { whatsappUrl },
        {
          storeName: cleanStoreName,
          subject: `Pedido #${orderId} confirmado - ${cleanStoreName}`,
          footer: emailSignature,
          storeSupportEmail,
        },
      );

      const rawCustomerSubject =
        customerConfig.subject || `Pedido #${orderId} confirmado - ${cleanStoreName}`;
      const customerSubject = rawCustomerSubject
        .replace(/{orderId}/g, orderId)
        .replace(/{storeName}/g, cleanStoreName);

      const custResult = await sendEmail({
        to: orderData.clientEmail,
        from: fromAddress,
        subject: customerSubject,
        html: customerHtml,
      });

      customerSent = custResult.success;
      logger.info(
        `[OrderNotifications] Email a comprador (${orderData.clientEmail}): ${
          custResult.success ? 'ENVIADO' : 'FALLÓ'
        }${custResult.success ? '' : custResult.skipped ? ' (SMTP no configurado)' : ' (error de envío)'}`,
      );
    } else {
      logger.warn(`[OrderNotifications] El pedido #${orderId} no tiene clientEmail.`);
    }

    try {
      await orderRef.update({
        notificationsSent: adminSent || customerSent,
        emailDirectSent: adminSent || customerSent,
        emailDispatchState: adminSent || customerSent ? 'sent' : 'failed',
        notificationsSentAt: new Date(),
        ...(adminSent || customerSent
          ? {}
          : {
              emailDispatchError:
                'No se pudo enviar ningún email. Verificá SMTP (secreto SMTP_PASSWORD) y destinatarios de la tienda en logs [EmailService]/[OrderNotifications].',
            }),
      });
    } catch (updateErr) {
      logger.warn(
        `[OrderNotifications] No se pudo actualizar notificationsSent en pedido #${orderId}:`,
        updateErr,
      );
    }

    return { success: adminSent || customerSent, adminSent, customerSent };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (deliveryClaimed) {
      try {
        await orderRef.update({
          emailDispatchState: 'failed',
          emailDispatchFailedAt: new Date(),
        });
      } catch (updateErr) {
        logger.warn(`[OrderNotifications] No se pudo liberar el envío de email para pedido #${orderId}:`, updateErr);
      }
    }
    logger.error(
      `[OrderNotifications] Error enviando notificaciones para pedido #${orderId}:`,
      err,
    );
    return { success: false, adminSent: false, customerSent: false, error: errorMsg };
  }
}

export const notifyOrderConfirmation = onRequest(
  { cors: true, invoker: 'public' },
  async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
      }

      let payload: Record<string, unknown> = {};
      if (typeof request.body === 'object' && request.body !== null) {
        payload = request.body as Record<string, unknown>;
      } else if (typeof request.body === 'string') {
        try {
          payload = JSON.parse(request.body) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      }

      const orderId = String(payload['orderId'] || request.query['orderId'] || '').trim();
      const tenantId = String(payload['tenantId'] || request.query['tenantId'] || '').trim();
      let tenantProjectId = String(
        payload['tenantProjectId'] || request.query['tenantProjectId'] || '',
      ).trim();

      if (!orderId) {
        response.status(400).json({ error: 'orderId es requerido.' });
        return;
      }

      let tenantDb = resolveTenantDb(tenantProjectId || undefined);
      let orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);
      let orderSnap = await orderRef.get();

      // Si no se encuentra en el proyecto indicado o por defecto, intentar buscar el proyecto en la colección stores de la plataforma
      if (!orderSnap.exists && tenantId) {
        try {
          const defaultFirestore = getFirestore();
          const storesSnap = await defaultFirestore
            .collection('stores')
            .where('slug', '==', tenantId)
            .limit(1)
            .get();
          if (!storesSnap.empty) {
            const storeData = storesSnap.docs[0].data();
            if (storeData['firebaseProjectId']) {
              tenantProjectId = String(storeData['firebaseProjectId']);
              tenantDb = resolveTenantDb(tenantProjectId);
              orderRef = tenantDb.collection(collectionPath(COLLECTIONS.ORDERS)).doc(orderId);
              orderSnap = await orderRef.get();
            }
          }
        } catch (lookupErr) {
          logger.warn(
            `[notifyOrderConfirmation] Falló búsqueda de shard para tenantId ${tenantId}:`,
            lookupErr,
          );
        }
      }

      if (!orderSnap.exists) {
        logger.warn(
          `[notifyOrderConfirmation] Pedido #${orderId} no encontrado en proyecto ${tenantProjectId || 'default'}.`,
        );
        response.status(404).json({ error: `Pedido #${orderId} no encontrado.` });
        return;
      }

      const rawData = orderSnap.data() as Record<string, unknown>;
      const force = Boolean(payload['force'] || request.query['force']);
      if (!force && rawData['emailDirectSent'] === true) {
        logger.info(
          `[notifyOrderConfirmation] Pedido #${orderId} ya tiene emailDirectSent=true. Omitiendo.`,
        );
        response.status(200).json({ success: true, alreadySent: true });
        return;
      }

      const parsed = OrderSchema.safeParse({ id: orderId, ...rawData });
      if (!parsed.success) {
        logger.error(
          `[notifyOrderConfirmation] Estructura de pedido inválida para #${orderId}:`,
          parsed.error.flatten(),
        );
        response.status(400).json({ error: 'Estructura de pedido inválida.' });
        return;
      }

      const result = await sendOrderNotificationEmailsDirect(
        orderId,
        parsed.data,
        tenantDb,
        tenantId || String(rawData['storeId'] || ''),
        tenantProjectId || undefined,
      );

      response.status(200).json(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[notifyOrderConfirmation] Error inesperado procesando pedido:`, err);
      response.status(500).json({ success: false, error: errorMsg });
    }
  },
);
