const QUEUE_KEY = "campo-alegre-retorno-queue";
const FORN_QUEUE_KEY = "campo-alegre-fornecedor-queue";

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
