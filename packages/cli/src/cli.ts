#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { AuditStore } from "@ailogtrace/core";
import { dbPath, spoolDir } from "./paths.js";
import { ingestAll } from "./collector.js";
import { statusReport, dumpSession } from "./commands/report.js";
import { writeInit } from "./commands/init.js";
import { startUi } from "./ui/server.js";

function openStore(): AuditStore {
  const store = new AuditStore(dbPath());
  ingestAll(store, spoolDir()); // drain spool before any read
  return store;
}

// plugin root = three levels up from packages/cli/dist/cli.js
function pluginRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

const program = new Command();
program.name("ailogtrace").description("Flight recorder for AI-assisted development").version("0.1.0");

program.command("init").description("install Claude Code hooks into the current project")
  .action(() => {
    const file = writeInit(process.cwd(), pluginRoot());
    console.log(`Hooks installed → ${file}`);
  });

program.command("status").description("show recording state and counts")
  .action(() => { const s = openStore(); console.log(statusReport(s)); s.close(); });

program.command("dump").description("replay a session's event stream")
  .option("--session <id>", "session id (defaults to latest)")
  .action((opts: { session?: string }) => { const s = openStore(); console.log(dumpSession(s, opts.session)); s.close(); });

program.command("verify").description("recompute the hash chain")
  .action(() => {
    const s = openStore();
    const r = s.verify();
    console.log(r.ok ? "chain intact ✓" : `chain BROKEN at rowid ${r.brokenAtRowid} ✗`);
    s.close();
    if (!r.ok) process.exitCode = 1;
  });

program.command("export").description("export a session report (MD/JSON)")
  .action(() => {
    // V1: render Markdown (summary, timeline, redaction appendix, methodology) + JSON + Mermaid graph.
    console.log("export: not yet implemented (V1). Use `dump` for now.");
  });

program.command("ui").description("serve the local dashboard")
  .option("--port <n>", "port", "4477")
  .action(async (opts: { port: string }) => { await startUi(Number(opts.port)); });

program.parseAsync();
