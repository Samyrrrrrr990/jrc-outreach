import { describe, it, expect } from "vitest";
import { daysSince, nowISO, todayISO } from "../src/core/dates";

const NOW = new Date("2026-07-14T12:00:00Z");

describe("todayISO / nowISO", () => {
  it("formats a UTC date and timestamp", () => {
    expect(todayISO(NOW)).toBe("2026-07-14");
    expect(nowISO(NOW)).toBe("2026-07-14T12:00:00.000Z");
  });
});

describe("daysSince", () => {
  it("counts whole days from an ISO date", () => {
    expect(daysSince("2026-07-11", NOW)).toBe(3);
    expect(daysSince("2026-07-14T00:00:00Z", NOW)).toBe(0);
  });
  it("returns null for empty or invalid input", () => {
    expect(daysSince("", NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince("not-a-date", NOW)).toBeNull();
  });
});
