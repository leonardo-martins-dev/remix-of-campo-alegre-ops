import { Link } from "@tanstack/react-router";
import { useCoberturaDia } from "@/hooks/use-cobertura";

export function CoberturaDiaCard() {
  const { data = [], isLoading } = useCoberturaDia();
  const deficit = data.filter((r) => r.saldo_cobertura < 0);

  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-navy">Cobertura do dia</h3>
        <Link to="/expedicao" className="text-xs font-semibold text-primary-dark hover:underline">
          Expedição
        </Link>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Sem recebimento nem romaneio hoje.</p>
      )}
      {!isLoading && data.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">
            Recebido hoje × romaneio do dia · {deficit.length} produto(s) em déficit
          </p>
          <ul className="text-sm space-y-1 max-h-64 overflow-auto">
            {data.slice(0, 12).map((r) => (
              <li key={r.produto_id} className="flex justify-between border-t border-border pt-1 gap-2">
                <span>
                  {r.produto}
                  {r.codigo ? <span className="text-muted-foreground"> · {r.codigo}</span> : null}
                </span>
                <span className={r.saldo_cobertura < 0 ? "text-destructive font-semibold" : "text-navy"}>
                  {r.recebido_hoje} rec · {r.a_expedir_hoje} exp · {r.saldo_cobertura >= 0 ? "+" : ""}
                  {r.saldo_cobertura}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
