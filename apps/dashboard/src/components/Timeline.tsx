import { useEffect, useMemo, useRef } from "react";
import type { AiEvent, Session } from "../types.js";
import { kindStyle } from "../kinds.js";
import { clock, duration } from "../format.js";
import { IconSearch, IconShield } from "../Icons.js";

interface Props {
  readonly session: Session | null;
  readonly allEvents: AiEvent[];
  readonly events: AiEvent[];
  readonly loading: boolean;
  readonly kindFilter: Set<string>;
  readonly onToggleKind: (kind: string) => void;
  readonly onClearKinds: () => void;
  readonly query: string;
  readonly onQuery: (q: string) => void;
  readonly activeSeq: number | null;
  readonly onSelect: (seq: number) => void;
}

export function Timeline(props: Props) {
  const { session, allEvents, events, loading, kindFilter, onToggleKind, onClearKinds, query, onQuery, activeSeq, onSelect } = props;
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeSeq]);

  const facets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of allEvents) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [allEvents]);

  const stats = useMemo(() => {
    const redactions = allEvents.reduce((n, e) => n + e.redactions.reduce((m, r) => m + r.count, 0), 0);
    const span = allEvents.length ? duration(allEvents[0].ts, allEvents[allEvents.length - 1].ts) : "—";
    return { total: allEvents.length, kinds: facets.length, redactions, span };
  }, [allEvents, facets.length]);

  if (!session) {
    return (
      <section className="col" aria-label="Timeline">
        <div className="col-head"><h2>Timeline</h2></div>
        <p className="empty">Select a session on the left to see its event timeline.</p>
      </section>
    );
  }

  return (
    <section className="col" aria-label="Timeline">
      <div className="col-head">
        <h2>Timeline</h2>
        <span className="count">{events.length}{events.length !== allEvents.length ? ` / ${allEvents.length}` : ""}</span>
        <span className="spacer" />
        <div className="search timeline-search">
          <IconSearch />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search events…  ( / )" aria-label="Search events" />
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="n">{stats.total}</div><div className="l">events</div></div>
        <div className="stat"><div className="n">{stats.kinds}</div><div className="l">kinds</div></div>
        <div className="stat"><div className="n">{stats.span}</div><div className="l">duration</div></div>
        <div className="stat">
          <div className="n" style={{ color: stats.redactions ? "var(--danger)" : undefined }}>{stats.redactions}</div>
          <div className="l">redactions</div>
        </div>
      </div>

      <div className="facets">
        <button type="button" className={`chip${kindFilter.size === 0 ? " on" : ""}`} onClick={onClearKinds}>
          all
        </button>
        {facets.map(([kind, count]) => {
          const st = kindStyle(kind);
          const on = kindFilter.has(kind);
          return (
            <button key={kind} type="button" className={`chip${on ? " on" : ""}`}
              style={on ? { color: st.color } : undefined}
              onClick={() => onToggleKind(kind)}>
              <span className="dot" style={{ background: st.color }} />
              {st.label}
              <span className="chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="skeleton">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel-row" style={{ width: `${90 - i * 8}%` }} />)}
        </div>
      )}

      {!loading && events.map((e) => {
        const st = kindStyle(e.kind);
        const nRedacted = e.redactions.reduce((n, r) => n + r.count, 0);
        const active = e.seq === activeSeq;
        return (
          <button
            key={e.id}
            ref={active ? activeRef : undefined}
            type="button"
            className={`event${active ? " active" : ""}${e.provenance === "inferred" ? " inferred" : ""}`}
            onClick={() => onSelect(e.seq)}
          >
            <span className="seq mono">#{e.seq}</span>
            <span className="time mono">{clock(e.ts)}</span>
            <span className="kind">
              <span className="dot" style={{ background: st.color }} />
              <span className="label">{st.label}</span>
            </span>
            {nRedacted > 0 && <span className="redacted"><IconShield /> {nRedacted}</span>}
          </button>
        );
      })}

      {!loading && events.length === 0 && (
        <p className="empty">
          {allEvents.length === 0 ? "No events in this session yet." : "No events match the current filter."}
        </p>
      )}
    </section>
  );
}
