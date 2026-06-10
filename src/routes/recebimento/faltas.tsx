import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { BarRow } from "@/components/charts";
import { Percent, TrendingDown, AlertTriangle, DollarSign } from "lucide-react";
import { useFaltas, useConfigValor } from "@/hooks/use-pedidos";
import { useFornecedores } from "@/hooks/use-cadastros";
import { exportToExcel } from "@/lib/excel";
import { todayBRT } from "@/lib/utils-date";
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
      codigo: string;
      fornecedor_id: string;
      fornecedores: { id: string; nome: string } | null;
    } | null;
  } | null;
};

function Page() {
  const [fornecedorId, setFornecedorId] = useState<string>("all");
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const [divergencia, setDivergencia] = useState<"falta" | "sobra" | "qualidade" | "all">("falta");
  const [modo, setModo] = useState<"itens" | "resumo">("itens");

  const { data: fornecedores = [] } = useFornecedores();
  const { data: faltas = [], isLoading, error } = useFaltas({
    fornecedorId: fornecedorId === "all" ? null : fornecedorId,
    period,
    divergencia,
  });
  const { data: valorUnitario = 4.5 } = useConfigValor("impacto_falta_por_unidade", 4.5);

  const faltasComImpacto = useMemo(() => {
    return (faltas as FaltaRow[]).map((f) => {
      const pedido = Number(f.itens_pedido?.quantidade_pedida ?? 0);
      const recebido = Number(f.quantidade_recebida);
      const falta = Math.max(0, pedido - recebido);
      const qtd = f.quantidade_divergencia > 0 ? Number(f.quantidade_divergencia) : falta;
      return {
        ...f,
        produto: f.itens_pedido?.produtos?.nome ?? "—",
        unid: f.itens_pedido?.produtos?.unidade ?? "un",
        fornecedor: f.itens_pedido?.pedidos_recebimento?.fornecedores?.nome ?? "—",
        fornecedor_id: f.itens_pedido?.pedidos_recebimento?.fornecedor_id,
        codigo: f.itens_pedido?.pedidos_recebimento?.codigo ?? "—",
        pedido,
        recebido,
        falta: qtd,
        impacto: qtd * valorUnitario,
        tipo: f.divergencia ?? (f.tem_problema_qualidade ? "qualidade" : "falta"),
      };
    });
  }, [faltas, valorUnitario]);

  const resumoFiltrado = useMemo(() => {
    const map = new Map<string, { fornecedor: string; itens: number; qty: number; impacto: number }>();
    for (const f of faltasComImpacto) {
      const key = f.fornecedor_id ?? f.fornecedor;
      const cur = map.get(key) ?? { fornecedor: f.fornecedor, itens: 0, qty: 0, impacto: 0 };
      cur.itens += 1;
      cur.qty += f.falta;
      cur.impacto += f.impacto;
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
        "Impacto R$": i.impacto.toFixed(2),
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

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={fornecedorId} onValueChange={setFornecedorId}>
          <SelectTrigger className="w-[200px]">
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
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">7 dias</SelectItem>
            <SelectItem value="month">30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={divergencia} onValueChange={(v) => setDivergencia(v as typeof divergencia)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="falta">Faltas</SelectItem>
            <SelectItem value="sobra">Sobras</SelectItem>
            <SelectItem value="qualidade">Qualidade</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {(["itens", "resumo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${
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
        <div className="card-base overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left px-4 py-3">Fornecedor</th>
                <th className="text-right px-4 py-3">Itens</th>
                <th className="text-right px-4 py-3">Qtd divergência</th>
                <th className="text-right px-4 py-3">Impacto R$</th>
              </tr>
            </thead>
            <tbody>
              {resumoFiltrado.map((r) => (
                <tr key={r.fornecedor} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">{r.fornecedor}</td>
                  <td className="px-4 py-3 text-right">{r.itens}</td>
                  <td className="px-4 py-3 text-right">{r.qty.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-bold">R$ {r.impacto.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left px-4 py-3">Pedido</th>
                <th className="text-left px-4 py-3">Fornecedor</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-right px-4 py-3">Pedido</th>
                <th className="text-right px-4 py-3">Recebido</th>
                <th className="text-right px-4 py-3">Divergência</th>
                <th className="text-right px-4 py-3">Impacto</th>
              </tr>
            </thead>
            <tbody>
              {faltasComImpacto.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-4 py-3">{i.codigo}</td>
                  <td className="px-4 py-3 font-semibold text-navy">{i.fornecedor}</td>
                  <td className="px-4 py-3">{i.produto}</td>
                  <td className="px-4 py-3 text-right">{i.pedido}</td>
                  <td className="px-4 py-3 text-right">{i.recebido}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="chip chip-danger text-xs">{i.tipo} · {i.falta}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">R$ {i.impacto.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
