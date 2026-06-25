import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { IndexRecord, Provider, UnifiedSession } from "./types.js";

const DEFAULT_DATA_DIR = join(homedir(), ".aicode-session-saver");

export function getDataDir(): string {
  return process.env.AISS_DATA_DIR ?? DEFAULT_DATA_DIR;
}

export function getIndexPath(): string {
  return join(getDataDir(), "index.db");
}

export function getBundlesDir(): string {
  return join(getDataDir(), "bundles");
}

export class SessionIndex {
  private db: DatabaseSync;

  constructor(dbPath = getIndexPath()) {
    mkdirSync(join(dbPath, ".."), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT NOT NULL,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        project_path TEXT,
        cwd TEXT,
        model TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        source_paths TEXT NOT NULL,
        bundle_path TEXT,
        fingerprint TEXT,
        PRIMARY KEY (id, provider)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
      CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
    `);
  }

  upsert(session: UnifiedSession, bundlePath: string | null = null): void {
    this.db
      .prepare(
        `
      INSERT INTO sessions (
        id, provider, title, project_path, cwd, model,
        created_at, updated_at, message_count, source_paths, bundle_path, fingerprint
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id, provider) DO UPDATE SET
        title = excluded.title,
        project_path = excluded.project_path,
        cwd = excluded.cwd,
        model = excluded.model,
        updated_at = excluded.updated_at,
        message_count = excluded.message_count,
        source_paths = excluded.source_paths,
        bundle_path = COALESCE(excluded.bundle_path, sessions.bundle_path),
        fingerprint = excluded.fingerprint
    `,
      )
      .run(
        session.id,
        session.provider,
        session.title,
        session.projectPath ?? null,
        session.cwd ?? null,
        session.model ?? null,
        session.createdAt,
        session.updatedAt,
        session.messageCount,
        JSON.stringify(session.source.paths),
        bundlePath,
        session.source.fingerprint ?? null,
      );
  }

  list(options: { provider?: Provider; project?: string; limit?: number } = {}): IndexRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number | null> = [];

    if (options.provider) {
      clauses.push("provider = ?");
      params.push(options.provider);
    }
    if (options.project) {
      clauses.push("project_path LIKE ?");
      params.push(`%${options.project}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = options.limit ?? 50;
    params.push(limit);

    const rows = this.db
      .prepare(`SELECT * FROM sessions ${where} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      provider: row.provider as Provider,
      title: String(row.title),
      projectPath: row.project_path ? String(row.project_path) : null,
      cwd: row.cwd ? String(row.cwd) : null,
      model: row.model ? String(row.model) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      messageCount: Number(row.message_count),
      sourcePaths: String(row.source_paths),
      bundlePath: row.bundle_path ? String(row.bundle_path) : null,
      fingerprint: row.fingerprint ? String(row.fingerprint) : null,
    }));
  }

  get(id: string, provider: Provider): IndexRecord | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ? AND provider = ?")
      .get(id, provider) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      id: String(row.id),
      provider: row.provider as Provider,
      title: String(row.title),
      projectPath: row.project_path ? String(row.project_path) : null,
      cwd: row.cwd ? String(row.cwd) : null,
      model: row.model ? String(row.model) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      messageCount: Number(row.message_count),
      sourcePaths: String(row.source_paths),
      bundlePath: row.bundle_path ? String(row.bundle_path) : null,
      fingerprint: row.fingerprint ? String(row.fingerprint) : null,
    };
  }

  close(): void {
    this.db.close();
  }
}
