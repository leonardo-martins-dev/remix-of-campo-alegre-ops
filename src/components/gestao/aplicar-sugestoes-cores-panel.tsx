import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Palette, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableWrapper } from "@/components/table-wrapper";
import { useAuth } from "@/lib/auth";
import {
  useAplicarSugestoesCores,
  useDadosSugestaoCores,
  type AdesivoAEnviar,
} from "@/hooks/use-fornecedor-cor";
import {
  FORNECEDOR_CORES,
  PALETA_OPERACIONAL,
  fornecedorCorDef,
  labelFornecedorCor,
} from "@/lib/fornecedor-cores";
import {
  detectarConflitosCor,
  sugerirCoresFornecedores,
  type FornecedorCorInput,
} from "@/lib/sugerir-cores-fornecedores";

/** Resumo dos produtos do fornecedor: "COUVE, ALFACE +2". */
function resumoProdutos(produtoIds: string[], nomes: Map<string, string>): string {
  if (produtoIds.length === 0) return "sem vínculo de produto";
  const labels = produtoIds.map((id) => nomes.get(id) ?? "produto").sort();
  const head = labels.slice(0, 2).join(", ");
  return labels.length > 2 ? `${head} +${labels.length - 2}` : head;
}

/**
 * NOP-463 — sugerir → revisar → confirmar as cores dos fornecedores ativos
 * sem cor. A proposta sai de uma coloração de grafo (mesmo produto ⇒ cores
 * diferentes); o admin pode trocar qualquer linha na mão antes de gravar.
 */
export function AplicarSugestoesCoresPanel() {
  const { isAdmin } = useAuth();
  const { data, isLoading } = useDadosSugestaoCores(isAdmin);
  const aplicar = useAplicarSugestoesCores();
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** trocas manuais do admin: fornecedorId → cor */
  const [override, setOverride] = useState<Record<string, string>>({});
  const [adesivos, setAdesivos] = useState<AdesivoAEnviar[] | null>(null);

  const fornecedores = useMemo(() => data?.fornecedores ?? [], [data]);
  const nomesProduto = useMemo(() => data?.nomesProduto ?? new Map<string, string>(), [data]);

  const sugestoes = useMemo(
    () => sugerirCoresFornecedores(fornecedores, PALETA_OPERACIONAL),
    [fornecedores],
  );

  /** proposta final = sugestão + trocas manuais */
  const proposta = useMemo(
    () => sugestoes.map((s) => ({ ...s, corFinal: override[s.fornecedorId] ?? s.corSugerida })),
    [sugestoes, override],
  );

  /** conflitos da proposta (sugestão + trocas) contra as cores já fixas */
  const conflitos = useMemo(() => {
    const finais = new Map(proposta.map((p) => [p.fornecedorId, p.corFinal]));
    const simulado: FornecedorCorInput[] = fornecedores.map((f) => ({
      ...f,
      cor: finais.get(f.id) ?? f.cor,
    }));
    return detectarConflitosCor(simulado);
  }, [fornecedores, proposta]);

  const idsComConflito = useMemo(() => {
    const s = new Set<string>();
    for (const c of conflitos) {
      s.add(c.fornecedorAId);
      s.add(c.fornecedorBId);
    }
    return s;
  }, [conflitos]);

  if (!isAdmin) return null;
  if (isLoading) return null;
  if (proposta.length === 0 && !adesivos) return null;

  const confirmar = () => {
    aplicar.mutate(
      proposta.map((p) => ({ fornecedor_id: p.fornecedorId, cor: p.corFinal })),
      {
        onSuccess: (r) => {
          toast.success(`Cor gravada em ${r.aplicados} fornecedor(es)`);
          setConfirmOpen(false);
          setOverride({});
          setAdesivos(r.adesivos);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <>
      {proposta.length > 0 && (
        <Card className="mb-4 border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette size={16} /> Sugestões de cor prontas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {proposta.length} fornecedor(es) ativo(s) estão sem cor. A proposta abaixo garante que
              dois fornecedores do mesmo produto nunca fiquem com a mesma cor — quem não tem vínculo
              recebe a cor menos usada. Você pode trocar qualquer linha antes de gravar:{" "}
              <span className="font-medium text-foreground">nada é gravado sem este clique</span>.
            </p>

            {conflitos.length > 0 && (
              <p className="text-sm font-semibold text-danger">
                {conflitos.length} troca(s) manual(is) colidem no mesmo produto — ajuste antes de
                confirmar.
              </p>
            )}

            <TableWrapper stickyFirstColumn>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left py-2 px-2">Fornecedor</th>
                    <th className="text-left py-2 px-2">Cor sugerida</th>
                    <th className="text-left py-2 px-2">Produtos</th>
                  </tr>
                </thead>
                <tbody>
                  {proposta.map((p) => {
                    const def = fornecedorCorDef(p.corFinal);
                    const ruim = idsComConflito.has(p.fornecedorId);
                    return (
                      <tr key={p.fornecedorId} className="border-t">
                        <td className="py-2 px-2 font-medium">{p.fornecedorNome}</td>
                        <td className="py-2 px-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-5 w-5 rounded-full border border-black/25 shrink-0"
                              style={{ backgroundColor: def?.hex ?? "transparent" }}
                              aria-hidden
                            />
                            <select
                              aria-label={`Cor de ${p.fornecedorNome}`}
                              className={`h-9 rounded-md border px-2 text-sm bg-background ${
                                ruim ? "border-danger" : "border-border"
                              }`}
                              value={p.corFinal}
                              disabled={aplicar.isPending}
                              onChange={(e) =>
                                setOverride((prev) => ({
                                  ...prev,
                                  [p.fornecedorId]: e.target.value,
                                }))
                              }
                            >
                              {FORNECEDOR_CORES.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nome}
                                </option>
                              ))}
                            </select>
                          </span>
                          {p.motivo === "sem_vinculo_menos_usada" && (
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              sem vínculo · cor menos usada
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {resumoProdutos(p.produtoIds, nomesProduto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>

            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={aplicar.isPending || conflitos.length > 0}
            >
              Revisar e confirmar ({proposta.length})
            </Button>
          </CardContent>
        </Card>
      )}

      {adesivos && adesivos.length > 0 && (
        <Card className="mb-4 border-success/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Printer size={16} /> Adesivos a enviar ({adesivos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Lista de adesivos a mandar para cada fornecedor com a cor recém-gravada. Fornecedor
              com conflito de cor aberto entra em espera (hold) e não deve receber adesivo daquela
              cor até a pendência ser resolvida.
            </p>
            <ul className="text-sm space-y-1">
              {adesivos.map((a) => {
                const def = fornecedorCorDef(a.cor);
                return (
                  <li
                    key={a.fornecedor_id}
                    className="flex items-center gap-2 border-b border-border py-1.5"
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: def?.hex ?? "transparent" }}
                      aria-hidden
                    />
                    <span className="font-medium">{a.fornecedor_nome}</span>
                    <span className="text-muted-foreground">
                      · {a.cor_nome || labelFornecedorCor(a.cor)}
                    </span>
                    {a.em_espera && (
                      <span className="chip chip-warn shrink-0">Em espera · conflito</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdesivos(null)}>
              Fechar lista
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gravar as cores propostas?</AlertDialogTitle>
            <AlertDialogDescription>
              {proposta.length} fornecedor(es) recebem cor agora. Cada atribuição fica na auditoria
              de cor, igual a uma troca manual, e gera a lista de adesivos a enviar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
              disabled={aplicar.isPending}
            >
              {aplicar.isPending ? "Gravando…" : "Confirmar e gravar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
