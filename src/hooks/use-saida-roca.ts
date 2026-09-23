import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  enqueueSaida,
  getSaidaQueue,
  removeSaidaFromQueue,
  type SaidaItemQueueItem,
} from "@/lib/offline-queue";

/** Status de pedido que ainda aceitam uma saída na roça. */
export const STATUS_PEDIDO_ABERTO = ["pendente", "parcial"] as const;

export type ItemPedidoSaida = {
  id: string;
  quantidade_pedida: number;
  unidade: string | null;
  produto_id: string | null;
  produtos:
    | { id: string; nome: string; unidade: string }
    | { id: string; nome: string; unidade: string }[]
    | null;
};

export type PedidoAberto = {
  id: string;
  codigo: string;
  status: string;
  data_pedido: string;
  data_prevista: string | null;
  fornecedor_id: string;
  fornecedores: { nome: string } | { nome: string }[] | null;
  itens_pedido: ItemPedidoSaida[];
};

const PEDIDO_SELECT = `
  id, codigo, status, data_pedido, data_prevista, fornecedor_id,
  fornecedores(nome),
  itens_pedido(id, quantidade_pedida, unidade, produto_id, produtos(id, nome, unidade))
`;

/**
 * Pedidos abertos que ainda podem receber saída na roça.
 * Fornecedor vê só os dele; motorista/admin filtram pelo fornecedor escolhido.
 */
export function usePedidosAbertosSaida(fornecedorId: string | null | undefined) {
  return useQuery({
    queryKey: ["pedidos-abertos-saida", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select(PEDIDO_SELECT)
        .eq("fornecedor_id", fornecedorId!)
        .in("status", [...STATUS_PEDIDO_ABERTO])
        .order("data_prevista", { ascending: true });
      if (error) throw error;

      const pedidos = (data ?? []) as unknown as PedidoAberto[];
      if (!pedidos.length) return pedidos;

      // Um pedido com saída ainda em trânsito não aceita outra saída.
      const { data: saidas } = await supabase
        .from("saidas_roca")
        .select("pedido_id")
        .eq("status", "confirmada")
        .in(
          "pedido_id",
          pedidos.map((p) => p.id),
        );
      const bloqueados = new Set((saidas ?? []).map((s) => s.pedido_id as string));
      return pedidos.filter((p) => !bloqueados.has(p.id));
    },
  });
}

/** Fornecedores com pedido aberto — passo 1 de motorista/admin. */
export function useFornecedoresComPedidoAberto(enabled = true) {
  return useQuery({
    queryKey: ["fornecedores-pedido-aberto"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select("fornecedor_id, fornecedores(nome)")
        .in("status", [...STATUS_PEDIDO_ABERTO]);
      if (error) throw error;

      const map = new Map<string, { id: string; nome: string; pedidos: number }>();
      for (const row of data ?? []) {
        const id = row.fornecedor_id as string;
        if (!id) continue;
        const forn = row.fornecedores as { nome: string } | { nome: string }[] | null;
        const nome = (Array.isArray(forn) ? forn[0]?.nome : forn?.nome) ?? "Fornecedor";
        const cur = map.get(id) ?? { id, nome, pedidos: 0 };
        cur.pedidos += 1;
        map.set(id, cur);
      }
      return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export type CaixaSaida = {
  id: string;
  tipo_caixa_id: string | null;
  tipo_caixa_sigla: string;
  qtd: number;
  fator_usado: number | null;
};

export type ItemSaida = {
  id: string;
  item_pedido_id: string | null;
  produto_id: string | null;
  quantidade_pedida: number;
  quantidade_unidades: number | null;
  total_caixas: number;
  caixas_item_saida: CaixaSaida[];
};

export type SaidaRoca = {
  id: string;
  pedido_id: string;
  conferencia_numero: number | null;
  conferencia_id: string | null;
  fornecedor_id: string;
  motorista_id: string | null;
  veiculo_fornecedor: boolean;
  registrado_em: string;
  chegada_em: string | null;
  total_caixas: number;
  total_caixas_chegada: number | null;
  foto_url: string | null;
  observacoes: string | null;
  status: string;
  itens_saida_roca: ItemSaida[];
  motoristas: { nome: string } | { nome: string }[] | null;
};

/**
 * Saída da entrega atual de um pedido (para prefill da conferência).
 * Prefere a saída já vinculada à conferência; senão a que está em trânsito.
 */
export async function fetchSaidaRocaPedido(
  pedidoId: string,
  conferenciaId?: string | null,
  conferenciaNumero?: number | null,
): Promise<SaidaRoca | null> {
  const { data, error } = await supabase
    .from("saidas_roca")
    .select(
      `
      id, pedido_id, conferencia_numero, conferencia_id, fornecedor_id, motorista_id,
      veiculo_fornecedor, registrado_em, chegada_em, total_caixas, total_caixas_chegada,
      foto_url, observacoes, status,
      motoristas(nome),
      itens_saida_roca(
        id, item_pedido_id, produto_id, quantidade_pedida, quantidade_unidades, total_caixas,
        caixas_item_saida(id, tipo_caixa_id, tipo_caixa_sigla, qtd, fator_usado)
      )
    `,
    )
    .eq("pedido_id", pedidoId)
    .neq("status", "cancelada")
    .order("registrado_em", { ascending: false });
  if (error) throw error;

  const saidas = (data ?? []) as unknown as SaidaRoca[];
  if (!saidas.length) return null;

  return (
    (conferenciaId && saidas.find((s) => s.conferencia_id === conferenciaId)) ||
    (conferenciaNumero != null &&
      saidas.find((s) => s.status === "confirmada" && s.conferencia_numero === conferenciaNumero)) ||
    saidas.find((s) => s.status === "confirmada") ||
    null
  );
}

export function useSaidaRocaPedido(
  pedidoId: string | null | undefined,
  conferenciaId?: string | null,
  conferenciaNumero?: number | null,
) {
  return useQuery({
    queryKey: ["saida-roca-pedido", pedidoId, conferenciaId ?? null, conferenciaNumero ?? null],
    enabled: !!pedidoId,
    queryFn: () => fetchSaidaRocaPedido(pedidoId!, conferenciaId, conferenciaNumero),
  });
}

export type SaidaEmTransito = {
  id: string;
  pedido_id: string;
  pedido_codigo: string;
  pedido_status: string;
  conferencia_numero: number | null;
  fornecedor_id: string;
  fornecedor_nome: string;
  motorista_id: string | null;
  motorista_nome: string | null;
  veiculo_fornecedor: boolean;
  registrado_em: string;
  chegada_em: string | null;
  total_caixas: number;
  total_caixas_chegada: number | null;
  status: string;
  minutos_em_transito: number;
};

/** Saídas ainda em trânsito — painel do admin e badge do recebimento. */
export function useSaidasEmTransito() {
  return useQuery({
    queryKey: ["saidas-em-transito"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_saidas_roca")
        .select("*")
        .eq("status", "confirmada")
        .order("registrado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SaidaEmTransito[];
    },
    refetchInterval: 60_000,
  });
}

export type ConfirmarSaidaPayload = {
  pedido_id: string;
  pedido_codigo?: string;
  motorista_id: string | null;
  veiculo_fornecedor: boolean;
  foto_url: string | null;
  observacoes: string | null;
  itens: SaidaItemQueueItem[];
};

async function enviarSaida(payload: ConfirmarSaidaPayload) {
  const { data, error } = await supabase.rpc("confirmar_saida_roca", {
    p_pedido_id: payload.pedido_id,
    p_itens: payload.itens,
    p_motorista_id: payload.motorista_id,
    p_veiculo_fornecedor: payload.veiculo_fornecedor,
    p_foto_url: payload.foto_url,
    p_observacoes: payload.observacoes,
  });
  if (error) throw new Error(error.message);
  return data as { saida_id: string; conferencia_numero: number; total_caixas: number };
}

function invalidateSaida(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["pedidos"] });
  qc.invalidateQueries({ queryKey: ["pedidos-abertos-saida"] });
  qc.invalidateQueries({ queryKey: ["fornecedores-pedido-aberto"] });
  qc.invalidateQueries({ queryKey: ["saida-roca-pedido"] });
  qc.invalidateQueries({ queryKey: ["saidas-em-transito"] });
  qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
  qc.invalidateQueries({ queryKey: ["saldo-posicao"] });
}

export function useConfirmarSaidaRoca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enviarSaida,
    onSuccess: () => invalidateSaida(qc),
  });
}

