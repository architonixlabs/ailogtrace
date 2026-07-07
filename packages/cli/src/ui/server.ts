import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { AuditStore } from "@ailogtrace/core";
import { dbPath, spoolDir } from "../paths.js";
import { ingestAll } from "../collector.js";

export function buildServer(store: AuditStore): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/api/sessions", async () => store.listSessions());
  app.get("/api/verify", async () => store.verify());
  app.get<{ Params: { id: string } }>("/api/sessions/:id/events", async (req) =>
    store.getEvents(req.params.id),
  );
  return app;
}

// repo root is four levels up from packages/cli/dist/ui/server.js
export function dashboardDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "apps", "dashboard", "dist");
}

export async function startUi(port: number): Promise<void> {
  const store = new AuditStore(dbPath());
  ingestAll(store, spoolDir());
  const app = buildServer(store);
  const dist = dashboardDist();
  const hasUi = existsSync(dist);
  if (hasUi) await app.register(fastifyStatic, { root: dist });
  await app.listen({ port, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${port}`;
  console.log(`AILogTrace dashboard on ${url}${hasUi ? "" : "/api/sessions (build the dashboard for the UI: pnpm --filter @ailogtrace/dashboard build)"}`);
}
