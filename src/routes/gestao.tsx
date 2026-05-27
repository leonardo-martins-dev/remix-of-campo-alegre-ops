import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/gestao")({
  component: Page,
  head: () => ({ meta: [{ title: "Configurações · Campo Alegre" }] }),
});

function Page() {
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Parâmetros gerais do sistema" />
      <div className="card-base p-8 text-center text-muted-foreground">
        Em breve: usuários, perfis, integração Wisetec, benchmarks e regras de cobrança.
      </div>
    </div>
  );
}
