import { fornecedorCorDef } from "@/lib/fornecedor-cores";

/** NOP-360 — círculo + nome (nunca só o círculo). Legado sem cor: null. */
export function FornecedorCorBadge({
  cor,
  size = "md",
  className = "",
}: {
  cor: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const def = fornecedorCorDef(cor);
  if (!def) return null;
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}
      title={def.nome}
    >
      <span
        className={`${dim} rounded-full border border-black/20 shrink-0`}
        style={{ backgroundColor: def.hex }}
        aria-hidden
      />
      <span className="text-xs font-semibold text-navy truncate">{def.nome}</span>
    </span>
  );
}
