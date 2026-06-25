import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { SessionAdapter, SessionMessage, UnifiedSession } from "../core/types.js";
import { firstUserMessage } from "../core/resume.js";
import { fileFingerprint, readJsonl, safeJsonParse, stripXmlTags, toIsoDate } from "../core/utils.js";
import { claudeConfigDir } from "./registry.js";

interface ClaudeLine {
  type?: string;
  role?: string;
  message?: string | { content?: unknown };
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  model?: string;
  tool?: string;
  input?: unknown;
  output?: unknown;
}

function extractText(message: ClaudeLine["message"]): string {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("\n");
  }
  return JSON.stringify(message);
}

function normalizeClaudeMessages(lines: ClaudeLine[]): SessionMessage[] {
  const messages: SessionMessage[] = [];
  let index = 0;

  for (const line of lines) {
    const type = line.type ?? line.role;
    if (!type) continue;

    if (type === "user" || type === "assistant" || type === "system") {
      const content = stripXmlTags(extractText(line.message));
      if (!content) continue;
      messages.push({
        id: `msg-${index++}`,
        role: type,
        content,
        timestamp: line.timestamp ? toIsoDate(line.timestamp) : undefined,
      });
      continue;
    }

    if (type === "tool_use" || type === "tool_result") {
      messages.push({
        id: `msg-${index++}`,
        role: "tool",
        content: JSON.stringify(line.input ?? line.output ?? line, null, 2),
        toolName: line.tool,
        timestamp: line.timestamp ? toIsoDate(line.timestamp) : undefined,
      });
    }
  }

  return messages;
}

function walkJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!exists(dir)) return results;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }
  return results;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function projectPathFromHashDir(dirName: string): string | undefined {
  if (!dirName.startsWith("-")) return undefined;
  const guessed = dirName.replace(/^-/, "/").replace(/-/g, "/");
  return guessed;
}

export class ClaudeCodeAdapter implements SessionAdapter {
  readonly provider = "claude-code" as const;
  readonly name = "Claude Code CLI";

  isAvailable(): boolean {
    return exists(claudeConfigDir());
  }

  watchPaths(): string[] {
    return [join(claudeConfigDir(), "projects")];
  }

  async discoverSessions(): Promise<UnifiedSession[]> {
    const root = join(claudeConfigDir(), "projects");
    const files = walkJsonlFiles(root);
    const sessions: UnifiedSession[] = [];

    for (const path of files) {
      const lines = readJsonl<ClaudeLine>(path);
      if (!lines.length) continue;

      const sessionId = basename(path, ".jsonl");
      const meta = lines.find((line) => line.sessionId || line.cwd || line.model);
      const messages = normalizeClaudeMessages(lines);
      const stat = statSync(path);
      const projectDir = basename(join(path, ".."));
      const cwd = meta?.cwd ?? projectPathFromHashDir(projectDir);

      sessions.push({
        id: meta?.sessionId ?? sessionId,
        provider: this.provider,
        title: firstUserMessage(messages) || sessionId,
        projectPath: cwd,
        cwd,
        model: meta?.model,
        createdAt: toIsoDate(stat.birthtime),
        updatedAt: toIsoDate(stat.mtime),
        messageCount: messages.length,
        messages,
        connections: [],
        resumeHint: {
          command: `claude --resume ${meta?.sessionId ?? sessionId}`,
          sessionId: meta?.sessionId ?? sessionId,
        },
        source: {
          paths: [path],
          fingerprint: fileFingerprint(path),
        },
      });
    }

    return sessions;
  }
}

export function readClaudeHistory(): Array<Record<string, unknown>> {
  const historyPath = join(claudeConfigDir(), "history.jsonl");
  if (!exists(historyPath)) return [];
  return readFileSync(historyPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => safeJsonParse<Record<string, unknown>>(line))
    .filter((item): item is Record<string, unknown> => item !== null);
}
