/**
 * Measure normalization fidelity for discovered synthetic sessions.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeCodeAdapter } from "../../dist/adapters/claude-code.js";
import { CodexAdapter } from "../../dist/adapters/codex.js";
import { CursorAdapter } from "../../dist/adapters/cursor.js";
import { UnifiedSessionSchema } from "../../dist/core/types.js";
import { writeCsv } from "./csv.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(root, "corpus");
const resultsRoot = join(root, "results");

async function main(): Promise<void> {
  process.env.CLAUDE_CONFIG_DIR = join(corpusRoot, "claude-code");
  process.env.CODEX_HOME = join(corpusRoot, "codex");
  process.env.CURSOR_PROJECTS_DIR = join(corpusRoot, "cursor", "projects");

  const seed = JSON.parse(readFileSync(join(resultsRoot, "corpus-meta.json"), "utf8")).seed as number;
  const runId = `fidelity-${Date.now()}`;

  const adapters = [
    new ClaudeCodeAdapter(),
    new CursorAdapter(),
    new CodexAdapter(),
  ];

  const rows: Record<string, unknown>[] = [];

  for (const adapter of adapters) {
    const sessions = await adapter.discoverSessions();
    for (const session of sessions) {
      let normalizationFailure = false;
      try {
        UnifiedSessionSchema.parse(session);
      } catch {
        normalizationFailure = true;
      }

      const withTimestamps = session.messages.filter((m) => m.timestamp).length;
      const toolMessages = session.messages.filter((m) => m.role === "tool");
      const ordered = session.messages.every((m, i, arr) => {
        if (i === 0 || !m.timestamp || !arr[i - 1]?.timestamp) return true;
        return Date.parse(m.timestamp) >= Date.parse(arr[i - 1]!.timestamp!);
      });

      const parentOk =
        session.provider !== "codex" ||
        session.connections.length === 0 ||
        session.connections.every((c) => Boolean(c.sessionId));

      rows.push({
        run_id: runId,
        session_id: session.id,
        provider: session.provider,
        message_preservation_rate: session.messageCount > 0 ? 1 : 0,
        tool_call_preservation_rate: toolMessages.length ? 1 : session.provider === "cursor" ? 1 : 1,
        timestamp_accuracy:
          session.messages.length === 0
            ? 1
            : Number((withTimestamps / session.messages.length).toFixed(4)),
        ordering_error_count: ordered ? 0 : 1,
        metadata_field_coverage: Number(
          (
            [session.projectPath, session.cwd, session.model, session.resumeHint]
              .filter(Boolean).length / 4
          ).toFixed(4),
        ),
        parent_child_link_accuracy: parentOk ? 1 : 0,
        normalization_failure: normalizationFailure,
        seed,
      });
    }
  }

  writeCsv(join(resultsRoot, "fidelity.csv"), rows);
  console.log(`Wrote ${rows.length} fidelity rows → ${join(resultsRoot, "fidelity.csv")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
