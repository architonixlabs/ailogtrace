import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function hashEvent(prevHash: string, eventWithoutHash: unknown): string {
  return createHash("sha256").update(prevHash + canonicalJson(eventWithoutHash)).digest("hex");
}
