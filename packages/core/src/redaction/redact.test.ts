import { describe, it, expect } from "vitest";
import { redactPayload } from "./redact.js";

describe("redactPayload", () => {
  it("masks a fake AWS key, redis url, and PEM header", () => {
    const { payload, redactions } = redactPayload({
      diff: "AKIAIOSFODNN7EXAMPLE and redis://user:pass@host:6379 and -----BEGIN RSA PRIVATE KEY-----",
    });
    const s = JSON.stringify(payload);
    expect(s).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(s).not.toContain("redis://user:pass@host:6379");
    expect(s).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(redactions.length).toBeGreaterThanOrEqual(3);
  });

  it("masks a high-entropy token", () => {
    const { payload } = redactPayload({ note: "token=Xa8Kd93Lm2Qp0Zr7Bv4Nc6Tf1Hj5Wg" });
    expect(JSON.stringify(payload)).not.toContain("Xa8Kd93Lm2Qp0Zr7Bv4Nc6Tf1Hj5Wg");
  });

  it("leaves clean payloads untouched", () => {
    const { payload, redactions } = redactPayload({ path: "src/api.ts", lines: 84 });
    expect(payload).toEqual({ path: "src/api.ts", lines: 84 });
    expect(redactions).toEqual([]);
  });
});
