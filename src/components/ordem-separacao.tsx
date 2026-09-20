import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Check, Package, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { NumberStepper } from "@/components/number-stepper";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import {
  distribuirEmCaixas,
  useCaixasOrdem,
  useConfirmarSeparacao,
  useItensOrdem,
  useOrdemExpedicao,
  useSalvarTotaisWise,
  STATUS_ORDEM_LABEL,
  type ItemOrdem,
  type StatusOrdem,
} from "@/hooks/use-ordem-expedicao";

type CaixaLocal = {
  key: string;
  numero: number;
  tipo_caixa_id: string | null;
  tipo_caixa_sigla: string;
  /** romaneio_item_id → quantidade */
  itens: Record<string, number>;
};

function novaKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Math.random());
}

/** Etiqueta simples por caixa, em janela de impressão. */
function imprimirEtiquetas(
  ordem: {
    numero_ordem: string;
    cliente_nome: string;
    cliente_cnpj: string | null;
    data_carga: string;
  },
  caixas: CaixaLocal[],
  itensById: Map<string, ItemOrdem>,
) {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) {
    toast.error("Libere pop-ups para imprimir as etiquetas");
    return;
  }
  const total = caixas.length;
  const blocos = caixas
    .map((cx) => {
      const linhas = Object.entries(cx.itens)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => {
          const it = itensById.get(id);
          return `<li>${q} ${it?.unidade ?? "un"} · ${it?.produto ?? "Produto"}</li>`;
        })
        .join("");
      return `
        <section class="etiqueta">
          <div class="codigo">${ordem.numero_ordem} · ${cx.numero}/${total}</div>
          <div class="loja">${ordem.cliente_nome}</div>
          <div class="meta">${ordem.cliente_cnpj ?? ""} · ${formatDateBRT(ordem.data_carga)} · caixa ${cx.tipo_caixa_sigla || "—"}</div>
          <ul>${linhas || "<li>Caixa vazia</li>"}</ul>
        </section>`;
    })
    .join("");

  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
    <title>Etiquetas ${ordem.numero_ordem}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 12px; }
      .etiqueta { border: 2px solid #111; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; page-break-inside: avoid; }
      .codigo { font-size: 30px; font-weight: 800; letter-spacing: 1px; }
      .loja { font-size: 18px; font-weight: 700; margin-top: 2px; }
      .meta { font-size: 12px; color: #444; margin-bottom: 6px; }
      ul { margin: 0; padding-left: 18px; font-size: 14px; }
      @media print { .etiqueta { margin-bottom: 8px; } }
    </style></head><body>${blocos}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function OrdemSeparacao({ cargaId, onVoltar }: { cargaId: string; onVoltar?: () => void }) {
  const { data: ordem, isLoading: loadingOrdem } = useOrdemExpedicao(cargaId);
  const { data: itensData, isLoading: loadingItens } = useItensOrdem(cargaId);
  const { data: caixasSalvas } = useCaixasOrdem(cargaId);
  const { data: tipos = [] } = useTiposCaixa();
  const confirmar = useConfirmarSeparacao();
  const salvarTotais = useSalvarTotaisWise();

  const [caixas, setCaixas] = useState<CaixaLocal[]>([]);
  const [addAberto, setAddAberto] = useState<string | null>(null);
  const [caixasWise, setCaixasWise] = useState("");
  const initRef = useRef<string | null>(null);

  const itens = useMemo(() => itensData?.itens ?? [], [itensData]);
  const familias = itensData?.familias ?? [];
  const itensById = useMemo(() => new Map(itens.map((i) => [i.romaneio_item_id, i])), [itens]);

  const bloqueada =
    !!ordem && ordem.status_ordem !== "importada" && ordem.status_ordem !== "separada";

  /* Hidrata: caixas já separadas ou sugestão a partir da qtde do Wise. */
  useEffect(() => {
    if (!ordem || !itens.length || caixasSalvas === undefined) return;
    if (initRef.current === cargaId) return;
    initRef.current = cargaId;
    setCaixasWise(ordem.qtde_caixas_wise != null ? String(ordem.qtde_caixas_wise) : "");

    const siglaPadrao = tipos[0]?.sigla ?? "";
    const idPadrao = tipos[0]?.id ?? null;

    if (caixasSalvas.length > 0) {
      setCaixas(
        caixasSalvas.map((cx) => ({
          key: cx.id,
          numero: cx.numero,
          tipo_caixa_id: cx.tipo_caixa_id,
          tipo_caixa_sigla: cx.tipo_caixa_sigla ?? siglaPadrao,
          itens: Object.fromEntries(
            (cx.itens_caixa_ordem ?? [])
              .filter((i) => i.romaneio_item_id)
              .map((i) => [i.romaneio_item_id as string, Number(i.quantidade)]),
          ),
        })),
      );
      return;
    }

    const n = Number(ordem.qtde_caixas_wise) > 0 ? Number(ordem.qtde_caixas_wise) : 1;
    const sugestao = distribuirEmCaixas(itens, n);
    setCaixas(
      sugestao.map((cx, i) => ({
        key: novaKey(),
        numero: i + 1,
        tipo_caixa_id: idPadrao,
        tipo_caixa_sigla: siglaPadrao,
        itens: Object.fromEntries(
          cx.itens.map((it) => [it.romaneio_item_id, it.quantidade] as const),
        ),
      })),
    );
  }, [ordem, itens, caixasSalvas, tipos, cargaId]);

  const alocadoPorItem = useMemo(() => {
    const out: Record<string, number> = {};
    for (const cx of caixas) {
      for (const [id, q] of Object.entries(cx.itens)) {
        out[id] = (out[id] ?? 0) + (q || 0);
      }
    }
    return out;
  }, [caixas]);

  const totalAlocado = Object.values(alocadoPorItem).reduce((a, n) => a + n, 0);
  const totalPedido = itensData?.totalItens ?? 0;
  const pendentes = itens.filter(
    (i) => Math.abs((alocadoPorItem[i.romaneio_item_id] ?? 0) - i.quantidade) > 0.001,
  );

  const setQtd = (caixaKey: string, itemId: string, qtd: number) => {
    setCaixas((prev) =>
      prev.map((cx) =>
        cx.key === caixaKey ? { ...cx, itens: { ...cx.itens, [itemId]: Math.max(0, qtd) } } : cx,
      ),
    );
  };

  const removerItem = (caixaKey: string, itemId: string) => {
    setCaixas((prev) =>
      prev.map((cx) => {
        if (cx.key !== caixaKey) return cx;
        const next = { ...cx.itens };
        delete next[itemId];
        return { ...cx, itens: next };
      }),
    );
  };

  const adicionarItem = (caixaKey: string, item: ItemOrdem) => {
    const restante = Math.max(0, item.quantidade - (alocadoPorItem[item.romaneio_item_id] ?? 0));
    setCaixas((prev) =>
      prev.map((cx) =>
        cx.key === caixaKey
          ? {
              ...cx,
              itens: {
                ...cx.itens,
                [item.romaneio_item_id]:
                  (cx.itens[item.romaneio_item_id] ?? 0) + (restante > 0 ? restante : 1),
              },
            }
          : cx,
      ),
    );
    setAddAberto(null);
  };

  const renumerar = (lista: CaixaLocal[]) => lista.map((cx, i) => ({ ...cx, numero: i + 1 }));

  const adicionarCaixa = () => {
    setCaixas((prev) =>
      renumerar([
        ...prev,
        {
          key: novaKey(),
          numero: prev.length + 1,
          tipo_caixa_id: tipos[0]?.id ?? null,
          tipo_caixa_sigla: tipos[0]?.sigla ?? "",
          itens: {},
        },
      ]),
    );
  };

  const removerCaixa = (key: string) => {
    setCaixas((prev) => renumerar(prev.filter((cx) => cx.key !== key)));
  };

  const trocarTipo = (key: string, sigla: string) => {
    const tipo = tipos.find((t) => t.sigla === sigla);
    setCaixas((prev) =>
      prev.map((cx) =>
        cx.key === key ? { ...cx, tipo_caixa_sigla: sigla, tipo_caixa_id: tipo?.id ?? null } : cx,
      ),
    );
  };

  const confirmarSeparacao = async () => {
    if (!caixas.length) {
      toast.error("Monte ao menos uma caixa");
      return;
    }
    if (totalAlocado <= 0) {
      toast.error("Nenhum item nas caixas");
      return;
    }
    try {
      const res = await confirmar.mutateAsync({
        carga_id: cargaId,
        caixas: caixas.map((cx) => ({
          numero: cx.numero,
          tipo_caixa_id: cx.tipo_caixa_id,
          tipo_caixa_sigla: cx.tipo_caixa_sigla || null,
          itens: Object.entries(cx.itens)
            .filter(([, q]) => q > 0)
            .map(([id, q]) => ({
              romaneio_item_id: id,
              produto_id: itensById.get(id)?.produto_id ?? null,
              quantidade: q,
            })),
        })),
      });
      initRef.current = null;
      toast.success(`Separação confirmada · ${res.total_caixas} caixa(s)`, {
        description: "Ordem pronta para a saída.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar separação");
    }
  };

  if (loadingOrdem || loadingItens) {
    return <p className="text-sm text-muted-foreground p-4">Carregando ordem…</p>;
  }

  if (!ordem) {
    return <p className="text-sm text-muted-foreground p-4">Ordem não encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho da ordem — espelha o papel */}
      <div className="card-base p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Ordem de Separação
            </div>
            <div className="text-2xl font-bold text-navy tabular-nums">{ordem.numero_ordem}</div>
            <div className="text-sm font-semibold text-ink mt-0.5">{ordem.cliente_nome}</div>
            <div className="text-xs text-muted-foreground">
              {ordem.cliente_cnpj ? `CNPJ ${ordem.cliente_cnpj} · ` : ""}
              {formatDateBRT(ordem.data_carga)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`chip ${
                ordem.status_ordem === "importada"
                  ? "chip-muted"
                  : ordem.status_ordem === "separada"
                    ? "chip-warn"
                    : ordem.status_ordem === "em_transito"
                      ? "chip-info"
                      : ordem.status_ordem === "entregue"
                        ? "chip-ok"
                        : "chip-danger"
              }`}
            >
              {STATUS_ORDEM_LABEL[ordem.status_ordem as StatusOrdem] ?? ordem.status_ordem}
            </span>
            {onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                className="text-xs text-muted-foreground hover:text-navy"
              >
                Fechar ordem
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="p-2 rounded-lg bg-secondary/50 text-center">
            <div className="text-xs text-muted-foreground">Qtde total itens</div>
            <div className="font-bold text-navy tabular-nums">
              {ordem.qtde_itens_wise != null ? Number(ordem.qtde_itens_wise) : totalPedido}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50 text-center">
            <div className="text-xs text-muted-foreground">Qtde caixas (Wise)</div>
            <div className="font-bold text-navy tabular-nums">{ordem.qtde_caixas_wise ?? "—"}</div>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50 text-center">
            <div className="text-xs text-muted-foreground">Caixas montadas</div>
            <div className="font-bold text-navy tabular-nums">{caixas.length}</div>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50 text-center">
            <div className="text-xs text-muted-foreground">Itens nas caixas</div>
            <div
              className="font-bold tabular-nums"
              style={{ color: totalAlocado === totalPedido ? "var(--success)" : "var(--warning)" }}
            >
              {totalAlocado}/{totalPedido}
            </div>
          </div>
        </div>

        {(ordem.separado_por_nome || ordem.conferido_por_nome) && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {ordem.separado_por_nome && (
              <span>
                Separado por <strong className="text-navy">{ordem.separado_por_nome}</strong>
                {ordem.separado_em ? ` · ${formatTime(ordem.separado_em)}` : ""}
              </span>
            )}
            {ordem.conferido_por_nome && (
              <span>
                Conferido por <strong className="text-navy">{ordem.conferido_por_nome}</strong>
                {ordem.conferido_em ? ` · ${formatTime(ordem.conferido_em)}` : ""}
              </span>
            )}
          </div>
        )}

        {!bloqueada && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Qtde caixas do Wise</div>
              <Input
                className="h-10 w-28"
                inputMode="numeric"
                value={caixasWise}
                onChange={(e) => setCaixasWise(e.target.value.replace(/\D/g, ""))}
                placeholder="4"
              />
            </div>
            <Button
              variant="outline"
              className="min-h-10"
              disabled={salvarTotais.isPending}
              onClick={async () => {
                try {
                  await salvarTotais.mutateAsync({
                    carga_id: cargaId,
                    qtde_caixas_wise: caixasWise ? Number(caixasWise) : null,
                    qtde_itens_wise: ordem.qtde_itens_wise ?? totalPedido,
                  });
                  toast.success("Totais do Wise salvos");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao salvar");
                }
              }}
            >
              Salvar totais
            </Button>
          </div>
        )}
      </div>

      {/* Itens por família — visão do papel */}
      <div className="card-base p-4">
        <h3 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2">
          <Package size={14} /> Itens por família
        </h3>
        <div className="space-y-4">
          {familias.map((f) => (
            <div key={f.familia}>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1 mb-2">
                <span>{f.familia}</span>
                <span>{f.total} itens</span>
              </div>
              <div className="space-y-1">
                {f.itens.map((it) => {
                  const alocado = alocadoPorItem[it.romaneio_item_id] ?? 0;
                  const ok = Math.abs(alocado - it.quantidade) < 0.001;
                  return (
                    <div
                      key={it.romaneio_item_id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <strong className="tabular-nums">{it.quantidade}</strong>{" "}
                        <span className="text-muted-foreground text-xs">{it.unidade}</span>{" "}
                        {it.produto}
                      </span>
                      <span
                        className={`chip shrink-0 ${ok ? "chip-ok" : alocado > 0 ? "chip-warn" : "chip-muted"}`}
                      >
                        {alocado}/{it.quantidade} em caixa
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {familias.length === 0 && (
            <p className="text-sm text-muted-foreground">Ordem sem itens no romaneio.</p>
          )}
        </div>
      </div>

      {/* Caixas */}
      <div className="card-base p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
            <Boxes size={14} /> Caixas da ordem
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-10"
              onClick={() =>
                imprimirEtiquetas(
                  {
                    numero_ordem: ordem.numero_ordem,
                    cliente_nome: ordem.cliente_nome,
                    cliente_cnpj: ordem.cliente_cnpj,
                    data_carga: ordem.data_carga,
                  },
                  caixas,
                  itensById,
                )
              }
            >
              <Printer size={14} /> Etiquetas
            </Button>
            {!bloqueada && (
              <Button variant="outline" className="min-h-10" onClick={adicionarCaixa}>
                <Plus size={14} /> Caixa
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {caixas.map((cx) => {
            const linhas = Object.entries(cx.itens).filter(([, q]) => q > 0);
            const totalCaixa = linhas.reduce((a, [, q]) => a + q, 0);
            const disponiveis = itens.filter(
              (i) => !(i.romaneio_item_id in cx.itens) || cx.itens[i.romaneio_item_id] === 0,
            );
            return (
              <div key={cx.key} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-navy tabular-nums">
                    {ordem.numero_ordem} · {cx.numero}/{caixas.length}
                  </span>
                  <div className="flex items-center gap-2">
                    {bloqueada ? (
                      <span className="chip chip-muted">{cx.tipo_caixa_sigla || "—"}</span>
                    ) : (
                      <div className="w-32">
                        <SeletorCadastro
                          tipo="tipo_caixa"
                          value={tipos.find((t) => t.sigla === cx.tipo_caixa_sigla)?.id ?? null}
                          onChange={(_id, item) => trocarTipo(cx.key, item?.meta?.sigla ?? "")}
                          placeholder="Tipo…"
                        />
                      </div>
                    )}
                    {!bloqueada && (
                      <button
                        type="button"
                        aria-label="Remover caixa"
                        onClick={() => removerCaixa(cx.key)}
                        className="h-9 w-9 rounded-md border border-border text-muted-foreground hover:text-destructive flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {linhas.map(([id, q]) => {
                    const it = itensById.get(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 p-2"
                      >
                        <span className="min-w-0 flex-1 text-sm truncate">
                          {it?.produto ?? "Produto"}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            · {it?.unidade ?? "un"}
                          </span>
                        </span>
                        {bloqueada ? (
                          <span className="font-bold tabular-nums">{q}</span>
                        ) : (
                          <>
                            <NumberStepper
                              value={q}
                              onChange={(v) => setQtd(cx.key, id, v)}
                              inputMode="numeric"
                              size="sm"
                            />
                            <button
                              type="button"
                              aria-label="Tirar da caixa"
                              onClick={() => removerItem(cx.key, id)}
                              className="h-9 w-9 rounded-md text-muted-foreground hover:text-destructive flex items-center justify-center"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {linhas.length === 0 && (
                    <p className="text-xs text-muted-foreground">Caixa vazia.</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground">{totalCaixa} itens</span>
                  {!bloqueada && disponiveis.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddAberto(addAberto === cx.key ? null : cx.key)}
                      className="text-xs font-semibold text-primary-dark hover:underline"
                    >
                      + produto
                    </button>
                  )}
                </div>

                {addAberto === cx.key && (
                  <div className="rounded-lg border border-border max-h-48 overflow-y-auto">
                    {disponiveis.map((it) => (
                      <button
                        key={it.romaneio_item_id}
                        type="button"
                        onClick={() => adicionarItem(cx.key, it)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 border-b border-border last:border-0"
                      >
                        {it.produto}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · falta{" "}
                          {Math.max(0, it.quantidade - (alocadoPorItem[it.romaneio_item_id] ?? 0))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {caixas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma caixa montada. Toque em “Caixa” para começar.
            </p>
          )}
        </div>

        {!bloqueada && (
          <div className="mt-4 space-y-2">
            {pendentes.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 text-amber-700 text-xs p-3">
                {pendentes.length} produto(s) com quantidade diferente do pedido. A separação é
                registrada assim mesmo e a diferença fica como divergência.
              </div>
            )}
            <Button
              className="w-full min-h-12"
              disabled={confirmar.isPending || caixas.length === 0}
              onClick={confirmarSeparacao}
            >
              <Check size={16} /> Confirmar separação · {caixas.length} caixa(s)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
