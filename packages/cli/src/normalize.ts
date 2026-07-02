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
