import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { COLLECTIONS, collectionPath, singletonDoc } from './core/config';

const db = getFirestore();
const auth = getAuth();

type StaffRole = 'admin' | 'owner' | 'staff';

interface StaffMember {
  email: string;
  role: StaffRole;
  createdAt?: string;
  updatedAt?: string;
}

function ensureOwner(
  requestAuth: { token?: Record<string, unknown>; uid?: string } | null | undefined,
): void {
  if (requestAuth?.token?.['role'] !== 'owner') {
    throw new HttpsError('permission-denied', 'Only store owners can perform this action.');
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatTimestamp(value: unknown): string | undefined {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return undefined;
}

function roleLabel(role: StaffRole): string {
  if (role === 'admin') return 'Store Admin';
  if (role === 'staff') return 'Operador / Staff';
  return role;
}

// Escapa valores interpolados en plantillas HTML para prevenir inyección de HTML
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInvitationEmailHtml(params: {
  storeName: string;
  role: StaffRole;
  loginUrl: string;
  invitedByEmail?: string;
}): string {
  const { storeName, role, loginUrl, invitedByEmail } = params;
  const safeStoreName = escapeHtml(storeName);
  const safeInviter = invitedByEmail
    ? `<p style="margin:0 0 18px;color:#334155;font-size:14px;">Invited by: <strong>${escapeHtml(invitedByEmail)}</strong></p>`
    : '';

  return `
    <div style="background:#f1f5f9;padding:28px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
        <div style="padding:20px 24px;background:linear-gradient(120deg,#0f172a,#1d4ed8);color:#ffffff;">
          <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Vertex Commerce</p>
          <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;">Your admin access is ready</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 14px;color:#0f172a;font-size:15px;line-height:1.55;">
            You were granted access to manage <strong>${safeStoreName}</strong> in Vertex.
          </p>
          <p style="margin:0 0 18px;color:#334155;font-size:14px;">Assigned role: <strong>${roleLabel(role)}</strong></p>
          ${safeInviter}
          <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.5;">
            Sign in using Google OAuth with this same email address.
          </p>
          <p style="margin:0 0 22px;">
            <a href="${loginUrl}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;">Open Admin Panel</a>
          </p>
          <p style="margin:0 0 10px;color:#64748b;font-size:12px;line-height:1.45;">
            If the button does not work, copy and paste this URL in your browser:
          </p>
          <p style="margin:0;color:#1d4ed8;font-size:12px;word-break:break-all;">${loginUrl}</p>
        </div>
      </div>
    </div>
  `;
}

function resolveTenantId(request: any): string {
  // SIEMPRE desde el token de autenticación — nunca del header Origin/body,
  // que son controlables por un cliente HTTP arbitrario (evita escalada cross-tenant).
  return String(request.auth?.token?.['tenantId'] ?? '');
}

export const getAdminStaff = onCall({ cors: true, invoker: 'public' }, async (request) => {
  ensureOwner(request.auth);

  const tenantId = resolveTenantId(request);
  const staffSnapshot = await db
    .collection(COLLECTIONS.ADMIN_ROLES)
    .where('tenantId', '==', tenantId)
    .get();

  const staffCandidates = staffSnapshot.docs.map((doc): StaffMember | null => {
    const data = doc.data();
    const role = String(data['role'] || '')
      .trim()
      .toLowerCase();
    if (role !== 'admin' && role !== 'owner' && role !== 'staff') {
      return null;
    }

    const docId = doc.id;
    const prefix = `${tenantId}_`;
    let email = docId;
    if (docId.startsWith(prefix)) {
      email = docId.substring(prefix.length);
    }

    return {
      email,
      role: role as StaffRole,
      createdAt: formatTimestamp(data['createdAt']),
      updatedAt: formatTimestamp(data['updatedAt']),
    };
  });

  const staff: StaffMember[] = staffCandidates
    .filter((item): item is StaffMember => item !== null)
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

  return { staff };
});

export const upsertAdminStaff = onCall({ cors: true, invoker: 'public' }, async (request) => {
  ensureOwner(request.auth);

  const email = normalizeEmail(String(request.data?.['email'] || ''));
  const role = String(request.data?.['role'] || '')
    .trim()
    .toLowerCase() as StaffRole;

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }

  if (role !== 'admin' && role !== 'owner' && role !== 'staff') {
    throw new HttpsError('invalid-argument', 'Only owner, admin, or staff roles are supported.');
  }

  const tenantId = resolveTenantId(request);
  const compositeKey = `${tenantId}_${email}`;

  const now = FieldValue.serverTimestamp();
  const roleRef = db.collection(COLLECTIONS.ADMIN_ROLES).doc(compositeKey);
  const existing = await roleRef.get();

  await roleRef.set(
    {
      email,
      role,
      tenantId,
      storeId: tenantId,
      status: 'active',
      source: 'store-admin-panel',
      updatedAt: now,
      createdAt: existing.exists ? existing.get('createdAt') || now : now,
    },
    { merge: true },
  );

  // Asignar inmediatamente los custom claims si el usuario ya existe en Auth
  try {
    const userRecord = await auth.getUserByEmail(email);
    if (userRecord?.uid) {
      await auth.setCustomUserClaims(userRecord.uid, {
        admin: true,
        tenantId,
        role,
      });
      logger.info(`[upsertAdminStaff] Claims set for ${email}: tenantId=${tenantId}, role=${role}`);
    }
  } catch (err: any) {
    if (err.code !== 'auth/user-not-found') {
      logger.warn(`[upsertAdminStaff] Could not set claims immediately for ${email}:`, err);
    }
  }

  const storeConfig = await db.doc(singletonDoc(tenantId, 'configuracion', 'store')).get();
  const storeName =
    String(storeConfig.data()?.['storeName'] || 'Vertex Store').trim() || 'Vertex Store';
  const loginUrl = `https://${process.env['GCLOUD_PROJECT'] || process.env['GOOGLE_CLOUD_PROJECT']}.web.app/admin/login`;
  const invitedByEmail =
    String(request.auth?.token?.['email'] || '')
      .trim()
      .toLowerCase() || undefined;

  try {
    await db.collection(collectionPath(COLLECTIONS.MAIL)).add({
      storeId: tenantId,
      to: [email],
      message: {
        subject: `${roleLabel(role)} access granted for ${storeName}`,
        html: buildInvitationEmailHtml({
          storeName,
          role,
          loginUrl,
          invitedByEmail,
        }),
        text: `You now have ${roleLabel(role)} access for ${storeName}. Sign in with Google OAuth: ${loginUrl}`,
      },
      meta: {
        type: 'staff-invite',
        role,
        invitedByEmail: invitedByEmail || null,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('Failed to enqueue store staff invitation email', error);
  }

  return { success: true, email, role };
});

export const revokeAdminStaff = onCall({ cors: true, invoker: 'public' }, async (request) => {
  ensureOwner(request.auth);

  const email = normalizeEmail(String(request.data?.['email'] || ''));
  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }

  const requesterEmail = normalizeEmail(String(request.auth?.token?.['email'] || ''));
  if (requesterEmail && requesterEmail === email) {
    throw new HttpsError('failed-precondition', 'You cannot revoke your own admin role.');
  }

  const tenantId = resolveTenantId(request);
  const compositeKey = `${tenantId}_${email}`;

  await db.collection(COLLECTIONS.ADMIN_ROLES).doc(compositeKey).delete();
  return { success: true, email };
});
