import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Camera, Check, Minus, Plus, Receipt, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SemConversaoSelo } from "@/components/sem-conversao-selo";
import { ChipLabel } from "@/components/ui-galpao";
import { progressoItem, textoConversao } from "@/lib/conferir-chegada";

export type ItemEmConferencia = {
  itemId: string;
  fornecedorNome: string;
  pedidoCodigo: string;
  produto: string;
  fotoUrl: string | null;
  cliente: string | null;
  /** quantidade do pedido, na unidade do produto */
  pedidoQtd: number;
  unidade: string;
  /** fator real do cadastro (un por caixa); null = produto sem conversão */
  fator: number | null;
  /** caixas esperadas do saldo a receber; null quando não há fator */
  esperadoCaixas: number | null;
  caixasRecebidas: number;
  jaRecebidoUn: number;
  conferido: boolean;
  /** qty travada (vale pendente, ou finalizada fora do modo edição ADM) */
  bloqueado: boolean;
  semConversao: boolean;
  valePendente: boolean;
  qualidade: boolean;
  temFoto: boolean;
  aVincular: boolean;
  saldoZero: boolean;
  /** caixas de mais de um tipo: o número vem do editor de tipos */
  multiTipo: boolean;
};

/** Campo numérico que aceita ficar vazio durante a digitação. */
function CampoCaixas({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      aria-label="Caixas recebidas"
      disabled={disabled}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        setDraft(raw);
        if (raw !== "") onChange(Number(raw));
      }}
      onBlur={() => {
        setFocused(false);
        if (draft.trim() === "") {
          setDraft(String(value));
          return;
        }
        onChange(Math.max(0, Number(draft)));
      }}
      className="w-24 min-h-12 text-center text-lg font-bold tabular-nums"
    />
  );
}

function BlocoLeitura({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2 min-w-0">
      <div className="label-group truncate">{titulo}</div>
      <div className="text-sm font-bold text-navy mt-0.5 break-words">{children}</div>
    </div>
  );
}

/**
 * NOP-328 passo 2 — um item por vez no descarregamento.
 * Pedido / Esperado / Conversão são leitura; só "Caixas recebidas" é digitável.
 */
