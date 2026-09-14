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
  useTiposCaixa,
  useCreateTipoCaixa,
  useUpdateTipoCaixa,
  useDeleteTipoCaixa,
} from "@/hooks/use-tipos-caixa";

type TipoRow = {
  id: string;
  sigla: string;
  nome: string;
  custo_unitario: number;
  ativo: boolean;
};

export function TiposCaixaPage() {
  const { data: tipos = [], isLoading } = useTiposCaixa(true);
  const create = useCreateTipoCaixa();
  const update = useUpdateTipoCaixa();
  const del = useDeleteTipoCaixa();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [custo, setCusto] = useState("0");
  const [showInativos, setShowInativos] = useState(false);

  const ativos = (tipos as TipoRow[]).filter((t) => t.ativo !== false);
  const inativos = (tipos as TipoRow[]).filter((t) => t.ativo === false);
  const rows = showInativos ? [...ativos, ...inativos] : ativos;

  const openCreate = () => {
    setEditId(null);
    setSigla("");
    setNome("");
    setCusto("0");
    setSheetOpen(true);
  };

  const openEdit = (t: TipoRow) => {
    setEditId(t.id);
    setSigla(t.sigla);
    setNome(t.nome);
    setCusto(String(t.custo_unitario));
    setSheetOpen(true);
  };

  const save = () => {
    if (!sigla.trim() || !nome.trim()) {
      toast.error("Informe a sigla e o nome do tipo");
      return;
    }
    if (editId) {
      update.mutate(
        {
          id: editId,
          sigla: sigla.trim().toUpperCase(),
          nome: nome.trim(),
          custo_unitario: Number(custo) || 0,
        },
        {
          onSuccess: () => {
            toast.success("Tipo atualizado");
            setSheetOpen(false);
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      create.mutate(
        {
          sigla: sigla.trim().toUpperCase(),
          nome: nome.trim(),
          custo_unitario: Number(custo) || 0,
        },
        {
          onSuccess: () => {
            toast.success("Tipo criado");
            setSheetOpen(false);
          },
          onError: (e) => toast.error(e.message),
        }
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Tipos de caixa"
        subtitle="Sigla, nome e custo unitário de cada tipo"
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
                <span className="font-mono font-semibold">{t.sigla}</span>
                <span className="text-muted-foreground"> · </span>
                {t.nome}
                <span className="text-muted-foreground"> · R$ {t.custo_unitario.toFixed(2)}</span>
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
            <li className="text-muted-foreground py-4 text-center">Nenhum tipo de caixa</li>
          )}
        </ul>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Editar tipo de caixa" : "Novo tipo de caixa"}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Sigla</Label>
              <Input
                value={sigla}
                maxLength={4}
                onChange={(e) => setSigla(e.target.value)}
                placeholder="Ex: CX"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do tipo" />
            </div>
            <div className="space-y-1">
              <Label>Custo unitário (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
