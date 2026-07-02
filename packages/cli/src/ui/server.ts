import Fastify, { type FastifyInstance } from "fastify";
import { AuditStore } from "@ailogtrace/core";
import { dbPath, spoolDir } from "../paths.js";
import { ingestAll } from "../collector.js";

export function buildServer(store: AuditStore): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/api/sessions", async () => store.listSessions());
  app.get<{ Params: { id: string } }>("/api/sessions/:id/events", async (req) =>
    store.getEvents(req.params.id),
  );
  return app;
}

export async function startUi(port: number): Promise<void> {
  const store = new AuditStore(dbPath());
  ingestAll(store, spoolDir());
  const app = buildServer(store);
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`AILogTrace dashboard API on http://127.0.0.1:${port}/api/sessions`);
  console.log(`(dashboard UI: run \`pnpm --filter @ailogtrace/dashboard dev\` for the React app)`);
}
