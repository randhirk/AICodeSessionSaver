import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionAdapter } from "../core/types.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { CodexAdapter } from "./codex.js";
import { CursorAdapter } from "./cursor.js";

export function getAdapters(): SessionAdapter[] {
  return [new ClaudeCodeAdapter(), new CursorAdapter(), new CodexAdapter()];
}

export function getAvailableAdapters(): SessionAdapter[] {
  return getAdapters().filter((adapter) => adapter.isAvailable());
}

export function resolveExtraRoots(): string[] {
  const raw = process.env.AISS_EXTRA_ROOTS ?? "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function defaultHome(): string {
  return homedir();
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

export function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

export function cursorProjectsDir(): string {
  return process.env.CURSOR_PROJECTS_DIR ?? join(homedir(), ".cursor", "projects");
}
