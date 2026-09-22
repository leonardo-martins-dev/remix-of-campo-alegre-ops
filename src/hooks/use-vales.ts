import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";

export type StatusVale = "pendente" | "aplicado" | "lancado" | "recusado";

export type SolicitacaoVale = {
  id: string;
  pedido_id: string;
  item_conferencia_id: string | null;
  fornecedor_id: string;
  conferente_id: string;
  produto_nome: string | null;
  quantidade_pedida: number;
  quantidade_recebida: number;
  diferenca: number;
  preco_unitario: number | null;
  valor_calculado: number;
  valor_final: number | null;
  estimado: boolean;
  observacao_conferente: string | null;
  status: StatusVale;
  motivo_recusa: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  lancado_em: string | null;
  lancado_por: string | null;
  ref_wise: string | null;
  /** NOP-308: vale já no Wise após edição da conferência */
  precisa_revisao_adm?: boolean;
  revisao_motivo?: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: { nome: string } | null;
  pedidos_recebimento?: { codigo: string } | null;
  conferente?: { nome: string } | null;
  decidido_por_profile?: { nome: string } | null;
  lancado_por_profile?: { nome: string } | null;
  fotos?: { id: string; url: string }[];
};

export type ValesFilter = {
  status: StatusVale;
  fornecedorId?: string | null;
  from?: string | null;
  to?: string | null;
};

const VALES_SELECT = `
  *,
  fornecedores(nome),
  pedidos_recebimento(codigo),
  conferente:profiles!solicitacoes_vale_conferente_id_fkey(nome),
  decidido_por_profile:profiles!solicitacoes_vale_decidido_por_fkey(nome),
  lancado_por_profile:profiles!solicitacoes_vale_lancado_por_fkey(nome),
  solicitacoes_vale_fotos(id, url)
`;

function mapVale(row: Record<string, unknown>): SolicitacaoVale {
  return {
    ...(row as unknown as SolicitacaoVale),
    fornecedores: one(row.fornecedores as { nome: string } | { nome: string }[] | null),
    pedidos_recebimento: one(row.pedidos_recebimento as { codigo: string } | { codigo: string }[] | null),
    conferente: one(row.conferente as { nome: string } | { nome: string }[] | null),
    decidido_por_profile: one(row.decidido_por_profile as { nome: string } | { nome: string }[] | null),
    lancado_por_profile: one(row.lancado_por_profile as { nome: string } | { nome: string }[] | null),
    fotos: (row.solicitacoes_vale_fotos as { id: string; url: string }[] | undefined) ?? [],
  };
}

/** Generic listing by status + optional filters */
export function useValesByStatus(filter: ValesFilter) {
  return useQuery({
    queryKey: ["vales", filter.status, filter.fornecedorId ?? "all", filter.from ?? "", filter.to ?? ""],
    queryFn: async () => {
      let q = supabase
        .from("solicitacoes_vale")
        .select(VALES_SELECT)
        .eq("status", filter.status)
        .order("created_at", { ascending: false });

      if (filter.fornecedorId) {
        q = q.eq("fornecedor_id", filter.fornecedorId);
      }
      if (filter.from) {
        q = q.gte("created_at", `${filter.from}T00:00:00-03:00`);
      }
      if (filter.to) {
        q = q.lte("created_at", `${filter.to}T23:59:59-03:00`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapVale);
    },
  });
}

/** Legacy — still used by conferir.tsx and the badge */
export function useValesPendentes() {
  return useQuery({
    queryKey: ["vales-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_vale")
        .select(`
          *,
          fornecedores(nome),
          pedidos_recebimento(codigo),
          conferente:profiles!solicitacoes_vale_conferente_id_fkey(nome),
          solicitacoes_vale_fotos(id, url)
        `)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        fornecedores: one(row.fornecedores),
        pedidos_recebimento: one(row.pedidos_recebimento),
        conferente: one(row.conferente),
        fotos: row.solicitacoes_vale_fotos ?? [],
      })) as SolicitacaoVale[];
    },
  });
}

export function useValesConferente(conferenteId: string | null) {
  return useQuery({
    queryKey: ["vales-conferente", conferenteId],
    enabled: !!conferenteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_vale")
        .select(`
          *,
          fornecedores(nome),
          pedidos_recebimento(codigo),
          decidido_por_profile:profiles!solicitacoes_vale_decidido_por_fkey(nome),
          solicitacoes_vale_fotos(id, url)
        `)
        .eq("conferente_id", conferenteId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        fornecedores: one(row.fornecedores),
        pedidos_recebimento: one(row.pedidos_recebimento),
        decidido_por_profile: one(row.decidido_por_profile),
        fotos: row.solicitacoes_vale_fotos ?? [],
      })) as SolicitacaoVale[];
    },
  });
}

export function useValesFornecedor(fornecedorId: string | null) {
  return useQuery({
    queryKey: ["vales-fornecedor", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_vale")
        .select(`
          *,
          pedidos_recebimento(codigo),
          conferente:profiles!solicitacoes_vale_conferente_id_fkey(nome),
          decidido_por_profile:profiles!solicitacoes_vale_decidido_por_fkey(nome),
          solicitacoes_vale_fotos(id, url)
        `)
        .eq("fornecedor_id", fornecedorId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        pedidos_recebimento: one(row.pedidos_recebimento),
        conferente: one(row.conferente),
        decidido_por_profile: one(row.decidido_por_profile),
        fotos: row.solicitacoes_vale_fotos ?? [],
      })) as SolicitacaoVale[];
    },
  });
}

