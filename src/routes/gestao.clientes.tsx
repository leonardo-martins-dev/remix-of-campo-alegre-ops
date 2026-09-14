import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ClientesPage } from "@/components/gestao/clientes-page";

export const Route = createFileRoute("/gestao/clientes")({
  component: Page,
  head: () => ({ meta: [{ title: "Clientes · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <ClientesPage />;
}
