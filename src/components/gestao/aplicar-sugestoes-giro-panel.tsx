import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { useAuth } from "@/lib/auth";
import {
  useGiroFornecedorCaixa,
  useMinimosEstoque,
  useSaveMinimosBatch,
} from "@/hooks/use-minimo-estoque";
import { buildItensAplicarSugestaoGiro } from "@/lib/estoque-minimo";

/**
 * NOP-323 QA: painel para o admin aceitar em lote as sugestões de giro
 * quando o mínimo gravado ainda é o seed uniforme (ex.: 25).
 */
export function AplicarSugestoesGiroPanel() {
  const { isAdmin } = useAuth();
  const { data: giros = [], isLoading: lGiro } = useGiroFornecedorCaixa();
  const { data: minimos = [], isLoading: lMin } = useMinimosEstoque();
  const saveBatch = useSaveMinimosBatch();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pendentes = useMemo(
    () => buildItensAplicarSugestaoGiro(giros, minimos),
    [giros, minimos],
  );

  if (!isAdmin) return null;
  if (lGiro || lMin) return null;
  if (pendentes.length === 0) return null;

  const fornUnicos = new Set(pendentes.map((p) => p.fornecedor_id)).size;
  const amostra = pendentes.slice(0, 5);

  const aplicar = () => {
    saveBatch.mutate(
      pendentes.map(({ fornecedor_id, tipo_caixa, qtd_minima }) => ({
        fornecedor_id,
        tipo_caixa,
        qtd_minima,
      })),
      {
        onSuccess: () => {
          toast.success(
            `Sugestões do giro aplicadas em ${pendentes.length} mínimo(s)`,
          );
          setConfirmOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <>
      <Card className="mb-4 border-primary/40 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Sugestões de giro prontas para aplicar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {pendentes.length} mínimo(s) em {fornUnicos} fornecedor(es) estão
            diferentes da sugestão pelo giro recente. Aceitar atualiza{" "}
            <span className="font-medium text-foreground">qtd_minima</span> e
            recalcula os alertas abaixo do mínimo — nada é gravado sem este
            clique.
          </p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {amostra.map((p) => (
              <li key={`${p.fornecedor_id}:${p.tipo_caixa}`}>
                tipo {p.tipo_caixa}: {p.qtd_atual ?? "—"} →{" "}
                <span className="font-semibold text-foreground">
                  {p.qtd_minima}
                </span>
              </li>
            ))}
            {pendentes.length > amostra.length && (
              <li>… e mais {pendentes.length - amostra.length}</li>
            )}
          </ul>
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={saveBatch.isPending}
          >
            Aplicar sugestões do giro ({pendentes.length})
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar sugestões do giro?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão atualizados {pendentes.length} registro(s) de estoque mínimo
              (fornecedor × tipo) com o valor de{" "}
              <strong>sugestao_minimo</strong> do giro. Os alertas
              &quot;abaixo do mínimo&quot; serão recalculados em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveBatch.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                aplicar();
              }}
              disabled={saveBatch.isPending}
            >
              {saveBatch.isPending ? "Aplicando…" : "Confirmar e aplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
