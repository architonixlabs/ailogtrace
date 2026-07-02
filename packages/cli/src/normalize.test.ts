import { describe, it, expect } from "vitest";
import { mapKind, deriveKind, normalize } from "./normalize.js";

describe("mapKind", () => {
  it("maps known hook kinds and falls back to agent_message", () => {
    expect(mapKind("user_prompt")).toBe("user_prompt");
    expect(mapKind("tool_call_start")).toBe("tool_call_start");
    expect(mapKind("mystery")).toBe("agent_message");
  });
});

describe("deriveKind", () => {
  it("refines a completed Write/Edit into file_change", () => {
    expect(deriveKind("tool_call_end", { tool_name: "Write" })).toBe("file_change");
    expect(deriveKind("tool_call_end", { tool_name: "Edit" })).toBe("file_change");
  });
  it("refines a completed Read into file_read", () => {
    expect(deriveKind("tool_call_end", { tool_name: "Read" })).toBe("file_read");
  });
  it("refines a Bash test command into test_result and other commands into command_run", () => {
    expect(deriveKind("tool_call_end", { tool_name: "Bash", tool_input: { command: "pnpm test" } })).toBe("test_result");
    expect(deriveKind("tool_call_end", { tool_name: "Bash", tool_input: { command: "vitest run" } })).toBe("test_result");
    expect(deriveKind("tool_call_end", { tool_name: "Bash", tool_input: { command: "ls -la" } })).toBe("command_run");
  });
  it("leaves PreToolUse (tool_call_start) and unknown tools untouched", () => {
    expect(deriveKind("tool_call_start", { tool_name: "Write" })).toBe("tool_call_start");
    expect(deriveKind("tool_call_end", { tool_name: "WebFetch" })).toBe("tool_call_end");
  });
});

describe("normalize", () => {
  it("produces an AppendInput and redacts secrets in the payload", () => {
    const input = normalize({
      ts: "2026-07-02T00:00:00Z", kind: "file_change", sessionId: "s1",
      hook: { diff: "AKIAIOSFODNN7EXAMPLE" },
    });
    expect(input.sessionId).toBe("s1");
    expect(input.kind).toBe("file_change");
    expect(JSON.stringify(input.payload)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(input.redactions?.length).toBeGreaterThanOrEqual(1);
    expect(input.id).toMatch(/[0-9a-f-]{36}/);
  });
});
