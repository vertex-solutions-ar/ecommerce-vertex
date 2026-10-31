import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSendMail, mockCreateTransport, mockAccessSecretVersion } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' });
  const mockCreateTransport = vi.fn(() => ({
    sendMail: mockSendMail,
  }));
  const mockAccessSecretVersion = vi.fn();
  return {
    mockSendMail,
    mockCreateTransport,
    mockAccessSecretVersion,
  };
});

vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class {
    accessSecretVersion = mockAccessSecretVersion;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { sendEmail, resolveSmtpPassword } from './core/email.service';

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['SMTP_PASS'];
    delete process.env['SMTP_PASSWORD'];
    delete process.env['SMTP_HOST'];
    delete process.env['SMTP_USER'];
  });

  it('resolves SMTP password from Secret Manager when not in env', async () => {
    mockAccessSecretVersion.mockResolvedValueOnce([
      {
        payload: {
          data: Buffer.from('secret-smtp-password-123'),
        },
      },
    ]);

    const pass = await resolveSmtpPassword();
    expect(pass).toBe('secret-smtp-password-123');
  });

  it('sends email successfully when credentials are valid', async () => {
    mockAccessSecretVersion.mockResolvedValueOnce([
      {
        payload: {
          data: Buffer.from('my-smtp-password'),
        },
      },
    ]);

    const res = await sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>Hello World</p>',
    });

    expect(res.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@test.com',
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
      }),
    );
  });

  it('always includes a multipart text/plain version derived from html', async () => {
    mockAccessSecretVersion.mockResolvedValueOnce([
      { payload: { data: Buffer.from('my-smtp-password') } },
    ]);

    const res = await sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>Hola <b>Juan</b> &amp; Co</p><br/><p>Segundo párrafo</p>',
    });

    expect(res.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const payload = mockSendMail.mock.calls[0][0];
    expect(payload.text).toContain('Hola Juan & Co');
    expect(payload.text).toContain('Segundo párrafo');
  });

  it('preserves an explicit text version when provided', async () => {
    mockAccessSecretVersion.mockResolvedValueOnce([
      { payload: { data: Buffer.from('my-smtp-password') } },
    ]);

    await sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>HTML only</p>',
      text: 'Texto plano explícito',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Texto plano explícito' }),
    );
  });

  it('sends clean transactional headers and never aggressive priority headers', async () => {
    mockAccessSecretVersion.mockResolvedValueOnce([
      { payload: { data: Buffer.from('my-smtp-password') } },
    ]);

    await sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    const payload = mockSendMail.mock.calls[0][0];
    expect(payload.headers).toEqual(
      expect.objectContaining({
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Auto-Submitted': 'auto-generated',
        Precedence: 'bulk',
        'List-Unsubscribe': '<mailto:vertex.tech.dev@gmail.com?subject=unsubscribe>',
        'X-Report-Abuse': 'mailto:vertex.tech.dev@gmail.com',
      }),
    );
    expect(payload.headers).toHaveProperty('X-Entity-Ref-ID');
    expect(payload.headers).not.toHaveProperty('X-Priority');
    expect(payload.headers).not.toHaveProperty('Importance');
  });

  it('sets replyTo when a store contact is configured', async () => {
    mockAccessSecretVersion.mockResolvedValueOnce([
      { payload: { data: Buffer.from('my-smtp-password') } },
    ]);

    await sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      replyTo: 'contacto@tienda.com',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'contacto@tienda.com' }),
    );
  });
});
