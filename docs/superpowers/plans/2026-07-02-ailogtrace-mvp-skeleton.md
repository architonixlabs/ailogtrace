# AILogTrace MVP Walking-Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable pnpm monorepo + Claude Code plugin where the event-capture path works end-to-end (hook → spool → canonical Event → hash-chained SQLite → `ailogtrace dump`/`verify`), with redaction wired in and graph/dashboard/export as tested stubs.

**Architecture:** A tiny non-blocking hook spooler appends raw ndjson lines to `~/.ailogtrace/spool/<sessionId>.ndjson`. A collector (in the CLI) normalizes each line into a canonical Event, redacts secrets *before* persistence, and appends to an append-only, SHA-256 hash-chained SQLite store. CLI commands read the store for `dump`/`verify`/`status`; a Fastify read API feeds a minimal React dashboard.

**Tech Stack:** TypeScript (ESM), Node.js 22, pnpm workspaces, zod, better-sqlite3 (WAL), commander, fastify, vitest, React 18 + Vite + Tailwind.

## Global Constraints

- Language: TypeScript, `"type": "module"` (ESM), Node.js 22, `moduleResolution: "bundler"`/`"nodenext"` consistent across packages.
- Package manager: pnpm workspaces. Packages: `packages/core`, `packages/hook`, `packages/cli`, `apps/dashboard`.
- Store path: `~/.ailogtrace/audit.db` (WAL). Spool path: `~/.ailogtrace/spool/<sessionId>.ndjson`. Logs: `~/.ailogtrace/logs/hook-errors.log`. **None of these live in the repo.**
- `events` table is append-only (enforced by SQLite triggers). Tamper-evidence = SHA-256 hash chain; genesis `prevHash` = 64 zeros.
- `hash = sha256(prevHash + canonicalJson(eventWithoutHash))` with stable (sorted-key) canonicalization.
- The hook binary must never throw into the agent: total try/catch, worst case drop one line, exit 0. No heavy work in the hook.
- Redaction runs in the collector **before the first DB write**, fail-closed (a throwing rule masks the whole field).
- Everything captured this session is `provenance: "observed"`. No inferred nodes.
- Test framework: vitest. Every functional task is TDD (failing test first).

---

### Task 1: Monorepo scaffold + Claude Code plugin manifest

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.gitignore` (append), `.claude-plugin/plugin.json`, `hooks/hooks.json`
- Create package manifests: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/hook/package.json`, `packages/hook/tsconfig.json`, `packages/cli/package.json`, `packages/cli/tsconfig.json`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace with `@ailogtrace/core`, `@ailogtrace/hook`, `@ailogtrace/cli` packages; root scripts `build`, `test`, `lint`.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "ailogtrace-monorepo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "tsc -b --pretty"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "ai-log-trace",
  "version": "0.1.0",
  "description": "Flight recorder for AI-assisted development — local-first audit and workflow-trace capture for Claude Code."
}
```

- [ ] **Step 5: Create `hooks/hooks.json`** (wires lifecycle events to the spooler; `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin dir)

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" session_start" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" user_prompt" }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" tool_call_start" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" tool_call_end" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" permission_request" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" subagent_stop" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" final_output" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/packages/hook/dist/index.js\" session_end" }] }]
  }
}
```

> **Note for implementer:** the exact hook event names above (`SessionStart`, `PreToolUse`, `Notification`, etc.) and their stdin payload keys (`session_id`, `hook_event_name`, `tool_name`) must be confirmed against the installed Claude Code hook API before the Task 11 end-to-end run. If a name differs, update this file and the `mapKind` table in Task 8; the mapping is the deliverable, not a guess.

- [ ] **Step 6: Append to `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 7: Create the three package manifests**

`packages/core/package.json`:
```json
{
  "name": "@ailogtrace/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -b", "test": "vitest run" },
  "dependencies": { "zod": "^3.23.0", "better-sqlite3": "^11.3.0" },
  "devDependencies": { "@types/better-sqlite3": "^7.6.0" }
}
```

`packages/hook/package.json`:
```json
{
  "name": "@ailogtrace/hook",
  "version": "0.1.0",
  "type": "module",
  "bin": { "ailogtrace-hook": "dist/index.js" },
  "scripts": { "build": "tsc -b", "test": "vitest run" }
}
```

`packages/cli/package.json`:
```json
{
  "name": "@ailogtrace/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "ailogtrace": "dist/cli.js" },
  "scripts": { "build": "tsc -b", "test": "vitest run" },
  "dependencies": {
    "@ailogtrace/core": "workspace:*",
    "commander": "^12.1.0",
    "fastify": "^5.0.0",
    "@fastify/static": "^8.0.0"
  }
}
```

