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
import { isPersonName } from "../core/names";

function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * A name is plausible only if it credibly looks like a real person (shared
 * heuristic in core/names.ts). This is what stops page labels such as
 * "Research Areas:" or "Socials" from ever being scraped in as a name.
 */
function plausibleName(s: string): boolean {
  return isPersonName(clean(s));
}

/**
 * Extract the field from the text that follows a bold/`<dt>` label inside an
 * item, e.g. `<b>Research Areas:</b> human-computer interaction, ICTD` ->
 * "human-computer interaction". Returns "" if the label isn't present.
 */
function fieldFromLabel(
  $: CheerioAPI,
  item: Cheerio<AnyNode>,
  label: string,
): string {
  const wanted = label.toLowerCase().replace(/[:\s]+$/g, "");
  let field = "";
  item.find("b, strong, dt, .label").each((_i, node) => {
    const el = $(node);
    if (clean(el.text()).toLowerCase().replace(/[:\s]+$/g, "") !== wanted) return true;
    const container = el.closest("td, li, p, div, dd, dl");
    const full = clean((container.length ? container : el.parent()).text());
    const idx = full.toLowerCase().indexOf(wanted);
    if (idx < 0) return true;
    let rest = full.slice(idx + wanted.length).replace(/^[:\s]+/, "");
    // Stop at the next directory sub-label, a sentence boundary, or an
    // honorific that starts a trailing note ("... Professor X is not
    // accepting any new graduate students.") so neither a following label nor
    // a note ever rides along inside the field. The label list is explicit
    // because a field that itself starts with a capital ("Systems") must not
    // be mistaken for the start of a label.
    // No \b before the label group: adjacent tags collapse to glued text
    // ("computer graphicsResearch Interests:"), which must still stop.
    const stop = rest.search(
      /(?:Research\s+(?:Interests?|Areas?)|Office(?:\s+Hours)?|Room|Phone|Fax|Website|Lab|Email)\s*:|\.\s|\b(?:Professor|Prof\.?|Dr\.?)\s/,
    );
    if (stop > 0) rest = rest.slice(0, stop);
    // Keep the first, most specific clause; tidy trailing punctuation.
    field = clean(rest).replace(/[;,].*$/, "").replace(/\.$/, "").trim();
    if (field) return false; // found it; stop iterating
    return true;
  });
  return field;
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

    const field = sel.field
      ? clean(item.find(sel.field).first().text())
      : sel.fieldFromLabel
        ? fieldFromLabel($, item, sel.fieldFromLabel)
        : "";
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

/**
 * Org-level page (a club/association/general inbox): emit the public general
 * email(s), labelled with the org, without requiring a person's name. The
 * student channel greets "Hi <org> team," so no individual name is needed —
 * and we still never invent an address, only surface ones the page publishes.
 */
function parseOrgContact($: CheerioAPI, source: DirectorySource): ScrapedContact[] {
  const out: ScrapedContact[] = [];
  const seen = new Set<string>();
  // mailto: hrefs ONLY. Free-text extraction on contact pages manufactures
  // corrupt addresses out of surrounding prose and dot-leader layouts
  // ("contactuoftursa@gmail.com", "..layla@assu.ca") — a mailto href is the
  // page's own machine-readable statement of the address.
  const emails = $('a[href^="mailto:"]')
    .map((_i, node) => extractMailto($(node).attr("href")))
    .get();
  for (const raw of emails) {
    const email = raw ? normalizeEmail(raw) : "";
    if (!email || !looksLikeEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: source.org, // org-level contact, greeted by org — not a person
      org: source.org,
      field: source.defaultField,
      source_url: source.url,
    });
  }
  return out;
}

export function parseDirectory(
  html: string,
  source: DirectorySource,
): ScrapedContact[] {
  const $ = cheerio.load(html);
  const raw = source.orgContact
    ? parseOrgContact($, source)
    : source.selectors?.item
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
