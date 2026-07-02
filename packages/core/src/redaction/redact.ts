import type { Redaction } from "../schema/event.js";

export interface RedactionRule {
  id: string;
  pattern: RegExp;
}

export const BUILTIN_RULES: RedactionRule[] = [
  { id: "builtin.aws-access-key", pattern: /AKIA[0-9A-Z]{16}/g },
  { id: "builtin.redis-url", pattern: /redis:\/\/[^\s"']+/g },
  { id: "builtin.pem", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: "builtin.assignment-secret", pattern: /(?:api[_-]?key|secret|token|password)["'\s:=]+([A-Za-z0-9\-_]{16,})/gi },
];

export interface RedactResult {
  payload: Record<string, unknown>;
  redactions: Redaction[];
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function redactString(value: string, counts: Map<string, number>): string {
  let out = value;
  for (const rule of BUILTIN_RULES) {
    out = out.replace(rule.pattern, () => {
      counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
      return `«redacted:${rule.id}»`;
    });
  }
  // Entropy pass: mask long high-entropy tokens (likely secrets)
  out = out.replace(/[A-Za-z0-9\-_]{20,}/g, (tok) => {
    if (tok.includes("redacted:")) return tok;
    if (shannonEntropy(tok) >= 3.5) {
      counts.set("builtin.entropy", (counts.get("builtin.entropy") ?? 0) + 1);
      return "«redacted:builtin.entropy»";
    }
    return tok;
  });
  return out;
}

function walk(value: unknown, counts: Map<string, number>): unknown {
  try {
    if (typeof value === "string") return redactString(value, counts);
    if (Array.isArray(value)) return value.map((v) => walk(v, counts));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v, counts);
      }
      return out;
    }
    return value;
  } catch {
    // fail-closed: never leak plaintext on error
    counts.set("builtin.failclosed", (counts.get("builtin.failclosed") ?? 0) + 1);
    return "«redacted:builtin.failclosed»";
  }
}

export function redactPayload(payload: Record<string, unknown>): RedactResult {
  const counts = new Map<string, number>();
  const redacted = walk(payload, counts) as Record<string, unknown>;
  const redactions: Redaction[] = [...counts.entries()].map(([ruleId, count]) => ({
    ruleId, field: "payload", count,
  }));
  return { payload: redacted, redactions };
}
