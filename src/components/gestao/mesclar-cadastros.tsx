import { useEffect, useMemo, useState } from "react";
import { GitMerge, Scissors, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import {
  detectarCodigoNoNome,
  detectarDuplicados,
  motivoLabel,
  type AliasRow,
  type CadastroRow,
  type TipoCadastro,
} from "@/lib/mesclar-cadastro";
import {
  useAplicarCodigoWise,
  useMesclagens,
  useMesclarCadastro,
  usePreviewMesclagem,
  type ResolucaoConversao,
} from "@/hooks/use-mesclar-cadastro";

const TABELA_LABEL: Record<string, string> = {
  pedidos_recebimento: "Pedidos de recebimento",
  movimentacoes_caixa: "Movimentos de caixa",
  conversoes_fornecedor: "Conversões un/cx",
  quebras: "Laudos de quebra",
  solicitacoes_vale: "Vales",
  saidas_roca: "Saídas na roça",
  profiles: "Usuários vinculados",
  minimo_estoque_fornecedor_caixa: "Mínimos de estoque",
  cargas: "Cargas / ordens",
  retornos_caixa: "Retornos de caixa",
  cobrancas_caixa: "Cobranças de caixa",
  destinatario_cliente_map: "Vínculos de destinatário",
  saidas_expedicao: "Saídas de expedição",
  entregas_expedicao: "Entregas",
  contagens_caixa: "Contagens de inventário",
};

function rotuloTabela(tabela: string): string {
  return TABELA_LABEL[tabela] ?? tabela.replace(/_/g, " ");
}

export function MesclarCadastrosPanel({
  tipo,
  rows,
  aliases,
  selecionados,
  onLimparSelecao,
}: {
  tipo: TipoCadastro;
  rows: CadastroRow[];
  aliases: AliasRow[];
  selecionados: string[];
  onLimparSelecao: () => void;
}) {
  const [idsMesclar, setIdsMesclar] = useState<string[] | null>(null);
  const { data: mesclagens = [] } = useMesclagens(tipo);
  const aplicarCodigo = useAplicarCodigoWise();

  const duplicados = useMemo(() => detectarDuplicados(rows, aliases, tipo), [rows, aliases, tipo]);
  const comCodigo = useMemo(() => detectarCodigoNoNome(rows), [rows]);

  const label = tipo === "fornecedor" ? "fornecedor" : "cliente";

  return (
    <>
      {selecionados.length >= 2 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft p-3">
          <span className="text-sm font-semibold text-primary-dark">
            {selecionados.length} {label}es selecionados
          </span>
          <Button size="sm" onClick={() => setIdsMesclar(selecionados)}>
            <GitMerge size={14} /> Mesclar selecionados
          </Button>
          <Button size="sm" variant="outline" onClick={onLimparSelecao}>
            Limpar seleção
          </Button>
        </div>
      )}

      {duplicados.length > 0 && (
        <Card className="mb-4 border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-sm text-warning">
              {duplicados.length} possível(is) duplicado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {duplicados.map((g) => (
              <div
                key={g.chave}
                className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm last:border-0"
              >
                <span className="chip chip-muted shrink-0">{motivoLabel(g.motivo)}</span>
                <span className="min-w-0 flex-1">{g.itens.map((i) => i.nome).join("  ·  ")}</span>
                <Button size="sm" variant="outline" onClick={() => setIdsMesclar(g.ids)}>
                  <GitMerge size={14} /> Mesclar {g.itens.length}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {comCodigo.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{comCodigo.length} nome(s) com código grudado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {comCodigo.map(({ row, codigo, nomeLimpo }) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground line-through">{row.nome}</span>{" "}
                  <span className="mx-1">→</span>
                  <span className="chip chip-info">{codigo}</span> <strong>{nomeLimpo}</strong>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aplicarCodigo.isPending}
                  onClick={() =>
                    aplicarCodigo.mutate(
                      { tipo, id: row.id, codigo, nome: nomeLimpo },
                      {
                        onSuccess: () => toast.success("Código Wise separado do nome"),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  <Scissors size={14} /> Separar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mesclagens.length > 0 && (
        <details className="mb-4 rounded-lg border border-border p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-navy flex items-center gap-2">
            <ShieldCheck size={14} /> Mesclagens registradas ({mesclagens.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {mesclagens.map((m) => {
              const autor = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              const sobrevivente = rows.find((r) => r.id === m.sobrevivente_id);
              return (
                <li key={m.id}>
                  {formatDateBRT(m.created_at)} às {formatTime(m.created_at)} ·{" "}
                  {m.mesclados_ids.length} cadastro(s) →{" "}
                  <strong className="text-navy">{sobrevivente?.nome ?? m.sobrevivente_id}</strong>
                  {autor?.nome ? ` · por ${autor.nome}` : ""}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <MesclarDialog
        tipo={tipo}
        ids={idsMesclar}
        rows={rows}
        onClose={(mesclou) => {
          setIdsMesclar(null);
          if (mesclou) onLimparSelecao();
        }}
      />
    </>
  );
}

function MesclarDialog({
  tipo,
  ids,
  rows,
  onClose,
}: {
  tipo: TipoCadastro;
  ids: string[] | null;
  rows: CadastroRow[];
  onClose: (mesclou: boolean) => void;
}) {
  const [sobrevivente, setSobrevivente] = useState<string | null>(null);
  const [fatores, setFatores] = useState<Record<string, number>>({});
  const { data: preview, isLoading } = usePreviewMesclagem(tipo, ids ?? []);
  const mesclar = useMesclarCadastro();

  useEffect(() => {
    if (!ids?.length) {
      setSobrevivente(null);
      setFatores({});
      return;
    }
    // padrão: o cadastro com nome mais completo costuma ser o bom
    const candidatos = ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is CadastroRow => !!r);
    const melhor = [...candidatos].sort((a, b) => b.nome.length - a.nome.length)[0];
    setSobrevivente(melhor?.id ?? ids[0]);
    setFatores({});
  }, [ids, rows]);

  const conflitos = preview?.conflitos_conversao ?? [];
  const conflitosPendentes = conflitos.filter(
    (c) => !fatores[`${c.produto_id}:${c.tipo_caixa_id}`],
  );

  const confirmar = async () => {
    if (!ids || !sobrevivente) return;
    if (conflitosPendentes.length > 0) {
      toast.error("Escolha o fator de cada conversão em conflito");
      return;
    }
    const resolucao: ResolucaoConversao[] = conflitos.map((c) => ({
      produto_id: c.produto_id,
      tipo_caixa_id: c.tipo_caixa_id,
      fator: fatores[`${c.produto_id}:${c.tipo_caixa_id}`],
    }));
    try {
      const res = await mesclar.mutateAsync({
        tipo,
        sobrevivente_id: sobrevivente,
        mesclados_ids: ids.filter((id) => id !== sobrevivente),
        resolucao_conversoes: resolucao,
      });
      toast.success(`${res.mesclados} cadastro(s) mesclado(s)`, {
        description: "Histórico reapontado. Os antigos ficaram inativos.",
      });
      onClose(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mesclar");
    }
  };

  return (
    <Dialog open={!!ids?.length} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mesclar cadastros</DialogTitle>
          <DialogDescription>
            Escolha qual cadastro fica. Todo o histórico dos outros passa para ele e eles ficam
            inativos como “mesclado em”. Nada é apagado.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando prévia…</p>}

        {preview && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cadastro que fica</Label>
              {preview.cadastros.map((c) => (
                <label
                  key={c.id}
                  className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    className="mt-1"
                    name="sobrevivente"
                    checked={sobrevivente === c.id}
                    onChange={() => setSobrevivente(c.id)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy">{c.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        c.codigo_wise ? `Cód. ${c.codigo_wise}` : null,
                        c.cnpj,
                        c.ativo ? null : "inativo",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Passa para o sobrevivente</Label>
              <ul className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                {preview.relacionados.map((r) => (
                  <li
                    key={`${r.tabela}.${r.coluna}`}
                    className="flex items-center justify-between rounded bg-secondary/40 px-2 py-1"
                  >
                    <span className="truncate">{rotuloTabela(r.tabela)}</span>
                    <strong className="tabular-nums">{r.linhas}</strong>
                  </li>
                ))}
                <li className="flex items-center justify-between rounded bg-secondary/40 px-2 py-1">
                  <span>Movimentos de caixa (posições)</span>
                  <strong className="tabular-nums">{preview.movimentos_caixa}</strong>
                </li>
                <li className="flex items-center justify-between rounded bg-secondary/40 px-2 py-1">
                  <span>Nomes Wise (aliases)</span>
                  <strong className="tabular-nums">{preview.aliases.length}</strong>
                </li>
              </ul>
              {Object.keys(preview.saldo_caixas).length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Saldo de caixas somado:{" "}
                  {Object.entries(preview.saldo_caixas)
                    .map(([sigla, qtd]) => `${sigla} ${qtd}`)
                    .join(" · ")}
                </p>
              )}
            </div>

            {conflitos.length > 0 && (
              <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <Label className="text-warning">
                  {conflitos.length} conversão(ões) com fator diferente — escolha qual fica
                </Label>
                {conflitos.map((c) => {
                  const chave = `${c.produto_id}:${c.tipo_caixa_id}`;
                  const opcoes = [...new Set(c.opcoes.map((o) => o.fator))];
                  return (
                    <div key={chave} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {c.produto} · {c.tipo_caixa}
                      </span>
                      {opcoes.map((fator) => (
                        <button
                          key={fator}
                          type="button"
                          onClick={() => setFatores((p) => ({ ...p, [chave]: fator }))}
                          className={`min-h-9 px-3 rounded-md border text-xs font-semibold ${
                            fatores[chave] === fator
                              ? "bg-primary text-primary-foreground border-transparent"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {fator} un/cx
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={mesclar.isPending || !sobrevivente || isLoading}>
            {mesclar.isPending ? "Mesclando…" : "Confirmar mesclagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
