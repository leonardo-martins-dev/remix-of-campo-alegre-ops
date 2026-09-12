import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";

export type StatusVale = "pendente" | "aplicado" | "recusado";

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
  created_at: string;
  updated_at: string;
  fornecedores?: { nome: string } | null;
  pedidos_recebimento?: { codigo: string } | null;
  conferente?: { nome: string } | null;
  decidido_por_profile?: { nome: string } | null;
  fotos?: { id: string; url: string }[];
};

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
      qc.invalidateQueries({ queryKey: ["vales-pendentes"] });
      qc.invalidateQueries({ queryKey: ["vales-pendentes-count"] });
      qc.invalidateQueries({ queryKey: ["vales-conferente"] });
    },
  });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vales-pendentes"] });
      qc.invalidateQueries({ queryKey: ["vales-pendentes-count"] });
      qc.invalidateQueries({ queryKey: ["vales-conferente"] });
      qc.invalidateQueries({ queryKey: ["vales-fornecedor"] });
      qc.invalidateQueries({ queryKey: ["vales-por-fornecedor"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vales-pendentes"] });
      qc.invalidateQueries({ queryKey: ["vales-pendentes-count"] });
      qc.invalidateQueries({ queryKey: ["vales-conferente"] });
      qc.invalidateQueries({ queryKey: ["vales-fornecedor"] });
      qc.invalidateQueries({ queryKey: ["vales-por-fornecedor"] });
    },
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
