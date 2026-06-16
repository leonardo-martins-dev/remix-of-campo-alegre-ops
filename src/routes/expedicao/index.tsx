import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Truck,
  Clock,
  CheckCircle2,
  Tv,
  FileSpreadsheet,
  Download,
  Play,
  Package,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { ProgressRing } from "@/components/charts";
import { NumberStepper } from "@/components/number-stepper";
import {
  useCargasDia,
  useCargaDetail,
  useUpdateRomaneioItem,
  useUpdateCargaResumo,
  useFinalizarCarga,
  useIniciarCarga,
  useImportCargasExcel,
  useImportRomaneioItens,
  useFilaExpedicao,
  useGerarCargasPedido,
} from "@/hooks/use-cargas";
import { useClientes, useProdutos, useMotoristas } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import {
  buildCargasFromExcel,
  parseExpedicaoExcel,
  parseWiseExpedicaoExcel,
  parseWiseExportacaoProdutos,
  isWiseExportacaoFormat,
  matchProdutosFromWiseExport,
  downloadExpedicaoTemplate,
  EXPEDICAO_EXCEL_COLUNAS,
} from "@/lib/excel-expedicao";
import * as XLSX from "xlsx";
import { useWiseCarregamentos, useImportWiseCarregamento } from "@/hooks/use-wise-import";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/utils-date";

export const Route = createFileRoute("/expedicao/")({
  component: Page,
  head: () => ({ meta: [{ title: "Expedição · Campo Alegre" }] }),
});

type TipoCx = "G" | "I" | "P";

type RomaneioItemView = {
  id: string;
  produto: string;
  romaneio: number;
  real: number;
  caixas: Record<TipoCx, number>;
  status: "ok" | "corrigido" | "pendente";
};

type FamiliaView = { familia: string; itens: RomaneioItemView[] };

function groupRomaneio(
  items: {
    id: string;
    quantidade_romaneio: number;
    quantidade_real: number;
    caixas_g: number;
    caixas_i: number;
    caixas_p: number;
    status: string;
    produtos: { nome: string; familias_produto: { nome: string } | null } | null;
  }[] | undefined
): FamiliaView[] {
  const map = new Map<string, RomaneioItemView[]>();
  for (const it of items ?? []) {
    const familia = it.produtos?.familias_produto?.nome ?? "Outros";
    const row: RomaneioItemView = {
      id: it.id,
      produto: it.produtos?.nome ?? "—",
      romaneio: Number(it.quantidade_romaneio),
      real: Number(it.quantidade_real),
      caixas: { G: it.caixas_g, I: it.caixas_i, P: it.caixas_p },
      status: it.status as RomaneioItemView["status"],
    };
    if (!map.has(familia)) map.set(familia, []);
    map.get(familia)!.push(row);
  }
  return [...map.entries()].map(([familia, itens]) => ({ familia, itens }));
}

function computeStatus(romaneio: number, real: number): RomaneioItemView["status"] {
  if (real === romaneio) return "ok";
  if (real > 0) return "corrigido";
  return "pendente";
}

