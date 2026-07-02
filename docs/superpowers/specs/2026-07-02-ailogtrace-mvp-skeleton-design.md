# AILogTrace MVP — Walking Skeleton Design Spec

*Date: 2026-07-02*
*Status: Approved for implementation planning*
*Source plan: [AUDIT_AGENT_PLUGIN_PLAN.md](../../../AUDIT_AGENT_PLUGIN_PLAN.md)*

---

## 1. Purpose & Scope

Build the first runnable increment of **AILogTrace** — a local-first audit/flight-recorder
plugin for Claude Code — as a **walking skeleton**: a pnpm monorepo plus Claude Code plugin
manifest where the **event-capture path works end-to-end**, and every downstream concern exists
as a real-but-minimal, tested stub with clear extension seams.

This spec covers **one build session**. It deliberately does *not* attempt to finish the full
MVP (6 epics), V1, or Enterprise tiers described in the source plan.

### The single gate that defines success

> Install the plugin into a project, run a real Claude Code session, and have
> `ailogtrace dump` replay a **hash-verified, ordered event stream** covering the meaningful
> actions of that session (the source plan's Week-1 ">90% coverage" gate).

If capture is solid, the remaining MVP work is "fill in the boxes." If capture is not solid,
nothing downstream matters — so this session's priority order is capture first, everything else
second.

### Non-goals (this session)

LLM decision inference, risk scoring, diff viewer, React Flow graph, PDF/HTML export,
encryption-at-rest / OS-keychain, `.ailogtraceignore`, FTS search, and any second-agent adapter.
Each is represented by a stub with an interface signature and a `// V1:` marker — not a silent gap.

---

## 2. Repository Layout

```
ai-log-trace/
├─ .claude-plugin/plugin.json        # Claude Code plugin manifest (name, version, description)
├─ hooks/hooks.json                  # wires lifecycle events → hook spooler
├─ pnpm-workspace.yaml               # workspace globs
├─ package.json                      # root scripts (build, test, lint)
├─ tsconfig.base.json                # shared TS config
├─ packages/
│  ├─ core/                          # pure library, no I/O side effects at import time
│  │  ├─ schema/                     # zod Event schema + kinds enum (canonical envelope)
│  │  ├─ store/                      # SQLite (WAL) append-only store + SHA-256 hash chain
│  │  ├─ redaction/                  # pre-persistence secret redaction (minimal builtin rules)
│  │  └─ graph/                      # deterministic node/edge derivation (stub)
│  ├─ hook/                          # tiny spooler binary (append-and-exit)
│  └─ cli/                           # ailogtrace init | status | dump | verify | export(stub)
│                                    # + collector: tails spool → normalize → redact → store
└─ apps/
   └─ dashboard/                     # React + Vite stub: session list via Fastify read API
```

Rationale for boundaries: each package answers "what does it do / how do you use it / what does it
depend on" in isolation. `core` has no process/CLI concerns; `hook` depends on nothing but Node
stdlib (must stay tiny and fast); `cli` orchestrates; `dashboard` only reads.

---

## 3. Tech Stack (inherited from source plan — not re-litigated)

- **Language:** TypeScript / Node.js 22 across hook, CLI, and UI.
- **Package manager / layout:** pnpm workspaces (monorepo).
- **Storage:** SQLite in WAL mode at `~/.ailogtrace/audit.db`; `events` table append-only with
  `prevHash` / `hash` (SHA-256 chain). Diff/large-blob content-addressing is a V1 concern; this
  session stores payloads inline (with truncation) to keep the skeleton simple.
- **Validation:** zod for the canonical Event schema.
- **Local API:** Fastify (read-only) serving the dashboard.
- **UI:** React 18 + Vite + Tailwind (minimal; session list only this pass).
- **Tests:** vitest.
- **Crypto:** SHA-256 hash chain (Node `crypto`). Encryption-at-rest deferred to V1.

---

## 4. Functional vs Stub Matrix

| Area | Package | This session |
|---|---|---|
| Hook spooler (append-and-exit ndjson, non-blocking) | `hook` | **Functional** |
| Canonical Event schema (zod, matches plan envelope) | `core/schema` | **Functional** |
| SQLite store + SHA-256 hash chain, append-only | `core/store` | **Functional** |
| Collector / normalizer (spool → Event → store; transcript linkage by sessionId) | `cli` | **Functional** |
| `ailogtrace init` (installs hooks into a project) | `cli` | **Functional** |
| `ailogtrace status` (recording on/off, session/event counts) | `cli` | **Functional** |
| `ailogtrace dump` (replay ordered event stream for a session) | `cli` | **Functional** |
| `ailogtrace verify` (recompute hash chain, detect tampering) | `cli` | **Functional** |
| Redaction engine (pre-persistence, 2–3 builtin secret regexes + redaction-audit record) | `core/redaction` | **Real but minimal** |
| Graph builder (deterministic edges for the core tool cycle only) | `core/graph` | **Stub** |
| Dashboard + Fastify read API (session list + raw timeline) | `apps/dashboard`, `cli` | **Stub** |
| `ailogtrace export` (MD/JSON) | `cli` | **Placeholder** (interface + TODO) |
| Risk scoring, LLM inference (Epic F) | `core` | **Placeholder** (interface + TODO) |

"Real but minimal" for redaction means: it is **wired into the persistence path** so that no
plaintext secret from the seeded-secret test corpus can reach the DB, but the rule set is small and
explicitly extensible.

---

## 5. Canonical Event Schema

Derived from the source plan's Event envelope (§7). Implemented as a zod schema in `core/schema`.

Required fields: `id` (uuid), `sessionId`, `seq` (integer), `ts` (ISO-8601), `source`
(`hook | transcript | git | adapter | user | system`), `kind` (enum below), `payload` (object),
`prevHash`, `hash`. Optional: `agent {name, version, model}`, `redactions[] {ruleId, field, count}`,
`provenance` (`observed | inferred`, default `observed`).

`kind` enum (MVP subset — full set in plan §7):
`session_start, session_end, user_prompt, agent_message, tool_call_start, tool_call_end,
file_read, file_change, command_run, test_result, permission_request, approval, rejection,
error, retry, subagent_start, subagent_stop, final_output`.

`hash = sha256(prevHash + canonicalJson(eventWithoutHash))`. The first event of the store uses a
fixed genesis `prevHash` (all-zero SHA-256). Canonicalization uses stable key ordering so the hash
is reproducible by `verify`.

---

## 6. Hook Coverage & Event Mapping

Target lifecycle events (source plan §5 / §15 Epic A1):
`SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest/Notification, Stop,
SubagentStop, SessionEnd`.

Each maps to a canonical `kind`. **The exact hook names and payload shapes will be verified against
the installed Claude Code hook API during implementation** (source plan Risk R2 — hook API churn).
Where a hook payload is thin (e.g. it lacks assistant message text), the collector falls back to
parsing the session **transcript JSONL** and links records to hook events by `sessionId`. The
mapping table is a deliverable of the implementation, produced from observed real payloads, not
guessed.

---

## 7. Data Flow (the working spine)

```
Claude Code lifecycle event
  → hooks.json invokes packages/hook binary
    → binary reads hook JSON from stdin, appends ONE raw ndjson line to
      ~/.ailogtrace/spool/<sessionId>.ndjson, exits (<10 ms, no heavy work)
  → cli collector tails the spool file
    → normalize raw line → canonical Event
    → REDACT (secret detection) BEFORE any DB write
    → append to SQLite: hash = sha256(prevHash + canonical(event)), record redactions[]
  → dump / verify / dashboard read from the store
```

### Critical correctness constraints

1. **The hook never blocks or throws into the agent.** The spooler wraps all work; worst case it
   silently drops a single line. Agent UX is sacred (source plan §8, §11 "Performance").
2. **Redaction runs in the collector, before the first DB write** — never after. The spool file is
   transient and may briefly hold un-redacted text; therefore the spool lives under the user's home
   (`~/.ailogtrace/spool`, **not** the repo), is consumed-then-deleted by the collector, and is
   documented as sensitive-but-transient. It must never be committed.
3. **`events` is append-only.** The store layer rejects UPDATE/DELETE on `events`; the hash chain is
   the tamper-evidence mechanism, and `verify` recomputes it end-to-end.
4. **Provenance is `observed` for everything captured this session.** No inferred nodes are produced
   (inference is deferred), so the skeleton makes no claims it cannot back with a source event.

---

## 8. CLI Surface (this session)

- `ailogtrace init` — writes/updates the project's Claude Code hook wiring so sessions record
  automatically; idempotent.
- `ailogtrace status` — prints recording state (on/off), db path, session count, event count,
  last-verified state.
- `ailogtrace dump [--session <id>]` — replays the ordered event stream for a session (or the
  latest) to stdout; the primary evidence for the coverage gate.
- `ailogtrace verify` — recomputes the hash chain over `events` and reports the first break, if any.
- `ailogtrace export` — **placeholder**: prints "not yet implemented", exposes the interface the V1
  MD/JSON exporter will implement.
- `ailogtrace ui` — starts the Fastify read API + serves the dashboard stub (session list).

---

## 9. Error Handling

- **Hook layer:** total try/catch around spooling; failure is swallowed (never surfaced to the
  agent). A local `~/.ailogtrace/logs/hook-errors.log` records drops for debugging.
- **Collector:** malformed spool line → skipped and logged, does not halt the tail loop.
- **Store:** append-only violations and hash-chain init errors throw loudly (these are developer
  errors, not runtime agent-facing paths).
- **Redaction:** if a redaction rule throws, the field is treated as fully masked (fail-closed —
  never fail-open into plaintext persistence).

---

## 10. Testing (vitest) — these tests ARE the gate evidence

1. **Schema:** valid events pass; missing required fields / bad enums fail.
2. **Hash chain:** N appended events form a continuous chain; `verify` passes on an intact chain and
   pinpoints the first break when a row is mutated.
3. **Append-only:** UPDATE/DELETE attempts on `events` are rejected.
4. **Redaction:** a seeded-secret corpus (fake API keys, redis URL, PEM header, high-entropy string)
   yields **zero plaintext hits** in the DB, and each redaction produces an audit record.
5. **Spooler round-trip:** a sample hook payload written to stdin lands as exactly one well-formed
   ndjson spool line; spooler exits fast and never throws on malformed input.
6. **Collector ordering:** spool lines normalize into `seq`-ordered canonical events for a session.

---

## 11. Explicitly Deferred (documented seams, not silent gaps)

Each item below ships as a stub with an interface and a `// V1:` marker:

- LLM decision inference + per-session summary (Epic F)
- Risk scoring heuristics
- Diff viewer + React Flow workflow graph + elk layout
- PDF/HTML export; Markdown/JSON export bodies
- Encryption at rest (SQLCipher/AES-256-GCM) + OS-keychain key wrapping
- `.ailogtraceignore` support
- SQLite FTS5 full-text search
- Content-addressed diff/blob store + compression
- Second-agent adapter (Cursor / Copilot CLI / OpenCode)

---

## 12. Acceptance Criteria (session done when…)

1. `pnpm install && pnpm build && pnpm test` all pass from a clean checkout.
2. `ailogtrace init` wires hooks into a target project without manual JSON editing.
3. Running a real Claude Code session produces spool lines that the collector persists as
   hash-chained events.
4. `ailogtrace dump` shows an ordered, readable event stream for that session covering prompts,
   tool calls, file changes, commands, and stop/end (the coverage-gate demonstration).
5. `ailogtrace verify` passes on the produced store; the tampering test proves it would fail on
   mutation.
6. The seeded-secret redaction test shows zero plaintext secrets in the DB.
7. `ailogtrace ui` serves a session-list page reading from the store.
8. Every deferred item from §11 exists as a compiling stub with a `// V1:` marker (no dead imports,
   no runtime crashes when a stub path is hit).
