import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { renderMarkdown, renderJson, renderMermaid, exportSession } from "./export.js";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function seed(): AuditStore {
  const s = new AuditStore(":memory:");
  s.append({ id: "11111111-1111-4111-8111-111111111111", sessionId: "s1", ts: "2026-07-02T00:00:00Z", source: "hook", kind: "user_prompt", payload: { prompt: "add rate limiting" } });
  s.append({ id: "22222222-2222-4222-8222-222222222222", sessionId: "s1", ts: "2026-07-02T00:00:01Z", source: "hook", kind: "tool_call_start", payload: { tool: "Write" }, redactions: [{ ruleId: "builtin.aws-access-key", field: "payload", count: 1 }] });
  return s;
}

describe("renderMermaid", () => {
  it("emits a flowchart with a node per event and sequential edges", () => {
    const m = renderMermaid(seed().getEvents("s1"));
    expect(m).toMatch(/^flowchart LR/);
    expect(m).toContain('N0["0: user_prompt"]');
    expect(m).toContain("N0 -->|triggered| N1");
  });
});

describe("renderMarkdown", () => {
  it("includes summary, timeline, mermaid graph, and redaction appendix", () => {
    const md = renderMarkdown(seed(), "s1");
    expect(md).toContain("# AILogTrace Session Report");
    expect(md).toContain("**Events:** 2");
    expect(md).toContain("intact");
    expect(md).toContain("```mermaid");
    expect(md).toContain("builtin.aws-access-key");
    expect(md).toContain("## Methodology");
  });
});

describe("renderJson", () => {
  it("returns events, graph, and verify status", () => {
    const j = renderJson(seed(), "s1");
    expect(j.sessionId).toBe("s1");
    expect(j.events).toHaveLength(2);
    expect(j.graph.edges).toHaveLength(1);
    expect(j.verify.ok).toBe(true);
  });
});

describe("exportSession", () => {
  it("writes a markdown file to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "alt-exp-"));
    const file = exportSession(seed(), "s1", "md", dir);
    expect(file.endsWith("s1.md")).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("# AILogTrace Session Report");
  });
  it("writes a json file to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "alt-exp-"));
    const file = exportSession(seed(), "s1", "json", dir);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.sessionId).toBe("s1");
  });
});
