import { Component, type ErrorInfo, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  hasDetalheItems,
  isEmptyChipValue,
  normalizeDetalheActions,
  type DetalheAction,
  type NormalizedDetalhe,
} from "@/components/ui-galpao-core";

export {
  hasDetalheItems,
  isEmptyChipValue,
  normalizeDetalheActions,
  type DetalheAction,
  type NormalizedDetalhe,
};

type ChipTone = "ok" | "warn" | "danger" | "muted" | "info" | "teal";

const TONE_CLASS: Record<ChipTone, string> = {
  ok: "chip-ok",
  warn: "chip-warn",
  danger: "chip-danger",
  muted: "chip-muted",
  info: "chip-info",
  teal: "chip-teal",
};

/** Chip com rótulo · valor; some se valor vazio. */
export function ChipLabel({
  label,
  value,
  tone = "muted",
  className = "",
}: {
  label?: string;
  value: unknown;
  tone?: ChipTone;
  className?: string;
}) {
  if (isEmptyChipValue(value)) return null;
  const text = label != null && label !== "" ? `${label} · ${value}` : String(value);
  return <span className={`chip ${TONE_CLASS[tone]} ${className}`.trim()}>{text}</span>;
}

/** Número sempre com rótulo (texto, não chip). */
export function NumeroRotulo({
  label,
  value,
  className = "",
}: {
  label: string;
  value: unknown;
  className?: string;
}) {
  if (isEmptyChipValue(value)) return null;
  return (
    <span className={className}>
      <span className="text-muted-foreground">{label}</span>
      {" · "}
      <span className="font-semibold tabular-nums text-navy">{String(value)}</span>
    </span>
  );
}

/**
 * Error boundary local do menu "Detalhes" (NOP-317).
 * Se o menu quebrar (ex.: loop de render em lib de terceiros), o erro para
 * aqui: mostra um aviso compacto no lugar do menu, em vez de desmontar a
 * página inteira e cair no errorComponent do __root. A CTA primária fica de
 * fora do boundary e continua utilizável.
 */
class MenuErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[NOP-317] falha no menu Detalhes:", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <span
          className="chip chip-danger"
          role="status"
          title="O menu de detalhes falhou. Recarregue a página para tentar de novo."
        >
          Erro no menu
        </span>
      );
    }
    return this.props.children;
  }
}

/**
 * Header com no máximo 1 CTA primária; o resto em "Detalhes".
 * NOP-307 — uma ação principal por tela/etapa.
 */
export function HeaderAcoes({
  primary,
  detalhes = [],
  className = "",
}: {
  primary?: ReactNode;
  detalhes?: DetalheAction[];
  className?: string;
}) {
  const entries = normalizeDetalheActions(detalhes);
  return (
    <div className={`flex flex-wrap items-center gap-2 justify-end ${className}`.trim()}>
      {primary}
      {hasDetalheItems(entries) && (
        <MenuErrorBoundary>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1">
                <MoreHorizontal size={14} />
                Detalhes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              {entries.map((entry) =>
                entry.kind === "separator" ? (
                  <DropdownMenuSeparator key={entry.key} />
                ) : (
                  <DropdownMenuItem
                    key={entry.key}
                    disabled={entry.action.disabled}
                    onSelect={() => entry.action.onClick?.()}
                  >
                    {entry.action.label}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </MenuErrorBoundary>
      )}
    </div>
  );
}
