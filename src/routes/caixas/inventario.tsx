import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Smartphone } from "lucide-react";
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
import { formatDateBRT } from "@/lib/utils-date";
import { statusLabel } from "@/lib/labels";

type Search = { posicao?: string };

export const Route = createFileRoute("/caixas/inventario")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): Search => ({
    posicao: typeof s.posicao === "string" ? s.posicao : undefined,
  }),
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
  const { posicao } = Route.useSearch();
  const { profile } = useAuth();
  const [view, setView] = useState<"painel" | "campo">(profile?.motorista_id ? "campo" : "painel");

  return (
    <div>
      <PageHeader
        title="Inventário de caixas"
        subtitle="Contagem cega nas 3 posições — conciliar (admin) gera um ajuste por tipo"
        actions={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setView("painel")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "painel" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Painel
            </button>
            <button
              type="button"
              onClick={() => setView("campo")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "campo" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Modo campo
            </button>
          </div>
        }
      />
      {view === "campo" ? <CampoInventario initialTipo={posicao} /> : <PainelInventario initialTipo={posicao} />}
    </div>
  );
}

function useInventarioState(initialTipo?: string) {
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
    const list = (posicoes as { id: string; tipo: string; ref_id: string | null }[]).filter((p) => {
      if (p.tipo === "cliente") return clientes.some((c) => c.id === p.ref_id && c.ativo !== false);
      if (p.tipo === "fornecedor") return fornecedores.some((f) => f.id === p.ref_id && f.ativo !== false);
      return true;
    });
    if (isAdmin || profile?.role === "user") return list;
    if (profile?.fornecedor_id) return list.filter((p) => p.tipo === "fornecedor" && p.ref_id === profile.fornecedor_id);
    if (profile?.motorista_id) return list.filter((p) => p.tipo === "cliente");
    return list.filter((p) => p.tipo === "galpao");
  }, [posicoes, isAdmin, profile, clientes, fornecedores]);

  const [posicaoId, setPosicaoId] = useState("");
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [obs, setObs] = useState("");
  const [contrariaId, setContrariaId] = useState("");

  useEffect(() => {
    if (posicaoId || !allowedPosicoes.length) return;
    const wanted = initialTipo === "galpao"
      ? allowedPosicoes.find((p) => p.tipo === "galpao")
      : initialTipo
        ? allowedPosicoes.find((p) => p.id === initialTipo || p.tipo === initialTipo)
        : profile?.motorista_id
          ? allowedPosicoes.find((p) => p.tipo === "cliente")
          : allowedPosicoes.find((p) => p.tipo === "galpao");
    if (wanted) setPosicaoId(wanted.id);
  }, [allowedPosicoes, initialTipo, posicaoId, profile?.motorista_id]);

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

  return {
    tipos,
    clientes,
    fornecedores,
    motivos,
    allowedPosicoes,
    posicoes: posicoes as { id: string; tipo: string; ref_id: string | null }[],
    posicaoId,
    setPosicaoId,
    contagem,
    setContagem,
    submitted,
    motivoId,
    setMotivoId,
    obs,
    setObs,
    contrariaId,
    setContrariaId,
    fila,
    calculado,
    origem,
    handleRegistrar,
    registrar,
    conciliar,
    isAdmin,
  };
}

function PainelInventario({ initialTipo }: { initialTipo?: string }) {
  const s = useInventarioState(initialTipo);
  const motivoSel = s.motivos.find((m) => m.id === s.motivoId);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <Label>Posição</Label>
          <select
            className="h-10 w-full rounded-md border px-2"
            value={s.posicaoId}
            onChange={(e) => {
              s.setPosicaoId(e.target.value);
            }}
          >
            <option value="">Selecione…</option>
            {s.allowedPosicoes.map((p) => (
              <option key={p.id} value={p.id}>
                {posicaoLabel(p, s.clientes, s.fornecedores)}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">Informe o que há no local, por tipo. O saldo do sistema só aparece depois.</p>
        {s.tipos.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3">
            <span className="font-medium">{t.nome} ({t.sigla})</span>
            <NumberStepper
              value={s.contagem[t.sigla] ?? 0}
              onChange={(n) => s.setContagem((prev) => ({ ...prev, [t.sigla]: n }))}
            />
          </div>
        ))}
        <Button className="min-h-11 w-full" onClick={s.handleRegistrar} disabled={s.registrar.isPending || !s.posicaoId}>
          Registrar contagem
        </Button>
        {s.submitted && (
          <div className="text-sm space-y-1">
            {s.tipos.map((t) => {
              const c = Number(s.contagem[t.sigla] ?? 0);
              const calc = Number(s.calculado[t.sigla] ?? 0);
              return (
                <p key={t.id}>{t.sigla}: contado {c} · sistema {calc} · diff {c - calc}</p>
              );
            })}
          </div>
        )}
      </div>
      <FilaConciliacao s={s} motivoSel={motivoSel} />
    </div>
  );
}

