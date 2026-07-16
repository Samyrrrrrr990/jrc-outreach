/**
 * Mail-merge (SKILLS.md §5). Templates are plain files with {{field}}
 * placeholders. `merge` throws — it does NOT send — if any placeholder is left
 * unfilled after substitution, treating missing OR empty/whitespace values as
 * unfilled so a contact never gets "Dear ,".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Contact } from "../core/types";
import { PROOF_POINTS } from "../config/proofPoints";
import { activeProfile } from "../config/profiles";

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export type MergeVars = Record<string, string | number | undefined>;

/** All distinct placeholder names referenced by a template. */
export function findPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) names.add(m[1]!);
  return [...names];
}

/**
 * Substitute placeholders. Throws with the list of unfilled names if any
 * placeholder resolves to undefined/empty, or if any `{{...}}` remains.
 */
export function merge(template: string, vars: MergeVars): string {
  const unfilled = new Set<string>();
  const out = template.replace(PLACEHOLDER, (_full, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      unfilled.add(key);
      return "";
    }
    return String(v);
  });
  if (unfilled.size > 0) {
    throw new Error(`Unfilled merge placeholders: ${[...unfilled].join(", ")}`);
  }
  if (/\{\{.*?\}\}/.test(out)) {
    const leftover = out.match(/\{\{.*?\}\}/g) ?? [];
    throw new Error(`Malformed placeholders remain: ${leftover.join(", ")}`);
  }
  return out;
}

const TEMPLATES_ROOT = fileURLToPath(new URL("../../templates/", import.meta.url));

/** The ACTIVE ORG's template folder: templates/<profile.templatesDir>/. */
export const TEMPLATE_DIR = join(TEMPLATES_ROOT, activeProfile().templatesDir);

/** Load a template file from the active org's template folder by basename. */
export function loadTemplate(basename: string): string {
  return readFileSync(join(TEMPLATE_DIR, basename), "utf8");
}

export interface RenderedEmail {
  subject: string;
  text: string;
}

/**
 * Build the merge-var map for a contact. Flattens contact fields, the shared
 * proof points, and sender identity into one namespace the templates use.
 */
export function varsFor(
  contact: Contact,
  sender: { name: string; email: string },
  extra: MergeVars = {},
): MergeVars {
  return {
    name: contact.name,
    org: contact.org,
    field: contact.field,
    email: contact.email,
    ...PROOF_POINTS,
    senderName: sender.name,
    senderEmail: sender.email,
    ...extra,
  };
}

/**
 * Render a template file into { subject, text }. Convention: the first line of
 * the template is `Subject: ...`, the rest is the body. Both are merged.
 */
export function render(templateBody: string, vars: MergeVars): RenderedEmail {
  const merged = merge(templateBody, vars);
  const lines = merged.split("\n");
  const first = lines[0] ?? "";
  const m = first.match(/^Subject:\s*(.*)$/i);
  if (!m) {
    throw new Error('Template must begin with a "Subject: ..." line');
  }
  const subject = m[1]!.trim();
  const body = lines.slice(1).join("\n").replace(/^\s+/, "");
  return { subject, text: body };
}
