import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";
import { todayBRT } from "@/lib/utils-date";

export type StatusOrdem =
  | "importada"
  | "conferida"
  | "separada"
  | "em_transito"
  | "entregue"
  | "entregue_parcial"
  | "recusada";

/** Cadeia NOP-300: Importado → Conferido → Em carga → Saída confirmada → Entregue */
export const STATUS_ORDEM_LABEL: Record<StatusOrdem, string> = {
  importada: "Importado",
  conferida: "Conferido",
  separada: "Em carga",
  em_transito: "Saída confirmada",
  entregue: "Entregue",
  entregue_parcial: "Entregue parcial",
  recusada: "Recusada",
};

export const STATUS_ORDEM_CHAIN: StatusOrdem[] = [
  "importada",
  "conferida",
  "separada",
  "em_transito",
  "entregue",
];

export function statusOrdemChip(status: string | null | undefined): string {
  if (status === "entregue") return "chip-ok";
  if (status === "em_transito") return "chip-info";
  if (status === "separada" || status === "conferida") return "chip-warn";
  if (status === "entregue_parcial" || status === "recusada") return "chip-danger";
  return "chip-muted";
}

export type OrdemExpedicao = {
  carga_id: string;
  codigo: string;
  numero_ordem: string;
  data_carga: string;
  status_ordem: StatusOrdem;
  status_separacao: string | null;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_cnpj: string | null;
  motorista_id: string | null;
  motorista_nome: string | null;
  qtde_itens_wise: number | null;
  qtde_caixas_wise: number | null;
  separado_por_nome: string | null;
  separado_em: string | null;
  conferido_por_nome: string | null;
  conferido_em: string | null;
  romaneio_conferido_por_nome?: string | null;
  romaneio_conferido_em?: string | null;
  entregue_por_nome: string | null;
  entregue_em: string | null;
  recebedor_nome: string | null;
  canhoto_foto_url: string | null;
  confirmacao_manual_admin: boolean;
  justificativa_admin: string | null;
  total_linhas: number;
  total_itens: number;
  caixas_separadas: number;
  caixas_em_transito: number;
  caixas_entregues: number;
  caixas_recusadas: number;
};

export type ItemOrdem = {
  romaneio_item_id: string;
  produto_id: string | null;
  produto: string;
  unidade: string;
  familia: string;
  familia_ordem: number;
  quantidade: number;
};

export type FamiliaOrdem = {
  familia: string;
  ordem: number;
  itens: ItemOrdem[];
  total: number;
};

export type ItemCaixaOrdem = {
  id: string;
  romaneio_item_id: string | null;
  produto_id: string | null;
  quantidade: number;
  status: string;
  motivo_recusa: string | null;
  produtos: { nome: string; unidade: string } | { nome: string; unidade: string }[] | null;
};

export type CaixaOrdem = {
  id: string;
  carga_id: string;
  numero: number;
  total_caixas: number;
  codigo_etiqueta: string;
  tipo_caixa_id: string | null;
  tipo_caixa_sigla: string | null;
  status: string;
  motivo_recusa: string | null;
  separado_em: string | null;
  saida_em: string | null;
  entregue_em: string | null;
  itens_caixa_ordem: ItemCaixaOrdem[];
};

/** Ordens do dia (painel de expedição / escolha da saída). */
export function useOrdensExpedicao(opts?: {
  data?: string;
  clienteId?: string | null;
  status?: StatusOrdem[];
}) {
  const data = opts?.data ?? todayBRT();
  const status = opts?.status;
  return useQuery({
    queryKey: ["ordens-expedicao", data, opts?.clienteId ?? null, status?.join(",") ?? "todas"],
    queryFn: async () => {
      let q = supabase.from("v_ordem_expedicao").select("*").eq("data_carga", data);
      if (opts?.clienteId) q = q.eq("cliente_id", opts.clienteId);
      if (status?.length) q = q.in("status_ordem", status);
      const { data: rows, error } = await q.order("numero_ordem");
      if (error) throw error;
      return (rows ?? []) as OrdemExpedicao[];
    },
  });
}

