import { AuditStore } from "@ailogtrace/core";

export function statusReport(store: AuditStore): string {
  const sessions = store.listSessions();
  const events = store.count();
  const verify = store.verify();
  return [
    `AILogTrace status`,
    `  ${sessions.length} session(s), ${events} events`,
    `  chain: ${verify.ok ? "intact" : `BROKEN at rowid ${verify.brokenAtRowid}`}`,
  ].join("\n");
}

export function dumpSession(store: AuditStore, sessionId?: string): string {
  const sid = sessionId ?? store.listSessions()[0]?.sessionId;
  if (!sid) return "(no sessions recorded)";
  const events = store.getEvents(sid);
  const lines = events.map(
    (e) => `#${e.seq.toString().padStart(3, "0")} ${e.ts} ${e.kind}` +
      (e.redactions.length ? ` [redacted:${e.redactions.reduce((n, r) => n + r.count, 0)}]` : ""),
  );
  return [`Session ${sid} — ${events.length} events`, ...lines].join("\n");
}
