import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Truck } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useConfirmarMovimento, useMovimentosFornecedor, usePosicoes, useRegistrarMovimentoFornecedor, useSaldosCaixa } from "@/hooks/use-ledger";
import { useRegistrarInventario } from "@/hooks/use-inventario";
import { enqueueFornecedorMov, getFornecedorQueue, removeFornecedorFromQueue } from "@/lib/offline-queue";
import { useContagemRascunho } from "@/hooks/use-contagem-rascunho";
import {
  countInformados,
  isInformado,
  loadRascunho,
  rascunhoCaixasKey,
  type ContagemValues,
} from "@/lib/contagem-rascunho";
import { NumberStepper } from "@/components/number-stepper";
import { ChipNaoInformado, ProgressoContagem } from "@/components/contagem-progresso";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { SugestaoCaixas } from "@/components/sugestao-caixas";
import { useSugestaoCaixas } from "@/hooks/use-sugestao-caixas";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";
import { formatDateBRT } from "@/lib/utils-date";

export const Route = createFileRoute("/fornecedor")({
  component: Page,
  head: () => ({ meta: [{ title: "Minhas caixas · Campo Alegre" }] }),
});

type ItemPedido = {
  id: string;
  quantidade_pedida: number;
  produto_id: string | null;
  produtos: { id: string; nome: string; unidade: string } | { id: string; nome: string; unidade: string }[] | null;
};

type PedidoPendente = {
  id: string;
  codigo: string;
  data_prevista: string | null;
  status: string;
  itens_pedido: ItemPedido[];
};

