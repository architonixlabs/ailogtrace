// Visual grouping + colour for each canonical EventKind, plus facet groups used
// by the timeline filter chips. Colours read on both dark and light themes.
export interface KindStyle {
  label: string;
  color: string;
  group: string;
}

const STYLES: Record<string, KindStyle> = {
  user_prompt: { label: "prompt", color: "#8b5cf6", group: "prompt" },
  agent_message: { label: "message", color: "#a78bfa", group: "prompt" },
  tool_call_start: { label: "tool start", color: "#3b82f6", group: "tool" },
  tool_call_end: { label: "tool end", color: "#2563eb", group: "tool" },
  file_change: { label: "file change", color: "#06b6d4", group: "file" },
  file_read: { label: "file read", color: "#0891b2", group: "file" },
  command_run: { label: "command", color: "#f97316", group: "command" },
  test_result: { label: "test", color: "#22c55e", group: "test" },
  error: { label: "error", color: "#ef4444", group: "error" },
  retry: { label: "retry", color: "#f59e0b", group: "error" },
  permission_request: { label: "permission", color: "#eab308", group: "control" },
  approval: { label: "approved", color: "#22c55e", group: "control" },
  rejection: { label: "rejected", color: "#ef4444", group: "control" },
  subagent_start: { label: "subagent start", color: "#6366f1", group: "tool" },
  subagent_stop: { label: "subagent end", color: "#4f46e5", group: "tool" },
  session_start: { label: "session start", color: "#64748b", group: "control" },
  session_end: { label: "session end", color: "#64748b", group: "control" },
  final_output: { label: "final output", color: "#14b8a6", group: "control" },
};

export function kindStyle(kind: string): KindStyle {
  return STYLES[kind] ?? { label: kind, color: "#64748b", group: "other" };
}
