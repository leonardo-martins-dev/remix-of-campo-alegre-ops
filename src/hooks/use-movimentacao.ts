import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export type PosicaoTipo = "cliente" | "fornecedor" | "galpao" | "motorista";

export type Entidade = {
  id: string;
  nome: string;
  tipo: PosicaoTipo;
  posicao_id: string | null;
  ativo: boolean;
};

export const TIPO_LABEL: Record<PosicaoTipo, string> = {
  cliente: "Loja",
  fornecedor: "Fornecedor",
  galpao: "Packing",
  motorista: "Motorista (em trânsito)",
};

// A posição motorista é movimentada pela saída na roça (NOP-129), que usa
// RPC própria — por isso ela não entra nos destinos do wizard manual.
const DESTINOS_PERMITIDOS: Record<PosicaoTipo, PosicaoTipo[]> = {
  cliente: ["fornecedor", "galpao"],
  fornecedor: ["galpao"],
  galpao: ["fornecedor"],
  motorista: ["galpao"],
};

export function destinosPermitidos(origemTipo: PosicaoTipo): PosicaoTipo[] {
  return DESTINOS_PERMITIDOS[origemTipo] ?? [];
}

function getNatureza(ori: PosicaoTipo, dst: PosicaoTipo): string {
  if (ori === "cliente" && dst === "galpao") return "retorno";
  if (ori === "cliente" && dst === "fornecedor") return "transferencia";
  if (ori === "fornecedor" && dst === "galpao") return "recebimento_cheias";
  if (ori === "galpao" && dst === "fornecedor") return "entrega_vazias";
  // Saída na roça (fornecedor → motorista) e chegada (motorista → packing).
  if (ori === "fornecedor" && dst === "motorista") return "transferencia";
  if (ori === "motorista" && dst === "galpao") return "transferencia";
  return "transferencia";
}

export function useEntidadesMovimentacao() {
  return useQuery({
    queryKey: ["entidades-movimentacao"],
    queryFn: async () => {
      const [posRes, cliRes, fornRes, cargasRes] = await Promise.all([
        supabase.from("posicoes_caixa").select("id, tipo, ref_id"),
        supabase.from("clientes").select("id, nome, ativo").eq("ativo", true).order("nome"),
        supabase.from("fornecedores").select("id, nome, ativo").eq("ativo", true).order("nome"),
        supabase.from("cargas").select("cliente_id").eq("data_carga", todayBRT()),
      ]);

      const firstError = posRes.error ?? cliRes.error ?? fornRes.error ?? cargasRes.error;
      if (firstError) throw firstError;

      const posicoes = posRes.data ?? [];
      const clientesHojeIds = new Set(
        (cargasRes.data ?? [])
          .map((c: { cliente_id: string | null }) => c.cliente_id)
          .filter((id): id is string => !!id),
      );

      const clientes: Entidade[] = (cliRes.data ?? [])
        .map((c) => ({
          id: c.id,
          nome: c.nome,
          tipo: "cliente" as const,
          posicao_id: posicoes.find((p) => p.tipo === "cliente" && p.ref_id === c.id)?.id ?? null,
          ativo: c.ativo,
        }))
        .sort((a, b) => {
          const aH = clientesHojeIds.has(a.id) ? 0 : 1;
          const bH = clientesHojeIds.has(b.id) ? 0 : 1;
          return aH - bH || a.nome.localeCompare(b.nome);
        });

      const fornecedores: Entidade[] = (fornRes.data ?? []).map((f) => ({
        id: f.id,
        nome: f.nome,
        tipo: "fornecedor" as const,
        posicao_id: posicoes.find((p) => p.tipo === "fornecedor" && p.ref_id === f.id)?.id ?? null,
        ativo: f.ativo,
      }));

      const galpao: Entidade[] = posicoes
        .filter((p) => p.tipo === "galpao")
        .map((p) => ({
          id: p.id,
          nome: "Packing House",
          tipo: "galpao" as const,
          posicao_id: p.id,
          ativo: true,
        }));

      return { clientes, fornecedores, galpao, clientesHojeIds };
    },
  });
}

