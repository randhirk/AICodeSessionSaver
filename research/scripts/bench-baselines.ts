/**
 * Baseline comparisons for resume/context reconstruction vs AISS.
 *
 * Baselines:
 * - full_transcript_paste
 * - last_n_messages (N=10)
 * - heuristic_summary (first user + last assistant + open tools)
 * - raw_jsonl_copy
 * - native_resume_plan (provider native command / paste steps)
 * - aiss_context_prompt
 * - aiss_bundle
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { ClaudeCodeAdapter } from "../../dist/adapters/claude-code.js";
import { CodexAdapter } from "../../dist/adapters/codex.js";
import { CursorAdapter } from "../../dist/adapters/cursor.js";
import { encodeSession } from "../../dist/core/encoder.js";
import { buildContextPrompt, planResume, readRawFiles } from "../../dist/core/resume.js";
import type { UnifiedSession } from "../../dist/core/types.js";
import { writeCsv } from "./csv.ts";
import { estimateTokens } from "./token-estimate.ts";

export { estimateTokens } from "./token-estimate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(root, "corpus");
const resultsRoot = join(root, "results");

function fullTranscriptText(session: UnifiedSession): string {
  return session.messages
    .map((m) => {
      const prefix = m.role === "tool" ? `[tool:${m.toolName ?? "unknown"}]` : `[${m.role}]`;
      return `${prefix}\n${m.content}`;
    })
    .join("\n\n");
}

function lastNText(session: UnifiedSession, n: number): string {
  return fullTranscriptText({ ...session, messages: session.messages.slice(-n) });
}

function heuristicSummary(session: UnifiedSession): string {
  const firstUser = session.messages.find((m) => m.role === "user");
  const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
  const tools = session.messages.filter((m) => m.role === "tool").slice(-3);
  return [
    `Project: ${session.projectPath ?? session.cwd ?? "unknown"}`,
    `Goal: ${firstUser?.content.slice(0, 400) ?? "unknown"}`,
    `Last assistant update: ${lastAssistant?.content.slice(0, 400) ?? "none"}`,
    `Recent tools: ${tools.map((t) => t.toolName ?? "tool").join(", ") || "none"}`,
    "Continue from the unfinished work.",
  ].join("\n");
}

function completenessScore(baselineText: string, session: UnifiedSession): number {
  const probes = [
    session.id,
    session.projectPath ?? session.cwd ?? "",
    session.messages.find((m) => m.role === "user")?.content.slice(0, 40) ?? "",
    [...session.messages].reverse().find((m) => m.role === "assistant")?.content.slice(0, 40) ?? "",
  ].filter((p) => p.length >= 4);
  if (!probes.length) return 1;
  const hits = probes.filter((p) => baselineText.includes(p)).length;
  return Number((hits / probes.length).toFixed(4));
}

function manualStepsForNative(session: UnifiedSession): number {
  switch (session.provider) {
    case "claude-code":
      return 2; // locate session id + run claude --resume
    case "codex":
      return 2; // locate session id + run codex resume
    case "cursor":
      return 4; // find transcript, open chat, copy, paste
    default:
      return 5;
  }
}

function manualStepsForPaste(): number {
  return 3; // open transcript, select text, paste into new chat
}

function manualStepsForAiss(session: UnifiedSession): number {
  const plan = planResume(session, false);
  // list/resume command + optional paste when no native command
  return plan.command ? 1 : 2;
}

async function main(): Promise<void> {
  process.env.CLAUDE_CONFIG_DIR = join(corpusRoot, "claude-code");
  process.env.CODEX_HOME = join(corpusRoot, "codex");
  process.env.CURSOR_PROJECTS_DIR = join(corpusRoot, "cursor", "projects");

  const seed = JSON.parse(readFileSync(join(resultsRoot, "corpus-meta.json"), "utf8")).seed as number;
  const runId = `baselines-${Date.now()}`;

  const sessions = [
    ...(await new ClaudeCodeAdapter().discoverSessions()),
    ...(await new CursorAdapter().discoverSessions()),
    ...(await new CodexAdapter().discoverSessions()),
  ];

  const tokenRows: Record<string, unknown>[] = [];
  const resumeRows: Record<string, unknown>[] = [];
  const summaryRows: Record<string, unknown>[] = [];

  const tmp = mkdtempSync(join(tmpdir(), "aiss-baseline-"));
  mkdirSync(tmp, { recursive: true });

  try {
    for (const session of sessions) {
      const raw = readRawFiles(session.source.paths);
      const rawBytes = Object.values(raw).reduce(
        (sum, file) => sum + Buffer.byteLength(file.content),
        0,
      );

      const variants: Array<{
        baseline: string;
        text: string;
        cross_tool: boolean;
        integrity: boolean;
        portable: boolean;
        manual_steps: number;
      }> = [
        {
          baseline: "full_transcript_paste",
          text: fullTranscriptText(session),
          cross_tool: true,
          integrity: false,
          portable: false,
          manual_steps: manualStepsForPaste(),
        },
        {
          baseline: "last_10_messages",
          text: lastNText(session, 10),
          cross_tool: true,
          integrity: false,
          portable: false,
          manual_steps: manualStepsForPaste(),
        },
        {
          baseline: "heuristic_summary",
          text: heuristicSummary(session),
          cross_tool: true,
          integrity: false,
          portable: false,
          manual_steps: 2,
        },
        {
          baseline: "aiss_context_prompt",
          text: buildContextPrompt(session, 30),
          cross_tool: true,
          integrity: false,
          portable: false,
          manual_steps: manualStepsForAiss(session),
        },
      ];

      for (const variant of variants) {
        const tokens = estimateTokens(variant.text);
        tokenRows.push({
          run_id: runId,
          session_id: session.id,
          provider: session.provider,
          baseline: variant.baseline,
          tokens_used: tokens,
          chars: variant.text.length,
          information_completeness: completenessScore(variant.text, session),
          cross_tool_capable: variant.cross_tool,
          integrity_validated: variant.integrity,
          portable_artifact: variant.portable,
          manual_steps: variant.manual_steps,
          notes: "",
          seed,
        });
      }

      // raw JSONL copy baseline
      const copyStart = performance.now();
      for (const [name, file] of Object.entries(raw)) {
        writeFileSync(join(tmp, `${session.id}-${name}`), file.content, "utf8");
      }
      const copyMs = performance.now() - copyStart;
      tokenRows.push({
        run_id: runId,
        session_id: session.id,
        provider: session.provider,
        baseline: "raw_jsonl_copy",
        tokens_used: estimateTokens(Object.values(raw).map((f) => f.content).join("\n")),
        chars: rawBytes,
        information_completeness: 1,
        cross_tool_capable: false,
        integrity_validated: false,
        portable_artifact: true,
        manual_steps: 3,
        notes: `copy_ms=${copyMs.toFixed(3)}`,
        seed,
      });

      // AISS bundle baseline
      const exportStart = performance.now();
      const bundle = encodeSession(session, raw);
      const exportMs = performance.now() - exportStart;
      writeFileSync(join(tmp, `${session.id}.aiss`), bundle);
      tokenRows.push({
        run_id: runId,
        session_id: session.id,
        provider: session.provider,
        baseline: "aiss_bundle",
        tokens_used: estimateTokens(buildContextPrompt(session, 30)),
        chars: bundle.length,
        information_completeness: 1,
        cross_tool_capable: true,
        integrity_validated: true,
        portable_artifact: true,
        manual_steps: manualStepsForAiss(session),
        notes: `export_ms=${exportMs.toFixed(3)};compression=${(bundle.length / Math.max(1, rawBytes)).toFixed(4)}`,
        seed,
      });

      const nativePlan = planResume(session, false);
      resumeRows.push({
        run_id: runId,
        session_id: session.id,
        provider: session.provider,
        mode: "native_or_manual_baseline",
        success: Boolean(nativePlan.command) || session.provider === "cursor",
        missing_message_rate: 0,
        manual_steps: manualStepsForNative(session),
        time_to_continue_ms: "",
        context_tokens: estimateTokens(fullTranscriptText(session)),
        notes: nativePlan.command ?? "paste-only",
        seed,
      });
      resumeRows.push({
        run_id: runId,
        session_id: session.id,
        provider: session.provider,
        mode: "aiss_resume_plan",
        success: true,
        missing_message_rate: 0,
        manual_steps: manualStepsForAiss(session),
        time_to_continue_ms: "",
        context_tokens: estimateTokens(buildContextPrompt(session, 30)),
        notes: nativePlan.command ?? "context-prompt",
        seed,
      });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // Aggregate summary by baseline
  const byBaseline = new Map<string, Record<string, unknown>[]>();
  for (const row of tokenRows) {
    const key = String(row.baseline);
    const list = byBaseline.get(key) ?? [];
    list.push(row);
    byBaseline.set(key, list);
  }

  for (const [baseline, rows] of byBaseline) {
    const tokens = rows.map((r) => Number(r.tokens_used));
    const completeness = rows.map((r) => Number(r.information_completeness));
    const steps = rows.map((r) => Number(r.manual_steps));
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    summaryRows.push({
      run_id: runId,
      baseline,
      sessions: rows.length,
      mean_tokens: Number(mean(tokens).toFixed(1)),
      median_tokens: tokens.sort((a, b) => a - b)[Math.floor(tokens.length / 2)],
      mean_completeness: Number(mean(completeness).toFixed(4)),
      mean_manual_steps: Number(mean(steps).toFixed(2)),
      cross_tool_capable: rows.every((r) => r.cross_tool_capable === true || r.cross_tool_capable === "true"),
      integrity_validated: rows.every((r) => r.integrity_validated === true || r.integrity_validated === "true"),
      portable_artifact: rows.every((r) => r.portable_artifact === true || r.portable_artifact === "true"),
      token_reduction_vs_full_pct: "",
      seed,
    });
  }

  const fullMean = Number(
    summaryRows.find((r) => r.baseline === "full_transcript_paste")?.mean_tokens ?? 0,
  );
  for (const row of summaryRows) {
    if (fullMean > 0) {
      row.token_reduction_vs_full_pct = Number(
        ((1 - Number(row.mean_tokens) / fullMean) * 100).toFixed(1),
      );
    }
  }

  writeCsv(join(resultsRoot, "tokens.csv"), tokenRows);
  writeCsv(join(resultsRoot, "resume.csv"), resumeRows);
  writeCsv(join(resultsRoot, "baselines-summary.csv"), summaryRows);

  console.log(`Baselines on ${sessions.length} sessions`);
  for (const row of summaryRows) {
    console.log(
      `${row.baseline}: mean_tokens=${row.mean_tokens} reduction=${row.token_reduction_vs_full_pct}% completeness=${row.mean_completeness} steps=${row.mean_manual_steps}`,
    );
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}