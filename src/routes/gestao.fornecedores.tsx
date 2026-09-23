import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { FornecedoresPage } from "@/components/gestao/fornecedores-page";

export const Route = createFileRoute("/gestao/fornecedores")({
  component: Page,
  head: () => ({ meta: [{ title: "Cadastro de fornecedores · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <FornecedoresPage />;
}
