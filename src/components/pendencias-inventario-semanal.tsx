import { Link } from "@tanstack/react-router";
import { AlertTriangle, Box, Package } from "lucide-react";
import { usePosicoesPendentes } from "@/hooks/use-minimo-estoque";
import {
  SITUACAO_LABEL,
  useStatusInventarioEmbalagem,
} from "@/hooks/use-inventario-embalagens";
import { formatDateBRT } from "@/lib/utils-date";

/**
 * NOP-158 — pendências semanais de caixas e embalagens no mesmo destaque.
 *
 * As duas contagens são fechadas separadamente (cada uma na sua tela);
 * aqui só juntamos o aviso. `origem` é a tela que já mostra a própria
 * pendência em detalhe — essa linha é omitida para não repetir.
 * Nada é bloqueado por causa de uma pendência.
 */
export function PendenciasInventarioSemanal({ origem }: { origem: "caixas" | "embalagens" }) {
  const { data: posicoes = [] } = usePosicoesPendentes();
  const { data: status } = useStatusInventarioEmbalagem();

  const mostrarCaixas = origem !== "caixas" && posicoes.length > 0;
  const mostrarEmbalagens = origem !== "embalagens" && status?.pendente === true;
  if (!mostrarCaixas && !mostrarEmbalagens) return null;

  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
      <h3 className="font-semibold text-danger flex items-center gap-2">
        <AlertTriangle size={18} /> Inventário semanal pendente
      </h3>

      {mostrarCaixas && (
        <div className="text-sm flex items-start gap-2">
          <Box size={16} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="font-medium">
              Caixas — {posicoes.length} posição(ões) sem contagem na semana
            </p>
            <p className="text-muted-foreground">
              {posicoes
                .slice(0, 3)
                .map((p) => {
                  const prazo = `prazo ${formatDateBRT(p.vencimento)}`;
                  const resp = p.responsavel ? ` · ${p.responsavel}` : "";
                  const idade = p.nunca_contado || p.dias_desde_contagem === 999
                    ? "nunca"
                    : `${p.dias_desde_contagem}d`;
                  return `${p.posicao_nome} (${idade}, ${prazo}${resp})`;
                })
                .join(" · ")}
              {posicoes.length > 3 ? ` · e mais ${posicoes.length - 3}` : ""}
            </p>
            <Link to="/caixas/inventario" className="text-xs font-semibold text-primary-dark">
              Abrir inventário de caixas
            </Link>
          </div>
        </div>
      )}

      {mostrarEmbalagens && status && (
        <div className="text-sm flex items-start gap-2">
          <Package size={16} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="font-medium">
              Embalagens — inventário {SITUACAO_LABEL[status.situacao].toLowerCase()}
            </p>
            <p className="text-muted-foreground">
              {status.nunca_contado
                ? "Nenhuma contagem registrada."
                : `Última contagem em ${formatDateBRT(status.ultima_contagem_data)} (${status.dias_desde_contagem} dias).`}{" "}
              Vence toda sexta-feira ({formatDateBRT(status.vencimento)}).
            </p>
            <Link to="/embalagens/inventario" className="text-xs font-semibold text-primary-dark">
              Abrir inventário de embalagens
            </Link>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        As contagens são fechadas separadamente — nenhuma movimentação fica bloqueada.
      </p>
    </div>
  );
}
