import { describe, it, expect } from "vitest";
import { AuditStore } from "@ailogtrace/core";
import { buildServer } from "./server.js";

function seed(): AuditStore {
  const s = new AuditStore(":memory:");
  s.append({ id: "11111111-1111-4111-8111-111111111111", sessionId: "s1", ts: "2026-07-02T00:00:00Z", source: "hook", kind: "user_prompt", payload: { prompt: "hi" } });
  return s;
}

describe("api", () => {
  it("GET /api/sessions returns the session list", async () => {
    const app = buildServer(seed());
    const res = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].sessionId).toBe("s1");
    await app.close();
  });

  it("GET /api/sessions/:id/events returns ordered events", async () => {
    const app = buildServer(seed());
    const res = await app.inject({ method: "GET", url: "/api/sessions/s1/events" });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].kind).toBe("user_prompt");
    await app.close();
  });
});
