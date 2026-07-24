import { createHash } from "node:crypto";
import type { SessionMessage, UnifiedSession } from "./types.js";
import { stripXmlTags } from "./utils.js";

export type MemoryEntryKind = "status" | "decision" | "mistake" | "qa";

export interface MemoryEntry {
  id: string;
  kind: MemoryEntryKind;
  text: string;
  sourceSessionId?: string;
  sourceProvider?: string;
  updatedAt?: string;
}

export interface ProjectMemoryData {
  status: MemoryEntry[];
  decisions: MemoryEntry[];
  mistakes: MemoryEntry[];
  qa: MemoryEntry[];
  userNotes: string;
}

export const MEMORY_CAPS = {
  status: 20,
  decisions: 40,
  mistakes: 30,
  qa: 50,
} as const;

const DECISION_RE =
  /\b(we(?:'|’)ll use|we will use|decided|going with|let'?s use|use \w+ instead|prefer(?:ring)?|chose|choosing|switch(?:ing)? to)\b/i;
const MISTAKE_RE =
  /\b(don'?t (?:do|use|put|make|run)|do not (?:do|use|put)|that(?:'|’)s wrong|was wrong|you(?:'|’)re wrong|stop doing|we already tried|never (?:use|do)|incorrect(?:ly)?|avoid (?:using|doing)|not that|instead of)\b/i;
const DONE_RE =
  /\b(created|updated|fixed|implemented|added|removed|refactored|built|wrote|shipped|resolved|completed)\b/i;
const OPEN_RE = /\b(TODO|FIXME|next(?:\s+step)?|still need|should we|remaining|follow[- ]?up|open thread)\b/i;
const QUESTION_RE = /^(how|why|what|when|where|which|should|can|could|would|is|are|do|does)\b|\?$/i;

function entryId(kind: MemoryEntryKind, text: string): string {
  return createHash("sha256").update(`${kind}:${normalizeKey(text)}`).digest("hex").slice(0, 12);
}

export function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

export function cleanText(text: string, max = 280): string {
  const cleaned = stripXmlTags(text)
    .replace(/\r\n/g, "\n")
    .replace(/\[REDACTED\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

function isUseful(text: string, min = 12): boolean {
  const t = text.trim();
  if (t.length < min) return false;
  if (/^[{[]/.test(t)) return false;
  if (t.split(/\s+/).length < 3) return false;
  return true;
}

function upsert(map: Map<string, MemoryEntry>, entry: MemoryEntry, cap: number): void {
  if (!isUseful(entry.text)) return;
  map.set(entry.id, entry);
  if (map.size <= cap) return;
  const keys = [...map.keys()];
  for (const key of keys.slice(0, map.size - cap)) {
    map.delete(key);
  }
}

function pairAssistant(messages: SessionMessage[], userIndex: number): SessionMessage | undefined {
  for (let i = userIndex + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "assistant" && isUseful(cleanText(m.content, 500), 8)) return m;
    if (m.role === "user") break;
  }
  return undefined;
}

export function extractFromSession(session: UnifiedSession): ProjectMemoryData {
  const status = new Map<string, MemoryEntry>();
  const decisions = new Map<string, MemoryEntry>();
  const mistakes = new Map<string, MemoryEntry>();
  const qa = new Map<string, MemoryEntry>();

  const messages = session.messages.filter((m) => m.role === "user" || m.role === "assistant");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const text = cleanText(msg.content, 400);
    if (!isUseful(text, 8)) continue;

    const base = {
      sourceSessionId: session.id,
      sourceProvider: session.provider,
      updatedAt: msg.timestamp ?? session.updatedAt,
    };

    if (msg.role === "user") {
      // Prefer explicit correction directed at prior agent behavior.
      if (MISTAKE_RE.test(text) && !/\bdo not do the same mistake\b/i.test(text)) {
        const entry: MemoryEntry = {
          id: entryId("mistake", text),
          kind: "mistake",
          text,
          ...base,
        };
        upsert(mistakes, entry, MEMORY_CAPS.mistakes);
      }

      const looksLikeQuestion = QUESTION_RE.test(text.trim()) || text.includes("?");
      if (looksLikeQuestion) {
        const answer = pairAssistant(messages, i);
        if (answer) {
          const q = cleanText(text, 160);
          const a = cleanText(answer.content, 220);
          const combined = `Q: ${q}\nA: ${a}`;
          upsert(
            qa,
            {
              id: entryId("qa", q),
              kind: "qa",
              text: combined,
              ...base,
            },
            MEMORY_CAPS.qa,
          );
        }
      }
    }

    if (msg.role === "assistant" || msg.role === "user") {
      if (DECISION_RE.test(text)) {
        upsert(
          decisions,
          {
            id: entryId("decision", text),
            kind: "decision",
            text,
            ...base,
          },
          MEMORY_CAPS.decisions,
        );
      }
      if (msg.role === "assistant" && MISTAKE_RE.test(text) && /\b(was wrong|correction|instead)\b/i.test(text)) {
        upsert(
          mistakes,
          {
            id: entryId("mistake", text),
            kind: "mistake",
            text,
            ...base,
          },
          MEMORY_CAPS.mistakes,
        );
      }
    }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const text = cleanText(`Last ask (${session.provider}): ${lastUser.content}`, 220);
    upsert(
      status,
      {
        id: entryId("status", `${session.id}:${text}`),
        kind: "status",
        text,
        sourceSessionId: session.id,
        sourceProvider: session.provider,
        updatedAt: session.updatedAt,
      },
      MEMORY_CAPS.status,
    );
  }

  const titleStatus = cleanText(
    `Session “${session.title.slice(0, 80)}” (${session.provider}, ${session.messageCount} msgs)`,
    180,
  );
  upsert(
    status,
    {
      id: entryId("status", `title:${session.id}`),
      kind: "status",
      text: titleStatus,
      sourceSessionId: session.id,
      sourceProvider: session.provider,
      updatedAt: session.updatedAt,
    },
    MEMORY_CAPS.status,
  );

  return {
    status: [...status.values()],
    decisions: [...decisions.values()],
    mistakes: [...mistakes.values()],
    qa: [...qa.values()],
    userNotes: "",
  };
}

export function mergeProjectMemory(
  existing: ProjectMemoryData | null,
  incoming: ProjectMemoryData[],
): ProjectMemoryData {
  const status = new Map<string, MemoryEntry>();
  const decisions = new Map<string, MemoryEntry>();
  const mistakes = new Map<string, MemoryEntry>();
  const qa = new Map<string, MemoryEntry>();

  const seed = existing ?? {
    status: [],
    decisions: [],
    mistakes: [],
    qa: [],
    userNotes: "",
  };

  for (const entry of seed.status) upsert(status, entry, MEMORY_CAPS.status);
  for (const entry of seed.decisions) upsert(decisions, entry, MEMORY_CAPS.decisions);
  for (const entry of seed.mistakes) upsert(mistakes, entry, MEMORY_CAPS.mistakes);
  for (const entry of seed.qa) upsert(qa, entry, MEMORY_CAPS.qa);

  for (const part of incoming) {
    for (const entry of part.status) upsert(status, entry, MEMORY_CAPS.status);
    for (const entry of part.decisions) upsert(decisions, entry, MEMORY_CAPS.decisions);
    for (const entry of part.mistakes) upsert(mistakes, entry, MEMORY_CAPS.mistakes);
    for (const entry of part.qa) upsert(qa, entry, MEMORY_CAPS.qa);
  }

  return {
    status: [...status.values()],
    decisions: [...decisions.values()],
    mistakes: [...mistakes.values()],
    qa: [...qa.values()],
    userNotes: seed.userNotes,
  };
}

export function extractUserNotes(memoryMd: string): string {
  const match = memoryMd.match(/## User notes\n([\s\S]*?)(?=\n## |\n*$)/i);
  if (!match) return "";
  return match[1].trim();
}

export { DECISION_RE, MISTAKE_RE, DONE_RE, OPEN_RE, QUESTION_RE, isUseful };
