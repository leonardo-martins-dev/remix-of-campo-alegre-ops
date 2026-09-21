import { Hono } from "hono";
import { cronAuth } from "../middlewares/cron-auth.js";
import { syncCompra } from "../services/wise/sync-compra.js";
import { syncVenda } from "../services/wise/sync-venda.js";
import { coverageReport } from "../services/wise/aliases.js";
import type { AppVariables } from "../middlewares/request-id.js";

export const syncRoutes = new Hono<{ Variables: AppVariables }>();

syncRoutes.use("*", cronAuth);

syncRoutes.post("/compra", async (c) => {
  const result = await syncCompra();
  const status = result.ok ? 200 : 502;
  return c.json({ ...result, requestId: c.get("requestId") }, status);
});

syncRoutes.post("/venda", async (c) => {
  const result = await syncVenda();
  const status = result.ok ? 200 : 502;
  return c.json({ ...result, requestId: c.get("requestId") }, status);
});

syncRoutes.post("/all", async (c) => {
  const compra = await syncCompra();
  const venda = await syncVenda();
  const ok = compra.ok && venda.ok;
  return c.json(
    {
      ok,
      compra,
      venda,
      requestId: c.get("requestId"),
    },
    ok ? 200 : 502,
  );
});

syncRoutes.get("/coverage", async (c) => {
  const report = await coverageReport();
  return c.json({ ok: true, ...report, requestId: c.get("requestId") });
});
