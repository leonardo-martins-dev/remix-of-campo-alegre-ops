export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function pickColumn(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = normalizeKey(alias);
    const found = keys.find((k) => normalizeKey(k) === target);
    if (found != null && row[found] !== "" && row[found] != null) return row[found];
  }
  return undefined;
}
