import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { TiposCaixaPage } from "@/components/gestao/tipos-caixa-page";

export const Route = createFileRoute("/gestao/tipos-caixa")({
  component: Page,
  head: () => ({ meta: [{ title: "Tipos de Caixa · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <TiposCaixaPage />;
}
