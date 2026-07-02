# AILogTrace

**Flight recorder for AI-assisted development.** Local-first audit and workflow-trace capture
for Claude Code — records every prompt, tool call, and file change into an append-only,
hash-chained local store, with secrets redacted before they are ever written.

> Status: **MVP walking skeleton.** The capture spine and Markdown/JSON report export work
> end-to-end; the graph builder, dashboard, and inference are intentionally minimal stubs (see
> [the design spec](docs/superpowers/specs/2026-07-02-ailogtrace-mvp-skeleton-design.md)).

## Architecture

```
Claude Code hook → packages/hook (spool ndjson, non-blocking)
  → ~/.ailogtrace/spool/<sessionId>.ndjson
  → packages/cli collector: normalize → REDACT → append
  → node:sqlite store (WAL, append-only, SHA-256 hash chain)   [packages/core]
  → ailogtrace dump / verify / status / ui
```

Nothing leaves the machine. The store lives at `~/.ailogtrace/audit.db`.

## Packages

| Package | Responsibility |
|---|---|
| `@ailogtrace/core` | Event schema (zod), hash-chain, append-only SQLite store, redaction, graph builder |
| `@ailogtrace/hook` | Tiny non-blocking spooler invoked by Claude Code hooks |
| `@ailogtrace/cli`  | `ailogtrace` CLI: init/status/dump/verify/export/ui + collector |
| `@ailogtrace/dashboard` | React + Vite local dashboard (session list, walking-skeleton stub) |

## Quick start

```bash
pnpm install
pnpm -r build
pnpm -r test          # 24 tests

# wire hooks into a project (writes .claude/settings.local.json)
node packages/cli/dist/cli.js init

# after a Claude Code session runs, inspect it:
node packages/cli/dist/cli.js status
node packages/cli/dist/cli.js dump
node packages/cli/dist/cli.js verify

# local dashboard API (http://127.0.0.1:4477/api/sessions)
node packages/cli/dist/cli.js ui
```

## Guarantees (this skeleton)

- **Non-blocking capture** — the hook only spools ndjson and exits; no agent latency.
- **Redaction before persistence** — fail-closed; the seeded-secret test proves zero plaintext
  secrets reach the DB.
- **Tamper-evident** — every event is `sha256(prevHash + canonical(event))`; `ailogtrace verify`
  recomputes the chain and pinpoints any break. (Tamper-*evident*, not tamper-*proof*.)
- **Append-only** — SQLite triggers reject UPDATE/DELETE on `events`.

## Requirements

Node.js 22+ (uses the built-in `node:sqlite`), pnpm.

## Deferred to V1

LLM decision inference, risk scoring, diff viewer, React Flow graph, PDF/HTML export
(Markdown/JSON export already works), encryption-at-rest, `.ailogtraceignore`, FTS search,
second-agent adapters. See the
[design spec](docs/superpowers/specs/2026-07-02-ailogtrace-mvp-skeleton-design.md) §11 and the
`// V1:` markers in the source.
