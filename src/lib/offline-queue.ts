const QUEUE_KEY = "campo-alegre-retorno-queue";

export type RetornoQueueItem = {
  id: string;
  cliente_id: string;
  motorista_id?: string;
  registrado_por: string;
  caixas_g: number;
  caixas_i: number;
  caixas_p: number;
  created_at: string;
};

export function getRetornoQueue(): RetornoQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
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
