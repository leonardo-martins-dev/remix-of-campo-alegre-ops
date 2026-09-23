import type { ReactNode } from "react";

/**
 * NOP-328 — moldura dos 3 passos da Conferência de recebimento:
 * círculo azul numerado + título + subtítulo, com uma ação opcional à direita.
 */
export function PassoSecao({
  numero,
  titulo,
  subtitulo,
  acao,
  children,
  className = "",
  id,
}: {
  numero: number;
  titulo: string;
  subtitulo?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card-base p-3 sm:p-4 ${className}`.trim()} aria-label={titulo}>
      <div className="flex items-start gap-3 mb-3">
        <span
          className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: "var(--info)" }}
          aria-hidden
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-navy leading-tight">
            <span className="text-muted-foreground font-semibold mr-1">{numero} ·</span>
            {titulo}
          </h2>
          {subtitulo && <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {children}
    </section>
  );
}
