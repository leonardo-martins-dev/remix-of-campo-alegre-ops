import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/page-header";
import {
  useTiposEmbalagem,
  useCreateTipoEmbalagem,
  useUpdateTipoEmbalagem,
  useDeleteTipoEmbalagem,
  usaQtyPorPacote,
  UNIDADES_CONTAGEM,
  type TipoEmbalagem,
} from "@/hooks/use-tipos-embalagem";

export function TiposEmbalagemPage() {
  const { data: tipos = [], isLoading } = useTiposEmbalagem(true);
  const create = useCreateTipoEmbalagem();
  const update = useUpdateTipoEmbalagem();
  const del = useDeleteTipoEmbalagem();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState("unidade");
  const [qty, setQty] = useState("");
  const [showInativos, setShowInativos] = useState(false);

  const ativos = tipos.filter((t) => t.ativo !== false);
  const inativos = tipos.filter((t) => t.ativo === false);
  const rows = showInativos ? [...ativos, ...inativos] : ativos;
  const mostraQty = usaQtyPorPacote(unidade);

  const openCreate = () => {
    setEditId(null);
    setNome("");
    setUnidade("unidade");
    setQty("");
    setSheetOpen(true);
  };

  const openEdit = (t: TipoEmbalagem) => {
    setEditId(t.id);
    setNome(t.nome);
    setUnidade(t.unidade_contagem);
    setQty(t.qty_por_pacote != null ? String(t.qty_por_pacote) : "");
    setSheetOpen(true);
  };

  const save = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome da embalagem");
      return;
    }
    if (!unidade.trim()) {
      toast.error("Informe a unidade de contagem");
      return;
    }
    const qtyValor = mostraQty && qty.trim() ? Number(qty) : null;
    if (qtyValor != null && !(qtyValor > 0)) {
      toast.error("Quantidade por pacote deve ser maior que zero");
      return;
    }
    const payload = {
      nome: nome.trim(),
      unidade_contagem: unidade.trim(),
      qty_por_pacote: qtyValor,
    };
    const handlers = {
      onSuccess: () => {
        toast.success(editId ? "Embalagem atualizada" : "Embalagem criada");
        setSheetOpen(false);
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (editId) update.mutate({ id: editId, ...payload }, handlers);
    else create.mutate(payload, handlers);
  };

  return (
    <div>
      <PageHeader
        title="Tipos de embalagem"
        subtitle="Nome, unidade de contagem e quantidade por pacote de cada embalagem"
        actions={<Button onClick={openCreate}>Novo</Button>}
      />

      {inativos.length > 0 && (
        <div className="mb-4">
          <label className="text-sm flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showInativos}
              onChange={(e) => setShowInativos(e.target.checked)}
            />
            Mostrar inativos ({inativos.length})
          </label>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ul className="text-sm space-y-0.5">
          {rows.map((t) => (
            <li
              key={t.id}
              className={`flex justify-between items-center py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer border-b border-border ${t.ativo === false ? "opacity-50" : ""}`}
              onClick={() => openEdit(t)}
            >
              <span>
                <span className="font-semibold">{t.nome}</span>
                <span className="text-muted-foreground"> · {t.unidade_contagem}</span>
                {t.qty_por_pacote != null && (
                  <span className="text-muted-foreground"> · {t.qty_por_pacote} un/pacote</span>
                )}
                {t.ativo === false && <span className="text-muted-foreground"> · inativo</span>}
              </span>
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    update.mutate({ id: t.id, ativo: !t.ativo }, {
                      onSuccess: () => toast.success(t.ativo ? "Inativado" : "Reativado"),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  {t.ativo ? "Inativar" : "Reativar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive"
                  onClick={() =>
                    del.mutate(t.id, {
                      onError: (e) => toast.error(e.message),
                      onSuccess: () => toast.success("Excluído"),
                    })
                  }
                >
                  Excluir
                </Button>
              </div>
            </li>
          ))}
          {!rows.length && (
            <li className="text-muted-foreground py-4 text-center">Nenhum tipo de embalagem</li>
          )}
        </ul>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editId ? "Editar tipo de embalagem" : "Novo tipo de embalagem"}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Sacos 5kg"
              />
            </div>
            <div className="space-y-1">
              <Label>Unidade de contagem</Label>
              <Input
                value={unidade}
                list="unidades-contagem-embalagem"
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="unidade, pacote, rolo, caixa fechada…"
              />
              <datalist id="unidades-contagem-embalagem">
                {UNIDADES_CONTAGEM.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            {mostraQty && (
              <div className="space-y-1">
                <Label>Quantidade por pacote</Label>
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
