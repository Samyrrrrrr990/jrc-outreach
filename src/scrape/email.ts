/**
 * Email extraction and de-obfuscation. Pure and side-effect free.
 *
 * Rule (SKILLS.md §2 / AGENTS.md): decode common obfuscation patterns that are
 * actually present on the page, but NEVER construct or guess an address. Every
 * function only transforms text that already contains the address in some
 * encoded form, then validates the result before returning it.
 *
 * To avoid inventing addresses out of ordinary prose ("data at rest. The"), the
 * three real-world obfuscation styles are matched separately and each requires
 * an internally consistent marker:
 *   - symbol:   a literal "@" (optionally spaced): "john @ example . com"
 *   - bracket:  bracketed markers on BOTH parts:  "john [at] example [dot] com"
 *   - spelled:  spelled words on BOTH parts:       "john at example dot com"
 * A spelled "at" is never paired with a literal ".", which is what caused
 * false positives.
 */

/** Strict-enough validator. Not RFC-perfect, but rejects junk. */
const STRICT_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function looksLikeEmail(s: string): boolean {
  if (!STRICT_EMAIL.test(s)) return false;
  // A local part that starts/ends with "." or contains ".." is invalid per
  // RFC 5321 — and in practice means page formatting glued onto a real
  // address ("..layla@assu.ca" from a dot-leader contact table). Junk.
  const local = s.slice(0, s.indexOf("@"));
  return !local.startsWith(".") && !local.endsWith(".") && !local.includes("..");
}

/** Lowercase + trim; strip a leading mailto: and any ?query. */
export function normalizeEmail(raw: string): string {
  let e = raw.trim();
  e = e.replace(/^mailto:/i, "");
  const q = e.indexOf("?");
  if (q >= 0) e = e.slice(0, q);
  try {
    e = decodeURIComponent(e);
  } catch {
    /* leave as-is if not valid percent-encoding */
  }
  return e.trim().toLowerCase();
}

/** Extract a validated email from a mailto: href, or null. */
export function extractMailto(href: string | undefined | null): string | null {
  if (!href) return null;
  if (!/^mailto:/i.test(href)) return null;
  const e = normalizeEmail(href);
  return looksLikeEmail(e) ? e : null;
}

const LOCAL = "[A-Za-z0-9._%+-]+";
const LABEL = "[A-Za-z0-9-]+";
const BRK_AT = "\\s*[\\[({<]\\s*(?:at|@)\\s*[\\]})>]\\s*";
const BRK_DOT = "\\s*[\\[({<]\\s*dot\\s*[\\]})>]\\s*";

const SYMBOL = new RegExp(`${LOCAL}\\s*@\\s*${LABEL}(?:\\s*\\.\\s*${LABEL})+`, "gi");
const BRACKET = new RegExp(`${LOCAL}${BRK_AT}${LABEL}(?:${BRK_DOT}${LABEL})+`, "gi");
const SPELLED = new RegExp(`${LOCAL}\\s+at\\s+${LABEL}(?:\\s+dot\\s+${LABEL})+`, "gi");

/** Collapse a matched (possibly obfuscated) token into a normal address. */
function collapse(token: string): string {
  let t = token;
  t = t.replace(/\s*[\[({<]\s*(?:at|@)\s*[\]})>]\s*/gi, "@");
  t = t.replace(/\s*[\[({<]\s*dot\s*[\]})>]\s*/gi, ".");
  t = t.replace(/\s+at\s+/gi, "@");
  t = t.replace(/\s+dot\s+/gi, ".");
  t = t.replace(/\s*@\s*/g, "@");
  t = t.replace(/\s*\.\s*/g, ".");
  return t.trim().toLowerCase();
}

/**
 * Extract every distinct, validated email from a block of text — handling
 * plain, spaced, and [at]/[dot]-style obfuscation. Returns lowercase addresses.
 * Nothing is returned unless it validates as an email.
 */
export function extractEmails(text: string): string[] {
  const found = new Set<string>();
  const out: string[] = [];
  for (const re of [SYMBOL, BRACKET, SPELLED]) {
    for (const m of text.match(re) ?? []) {
      const email = collapse(m);
      if (looksLikeEmail(email) && !found.has(email)) {
        found.add(email);
        out.push(email);
      }
    }
  }
  return out;
}

/** Convenience: first validated email in the text, or null. */
export function firstEmail(text: string): string | null {
  return extractEmails(text)[0] ?? null;
}
