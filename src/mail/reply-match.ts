/**
 * Reply matching — pure. AGENTS.md is emphatic: match incoming mail to CRM
 * rows via Message-ID / In-Reply-To / References headers ONLY, never by
 * subject/keyword similarity. This module implements exactly that; the pipeline
 * layer decides what to do with matches and logs anything ambiguous.
 */
import type { Category } from "../core/types";

export interface IncomingMessage {
  from: string;
  subject: string;
  date: string;
  /** Message-ID tokens from the In-Reply-To header (may be empty). */
  inReplyTo: string[];
  /** Message-ID tokens from the References header (may be empty). */
  references: string[];
  /** This message's own Message-ID. */
  messageId: string;
}

export interface SentRef {
  category: Category;
  email: string;
  row: number;
  messageId: string;
}

/** Normalise a Message-ID for comparison: strip <>, trim, lowercase. */
export function normalizeMsgId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").trim().toLowerCase();
}

const BOUNCE_LOCALPARTS = /^(mailer-daemon|postmaster|mail-?delivery-?(subsystem|system)|double-?bounce)/i;

/**
 * Is this sender a delivery-failure robot rather than a human? A bounce often
 * carries our own Message-ID in its References/In-Reply-To, which would
 * otherwise be counted as a reply. Matching is on the LOCAL PART prefix only
 * ("daemon.fan@uni.ca" is a person, "mailer-daemon@uni.ca" is not).
 */
export function isBounceSender(from: string): boolean {
  const local = from.split("@")[0] ?? "";
  return BOUNCE_LOCALPARTS.test(local.trim());
}

/** Build a lookup from normalised sent Message-ID -> the row that sent it. */
export function buildSentIndex(refs: SentRef[]): Map<string, SentRef> {
  const idx = new Map<string, SentRef>();
  for (const r of refs) {
    if (!r.messageId) continue;
    idx.set(normalizeMsgId(r.messageId), r);
  }
  return idx;
}

export interface MatchResult {
  matches: Array<{ incoming: IncomingMessage; ref: SentRef }>;
  unmatched: IncomingMessage[];
}

/**
 * Match incoming messages against sent Message-IDs using their In-Reply-To and
 * References headers. Each sent row is matched at most once (first reply wins).
 */
export function matchReplies(
  index: Map<string, SentRef>,
  incoming: IncomingMessage[],
): MatchResult {
  const matches: MatchResult["matches"] = [];
  const unmatched: IncomingMessage[] = [];
  const claimed = new Set<string>();

  for (const msg of incoming) {
    const candidates = [...msg.inReplyTo, ...msg.references].map(normalizeMsgId);
    let hit: SentRef | undefined;
    for (const c of candidates) {
      const ref = index.get(c);
      if (ref && !claimed.has(ref.messageId)) {
        hit = ref;
        break;
      }
    }
    if (hit) {
      claimed.add(hit.messageId);
      matches.push({ incoming: msg, ref: hit });
    } else {
      unmatched.push(msg);
    }
  }
  return { matches, unmatched };
}
