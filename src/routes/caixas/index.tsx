import { createFileRoute } from "@tanstack/react-router";
import { OpsHubPage } from "@/components/ops-hub";
import { OPS_HUBS } from "@/lib/nav";

const hub = OPS_HUBS.find((h) => h.id === "caixas")!;

export const Route = createFileRoute("/caixas/")({
  component: () => <OpsHubPage hub={hub} />,
  head: () => ({ meta: [{ title: "Caixas · Campo Alegre" }] }),
});
