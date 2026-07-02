import { randomUUID } from "node:crypto";
import { redactPayload, EventKind, type AppendInput, type AiEvent } from "@ailogtrace/core";

export interface SpoolLine {
  ts: string;
  kind: string;
  sessionId: string;
  hook: Record<string, unknown>;
}

// The hook argv values are already canonical EventKind names (session_start,
// user_prompt, tool_call_start/end, permission_request, subagent_stop,
// final_output, session_end). Any valid EventKind passes through; anything
// unrecognized falls back to agent_message.
// V1: derive file_change/file_read/command_run/test_result from PostToolUse
// payloads by inspecting tool_name instead of relying on the argv kind.
const VALID_KINDS = new Set<string>(EventKind.options);

export function mapKind(hookKind: string): AiEvent["kind"] {
  return (VALID_KINDS.has(hookKind) ? hookKind : "agent_message") as AiEvent["kind"];
}

const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Create", "Update"]);
const FILE_READ_TOOLS = new Set(["Read", "NotebookRead"]);
const TEST_CMD = /\b(jest|vitest|mocha|pytest|go test|cargo test|(?:npm|pnpm|yarn)\s+(?:run\s+)?test)\b/i;

// Refine a completed tool cycle (PostToolUse → tool_call_end) into the semantic
// canonical kind based on which tool ran, so the audit trail records "a file
// changed" / "a command ran" / "tests ran" rather than a generic tool call.
// PreToolUse stays tool_call_start (the intent). Unknown tools stay tool_call_end.
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function deriveKind(hookKind: string, hook: Record<string, unknown>): AiEvent["kind"] {
  if (hookKind === "tool_call_end") {
    const tool = asString(hook.tool_name);
    if (FILE_WRITE_TOOLS.has(tool)) return "file_change";
    if (FILE_READ_TOOLS.has(tool)) return "file_read";
    if (tool === "Bash") {
      const input = hook.tool_input as Record<string, unknown> | undefined;
      const cmd = asString(input?.command);
      return TEST_CMD.test(cmd) ? "test_result" : "command_run";
    }
  }
  return mapKind(hookKind);
}

export function normalize(line: SpoolLine): AppendInput {
  const kind = deriveKind(line.kind, line.hook ?? {});
  const { payload, redactions } = redactPayload(line.hook ?? {});
  return {
    id: randomUUID(),
    sessionId: line.sessionId,
    ts: line.ts,
    source: "hook",
    kind,
    payload,
    redactions,
  };
}
