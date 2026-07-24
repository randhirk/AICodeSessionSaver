import type { UnifiedSession } from "./types.js";
import {
  DONE_RE,
  DECISION_RE,
  OPEN_RE,
  cleanText,
  isUseful,
  extractFromSession,
} from "./memory-extract.js";

const SUMMARY_CHAR_BUDGET = 2800;

export interface SessionSummary {
  id: string;
  provider: UnifiedSession["provider"];
  title: string;
  updatedAt: string;
  messageCount: number;
  fingerprint: string;
  goal: string;
  whatWasDone: string[];
  outcomes: string[];
  openThreads: string[];
}

export function sessionSummaryBasename(session: Pick<UnifiedSession, "provider" | "id">): string {
  return `${session.provider}-${session.id}`;
}

export function summarizeSession(session: UnifiedSession): SessionSummary | null {
  if (!session.messages.length) return null;

  const userMsgs = session.messages.filter((m) => m.role === "user");
  const assistantMsgs = session.messages.filter((m) => m.role === "assistant");

  const goalParts: string[] = [];
  for (const msg of userMsgs) {
    const text = cleanText(msg.content, 200);
    if (!isUseful(text, 10)) continue;
    goalParts.push(text);
    if (goalParts.length >= 2) break;
  }

  const whatWasDone: string[] = [];
  for (const msg of assistantMsgs) {
    const text = cleanText(msg.content, 180);
    if (!isUseful(text, 12)) continue;
    if (!DONE_RE.test(text) && !/^(done|here|i(?:'|’)ve)\b/i.test(text)) continue;
    whatWasDone.push(text);
    if (whatWasDone.length >= 6) break;
  }

  const distilled = extractFromSession(session);
  const outcomes = [
    ...distilled.decisions.map((e) => e.text),
    ...distilled.mistakes.slice(0, 3).map((e) => `Avoid: ${e.text}`),
  ].slice(0, 8);

  const openThreads: string[] = [];
  const lastUser = [...userMsgs].pop();
  const lastAssistant = [...assistantMsgs].pop();
  if (lastUser) {
    const lastUserIdx = session.messages.lastIndexOf(lastUser);
    const laterAssistant = session.messages
      .slice(lastUserIdx + 1)
      .some((m) => m.role === "assistant");
    if (!laterAssistant) {
      openThreads.push(cleanText(`Unanswered: ${lastUser.content}`, 200));
    }
  }

  for (const msg of [...userMsgs, ...assistantMsgs].slice(-12)) {
    const text = cleanText(msg.content, 160);
    if (OPEN_RE.test(text) || DECISION_RE.test(text) && /\bnext\b/i.test(text)) {
      openThreads.push(text);
    }
    if (openThreads.length >= 5) break;
  }

  if (lastAssistant && openThreads.length < 5) {
    const text = cleanText(lastAssistant.content, 160);
    if (/\b(next|todo|still|remaining|should)\b/i.test(text)) {
      openThreads.push(text);
    }
  }

  const summary: SessionSummary = {
    id: session.id,
    provider: session.provider,
    title: cleanText(session.title, 120) || session.id.slice(0, 8),
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    fingerprint: session.source.fingerprint ?? "",
    goal: goalParts.join(" ") || cleanText(session.title, 160),
    whatWasDone: unique(whatWasDone).slice(0, 6),
    outcomes: unique(outcomes).slice(0, 8),
    openThreads: unique(openThreads).slice(0, 5),
  };

  return clampSummary(summary);
}

export function renderSessionSummaryMarkdown(summary: SessionSummary): string {
  const bullets = (items: string[], empty: string) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`;

  return [
    `# Session: ${summary.title}`,
    `- id: ${summary.id}`,
    `- provider: ${summary.provider}`,
    `- updated: ${summary.updatedAt}`,
    `- messages: ${summary.messageCount}`,
    "",
    "## Goal",
    summary.goal || "(unclear)",
    "",
    "## What was done",
    bullets(summary.whatWasDone, "(none detected)"),
    "",
    "## Outcomes",
    bullets(summary.outcomes, "(none detected)"),
    "",
    "## Open threads",
    bullets(summary.openThreads, "(none detected)"),
    "",
  ].join("\n");
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function clampSummary(summary: SessionSummary): SessionSummary {
  let md = renderSessionSummaryMarkdown(summary);
  if (md.length <= SUMMARY_CHAR_BUDGET) return summary;

  const clone: SessionSummary = {
    ...summary,
    whatWasDone: summary.whatWasDone.slice(0, 3),
    outcomes: summary.outcomes.slice(0, 4),
    openThreads: summary.openThreads.slice(0, 3),
    goal: cleanText(summary.goal, 160),
  };
  md = renderSessionSummaryMarkdown(clone);
  if (md.length <= SUMMARY_CHAR_BUDGET) return clone;

  return {
    ...clone,
    whatWasDone: clone.whatWasDone.slice(0, 2),
    outcomes: clone.outcomes.slice(0, 2),
    openThreads: clone.openThreads.slice(0, 2),
    goal: cleanText(clone.goal, 120),
  };
}
