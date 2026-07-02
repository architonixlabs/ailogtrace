import { useEffect, useState } from "react";
import type { Session, AiEvent } from "./types.js";
import { getSessions, getEvents } from "./api.js";
import { kindStyle, timeOf } from "./kinds.js";

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<AiEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessions()
      .then((s) => {
        setSessions(s);
        if (s.length && !activeSession) setActiveSession(s[0].sessionId);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    setActiveEvent(null);
    getEvents(activeSession).then(setEvents).catch((e) => setError(String(e)));
  }, [activeSession]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>AILogTrace</h1>
        <span className="tag">flight recorder for AI-assisted development</span>
        <span className="spacer" />
        <span className="chain ok">chain verified locally</span>
      </header>

      <div className="cols">
        <nav className="col">
          <h2>Sessions</h2>
          {sessions.map((s) => (
            <div
              key={s.sessionId}
              className={`session${s.sessionId === activeSession ? " active" : ""}`}
              onClick={() => setActiveSession(s.sessionId)}
            >
              <code>{s.sessionId}</code>
              <div className="meta">{s.count} events · {timeOf(s.startedAt)}</div>
            </div>
          ))}
          {sessions.length === 0 && !error && (
            <p className="empty">No sessions yet. Run <code>ailogtrace init</code>, then a Claude Code session.</p>
          )}
          {error && <p className="empty">API error: {error}</p>}
        </nav>

        <section className="col">
          <h2>Timeline{activeSession ? ` — ${events.length} events` : ""}</h2>
          {events.map((e) => {
            const st = kindStyle(e.kind);
            const nRedacted = e.redactions.reduce((n, r) => n + r.count, 0);
            return (
              <div
                key={e.id}
                className={`event${e.id === activeEvent?.id ? " active" : ""}${e.provenance === "inferred" ? " inferred" : ""}`}
                onClick={() => setActiveEvent(e)}
              >
                <span className="seq">#{e.seq}</span>
                <span className="time">{timeOf(e.ts)}</span>
                <span className="badge" style={{ background: st.color }}>{st.label}</span>
                {nRedacted > 0 && <span className="redacted">redacted {nRedacted}</span>}
              </div>
            );
          })}
          {activeSession && events.length === 0 && <p className="empty">No events in this session.</p>}
        </section>

        <aside className="col">
          <h2>Event detail</h2>
          {activeEvent ? (
            <div className="detail">
              <div className="row">
                <div className="k">Kind</div>
                <div className="v">
                  <span className="badge" style={{ background: kindStyle(activeEvent.kind).color }}>{activeEvent.kind}</span>{" "}
                  <span className={`prov ${activeEvent.provenance}`}>{activeEvent.provenance}</span>
                </div>
              </div>
              <div className="row"><div className="k">Sequence / time</div><div className="v">#{activeEvent.seq} · {activeEvent.ts}</div></div>
              {activeEvent.agent && (
                <div className="row"><div className="k">Agent</div><div className="v">{activeEvent.agent.name}{activeEvent.agent.model ? ` · ${activeEvent.agent.model}` : ""}</div></div>
              )}
              {activeEvent.redactions.length > 0 && (
                <div className="row">
                  <div className="k">Redactions</div>
                  <div className="v">{activeEvent.redactions.map((r) => `${r.ruleId} ×${r.count}`).join(", ")}</div>
                </div>
              )}
              <div className="row">
                <div className="k">Payload (redacted)</div>
                <pre>{JSON.stringify(activeEvent.payload, null, 2)}</pre>
              </div>
              <div className="row"><div className="k">Hash</div><div className="v"><code>{activeEvent.hash.slice(0, 24)}…</code></div></div>
            </div>
          ) : (
            <p className="empty">Select an event to inspect its payload, redactions, provenance, and hash.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