- [ ] **Step 8: Create each package `tsconfig.json`** (identical shape; repeat for core, hook, cli)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "composite": true },
  "include": ["src"]
}
```

- [ ] **Step 9: Install and verify workspace resolves**

Run: `pnpm install`
Expected: install completes; `packages/*` and `apps/*` linked (apps/dashboard added in Task 10 — a warning there is fine for now).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo + Claude Code plugin manifest"
```

---

### Task 2: Canonical Event schema (`@ailogtrace/core`)

**Files:**
- Create: `packages/core/src/schema/event.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/schema/event.test.ts`

**Interfaces:**
- Produces: `AiEvent` (zod schema + type), `EventKind`, `EventSource` enums, `Redaction`, `AgentInfo`.

- [ ] **Step 1: Write the failing test** — `packages/core/src/schema/event.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { AiEvent } from "./event.js";

const valid = {
  id: "7f9c2a1e-3b4d-4c8a-9e21-aa10f2d4b901",
  sessionId: "sess_1", seq: 0, ts: "2026-07-02T09:47:12.480Z",
  source: "hook", kind: "file_change", payload: { path: "a.ts" },
  prevHash: "0".repeat(64), hash: "a".repeat(64),
};

describe("AiEvent", () => {
  it("accepts a valid event and defaults redactions/provenance", () => {
    const e = AiEvent.parse(valid);
    expect(e.redactions).toEqual([]);
    expect(e.provenance).toBe("observed");
  });
  it("rejects an unknown kind", () => {
    expect(() => AiEvent.parse({ ...valid, kind: "nope" })).toThrow();
  });
  it("rejects a missing required field", () => {
    const { sessionId, ...bad } = valid;
    expect(() => AiEvent.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/core test`
Expected: FAIL — cannot resolve `./event.js`.

- [ ] **Step 3: Write `packages/core/src/schema/event.ts`**

```ts
import { z } from "zod";

export const EventSource = z.enum(["hook", "transcript", "git", "adapter", "user", "system"]);
export type EventSource = z.infer<typeof EventSource>;

export const EventKind = z.enum([
  "session_start", "session_end", "user_prompt", "agent_message",
  "tool_call_start", "tool_call_end", "file_read", "file_change",
  "command_run", "test_result", "permission_request", "approval",
  "rejection", "error", "retry", "subagent_start", "subagent_stop", "final_output",
]);
export type EventKind = z.infer<typeof EventKind>;

export const AgentInfo = z.object({
  name: z.string(),
  version: z.string().optional(),
  model: z.string().optional(),
});

export const Redaction = z.object({
  ruleId: z.string(),
  field: z.string(),
  count: z.number().int(),
});
export type Redaction = z.infer<typeof Redaction>;

export const AiEvent = z.object({
  id: z.string().uuid(),
  sessionId: z.string(),
  seq: z.number().int(),
  ts: z.string(),
  source: EventSource,
  kind: EventKind,
  agent: AgentInfo.optional(),
  payload: z.record(z.unknown()),
  redactions: z.array(Redaction).default([]),
  provenance: z.enum(["observed", "inferred"]).default("observed"),
  prevHash: z.string(),
  hash: z.string(),
});
export type AiEvent = z.infer<typeof AiEvent>;
```

- [ ] **Step 4: Create barrel `packages/core/src/index.ts`**

```ts
export * from "./schema/event.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ailogtrace/core test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): canonical Event zod schema"
```

---

### Task 3: Hash chain utilities (`@ailogtrace/core`)

**Files:**
- Create: `packages/core/src/store/hash.ts`
- Test: `packages/core/src/store/hash.test.ts`
- Modify: `packages/core/src/index.ts` (export hash utils)

**Interfaces:**
- Produces: `GENESIS_HASH: string`, `canonicalJson(v: unknown): string`, `hashEvent(prevHash: string, eventWithoutHash: unknown): string`.

- [ ] **Step 1: Write the failing test** — `packages/core/src/store/hash.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { GENESIS_HASH, canonicalJson, hashEvent } from "./hash.js";

describe("hash", () => {
  it("genesis is 64 zeros", () => {
    expect(GENESIS_HASH).toBe("0".repeat(64));
  });
  it("canonicalJson sorts keys stably", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("hashEvent is deterministic and prevHash-sensitive", () => {
    const ev = { id: "x", seq: 0 };
    expect(hashEvent(GENESIS_HASH, ev)).toBe(hashEvent(GENESIS_HASH, ev));
    expect(hashEvent(GENESIS_HASH, ev)).not.toBe(hashEvent("a".repeat(64), ev));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/core test`
Expected: FAIL — cannot resolve `./hash.js`.

- [ ] **Step 3: Write `packages/core/src/store/hash.ts`**

```ts
import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function hashEvent(prevHash: string, eventWithoutHash: unknown): string {
  return createHash("sha256").update(prevHash + canonicalJson(eventWithoutHash)).digest("hex");
}
```

- [ ] **Step 4: Add exports to `packages/core/src/index.ts`**

```ts
export * from "./schema/event.js";
export * from "./store/hash.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ailogtrace/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): SHA-256 hash-chain utilities"
```

---

### Task 4: Append-only hash-chained SQLite store (`@ailogtrace/core`)

**Files:**
- Create: `packages/core/src/store/store.ts`
- Test: `packages/core/src/store/store.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `AiEvent`, `GENESIS_HASH`, `hashEvent` (Task 2, 3).
- Produces:
  - `interface AppendInput { id: string; sessionId: string; ts: string; source: AiEvent["source"]; kind: AiEvent["kind"]; payload: Record<string, unknown>; agent?: AiEvent["agent"]; redactions?: Redaction[]; provenance?: AiEvent["provenance"]; }`
  - `class AuditStore { constructor(dbPath: string); append(input: AppendInput): AiEvent; listSessions(): { sessionId: string; count: number; startedAt: string; endedAt: string }[]; getEvents(sessionId: string): AiEvent[]; count(): number; verify(): { ok: boolean; brokenAtRowid?: number }; close(): void; }`

- [ ] **Step 1: Write the failing test** — `packages/core/src/store/store.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { AuditStore } from "./store.js";

function mk() { return new AuditStore(":memory:"); }
const base = { sessionId: "s1", ts: "2026-07-02T00:00:00.000Z", source: "hook" as const, kind: "user_prompt" as const, payload: { text: "hi" } };

describe("AuditStore", () => {
  it("appends events with a continuous hash chain and increasing seq", () => {
    const s = mk();
    const a = s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    const b = s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
    expect(b.prevHash).toBe(a.hash);
    expect(s.verify().ok).toBe(true);
    s.close();
  });

  it("getEvents returns events in seq order for a session", () => {
    const s = mk();
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    const evs = s.getEvents("s1");
    expect(evs.map((e) => e.seq)).toEqual([0, 1]);
    s.close();
  });

  it("verify detects tampering", () => {
    const s = mk();
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    // tamper by bypassing the API via the internal handle
    (s as unknown as { db: any }).db.exec("UPDATE events SET payload = '{\"text\":\"HACKED\"}' WHERE seq = 0");
    expect(s.verify().ok).toBe(false);
    s.close();
  });

  it("rejects direct DELETE (append-only)", () => {
    const s = mk();
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    expect(() => (s as unknown as { db: any }).db.exec("DELETE FROM events")).toThrow(/append-only/);
    s.close();
  });
});
```

> Note: the tamper test uses `UPDATE`, which the append-only trigger normally blocks. To make tampering testable, the update trigger blocks writes from the public API path but the test reaches the raw handle — see implementation: triggers block `UPDATE`/`DELETE` unconditionally, so the tamper test instead deletes-and-reinserts is not possible. **Resolution:** the tamper test mutates via a second connection opened without triggers. Replace the tamper line with the helper below.

- [ ] **Step 1b: Correct the tamper test to use a trigger-free connection**

Replace the "verify detects tampering" test body with:

```ts
  it("verify detects tampering", () => {
    const s = new AuditStore("test-tamper.db");
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    s.close();
    const Database = (await import("better-sqlite3")).default;
    const raw = new Database("test-tamper.db");
    raw.exec("DROP TRIGGER IF EXISTS events_no_update");
    raw.exec("UPDATE events SET payload = '{\"text\":\"HACKED\"}' WHERE seq = 0");
    raw.close();
    const s2 = new AuditStore("test-tamper.db");
    expect(s2.verify().ok).toBe(false);
    s2.close();
    (await import("node:fs")).rmSync("test-tamper.db", { force: true });
  });
```

Mark the test callback `async`. (This keeps the append-only guarantee real while still exercising `verify`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/core test`
Expected: FAIL — cannot resolve `./store.js`.

- [ ] **Step 3: Write `packages/core/src/store/store.ts`**

```ts
import Database from "better-sqlite3";
import { GENESIS_HASH, hashEvent } from "./hash.js";
import { AiEvent, type Redaction } from "../schema/event.js";

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
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
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
    const rows = this.db.prepare("SELECT * FROM events WHERE sessionId = ? ORDER BY seq ASC").all(sessionId) as Row[];
    return rows.map((r) => this.rowToEvent(r));
  }

  listSessions(): { sessionId: string; count: number; startedAt: string; endedAt: string }[] {
    return this.db.prepare(`
      SELECT sessionId, COUNT(*) AS count, MIN(ts) AS startedAt, MAX(ts) AS endedAt
      FROM events GROUP BY sessionId ORDER BY startedAt DESC
    `).all() as { sessionId: string; count: number; startedAt: string; endedAt: string }[];
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;
  }

  verify(): { ok: boolean; brokenAtRowid?: number } {
    const rows = this.db.prepare("SELECT * FROM events ORDER BY rowid ASC").all() as Row[];
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
```

> Implementation detail: `verify`'s `base` object must contain the **same keys in the same shape** as `append`'s `base` (i.e. `agent: undefined` when absent, not omitted differently). `canonicalJson` treats `undefined` object values by writing `undefined` via `JSON.stringify` → skipped keys; since both paths build `base` identically, the hash matches. Do not reorder or add keys in one path only.

- [ ] **Step 4: Add export to `packages/core/src/index.ts`**

```ts
export * from "./schema/event.js";
export * from "./store/hash.js";
export * from "./store/store.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ailogtrace/core test`
Expected: PASS (append/chain, order, tamper-detected, delete-rejected).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): append-only hash-chained SQLite store with verify"
```

---

### Task 5: Redaction engine (`@ailogtrace/core`)

**Files:**
- Create: `packages/core/src/redaction/redact.ts`
- Test: `packages/core/src/redaction/redact.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `interface RedactionRule { id: string; pattern: RegExp; }`
  - `const BUILTIN_RULES: RedactionRule[]`
  - `interface RedactResult { payload: Record<string, unknown>; redactions: Redaction[]; }`
  - `function redactPayload(payload: Record<string, unknown>, rules?: RedactionRule[]): RedactResult` — deep-walks strings, masks matches with `«redacted:ruleId»`, fail-closed.

- [ ] **Step 1: Write the failing test** — `packages/core/src/redaction/redact.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { redactPayload } from "./redact.js";

describe("redactPayload", () => {
  it("masks a fake AWS key, redis url, and PEM header", () => {
    const { payload, redactions } = redactPayload({
      diff: "AKIAIOSFODNN7EXAMPLE and redis://user:pass@host:6379 and -----BEGIN RSA PRIVATE KEY-----",
    });
    const s = JSON.stringify(payload);
    expect(s).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(s).not.toContain("redis://user:pass@host:6379");
    expect(s).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(redactions.length).toBeGreaterThanOrEqual(3);
  });

  it("masks a high-entropy token", () => {
    const { payload } = redactPayload({ note: "token=Xa8Kd93Lm2Qp0Zr7Bv4Nc6Tf1Hj5Wg" });
    expect(JSON.stringify(payload)).not.toContain("Xa8Kd93Lm2Qp0Zr7Bv4Nc6Tf1Hj5Wg");
  });

  it("leaves clean payloads untouched", () => {
    const { payload, redactions } = redactPayload({ path: "src/api.ts", lines: 84 });
    expect(payload).toEqual({ path: "src/api.ts", lines: 84 });
    expect(redactions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/core test`
Expected: FAIL — cannot resolve `./redact.js`.

- [ ] **Step 3: Write `packages/core/src/redaction/redact.ts`**

```ts
import type { Redaction } from "../schema/event.js";

export interface RedactionRule {
  id: string;
  pattern: RegExp;
}

export const BUILTIN_RULES: RedactionRule[] = [
  { id: "builtin.aws-access-key", pattern: /AKIA[0-9A-Z]{16}/g },
  { id: "builtin.redis-url", pattern: /redis:\/\/[^\s"']+/g },
  { id: "builtin.pem", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: "builtin.assignment-secret", pattern: /(?:api[_-]?key|secret|token|password)["'\s:=]+([A-Za-z0-9\-_]{16,})/gi },
];

export interface RedactResult {
  payload: Record<string, unknown>;
  redactions: Redaction[];
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function redactString(value: string, field: string, counts: Map<string, number>): string {
  let out = value;
  for (const rule of BUILTIN_RULES) {
    out = out.replace(rule.pattern, () => {
      counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
      return `«redacted:${rule.id}»`;
    });
  }
  // Entropy pass: mask long high-entropy tokens (likely secrets)
  out = out.replace(/[A-Za-z0-9\-_]{20,}/g, (tok) => {
    if (shannonEntropy(tok) >= 3.5) {
      counts.set("builtin.entropy", (counts.get("builtin.entropy") ?? 0) + 1);
      return "«redacted:builtin.entropy»";
    }
    return tok;
  });
  return out;
}

function walk(value: unknown, field: string, counts: Map<string, number>): unknown {
  try {
    if (typeof value === "string") return redactString(value, field, counts);
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${field}[${i}]`, counts));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v, field ? `${field}.${k}` : k, counts);
      }
      return out;
    }
    return value;
  } catch {
    // fail-closed: never leak plaintext on error
    counts.set("builtin.failclosed", (counts.get("builtin.failclosed") ?? 0) + 1);
    return "«redacted:builtin.failclosed»";
  }
}

export function redactPayload(payload: Record<string, unknown>): RedactResult {
  const counts = new Map<string, number>();
  const redacted = walk(payload, "payload", counts) as Record<string, unknown>;
  const redactions: Redaction[] = [...counts.entries()].map(([ruleId, count]) => ({
    ruleId, field: "payload", count,
  }));
  return { payload: redacted, redactions };
}
```

- [ ] **Step 4: Add export to `packages/core/src/index.ts`**

```ts
export * from "./redaction/redact.js";
```
(Append to existing exports.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ailogtrace/core test`
Expected: PASS (3 redaction tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): pre-persistence redaction engine (regex + entropy, fail-closed)"
```

---

### Task 6: Graph builder stub (`@ailogtrace/core`)

**Files:**
- Create: `packages/core/src/graph/build.ts`
- Test: `packages/core/src/graph/build.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `AiEvent`.
- Produces:
  - `interface GraphNode { id: string; type: EventKind; ts: string; label: string; provenance: "observed" | "inferred"; sourceEventIds: string[]; }`
  - `interface GraphEdge { id: string; from: string; to: string; type: string; }`
  - `interface Graph { nodes: GraphNode[]; edges: GraphEdge[]; }`
  - `function buildGraph(events: AiEvent[]): Graph`

- [ ] **Step 1: Write the failing test** — `packages/core/src/graph/build.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildGraph } from "./build.js";
import type { AiEvent } from "../schema/event.js";

function ev(id: string, kind: AiEvent["kind"], seq: number): AiEvent {
  return { id, sessionId: "s1", seq, ts: "2026-07-02T00:00:00Z", source: "hook",
    kind, payload: {}, redactions: [], provenance: "observed",
    prevHash: "0".repeat(64), hash: id.padEnd(64, "0") };
}

describe("buildGraph (stub)", () => {
  it("makes one node per event and sequential triggered edges", () => {
    const g = buildGraph([ev("a", "user_prompt", 0), ev("b", "tool_call_start", 1), ev("c", "file_change", 2)]);
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(g.edges).toEqual([
      { id: "edge_0", from: "a", to: "b", type: "triggered" },
      { id: "edge_1", from: "b", to: "c", type: "triggered" },
    ]);
    expect(g.nodes.every((n) => n.provenance === "observed")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/core test`
Expected: FAIL — cannot resolve `./build.js`.

- [ ] **Step 3: Write `packages/core/src/graph/build.ts`**

```ts
import type { AiEvent, EventKind } from "../schema/event.js";

export interface GraphNode {
  id: string;
  type: EventKind;
  ts: string;
  label: string;
  provenance: "observed" | "inferred";
  sourceEventIds: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// V1: replace sequential edges with deterministic causality (triggered/modified/
// approved/failed_then_retried), FileRead grouping/collapse, and an inference pass
// that adds AgentDecision/AgentPlan nodes (provenance: "inferred", with citations).
export function buildGraph(events: AiEvent[]): Graph {
  const nodes: GraphNode[] = events.map((e) => ({
    id: e.id,
    type: e.kind,
    ts: e.ts,
    label: e.kind,
    provenance: e.provenance,
    sourceEventIds: [e.id],
  }));
  const edges: GraphEdge[] = [];
  for (let i = 1; i < events.length; i++) {
    edges.push({ id: `edge_${i - 1}`, from: events[i - 1].id, to: events[i].id, type: "triggered" });
  }
  return { nodes, edges };
}
```

- [ ] **Step 4: Add export to `packages/core/src/index.ts`**

```ts
export * from "./graph/build.js";
```
(Append.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @ailogtrace/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): deterministic graph builder stub (sequential edges)"
```

---

### Task 7: Hook spooler (`@ailogtrace/hook`)

**Files:**
- Create: `packages/hook/src/spool.ts` (pure, testable), `packages/hook/src/index.ts` (entrypoint)
- Test: `packages/hook/src/spool.test.ts`

**Interfaces:**
- Produces:
  - `function toSpoolLine(kind: string, raw: string): string` — parses raw stdin JSON, returns exactly one ndjson line ending in `\n`; never throws.
  - `function spool(kind: string, raw: string, homeDir: string): void` — writes the line under `<homeDir>/.ailogtrace/spool/<sessionId>.ndjson`.

- [ ] **Step 1: Write the failing test** — `packages/hook/src/spool.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { toSpoolLine } from "./spool.js";

describe("toSpoolLine", () => {
  it("wraps a hook payload into one ndjson line with sessionId + kind", () => {
    const line = toSpoolLine("user_prompt", JSON.stringify({ session_id: "sess_9", prompt: "hi" }));
    expect(line.endsWith("\n")).toBe(true);
    const obj = JSON.parse(line);
    expect(obj.kind).toBe("user_prompt");
    expect(obj.sessionId).toBe("sess_9");
    expect(obj.hook.prompt).toBe("hi");
  });

  it("never throws on malformed JSON and defaults sessionId to 'unknown'", () => {
    const line = toSpoolLine("session_start", "not json {");
    const obj = JSON.parse(line);
    expect(obj.sessionId).toBe("unknown");
    expect(obj.kind).toBe("session_start");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/hook test`
Expected: FAIL — cannot resolve `./spool.js`.

- [ ] **Step 3: Write `packages/hook/src/spool.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ailogtrace/hook test`
Expected: PASS.

- [ ] **Step 5: Write the entrypoint `packages/hook/src/index.ts`** (never throws into the agent)

```ts
#!/usr/bin/env node
import { homedir } from "node:os";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spool } from "./spool.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const kind = process.argv[2] ?? "unknown";
  try {
    const raw = await readStdin();
    spool(kind, raw, homedir());
  } catch (err) {
    try {
      const dir = join(homedir(), ".ailogtrace", "logs");
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, "hook-errors.log"), `${new Date().toISOString()} ${kind} ${String(err)}\n`);
    } catch {
      /* swallow — never surface to the agent */
    }
  }
  process.exit(0);
}

