import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useProdutos, useFamilias, useCadastroMutations } from "@/hooks/use-cadastros";
import { useConversoesProduto, useSaveConversaoProduto } from "@/hooks/use-conversoes";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { normalizeKey } from "@/lib/normalize";

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

const EMPTY_FORM: FormState = { nome: "", codigo: "", unidade: "un", familiaId: "" };
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

function isFkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /23503|foreign key|violates foreign key/i.test(msg);
}

export function ProdutosPage() {
  const [tab, setTab] = useState("produtos");

  return (
    <div>
      <PageHeader title="Produtos" subtitle="Catálogo Wise — fatores un/cx no próprio produto (mesma fonte de Unidades por caixa)" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="familias">Famílias</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos">
          <ProdutosTab />
        </TabsContent>
        <TabsContent value="familias">
          <FamiliasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProdutosTab() {
  const { data = [], isLoading } = useProdutos();
  const { data: familias = [] } = useFamilias();
  const { data: conversoes = [] } = useConversoesProduto();
  const { insert, update, remove } = useCadastroMutations("produtos", ["cadastros", "produtos"]);

  const [busca, setBusca] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProdutoRow | null>(null);

  const rows = data as ProdutoRow[];

  const fatoresPorProduto = useMemo(() => {
    const map = new Map<string, { sigla: string; fator: number }[]>();
    for (const c of conversoes) {
      const list = map.get(c.produto_id) ?? [];
      list.push({ sigla: c.tipo_caixa_sigla, fator: c.fator });
      map.set(c.produto_id, list);
    }
    return map;
  }, [conversoes]);

  const filtered = useMemo(() => {
    const q = normalizeKey(busca);
    let list = q
      ? rows.filter(
          (r) => normalizeKey(r.nome).includes(q) || normalizeKey(r.codigo ?? "").includes(q)
        )
      : rows;
    list = [...list].sort(sortProdutos);
    const ativos = list.filter((r) => r.ativo !== false);
    const inativos = list.filter((r) => r.ativo === false);
    return showInativos ? [...ativos, ...inativos] : ativos;
  }, [rows, busca, showInativos]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    setSheetOpen(true);
  };

  const openEdit = (row: ProdutoRow) => {
    setEditId(row.id);
    setForm({
      nome: row.nome ?? "",
      codigo: row.codigo ?? "",
      unidade: row.unidade || "un",
      familiaId: row.familia_id ?? "",
    });
    setTouched(false);
    setSheetOpen(true);
  };

  const save = () => {
    setTouched(true);
    if (!form.nome.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    const payload = {
      nome: form.nome.trim(),
      unidade: form.unidade || "un",
      codigo: form.codigo.trim() || null,
      familia_id: form.familiaId || null,
    };
    if (editId) {
      update.mutate(
        { id: editId, ...payload },
        {
          onSuccess: () => {
            toast.success("Produto atualizado");
            setSheetOpen(false);
          },
          onError: (e) =>
            toast.error(
              e.message.includes("uq_produtos_codigo")
                ? "Já existe um produto com este código"
                : e.message
            ),
        }
      );
    } else {
      insert.mutate(
        { ...payload, ativo: true },
        {
          onSuccess: () => {
            toast.success("Produto cadastrado");
            setSheetOpen(false);
          },
          onError: (e) =>
            toast.error(
              e.message.includes("uq_produtos_codigo")
                ? "Já existe um produto com este código"
                : e.message
            ),
        }
      );
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success("Produto removido");
    } catch (err) {
      if (isFkError(err)) {
        try {
          await update.mutateAsync({ id: pendingDelete.id, ativo: false });
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
  const inativoCount = rows.filter((r) => r.ativo === false).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          placeholder="Buscar por nome ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={openCreate} size="sm">
          Novo
        </Button>
        {inativoCount > 0 && (
          <label className="text-sm flex items-center gap-1.5 ml-auto">
            <input
              type="checkbox"
              checked={showInativos}
              onChange={(e) => setShowInativos(e.target.checked)}
            />
            Mostrar inativos ({inativoCount})
          </label>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ul className="text-sm max-h-[600px] overflow-y-auto space-y-0.5">
          {filtered.map((row) => {
            const fam = familiaNome(row);
            return (
              <li
                key={row.id}
                className={`flex justify-between items-center py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer border-b border-border ${row.ativo === false ? "opacity-50" : ""}`}
                onClick={() => openEdit(row)}
              >
                <span className="min-w-0">
                  <span className="font-medium tabular-nums text-muted-foreground w-12 inline-block">
                    {row.codigo || "—"}
                  </span>{" "}
                  {row.nome}
                  {fam ? <span className="text-muted-foreground"> · {fam}</span> : null}
                  {row.unidade && row.unidade !== "un" ? (
                    <span className="text-muted-foreground"> · {row.unidade}</span>
                  ) : null}
                  {(() => {
                    const fx = fatoresPorProduto.get(row.id);
                    if (fx?.length) {
                      return (
                        <span className="text-muted-foreground">
                          {" "}
                          · {fx.map((f) => `${f.fator}/${f.sigla}`).join(" · ")}
                        </span>
                      );
                    }
                    return <span className="text-amber-700/80"> · sem fator un/cx</span>;
                  })()}
                  {row.ativo === false && (
                    <span className="text-muted-foreground"> · inativo</span>
                  )}
                </span>
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      update.mutate(
                        { id: row.id, ativo: row.ativo === false },
                        {
                          onSuccess: () =>
                            toast.success(row.ativo === false ? "Reativado" : "Inativado"),
                          onError: (e) => toast.error(e.message),
                        }
                      )
                    }
                  >
                    {row.ativo === false ? "Reativar" : "Inativar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive"
                    onClick={() => setPendingDelete(row)}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            );
          })}
          {!filtered.length && (
            <li className="text-muted-foreground py-4 text-center">Nenhum produto encontrado</li>
          )}
        </ul>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Editar produto" : "Novo produto"}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
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
              <div className="space-y-1">
                <Label htmlFor="prod-codigo">Código Wise</Label>
                <Input
                  id="prod-codigo"
                  value={form.codigo}
                  onChange={(e) => setForm((s) => ({ ...s, codigo: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <select
                  className="h-9 w-full rounded-md border border-border px-2 text-sm bg-background"
                  value={form.unidade}
                  onChange={(e) => setForm((s) => ({ ...s, unidade: e.target.value }))}
                >
                  {UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Família</Label>
              <select
                className="h-9 w-full rounded-md border border-border px-2 text-sm bg-background"
                value={form.familiaId}
                onChange={(e) => setForm((s) => ({ ...s, familiaId: e.target.value }))}
              >
                <option value="">Sem família</option>
                {(familias as { id: string; nome: string }[]).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            {editId ? (
              <ProdutoFatoresEditor produtoId={editId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Depois de salvar o produto, cadastre os fatores un/cx aqui ou em{" "}
                <Link to="/gestao/conversao" className="text-primary underline-offset-2 hover:underline">
                  Unidades por caixa
                </Link>
                .
              </p>
            )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
    </>
  );
}

function ProdutoFatoresEditor({ produtoId }: { produtoId: string }) {
  const { data: conversoes = [] } = useConversoesProduto();
  const { data: tipos = [] } = useTiposCaixa();
  const save = useSaveConversaoProduto();
  const [tipoId, setTipoId] = useState("");
  const [fator, setFator] = useState("");

  const fatores = useMemo(
    () => conversoes.filter((c) => c.produto_id === produtoId),
    [conversoes, produtoId]
  );

  const usados = new Set(fatores.map((f) => f.tipo_caixa_id));
  const tiposDisponiveis = tipos.filter((t) => !usados.has(t.id));

  const add = () => {
    const n = Number(fator);
    if (!tipoId || !n || n <= 0) {
      toast.error("Informe tipo de caixa e fator > 0");
      return;
    }
    save.mutate(
      { produto_id: produtoId, tipo_caixa_id: tipoId, fator: n },
      {
        onSuccess: () => {
          toast.success("Fator salvo — usado no Conferir e na Expedição");
          setTipoId("");
          setFator("");
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const updateFator = (id: string, value: string) => {
    const n = Number(value);
    if (!n || n <= 0) return;
    save.mutate(
      { id, produto_id: produtoId, tipo_caixa_id: "", fator: n },
      {
        onSuccess: () => toast.success("Fator atualizado"),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Unidades por caixa (padrão do produto)</Label>
        <Link
          to="/gestao/conversao"
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          Por fornecedor →
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Mesma fonte de <span className="font-medium">Cadastros → Unidades por caixa</span>. Sem fator, o
        Conferir não sugere caixas automaticamente.
      </p>
      {fatores.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 rounded px-2 py-1.5">
          Sem fator cadastrado — por isso pedidos deste produto pedem &quot;Adicionar caixas&quot; na mão.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {fatores.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 font-medium">
                {f.tipo_caixa_nome} ({f.tipo_caixa_sigla})
              </span>
              <Input
                type="number"
                min={1}
                className="h-8 w-24"
                defaultValue={f.fator}
                onBlur={(e) => {
                  if (Number(e.target.value) !== f.fator) updateFator(f.id, e.target.value);
                }}
              />
              <span className="text-muted-foreground text-xs">un/cx</span>
            </li>
          ))}
        </ul>
      )}
      {tiposDisponiveis.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <div className="w-44">
              <SeletorCadastro
                tipo="tipo_caixa"
                value={tipoId || null}
                onChange={(id) => setTipoId(id)}
                items={tiposDisponiveis.map((t) => ({
                  id: t.id,
                  nome: t.nome,
                  codigo: t.sigla,
                  meta: { sigla: t.sigla },
                }))}
                placeholder="Selecionar"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fator</Label>
            <Input
              type="number"
              min={1}
              className="h-8 w-24"
              value={fator}
              onChange={(e) => setFator(e.target.value)}
              placeholder="ex. 20"
            />
          </div>
          <Button type="button" size="sm" className="h-8" disabled={save.isPending} onClick={add}>
            Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

function FamiliasTab() {
  const { data: familias = [] } = useFamilias();
  const { insert, update } = useCadastroMutations("familias_produto", ["cadastros", "familias"]);
  const [nome, setNome] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nome.trim()) return;
          insert.mutate(
            { nome: nome.trim(), ordem: (familias as { ordem?: number }[]).length + 1 },
            {
              onSuccess: () => {
                toast.success("Família cadastrada");
                setNome("");
              },
              onError: (err) => toast.error(err.message),
            }
          );
        }}
      >
        <Input
          placeholder="Nome da família"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" size="sm">
          Adicionar
        </Button>
      </form>
      <ul className="text-sm space-y-1">
        {(familias as { id: string; nome: string }[]).map((f) => (
          <li key={f.id} className="flex items-center gap-2 border-b border-border py-2">
            {editId === f.id ? (
              <>
                <Input
                  className="h-8 flex-1"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!editNome.trim()) return;
                    update.mutate(
                      { id: f.id, nome: editNome.trim() },
                      {
                        onSuccess: () => {
                          toast.success("Família atualizada");
                          setEditId(null);
                        },
                      }
                    );
                  }}
                >
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1">{f.nome}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    setEditId(f.id);
                    setEditNome(f.nome);
                  }}
                >
                  Editar
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
