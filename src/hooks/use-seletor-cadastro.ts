import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { tipoColor } from "@/lib/caixas-map";
import { addDaysBRT, todayBRT } from "@/lib/utils-date";
import { prepararItens, type SeletorItem, type SeletorTipo } from "@/lib/seletor-cadastro";
import {
  useCaminhoes,
  useClientes,
  useFamilias,
  useFornecedores,
  useMotoristas,
  useProdutos,
  useRotas,
} from "@/hooks/use-cadastros";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";

const RECENT_PREFIX = "campo-alegre-seletor-recent";
const MAX_RECENTES = 8;

function chaveRecentes(userId: string | null, tipo: SeletorTipo) {
  return `${RECENT_PREFIX}:${userId ?? "anon"}:${tipo}`;
}

/** Últimos escolhidos por usuário e tipo (localStorage, MRU). */
export function useRecentesSeletor(tipo: SeletorTipo) {
  const { user } = useAuth();
  const chave = chaveRecentes(user?.id ?? null, tipo);
  const [recentes, setRecentes] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(chave);
      setRecentes(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRecentes([]);
    }
  }, [chave]);

  const registrar = useCallback(
    (id: string) => {
      if (!id) return;
      setRecentes((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTES);
        try {
          localStorage.setItem(chave, JSON.stringify(next));
        } catch {
          /* localStorage cheio/indisponível — recentes são melhores-esforços */
        }
        return next;
      });
    },
    [chave],
  );

  return { recentes, registrar };
}

type LinhaCadastro = Record<string, unknown>;

function texto(row: LinhaCadastro, campo: string): string | null {
  const v = row[campo];
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Lista do seletor montada a partir dos hooks de cadastro que já estão em
 * cache — sem rede nova quando o app está offline.
 */
export function useItensCadastro(tipo: SeletorTipo, enabled = true) {
  const fornecedores = useFornecedores();
  const produtos = useProdutos();
  const clientes = useClientes();
  const rotas = useRotas();
  const motoristas = useMotoristas();
  const caminhoes = useCaminhoes();
  const tiposCaixa = useTiposCaixa();
  const familias = useFamilias();
  const entregas = useUltimasEntregasFornecedor(enabled && tipo === "fornecedor");
  const codigosFornecedor = useCodigosExternosFornecedor(enabled && tipo === "fornecedor");

  const familiaPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of (familias.data ?? []) as { id: string; nome: string }[]) m.set(f.id, f.nome);
    return m;
  }, [familias.data]);

  const rotaPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rotas.data ?? []) m.set(r.id, r.nome);
    return m;
  }, [rotas.data]);

  const itens = useMemo<SeletorItem[]>(() => {
    switch (tipo) {
      case "fornecedor":
        return prepararItens(
          (fornecedores.data ?? []).map((f) => {
            const row = f as unknown as LinhaCadastro;
            return {
              id: f.id,
              nome: f.nome,
              // NOP-132: código Wise tem coluna própria; alias entra como reserva.
              codigo:
                texto(row, "codigo_wise") ??
                texto(row, "codigo") ??
                codigosFornecedor.data?.[f.id] ??
                null,
              cnpj: texto(row, "cnpj"),
              ativo: f.ativo,
              meta: { ultimaEntrega: entregas.data?.ultimaPorFornecedor[f.id] ?? null },
            };
          }),
        );
      case "produto":
        return prepararItens(
          (produtos.data ?? []).map((p) => {
            const row = p as unknown as LinhaCadastro;
            const familiaId = texto(row, "familia_id");
            return {
              id: String(row.id),
              nome: String(row.nome ?? ""),
              codigo: texto(row, "codigo"),
              ativo: row.ativo !== false,
              meta: {
                familiaId,
                familia: familiaId ? (familiaPorId.get(familiaId) ?? null) : null,
                unidade: texto(row, "unidade"),
              },
            };
          }),
        );
      case "cliente":
        return prepararItens(
          (clientes.data ?? []).map((c) => {
            const row = c as unknown as LinhaCadastro;
            const rotaId = texto(row, "rota_id");
            return {
              id: c.id,
              nome: c.nome,
              codigo: texto(row, "codigo_wise"),
              cnpj: texto(row, "cnpj"),
              ativo: c.ativo,
              meta: { rota: rotaId ? (rotaPorId.get(rotaId) ?? null) : null },
            };
          }),
        );
      case "rota":
        return prepararItens(
          (rotas.data ?? []).map((r) => ({ id: r.id, nome: r.nome, ativo: r.ativo })),
        );
      case "motorista":
        return prepararItens(
          (motoristas.data ?? []).map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativo })),
        );
      case "caminhao":
        return prepararItens(
          (caminhoes.data ?? []).map((c) => {
            const row = c as unknown as LinhaCadastro;
            return {
              id: String(row.id),
              nome: String(row.placa ?? row.nome ?? ""),
              ativo: row.ativo !== false,
              meta: { placa: texto(row, "placa"), rota: texto(row, "modelo") },
            };
          }),
        );
      case "tipo_caixa":
        return prepararItens(
          (tiposCaixa.data ?? []).map((t, i) => ({
            id: t.id,
            nome: t.nome,
            codigo: t.sigla,
            ativo: t.ativo,
            meta: { sigla: t.sigla, cor: tipoColor(i) },
          })),
        );
      default:
        return [];
    }
  }, [
    tipo,
    fornecedores.data,
    produtos.data,
    clientes.data,
    rotas.data,
    motoristas.data,
    caminhoes.data,
    tiposCaixa.data,
    familiaPorId,
    rotaPorId,
    entregas.data,
    codigosFornecedor.data,
  ]);

  const carregando =
    (tipo === "fornecedor" && fornecedores.isLoading) ||
    (tipo === "produto" && produtos.isLoading) ||
    (tipo === "cliente" && clientes.isLoading) ||
    (tipo === "rota" && rotas.isLoading) ||
    (tipo === "motorista" && motoristas.isLoading) ||
    (tipo === "caminhao" && caminhoes.isLoading) ||
    (tipo === "tipo_caixa" && tiposCaixa.isLoading);

  return { itens, carregando };
}

