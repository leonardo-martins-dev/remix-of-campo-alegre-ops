import { Link } from "@tanstack/react-router";
import {
  STATUS_ORDEM_CHAIN,
  STATUS_ORDEM_LABEL,
  statusOrdemChip,
  type StatusOrdem,
} from "@/hooks/use-ordem-expedicao";

const CHAIN_INDEX: Record<string, number> = Object.fromEntries(
  STATUS_ORDEM_CHAIN.map((s, i) => [s, i]),
);

/** Compact stepper: Importado → Conferido → Em carga → Saída → Entregue */
export function FluxoOrdemStepper({
  status,
  compact,
}: {
  status: string | null | undefined;
  compact?: boolean;
}) {
  const current = status ?? "importada";
  const idx =
    current === "entregue_parcial" || current === "recusada"
      ? CHAIN_INDEX.entregue
      : (CHAIN_INDEX[current] ?? 0);

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${compact ? "text-[10px]" : "text-xs"}`}
      aria-label="Fluxo da ordem"
    >
      {STATUS_ORDEM_CHAIN.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <span key={step} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50">›</span>}
            <span
              className={
                active
                  ? "font-bold text-primary"
                  : done
                    ? "text-primary/70"
                    : "text-muted-foreground"
              }
            >
              {STATUS_ORDEM_LABEL[step]}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function StatusOrdemBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const label = STATUS_ORDEM_LABEL[status as StatusOrdem] ?? status;
  return <span className={`chip ${statusOrdemChip(status)}`}>{label}</span>;
}

export function ProximoPassoLinks({
  statusOrdem,
  cargaId,
  clienteId,
}: {
  statusOrdem: string | null | undefined;
  cargaId: string;
  clienteId?: string | null;
}) {
  if (statusOrdem === "conferida") {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <Link
          to="/expedicao/rotas"
          search={{ cargaId }}
          className="text-xs font-semibold text-primary-dark hover:underline"
        >
          Montar ordem de separação →
        </Link>
      </div>
    );
  }
  if (statusOrdem === "separada") {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <Link
          to="/expedicao/saida"
          search={{ cargaId, clienteId: clienteId ?? undefined }}
          className="text-xs font-semibold text-primary-dark hover:underline"
        >
          Confirmar saída →
        </Link>
      </div>
    );
  }
  if (statusOrdem === "em_transito") {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <Link
          to="/expedicao/entrega"
          search={{ cargaId }}
          className="text-xs font-semibold text-primary-dark hover:underline"
        >
          Confirmar entrega →
        </Link>
        <Link
          to="/expedicao/rastreio"
          className="text-xs font-semibold text-muted-foreground hover:underline"
        >
          Ver rastreio
        </Link>
      </div>
    );
  }
  return null;
}
