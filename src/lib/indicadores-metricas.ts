/**
 * NOP-320 — Fill rate e médias de tempo sem denominador zero / médias enganosas.
 */

/** Limite acima do qual duração de conferência entra como outlier (não na média). */
export const MAX_CONFERENCIA_MIN = 8 * 60; // 8h
/** Limite acima do qual duração de carga entra como outlier. */
export const MAX_CARGA_MIN = 4 * 60; // 4h

export type FillRateKind = "pct" | "sem_dados" | "aguardando_entrega";

export type FillRateDisplay = {
  kind: FillRateKind;
  /** Só preenchido quando kind === "pct" */
  pct: number | null;
  label: string;
  /** Numerador / denominador usados (itens ou valor). */
  sampleSize: number;
  formula: string;
};

/**
 * Percentual seguro: sem denominador válido → null (nunca 100% em 0/0).
 */
export function safePct(numerador: number, denominador: number): number | null {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador) || denominador <= 0) {
    return null;
  }
  return Math.round((numerador / denominador) * 1000) / 10;
}

/**
 * Fill rate para placar/dashboard.
 * - pedidos=0 e sem amostra → "sem dados"
 * - pedidos>0 mas sem entrega/denominador → "aguardando entrega"
 * - caso contrário → percentual
 */
export function fillRateDisplay(opts: {
  numerador: number;
  denominador: number;
  pedidos?: number;
  entregas?: number;
  formula?: string;
}): FillRateDisplay {
  const formula =
    opts.formula ??
    "itens completos ÷ itens do pedido × 100 (só pedidos fechados no período)";
  const pct = safePct(opts.numerador, opts.denominador);
  const pedidos = opts.pedidos ?? 0;
  const entregas = opts.entregas ?? 0;

  if (pct == null) {
    if (pedidos > 0 && entregas === 0) {
      return {
        kind: "aguardando_entrega",
        pct: null,
        label: "aguardando entrega",
        sampleSize: 0,
        formula,
      };
    }
    return {
      kind: "sem_dados",
      pct: null,
      label: "sem dados",
      sampleSize: 0,
      formula,
    };
  }

  return {
    kind: "pct",
    pct,
    label: `${Math.round(pct)}%`,
    sampleSize: opts.denominador,
    formula,
  };
}

export type DurationSample = {
  id: string;
  minutes: number;
};

export type AvgDurationResult = {
  avgMin: number | null;
  sampleSize: number;
  outliers: DurationSample[];
  formula: string;
  periodLabel: string;
};

/**
 * Duração em minutos entre dois ISO timestamps. Retorna null se inválida/aberta.
 */
export function durationMinutes(
  inicio: string | null | undefined,
  fim: string | null | undefined,
): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio).getTime();
  const b = new Date(fim).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 60_000;
}

/**
 * Média de durações válidas; outliers (acima do max) ficam à parte.
 * Durações ≤ 0 são inválidas (ex.: timestamps iguais gerados no mesmo instante).
 */
export function averageDurationMinutes(
  samples: DurationSample[],
  opts: { maxValidMin: number; formula: string; periodLabel: string },
): AvgDurationResult {
  const valid: DurationSample[] = [];
  const outliers: DurationSample[] = [];

  for (const s of samples) {
    if (!Number.isFinite(s.minutes) || s.minutes <= 0) continue;
    if (s.minutes > opts.maxValidMin) {
      outliers.push(s);
      continue;
    }
    valid.push(s);
  }

  if (valid.length === 0) {
    return {
      avgMin: null,
      sampleSize: 0,
      outliers,
      formula: opts.formula,
      periodLabel: opts.periodLabel,
    };
  }

  const sum = valid.reduce((a, s) => a + s.minutes, 0);
  return {
    avgMin: Math.round((sum / valid.length) * 10) / 10,
    sampleSize: valid.length,
    outliers,
    formula: opts.formula,
    periodLabel: opts.periodLabel,
  };
}

export function formatMetaLine(meta: {
  periodLabel: string;
  sampleSize: number;
  formula: string;
  outliersCount?: number;
}): string {
  const parts = [
    `Período: ${meta.periodLabel}`,
    `Amostra: n=${meta.sampleSize}`,
    `Fórmula: ${meta.formula}`,
  ];
  if (meta.outliersCount && meta.outliersCount > 0) {
    parts.push(`Outliers excluídos: ${meta.outliersCount}`);
  }
  return parts.join(" · ");
}
