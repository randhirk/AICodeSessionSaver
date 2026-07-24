import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const AISS_MEMORY_START = "<!-- aiss-memory:start -->";
export const AISS_MEMORY_END = "<!-- aiss-memory:end -->";

function upsertMarkedBlock(existing: string, body: string): string {
  const block = `${AISS_MEMORY_START}\n${body.trim()}\n${AISS_MEMORY_END}`;
  if (existing.includes(AISS_MEMORY_START) && existing.includes(AISS_MEMORY_END)) {
    return existing.replace(
      new RegExp(`${escapeRegExp(AISS_MEMORY_START)}[\\s\\S]*?${escapeRegExp(AISS_MEMORY_END)}`),
      block,
    );
  }
  const trimmed = existing.trimEnd();
  if (!trimmed) return `${block}\n`;
  return `${trimmed}\n\n${block}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeMarkedFile(path: string, body: string, createIfMissing = true): boolean {
  if (!existsSync(path) && !createIfMissing) return false;
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, upsertMarkedBlock(existing, body), "utf8");
  return true;
}

export interface ApplyResult {
  written: string[];
}

export function applyMemoryToProject(projectPath: string, injectBody: string): ApplyResult {
  const written: string[] = [];
  const header = [
    "# AISS shared project memory",
    "",
    "Shared AISS project memory — do not re-ask settled Q&A; respect mistakes and decisions.",
    "This block is auto-managed. Edit only the User notes section inside MEMORY via `aiss memory`.",
    "",
    injectBody.trim(),
  ].join("\n");

  const claudeCandidates = [join(projectPath, ".claude", "CLAUDE.md"), join(projectPath, "CLAUDE.md")];
  const existingClaude = claudeCandidates.find((p) => existsSync(p));
  const claudePath = existingClaude ?? join(projectPath, "CLAUDE.md");
  writeMarkedFile(claudePath, header, true);
  written.push(claudePath);

  const agentsPath = join(projectPath, "AGENTS.md");
  writeMarkedFile(agentsPath, header, true);
  written.push(agentsPath);

  const rulesDir = join(projectPath, ".cursor", "rules");
  mkdirSync(rulesDir, { recursive: true });
  const rulePath = join(rulesDir, "aiss-memory.mdc");
  const ruleBody = [
    "---",
    "description: AISS shared project memory across sessions (distilled facts + prior session summaries)",
    "alwaysApply: true",
    "---",
    "",
    header,
    "",
  ].join("\n");
  writeFileSync(rulePath, ruleBody, "utf8");
  written.push(rulePath);

  return { written };
}
