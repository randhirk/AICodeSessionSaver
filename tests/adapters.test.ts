import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { CursorAdapter } from "../src/adapters/cursor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const originalEnv = {
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CODEX_HOME: process.env.CODEX_HOME,
  CURSOR_PROJECTS_DIR: process.env.CURSOR_PROJECTS_DIR,
};

beforeEach(() => {
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude-code");
  process.env.CODEX_HOME = join(root, "codex");
  process.env.CURSOR_PROJECTS_DIR = join(root, "cursor", "projects");
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("adapters discovery", () => {
  it("discovers Claude Code fixture sessions", async () => {
    const sessions = await new ClaudeCodeAdapter().discoverSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const session = sessions.find((s) => s.id === "sess-claude-001");
    expect(session).toBeTruthy();
    expect(session?.provider).toBe("claude-code");
    expect(session?.messages.some((m) => m.role === "user")).toBe(true);
    expect(session?.messages.some((m) => m.role === "tool")).toBe(true);
    expect(session?.resumeHint?.command).toContain("claude --resume");
  });

  it("discovers Codex fixture sessions with parent links", async () => {
    const sessions = await new CodexAdapter().discoverSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const session = sessions.find((s) => s.id === "sess-codex-001");
    expect(session).toBeTruthy();
    expect(session?.connections[0]?.sessionId).toBe("sess-codex-parent");
    expect(session?.resumeHint?.command).toContain("codex resume");
  });

  it("discovers Cursor fixture sessions", async () => {
    const sessions = await new CursorAdapter().discoverSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const session = sessions.find((s) => s.id === "sess-cursor-001");
    expect(session).toBeTruthy();
    expect(session?.messages[0]?.content).toContain("Refactor the CSV export helper");
  });
});