void main();
```

- [ ] **Step 6: Build to confirm the entrypoint compiles**

Run: `pnpm --filter @ailogtrace/hook build`
Expected: `dist/index.js` produced, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add packages/hook
git commit -m "feat(hook): non-blocking ndjson spooler entrypoint"
```

---

### Task 8: Collector + kind mapping (`@ailogtrace/cli`)

**Files:**
- Create: `packages/cli/src/normalize.ts`, `packages/cli/src/collector.ts`, `packages/cli/src/paths.ts`
- Test: `packages/cli/src/normalize.test.ts`, `packages/cli/src/collector.test.ts`

**Interfaces:**
- Consumes: `AuditStore`, `redactPayload` (core).
- Produces:
  - `paths.ts`: `homeRoot(): string`, `dbPath(): string`, `spoolDir(): string`.
  - `normalize.ts`: `interface SpoolLine { ts: string; kind: string; sessionId: string; hook: Record<string, unknown>; }`, `function mapKind(hookKind: string): AiEvent["kind"]`, `function normalize(line: SpoolLine): AppendInput` (id via `randomUUID`, redaction applied here).
  - `collector.ts`: `function ingestSpoolFile(store: AuditStore, filePath: string): number` (returns events ingested; deletes file when fully consumed), `function ingestAll(store: AuditStore, dir: string): number`.

