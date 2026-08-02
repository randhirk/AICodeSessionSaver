import { describe, expect, it } from "vitest";
import { readJsonl, safeJsonParse, stripXmlTags, toIsoDate } from "../src/core/utils.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("utils", () => {
  it("parses valid JSONL and skips bad lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "aiss-utils-"));
    const path = join(dir, "sample.jsonl");
    writeFileSync(
      path,
      ['{"a":1}', "not-json", '{"b":2}', ""].join("\n"),
      "utf8",
    );
    expect(readJsonl<{ a?: number; b?: number }>(path)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("safeJsonParse returns null on invalid input", () => {
    expect(safeJsonParse("nope")).toBeNull();
    expect(safeJsonParse('{"ok":true}')).toEqual({ ok: true });
  });

  it("strips xml-like wrappers from user queries", () => {
    expect(stripXmlTags("<user_query>Hello</user_query>")).toBe("Hello");
  });

  it("normalizes dates to ISO strings", () => {
    expect(toIsoDate("2025-01-15T10:00:00.000Z")).toBe("2025-01-15T10:00:00.000Z");
    expect(toIsoDate(1_737_000_000_000)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
