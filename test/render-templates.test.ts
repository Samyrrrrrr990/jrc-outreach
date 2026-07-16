import { describe, it, expect } from "vitest";
import { CAMPAIGN } from "../src/config/campaign";
import { loadTemplate, render, varsFor } from "../src/mail/templates";
import type { Contact } from "../src/core/types";

/** A fully-populated proof-points override (as if the user filled them in). */
const FILLED = {
  programName: "JRC",
  oneLiner: "a student research collective",
  studentsServed: "300+",
  schoolsReached: "12",
  headlineOutcome: "40 students placed in labs",
  website: "https://jrc.example",
  senderBlurb: "I'm the founder of JRC.",
};

const contact: Contact = {
  email: "prof@example.edu",
  name: "Dr. Ada Lovelace",
  org: "Example University",
  field: "Computer Science",
  source_url: "https://example.edu",
  status: "new",
  date_scraped: "2026-07-14",
  date_emailed: "",
  replied_at: "",
  last_followup: "",
  date_cold: "",
  message_id: "",
  notes: "",
};

const templates = Object.values(CAMPAIGN.categories).flatMap((c) => [
  c.initialTemplate,
  c.followUpTemplate,
]);

describe("every shipped template renders with the full variable set", () => {
  it.each(templates)("%s has no unsupplied placeholders", (file) => {
    const body = loadTemplate(file);
    const vars = varsFor(contact, { name: "Sam", email: "sam@jrc.example" }, FILLED);
    const out = render(body, vars);
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.text).toContain("Ada Lovelace".slice(0, 3)); // merged, not literal
    expect(out.text).not.toMatch(/\{\{.*?\}\}/);
  });
});
