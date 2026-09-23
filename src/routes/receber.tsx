import { createFileRoute } from "@tanstack/react-router";
import { OpsHubPage } from "@/components/ops-hub";
import { OPS_HUBS } from "@/lib/nav";

const hub = OPS_HUBS.find((h) => h.id === "receber")!;

export const Route = createFileRoute("/receber")({
  component: () => <OpsHubPage hub={hub} />,
  head: () => ({ meta: [{ title: "Receber · Campo Alegre" }] }),
});
