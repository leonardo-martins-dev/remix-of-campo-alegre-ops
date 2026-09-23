/** NOP-322 — "12 de 43 tipos contados": o que falta antes de fechar a contagem. */
export function ProgressoContagem({
  contados,
  total,
  escuro,
}: {
  contados: number;
  total: number;
  /** Variante para o mock escuro da tela de campo. */
  escuro?: boolean;
}) {
  const completo = total > 0 && contados === total;
  return (
    <p
      className={`text-xs font-semibold ${
        escuro ? "text-white/70" : completo ? "text-success" : "text-muted-foreground"
      }`}
    >
      {contados} de {total} tipos contados
      {completo ? " ✓" : ""}
    </p>
  );
}

/** Pendência ao lado do campo — destaca quando há saldo esperado e ninguém contou. */
export function ChipNaoInformado({ destacar }: { destacar?: boolean }) {
  return (
    <span className={`chip ${destacar ? "chip-warn" : ""} whitespace-nowrap`}>não informado</span>
  );
}
