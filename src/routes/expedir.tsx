import { createFileRoute } from "@tanstack/react-router";
import { OpsHubPage } from "@/components/ops-hub";
import { OPS_HUBS } from "@/lib/nav";

const hub = OPS_HUBS.find((h) => h.id === "expedir")!;

export const Route = createFileRoute("/expedir")({
  component: () => <OpsHubPage hub={hub} />,
  head: () => ({ meta: [{ title: "Expedir · Campo Alegre" }] }),
});
