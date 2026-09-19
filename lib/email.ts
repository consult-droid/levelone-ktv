import { prisma } from './db';

/**
 * Every notification is written to EmailOutbox first, then sent if SMTP is
 * configured. With no SMTP the admin dashboard is the verification queue and
 * nothing is lost — the outbox keeps the record.
 */
export async function queueEmail(to: string, subject: string, body: string): Promise<void> {
  const row = await prisma.emailOutbox.create({ data: { to, subject, body } });

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !to) return;

  try {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: MAIL_FROM || 'LevelOne Bookings <no-reply@levelone.ph>',
      to,
      subject,
      text: body,
    });
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
  } catch (err) {
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { error: String(err).slice(0, 500) },
    });
  }
}

export function staffInbox(): string {
  return process.env.MAIL_TO || '';
}