- [ ] **Step 1: Write the failing test** — `packages/cli/src/normalize.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { mapKind, normalize } from "./normalize.js";

describe("mapKind", () => {
  it("maps known hook kinds and falls back to agent_message", () => {
    expect(mapKind("user_prompt")).toBe("user_prompt");
    expect(mapKind("tool_call_start")).toBe("tool_call_start");
    expect(mapKind("mystery")).toBe("agent_message");
  });
});

describe("normalize", () => {
  it("produces an AppendInput and redacts secrets in the payload", () => {
    const input = normalize({
      ts: "2026-07-02T00:00:00Z", kind: "file_change", sessionId: "s1",
      hook: { diff: "AKIAIOSFODNN7EXAMPLE" },
    });
    expect(input.sessionId).toBe("s1");
    expect(input.kind).toBe("file_change");
    expect(JSON.stringify(input.payload)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(input.redactions?.length).toBeGreaterThanOrEqual(1);
    expect(input.id).toMatch(/[0-9a-f-]{36}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: FAIL — cannot resolve `./normalize.js`.

- [ ] **Step 3: Write `packages/cli/src/paths.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export function homeRoot(): string {
  return join(homedir(), ".ailogtrace");
}
export function dbPath(): string {
  return join(homeRoot(), "audit.db");
}
export function spoolDir(): string {
  return join(homeRoot(), "spool");
}
```

- [ ] **Step 4: Write `packages/cli/src/normalize.ts`**

```ts
import { randomUUID } from "node:crypto";
import { redactPayload, type AppendInput, type AiEvent } from "@ailogtrace/core";

