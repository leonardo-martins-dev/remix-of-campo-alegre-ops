import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Boxes, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import { useRastreio, type RastreioCaixa } from "@/hooks/use-rastreio";
import {
  useDivergenciasExpedicao,
  type DivergenciaExpedicao,
} from "@/hooks/use-divergencias-expedicao";
import {
  FluxoOrdemStepper,
  StatusOrdemBadge,
} from "@/components/expedicao/fluxo-ordem";
import { STATUS_ORDEM_LABEL, type StatusOrdem } from "@/hooks/use-ordem-expedicao";

export const Route = createFileRoute("/expedicao/rastreio")({
  component: Page,
  head: () => ({ meta: [{ title: "Rastreio · Campo Alegre" }] }),
});

const STATUS_CAIXA_LABEL: Record<string, string> = {
  separada: "Separada",
  em_transito: "Em trânsito",
  entregue: "Entregue",
  recusada: "Recusada",
  nao_localizada: "Não localizada",
};

function chipDeStatus(status: string) {
  if (status === "entregue") return "chip-ok";
  if (status === "em_transito") return "chip-info";
  if (status === "separada") return "chip-warn";
  return "chip-danger";
}

function Linha({
  quando,
  titulo,
  detalhe,
}: {
  quando: string | null;
  titulo: string;
  detalhe?: string | null;
}) {
  if (!quando && !detalhe) return null;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5" />
        <span className="flex-1 w-px bg-border" />
      </div>
      <div className="pb-3 min-w-0">
        <div className="text-sm font-semibold text-navy">{titulo}</div>
        <div className="text-xs text-muted-foreground">
          {quando ? `${formatDateBRT(quando)} às ${formatTime(quando)}` : "—"}
          {detalhe ? ` · ${detalhe}` : ""}
        </div>
      </div>
    </div>
  );
}

