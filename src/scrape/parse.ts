/**
 * HTML -> ScrapedContact[] using cheerio. Two strategies:
 *   1. Selector-based (precise) when a source defines `selectors.item`.
 *   2. Generic fallback: every mailto: anchor plus any [at]/[dot]-obfuscated
 *      address in the text, each paired with the nearest name-like text.
 *
 * A contact is only emitted when BOTH a validated email and a plausible name
 * are found — we never fabricate either (AGENTS.md).
 */
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ScrapedContact } from "../core/types";
import type { DirectorySource } from "../config/sources";
import { extractEmails, extractMailto, looksLikeEmail, normalizeEmail } from "./email";

function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Common link/label words that are never a person's name. */
const LABEL_WORDS = new Set([
  "contact",
  "email",
  "e-mail",
  "mail",
  "website",
  "web",
  "profile",
  "homepage",
  "home",
  "page",
  "link",
  "here",
  "more",
  "bio",
  "cv",
]);

/** A name is plausible if it has letters, reasonable length, and isn't an email. */
function plausibleName(s: string): boolean {
  const t = clean(s);
  if (t.length < 2 || t.length > 80) return false;
  if (looksLikeEmail(t)) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (LABEL_WORDS.has(t.toLowerCase())) return false;
  return true;
}

/**
 * Find the best name near an element. Prefers a heading/strong inside the
 * person's container (reliable on directory cards), then a preceding heading,
 * and only falls back to the element's own text if it isn't a link label.
 */
function nameNear($: CheerioAPI, el: Cheerio<AnyNode>): string {
  const container = el.closest("li, article, .card, .person, .faculty, tr, div");
  const scope = container.length ? container : el.parent();
  const heading = scope.find("h1,h2,h3,h4,h5,strong,b,.name").first();
  const hname = clean(heading.text());
  if (plausibleName(hname) && hname.split(" ").length <= 6) return hname;

  const prev = el.prevAll("h1,h2,h3,h4,h5").first();
  const pname = clean(prev.text());
  if (plausibleName(pname)) return pname;

  const own = clean(el.text());
  if (plausibleName(own) && own.split(" ").length <= 6) return own;

  return "";
}

function emailFromScope($: CheerioAPI, el: Cheerio<AnyNode>): string | null {
  const mailto = el.find('a[href^="mailto:"]').first().attr("href");
  const fromHref = extractMailto(mailto);
  if (fromHref) return fromHref;
  const fromText = extractEmails(el.text())[0];
  return fromText ?? null;
}

function parseWithSelectors(
  $: CheerioAPI,
  source: DirectorySource,
): ScrapedContact[] {
  const sel = source.selectors!;
  const out: ScrapedContact[] = [];
  $(sel.item).each((_i, node) => {
    const item = $(node);
    const email = sel.email
      ? extractMailto(item.find(sel.email).first().attr("href")) ??
        extractEmails(item.find(sel.email).first().text())[0] ??
        null
      : emailFromScope($, item);
    if (!email) return;

    const name = sel.name ? clean(item.find(sel.name).first().text()) : nameNear($, item);
    if (!plausibleName(name)) return;

    const field = sel.field ? clean(item.find(sel.field).first().text()) : "";
    out.push({
      email: normalizeEmail(email),
      name,
      org: source.org,
      field: field || source.defaultField,
      source_url: source.url,
    });
  });
  return out;
}

function parseGeneric(
  $: CheerioAPI,
  source: DirectorySource,
): ScrapedContact[] {
  const out: ScrapedContact[] = [];
  const seen = new Set<string>();

  // 1. mailto: anchors.
  $('a[href^="mailto:"]').each((_i, node) => {
    const el = $(node);
    const email = extractMailto(el.attr("href"));
    if (!email || seen.has(email)) return;
    const name = nameNear($, el);
    if (!plausibleName(name)) return;
    seen.add(email);
    out.push({
      email,
      name,
      org: source.org,
      field: source.defaultField,
      source_url: source.url,
    });
  });

  // 2. Obfuscated addresses in element text (skip ones already found).
  $("li, tr, article, p, .card, .person, .faculty").each((_i, node) => {
    const el = $(node);
    const emails = extractEmails(el.text());
    for (const email of emails) {
      if (seen.has(email)) continue;
      const name = nameNear($, el);
      if (!plausibleName(name)) continue;
      seen.add(email);
      out.push({
        email,
        name,
        org: source.org,
        field: source.defaultField,
        source_url: source.url,
      });
    }
  });

  return out;
}

export function parseDirectory(
  html: string,
  source: DirectorySource,
): ScrapedContact[] {
  const $ = cheerio.load(html);
  const raw = source.selectors?.item
    ? parseWithSelectors($, source)
    : parseGeneric($, source);

  // Dedupe within this page by normalised email.
  const seen = new Set<string>();
  const out: ScrapedContact[] = [];
  for (const c of raw) {
    const key = normalizeEmail(c.email);
    if (!key || !looksLikeEmail(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, email: key });
  }
  return out;
}
