import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/number-stepper";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useSaldosCaixa, usePosicoes } from "@/hooks/use-ledger";
import { useClientes, useFornecedores } from "@/hooks/use-cadastros";
import {
  useConciliarInventario,
  useContagensCaixa,
  useMotivosAjuste,
  useRegistrarInventario,
} from "@/hooks/use-inventario";
import { one } from "@/lib/embed";

export const Route = createFileRoute("/caixas/inventario")({
  component: Page,
  head: () => ({ meta: [{ title: "Inventário de caixas · Campo Alegre" }] }),
});

function posicaoLabel(
  p: { id: string; tipo: string; ref_id: string | null },
  clientes: { id: string; nome: string }[],
  fornecedores: { id: string; nome: string }[]
) {
  if (p.tipo === "galpao") return "Galpão";
  if (p.tipo === "cliente") return `Loja · ${clientes.find((c) => c.id === p.ref_id)?.nome ?? p.ref_id}`;
  return `Fornecedor · ${fornecedores.find((f) => f.id === p.ref_id)?.nome ?? p.ref_id}`;
}

function Page() {
  const { user, profile, isAdmin } = useAuth();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: saldos = [] } = useSaldosCaixa();
  const { data: posicoes = [] } = usePosicoes();
  const { data: clientes = [] } = useClientes();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: motivos = [] } = useMotivosAjuste();
  const registrar = useRegistrarInventario();
  const conciliar = useConciliarInventario();

  const allowedPosicoes = useMemo(() => {
    const list = posicoes as { id: string; tipo: string; ref_id: string | null }[];
    if (isAdmin || profile?.role === "user") return list;
    if (profile?.fornecedor_id) return list.filter((p) => p.tipo === "fornecedor" && p.ref_id === profile.fornecedor_id);
    if (profile?.motorista_id) return list.filter((p) => p.tipo === "cliente");
    return list.filter((p) => p.tipo === "galpao");
  }, [posicoes, isAdmin, profile]);

  const [posicaoId, setPosicaoId] = useState("");
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [obs, setObs] = useState("");
  const [contrariaId, setContrariaId] = useState("");

  const { data: fila = [] } = useContagensCaixa(isAdmin ? null : posicaoId || null);

  const calculado = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of saldos as { posicao_id: string; tipo_caixa: string; saldo: number }[]) {
      if (s.posicao_id === posicaoId && s.tipo_caixa) map[s.tipo_caixa] = Number(s.saldo ?? 0);
    }
    return map;
  }, [saldos, posicaoId]);

  const origem: "interna" | "motorista" | "fornecedor" = profile?.fornecedor_id
    ? "fornecedor"
    : profile?.motorista_id
      ? "motorista"
      : "interna";

  const motivoSel = motivos.find((m) => m.id === motivoId);

  async function handleRegistrar() {
    if (!user || !posicaoId) {
      toast.error("Selecione a posição");
      return;
    }
    try {
      await registrar.mutateAsync({
        posicao_id: posicaoId,
        origem,
        contado_por: user.id,
        itens: tipos.map((t) => ({
          tipo_caixa: t.sigla,
          qtd_contada: Number(contagem[t.sigla] ?? 0),
          qtd_calculada: Number(calculado[t.sigla] ?? 0),
        })),
      });
      setSubmitted(true);
      toast.success("Contagem registrada — saldo não foi alterado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventário de caixas"
        subtitle="Contagem cega nas 3 posições — conciliar (admin) gera um ajuste por tipo"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="space-y-1">
            <Label>Posição</Label>
            <select
              className="h-10 w-full rounded-md border px-2"
              value={posicaoId}
              onChange={(e) => {
                setPosicaoId(e.target.value);
                setSubmitted(false);
              }}
            >
              <option value="">Selecione…</option>
              {allowedPosicoes.map((p) => (
                <option key={p.id} value={p.id}>
                  {posicaoLabel(p, clientes, fornecedores)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">Informe o que há no local, por tipo. O saldo do sistema só aparece depois.</p>
          {tipos.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span className="font-medium">{t.nome} ({t.sigla})</span>
              <NumberStepper
                value={contagem[t.sigla] ?? 0}
                onChange={(n) => setContagem((s) => ({ ...s, [t.sigla]: n }))}
              />
            </div>
          ))}
          <Button className="min-h-11 w-full" onClick={handleRegistrar} disabled={registrar.isPending || !posicaoId}>
            Registrar contagem
          </Button>
          {submitted && (
            <div className="text-sm space-y-1">
              {tipos.map((t) => {
                const c = Number(contagem[t.sigla] ?? 0);
                const calc = Number(calculado[t.sigla] ?? 0);
                return (
                  <p key={t.id}>{t.sigla}: contado {c} · sistema {calc} · diff {c - calc}</p>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-semibold">Fila de conciliação</h3>
          {isAdmin && (
            <div className="space-y-2">
              <Label>Motivo do ajuste</Label>
              <select className="h-10 w-full rounded-md border px-2" value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
                <option value="">Selecione…</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
              {motivoSel?.exige_posicao_contraria && (
                <select className="h-10 w-full rounded-md border px-2" value={contrariaId} onChange={(e) => setContrariaId(e.target.value)}>
                  <option value="">Posição contrária…</option>
                  {(posicoes as { id: string; tipo: string; ref_id: string | null }[]).map((p) => (
                    <option key={p.id} value={p.id}>{posicaoLabel(p, clientes, fornecedores)}</option>
                  ))}
                </select>
              )}
              <Input placeholder="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          )}
          {(fila as {
            id: string;
            data: string;
            status: string;
            origem: string;
            posicoes_caixa: { tipo: string; ref_id: string | null } | { tipo: string; ref_id: string | null }[] | null;
            contagem_caixa_itens: { tipo_caixa: string; qtd_contada: number; qtd_calculada: number; diferenca: number }[];
          }[]).map((c) => {
            const pos = one(c.posicoes_caixa);
            return (
              <div key={c.id} className="border-t border-border pt-2 text-sm">
                <div className="flex justify-between">
                  <span>{c.data} · {pos?.tipo ?? "—"} · {c.origem}</span>
                  <span className="chip">{c.status}</span>
                </div>
                {c.contagem_caixa_itens?.map((it) => (
                  <p key={it.tipo_caixa}>{it.tipo_caixa}: {it.qtd_contada} vs {it.qtd_calculada} ({it.diferenca})</p>
                ))}
                {isAdmin && c.status === "pendente" && (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={conciliar.isPending || !motivoId}
                    onClick={() =>
                      conciliar.mutate(
                        {
                          contagemId: c.id,
                          motivoId,
                          observacao: obs || undefined,
                          posicaoContrariaId: contrariaId || null,
                        },
                        {
                          onSuccess: () => toast.success("Inventário conciliado"),
                          onError: (e) => toast.error(e.message),
                        }
                      )
                    }
                  >
                    Conciliar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