export interface SpoolLine {
  ts: string;
  kind: string;
  sessionId: string;
  hook: Record<string, unknown>;
}

const KIND_MAP: Record<string, AiEvent["kind"]> = {
  session_start: "session_start",
  session_end: "session_end",
  user_prompt: "user_prompt",
  tool_call_start: "tool_call_start",
  tool_call_end: "tool_call_end",
  permission_request: "permission_request",
  subagent_stop: "subagent_stop",
  final_output: "final_output",
};

export function mapKind(hookKind: string): AiEvent["kind"] {
  return KIND_MAP[hookKind] ?? "agent_message";
}

export function normalize(line: SpoolLine): AppendInput {
  const { payload, redactions } = redactPayload(line.hook ?? {});
  return {
    id: randomUUID(),
    sessionId: line.sessionId,
    ts: line.ts,
    source: "hook",
    kind: mapKind(line.kind),
    payload,
    redactions,
  };
}
```

- [ ] **Step 5: Run normalize tests to verify they pass**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: PASS (normalize suite; collector suite fails until Step 7 — acceptable, or scope run to the file).

- [ ] **Step 6: Write the failing collector test** — `packages/cli/src/collector.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { ingestSpoolFile } from "./collector.js";
import { writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ingestSpoolFile", () => {
  it("ingests each ndjson line as an ordered event and deletes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "alt-"));
    const file = join(dir, "s1.ndjson");
    writeFileSync(file,
      JSON.stringify({ ts: "2026-07-02T00:00:00Z", kind: "user_prompt", sessionId: "s1", hook: { prompt: "hi" } }) + "\n" +
      JSON.stringify({ ts: "2026-07-02T00:00:01Z", kind: "tool_call_start", sessionId: "s1", hook: { tool: "Read" } }) + "\n");
    const store = new AuditStore(":memory:");
    const n = ingestSpoolFile(store, file);
    expect(n).toBe(2);
    expect(store.getEvents("s1").map((e) => e.kind)).toEqual(["user_prompt", "tool_call_start"]);
    expect(existsSync(file)).toBe(false);
    store.close();
  });
});
```

- [ ] **Step 7: Write `packages/cli/src/collector.ts`**

```ts
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
```

- [ ] **Step 8: Run all cli tests to verify they pass**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: PASS (normalize + collector).

- [ ] **Step 9: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): spool collector + normalization with redaction"
```

