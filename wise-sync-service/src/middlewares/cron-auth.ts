import { createMiddleware } from "hono/factory";
import { env } from "../env.js";

export const cronAuth = createMiddleware(async (c, next) => {
  const secret = c.req.header("X-Cron-Secret") ?? c.req.header("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  await next();
});
