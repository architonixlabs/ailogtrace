// Visual grouping + colour for each canonical EventKind. Keeps the timeline
// scannable: prompts, tool calls, file effects, commands/tests, and control
// events each read distinctly.
interface KindStyle {
  label: string;
  color: string;
  group: string;
}

const STYLES: Record<string, KindStyle> = {
  user_prompt: { label: "prompt", color: "#6d28d9", group: "prompt" },
  agent_message: { label: "message", color: "#7c3aed", group: "prompt" },
  tool_call_start: { label: "tool ▶", color: "#2563eb", group: "tool" },
  tool_call_end: { label: "tool ■", color: "#1d4ed8", group: "tool" },
  file_change: { label: "file change", color: "#0891b2", group: "file" },
  file_read: { label: "file read", color: "#0e7490", group: "file" },
  command_run: { label: "command", color: "#c2410c", group: "command" },
  test_result: { label: "test", color: "#15803d", group: "test" },
  error: { label: "error", color: "#b91c1c", group: "error" },
  retry: { label: "retry", color: "#b45309", group: "error" },
  permission_request: { label: "permission", color: "#a16207", group: "control" },
  approval: { label: "approved", color: "#15803d", group: "control" },
  rejection: { label: "rejected", color: "#b91c1c", group: "control" },
  subagent_start: { label: "subagent ▶", color: "#4f46e5", group: "tool" },
  subagent_stop: { label: "subagent ■", color: "#4338ca", group: "tool" },
  session_start: { label: "session start", color: "#334155", group: "control" },
  session_end: { label: "session end", color: "#334155", group: "control" },
  final_output: { label: "final output", color: "#0f766e", group: "control" },
};

export function kindStyle(kind: string): KindStyle {
  return STYLES[kind] ?? { label: kind, color: "#475569", group: "other" };
}

export function timeOf(ts: string): string {
  // best-effort HH:MM:SS from an ISO timestamp
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(ts);
  return m ? m[1] : ts;
}
