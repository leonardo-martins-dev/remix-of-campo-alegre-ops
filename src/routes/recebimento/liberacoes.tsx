import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { usePedidosAguardandoLiberacao, useLiberarPedido, useEncerrarPedido, useConfigValor } from "@/hooks/use-pedidos";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { one } from "@/lib/embed";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/recebimento/liberacoes")({
  component: Page,
  head: () => ({ meta: [{ title: "Liberações · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  const { data: pedidos = [], isLoading } = usePedidosAguardandoLiberacao();
  const liberar = useLiberarPedido();
  const encerrar = useEncerrarPedido();
  const { data: toleranciaPct = 5 } = useConfigValor("tolerancia_pct", 5);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [encerrarId, setEncerrarId] = useState<string | null>(null);

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
        subtitle="Pedidos com divergência acima da tolerância aguardam análise do admin"
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
          const confs = Array.isArray(p.conferencias) ? p.conferencias : p.conferencias ? [p.conferencias] : [];
          const conf = [...confs]
            .filter((c: { status?: string }) => c.status === "finalizada")
            .sort((a: { finalizada_em?: string }, b: { finalizada_em?: string }) =>
              String(b.finalizada_em ?? "").localeCompare(String(a.finalizada_em ?? ""))
            )[0];
          const itens = ((conf?.itens_conferencia ?? []) as unknown) as {
            id: string;
            divergencia: string | null;
            quantidade_divergencia: number;
            quantidade_recebida: number;
            dentro_tolerancia?: boolean | null;
            tolerancia_pct_aplicada?: number | null;
            itens_pedido: { quantidade_pedida: number; produtos: { nome: string } | { nome: string }[] | null };
          }[];
          const divs = itens.filter((i) => i.divergencia && i.divergencia !== "sobra" ? i.dentro_tolerancia === false || i.divergencia === "qualidade" : i.divergencia === "sobra" && i.dentro_tolerancia === false);
          if (!divs.length) return null;
          return (
            <div key={p.id} className="card-base p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-navy">{one(p.fornecedores)?.nome ?? p.codigo}</div>
                  <div className="text-xs text-muted-foreground">
                    Pedido {p.codigo} · {divs.length} divergência(s) acima da tolerância
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
                <Button size="sm" variant="outline" disabled={encerrar.isPending} onClick={() => setEncerrarId(p.id)}>
                  Encerrar com falta
                </Button>
              </div>
              <ul className="text-sm space-y-1 mb-3">
                {divs.map((it) => {
                  const pedida = Number(one(it.itens_pedido)?.quantidade_pedida ?? 0);
                  const falta = Number(it.quantidade_divergencia ?? 0);
                  const pct = pedida ? Math.round((falta / pedida) * 100) : 0;
                  const tol = Number(it.tolerancia_pct_aplicada ?? toleranciaPct);
                  return (
                    <li key={it.id} className="flex justify-between border-t border-border pt-1 gap-2">
                      <span>{one(one(it.itens_pedido)?.produtos)?.nome ?? "—"}</span>
                      <span className="chip chip-danger text-xs">
                        {it.divergencia} {falta} de {pedida} ({pct}% · tolerância {tol}%)
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Textarea
                placeholder="Observação da liberação ou motivo do encerramento"
                value={obs[p.id] ?? ""}
                onChange={(e) => setObs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                rows={2}
              />
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!encerrarId} onOpenChange={(open) => !open && setEncerrarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar com falta definitiva?</AlertDialogTitle>
            <AlertDialogDescription>
              O saldo restante vira falta no pedido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!encerrarId) return;
                const motivo = obs[encerrarId]?.trim();
                if (!motivo) {
                  toast.error("Observação obrigatória para encerrar com falta");
                  return;
                }
                try {
                  await encerrar.mutateAsync({ pedidoId: encerrarId, motivo });
                  toast.success("Pedido encerrado com falta definitiva");
                  setEncerrarId(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao encerrar");
                }
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
