import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ProdutosPage } from "@/components/gestao/produtos-page";

export const Route = createFileRoute("/gestao/produtos")({
  component: Page,
  head: () => ({ meta: [{ title: "Produtos · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <ProdutosPage />;
}
