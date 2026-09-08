import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/utils-date";
import { one } from "@/lib/embed";
import { computeFifoAging } from "@/lib/caixas-map";

export function useDashboard() {
  const date = todayISO();
  return useQuery({
    queryKey: ["dashboard", date],
    queryFn: async () => {
      const [cargas, fillRate, saldo, configs, saldosAll, quebras, pend, divs] = await Promise.all([
        supabase.from("cargas").select("status").eq("data_carga", date),
        supabase.from("v_fill_rate_fornecedor").select("*"),
        supabase.from("v_saldo_caixas_cliente").select("*"),
        supabase.from("tipos_caixa").select("id, sigla, custo_unitario"),
        supabase.from("v_saldos_caixa").select("*"),
        supabase.from("quebra_itens").select("valor, quebras!inner(registrado_em)").gte("quebras.registrado_em", `${date}T00:00:00`),
        supabase.from("pendencias_vinculo").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        supabase.from("itens_conferencia").select("dentro_tolerancia, conferencias!inner(finalizada_em)").gte("conferencias.finalizada_em", `${date}T00:00:00`).not("divergencia", "is", null),
      ]);

      const custos: Record<string, number> = {};
      (configs.data ?? []).forEach((t: { id: string; sigla?: string; custo_unitario: number }) => {
        custos[t.sigla ?? t.id] = t.custo_unitario;
        custos[t.id] = t.custo_unitario;
      });
      let caixasClientes = 0, caixasFornecedores = 0, caixasGalpao = 0;
      (saldosAll.data ?? []).forEach((s: { posicao_tipo: string; saldo: number }) => {
        const n = Number(s.saldo ?? 0);
        if (s.posicao_tipo === "cliente") caixasClientes += n;
        if (s.posicao_tipo === "fornecedor") caixasFornecedores += n;
        if (s.posicao_tipo === "galpao") caixasGalpao += n;
      });
      const quebraDia = (quebras.data ?? []).reduce((a: number, r: { valor: number }) => a + Number(r.valor ?? 0), 0);
      const divergenciasDia = {
        todas: (divs.data ?? []).length,
        acima: (divs.data ?? []).filter((d: { dentro_tolerancia: boolean | null }) => d.dentro_tolerancia === false).length,
      };

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
      const fillValorAvg =
        (fillRate.data ?? []).reduce((a: number, f: { fill_rate?: number; fill_rate_valor?: number }) => a + (f.fill_rate_valor ?? f.fill_rate ?? 0), 0) /
        Math.max(1, (fillRate.data ?? []).length);

      return {
        cargasExpedidas: statusCounts.concluida,
        fillRate: fillAvg,
        fillRateValor: fillValorAvg,
        caixasAbertas,
        caixasClientes,
        caixasFornecedores,
        caixasGalpao,
        quebraDia,
        pendenciasVinculo: pend.count ?? 0,
        divergenciasDia,
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
      const [{ data: configs }, { data: saldo }, { data: cargas }, { data: tipos }, { data: pend }, { data: parciais }, { count: contestacoes }, { data: movs }, { data: lastCount }] = await Promise.all([
        supabase.from("configuracoes").select("chave, valor").in("chave", ["aging_critico_dias", "aging_alerta_dias", "lembrete_contagem_dias", "benchmark_quebra_fornecedor", "dias_confirmacao_fornecedor"]),
        supabase.from("v_saldo_caixas_cliente").select("*"),
        supabase.from("cargas").select("codigo, status, clientes(nome), hora_inicio").eq("status", "aguardando"),
        supabase.from("tipos_caixa").select("id, sigla, custo_unitario"),
        supabase.from("pendencias_vinculo").select("id, nome_externo").eq("status", "aberta").limit(5),
        supabase.from("pedidos_recebimento").select("codigo").eq("status", "parcial").limit(5),
        supabase.from("movimentacoes_caixa").select("id", { count: "exact", head: true }).eq("confirmacao_status", "contestado"),
        supabase.from("movimentacoes_caixa").select("data_movimento, quantidade, tipo_caixa, tipo, natureza, cliente_id, fornecedor_id, confirmacao_status, created_at").limit(2000),
        supabase.from("contagens_galpao").select("created_at").order("created_at", { ascending: false }).limit(1),
      ]);

      const critico = Number(configs?.find((c) => c.chave === "aging_critico_dias")?.valor ?? 10);
      const alertaDias = Number(configs?.find((c) => c.chave === "aging_alerta_dias")?.valor ?? 7);
      const lembreteContagem = Number(configs?.find((c) => c.chave === "lembrete_contagem_dias")?.valor ?? 7);
      const diasConf = Number(configs?.find((c) => c.chave === "dias_confirmacao_fornecedor")?.valor ?? 3);
      const custos: Record<string, number> = {};
      (tipos ?? []).forEach((t: { id: string; custo_unitario: number }) => {
        custos[t.id] = t.custo_unitario;
      });

      const danger: { tone: "danger" | "warn" | "info"; title: string; desc: string; href?: string }[] = [];
      const warn: { tone: "danger" | "warn" | "info"; title: string; desc: string; href?: string }[] = [];

      const porCliente: Record<string, number> = {};
      let totalCaixas = 0;
      let capital = 0;

      (saldo ?? []).forEach((r: { cliente: string; tipo_caixa: string; saldo: number }) => {
        porCliente[r.cliente] = (porCliente[r.cliente] ?? 0) + r.saldo;
        totalCaixas += r.saldo ?? 0;
        capital += (r.saldo ?? 0) * (custos[r.tipo_caixa] ?? 0);
      });

      Object.entries(porCliente).forEach(([cliente, total]) => {
        if (total < 0) {
          danger.push({
            tone: "danger",
            title: `${cliente} — saldo negativo (${total} cx)`,
            desc: "Verifique movimentações e retornos deste cliente.",
            href: "/caixas/saldo",
          });
        } else if (total >= critico * 3) {
          danger.push({
            tone: "danger",
            title: `${cliente} — ${total} caixas em aberto`,
            desc: "Saldo elevado. Priorize retorno ou cobrança.",
            href: "/caixas/saldo",
          });
        }
      });

      const aging = computeFifoAging(movs ?? []);
      aging.forEach((a) => {
        if (a.oldestDays >= alertaDias) {
          warn.push({
            tone: a.oldestDays >= critico ? "danger" : "warn",
            title: `${a.tipo} há ${a.oldestDays} dias (${a.partnerKind})`,
            desc: `${a.saldo} cx acima do alerta de ${alertaDias} dias (FIFO).`,
            href: a.partnerKind === "fornecedor" ? "/caixas/fornecedor" : "/caixas/saldo",
          });
        }
      });

      if (lastCount?.[0]?.created_at) {
        const days = Math.floor((Date.now() - new Date(lastCount[0].created_at).getTime()) / 86_400_000);
        if (days >= lembreteContagem) {
          warn.push({
            tone: "warn",
            title: `Contagem do galpão há ${days} dias`,
            desc: `Lembrete a cada ${lembreteContagem} dias.`,
            href: "/caixas/galpao",
          });
        }
      } else {
        warn.push({
          tone: "info",
          title: "Nenhuma contagem do galpão",
          desc: "Faça a primeira contagem cega.",
          href: "/caixas/galpao",
        });
      }

      const atrasadas = (movs ?? []).filter((m: { confirmacao_status?: string; created_at?: string }) => {
        if (m.confirmacao_status !== "pendente" || !m.created_at) return false;
        const days = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86_400_000);
        return days >= diasConf;
      });
      if (atrasadas.length) {
        warn.push({
          tone: "warn",
          title: `${atrasadas.length} confirmação(ões) atrasada(s)`,
          desc: `Fornecedor sem resposta há mais de ${diasConf} dias.`,
          href: "/caixas/fornecedor",
        });
      }

      if (totalCaixas < 0) {
        danger.push({
          tone: "danger",
          title: `Caixas em aberto negativas (${totalCaixas} cx)`,
          desc: "Há inconsistência no saldo global de caixas.",
        });
      }

      if (capital < 0) {
        danger.push({
          tone: "danger",
          title: `Capital na rua negativo (R$ ${capital.toLocaleString("pt-BR", { maximumFractionDigits: 0 })})`,
          desc: "O valor em caixas na rua está abaixo de zero.",
        });
      }

      (cargas ?? []).forEach((c: { codigo: string; clientes: { nome: string }[] | { nome: string } | null }) => {
        warn.push({
          tone: "warn",
          title: `Carga ${c.codigo} aguardando`,
          desc: `${one(c.clientes)?.nome ?? "Cliente"} na fila de carregamento.`,
          href: "/expedicao",
        });
      });

      (pend ?? []).forEach((p: { nome_externo: string }) => {
        warn.push({ tone: "warn", title: `Pendência de vínculo: ${p.nome_externo}`, desc: "Resolver em Configurações → Vínculos.", href: "/gestao" });
      });
      (parciais ?? []).forEach((p: { codigo: string }) => {
        warn.push({ tone: "warn", title: `Pedido ${p.codigo} com saldo`, desc: "Encerrar em Liberações quando a falta for definitiva.", href: "/recebimento/liberacoes" });
      });
      if ((contestacoes ?? 0) > 0) {
        danger.push({ tone: "danger", title: `${contestacoes} movimento(s) contestado(s)`, desc: "Revise no extrato do fornecedor.", href: "/caixas/fornecedor" });
      }

      return [...danger, ...warn].slice(0, 8);
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
        supabase.from("pedidos_recebimento").select("id, codigo, wise_pedido_id, fornecedores(nome)").or(`codigo.ilike.${term},wise_pedido_id.ilike.${term}`).limit(5),
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
