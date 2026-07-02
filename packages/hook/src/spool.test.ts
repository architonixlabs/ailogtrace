import { describe, it, expect } from "vitest";
import { toSpoolLine } from "./spool.js";

describe("toSpoolLine", () => {
  it("wraps a hook payload into one ndjson line with sessionId + kind", () => {
    const line = toSpoolLine("user_prompt", JSON.stringify({ session_id: "sess_9", prompt: "hi" }));
    expect(line.endsWith("\n")).toBe(true);
    const obj = JSON.parse(line);
    expect(obj.kind).toBe("user_prompt");
    expect(obj.sessionId).toBe("sess_9");
    expect(obj.hook.prompt).toBe("hi");
  });

  it("never throws on malformed JSON and defaults sessionId to 'unknown'", () => {
    const line = toSpoolLine("session_start", "not json {");
    const obj = JSON.parse(line);
    expect(obj.sessionId).toBe("unknown");
    expect(obj.kind).toBe("session_start");
  });
});
