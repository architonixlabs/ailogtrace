#!/usr/bin/env node
import { homedir } from "node:os";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spool } from "./spool.js";
async function readStdin() {
    const chunks = [];
    for await (const c of process.stdin)
        chunks.push(c);
    return Buffer.concat(chunks).toString("utf8");
}
async function main() {
    const kind = process.argv[2] ?? "unknown";
    try {
        const raw = await readStdin();
        spool(kind, raw, homedir());
    }
    catch (err) {
        try {
            const dir = join(homedir(), ".ailogtrace", "logs");
            mkdirSync(dir, { recursive: true });
            appendFileSync(join(dir, "hook-errors.log"), `${new Date().toISOString()} ${kind} ${String(err)}\n`);
        }
        catch {
            /* swallow — never surface to the agent */
        }
    }
    process.exit(0);
}
void main();
