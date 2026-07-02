import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { ingestSpoolFile } from "./collector.js";
import { writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ingestSpoolFile", () => {
  it("ingests each ndjson line as an ordered event and deletes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "alt-"));
    const file = join(dir, "s1.ndjson");
    writeFileSync(file,
      JSON.stringify({ ts: "2026-07-02T00:00:00Z", kind: "user_prompt", sessionId: "s1", hook: { prompt: "hi" } }) + "\n" +
      JSON.stringify({ ts: "2026-07-02T00:00:01Z", kind: "tool_call_start", sessionId: "s1", hook: { tool: "Read" } }) + "\n");
    const store = new AuditStore(":memory:");
    const n = ingestSpoolFile(store, file);
    expect(n).toBe(2);
    expect(store.getEvents("s1").map((e) => e.kind)).toEqual(["user_prompt", "tool_call_start"]);
    expect(existsSync(file)).toBe(false);
    store.close();
  });
});