export function useSaldoPosicao(posicaoId: string | null) {
  return useQuery({
    queryKey: ["saldo-posicao", posicaoId],
    enabled: !!posicaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("tipo_caixa, quantidade, origem_posicao_id, destino_posicao_id")
        .or(`origem_posicao_id.eq.${posicaoId},destino_posicao_id.eq.${posicaoId}`);
      if (error) throw error;

      const saldo: Record<string, number> = {};
      for (const m of data ?? []) {
        if (!m.tipo_caixa) continue;
        const inc = m.destino_posicao_id === posicaoId ? Number(m.quantidade ?? 0) : 0;
        const out = m.origem_posicao_id === posicaoId ? Number(m.quantidade ?? 0) : 0;
        saldo[m.tipo_caixa] = (saldo[m.tipo_caixa] ?? 0) + inc - out;
      }
      return saldo;
    },
  });
}

export async function ensurePosicao(tipo: PosicaoTipo, refId: string | null): Promise<string> {
  if (tipo === "galpao") {
    const { data } = await supabase.from("posicoes_caixa").select("id").eq("tipo", "galpao").maybeSingle();
    if (data) return data.id;
    const { data: c } = await supabase.from("posicoes_caixa").insert({ tipo: "galpao" }).select("id").single();
    return c!.id;
  }
  const { data } = await supabase
    .from("posicoes_caixa")
    .select("id")
    .eq("tipo", tipo)
    .eq("ref_id", refId!)
    .maybeSingle();
  if (data) return data.id;
  const { data: c } = await supabase
    .from("posicoes_caixa")
    .insert({ tipo, ref_id: refId })
    .select("id")
    .single();
  return c!.id;
}

export function useRegistrarMovimentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      origem: Entidade;
      destino: Entidade;
      caixas: Record<string, number>;
      motorista_id?: string | null;
      registrado_por: string;
      observacoes?: string;
      veiculo_fornecedor?: boolean;
    }) => {
      const origemRefId = payload.origem.tipo === "galpao" ? null : payload.origem.id;
      const destinoRefId = payload.destino.tipo === "galpao" ? null : payload.destino.id;

      const origemPosId = payload.origem.posicao_id ?? (await ensurePosicao(payload.origem.tipo, origemRefId));
      const destinoPosId = payload.destino.posicao_id ?? (await ensurePosicao(payload.destino.tipo, destinoRefId));

      const natureza = getNatureza(payload.origem.tipo, payload.destino.tipo);
      const hasFornecedor = payload.origem.tipo === "fornecedor" || payload.destino.tipo === "fornecedor";

      const rows = Object.entries(payload.caixas)
        .filter(([, qty]) => qty > 0)
        .map(([tipo_caixa, quantidade]) => ({
          origem_posicao_id: origemPosId,
          destino_posicao_id: destinoPosId,
          tipo_caixa,
          quantidade,
          tipo: natureza,
          natureza,
          registrado_por: payload.registrado_por,
          observacoes: payload.veiculo_fornecedor
            ? `[Veículo do fornecedor] ${payload.observacoes ?? ""}`.trim()
            : (payload.observacoes ?? null),
          data_movimento: todayBRT(),
          documento_tipo: "avulso" as const,
          confirmacao_status: hasFornecedor ? ("pendente" as const) : ("nao_aplicavel" as const),
          fornecedor_id:
            payload.origem.tipo === "fornecedor"
              ? payload.origem.id
              : payload.destino.tipo === "fornecedor"
                ? payload.destino.id
                : null,
          cliente_id:
            payload.origem.tipo === "cliente"
              ? payload.origem.id
              : payload.destino.tipo === "cliente"
                ? payload.destino.id
                : null,
        }));

      if (rows.length === 0) throw new Error("Informe ao menos uma caixa");

      const { error } = await supabase.from("movimentacoes_caixa").insert(rows);
      if (error) throw error;

      if (natureza === "retorno" && payload.origem.tipo === "cliente") {
        await supabase.from("retornos_caixa").insert({
          cliente_id: payload.origem.id,
          motorista_id: payload.motorista_id ?? null,
          registrado_por: payload.registrado_por,
          caixas_g: payload.caixas.G ?? 0,
          caixas_i: payload.caixas.I ?? 0,
          caixas_p: payload.caixas.P ?? 0,
          caixas: payload.caixas,
          data_retorno: todayBRT(),
          sincronizado_em: new Date().toISOString(),
        });
        await supabase.from("registros_ciclo").insert({
          hora_retorno_caixas: new Date().toISOString(),
          data_registro: todayBRT(),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
      qc.invalidateQueries({ queryKey: ["saldo-posicao"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["retornos"] });
      qc.invalidateQueries({ queryKey: ["retorno-ranking"] });
      qc.invalidateQueries({ queryKey: ["entidades-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["mov-fornecedor"] });
    },
  });
}
