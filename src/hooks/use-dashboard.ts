import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/utils-date";

export function useDashboard() {
  const date = todayISO();
  return useQuery({
    queryKey: ["dashboard", date],
    queryFn: async () => {
      const [cargas, fillRate, saldo, configs] = await Promise.all([
        supabase.from("cargas").select("status").eq("data_carga", date),
        supabase.from("v_fill_rate_fornecedor").select("*"),
        supabase.from("v_saldo_caixas_cliente").select("*"),
        supabase.from("tipos_caixa").select("id, custo_unitario"),
      ]);

      const custos: Record<string, number> = {};
      (configs.data ?? []).forEach((t: { id: string; custo_unitario: number }) => {
        custos[t.id] = t.custo_unitario;
      });

      let caixasAbertas = 0;
      let capital = 0;
      const porCliente: Record<string, number> = {};

      (saldo.data ?? []).forEach((row: { cliente: string; tipo_caixa: string; saldo: number }) => {
        caixasAbertas += row.saldo ?? 0;
        capital += (row.saldo ?? 0) * (custos[row.tipo_caixa] ?? 0);
        porCliente[row.cliente] = (porCliente[row.cliente] ?? 0) + (row.saldo ?? 0);
      });

      const statusCounts = { concluida: 0, carregando: 0, aguardando: 0 };
      (cargas.data ?? []).forEach((c: { status: string }) => {
        if (c.status in statusCounts) statusCounts[c.status as keyof typeof statusCounts]++;
      });

      const fillAvg =
        (fillRate.data ?? []).reduce((a: number, f: { fill_rate: number }) => a + (f.fill_rate ?? 0), 0) /
        Math.max(1, (fillRate.data ?? []).length);

      return {
        cargasExpedidas: statusCounts.concluida,
        fillRate: fillAvg,
        caixasAbertas,
        capital,
        statusCounts,
        topClientes: Object.entries(porCliente)
          .map(([nome, abertas]) => ({ nome, abertas }))
          .sort((a, b) => b.abertas - a.abertas)
          .slice(0, 5),
      };
    },
  });
}

export function useIndicadores() {
  return useQuery({
    queryKey: ["indicadores"],
    queryFn: async () => {
      const [ciclo, cargas, conferencias] = await Promise.all([
        supabase.from("v_indicadores_ciclo").select("*").order("data_registro", { ascending: false }).limit(7),
        supabase
          .from("cargas")
          .select("id, hora_inicio, hora_fim, clientes(nome), romaneio_itens(id)")
          .not("hora_fim", "is", null)
          .order("hora_fim", { ascending: false })
          .limit(10),
        supabase
          .from("conferencias")
          .select("id, iniciada_em, finalizada_em, pedidos_recebimento(codigo, fornecedores(nome))")
          .eq("status", "finalizada")
          .order("finalizada_em", { ascending: false })
          .limit(10),
      ]);

      const latest = ciclo.data?.[0];
      return {
        cicloView: latest,
        cicloHistorico: ciclo.data ?? [],
        cargas: cargas.data ?? [],
        conferencias: conferencias.data ?? [],
      };
    },
  });
}

export function useAlertas() {
  return useQuery({
    queryKey: ["alertas"],
    queryFn: async () => {
      const [{ data: configs }, { data: saldo }, { data: cargas }] = await Promise.all([
        supabase.from("configuracoes").select("chave, valor").in("chave", ["aging_critico_dias", "aging_alerta_dias"]),
        supabase.from("v_saldo_caixas_cliente").select("*"),
        supabase.from("cargas").select("codigo, status, clientes(nome), hora_inicio").eq("status", "aguardando"),
      ]);

      const critico = Number(configs?.find((c) => c.chave === "aging_critico_dias")?.valor ?? 10);
      const alertas: { tone: "danger" | "warn" | "info"; title: string; desc: string }[] = [];

      const porCliente: Record<string, number> = {};
      (saldo ?? []).forEach((r: { cliente: string; saldo: number }) => {
        porCliente[r.cliente] = (porCliente[r.cliente] ?? 0) + r.saldo;
      });

      Object.entries(porCliente).forEach(([cliente, total]) => {
        if (total >= critico * 3) {
          alertas.push({
            tone: "danger",
            title: `${cliente} — ${total} caixas em aberto`,
            desc: "Saldo elevado. Priorize retorno ou cobrança.",
          });
        }
      });

      (cargas ?? []).forEach((c: { codigo: string; clientes: { nome: string } | null }) => {
        alertas.push({
          tone: "warn",
          title: `Carga ${c.codigo} aguardando`,
          desc: `${c.clientes?.nome ?? "Cliente"} na fila de carregamento.`,
        });
      });

      return alertas.slice(0, 5);
    },
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const [pedidos, clientes, fornecedores] = await Promise.all([
        supabase.from("pedidos_recebimento").select("id, codigo, fornecedores(nome)").ilike("codigo", term).limit(5),
        supabase.from("clientes").select("id, nome").ilike("nome", term).limit(5),
        supabase.from("fornecedores").select("id, nome").ilike("nome", term).limit(5),
      ]);
      return {
        pedidos: pedidos.data ?? [],
        clientes: clientes.data ?? [],
        fornecedores: fornecedores.data ?? [],
      };
    },
  });
}
