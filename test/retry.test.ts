import { describe, it, expect } from "vitest";
import { withRetry, isTransientError } from "../src/core/retry";

const noSleep = async (_ms: number): Promise<void> => {};

describe("withRetry", () => {
  it("returns the first successful result without retrying", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures until success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw Object.assign(new Error("rate limited"), { code: 429 });
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after `attempts` total tries and throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw Object.assign(new Error("still down"), { code: 503 });
        },
        { attempts: 4, sleep: noSleep },
      ),
    ).rejects.toThrow("still down");
    expect(calls).toBe(4);
  });

  it("does not retry errors the predicate rejects", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("Unfilled merge placeholders: name");
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow(/Unfilled/);
    expect(calls).toBe(1);
  });

  it("backs off exponentially between attempts", async () => {
    const delays: number[] = [];
    await expect(
      withRetry(
        async () => {
          throw Object.assign(new Error("boom"), { code: 500 });
        },
        {
          attempts: 4,
          baseDelayMs: 500,
          sleep: async (ms) => void delays.push(ms),
          random: () => 1, // no jitter -> deterministic
        },
      ),
    ).rejects.toThrow("boom");
    expect(delays).toEqual([500, 1000, 2000]);
  });

  it("caps the delay at maxDelayMs", async () => {
    const delays: number[] = [];
    await expect(
      withRetry(
        async () => {
          throw Object.assign(new Error("boom"), { code: 500 });
        },
        {
          attempts: 5,
          baseDelayMs: 500,
          maxDelayMs: 1000,
          sleep: async (ms) => void delays.push(ms),
          random: () => 1,
        },
      ),
    ).rejects.toThrow("boom");
    expect(delays).toEqual([500, 1000, 1000, 1000]);
  });
});

describe("isTransientError", () => {
  it("treats rate limits and server errors as transient", () => {
    expect(isTransientError(Object.assign(new Error("x"), { code: 429 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error("x"), { code: 500 }))).toBe(true);
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
  });

  it("treats network-level failures as transient", () => {
    expect(isTransientError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(isTransientError(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
  });

  it("treats logic errors as permanent", () => {
    expect(isTransientError(Object.assign(new Error("x"), { code: 400 }))).toBe(false);
    expect(isTransientError(new Error("Unfilled merge placeholders: name"))).toBe(false);
    expect(isTransientError(Object.assign(new Error("x"), { code: 404 }))).toBe(false);
  });
});
