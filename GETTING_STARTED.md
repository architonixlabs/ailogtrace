# Getting Started with AILogTrace

*Flight recorder for AI-assisted development — install it, run a Claude Code session, and
inspect exactly what the agent did.*

---

## Is it ready?

**Ready to install and dogfood locally — yes.** The full pipeline works and is tested
(33 passing tests): hooks spool events → secrets are redacted → events land in an append-only,
hash-chained SQLite store → you can `dump`, `verify`, `export` a report, and browse a dashboard.

**One caveat, and it's the whole reason to test it:** every guarantee above has been proven with
*simulated* hook payloads. It has **not yet been confirmed against the real payload key names
Claude Code sends** on your machine (e.g. `session_id`, `tool_name`). Running the steps below is
exactly how we close that gap. If some events don't show up, that's expected first-run friction —
see [Troubleshooting](#troubleshooting), and the fix is a one-line mapping change.

So: **ready to try, not yet ready to depend on.** Treat this first run as the acceptance test.

---

## Prerequisites

- **Node.js 22+** (uses the built-in `node:sqlite`; check with `node -v`)
- **pnpm** (`npm i -g pnpm`)
- **Claude Code** (desktop, CLI, or IDE extension)

---

## 1. Install from git and build

Clone the repo and build it:

```bash
git clone https://github.com/architonixlabs/ailogtrace.git
cd ailogtrace
pnpm install
pnpm -r build
pnpm -r test        # optional: expect 33 passing
```

This produces the runnable artifacts the hooks call (`packages/hook/dist/index.js`,
`packages/cli/dist/cli.js`, `apps/dashboard/dist/`).

> **Prefer a one-command plugin install?** See
> [Install as a Claude Code plugin](#alternative-install-as-a-claude-code-plugin) below. That route
> gets you *capture* with no clone/build, but the `ailogtrace` CLI and dashboard (which have real
> dependencies) still need this clone+build. For the full experience, do this step.

> Windows note: paths below use forward slashes; PowerShell accepts them. If you copy the repo
> elsewhere, re-run `ailogtrace init` (step 2) so the hook paths point at the new location.

### Optional: a short `ailogtrace` command

The examples use `node <repo>/packages/cli/dist/cli.js …`. For a shorter command, add an alias
(most reliable cross-platform — no linking needed):

```bash
# bash / zsh (add to ~/.bashrc or ~/.zshrc)
alias ailogtrace='node "<repo>/ai-log-trace/packages/cli/dist/cli.js"'
```

```powershell
# PowerShell (add to $PROFILE)
function ailogtrace { node "<repo>\ai-log-trace\packages\cli\dist\cli.js" @args }
```

Everywhere below, `ailogtrace <cmd>` means either the alias **or**
`node "<repo>/ai-log-trace/packages/cli/dist/cli.js" <cmd>`.

---

## 2. Wire it into a project

`cd` into the project you want to record (any git repo you use Claude Code in), then:

```bash
node "<path-to>/ai-log-trace/packages/cli/dist/cli.js" init
```

This writes `.claude/settings.local.json` in that project with hooks for all eight lifecycle
events, each pointing at the built spooler with an absolute path. It's idempotent and merges into
any existing settings. (`.claude/settings.local.json` is normally git-ignored, so this stays local
to you.)

---

## Alternative: install as a Claude Code plugin

Instead of per-project `init`, you can install AILogTrace as a Claude Code plugin straight from
GitHub. The repo ships a marketplace manifest (`.claude-plugin/marketplace.json`) and the
**dependency-free compiled hook** (`packages/hook/dist/`), so the capture hooks work with **no
clone and no build**:

```bash
# inside Claude Code:
/plugin marketplace add architonixlabs/ailogtrace
/plugin install ai-log-trace@ailogtrace
```

```bash
# ...or non-interactively from a shell:
claude plugin marketplace add architonixlabs/ailogtrace
claude plugin install ai-log-trace@ailogtrace
```

Then **restart Claude Code**. Hooks register globally (all projects) via `${CLAUDE_PLUGIN_ROOT}`,
and sessions record to `~/.ailogtrace/`.

**Important caveat.** Claude Code *copies* a plugin on install — it does **not** run `pnpm install`
or build it. The hook is dependency-free so capture works, but the `ailogtrace` **CLI and dashboard
have real dependencies** and are **not** available from the plugin install. To inspect your
recorded sessions (`dump`, `verify`, `export`, `ui`), do the clone + build in
[step 1](#1-install-from-git-and-build) and run the CLI from there — it reads the same
`~/.ailogtrace/` store the plugin writes to.

For a first test, per-project `init` (above) is the simplest fully-featured path; the plugin route
is best once you want capture on across every project without wiring each one.

---

## 3. Record a real session

1. **Restart Claude Code** in that project (hooks are read at session start).
2. Do something real and small — e.g. *"read package.json and add a `hello` script, then run it."*
   That exercises a prompt, a file read, a file change, and a command.
3. End the session (or just keep going — events stream as you work).

Nothing you do waits on AILogTrace: the hook only appends one line to a spool file and exits.

---

## 4. Inspect what happened

All reads auto-drain the spool first, so they always reflect the latest session.

```bash
ailogtrace status              # sessions + event count + chain state
ailogtrace dump                # ordered event stream for the latest session
ailogtrace dump --session <id> # a specific session
ailogtrace verify              # recompute the hash chain (tamper check)
```

Export an audit report (Markdown with an embedded Mermaid workflow graph, or JSON):

```bash
ailogtrace export --format md --out ./audit      # ./audit/<sessionId>.md
ailogtrace export --format json --out ./audit
```

Browse it visually:

```bash
ailogtrace ui                  # http://127.0.0.1:4477
```

The dashboard shows a session list → a color-coded event timeline → a detail panel with each
event's redacted payload, provenance, redactions, and hash.

---

## 5. What "working" looks like (the acceptance check)

After a real session, `ailogtrace dump` should show a stream roughly like:

```text
#000 …Z session_start
#001 …Z user_prompt
#002 …Z tool_call_start
#003 …Z file_read
#004 …Z file_change
#005 …Z command_run
#006 …Z final_output
```

You're looking for **~90%+ of the meaningful things you saw in the terminal** to be present and in
order, and `ailogtrace verify` to say `chain intact ✓`. If so, capture is solid. If not, see below.

---

## Troubleshooting

**No sessions / no events after a session.**
- Confirm you restarted Claude Code *after* `init`.
- Confirm the built files exist: `packages/hook/dist/index.js` should be present (`pnpm -r build`).
- Look for the spool: `~/.ailogtrace/spool/` should contain (or have contained) a `<sessionId>.ndjson`.
- Check `~/.ailogtrace/logs/hook-errors.log` for any spooler errors.

**Some event types are missing (e.g. tool calls).**
- This is the known open item. Open a spool file and look at the raw `hook` object to see the real
  payload keys Claude Code sends. If the session id lives under a different key than `session_id`,
  events land under `sessionId: "unknown"`.
- The two places to adjust are `packages/hook/src/spool.ts` (session-id extraction) and
  `packages/cli/src/normalize.ts` (`deriveKind`, `mapKind`). Rebuild after editing.
- If `PreToolUse`/`PostToolUse` never fire, try removing the `"matcher": "*"` line for those two
  events in `.claude/settings.local.json` (an empty/absent matcher matches all tools).
- Please capture one real payload of each event and note it in `docs/superpowers/HOOK_MAPPING.md`.

**`node -v` shows < 22.** Upgrade Node; `node:sqlite` isn't available on older versions.

---

## Where your data lives (privacy)

Everything is local. Nothing is sent anywhere.

- Store: `~/.ailogtrace/audit.db` (append-only, hash-chained)
- Spool (transient, consumed then deleted): `~/.ailogtrace/spool/`
- Logs: `~/.ailogtrace/logs/`

Secrets are redacted **before** they are written to the store — the raw values never touch the DB,
only redaction counts are recorded. The store is *tamper-evident* (hash chain), not tamper-proof;
encryption-at-rest is a later milestone.

---

## Stop / uninstall

- **Pause recording:** delete the `.claude/settings.local.json` hooks block (or the whole file if
  AILogTrace added it), then restart Claude Code.
- **Wipe captured data:** delete `~/.ailogtrace/`.

---

## What's here vs. deferred

**Working now:** capture, redaction, hash-chain + verify, semantic kind derivation
(file/command/test), Markdown/JSON export with Mermaid graph, timeline dashboard.

**Deferred (V1):** LLM decision inference, risk scoring, diff viewer, React Flow graph, PDF/HTML
export, encryption-at-rest, `.ailogtraceignore`, full-text search, non-Claude-Code adapters. See
[the design spec](docs/superpowers/specs/2026-07-02-ailogtrace-mvp-skeleton-design.md) and the
`// V1:` markers in the source.
