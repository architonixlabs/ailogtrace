# Hook Event → Canonical Kind Mapping

*Status: assumed mapping verified against a **simulated** payload pipeline. Live-session
payload-key confirmation is still OPEN (see "Open verification" below).*

## What is proven

The full capture spine is proven end-to-end with a simulated feed (Task 11):

```
node packages/hook/dist/index.js <kind> <<< '<hook-json>'
  → ~/.ailogtrace/spool/<sessionId>.ndjson   (5/5 lines spooled)
  → ailogtrace dump                          (5/5 events, ordered #000..#004)
  → ailogtrace verify                        (chain intact ✓)
  → redaction                                (fake AWS key + redis URL → 0 plaintext in audit.db)
```

Capture fidelity on the simulated session: **100%** of fed events land, ordered and
hash-chained. The deterministic spine (spool → normalize → redact → hash-chain → dump/verify)
meets the Week-1 gate for the events it is given.

## Mapping table (hooks.json argv → canonical EventKind)

| Claude Code hook event | hook argv `kind` | canonical `EventKind` |
|---|---|---|
| `SessionStart`      | `session_start`     | `session_start` |
| `UserPromptSubmit`  | `user_prompt`       | `user_prompt` |
| `PreToolUse`        | `tool_call_start`   | `tool_call_start` |
| `PostToolUse`       | `tool_call_end`     | `tool_call_end` |
| `Notification`      | `permission_request`| `permission_request` |
| `SubagentStop`      | `subagent_stop`     | `subagent_stop` |
| `Stop`              | `final_output`      | `final_output` |
| `SessionEnd`        | `session_end`       | `session_end` |

`mapKind()` passes through any valid `EventKind` and falls back to `agent_message` for
anything unrecognized, so a future hook that emits a canonical kind directly is respected.

## Open verification (must confirm against a LIVE Claude Code session)

The spooler currently reads the session id from `session_id` (falling back to `sessionId`,
then `"unknown"`). Before declaring the MVP capture complete, run `ailogtrace init` in a
scratch project, run a real one-prompt session that reads and writes a file, then
`ailogtrace dump` and confirm:

1. **Session-id key** — is it `session_id` on every hook payload? (spooler: `packages/hook/src/spool.ts`)
2. **Payload shape per event** — capture one real payload of each of the 8 events; confirm the
   keys we surface (`tool_name`, `tool_input`, `prompt`, etc.) exist.
3. **file_change / command_run / test_result** — these canonical kinds are NOT emitted yet;
   the skeleton records generic `tool_call_start`/`tool_call_end`. V1 derives the finer kinds
   from `PostToolUse` `tool_name` (Write/Edit → file_change, Bash → command_run, etc.).
4. **Coverage ≥ ~90%** of meaningful terminal actions. If below, fix `hooks.json` + `mapKind`
   before building anything downstream.

Record the observed real payloads in this file once confirmed, replacing this section with the
verified shapes.
