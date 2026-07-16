/**
 * Sending helpers (AGENTS.md Agents 2 & 4). Renders a contact into an email,
 * and — unless dry-run — sends it via SMTP, APPENDs the identical bytes to
 * Sent, and records the outcome atomically in the CRM.
 *
 * Fail-loud guarantees:
 *   - render() throws on any unfilled merge field (never sends a broken email)
 *   - status is verified immediately before the CRM write (no double-send)
 */
import type { Category, Contact } from "../core/types";
import { categoryConfig } from "../config/campaign";
import { nowISO, todayISO } from "../core/dates";
import { log } from "../core/logger";
import { loadEnv } from "../config/env";
import { loadTemplate, render, varsFor } from "../mail/templates";
import { generateMessageId } from "../mail/headers";
import { composeRaw, sendRaw } from "../mail/smtp";
import { appendToSent } from "../mail/imap";
import { patchContact } from "../sheets/crm";

function sender(): { name: string; email: string } {
  const env = loadEnv();
  return { name: env.SENDER_NAME, email: env.SENDER_EMAIL };
}

/**
 * Send the initial email to one `new` contact. Returns true if sent (or, in
 * dry-run, would have sent). Throws only on unexpected/infra errors — merge
 * failures are surfaced to the caller to skip that single contact.
 */
export async function sendInitial(
  cat: Category,
  contact: Contact,
  dryRun: boolean,
): Promise<boolean> {
  const tpl = loadTemplate(categoryConfig(cat).initialTemplate);
  const { subject, text } = render(tpl, varsFor(contact, sender()));
  const messageId = generateMessageId(sender().email);

  if (dryRun) {
    log.info(
      `[dry-run] INITIAL -> ${contact.email}\n` +
        `  subject: ${subject}\n` +
        `  message-id: ${messageId}\n` +
        `  crm: status=emailed date_emailed=${todayISO()}\n` +
        indent(text),
    );
    return true;
  }

  const raw = await composeRaw({ to: contact.email, subject, text, messageId });
  await sendRaw(contact.email, raw);
  await appendToSent(raw).catch((err) =>
    log.warn(`Sent-folder append failed for ${contact.email}`, { err: String(err) }),
  );

  const written = await patchContact(
    cat,
    contact._row!,
    { status: "emailed", date_emailed: todayISO(), message_id: messageId },
    "new",
  );
  if (written) log.info(`Emailed ${contact.email} (${cat})`);
  return written;
}

/**
 * Send the single follow-up to one `emailed` contact, threaded onto the
 * original message. Returns true if sent.
 */
export async function sendFollowUp(
  cat: Category,
  contact: Contact,
  dryRun: boolean,
): Promise<boolean> {
  const tpl = loadTemplate(categoryConfig(cat).followUpTemplate);
  const { subject, text } = render(tpl, varsFor(contact, sender()));
  const messageId = generateMessageId(sender().email);
  const original = contact.message_id || undefined;

  if (dryRun) {
    log.info(
      `[dry-run] FOLLOW-UP -> ${contact.email}\n` +
        `  subject: ${subject}\n` +
        `  in-reply-to: ${original ?? "(none)"}\n` +
        `  crm: status=followed_up last_followup=${todayISO()}\n` +
        indent(text),
    );
    return true;
  }

  const raw = await composeRaw({
    to: contact.email,
    subject,
    text,
    messageId,
    inReplyTo: original,
    references: original,
  });
  await sendRaw(contact.email, raw);
  await appendToSent(raw).catch((err) =>
    log.warn(`Sent-folder append failed for ${contact.email}`, { err: String(err) }),
  );

  const written = await patchContact(
    cat,
    contact._row!,
    { status: "followed_up", last_followup: todayISO() },
    "emailed",
  );
  if (written) log.info(`Followed up ${contact.email} (${cat})`);
  return written;
}

/** Mark a contact cold (no reply after the follow-up window). */
export async function markCold(cat: Category, contact: Contact): Promise<boolean> {
  return patchContact(
    cat,
    contact._row!,
    { status: "cold", date_cold: todayISO() },
    "followed_up",
  );
}

/** Mark a contact replied. */
export async function markReplied(cat: Category, contact: Contact): Promise<boolean> {
  // No expectStatus: a reply is authoritative from any non-terminal state.
  return patchContact(cat, contact._row!, {
    status: "replied",
    replied_at: nowISO(),
  });
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  | ${l}`)
    .join("\n");
}
