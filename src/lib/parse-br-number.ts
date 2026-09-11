export type ParseBrResult =
  | { ok: true; value: number }
  | { ok: false; raw: string };

/** Aceita 1.234,50 · 1234,50 · 1234.50 · 1234 · 1.234 (milhar). */
export function parseBrNumber(raw: unknown): ParseBrResult {
  if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, value: raw };
  const t = String(raw ?? "").trim().replace(/\s/g, "");
  if (!t) return { ok: false, raw: "" };
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    return { ok: true, value: Number(t.replace(/\./g, "")) };
  }
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t) || /^-?\d+,\d+$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, raw: t };
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, raw: t };
  }
  return { ok: false, raw: t };
}

export function parseBrNumberLoose(raw: unknown): number {
  const r = parseBrNumber(raw);
  return r.ok ? r.value : 0;
}

export function parseBrNumberOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const r = parseBrNumber(raw);
  return r.ok ? r.value : null;
}
