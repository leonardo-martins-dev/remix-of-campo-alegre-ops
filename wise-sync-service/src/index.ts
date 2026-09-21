import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { requestId, type AppVariables } from "./middlewares/request-id.js";
import { errorHandler } from "./middlewares/error.js";
import { healthRoutes } from "./routes/health.js";
import { syncRoutes } from "./routes/sync.js";
import { closeMssql } from "./services/wise/mssql-client.js";

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestId);
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "X-Cron-Secret", "X-Request-Id"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.route("/", healthRoutes);
app.route("/v1/sync", syncRoutes);
app.onError(errorHandler);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, tz: env.TZ }, "wise-sync-service listening");
});

async function shutdown() {
  logger.info("shutting down");
  await closeMssql();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
