import { IconRefresh, IconSun, IconMoon, IconShield } from "../Icons.js";

interface Props {
  activeSession: string | null;
  chainOk: boolean;
  live: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
  theme: string;
  onToggleTheme: () => void;
}

export function TopBar({ activeSession, chainOk, live, onToggleLive, onRefresh, theme, onToggleTheme }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <b>AILogTrace</b>
        <span className="tag">flight recorder</span>
      </div>
      {activeSession && (
        <span className="crumb">/ <code>{activeSession}</code></span>
      )}
      <span className="spacer" />

      <span className={`chain ${chainOk ? "ok" : "bad"}`} title="Hash-chain integrity, recomputed locally">
        <IconShield /> {chainOk ? "chain verified" : "chain broken"}
      </span>

      <button className={`btn ${live ? "on live" : ""}`} onClick={onToggleLive} aria-pressed={live}
        title="Auto-refresh every 4s">
        <span className="live-dot" /> {live ? "Live" : "Live off"}
      </button>

      <button className="btn icon" onClick={onRefresh} title="Refresh" aria-label="Refresh">
        <IconRefresh />
      </button>

      <button className="btn icon" onClick={onToggleTheme} aria-label="Toggle theme"
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
        {theme === "dark" ? <IconSun /> : <IconMoon />}
      </button>
    </header>
  );
}
