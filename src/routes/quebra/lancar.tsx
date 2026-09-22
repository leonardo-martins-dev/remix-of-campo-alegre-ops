import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Camera, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { FluxoPassos } from "@/components/fluxo-passos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useProdutos } from "@/hooks/use-cadastros";
import { useConfigValor } from "@/hooks/use-pedidos";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { useFornecedoresComEntregaRecente } from "@/hooks/use-seletor-cadastro";
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
  const { data: produtos = [] } = useProdutos();
  const { data: fallback = 4.5 } = useConfigValor("impacto_falta_por_unidade", 4.5);
  const registrar = useRegistrarQuebra();
  const [fornecedorId, setFornecedorId] = useState("");
  const [produtosSel, setProdutosSel] = useState<string[]>([]);
  const [itens, setItens] = useState<Record<string, ItemState>>({});
  // Fornecedores que entregaram na última semana sobem na lista.
  const fornecedoresRecentes = useFornecedoresComEntregaRecente();
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

  const selecionados = useMemo(() => {
    const porId = new Map((produtos as { id: string; nome: string }[]).map((p) => [p.id, p]));
    return produtosSel
      .map((id) => porId.get(id))
      .filter((p): p is { id: string; nome: string } => !!p);
  }, [produtos, produtosSel]);

  /** Trocar os produtos com problema mantém as quantidades já digitadas. */
  const aplicarSelecao = (ids: string[]) => {
    setProdutosSel(ids);
    setItens((prev) => {
      const next: Record<string, ItemState> = {};
      for (const id of ids) {
        next[id] = prev[id] ?? {
          qtd: 1,
          vinculo: "",
          tipo: "quebra",
          fotoFile: null,
          fotoPreview: null,
          obs: "",
        };
      }
      return next;
    });
  };

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
    if (!user || !lancados.length) {
      toast.error("Selecione ao menos um produto");
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
        fornecedor_id: fornecedorId || null,
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

      toast.success(
        fornecedorId
          ? "Laudo de ocorrência registrado"
          : "Laudo registrado — origem não identificada (ADM vincula depois)",
      );
      setItens({});
      setProdutosSel([]);
      setObs("");
      setFornecedorId("");
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
        subtitle="Quebra ou falta de qualidade — fornecedor de origem é opcional"
      />
      <div className="space-y-4 max-w-3xl">
        <FluxoPassos
          steps={["Origem", "Produtos", "Registrar"]}
          current={!produtosSel.length ? 1 : lancados.length === 0 ? 2 : 3}
        />
        <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 flex gap-2 text-xs text-primary-dark">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Mesmo fluxo do supermercado:</strong> selecione os produtos com problema,
            indique o tipo (quebra ou qualidade), adicione evidências e registre. O fornecedor de
            origem é opcional — se não souber, o ADM vincula depois.
          </span>
        </div>
        <SeletorCadastro
          tipo="fornecedor"
          label="Fornecedor de origem (opcional)"
          value={fornecedorId || null}
          onChange={(id) => setFornecedorId(id)}
          suggestedIds={fornecedoresRecentes}
          placeholder="Deixe em branco se a origem for desconhecida…"
        />

        <SeletorCadastro
          tipo="produto"
          label="Produtos com problema"
          multiple
          values={produtosSel}
          onChangeMultiple={aplicarSelecao}
          fornecedorId={fornecedorId || null}
          placeholder="Selecionar produtos…"
        />

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {selecionados.map((p) => {
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
          {selecionados.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Escolha os produtos com problema no seletor acima.
            </p>
          )}
        </div>
        <Input
          placeholder="Observação geral do laudo"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
        <Button className="min-h-11" onClick={handleSave} disabled={saving || registrar.isPending}>
          {saving ? "Registrando…" : "Registrar"}
        </Button>
        {lancados.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Produtos: <strong className="text-navy">{lancados.length}</strong>
            </p>
            <p>
              Preço estimado:{" "}
              <strong className="text-navy">
                {
                  lancados.filter(
                    ([, it]) =>
                      !it.vinculo || it.vinculo === "none" || !Number(it.vinculo.split("|")[1]),
                  ).length
                }
              </strong>
            </p>
            <p>
              Quebra:{" "}
              <strong className="text-navy">
                {lancados.filter(([, it]) => it.tipo === "quebra").length}
              </strong>
              {" · "}
              Qualidade:{" "}
              <strong className="text-navy">
                {lancados.filter(([, it]) => it.tipo === "falta_de_qualidade").length}
              </strong>
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
    item.qtd > 0 && fornecedorId ? fornecedorId : null,
    item.qtd > 0 ? produto.id : null,
  );
  const hasQtd = item.qtd > 0;
  const qtdId = `qtd-${produto.id}`;

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${hasQtd ? "border-primary/30 bg-primary-soft/30" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm font-medium">{produto.nome}</span>
        <div className="space-y-1">
          <Label htmlFor={qtdId} className="text-xs">
            Quantidade
          </Label>
          <Input
            id={qtdId}
            className="w-24"
            type="number"
            min={0}
            value={item.qtd || ""}
            placeholder="un"
            onChange={(e) => onUpdate({ qtd: Number(e.target.value) || 0 })}
          />
        </div>
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
