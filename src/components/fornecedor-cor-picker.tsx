import { FORNECEDOR_CORES, type FornecedorCorId } from "@/lib/fornecedor-cores";

export type CorEmUsoInfo = {
  cor: string;
  produto_nome: string;
  fornecedor_nome: string;
};

/**
 * NOP-360 — seletor visual: círculo + nome. Cores em uso nos produtos
 * deste fornecedor ficam marcadas (não escondidas).
 */
export function FornecedorCorPicker({
  value,
  onChange,
  emUso = [],
  disabled,
  error,
}: {
  value: FornecedorCorId | null;
  onChange: (id: FornecedorCorId) => void;
  emUso?: CorEmUsoInfo[];
  disabled?: boolean;
  error?: string | null;
}) {
  const usoByCor = new Map<string, CorEmUsoInfo[]>();
  for (const u of emUso) {
    const list = usoByCor.get(u.cor) ?? [];
    list.push(u);
    usoByCor.set(u.cor, list);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {FORNECEDOR_CORES.map((c) => {
          const selected = value === c.id;
          const usos = usoByCor.get(c.id) ?? [];
          const ocupada = usos.length > 0;
          const hint = ocupada
            ? usos
                .slice(0, 2)
                .map((u) => `${u.fornecedor_nome} · ${u.produto_nome}`)
                .join("; ")
            : undefined;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              title={hint}
              onClick={() => onChange(c.id)}
              className={[
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left min-h-11 transition-colors",
                selected
                  ? "border-primary ring-2 ring-primary/25 bg-primary-soft/40"
                  : "border-border bg-card hover:border-primary/40",
                disabled ? "opacity-50" : "",
              ].join(" ")}
            >
              <span
                className="h-6 w-6 rounded-full border border-black/25 shrink-0"
                style={{ backgroundColor: c.hex }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-navy truncate">{c.nome}</span>
                {ocupada ? (
                  <span className="block text-[11px] text-warning font-medium truncate">
                    Em uso · {usos[0].fornecedor_nome}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
