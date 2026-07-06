# AILogTrace

**Flight recorder for AI-assisted development.** Local-first audit and workflow-trace capture
for Claude Code — records every prompt, tool call, and file change into an append-only,
hash-chained local store, with secrets redacted before they are ever written.

> Status: **MVP (0.1.x).** Capture, redaction, hash-chain verification, semantic kind derivation,
> Markdown/JSON report export (with a Mermaid graph), and a timeline dashboard all work
> end-to-end. LLM inference, risk scoring, and richer graph/diff views are deferred (see
> [the design spec](docs/superpowers/specs/2026-07-02-ailogtrace-mvp-skeleton-design.md)).
>
> **New here?** Start with **[GETTING_STARTED.md](GETTING_STARTED.md)** — install, wire it into a
> project, and run your first recorded session.

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

## Install from git

Two ways to install from this repo. Full walkthrough in **[GETTING_STARTED.md](GETTING_STARTED.md)**.

### Option A — clone + build (recommended: full CLI + dashboard)

```bash
git clone https://github.com/architonixlabs/ailogtrace.git
cd ailogtrace
pnpm install
pnpm -r build
pnpm -r test          # optional: expect all green

# wire hooks into a project you use Claude Code in:
cd /path/to/your/project
node "/path/to/ailogtrace/packages/cli/dist/cli.js" init
# restart Claude Code, work a session, then:
node "/path/to/ailogtrace/packages/cli/dist/cli.js" dump
node "/path/to/ailogtrace/packages/cli/dist/cli.js" ui      # http://127.0.0.1:4477
```

### Option B — as a Claude Code plugin (capture-only, no build)

The repo ships a plugin marketplace manifest and the dependency-free compiled hook, so the
**capture** hooks work straight from git — no clone or build:

```bash
# inside Claude Code:
/plugin marketplace add architonixlabs/ailogtrace
/plugin install ai-log-trace@ailogtrace

# or non-interactively:
claude plugin marketplace add architonixlabs/ailogtrace
claude plugin install ai-log-trace@ailogtrace
```

Restart Claude Code and your sessions record to `~/.ailogtrace/`. To *inspect* them (the
`ailogtrace` CLI and dashboard have real dependencies), use Option A's clone+build. Details and the
first-run acceptance check are in [GETTING_STARTED.md](GETTING_STARTED.md).

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

## Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** — install, wire-up, first-run acceptance check
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup and ground rules
- **[SECURITY.md](SECURITY.md)** — reporting vulnerabilities, threat model, honest limits
- **[docs/superpowers/](docs/superpowers/)** — design spec, implementation plan, hook mapping

## Contributing & Security

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) first. For security
issues, follow [SECURITY.md](SECURITY.md) (report privately, not via public issues).

## License

[MIT](LICENSE) © 2026 Architonix Labs.
