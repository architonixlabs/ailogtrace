import { useEffect, useState } from "react";

interface Session { sessionId: string; count: number; startedAt: string; endedAt: string }

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    fetch("/api/sessions").then((r) => r.json()).then(setSessions).catch(() => setSessions([]));
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>AILogTrace</h1>
      <p style={{ color: "#666" }}>Flight recorder for AI-assisted development — session list (walking skeleton).</p>
      {/* V1: timeline, diff viewer, React Flow graph, search. */}
      <table cellPadding={8} style={{ borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Session</th><th>Events</th><th align="left">Started</th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId} style={{ borderTop: "1px solid #ddd" }}>
              <td><code>{s.sessionId}</code></td><td align="center">{s.count}</td><td>{s.startedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sessions.length === 0 && <p>No sessions yet. Run a Claude Code session after <code>ailogtrace init</code>.</p>}
    </main>
  );
}
