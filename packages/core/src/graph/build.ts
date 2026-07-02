import type { AiEvent, EventKind } from "../schema/event.js";

export interface GraphNode {
  id: string;
  type: EventKind;
  ts: string;
  label: string;
  provenance: "observed" | "inferred";
  sourceEventIds: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// V1: replace sequential edges with deterministic causality (triggered/modified/
// approved/failed_then_retried), FileRead grouping/collapse, and an inference pass
// that adds AgentDecision/AgentPlan nodes (provenance: "inferred", with citations).
export function buildGraph(events: AiEvent[]): Graph {
  const nodes: GraphNode[] = events.map((e) => ({
    id: e.id,
    type: e.kind,
    ts: e.ts,
    label: e.kind,
    provenance: e.provenance,
    sourceEventIds: [e.id],
  }));
  const edges: GraphEdge[] = [];
  for (let i = 1; i < events.length; i++) {
    edges.push({ id: `edge_${i - 1}`, from: events[i - 1].id, to: events[i].id, type: "triggered" });
  }
  return { nodes, edges };
}
