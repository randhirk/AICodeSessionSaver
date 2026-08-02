import { describe, expect, it } from "vitest";
import { UnifiedSessionSchema } from "../src/core/types.js";
import { buildContextPrompt, firstUserMessage, planResume } from "../src/core/resume.js";

const session = UnifiedSessionSchema.parse({
  id: "sess-resume-001",
  provider: "cursor",
  title: "Resume test",
  projectPath: "/Users/test/demo",
  cwd: "/Users/test/demo",
  createdAt: "2025-01-15T10:00:00.000Z",
  updatedAt: "2025-01-15T10:05:00.000Z",
  messageCount: 2,
  messages: [
    { id: "msg-0", role: "user", content: "Continue the CSV exporter" },
    { id: "msg-1", role: "assistant", content: "I will add escaping next." },
  ],
  connections: [],
  source: { paths: [] },
});

describe("resume", () => {
  it("builds a continuation context prompt", () => {
    const prompt = buildContextPrompt(session, 10);
    expect(prompt).toContain("Continue this AI coding session");
    expect(prompt).toContain("Continue the CSV exporter");
    expect(prompt).toContain("[assistant]");
  });

  it("plans cursor resume with paste instructions", () => {
    const plan = planResume(session);
    expect(plan.provider).toBe("cursor");
    expect(plan.contextPrompt).toBeTruthy();
    expect(plan.steps.some((s) => /paste/i.test(s))).toBe(true);
  });

  it("extracts the first user message as a title source", () => {
    expect(firstUserMessage(session.messages)).toContain("CSV exporter");
  });
});
