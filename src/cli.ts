#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { decodeBundle, decodeFromBase64, encodeSession, encodeToBase64 } from "./core/encoder.js";
import { SessionIndex } from "./core/index-db.js";
import { planResume } from "./core/resume.js";
import { findSession, syncSessions } from "./core/sync.js";
import type { Provider } from "./core/types.js";
import { getAvailableAdapters } from "./adapters/registry.js";
import { startWatcher } from "./watch/watcher.js";

const program = new Command();

program
  .name("aiss")
  .description("AI Code Session Saver — capture, index, encode, and resume AI CLI sessions")
  .version("0.1.0");

program
  .command("sync")
  .description("Scan installed AI CLIs and index all sessions")
  .action(async () => {
    const result = await syncSessions();
    console.log(`Discovered ${result.discovered} sessions, indexed ${result.indexed}, updated ${result.updated}`);
  });

program
  .command("watch")
  .description("Watch AI CLI transcript folders and auto-sync sessions")
  .action(async () => {
    const adapters = getAvailableAdapters();
    if (!adapters.length) {
      console.error("No supported AI CLI data directories found.");
      process.exit(1);
    }
    console.log("Watching:", adapters.map((a) => a.name).join(", "));
    await startWatcher();
  });

program
  .command("list")
  .description("List indexed sessions")
  .option("-p, --provider <provider>", "Filter by provider")
  .option("--project <path>", "Filter by project path")
  .option("-n, --limit <number>", "Max results", "20")
  .action((options: { provider?: Provider; project?: string; limit: string }) => {
    const index = new SessionIndex();
    const rows = index.list({
      provider: options.provider,
      project: options.project,
      limit: Number(options.limit),
    });
    index.close();

    if (!rows.length) {
      console.log("No sessions indexed yet. Run: aiss sync");
      return;
    }

    for (const row of rows) {
      const project = row.projectPath ? ` | ${row.projectPath}` : "";
      console.log(
        `${row.id.slice(0, 8)}  ${row.provider.padEnd(12)}  ${row.messageCount} msgs  ${row.title}${project}`,
      );
    }
  });

program
  .command("show <id>")
  .description("Show session details")
  .option("-p, --provider <provider>", "Provider if id is ambiguous")
  .action(async (id: string, options: { provider?: Provider }) => {
    const result = await syncSessions();
    const session = findSession(result.sessions, id);
    if (!session) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }
    if (options.provider && session.provider !== options.provider) {
      console.error(`Session provider mismatch (expected ${options.provider})`);
      process.exit(1);
    }
    console.log(JSON.stringify(session, null, 2));
  });

program
  .command("export <id>")
  .description("Export a session as a portable .aiss bundle")
  .option("-o, --output <file>", "Output file path")
  .option("--base64", "Print base64-encoded bundle to stdout")
  .action(async (id: string, options: { output?: string; base64?: boolean }) => {
    const index = new SessionIndex();
    const result = await syncSessions(index);
    const session = findSession(result.sessions, id);
    if (!session) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }

    if (options.base64) {
      console.log(encodeToBase64(session));
      return;
    }

    const output = options.output ?? `${session.provider}-${session.id.slice(0, 8)}.aiss`;
    const bundle = encodeSession(session);
    writeFileSync(output, bundle);
    console.log(`Exported to ${output}`);
  });

program
  .command("import <file>")
  .description("Import a .aiss bundle into the local index")
  .action(async (file: string) => {
    const buffer = readFileSync(file);
    const bundle = decodeBundle(buffer);
    const index = new SessionIndex();
    index.upsert(bundle.session, file);
    index.close();
    console.log(`Imported ${bundle.session.provider} session ${bundle.session.id}`);
  });

program
  .command("decode <input>")
  .description("Decode a .aiss file or base64 string and print JSON")
  .option("--base64", "Input is base64 text")
  .action((input: string, options: { base64?: boolean }) => {
    const bundle = options.base64 ? decodeFromBase64(input) : decodeBundle(readFileSync(input));
    console.log(JSON.stringify(bundle.session, null, 2));
  });

program
  .command("resume <id>")
  .description("Generate resume steps for a session")
  .option("--apply", "Restore native session files where supported (Claude Code)")
  .option("--context-out <file>", "Write context prompt to file")
  .action(async (id: string, options: { apply?: boolean; contextOut?: string }) => {
    const result = await syncSessions();
    const session = findSession(result.sessions, id);
    if (!session) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }

    const plan = planResume(session, options.apply);

    for (const step of plan.steps) {
      console.log(`• ${step}`);
    }

    if (plan.command) {
      console.log(`\nCommand:\n  ${plan.command}`);
    }

    if (options.contextOut && plan.contextPrompt) {
      writeFileSync(options.contextOut, plan.contextPrompt);
      console.log(`\nContext prompt written to ${options.contextOut}`);
    } else if (plan.contextPrompt && session.provider !== "claude-code") {
      console.log("\n--- Context prompt (paste into new chat) ---\n");
      console.log(plan.contextPrompt);
    }
  });

program
  .command("providers")
  .description("List detected AI CLI providers")
  .action(() => {
    const adapters = getAvailableAdapters();
    if (!adapters.length) {
      console.log("No providers detected.");
      return;
    }
    for (const adapter of adapters) {
      console.log(`${adapter.provider.padEnd(14)} ${adapter.name}`);
      for (const path of adapter.watchPaths()) {
        console.log(`  └─ ${path}`);
      }
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
