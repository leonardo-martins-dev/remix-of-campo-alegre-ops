/**
 * Helpers puros de ui-galpao (sem React) — permitem teste unitário direto.
 * Ver src/components/ui-galpao.test.ts.
 */

/** Valor vazio / placeholder — não renderiza chip. */
export function isEmptyChipValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") {
    const t = value.trim();
    return !t || t === "—" || t === "-" || t === "NaN";
  }
  if (typeof value === "number") return !Number.isFinite(value);
  return false;
}

export type DetalheAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
};

export type NormalizedDetalhe =
  | { kind: "item"; key: string; action: DetalheAction }
  | { kind: "separator"; key: string };

/**
 * Normaliza as entradas do menu "Detalhes" (NOP-317).
 *
 * O menu não pode quebrar ao abrir/fechar, então a lista é saneada antes de
 * virar JSX:
 * - entradas nulas ou com label vazio são descartadas;
 * - `separator: true` sempre vira separador (mesmo com label);
 * - separadores no início/fim e separadores consecutivos são colapsados;
 * - cada entrada ganha uma key estável (labels repetidos não colidem).
 */
export function normalizeDetalheActions(
  detalhes?: readonly (DetalheAction | null | undefined)[] | null,
): NormalizedDetalhe[] {
  const out: NormalizedDetalhe[] = [];
  let sepPendente = false;
  let itemSeq = 0;
  let sepSeq = 0;

  for (const d of detalhes ?? []) {
    if (!d) continue;
    if (d.separator) {
      // separador só conta se já houver item antes (evita separador solto no topo)
      if (out.length > 0) sepPendente = true;
      continue;
    }
    const label = typeof d.label === "string" ? d.label.trim() : "";
    if (!label) continue;
    if (sepPendente) {
      out.push({ kind: "separator", key: `sep-${sepSeq++}` });
      sepPendente = false;
    }
    out.push({ kind: "item", key: `item-${itemSeq++}-${label}`, action: { ...d, label } });
  }

  // separador pendente no fim da lista é descartado de propósito
  return out;
}

/** Há pelo menos uma ação clicável? (define se o botão "Detalhes" aparece) */
export function hasDetalheItems(entries: readonly NormalizedDetalhe[]): boolean {
  return entries.some((e) => e.kind === "item");
}