---

### Task 9: CLI commands — init/status/dump/verify/export (`@ailogtrace/cli`)

**Files:**
- Create: `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/report.ts`, `packages/cli/src/cli.ts`
- Test: `packages/cli/src/commands/init.test.ts`, `packages/cli/src/commands/report.test.ts`

**Interfaces:**
- Consumes: `AuditStore`, `ingestAll`, `paths`.
- Produces:
  - `init.ts`: `function buildHookSettings(pluginRoot: string): object` (the `.claude/settings` hooks block), `function writeInit(cwd: string, pluginRoot: string): string` (writes `<cwd>/.claude/settings.local.json`, returns path).
  - `report.ts`: `function statusReport(store: AuditStore): string`, `function dumpSession(store: AuditStore, sessionId?: string): string`.
  - `cli.ts`: commander program with `init`, `status`, `dump`, `verify`, `export`, `ui` (ui delegates to Task 10).

- [ ] **Step 1: Write the failing test** — `packages/cli/src/commands/report.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { statusReport, dumpSession } from "./report.js";

function seed(): AuditStore {
  const s = new AuditStore(":memory:");
  s.append({ id: "11111111-1111-4111-8111-111111111111", sessionId: "s1", ts: "2026-07-02T00:00:00Z", source: "hook", kind: "user_prompt", payload: { prompt: "add rate limiting" } });
  s.append({ id: "22222222-2222-4222-8222-222222222222", sessionId: "s1", ts: "2026-07-02T00:00:01Z", source: "hook", kind: "file_change", payload: { path: "api.ts" } });
  return s;
}

describe("report", () => {
  it("statusReport shows session and event counts", () => {
    const r = statusReport(seed());
    expect(r).toMatch(/2 events/);
    expect(r).toMatch(/1 session/);
  });
  it("dumpSession lists events in order with kinds", () => {
    const r = dumpSession(seed(), "s1");
    const iPrompt = r.indexOf("user_prompt");
    const iFile = r.indexOf("file_change");
    expect(iPrompt).toBeGreaterThanOrEqual(0);
    expect(iFile).toBeGreaterThan(iPrompt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: FAIL — cannot resolve `./report.js`.

- [ ] **Step 3: Write `packages/cli/src/commands/report.ts`**

```ts
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
```

- [ ] **Step 4: Run report tests to verify they pass**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: PASS (report suite).

- [ ] **Step 5: Write the failing test** — `packages/cli/src/commands/init.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildHookSettings } from "./init.js";

