import type { ErrorHandler } from "hono";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId") as string | undefined;
  logger.error({ err: { message: err.message, name: err.name }, requestId }, "unhandled error");
  return c.json(
    {
      ok: false,
      error: "internal_error",
      requestId,
    },
    500,
  );
};
