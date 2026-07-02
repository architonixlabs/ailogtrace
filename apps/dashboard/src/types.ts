export interface Session {
  sessionId: string;
  count: number;
  startedAt: string;
  endedAt: string;
}

export interface Redaction {
  ruleId: string;
  field: string;
  count: number;
}

export interface AiEvent {
  id: string;
  sessionId: string;
  seq: number;
  ts: string;
  source: string;
  kind: string;
  payload: Record<string, unknown>;
  redactions: Redaction[];
  provenance: "observed" | "inferred";
  prevHash: string;
  hash: string;
  agent?: { name: string; version?: string; model?: string };
}
