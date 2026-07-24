import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { buildMemoryPrompt, readSessionSummaryMarkdown } from "./memory.js";
import type { Provider, UnifiedSession } from "./types.js";

function projectHash(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function firstUserMessage(messages: UnifiedSession["messages"]): string {
  const user = messages.find((m) => m.role === "user" && m.content.trim());
  return user?.content.trim().slice(0, 120) ?? "Untitled session";
}

export interface ResumePlan {
  provider: Provider;
  sessionId: string;
  steps: string[];
  command?: string;
  contextPrompt?: string;
}

export function buildContextPrompt(session: UnifiedSession, maxMessages = 30): string {
  const recent = session.messages.slice(-maxMessages);
  const lines = recent.map((m) => {
    const prefix = m.role === "tool" ? `[tool:${m.toolName ?? "unknown"}]` : `[${m.role}]`;
    return `${prefix}\n${m.content}`;
  });

  return [
    "Continue this AI coding session from where it left off.",
    "",
    `Project: ${session.projectPath ?? session.cwd ?? "unknown"}`,
    `Provider: ${session.provider}`,
    `Session: ${session.id}`,
    "",
    "--- Conversation so far ---",
    ...lines,
    "--- End of context ---",
    "",
    "Pick up from the last incomplete task. Do not repeat work already done.",
  ].join("\n");
}

function prependProjectMemory(session: UnifiedSession, contextPrompt: string): string {
  const projectPath = session.projectPath ?? session.cwd;
  if (!projectPath) return contextPrompt;

  const parts: string[] = [];
  try {
    parts.push(buildMemoryPrompt(projectPath, { includeSessions: 3 }).trim());
  } catch {
    // Memory not built yet — resume still works with session-only context.
  }
  const ownSummary = readSessionSummaryMarkdown(projectPath, session.id);
  if (ownSummary) {
    parts.push("## This session summary", ownSummary.trim());
  }
  if (!parts.length) return contextPrompt;
  return `${parts.join("\n\n")}\n\n---\n\n${contextPrompt}`;
}

export function planResume(session: UnifiedSession, apply = false): ResumePlan {
  const steps: string[] = [];
  let command: string | undefined;
  const contextPrompt = prependProjectMemory(session, buildContextPrompt(session));

  switch (session.provider) {
    case "claude-code": {
      const claudeDir =
        process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
      const cwd = session.cwd ?? session.projectPath;
      if (apply && cwd) {
        const hash = projectHash(cwd);
        const targetDir = join(claudeDir, "projects", hash);
        const sourceFile = session.source.paths[0];
        if (sourceFile && existsSync(sourceFile)) {
          mkdirSync(targetDir, { recursive: true });
          const targetFile = join(targetDir, `${session.id}.jsonl`);
          writeFileSync(targetFile, readFileSync(sourceFile));
          steps.push(`Restored transcript to ${targetFile}`);
        }
        const historyFile = join(claudeDir, "history.jsonl");
        const entry = {
          display: session.title,
          pastedContents: {},
          timestamp: Date.parse(session.updatedAt),
          project: cwd,
          sessionId: session.id,
        };
        appendFileSync(historyFile, `${JSON.stringify(entry)}\n`);
        steps.push(`Registered session in ${historyFile}`);
      } else if (cwd) {
        steps.push(
          "Pass --apply to restore transcript + history.jsonl for native /resume",
        );
      }
      command = `cd "${cwd ?? "."}" && claude --resume ${session.id}`;
      steps.push(`Run: ${command}`);
      break;
    }
    case "codex": {
      command = `codex resume ${session.id}`;
      steps.push(`Run from project directory: ${command}`);
      break;
    }
    case "cursor": {
      steps.push(
        "Cursor stores sessions in SQLite; direct resume is not yet supported.",
        "Paste the generated context prompt into a new Agent chat to continue.",
      );
      break;
    }
    default:
      steps.push("Paste the generated context prompt into your AI CLI to continue.");
  }

  return {
    provider: session.provider,
    sessionId: session.id,
    steps,
    command,
    contextPrompt,
  };
}

export function bundleFilename(session: UnifiedSession): string {
  const safeTitle = session.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  return `${session.provider}-${safeTitle || "session"}-${session.id.slice(0, 8)}.aiss`;
}

export function readRawFiles(paths: string[]): Record<string, { encoding: "utf8" | "base64"; content: string }> {
  const raw: Record<string, { encoding: "utf8" | "base64"; content: string }> = {};
  for (const path of paths) {
    if (!existsSync(path)) continue;
    raw[basename(path)] = {
      encoding: "utf8",
      content: readFileSync(path, "utf8"),
    };
  }
  return raw;
}

export function extractTitleFromPath(path: string, fallback: string): string {
  return basename(path, ".jsonl") || fallback;
}

export { firstUserMessage, projectHash };
