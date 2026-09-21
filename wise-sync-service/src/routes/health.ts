import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) =>
  c.json({
    ok: true,
    service: "wise-sync-service",
    ts: new Date().toISOString(),
  }),
);
