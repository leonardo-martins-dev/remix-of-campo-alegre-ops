export type RateioLine = { destinatario_id: string; quantidade: number };

export function filledRateio(rateio: RateioLine[]): RateioLine[] {
  return rateio.filter((r) => r.destinatario_id && r.quantidade > 0);
}

export function sumRateio(rateio: RateioLine[]): number {
  return filledRateio(rateio).reduce((a, r) => a + r.quantidade, 0);
}

export function rateioRestante(
  quantidade: number,
  rateio: RateioLine[],
  excludeIndex?: number
): number {
  const sum = rateio.reduce((a, r, i) => {
    if (i === excludeIndex) return a;
    if (!r.destinatario_id || r.quantidade <= 0) return a;
    return a + r.quantidade;
  }, 0);
  return Math.max(0, quantidade - sum);
}

export function validateRateio(
  quantidade: number,
  rateio: RateioLine[]
): { ok: boolean; sum: number; error?: string } {
  const filled = filledRateio(rateio);
  if (filled.length === 0) return { ok: true, sum: 0 };

  const ids = filled.map((r) => r.destinatario_id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, sum: sumRateio(rateio), error: "Destinatário duplicado no rateio" };
  }

  const sum = sumRateio(rateio);
  if (sum > quantidade) {
    return {
      ok: false,
      sum,
      error: `Rateio excede a quantidade do produto (${sum}/${quantidade})`,
    };
  }
  if (sum < quantidade) {
    return {
      ok: false,
      sum,
      error: `Distribua todas as ${quantidade} unidades — faltam ${quantidade - sum}`,
    };
  }
  return { ok: true, sum };
}
