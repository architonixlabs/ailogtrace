import { useState } from "react";
import type { Session } from "../types.js";
import { relativeTime } from "../format.js";
import { IconSearch } from "../Icons.js";

interface Props {
  readonly sessions: Session[];
  readonly activeSession: string | null;
  readonly now: number;
  readonly error: string | null;
  readonly onSelect: (id: string) => void;
}

export function SessionList({ sessions, activeSession, now, error, onSelect }: Props) {
  const [q, setQ] = useState("");
  const filtered = q ? sessions.filter((s) => s.sessionId.toLowerCase().includes(q.toLowerCase())) : sessions;

  return (
    <nav className="col" aria-label="Sessions">
      <div className="col-head">
        <h2>Sessions</h2>
        <span className="count">{sessions.length}</span>
        <span className="spacer" />
      </div>
      <div className="facets session-filter">
        <div className="search session-search">
          <IconSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter sessions…" aria-label="Filter sessions" />
        </div>
      </div>

      {filtered.map((s) => (
        <button
          key={s.sessionId}
          type="button"
          className={`session${s.sessionId === activeSession ? " active" : ""}`}
          onClick={() => onSelect(s.sessionId)}
        >
          <div className="sid mono">{s.sessionId}</div>
          <div className="meta">
            <span>{s.count} events</span>
            <span>·</span>
            <span>{relativeTime(s.endedAt, now)}</span>
          </div>
        </button>
      ))}

      {filtered.length === 0 && !error && (
        <p className="empty">
          {sessions.length === 0
            ? <>No sessions yet. Run <code>ailogtrace init</code>, then a Claude Code session.</>
            : "No sessions match your filter."}
        </p>
      )}
      {error && <p className="empty">API error: {error}</p>}
    </nav>
  );
}
