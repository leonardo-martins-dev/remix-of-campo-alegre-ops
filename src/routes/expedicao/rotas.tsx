import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Route as RouteIcon,
  Package,
  Store,
  Truck,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronDown,
  Tv,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useExpedicaoPorRota,
  useProdutosPorRota,
  useCargasLojaRota,
  useRomaneioComCaixas,
  useAtualizarStatusSeparacao,
  SEM_ROTA_ID,
  type RotaExpedicao,
  type ProdutoRota,
  type CargaLojaRota,
} from "@/hooks/use-expedicao-rotas";

export const Route = createFileRoute("/expedicao/rotas")({
  component: Page,
  head: () => ({ meta: [{ title: "Expedição por Rota · Campo Alegre" }] }),
});

type FamiliaGroup = {
  familia: string;
  produtos: ProdutoRota[];
  totalQtd: number;
  totalCaixas: number;
};

function groupByFamilia(produtos: ProdutoRota[]): FamiliaGroup[] {
  const map = new Map<string, ProdutoRota[]>();
  for (const p of produtos) {
    const fam = p.familia_nome ?? "Outros";
    if (!map.has(fam)) map.set(fam, []);
    map.get(fam)!.push(p);
  }
  return [...map.entries()].map(([familia, prods]) => ({
    familia,
    produtos: prods,
    totalQtd: prods.reduce((a, p) => a + Number(p.quantidade_total), 0),
    totalCaixas: prods.reduce((a, p) => a + Number(p.caixas_sugeridas), 0),
  }));
}

