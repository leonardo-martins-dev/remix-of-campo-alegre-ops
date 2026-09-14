import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { configLabel, statusLabel } from "@/lib/labels";

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

function ParametrosTab() {
  const { data: configs = [] } = useConfiguracoes();
  const updateConfig = useUpdateConfiguracao();

  const DESCRICOES: Record<string, string> = {
    tolerancia_pct: "Margem aceita ao comparar quantidade recebida vs esperada",
    tolerancia_min_cx: "Número mínimo de caixas para ignorar diferenças pequenas",
    tolerancia_min_un: "Número mínimo de unidades para ignorar diferenças pequenas",
    impacto_falta_por_unidade: "Valor financeiro estimado por unidade faltante",
    diferenca_contagem_tolerada: "Diferença máxima aceita na contagem de inventário",
    dias_encerrar_pedido: "Após quantos dias um pedido vencido é encerrado automaticamente",
    dias_entrega_prevista: "Prazo padrão para entrega ao criar pedidos",
    aging_alerta_dias: "Idade (dias) a partir da qual caixas entram em alerta",
    aging_critico_dias: "Idade (dias) a partir da qual caixas ficam em estado crítico",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cada parâmetro controla uma regra do sistema. Altere com cuidado.
      </p>
      {(configs as { id: string; chave: string; valor: unknown; descricao: string | null }[]).map((c) => (
        <Card key={c.id}>
          <CardContent className="pt-4 space-y-1">
            <Label>{configLabel(c.chave)}</Label>
            <p className="text-xs text-muted-foreground">
              {DESCRICOES[c.chave] ?? c.descricao ?? ""}
            </p>
            <Input
              defaultValue={String(c.valor ?? "").replace(/"/g, "")}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (c.chave === "aging_alerta_dias") {
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 1 || n > 60) {
                    toast.error("aging_alerta_dias deve ser entre 1 e 60");
                    e.target.value = "7";
                    updateConfig.mutate({ chave: c.chave, valor: "7" });
                    return;
                  }
                }
                updateConfig.mutate(
                  { chave: c.chave, valor: raw },
                  { onSuccess: () => toast.success("Salvo") }
                );
              }}
            />
          </CardContent>
        </Card>
      ))}
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
            <select className="h-9 w-full rounded-md border px-2 text-sm" value={sigla} onChange={(e) => setSigla(e.target.value)}>
              <option value="">Selecione…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.sigla}>{t.sigla}</option>
              ))}
            </select>
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
