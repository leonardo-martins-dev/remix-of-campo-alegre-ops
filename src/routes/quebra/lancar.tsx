import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Camera, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useFamilias, useFornecedores, useProdutos } from "@/hooks/use-cadastros";
import { useConfigValor } from "@/hooks/use-pedidos";
import {
  useRegistrarQuebra,
  useUltimasEntregasProduto,
  uploadQuebraFoto,
  TipoOcorrenciaQuebra,
} from "@/hooks/use-quebra";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/quebra/lancar")({
  component: Page,
  head: () => ({ meta: [{ title: "Lançar ocorrência · Campo Alegre" }] }),
});

type ItemState = {
  qtd: number;
  vinculo: string;
  tipo: TipoOcorrenciaQuebra;
  fotoFile: File | null;
  fotoPreview: string | null;
  obs: string;
};

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
  const [itens, setItens] = useState<Record<string, ItemState>>({});
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoTargetId, setFotoTargetId] = useState<string | null>(null);

  const updateItem = (id: string, updates: Partial<ItemState>) => {
    setItens((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }));
  };

  const getItem = (id: string): ItemState =>
    itens[id] ?? {
      qtd: 0,
      vinculo: "",
      tipo: "quebra",
      fotoFile: null,
      fotoPreview: null,
      obs: "",
    };

  const filtrados = useMemo(() => {
    return (produtos as { id: string; nome: string; familia_id: string | null }[]).filter((p) => {
      if (familiaId !== "all" && p.familia_id !== familiaId) return false;
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [produtos, familiaId, busca]);

  const lancados = Object.entries(itens).filter(([, it]) => it.qtd > 0);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fotoTargetId) return;
    const preview = URL.createObjectURL(file);
    updateItem(fotoTargetId, { fotoFile: file, fotoPreview: preview });
    setFotoTargetId(null);
  };

  async function handleSave() {
    if (!user || !fornecedorId || !lancados.length) {
      toast.error("Escolha o fornecedor e ao menos um produto");
      return;
    }
    setSaving(true);
    try {
      const itensPayload = lancados.map(([produtoId, itemState]) => {
        const vinculo = itemState.vinculo;
        const raw = vinculo && vinculo !== "none" ? Number(vinculo.split("|")[1] || 0) : 0;
        const preco = raw > 0 ? raw : fallback;
        const estimado = raw <= 0;
        return {
          produto_id: produtoId,
          quantidade: itemState.qtd,
          conferencia_item_id: vinculo && vinculo !== "none" ? vinculo.split("|")[0] : null,
          preco_unitario: preco,
          valor: itemState.qtd * preco,
          estimado,
          tipo_ocorrencia: itemState.tipo,
          foto_url: null as string | null,
          observacao: itemState.obs || null,
          _fotoFile: itemState.fotoFile,
        };
      });

      const laudo = await registrar.mutateAsync({
        fornecedor_id: fornecedorId,
        registrado_por: user.id,
        observacao: obs,
        itens: itensPayload.map(({ _fotoFile, ...rest }) => rest),
      });

      const { data: itensInseridos } = await supabase
        .from("quebra_itens")
        .select("id, produto_id")
        .eq("quebra_id", laudo.id);

      if (itensInseridos) {
        for (const item of itensPayload) {
          if (item._fotoFile) {
            const inserido = itensInseridos.find((i) => i.produto_id === item.produto_id);
            if (inserido) {
              try {
                await uploadQuebraFoto(item._fotoFile, inserido.id);
              } catch (fotoErr) {
                console.error("Erro ao enviar foto:", fotoErr);
              }
            }
          }
        }
      }

      toast.success("Laudo de ocorrência registrado");
      setItens({});
      setObs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFoto}
      />
      <PageHeader
        title="Lançar ocorrência"
        subtitle="Quebra ou falta de qualidade, vinculado ao fornecedor de origem"
      />
      <div className="space-y-4 max-w-3xl">
        <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 flex gap-2 text-xs text-primary-dark">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Mesmo fluxo do supermercado:</strong> escolha o fornecedor, selecione os
            produtos com problema, indique o tipo (quebra ou qualidade), adicione evidências e
            registre.
          </span>
        </div>
        <select
          className="h-11 w-full rounded-md border px-2"
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
        >
          <option value="">Fornecedor de origem…</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Buscar produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1"
          />
          <select
            className="h-9 rounded-md border px-2"
            value={familiaId}
            onChange={(e) => setFamiliaId(e.target.value)}
          >
            <option value="all">Todas as famílias</option>
            {(familias as { id: string; nome: string }[]).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {filtrados.map((p) => {
            const item = getItem(p.id);
            return (
              <ProdutoLinha
                key={p.id}
                produto={p}
                fornecedorId={fornecedorId}
                item={item}
                onUpdate={(updates) => updateItem(p.id, updates)}
                onFoto={() => {
                  setFotoTargetId(p.id);
                  fotoRef.current?.click();
                }}
              />
            );
          })}
        </div>
        <Input
          placeholder="Observação geral do laudo"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
        <Button className="min-h-11" onClick={handleSave} disabled={saving || registrar.isPending}>
          {saving ? "Registrando…" : "Registrar ocorrência"}
        </Button>
        {lancados.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{lancados.length} produto(s) selecionado(s)</p>
            <p>
              {
                lancados.filter(
                  ([, it]) =>
                    !it.vinculo || it.vinculo === "none" || !Number(it.vinculo.split("|")[1]),
                ).length
              }{" "}
              item(ns) com preço estimado
            </p>
            <p>
              {lancados.filter(([, it]) => it.tipo === "quebra").length} quebra(s) ·{" "}
              {lancados.filter(([, it]) => it.tipo === "falta_de_qualidade").length} qualidade
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProdutoLinha({
  produto,
  fornecedorId,
  item,
  onUpdate,
  onFoto,
}: {
  produto: { id: string; nome: string };
  fornecedorId: string;
  item: ItemState;
  onUpdate: (updates: Partial<ItemState>) => void;
  onFoto: () => void;
}) {
  const { data: entregas = [] } = useUltimasEntregasProduto(
    item.qtd > 0 ? fornecedorId : null,
    item.qtd > 0 ? produto.id : null,
  );
  const hasQtd = item.qtd > 0;

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${hasQtd ? "border-primary/30 bg-primary-soft/30" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm font-medium">{produto.nome}</span>
        <Input
          className="w-24"
          type="number"
          min={0}
          value={item.qtd || ""}
          placeholder="un"
          onChange={(e) => onUpdate({ qtd: Number(e.target.value) || 0 })}
        />
      </div>
      {hasQtd && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          <select
            className="h-9 rounded-md border px-2 text-xs flex-1 min-w-[140px]"
            value={item.tipo}
            onChange={(e) => onUpdate({ tipo: e.target.value as TipoOcorrenciaQuebra })}
          >
            <option value="quebra">Quebra</option>
            <option value="falta_de_qualidade">Falta de qualidade</option>
          </select>
          <select
            className="h-9 rounded-md border px-2 text-xs flex-1 min-w-[200px]"
            value={item.vinculo}
            onChange={(e) => onUpdate({ vinculo: e.target.value })}
          >
            <option value="none">Sem vínculo · preço estimado</option>
            {(
              entregas as {
                id: string;
                quantidade_recebida: number;
                itens_pedido?: {
                  preco_unitario?: number;
                  pedidos_recebimento?: { codigo: string; data_pedido: string };
                };
              }[]
            ).map((e) => {
              const ped = e.itens_pedido?.pedidos_recebimento;
              const preco = e.itens_pedido?.preco_unitario ?? 0;
              return (
                <option key={e.id} value={`${e.id}|${preco}`}>
                  {ped?.data_pedido} · {ped?.codigo} · rec {e.quantidade_recebida} · R$ {preco}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={onFoto}
            className={`h-9 w-9 rounded-md border flex items-center justify-center transition-colors ${
              item.fotoPreview
                ? "border-transparent bg-[rgba(240,169,43,0.15)] text-[var(--warning)]"
                : "border-border text-muted-foreground hover:text-navy hover:bg-secondary"
            }`}
            title="Adicionar foto de evidência"
          >
            <Camera size={14} />
          </button>
        </div>
      )}
      {hasQtd && item.fotoPreview && (
        <div className="flex items-center gap-2">
          <img
            src={item.fotoPreview}
            alt="Evidência"
            className="h-16 w-16 object-cover rounded-md"
          />
          <button
            type="button"
            onClick={() => {
              if (item.fotoPreview) URL.revokeObjectURL(item.fotoPreview);
              onUpdate({ fotoFile: null, fotoPreview: null });
            }}
            className="text-xs text-destructive hover:underline flex items-center gap-1"
          >
            <XCircle size={12} /> Remover foto
          </button>
        </div>
      )}
      {hasQtd && (
        <Input
          placeholder="Observação do item (opcional)"
          value={item.obs}
          onChange={(e) => onUpdate({ obs: e.target.value })}
          className="text-xs"
        />
      )}
    </div>
  );
}
