import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export type DetalheAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
};

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
  const items = detalhes.filter((d) => d.label && !d.separator);
  const withSeps = detalhes.filter((d) => d.label || d.separator);
  return (
    <div className={`flex flex-wrap items-center gap-2 justify-end ${className}`.trim()}>
      {primary}
      {items.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1">
              <MoreHorizontal size={14} />
              Detalhes
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            {withSeps.map((item, i) =>
              item.separator ? (
                <DropdownMenuSeparator key={`sep-${i}`} />
              ) : (
                <DropdownMenuItem
                  key={item.label}
                  disabled={item.disabled}
                  onSelect={() => item.onClick?.()}
                >
                  {item.label}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
