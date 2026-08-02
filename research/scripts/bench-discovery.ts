/**
 * Measure discovery precision/recall against the labeled synthetic corpus.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeCodeAdapter } from "../../dist/adapters/claude-code.js";
import { CodexAdapter } from "../../dist/adapters/codex.js";
import { CursorAdapter } from "../../dist/adapters/cursor.js";
import { writeCsv } from "./csv.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(root, "corpus");
const resultsRoot = join(root, "results");

function loadExpected(): Array<{ session_id: string; provider: string; orphaned_session: string }> {
  const csv = readFileSync(join(resultsRoot, "sessions.csv"), "utf8").trim().split("\n");
  const headers = csv[0]!.split(",");
  return csv.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return {
      session_id: row.session_id!,
      provider: row.provider!,
      orphaned_session: row.orphaned_session!,
    };
  });
}

async function main(): Promise<void> {
  process.env.CLAUDE_CONFIG_DIR = join(corpusRoot, "claude-code");
  process.env.CODEX_HOME = join(corpusRoot, "codex");
  process.env.CURSOR_PROJECTS_DIR = join(corpusRoot, "cursor", "projects");

  const expected = loadExpected();
  const runId = `discovery-${Date.now()}`;
  const seed = JSON.parse(readFileSync(join(resultsRoot, "corpus-meta.json"), "utf8")).seed as number;

  const adapters = [
    { provider: "claude-code", adapter: new ClaudeCodeAdapter() },
    { provider: "cursor", adapter: new CursorAdapter() },
    { provider: "codex", adapter: new CodexAdapter() },
  ] as const;

  const rows: Record<string, unknown>[] = [];

  for (const { provider, adapter } of adapters) {
    const expectedIds = new Set(
      expected.filter((e) => e.provider === provider).map((e) => e.session_id),
    );
    const orphanedExpected = expected.filter(
      (e) => e.provider === provider && e.orphaned_session === "true",
    ).length;

    const discovered = await adapter.discoverSessions();
    const discoveredIds = new Set(discovered.map((s) => s.id));

    let truePositives = 0;
    for (const id of discoveredIds) {
      if (expectedIds.has(id)) truePositives += 1;
    }
    const falsePositives = [...discoveredIds].filter((id) => !expectedIds.has(id)).length;
    const falseNegatives = [...expectedIds].filter((id) => !discoveredIds.has(id)).length;
    const precision = truePositives / Math.max(1, truePositives + falsePositives);
    const recall = truePositives / Math.max(1, truePositives + falseNegatives);
    const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);

    const orphanedFound = expected
      .filter((e) => e.provider === provider && e.orphaned_session === "true")
      .filter((e) => discoveredIds.has(e.session_id)).length;

    const duplicateRate =
      discovered.length === 0
        ? 0
        : (discovered.length - discoveredIds.size) / discovered.length;

    const incorrectProject =
      discovered.filter((s) => !s.projectPath && !s.cwd).length / Math.max(1, discovered.length);

    rows.push({
      run_id: runId,
      provider,
      expected_count: expectedIds.size,
      discovered_count: discovered.length,
      true_positives: truePositives,
      false_positives: falsePositives,
      false_negatives: falseNegatives,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      orphaned_recovery_rate:
        orphanedExpected === 0 ? 1 : Number((orphanedFound / orphanedExpected).toFixed(4)),
      duplicate_rate: Number(duplicateRate.toFixed(4)),
      incorrect_project_association_rate: Number(incorrectProject.toFixed(4)),
      malformed_rate: 0,
      seed,
    });
  }

  writeCsv(join(resultsRoot, "discovery.csv"), rows);
  console.log(`Wrote ${join(resultsRoot, "discovery.csv")}`);
  for (const row of rows) {
    console.log(
      `${row.provider}: P=${row.precision} R=${row.recall} F1=${row.f1} (expected=${row.expected_count}, found=${row.discovered_count})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
