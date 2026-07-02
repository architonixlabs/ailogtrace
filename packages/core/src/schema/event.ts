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