function CaixaCard({ cx }: { cx: RastreioCaixa }) {
  const conteudo = cx.conteudo ?? [];
  return (
    <div className="card-base p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold text-navy tabular-nums">{cx.codigo_etiqueta}</div>
          <div className="text-sm text-ink">{cx.cliente_nome}</div>
          <div className="text-xs text-muted-foreground">
            {cx.cliente_cnpj ? `CNPJ ${cx.cliente_cnpj} · ` : ""}
            Ordem {cx.numero_ordem} · {formatDateBRT(cx.data_carga)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`chip ${chipDeStatus(cx.caixa_status)}`}>
            {STATUS_CAIXA_LABEL[cx.caixa_status] ?? cx.caixa_status}
          </span>
          <span className="chip chip-muted">
            Ordem: {STATUS_ORDEM_LABEL[cx.status_ordem as StatusOrdem] ?? cx.status_ordem}
          </span>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Conteúdo
        </div>
        <ul className="text-sm space-y-0.5">
          {conteudo.map((c, i) => (
            <li key={`${c.produto_id ?? i}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <strong className="tabular-nums">{Number(c.quantidade)}</strong>{" "}
                <span className="text-xs text-muted-foreground">{c.unidade ?? "un"}</span>{" "}
                {c.produto ?? "Produto"}
                {c.familia ? (
                  <span className="text-xs text-muted-foreground"> · {c.familia}</span>
                ) : null}
              </span>
              {c.status !== "entregue" && c.status !== "separada" && (
                <span className="chip chip-muted shrink-0">
                  {STATUS_CAIXA_LABEL[c.status] ?? c.status}
                </span>
              )}
            </li>
          ))}
          {conteudo.length === 0 && <li className="text-muted-foreground">Sem itens.</li>}
        </ul>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Linha do tempo
        </div>
        <Linha
          quando={cx.separado_em}
          titulo="Separada no packing"
          detalhe={cx.separado_por_nome ? `por ${cx.separado_por_nome}` : null}
        />
        <Linha
          quando={cx.saida_em}
          titulo="Saiu para a loja"
          detalhe={[
            cx.conferido_por_nome ? `conferido por ${cx.conferido_por_nome}` : null,
            cx.motorista_nome ? `motorista ${cx.motorista_nome}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Linha
          quando={cx.entregue_em}
          titulo={
            cx.caixa_status === "entregue"
              ? `Entregue em ${cx.cliente_nome}`
              : cx.caixa_status === "recusada"
                ? "Recusada na loja"
                : cx.caixa_status === "nao_localizada"
                  ? "Não localizada"
                  : "Aguardando entrega"
          }
          detalhe={[
            cx.recebedor_nome ? `recebido por ${cx.recebedor_nome}` : null,
            cx.entregue_por_nome ? `confirmado por ${cx.entregue_por_nome}` : null,
            cx.motivo_recusa,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>
    </div>
  );
}

function DivergenciaCard({ d }: { d: DivergenciaExpedicao }) {
  const hasDiv =
    Number(d.divergencia_separacao_saida) !== 0 || Number(d.divergencia_saida_entrega) !== 0;
  return (
    <div className="card-base p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-navy tabular-nums">OS {d.numero_ordem}</div>
          <div className="text-sm text-ink">{d.cliente_nome}</div>
        </div>
        <StatusOrdemBadge status={d.status_ordem} />
      </div>
      <FluxoOrdemStepper status={d.status_ordem} compact />
      <div className="text-xs text-muted-foreground space-y-0.5">
        {d.romaneio_conferido_em && (
          <div>
            Conferido {formatDateBRT(d.romaneio_conferido_em)} às {formatTime(d.romaneio_conferido_em)}
            {d.romaneio_conferido_por_nome ? ` · ${d.romaneio_conferido_por_nome}` : ""}
            {` · ${Number(d.caixas_romaneio_real)} cx`}
          </div>
        )}
        {d.separado_em && (
          <div>
            Em carga {formatDateBRT(d.separado_em)} às {formatTime(d.separado_em)}
            {` · ${Number(d.caixas_separadas)} cx`}
          </div>
        )}
        {d.saida_conferida_em && (
          <div>
            Saída {formatDateBRT(d.saida_conferida_em)} às {formatTime(d.saida_conferida_em)}
            {d.saida_conferida_por_nome ? ` · ${d.saida_conferida_por_nome}` : ""}
            {` · ${Number(d.caixas_saida)} cx`}
          </div>
        )}
        {d.entregue_em && (
          <div>
            Entrega {formatDateBRT(d.entregue_em)} às {formatTime(d.entregue_em)}
            {` · ${Number(d.caixas_entregues)} entregue(s)`}
            {Number(d.caixas_recusadas) > 0 ? ` · ${Number(d.caixas_recusadas)} recusada(s)` : ""}
          </div>
        )}
      </div>
      {hasDiv && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-950 text-xs px-3 py-2">
          Divergências:{" "}
          {Number(d.divergencia_separacao_saida) !== 0 && (
            <span className="mr-2">
              separação×saída {Number(d.divergencia_separacao_saida) > 0 ? "+" : ""}
              {Number(d.divergencia_separacao_saida)}
            </span>
          )}
          {Number(d.divergencia_saida_entrega) !== 0 && (
            <span>
              saída×entrega {Number(d.divergencia_saida_entrega) > 0 ? "+" : ""}
              {Number(d.divergencia_saida_entrega)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Page() {
  const [busca, setBusca] = useState("");
  const { data: caixas = [], isLoading } = useRastreio(busca);
  const { data: divergencias = [] } = useDivergenciasExpedicao(busca);

  const porOrdem = new Map<string, RastreioCaixa[]>();
  for (const cx of caixas) {
    const lista = porOrdem.get(cx.numero_ordem) ?? [];
    lista.push(cx);
    porOrdem.set(cx.numero_ordem, lista);
  }

  const divPorOrdem = new Map(divergencias.map((d) => [d.numero_ordem, d]));

  return (
    <div className="w-full max-w-3xl mx-auto">
      <PageHeader
        title="Rastreio"
        subtitle="Etapas, responsáveis e divergências conferido × saída × entrega"
        actions={
          <Link
            to="/expedicao"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Painel
          </Link>
        }
      />

      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="pl-9 h-11"
          placeholder="130572, 130572 · 2/4 ou nome da loja…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Buscando…</p>}
      {!isLoading && caixas.length === 0 && divergencias.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma caixa encontrada. As caixas aparecem aqui depois da separação da ordem.
        </p>
      )}

      {divergencias.length > 0 && caixas.length === 0 && (
        <div className="space-y-3 mb-5">
          <h2 className="text-sm font-semibold text-navy">Fluxo das ordens</h2>
          {divergencias.map((d) => (
            <DivergenciaCard key={d.carga_id} d={d} />
          ))}
        </div>
      )}

      <div className="space-y-5">
        {[...porOrdem.entries()].map(([ordem, lista]) => (
          <div key={ordem} className="space-y-3">
            <h2 className="text-sm font-semibold text-navy flex items-center gap-2">
              <Boxes size={14} /> Ordem {ordem} · {lista.length} caixa(s)
            </h2>
            {divPorOrdem.get(ordem) && <DivergenciaCard d={divPorOrdem.get(ordem)!} />}
            {lista.map((cx) => (
              <CaixaCard key={cx.caixa_id} cx={cx} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