function Page() {
  const { user, profile } = useAuth();
  const fornecedorId = profile?.fornecedor_id ?? null;
  const { data: tipos = [] } = useTiposCaixa();
  const { data: movs = [] } = useMovimentosFornecedor(fornecedorId);
  const confirmar = useConfirmarMovimento();
  const registrar = useRegistrarMovimentoFornecedor();
  const [natureza, setNatureza] = useState<"entrega_vazias" | "recebimento_cheias">("entrega_vazias");
  const [tipo, setTipo] = useState("");
  const [qtd, setQtd] = useState(0);
  const [contest, setContest] = useState<Record<string, number>>({});
  // NOP-322: chave ausente = não informado; só o que foi contado vai no envio.
  const [inv, setInv] = useState<ContagemValues>({});
  const { data: posicoes = [] } = usePosicoes();
  const { data: saldosInv = [] } = useSaldosCaixa();
  const registrarInv = useRegistrarInventario();
  const posForn = (posicoes as { id: string; tipo: string; ref_id: string | null }[])
    .find((p) => p.tipo === "fornecedor" && p.ref_id === fornecedorId);

  const rascunhoKey = posForn ? rascunhoCaixasKey(posForn.id) : null;
  const { salvar: salvarRascunho, limpar: limparRascunho } = useContagemRascunho(rascunhoKey);
  const [rascunhoCarregado, setRascunhoCarregado] = useState(false);

  useEffect(() => {
    if (!rascunhoKey) return;
    setInv(loadRascunho(rascunhoKey)?.values ?? {});
    setRascunhoCarregado(true);
  }, [rascunhoKey]);

  useEffect(() => {
    if (!rascunhoCarregado) return;
    salvarRascunho({ values: inv });
  }, [rascunhoCarregado, inv, salvarRascunho]);

  const setInvQtd = (sigla: string, n: number | null) =>
    setInv((prev) => {
      const next = { ...prev };
      if (n == null) delete next[sigla];
      else next[sigla] = n;
      return next;
    });

  const { data: pedidosPendentes = [] } = useQuery({
    queryKey: ["pedidos-fornecedor", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select(`
          id, codigo, data_prevista, status,
          itens_pedido(id, quantidade_pedida, produto_id, produtos(id, nome, unidade))
        `)
        .eq("fornecedor_id", fornecedorId!)
        .in("status", ["pendente", "parcial"])
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoPendente[];
    },
  });

  const itensParaSugestao = pedidosPendentes.flatMap((p) =>
    p.itens_pedido.map((i) => ({
      produto_id: i.produto_id,
      quantidade: Number(i.quantidade_pedida),
    }))
  );
  const { data: sugestoes } = useSugestaoCaixas(fornecedorId, itensParaSugestao);

  useEffect(() => {
    async function flush() {
      if (!navigator.onLine || !user) return;
      for (const item of getFornecedorQueue()) {
        try {
          await registrar.mutateAsync({ ...item, natureza: item.natureza });
          removeFornecedorFromQueue(item.id);
        } catch { /* keep queued */ }
      }
    }
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [user, registrar]);

  if (!fornecedorId) {
    return <p className="text-sm text-muted-foreground">Usuário sem fornecedor vinculado.</p>;
  }
  const fid = fornecedorId;

  async function handleReg() {
    if (!user || !tipo || qtd <= 0) return;
    const payload = {
      fornecedor_id: fid,
      tipo_caixa: tipo,
      quantidade: qtd,
      natureza,
      registrado_por: user.id,
    };
    if (!navigator.onLine) {
      enqueueFornecedorMov(payload);
      toast.success("Guardado offline — sobe quando o sinal voltar");
      return;
    }
    try {
      await registrar.mutateAsync(payload);
      toast.success("Movimento enviado — aguardando Campo Alegre");
      setQtd(0);
    } catch (e) {
      enqueueFornecedorMov(payload);
      toast.error(e instanceof Error ? e.message : "Erro — ficou na fila");
    }
  }

  const pendentes = (movs as { id: string; confirmacao_status: string; tipo_caixa: string; quantidade: number; natureza: string; created_at: string }[])
    .filter((m) => m.confirmacao_status === "pendente");

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Minhas caixas" subtitle="Confirme ou registre movimentos" />

      <Link
        to="/recebimento/saida-roca"
        className="card-base p-4 mb-6 flex items-center gap-3 hover:border-primary transition-colors"
      >
        <Truck size={24} className="text-primary shrink-0" />
        <span className="min-w-0">
          <span className="block font-bold text-navy">Saída na roça</span>
          <span className="block text-xs text-muted-foreground">
            Avise o que saiu antes de chegar no packing
          </span>
        </span>
        <ChevronRight size={18} className="ml-auto text-muted-foreground shrink-0" />
      </Link>

      {pedidosPendentes.length > 0 && (
        <div className="mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-navy">Pedidos a entregar</h2>
          {pedidosPendentes.map((ped) => (
            <div key={ped.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-navy">{ped.codigo}</span>
                <span className="chip chip-info text-xs">
                  {ped.data_prevista ? `Entrega ${formatDateBRT(ped.data_prevista)}` : "Sem data"}
                </span>
              </div>
              <div className="space-y-2">
                {ped.itens_pedido.map((item) => {
                  const prod = one(item.produtos);
                  const sugestao = item.produto_id ? sugestoes?.get(item.produto_id) : undefined;
                  return (
                    <div key={item.id} className="border-t border-border pt-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{prod?.nome ?? "Produto"}</span>
                        <span className="text-muted-foreground">
                          {Number(item.quantidade_pedida)} {prod?.unidade ?? "un"}
                        </span>
                      </div>
                      <div className="mt-1">
                        <SugestaoCaixas sugestao={sugestao} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {pendentes.map((m) => (
          <div key={m.id} className="rounded-xl border p-3 space-y-2">
            <p className="text-sm font-medium">{m.natureza} · {m.quantidade} {m.tipo_caixa}</p>
            <p className="text-xs text-muted-foreground">{m.created_at.slice(0, 16)}</p>
            <div className="flex gap-2">
              <Button className="min-h-11 flex-1" onClick={() => confirmar.mutate({ id: m.id, acao: "confirmado", userId: user!.id }, { onSuccess: () => toast.success("Confirmado") })}>Confirmar</Button>
              <Button className="min-h-11 flex-1" variant="outline" onClick={() => confirmar.mutate({
                id: m.id, acao: "contestado", userId: user!.id, qtd_contestada: contest[m.id] ?? m.quantidade,
              }, { onSuccess: () => toast.success("Contestação enviada") })}>Contestar</Button>
            </div>
            <Input type="number" placeholder="Qtd que reconhece" value={contest[m.id] ?? ""} onChange={(e) => setContest((s) => ({ ...s, [m.id]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Registrar movimento</h3>
        <select className="h-11 w-full rounded-md border px-2" value={natureza} onChange={(e) => setNatureza(e.target.value as typeof natureza)}>
          <option value="entrega_vazias">Levei vazias</option>
          <option value="recebimento_cheias">Entreguei cheias</option>
        </select>
        <SeletorCadastro
          tipo="tipo_caixa"
          value={tipos.find((t) => t.sigla === tipo)?.id ?? null}
          onChange={(_id, item) => setTipo(item?.meta?.sigla ?? "")}
          placeholder="Tipo…"
        />
        <NumberStepper value={qtd} onChange={setQtd} />
        <Button className="min-h-11 w-full" onClick={handleReg}>Registrar movimento</Button>
      </div>
      {posForn && (
        <div className="mt-8 rounded-xl border p-4 space-y-3">
          <h3 className="font-semibold">Inventário no meu pátio</h3>
          <p className="text-xs text-muted-foreground">
            Contagem cega — o saldo do sistema não muda até Campo Alegre conciliar. Campo em
            branco = não informado: o tipo fica de fora do envio (não vira 0).
          </p>
          <ProgressoContagem
            contados={countInformados(inv, tipos.map((t) => t.sigla)).contados}
            total={tipos.length}
          />
          {tipos.map((t) => {
            const informado = isInformado(inv, t.sigla);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{t.sigla}</span>
                <div className="flex items-center gap-2">
                  {!informado && <ChipNaoInformado />}
                  <NumberStepper
                    nullable
                    width="w-20"
                    value={informado ? inv[t.sigla] : null}
                    onChange={(n: number | null) => setInvQtd(t.sigla, n)}
                  />
                </div>
              </div>
            );
          })}
          <Button
            className="min-h-11 w-full"
            disabled={registrarInv.isPending}
            onClick={async () => {
              if (!user) return;
              const calc: Record<string, number> = {};
              for (const s of saldosInv as { posicao_id: string; tipo_caixa: string; saldo: number }[]) {
                if (s.posicao_id === posForn.id) calc[s.tipo_caixa] = Number(s.saldo ?? 0);
              }
              // Contagem cega: não dá para confirmar diferença sem entregar o
              // esperado para o fornecedor — aqui basta não enviar o que não foi contado.
              const itens = tipos
                .filter((t) => isInformado(inv, t.sigla))
                .map((t) => ({
                  tipo_caixa: t.sigla,
                  qtd_contada: Number(inv[t.sigla]),
                  qtd_calculada: Number(calc[t.sigla] ?? 0),
                }));
              if (!itens.length) {
                toast.error("Informe ao menos um tipo antes de enviar");
                return;
              }
              try {
                await registrarInv.mutateAsync({
                  posicao_id: posForn.id,
                  origem: "fornecedor",
                  contado_por: user.id,
                  itens,
                });
                setInv({});
                limparRascunho();
                toast.success("Contagem enviada");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao registrar inventário");
              }
            }}
          >
            Enviar contagem
          </Button>
        </div>
      )}
    </div>
  );
}
