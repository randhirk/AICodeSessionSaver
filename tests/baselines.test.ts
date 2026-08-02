import { describe, expect, it } from "vitest";
import { estimateTokens } from "../research/scripts/token-estimate.ts";

describe("baseline token estimate", () => {
  it("estimates roughly chars/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
    expect(estimateTokens("")).toBe(0);
  });
});
