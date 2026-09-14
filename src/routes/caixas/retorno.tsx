import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/caixas/retorno")({
  component: () => <Navigate to="/caixas/movimentacao" />,
  head: () => ({ meta: [{ title: "Redirecionando…" }] }),
});
