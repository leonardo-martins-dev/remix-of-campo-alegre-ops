import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/page-header";
import { useFornecedores, useCadastroMutations } from "@/hooks/use-cadastros";
import { useAliases, usePendenciasVinculo } from "@/hooks/use-pedidos";
import { useResolverPendencia } from "@/hooks/use-wise-pedidos";
import { useAuth } from "@/lib/auth";
import { normalizeKey } from "@/lib/normalize";
import { MesclarCadastrosPanel } from "@/components/gestao/mesclar-cadastros";

type FornecedorRow = {
  id: string;
  nome: string;
  ativo: boolean;
  codigo_wise?: string | null;
  mesclado_em_id?: string | null;
};

const AGUARDANDO_VINCULO = "Aguardando vínculo";

export function FornecedoresPage() {
  const { data: fornecedores = [], isLoading } = useFornecedores();
  const { insert, update } = useCadastroMutations("fornecedores", ["cadastros", "fornecedores"]);
  const { data: pendencias = [] } = usePendenciasVinculo();
  const { data: aliases = [] } = useAliases();
  const { user } = useAuth();
  const resolver = useResolverPendencia();

  const [busca, setBusca] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [codigoWise, setCodigoWise] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pendingDesativar, setPendingDesativar] = useState<FornecedorRow | null>(null);

  const pendFornecedor = useMemo(
    () =>
      (
        pendencias as {
          id: string;
          tipo: string;
          nome_externo: string;
          codigo_externo: string | null;
        }[]
      ).filter((p) => p.tipo === "fornecedor"),
    [pendencias],
  );

  const rows = useMemo(() => {
    const q = normalizeKey(busca);
    let list = (fornecedores as FornecedorRow[]).filter((f) => f.nome !== AGUARDANDO_VINCULO);
    if (q) list = list.filter((f) => normalizeKey(f.nome).includes(q));
    const ativos = list.filter((f) => f.ativo !== false);
    const inativos = list.filter((f) => f.ativo === false);
    return showInativos ? [...ativos, ...inativos] : ativos;
  }, [fornecedores, busca, showInativos]);

  const fornecedorAliases = useMemo(() => {
    if (!editId) return [];
    return (
      aliases as { id: string; tipo: string; nome_externo: string; entidade_id?: string | null }[]
    ).filter((a) => a.tipo === "fornecedor" && a.entidade_id === editId);
  }, [aliases, editId]);

  const openCreate = () => {
    setEditId(null);
    setNome("");
    setCodigoWise("");
    setSheetOpen(true);
  };

  const openEdit = (row: FornecedorRow) => {
    setEditId(row.id);
    setNome(row.nome);
    setCodigoWise(row.codigo_wise ?? "");
    setSheetOpen(true);
  };

  const nomePorId = useMemo(
    () => new Map((fornecedores as FornecedorRow[]).map((f) => [f.id, f.nome])),
    [fornecedores],
  );

  const toggleSelecionado = (id: string) =>
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do fornecedor");
      return;
    }
    const codigo = codigoWise.trim() || null;
    if (editId) {
      update.mutate(
        { id: editId, nome: nome.trim(), codigo_wise: codigo },
        {
          onSuccess: () => {
            toast.success("Fornecedor atualizado");
            setSheetOpen(false);
          },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      insert.mutate(
        { nome: nome.trim(), codigo_wise: codigo, ativo: true },
        {
          onSuccess: () => {
            toast.success("Fornecedor cadastrado");
            setSheetOpen(false);
          },
          onError: (e) => toast.error(e.message),
        },
      );
    }
  };

  const inativoCount = (fornecedores as FornecedorRow[]).filter(
    (f) => f.ativo === false && f.nome !== AGUARDANDO_VINCULO,
  ).length;

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle="Cadastro de fornecedores do galpão"
        actions={<Button onClick={openCreate}>Novo</Button>}
      />

      {pendFornecedor.length > 0 && (
        <Card className="mb-4 border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-sm text-warning">
              {pendFornecedor.length} nome(s) a vincular
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendFornecedor.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm border-b pb-2">
                <span className="font-medium">{p.nome_externo}</span>
                <div className="w-52">
                  <SeletorCadastro
                    tipo="fornecedor"
                    value={null}
                    placeholder="Vincular a…"
                    onChange={(id) => {
                      if (!id) return;
                      resolver.mutate(
                        {
                          pendenciaId: p.id,
                          acao: "vincular",
                          tipo: "fornecedor",
                          nomeExterno: p.nome_externo,
                          codigoExterno: p.codigo_externo,
                          entidadeId: id,
                          userId: user!.id,
                        },
                        { onSuccess: () => toast.success("Vinculado") },
                      );
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    resolver.mutate(
                      {
                        pendenciaId: p.id,
                        acao: "criar",
                        tipo: "fornecedor",
                        nomeExterno: p.nome_externo,
                        criarNome: p.nome_externo,
                        userId: user!.id,
                      },
                      { onSuccess: () => toast.success("Criado") },
                    )
                  }
                >
                  Criar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <MesclarCadastrosPanel
        tipo="fornecedor"
        rows={fornecedores as FornecedorRow[]}
        aliases={aliases as { tipo: string; nome_externo: string; entidade_id?: string | null }[]}
        selecionados={selecionados}
        onLimparSelecao={() => setSelecionados([])}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          placeholder="Buscar fornecedor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        {inativoCount > 0 && (
          <label className="text-sm flex items-center gap-1.5">
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
        <ul className="text-sm space-y-0.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`flex justify-between items-center py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer border-b border-border ${row.ativo === false ? "opacity-50" : ""}`}
              onClick={() => openEdit(row)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={selecionados.includes(row.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelecionado(row.id)}
                  aria-label={`Selecionar ${row.nome}`}
                />
                <span className="min-w-0">
                  {row.codigo_wise ? (
                    <span className="chip chip-muted mr-1">{row.codigo_wise}</span>
                  ) : null}
                  {row.nome}
                  {row.mesclado_em_id ? (
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      · mesclado em {nomePorId.get(row.mesclado_em_id) ?? "outro cadastro"}
                    </span>
                  ) : null}
                </span>
              </span>
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {row.ativo === false ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      update.mutate(
                        { id: row.id, ativo: true },
                        {
                          onSuccess: () => toast.success("Reativado"),
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                  >
                    Reativar
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7"
                    onClick={() => setPendingDesativar(row)}
                  >
                    Desativar
                  </Button>
                )}
              </div>
            </li>
          ))}
          {!rows.length && (
            <li className="text-muted-foreground py-4 text-center">Nenhum fornecedor encontrado</li>
          )}
        </ul>
      )}

      <AlertDialog
        open={!!pendingDesativar}
        onOpenChange={(open) => !open && setPendingDesativar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar este fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDesativar
                ? `${pendingDesativar.nome} sai das listas de movimentação e inventário. O histórico permanece.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!pendingDesativar) return;
                update.mutate(
                  { id: pendingDesativar.id, ativo: false },
                  {
                    onSuccess: () => {
                      toast.success("Fornecedor desativado");
                      setPendingDesativar(null);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Editar fornecedor" : "Novo fornecedor"}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Código Wise</Label>
              <Input
                value={codigoWise}
                onChange={(e) => setCodigoWise(e.target.value)}
                placeholder="Ex.: 35527016"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>
            {editId && fornecedorAliases.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Aliases Wise vinculados</Label>
                <ul className="text-xs space-y-1">
                  {fornecedorAliases.map((a) => (
                    <li key={a.id} className="border rounded px-2 py-1">
                      {a.nome_externo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={insert.isPending || update.isPending}>
              {insert.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
