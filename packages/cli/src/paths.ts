import { homedir } from "node:os";
import { join } from "node:path";

export function homeRoot(): string {
  return join(homedir(), ".ailogtrace");
}
export function dbPath(): string {
  return join(homeRoot(), "audit.db");
}
export function spoolDir(): string {
  return join(homeRoot(), "spool");
}
