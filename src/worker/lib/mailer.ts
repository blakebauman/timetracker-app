import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { render, toPlainText } from "react-email";
import type { ReactElement } from "react";

export const FROM_ADDRESS = "noreply@timetracker.run";

/**
 * base64 of a string's UTF-8 bytes.
 *
 * `btoa` alone is not this: it maps each code unit to one byte, so it mangles
 * anything in U+0080–U+00FF and throws outright above U+00FF. Encoding to UTF-8
 * first and widening each byte to a latin-1 code unit is the standard dance.
 */
function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

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
 *
 * ## Why the bodies are base64'd by hand
 *
 * Left to itself, mimetext (3.0.28) writes the body as raw UTF-8 while
 * declaring `Content-Transfer-Encoding: 7bit`. That is a spec violation — 7bit
 * promises every octet is < 128 — and the 8-bit bytes get mangled downstream:
 * a `·` arrived as a replacement character and an en dash as a literal
 * `\u2013`. Asking it for `base64` or `quoted-printable` does not help; it
 * sets the header but does not transform the body.
 *
 * So the body is encoded here and handed over already-base64, with the header
 * to match. Verified end to end for the digest, magic-link, OTP and invitation
 * templates.
 *
 * This depends on mimetext passing `data` through untouched. If a future
 * version starts honouring `encoding` itself, this would double-encode and
 * every email would arrive as a wall of base64 — very visible, not silent. Any
 * mimetext upgrade should re-run that check.
 *
 * Subjects are NOT affected: mimetext already RFC 2047-encodes those correctly
 * (`=?utf-8?B?…?=`), which is why nothing looked wrong until a body carried a
 * non-ASCII character.
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
  msg.addMessage({
    contentType: "text/plain",
    charset: "UTF-8",
    encoding: "base64",
    data: base64Utf8(text),
  });
  msg.addMessage({
    contentType: "text/html",
    charset: "UTF-8",
    encoding: "base64",
    data: base64Utf8(html),
  });
  await env.EMAIL.send(new EmailMessage(FROM_ADDRESS, to, msg.asRaw()));
}
