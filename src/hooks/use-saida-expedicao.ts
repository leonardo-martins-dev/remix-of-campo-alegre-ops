import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";
import {
  enqueueEntrega,
  getEntregaQueue,
  removeEntregaFromQueue,
  type EntregaCaixaQueueItem,
} from "@/lib/offline-queue";
import { invalidateOrdem, type CaixaOrdem } from "@/hooks/use-ordem-expedicao";

/** Supermercados com ordem do dia — inclui órfãs (sem cliente_id). */
export function useSupermercadosDoDia(data = todayBRT()) {
  return useQuery({
    queryKey: ["supermercados-dia", data],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("v_ordem_expedicao")
        .select("carga_id, cliente_id, cliente_nome, cliente_cnpj, status_ordem, numero_ordem")
        .eq("data_carga", data);
      if (error) throw error;

      const map = new Map<
        string,
        {
          id: string;
          nome: string;
          cnpj: string | null;
          separadas: number;
          total: number;
          orfao: boolean;
          cargasOrfas: { carga_id: string; numero_ordem: string }[];
        }
      >();

      for (const r of rows ?? []) {
        const orfao = !r.cliente_id;
        const id = orfao ? `__orfao__${r.carga_id}` : (r.cliente_id as string);
        const cur = map.get(id) ?? {
          id,
          nome: orfao
            ? `Sem loja · OS ${r.numero_ordem ?? "?"}`
            : ((r.cliente_nome as string) ?? "Loja"),
          cnpj: (r.cliente_cnpj as string | null) ?? null,
          separadas: 0,
          total: 0,
          orfao,
          cargasOrfas: [],
        };
        cur.total += 1;
        if (r.status_ordem === "separada") cur.separadas += 1;
        if (orfao) {
          cur.cargasOrfas.push({
            carga_id: r.carga_id as string,
            numero_ordem: String(r.numero_ordem ?? ""),
          });
        }
        map.set(id, cur);
      }
      return [...map.values()].sort((a, b) => {
        if (a.orfao !== b.orfao) return a.orfao ? -1 : 1;
        return a.nome.localeCompare(b.nome);
      });
    },
  });
}

export { useVincularClienteCarga } from "@/hooks/use-cargas";

export type SaidaExpedicao = {
  id: string;
  carga_id: string;
  cliente_id: string;
  motorista_id: string | null;
  conferido_por: string | null;
  saida_em: string;
  total_caixas: number;
  observacoes: string | null;
  status: string;
  cargas: {
    codigo: string;
    numero_ordem: string | null;
    status_ordem: string;
    data_carga: string;
  } | null;
  clientes: { nome: string; cnpj: string | null } | null;
  motoristas: { nome: string } | null;
};

/** Saídas em trânsito — tela de entrega do motorista. */
export function useSaidasExpedicaoEmTransito(motoristaId?: string | null) {
  return useQuery({
    queryKey: ["saidas-expedicao", motoristaId ?? "todos"],
    queryFn: async () => {
      let q = supabase
        .from("saidas_expedicao")
        .select(
          `
          id, carga_id, cliente_id, motorista_id, conferido_por, saida_em, total_caixas,
          observacoes, status,
          cargas(codigo, numero_ordem, status_ordem, data_carga),
          clientes(nome, cnpj),
          motoristas(nome)
        `,
        )
        .eq("status", "em_transito")
        .order("saida_em", { ascending: true });
      if (motoristaId) q = q.eq("motorista_id", motoristaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SaidaExpedicao[];
    },
  });
}

export function useConfirmarSaidaExpedicao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      carga_id: string;
      motorista_id: string;
      caixa_ids?: string[] | null;
      observacoes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("confirmar_saida_expedicao", {
        p_carga_id: payload.carga_id,
        p_motorista_id: payload.motorista_id,
        p_caixa_ids: payload.caixa_ids ?? null,
        p_observacoes: payload.observacoes ?? null,
      });
      if (error) throw new Error(error.message);
      return data as { saida_id: string; total_caixas: number };
    },
    onSuccess: () => invalidateOrdem(qc),
  });
}

