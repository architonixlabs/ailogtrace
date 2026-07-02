import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { statusReport, dumpSession } from "./report.js";

function seed(): AuditStore {
  const s = new AuditStore(":memory:");
  s.append({ id: "11111111-1111-4111-8111-111111111111", sessionId: "s1", ts: "2026-07-02T00:00:00Z", source: "hook", kind: "user_prompt", payload: { prompt: "add rate limiting" } });
  s.append({ id: "22222222-2222-4222-8222-222222222222", sessionId: "s1", ts: "2026-07-02T00:00:01Z", source: "hook", kind: "file_change", payload: { path: "api.ts" } });
  return s;
}

describe("report", () => {
  it("statusReport shows session and event counts", () => {
    const r = statusReport(seed());
    expect(r).toMatch(/2 events/);
    expect(r).toMatch(/1 session/);
  });
  it("dumpSession lists events in order with kinds", () => {
    const r = dumpSession(seed(), "s1");
    const iPrompt = r.indexOf("user_prompt");
    const iFile = r.indexOf("file_change");
    expect(iPrompt).toBeGreaterThanOrEqual(0);
    expect(iFile).toBeGreaterThan(iPrompt);
  });
});
