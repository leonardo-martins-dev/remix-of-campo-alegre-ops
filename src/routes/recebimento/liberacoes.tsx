import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { usePedidosAguardandoLiberacao, useLiberarPedido } from "@/hooks/use-pedidos";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/recebimento/liberacoes")({
  component: Page,
  head: () => ({ meta: [{ title: "Liberações · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  const { data: pedidos = [], isLoading } = usePedidosAguardandoLiberacao();
  const liberar = useLiberarPedido();
  const [obs, setObs] = useState<Record<string, string>>({});

  if (!isAdmin) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Acesso restrito a administradores.{" "}
        <Link to="/recebimento" className="text-primary-dark underline">
          Voltar
        </Link>
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="Liberação de divergências"
        subtitle="Pedidos com divergência aguardam análise do admin para expedição"
        actions={
          <Link
            to="/recebimento"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && pedidos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum pedido aguardando liberação.</p>
      )}

      <div className="space-y-4">
        {pedidos.map((p) => {
          const conf = Array.isArray(p.conferencias) ? p.conferencias[0] : p.conferencias;
          const itens = conf?.itens_conferencia ?? [];
          const divs = itens.filter((i: { divergencia: string | null }) => i.divergencia);
          return (
            <div key={p.id} className="card-base p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-navy">{p.fornecedores?.nome ?? p.codigo}</div>
                  <div className="text-xs text-muted-foreground">
                    Pedido {p.codigo} · {divs.length} divergência(s)
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={liberar.isPending}
                  onClick={async () => {
                    try {
                      await liberar.mutateAsync({ pedidoId: p.id, observacao: obs[p.id] });
                      toast.success("Pedido liberado para expedição");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erro ao liberar");
                    }
                  }}
                >
                  <CheckCircle2 size={14} className="mr-1" /> Liberar
                </Button>
              </div>
              <ul className="text-sm space-y-1 mb-3">
                {divs.map((it: {
                  id: string;
                  divergencia: string;
                  quantidade_divergencia: number;
                  itens_pedido: { quantidade_pedida: number; produtos: { nome: string } | null };
                }) => (
                  <li key={it.id} className="flex justify-between border-t border-border pt-1">
                    <span>{it.itens_pedido?.produtos?.nome ?? "—"}</span>
                    <span className="chip chip-danger text-xs">
                      {it.divergencia} · {it.quantidade_divergencia}
                    </span>
                  </li>
                ))}
              </ul>
              <Textarea
                placeholder="Observação da liberação (opcional)"
                value={obs[p.id] ?? ""}
                onChange={(e) => setObs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                rows={2}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