export function useContarValesPendentes() {
  return useQuery({
    queryKey: ["vales-pendentes-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("solicitacoes_vale")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendente");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });
}

/** KPI counts for the filtered vales set */
export function useValesKpis(filter: Omit<ValesFilter, "status">) {
  return useQuery({
    queryKey: ["vales-kpis", filter.fornecedorId ?? "all", filter.from ?? "", filter.to ?? ""],
    queryFn: async () => {
      let q = supabase
        .from("solicitacoes_vale")
        .select("status, valor_calculado, valor_final");

      if (filter.fornecedorId) {
        q = q.eq("fornecedor_id", filter.fornecedorId);
      }
      if (filter.from) {
        q = q.gte("created_at", `${filter.from}T00:00:00-03:00`);
      }
      if (filter.to) {
        q = q.lte("created_at", `${filter.to}T23:59:59-03:00`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = data ?? [];
      const pendentes = rows.filter((r) => r.status === "pendente");
      const aplicados = rows.filter((r) => r.status === "aplicado");
      const lancados = rows.filter((r) => r.status === "lancado");
      const recusados = rows.filter((r) => r.status === "recusado");

      return {
        pendentes: pendentes.length,
        aplicados: aplicados.length,
        lancados: lancados.length,
        recusados: recusados.length,
        valorPendente: pendentes.reduce((a, r) => a + Number(r.valor_calculado ?? 0), 0),
        valorAplicado: aplicados.reduce((a, r) => a + Number(r.valor_final ?? r.valor_calculado ?? 0), 0),
        valorLancado: lancados.reduce((a, r) => a + Number(r.valor_final ?? r.valor_calculado ?? 0), 0),
      };
    },
  });
}

export function useValesPorFornecedor() {
  return useQuery({
    queryKey: ["vales-por-fornecedor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_vales_por_fornecedor")
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateVale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      pedido_id: string;
      item_conferencia_id?: string | null;
      fornecedor_id: string;
      conferente_id: string;
      produto_nome?: string | null;
      quantidade_pedida: number;
      quantidade_recebida: number;
      diferenca: number;
      preco_unitario?: number | null;
      valor_calculado: number;
      estimado?: boolean;
      observacao_conferente?: string | null;
      fotos?: string[];
    }) => {
      const { fotos, ...valeData } = payload;
      
      const { data: vale, error } = await supabase
        .from("solicitacoes_vale")
        .insert({
          ...valeData,
          estimado: valeData.estimado ?? false,
        })
        .select()
        .single();
      
      if (error) throw error;

      if (fotos && fotos.length > 0) {
        const { error: fotoErr } = await supabase
          .from("solicitacoes_vale_fotos")
          .insert(fotos.map((url) => ({ solicitacao_vale_id: vale.id, url })));
        if (fotoErr) console.warn("Erro ao salvar fotos:", fotoErr.message);
      }

      return vale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vales"] });
      qc.invalidateQueries({ queryKey: ["vales-pendentes"] });
      qc.invalidateQueries({ queryKey: ["vales-pendentes-count"] });
      qc.invalidateQueries({ queryKey: ["vales-conferente"] });
      qc.invalidateQueries({ queryKey: ["vales-kpis"] });
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vales"] });
  qc.invalidateQueries({ queryKey: ["vales-pendentes"] });
  qc.invalidateQueries({ queryKey: ["vales-pendentes-count"] });
  qc.invalidateQueries({ queryKey: ["vales-conferente"] });
  qc.invalidateQueries({ queryKey: ["vales-fornecedor"] });
  qc.invalidateQueries({ queryKey: ["vales-por-fornecedor"] });
  qc.invalidateQueries({ queryKey: ["vales-kpis"] });
}

export function useAplicarVale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ solicitacaoId, valorFinal }: { solicitacaoId: string; valorFinal: number }) => {
      const { data, error } = await supabase.rpc("aplicar_vale", {
        p_solicitacao_id: solicitacaoId,
        p_valor_final: valorFinal,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRecusarVale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ solicitacaoId, motivo }: { solicitacaoId: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("recusar_vale", {
        p_solicitacao_id: solicitacaoId,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMarcarValeLancado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ valeId, refWise }: { valeId: string; refWise?: string }) => {
      const { data, error } = await supabase.rpc("marcar_vale_lancado", {
        p_vale_id: valeId,
        p_ref_wise: refWise ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAplicarValesLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ valeIds, valores }: { valeIds: string[]; valores?: Record<string, number> }) => {
      const { data, error } = await supabase.rpc("aplicar_vales_lote", {
        p_vale_ids: valeIds,
        p_valores: valores ? JSON.stringify(valores) : null,
      });
      if (error) throw error;
      return data as { aplicados: number; total: number };
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export async function uploadValeFoto(file: File, valeId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${valeId}/${Date.now()}.${ext}`;
  
  const { error: upErr } = await supabase.storage.from("vale-fotos").upload(path, file);
  if (upErr) throw upErr;
  
  const { data: urlData } = supabase.storage.from("vale-fotos").getPublicUrl(path);
  return urlData.publicUrl;
}
