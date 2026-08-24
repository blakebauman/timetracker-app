import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { render, toPlainText } from "react-email";
import type { ReactElement } from "react";

export const FROM_ADDRESS = "noreply@timetracker.run";

/**
 * Send one React Email template.
 *
 * The EMAIL binding's simulated builder overload isn't reliable in local dev
 * (Miniflare expects a raw MIME message), so the message is built directly —
 * this works identically in local dev and production.
 *
 * Lives here rather than in auth.ts because auth is no longer the only sender:
 * the digest cron uses the same path, and two copies of the MIME assembly would
 * drift on the first change to either.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  email: ReactElement
): Promise<void> {
  const html = await render(email);
  const text = toPlainText(html);
  const msg = createMimeMessage();
  msg.setSender({ addr: FROM_ADDRESS });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: "text/plain", data: text });
  msg.addMessage({ contentType: "text/html", data: html });
  await env.EMAIL.send(new EmailMessage(FROM_ADDRESS, to, msg.asRaw()));
}
