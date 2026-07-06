import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export function toSpoolLine(kind, raw) {
    let hook = {};
    try {
        hook = raw.trim() ? JSON.parse(raw) : {};
    }
    catch {
        hook = { raw };
    }
    const h = hook;
    const sessionId = h.session_id || h.sessionId || "unknown";
    return JSON.stringify({ ts: new Date().toISOString(), kind, sessionId, hook }) + "\n";
}
export function spool(kind, raw, homeDir) {
    const line = toSpoolLine(kind, raw);
    const sessionId = JSON.parse(line).sessionId;
    const dir = join(homeDir, ".ailogtrace", "spool");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${sessionId}.ndjson`), line);
}
