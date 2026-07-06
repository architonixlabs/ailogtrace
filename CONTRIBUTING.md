# Contributing to AILogTrace

Thanks for your interest. AILogTrace is a local-first audit/flight-recorder for AI coding agents;
correctness and privacy are the two things we never compromise on.

## Ground rules

1. **Never weaken redaction or the append-only guarantee.** Redaction runs *before* persistence and
   is fail-closed. The `events` table is append-only (SQLite triggers) and hash-chained. Changes
   that could let a raw secret reach the store, or that make history mutable, will not be accepted
   without an extremely good reason and matching tests.
2. **Capture must never block or crash the agent.** The hook spooler appends one line and exits; it
   swallows all errors. Keep it that way.
3. **Observed vs. inferred.** Deterministically captured events are `observed`. Anything derived by
   an LLM must be labeled `inferred` and cite its source events. Don't blur the line.

## Development setup

```bash
pnpm install
pnpm -r build
pnpm -r test        # expect all green
```

Requires **Node.js 22+** (uses the built-in `node:sqlite`) and **pnpm**.

## Project layout

| Path | Responsibility |
|---|---|
| `packages/core` | Event schema, hash chain, append-only SQLite store, redaction, graph builder |
| `packages/hook` | Tiny non-blocking spooler invoked by Claude Code hooks |
| `packages/cli`  | `ailogtrace` CLI + collector, normalization, Fastify read API, exports |
| `apps/dashboard`| React + Vite local dashboard |

## Workflow

- **Test-driven.** Write a failing test, make it pass, keep changes small. We use `vitest`.
- **One responsibility per file.** If a file is growing to do several things, split it.
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), scoped to a
  package where it helps (e.g. `feat(cli): …`).
- **`node:sqlite` note:** it is loaded via `createRequire` (see `packages/core/src/store/store.ts`)
  so bundlers/test runners don't mangle the specifier. Follow that pattern for any new use.

## Before opening a PR

- `pnpm -r build && pnpm -r test` pass.
- New behavior has tests; the redaction corpus still shows zero plaintext secrets in the DB.
- Docs updated if you changed the CLI surface, hook mapping, or data model.

## Reporting security issues

Please do **not** file public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
