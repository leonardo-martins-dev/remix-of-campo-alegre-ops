import { useState, useCallback } from "react";
import { Plus, X, Package } from "lucide-react";
import { NumberStepper } from "@/components/number-stepper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { TipoCaixa } from "@/lib/caixas-map";
import type { SugestaoItem } from "@/hooks/use-sugestao-caixas";

export type CaixaItemEntry = {
  tipo_caixa_id: string;
  sigla: string;
  sugerida: number;
  real: number;
  fator: number | null;
};

type CaixasItemEditorProps = {
  entries: CaixaItemEntry[];
  onChange: (entries: CaixaItemEntry[]) => void;
  tipos: TipoCaixa[];
  sugestao?: SugestaoItem;
  readOnly?: boolean;
};

export function CaixasItemEditor({
  entries,
  onChange,
  tipos,
  sugestao,
  readOnly = false,
}: CaixasItemEditorProps) {
  const [addOpen, setAddOpen] = useState(false);

  const usedTipos = new Set(entries.map((e) => e.tipo_caixa_id));
  const availableTipos = tipos.filter((t) => !usedTipos.has(t.id));

  const updateReal = useCallback(
    (idx: number, real: number) => {
      const updated = [...entries];
      updated[idx] = { ...updated[idx], real: Math.max(0, real) };
      onChange(updated);
    },
    [entries, onChange],
  );

  const removeEntry = useCallback(
    (idx: number) => {
      const updated = entries.filter((_, i) => i !== idx);
      onChange(updated);
    },
    [entries, onChange],
  );

  const addTipo = useCallback(
    (tipoId: string) => {
      const tipo = tipos.find((t) => t.id === tipoId);
      if (!tipo) return;
      const sug = sugestao?.sugestoes.find((s) => s.tipo_caixa_id === tipoId);
      const newEntry: CaixaItemEntry = {
        tipo_caixa_id: tipoId,
        sigla: tipo.sigla,
        sugerida: sug?.quantidade_caixas ?? 0,
        real: sug?.quantidade_caixas ?? 0,
        fator: sug?.fator ?? null,
      };
      onChange([...entries, newEntry]);
      setAddOpen(false);
    },
    [entries, onChange, tipos, sugestao],
  );

  if (entries.length === 0 && sugestao?.sem_conversao && readOnly) {
    return <span className="text-xs text-muted-foreground italic">sem fator</span>;
  }

  if (entries.length === 0 && readOnly) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-0.5 items-start">
        {sugestao?.sem_conversao ? (
          <span className="text-[10px] text-amber-700 leading-tight">Sem fator un/cx</span>
        ) : null}
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus size={12} /> Adicionar caixas
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <div className="text-xs font-semibold mb-2">Tipo de caixa</div>
            {tipos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => addTipo(t.id)}
                className="w-full text-left px-2 py-1 text-sm hover:bg-secondary rounded"
              >
                {t.nome} ({t.sigla})
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry, idx) => (
        <div key={entry.tipo_caixa_id} className="flex items-center gap-2">
          <span
            className="w-8 text-xs font-semibold text-center rounded px-1"
            style={{ background: "rgba(var(--primary-rgb), 0.1)" }}
            title={tipos.find((t) => t.id === entry.tipo_caixa_id)?.nome ?? entry.sigla}
          >
            {entry.sigla}
          </span>
          {readOnly ? (
            <span className="text-sm tabular-nums">
              {entry.real}
              {entry.sugerida > 0 && entry.sugerida !== entry.real && (
                <span className="text-xs text-muted-foreground ml-1">(sug: {entry.sugerida})</span>
              )}
            </span>
          ) : (
            <>
              <NumberStepper value={entry.real} onChange={(v) => updateReal(idx, v)} min={0} />
              {entry.sugerida > 0 && (
                <span
                  className={`text-xs ${
                    entry.real === entry.sugerida
                      ? "text-muted-foreground"
                      : entry.real !== entry.sugerida
                        ? "text-warning"
                        : "text-muted-foreground"
                  }`}
                  title="Quantidade sugerida"
                >
                  sug: {entry.sugerida}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeEntry(idx)}
                className="p-1 text-muted-foreground hover:text-destructive"
                title="Remover"
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
      ))}
      {!readOnly && availableTipos.length > 0 && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              <Plus size={10} /> Mais tipo
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="text-xs font-semibold mb-2">Adicionar tipo</div>
            {availableTipos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => addTipo(t.id)}
                className="w-full text-left px-2 py-1 text-sm hover:bg-secondary rounded"
              >
                {t.nome} ({t.sigla})
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function CaixasItemSummary({ entries }: { entries: CaixaItemEntry[] }) {
  if (entries.length === 0) return null;
  const parts = entries.filter((e) => e.real > 0).map((e) => `${e.real} ${e.sigla}`);
  if (parts.length === 0) return null;
  return (
    <span className="chip chip-info text-xs">
      <Package size={10} className="mr-1" />
      {parts.join(" + ")}
    </span>
  );
}
