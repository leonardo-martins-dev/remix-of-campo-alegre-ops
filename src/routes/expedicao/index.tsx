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
  ShoppingCart,
  Store,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { useWiseSyncStatus } from "@/hooks/use-wise-pedidos";
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
  useImportRelatorioVenda,
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
import {
  isRelatorioVendaHtml,
  parseRelatorioVendaHtml,
} from "@/lib/excel-relatorio-venda";
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
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import { useConfirmarEntregaAdmin, useEntregasSemConfirmacao } from "@/hooks/use-saida-expedicao";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { fromLegacyColumns, toLegacyColumns } from "@/lib/caixas-map";
import { CoberturaDiaCard } from "@/components/cobertura-dia";
import { one } from "@/lib/embed";

export const Route = createFileRoute("/expedicao/")({
  component: Page,
  head: () => ({ meta: [{ title: "Expedição · Campo Alegre" }] }),
});

type TipoCx = string;

type RomaneioItemView = {
  id: string;
  produto: string;
  romaneio: number;
  real: number;
  caixas: Record<string, number>;
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
    caixas?: Record<string, number> | null;
    status: string;
    produtos: { nome: string; familias_produto: { nome: string } | { nome: string }[] | null } | { nome: string; familias_produto: unknown }[] | null;
  }[] | undefined
): FamiliaView[] {
  const map = new Map<string, RomaneioItemView[]>();
  for (const it of items ?? []) {
    const prod = one(it.produtos);
    const familia = one(prod?.familias_produto as { nome: string } | { nome: string }[] | null)?.nome ?? "Outros";
    const row: RomaneioItemView = {
      id: it.id,
      produto: prod?.nome ?? "—",
      romaneio: Number(it.quantidade_romaneio),
      real: Number(it.quantidade_real),
      caixas: fromLegacyColumns(it),
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
  const vendaFileRef = useRef<HTMLInputElement>(null);
  const { data: cargas = [], isLoading: loadingCargas } = useCargasDia();
  const { data: fila = [], isLoading: loadingFila } = useFilaExpedicao();
  const gerarCargas = useGerarCargasPedido();
  const { data: clientes = [] } = useClientes();
  const { data: produtos = [] } = useProdutos();
  const { data: motoristas = [] } = useMotoristas();
  const { data: tiposCx = [] } = useTiposCaixa();
  const importExcel = useImportCargasExcel();
  const importRomaneio = useImportRomaneioItens();
  const importRelatorioVenda = useImportRelatorioVenda();
  const wiseFetch = useWiseCarregamentos();
  const importWise = useImportWiseCarregamento();
  const { data: wiseSyncStatus } = useWiseSyncStatus();
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

  const sugCaixas = useMemo<Record<string, number>>(() => {
    const sum = (k: string) => familias.flatMap((f) => f.itens).reduce((a, i) => a + (i.caixas[k] ?? 0), 0);
    const json = (resumo as { sugerido?: Record<string, number> } | null)?.sugerido;
    const next: Record<string, number> = {};
    const keys = tiposCx.length ? tiposCx.map((t) => t.sigla) : ["G", "I", "P"];
    for (const k of keys) {
      const legacy = k === "G" ? resumo?.sugerido_g : k === "I" ? resumo?.sugerido_i : k === "P" ? resumo?.sugerido_p : undefined;
      next[k] = json?.[k] ?? legacy ?? sum(k);
    }
    return next;
  }, [familias, resumo, tiposCx]);

  const [realCaixas, setRealCaixas] = useState<Record<string, number>>({ G: 0, I: 0, P: 0 });

  useEffect(() => {
    setRealTouched(false);
  }, [activeId]);

  useEffect(() => {
    if (realTouched) return;
    if (resumo) {
      const json = (resumo as { real?: Record<string, number> }).real;
      setRealCaixas({
        G: json?.G ?? resumo.real_g,
        I: json?.I ?? resumo.real_i,
        P: json?.P ?? resumo.real_p,
        ...json,
      });
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

  const persistResumo = (next: Record<string, number>) => {
    if (!activeId) return;
    updateResumo.mutate({
      cargaId: activeId,
      real_g: next.G ?? 0,
      real_i: next.I ?? 0,
      real_p: next.P ?? 0,
      sugerido_g: sugCaixas.G ?? 0,
      sugerido_i: sugCaixas.I ?? 0,
      sugerido_p: sugCaixas.P ?? 0,
      real: next,
      sugerido: sugCaixas,
    });
  };

  const updateReal = (itemId: string, romaneio: number, v: number) => {
    if (!activeId) return;
    const real = Math.max(0, v);
    const status = computeStatus(romaneio, real);
    updateItem.mutate({ cargaId: activeId, itemId, quantidade_real: real, status });
  };

  const updateCaixaItem = (itemId: string, tipo: TipoCx, current: Record<string, number>, v: number) => {
    if (!activeId) return;
    const next = { ...current, [tipo]: Math.max(0, v) };
    const legacy = toLegacyColumns(next);
    updateItem.mutate({ cargaId: activeId, itemId, ...legacy });
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
            one(detail.clientes as { nome: string } | { nome: string }[] | null)?.nome ?? "Cliente";
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

  const handleRelatorioVenda = async (buffer: ArrayBuffer) => {
    if (!user?.id) return;
    const rows = parseRelatorioVendaHtml(buffer);
    if (!rows.length) {
      toast.error("Relatório de venda sem pedidos/itens reconhecidos");
      return;
    }
    const toastId = toast.loading(
      `Importando ${new Set(rows.map((r) => r.numero_pedido)).size} pedidos de venda…`
    );
    try {
      const result = await importRelatorioVenda.mutateAsync({
        created_by: user.id,
        rows,
        clientes: clientes.map((c) => ({ id: c.id, nome: c.nome })),
        produtos: produtos.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo: p.codigo ?? null,
        })),
      });
      toast.success(
        `${result.criadas} carga(s) criada(s) · ${result.itens} itens`,
        {
          id: toastId,
          description: [
            result.clientesCriados ? `${result.clientesCriados} clientes novos` : null,
            result.puladas ? `${result.puladas} já existiam hoje` : null,
            result.produtosFaltantes.length
              ? `${result.produtosFaltantes.length} produtos sem cadastro (ex.: ${result.produtosFaltantes
                  .slice(0, 3)
                  .map((p) => p.codigo || p.produto)
                  .join(", ")})`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar pedido de venda", {
        id: toastId,
      });
    }
  };

  const handleExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    try {
      const buffer = await file.arrayBuffer();

      if (isRelatorioVendaHtml(buffer)) {
        await handleRelatorioVenda(buffer);
        return;
      }

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

  const handleVendaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await handleRelatorioVenda(await file.arrayBuffer());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ler relatório de venda");
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
            description: "Informe o cliente no item do pedido (CNPJ) ou verifique o cadastro.",
          });
        }
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao gerar cargas"),
    });
  };

  const openWiseImport = async () => {
    try {
      const res = await wiseFetch.mutateAsync();
      const list = res.carregamentos ?? [];
      setWiseList(list);
      setWiseSelected(list[0]?.id ?? "");
      if (list.length) {
        setWiseOpen(true);
      } else {
        toast.info(res.message ?? "Sync Wise disparado. Cargas entram pelo serviço diário (ou importe Excel).");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao consultar Wise");
    }
  };

  const importFileInputs = (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcel} />
      <input ref={wiseFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleWiseExcel} />
      <input
        ref={vendaFileRef}
        type="file"
        accept=".xlsx,.xls,.html"
        className="hidden"
        onChange={handleVendaFile}
      />
    </>
  );

  const btnAction =
    "inline-flex items-center justify-center gap-1.5 min-h-11 lg:min-h-9 h-11 lg:h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary active:bg-secondary/80 disabled:opacity-50";

  const importHeaderActions = (
    <div className="header-actions-mobile">
      <button
        type="button"
        onClick={() => downloadExpedicaoTemplate()}
        className={btnAction}
        title={`Colunas: ${EXPEDICAO_EXCEL_COLUNAS.join(", ")}`}
      >
        <Download size={14} /> <span className="lg:hidden">Modelo</span><span className="hidden lg:inline">Baixar modelo</span>
      </button>
      <button
        type="button"
        onClick={() => vendaFileRef.current?.click()}
        disabled={importRelatorioVenda.isPending}
        className={btnAction}
        title="Relatório de pedidos de venda (Nr. Ped. + itens por loja)"
      >
        <ShoppingCart size={14} /> <span className="lg:hidden">Venda</span><span className="hidden lg:inline">Pedido de venda</span>
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={btnAction}
      >
        <FileSpreadsheet size={14} /> <span className="lg:hidden">Excel</span><span className="hidden lg:inline">Importar Excel</span>
      </button>
      <button
        type="button"
        onClick={openWiseImport}
        disabled={wiseFetch.isPending}
        className={btnAction}
      >
        <RefreshCw size={14} /> Wise
      </button>
      <button
        type="button"
        onClick={() => wiseFileRef.current?.click()}
        disabled={importRomaneio.isPending}
        className={btnAction}
        title="Exportação Wise: Código, Descrição, Unidade, Qtde → carga selecionada"
      >
        <FileSpreadsheet size={14} /> <span className="lg:hidden">Exp. Wise</span><span className="hidden lg:inline">Importar exportação Wise</span>
      </button>
      <Link to="/expedicao/saida" className={btnAction}>
        <Truck size={14} /> <span className="lg:hidden">Saída</span>
        <span className="hidden lg:inline">Saída para a loja</span>
      </Link>
      <Link to="/expedicao/entrega" className={btnAction}>
        <Store size={14} /> Entrega
      </Link>
      <Link to="/expedicao/rastreio" className={btnAction}>
        <Search size={14} /> Rastreio
      </Link>
      <Link to="/expedicao/tv" className={btnAction}>
        <Tv size={14} /> <span className="lg:hidden">TV</span><span className="hidden lg:inline">Modo TV</span>
      </Link>
    </div>
  );

  if (loadingCargas) {
    return <Loading message="Carregando cargas do dia..." />;
  }

  if (!cargas.length) {
    return (
      <div>
        {importFileInputs}
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
        <p className="text-sm text-muted-foreground text-center py-6 md:py-8 px-4 flex items-center justify-center gap-1.5 max-w-xl mx-auto">
          <HelpCircle size={14} className="shrink-0" />
          Nenhuma carga programada para hoje. Importe pedido de venda, Excel, use a fila da conferência ou aguarde
          pedidos conferidos.
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

  const clienteNome = one(detail?.clientes as { nome: string } | { nome: string }[] | null)?.nome ?? "—";
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
      {importFileInputs}
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

      <EntregasPendentesCard />

      <div className="flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-2 md:gap-3 mb-4">
        <Select value={activeId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full md:w-[280px] h-11 lg:h-9">
            <SelectValue placeholder="Selecionar carregamento" />
          </SelectTrigger>
          <SelectContent>
            {cargas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.codigo} · {one(c.clientes as { nome: string } | { nome: string }[] | null)?.nome ?? "—"} ({c.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {detail?.status === "aguardando" && activeId && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 lg:min-h-9"
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
          {
            label: "Wise atualizado",
            value: wiseSyncStatus?.ultima_venda
              ? new Date(wiseSyncStatus.ultima_venda).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
            tone: "info",
          },
        ]}
      />

      <div className="mb-5">
        <CoberturaDiaCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        <div className="lg:col-span-2 card-base">
          {loadingDetail ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando romaneio...</div>
          ) : (
            <>
              <div className="p-4 sm:p-5 border-b border-border">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h2 className="text-base sm:text-lg font-bold text-navy">{clienteNome}</h2>
                  <span className="chip chip-info">{statusLabel}</span>
                  {activeId && (
                    <Link
                      to="/expedicao/rotas"
                      search={{ cargaId: activeId }}
                      className="ml-auto inline-flex items-center gap-1 min-h-9 px-3 rounded-lg bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary/15"
                    >
                      <Package size={12} /> Ordem de separação
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <span className="chip chip-muted text-xs">🚚 {placa}</span>
                  <span className="chip chip-muted text-xs">👤 {motorista}</span>
                  <span className="chip chip-muted text-xs hidden sm:inline-flex">📍 Rota {rota}</span>
                  <span className="chip chip-muted text-xs">⏱ {formatTime(detail?.hora_inicio)}</span>
                  <span className="chip chip-teal text-xs">
                    {totalItens} itens · {realCaixas.G + realCaixas.I + realCaixas.P} cx
                  </span>
                </div>
              </div>

              <div className="divide-y divide-border">
                {familias.map((fam, fi) => (
                  <div key={fam.familia}>
                    <div className="px-4 sm:px-5 py-2 bg-secondary/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Família {fi + 1} · {fam.familia}
                    </div>
                    
                    {/* Mobile: Card view */}
                    <div className="lg:hidden p-3 md:p-4 space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                      {fam.itens.map((it) => (
                        <div key={it.id} className="mobile-item-card">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="font-semibold text-navy text-sm">{it.produto}</div>
                            <div>
                              {it.status === "ok" && <span className="chip chip-ok">OK</span>}
                              {it.status === "corrigido" && (
                                <span className="chip chip-warn">
                                  {it.real > it.romaneio ? `+${it.real - it.romaneio}` : `−${it.romaneio - it.real}`}
                                </span>
                              )}
                              {it.status === "pendente" && <span className="chip chip-muted">Pendente</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Romaneio</div>
                              <div className="font-bold text-navy text-lg">{it.romaneio}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Real</div>
                              <NumberStepper
                                value={it.real}
                                onChange={(v) => updateReal(it.id, it.romaneio, v)}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1.5">Caixas</div>
                            <div className="flex flex-wrap gap-2">
                              {(tiposCx.length ? tiposCx.map((t) => t.sigla) : (["G", "I", "P"] as const)).map((k) => (
                                <div key={k} className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-muted-foreground">{k}</span>
                                  <NumberStepper
                                    size="sm"
                                    width="w-14"
                                    value={it.caixas[k] ?? 0}
                                    onChange={(v) => updateCaixaItem(it.id, k, it.caixas, v)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop: Table view */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                          <tr>
                            <th className="text-left px-5 py-2">Produto</th>
                            <th className="text-right px-3 py-2">Romaneio</th>
                            <th className="text-center px-3 py-2">Real</th>
                            <th className="text-center px-3 py-2">Caixas {tiposCx.map((t) => t.sigla).join(" / ") || "G / I / P"}</th>
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
                                  {(tiposCx.length ? tiposCx.map((t) => t.sigla) : (["G", "I", "P"] as const)).map((k) => (
                                    <div key={k} className="flex items-center gap-1">
                                      <span className="text-xs font-bold text-muted-foreground w-3">{k}</span>
                                      <NumberStepper
                                        size="sm"
                                        width="w-8"
                                        value={it.caixas[k] ?? 0}
                                        onChange={(v) => updateCaixaItem(it.id, k, it.caixas, v)}
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
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card-base p-4 sm:p-5 self-start lg:sticky lg:top-4 order-first lg:order-none">
          <h3 className="text-sm font-bold text-navy mb-3 sm:mb-4">Resumo da carga</h3>
          <div className="flex items-center justify-center my-2 sm:my-3">
            <ProgressRing value={progresso} label="Conferido" />
          </div>
          <div className="flex items-center justify-between text-sm py-2 sm:py-3 border-y border-border">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} /> Tempo
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
                  className="text-xs font-semibold text-primary-dark hover:underline"
                >
                  Resetar
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-1">Tipo</th>
                  <th className="text-right py-1">Sug.</th>
                  <th className="text-center py-1">Real (enviado)</th>
                  <th className="text-right py-1 w-12">Δ</th>
                </tr>
              </thead>
              <tbody>
                {(tiposCx.length ? tiposCx : [{ sigla: "G", nome: "Grande" }, { sigla: "I", nome: "Isopor" }, { sigla: "P", nome: "Plástica" }]).map((t) => {
                  const k = t.sigla;
                  const diff = (realCaixas[k] ?? 0) - (sugCaixas[k] ?? 0);
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="py-2 font-semibold text-navy">
                        {t.nome}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{sugCaixas[k] ?? 0}</td>
                      <td className="py-2">
                        <NumberStepper
                          size="sm"
                          value={realCaixas[k] ?? 0}
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
          <p className="text-xs text-muted-foreground text-center mt-2">
            Registra as <strong>caixas reais enviadas</strong> no Controle de Caixas
          </p>
        </div>
      </div>

      <div className="mt-5 sm:mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-navy flex items-center gap-2">
            <Truck size={14} /> Outras cargas hoje
          </h3>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50 overflow-x-auto">
            {(
              [
                ["todas", "Todas"],
                ["carregando", "Carregando"],
                ["aguardando", "Aguardando"],
                ["concluida", "Finalizadas"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 h-8 sm:h-7 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  tab === k ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cargasFiltradas.length === 0 && (
            <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
              Nenhuma carga neste filtro.
            </div>
          )}
          {cargasFiltradas.map((c) => {
            const nome = one(c.clientes as { nome: string } | { nome: string }[] | null)?.nome ?? "—";
            const mot = one(c.motoristas as { nome: string } | { nome: string }[] | null)?.nome ?? "—";
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

/** NOP-130: ordens em trânsito sem confirmação do motorista até o fim do dia. */
function EntregasPendentesCard() {
  const { isAdmin } = useAuth();
  const { data: pendentes = [] } = useEntregasSemConfirmacao();
  const confirmarAdmin = useConfirmarEntregaAdmin();
  const [aberto, setAberto] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");

  if (!isAdmin || pendentes.length === 0) return null;

  return (
    <div className="card-base p-4 mb-4 border-l-4" style={{ borderLeftColor: "var(--danger)" }}>
      <h3 className="text-sm font-semibold text-navy mb-1 flex items-center gap-2">
        <Truck size={14} /> Entregas sem confirmação ({pendentes.length})
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Saíram para a loja e o motorista não confirmou a entrega até o fim do dia.
      </p>
      <div className="space-y-2">
        {pendentes.map((p) => (
          <div key={p.saida_id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-navy tabular-nums">
                  {p.numero_ordem} · {p.cliente_nome}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.total_caixas} cx · saiu {formatDateBRT(p.data_carga)} às{" "}
                  {formatTime(p.saida_em)}
                  {p.motorista_nome ? ` · ${p.motorista_nome}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="min-h-10"
                onClick={() => {
                  setAberto(aberto === p.saida_id ? null : p.saida_id);
                  setJustificativa("");
                }}
              >
                Confirmar manualmente
              </Button>
            </div>
            {aberto === p.saida_id && (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 h-10 rounded-md border border-border bg-card px-3 text-sm"
                  placeholder="Justificativa (obrigatória)"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                />
                <Button
                  size="sm"
                  className="min-h-10"
                  disabled={confirmarAdmin.isPending || !justificativa.trim()}
                  onClick={async () => {
                    try {
                      await confirmarAdmin.mutateAsync({
                        carga_id: p.carga_id,
                        justificativa: justificativa.trim(),
                      });
                      toast.success("Entrega confirmada pelo administrador");
                      setAberto(null);
                      setJustificativa("");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erro ao confirmar");
                    }
                  }}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
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
      <div className="px-4 md:px-5 py-3 border-b border-border flex items-center gap-2">
        <Package size={16} className="text-primary-dark shrink-0" />
        <h3 className="text-sm md:text-base font-bold text-navy">Fila da conferência</h3>
        <span className="chip chip-warn ml-auto">{fila.length} pedido(s)</span>
      </div>
      <div className="divide-y divide-border">
        {fila.map((p) => (
          <div
            key={p.pedido_id}
            className="px-4 md:px-5 py-3 md:py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-semibold text-navy text-sm md:text-base">{p.codigo}</div>
              <div className="text-xs md:text-sm text-muted-foreground">
                {p.fornecedor}
                {p.finalizada_em ? ` · conferido ${formatTime(p.finalizada_em)}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 lg:min-h-9 w-full sm:w-auto shrink-0"
              disabled={gerando}
              onClick={() => onGerar(p.pedido_id, p.codigo)}
            >
              <RefreshCw size={14} className="mr-1" /> Gerar cargas
            </Button>
          </div>
        ))}
      </div>
      {!compact && (
        <p className="px-4 md:px-5 py-2.5 text-xs text-muted-foreground border-t border-border">
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
