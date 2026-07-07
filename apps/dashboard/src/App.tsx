import { useCallback, useEffect, useMemo, useState } from "react";
import { TopBar } from "./components/TopBar.js";
import { SessionList } from "./components/SessionList.js";
import { Timeline } from "./components/Timeline.js";
import { EventDetail } from "./components/EventDetail.js";
import { useHashRoute, useSessions, useEvents, useTheme } from "./hooks.js";
import { getVerify } from "./api.js";

export function App() {
  const [route, navigate] = useHashRoute();
  const [theme, toggleTheme] = useTheme();
  const [live, setLive] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [chainOk, setChainOk] = useState(true);
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const { sessions, error, refresh } = useSessions(live);
  const activeSession = route.sessionId ?? sessions[0]?.sessionId ?? null;
  const { events, loading } = useEvents(activeSession, live, tick);
  const activeSeq = route.seq;

  // relative-time ticker
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  // chain status (honest badge) — on load, refresh, and live tick
  useEffect(() => {
    getVerify().then((v) => setChainOk(v.ok)).catch(() => undefined);
  }, [tick, events.length]);

  const refreshAll = useCallback(() => { refresh(); setTick((t) => t + 1); }, [refresh]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (kindFilter.size && !kindFilter.has(e.kind)) return false;
      if (q) {
        const hay = `${e.kind} ${JSON.stringify(e.payload)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, kindFilter, query]);

  const activeEvent = useMemo(
    () => events.find((e) => e.seq === activeSeq) ?? null,
    [events, activeSeq],
  );

  const selectSession = useCallback((id: string) => navigate({ sessionId: id, seq: null }), [navigate]);
  const selectEvent = useCallback((seq: number) => navigate({ sessionId: activeSession, seq }), [navigate, activeSession]);
  const toggleKind = useCallback((kind: string) => {
    setKindFilter((prev) => {
      const n = new Set(prev);
      if (n.has(kind)) n.delete(kind); else n.add(kind);
      return n;
    });
  }, []);

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (typing) {
        if (e.key === "Escape") el.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".timeline-search input")?.focus();
        return;
      }
      if (e.key === "Escape") { navigate({ sessionId: activeSession, seq: null }); return; }

      const moveEvent = (delta: number) => {
        if (!filteredEvents.length) return;
        e.preventDefault();
        const idx = filteredEvents.findIndex((ev) => ev.seq === activeSeq);
        const nextIdx = idx < 0 ? (delta > 0 ? 0 : filteredEvents.length - 1)
          : Math.min(filteredEvents.length - 1, Math.max(0, idx + delta));
        navigate({ sessionId: activeSession, seq: filteredEvents[nextIdx].seq });
      };
      const moveSession = (delta: number) => {
        if (!sessions.length) return;
        e.preventDefault();
        const idx = sessions.findIndex((s) => s.sessionId === activeSession);
        const nextIdx = Math.min(sessions.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
        navigate({ sessionId: sessions[nextIdx].sessionId, seq: null });
      };

      if (e.key === "ArrowDown" || e.key === "j") moveEvent(1);
      else if (e.key === "ArrowUp" || e.key === "k") moveEvent(-1);
      else if (e.key === "[") moveSession(-1);
      else if (e.key === "]") moveSession(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredEvents, activeSeq, activeSession, sessions, navigate]);

  const sessionObj = useMemo(
    () => sessions.find((s) => s.sessionId === activeSession) ?? null,
    [sessions, activeSession],
  );

  return (
    <div className="app">
      <TopBar
        activeSession={activeSession}
        chainOk={chainOk}
        live={live}
        onToggleLive={() => setLive((v) => !v)}
        onRefresh={refreshAll}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className="cols">
        <SessionList
          sessions={sessions}
          activeSession={activeSession}
          now={now}
          error={error}
          onSelect={selectSession}
        />
        <Timeline
          session={sessionObj}
          allEvents={events}
          events={filteredEvents}
          loading={loading}
          kindFilter={kindFilter}
          onToggleKind={toggleKind}
          onClearKinds={() => setKindFilter(new Set())}
          query={query}
          onQuery={setQuery}
          activeSeq={activeSeq}
          onSelect={selectEvent}
        />
        <EventDetail event={activeEvent} />
      </div>
      <div className="kbd-help">
        <kbd>↑</kbd><kbd>↓</kbd> or <kbd>j</kbd><kbd>k</kbd> events · <kbd>[</kbd><kbd>]</kbd> sessions · <kbd>/</kbd> search · <kbd>Esc</kbd> clear
      </div>
    </div>
  );
}
