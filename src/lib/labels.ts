export const CONFIG_LABELS: Record<string, string> = {
  impacto_falta_por_unidade: "Impacto da falta por unidade (R$)",
  tolerancia_pct: "Tolerância de divergência (%)",
  tolerancia_min_cx: "Tolerância mínima (caixas)",
  tolerancia_min_un: "Tolerância mínima (unidades)",
  dias_encerrar_pedido: "Dias para encerrar pedido após a data prevista",
  dias_entrega_prevista: "Dias até a entrega prevista",
  diferenca_contagem_tolerada: "Diferença de contagem tolerada (caixas)",
  lembrete_contagem_dias: "Lembrar contagem a cada (dias)",
  lembrete_inventario_galpao_dias: "Lembrete de inventário do galpão (dias)",
  lembrete_inventario_cliente_dias: "Lembrete de inventário no cliente (dias)",
  lembrete_inventario_fornecedor_dias: "Lembrete de inventário no fornecedor (dias)",
  dias_conciliar_inventario: "Dias para conciliar inventário",
  dias_confirmacao_fornecedor: "Dias para o fornecedor confirmar",
  alvo_fill_rate: "Alvo de fill rate (%)",
  benchmark_quebra_fornecedor: "Benchmark de quebra do fornecedor (%)",
  benchmark_taxa_perda: "Benchmark de taxa de perda (%)",
  aging_critico_dias: "Caixas críticas após (dias)",
  aging_alerta_dias: "Caixas em alerta após (dias)",
  auto_rotate_tv_segundos: "Rotação da TV (segundos)",
  inventario_frequencia_dias: "Frequência do inventário (dias)",
  inventario_bloquear_operacao: "Bloquear operação se inventário vencido",
  inventario_alerta_pendente: "Alertar quando inventário estiver pendente",
  inventario_embalagem_alerta: "Alertar inventário de embalagens pendente",
  inventario_embalagem_frequencia_dias: "Frequência do inventário de embalagens (dias)",
  estoque_minimo_giro_dias: "Janela de giro para estoque mínimo (dias)",
};

/** Chaves booleanas em Parâmetros (Sim/Não). */
export const CONFIG_BOOLEAN_KEYS = new Set([
  "inventario_bloquear_operacao",
  "inventario_alerta_pendente",
  "inventario_embalagem_alerta",
]);

export type ConfigGroupId =
  | "tolerancias"
  | "prazos"
  | "inventario"
  | "indicadores"
  | "avancados"
  | "outros";

export const CONFIG_GROUP_LABELS: Record<ConfigGroupId, string> = {
  tolerancias: "Tolerâncias",
  prazos: "Prazos",
  inventario: "Inventário",
  indicadores: "Indicadores",
  avancados: "Avançados",
  outros: "Outros",
};

const CONFIG_GROUP_OF: Record<string, ConfigGroupId> = {
  tolerancia_pct: "tolerancias",
  tolerancia_min_cx: "tolerancias",
  tolerancia_min_un: "tolerancias",
  diferenca_contagem_tolerada: "tolerancias",
  dias_encerrar_pedido: "prazos",
  dias_entrega_prevista: "prazos",
  dias_confirmacao_fornecedor: "prazos",
  dias_conciliar_inventario: "prazos",
  inventario_frequencia_dias: "inventario",
  inventario_bloquear_operacao: "inventario",
  inventario_alerta_pendente: "inventario",
  inventario_embalagem_alerta: "inventario",
  inventario_embalagem_frequencia_dias: "inventario",
  lembrete_contagem_dias: "inventario",
  lembrete_inventario_galpao_dias: "inventario",
  lembrete_inventario_cliente_dias: "inventario",
  lembrete_inventario_fornecedor_dias: "inventario",
  estoque_minimo_giro_dias: "inventario",
  alvo_fill_rate: "indicadores",
  benchmark_quebra_fornecedor: "indicadores",
  benchmark_taxa_perda: "indicadores",
  impacto_falta_por_unidade: "indicadores",
  aging_alerta_dias: "avancados",
  aging_critico_dias: "avancados",
  auto_rotate_tv_segundos: "avancados",
};

export function configGroup(chave: string): ConfigGroupId {
  return CONFIG_GROUP_OF[chave] ?? "outros";
}

export function parseConfigBool(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  const s = String(valor ?? "")
    .trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();
  return s === "true" || s === "1" || s === "sim" || s === "yes";
}

export const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  conferido: "Recebido",
  recebido: "Recebido",
  parcial: "Parcial",
  divergencia: "Com divergência",
  em_transito: "Em trânsito",
  importada: "Importada",
  separada: "Separada",
  entregue: "Entregue",
  entregue_parcial: "Entregue parcial",
  recusada: "Recusada",
  nao_localizada: "Não localizada",
  aguardando_liberacao: "Aguardando liberação",
  aguardando_vinculo: "Aguardando vínculo",
  encerrado: "Encerrado",
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
  conciliada: "Conciliada",
  mantida: "Mantida",
  saida: "Saída",
  entrada: "Entrada",
  interna: "Interna",
  envio: "Enviada",
  retorno: "Retirada",
  enviada: "Enviada",
  retirada: "Retirada",
  perda: "Perda",
  ajuste: "Ajuste",
  abertura: "Abertura",
  entrega_vazias: "Entrega de vazias",
  recebimento_cheias: "Recebimento de cheias",
  galpao: "Galpão",
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  motorista: "Motorista",
  transferencia: "Transferência",
};

export function configLabel(chave: string): string {
  return CONFIG_LABELS[chave] ?? chave.replace(/_/g, " ");
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABELS[value] ?? value.replace(/_/g, " ");
}
