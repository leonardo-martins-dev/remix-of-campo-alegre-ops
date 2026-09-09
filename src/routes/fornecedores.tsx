import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/excel";
import { dateRangeBRT, isoWeekKeyBRT } from "@/lib/utils-date";
import { formatBRL } from "@/lib/format";
import { useFornecedores } from "@/hooks/use-cadastros";
import { useFaltas, useConfigValor, useFillRate } from "@/hooks/use-pedidos";
import { useQuebras } from "@/hooks/use-quebra";
import { useSaldosCaixa } from "@/hooks/use-ledger";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";

export const Route = createFileRoute("/fornecedores")({
  component: Page,
  head: () => ({ meta: [{ title: "Placar de fornecedores · Campo Alegre" }] }),
});

function Page() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const { from, to } = dateRangeBRT(period);
  const { data: fornecedores = [] } = useFornecedores();
  const { data: faltas = [] } = useFaltas({ period, divergencia: "all" });
  const { data: quebras = [] } = useQuebras({ from, to });
  const { data: saldos = [] } = useSaldosCaixa();
  const { data: fillRows = [] } = useFillRate();
  const { data: alvo = 95 } = useConfigValor("alvo_fill_rate", 95);
  const { data: benchQ = 2 } = useConfigValor("benchmark_quebra_fornecedor", 2);
  const [fichaId, setFichaId] = useState<string | null>(null);

  const { data: pedidos = [] } = useQuery({
    queryKey: ["pedidos-placar", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("pedidos_recebimento")
        .select("id, fornecedor_id, status, data_pedido, conferencias(id, status)")
        .gte("data_pedido", from)
        .lte("data_pedido", to);
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    return fornecedores
      .filter((f) => f.nome !== "Aguardando vínculo")
      .map((f) => {
      const peds = (pedidos as { fornecedor_id: string; id: string; conferencias: { status: string }[] }[]).filter((p) => p.fornecedor_id === f.id);
      const faltasF = faltas
        .map((x) => {
          const ip = one((x as { itens_pedido?: unknown }).itens_pedido) as { pedidos_recebimento?: unknown; preco_unitario?: number } | null;
          const ped = one(ip?.pedidos_recebimento) as { fornecedor_id?: string } | null;
          return { ...x, _forn: ped?.fornecedor_id, _ip: ip };
        })
        .filter((x) => x._forn === f.id) as (typeof faltas[number] & { divergencia: string; quantidade_divergencia: number; valor_divergencia?: number; dentro_tolerancia?: boolean })[];
      const quebraF = (quebras as { fornecedor_id: string; quebra_itens: { quantidade: number; valor: number }[] }[]).filter((q) => q.fornecedor_id === f.id);
      const faltaCx = faltasF.filter((x) => x.divergencia === "falta").reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
      const faltaR = faltasF.filter((x) => x.divergencia === "falta").reduce((a, x) => a + Number(x.valor_divergencia ?? 0), 0);
      const acima = faltasF.filter((x) => x.divergencia === "falta" && x.dentro_tolerancia === false).reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
      const qualidadeCx = faltasF.filter((x) => x.divergencia === "qualidade").reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
      const qualidadeR = faltasF.filter((x) => x.divergencia === "qualidade").reduce((a, x) => a + Number(x.valor_divergencia ?? 0), 0);
      const sobraCx = faltasF.filter((x) => x.divergencia === "sobra").reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
      const quebraCx = quebraF.reduce((a, q) => a + q.quebra_itens.reduce((b, i) => b + Number(i.quantidade), 0), 0);
      const quebraR = quebraF.reduce((a, q) => a + q.quebra_itens.reduce((b, i) => b + Number(i.valor ?? 0), 0), 0);
      const caixaAberto = (saldos as { posicao_tipo: string; ref_id: string; saldo: number }[])
        .filter((s) => s.posicao_tipo === "fornecedor" && s.ref_id === f.id)
        .reduce((a, s) => a + Number(s.saldo ?? 0), 0);
      const entregas = peds.reduce((a, p) => a + (p.conferencias?.filter((c) => c.status === "finalizada").length ?? 0), 0);
      const fillRow = (fillRows as { fornecedor_id: string; fill_rate?: number; fill_rate_valor?: number }[])
        .find((r) => r.fornecedor_id === f.id);
      const fill = Number(fillRow?.fill_rate_valor ?? fillRow?.fill_rate ?? 100);
      return {
        id: f.id,
        nome: f.nome,
        pedidos: peds.length,
        entregas,
        fill,
        faltaCx,
        faltaR,
        acima,
        sobraCx,
        qualidadeCx,
        qualidadeR,
        quebraCx,
        quebraR,
        caixaAberto,
        impacto: faltaR + qualidadeR + quebraR,
      };
    }).sort((a, b) => b.impacto - a.impacto);
  }, [fornecedores, pedidos, faltas, quebras, saldos, fillRows]);

  const ficha = rows.find((r) => r.id === fichaId);

  return (
    <div>
      <PageHeader title="Fornecedores" subtitle="Placar: fill rate, faltas, qualidade, quebra e caixas" />
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={period === "week" ? "default" : "outline"} onClick={() => setPeriod("week")}>7 dias</Button>
        <Button size="sm" variant={period === "month" ? "default" : "outline"} onClick={() => setPeriod("month")}>30 dias</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Fornecedor</th>
              <th>Pedidos</th>
              <th>Fill</th>
              <th>Faltas</th>
              <th>Qualidade</th>
              <th>Quebra</th>
              <th>Caixas</th>
              <th>Impacto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b cursor-pointer hover:bg-secondary/40" onClick={() => setFichaId(r.id)}>
                <td className="py-2 font-medium">{r.nome}</td>
                <td>{r.pedidos}/{r.entregas}</td>
                <td className={r.fill < alvo ? "text-destructive" : r.fill >= alvo ? "text-[var(--success)]" : ""}>
                  <span className={`inline-block h-2 w-2 rounded-full mr-1 ${r.fill < alvo * 0.9 ? "bg-destructive" : r.fill < alvo ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`} />
                  {r.fill.toFixed(0)}%
                </td>
                <td>{r.faltaCx} un · {formatBRL(r.faltaR)} {r.acima ? `(${r.acima} acima)` : ""}</td>
                <td>{r.qualidadeCx}</td>
                <td className={r.quebraCx && (r.quebraCx / Math.max(1, r.pedidos)) * 100 > benchQ ? "text-destructive" : ""}>{r.quebraCx} · {formatBRL(r.quebraR)}</td>
                <td>{r.caixaAberto}</td>
                <td className="font-semibold">{formatBRL(r.impacto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ficha && (
        <div className="mt-6 rounded-xl border p-4 space-y-2">
          <div className="flex justify-between">
            <h3 className="font-semibold">Ficha · {ficha.nome}</h3>
            <Button size="sm" variant="outline" onClick={() => exportToExcel(`ficha-${ficha.nome}.xlsx`, "Ficha", [ficha])}>Exportar ficha</Button>
          </div>
          <p className="text-sm">Impacto total {formatBRL(ficha.impacto)} · fill {ficha.fill.toFixed(1)}% · quebra {ficha.quebraCx} un</p>
          <SerieSemanal fornecedorId={ficha.id} />
        </div>
      )}
    </div>
  );
}

function SerieSemanal({ fornecedorId }: { fornecedorId: string }) {
  const { data } = useQuery({
    queryKey: ["serie-fornecedor", fornecedorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("itens_conferencia")
        .select("quantidade_recebida, divergencia, quantidade_divergencia, itens_pedido(pedidos_recebimento(fornecedor_id, data_pedido))")
        .not("divergencia", "is", null);
      const byWeek: Record<string, number> = {};
      for (const r of data ?? []) {
        const ped = one(one(r.itens_pedido)?.pedidos_recebimento);
        if (ped?.fornecedor_id !== fornecedorId) continue;
        const key = isoWeekKeyBRT(ped.data_pedido);
        byWeek[key] = (byWeek[key] ?? 0) + Number(r.quantidade_divergencia ?? 0);
      }
      return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b));
    },
  });
  if (!data?.length) return <p className="text-xs text-muted-foreground">Sem série semanal ainda.</p>;
  return (
    <div className="text-xs space-y-1">
      <p className="font-medium">Evolução semanal (divergências em cx)</p>
      {data.map(([w, v]) => <p key={w}>{w}: {v}</p>)}
    </div>
  );
}
