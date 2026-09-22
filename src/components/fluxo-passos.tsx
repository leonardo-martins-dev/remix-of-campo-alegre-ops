/**
 * Indicador de etapas (NOP-307) — mesmo padrão visual da Saída para a loja.
 * Passo atual em negrito; passos concluídos em primary.
 */
export function FluxoPassos({
  steps,
  current,
  className = "",
}: {
  steps: string[];
  /** 1-based índice do passo atual */
  current: number;
  className?: string;
}) {
  if (!steps.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-3 ${className}`}>
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <span key={label} className="flex items-center gap-1">
            {i > 0 && <span className="mx-0.5">›</span>}
            <span
              className={
                current > n ? "text-primary" : current === n ? "text-primary font-bold" : ""
              }
            >
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
