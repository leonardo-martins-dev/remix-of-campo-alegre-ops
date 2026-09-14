import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { RotasPage } from "@/components/gestao/rotas-page";

export const Route = createFileRoute("/gestao/rotas")({
  component: Page,
  head: () => ({ meta: [{ title: "Rotas · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <RotasPage />;
}
