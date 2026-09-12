import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export type ParadaMotorista = {
  carga_id: string;
  carga_codigo: string;
  data_carga: string;
  carga_status: string;
  motorista_id: string | null;
  motorista: string | null;
  cliente_id: string;
  cliente: string;
  rota_id: string | null;
  rota: string | null;
  caminhao_id: string | null;
  caminhao: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  caixas_sugeridas: Record<string, number>;
  caixas_enviadas: Record<string, number>;
  caixas_retiradas: Record<string, number>;
};

export function useParadasMotoristaDia(motoristaId?: string) {
  return useQuery({
    queryKey: ["paradas-motorista", motoristaId, todayBRT()],
    queryFn: async () => {
      let query = supabase
        .from("v_paradas_motorista_dia")
        .select("*")
        .order("hora_inicio", { ascending: true, nullsFirst: false });

      if (motoristaId) {
        query = query.eq("motorista_id", motoristaId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ParadaMotorista[];
    },
  });
}

export function useSaldoRetiradaCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ["saldo-retirada-cliente", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_saldo_retirada_cliente")
        .select("*")
        .eq("cliente_id", clienteId!);
      if (error) throw error;
      return (data ?? []) as {
        posicao_id: string;
        cliente_id: string;
        cliente: string;
        tipo_caixa: string;
        tipo_nome: string;
        saldo_disponivel: number;
      }[];
    },
  });
}

export function useMovimentosParada(cargaId: string | null) {
  return useQuery({
    queryKey: ["movimentos-parada", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("*, tipos_caixa:tipo_caixa(sigla, nome), fornecedores:destino_fornecedor_id(nome)")
        .eq("carga_parada_id", cargaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegistrarMovimentoMotorista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      carga_id: string;
      tipo_caixa: string;
      quantidade: number;
      natureza: "enviada" | "retirada";
      destino_fornecedor_id?: string | null;
      observacoes?: string;
    }) => {
      const { data, error } = await supabase.rpc("registrar_movimento_motorista", {
        p_carga_id: payload.carga_id,
        p_tipo_caixa: payload.tipo_caixa,
        p_quantidade: payload.quantidade,
        p_natureza: payload.natureza,
        p_destino_fornecedor_id: payload.destino_fornecedor_id ?? null,
        p_observacoes: payload.observacoes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["paradas-motorista"] });
      qc.invalidateQueries({ queryKey: ["movimentos-parada", vars.carga_id] });
      qc.invalidateQueries({ queryKey: ["saldo-retirada-cliente"] });
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
    },
  });
}

export function useFornecedoresAtivos() {
  return useQuery({
    queryKey: ["fornecedores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCargasSugestao(clienteId: string | null) {
  return useQuery({
    queryKey: ["cargas-sugestao", clienteId, todayBRT()],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas")
        .select(
          `
          id,
          codigo,
          romaneio_itens(
            caixas,
            caixas_g,
            caixas_i,
            caixas_p
          ),
          carga_caixas_resumo(
            sugerido,
            sugerido_g,
            sugerido_i,
            sugerido_p
          )
        `,
        )
        .eq("cliente_id", clienteId!)
        .eq("data_carga", todayBRT())
        .in("status", ["aguardando", "carregando", "concluida"]);
      if (error) throw error;
      return data ?? [];
    },
  });
}
