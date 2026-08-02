/**
 * Scaling benchmarks for discovery + encode/decode as corpus size grows.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { version as nodeVersion } from "node:process";
import { platform } from "node:os";
import { ClaudeCodeAdapter } from "../../dist/adapters/claude-code.js";
import { CodexAdapter } from "../../dist/adapters/codex.js";
import { CursorAdapter } from "../../dist/adapters/cursor.js";
import { decodeBundle, encodeSession } from "../../dist/core/encoder.js";
import { readRawFiles } from "../../dist/core/resume.js";
import { percentile, writeCsv } from "./csv.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(root, "corpus");
const resultsRoot = join(root, "results");

async function discoverAll() {
  return [
    ...(await new ClaudeCodeAdapter().discoverSessions()),
    ...(await new CursorAdapter().discoverSessions()),
    ...(await new CodexAdapter().discoverSessions()),
  ];
}

async function main(): Promise<void> {
  process.env.CLAUDE_CONFIG_DIR = join(corpusRoot, "claude-code");
  process.env.CODEX_HOME = join(corpusRoot, "codex");
  process.env.CURSOR_PROJECTS_DIR = join(corpusRoot, "cursor", "projects");

  const seed = JSON.parse(readFileSync(join(resultsRoot, "corpus-meta.json"), "utf8")).seed as number;
  const runId = `performance-${Date.now()}`;

  const scanStart = performance.now();
  const all = await discoverAll();
  const scanMs = performance.now() - scanStart;

  const sizes = [10, 100, 1000, 5000].filter((n) => n <= all.length);
  if (!sizes.includes(all.length) && all.length > 0) sizes.push(all.length);

  const rows: Record<string, unknown>[] = [];

  for (const sessionCount of sizes) {
    const subset = all.slice(0, sessionCount);
    const searchSamples: number[] = [];
    const exportSamples: number[] = [];
    const importSamples: number[] = [];

    const indexStart = performance.now();
    const index = new Map(subset.map((s) => [s.id, s]));
    const indexMs = performance.now() - indexStart;

    for (let i = 0; i < Math.min(50, subset.length); i += 1) {
      const target = subset[i]!;
      const t0 = performance.now();
      index.get(target.id);
      searchSamples.push(performance.now() - t0);

      const raw = readRawFiles(target.source.paths);
      const e0 = performance.now();
      const buf = encodeSession(target, raw);
      exportSamples.push(performance.now() - e0);
      const i0 = performance.now();
      decodeBundle(buf);
      importSamples.push(performance.now() - i0);
    }

    searchSamples.sort((a, b) => a - b);
    exportSamples.sort((a, b) => a - b);
    importSamples.sort((a, b) => a - b);

    const rss = process.memoryUsage().rss / (1024 * 1024);

    rows.push({
      run_id: runId,
      session_count: sessionCount,
      scan_ms: Number(scanMs.toFixed(3)),
      index_ms: Number(indexMs.toFixed(3)),
      search_p50_ms: Number(percentile(searchSamples, 50).toFixed(4)),
      search_p95_ms: Number(percentile(searchSamples, 95).toFixed(4)),
      search_p99_ms: Number(percentile(searchSamples, 99).toFixed(4)),
      export_ms: Number(percentile(exportSamples, 50).toFixed(3)),
      import_ms: Number(percentile(importSamples, 50).toFixed(3)),
      db_bytes: "",
      peak_rss_mb: Number(rss.toFixed(2)),
      node_version: nodeVersion,
      os: platform(),
      seed,
    });
  }

  writeCsv(join(resultsRoot, "performance.csv"), rows);
  console.log(`Performance rows: ${rows.length} (discovered=${all.length})`);
  console.log(`Wrote ${join(resultsRoot, "performance.csv")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