/** Chegada no packing: caixas saem do motorista e entram no galpão. */
export function useRegistrarChegadaSaida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      saida_id: string;
      conferencia_id: string;
      caixas: Record<string, number>;
    }) => {
      const { data, error } = await supabase.rpc("registrar_chegada_saida_roca", {
        p_saida_id: payload.saida_id,
        p_conferencia_id: payload.conferencia_id,
        p_caixas: payload.caixas,
      });
      if (error) throw new Error(error.message);
      return data as {
        total_caixas_saida: number;
        total_caixas_chegada: number;
        divergencia_transporte_caixas: number;
      };
    },
    onSuccess: () => invalidateSaida(qc),
  });
}

/**
 * Fila offline (mesmo padrão da movimentação NOP-21): guarda a saída no
 * localStorage e sobe quando a conexão volta.
 */
export function useSaidaOfflineQueue(enabled: boolean) {
  const qc = useQueryClient();
  const [offline, setOffline] = useState(
    typeof navigator === "undefined" ? false : !navigator.onLine,
  );
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    setPendentes(getSaidaQueue().length);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    async function flush() {
      if (typeof navigator === "undefined" || !navigator.onLine) return;
      const fila = getSaidaQueue();
      if (!fila.length) return;
      for (const item of fila) {
        try {
          await enviarSaida(item);
          removeSaidaFromQueue(item.id);
        } catch (e) {
          // Erro de regra (pedido já saiu, chegada finalizada) não volta a
          // subir: tira da fila para não travar as próximas.
          const msg = e instanceof Error ? e.message : "";
          if (/já existe|finalizada|não está aberto|não encontrado/i.test(msg)) {
            removeSaidaFromQueue(item.id);
          }
        }
      }
      setPendentes(getSaidaQueue().length);
      invalidateSaida(qc);
    }

    const on = () => {
      setOffline(false);
      void flush();
    };
    const off = () => setOffline(true);

    void flush();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [enabled, qc]);

  const guardar = (payload: ConfirmarSaidaPayload) => {
    enqueueSaida({
      pedido_id: payload.pedido_id,
      pedido_codigo: payload.pedido_codigo,
      motorista_id: payload.motorista_id,
      veiculo_fornecedor: payload.veiculo_fornecedor,
      foto_url: payload.foto_url,
      observacoes: payload.observacoes,
      itens: payload.itens,
    });
    setPendentes(getSaidaQueue().length);
  };

  return { offline, pendentes, guardar };
}

export async function uploadFotoSaida(file: File, pedidoId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `saida-roca/${pedidoId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("conferencia-fotos").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("conferencia-fotos").getPublicUrl(path);
  return data.publicUrl;
}
