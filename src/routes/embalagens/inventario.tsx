import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { FluxoPassos } from "@/components/fluxo-passos";
import { TableWrapper } from "@/components/table-wrapper";
import { NumberStepper } from "@/components/number-stepper";
import { PendenciasInventarioSemanal } from "@/components/pendencias-inventario-semanal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useTiposEmbalagem } from "@/hooks/use-tipos-embalagem";
import {
  SITUACAO_LABEL,
  TIPOS_AJUSTE,
  useAjustesEmbalagem,
  useContagemAtualEmbalagem,
  useHistoricoEmbalagem,
  useRegistrarAjusteEmbalagem,
  useRegistrarContagemEmbalagem,
  useStatusInventarioEmbalagem,
  type SituacaoInventarioEmbalagem,
  type TipoAjusteEmbalagem,
} from "@/hooks/use-inventario-embalagens";
import { one } from "@/lib/embed";
import { formatDateBRT, todayBRT } from "@/lib/utils-date";

export const Route = createFileRoute("/embalagens/inventario")({
  component: Page,
  head: () => ({ meta: [{ title: "Inventário de embalagens · Campo Alegre" }] }),
});

const CHIP_SITUACAO: Record<SituacaoInventarioEmbalagem, string> = {
  em_dia: "chip-ok",
  pendente: "chip-warn",
  atrasado: "chip-danger",
  sem_contagem: "chip-danger",
};

function qtd(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function Page() {
  const [view, setView] = useState<"contagem" | "historico">("contagem");

  return (
    <div>
      <PageHeader
        title="Inventário de embalagens"
        subtitle="Contagem semanal no Packing — fecha toda sexta-feira. Sem esperado × contado: a variação entre semanas é o consumo aparente."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/embalagens/saldo">Ver saldo</Link>
            </Button>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setView("contagem")}
                className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "contagem" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
              >
                Contagem
              </button>
              <button
                type="button"
                onClick={() => setView("historico")}
                className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "historico" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
              >
                Histórico
              </button>
            </div>
          </div>
        }
      />

      <div className="space-y-5">
        <FluxoPassos
          steps={["Contagem", "Histórico"]}
          current={view === "contagem" ? 1 : 2}
        />
        <StatusStrip />
        <PendenciasInventarioSemanal origem="embalagens" />
        {view === "contagem" ? <ContagemView /> : <HistoricoView />}
      </div>
    </div>
  );
}

/**
 * Situação da contagem da semana. Quando está pendente/atrasada ganha o
 * mesmo destaque do inventário de caixas — só visual, não bloqueia nada.
 */
function StatusStrip() {
  const { data: status } = useStatusInventarioEmbalagem();
  if (!status) return null;

  return (
    <div
      className={`p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm ${
        status.pendente
          ? "rounded-xl border border-danger/30 bg-danger/5"
          : "card-base"
      }`}
    >
      <span className={`chip ${CHIP_SITUACAO[status.situacao]}`}>{SITUACAO_LABEL[status.situacao]}</span>
      <span className="text-muted-foreground">
        Última contagem:{" "}
        <strong className="text-navy">
          {status.nunca_contado ? "nenhuma" : formatDateBRT(status.ultima_contagem_data)}
        </strong>
        {status.ultima_contagem_responsavel ? ` · ${status.ultima_contagem_responsavel}` : ""}
      </span>
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <CalendarClock size={14} />
        Vence sexta, <strong className="text-navy">{formatDateBRT(status.vencimento)}</strong>
      </span>
    </div>
  );
}

