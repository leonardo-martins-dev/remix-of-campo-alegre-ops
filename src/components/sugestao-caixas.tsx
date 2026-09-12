import { Link } from "@tanstack/react-router";
import { ExternalLink, Package } from "lucide-react";
import type { SugestaoItem } from "@/hooks/use-sugestao-caixas";

type SugestaoCaixasProps = {
  sugestao: SugestaoItem | undefined;
  showAdminLink?: boolean;
  compact?: boolean;
};

export function SugestaoCaixas({ sugestao, showAdminLink = false, compact = false }: SugestaoCaixasProps) {
  if (!sugestao) return null;

  if (sugestao.sem_conversao) {
    return (
      <span className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
        <span className="italic">sem conversão cadastrada</span>
        {showAdminLink && (
          <Link
            to="/gestao"
            search={{ tab: "conversao" }}
            className="ml-2 inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            <ExternalLink size={compact ? 10 : 12} />
            <span className={compact ? "text-[10px]" : "text-xs"}>cadastrar</span>
          </Link>
        )}
      </span>
    );
  }

  const parts = sugestao.sugestoes.map((s) => (
    <span key={s.tipo_caixa_id} className="whitespace-nowrap">
      <span className="font-semibold">{s.quantidade_caixas}</span>
      {" cx "}
      <span className="text-muted-foreground">{s.tipo_caixa_sigla}</span>
      <span className="text-muted-foreground"> ({s.fator}/cx)</span>
    </span>
  ));

  return (
    <span className={`inline-flex items-center gap-1 ${compact ? "text-xs" : "text-sm"}`}>
      <Package size={compact ? 12 : 14} className="text-muted-foreground flex-shrink-0" />
      <span className="flex flex-wrap gap-x-1">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && <span className="text-muted-foreground mx-1">ou</span>}
          </span>
        ))}
      </span>
    </span>
  );
}

type SugestaoCaixasBadgeProps = {
  sugestao: SugestaoItem | undefined;
  showAdminLink?: boolean;
};

export function SugestaoCaixasBadge({ sugestao, showAdminLink = false }: SugestaoCaixasBadgeProps) {
  if (!sugestao) return null;

  if (sugestao.sem_conversao) {
    return (
      <span className="chip chip-muted text-xs">
        sem conversão
        {showAdminLink && (
          <Link
            to="/gestao"
            search={{ tab: "conversao" }}
            className="ml-1 text-primary hover:underline"
          >
            →
          </Link>
        )}
      </span>
    );
  }

  return (
    <span className="chip chip-info text-xs">
      {sugestao.sugestoes
        .map((s) => `${s.quantidade_caixas} ${s.tipo_caixa_sigla}`)
        .join(" / ")}
    </span>
  );
}
