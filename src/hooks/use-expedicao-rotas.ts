import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export type RotaExpedicao = {
  rota_id: string;
  rota_nome: string;
  dias_semana: string[] | null;
  motorista_padrao_id: string | null;
  caminhao_padrao_id: string | null;
  total_cargas: number;
  total_lojas: number;
  lojas_carregadas: number;
  lojas_separadas: number;
};

export type ProdutoRota = {
  rota_id: string;
  rota_nome: string;
  produto_id: string;
  produto_nome: string;
  unidade: string | null;
  unidades_por_caixa: number | null;
  familia_nome: string | null;
  quantidade_total: number;
  quantidade_separada: number;
  caixas_sugeridas: number;
  num_lojas: number;
};

export type CargaLojaRota = {
  carga_id: string;
  carga_codigo: string;
  data_carga: string;
  carga_status: string;
  status_separacao: "pendente" | "separado" | "carregado";
  rota_id: string;
  rota_nome: string;
  cliente_id: string;
  cliente_nome: string;
  motorista_nome: string | null;
  caminhao_placa: string | null;
  total_itens: number;
  quantidade_total: number;
  caixas_sugeridas: number;
};

export type RomaneioComCaixas = {
  id: string;
  carga_id: string;
  produto_id: string;
  quantidade_romaneio: number;
  quantidade_real: number;
  status: string;
  caixas: Record<string, number> | null;
  produto_nome: string;
  unidade: string | null;
  unidades_por_caixa: number | null;
  familia_nome: string | null;
  caixas_sugeridas: number;
};

export type ClientePorRota = {
  rota_id: string;
  rota_nome: string;
  dias_semana: string[] | null;
  rota_ativa: boolean | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_ativo: boolean;
};

const SEM_ROTA_ID = "00000000-0000-0000-0000-000000000000";

export function useExpedicaoPorRota() {
  return useQuery({
    queryKey: ["expedicao-por-rota", todayBRT()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_expedicao_por_rota")
        .select("*");
      if (error) throw error;
      return (data ?? []) as RotaExpedicao[];
    },
  });
}

export function useProdutosPorRota(rotaId: string | null) {
  return useQuery({
    queryKey: ["produtos-por-rota", rotaId, todayBRT()],
    enabled: !!rotaId,
    queryFn: async () => {
      let query = supabase.from("v_produtos_por_rota").select("*");
      
      if (rotaId === SEM_ROTA_ID) {
        query = query.eq("rota_id", SEM_ROTA_ID);
      } else if (rotaId) {
        query = query.eq("rota_id", rotaId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProdutoRota[];
    },
  });
}

export function useCargasLojaRota(rotaId: string | null) {
  return useQuery({
    queryKey: ["cargas-loja-rota", rotaId, todayBRT()],
    enabled: !!rotaId,
    queryFn: async () => {
      let query = supabase.from("v_carga_loja_rota").select("*");
      
      if (rotaId === SEM_ROTA_ID) {
        query = query.eq("rota_id", SEM_ROTA_ID);
      } else if (rotaId) {
        query = query.eq("rota_id", rotaId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CargaLojaRota[];
    },
  });
}

export function useRomaneioComCaixas(cargaId: string | null) {
  return useQuery({
    queryKey: ["romaneio-com-caixas", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_romaneio_com_caixas")
        .select("*")
        .eq("carga_id", cargaId!);
      if (error) throw error;
      return (data ?? []) as RomaneioComCaixas[];
    },
  });
}

export function useClientesPorRota() {
  return useQuery({
    queryKey: ["clientes-por-rota"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_clientes_por_rota")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ClientePorRota[];
    },
  });
}

export function useAtualizarStatusSeparacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cargaId,
      status,
    }: {
      cargaId: string;
      status: "pendente" | "separado" | "carregado";
    }) => {
      const { error } = await supabase.rpc("atualizar_status_separacao", {
        p_carga_id: cargaId,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expedicao-por-rota"] });
      qc.invalidateQueries({ queryKey: ["cargas-loja-rota"] });
      qc.invalidateQueries({ queryKey: ["cargas"] });
    },
  });
}

export function useRotasComDetalhes() {
  return useQuery({
    queryKey: ["rotas-detalhes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select(`
          id, nome, descricao, ativo, dias_semana, ordem,
          motorista_padrao_id, caminhao_padrao_id,
          motoristas:motorista_padrao_id(nome),
          caminhoes:caminhao_padrao_id(placa)
        `)
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveRota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      nome: string;
      descricao?: string;
      dias_semana?: string[];
      motorista_padrao_id?: string | null;
      caminhao_padrao_id?: string | null;
      ativo?: boolean;
      ordem?: number;
    }) => {
      const { id, ...fields } = payload;
      if (id) {
        const { error } = await supabase.from("rotas").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rotas").insert(fields);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rotas-detalhes"] });
      qc.invalidateQueries({ queryKey: ["cadastros", "rotas"] });
      qc.invalidateQueries({ queryKey: ["clientes-por-rota"] });
    },
  });
}

export function useAlocarClienteRota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clienteId,
      rotaId,
    }: {
      clienteId: string;
      rotaId: string | null;
    }) => {
      const { error } = await supabase
        .from("clientes")
        .update({ rota_id: rotaId })
        .eq("id", clienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes-por-rota"] });
      qc.invalidateQueries({ queryKey: ["cadastros", "clientes"] });
      qc.invalidateQueries({ queryKey: ["expedicao-por-rota"] });
      qc.invalidateQueries({ queryKey: ["cargas-loja-rota"] });
    },
  });
}

export { SEM_ROTA_ID };
