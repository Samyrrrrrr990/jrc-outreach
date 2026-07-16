/**
 * IMAP adapter (imapflow): APPEND sent copies to the Sent folder, and read the
 * inbox for reply detection. Header parsing is delegated to reply-match.ts,
 * which is pure and tested; this module only does the network I/O.
 */
import { ImapFlow } from "imapflow";
import { loadEnv } from "../config/env";
import { log } from "../core/logger";
import type { IncomingMessage } from "./reply-match";

function newClient(): ImapFlow {
  const env = loadEnv();
  return new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_SECURE,
    auth: { user: env.IMAP_USER, pass: env.IMAP_PASS },
    logger: false,
  });
}

/** APPEND raw MIME bytes to the Sent mailbox, flagged \Seen. */
export async function appendToSent(raw: Buffer): Promise<void> {
  const env = loadEnv();
  const client = newClient();
  await client.connect();
  try {
    await client.append(env.IMAP_SENT_MAILBOX, raw, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Verify IMAP credentials/connection (used by `doctor`). */
export async function verifyImap(): Promise<void> {
  const client = newClient();
  await client.connect();
  await client.logout().catch(() => client.close());
}

function tokens(headerValue: string | undefined): string[] {
  if (!headerValue) return [];
  return headerValue.match(/<[^>]+>/g) ?? [];
}

/**
 * Fetch inbox messages received in the last `sinceDays` days, returning the
 * fields reply-matching needs. Non-fatal on an empty inbox.
 */
export async function fetchRecentInbox(sinceDays = 14): Promise<IncomingMessage[]> {
  const env = loadEnv();
  const client = newClient();
  const out: IncomingMessage[] = [];
  await client.connect();
  const lock = await client.getMailboxLock(env.IMAP_INBOX_MAILBOX);
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const uids = await client.search({ since }, { uid: true });
    if (!uids || uids.length === 0) return out;
    for await (const msg of client.fetch(
      uids,
      { uid: true, envelope: true, headers: ["references", "in-reply-to"] },
      { uid: true },
    )) {
      const env2 = msg.envelope;
      const rawHeaders = msg.headers?.toString("utf8") ?? "";
      const references = tokens(matchHeader(rawHeaders, "references"));
      const inReplyTo = tokens(
        matchHeader(rawHeaders, "in-reply-to") || env2?.inReplyTo,
      );
      out.push({
        from: env2?.from?.[0]?.address?.toLowerCase() ?? "",
        subject: env2?.subject ?? "",
        date: env2?.date ? new Date(env2.date).toISOString() : "",
        inReplyTo,
        references,
        messageId: env2?.messageId ?? "",
      });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => client.close());
  }
  return out;
}

/** Extract a header's raw value from a folded header block (case-insensitive). */
function matchHeader(block: string, name: string): string | undefined {
  const re = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?:\\r?\\n(?!\\s)|$)`, "im");
  const m = block.match(re);
  return m ? m[1]!.replace(/\r?\n\s+/g, " ").trim() : undefined;
}
