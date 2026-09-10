import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/caixas/galpao")({
  beforeLoad: () => {
    throw redirect({ to: "/caixas/inventario", search: { posicao: "galpao" } });
  },
});
