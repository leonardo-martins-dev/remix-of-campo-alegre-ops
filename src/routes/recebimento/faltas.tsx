import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSpreadsheet, Receipt } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { KpiCard } from "@/components/kpi-card";
import { BarRow } from "@/components/charts";
import { Percent, TrendingDown, AlertTriangle, DollarSign } from "lucide-react";
import { useFaltas, useConfigValor } from "@/hooks/use-pedidos";
import { useFornecedores } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { useCreateVale, useValesPendentes } from "@/hooks/use-vales";
import { exportToExcel } from "@/lib/excel";
import { formatDateBRT, todayBRT } from "@/lib/utils-date";
import { one } from "@/lib/embed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/recebimento/faltas")({
  component: Page,
  head: () => ({ meta: [{ title: "Relatório de Faltas · Campo Alegre" }] }),
});

type FaltaRow = {
  id: string;
  quantidade_recebida: number;
  divergencia: string | null;
  quantidade_divergencia: number;
  tem_problema_qualidade: boolean;
  itens_pedido: {
    quantidade_pedida: number;
    produtos: { nome: string; unidade: string } | null;
    pedidos_recebimento: {
      id: string;
      codigo: string;
      fornecedor_id: string;
      fornecedores: { id: string; nome: string } | null;
    } | null;
  } | null;
};

