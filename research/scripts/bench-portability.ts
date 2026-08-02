/**
 * Bundle export/import, compression, checksum, and corruption detection benchmarks.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { ClaudeCodeAdapter } from "../../dist/adapters/claude-code.js";
import { CodexAdapter } from "../../dist/adapters/codex.js";
import { CursorAdapter } from "../../dist/adapters/cursor.js";
import { decodeBundle, encodeSession, sha256 } from "../../dist/core/encoder.js";
import { readRawFiles } from "../../dist/core/resume.js";
import { writeCsv } from "./csv.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(root, "corpus");
const resultsRoot = join(root, "results");

function hashRaw(raw: Record<string, { encoding: string; content: string }>): string {
  const h = createHash("sha256");
  for (const key of Object.keys(raw).sort()) {
    h.update(key);
    h.update(raw[key]!.content);
  }
  return h.digest("hex");
}

async function main(): Promise<void> {
  process.env.CLAUDE_CONFIG_DIR = join(corpusRoot, "claude-code");
  process.env.CODEX_HOME = join(corpusRoot, "codex");
  process.env.CURSOR_PROJECTS_DIR = join(corpusRoot, "cursor", "projects");

  const seed = JSON.parse(readFileSync(join(resultsRoot, "corpus-meta.json"), "utf8")).seed as number;
  const runId = `portability-${Date.now()}`;

  const sessions = [
    ...(await new ClaudeCodeAdapter().discoverSessions()),
    ...(await new CursorAdapter().discoverSessions()),
    ...(await new CodexAdapter().discoverSessions()),
  ];

  const rows: Record<string, unknown>[] = [];

  for (const session of sessions) {
    const raw = readRawFiles(session.source.paths);
    const originalBytes = Object.values(raw).reduce(
      (sum, file) => sum + Buffer.byteLength(file.content),
      0,
    );
    const beforeHash = hashRaw(raw);

    const exportStart = performance.now();
    const bundleBuf = encodeSession(session, raw);
    const exportMs = performance.now() - exportStart;

    const verifyStart = performance.now();
    const importStart = performance.now();
    const decoded = decodeBundle(bundleBuf);
    const importMs = performance.now() - importStart;
    const checksumVerifyMs = performance.now() - verifyStart;

    const afterHash = hashRaw(decoded.raw);
    rows.push({
      run_id: runId,
      session_id: session.id,
      provider: session.provider,
      original_bytes: originalBytes,
      bundle_bytes: bundleBuf.length,
      compression_ratio:
        originalBytes === 0 ? 0 : Number((bundleBuf.length / originalBytes).toFixed(4)),
      export_ms: Number(exportMs.toFixed(3)),
      import_ms: Number(importMs.toFixed(3)),
      checksum_verify_ms: Number(checksumVerifyMs.toFixed(3)),
      round_trip_ok: decoded.session.id === session.id,
      raw_hash_match: beforeHash === afterHash,
      corruption_detected: false,
      scenario: "clean-roundtrip",
      seed,
    });
  }

  // Corruption detection sample (first 50 sessions).
  for (const session of sessions.slice(0, 50)) {
    const raw = readRawFiles(session.source.paths);
    const bundleBuf = encodeSession(session, raw);
    const tampered = Buffer.from(bundleBuf);
    tampered[Math.min(20, tampered.length - 1)] ^= 0xff;
    let detected = false;
    try {
      decodeBundle(tampered);
    } catch {
      detected = true;
    }
    rows.push({
      run_id: runId,
      session_id: session.id,
      provider: session.provider,
      original_bytes: Object.values(raw).reduce(
        (sum, file) => sum + Buffer.byteLength(file.content),
        0,
      ),
      bundle_bytes: bundleBuf.length,
      compression_ratio: "",
      export_ms: "",
      import_ms: "",
      checksum_verify_ms: "",
      round_trip_ok: false,
      raw_hash_match: false,
      corruption_detected: detected,
      scenario: "random-byte-corruption",
      seed,
    });

    // Explicit checksum mismatch
    const { gunzipSync, gzipSync } = await import("node:zlib");
    const json = JSON.parse(gunzipSync(bundleBuf).toString("utf8")) as { checksum: string };
    json.checksum = sha256("bad");
    const badChecksum = gzipSync(Buffer.from(JSON.stringify(json), "utf8"));
    let checksumDetected = false;
    try {
      decodeBundle(badChecksum);
    } catch {
      checksumDetected = true;
    }
    rows.push({
      run_id: runId,
      session_id: session.id,
      provider: session.provider,
      original_bytes: "",
      bundle_bytes: badChecksum.length,
      compression_ratio: "",
      export_ms: "",
      import_ms: "",
      checksum_verify_ms: "",
      round_trip_ok: false,
      raw_hash_match: false,
      corruption_detected: checksumDetected,
      scenario: "incorrect-checksum",
      seed,
    });
  }

  writeCsv(join(resultsRoot, "portability.csv"), rows);
  const clean = rows.filter((r) => r.scenario === "clean-roundtrip");
  const ok = clean.filter((r) => r.round_trip_ok && r.raw_hash_match).length;
  console.log(
    `Portability clean round-trips: ${ok}/${clean.length}; total rows=${rows.length}`,
  );
  console.log(`Wrote ${join(resultsRoot, "portability.csv")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
