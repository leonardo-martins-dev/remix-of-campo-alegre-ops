import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { TiposEmbalagemPage } from "@/components/gestao/tipos-embalagem-page";

export const Route = createFileRoute("/gestao/tipos-embalagem")({
  component: Page,
  head: () => ({ meta: [{ title: "Tipos de Embalagem · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <TiposEmbalagemPage />;
}
