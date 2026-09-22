import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCadastroMutations, useFamilias, useProdutos } from "@/hooks/use-cadastros";
import { useProdutosSemConversao } from "@/hooks/use-conversoes";
import { normalizeKey } from "@/lib/normalize";
import { SemConversaoSelo } from "@/components/sem-conversao-selo";

type ProdutoRow = {
  id: string;
  nome: string;
  unidade?: string | null;
  codigo?: string | null;
  familia_id?: string | null;
  ativo?: boolean;
  familias_produto?: { nome: string } | { nome: string }[] | null;
};

type FormState = {
  nome: string;
  codigo: string;
  unidade: string;
  familiaId: string;
};

const EMPTY_FORM: FormState = {
  nome: "",
  codigo: "",
  unidade: "un",
  familiaId: "",
};

const UNIDADES = [
  { value: "un", label: "UN" },
  { value: "kg", label: "KG" },
  { value: "cx", label: "CX" },
  { value: "pct", label: "PCT" },
  { value: "mc", label: "MC" },
];

function familiaNome(row: ProdutoRow): string {
  const fam = row.familias_produto;
  if (Array.isArray(fam)) return fam[0]?.nome ?? "";
  return fam?.nome ?? "";
}

function sortProdutos(a: ProdutoRow, b: ProdutoRow): number {
  const na = Number(a.codigo);
  const nb = Number(b.codigo);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
}

function formFromRow(row: ProdutoRow): FormState {
  return {
    nome: row.nome ?? "",
    codigo: row.codigo ?? "",
    unidade: row.unidade || "un",
    familiaId: row.familia_id ?? "",
  };
}

function payloadFromForm(form: FormState) {
  return {
    nome: form.nome.trim(),
    unidade: form.unidade || "un",
    codigo: form.codigo.trim() || null,
    familia_id: form.familiaId || null,
  };
}

function isFkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /23503|foreign key|violates foreign key/i.test(msg);
}

