/**
 * Email header helpers: a unique Message-ID we control (so replies can be
 * matched later, SKILLS.md §4), and a compliant List-Unsubscribe header.
 */
import { randomBytes } from "node:crypto";

/** The domain part of an address, used for Message-ID hosts. */
export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "localhost";
}

/**
 * RFC-5322 Message-ID, globally unique: `<time.rand@domain>`. We generate and
 * store this so reply detection is header-based, never subject-guessing.
 */
export function generateMessageId(senderEmail: string): string {
  const rand = randomBytes(12).toString("hex");
  const time = Date.now().toString(36);
  return `<${time}.${rand}@${domainOf(senderEmail)}>`;
}

/**
 * List-Unsubscribe value. Always offers a mailto: unsubscribe to the sender;
 * adds an HTTPS one-click endpoint if configured.
 */
export function listUnsubscribe(senderEmail: string, url?: string): string {
  const parts = [`<mailto:${senderEmail}?subject=unsubscribe>`];
  if (url) parts.unshift(`<${url}>`);
  return parts.join(", ");
}
