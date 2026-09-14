import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ConversaoCaixasPanel } from "@/components/conversao-caixas-panel";

export const Route = createFileRoute("/gestao/conversao")({
  component: Page,
  head: () => ({ meta: [{ title: "Unidades por caixa · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return (
    <div>
      <PageHeader
        title="Unidades por caixa"
        subtitle="Quantas unidades de cada produto cabem em cada tipo de caixa"
      />
      <ConversaoCaixasPanel />
    </div>
  );
}