function Page() {
  const { isAdmin, user } = useAuth();
  const [fornecedorId, setFornecedorId] = useState<string>("all");
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const [divergencia, setDivergencia] = useState<"falta" | "sobra" | "qualidade" | "all">("falta");
  const [modo, setModo] = useState<"itens" | "resumo">("itens");
  const [tolFiltro, setTolFiltro] = useState<"all" | "acima" | "dentro">("all");

  const { data: fornecedores = [] } = useFornecedores();
  const { data: faltas = [], isLoading, error } = useFaltas({
    fornecedorId: fornecedorId === "all" ? null : fornecedorId,
    period,
    divergencia,
  });
  const { data: valorUnitario = 4.5 } = useConfigValor("impacto_falta_por_unidade", 4.5);
  const createVale = useCreateVale();
  const { data: valesExistentes = [] } = useValesPendentes();
  const valeItemIds = useMemo(
    () => new Set(valesExistentes.map((v) => v.item_conferencia_id).filter(Boolean)),
    [valesExistentes],
  );

  const faltasComImpacto = useMemo(() => {
    return faltas.map((raw) => {
      const rec = raw as unknown as {
        id: string;
        quantidade_recebida: number;
        quantidade_divergencia: number;
        divergencia: string | null;
        tem_problema_qualidade: boolean;
        valor_divergencia?: number;
        estimado?: boolean;
        dentro_tolerancia?: boolean | null;
        recebido_acumulado?: number;
        encerrado_em?: string | null;
        encerrado_por_nome?: string | null;
        motivo_encerramento?: string | null;
        itens_pedido?: unknown;
      };
      const f = rec;
      const ip = one(rec.itens_pedido as FaltaRow["itens_pedido"] | FaltaRow["itens_pedido"][] | null);
      const ped = one(ip?.pedidos_recebimento);
      const prod = one(ip?.produtos);
      const forn = one(ped?.fornecedores);
      const pedido = Number(ip?.quantidade_pedida ?? 0);
      const recebido = Number(f.recebido_acumulado ?? f.quantidade_recebida);
      const falta = Math.max(0, pedido - recebido);
      const qtd = f.quantidade_divergencia > 0 ? Number(f.quantidade_divergencia) : falta;
      const preco = Number((ip as { preco_unitario?: number } | null)?.preco_unitario) || valorUnitario;
      return {
        ...f,
        id: rec.id,
        item_conferencia_id: rec.id,
        pedido_id: ped?.id ?? null,
        produto: prod?.nome ?? "—",
        unid: prod?.unidade ?? "un",
        fornecedor: forn?.nome ?? "—",
        fornecedor_id: ped?.fornecedor_id,
        codigo: ped?.codigo ?? "—",
        pedido,
        recebido,
        falta: qtd,
        impacto: Number(f.valor_divergencia ?? qtd * preco),
        estimado: Boolean(f.estimado) || !(ip as { preco_unitario?: number } | null)?.preco_unitario,
        preco,
        tipo: f.divergencia ?? (f.tem_problema_qualidade ? "qualidade" : "falta"),
        dentro_tolerancia: f.dentro_tolerancia ?? null,
        encerrado_em: f.encerrado_em ?? null,
        encerrado_por_nome: f.encerrado_por_nome ?? null,
        motivo_encerramento: f.motivo_encerramento ?? null,
      };
    }).filter((row) => {
      if (tolFiltro === "acima") return row.dentro_tolerancia === false;
      if (tolFiltro === "dentro") return row.dentro_tolerancia === true;
      return true;
    });
  }, [faltas, valorUnitario, tolFiltro]);

  const resumoFiltrado = useMemo(() => {
    const map = new Map<string, { fornecedor: string; itens: number; qty: number; impacto: number; encerrados: string[] }>();
    for (const f of faltasComImpacto) {
      const key = f.fornecedor_id ?? f.fornecedor;
      const cur = map.get(key) ?? { fornecedor: f.fornecedor, itens: 0, qty: 0, impacto: 0, encerrados: [] };
      cur.itens += 1;
      cur.qty += f.falta;
      cur.impacto += f.impacto;
      if (f.encerrado_em) {
        const chip = `encerrado em ${formatDateBRT(f.encerrado_em)} por ${f.encerrado_por_nome ?? "—"} — ${f.motivo_encerramento ?? "—"}`;
        if (!cur.encerrados.includes(chip)) cur.encerrados.push(chip);
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.impacto - a.impacto);
  }, [faltasComImpacto]);

  const impactoTotal = faltasComImpacto.reduce((a, i) => a + i.impacto, 0);
  const piorFornecedor = resumoFiltrado[0] ?? null;

  const exportExcel = () => {
    exportToExcel(
      `faltas-${todayBRT()}.xlsx`,
      "Faltas",
      faltasComImpacto.map((i) => ({
        Pedido: i.codigo,
        Fornecedor: i.fornecedor,
        Produto: i.produto,
        Pedido_qtd: i.pedido,
        Recebido: i.recebido,
        Falta: i.falta,
        Tipo: i.tipo,
        Preco: i.preco,
        "Impacto R$": i.impacto.toFixed(2),
        Estimado: i.estimado ? "sim" : "nao",
        Tolerancia: i.dentro_tolerancia === false ? "acima" : i.dentro_tolerancia === true ? "dentro" : "",
        Encerrado: i.encerrado_em
          ? `encerrado em ${formatDateBRT(i.encerrado_em)} por ${i.encerrado_por_nome ?? "—"} — ${i.motivo_encerramento ?? ""}`
          : "",
      }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Relatório de Faltas por Fornecedor"
        subtitle="Divergências no período (fuso Brasília) · base para cobrança e ajuste contratual"
        actions={
          <button
            type="button"
            onClick={exportExcel}
            disabled={!faltasComImpacto.length}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-4">
        <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
          <Select value={fornecedorId} onValueChange={setFornecedorId}>
            <SelectTrigger className="w-full sm:w-[180px] h-10 sm:h-9">
              <SelectValue placeholder="Fornecedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos fornecedores</SelectItem>
              {fornecedores.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-full sm:w-[120px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">7 dias</SelectItem>
              <SelectItem value="month">30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={divergencia} onValueChange={(v) => setDivergencia(v as typeof divergencia)}>
            <SelectTrigger className="w-full sm:w-[120px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="falta">Faltas</SelectItem>
              <SelectItem value="sobra">Sobras</SelectItem>
              <SelectItem value="qualidade">Qualidade</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tolFiltro} onValueChange={(v) => setTolFiltro(v as typeof tolFiltro)}>
            <SelectTrigger className="w-full sm:w-[140px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda tolerância</SelectItem>
              <SelectItem value="acima">Acima da régua</SelectItem>
              <SelectItem value="dentro">Dentro da régua</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(["itens", "resumo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`px-3 h-10 sm:h-9 rounded-md text-xs font-semibold whitespace-nowrap ${
                modo === m ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {m === "itens" ? "Por item" : "Por fornecedor"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          Erro ao carregar faltas: {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Itens em falta"
          value={isLoading ? "…" : String(faltasComImpacto.length)}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Impacto total"
          value={isLoading ? "…" : `R$ ${impactoTotal.toFixed(2)}`}
          icon={DollarSign}
        />
        <KpiCard
          label="Pior fornecedor (período)"
          value={isLoading ? "…" : piorFornecedor?.fornecedor ?? "—"}
          icon={TrendingDown}
        />
        <KpiCard
          label="Fornecedores c/ falta"
          value={isLoading ? "…" : String(resumoFiltrado.length)}
          icon={Percent}
        />
      </div>

      {modo === "resumo" ? (
        <>
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {resumoFiltrado.map((r) => (
              <div key={r.fornecedor} className="mobile-item-card">
                <div className="font-bold text-navy text-base mb-3">{r.fornecedor}</div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <div className="text-xs text-muted-foreground">Itens</div>
                    <div className="font-bold text-navy">{r.itens}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <div className="text-xs text-muted-foreground">Qtd diverg.</div>
                    <div className="font-bold text-navy">{r.qty.toFixed(1)}</div>
                  </div>
                </div>
                {r.encerrados.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {r.encerrados.map((e) => (
                      <span key={e} className="chip chip-muted text-xs">{e}</span>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Impacto</span>
                  <span className="font-bold text-navy">R$ {r.impacto.toFixed(2)}</span>
                </div>
              </div>
            ))}
            {!isLoading && resumoFiltrado.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">Nenhuma falta no período</p>
            )}
          </div>
          <div className="hidden lg:block card-base">
            <TableWrapper stickyFirstColumn>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Fornecedor</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Itens</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Qtd diverg.</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Encerramento</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Impacto R$</th>
                  </tr>
                </thead>
                <tbody>
                  {resumoFiltrado.map((r) => (
                    <tr key={r.fornecedor} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{r.fornecedor}</td>
                      <td className="px-4 py-3 text-right">{r.itens}</td>
                      <td className="px-4 py-3 text-right">{r.qty.toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.encerrados.map((e) => (
                            <span key={e} className="chip chip-muted text-xs">{e}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap">R$ {r.impacto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        </>
      ) : (
        <>
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {faltasComImpacto.map((i) => (
              <div key={i.id} className="mobile-item-card item-status-danger">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-navy text-sm">{i.produto}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{i.codigo} · {i.fornecedor}</div>
                  </div>
                  <span className="chip chip-danger text-xs shrink-0">{i.tipo} · {i.falta}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <div className="text-xs text-muted-foreground">Pedido</div>
                    <div className="font-bold text-navy">{i.pedido}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <div className="text-xs text-muted-foreground">Recebido</div>
                    <div className="font-bold text-navy">{i.recebido}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-xs text-amber-600">Impacto</div>
                    <div className="font-bold text-navy text-sm">R$ {i.impacto.toFixed(2)}</div>
                  </div>
                </div>
                {i.encerrado_em && (
                  <div className="mb-2">
                    <span className="chip chip-muted text-xs">Encerrado {formatDateBRT(i.encerrado_em)}</span>
                  </div>
                )}
                {isAdmin && (
                  <div className="mobile-actions">
                    {i.tipo === "falta" && i.pedido_id && i.fornecedor_id && !valeItemIds.has(i.item_conferencia_id) ? (
                      <button
                        type="button"
                        disabled={createVale.isPending}
                        className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm font-semibold disabled:opacity-50"
                        onClick={async () => {
                          if (!user?.id || !i.pedido_id || !i.fornecedor_id) return;
                          try {
                            await createVale.mutateAsync({
                              pedido_id: i.pedido_id,
                              item_conferencia_id: i.item_conferencia_id,
                              fornecedor_id: i.fornecedor_id,
                              conferente_id: user.id,
                              produto_nome: i.produto,
                              quantidade_pedida: i.pedido,
                              quantidade_recebida: i.recebido,
                              diferenca: i.falta,
                              preco_unitario: i.preco !== valorUnitario ? i.preco : null,
                              valor_calculado: i.impacto,
                              estimado: i.estimado,
                            });
                            toast.success("Vale solicitado com sucesso");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Erro ao solicitar vale");
                          }
                        }}
                      >
                        <Receipt size={14} /> Solicitar vale
                      </button>
                    ) : valeItemIds.has(i.item_conferencia_id) ? (
                      <span className="text-xs text-muted-foreground">Vale criado</span>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {!isLoading && faltasComImpacto.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">Nenhuma falta no período</p>
            )}
          </div>
          <div className="hidden lg:block card-base">
            <TableWrapper stickyFirstColumn>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Pedido</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Fornecedor</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Produto</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Pedido</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Recebido</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Diverg.</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Encerramento</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Impacto</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {faltasComImpacto.map((i) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-4 py-3 whitespace-nowrap">{i.codigo}</td>
                      <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{i.fornecedor}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{i.produto}</td>
                      <td className="px-4 py-3 text-right">{i.pedido}</td>
                      <td className="px-4 py-3 text-right">{i.recebido}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="chip chip-danger text-xs whitespace-nowrap">{i.tipo} · {i.falta}</span>
                      </td>
                      <td className="px-4 py-3">
                        {i.encerrado_em && (
                          <span className="chip chip-muted text-xs">
                            {formatDateBRT(i.encerrado_em)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap">R$ {i.impacto.toFixed(2)}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {i.tipo === "falta" && i.pedido_id && i.fornecedor_id && !valeItemIds.has(i.item_conferencia_id) ? (
                            <button
                              type="button"
                              disabled={createVale.isPending}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline disabled:opacity-50 min-h-[44px] min-w-[44px] px-2"
                              onClick={async () => {
                                if (!user?.id || !i.pedido_id || !i.fornecedor_id) return;
                                try {
                                  await createVale.mutateAsync({
                                    pedido_id: i.pedido_id,
                                    item_conferencia_id: i.item_conferencia_id,
                                    fornecedor_id: i.fornecedor_id,
                                    conferente_id: user.id,
                                    produto_nome: i.produto,
                                    quantidade_pedida: i.pedido,
                                    quantidade_recebida: i.recebido,
                                    diferenca: i.falta,
                                    preco_unitario: i.preco !== valorUnitario ? i.preco : null,
                                    valor_calculado: i.impacto,
                                    estimado: i.estimado,
                                  });
                                  toast.success("Vale solicitado com sucesso");
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Erro ao solicitar vale");
                                }
                              }}
                            >
                              <Receipt size={12} /> Vale
                            </button>
                          ) : valeItemIds.has(i.item_conferencia_id) ? (
                            <span className="text-xs text-muted-foreground">Vale criado</span>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        </>
      )}

      {modo === "itens" && !isLoading && faltasComImpacto.length > 0 && (
        <div className="mt-6 card-base p-4">
          <h3 className="text-sm font-bold text-navy mb-3">Ranking de impacto por fornecedor</h3>
          {resumoFiltrado.slice(0, 5).map((r) => (
            <BarRow
              key={r.fornecedor}
              label={r.fornecedor}
              value={r.impacto}
              max={piorFornecedor?.impacto ?? 1}
              suffix={`R$ ${r.impacto.toFixed(0)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
