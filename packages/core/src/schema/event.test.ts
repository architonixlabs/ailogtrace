import { describe, it, expect } from "vitest";
import { AiEvent } from "./event.js";

const valid = {
  id: "7f9c2a1e-3b4d-4c8a-9e21-aa10f2d4b901",
  sessionId: "sess_1", seq: 0, ts: "2026-07-02T09:47:12.480Z",
  source: "hook", kind: "file_change", payload: { path: "a.ts" },
  prevHash: "0".repeat(64), hash: "a".repeat(64),
};

describe("AiEvent", () => {
  it("accepts a valid event and defaults redactions/provenance", () => {
    const e = AiEvent.parse(valid);
    expect(e.redactions).toEqual([]);
    expect(e.provenance).toBe("observed");
  });
  it("rejects an unknown kind", () => {
    expect(() => AiEvent.parse({ ...valid, kind: "nope" })).toThrow();
  });
  it("rejects a missing required field", () => {
    const { sessionId, ...bad } = valid;
    expect(() => AiEvent.parse(bad)).toThrow();
  });
});
