import { Link } from "@tanstack/react-router";

/** NOP-309 — selo quando o produto não tem fator de conversão. */
export function SemConversaoSelo({
  faltaSaida,
  faltaFornecedor,
  compact,
}: {
  faltaSaida?: boolean;
  faltaFornecedor?: boolean;
  compact?: boolean;
}) {
  if (!faltaSaida && !faltaFornecedor) return null;
  const label =
    faltaSaida && faltaFornecedor
      ? "Sem conversão"
      : faltaSaida
        ? "Sem conversão (saída)"
        : "Sem conversão (forn.)";
  return (
    <Link
      to="/gestao/produtos"
      className={`chip chip-warn ${compact ? "text-[10px] px-1.5 py-0" : "text-xs"} hover:opacity-90`}
      title="Cadastrar fator de conversão"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}
