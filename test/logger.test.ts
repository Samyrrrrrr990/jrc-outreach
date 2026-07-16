import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  configureLogger,
  log,
  resetLogger,
  setLogPhase,
} from "../src/core/logger";

let lines: string[] = [];

beforeEach(() => {
  lines = [];
  resetLogger();
  configureLogger({ format: "json", sink: (l) => lines.push(l) });
});

afterEach(() => {
  resetLogger();
});

describe("structured JSON logging", () => {
  it("emits one parseable JSON object per line with ts/level/msg", () => {
    log.info("sent email", { category: "profs", action: "send", result: "ok" });
    expect(lines).toHaveLength(1);
    const obj = JSON.parse(lines[0]!);
    expect(obj.level).toBe("info");
    expect(obj.msg).toBe("sent email");
    expect(obj.category).toBe("profs");
    expect(obj.action).toBe("send");
    expect(obj.result).toBe("ok");
    expect(new Date(obj.ts).getTime()).not.toBeNaN();
  });

  it("includes the current phase when one is set, and drops it when cleared", () => {
    setLogPhase("scrape");
    log.info("a");
    setLogPhase(null);
    log.info("b");
    expect(JSON.parse(lines[0]!).phase).toBe("scrape");
    expect(JSON.parse(lines[1]!).phase).toBeUndefined();
  });

  it("marks dry-run output", () => {
    configureLogger({ dryRun: true });
    log.info("would send");
    expect(JSON.parse(lines[0]!).dryRun).toBe(true);
  });

  it("respects the level threshold", () => {
    configureLogger({ level: "warn" });
    log.debug("hidden");
    log.info("hidden");
    log.warn("shown");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).level).toBe("warn");
  });

  it("pretty format keeps the human-readable line", () => {
    configureLogger({ format: "pretty" });
    log.info("hello", { n: 1 });
    expect(lines[0]).toContain("INFO");
    expect(lines[0]).toContain("hello");
  });
});
