import { describe, it, expect } from "vitest";
import { isBounceSender } from "../src/mail/reply-match";
import { dueForFollowUp } from "../src/core/status";
import type { Contact } from "../src/core/types";

describe("isBounceSender", () => {
  it("recognises the standard bounce senders", () => {
    expect(isBounceSender("mailer-daemon@utoronto.ca")).toBe(true);
    expect(isBounceSender("MAILER-DAEMON@mx.example.com")).toBe(true);
    expect(isBounceSender("postmaster@yorku.ca")).toBe(true);
    expect(isBounceSender("mail-delivery-subsystem@gmail.com")).toBe(true);
  });

  it("never flags an ordinary contact", () => {
    expect(isBounceSender("ada@utoronto.ca")).toBe(false);
    expect(isBounceSender("daemon.fan@uni.ca")).toBe(false);
    expect(isBounceSender("")).toBe(false);
  });
});

describe("bounced contacts are excluded from follow-up", () => {
  const bounced: Contact = {
    email: "a@x.ca", name: "Ada", org: "UofT", field: "CS",
    source_url: "https://src", status: "emailed", date_scraped: "2026-06-01",
    date_emailed: "2026-06-02", replied_at: "", last_followup: "",
    date_cold: "", message_id: "<id@x>", notes: "",
    variant: "", bounced_at: "2026-06-03T00:00:00.000Z",
  };

  it("dueForFollowUp is false for a bounced address, however old the send", () => {
    expect(dueForFollowUp(bounced, 3, new Date("2026-07-01"))).toBe(false);
    expect(
      dueForFollowUp({ ...bounced, bounced_at: "" }, 3, new Date("2026-07-01")),
    ).toBe(true);
  });
});
