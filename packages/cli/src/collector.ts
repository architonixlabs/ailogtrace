import { readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AuditStore } from "@ailogtrace/core";
import { normalize, type SpoolLine } from "./normalize.js";

export function ingestSpoolFile(store: AuditStore, filePath: string): number {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  let n = 0;
  for (const raw of lines) {
    let parsed: SpoolLine;
    try {
      parsed = JSON.parse(raw) as SpoolLine;
    } catch {
      continue; // skip malformed line, keep going
    }
    store.append(normalize(parsed));
    n++;
  }
  rmSync(filePath, { force: true });
  return n;
}

export function ingestAll(store: AuditStore, dir: string): number {
  let total = 0;
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".ndjson"));
  } catch {
    return 0; // no spool dir yet
  }
  for (const f of files) total += ingestSpoolFile(store, join(dir, f));
  return total;
}
