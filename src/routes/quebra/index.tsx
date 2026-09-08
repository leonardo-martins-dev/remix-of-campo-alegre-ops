import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/excel";
import { dateRangeBRT } from "@/lib/utils-date";
import { useFornecedores } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { useEditarQuebraItem, useQuebras } from "@/hooks/use-quebra";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { one } from "@/lib/embed";

export const Route = createFileRoute("/quebra/")({
  component: Page,
  head: () => ({ meta: [{ title: "Quebras · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin, user } = useAuth();
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { from, to } = dateRangeBRT(period);
  const { data: fornecedores = [] } = useFornecedores();
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const { data: laudos = [] } = useQuebras({ from, to, fornecedorId });
  const editar = useEditarQuebraItem();
  const { data: recebidos } = useQuery({
    queryKey: ["recebido-periodo", from, to, fornecedorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("itens_conferencia")
        .select("quantidade_recebida, conferencias!inner(status, finalizada_em), itens_pedido(pedidos_recebimento(fornecedor_id, data_pedido))")
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
    let cx = 0, real = 0, estimado = 0, laudoN = laudos.length;
    for (const l of laudos as { quebra_itens: { quantidade: number; valor: number; estimado: boolean }[] }[]) {
      for (const it of l.quebra_itens ?? []) {
        cx += Number(it.quantidade);
        if (it.estimado) estimado += Number(it.valor ?? 0);
        else real += Number(it.valor ?? 0);
      }
    }
    const pct = recebidos ? (cx / recebidos) * 100 : 0;
    return { laudoN, cx, real, estimado, pct };
  }, [laudos, recebidos]);

  return (
    <div>
      <PageHeader title="Quebras" subtitle="Laudos, % de quebra e visões por produto e fornecedor" />
      <div className="flex flex-wrap gap-2 mb-4">
        {(["today", "week", "month"] as const).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
            {p === "today" ? "Hoje" : p === "week" ? "7 dias" : "30 dias"}
          </Button>
        ))}
        <select className="h-8 rounded-md border px-2 text-sm" value={fornecedorId ?? ""} onChange={(e) => setFornecedorId(e.target.value || null)}>
          <option value="">Todos fornecedores</option>
          {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <Link to="/quebra/lancar" className="text-sm text-primary font-semibold self-center">Lançar quebra</Link>
        <Button size="sm" variant="outline" onClick={() => exportToExcel("quebras.xlsx", "Quebras", (laudos as { registrado_em: string; fornecedores: { nome: string } | null; quebra_itens: { quantidade: number; valor: number }[] }[]).map((l) => ({
          data: l.registrado_em, fornecedor: l.fornecedores?.nome, caixas: l.quebra_itens?.reduce((a, i) => a + Number(i.quantidade), 0), valor: l.quebra_itens?.reduce((a, i) => a + Number(i.valor ?? 0), 0),
        })))}>Exportar</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 text-sm">
        <Kpi label="Laudos" value={String(totais.laudoN)} />
        <Kpi label="Caixas" value={String(totais.cx)} />
        <Kpi label="R$ real" value={totais.real.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        <Kpi label="R$ estimado" value={totais.estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        <Kpi label="% quebra" value={`${totais.pct.toFixed(1)}%`} />
      </div>
      <div className="space-y-3">
        {(laudos as {
          id: string; registrado_em: string; observacao: string | null; fornecedores: { nome: string } | null;
          profiles: { nome: string } | null;
          quebra_itens: { id: string; quantidade: number; valor: number; estimado: boolean; conferencia_item_id: string | null; produtos: { nome: string } | null }[];
        }[]).map((l) => (
          <div key={l.id} className="rounded-xl border p-3 text-sm">
            <div className="flex justify-between">
              <strong>{l.fornecedores?.nome}</strong>
              <span>{l.registrado_em.slice(0, 16)} · {l.profiles?.nome}</span>
            </div>
            {l.quebra_itens?.some((i) => !i.conferencia_item_id) && <span className="chip chip-warn">sem vínculo</span>}
            {l.quebra_itens?.map((it) => (
              <div key={it.id} className="flex justify-between py-1">
                <span>{it.produtos?.nome} · {it.quantidade} cx {it.estimado ? "· estimado" : ""}</span>
                <span>{Number(it.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => editar.mutate({
                    quebraId: l.id, itemId: it.id, antes: { quantidade: it.quantidade }, depois: { quantidade: 0 }, autorId: user!.id,
                  }, { onSuccess: () => toast.success("Item zerado") })}>Remover</Button>
                )}
              </div>
            ))}
            {l.observacao && <p className="text-muted-foreground">{l.observacao}</p>}
          </div>
        ))}
      </div>
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
