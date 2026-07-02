import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function toSpoolLine(kind: string, raw: string): string {
  let hook: unknown = {};
  try {
    hook = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    hook = { raw };
  }
  const h = hook as Record<string, unknown>;
  const sessionId = (h.session_id as string) || (h.sessionId as string) || "unknown";
  return JSON.stringify({ ts: new Date().toISOString(), kind, sessionId, hook }) + "\n";
}

export function spool(kind: string, raw: string, homeDir: string): void {
  const line = toSpoolLine(kind, raw);
  const sessionId = JSON.parse(line).sessionId as string;
  const dir = join(homeDir, ".ailogtrace", "spool");
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${sessionId}.ndjson`), line);
}
