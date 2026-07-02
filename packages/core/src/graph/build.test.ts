import { describe, it, expect } from "vitest";
import { buildGraph } from "./build.js";
import type { AiEvent } from "../schema/event.js";

function ev(id: string, kind: AiEvent["kind"], seq: number): AiEvent {
  return { id, sessionId: "s1", seq, ts: "2026-07-02T00:00:00Z", source: "hook",
    kind, payload: {}, redactions: [], provenance: "observed",
    prevHash: "0".repeat(64), hash: id.padEnd(64, "0") };
}

describe("buildGraph (stub)", () => {
  it("makes one node per event and sequential triggered edges", () => {
    const g = buildGraph([ev("a", "user_prompt", 0), ev("b", "tool_call_start", 1), ev("c", "file_change", 2)]);
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(g.edges).toEqual([
      { id: "edge_0", from: "a", to: "b", type: "triggered" },
      { id: "edge_1", from: "b", to: "c", type: "triggered" },
    ]);
    expect(g.nodes.every((n) => n.provenance === "observed")).toBe(true);
  });
});
