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
import { textoConfirmacao, type Confirmacao } from "@/lib/contagem-rascunho";

/**
 * NOP-322 — confirmação antes de fechar a contagem quando alguém zerou um
 * saldo que era positivo ou informou uma diferença acima da tolerância.
 */
export function ConfirmarContagemDialog({
  confirmacoes,
  onCancel,
  onConfirm,
  acao = "Registrar assim",
}: {
  confirmacoes: Confirmacao[] | null;
  onCancel: () => void;
  onConfirm: () => void;
  acao?: string;
}) {
  const lista = confirmacoes ?? [];
  const temZero = lista.some((c) => c.tipo === "zero");

  return (
    <AlertDialog
      open={!!confirmacoes}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {temZero ? "Confirmar contagem zerada?" : "Confirmar diferença na contagem?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Confira antes de fechar:</p>
              <ul className="list-disc space-y-1 pl-5">
                {lista.map((c, i) => (
                  <li key={`${c.label}-${c.tipo}-${i}`} className={c.tipo === "zero" ? "text-danger" : ""}>
                    {textoConfirmacao(c)}
                  </li>
                ))}
              </ul>
              <p>Tipos não informados ficam de fora — nenhum deles é enviado como 0.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Revisar contagem</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{acao}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
