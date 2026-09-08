import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useFamilias, useFornecedores, useProdutos } from "@/hooks/use-cadastros";
import { useConfigValor } from "@/hooks/use-pedidos";
import { useRegistrarQuebra, useUltimasEntregasProduto } from "@/hooks/use-quebra";

export const Route = createFileRoute("/quebra/lancar")({
  component: Page,
  head: () => ({ meta: [{ title: "Lançar quebra · Campo Alegre" }] }),
});

function Page() {
  const { user } = useAuth();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: produtos = [] } = useProdutos();
  const { data: familias = [] } = useFamilias();
  const { data: fallback = 4.5 } = useConfigValor("impacto_falta_por_unidade", 4.5);
  const registrar = useRegistrarQuebra();
  const [fornecedorId, setFornecedorId] = useState("");
  const [familiaId, setFamiliaId] = useState("all");
  const [busca, setBusca] = useState("");
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [vinculos, setVinculos] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");

  const filtrados = useMemo(() => {
    return (produtos as { id: string; nome: string; familia_id: string | null }[]).filter((p) => {
      if (familiaId !== "all" && p.familia_id !== familiaId) return false;
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [produtos, familiaId, busca]);

  const lancados = Object.entries(qtds).filter(([, n]) => n > 0);

  async function handleSave() {
    if (!user || !fornecedorId || !lancados.length) {
      toast.error("Escolha o fornecedor e ao menos um produto");
      return;
    }
    try {
      const itens = lancados.map(([produtoId, quantidade]) => {
        const vinculo = vinculos[produtoId];
        const preco = vinculo ? Number(vinculo.split("|")[1] || 0) : fallback;
        const estimado = !vinculo || !Number(vinculo.split("|")[1]);
        return {
          produto_id: produtoId,
          quantidade,
          conferencia_item_id: vinculo && vinculo !== "none" ? vinculo.split("|")[0] : null,
          preco_unitario: preco,
          valor: quantidade * preco,
          estimado,
        };
      });
      await registrar.mutateAsync({
        fornecedor_id: fornecedorId,
        registrado_por: user.id,
        observacao: obs,
        itens,
      });
      toast.success("Laudo de quebra registrado");
      setQtds({});
      setObs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="Lançar quebra" subtitle="Checklist do catálogo, amarrado ao fornecedor que mandou o produto" />
      <div className="space-y-4 max-w-3xl">
        <select className="h-11 w-full rounded-md border px-2" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
          <option value="">Fornecedor…</option>
          {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select className="h-9 rounded-md border px-2" value={familiaId} onChange={(e) => setFamiliaId(e.target.value)}>
            <option value="all">Todas as famílias</option>
            {(familias as { id: string; nome: string }[]).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {filtrados.map((p) => (
            <ProdutoLinha
              key={p.id}
              produto={p}
              fornecedorId={fornecedorId}
              qtd={qtds[p.id] ?? 0}
              onQtd={(n) => setQtds((s) => ({ ...s, [p.id]: n }))}
              vinculo={vinculos[p.id] ?? ""}
              onVinculo={(v) => setVinculos((s) => ({ ...s, [p.id]: v }))}
            />
          ))}
        </div>
        <Input placeholder="Observação geral" value={obs} onChange={(e) => setObs(e.target.value)} />
        <Button className="min-h-11" onClick={handleSave} disabled={registrar.isPending}>Registrar quebra</Button>
      </div>
    </div>
  );
}

function ProdutoLinha({
  produto, fornecedorId, qtd, onQtd, vinculo, onVinculo,
}: {
  produto: { id: string; nome: string };
  fornecedorId: string;
  qtd: number;
  onQtd: (n: number) => void;
  vinculo: string;
  onVinculo: (v: string) => void;
}) {
  const { data: entregas = [] } = useUltimasEntregasProduto(qtd > 0 ? fornecedorId : null, qtd > 0 ? produto.id : null);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border py-2">
      <span className="flex-1 text-sm">{produto.nome}</span>
      <Input className="w-24" type="number" min={0} value={qtd || ""} placeholder="cx" onChange={(e) => onQtd(Number(e.target.value) || 0)} />
      {qtd > 0 && (
        <select className="h-9 rounded-md border px-2 text-xs" value={vinculo} onChange={(e) => onVinculo(e.target.value)}>
          <option value="none">Sem vínculo</option>
          {(entregas as { id: string; quantidade_recebida: number; itens_pedido?: { preco_unitario?: number; pedidos_recebimento?: { codigo: string; data_pedido: string } } }[]).map((e) => {
            const ped = e.itens_pedido?.pedidos_recebimento;
            const preco = e.itens_pedido?.preco_unitario ?? 0;
            return (
              <option key={e.id} value={`${e.id}|${preco}`}>
                {ped?.data_pedido} · {ped?.codigo} · rec {e.quantidade_recebida} · R$ {preco}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
