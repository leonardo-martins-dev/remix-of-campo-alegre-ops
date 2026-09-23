import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import {
  useGiroFornecedorCaixa,
  useMinimosEstoque,
  useSaveMinimosBatch,
} from "@/hooks/use-minimo-estoque";
import { sugerirMinimoDoGiro } from "@/lib/estoque-minimo";

type Props = {
  fornecedorIds: string[];
  /** Título opcional do bloco */
  title?: string;
};

/**
 * Edição individual (1 id) ou em lote (N ids) do mínimo por tipo de caixa,
 * com sugestão pelo giro recente (NOP-323).
 */
export function EstoqueMinimoEditor({ fornecedorIds, title }: Props) {
  const { isAdmin } = useAuth();
  const ids = useMemo(
    () => [...new Set(fornecedorIds.filter(Boolean))],
    [fornecedorIds],
  );
  const idsKey = ids.slice().sort().join("|");
  const singleId = ids.length === 1 ? ids[0] : undefined;

  const { data: tipos = [] } = useTiposCaixa();
  const { data: minimos = [] } = useMinimosEstoque(singleId);
  // Sempre busca o giro completo e filtra no cliente (individual ou lote).
  const { data: girosAll = [] } = useGiroFornecedorCaixa();
  const saveBatch = useSaveMinimosBatch();

  const periodoDias = girosAll[0]?.periodo_dias ?? 14;

  const giroPorTipo = useMemo(() => {
    const map = new Map<string, number>();
    const idSet = new Set(ids);

    if (singleId) {
      for (const g of girosAll) {
        if (g.fornecedor_id !== singleId) continue;
        map.set(
          g.tipo_caixa,
          g.sugestao_minimo ??
            sugerirMinimoDoGiro(g.total_movimentado, g.periodo_dias),
        );
      }
      return map;
    }

    // Lote: média das sugestões dos selecionados que têm giro no tipo
    const acc = new Map<string, { sum: number; n: number }>();
    for (const g of girosAll) {
      if (!idSet.has(g.fornecedor_id)) continue;
      const sug =
        g.sugestao_minimo ??
        sugerirMinimoDoGiro(g.total_movimentado, g.periodo_dias);
      if (sug <= 0) continue;
      const cur = acc.get(g.tipo_caixa) ?? { sum: 0, n: 0 };
      cur.sum += sug;
      cur.n += 1;
      acc.set(g.tipo_caixa, cur);
    }
    for (const [tipo, { sum, n }] of acc) {
      map.set(tipo, Math.ceil(sum / n));
    }
    return map;
  }, [girosAll, ids, singleId]);

  const minimoAtualPorTipo = useMemo(() => {
    const map = new Map<string, number>();
    if (!singleId) return map;
    for (const m of minimos) {
      if (m.fornecedor_id === singleId) map.set(m.tipo_caixa, m.qtd_minima);
    }
    return map;
  }, [minimos, singleId]);

  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const t of tipos) {
      const atual = minimoAtualPorTipo.get(t.sigla);
      next[t.sigla] = atual != null ? String(atual) : "";
    }
    setValores(next);
  }, [tipos, minimoAtualPorTipo, idsKey]);

  if (!ids.length) return null;

  const setValor = (sigla: string, raw: string) => {
    setValores((prev) => ({ ...prev, [sigla]: raw }));
  };

  const usarGiro = (sigla: string) => {
    const sug = giroPorTipo.get(sigla);
    if (sug == null || sug <= 0) {
      toast.message("Sem giro neste tipo no período");
      return;
    }
    setValor(sigla, String(sug));
  };

  const usarGiroTodos = () => {
    const next = { ...valores };
    let applied = 0;
    for (const t of tipos) {
      const sug = giroPorTipo.get(t.sigla);
      if (sug != null && sug > 0) {
        next[t.sigla] = String(sug);
        applied += 1;
      }
    }
    setValores(next);
    if (!applied) toast.message("Nenhuma sugestão de giro disponível");
    else toast.success(`Sugestão aplicada em ${applied} tipo(s)`);
  };

  /** Em lote: grava a sugestão de giro de cada fornecedor (não a média). */
  const aplicarGiroIndividual = () => {
    if (!isAdmin) {
      toast.error("Só administrador pode alterar estoque mínimo");
      return;
    }
    const idSet = new Set(ids);
    const items: {
      fornecedor_id: string;
      tipo_caixa: string;
      qtd_minima: number;
    }[] = [];
    for (const g of girosAll) {
      if (!idSet.has(g.fornecedor_id)) continue;
      const sug =
        g.sugestao_minimo ??
        sugerirMinimoDoGiro(g.total_movimentado, g.periodo_dias);
      if (sug <= 0) continue;
      items.push({
        fornecedor_id: g.fornecedor_id,
        tipo_caixa: g.tipo_caixa,
        qtd_minima: sug,
      });
    }
    if (!items.length) {
      toast.message("Nenhuma sugestão de giro para os selecionados");
      return;
    }
    saveBatch.mutate(items, {
      onSuccess: () =>
        toast.success(
          `Giro aplicado: ${items.length} mínimo(s) em ${ids.length} fornecedor(es)`,
        ),
      onError: (e) => toast.error(e.message),
    });
  };

  const salvar = () => {
    if (!isAdmin) {
      toast.error("Só administrador pode alterar estoque mínimo");
      return;
    }
    const items: {
      fornecedor_id: string;
      tipo_caixa: string;
      qtd_minima: number;
    }[] = [];
    for (const t of tipos) {
      const raw = (valores[t.sigla] ?? "").trim();
      if (raw === "") continue;
      const qtd = parseInt(raw, 10);
      if (!Number.isFinite(qtd) || qtd < 0) {
        toast.error(`Quantidade inválida para ${t.sigla}`);
        return;
      }
      for (const fid of ids) {
        items.push({ fornecedor_id: fid, tipo_caixa: t.sigla, qtd_minima: qtd });
      }
    }
    if (!items.length) {
      toast.error("Informe ao menos um mínimo");
      return;
    }
    saveBatch.mutate(items, {
      onSuccess: () =>
        toast.success(
          ids.length > 1
            ? `Mínimos salvos para ${ids.length} fornecedores`
            : "Mínimos salvos",
        ),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {title ??
              (ids.length > 1
                ? `Estoque mínimo em lote (${ids.length})`
                : "Estoque mínimo por tipo")}
          </p>
          <p className="text-xs text-muted-foreground">
            Sugestão = média semanal de caixas movimentadas nos últimos{" "}
            {periodoDias} dias
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={usarGiroTodos}
            disabled={!isAdmin}
          >
            Usar giro em todos
          </Button>
          {ids.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={aplicarGiroIndividual}
              disabled={!isAdmin || saveBatch.isPending}
            >
              Aplicar giro de cada um
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={salvar}
            disabled={!isAdmin || saveBatch.isPending}
          >
            {saveBatch.isPending ? "Salvando…" : "Salvar mínimos"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {tipos.map((t) => {
          const sug = giroPorTipo.get(t.sigla);
          return (
            <div
              key={t.id}
              className="grid grid-cols-[1fr_auto_auto] gap-2 items-end sm:grid-cols-[minmax(0,1.2fr)_5rem_5rem_auto]"
            >
              <div className="min-w-0">
                <Label className="text-xs">
                  {t.nome} ({t.sigla})
                </Label>
                <p className="text-[11px] text-muted-foreground truncate">
                  {sug != null && sug > 0
                    ? `Giro sugere ${sug}`
                    : "Sem giro no período"}
                </p>
              </div>
              <div>
                <Label className="text-xs">Mínimo</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-9"
                  value={valores[t.sigla] ?? ""}
                  onChange={(e) => setValor(t.sigla, e.target.value)}
                  disabled={!isAdmin}
                  placeholder="—"
                />
              </div>
              <div className="hidden sm:block">
                <Label className="text-xs">Giro</Label>
                <Input
                  readOnly
                  className="h-9 bg-muted/40"
                  value={sug != null && sug > 0 ? String(sug) : "—"}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9"
                disabled={!isAdmin || sug == null || sug <= 0}
                onClick={() => usarGiro(t.sigla)}
              >
                Usar giro
              </Button>
            </div>
          );
        })}
        {!tipos.length && (
          <p className="text-xs text-muted-foreground">Nenhum tipo de caixa ativo</p>
        )}
      </div>
    </div>
  );
}