export function useOrdemExpedicao(cargaId: string | null | undefined) {
  return useQuery({
    queryKey: ["ordem-expedicao", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordem_expedicao")
        .select("*")
        .eq("carga_id", cargaId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrdemExpedicao | null;
    },
  });
}

/** Itens da ordem agrupados por família, como no papel. */
export function useItensOrdem(cargaId: string | null | undefined) {
  return useQuery({
    queryKey: ["itens-ordem", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("romaneio_itens")
        .select(
          `
          id, quantidade_romaneio, produto_id,
          produtos(nome, unidade, familia_id, familias_produto(nome, ordem))
        `,
        )
        .eq("carga_id", cargaId!);
      if (error) throw error;

      const itens: ItemOrdem[] = (data ?? []).map((row) => {
        const prod = one(row.produtos) as {
          nome: string;
          unidade: string;
          familias_produto:
            | { nome: string; ordem: number }
            | { nome: string; ordem: number }[]
            | null;
        } | null;
        const fam = one(prod?.familias_produto ?? null);
        return {
          romaneio_item_id: row.id as string,
          produto_id: (row.produto_id as string | null) ?? null,
          produto: prod?.nome ?? "—",
          unidade: prod?.unidade ?? "un",
          familia: fam?.nome ?? "Outros",
          familia_ordem: Number(fam?.ordem ?? 999),
          quantidade: Number(row.quantidade_romaneio ?? 0),
        };
      });

      const map = new Map<string, FamiliaOrdem>();
      for (const it of itens) {
        const cur = map.get(it.familia) ?? {
          familia: it.familia,
          ordem: it.familia_ordem,
          itens: [],
          total: 0,
        };
        cur.itens.push(it);
        cur.total += it.quantidade;
        map.set(it.familia, cur);
      }
      const familias = [...map.values()].sort(
        (a, b) => a.ordem - b.ordem || a.familia.localeCompare(b.familia),
      );
      for (const f of familias) f.itens.sort((a, b) => a.produto.localeCompare(b.produto));

      return { itens, familias, totalItens: itens.reduce((a, i) => a + i.quantidade, 0) };
    },
  });
}

export function useCaixasOrdem(cargaId: string | null | undefined) {
  return useQuery({
    queryKey: ["caixas-ordem", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixas_ordem")
        .select(
          `
          id, carga_id, numero, total_caixas, codigo_etiqueta, tipo_caixa_id, tipo_caixa_sigla,
          status, motivo_recusa, separado_em, saida_em, entregue_em,
          itens_caixa_ordem(id, romaneio_item_id, produto_id, quantidade, status, motivo_recusa, produtos(nome, unidade))
        `,
        )
        .eq("carga_id", cargaId!)
        .order("numero");
      if (error) throw error;
      return (data ?? []) as unknown as CaixaOrdem[];
    },
  });
}

export type CaixaSeparacaoPayload = {
  numero: number;
  tipo_caixa_id: string | null;
  tipo_caixa_sigla: string | null;
  itens: { romaneio_item_id: string | null; produto_id: string | null; quantidade: number }[];
};

export function invalidateOrdem(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["ordens-expedicao"] });
  qc.invalidateQueries({ queryKey: ["ordem-expedicao"] });
  qc.invalidateQueries({ queryKey: ["caixas-ordem"] });
  qc.invalidateQueries({ queryKey: ["rastreio-caixa"] });
  qc.invalidateQueries({ queryKey: ["cargas"] });
  qc.invalidateQueries({ queryKey: ["cargas-loja-rota"] });
  qc.invalidateQueries({ queryKey: ["expedicao-por-rota"] });
  qc.invalidateQueries({ queryKey: ["saidas-expedicao"] });
  qc.invalidateQueries({ queryKey: ["entregas-sem-confirmacao"] });
  qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
}

export function useConfirmarSeparacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { carga_id: string; caixas: CaixaSeparacaoPayload[] }) => {
      const { data, error } = await supabase.rpc("confirmar_separacao_ordem", {
        p_carga_id: payload.carga_id,
        p_caixas: payload.caixas,
      });
      if (error) throw new Error(error.message);
      return data as { carga_id: string; total_caixas: number };
    },
    onSuccess: () => invalidateOrdem(qc),
  });
}

/** Totais Wise da ordem: editáveis enquanto o relatório não traz caixas. */
export function useSalvarTotaisWise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      carga_id: string;
      qtde_caixas_wise: number | null;
      qtde_itens_wise: number | null;
    }) => {
      const { error } = await supabase
        .from("cargas")
        .update({
          qtde_caixas_wise: payload.qtde_caixas_wise,
          qtde_itens_wise: payload.qtde_itens_wise,
        })
        .eq("id", payload.carga_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateOrdem(qc),
  });
}

/**
 * Sugestão inicial: distribui os itens em N caixas mantendo produto inteiro
 * na mesma caixa sempre que couber; o resto vira caixa mista.
 */
export function distribuirEmCaixas(itens: ItemOrdem[], n: number) {
  const total = itens.reduce((a, i) => a + i.quantidade, 0);
  const caixas: {
    itens: { romaneio_item_id: string; produto_id: string | null; quantidade: number }[];
  }[] = Array.from({ length: Math.max(1, n) }, () => ({ itens: [] }));
  if (!itens.length) return caixas;

  const alvo = Math.ceil(total / Math.max(1, n));
  let idx = 0;
  let carga = 0;

  for (const it of itens) {
    let restante = it.quantidade;
    while (restante > 0) {
      const espaco = idx < caixas.length - 1 ? Math.max(0, alvo - carga) : restante;
      const qtd = espaco >= restante || idx === caixas.length - 1 ? restante : espaco;
      if (qtd <= 0) {
        idx += 1;
        carga = 0;
        continue;
      }
      caixas[idx].itens.push({
        romaneio_item_id: it.romaneio_item_id,
        produto_id: it.produto_id,
        quantidade: qtd,
      });
      restante -= qtd;
      carga += qtd;
      if (carga >= alvo && idx < caixas.length - 1) {
        idx += 1;
        carga = 0;
      }
    }
  }
  return caixas;
}