/**
 * Código Wise de cada fornecedor a partir dos aliases da importação — é o que
 * distingue cadastros de mesmo nome na linha secundária.
 */
export function useCodigosExternosFornecedor(enabled = true) {
  return useQuery({
    queryKey: ["seletor-codigos-fornecedor"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aliases")
        .select("entidade_id, codigo_externo")
        .eq("tipo", "fornecedor")
        .not("codigo_externo", "is", null);
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const id = row.entidade_id as string | null;
        const codigo = row.codigo_externo as string | null;
        if (id && codigo && !map[id]) map[id] = codigo;
      }
      return map;
    },
  });
}

/**
 * Fornecedores que entregaram nos últimos dias — sugestão de contexto e
 * linha "última entrega".
 */
export function useUltimasEntregasFornecedor(enabled = true, dias = 7) {
  const desde = addDaysBRT(todayBRT(), -30);
  return useQuery({
    queryKey: ["seletor-entregas-fornecedor", desde, dias],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select("fornecedor_id, data_pedido")
        .gte("data_pedido", desde)
        .order("data_pedido", { ascending: false });
      if (error) throw error;

      const limite = addDaysBRT(todayBRT(), -dias);
      const ultimaPorFornecedor: Record<string, string> = {};
      const recentes: string[] = [];
      for (const row of data ?? []) {
        const id = row.fornecedor_id as string | null;
        const dataPedido = row.data_pedido as string;
        if (!id) continue;
        if (!ultimaPorFornecedor[id]) ultimaPorFornecedor[id] = dataPedido;
        if (dataPedido >= limite && !recentes.includes(id)) recentes.push(id);
      }
      return { ultimaPorFornecedor, recentes };
    },
  });
}

/** Ids de fornecedores com entrega nos últimos `dias` (sugestão da quebra). */
export function useFornecedoresComEntregaRecente(enabled = true, dias = 7) {
  const q = useUltimasEntregasFornecedor(enabled, dias);
  return q.data?.recentes ?? [];
}

/**
 * Produtos que costumam vir deste fornecedor: fatores de conversão cadastrados
 * + o que ele já entregou. Usado para priorizar a lista de produtos.
 */
export function useProdutosDoFornecedor(fornecedorId: string | null | undefined) {
  return useQuery({
    queryKey: ["seletor-produtos-fornecedor", fornecedorId],
    enabled: !!fornecedorId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [conv, pedidos] = await Promise.all([
        supabase
          .from("conversoes_fornecedor")
          .select("produto_id")
          .eq("fornecedor_id", fornecedorId!)
          .eq("ativo", true),
        supabase
          .from("pedidos_recebimento")
          .select("id, itens_pedido(produto_id)")
          .eq("fornecedor_id", fornecedorId!)
          .gte("data_pedido", addDaysBRT(todayBRT(), -90))
          .limit(40),
      ]);

      const ids: string[] = [];
      const push = (id: unknown) => {
        if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
      };
      for (const c of conv.data ?? []) push(c.produto_id);
      for (const p of pedidos.data ?? []) {
        const itens = (p.itens_pedido ?? []) as { produto_id: string | null }[];
        for (const it of itens) push(it.produto_id);
      }
      return ids;
    },
  });
}
