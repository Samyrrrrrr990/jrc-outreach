/**
 * Secret scanning — pure detection over file content, run by `scan-secrets`
 * in CI. Catches the credential shapes this project actually handles
 * (service-account JSON, SMTP/IMAP passwords, API keys/tokens, private keys)
 * before they can land in a commit.
 *
 * Findings carry file/line/rule ONLY — never the matched secret itself, so
 * the scanner's own output can't leak what it found.
 */

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
  /** Skip a match when this returns true (legitimate uses). */
  exempt?: (line: string, match: RegExpMatchArray) => boolean;
}

/** Values that are clearly docs placeholders, not real credentials. */
const PLACEHOLDER_VALUE = /your|example|changeme|change-me|fill|placeholder|dummy|xxxx|redacted/i;

/** Values that are code reading config, not literals. */
const CODE_VALUE = /^(env|process|opts|config|this|import|require)\b|[(){}$]/;

const RULES: Rule[] = [
  {
    name: "private-key-block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    name: "google-api-key",
    pattern: /AIza[0-9A-Za-z_-]{35}/,
  },
  {
    name: "google-oauth-secret",
    pattern: /GOCSPX-[0-9A-Za-z_-]{20,}/,
  },
  {
    name: "github-token",
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/,
  },
  {
    name: "service-account-json",
    pattern: /"type"\s*:\s*"service_account"/,
  },
  {
    name: "credential-assignment",
    // NAME_PASS=literalvalue / SECRET: "literalvalue" — a bare or quoted
    // literal of 8+ credential-ish chars right after the assignment.
    pattern: /(PASS(?:WORD)?|SECRET|TOKEN|API_?KEY)["']?\s*[=:]\s*["']?([A-Za-z0-9_\-!@#%^&*+./]{8,})/i,
    exempt: (line, match) => {
      const value = match[2] ?? "";
      if (CODE_VALUE.test(value)) return true;
      if (PLACEHOLDER_VALUE.test(value)) return true;
      if (line.includes("secrets.")) return true; // ${{ secrets.X }} indirection
      if (/z\.(string|coerce|enum)/.test(line)) return true; // zod schema
      return false;
    },
  },
];

/** Scan one file's content. Pure. */
export function scanContent(content: string, file: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const rule of RULES) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      if (rule.exempt?.(line, match)) continue;
      findings.push({ file, line: i + 1, rule: rule.name });
    }
  }
  return findings;
}
