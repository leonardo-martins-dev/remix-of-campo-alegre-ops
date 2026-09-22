import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Truck,
  Clock,
  CheckCircle2,
  Play,
  Package,
  RefreshCw,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { HeaderAcoes, ChipLabel } from "@/components/ui-galpao";
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
  useConferirPedido,
  useImportCargasExcel,
  useImportRomaneioItens,
  useImportRelatorioVenda,
  useFilaExpedicao,
  useGerarCargasPedido,
  useCargasSemCliente,
  useVincularClienteCarga,
} from "@/hooks/use-cargas";
import {
  STATUS_ORDEM_LABEL,
  type StatusOrdem,
} from "@/hooks/use-ordem-expedicao";
import { useClientes, useProdutos, useMotoristas } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import {
  RomaneioListaEnxuta,
  EditarItemDialog,
  type RomaneioLinha,
} from "@/components/expedicao/romaneio-enxuto";
import {
  FluxoOrdemStepper,
  StatusOrdemBadge,
  ProximoPassoLinks,
} from "@/components/expedicao/fluxo-ordem";
import { Input } from "@/components/ui/input";
import {
  buildCargasFromExcel,
  parseExpedicaoExcel,
  parseWiseExpedicaoExcel,
  parseWiseExportacaoProdutos,
  isWiseExportacaoFormat,
  matchProdutosFromWiseExport,
  downloadExpedicaoTemplate,
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
import { fromLegacyColumns, toLegacyColumns, safeNum, sumCaixas } from "@/lib/caixas-map";
import { CoberturaDiaCard } from "@/components/cobertura-dia";
import { one } from "@/lib/embed";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { SeletorCadastro } from "@/components/seletor-cadastro";

type ExpedicaoSearch = { cargaId?: string };

export const Route = createFileRoute("/expedicao/")({
  validateSearch: (search: Record<string, unknown>): ExpedicaoSearch => ({
    cargaId: typeof search.cargaId === "string" ? search.cargaId : undefined,
  }),
  component: Page,
  head: () => ({ meta: [{ title: "Expedição · Campo Alegre" }] }),
});

type RomaneioItemView = {
  id: string;
  produtoId: string | null;
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
    produto_id?: string | null;
    quantidade_romaneio: number;
    quantidade_real: number;
    caixas_g: number;
    caixas_i: number;
    caixas_p: number;
    caixas?: Record<string, number> | null;
    status: string;
    produtos: { id?: string; nome: string; familias_produto: { nome: string } | { nome: string }[] | null } | { id?: string; nome: string; familias_produto: unknown }[] | null;
  }[] | undefined
): FamiliaView[] {
  const map = new Map<string, RomaneioItemView[]>();
  for (const it of items ?? []) {
    const prod = one(it.produtos);
    const familia = one(prod?.familias_produto as { nome: string } | { nome: string }[] | null)?.nome ?? "Outros";
    const row: RomaneioItemView = {
      id: it.id,
      produtoId: it.produto_id ?? prod?.id ?? null,
      produto: prod?.nome ?? "—",
      romaneio: safeNum(it.quantidade_romaneio),
      real: safeNum(it.quantidade_real),
      caixas: Object.fromEntries(
        Object.entries(fromLegacyColumns(it)).map(([k, v]) => [k, safeNum(v)]),
      ),
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
  const navigate = useNavigate();
  const { cargaId: cargaIdSearch } = Route.useSearch();
  const { user } = useAuth();
  const [ajustarCaixas, setAjustarCaixas] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wiseFileRef = useRef<HTMLInputElement>(null);
  const vendaFileRef = useRef<HTMLInputElement>(null);
  const { data: cargas = [], isLoading: loadingCargas } = useCargasDia();
  const { data: cargasSemCliente = [] } = useCargasSemCliente();
  const vincularCliente = useVincularClienteCarga();
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
  const iniciar = useIniciarCarga();
  const conferirPedido = useConferirPedido();
  const [selectedId, setSelectedId] = useState<string | null>(cargaIdSearch ?? null);
  const [tab, setTab] = useState<"todas" | "carregando" | "aguardando" | "concluida">("todas");
  const [filtroRota, setFiltroRota] = useState<string>("todas");
  const [buscaCarga, setBuscaCarga] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [realTouched, setRealTouched] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wiseOpen, setWiseOpen] = useState(false);
  const [wiseList, setWiseList] = useState<{ id: string; codigo: string; cliente: string; itens: { produto: string; quantidade: number }[] }[]>([]);
  const [wiseSelected, setWiseSelected] = useState<string>("");

  useEffect(() => {
    if (cargaIdSearch) setSelectedId(cargaIdSearch);
  }, [cargaIdSearch]);

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

  const produtoIds = useMemo(
    () => [...new Set(familias.flatMap((f) => f.itens.map((i) => i.produtoId).filter(Boolean)))] as string[],
    [familias],
  );

  const { data: fatoresPadrao = [] } = useQuery({
    queryKey: ["fatores-padrao-saida", produtoIds.join(",")],
    enabled: produtoIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversoes_produto_caixa")
        .select("produto_id, tipo_caixa_id, fator, tipos_caixa(sigla)")
        .eq("ativo", true)
        .in("produto_id", produtoIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const fatorPorProdutoSigla = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of fatoresPadrao as {
      produto_id: string;
      fator: number;
      tipos_caixa: { sigla: string } | { sigla: string }[] | null;
    }[]) {
      const sigla = one(row.tipos_caixa)?.sigla;
      const fator = safeNum(row.fator);
      if (!sigla || fator <= 0) continue;
      m.set(`${row.produto_id}:${sigla}`, fator);
    }
    return m;
  }, [fatoresPadrao]);

  const itensSemFator = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const it of familias.flatMap((f) => f.itens)) {
      if (!it.produtoId || seen.has(it.produtoId)) continue;
      const has = [...fatorPorProdutoSigla.keys()].some((k) => k.startsWith(`${it.produtoId}:`));
      if (!has) {
        seen.add(it.produtoId);
        list.push(it.produto);
      }
    }
    return list;
  }, [familias, fatorPorProdutoSigla]);

  const resumo = Array.isArray(detail?.carga_caixas_resumo)
    ? detail.carga_caixas_resumo[0]
    : detail?.carga_caixas_resumo;

  const sugCaixas = useMemo<Record<string, number>>(() => {
    const keys = tiposCx.length ? tiposCx.map((t) => t.sigla) : ["G", "I", "P"];
    const fromItens: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const it of familias.flatMap((f) => f.itens)) {
      let applied = false;
      for (const k of keys) {
        const fator = it.produtoId ? fatorPorProdutoSigla.get(`${it.produtoId}:${k}`) : undefined;
        if (fator && fator > 0 && it.romaneio > 0) {
          fromItens[k] = safeNum(fromItens[k]) + Math.ceil(it.romaneio / fator);
          applied = true;
        }
      }
      if (!applied) {
        for (const k of keys) {
          fromItens[k] = safeNum(fromItens[k]) + safeNum(it.caixas[k]);
        }
      }
    }
    const json = (resumo as { sugerido?: Record<string, number> } | null)?.sugerido;
    const next: Record<string, number> = {};
    for (const k of keys) {
      const legacy =
        k === "G" ? resumo?.sugerido_g : k === "I" ? resumo?.sugerido_i : k === "P" ? resumo?.sugerido_p : undefined;
      const stored = json?.[k] ?? legacy;
      next[k] = safeNum(stored != null ? stored : fromItens[k]);
    }
    return next;
  }, [familias, resumo, tiposCx, fatorPorProdutoSigla]);

  const [realCaixas, setRealCaixas] = useState<Record<string, number>>({ G: 0, I: 0, P: 0 });

  const totalSugCx = useMemo(() => sumCaixas(sugCaixas), [sugCaixas]);
  const totalRealCx = useMemo(() => sumCaixas(realCaixas), [realCaixas]);

  useEffect(() => {
    setRealTouched(false);
    setEditingItemId(null);
  }, [activeId]);

  useEffect(() => {
    if (realTouched) return;
    if (resumo) {
      const json = (resumo as { real?: Record<string, number> }).real;
      const next: Record<string, number> = {
        G: safeNum(json?.G ?? resumo.real_g),
        I: safeNum(json?.I ?? resumo.real_i),
        P: safeNum(json?.P ?? resumo.real_p),
      };
      if (json) {
        for (const [k, v] of Object.entries(json)) next[k] = safeNum(v);
      }
      setRealCaixas(next);
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

  const siglasCx = tiposCx.length ? tiposCx.map((t) => t.sigla) : ["G", "I", "P"];

  const familiasEnxutas = useMemo(() => {
    return familias.map((f) => ({
      familia: f.familia,
      itens: f.itens.map((it): RomaneioLinha => {
        const semFator = it.produtoId
          ? ![...fatorPorProdutoSigla.keys()].some((k) => k.startsWith(`${it.produtoId}:`))
          : true;
        return { ...it, semFator };
      }),
    }));
  }, [familias, fatorPorProdutoSigla]);

  const editingItem = useMemo(() => {
    if (!editingItemId) return null;
    return familiasEnxutas.flatMap((f) => f.itens).find((i) => i.id === editingItemId) ?? null;
  }, [editingItemId, familiasEnxutas]);

  const handleSaveItemEdit = (next: { real: number; caixas: Record<string, number> }) => {
    if (!activeId || !editingItem) return;
    const status = computeStatus(editingItem.romaneio, next.real);
    const legacy = toLegacyColumns(next.caixas);
    updateItem.mutate(
      {
        cargaId: activeId,
        itemId: editingItem.id,
        quantidade_real: next.real,
        status,
        ...legacy,
        caixas: next.caixas,
      },
      {
        onSuccess: () => {
          setEditingItemId(null);
          toast.success("Item atualizado");
        },
        onError: () => toast.error("Não foi possível salvar o item"),
      },
    );
  };

  const handleConferirPedido = () => {
    if (!activeId) return;
    conferirPedido.mutate(activeId, {
      onSuccess: (res) => {
        toast.success("Pedido conferido", {
          description:
            res.sem_fator > 0
              ? `${res.itens} itens · ${res.sem_fator} sem fator de saída`
              : `${res.itens} itens · caixas sugeridas aplicadas`,
        });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao conferir pedido"),
    });
  };

  const flat = familias.flatMap((f) => f.itens);
  const conferidos = flat.filter((i) => i.status !== "pendente").length;
  const totalItens = flat.length;
  const progresso = totalItens ? Math.round((conferidos / totalItens) * 100) : 0;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const rotasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const c of cargas) {
      if (c.rota_nome) set.add(c.rota_nome);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cargas]);

  const cargasFiltradas = cargas.filter((c) => {
    if (tab !== "todas" && c.status !== tab) return false;
    if (filtroRota !== "todas" && (c.rota_nome ?? "") !== filtroRota) return false;
    const q = buscaCarga.trim().toLowerCase();
    if (q) {
      const loja = (c.cliente_nome ?? "").toLowerCase();
      const num = (c.numero_ordem ?? c.codigo ?? "").toLowerCase();
      if (!loja.includes(q) && !num.includes(q)) return false;
    }
    return true;
  });

  const emCarregamento = cargas.filter((c) => c.status === "carregando").length;

  const handleFinalizar = () => {
    if (!activeId || !detail) return;
    persistResumo(realCaixas);
    finalizar.mutate(
      { cargaId: activeId },
      {
        onSuccess: () => {
          const total = totalRealCx;
          const cliente =
            one(detail.clientes as { nome: string } | { nome: string }[] | null)?.nome ?? "Cliente";
          toast.success("Carga finalizada", {
            description: `${cliente} · ${total} caixas registradas.`,
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

  const buildHeaderActions = (primary?: React.ReactNode) => (
    <HeaderAcoes
      primary={primary}
      detalhes={[
        { label: "Baixar modelo Excel", onClick: () => downloadExpedicaoTemplate() },
        {
          label: "Pedido de venda",
          onClick: () => vendaFileRef.current?.click(),
          disabled: importRelatorioVenda.isPending,
        },
        { label: "Importar Excel", onClick: () => fileRef.current?.click() },
        { label: "Consultar Wise", onClick: () => void openWiseImport(), disabled: wiseFetch.isPending },
        {
          label: "Importar exportação Wise",
          onClick: () => wiseFileRef.current?.click(),
          disabled: importRomaneio.isPending,
        },
        { separator: true, label: "" },
        {
          label: "Saída para a loja",
          onClick: () =>
            navigate({ to: "/expedicao/saida", search: { cargaId: undefined, clienteId: undefined } }),
        },
        {
          label: "Entrega na loja",
          onClick: () => navigate({ to: "/expedicao/entrega", search: { cargaId: undefined } }),
        },
        { label: "Rastreio", onClick: () => navigate({ to: "/expedicao/rastreio" }) },
        { label: "Modo TV", onClick: () => navigate({ to: "/expedicao/tv" }) },
      ]}
    />
  );

  const importHeaderActions = buildHeaderActions();

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

  const clienteNome =
    one(detail?.clientes as { nome: string } | { nome: string }[] | null)?.nome ??
    (detail as { cliente_nome?: string } | undefined)?.cliente_nome ??
    "Sem loja vinculada";
  const motorista = (detail?.motoristas as { nome: string } | null)?.nome ?? null;
  const placa = (detail?.caminhoes as { placa: string } | null)?.placa ?? null;
  const rota = (detail?.rotas as { nome: string } | null)?.nome ?? null;
  const statusOrdem = (detail as { status_ordem?: string } | undefined)?.status_ordem ?? null;
  const numeroOrdem =
    (detail as { numero_ordem?: string | null } | undefined)?.numero_ordem ??
    detail?.codigo?.replace(/^PV-/, "") ??
    detail?.codigo ??
    null;
  const statusLabel = statusOrdem
    ? (STATUS_ORDEM_LABEL[statusOrdem as StatusOrdem] ?? statusOrdem)
    : detail?.status === "carregando"
      ? "Em carregamento"
      : detail?.status === "concluida"
        ? "Concluída"
        : detail?.status === "aguardando"
          ? "Aguardando"
          : detail?.status ?? "";
  const podeConferir =
    !!activeId &&
    (!statusOrdem || statusOrdem === "importada" || statusOrdem === "conferida") &&
    detail?.status !== "concluida";
  const saidaBloqueada =
    statusOrdem === "em_transito" ||
    statusOrdem === "entregue" ||
    statusOrdem === "entregue_parcial" ||
    statusOrdem === "recusada";

  return (
    <div>
      {importFileInputs}
      <PageHeader
        title="Painel de Carga"
        subtitle="Abastecimento e conferência por loja"
        actions={buildHeaderActions(
          podeConferir ? (
            <Button
              size="sm"
              className="min-h-11 lg:min-h-9"
              disabled={conferirPedido.isPending || saidaBloqueada}
              onClick={handleConferirPedido}
            >
              <CheckCircle2 size={14} className="mr-1" /> Conferir pedido
            </Button>
          ) : detail?.status !== "concluida" && !saidaBloqueada ? (
            <Button
              size="sm"
              className="min-h-11 lg:min-h-9"
              disabled={finalizar.isPending}
              onClick={handleFinalizar}
            >
              <Package size={14} className="mr-1" /> Finalizar carga
            </Button>
          ) : undefined,
        )}
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

      {cargasSemCliente.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>{cargasSemCliente.length} carga(s) sem loja</strong>
            {" — "}
            {cargasSemCliente
              .slice(0, 5)
              .map((c) => c.numero_ordem || c.codigo)
              .join(", ")}
            {cargasSemCliente.length > 5 ? ` +${cargasSemCliente.length - 5}` : ""}
            . Abra a carga e vincule o supermercado (ou use Saída para a loja).
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-2 md:gap-3 mb-4">
        <Select value={activeId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full md:w-[280px] h-11 lg:h-9">
            <SelectValue placeholder="Selecionar carregamento" />
          </SelectTrigger>
          <SelectContent>
            {cargas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.numero_ordem || c.codigo} · {c.cliente_nome || "Sem loja"}
                {c.status_ordem
                  ? ` (${STATUS_ORDEM_LABEL[c.status_ordem as StatusOrdem] ?? c.status_ordem})`
                  : ` (${c.status})`}
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
            label: "Conferido",
            value: totalItens ? `${progresso}%` : "0%",
            tone: "ok",
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
                  {statusOrdem ? (
                    <StatusOrdemBadge status={statusOrdem} />
                  ) : statusLabel ? (
                    <span className="chip chip-info">{statusLabel}</span>
                  ) : null}
                  {activeId && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: "/expedicao/rotas", search: { cargaId: activeId } })
                      }
                      className="ml-auto inline-flex items-center gap-1 min-h-9 px-3 rounded-lg border border-border text-xs font-semibold text-navy hover:bg-secondary"
                    >
                      <Package size={12} /> Ordem de separação
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2">
                  <ChipLabel label="OS" value={numeroOrdem} />
                  <ChipLabel label="Placa" value={placa && placa !== "—" ? placa : null} />
                  <ChipLabel
                    label="Motorista"
                    value={motorista && motorista !== "—" ? motorista : null}
                  />
                  <ChipLabel
                    label="Rota"
                    value={rota && rota !== "—" ? rota : null}
                    className="hidden sm:inline-flex"
                  />
                  {detail?.hora_inicio && (
                    <ChipLabel label="Início" value={formatTime(detail.hora_inicio)} />
                  )}
                  <ChipLabel label="Itens" value={totalItens} tone="teal" />
                  <ChipLabel label="Caixas" value={totalRealCx} tone="teal" />
                </div>
                {statusOrdem && <FluxoOrdemStepper status={statusOrdem} compact />}
                {activeId && (
                  <ProximoPassoLinks
                    statusOrdem={statusOrdem}
                    cargaId={activeId}
                    clienteId={detail?.cliente_id}
                  />
                )}
                {itensSemFator.length > 0 && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <strong>Sem conversão ({itensSemFator.length})</strong>
                    {": "}
                    {itensSemFator.slice(0, 4).join(", ")}
                    {itensSemFator.length > 4 ? ` +${itensSemFator.length - 4}` : ""}
                    {" — "}
                    <Link to="/gestao/produtos" className="underline font-medium">
                      cadastrar em Produtos
                    </Link>
                  </div>
                )}
                {!detail?.cliente_id && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <strong>Carga sem loja vinculada</strong>
                        {" — "}vincule o supermercado para aparecer na Saída para a loja.
                        {detail?.cliente_cnpj ? ` CNPJ: ${detail.cliente_cnpj}` : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-56">
                        <SeletorCadastro
                          tipo="cliente"
                          value={null}
                          placeholder="Vincular supermercado…"
                          onChange={(id) => {
                            if (!id || !activeId) return;
                            vincularCliente.mutate(
                              { carga_id: activeId, cliente_id: id },
                              {
                                onSuccess: (r) =>
                                  toast.success(`Loja vinculada: ${r.cliente_nome}`),
                                onError: (e) =>
                                  toast.error(e instanceof Error ? e.message : "Erro ao vincular"),
                              },
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <RomaneioListaEnxuta
                familias={familiasEnxutas}
                siglas={siglasCx}
                onEdit={(it) => setEditingItemId(it.id)}
              />
              <EditarItemDialog
                item={editingItem}
                siglas={siglasCx}
                open={!!editingItemId}
                onOpenChange={(o) => {
                  if (!o) setEditingItemId(null);
                }}
                onSave={handleSaveItemEdit}
                saving={updateItem.isPending}
              />
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
              <div className="flex items-center gap-2">
                {realTouched && (
                  <button
                    type="button"
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
                <button
                  type="button"
                  onClick={() => setAjustarCaixas((v) => !v)}
                  className="text-xs font-semibold text-primary-dark hover:underline"
                >
                  {ajustarCaixas ? "Ocultar ajuste" : "Ajustar caixas"}
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-1">Tipo</th>
                  <th className="text-right py-1">Sugerido</th>
                  <th className="text-right py-1">Real</th>
                  <th className="text-right py-1 w-16">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {(tiposCx.length
                  ? tiposCx
                  : [
                      { sigla: "G", nome: "Grande" },
                      { sigla: "I", nome: "Isopor" },
                      { sigla: "P", nome: "Plástica" },
                    ]
                ).map((t) => {
                  const k = t.sigla;
                  const diff = safeNum(realCaixas[k]) - safeNum(sugCaixas[k]);
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="py-2 font-semibold text-navy">
                        {t.nome} · {k}
                      </td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        {safeNum(sugCaixas[k])}
                      </td>
                      <td className="py-2 text-right">
                        {ajustarCaixas ? (
                          <NumberStepper
                            size="sm"
                            value={safeNum(realCaixas[k])}
                            onChange={(v) => {
                              setRealTouched(true);
                              const next = { ...realCaixas, [k]: safeNum(v) };
                              setRealCaixas(next);
                              persistResumo(next);
                            }}
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-navy">
                            {safeNum(realCaixas[k])}
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2 text-right font-bold tabular-nums text-xs"
                        style={{
                          color:
                            diff === 0
                              ? "var(--muted-foreground)"
                              : diff > 0
                                ? "var(--info)"
                                : "var(--danger)",
                        }}
                      >
                        {diff === 0 ? "—" : `Diferença · ${diff > 0 ? `+${diff}` : diff}`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-secondary/30">
                  <td className="py-2 font-bold text-navy">Total</td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">{totalSugCx}</td>
                  <td className="py-2 text-right font-bold text-navy tabular-nums">{totalRealCx}</td>
                  <td className="py-2 text-right" />
                </tr>
              </tbody>
            </table>
          </div>
          <button
            onClick={handleFinalizar}
            disabled={
              finalizar.isPending ||
              detail?.status === "concluida" ||
              saidaBloqueada ||
              podeConferir
            }
            className="mt-5 w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
          >
            <Package size={16} /> Finalizar carga
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {podeConferir
              ? "Use Conferir pedido no topo. Depois finalize para Em carga."
              : "Finalizar promove a Em carga para a saída."}
          </p>
        </div>
      </div>

      <div className="mt-5 sm:mt-6">
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-sm font-bold text-navy flex items-center gap-2">
              <Truck size={14} /> Cargas do dia
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
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={filtroRota} onValueChange={setFiltroRota}>
              <SelectTrigger className="w-full sm:w-[200px] h-11 lg:h-9">
                <SelectValue placeholder="Filtrar rota" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as rotas</SelectItem>
                {rotasDisponiveis.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-11 lg:h-9"
              placeholder="Buscar loja ou nº OS…"
              value={buscaCarga}
              onChange={(e) => setBuscaCarga(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cargasFiltradas.length === 0 && (
            <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
              Nenhuma carga neste filtro.
            </div>
          )}
          {cargasFiltradas.map((c) => {
            const nome = c.cliente_nome || one(c.clientes as { nome: string } | { nome: string }[] | null)?.nome || "Sem loja vinculada";
            const mot = c.motorista_nome || one(c.motoristas as { nome: string } | { nome: string }[] | null)?.nome || null;
            const rotaNome = c.rota_nome || one(c.rotas as { nome: string } | { nome: string }[] | null)?.nome || null;
            const numOs = c.numero_ordem || c.codigo?.replace(/^PV-/, "") || c.codigo;
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`card-base p-4 text-left transition ring-2 ${active ? "ring-primary" : "ring-transparent"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-muted-foreground tabular-nums">
                    OS {numOs}
                  </span>
                  {c.status_ordem ? (
                    <StatusOrdemBadge status={c.status_ordem} />
                  ) : (
                    <>
                      {c.status === "concluida" && <span className="chip chip-ok">Concluída</span>}
                      {c.status === "carregando" && <span className="chip chip-info">Carregando</span>}
                      {c.status === "aguardando" && <span className="chip chip-warn">Aguardando</span>}
                    </>
                  )}
                </div>
                <div className="font-bold text-navy text-sm">{nome}</div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {rotaNome && <div>Rota · {rotaNome}</div>}
                  {mot && <div>Motorista · {mot}</div>}
                  <div>
                    Itens · {Number(c.total_linhas ?? 0)}
                    {" · "}
                    Caixas · {Number(c.total_caixas ?? 0)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide">
                    Conferido · {Number(c.progresso ?? 0)}%
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden" title={`Conferido · ${Number(c.progresso ?? 0)}%`}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Number(c.progresso ?? 0)}%`, background: "var(--primary)" }}
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
