import { ChevronRight } from "lucide-react";
import { labelStatusItem, type StatusItemConferencia } from "@/lib/conferir-chegada";

export type LinhaFila = {
  itemId: string;
  fornecedorNome: string;
  produto: string;
  esperadoCaixas: number | null;
  status: StatusItemConferencia;
  atual: boolean;
};

const TONE: Record<StatusItemConferencia, string> = {
  conferido: "chip-ok",
  em_andamento: "chip-info",
  pendente: "chip-muted",
};

/**
 * NOP-328 passo 3 — fila do caminhão. Tocar numa linha abre o item no passo 2
 * (inclusive itens já conferidos: NOP-327 deixa corrigir com a conferência aberta).
 */
export function PassoFila({
  linhas,
  onAbrir,
}: {
  linhas: LinhaFila[];
  onAbrir: (itemId: string) => void;
}) {
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum item na fila. Escolha os fornecedores do caminhão no passo 1.
      </p>
    );
  }

  return (
    <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
      {linhas.map((l, i) => (
        <li key={l.itemId}>
          <button
            type="button"
            onClick={() => onAbrir(l.itemId)}
            className={[
              "w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-secondary/40 transition-colors min-h-14",
              l.atual ? "bg-primary-soft/50" : "",
            ].join(" ")}
          >
            <span className="w-6 shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground truncate">
                {l.fornecedorNome}
              </span>
              <span className="block font-semibold text-navy text-sm truncate">{l.produto}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {l.esperadoCaixas == null
                  ? "Esperado · sem conversão"
                  : `Esperado ${l.esperadoCaixas} ${l.esperadoCaixas === 1 ? "caixa" : "caixas"}`}
              </span>
            </span>
            <span className={`chip ${TONE[l.status]} shrink-0`}>{labelStatusItem(l.status)}</span>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}
