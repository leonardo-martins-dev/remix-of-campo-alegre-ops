import { useCallback, useEffect, useRef } from "react";
import {
  clearRascunho,
  loadRascunho,
  saveRascunho,
  type ContagemRascunho,
  type ContagemValues,
} from "@/lib/contagem-rascunho";

type Payload = { values: ContagemValues; data?: string; observacao?: string };

/**
 * NOP-322 — rascunho da contagem no localStorage, com debounce.
 *
 * Grava fora do caminho do usuário (300ms depois da última tecla) e dá flush
 * ao trocar de posição ou sair da tela, para a contagem sobreviver a um
 * "voltei depois" sem cobrar nada de quem está contando.
 */
export function useContagemRascunho(key: string | null, delay = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<{ key: string; payload: Payload } | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pendente.current;
    pendente.current = null;
    if (p) saveRascunho(p.key, p.payload);
  }, []);

  const salvar = useCallback(
    (payload: Payload) => {
      if (!key) return;
      // Trocou de chave com algo pendente: grava no destino antigo antes.
      if (pendente.current && pendente.current.key !== key) flush();
      pendente.current = { key, payload };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [key, delay, flush]
  );

  const limpar = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pendente.current = null;
    if (key) clearRascunho(key);
  }, [key]);

  const carregar = useCallback((): ContagemRascunho | null => (key ? loadRascunho(key) : null), [key]);

  // Desmontou (navegou para outra tela) → grava o que estava pendente.
  useEffect(() => flush, [flush]);

  return { salvar, limpar, carregar, flush };
}
