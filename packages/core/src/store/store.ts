import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncCtor } from "node:sqlite";
import { GENESIS_HASH, hashEvent } from "./hash.js";
import { AiEvent, type Redaction } from "../schema/event.js";

// Load node:sqlite via createRequire so bundlers/test runners (vite-node) that do
// not yet recognize this newer builtin cannot rewrite the specifier. At real Node
// runtime this is equivalent to a static `import ... from "node:sqlite"`.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSyncCtor>;

export interface AppendInput {
  id: string;
  sessionId: string;
  ts: string;
  source: AiEvent["source"];
  kind: AiEvent["kind"];
  payload: Record<string, unknown>;
  agent?: AiEvent["agent"];
  redactions?: Redaction[];
  provenance?: AiEvent["provenance"];
}

interface Row {
  id: string; sessionId: string; seq: number; ts: string; source: string;
  kind: string; agent: string | null; payload: string; redactions: string;
  provenance: string; prevHash: string; hash: string; rowid: number;
}

export class AuditStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL, sessionId TEXT NOT NULL, seq INTEGER NOT NULL,
        ts TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
        agent TEXT, payload TEXT NOT NULL, redactions TEXT NOT NULL,
        provenance TEXT NOT NULL, prevHash TEXT NOT NULL, hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(sessionId, seq);
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;
    `);
  }

  private lastHash(): string {
    const row = this.db.prepare("SELECT hash FROM events ORDER BY rowid DESC LIMIT 1").get() as { hash: string } | undefined;
    return row?.hash ?? GENESIS_HASH;
  }

  private nextSeq(sessionId: string): number {
    const row = this.db.prepare("SELECT MAX(seq) AS m FROM events WHERE sessionId = ?").get(sessionId) as { m: number | null };
    return (row.m ?? -1) + 1;
  }

  append(input: AppendInput): AiEvent {
    const prevHash = this.lastHash();
    const base = {
      id: input.id,
      sessionId: input.sessionId,
      seq: this.nextSeq(input.sessionId),
      ts: input.ts,
      source: input.source,
      kind: input.kind,
      agent: input.agent,
      payload: input.payload,
      redactions: input.redactions ?? [],
      provenance: input.provenance ?? "observed",
      prevHash,
    };
    const hash = hashEvent(prevHash, base);
    const event = AiEvent.parse({ ...base, hash });
    this.db.prepare(`
      INSERT INTO events (id, sessionId, seq, ts, source, kind, agent, payload, redactions, provenance, prevHash, hash)
      VALUES (@id, @sessionId, @seq, @ts, @source, @kind, @agent, @payload, @redactions, @provenance, @prevHash, @hash)
    `).run({
      id: event.id, sessionId: event.sessionId, seq: event.seq, ts: event.ts,
      source: event.source, kind: event.kind,
      agent: event.agent ? JSON.stringify(event.agent) : null,
      payload: JSON.stringify(event.payload),
      redactions: JSON.stringify(event.redactions),
      provenance: event.provenance, prevHash: event.prevHash, hash: event.hash,
    });
    return event;
  }

  private rowToEvent(r: Row): AiEvent {
    return AiEvent.parse({
      id: r.id, sessionId: r.sessionId, seq: r.seq, ts: r.ts,
      source: r.source, kind: r.kind,
      agent: r.agent ? JSON.parse(r.agent) : undefined,
      payload: JSON.parse(r.payload),
      redactions: JSON.parse(r.redactions),
      provenance: r.provenance, prevHash: r.prevHash, hash: r.hash,
    });
  }

  getEvents(sessionId: string): AiEvent[] {
    const rows = this.db.prepare("SELECT * FROM events WHERE sessionId = ? ORDER BY seq ASC").all(sessionId) as unknown as Row[];
    return rows.map((r) => this.rowToEvent(r));
  }

  listSessions(): { sessionId: string; count: number; startedAt: string; endedAt: string }[] {
    return this.db.prepare(`
      SELECT sessionId, COUNT(*) AS count, MIN(ts) AS startedAt, MAX(ts) AS endedAt
      FROM events GROUP BY sessionId ORDER BY startedAt DESC
    `).all() as unknown as { sessionId: string; count: number; startedAt: string; endedAt: string }[];
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;
  }

  verify(): { ok: boolean; brokenAtRowid?: number } {
    const rows = this.db.prepare("SELECT * FROM events ORDER BY rowid ASC").all() as unknown as Row[];
    let prev = GENESIS_HASH;
    for (const r of rows) {
      const base = {
        id: r.id, sessionId: r.sessionId, seq: r.seq, ts: r.ts,
        source: r.source, kind: r.kind,
        agent: r.agent ? JSON.parse(r.agent) : undefined,
        payload: JSON.parse(r.payload),
        redactions: JSON.parse(r.redactions),
        provenance: r.provenance, prevHash: r.prevHash,
      };
      const expected = hashEvent(prev, base);
      if (r.prevHash !== prev || r.hash !== expected) return { ok: false, brokenAtRowid: r.rowid };
      prev = r.hash;
    }
    return { ok: true };
  }

  close(): void {
    this.db.close();
  }
}
