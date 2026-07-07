import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, AiEvent } from "./types.js";
import { getSessions, getEvents } from "./api.js";

/** URL-hash route: #/<sessionId> or #/<sessionId>/<seq>. Enables Back/Forward + shareable links. */
export interface Route { sessionId: string | null; seq: number | null }

function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  if (!h) return { sessionId: null, seq: null };
  const [sid, seqStr] = h.split("/");
  const seq = seqStr !== undefined && seqStr !== "" ? Number(seqStr) : null;
  return { sessionId: sid || null, seq: Number.isNaN(seq as number) ? null : seq };
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const navigate = useCallback((r: Route) => {
    const next = r.sessionId ? `#/${encodeURIComponent(r.sessionId)}${r.seq != null ? `/${r.seq}` : ""}` : "#/";
    if (next !== window.location.hash) window.location.hash = next;
    setRoute(r);
  }, []);
  return [route, navigate];
}

export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("alt-theme") ?? "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("alt-theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

/** Sessions list with manual + optional live (polling) refresh. */
export function useSessions(live: boolean): { sessions: Session[]; error: string | null; refresh: () => void } {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    getSessions().then(setSessions).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, [live, refresh]);
  return { sessions, error, refresh };
}

/** Events for the active session; re-fetched on session change, refresh tick, or live poll. */
export function useEvents(sessionId: string | null, live: boolean, tick: number): { events: AiEvent[]; loading: boolean } {
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!sessionId) { setEvents([]); return; }
    firstLoad.current = true;
    setLoading(true);
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    getEvents(sessionId)
      .then((e) => { if (!cancelled) { setEvents(e); setLoading(false); firstLoad.current = false; } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, tick]);
  useEffect(() => {
    if (!live || !sessionId) return;
    const id = window.setInterval(() => {
      getEvents(sessionId).then(setEvents).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(id);
  }, [live, sessionId]);
  return { events, loading };
}
