import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { SessionAdapter, SessionMessage, UnifiedSession } from "../core/types.js";
import { firstUserMessage } from "../core/resume.js";
import { fileFingerprint, readJsonl, stripXmlTags, toIsoDate } from "../core/utils.js";
import { cursorProjectsDir } from "./registry.js";

interface CursorLine {
  role?: string;
  message?: {
    content?: Array<{ type?: string; text?: string }> | string;
  };
  timestamp?: string;
}

function projectPathFromCursorDir(dirName: string): string | undefined {
  const parts = dirName.split("-");
  if (parts.length < 2) return undefined;
  return "/" + parts.join("/");
}

function normalizeCursorMessages(lines: CursorLine[]): SessionMessage[] {
  const messages: SessionMessage[] = [];
  let index = 0;

  for (const line of lines) {
    const role = line.role;
    if (!role || !["user", "assistant", "system", "tool"].includes(role)) continue;

    let content = "";
    const raw = line.message?.content;
    if (typeof raw === "string") {
      content = raw;
    } else if (Array.isArray(raw)) {
      content = raw
        .map((part) => (part.type === "text" ? part.text ?? "" : ""))
        .join("\n");
    }

    content = stripXmlTags(content);
    if (!content) continue;

    messages.push({
      id: `msg-${index++}`,
      role: role as SessionMessage["role"],
      content,
      timestamp: line.timestamp ? toIsoDate(line.timestamp) : undefined,
    });
  }

  return messages;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export class CursorAdapter implements SessionAdapter {
  readonly provider = "cursor" as const;
  readonly name = "Cursor Agent";

  isAvailable(): boolean {
    return exists(cursorProjectsDir());
  }

  watchPaths(): string[] {
    return [cursorProjectsDir()];
  }

  async discoverSessions(): Promise<UnifiedSession[]> {
    const root = cursorProjectsDir();
    const sessions: UnifiedSession[] = [];

    for (const projectDir of readdirSync(root, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) continue;
      const transcriptRoot = join(root, projectDir.name, "agent-transcripts");
      if (!exists(transcriptRoot)) continue;

      for (const sessionDir of readdirSync(transcriptRoot, { withFileTypes: true })) {
        if (!sessionDir.isDirectory()) continue;
        const path = join(transcriptRoot, sessionDir.name, `${sessionDir.name}.jsonl`);
        if (!exists(path)) continue;

        const lines = readJsonl<CursorLine>(path);
        const messages = normalizeCursorMessages(lines);
        if (!messages.length) continue;

        const stat = statSync(path);
        const projectPath = projectPathFromCursorDir(projectDir.name);

        sessions.push({
          id: sessionDir.name,
          provider: this.provider,
          title: firstUserMessage(messages) || sessionDir.name,
          projectPath,
          cwd: projectPath,
          createdAt: toIsoDate(stat.birthtime),
          updatedAt: toIsoDate(stat.mtime),
          messageCount: messages.length,
          messages,
          connections: [],
          resumeHint: {
            notes: "Paste exported context into a new Cursor Agent chat",
            sessionId: sessionDir.name,
          },
          source: {
            paths: [path],
            fingerprint: fileFingerprint(path),
          },
        });
      }
    }

    return sessions;
  }
}