function ContagemView() {
  const { profile } = useAuth();
  const { data: tipos = [], isLoading } = useContagemAtualEmbalagem();
  const registrar = useRegistrarContagemEmbalagem();

  const [data, setData] = useState(todayBRT());
  const [observacao, setObservacao] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});

  const salvar = () => {
    if (!tipos.length) {
      toast.error("Nenhum tipo de embalagem ativo — cadastre em Configurações");
      return;
    }
    registrar.mutate(
      {
        data,
        contado_por: profile?.id ?? null,
        observacao,
        itens: tipos.map((t) => ({
          tipo_embalagem_id: t.tipo_embalagem_id,
          quantidade: quantidades[t.tipo_embalagem_id] ?? 0,
        })),
      },
      {
        onSuccess: () => {
          toast.success("Contagem de embalagens registrada");
          setQuantidades({});
          setObservacao("");
        },
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (!tipos.length) {
    return (
      <div className="card-base p-5 text-sm text-muted-foreground">
        Nenhum tipo de embalagem ativo. Cadastre em Configurações → Tipos de embalagem.
      </div>
    );
  }

  return (
    <div className="card-base p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="data-contagem">Data da contagem</Label>
          <Input
            id="data-contagem"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Responsável</Label>
          <p className="h-11 flex items-center text-sm font-semibold text-navy">
            {profile?.nome ?? "—"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {tipos.map((t) => (
          <div
            key={t.tipo_embalagem_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="font-semibold text-navy">{t.nome}</p>
              <p className="text-xs text-muted-foreground">
                {t.unidade_contagem}
                {t.qty_por_pacote != null ? ` · ${qtd(t.qty_por_pacote)} un/pacote` : ""}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Anterior</p>
                <p className="text-sm font-bold tabular-nums text-navy">
                  {qtd(t.ultima_quantidade)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t.ultima_data ? formatDateBRT(t.ultima_data) : "sem contagem"}
                </p>
              </div>
              <NumberStepper
                size="touch"
                inputMode="decimal"
                value={quantidades[t.tipo_embalagem_id] ?? 0}
                onChange={(n) =>
                  setQuantidades((prev) => ({ ...prev, [t.tipo_embalagem_id]: n }))
                }
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 max-w-xl">
        <Label htmlFor="obs-contagem">Observação (opcional)</Label>
        <Input
          id="obs-contagem"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Ex.: contagem feita antes da reposição"
          className="h-11"
        />
      </div>

      <Button className="min-h-11 w-full sm:w-auto" onClick={salvar} disabled={registrar.isPending}>
        Fechar contagem da semana
      </Button>
      <p className="text-xs text-muted-foreground">
        Fecha só a contagem de embalagens — o inventário de caixas é fechado na tela dele.
      </p>
    </div>
  );
}

function HistoricoView() {
  const [tipoId, setTipoId] = useState<string>("");
  const { data: tiposAtivos = [] } = useTiposEmbalagem();
  const { data: historico = [] } = useHistoricoEmbalagem(tipoId || null);
  const { data: ajustes = [] } = useAjustesEmbalagem(tipoId || null);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor="filtro-tipo">Tipo de embalagem</Label>
        <select
          id="filtro-tipo"
          className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {tiposAtivos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="card-base p-5">
        <h3 className="font-semibold text-navy mb-4">Contagens semana a semana</h3>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma contagem registrada.</p>
        ) : (
          <TableWrapper stickyFirstColumn>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-2 px-3 whitespace-nowrap">Data</th>
                  <th className="text-left py-2 px-3 whitespace-nowrap">Embalagem</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Anterior</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Contado</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Consumo aparente</th>
                  <th className="text-left py-2 px-3 whitespace-nowrap">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={`${h.contagem_id}-${h.tipo_embalagem_id}`} className="border-t">
                    <td className="py-2 px-3 whitespace-nowrap">{formatDateBRT(h.data)}</td>
                    <td className="py-2 px-3 font-medium whitespace-nowrap">{h.tipo_nome}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                      {qtd(h.quantidade_anterior)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums">{qtd(h.quantidade)}</td>
                    <td
                      className={`py-2 px-3 text-right tabular-nums ${
                        h.consumo_aparente != null && Number(h.consumo_aparente) < 0 ? "text-primary-dark" : ""
                      }`}
                    >
                      {qtd(h.consumo_aparente)}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {h.contado_por_nome ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Consumo aparente = contagem anterior − contagem atual. Valor negativo significa que
          entrou embalagem entre as contagens (compra ou sobra).
        </p>
      </div>

      <AjustesPanel tipoIdFiltro={tipoId} ajustes={ajustes} />
    </div>
  );
}

function AjustesPanel({
  tipoIdFiltro,
  ajustes,
}: {
  tipoIdFiltro: string;
  ajustes: ReturnType<typeof useAjustesEmbalagem>["data"];
}) {
  const { profile } = useAuth();
  const { data: tiposAtivos = [] } = useTiposEmbalagem();
  const registrar = useRegistrarAjusteEmbalagem();

  const [aberto, setAberto] = useState(false);
  const [tipoEmbalagemId, setTipoEmbalagemId] = useState("");
  const [tipo, setTipo] = useState<TipoAjusteEmbalagem>("compra");
  const [quantidade, setQuantidade] = useState(0);
  const [observacao, setObservacao] = useState("");

  const sentido = useMemo(
    () => TIPOS_AJUSTE.find((t) => t.valor === tipo)?.sentido ?? 0,
    [tipo]
  );

  const salvar = () => {
    const embalagemId = tipoEmbalagemId || tipoIdFiltro;
    if (!embalagemId) {
      toast.error("Escolha a embalagem");
      return;
    }
    if (!quantidade) {
      toast.error("Informe a quantidade do ajuste");
      return;
    }
    if (!observacao.trim()) {
      toast.error("A observação é obrigatória no ajuste");
      return;
    }
    // Perda sai do estoque; compra/sobra entram. "Outro" é registrado como entrada
    // e o texto da observação explica o caso.
    const assinada = sentido < 0 ? -Math.abs(quantidade) : Math.abs(quantidade);
    registrar.mutate(
      {
        tipo_embalagem_id: embalagemId,
        quantidade: assinada,
        tipo,
        observacao,
        registrado_por: profile?.id ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Ajuste registrado");
          setQuantidade(0);
          setObservacao("");
          setAberto(false);
        },
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="card-base p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-navy flex items-center gap-2">
          <Package size={18} /> Ajustes
        </h3>
        <Button variant="outline" size="sm" onClick={() => setAberto((v) => !v)}>
          <Plus size={14} /> Novo ajuste
        </Button>
      </div>

      {aberto && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ajuste-embalagem">Embalagem</Label>
              <select
                id="ajuste-embalagem"
                className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={tipoEmbalagemId || tipoIdFiltro}
                onChange={(e) => setTipoEmbalagemId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {tiposAtivos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ajuste-tipo">Motivo</Label>
              <select
                id="ajuste-tipo"
                className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoAjusteEmbalagem)}
              >
                {TIPOS_AJUSTE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <div className="h-11 flex items-center">
                <NumberStepper
                  size="touch"
                  inputMode="decimal"
                  value={quantidade}
                  onChange={setQuantidade}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ajuste-obs">Observação (obrigatória)</Label>
            <Input
              id="ajuste-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: compra de 2 fardos na terça"
              className="h-11"
            />
          </div>
          <Button className="min-h-11" onClick={salvar} disabled={registrar.isPending}>
            Registrar ajuste
          </Button>
        </div>
      )}

      {!ajustes?.length ? (
        <p className="text-sm text-muted-foreground">Nenhum ajuste registrado.</p>
      ) : (
        <ul className="text-sm divide-y divide-border">
          {ajustes.map((a) => {
            const emb = one(a.tipos_embalagem);
            const autor = one(a.profiles);
            const entrada = Number(a.quantidade) > 0;
            return (
              <li key={a.id} className="py-2 flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground whitespace-nowrap">
                  {formatDateBRT(a.registrado_em)}
                </span>
                <span className="font-semibold text-navy">{emb?.nome ?? "—"}</span>
                <span className={`chip ${entrada ? "chip-ok" : "chip-danger"}`}>
                  {TIPOS_AJUSTE.find((t) => t.valor === a.tipo)?.label ?? a.tipo}{" "}
                  {entrada ? "+" : ""}
                  {qtd(a.quantidade)}
                </span>
                <span className="text-muted-foreground">{a.observacao}</span>
                {autor?.nome && (
                  <span className="text-xs text-muted-foreground">· {autor.nome}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Ajuste é registro livre para explicar variação — não é razão de movimentação e não
        altera a contagem já fechada.
      </p>
    </div>
  );
}