describe("buildHookSettings", () => {
  it("wires all eight lifecycle events to the spooler with the plugin root", () => {
    const s = buildHookSettings("/plugins/ai-log-trace") as { hooks: Record<string, unknown> };
    const keys = Object.keys(s.hooks);
    expect(keys).toEqual(expect.arrayContaining([
      "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
      "Notification", "SubagentStop", "Stop", "SessionEnd",
    ]));
    expect(JSON.stringify(s)).toContain("/plugins/ai-log-trace");
    expect(JSON.stringify(s)).toContain("packages/hook/dist/index.js");
  });
});
```

- [ ] **Step 6: Write `packages/cli/src/commands/init.ts`**

```ts
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EVENTS: Array<[string, string, boolean]> = [
  ["SessionStart", "session_start", false],
  ["UserPromptSubmit", "user_prompt", false],
  ["PreToolUse", "tool_call_start", true],
  ["PostToolUse", "tool_call_end", true],
  ["Notification", "permission_request", false],
  ["SubagentStop", "subagent_stop", false],
  ["Stop", "final_output", false],
  ["SessionEnd", "session_end", false],
];

export function buildHookSettings(pluginRoot: string): object {
  const hooks: Record<string, unknown> = {};
  for (const [event, kind, hasMatcher] of EVENTS) {
    const entry: Record<string, unknown> = {
      hooks: [{ type: "command", command: `node "${pluginRoot}/packages/hook/dist/index.js" ${kind}` }],
    };
    if (hasMatcher) entry.matcher = "*";
    hooks[event] = [entry];
  }
  return { hooks };
}

export function writeInit(cwd: string, pluginRoot: string): string {
  const dir = join(cwd, ".claude");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "settings.local.json");
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const merged = { ...existing, ...buildHookSettings(pluginRoot) };
  writeFileSync(file, JSON.stringify(merged, null, 2));
  return file;
}
```

- [ ] **Step 7: Run all cli tests to verify they pass**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: PASS (report + init).

- [ ] **Step 8: Write `packages/cli/src/cli.ts`** (commander wiring)

```ts
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
```

- [ ] **Step 9: Build the cli package**

Run: `pnpm --filter @ailogtrace/cli build`
Expected: compiles (note: `ui/server.js` is created in Task 10; if building before Task 10, temporarily stub the import — the plan runs Task 10 next, so prefer to build after Task 10).

- [ ] **Step 10: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): init/status/dump/verify commands + export stub"
```

---

### Task 10: Fastify read API + React dashboard stub (`@ailogtrace/cli`, `apps/dashboard`)

**Files:**
- Create: `packages/cli/src/ui/server.ts`
- Test: `packages/cli/src/ui/server.test.ts`
- Create: `apps/dashboard/package.json`, `apps/dashboard/vite.config.ts`, `apps/dashboard/index.html`, `apps/dashboard/src/main.tsx`, `apps/dashboard/src/App.tsx`

**Interfaces:**
- Consumes: `AuditStore`, `ingestAll`, `paths`.
- Produces:
  - `server.ts`: `function buildServer(store: AuditStore): FastifyInstance` (routes `GET /api/sessions`, `GET /api/sessions/:id/events`), `function startUi(port: number): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `packages/cli/src/ui/server.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { buildServer } from "./server.js";

function seed(): AuditStore {
  const s = new AuditStore(":memory:");
  s.append({ id: "11111111-1111-4111-8111-111111111111", sessionId: "s1", ts: "2026-07-02T00:00:00Z", source: "hook", kind: "user_prompt", payload: { prompt: "hi" } });
  return s;
}

describe("api", () => {
  it("GET /api/sessions returns the session list", async () => {
    const app = buildServer(seed());
    const res = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].sessionId).toBe("s1");
    await app.close();
  });

  it("GET /api/sessions/:id/events returns ordered events", async () => {
    const app = buildServer(seed());
    const res = await app.inject({ method: "GET", url: "/api/sessions/s1/events" });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].kind).toBe("user_prompt");
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: FAIL — cannot resolve `./server.js`.

- [ ] **Step 3: Write `packages/cli/src/ui/server.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { AuditStore } from "@ailogtrace/core";
import { dbPath, spoolDir } from "../paths.js";
import { ingestAll } from "../collector.js";

export function buildServer(store: AuditStore): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/api/sessions", async () => store.listSessions());
  app.get<{ Params: { id: string } }>("/api/sessions/:id/events", async (req) =>
    store.getEvents(req.params.id),
  );
  return app;
}

export async function startUi(port: number): Promise<void> {
  const store = new AuditStore(dbPath());
  ingestAll(store, spoolDir());
  const app = buildServer(store);
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`AILogTrace dashboard API on http://127.0.0.1:${port}/api/sessions`);
  console.log(`(dashboard UI: run \`pnpm --filter @ailogtrace/dashboard dev\` for the React app)`);
}
```

- [ ] **Step 4: Run api tests to verify they pass**

Run: `pnpm --filter @ailogtrace/cli test`
Expected: PASS.

- [ ] **Step 5: Create the dashboard app files**

`apps/dashboard/package.json`:
```json
{
  "name": "@ailogtrace/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.3.0", "react-dom": "^18.3.0" },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

`apps/dashboard/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:4477" } },
});
```

`apps/dashboard/index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AILogTrace</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`apps/dashboard/src/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
createRoot(document.getElementById("root")!).render(<App />);
```

`apps/dashboard/src/App.tsx`:
```tsx
import { useEffect, useState } from "react";

