import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";

export type AppVariables = {
  requestId: string;
};

export const requestId = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const id = c.req.header("X-Request-Id") ?? randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});
