import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { NumberStepper } from "@/components/number-stepper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { safeNum } from "@/lib/caixas-map";

export type RomaneioLinha = {
  id: string;
  produtoId: string | null;
  produto: string;
  romaneio: number;
  real: number;
  caixas: Record<string, number>;
  status: "ok" | "corrigido" | "pendente";
  semFator: boolean;
};

function StatusChip({ it }: { it: RomaneioLinha }) {
  if (it.semFator && it.status === "pendente") {
    return (
      <span className="chip chip-warn text-xs">
        sem fator
        <Link
          to="/gestao/conversao"
          className="ml-1 inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={10} />
        </Link>
      </span>
    );
  }
  if (it.semFator) {
    return (
      <span className="chip chip-warn text-xs">
        sem fator
        <Link
          to="/gestao/conversao"
          className="ml-1 inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={10} />
        </Link>
      </span>
    );
  }
  if (it.status === "ok") return <span className="chip chip-ok">OK</span>;
  if (it.status === "corrigido") {
    const d = it.real - it.romaneio;
    return <span className="chip chip-warn">{d > 0 ? `+${d}` : `${d}`}</span>;
  }
  return <span className="chip chip-muted">Pendente</span>;
}

function formatCaixas(caixas: Record<string, number>, siglas: string[]) {
  const parts = siglas
    .map((k) => {
      const n = safeNum(caixas[k]);
      return n > 0 ? `${n}${k}` : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "0 cx";
}

export function RomaneioListaEnxuta({
  familias,
  siglas,
  onEdit,
}: {
  familias: { familia: string; itens: RomaneioLinha[] }[];
  siglas: string[];
  onEdit: (item: RomaneioLinha) => void;
}) {
  return (
    <div className="divide-y divide-border">
      {familias.map((fam, fi) => (
        <div key={fam.familia}>
          <div className="px-4 sm:px-5 py-2 bg-secondary/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Família {fi + 1} · {fam.familia}
          </div>
          <ul className="divide-y divide-border">
            {fam.itens.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onEdit(it)}
                  className="w-full text-left px-4 sm:px-5 py-3 hover:bg-secondary/40 active:bg-secondary/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-navy text-sm">{it.produto}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        Romaneio {it.romaneio}
                        {it.status !== "pendente" && (
                          <>
                            {" "}
                            · Conferido {it.real}
                            {" · "}
                            {formatCaixas(it.caixas, siglas)}
                          </>
                        )}
                      </div>
                    </div>
                    <StatusChip it={it} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function EditarItemDialog({
  item,
  siglas,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  item: RomaneioLinha | null;
  siglas: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (next: { real: number; caixas: Record<string, number> }) => void;
  saving?: boolean;
}) {
  const [real, setReal] = useState(item?.real ?? 0);
  const [caixas, setCaixas] = useState<Record<string, number>>(item?.caixas ?? {});

  useEffect(() => {
    if (!item) return;
    setReal(item.real);
    setCaixas(item.caixas);
  }, [item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{item.produto}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Romaneio</span>
            <span className="font-bold text-navy tabular-nums">{item.romaneio}</span>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Quantidade conferida
            </div>
            <NumberStepper value={real} onChange={setReal} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Caixas
            </div>
            <div className="flex flex-wrap gap-3">
              {siglas.map((k) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground w-4">{k}</span>
                  <NumberStepper
                    size="sm"
                    width="w-14"
                    value={safeNum(caixas[k])}
                    onChange={(v) => setCaixas({ ...caixas, [k]: Math.max(0, v) })}
                  />
                </div>
              ))}
            </div>
            {item.semFator && (
              <p className="text-xs text-warning mt-2">
                Sem fator de saída —{" "}
                <Link to="/gestao/conversao" className="underline font-semibold">
                  cadastrar conversão
                </Link>
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() => onSave({ real: Math.max(0, real), caixas })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
