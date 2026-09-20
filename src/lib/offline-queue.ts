const QUEUE_KEY = "campo-alegre-retorno-queue";
const FORN_QUEUE_KEY = "campo-alegre-fornecedor-queue";
const MOV_QUEUE_KEY = "campo-alegre-movimentacao-queue";
const SAIDA_QUEUE_KEY = "campo-alegre-saida-roca-queue";
const ENTREGA_QUEUE_KEY = "campo-alegre-entrega-expedicao-queue";

export type RetornoQueueItem = {
  id: string;
  cliente_id: string;
  motorista_id?: string;
  registrado_por: string;
  caixas_g: number;
  caixas_i: number;
  caixas_p: number;
  caixas?: Record<string, number>;
  created_at: string;
};

export type FornecedorQueueItem = {
  id: string;
  fornecedor_id: string;
  tipo_caixa: string;
  quantidade: number;
  natureza: "entrega_vazias" | "recebimento_cheias";
  registrado_por: string;
  created_at: string;
};

export function getRetornoQueue(): RetornoQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function validateRetornoQuantities(
  ret: { caixas_g: number; caixas_i: number; caixas_p: number; caixas?: Record<string, number> },
  saldo: Record<string, number>
): string | null {
  const map = ret.caixas ?? { G: ret.caixas_g, I: ret.caixas_i, P: ret.caixas_p };
  for (const [sigla, qty] of Object.entries(map)) {
    if (Number(qty) > Number(saldo[sigla] ?? 0)) {
      return "Retorno maior que o saldo disponível";
    }
  }
  return null;
}

export function getFornecedorQueue(): FornecedorQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(FORN_QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueueFornecedorMov(item: Omit<FornecedorQueueItem, "id" | "created_at">) {
  const queue = getFornecedorQueue();
  queue.push({ ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem(FORN_QUEUE_KEY, JSON.stringify(queue));
}

export function clearFornecedorQueue() {
  localStorage.removeItem(FORN_QUEUE_KEY);
}

export function removeFornecedorFromQueue(id: string) {
  const queue = getFornecedorQueue().filter((i) => i.id !== id);
  localStorage.setItem(FORN_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueRetorno(item: Omit<RetornoQueueItem, "id" | "created_at">) {
  const queue = getRetornoQueue();
  queue.push({ ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearRetornoQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function removeFromQueue(id: string) {
  const queue = getRetornoQueue().filter((i) => i.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export type MovQueueItem = {
  id: string;
  origem: { tipo: string; ref_id: string | null; posicao_id: string | null; nome: string };
  destino: { tipo: string; ref_id: string | null; posicao_id: string | null; nome: string };
  caixas: Record<string, number>;
  motorista_id?: string | null;
  registrado_por: string;
  observacoes?: string;
  veiculo_fornecedor?: boolean;
  created_at: string;
};

export function getMovQueue(): MovQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(MOV_QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueueMov(item: Omit<MovQueueItem, "id" | "created_at">) {
  const queue = getMovQueue();
  queue.push({ ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem(MOV_QUEUE_KEY, JSON.stringify(queue));
}

export function removeMovFromQueue(id: string) {
  const queue = getMovQueue().filter((i) => i.id !== id);
  localStorage.setItem(MOV_QUEUE_KEY, JSON.stringify(queue));
}

/* ── NOP-129: saída na roça ─────────────────────────────────── */

export type SaidaCaixaQueueItem = {
  tipo_caixa_id: string | null;
  tipo_caixa_sigla: string;
  qtd: number;
  fator_usado: number | null;
};

export type SaidaItemQueueItem = {
  item_pedido_id: string | null;
  produto_id: string | null;
  quantidade_pedida: number;
  quantidade_unidades: number | null;
  caixas: SaidaCaixaQueueItem[];
};

export type SaidaQueueItem = {
  id: string;
  pedido_id: string;
  pedido_codigo?: string;
  motorista_id: string | null;
  veiculo_fornecedor: boolean;
  foto_url: string | null;
  observacoes: string | null;
  itens: SaidaItemQueueItem[];
  created_at: string;
};

export function getSaidaQueue(): SaidaQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(SAIDA_QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueueSaida(item: Omit<SaidaQueueItem, "id" | "created_at">) {
  const queue = getSaidaQueue();
  queue.push({ ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem(SAIDA_QUEUE_KEY, JSON.stringify(queue));
}

export function removeSaidaFromQueue(id: string) {
  const queue = getSaidaQueue().filter((i) => i.id !== id);
  localStorage.setItem(SAIDA_QUEUE_KEY, JSON.stringify(queue));
}

/* ── NOP-130: entrega no supermercado ───────────────────────── */

export type EntregaCaixaQueueItem = {
  caixa_id: string;
  status: "entregue" | "recusada" | "nao_localizada";
  motivo: string | null;
};

export type EntregaQueueItem = {
  id: string;
  saida_id: string;
  ordem_codigo?: string;
  cliente_nome?: string;
  caixas: EntregaCaixaQueueItem[];
  recebedor_nome: string | null;
  canhoto_foto_url: string | null;
  vazias: Record<string, number>;
  observacoes: string | null;
  created_at: string;
};

export function getEntregaQueue(): EntregaQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(ENTREGA_QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueueEntrega(item: Omit<EntregaQueueItem, "id" | "created_at">) {
  const queue = getEntregaQueue();
  queue.push({ ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem(ENTREGA_QUEUE_KEY, JSON.stringify(queue));
}

export function removeEntregaFromQueue(id: string) {
  const queue = getEntregaQueue().filter((i) => i.id !== id);
  localStorage.setItem(ENTREGA_QUEUE_KEY, JSON.stringify(queue));
}
