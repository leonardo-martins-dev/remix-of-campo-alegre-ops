import {
  isParadaConcluida,
  isParadaPendente,
  resumoMinhaRota,
  type ParadaMinhaRota,
} from "./minha-rota";

function base(partial: Partial<ParadaMinhaRota>): ParadaMinhaRota {
  return {
    saida_id: "s1",
    carga_id: "c1",
    motorista_id: "m1",
    cliente_id: "cl1",
    saida_em: "2026-09-23T10:00:00Z",
    total_caixas: 4,
    saida_status: "em_transito",
    carga_codigo: "PV-1",
    numero_ordem: "1",
    status_ordem: "em_transito",
    data_carga: "2026-09-23",
    cliente_nome: "Loja A",
    cliente_cnpj: null,
    rota_id: "r1",
    rota_nome: "Rota Norte",
    rota_ordem: 1,
    motorista_nome: "João",
    entrega_id: null,
    entrega_status: null,
    entregue_em: null,
    total_caixas_entregues: null,
    total_caixas_recusadas: null,
    caixas_vazias_retiradas: null,
    recebedor_nome: null,
    ...partial,
  };
}

const pendente = base({});
const entregue = base({
  saida_id: "s2",
  saida_status: "finalizada",
  status_ordem: "entregue",
  entrega_id: "e1",
  entrega_status: "entregue",
  total_caixas_entregues: 4,
  total_caixas_recusadas: 0,
  caixas_vazias_retiradas: { VM: 3, AM: 1 },
});
const parcial = base({
  saida_id: "s3",
  saida_status: "finalizada",
  status_ordem: "entregue_parcial",
  entrega_id: "e2",
  entrega_status: "entregue_parcial",
  total_caixas_entregues: 2,
  total_caixas_recusadas: 2,
  caixas_vazias_retiradas: { VM: 1 },
});

if (!isParadaPendente(pendente)) throw new Error("pendente");
if (!isParadaConcluida(entregue)) throw new Error("concluida");

const r = resumoMinhaRota([pendente, entregue, parcial]);
if (r.total !== 3) throw new Error("total");
if (r.concluidas !== 2) throw new Error("concluidas");
if (r.pendentes !== 1) throw new Error("pendentes");
if (r.entregues !== 1 || r.parciais !== 1) throw new Error("status counts");
if (r.caixasEntregues !== 6 || r.caixasRecusadas !== 2) throw new Error("caixas");
if (r.vazias.VM !== 4 || r.vazias.AM !== 1) throw new Error("vazias");
if (r.completa) throw new Error("should not be completa");

const r2 = resumoMinhaRota([entregue, parcial]);
if (!r2.completa) throw new Error("should be completa");

console.log("minha-rota ok");
