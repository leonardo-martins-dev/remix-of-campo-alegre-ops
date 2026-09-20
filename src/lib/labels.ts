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
  aging_critico_dias: "Aging crítico (dias)",
  aging_alerta_dias: "Aging em alerta (dias)",
};

export const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  conferido: "Recebido",
  recebido: "Recebido",
  parcial: "Parcial",
  divergencia: "Com divergência",
  em_transito: "Em trânsito",
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
};

export function configLabel(chave: string): string {
  return CONFIG_LABELS[chave] ?? chave.replace(/_/g, " ");
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABELS[value] ?? value.replace(/_/g, " ");
}
