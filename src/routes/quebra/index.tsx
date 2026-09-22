import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Image } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { HeaderAcoes, ChipLabel } from "@/components/ui-galpao";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/excel";
import { dateRangeBRT } from "@/lib/utils-date";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { useAuth } from "@/lib/auth";
import {
  useEditarQuebraItem,
  useQuebras,
  useAprovarQuebra,
  useVincularFornecedorQuebra,
  TipoOcorrenciaQuebra,
} from "@/hooks/use-quebra";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { one } from "@/lib/embed";

export const Route = createFileRoute("/quebra/")({
  component: Page,
  head: () => ({ meta: [{ title: "Ocorrências · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin, user } = useAuth();
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { from, to } = dateRangeBRT(period);
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const [tipoOcorrencia, setTipoOcorrencia] = useState<TipoOcorrenciaQuebra | "all">("all");
  const { data: laudos = [] } = useQuebras({
    from,
    to,
    fornecedorId,
    tipoOcorrencia: tipoOcorrencia === "all" ? null : tipoOcorrencia,
  });
  const editar = useEditarQuebraItem();
  const aprovar = useAprovarQuebra();
  const vincularForn = useVincularFornecedorQuebra();
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const { data: recebidos } = useQuery({
    queryKey: ["recebido-periodo", from, to, fornecedorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("itens_conferencia")
        .select(
          "quantidade_recebida, conferencias!inner(status, finalizada_em), itens_pedido(pedidos_recebimento(fornecedor_id, data_pedido))",
        )
        .eq("conferencias.status", "finalizada");
      return (data ?? []).reduce((acc, r) => {
        const ped = one(one(r.itens_pedido)?.pedidos_recebimento);
        if (!ped) return acc;
        if (ped.data_pedido < from || ped.data_pedido > to) return acc;
        if (fornecedorId && ped.fornecedor_id !== fornecedorId) return acc;
        return acc + Number(r.quantidade_recebida ?? 0);
      }, 0);
    },
  });

  const totais = useMemo(() => {
    let cx = 0,
      real = 0,
      estimado = 0,
      quebraCx = 0,
      qualidadeCx = 0;
    const laudoN = laudos.length;
    for (const l of laudos as {
      quebra_itens: {
        quantidade: number;
        valor: number;
        estimado: boolean;
        tipo_ocorrencia?: TipoOcorrenciaQuebra;
      }[];
    }[]) {
      for (const it of l.quebra_itens ?? []) {
        cx += Number(it.quantidade);
        if (it.tipo_ocorrencia === "falta_de_qualidade") qualidadeCx += Number(it.quantidade);
        else quebraCx += Number(it.quantidade);
        if (it.estimado) estimado += Number(it.valor ?? 0);
        else real += Number(it.valor ?? 0);
      }
    }
    const pct = recebidos ? (cx / recebidos) * 100 : 0;
    return { laudoN, cx, real, estimado, pct, quebraCx, qualidadeCx };
  }, [laudos, recebidos]);

  const exportar = () =>
    exportToExcel(
      "ocorrencias.xlsx",
      "Ocorrencias",
      (
        laudos as {
          registrado_em: string;
          fornecedores: { nome: string } | null;
          quebra_itens: { quantidade: number; valor: number; tipo_ocorrencia?: string }[];
        }[]
      ).map((l) => ({
        data: l.registrado_em,
        fornecedor: l.fornecedores?.nome,
        caixas: l.quebra_itens?.reduce((a, i) => a + Number(i.quantidade), 0),
        valor: l.quebra_itens?.reduce((a, i) => a + Number(i.valor ?? 0), 0),
        quebra: l.quebra_itens
          ?.filter((i) => i.tipo_ocorrencia !== "falta_de_qualidade")
          .reduce((a, i) => a + Number(i.quantidade), 0),
        qualidade: l.quebra_itens
          ?.filter((i) => i.tipo_ocorrencia === "falta_de_qualidade")
          .reduce((a, i) => a + Number(i.quantidade), 0),
      })),
    );

  return (
    <div>
      <PageHeader
        title="Ocorrências"
        subtitle="Laudos de quebra e falta de qualidade, % de ocorrência e visões por produto e fornecedor"
        actions={
          <HeaderAcoes
            primary={
              <Button asChild size="sm">
                <Link to="/quebra/lancar">Lançar ocorrência</Link>
              </Button>
            }
            detalhes={[{ label: "Exportar", onClick: exportar }]}
          />
        }
      />
      <div className="flex flex-wrap gap-2 mb-4">
        {(["today", "week", "month"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "default" : "outline"}
            onClick={() => setPeriod(p)}
          >
            {p === "today" ? "Hoje" : p === "week" ? "7 dias" : "30 dias"}
          </Button>
        ))}
        <div className="w-full sm:w-56">
          <SeletorCadastro
            tipo="fornecedor"
            value={fornecedorId}
            onChange={(id) => setFornecedorId(id || null)}
            allowClear
            clearLabel="Todos fornecedores"
            placeholder="Todos fornecedores"
          />
        </div>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={tipoOcorrencia}
          onChange={(e) => setTipoOcorrencia(e.target.value as TipoOcorrenciaQuebra | "all")}
        >
          <option value="all">Todas ocorrências</option>
          <option value="quebra">Quebra</option>
          <option value="falta_de_qualidade">Falta de qualidade</option>
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
        <Kpi label="Laudos" value={String(totais.laudoN)} />
        <Kpi label="Total un" value={String(totais.cx)} />
        <Kpi
          label="R$ real"
          value={totais.real.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        />
        <Kpi label="% ocorrência" value={`${totais.pct.toFixed(1)}%`} />
      </div>
      <div className="space-y-3">
        {(
          laudos as {
            id: string;
            status?: string;
            registrado_em: string;
            observacao: string | null;
            fornecedor_id?: string | null;
            fornecedores: { nome: string } | null;
            profiles: { nome: string } | null;
            aprovador: { nome: string } | null;
            aprovado_em: string | null;
            quebra_itens: {
              id: string;
              quantidade: number;
              valor: number;
              estimado: boolean;
              conferencia_item_id: string | null;
              produtos: { nome: string } | null;
              tipo_ocorrencia?: TipoOcorrenciaQuebra;
              foto_url?: string | null;
              observacao?: string | null;
            }[];
          }[]
        ).map((l) => {
          const origemNaoId = l.status === "origem_nao_identificada" || !l.fornecedor_id;
          const semVinculo = l.quebra_itens?.some((i) => !i.conferencia_item_id);
          return (
            <div key={l.id} className="rounded-xl border p-3 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <strong>
                    {l.fornecedores?.nome ??
                      (origemNaoId ? "Origem não identificada" : "—")}
                  </strong>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <ChipLabel value={origemNaoId ? "origem não identificada" : null} tone="warn" />
                    <ChipLabel value={semVinculo ? "sem vínculo" : null} tone="warn" />
                    <ChipLabel
                      value={l.aprovado_em ? "Aprovado" : "Pendente aprovação"}
                      tone={l.aprovado_em ? "ok" : "muted"}
                    />
                  </div>
                  {isAdmin && !l.fornecedor_id && (
                    <div className="mt-2 w-full max-w-xs">
                      <SeletorCadastro
                        tipo="fornecedor"
                        placeholder="Vincular fornecedor…"
                        value={null}
                        onChange={(id) => {
                          if (!id) return;
                          vincularForn.mutate(
                            { quebraId: l.id, fornecedorId: id },
                            { onSuccess: () => toast.success("Fornecedor vinculado") },
                          );
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{l.registrado_em.slice(0, 16)}</div>
                  <div>por {l.profiles?.nome}</div>
                  {l.aprovado_em && (
                    <div className="text-[var(--success)]">aprovado por {l.aprovador?.nome}</div>
                  )}
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {l.quebra_itens?.map((it) => (
                  <div
                    key={it.id}
                    className="flex flex-wrap items-center gap-2 py-2 border-t border-border/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{it.produtos?.nome}</span>
                        <ChipLabel
                          value={
                            it.tipo_ocorrencia === "falta_de_qualidade" ? "Qualidade" : "Quebra"
                          }
                          tone={it.tipo_ocorrencia === "falta_de_qualidade" ? "warn" : "danger"}
                        />
                        {it.foto_url && (
                          <button
                            type="button"
                            onClick={() => setFotoModal(it.foto_url!)}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Image size={12} /> Foto
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.quantidade} un {it.estimado && "· preço estimado"}
                        {it.observacao && <span className="ml-2">· {it.observacao}</span>}
                      </div>
                    </div>
                    <span className="font-semibold">
                      {Number(it.valor ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-7"
                        onClick={() =>
                          editar.mutate(
                            {
                              quebraId: l.id,
                              itemId: it.id,
                              antes: { quantidade: it.quantidade },
                              depois: { quantidade: 0 },
                              autorId: user!.id,
                            },
                            { onSuccess: () => toast.success("Item zerado") },
                          )
                        }
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {l.observacao && <p className="text-muted-foreground mt-2 text-xs">{l.observacao}</p>}
              {isAdmin && !l.aprovado_em && (
                <div className="mt-3 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      aprovar.mutate(
                        { quebraId: l.id, aprovadoPor: user!.id },
                        { onSuccess: () => toast.success("Laudo aprovado") },
                      )
                    }
                    disabled={aprovar.isPending}
                  >
                    <Check size={14} className="mr-1" /> Aprovar laudo
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {fotoModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setFotoModal(null)}
        >
          <img src={fotoModal} alt="Evidência" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