function Page() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const wiseFileRef = useRef<HTMLInputElement>(null);
  const { data: cargas = [], isLoading: loadingCargas } = useCargasDia();
  const { data: fila = [], isLoading: loadingFila } = useFilaExpedicao();
  const gerarCargas = useGerarCargasPedido();
  const { data: clientes = [] } = useClientes();
  const { data: produtos = [] } = useProdutos();
  const { data: motoristas = [] } = useMotoristas();
  const importExcel = useImportCargasExcel();
  const importRomaneio = useImportRomaneioItens();
  const wiseFetch = useWiseCarregamentos();
  const importWise = useImportWiseCarregamento();
  const iniciar = useIniciarCarga();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"todas" | "carregando" | "aguardando" | "concluida">("todas");
  const [realTouched, setRealTouched] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wiseOpen, setWiseOpen] = useState(false);
  const [wiseList, setWiseList] = useState<{ id: string; codigo: string; cliente: string; itens: { produto: string; quantidade: number }[] }[]>([]);
  const [wiseSelected, setWiseSelected] = useState<string>("");

  const activeId = useMemo(() => {
    if (selectedId && cargas.some((c) => c.id === selectedId)) return selectedId;
    const carregando = cargas.find((c) => c.status === "carregando");
    return carregando?.id ?? cargas[0]?.id ?? null;
  }, [cargas, selectedId]);

  const { data: detail, isLoading: loadingDetail } = useCargaDetail(activeId);
  const updateItem = useUpdateRomaneioItem();
  const updateResumo = useUpdateCargaResumo();
  const finalizar = useFinalizarCarga();

  const familias = useMemo(() => groupRomaneio(detail?.romaneio_itens), [detail?.romaneio_itens]);

  const resumo = Array.isArray(detail?.carga_caixas_resumo)
    ? detail.carga_caixas_resumo[0]
    : detail?.carga_caixas_resumo;

  const sugCaixas = useMemo<Record<TipoCx, number>>(() => {
    const sum = (k: TipoCx) => familias.flatMap((f) => f.itens).reduce((a, i) => a + i.caixas[k], 0);
    return {
      G: resumo?.sugerido_g ?? sum("G"),
      I: resumo?.sugerido_i ?? sum("I"),
      P: resumo?.sugerido_p ?? sum("P"),
    };
  }, [familias, resumo]);

  const [realCaixas, setRealCaixas] = useState<Record<TipoCx, number>>({ G: 0, I: 0, P: 0 });

  useEffect(() => {
    setRealTouched(false);
  }, [activeId]);

  useEffect(() => {
    if (realTouched) return;
    if (resumo) {
      setRealCaixas({ G: resumo.real_g, I: resumo.real_i, P: resumo.real_p });
    } else {
      setRealCaixas(sugCaixas);
    }
  }, [resumo, sugCaixas, realTouched]);

  useEffect(() => {
    if (!detail?.hora_inicio) {
      setElapsed(0);
      return;
    }
    const start = new Date(detail.hora_inicio).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [detail?.hora_inicio]);

  const persistResumo = (next: Record<TipoCx, number>) => {
    if (!activeId) return;
    updateResumo.mutate({
      cargaId: activeId,
      real_g: next.G,
      real_i: next.I,
      real_p: next.P,
      sugerido_g: sugCaixas.G,
      sugerido_i: sugCaixas.I,
      sugerido_p: sugCaixas.P,
    });
  };

  const updateReal = (itemId: string, romaneio: number, v: number) => {
    if (!activeId) return;
    const real = Math.max(0, v);
    const status = computeStatus(romaneio, real);
    updateItem.mutate({ cargaId: activeId, itemId, quantidade_real: real, status });
  };

  const updateCaixaItem = (itemId: string, tipo: TipoCx, v: number) => {
    if (!activeId) return;
    const field = tipo === "G" ? "caixas_g" : tipo === "I" ? "caixas_i" : "caixas_p";
    updateItem.mutate({ cargaId: activeId, itemId, [field]: Math.max(0, v) });
  };

  const flat = familias.flatMap((f) => f.itens);
  const conferidos = flat.filter((i) => i.status !== "pendente").length;
  const totalItens = flat.length;
  const progresso = totalItens ? Math.round((conferidos / totalItens) * 100) : 0;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const cargasFiltradas = cargas.filter((c) => tab === "todas" || c.status === tab);

  const emCarregamento = cargas.filter((c) => c.status === "carregando").length;

  const handleFinalizar = () => {
    if (!activeId || !detail) return;
    persistResumo(realCaixas);
    finalizar.mutate(
      { cargaId: activeId },
      {
        onSuccess: () => {
          const total = realCaixas.G + realCaixas.I + realCaixas.P;
          const cliente =
            (detail.clientes as { nome: string } | null)?.nome ?? "Cliente";
          toast.success("Carga finalizada", {
            description: `${cliente} · ${total} caixas registradas (G ${realCaixas.G} / I ${realCaixas.I} / P ${realCaixas.P}).`,
          });
        },
        onError: () => toast.error("Não foi possível finalizar a carga."),
      }
    );
  };

  const nameMaps = useMemo(
    () => ({
      clienteByName: new Map(clientes.map((c) => [c.nome.trim(), c.id])),
      produtoByName: new Map(produtos.map((p) => [p.nome.trim(), p.id])),
      motoristaByName: new Map(motoristas.map((m) => [m.nome.trim(), m.id])),
    }),
    [clientes, produtos, motoristas]
  );

  const handleWiseExportToCarga = async (buffer: ArrayBuffer) => {
    if (!activeId) {
      toast.error("Selecione um carregamento no painel antes de importar");
      return;
    }
    const rows = parseWiseExportacaoProdutos(buffer);
    if (!rows.length) {
      toast.error("Planilha Wise sem produtos válidos (colunas Código, Descrição, Unidade, Qtde)");
      return;
    }
    const { matched, missing } = matchProdutosFromWiseExport(rows, produtos);
    if (!matched.length) {
      toast.error("Nenhum produto reconhecido no cadastro", {
        description: missing.slice(0, 5).join(", ") + (missing.length > 5 ? "…" : ""),
      });
      return;
    }
    const result = await importRomaneio.mutateAsync({ cargaId: activeId, itens: matched });
    toast.success(`${result.imported} item(ns) importado(s) na carga`, {
      description:
        missing.length > 0
          ? `${missing.length} não encontrado(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`
          : undefined,
    });
  };

  const handleExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      if (isWiseExportacaoFormat(rawRows)) {
        await handleWiseExportToCarga(buffer);
        return;
      }

      let rows = parseExpedicaoExcel(buffer);
      if (!rows.length) rows = parseWiseExpedicaoExcel(buffer);
      const built = buildCargasFromExcel(rows, nameMaps);
      if (!built.length) {
        toast.error("Nenhuma carga válida na planilha — confira nomes de cliente/produto no cadastro");
        return;
      }
      await importExcel.mutateAsync(built.map((c) => ({ ...c, created_by: user.id })));
      toast.success(`${built.length} carga(s) importada(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar");
    }
  };

  const handleWiseExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await handleWiseExportToCarga(await file.arrayBuffer());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ler exportação Wise");
    }
  };

  const handleGerarCargas = (pedidoId: string, codigo: string) => {
    gerarCargas.mutate(pedidoId, {
      onSuccess: (criadas) => {
        if (criadas.length) {
          toast.success(`${criadas.length} carga(s) gerada(s) para ${codigo}`, {
            description: criadas.map((c) => c.codigo).join(", "),
          });
        } else {
          toast.warning(`Nenhuma carga gerada para ${codigo}`, {
            description: "Configure mapeamento destinatário→cliente em Gestão ou verifique rateio do pedido.",
          });
        }
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao gerar cargas"),
    });
  };

  const openWiseImport = async () => {
    try {
      const list = await wiseFetch.mutateAsync();
      setWiseList(list);
      setWiseSelected(list[0]?.id ?? "");
      setWiseOpen(true);
      if (!list.length) toast.info("Nenhum carregamento Wise para hoje (modo stub)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao consultar Wise");
    }
  };

  const importHeaderActions = (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcel} />
      <input ref={wiseFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleWiseExcel} />
      <button
        type="button"
        onClick={() => downloadExpedicaoTemplate()}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
        title={`Colunas: ${EXPEDICAO_EXCEL_COLUNAS.join(", ")}`}
      >
        <Download size={14} /> Baixar modelo
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
      >
        <FileSpreadsheet size={14} /> Importar Excel
      </button>
      <button
        type="button"
        onClick={openWiseImport}
        disabled={wiseFetch.isPending}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
      >
        <RefreshCw size={14} /> Wise API
      </button>
      <button
        type="button"
        onClick={() => wiseFileRef.current?.click()}
        disabled={importRomaneio.isPending}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
        title="Exportação Wise: Código, Descrição, Unidade, Qtde → carga selecionada"
      >
        <FileSpreadsheet size={14} /> Importar exportação Wise
      </button>
      <Link
        to="/expedicao/tv"
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
      >
        <Tv size={14} /> Modo TV
      </Link>
    </>
  );

  if (loadingCargas) {
    return <Loading message="Carregando cargas do dia..." />;
  }

  if (!cargas.length) {
    return (
      <div>
        <PageHeader
          title="Painel de Carga"
          subtitle="Abastecimento e conferência por loja"
          actions={importHeaderActions}
        />
        <FilaExpedicaoCard
          fila={fila}
          loading={loadingFila}
          gerando={gerarCargas.isPending}
          onGerar={handleGerarCargas}
        />
        <p className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-1">
          <HelpCircle size={14} />
          Nenhuma carga programada para hoje. Importe Excel, use a fila da conferência ou aguarde pedidos conferidos.
        </p>
        <WiseDialog
          open={wiseOpen}
          onOpenChange={setWiseOpen}
          list={wiseList}
          selected={wiseSelected}
          onSelect={setWiseSelected}
          onImport={async () => {
            const car = wiseList.find((c) => c.id === wiseSelected);
            if (!car || !user?.id) return;
            await importWise.mutateAsync({ carregamento: car, created_by: user.id, maps: nameMaps });
            toast.success("Carregamento Wise importado");
            setWiseOpen(false);
          }}
          loading={importWise.isPending}
        />
      </div>
    );
  }

  const clienteNome = (detail?.clientes as { nome: string } | null)?.nome ?? "—";
  const motorista = (detail?.motoristas as { nome: string } | null)?.nome ?? "—";
  const placa = (detail?.caminhoes as { placa: string } | null)?.placa ?? "—";
  const rota = (detail?.rotas as { nome: string } | null)?.nome ?? "—";
  const statusLabel =
    detail?.status === "carregando"
      ? "Em carregamento"
      : detail?.status === "concluida"
        ? "Concluída"
        : detail?.status === "aguardando"
          ? "Aguardando"
          : detail?.status ?? "";

  return (
    <div>
      <PageHeader
        title="Painel de Carga"
        subtitle="Abastecimento e conferência por loja"
        actions={importHeaderActions}
      />

      {fila.length > 0 && (
        <FilaExpedicaoCard
          fila={fila}
          loading={loadingFila}
          gerando={gerarCargas.isPending}
          onGerar={handleGerarCargas}
          compact
        />
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={activeId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Selecionar carregamento" />
          </SelectTrigger>
          <SelectContent>
            {cargas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.codigo} · {(c.clientes as { nome: string } | null)?.nome ?? "—"} ({c.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {detail?.status === "aguardando" && activeId && (
          <Button
            size="sm"
            variant="outline"
            disabled={iniciar.isPending}
            onClick={() =>
              iniciar.mutate(activeId, {
                onSuccess: () => toast.success("Carregamento iniciado"),
                onError: () => toast.error("Erro ao iniciar carregamento"),
              })
            }
          >
            <Play size={14} className="mr-1" /> Iniciar carregamento
          </Button>
        )}
      </div>

      <StatStrip
        items={[
          { label: "Cargas hoje", value: String(cargas.length) },
          { label: "Em carregamento", value: String(emCarregamento), tone: "info" },
          {
            label: "Concluídas",
            value: String(cargas.filter((c) => c.status === "concluida").length),
            tone: "ok",
          },
          {
            label: "Itens conferidos",
            value: totalItens ? `${progresso}%` : "—",
            tone: "ok",
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card-base overflow-hidden">
          {loadingDetail ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando romaneio...</div>
          ) : (
            <>
              <div className="p-5 border-b border-border">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h2 className="text-lg font-bold text-navy">{clienteNome}</h2>
                  <span className="chip chip-info">{statusLabel}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="chip chip-muted">🚚 {placa}</span>
                  <span className="chip chip-muted">👤 {motorista}</span>
                  <span className="chip chip-muted">📍 Rota {rota}</span>
                  <span className="chip chip-muted">⏱ Início {formatTime(detail?.hora_inicio)}</span>
                  <span className="chip chip-teal">
                    {totalItens} itens · {realCaixas.G + realCaixas.I + realCaixas.P} caixas
                  </span>
                </div>
              </div>

              <div className="divide-y divide-border">
                {familias.map((fam, fi) => (
                  <div key={fam.familia}>
                    <div className="px-5 py-2 bg-secondary/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Família {fi + 1} · {fam.familia}
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        <tr>
                          <th className="text-left px-5 py-2">Produto</th>
                          <th className="text-right px-3 py-2">Romaneio</th>
                          <th className="text-center px-3 py-2">Real</th>
                          <th className="text-center px-3 py-2">Caixas G / I / P</th>
                          <th className="text-right px-5 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fam.itens.map((it) => (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-5 py-3 font-semibold text-navy">{it.produto}</td>
                            <td className="px-3 py-3 text-right text-ink">{it.romaneio}</td>
                            <td className="px-3 py-3">
                              <NumberStepper
                                size="sm"
                                value={it.real}
                                onChange={(v) => updateReal(it.id, it.romaneio, v)}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-2">
                                {(["G", "I", "P"] as const).map((k) => (
                                  <div key={k} className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold text-muted-foreground w-3">{k}</span>
                                    <NumberStepper
                                      size="sm"
                                      width="w-8"
                                      value={it.caixas[k]}
                                      onChange={(v) => updateCaixaItem(it.id, k, v)}
                                    />
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right">
                              {it.status === "ok" && <span className="chip chip-ok">OK</span>}
                              {it.status === "corrigido" && (
                                <span className="chip chip-warn">
                                  {it.real > it.romaneio
                                    ? `Sobra +${it.real - it.romaneio}`
                                    : `Corrigido −${it.romaneio - it.real}`}
                                </span>
                              )}
                              {it.status === "pendente" && <span className="chip chip-muted">Pendente</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card-base p-5 self-start sticky top-4">
          <h3 className="text-sm font-bold text-navy mb-4">Resumo da carga</h3>
          <div className="flex items-center justify-center my-3">
            <ProgressRing value={progresso} label="Conferido" />
          </div>
          <div className="flex items-center justify-between text-sm py-3 border-y border-border">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} /> Tempo de carga
            </span>
            <span className="font-mono font-bold text-navy text-lg">
              {mm}:{ss}
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Caixas — sugerido × real
              </div>
              {realTouched && (
                <button
                  onClick={() => {
                    setRealTouched(false);
                    setRealCaixas(sugCaixas);
                    persistResumo(sugCaixas);
                  }}
                  className="text-[10px] font-semibold text-primary-dark hover:underline"
                >
                  Resetar
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-1">Tipo</th>
                  <th className="text-right py-1">Sug.</th>
                  <th className="text-center py-1">Real (enviado)</th>
                  <th className="text-right py-1 w-12">Δ</th>
                </tr>
              </thead>
              <tbody>
                {(["G", "I", "P"] as const).map((k) => {
                  const diff = realCaixas[k] - sugCaixas[k];
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="py-2 font-semibold text-navy">
                        {k === "G" ? "Grande" : k === "I" ? "Isopor" : "Plástica"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{sugCaixas[k]}</td>
                      <td className="py-2">
                        <NumberStepper
                          size="sm"
                          value={realCaixas[k]}
                          onChange={(v) => {
                            setRealTouched(true);
                            const next = { ...realCaixas, [k]: v };
                            setRealCaixas(next);
                            persistResumo(next);
                          }}
                        />
                      </td>
                      <td
                        className="py-2 text-right font-bold tabular-nums"
                        style={{
                          color:
                            diff === 0 ? "var(--muted-foreground)" : diff > 0 ? "var(--info)" : "var(--danger)",
                        }}
                      >
                        {diff === 0 ? "—" : diff > 0 ? `+${diff}` : `${diff}`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-secondary/30">
                  <td className="py-2 font-bold text-navy">Total</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {sugCaixas.G + sugCaixas.I + sugCaixas.P}
                  </td>
                  <td className="py-2 text-center font-bold text-navy">
                    {realCaixas.G + realCaixas.I + realCaixas.P}
                  </td>
                  <td className="py-2 text-right" />
                </tr>
              </tbody>
            </table>
          </div>
          <button
            onClick={handleFinalizar}
            disabled={finalizar.isPending || detail?.status === "concluida"}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Finalizar carga
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Registra as <strong>caixas reais enviadas</strong> no Controle de Caixas
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-navy flex items-center gap-2">
            <Truck size={14} /> Outras cargas hoje
          </h3>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
            {(
              [
                ["todas", "Todas"],
                ["carregando", "Em carregamento"],
                ["aguardando", "Aguardando"],
                ["concluida", "Finalizadas"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                  tab === k ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {cargasFiltradas.length === 0 && (
            <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
              Nenhuma carga neste filtro.
            </div>
          )}
          {cargasFiltradas.map((c) => {
            const nome = (c.clientes as { nome: string } | null)?.nome ?? "—";
            const mot = (c.motoristas as { nome: string } | null)?.nome ?? "—";
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`card-base p-4 text-left transition ring-2 ${active ? "ring-primary" : "ring-transparent"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground">{c.codigo}</span>
                  {c.status === "concluida" && <span className="chip chip-ok">Concluída</span>}
                  {c.status === "carregando" && <span className="chip chip-info">Carregando</span>}
                  {c.status === "aguardando" && <span className="chip chip-warn">Aguardando</span>}
                </div>
                <div className="font-bold text-navy text-sm">{nome}</div>
                <div className="text-xs text-muted-foreground mt-1">{mot}</div>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Number(c.progresso)}%`, background: "var(--primary)" }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <WiseDialog
        open={wiseOpen}
        onOpenChange={setWiseOpen}
        list={wiseList}
        selected={wiseSelected}
        onSelect={setWiseSelected}
        onImport={async () => {
          const car = wiseList.find((c) => c.id === wiseSelected);
          if (!car || !user?.id) return;
          await importWise.mutateAsync({ carregamento: car, created_by: user.id, maps: nameMaps });
          toast.success("Carregamento Wise importado");
          setWiseOpen(false);
        }}
        loading={importWise.isPending}
      />
    </div>
  );
}

function FilaExpedicaoCard({
  fila,
  loading,
  gerando,
  onGerar,
  compact,
}: {
  fila: {
    pedido_id: string;
    codigo: string;
    fornecedor: string;
    finalizada_em: string | null;
  }[];
  loading: boolean;
  gerando: boolean;
  onGerar: (pedidoId: string, codigo: string) => void;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="card-base p-4 mb-4 text-sm text-muted-foreground text-center">
        Carregando fila da conferência...
      </div>
    );
  }
  if (!fila.length) return null;

  return (
    <div className={`card-base overflow-hidden ${compact ? "mb-4" : "mb-6"}`}>
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Package size={16} className="text-primary-dark" />
        <h3 className="text-sm font-bold text-navy">Fila da conferência</h3>
        <span className="chip chip-warn ml-auto">{fila.length} pedido(s)</span>
      </div>
      <div className="divide-y divide-border">
        {fila.map((p) => (
          <div
            key={p.pedido_id}
            className="px-5 py-3 flex flex-wrap items-center gap-3 justify-between"
          >
            <div>
              <div className="font-semibold text-navy text-sm">{p.codigo}</div>
              <div className="text-xs text-muted-foreground">
                {p.fornecedor}
                {p.finalizada_em ? ` · conferido ${formatTime(p.finalizada_em)}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={gerando}
              onClick={() => onGerar(p.pedido_id, p.codigo)}
            >
              <RefreshCw size={14} className="mr-1" /> Gerar cargas
            </Button>
          </div>
        ))}
      </div>
      {!compact && (
        <p className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border">
          Pedidos conferidos sem carga no painel. Se a geração automática falhou, use o botão acima ou configure
          mapeamento em Gestão.
        </p>
      )}
    </div>
  );
}

function WiseDialog({
  open,
  onOpenChange,
  list,
  selected,
  onSelect,
  onImport,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  list: { id: string; codigo: string; cliente: string }[];
  selected: string;
  onSelect: (id: string) => void;
  onImport: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar carregamento Wise</DialogTitle>
        </DialogHeader>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum carregamento disponível para hoje.</p>
        ) : (
          <Select value={selected} onValueChange={onSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o carregamento" />
            </SelectTrigger>
            <SelectContent>
              {list.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} · {c.cliente}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!selected || loading} onClick={onImport}>
            Importar selecionado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Loading({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
