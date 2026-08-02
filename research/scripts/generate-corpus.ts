/**
 * Generate a synthetic multi-provider session corpus for paper experiments.
 *
 * Usage:
 *   npx tsx research/scripts/generate-corpus.ts --count 30 --seed 42
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { platform } from "node:os";
import { mulberry32, parseArgs, writeCsv } from "./csv.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(root, "corpus");
const resultsRoot = join(root, "results");

const PROJECTS = [
  { id: "demo-ts", language: "TypeScript", path: "/Users/research/demo-ts" },
  { id: "demo-py", language: "Python", path: "/Users/research/demo-py" },
  { id: "demo-swift", language: "Swift", path: "/Users/research/demo-swift" },
  { id: "demo-java", language: "Java", path: "/Users/research/demo-java" },
  { id: "demo-go", language: "Go", path: "/Users/research/demo-go" },
] as const;

const SIZE_BUCKETS = ["short", "medium", "long"] as const;

function hashPath(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, "-");
}

function cursorDirName(path: string): string {
  return path.replace(/^\//, "").replace(/\//g, "-");
}

function messageCountForBucket(bucket: (typeof SIZE_BUCKETS)[number], rand: () => number): number {
  if (bucket === "short") return 4 + Math.floor(rand() * 4);
  if (bucket === "medium") return 12 + Math.floor(rand() * 12);
  return 40 + Math.floor(rand() * 40);
}

function writeClaudeSession(opts: {
  id: string;
  projectPath: string;
  model: string;
  messages: number;
  orphaned: boolean;
}): { bytes: number; toolCalls: number; path: string } {
  const projectDir = join(
    corpusRoot,
    "claude-code",
    "projects",
    hashPath(opts.projectPath),
  );
  mkdirSync(projectDir, { recursive: true });
  const path = join(projectDir, `${opts.id}.jsonl`);
  const lines: string[] = [];
  let toolCalls = 0;
  for (let i = 0; i < opts.messages; i += 1) {
    if (i % 3 === 0) {
      lines.push(
        JSON.stringify({
          type: "user",
          message: { content: `Synthetic task step ${i} for ${opts.id}` },
          timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, i)).toISOString(),
          sessionId: opts.orphaned ? undefined : opts.id,
          cwd: opts.projectPath,
          model: opts.model,
        }),
      );
    } else if (i % 3 === 1) {
      lines.push(
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: `Working on step ${i}` }] },
          timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, i)).toISOString(),
          sessionId: opts.id,
          cwd: opts.projectPath,
          model: opts.model,
        }),
      );
    } else {
      toolCalls += 1;
      lines.push(
        JSON.stringify({
          type: "tool_use",
          tool: "Read",
          input: { path: `src/file-${i}.ts` },
          timestamp: new Date(Date.UTC(2025, 0, 15, 10, 0, i)).toISOString(),
          sessionId: opts.id,
        }),
      );
    }
  }
  const content = `${lines.join("\n")}\n`;
  writeFileSync(path, content, "utf8");
  return { bytes: Buffer.byteLength(content), toolCalls, path };
}

function writeCodexSession(opts: {
  id: string;
  projectPath: string;
  model: string;
  messages: number;
  parentId?: string;
}): { bytes: number; toolCalls: number; path: string } {
  const dir = join(corpusRoot, "codex", "sessions", "2025", "01", "15");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `rollout-${opts.id}.jsonl`);
  const lines: string[] = [
    JSON.stringify({
      type: "session_meta",
      session_meta: {
        id: opts.id,
        cwd: opts.projectPath,
        parent_thread_id: opts.parentId,
      },
      timestamp: "2025-01-15T10:00:00.000Z",
    }),
    JSON.stringify({
      type: "turn_context",
      turn_context: { model: opts.model },
      timestamp: "2025-01-15T10:00:01.000Z",
    }),
  ];
  let toolCalls = 0;
  for (let i = 0; i < opts.messages; i += 1) {
    if (i % 3 === 0) {
      lines.push(
        JSON.stringify({
          type: "event_msg",
          event_msg: {
            type: "user_message",
            user_message: { message: `Codex task ${i} for ${opts.id}` },
          },
          timestamp: new Date(Date.UTC(2025, 0, 15, 11, 0, i)).toISOString(),
        }),
      );
    } else if (i % 3 === 1) {
      lines.push(
        JSON.stringify({
          type: "event_msg",
          event_msg: {
            type: "agent_message",
            agent_message: { message: `Codex reply ${i}` },
          },
          timestamp: new Date(Date.UTC(2025, 0, 15, 11, 0, i)).toISOString(),
        }),
      );
    } else {
      toolCalls += 1;
      lines.push(
        JSON.stringify({
          type: "response_item",
          response_item: {
            type: "function_call",
            name: "read_file",
            input: { path: `lib/mod-${i}.ts` },
          },
          timestamp: new Date(Date.UTC(2025, 0, 15, 11, 0, i)).toISOString(),
        }),
      );
    }
  }
  const content = `${lines.join("\n")}\n`;
  writeFileSync(path, content, "utf8");
  return { bytes: Buffer.byteLength(content), toolCalls, path };
}

function writeCursorSession(opts: {
  id: string;
  projectPath: string;
  messages: number;
}): { bytes: number; toolCalls: number; path: string } {
  const dir = join(
    corpusRoot,
    "cursor",
    "projects",
    cursorDirName(opts.projectPath),
    "agent-transcripts",
    opts.id,
  );
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${opts.id}.jsonl`);
  const lines: string[] = [];
  for (let i = 0; i < opts.messages; i += 1) {
    const role = i % 2 === 0 ? "user" : "assistant";
    lines.push(
      JSON.stringify({
        role,
        message: {
          content: [
            {
              type: "text",
              text:
                role === "user"
                  ? `<user_query>Cursor task ${i} for ${opts.id}</user_query>`
                  : `Cursor reply ${i}`,
            },
          ],
        },
        timestamp: new Date(Date.UTC(2025, 0, 15, 12, 0, i)).toISOString(),
      }),
    );
  }
  const content = `${lines.join("\n")}\n`;
  writeFileSync(path, content, "utf8");
  return { bytes: Buffer.byteLength(content), toolCalls: 0, path };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const count = Number(args.count ?? "30");
  const seed = Number(args.seed ?? "42");
  const rand = mulberry32(seed);

  rmSync(corpusRoot, { recursive: true, force: true });
  mkdirSync(corpusRoot, { recursive: true });
  mkdirSync(resultsRoot, { recursive: true });

  const rows: Record<string, unknown>[] = [];
  const providers = ["claude-code", "cursor", "codex"] as const;

  for (const provider of providers) {
    for (let i = 0; i < count; i += 1) {
      const project = PROJECTS[i % PROJECTS.length]!;
      const bucket = SIZE_BUCKETS[i % SIZE_BUCKETS.length]!;
      const messages = messageCountForBucket(bucket, rand);
      const orphaned = provider === "claude-code" && i % 17 === 0;
      const id = `${provider}-${String(i).padStart(4, "0")}`;
      const parentId =
        provider === "codex" && i % 11 === 0 ? `codex-parent-${String(i).padStart(4, "0")}` : undefined;

      let bytes = 0;
      let toolCalls = 0;
      if (provider === "claude-code") {
        ({ bytes, toolCalls } = writeClaudeSession({
          id,
          projectPath: project.path,
          model: "claude-sonnet-4",
          messages,
          orphaned,
        }));
      } else if (provider === "codex") {
        ({ bytes, toolCalls } = writeCodexSession({
          id,
          projectPath: project.path,
          model: "gpt-5",
          messages,
          parentId,
        }));
      } else {
        ({ bytes, toolCalls } = writeCursorSession({
          id,
          projectPath: project.path,
          messages,
        }));
      }

      rows.push({
        session_id: id,
        provider,
        provider_version: "synthetic-1",
        operating_system: platform(),
        project_id: project.id,
        project_language: project.language,
        raw_file_count: 1,
        raw_session_bytes: bytes,
        message_count: messages,
        tool_call_count: toolCalls,
        session_duration_sec: messages * 5,
        parent_session_id: parentId ?? "",
        child_session_count: 0,
        orphaned_session: orphaned,
        expected_to_be_discovered: true,
        actually_discovered: "",
        parse_success: "",
        normalization_success: "",
        size_bucket: bucket,
        seed,
      });
    }
  }

  // Add a few malformed / empty negatives for discovery false-positive checks.
  const junkDir = join(corpusRoot, "claude-code", "projects", "-Users-research-junk");
  mkdirSync(junkDir, { recursive: true });
  writeFileSync(join(junkDir, "empty.jsonl"), "", "utf8");
  writeFileSync(join(junkDir, "malformed.jsonl"), "not-json\n{bad\n", "utf8");

  writeCsv(join(resultsRoot, "sessions.csv"), rows);
  writeFileSync(
    join(resultsRoot, "corpus-meta.json"),
    JSON.stringify(
      {
        seed,
        countPerProvider: count,
        totalSessions: rows.length,
        generatedAt: new Date().toISOString(),
        corpusRoot,
        os: platform(),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `Generated ${rows.length} synthetic sessions (count=${count}/provider, seed=${seed})`,
  );
  console.log(`Corpus: ${corpusRoot}`);
  console.log(`Catalog: ${join(resultsRoot, "sessions.csv")}`);
}

main();
