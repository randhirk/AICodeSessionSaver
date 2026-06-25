import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAvailableAdapters } from "../adapters/registry.js";
import { encodeSession } from "../core/encoder.js";
import { SessionIndex, getBundlesDir } from "../core/index-db.js";
import { bundleFilename, readRawFiles } from "../core/resume.js";
import type { UnifiedSession } from "../core/types.js";

export interface SyncResult {
  discovered: number;
  indexed: number;
  updated: number;
  sessions: UnifiedSession[];
}

export async function syncSessions(index = new SessionIndex()): Promise<SyncResult> {
  mkdirSync(getBundlesDir(), { recursive: true });

  const adapters = getAvailableAdapters();
  const allSessions: UnifiedSession[] = [];

  for (const adapter of adapters) {
    const sessions = await adapter.discoverSessions();
    allSessions.push(...sessions);
  }

  let indexed = 0;
  let updated = 0;

  for (const session of allSessions) {
    const existing = index.get(session.id, session.provider);
    const bundlePath = join(getBundlesDir(), bundleFilename(session));
    const raw = readRawFiles(session.source.paths);
    const encoded = encodeSession(session, raw);
    writeFileSync(bundlePath, encoded);

    index.upsert(session, bundlePath);
    indexed += 1;
    if (existing && existing.fingerprint !== session.source.fingerprint) {
      updated += 1;
    }
  }

  return {
    discovered: allSessions.length,
    indexed,
    updated,
    sessions: allSessions,
  };
}

export function findSession(
  sessions: UnifiedSession[],
  idOrQuery: string,
): UnifiedSession | undefined {
  const exact = sessions.find((s) => s.id === idOrQuery || s.id.startsWith(idOrQuery));
  if (exact) return exact;

  const lower = idOrQuery.toLowerCase();
  return sessions.find((s) => s.title.toLowerCase().includes(lower));
}
