import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { getDataDir } from "./index-db.js";
import { applyMemoryToProject } from "./memory-apply.js";
import {
  extractFromSession,
  extractUserNotes,
  mergeProjectMemory,
  type MemoryEntry,
  type ProjectMemoryData,
} from "./memory-extract.js";
import {
  renderSessionSummaryMarkdown,
  sessionSummaryBasename,
  summarizeSession,
  type SessionSummary,
} from "./memory-summarize.js";
import type { UnifiedSession } from "./types.js";

function pathProjectHash(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export interface SessionCatalogEntry {
  id: string;
  provider: UnifiedSession["provider"];
  title: string;
  updatedAt: string;
  messageCount: number;
  fingerprint: string;
  summaryPath: string;
}

export interface MemoryMeta {
  projectPath: string;
  projectHash: string;
  builtAt: string;
  sessionCount: number;
}

export interface MemoryBuildResult {
  projectPath: string;
  memoryDir: string;
  sessionSummaries: number;
  sessionSummariesUpdated: number;
  memoryPath: string;
}

export interface MemoryPromptOptions {
  includeSessions?: number;
}

function normalizeProjectPath(projectPath: string): string {
  return resolve(projectPath);
}

export function memoryProjectHash(projectPath: string): string {
  return pathProjectHash(normalizeProjectPath(projectPath));
}

export function getMemoryRoot(): string {
  return join(getDataDir(), "memory");
}

export function getProjectMemoryDir(projectPath: string): string {
  return join(getMemoryRoot(), memoryProjectHash(projectPath));
}

export function getSessionsDir(projectPath: string): string {
  return join(getProjectMemoryDir(projectPath), "sessions");
}

function sessionMatchesProject(session: UnifiedSession, projectPath: string): boolean {
  const target = normalizeProjectPath(projectPath).toLowerCase();
  const candidates = [session.projectPath, session.cwd].filter(Boolean) as string[];
  if (!candidates.length) {
    // Cursor adapters sometimes encode path oddly; include untitled only if project is cwd fallback
    return false;
  }
  return candidates.some((c) => {
    const n = resolve(c).toLowerCase();
    return n === target || n.includes(target) || target.includes(n);
  });
}

export function filterSessionsForProject(
  sessions: UnifiedSession[],
  projectPath: string,
): UnifiedSession[] {
  const matched = sessions.filter((s) => sessionMatchesProject(s, projectPath));
  if (matched.length) return matched;

  // Fallback: if nothing matches path heuristics, use all sessions that mention the basename
  const base = normalizeProjectPath(projectPath).split(/[/\\]/).filter(Boolean).pop()?.toLowerCase();
  if (!base) return [];
  return sessions.filter((s) => {
    const hay = `${s.projectPath ?? ""} ${s.cwd ?? ""} ${s.title}`.toLowerCase();
    return hay.includes(base);
  });
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function loadCatalog(sessionsDir: string): SessionCatalogEntry[] {
  const index = readJsonFile<{ sessions?: SessionCatalogEntry[] }>(join(sessionsDir, "index.json"));
  return index?.sessions ?? [];
}

function saveCatalog(sessionsDir: string, entries: SessionCatalogEntry[]): void {
  const sorted = [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeJson(join(sessionsDir, "index.json"), { sessions: sorted });
}

function loadExistingMemory(memoryDir: string): ProjectMemoryData | null {
  const data = readJsonFile<ProjectMemoryData>(join(memoryDir, "memory.json"));
  const mdPath = join(memoryDir, "MEMORY.md");
  const userNotes = existsSync(mdPath) ? extractUserNotes(readFileSync(mdPath, "utf8")) : "";
  if (!data) {
    return userNotes
      ? { status: [], decisions: [], mistakes: [], qa: [], userNotes }
      : null;
  }
  return { ...data, userNotes: userNotes || data.userNotes || "" };
}

function renderBullets(entries: MemoryEntry[], empty: string): string {
  if (!entries.length) return `- ${empty}`;
  return entries.map((e) => `- ${e.text.replace(/\n/g, "\n  ")}`).join("\n");
}

function renderCatalogLines(entries: SessionCatalogEntry[], limit = 20): string {
  if (!entries.length) return "- (no session summaries yet)";
  return entries
    .slice(0, limit)
    .map(
      (e) =>
        `- ${e.updatedAt.slice(0, 10)} · ${e.provider} · ${e.id.slice(0, 8)} · ${e.title.slice(0, 80)}`,
    )
    .join("\n");
}

export function renderMemoryMarkdown(
  data: ProjectMemoryData,
  catalog: SessionCatalogEntry[],
): string {
  return [
    "# AISS project memory",
    "",
    "## Current status",
    renderBullets(data.status, "(none yet)"),
    "",
    "## Decisions",
    renderBullets(data.decisions, "(none yet)"),
    "",
    "## Mistakes to avoid",
    renderBullets(data.mistakes, "(none yet)"),
    "",
    "## Answered Q&A",
    renderBullets(data.qa, "(none yet)"),
    "",
    "## Previous sessions",
    renderCatalogLines(catalog),
    "",
    "## User notes",
    data.userNotes.trim() || "(add permanent notes here; preserved across rebuilds)",
    "",
  ].join("\n");
}

function refreshSessionSummaries(
  projectPath: string,
  sessions: UnifiedSession[],
): { catalog: SessionCatalogEntry[]; updated: number } {
  const sessionsDir = getSessionsDir(projectPath);
  mkdirSync(sessionsDir, { recursive: true });

  const existing = new Map<string, SessionCatalogEntry>(
    loadCatalog(sessionsDir).map((e) => [`${e.provider}:${e.id}`, e]),
  );
  const catalog: SessionCatalogEntry[] = [];
  let updated = 0;

  for (const session of sessions) {
    const key = `${session.provider}:${session.id}`;
    const fingerprint = session.source.fingerprint ?? "";
    const base = sessionSummaryBasename(session);
    const mdPath = join(sessionsDir, `${base}.md`);
    const jsonPath = join(sessionsDir, `${base}.json`);
    const prev = existing.get(key);

    let summary: SessionSummary | null = null;
    if (prev && prev.fingerprint && prev.fingerprint === fingerprint && existsSync(mdPath)) {
      summary = readJsonFile<SessionSummary>(jsonPath);
      if (!summary) {
        // keep catalog entry pointing at existing md
        catalog.push({ ...prev, summaryPath: mdPath });
        continue;
      }
    } else {
      summary = summarizeSession(session);
      if (!summary) continue;
      writeFileSync(mdPath, renderSessionSummaryMarkdown(summary), "utf8");
      writeJson(jsonPath, summary);
      updated += 1;
    }

    catalog.push({
      id: summary.id,
      provider: summary.provider,
      title: summary.title,
      updatedAt: summary.updatedAt,
      messageCount: summary.messageCount,
      fingerprint: summary.fingerprint,
      summaryPath: mdPath,
    });
  }

  saveCatalog(sessionsDir, catalog);
  return { catalog: loadCatalog(sessionsDir), updated };
}

export function buildProjectMemory(
  projectPath: string,
  allSessions: UnifiedSession[],
): MemoryBuildResult {
  const normalized = normalizeProjectPath(projectPath);
  const memoryDir = getProjectMemoryDir(normalized);
  mkdirSync(memoryDir, { recursive: true });

  const sessions = filterSessionsForProject(allSessions, normalized).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const { catalog, updated } = refreshSessionSummaries(normalized, sessions);
  const existing = loadExistingMemory(memoryDir);
  const distilled = mergeProjectMemory(
    {
      status: [],
      decisions: [],
      mistakes: [],
      qa: [],
      userNotes: existing?.userNotes ?? "",
    },
    sessions.map((s) => extractFromSession(s)),
  );

  const memoryPath = join(memoryDir, "MEMORY.md");
  writeFileSync(memoryPath, renderMemoryMarkdown(distilled, catalog), "utf8");
  writeJson(join(memoryDir, "memory.json"), distilled);

  const meta: MemoryMeta = {
    projectPath: normalized,
    projectHash: memoryProjectHash(normalized),
    builtAt: new Date().toISOString(),
    sessionCount: sessions.length,
  };
  writeJson(join(memoryDir, "meta.json"), meta);

  return {
    projectPath: normalized,
    memoryDir,
    sessionSummaries: catalog.length,
    sessionSummariesUpdated: updated,
    memoryPath,
  };
}

export function buildMemoryForProjects(
  allSessions: UnifiedSession[],
  projectPaths: string[],
): MemoryBuildResult[] {
  const unique = [...new Set(projectPaths.map((p) => normalizeProjectPath(p)))];
  return unique.map((p) => buildProjectMemory(p, allSessions));
}

export function readMemoryMarkdown(projectPath: string): string | null {
  const path = join(getProjectMemoryDir(projectPath), "MEMORY.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function listSessionCatalog(
  projectPath: string,
  limit = 20,
): SessionCatalogEntry[] {
  return loadCatalog(getSessionsDir(projectPath)).slice(0, limit);
}

export function readSessionSummaryMarkdown(
  projectPath: string,
  idOrPrefix: string,
): string | null {
  const catalog = loadCatalog(getSessionsDir(projectPath));
  const entry =
    catalog.find((e) => e.id === idOrPrefix || e.id.startsWith(idOrPrefix)) ??
    catalog.find((e) => `${e.provider}-${e.id}`.includes(idOrPrefix));
  if (!entry) return null;
  if (!existsSync(entry.summaryPath)) return null;
  return readFileSync(entry.summaryPath, "utf8");
}

function projectSectionsOnly(memoryMd: string): string {
  // Drop Previous sessions from MEMORY.md when we inject richer session bodies separately;
  // keep status/decisions/mistakes/qa/user notes.
  return memoryMd
    .replace(/\n## Previous sessions\n[\s\S]*?(?=\n## )/i, "\n")
    .trim();
}

export function buildMemoryPrompt(
  projectPath: string,
  options: MemoryPromptOptions = {},
): string {
  const includeSessions = options.includeSessions ?? 5;
  const memoryMd = readMemoryMarkdown(projectPath);
  if (!memoryMd) {
    throw new Error(
      `No memory built for ${normalizeProjectPath(projectPath)}. Run: aiss memory build --project "${projectPath}"`,
    );
  }

  const catalog = loadCatalog(getSessionsDir(projectPath));
  const header = [
    "Shared AISS project memory — do not re-ask settled Q&A; respect mistakes and decisions.",
    "Use prior session summaries for continuity. Do not assume details that are not listed here.",
    "",
  ].join("\n");

  const core = projectSectionsOnly(memoryMd);
  const parts = [header, core, ""];

  parts.push("## Previous sessions");
  if (includeSessions === 0) {
    parts.push(renderCatalogLines(catalog, 30));
  } else {
    parts.push(renderCatalogLines(catalog, 30));
    parts.push("");
    const selected = catalog.slice(0, includeSessions);
    for (const entry of selected) {
      if (!existsSync(entry.summaryPath)) continue;
      parts.push("---");
      parts.push(readFileSync(entry.summaryPath, "utf8").trim());
      parts.push("");
    }
  }

  return parts.join("\n").trim() + "\n";
}

export function applyProjectMemory(
  projectPath: string,
  options: MemoryPromptOptions = {},
): { written: string[]; prompt: string } {
  const prompt = buildMemoryPrompt(projectPath, options);
  const result = applyMemoryToProject(normalizeProjectPath(projectPath), prompt);
  return { written: result.written, prompt };
}

export function clearProjectMemory(projectPath: string, all = false): void {
  const memoryDir = getProjectMemoryDir(projectPath);
  if (!existsSync(memoryDir)) return;

  if (all) {
    rmSync(memoryDir, { recursive: true, force: true });
    return;
  }

  const mdPath = join(memoryDir, "MEMORY.md");
  const userNotes = existsSync(mdPath) ? extractUserNotes(readFileSync(mdPath, "utf8")) : "";
  rmSync(memoryDir, { recursive: true, force: true });
  if (userNotes) {
    mkdirSync(memoryDir, { recursive: true });
    const preserved: ProjectMemoryData = {
      status: [],
      decisions: [],
      mistakes: [],
      qa: [],
      userNotes,
    };
    writeFileSync(mdPath, renderMemoryMarkdown(preserved, []), "utf8");
    writeJson(join(memoryDir, "memory.json"), preserved);
  }
}

export function discoverProjectPaths(sessions: UnifiedSession[], fallback: string): string[] {
  const paths = new Set<string>();
  for (const s of sessions) {
    const p = s.projectPath ?? s.cwd;
    if (p) paths.add(normalizeProjectPath(p));
  }
  if (!paths.size) paths.add(normalizeProjectPath(fallback));
  return [...paths];
}
