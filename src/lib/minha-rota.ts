export type ParadaMinhaRota = {
  saida_id: string;
  carga_id: string;
  motorista_id: string | null;
  cliente_id: string;
  saida_em: string;
  total_caixas: number;
  saida_status: "em_transito" | "finalizada" | "cancelada";
  carga_codigo: string;
  numero_ordem: string | null;
  status_ordem: string;
  data_carga: string;
  cliente_nome: string;
  cliente_cnpj: string | null;
  rota_id: string | null;
  rota_nome: string | null;
  rota_ordem: number;
  motorista_nome: string | null;
  entrega_id: string | null;
  entrega_status: "entregue" | "entregue_parcial" | "recusada" | null;
  entregue_em: string | null;
  total_caixas_entregues: number | null;
  total_caixas_recusadas: number | null;
  caixas_vazias_retiradas: Record<string, number> | null;
  recebedor_nome: string | null;
};

export function isParadaPendente(p: ParadaMinhaRota): boolean {
  return p.saida_status === "em_transito";
}

export function isParadaConcluida(p: ParadaMinhaRota): boolean {
  return p.saida_status === "finalizada";
}

export function resumoMinhaRota(paradas: ParadaMinhaRota[]) {
  const total = paradas.length;
  const concluidas = paradas.filter(isParadaConcluida).length;
  const pendentes = paradas.filter(isParadaPendente).length;
  const entregues = paradas.filter((p) => p.entrega_status === "entregue").length;
  const parciais = paradas.filter((p) => p.entrega_status === "entregue_parcial").length;
  const recusadas = paradas.filter((p) => p.entrega_status === "recusada").length;
  const caixasEntregues = paradas.reduce(
    (acc, p) => acc + (p.total_caixas_entregues ?? 0),
    0,
  );
  const caixasRecusadas = paradas.reduce(
    (acc, p) => acc + (p.total_caixas_recusadas ?? 0),
    0,
  );
  const vazias: Record<string, number> = {};
  for (const p of paradas) {
    const v = p.caixas_vazias_retiradas ?? {};
    for (const [sigla, q] of Object.entries(v)) {
      const n = Number(q) || 0;
      if (n > 0) vazias[sigla] = (vazias[sigla] ?? 0) + n;
    }
  }
  return {
    total,
    concluidas,
    pendentes,
    entregues,
    parciais,
    recusadas,
    caixasEntregues,
    caixasRecusadas,
    vazias,
    completa: total > 0 && pendentes === 0,
  };
}
