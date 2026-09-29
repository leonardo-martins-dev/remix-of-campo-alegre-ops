import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useConflitosCorAbertos,
  useCoresLivresProduto,
  useResolverConflitoCor,
  type ConflitoCorAberto,
} from "@/hooks/use-fornecedor-cor";
import { fornecedorCorDef, labelFornecedorCor } from "@/lib/fornecedor-cores";

/**
 * NOP-463 — pendência de cor no cadastro do fornecedor.
 * O vínculo de produto foi aceito, então o conflito aparece nos DOIS
 * fornecedores envolvidos com o produto, a cor, quem sai mais barato trocar e
 * as cores ainda livres naquele produto para resolver na hora.
 */
export function ConflitosCorFornecedor({ fornecedorId }: { fornecedorId: string }) {
  const { data: conflitos = [] } = useConflitosCorAbertos();
  const meus = conflitos.filter(
    (c) => c.fornecedor_a_id === fornecedorId || c.fornecedor_b_id === fornecedorId,
  );
  if (meus.length === 0) return null;

  return (
    <Card className="border-danger/50 bg-danger/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-danger">
          <AlertTriangle size={16} />
          {meus.length} conflito(s) de cor em produto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          O vínculo foi aceito e ficou esta pendência. Enquanto ela existir, o adesivo desta cor
          fica em espera para os dois fornecedores.
        </p>
        {meus.map((c) => (
          <LinhaConflito key={c.id} conflito={c} fornecedorId={fornecedorId} />
        ))}
      </CardContent>
    </Card>
  );
}

function LinhaConflito({
  conflito,
  fornecedorId,
}: {
  conflito: ConflitoCorAberto;
  fornecedorId: string;
}) {
  const { data: livres = [] } = useCoresLivresProduto(conflito.produto_id);
  const resolver = useResolverConflitoCor();
  const outroNome =
    conflito.fornecedor_a_id === fornecedorId
      ? conflito.fornecedor_b_nome
      : conflito.fornecedor_a_nome;
  const def = fornecedorCorDef(conflito.cor);
  const corNome = conflito.cor_nome || labelFornecedorCor(conflito.cor);
  const sugerido = conflito.sugerido_trocar_id;
  const sugerirEsse = sugerido === fornecedorId;

  const trocar = (fid: string, cor: string) => {
    resolver.mutate(
      { conflitoId: conflito.id, fornecedorId: fid, novaCor: cor },
      {
        onSuccess: (r) => toast.success(`Cor trocada para ${r.cor_nome}`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 space-y-2 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="h-4 w-4 rounded-full border border-black/20 shrink-0"
          style={{ backgroundColor: def?.hex ?? "transparent" }}
          aria-hidden
        />
        <span className="font-semibold">{corNome}</span>
        <span className="text-muted-foreground">em</span>
        <span className="font-semibold">{conflito.produto_nome}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{conflito.fornecedor_a_nome}</span> e{" "}
        <span className="font-medium text-foreground">{conflito.fornecedor_b_nome}</span> estão com
        a mesma cor neste produto. Também aparece no cadastro de {outroNome}.
      </p>
      {conflito.sugerido_trocar_nome && (
        <p className="text-xs">
          Sugerido trocar:{" "}
          <span className="font-semibold text-navy">{conflito.sugerido_trocar_nome}</span>{" "}
          <span className="text-muted-foreground">
            (menos caixas circulando — troca mais barata)
          </span>
        </p>
      )}
      {livres.length === 0 ? (
        <p className="text-xs text-danger">
          Nenhuma cor livre neste produto — libere uma cor em outro fornecedor primeiro.
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Cores livres em {conflito.produto_nome} — trocar{" "}
            {sugerirEsse || !sugerido ? "este fornecedor" : conflito.sugerido_trocar_nome} para:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {livres.map((cor) => {
              const d = fornecedorCorDef(cor);
              return (
                <button
                  key={cor}
                  type="button"
                  disabled={resolver.isPending}
                  onClick={() => trocar(sugerido ?? fornecedorId, cor)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold hover:border-primary disabled:opacity-50 min-h-9"
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-black/20"
                    style={{ backgroundColor: d?.hex ?? "transparent" }}
                    aria-hidden
                  />
                  {labelFornecedorCor(cor)}
                </button>
              );
            })}
          </div>
          {sugerido && !sugerirEsse && (
            <button
              type="button"
              disabled={resolver.isPending}
              onClick={() => {
                const cor = livres[0];
                if (cor) trocar(fornecedorId, cor);
              }}
              className="text-xs font-semibold text-primary hover:underline min-h-9"
            >
              Trocar este fornecedor em vez de {conflito.sugerido_trocar_nome}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
