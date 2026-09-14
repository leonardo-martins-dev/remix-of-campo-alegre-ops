import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { FrotaPage } from "@/components/gestao/frota-page";

export const Route = createFileRoute("/gestao/frota")({
  component: Page,
  head: () => ({ meta: [{ title: "Motoristas e Caminhões · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <FrotaPage />;
}
