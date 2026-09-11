import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useDesfazerImportacao, useImportacoes, useLimparPendenciasLote } from "@/hooks/use-wise-pedidos";
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import { one } from "@/lib/embed";

type Lote = {
  id: string;
  arquivo: string;
  formato: string;
  pedidos_novos: number;
  pedidos_atualizados: number;
  itens: number;
  pendencias: number;
  linhas_ignoradas: number;
  ignoradas_motivo: { motivo?: string }[] | string;
  status: string;
  created_at: string;
  desfeita_em?: string | null;
  profiles?: { nome: string } | { nome: string }[] | null;
  desfeita?: { nome: string } | { nome: string }[] | null;
};

export function ImportacoesPanel({ canAdmin }: { canAdmin: boolean }) {
  const { data = [], isLoading } = useImportacoes();
  const desfazer = useDesfazerImportacao();
  const limpar = useLimparPendenciasLote();
  const [open, setOpen] = useState<string | null>(null);
  const [expand, setExpand] = useState<string | null>(null);

  const lotes = data as Lote[];
  const alvo = lotes.find((l) => l.id === open);

  return (
    <div className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-3">Quando</th>
            <th className="text-left px-4 py-3">Autor</th>
            <th className="text-left px-4 py-3">Arquivo</th>
            <th className="text-left px-4 py-3">Origem</th>
            <th className="text-right px-4 py-3">Novos</th>
            <th className="text-right px-4 py-3">Atualiz.</th>
            <th className="text-right px-4 py-3">Itens</th>
            <th className="text-right px-4 py-3">Pend.</th>
            <th className="text-right px-4 py-3">Ignoradas</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
          )}
          {!isLoading && lotes.length === 0 && (
            <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Nenhuma importação</td></tr>
          )}
          {lotes.map((l) => {
            const motivos = Array.isArray(l.ignoradas_motivo) ? l.ignoradas_motivo : [];
            return (
              <Fragment key={l.id}>
                <tr className="border-t border-border">
                  <td className="px-4 py-3">{formatDateBRT(l.created_at.slice(0, 10))} {formatTime(l.created_at)}</td>
                  <td className="px-4 py-3">{one(l.profiles)?.nome ?? "—"}</td>
                  <td className="px-4 py-3">{l.arquivo}</td>
                  <td className="px-4 py-3">{l.formato}</td>
                  <td className="px-4 py-3 text-right">{l.pedidos_novos}</td>
                  <td className="px-4 py-3 text-right">{l.pedidos_atualizados}</td>
                  <td className="px-4 py-3 text-right">{l.itens}</td>
                  <td className="px-4 py-3 text-right">{l.pendencias}</td>
                  <td className="px-4 py-3 text-right">
                    {l.linhas_ignoradas}
                    {motivos.length > 0 && (
                      <button type="button" className="ml-2 text-xs text-primary underline" onClick={() => setExpand(expand === l.id ? null : l.id)}>
                        ver
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">{l.status}{l.desfeita_em ? ` · ${one(l.desfeita)?.nome ?? ""}` : ""}</td>
                  <td className="px-4 py-3 text-right">
                    {canAdmin && l.status !== "desfeita" && (
                      <div className="flex justify-end gap-2">
                        {l.pendencias > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => limpar.mutate(l.id, { onSuccess: (n) => toast.success(`${n} pendências dispensadas`) })}>
                            Limpar pendências
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setOpen(l.id)}>Desfazer</Button>
                      </div>
                    )}
                  </td>
                </tr>
                {expand === l.id && (
                  <tr>
                    <td colSpan={11} className="px-6 pb-3 text-xs text-muted-foreground">
                      {motivos.map((m, i) => <div key={i}>{m.motivo}</div>)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <AlertDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer importação</AlertDialogTitle>
            <AlertDialogDescription>
              Remover {alvo?.pedidos_novos ?? 0} pedidos novos deste lote (e {alvo?.pendencias ?? 0} pendências), se ainda não tiverem conferência, carga, movimento ou encerramento. Pedidos já usados permanecem. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!open) return;
                desfazer.mutate(open, {
                  onSuccess: (r) => {
                    toast.success(`${r.removidos} pedidos removidos` + (r.mantidos.length ? ` · ${r.mantidos.length} mantidos` : ""));
                    setOpen(null);
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao desfazer"),
                });
              }}
            >
              Desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
