/**
 * Pure name heuristics shared by the scraper (reject junk before it enters the
 * CRM) and the mail merge (derive a greeting, and refuse to send when a row's
 * "name" is actually a page label like "Research Areas:").
 *
 * Deliberately conservative: a false negative just skips one contact, but a
 * false positive puts "Hi Research Areas," in a stranger's inbox. When in
 * doubt, treat it as NOT a person's name.
 */

function collapse(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Titles we strip before picking a first name. */
const HONORIFICS = new Set([
  "dr", "dr.", "prof", "prof.", "professor", "mr", "mr.", "mrs", "mrs.",
  "ms", "ms.", "mx", "mx.", "miss", "sir", "dame", "rev", "rev.", "hon", "hon.",
]);

/** Whole strings that are page labels, never a person's name. */
const LABEL_PHRASES = new Set([
  "research areas", "research area", "research interests", "research interest",
  "areas of interest", "area of interest", "interests", "socials", "social",
  "contact", "contact us", "email", "e-mail", "phone", "fax", "address",
  "website", "home", "homepage", "profile", "view profile", "read more",
  "learn more", "more", "bio", "biography", "cv", "publications", "teaching",
  "awards", "people", "our people", "staff", "faculty", "team", "directory",
  "department", "overview", "about", "about us", "news", "events", "apply",
  "donate", "support", "menu", "search", "supervisor", "office hours",
  "campus location", "general inquiry", "location", "inquiry",
]);

/** Individual tokens that betray a label even inside a longer string. */
const LABEL_TOKENS = new Set([
  "inquiry", "socials", "areas", "interests", "email", "e-mail", "phone",
  "fax", "directory", "supervisor", "faculty", "department", "location",
  "unsubscribe", "newsletter",
]);

/** Lowercase a token and drop trailing punctuation for comparison. */
function normToken(t: string): string {
  return t.toLowerCase().replace(/[.,:;]+$/g, "");
}

/**
 * True only for strings that credibly look like a human name. Rejects page
 * labels ("Research Areas:", "Socials"), addresses, room numbers, team names
 * with slashes, and honorific-only fragments.
 */
export function isPersonName(input: string): boolean {
  const t = collapse(input);
  if (t.length < 2 || t.length > 80) return false;
  if (/:$/.test(t)) return false; // trailing colon => a field label
  if (/\d/.test(t)) return false; // room numbers, course codes, "Lab 5262"
  if (/[@/\\|<>{}()[\]]/.test(t)) return false; // urls, "A / B Team", markup
  if (!/[A-Za-z]/.test(t)) return false;

  const lower = t.toLowerCase().replace(/[.:]+$/g, "").trim();
  if (LABEL_PHRASES.has(lower)) return false;

  const tokens = t.split(" ").map(normToken).filter(Boolean);
  if (tokens.some((tok) => LABEL_TOKENS.has(tok))) return false;

  const nameTokens = tokens.filter((tok) => !HONORIFICS.has(tok));
  if (nameTokens.length === 0) return false; // just "Dr." etc.

  // A lone SHOUTY token is almost always an acronym/label ("STEM", "HCI").
  if (nameTokens.length === 1) {
    const only = t.replace(/[.,:;]+$/g, "");
    if (only.length <= 5 && only === only.toUpperCase() && /^[A-Za-z]+$/.test(only)) {
      return false;
    }
  }
  return true;
}

/**
 * The greeting name for a person: their given name, honorifics removed. Returns
 * "" when the value is not a real person name, so a template that greets with
 * {{firstName}} fails the unfilled-placeholder check and the contact is skipped
 * rather than emailed "Hi Research Areas,".
 */
export function firstNameOf(input: string): string {
  if (!isPersonName(input)) return "";
  let t = collapse(input);

  // "Ahmed, Ishtiaque" -> given names come after the comma.
  const comma = t.match(/^[^,]+,\s*(.+)$/);
  if (comma) t = comma[1]!.trim();

  const tokens = t.split(" ");
  while (tokens.length > 1 && HONORIFICS.has(tokens[0]!.toLowerCase())) {
    tokens.shift();
  }

  const first = (tokens[0] ?? "").replace(/[.,;:]+$/g, "");
  // A lone initial ("J.") makes a poor greeting; use the fuller name instead.
  if (/^[A-Za-z]$/.test(first) && tokens.length > 1) {
    return tokens.join(" ").replace(/[.,;:]+$/g, "");
  }
  return first;
}
