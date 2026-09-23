import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PageHeader } from "@/components/page-header";
import {
  useConfiguracoes,
  useUpdateConfiguracao,
  useFornecedores,
  useClientes,
} from "@/hooks/use-cadastros";
import { useMotivosAjuste, useSaveMotivoAjuste } from "@/hooks/use-inventario";
import { usePosicoes, useSaldosAbertura } from "@/hooks/use-ledger";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useAuth } from "@/lib/auth";
import {
  CONFIG_BOOLEAN_KEYS,
  CONFIG_GROUP_LABELS,
  configGroup,
  configLabel,
  parseConfigBool,
  statusLabel,
  type ConfigGroupId,
} from "@/lib/labels";
import { ChevronDown } from "lucide-react";

export function RegrasPage() {
  const [tab, setTab] = useState("parametros");

  return (
    <div>
      <PageHeader title="Regras do sistema" subtitle="Tolerâncias, motivos de ajuste e saldos iniciais" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
          <TabsTrigger value="motivos">Motivos de ajuste</TabsTrigger>
          <TabsTrigger value="abertura">Saldo inicial de caixas</TabsTrigger>
        </TabsList>
        <TabsContent value="parametros">
          <ParametrosTab />
        </TabsContent>
        <TabsContent value="motivos">
          <MotivosTab />
        </TabsContent>
        <TabsContent value="abertura">
          <AberturaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const CONFIG_DESCRICOES: Record<string, string> = {
  tolerancia_pct: "Margem aceita ao comparar quantidade recebida vs esperada",
  tolerancia_min_cx: "Número mínimo de caixas para ignorar diferenças pequenas",
  tolerancia_min_un: "Número mínimo de unidades para ignorar diferenças pequenas",
  impacto_falta_por_unidade: "Valor financeiro estimado por unidade faltante",
  diferenca_contagem_tolerada: "Diferença máxima aceita na contagem de inventário",
  dias_encerrar_pedido: "Após quantos dias um pedido vencido é encerrado automaticamente",
  dias_entrega_prevista: "Prazo padrão para entrega ao criar pedidos",
  dias_confirmacao_fornecedor: "Prazo para o fornecedor confirmar a saída na roça",
  dias_conciliar_inventario: "Prazo para conciliar inventário após a contagem",
  lembrete_contagem_dias: "A cada quantos dias lembrar de contar",
  lembrete_inventario_galpao_dias: "Lembrete de inventário do Packing (dias)",
  lembrete_inventario_cliente_dias: "Lembrete de inventário no cliente (dias)",
  lembrete_inventario_fornecedor_dias: "Lembrete de inventário no fornecedor (dias)",
  inventario_frequencia_dias: "Frequência obrigatória de contagem de caixas",
  inventario_bloquear_operacao: "Impede operação se a posição estiver com inventário vencido",
  inventario_alerta_pendente: "Mostra alerta ao administrador quando houver inventário pendente",
  inventario_embalagem_alerta: "Alerta inventário de embalagens pendente",
  inventario_embalagem_frequencia_dias: "Frequência da contagem de embalagens",
  estoque_minimo_giro_dias: "Janela usada para calcular giro e alertas de estoque mínimo",
  alvo_fill_rate: "Meta de fill rate no desempenho de fornecedores",
  benchmark_quebra_fornecedor: "Referência de quebra aceitável por fornecedor",
  benchmark_taxa_perda: "Referência de taxa de perda de caixas",
  aging_alerta_dias: "Idade a partir da qual caixas entram em alerta",
  aging_critico_dias: "Idade a partir da qual caixas ficam críticas",
  auto_rotate_tv_segundos: "Intervalo de rotação automática no modo TV do pátio",
};

type ConfigRow = { id: string; chave: string; valor: unknown; descricao: string | null };

const GROUP_ORDER: ConfigGroupId[] = [
  "tolerancias",
  "prazos",
  "inventario",
  "indicadores",
  "outros",
  "avancados",
];

function ParametroCampo({
  c,
  onSave,
}: {
  c: ConfigRow;
  onSave: (chave: string, valor: unknown) => void;
}) {
  const isBool = CONFIG_BOOLEAN_KEYS.has(c.chave);
  const desc = CONFIG_DESCRICOES[c.chave] ?? c.descricao ?? "";

  if (isBool) {
    const checked = parseConfigBool(c.valor);
    return (
      <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
        <div className="min-w-0 space-y-0.5">
          <Label className="text-sm">{configLabel(c.chave)}</Label>
          {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground w-8 text-right">
            {checked ? "Sim" : "Não"}
          </span>
          <Switch
            checked={checked}
            onCheckedChange={(v) => onSave(c.chave, v)}
            aria-label={configLabel(c.chave)}
          />
        </div>
      </div>
    );
  }

  const display = String(c.valor ?? "").replace(/^"|"$/g, "");
  return (
    <div className="space-y-1 py-3 border-b border-border last:border-0">
      <Label>{configLabel(c.chave)}</Label>
      {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
      <Input
        defaultValue={display}
        key={`${c.chave}:${display}`}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (c.chave === "aging_alerta_dias") {
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 1 || n > 60) {
              toast.error("Alerta de caixas deve ser entre 1 e 60 dias");
              e.target.value = "7";
              onSave(c.chave, "7");
              return;
            }
          }
          onSave(c.chave, raw);
        }}
      />
    </div>
  );
}

function ParametrosTab() {
  const { data: configs = [] } = useConfiguracoes();
  const updateConfig = useUpdateConfiguracao();
  const [avancadosOpen, setAvancadosOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<ConfigGroupId, ConfigRow[]>();
    for (const raw of configs as ConfigRow[]) {
      const g = configGroup(raw.chave);
      const list = map.get(g) ?? [];
      list.push(raw);
      map.set(g, list);
    }
    return map;
  }, [configs]);

  const save = (chave: string, valor: unknown) => {
    updateConfig.mutate(
      { chave, valor },
      { onSuccess: () => toast.success("Salvo") },
    );
  };

  const renderGroup = (id: ConfigGroupId) => {
    const rows = grouped.get(id);
    if (!rows?.length) return null;
    const body = (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{CONFIG_GROUP_LABELS[id]}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rows.map((c) => (
            <ParametroCampo key={c.id} c={c} onSave={save} />
          ))}
        </CardContent>
      </Card>
    );
    if (id !== "avancados") return <div key={id}>{body}</div>;
    return (
      <Collapsible key={id} open={avancadosOpen} onOpenChange={setAvancadosOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            Avançados
            <ChevronDown
              size={16}
              className={`transition-transform ${avancadosOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">{body}</CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cada parâmetro controla uma regra do sistema. Altere com cuidado. Opções Sim/Não usam o
        interruptor; avançados ficam recolhidos.
      </p>
      {GROUP_ORDER.map((id) => renderGroup(id))}
    </div>
  );
}

function MotivosTab() {
  const { data: motivos = [] } = useMotivosAjuste(true);
  const save = useSaveMotivoAjuste();
  const [nome, setNome] = useState("");
  const [sentido, setSentido] = useState("saida");
  const [natureza, setNatureza] = useState("ajuste");
  const [custo, setCusto] = useState(false);
  const [contraria, setContraria] = useState(false);
  const [showInativos, setShowInativos] = useState(false);

  const ativos = motivos.filter((m) => m.ativo);
  const inativos = motivos.filter((m) => !m.ativo);
  const rows = showInativos ? [...ativos, ...inativos] : ativos;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Motivos usados em ajustes de inventário. Cada motivo define se é entrada, saída ou transferência.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Novo motivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Nome do motivo" value={nome} onChange={(e) => setNome(e.target.value)} />
            <select className="h-9 rounded-md border px-2 text-sm" value={sentido} onChange={(e) => setSentido(e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="transferencia">Transferência</option>
            </select>
            <select className="h-9 rounded-md border px-2 text-sm" value={natureza} onChange={(e) => setNatureza(e.target.value)}>
              <option value="ajuste">Ajuste</option>
              <option value="perda">Perda</option>
            </select>
            <div className="flex gap-4">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={custo} onChange={(e) => setCusto(e.target.checked)} />
                Entra em custo
              </label>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={contraria} onChange={(e) => setContraria(e.target.checked)} />
                Posição contrária
              </label>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!nome.trim()) return;
              save.mutate(
                {
                  nome: nome.trim(),
                  sentido,
                  natureza,
                  entra_em_custo: custo,
                  exige_posicao_contraria: contraria,
                },
                {
                  onSuccess: () => {
                    toast.success("Motivo salvo");
                    setNome("");
                  },
                }
              );
            }}
          >
            Adicionar
          </Button>
        </CardContent>
      </Card>

      {inativos.length > 0 && (
        <label className="text-sm flex items-center gap-1.5">
          <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
          Mostrar inativos ({inativos.length})
        </label>
      )}

      <ul className="text-sm space-y-1">
        {rows.map((m) => (
          <li
            key={m.id}
            className={`flex justify-between items-center border-b border-border py-2 ${m.ativo ? "" : "opacity-50"}`}
          >
            <span>
              {m.nome} · {statusLabel(m.sentido)} · {statusLabel(m.natureza)}
              {m.entra_em_custo ? " · custo" : ""}
              {m.exige_posicao_contraria ? " · transferência" : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() =>
                save.mutate(
                  { ...m, ativo: !m.ativo },
                  { onSuccess: () => toast.success(m.ativo ? "Inativado" : "Reativado") }
                )
              }
            >
              {m.ativo ? "Inativar" : "Reativar"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AberturaTab() {
  const { data: posicoes = [] } = usePosicoes();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: clientes = [] } = useClientes();
  const { data: fornecedores = [] } = useFornecedores();
  const { user } = useAuth();
  const abertura = useSaldosAbertura();
  const [pos, setPos] = useState("");
  const [sigla, setSigla] = useState("");
  const [qtd, setQtd] = useState("0");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Lançamento único da posição inicial de caixas. Não entra em enviadas/retornadas — só define o ponto de partida.
      </p>
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="space-y-1">
            <Label>Posição</Label>
            <select className="h-9 w-full rounded-md border px-2 text-sm" value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="">Selecione…</option>
              {(posicoes as { id: string; tipo: string; ref_id: string | null }[]).map((p) => {
                const nomePosicao =
                  p.tipo === "galpao"
                    ? "Galpão"
                    : p.tipo === "cliente"
                      ? (clientes as { id: string; nome: string }[]).find((c) => c.id === p.ref_id)?.nome
                      : (fornecedores as { id: string; nome: string }[]).find((f) => f.id === p.ref_id)?.nome;
                return (
                  <option key={p.id} value={p.id}>
                    {p.tipo} · {nomePosicao ?? p.ref_id}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Tipo de caixa</Label>
            <SeletorCadastro
              tipo="tipo_caixa"
              value={tipos.find((t) => t.sigla === sigla)?.id ?? null}
              onChange={(_id, item) => setSigla(item?.meta?.sigla ?? "")}
            />
          </div>
          <div className="space-y-1">
            <Label>Quantidade</Label>
            <Input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" min={0} />
          </div>
          <Button
            onClick={() =>
              abertura.mutate(
                {
                  posicao_id: pos,
                  tipo_caixa: sigla,
                  quantidade: Number(qtd),
                  registrado_por: user!.id,
                },
                {
                  onSuccess: () => toast.success("Abertura lançada"),
                  onError: (e) => toast.error(e.message),
                }
              )
            }
            disabled={!pos || !sigla || abertura.isPending}
          >
            Lançar abertura
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
