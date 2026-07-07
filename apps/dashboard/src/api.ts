import type { Session, AiEvent } from "./types.js";

export async function getSessions(): Promise<Session[]> {
  const r = await fetch("/api/sessions");
  if (!r.ok) throw new Error(`sessions ${r.status}`);
  return r.json();
}

export async function getEvents(sessionId: string): Promise<AiEvent[]> {
  const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
  if (!r.ok) throw new Error(`events ${r.status}`);
  return r.json();
}

export async function getVerify(): Promise<{ ok: boolean; brokenAtRowid?: number }> {
  const r = await fetch("/api/verify");
  if (!r.ok) throw new Error(`verify ${r.status}`);
  return r.json();
}