export type EntregaPayload = {
  saida_id: string;
  ordem_codigo?: string;
  cliente_nome?: string;
  caixas: EntregaCaixaQueueItem[];
  recebedor_nome: string | null;
  canhoto_foto_url: string | null;
  vazias: Record<string, number>;
  observacoes: string | null;
};

async function enviarEntrega(payload: EntregaPayload) {
  const { data, error } = await supabase.rpc("confirmar_entrega_expedicao", {
    p_saida_id: payload.saida_id,
    p_caixas: payload.caixas,
    p_recebedor_nome: payload.recebedor_nome,
    p_canhoto_foto_url: payload.canhoto_foto_url,
    p_vazias: payload.vazias,
    p_observacoes: payload.observacoes,
    p_confirmacao_manual: false,
    p_justificativa: null,
  });
  if (error) throw new Error(error.message);
  return data as {
    entrega_id: string;
    status: "entregue" | "entregue_parcial" | "recusada";
    caixas_entregues: number;
    caixas_recusadas: number;
    quebra_id: string | null;
  };
}

export function useConfirmarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enviarEntrega,
    onSuccess: () => invalidateOrdem(qc),
  });
}

/** Fila offline da entrega — mesmo padrão da movimentação/saída na roça. */
export function useEntregaOfflineQueue(enabled: boolean) {
  const qc = useQueryClient();
  const [offline, setOffline] = useState(
    typeof navigator === "undefined" ? false : !navigator.onLine,
  );
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    setPendentes(getEntregaQueue().length);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    async function flush() {
      if (typeof navigator === "undefined" || !navigator.onLine) return;
      const fila = getEntregaQueue();
      if (!fila.length) return;
      for (const item of fila) {
        try {
          await enviarEntrega(item);
          removeEntregaFromQueue(item.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          // Erro de regra não volta a subir para não travar a fila.
          if (/já foi confirmada|não encontrada|sem saída/i.test(msg)) {
            removeEntregaFromQueue(item.id);
          }
        }
      }
      setPendentes(getEntregaQueue().length);
      invalidateOrdem(qc);
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

  const guardar = (payload: EntregaPayload) => {
    enqueueEntrega({
      saida_id: payload.saida_id,
      ordem_codigo: payload.ordem_codigo,
      cliente_nome: payload.cliente_nome,
      caixas: payload.caixas,
      recebedor_nome: payload.recebedor_nome,
      canhoto_foto_url: payload.canhoto_foto_url,
      vazias: payload.vazias,
      observacoes: payload.observacoes,
    });
    setPendentes(getEntregaQueue().length);
  };

  return { offline, pendentes, guardar };
}

export type EntregaSemConfirmacao = {
  saida_id: string;
  carga_id: string;
  ordem_codigo: string;
  numero_ordem: string;
  data_carga: string;
  cliente_id: string;
  cliente_nome: string;
  motorista_id: string | null;
  motorista_nome: string | null;
  saida_em: string;
  total_caixas: number;
  conferido_por_nome: string | null;
  minutos_em_transito: number;
};

/** Em trânsito sem confirmação do motorista até o fim do dia (pendência admin). */
export function useEntregasSemConfirmacao() {
  return useQuery({
    queryKey: ["entregas-sem-confirmacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_entregas_sem_confirmacao")
        .select("*")
        .order("saida_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntregaSemConfirmacao[];
    },
  });
}

export function useConfirmarEntregaAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { carga_id: string; justificativa: string }) => {
      const { data, error } = await supabase.rpc("confirmar_entrega_admin", {
        p_carga_id: payload.carga_id,
        p_justificativa: payload.justificativa,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => invalidateOrdem(qc),
  });
}

/** Caixas de uma saída (pré-preenchimento da entrega). */
export function useCaixasDaSaida(cargaId: string | null | undefined) {
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

export async function uploadCanhotoEntrega(file: File, saidaId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `entrega-expedicao/${saidaId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("conferencia-fotos").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("conferencia-fotos").getPublicUrl(path);
  return data.publicUrl;
}
