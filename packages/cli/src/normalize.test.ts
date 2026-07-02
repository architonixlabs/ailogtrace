import { describe, it, expect } from "vitest";
import { mapKind, normalize } from "./normalize.js";

describe("mapKind", () => {
  it("maps known hook kinds and falls back to agent_message", () => {
    expect(mapKind("user_prompt")).toBe("user_prompt");
    expect(mapKind("tool_call_start")).toBe("tool_call_start");
    expect(mapKind("mystery")).toBe("agent_message");
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