function CampoInventario({ initialTipo }: { initialTipo?: string }) {
  const s = useInventarioState(initialTipo);
  const pos = s.allowedPosicoes.find((p) => p.id === s.posicaoId);

  return (
    <div className="max-w-sm mx-auto">
      <div className="mx-auto" style={{ width: 340 }}>
        <div className="rounded-[36px] p-2 shadow-xl" style={{ background: "#0F1B2D" }}>
          <div className="rounded-[28px] overflow-hidden text-white p-5 space-y-4" style={{ background: "#16243A", minHeight: 640 }}>
            <div className="flex items-center gap-2">
              <Smartphone size={14} className="opacity-70" />
              <span className="text-xs uppercase tracking-wider opacity-60">
                {s.origem === "motorista" ? "Contagem na loja" : "Inventário"}
              </span>
            </div>
            <h2 className="text-2xl font-bold">Contar caixas</h2>
            <select
              className="w-full h-12 rounded-2xl px-3 text-sm text-navy"
              value={s.posicaoId}
              onChange={(e) => s.setPosicaoId(e.target.value)}
            >
              <option value="">Posição…</option>
              {s.allowedPosicoes.map((p) => (
                <option key={p.id} value={p.id}>{posicaoLabel(p, s.clientes, s.fornecedores)}</option>
              ))}
            </select>
            {s.tipos.map((t) => (
              <div key={t.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="text-xs uppercase tracking-wider opacity-60 mb-2">{t.nome}</div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={`Diminuir ${t.nome}`}
                    onClick={() => s.setContagem((prev) => ({ ...prev, [t.sigla]: Math.max(0, (prev[t.sigla] ?? 0) - 1) }))}
                    className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center"
                  >
                    <Minus size={18} />
                  </button>
                  <span className="text-5xl font-bold tabular-nums">{s.contagem[t.sigla] ?? 0}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${t.nome}`}
                    onClick={() => s.setContagem((prev) => ({ ...prev, [t.sigla]: (prev[t.sigla] ?? 0) + 1 }))}
                    className="h-12 w-12 rounded-2xl flex items-center justify-center"
                    style={{ background: "var(--primary)" }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            ))}
            <Button className="min-h-12 w-full" onClick={s.handleRegistrar} disabled={s.registrar.isPending || !s.posicaoId}>
              Registrar {pos ? posicaoLabel(pos, s.clientes, s.fornecedores) : ""}
            </Button>
            {s.submitted && (
              <p className="text-xs opacity-70">Contagem enviada. O admin concilia no painel.</p>
            )}
          </div>
        </div>
      </div>
      {s.isAdmin && (
        <div className="mt-6">
          <FilaConciliacao s={s} motivoSel={s.motivos.find((m) => m.id === s.motivoId)} />
        </div>
      )}
    </div>
  );
}

function FilaConciliacao({
  s,
  motivoSel,
}: {
  s: ReturnType<typeof useInventarioState>;
  motivoSel?: { exige_posicao_contraria: boolean };
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Fila de conciliação</h3>
      {s.isAdmin && (
        <div className="space-y-2">
          <Label>Motivo do ajuste</Label>
          <select className="h-10 w-full rounded-md border px-2" value={s.motivoId} onChange={(e) => s.setMotivoId(e.target.value)}>
            <option value="">Selecione…</option>
            {s.motivos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          {motivoSel?.exige_posicao_contraria && (
            <select className="h-10 w-full rounded-md border px-2" value={s.contrariaId} onChange={(e) => s.setContrariaId(e.target.value)}>
              <option value="">Posição contrária…</option>
              {s.posicoes.map((p) => (
                <option key={p.id} value={p.id}>{posicaoLabel(p, s.clientes, s.fornecedores)}</option>
              ))}
            </select>
          )}
          <Input placeholder="Observação" value={s.obs} onChange={(e) => s.setObs(e.target.value)} />
        </div>
      )}
      {(s.fila as {
        id: string;
        data: string;
        status: string;
        origem: string;
        conciliado_em?: string | null;
        observacao?: string | null;
        posicoes_caixa: { tipo: string; ref_id: string | null } | { tipo: string; ref_id: string | null }[] | null;
        conciliador?: { nome?: string } | { nome?: string }[] | null;
        motivos_ajuste_caixa?: { nome?: string } | { nome?: string }[] | null;
        contagem_caixa_itens: { tipo_caixa: string; qtd_contada: number; qtd_calculada: number; diferenca: number }[];
      }[]).map((c) => {
        const pos = one(c.posicoes_caixa);
        const autor = one(c.conciliador);
        const motivo = one(c.motivos_ajuste_caixa);
        return (
          <div key={c.id} className="border-t border-border pt-2 text-sm">
            <div className="flex justify-between">
              <span>{c.data} · {statusLabel(pos?.tipo)} · {statusLabel(c.origem)}</span>
              <span className="chip">{statusLabel(c.status)}</span>
            </div>
            {c.contagem_caixa_itens?.map((it) => (
              <p key={it.tipo_caixa}>{it.tipo_caixa}: {it.qtd_contada} vs {it.qtd_calculada} ({it.diferenca})</p>
            ))}
            {(c.conciliado_em || motivo || autor) && (
              <p className="text-xs text-muted-foreground mt-1">
                {autor?.nome ?? "—"} · {c.conciliado_em ? formatDateBRT(c.conciliado_em) : "—"}
                {motivo?.nome ? ` · ${motivo.nome}` : ""}
                {c.observacao ? ` — ${c.observacao}` : ""}
              </p>
            )}
            {s.isAdmin && c.status === "pendente" && (
              <Button
                size="sm"
                className="mt-2"
                disabled={s.conciliar.isPending || !s.motivoId}
                onClick={() =>
                  s.conciliar.mutate(
                    {
                      contagemId: c.id,
                      motivoId: s.motivoId,
                      observacao: s.obs || undefined,
                      posicaoContrariaId: s.contrariaId || null,
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
  );
}