export function ProdutosCadastro() {
  const { data = [], isLoading } = useProdutos();
  const { data: familias = [] } = useFamilias();
  const { data: semConversao = [] } = useProdutosSemConversao();
  const { insert, update, remove } = useCadastroMutations("produtos", ["cadastros", "produtos"]);
  const [busca, setBusca] = useState("");
  const [filtroSemConv, setFiltroSemConv] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProdutoRow | null>(null);

  const rows = data as ProdutoRow[];
  const semMap = useMemo(
    () => new Map(semConversao.map((p) => [p.produto_id, p])),
    [semConversao],
  );
  const filtered = useMemo(() => {
    const q = normalizeKey(busca);
    let list = q
      ? rows.filter((r) => normalizeKey(r.nome).includes(q) || normalizeKey(r.codigo ?? "").includes(q))
      : rows;
    if (filtroSemConv) list = list.filter((r) => semMap.has(r.id));
    return [...list].sort((a, b) => {
      const ua = semMap.get(a.id)?.usos_recentes ?? 0;
      const ub = semMap.get(b.id)?.usos_recentes ?? 0;
      if (filtroSemConv && ua !== ub) return ub - ua;
      return sortProdutos(a, b);
    });
  }, [rows, busca, filtroSemConv, semMap]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    setFormOpen(true);
  };

  const openEdit = (row: ProdutoRow) => {
    setEditId(row.id);
    setForm(formFromRow(row));
    setTouched(false);
    setFormOpen(true);
  };

  const save = () => {
    setTouched(true);
    if (!form.nome.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    const payload = payloadFromForm(form);
    if (editId) {
      update.mutate(
        { id: editId, ...payload },
        {
          onSuccess: () => {
            toast.success("Produto atualizado");
            setFormOpen(false);
          },
          onError: (e) => toast.error(e.message.includes("uq_produtos_codigo") ? "Já existe um produto com este código" : e.message),
        }
      );
      return;
    }
    insert.mutate(
      { ...payload, ativo: true },
      {
        onSuccess: () => {
          toast.success("Produto cadastrado");
          setFormOpen(false);
        },
        onError: (e) => toast.error(e.message.includes("uq_produtos_codigo") ? "Já existe um produto com este código" : e.message),
      }
    );
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const row = pendingDelete;
    try {
      await remove.mutateAsync(row.id);
      toast.success("Produto removido");
    } catch (err) {
      if (isFkError(err)) {
        try {
          await update.mutateAsync({ id: row.id, ativo: false });
          toast.success("Produto já usado em pedidos — inativado em vez de apagado");
        } catch (e2) {
          toast.error(e2 instanceof Error ? e2.message : "Erro ao inativar");
        }
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao remover");
      }
    } finally {
      setPendingDelete(null);
    }
  };

  const saving = insert.isPending || update.isPending || remove.isPending;
  const showNomeError = touched && !form.nome.trim();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Produtos</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Catálogo Campo Alegre · {rows.length} itens · o código é o do Wise (Nº / Código)
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          Novo produto
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por nome ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 min-w-[180px]"
          />
          <Button
            type="button"
            size="sm"
            variant={filtroSemConv ? "default" : "outline"}
            onClick={() => setFiltroSemConv((v) => !v)}
          >
            Sem conversão ({semConversao.length})
          </Button>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : (
          <ul className="text-sm max-h-[480px] overflow-y-auto">
            {filtered.map((row) => {
              const fam = familiaNome(row);
              const sem = semMap.get(row.id);
              return (
                <li
                  key={row.id}
                  className={`flex justify-between items-center py-1.5 border-b border-border gap-2 ${row.ativo === false ? "opacity-50" : ""}`}
                >
                  <span className="min-w-0 flex flex-wrap items-center gap-1.5">
                    <span className="font-medium tabular-nums text-muted-foreground w-12 inline-block">{row.codigo || "—"}</span>
                    {" "}
                    {row.nome}
                    {fam ? <span className="text-muted-foreground"> · {fam}</span> : null}
                    {row.unidade && row.unidade !== "un" ? <span className="text-muted-foreground"> · {row.unidade}</span> : null}
                    {row.ativo === false ? <span className="text-muted-foreground"> · inativo</span> : null}
                    {sem && (
                      <SemConversaoSelo
                        faltaSaida={sem.falta_saida}
                        faltaFornecedor={sem.falta_fornecedor}
                        compact
                      />
                    )}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => openEdit(row)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() =>
                        update.mutate(
                          { id: row.id, ativo: row.ativo === false },
                          {
                            onSuccess: () => toast.success(row.ativo === false ? "Reativado" : "Inativado"),
                            onError: (e) => toast.error(e.message),
                          }
                        )
                      }
                    >
                      {row.ativo === false ? "Reativar" : "Inativar"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setPendingDelete(row)}>
                      Remover
                    </Button>
                  </div>
                </li>
              );
            })}
            {!filtered.length && <li className="text-muted-foreground py-2">Nenhum produto encontrado</li>}
          </ul>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              Use o código Wise para o vínculo na importação. Família é opcional. Fatores un/cx ficam em Unidades por caixa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="prod-nome">Nome</Label>
              <Input
                id="prod-nome"
                value={form.nome}
                aria-invalid={showNomeError}
                className={showNomeError ? "border-destructive" : ""}
                onChange={(e) => {
                  setForm((s) => ({ ...s, nome: e.target.value }));
                  if (e.target.value.trim()) setTouched(false);
                }}
              />
              {showNomeError && <p className="text-sm text-destructive">Informe o nome</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="prod-codigo">Código Wise</Label>
                <Input
                  id="prod-codigo"
                  value={form.codigo}
                  onChange={(e) => setForm((s) => ({ ...s, codigo: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="prod-un">Unidade</Label>
                <select
                  id="prod-un"
                  className="h-9 rounded-md border border-border px-2 text-sm bg-background"
                  value={form.unidade}
                  onChange={(e) => setForm((s) => ({ ...s, unidade: e.target.value }))}
                >
                  {UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="prod-fam">Família</Label>
              <select
                id="prod-fam"
                className="h-9 rounded-md border border-border px-2 text-sm bg-background"
                value={form.familiaId}
                onChange={(e) => setForm((s) => ({ ...s, familiaId: e.target.value }))}
              >
                <option value="">Sem família</option>
                {(familias as { id: string; nome: string }[]).map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={save}>
              {saving ? "Salvando…" : editId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este produto?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.codigo ? `${pendingDelete.codigo} · ` : ""}${pendingDelete.nome} sai do cadastro. Se ele já estiver em pedidos, será só inativado.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
