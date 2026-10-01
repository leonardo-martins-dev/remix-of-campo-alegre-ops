/**
 * NOP-467 — Consulta reversa: "esta carga é de quem?"
 * Cor = etiqueta da viagem; (produto+cor) → 1 fornecedor; cor só → lista.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FornecedorCorBadge } from "@/components/fornecedor-cor-badge";
import { useConsultaCorCarga } from "@/hooks/use-consulta-cor-carga";
import {
  coresLivresDeAtribuidas,
  listaPorCor,
  lookupCorProduto,
  secoesFolhaPorProduto,
} from "@/lib/consulta-cor-carga";
import { FORNECEDOR_CORES, type FornecedorCorId } from "@/lib/fornecedor-cores";
import { imprimirFolhaCoresParede } from "@/lib/imprimir-folha-cores";

export const Route = createFileRoute("/caixas/cores")({
  component: Page,
  head: () => ({ meta: [{ title: "Cores da carga · Campo Alegre" }] }),
});

function Page() {
  const { data, isLoading, isError, error } = useConsultaCorCarga();
  const [corFiltro, setCorFiltro] = useState<FornecedorCorId | null>(null);
  const [produtoId, setProdutoId] = useState<string>("");

  const vinculos = data?.vinculos ?? [];
  const coresAtribuidas = data?.coresAtribuidas ?? [];

  const livres = useMemo(
    () => coresLivresDeAtribuidas(coresAtribuidas),
    [coresAtribuidas],
  );

  const produtosDaCor = useMemo(() => {
    if (!corFiltro) return [];
    return listaPorCor(vinculos, corFiltro);
  }, [vinculos, corFiltro]);

  const produtosOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vinculos) {
      if (corFiltro && v.cor !== corFiltro) continue;
      map.set(v.produtoId, v.produtoNome);
    }
    return [...map.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [vinculos, corFiltro]);

  const resultadoUnico = useMemo(() => {
    if (!corFiltro || !produtoId) return null;
    return lookupCorProduto(vinculos, corFiltro, produtoId);
  }, [vinculos, corFiltro, produtoId]);

  const secoes = useMemo(() => secoesFolhaPorProduto(vinculos), [vinculos]);

  function handleImprimir() {
    const r = imprimirFolhaCoresParede(secoes);
    if (!r.ok) toast.error(r.erro);
  }

  return (
    <div>
      <PageHeader
        title="Cores da carga"
        subtitle="De quem é esta carga? A cor identifica a viagem (produto + adesivo), não a caixa vazia."
        actions={
          <Button type="button" variant="outline" className="gap-1.5" onClick={handleImprimir}>
            <Printer size={16} /> Imprimir folha da parede
          </Button>
        }
      />

      <div className="card-base p-3 md:p-4 mb-4 text-sm text-muted-foreground">
        <p>
          Toque numa cor para ver a <strong className="text-navy">lista por produto</strong>. Com
          produto + cor, o sistema devolve <strong className="text-navy">um</strong> fornecedor.
          Cores sem fornecedor ativo aparecem como <strong className="text-navy">livres</strong>.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground mb-4">Carregando cores…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive mb-4">
          Não foi possível carregar: {(error as Error)?.message ?? "erro"}
        </p>
      )}

      {/* Paleta — filtro por cor */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-navy mb-2">1 · Escolha a cor do adesivo</h2>
        <div className="flex flex-wrap gap-2">
          {FORNECEDOR_CORES.map((c) => {
            const livre = livres.some((l) => l.id === c.id);
            const selected = corFiltro === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCorFiltro(selected ? null : c.id);
                  setProdutoId("");
                }}
                className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border-2 text-sm font-semibold transition-shadow ${
                  selected
                    ? "border-navy shadow-md ring-2 ring-navy/30"
                    : "border-black/15 hover:border-navy/40"
                } ${livre ? "opacity-70" : ""}`}
                style={{ backgroundColor: c.hex, color: c.onHex }}
                aria-pressed={selected}
                title={livre ? `${c.nome} · livre` : c.nome}
              >
                <span
                  className="h-4 w-4 rounded-full border border-black/25 shrink-0"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
                {c.nome}
                {livre && (
                  <span className="text-[10px] uppercase tracking-wide opacity-90 font-bold">
                    livre
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {livres.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Livres (sem fornecedor ativo): {livres.map((l) => l.nome).join(", ")}
          </p>
        )}
      </section>

      {/* Resultado: cor só = lista; cor+produto = um */}
      {corFiltro && (
        <section className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-navy mb-1 flex items-center gap-2">
                <Search size={14} /> 2 · Lista por produto
                <FornecedorCorBadge cor={corFiltro} />
              </h2>
              <p className="text-xs text-muted-foreground">
                Cor sozinha nunca devolve um nome só — escolha o produto que está na caixa para
                fechar o fornecedor.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <label className="text-xs font-semibold text-navy block mb-1" htmlFor="produto-cor">
                Produto (opcional)
              </label>
              <select
                id="produto-cor"
                className="w-full min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
              >
                <option value="">— ver lista completa —</option>
                {produtosOpcoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {resultadoUnico ? (
            <div className="card-base p-4 border-2 border-navy/30 bg-primary/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Carga · um fornecedor
              </p>
              <p className="text-xl font-bold text-navy">{resultadoUnico.fornecedorNome}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {resultadoUnico.produtoNome}
                {resultadoUnico.fornecedorCodigo
                  ? ` · cód. ${resultadoUnico.fornecedorCodigo}`
                  : ""}
              </p>
            </div>
          ) : produtosDaCor.length === 0 ? (
            <div className="card-base p-4 text-sm text-muted-foreground">
              Nenhum produto vinculado a esta cor. Ela está{" "}
              <strong className="text-navy">livre</strong> ou o fornecedor ainda não tem conversão
              ativa.
            </div>
          ) : (
            <ul className="space-y-2">
              <li className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                Lista · {produtosDaCor.length} produto{produtosDaCor.length === 1 ? "" : "s"}
              </li>
              {produtosDaCor.map((item) => (
                <li key={item.produtoId}>
                  <button
                    type="button"
                    className="w-full text-left card-base p-3 md:p-4 hover:border-navy/40 transition-colors"
                    onClick={() => setProdutoId(item.produtoId)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="font-semibold text-navy">{item.produtoNome}</span>
                      <span className="text-sm font-bold">{item.fornecedorNome}</span>
                    </div>
                    {item.alertaIrmao && (
                      <p className="text-xs font-semibold text-amber-800 bg-amber-100 rounded-md px-2 py-1 mt-2 inline-block">
                        Não confundir com: {item.irmaosNomes.join(" · ")}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!corFiltro && !isLoading && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-navy mb-2">Prévia da folha (por produto)</h2>
          <p className="text-xs text-muted-foreground mb-3">
            A folha da parede é organizada por produto — não por cor. Use o botão Imprimir para
            gerar a versão legível a ~2 m, com data no rodapé.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {secoes.slice(0, 12).map((s) => (
              <div
                key={s.produtoId}
                className={`card-base p-3 ${s.alertaIrmao ? "border-amber-500 border-2 bg-amber-50/50" : ""}`}
              >
                <p className="text-sm font-bold text-navy leading-tight mb-2">{s.produtoNome}</p>
                {s.alertaIrmao && (
                  <p className="text-[11px] font-semibold text-amber-900 mb-2">
                    ⚠ Irmão: {s.irmaosNomes.join(" · ")}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {s.cores.map((c) => (
                    <li key={`${s.produtoId}-${c.cor}-${c.fornecedorId}`} className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/20 shrink-0"
                        style={{ backgroundColor: c.hex }}
                        aria-hidden
                      />
                      <span className="text-xs font-semibold text-muted-foreground w-16 shrink-0">
                        {c.corNome}
                      </span>
                      <span className="text-xs font-semibold text-navy truncate">
                        {c.fornecedorNome}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {secoes.length > 12 && (
            <p className="text-xs text-muted-foreground mt-2">
              +{secoes.length - 12} produtos na folha completa (imprimir).
            </p>
          )}
          {secoes.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">
              Ainda não há fornecedores ativos com cor e produtos vinculados.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
