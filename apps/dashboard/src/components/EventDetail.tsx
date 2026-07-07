import { useState } from "react";
import type { AiEvent } from "../types.js";
import { kindStyle } from "../kinds.js";
import { IconCopy, IconCheck } from "../Icons.js";

function CopyButton({ text, label }: { readonly text: string; readonly label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`copy${done ? " done" : ""}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        }).catch(() => undefined);
      }}
      aria-label={`Copy ${label}`}
    >
      {done ? <IconCheck /> : <IconCopy />} {done ? "copied" : label}
    </button>
  );
}

export function EventDetail({ event }: { readonly event: AiEvent | null }) {
  if (!event) {
    return (
      <aside className="col" aria-label="Event detail">
        <div className="col-head"><h2>Event detail</h2></div>
        <p className="empty">Select an event to inspect its payload, redactions, provenance, and hash. Use <kbd>↑</kbd>/<kbd>↓</kbd> to move.</p>
      </aside>
    );
  }

  const st = kindStyle(event.kind);
  const payload = JSON.stringify(event.payload, null, 2);

  return (
    <aside className="col" aria-label="Event detail">
      <div className="col-head">
        <h2>Event detail</h2>
        <span className="count mono">#{event.seq}</span>
      </div>

      <div className="detail">
        <div className="row">
          <div className="k">Kind</div>
          <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dot" style={{ background: st.color }} />
            <span className="mono">{event.kind}</span>
            <span className={`prov ${event.provenance}`}>{event.provenance}</span>
          </div>
        </div>

        <div className="row">
          <div className="k">Timestamp</div>
          <div className="v mono">{event.ts}</div>
        </div>

        {event.agent && (
          <div className="row">
            <div className="k">Agent</div>
            <div className="v mono">{event.agent.name}{event.agent.model ? ` · ${event.agent.model}` : ""}</div>
          </div>
        )}

        {event.redactions.length > 0 && (
          <div className="row">
            <div className="k">Redactions</div>
            <div className="v">
              {event.redactions.map((r) => (
                <span key={r.ruleId} className="prov inferred" style={{ marginRight: 6, display: "inline-block", marginBottom: 4 }}>
                  {r.ruleId} ×{r.count}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="row">
          <div className="k">
            Payload (redacted)
            <CopyButton text={payload} label="copy" />
          </div>
          <pre className="mono">{payload}</pre>
        </div>

        <div className="row">
          <div className="k">
            Hash
            <CopyButton text={event.hash} label="copy" />
          </div>
          <div className="v mono">{event.hash}</div>
        </div>

        <div className="row">
          <div className="k">Prev hash</div>
          <div className="v mono" style={{ color: "var(--text-dim)" }}>{event.prevHash}</div>
        </div>
      </div>
    </aside>
  );
}
