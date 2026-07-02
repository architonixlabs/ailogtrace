import { describe, it, expect } from "vitest";
import { AuditStore } from "./store.js";

function mk() { return new AuditStore(":memory:"); }
const base = { sessionId: "s1", ts: "2026-07-02T00:00:00.000Z", source: "hook" as const, kind: "user_prompt" as const, payload: { text: "hi" } };

describe("AuditStore", () => {
  it("appends events with a continuous hash chain and increasing seq", () => {
    const s = mk();
    const a = s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    const b = s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
    expect(b.prevHash).toBe(a.hash);
    expect(s.verify().ok).toBe(true);
    s.close();
  });

  it("getEvents returns events in seq order for a session", () => {
    const s = mk();
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    const evs = s.getEvents("s1");
    expect(evs.map((e) => e.seq)).toEqual([0, 1]);
    s.close();
  });

  it("verify detects tampering", async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
    const file = "test-tamper.db";
    const { rmSync } = await import("node:fs");
    rmSync(file, { force: true });
    const s = new AuditStore(file);
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    s.append({ id: "22222222-2222-4222-8222-222222222222", ...base });
    s.close();
    const raw = new DatabaseSync(file);
    raw.exec("DROP TRIGGER IF EXISTS events_no_update");
    raw.exec("UPDATE events SET payload = '{\"text\":\"HACKED\"}' WHERE seq = 0");
    raw.close();
    const s2 = new AuditStore(file);
    expect(s2.verify().ok).toBe(false);
    s2.close();
    rmSync(file, { force: true });
  });

  it("rejects direct DELETE (append-only)", () => {
    const s = mk();
    s.append({ id: "11111111-1111-4111-8111-111111111111", ...base });
    expect(() => (s as unknown as { db: { exec(sql: string): void } }).db.exec("DELETE FROM events")).toThrow(/append-only/);
    s.close();
  });
});
