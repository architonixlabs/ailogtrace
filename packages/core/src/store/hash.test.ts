import { describe, it, expect } from "vitest";
import { GENESIS_HASH, canonicalJson, hashEvent } from "./hash.js";

describe("hash", () => {
  it("genesis is 64 zeros", () => {
    expect(GENESIS_HASH).toBe("0".repeat(64));
  });
  it("canonicalJson sorts keys stably", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("hashEvent is deterministic and prevHash-sensitive", () => {
    const ev = { id: "x", seq: 0 };
    expect(hashEvent(GENESIS_HASH, ev)).toBe(hashEvent(GENESIS_HASH, ev));
    expect(hashEvent(GENESIS_HASH, ev)).not.toBe(hashEvent("a".repeat(64), ev));
  });
});