interface Session { sessionId: string; count: number; startedAt: string; endedAt: string }

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    fetch("/api/sessions").then((r) => r.json()).then(setSessions).catch(() => setSessions([]));
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>AILogTrace</h1>
      <p style={{ color: "#666" }}>Flight recorder for AI-assisted development — session list (walking skeleton).</p>
      {/* V1: timeline, diff viewer, React Flow graph, search. */}
      <table cellPadding={8} style={{ borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Session</th><th>Events</th><th align="left">Started</th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId} style={{ borderTop: "1px solid #ddd" }}>
              <td><code>{s.sessionId}</code></td><td align="center">{s.count}</td><td>{s.startedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sessions.length === 0 && <p>No sessions yet. Run a Claude Code session after <code>ailogtrace init</code>.</p>}
    </main>
  );
}
```

- [ ] **Step 6: Install new deps and build the whole workspace**

Run: `pnpm install && pnpm -r build`
Expected: all packages compile; `apps/dashboard` builds.

- [ ] **Step 7: Commit**

```bash
git add packages/cli apps/dashboard
git commit -m "feat(ui): Fastify read API + React dashboard session-list stub"
```

---

### Task 11: End-to-end gate — prove capture on a real session

**Files:**
- Create: `docs/superpowers/HOOK_MAPPING.md` (the verified hook-name → kind table)
- Modify (if needed): `hooks/hooks.json`, `packages/cli/src/normalize.ts` (`KIND_MAP`) to match observed payloads

**Interfaces:**
- Consumes: everything built above.

- [ ] **Step 1: Build everything fresh**

Run: `pnpm install && pnpm -r build && pnpm -r test`
Expected: install + build clean; all unit tests pass.

- [ ] **Step 2: Simulate a session by feeding the spooler directly** (proves the pipe without needing a live agent)

Run (bash):
```bash
node packages/hook/dist/index.js user_prompt <<< '{"session_id":"sess_demo","prompt":"add rate limiting"}'
node packages/hook/dist/index.js tool_call_start <<< '{"session_id":"sess_demo","tool_name":"Write","tool_input":{"path":"api/ratelimit.ts"}}'
node packages/hook/dist/index.js tool_call_end <<< '{"session_id":"sess_demo","tool_name":"Write"}'
node packages/hook/dist/index.js final_output <<< '{"session_id":"sess_demo"}'
```
Expected: four ndjson lines appended to `~/.ailogtrace/spool/sess_demo.ndjson` (no errors printed).

- [ ] **Step 3: Drain + dump**

Run: `node packages/cli/dist/cli.js dump --session sess_demo`
Expected: an ordered listing `#000 … user_prompt`, `#001 … tool_call_start`, `#002 … tool_call_end`, `#003 … final_output`.

- [ ] **Step 4: Verify the chain**

Run: `node packages/cli/dist/cli.js verify`
Expected: `chain intact ✓`.

- [ ] **Step 5: Confirm no plaintext secret leaks with a seeded run**

Run (bash):
```bash
node packages/hook/dist/index.js user_prompt <<< '{"session_id":"sess_secret","prompt":"here is AKIAIOSFODNN7EXAMPLE"}'
node packages/cli/dist/cli.js dump --session sess_secret
```
Expected: dump shows `[redacted:1]` (or more) on the prompt event; the raw DB (`~/.ailogtrace/audit.db`) contains no `AKIAIOSFODNN7EXAMPLE`.

- [ ] **Step 6: Verify against a REAL Claude Code session and record the mapping**

Run `ailogtrace init` in a scratch project, run a short real Claude Code session (one prompt that reads a file and writes a file), then `ailogtrace dump`. Compare the captured events against what happened in the terminal. Record the observed hook event names and payload keys in `docs/superpowers/HOOK_MAPPING.md`. If any hook name/payload differs from Task 1/Task 8 assumptions, fix `hooks.json` + `KIND_MAP` and re-run.

**GATE:** if captured coverage of meaningful actions (prompt, tool calls, file changes, stop) is **< ~90%**, STOP and fix capture before considering the skeleton done (source plan Week-1 gate).

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/HOOK_MAPPING.md hooks/hooks.json packages/cli/src/normalize.ts
git commit -m "test: end-to-end capture gate + verified hook mapping"
```

---

## Self-Review

**Spec coverage check (spec §→ task):**
- §2 layout → Task 1. §3 stack → Task 1 manifests. §5 Event schema → Task 2. §7 hash chain / data-flow → Tasks 3, 4, 7, 8. §4 store functional → Task 4. §4 redaction "real but minimal" → Task 5. §4 graph stub → Task 6. §6 hook coverage + mapping → Tasks 1, 8, 11. §8 CLI surface → Task 9. §4/§8 dashboard stub → Task 10. §10 tests → embedded per task. §11 deferred seams → Tasks 6 (graph V1), 9 (export V1), 10 (dashboard V1) with `// V1:` markers. §12 acceptance → Task 11 gate. **No gaps.**
- **Placeholder scan:** the only "not yet implemented" is the deliberate `export` stub (spec §4/§8/§11) and `// V1:` seams — all intentional, none are plan-step placeholders. Every code step shows complete code.
- **Type consistency:** `AppendInput`, `AuditStore` method names (`append`, `getEvents`, `listSessions`, `count`, `verify`, `close`), `redactPayload` return `{ payload, redactions }`, `SpoolLine`, `mapKind`, `normalize`, `ingestSpoolFile`/`ingestAll`, `buildServer`/`startUi`, `buildHookSettings`/`writeInit`, `statusReport`/`dumpSession` are used consistently across Tasks 4–10. `toSpoolLine` output shape (`{ts,kind,sessionId,hook}`) matches `SpoolLine` consumed by the collector. Hook `kind` argv values in `hooks.json` (Task 1) match `KIND_MAP` keys (Task 8). Consistent.

Plan is internally consistent and fully covers the spec.
