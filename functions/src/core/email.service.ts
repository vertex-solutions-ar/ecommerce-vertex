import * as nodemailer from 'nodemailer';
import * as logger from 'firebase-functions/logger';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/**
 * Convierte HTML básico en texto plano legible (multipart MIME).
 * Cubre saltos de línea, tags y entidades típicas de los templates existentes.
 */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let cachedSmtpPassword: string | null = null;
let secretsClient: SecretManagerServiceClient | null = null;

function getSecretsClient(): SecretManagerServiceClient {
  if (!secretsClient) {
    secretsClient = new SecretManagerServiceClient();
  }
  return secretsClient;
}

export async function resolveSmtpPassword(): Promise<string> {
  if (cachedSmtpPassword) return cachedSmtpPassword;

  const envPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();
  if (envPass) {
    cachedSmtpPassword = envPass;
    return cachedSmtpPassword;
  }

  const currentProject =
    (process.env.GCLOUD_PROJECT || '').trim() ||
    (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : '');

  const candidateProjects = Array.from(
    new Set(
      [
        currentProject,
        'ecommerce-vertex-dev',
        'ecommerce-vertex',
        'vertex-platform-dev',
        'vertex-platform-app',
      ].filter(Boolean),
    ),
  );

  const secretNames = [
    'ext-firestore-send-email-SMTP_PASSWORD',
    'SMTP_PASSWORD',
    'SMTP_PASS',
    'smtp-password',
    'smtp-pass',
  ];

  const client = getSecretsClient();

  for (const proj of candidateProjects) {
    for (const secName of secretNames) {
      try {
        const [version] = await client.accessSecretVersion({
          name: `projects/${proj}/secrets/${secName}/versions/latest`,
        });
        const pass = version.payload?.data?.toString()?.trim();
        if (pass) {
          cachedSmtpPassword = pass;
          logger.info(
            `[EmailService] SMTP password successfully resolved from secret ${secName} in project ${proj}`,
          );
          return cachedSmtpPassword;
        }
      } catch {
        // Intentar con el siguiente nombre de secreto o proyecto
      }
    }
  }

  return '';
}

export async function sendEmail(
  options: SendEmailOptions,
): Promise<{ success: boolean; skipped?: boolean; error?: unknown }> {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const portStr = (process.env.SMTP_PORT || '587').trim();
  const port = Number(portStr) || 587;
  const user = (process.env.SMTP_USER || 'vertex.tech.dev@gmail.com').trim();
  const pass = await resolveSmtpPassword();
  const defaultFrom = (process.env.FROM_EMAIL || `"Vertex Store" <${user}>`).trim();

  if (!pass) {
    logger.warn(
      '[EmailService] SMTP password not found in environment or Secret Manager. Skipping email send.',
      {
        to: options.to,
        subject: options.subject,
      },
    );
    return { success: false, skipped: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const fromAddress =
      options.from || defaultFrom || `"Vertex" <${user}>`;
    const textBody = (options.text || '').trim() || htmlToText(options.html);

    const recipientStr = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const cleanTo = recipientStr.replace(/[^a-zA-Z0-9@._-]/g, '');
    const unsubscribeEmail = process.env.SMTP_FROM || user;

    const mailPayload: nodemailer.SendMailOptions = {
      from: fromAddress,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: textBody,
      headers: {
        // Cabecera estándar para correos transaccionales (evita auto-respuestas de Exchange).
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        // Indica que es un correo automático legítimo evitando bucles y reduciendo spam score
        'Auto-Submitted': 'auto-generated',
        // Precedence estándar para correos de plataforma
        Precedence: 'bulk',
        // Desuscriptión estándar RFC 2369
        'List-Unsubscribe': `<mailto:${unsubscribeEmail}?subject=unsubscribe>`,
        // Identificador de entidad para reputación de transporte
        'X-Entity-Ref-ID': `vtx-${cleanTo}-${Date.now()}`,
        // Canal oficial de reporte de abuso
        'X-Report-Abuse': `mailto:${user}`,
        ...(options.headers || {}),
      },
    };
    if (options.replyTo && String(options.replyTo).trim()) {
      mailPayload.replyTo = String(options.replyTo).trim();
    }

    await transporter.sendMail(mailPayload);

    logger.info(`[EmailService] Email enviado exitosamente a ${options.to} (${options.subject})`);
    return { success: true };
  } catch (err) {
    logger.error('[EmailService Error]:', err);
    return { success: false, error: err };
  }
}

export function getNotificationEmail(): string {
  return (process.env.NOTIFICATION_EMAIL || '').trim();
}