export function PassoItem({
  item,
  editorCaixas,
  onCaixas,
  onSalvar,
  onConfirmar,
  onDesmarcar,
  onDivergencia,
  onFoto,
  salvando,
}: {
  item: ItemEmConferencia;
  /** editor de tipos de caixa (só aparece quando há mais de um tipo) */
  editorCaixas?: ReactNode;
  onCaixas: (n: number) => void;
  /** NOP-340: grava parcial sem marcar conferido */
  onSalvar: () => void;
  onConfirmar: () => void;
  onDesmarcar: () => void;
  onDivergencia: () => void;
  onFoto: () => void;
  salvando: boolean;
}) {
  const conversao = textoConversao(item.fator, item.unidade);
  const { recebidoUn, faltamUn, pct } = progressoItem({
    pedidoUn: item.pedidoQtd,
    jaRecebidoUn: item.jaRecebidoUn,
    caixasRecebidas: item.caixasRecebidas,
    fator: item.fator,
  });
  const podeDigitar = !item.bloqueado && !item.aVincular && !item.multiTipo;
  const setCaixas = (n: number) => {
    if (!podeDigitar) return;
    onCaixas(Math.max(0, Math.round(n)));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-secondary/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-navy truncate">{item.fornecedorNome}</span>
        <span className="chip chip-info shrink-0">Pedido {item.pedidoCodigo}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3 min-w-0">
          <div className="flex items-start gap-3">
            {item.fotoUrl && (
              <img
                src={item.fotoUrl}
                alt=""
                className="h-16 w-16 rounded-lg object-cover border border-border shrink-0"
              />
            )}
            <div className="min-w-0">
              <h3 className="text-lg sm:text-2xl font-bold text-navy leading-tight break-words">
                {item.produto}
              </h3>
              {item.cliente && (
                <p className="text-xs text-muted-foreground mt-0.5">Cliente · {item.cliente}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {item.conferido && <ChipLabel value="Conferido" tone="ok" />}
                {item.saldoZero && <ChipLabel value="Completo" tone="ok" />}
                {item.aVincular && <ChipLabel value="a vincular" tone="warn" />}
                {item.qualidade && <ChipLabel value="Qualidade" tone="warn" />}
                {item.temFoto && <ChipLabel value="Foto" tone="info" />}
                {item.valePendente && <ChipLabel value="Vale pendente" tone="info" />}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <BlocoLeitura titulo="Pedido">
              <span className="tabular-nums">{item.pedidoQtd}</span> {item.unidade}
            </BlocoLeitura>
            <BlocoLeitura titulo="Esperado">
              {item.esperadoCaixas == null ? (
                "—"
              ) : (
                <>
                  <span className="tabular-nums">{item.esperadoCaixas}</span>{" "}
                  {item.esperadoCaixas === 1 ? "caixa" : "caixas"}
                </>
              )}
            </BlocoLeitura>
            <BlocoLeitura titulo="Conversão">
              {conversao ?? <SemConversaoSelo faltaFornecedor compact />}
            </BlocoLeitura>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="label-group mb-2 text-center sm:text-left">Caixas recebidas</div>
            {item.multiTipo ? (
              <p className="text-sm text-muted-foreground">
                Este item chegou em mais de um tipo de caixa — ajuste por tipo abaixo.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    aria-label="Menos uma caixa"
                    disabled={!podeDigitar || item.caixasRecebidas <= 0}
                    onClick={() => setCaixas(item.caixasRecebidas - 1)}
                    className="h-14 w-14 rounded-full border-2 border-border bg-card flex items-center justify-center text-navy hover:border-primary active:scale-95 transition disabled:opacity-40"
                  >
                    <Minus size={24} />
                  </button>
                  <div className="min-w-20 text-center">
                    <div className="text-4xl sm:text-5xl font-bold text-navy tabular-nums leading-none">
                      {item.caixasRecebidas}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.caixasRecebidas === 1 ? "caixa" : "caixas"}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Mais uma caixa"
                    disabled={!podeDigitar}
                    onClick={() => setCaixas(item.caixasRecebidas + 1)}
                    className="h-14 w-14 rounded-full border-2 border-primary bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary-dark active:scale-95 transition disabled:opacity-40"
                  >
                    <Plus size={24} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 px-4 font-bold"
                    disabled={!podeDigitar}
                    onClick={() => setCaixas(item.caixasRecebidas + 5)}
                  >
                    +5
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 px-4"
                    disabled={!podeDigitar || item.caixasRecebidas === 0}
                    onClick={() => setCaixas(0)}
                  >
                    Zerar
                  </Button>
                  <CampoCaixas
                    value={item.caixasRecebidas}
                    onChange={setCaixas}
                    disabled={!podeDigitar}
                  />
                </div>
              </>
            )}
            {item.bloqueado && !item.aVincular && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {item.valePendente
                  ? "Item com vale pendente — quantidade travada até o ADM decidir."
                  : "Conferência encerrada — só o ADM edita, com motivo."}
              </p>
            )}
            {editorCaixas && <div className="mt-3 border-t border-border pt-3">{editorCaixas}</div>}
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2 h-fit">
          <div className="label-group">Recebido até agora</div>
          <div className="text-2xl font-bold text-navy tabular-nums">
            {recebidoUn}{" "}
            <span className="text-sm font-semibold text-muted-foreground">{item.unidade}</span>
          </div>
          <div
            className="h-2.5 w-full rounded-full bg-border overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct >= 100 ? "var(--success)" : "var(--primary)",
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">{pct}%</span>
            <span className="tabular-nums">
              de {item.pedidoQtd} {item.unidade}
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Faltam</span>
            <span
              className="font-bold tabular-nums"
              style={{ color: faltamUn > 0 ? "var(--warning)" : "var(--success)" }}
            >
              {faltamUn} {item.unidade}
            </span>
          </div>
          {item.jaRecebidoUn > 0 && (
            <p className="text-xs text-muted-foreground">
              Inclui {item.jaRecebidoUn} {item.unidade} de entregas anteriores.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full min-h-11"
            onClick={onFoto}
            disabled={item.bloqueado && !item.conferido}
          >
            <Camera size={16} className="mr-1.5" /> Foto do item
          </Button>
        </aside>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-12 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDivergencia}
          disabled={item.bloqueado}
        >
          <AlertTriangle size={16} className="mr-1.5" /> Registrar divergência
        </Button>
        {item.conferido ? (
          <Button
            type="button"
            variant="outline"
            className="w-full min-h-12"
            onClick={onDesmarcar}
            disabled={item.bloqueado}
          >
            Desmarcar item
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 min-h-12 font-semibold"
              onClick={onSalvar}
              disabled={salvando || item.bloqueado || item.aVincular}
            >
              <Save size={16} className="mr-1.5" /> Salvar
            </Button>
            <Button
              type="button"
              className="flex-1 min-h-12 text-base font-bold"
              onClick={onConfirmar}
              disabled={salvando || item.bloqueado || item.aVincular}
            >
              <Check size={18} className="mr-1.5" /> Confirmar item
            </Button>
          </div>
        )}
      </div>
      {item.valePendente && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Receipt size={12} /> Vale já solicitado para este item — aguarda o ADM.
        </p>
      )}
    </div>
  );
}
