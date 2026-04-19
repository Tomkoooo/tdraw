/**
 * Email delivery for invitations via Nodemailer (native SMTP).
 * Set SMTP_HOST (and usually EMAIL_FROM); if SMTP_HOST is unset, logs and skips send.
 */

import nodemailer from "nodemailer";

type InvitePayload = {
  to: string;
  subject: string;
  html: string;
};

export async function sendInviteEmail(payload: InvitePayload): Promise<{ ok: boolean; skipped?: boolean }> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "tDraw <noreply@localhost>";

  if (!host) {
    console.info(
      "[tDraw email] SMTP_HOST not set — invite email skipped. Configure SMTP (see README). Payload:",
      { to: payload.to, subject: payload.subject },
    );
    return { ok: true, skipped: true };
  }

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass !== undefined && pass !== "" ? { user, pass } : undefined,
      /** Avoid hanging the whole server action when SMTP is wrong or the host blocks (common in dev). */
      connectionTimeout: 12_000,
      greetingTimeout: 10_000,
      socketTimeout: 18_000,
    });

    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[tDraw email] SMTP error:", e);
    return { ok: false };
  }
}
