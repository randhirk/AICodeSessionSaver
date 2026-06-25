import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { SessionAdapter, SessionMessage, UnifiedSession } from "../core/types.js";
import { firstUserMessage } from "../core/resume.js";
import { fileFingerprint, readJsonl, toIsoDate } from "../core/utils.js";
import { codexHome } from "./registry.js";

interface CodexLine {
  type?: string;
  session_meta?: {
    id?: string;
    cwd?: string;
    parent_thread_id?: string;
  };
  turn_context?: { model?: string };
  event_msg?: {
    type?: string;
    user_message?: { message?: string };
    agent_message?: { message?: string };
  };
  response_item?: {
    type?: string;
    name?: string;
    input?: unknown;
    output?: unknown;
  };
  timestamp?: string;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function walkRollouts(dir: string): string[] {
  const results: string[] = [];
  if (!exists(dir)) return results;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRollouts(full));
    } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }
  return results;
}

function normalizeCodexMessages(lines: CodexLine[]): {
  messages: SessionMessage[];
  sessionId: string;
  cwd?: string;
  model?: string;
  parentId?: string;
} {
  const messages: SessionMessage[] = [];
  let index = 0;
  let sessionId = basename(lines[0] ? "unknown" : "unknown", ".jsonl");
  let cwd: string | undefined;
  let model: string | undefined;
  let parentId: string | undefined;

  for (const line of lines) {
    if (line.type === "session_meta" && line.session_meta) {
      sessionId = line.session_meta.id ?? sessionId;
      cwd = line.session_meta.cwd ?? cwd;
      parentId = line.session_meta.parent_thread_id;
      continue;
    }

    if (line.turn_context?.model) {
      model = line.turn_context.model;
    }

    const userMsg = line.event_msg?.user_message?.message;
    if (userMsg) {
      messages.push({
        id: `msg-${index++}`,
        role: "user",
        content: userMsg,
        timestamp: line.timestamp ? toIsoDate(line.timestamp) : undefined,
      });
    }

    const agentMsg = line.event_msg?.agent_message?.message;
    if (agentMsg) {
      messages.push({
        id: `msg-${index++}`,
        role: "assistant",
        content: agentMsg,
        timestamp: line.timestamp ? toIsoDate(line.timestamp) : undefined,
      });
    }

    if (line.response_item?.type === "function_call") {
      messages.push({
        id: `msg-${index++}`,
        role: "tool",
        content: JSON.stringify(line.response_item, null, 2),
        toolName: line.response_item.name,
        timestamp: line.timestamp ? toIsoDate(line.timestamp) : undefined,
      });
    }
  }

  return { messages, sessionId, cwd, model, parentId };
}

export class CodexAdapter implements SessionAdapter {
  readonly provider = "codex" as const;
  readonly name = "Codex CLI";

  isAvailable(): boolean {
    return exists(join(codexHome(), "sessions"));
  }

  watchPaths(): string[] {
    return [join(codexHome(), "sessions")];
  }

  async discoverSessions(): Promise<UnifiedSession[]> {
    const files = walkRollouts(join(codexHome(), "sessions"));
    const sessions: UnifiedSession[] = [];

    for (const path of files) {
      const lines = readJsonl<CodexLine>(path);
      if (!lines.length) continue;

      const { messages, sessionId, cwd, model, parentId } = normalizeCodexMessages(lines);
      const stat = statSync(path);
      const connections = parentId
        ? [{ type: "parent" as const, sessionId: parentId, provider: this.provider }]
        : [];

      sessions.push({
        id: sessionId,
        provider: this.provider,
        title: firstUserMessage(messages) || sessionId,
        projectPath: cwd,
        cwd,
        model,
        createdAt: toIsoDate(stat.birthtime),
        updatedAt: toIsoDate(stat.mtime),
        messageCount: messages.length,
        messages,
        connections,
        resumeHint: {
          command: `codex resume ${sessionId}`,
          sessionId,
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
