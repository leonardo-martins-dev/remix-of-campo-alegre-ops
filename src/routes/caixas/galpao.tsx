import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useSaldosCaixa } from "@/hooks/use-ledger";
import { useContagensGalpao, useRegistrarContagem, useResolverContagem } from "@/hooks/use-contagem";
import { NumberStepper } from "@/components/number-stepper";

export const Route = createFileRoute("/caixas/galpao")({
  component: Page,
  head: () => ({ meta: [{ title: "Contagem do galpão · Campo Alegre" }] }),
});

function Page() {
  const { user, isAdmin } = useAuth();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: saldos = [] } = useSaldosCaixa();
  const { data: contagens = [] } = useContagensGalpao();
  const registrar = useRegistrarContagem();
  const resolver = useResolverContagem();
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [motivo, setMotivo] = useState("");

  const calculado = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of saldos as { posicao_tipo: string; tipo_caixa: string; saldo: number }[]) {
      if (s.posicao_tipo === "galpao" && s.tipo_caixa) {
        map[s.tipo_caixa] = Number(s.saldo ?? 0);
      }
    }
    return map;
  }, [saldos]);

  async function handleRegistrar() {
    if (!user) return;
    try {
      await registrar.mutateAsync({
        contado_por: user.id,
        itens: tipos.map((t) => ({
          tipo_caixa_sigla: t.sigla,
          qtd_contada: Number(contagem[t.sigla] ?? 0),
          qtd_calculada: Number(calculado[t.sigla] ?? 0),
        })),
      });
      setSubmitted(true);
      toast.success("Contagem registrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  return (
    <div>
      <PageHeader title="Contagem do galpão" subtitle="Contagem cega — o saldo calculado só aparece depois de registrar" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <p className="text-sm text-muted-foreground">Informe o que há no pátio, por tipo.</p>
          {tipos.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span className="font-medium">{t.nome} ({t.sigla})</span>
              <NumberStepper
                value={contagem[t.sigla] ?? 0}
                onChange={(n) => setContagem((s) => ({ ...s, [t.sigla]: n }))}
              />
            </div>
          ))}
          <Button className="min-h-11 w-full" onClick={handleRegistrar} disabled={registrar.isPending}>
            Registrar contagem
          </Button>
          {submitted && (
            <div className="text-sm space-y-1">
              {tipos.map((t) => {
                const c = Number(contagem[t.sigla] ?? 0);
                const calc = Number(calculado[t.sigla] ?? 0);
                return (
                  <p key={t.id}>{t.sigla}: contado {c} · calculado {calc} · diff {c - calc}</p>
                );
              })}
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold">Histórico</h3>
            <Input placeholder="Motivo do ajuste" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            {(contagens as { id: string; data: string; status: string; contagem_galpao_itens: { tipo_caixa_sigla: string; qtd_contada: number; qtd_calculada: number; diferenca: number }[] }[]).map((c) => (
              <div key={c.id} className="border-t border-border pt-2 text-sm">
                <div className="flex justify-between">
                  <span>{c.data}</span>
                  <span className="chip">{c.status}</span>
                </div>
                {c.contagem_galpao_itens?.map((it) => (
                  <p key={it.tipo_caixa_sigla}>{it.tipo_caixa_sigla}: {it.qtd_contada} vs {it.qtd_calculada} ({it.diferenca})</p>
                ))}
                {c.status === "pendente" && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => resolver.mutate({
                      contagemId: c.id,
                      acao: "conciliada",
                      motivo: motivo || "Ajuste de contagem",
                      userId: user!.id,
                      itens: c.contagem_galpao_itens.map((it) => ({ tipo_caixa_sigla: it.tipo_caixa_sigla, diferenca: it.diferenca })),
                    }, { onSuccess: () => toast.success("Saldo ajustado") })}>Ajustar saldo</Button>
                    <Button size="sm" variant="outline" onClick={() => resolver.mutate({
                      contagemId: c.id, acao: "mantida", userId: user!.id, motivo,
                    }, { onSuccess: () => toast.success("Mantida") })}>Manter</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