function Page() {
  const { data: rotasExpedicao = [], isLoading: loadingRotas } = useExpedicaoPorRota();
  const [selectedRotaId, setSelectedRotaId] = useState<string | null>(null);
  const [expandedLoja, setExpandedLoja] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"produtos" | "lojas">("produtos");

  const activeRotaId = useMemo(() => {
    if (selectedRotaId) return selectedRotaId;
    return rotasExpedicao[0]?.rota_id ?? null;
  }, [selectedRotaId, rotasExpedicao]);

  const { data: produtos = [], isLoading: loadingProdutos } = useProdutosPorRota(activeRotaId);
  const { data: lojas = [], isLoading: loadingLojas } = useCargasLojaRota(activeRotaId);

  const familias = useMemo(() => groupByFamilia(produtos), [produtos]);

  const activeRota = rotasExpedicao.find((r) => r.rota_id === activeRotaId);

  const totalCaixas = familias.reduce((a, f) => a + f.totalCaixas, 0);
  const totalProdutos = produtos.length;
  const totalLojas = lojas.length;
  const lojasCarregadas = lojas.filter((l) => l.status_separacao === "carregado").length;
  const lojasSeparadas = lojas.filter((l) => l.status_separacao === "separado").length;

  if (loadingRotas) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando rotas do dia...</p>
      </div>
    );
  }

  if (!rotasExpedicao.length) {
    return (
      <div>
        <PageHeader
          title="Expedição por Rota"
          subtitle="Separação por rota com sugestão de caixas"
          actions={
            <Link
              to="/expedicao"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
            >
              <ArrowLeft size={14} /> Voltar ao painel
            </Link>
          }
        />
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma carga programada para hoje nas rotas. Importe pedidos ou aguarde conferências finalizadas.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Expedição por Rota"
        subtitle="Separação por rota com sugestão de caixas"
        actions={
          <>
            <Link
              to="/expedicao"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
            >
              <ArrowLeft size={14} /> Painel por loja
            </Link>
            <Link
              to="/expedicao/tv"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
            >
              <Tv size={14} /> Modo TV
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={activeRotaId ?? ""} onValueChange={setSelectedRotaId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Selecionar rota" />
          </SelectTrigger>
          <SelectContent>
            {rotasExpedicao.map((r) => (
              <SelectItem key={r.rota_id} value={r.rota_id}>
                <div className="flex items-center gap-2">
                  <RouteIcon size={14} />
                  {r.rota_nome}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({r.total_lojas} loja{r.total_lojas !== 1 ? "s" : ""})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
          <button
            onClick={() => setViewMode("produtos")}
            className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
              viewMode === "produtos"
                ? "bg-card text-navy shadow-sm"
                : "text-muted-foreground hover:text-navy"
            }`}
          >
            <Package size={12} className="inline mr-1" />
            Por produto
          </button>
          <button
            onClick={() => setViewMode("lojas")}
            className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
              viewMode === "lojas"
                ? "bg-card text-navy shadow-sm"
                : "text-muted-foreground hover:text-navy"
            }`}
          >
            <Store size={12} className="inline mr-1" />
            Por loja
          </button>
        </div>
      </div>

      <StatStrip
        items={[
          { label: "Produtos", value: String(totalProdutos) },
          { label: "Caixas sugeridas", value: String(totalCaixas), tone: "info" },
          { label: "Lojas na rota", value: String(totalLojas) },
          { label: "Separadas", value: String(lojasSeparadas), tone: "warn" },
          { label: "Carregadas", value: String(lojasCarregadas), tone: "ok" },
        ]}
      />

      {activeRota && activeRota.rota_id === SEM_ROTA_ID && (
        <div className="my-4 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <p className="text-sm text-warning-foreground">
            <strong>Atenção:</strong> Existem {totalLojas} loja(s) sem rota definida. 
            Configure as rotas em <Link to="/gestao" className="underline">Gestão → Rotas</Link>.
          </p>
        </div>
      )}

      {viewMode === "produtos" ? (
        <ProdutosView
          familias={familias}
          loading={loadingProdutos}
          rotaNome={activeRota?.rota_nome ?? ""}
        />
      ) : (
        <LojasView
          lojas={lojas}
          loading={loadingLojas}
          expandedLoja={expandedLoja}
          setExpandedLoja={setExpandedLoja}
        />
      )}

      <div className="mt-6">
        <h3 className="text-sm font-bold text-navy flex items-center gap-2 mb-3">
          <RouteIcon size={14} /> Outras rotas hoje
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {rotasExpedicao.map((r) => {
            const active = r.rota_id === activeRotaId;
            const progress = r.total_lojas
              ? Math.round(((r.lojas_carregadas + r.lojas_separadas) / r.total_lojas) * 100)
              : 0;
            return (
              <button
                key={r.rota_id}
                type="button"
                onClick={() => setSelectedRotaId(r.rota_id)}
                className={`card-base p-4 text-left transition ring-2 ${
                  active ? "ring-primary" : "ring-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                    <RouteIcon size={12} />
                    {r.rota_nome}
                  </span>
                  {r.lojas_carregadas === r.total_lojas && r.total_lojas > 0 && (
                    <span className="chip chip-ok">Completa</span>
                  )}
                </div>
                <div className="font-bold text-navy text-sm">
                  {r.total_lojas} loja{r.total_lojas !== 1 ? "s" : ""}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.lojas_separadas} separada(s) · {r.lojas_carregadas} carregada(s)
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${progress}%`, background: "var(--primary)" }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProdutosView({
  familias,
  loading,
  rotaNome,
}: {
  familias: FamiliaGroup[];
  loading: boolean;
  rotaNome: string;
}) {
  if (loading) {
    return (
      <div className="card-base p-8 text-center text-sm text-muted-foreground">
        Carregando produtos...
      </div>
    );
  }

  if (!familias.length) {
    return (
      <div className="card-base p-8 text-center text-sm text-muted-foreground">
        Nenhum produto para separar nesta rota.
      </div>
    );
  }

  return (
    <div className="card-base overflow-x-auto">
      <div className="p-5 border-b border-border">
        <h2 className="text-lg font-bold text-navy">
          Total a separar: {rotaNome}
        </h2>
        <p className="text-sm text-muted-foreground">
          Soma de todos os pedidos das lojas desta rota
        </p>
      </div>

      <div className="divide-y divide-border">
        {familias.map((fam, fi) => (
          <div key={fam.familia}>
            <div className="px-5 py-2 bg-secondary/50 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Família {fi + 1} · {fam.familia}
              </span>
              <span className="text-xs font-semibold text-navy">
                {fam.totalCaixas} caixa{fam.totalCaixas !== 1 ? "s" : ""}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-2">Produto</th>
                  <th className="text-right px-3 py-2">Qtd total</th>
                  <th className="text-right px-3 py-2">Un/cx</th>
                  <th className="text-right px-3 py-2">Caixas sug.</th>
                  <th className="text-right px-5 py-2">Lojas</th>
                </tr>
              </thead>
              <tbody>
                {fam.produtos.map((p) => (
                  <tr key={p.produto_id} className="border-t border-border">
                    <td className="px-5 py-3 font-semibold text-navy">{p.produto_nome}</td>
                    <td className="px-3 py-3 text-right text-ink">
                      {Number(p.quantidade_total).toFixed(0)} {p.unidade ?? "un"}
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {p.unidades_por_caixa ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="chip chip-info">{p.caixas_sugeridas}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {p.num_lojas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function LojasView({
  lojas,
  loading,
  expandedLoja,
  setExpandedLoja,
}: {
  lojas: CargaLojaRota[];
  loading: boolean;
  expandedLoja: string | null;
  setExpandedLoja: (id: string | null) => void;
}) {
  const atualizarStatus = useAtualizarStatusSeparacao();

  if (loading) {
    return (
      <div className="card-base p-8 text-center text-sm text-muted-foreground">
        Carregando lojas...
      </div>
    );
  }

  if (!lojas.length) {
    return (
      <div className="card-base p-8 text-center text-sm text-muted-foreground">
        Nenhuma loja com carga nesta rota.
      </div>
    );
  }

  const handleStatusChange = (
    cargaId: string,
    novoStatus: "pendente" | "separado" | "carregado"
  ) => {
    atualizarStatus.mutate(
      { cargaId, status: novoStatus },
      {
        onSuccess: () => {
          const label =
            novoStatus === "separado"
              ? "Marcado como separado"
              : novoStatus === "carregado"
              ? "Marcado como carregado"
              : "Status resetado";
          toast.success(label);
        },
        onError: () => toast.error("Erro ao atualizar status"),
      }
    );
  };

  return (
    <div className="space-y-3">
      {lojas.map((loja) => {
        const isExpanded = expandedLoja === loja.carga_id;
        return (
          <div key={loja.carga_id} className="card-base">
            <button
              type="button"
              className="w-full p-4 flex items-center justify-between text-left"
              onClick={() => setExpandedLoja(isExpanded ? null : loja.carga_id)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div>
                  <div className="font-bold text-navy">{loja.cliente_nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {loja.carga_codigo} · {loja.total_itens} itens · {loja.caixas_sugeridas} caixas
                    {loja.motorista_nome && ` · ${loja.motorista_nome}`}
                    {loja.caminhao_placa && ` · ${loja.caminhao_placa}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {loja.status_separacao === "pendente" && (
                  <span className="chip chip-muted">Pendente</span>
                )}
                {loja.status_separacao === "separado" && (
                  <span className="chip chip-warn">Separado</span>
                )}
                {loja.status_separacao === "carregado" && (
                  <span className="chip chip-ok">Carregado</span>
                )}
              </div>
            </button>

            {isExpanded && (
              <LojaDetail
                cargaId={loja.carga_id}
                status={loja.status_separacao}
                onStatusChange={(s) => handleStatusChange(loja.carga_id, s)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LojaDetail({
  cargaId,
  status,
  onStatusChange,
}: {
  cargaId: string;
  status: "pendente" | "separado" | "carregado";
  onStatusChange: (s: "pendente" | "separado" | "carregado") => void;
}) {
  const { data: itens = [], isLoading } = useRomaneioComCaixas(cargaId);

  const familias = useMemo(() => {
    const map = new Map<string, typeof itens>();
    for (const it of itens) {
      const fam = it.familia_nome ?? "Outros";
      if (!map.has(fam)) map.set(fam, []);
      map.get(fam)!.push(it);
    }
    return [...map.entries()];
  }, [itens]);

  const totalCaixas = itens.reduce((a, i) => a + i.caixas_sugeridas, 0);

  if (isLoading) {
    return (
      <div className="px-4 pb-4 text-sm text-muted-foreground">Carregando itens...</div>
    );
  }

  return (
    <div className="border-t border-border">
      <div className="p-4 bg-secondary/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold text-navy">{itens.length} itens</span>
            <span className="text-muted-foreground ml-2">·</span>
            <span className="ml-2 font-semibold text-primary">{totalCaixas} caixas sugeridas</span>
          </div>
          <div className="flex gap-2">
            {status === "pendente" && (
              <Button size="sm" variant="outline" onClick={() => onStatusChange("separado")}>
                <CheckCircle2 size={14} className="mr-1" />
                Marcar separado
              </Button>
            )}
            {status === "separado" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStatusChange("pendente")}
                >
                  Voltar pendente
                </Button>
                <Button size="sm" onClick={() => onStatusChange("carregado")}>
                  <Truck size={14} className="mr-1" />
                  Marcar carregado
                </Button>
              </>
            )}
            {status === "carregado" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onStatusChange("separado")}
              >
                Voltar separado
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {familias.map(([familia, prods]) => (
          <div key={familia}>
            <div className="px-4 py-2 bg-secondary/20 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {familia}
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Produto</th>
                  <th className="text-right px-3 py-2">Qtd</th>
                  <th className="text-right px-3 py-2">Caixas sug.</th>
                  <th className="text-right px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {prods.map((it) => (
                  <tr key={it.id} className="border-t border-border/50">
                    <td className="px-4 py-2 font-medium text-navy">{it.produto_nome}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(it.quantidade_romaneio).toFixed(0)} {it.unidade ?? "un"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="chip chip-info text-xs">{it.caixas_sugeridas}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {it.status === "ok" && <span className="chip chip-ok text-xs">OK</span>}
                      {it.status === "pendente" && (
                        <span className="chip chip-muted text-xs">Pendente</span>
                      )}
                      {it.status === "corrigido" && (
                        <span className="chip chip-warn text-xs">Corrigido</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
