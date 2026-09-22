import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, FileSpreadsheet, Package, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { KpiCard } from "@/components/kpi-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportToCsv, exportToExcel } from "@/lib/excel";
import { formatDateBRT } from "@/lib/utils-date";
import { useTiposEmbalagem } from "@/hooks/use-tipos-embalagem";
import {
  SITUACAO_LABEL,
  useContagemEmbalagemDetalhe,
  useContagensEmbalagemRecentes,
  useHistoricoEmbalagem,
  useSaldoEmbalagens,
  useStatusInventarioEmbalagem,
  type SituacaoInventarioEmbalagem,
} from "@/hooks/use-inventario-embalagens";

export const Route = createFileRoute("/embalagens/saldo")({
  component: Page,
  head: () => ({ meta: [{ title: "Saldo de embalagens · Campo Alegre" }] }),
});

const CHIP_SITUACAO: Record<SituacaoInventarioEmbalagem, string> = {
  em_dia: "chip-ok",
  pendente: "chip-warn",
  atrasado: "chip-danger",
  sem_contagem: "chip-danger",
};

function qtd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function Page() {
  const { data: status } = useStatusInventarioEmbalagem();
  const { data: saldos = [], isLoading } = useSaldoEmbalagens();
  const { data: recentes = [] } = useContagensEmbalagemRecentes(12);
  const { data: tiposAtivos = [] } = useTiposEmbalagem();

  const [tipoId, setTipoId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");

  const { data: historico = [] } = useHistoricoEmbalagem(tipoId || null);
  const { data: detalhe = [], isLoading: loadingDetalhe } = useContagemEmbalagemDetalhe(detalheId);
  const { data: itensA = [] } = useContagemEmbalagemDetalhe(cmpA || null);
  const { data: itensB = [] } = useContagemEmbalagemDetalhe(cmpB || null);

  const historicoFiltrado = useMemo(() => {
    return historico.filter((h) => {
      if (de && h.data < de) return false;
      if (ate && h.data > ate) return false;
      return true;
    });
  }, [historico, de, ate]);

  const detalheContagem = recentes.find((c) => c.id === detalheId) ?? null;

  const comparacao = useMemo(() => {
    if (!cmpA || !cmpB) return [];
    const mapA = new Map(itensA.map((i) => [i.tipo_embalagem_id, i]));
    const mapB = new Map(itensB.map((i) => [i.tipo_embalagem_id, i]));
    const ids = new Set([...mapA.keys(), ...mapB.keys()]);
    return [...ids]
      .map((id) => {
        const a = mapA.get(id);
        const b = mapB.get(id);
        const qa = a?.quantidade ?? 0;
        const qb = b?.quantidade ?? 0;
        return {
          tipo_embalagem_id: id,
          nome: a?.nome ?? b?.nome ?? "—",
          unidade: a?.unidade_contagem ?? b?.unidade_contagem ?? "",
          qtdA: a ? a.quantidade : null,
          qtdB: b ? b.quantidade : null,
          diff: qb - qa,
        };
      })
      .sort((x, y) => x.nome.localeCompare(y.nome));
  }, [cmpA, cmpB, itensA, itensB]);

  const labelContagem = (id: string) => {
    const c = recentes.find((r) => r.id === id);
    if (!c) return id.slice(0, 8);
    return `${formatDateBRT(c.data)}${c.contado_por_nome ? ` · ${c.contado_por_nome}` : ""}`;
  };

  const exportRows = () => {
    if (historicoFiltrado.length) {
      return historicoFiltrado.map((h) => ({
        Data: h.data,
        Embalagem: h.tipo_nome,
        Unidade: h.unidade_contagem,
        Anterior: h.quantidade_anterior ?? "",
        Contado: h.quantidade,
        "Consumo aparente": h.consumo_aparente ?? "",
        Responsável: h.contado_por_nome ?? "",
      }));
    }
    return saldos.map((s) => ({
      Embalagem: s.nome,
      Unidade: s.unidade_contagem,
      "Última contagem": s.ultima_data ?? "",
      Responsável: s.ultima_responsavel ?? "",
      Contado: s.ultima_quantidade ?? "",
      "Ajustes após contagem": s.ajustes_pos_contagem,
      Saldo: s.saldo,
    }));
  };

  const handleExportXlsx = () => {
    const rows = exportRows();
    if (!rows.length) return;
    exportToExcel(
      `saldo-embalagens-${new Date().toISOString().slice(0, 10)}.xlsx`,
      historicoFiltrado.length ? "Consulta" : "Saldo",
      rows,
    );
  };

  const handleExportCsv = () => {
    const rows = exportRows();
    if (!rows.length) return;
    exportToCsv(`saldo-embalagens-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando saldos…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Saldo de embalagens"
        subtitle="Packing · última contagem fechada + ajustes posteriores"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-9"
              onClick={handleExportCsv}
              disabled={!exportRows().length}
            >
              CSV
            </Button>
            <Button
              type="button"
              className="min-h-9 inline-flex items-center gap-2"
              onClick={handleExportXlsx}
              disabled={!exportRows().length}
            >
              <FileSpreadsheet size={14} /> Exportar XLSX
            </Button>
          </div>
        }
      />

      {status && (
        <div
          className={`p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm ${
            status.pendente ? "rounded-xl border border-danger/30 bg-danger/5" : "card-base"
          }`}
        >
          <span className={`chip ${CHIP_SITUACAO[status.situacao]}`}>
            {SITUACAO_LABEL[status.situacao]}
          </span>
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
          {status.pendente && (
            <Link to="/embalagens/inventario" className="text-xs font-semibold text-primary-dark">
              Abrir inventário
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <KpiCard label="Tipos com saldo" value={String(saldos.length)} icon={Package} />
        <KpiCard
          label="Total unidades"
          value={qtd(saldos.reduce((a, s) => a + Number(s.saldo), 0))}
          icon={Package}
        />
        <KpiCard
          label="Contagens recentes"
          value={String(recentes.length)}
          icon={Search}
        />
      </div>

      <div className="card-base mb-5">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Saldo atual por tipo</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Saldo = contagem fechada + ajustes depois dela · só Packing
          </p>
        </div>
        {saldos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum tipo ativo. Cadastre em Configurações → Tipos de embalagem.
          </p>
        ) : (
          <TableWrapper stickyFirstColumn>
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Embalagem</th>
                  <th className="text-left px-3 py-3 whitespace-nowrap">Unidade</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Contado</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Ajustes</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Saldo</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Origem</th>
                </tr>
              </thead>
              <tbody>
                {saldos.map((s) => (
                  <tr key={s.tipo_embalagem_id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{s.nome}</td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {s.unidade_contagem}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{qtd(s.ultima_quantidade)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {Number(s.ajustes_pos_contagem) === 0
                        ? "—"
                        : `${Number(s.ajustes_pos_contagem) > 0 ? "+" : ""}${qtd(s.ajustes_pos_contagem)}`}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-navy">
                      {qtd(s.saldo)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {s.ultima_data
                        ? `${formatDateBRT(s.ultima_data)}${s.ultima_responsavel ? ` · ${s.ultima_responsavel}` : ""}`
                        : "Sem contagem"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      <div className="card-base mb-5">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Últimas contagens</h3>
        </div>
        {recentes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma contagem registrada.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentes.map((c) => (
              <li key={c.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{formatDateBRT(c.data)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.contado_por_nome ?? "Sem responsável"}
                    {c.observacao ? ` · ${c.observacao}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.totais
                      .slice(0, 4)
                      .map((t) => `${t.nome}: ${qtd(t.quantidade)}`)
                      .join(" · ")}
                    {c.totais.length > 4 ? ` · +${c.totais.length - 4}` : ""}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setDetalheId(c.id)}>
                  Detalhe
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-base p-5 mb-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-navy">Consulta por tipo e período</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Histórico com consumo aparente (contagem anterior − atual)
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
          <div className="space-y-1.5">
            <Label htmlFor="filtro-tipo-saldo">Tipo</Label>
            <select
              id="filtro-tipo-saldo"
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
          <div className="space-y-1.5">
            <Label htmlFor="filtro-de">De</Label>
            <Input id="filtro-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filtro-ate">Até</Label>
            <Input id="filtro-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-11" />
          </div>
        </div>

        {historicoFiltrado.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma contagem neste filtro.</p>
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
                {historicoFiltrado.map((h) => (
                  <tr key={`${h.contagem_id}-${h.tipo_embalagem_id}`} className="border-t">
                    <td className="py-2 px-3 whitespace-nowrap">{formatDateBRT(h.data)}</td>
                    <td className="py-2 px-3 font-medium whitespace-nowrap">{h.tipo_nome}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                      {qtd(h.quantidade_anterior)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums">{qtd(h.quantidade)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{qtd(h.consumo_aparente)}</td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {h.contado_por_nome ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      <div className="card-base p-5 mb-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-navy">Comparar duas contagens</h3>
          <p className="text-xs text-muted-foreground mt-1">Diferença por tipo (B − A)</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <div className="space-y-1.5">
            <Label htmlFor="cmp-a">Contagem A</Label>
            <select
              id="cmp-a"
              className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={cmpA}
              onChange={(e) => setCmpA(e.target.value)}
            >
              <option value="">Selecione…</option>
              {recentes.map((c) => (
                <option key={c.id} value={c.id}>
                  {labelContagem(c.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-b">Contagem B</Label>
            <select
              id="cmp-b"
              className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={cmpB}
              onChange={(e) => setCmpB(e.target.value)}
            >
              <option value="">Selecione…</option>
              {recentes.map((c) => (
                <option key={c.id} value={c.id}>
                  {labelContagem(c.id)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {cmpA && cmpB && comparacao.length > 0 && (
          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-2 px-3">Embalagem</th>
                  <th className="text-right py-2 px-3">A</th>
                  <th className="text-right py-2 px-3">B</th>
                  <th className="text-right py-2 px-3">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((r) => (
                  <tr key={r.tipo_embalagem_id} className="border-t">
                    <td className="py-2 px-3 font-medium">
                      {r.nome}
                      {r.unidade ? (
                        <span className="text-xs text-muted-foreground"> · {r.unidade}</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{qtd(r.qtdA)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{qtd(r.qtdB)}</td>
                    <td
                      className={`py-2 px-3 text-right font-bold tabular-nums ${
                        r.diff > 0 ? "text-primary-dark" : r.diff < 0 ? "text-danger" : ""
                      }`}
                    >
                      {r.diff > 0 ? "+" : ""}
                      {qtd(r.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </div>

      <Dialog open={!!detalheId} onOpenChange={(open) => !open && setDetalheId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Contagem · {detalheContagem ? formatDateBRT(detalheContagem.data) : "—"}
            </DialogTitle>
          </DialogHeader>
          {detalheContagem && (
            <p className="text-sm text-muted-foreground -mt-2">
              {detalheContagem.contado_por_nome ?? "Sem responsável"}
              {detalheContagem.observacao ? ` · ${detalheContagem.observacao}` : ""}
            </p>
          )}
          {loadingDetalhe ? (
            <p className="text-sm text-muted-foreground py-4">Carregando…</p>
          ) : detalhe.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sem itens nesta contagem.</p>
          ) : (
            <ContagemDetalheTable itens={detalhe} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContagemDetalheTable({
  itens,
}: {
  itens: { tipo_embalagem_id: string; nome: string; unidade_contagem: string; quantidade: number }[];
}) {
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground uppercase">
          <tr>
            <th className="text-left py-2 px-2">Embalagem</th>
            <th className="text-right py-2 px-2">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.tipo_embalagem_id} className="border-t border-border">
              <td className="py-2 px-2">
                <span className="font-medium">{it.nome}</span>
                <span className="text-xs text-muted-foreground"> · {it.unidade_contagem}</span>
              </td>
              <td className="py-2 px-2 text-right font-bold tabular-nums">{qtd(it.quantidade)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}
