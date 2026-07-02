import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EVENTS: Array<[string, string, boolean]> = [
  ["SessionStart", "session_start", false],
  ["UserPromptSubmit", "user_prompt", false],
  ["PreToolUse", "tool_call_start", true],
  ["PostToolUse", "tool_call_end", true],
  ["Notification", "permission_request", false],
  ["SubagentStop", "subagent_stop", false],
  ["Stop", "final_output", false],
  ["SessionEnd", "session_end", false],
];

export function buildHookSettings(pluginRoot: string): object {
  const hooks: Record<string, unknown> = {};
  for (const [event, kind, hasMatcher] of EVENTS) {
    const entry: Record<string, unknown> = {
      hooks: [{ type: "command", command: `node "${pluginRoot}/packages/hook/dist/index.js" ${kind}` }],
    };
    if (hasMatcher) entry.matcher = "*";
    hooks[event] = [entry];
  }
  return { hooks };
}

export function writeInit(cwd: string, pluginRoot: string): string {
  const dir = join(cwd, ".claude");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "settings.local.json");
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const merged = { ...existing, ...buildHookSettings(pluginRoot) };
  writeFileSync(file, JSON.stringify(merged, null, 2));
  return file;
}
