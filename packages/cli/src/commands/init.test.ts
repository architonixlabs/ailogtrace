import { describe, it, expect } from "vitest";
import { buildHookSettings } from "./init.js";

describe("buildHookSettings", () => {
  it("wires all eight lifecycle events to the spooler with the plugin root", () => {
    const s = buildHookSettings("/plugins/ai-log-trace") as { hooks: Record<string, unknown> };
    const keys = Object.keys(s.hooks);
    expect(keys).toEqual(expect.arrayContaining([
      "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
      "Notification", "SubagentStop", "Stop", "SessionEnd",
    ]));
    expect(JSON.stringify(s)).toContain("/plugins/ai-log-trace");
    expect(JSON.stringify(s)).toContain("packages/hook/dist/index.js");
  });
});
