import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useClientes,
  useDestinatarios,
  useDestinatarioClienteMap,
  useCadastroMutations,
} from "@/hooks/use-cadastros";
import { normalizeKey } from "@/lib/normalize";
import { useAliases } from "@/hooks/use-pedidos";
import { MesclarCadastrosPanel } from "@/components/gestao/mesclar-cadastros";

type ClienteRow = {
  id: string;
  nome: string;
  cnpj?: string | null;
  ativo: boolean;
  codigo_wise?: string | null;
  mesclado_em_id?: string | null;
};

export function ClientesPage() {
  const { data: clientes = [], isLoading } = useClientes();
  const { data: destinatarios = [] } = useDestinatarios();
  const { data: destMap = [] } = useDestinatarioClienteMap();
  const { data: aliases = [] } = useAliases();
  const { insert, update } = useCadastroMutations("clientes", ["cadastros", "clientes"]);

  const [busca, setBusca] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [codigoWise, setCodigoWise] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pendingDesativar, setPendingDesativar] = useState<ClienteRow | null>(null);

  const rows = useMemo(() => {
    const q = normalizeKey(busca);
    let list = clientes as ClienteRow[];
    if (q)
      list = list.filter(
        (c) => normalizeKey(c.nome).includes(q) || normalizeKey(c.cnpj ?? "").includes(q),
      );
    const ativos = list.filter((c) => c.ativo !== false);
    const inativos = list.filter((c) => c.ativo === false);
    return showInativos ? [...ativos, ...inativos] : ativos;
  }, [clientes, busca, showInativos]);

  const linkedDests = useMemo(() => {
    if (!editId) return [];
    return (
      destMap as {
        id: string;
        cliente_id: string;
        destinatarios: { nome: string } | { nome: string }[] | null;
      }[]
    )
      .filter((m) => m.cliente_id === editId)
      .map((m) => {
        const d = Array.isArray(m.destinatarios) ? m.destinatarios[0] : m.destinatarios;
        return d?.nome ?? "—";
      });
  }, [destMap, editId]);

  const openCreate = () => {
    setEditId(null);
    setNome("");
    setCnpj("");
    setCodigoWise("");
    setSheetOpen(true);
  };

  const openEdit = (row: ClienteRow) => {
    setEditId(row.id);
    setNome(row.nome);
    setCnpj(row.cnpj ?? "");
    setCodigoWise(row.codigo_wise ?? "");
    setSheetOpen(true);
  };

  const nomePorId = useMemo(
    () => new Map((clientes as ClienteRow[]).map((c) => [c.id, c.nome])),
    [clientes],
  );

  const toggleSelecionado = (id: string) =>
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    const payload: Record<string, unknown> = {
      nome: nome.trim(),
      cnpj: cnpj.replace(/\D/g, "") || null,
      codigo_wise: codigoWise.trim() || null,
    };
    if (editId) {
      update.mutate(
        { id: editId, ...payload },
        {
          onSuccess: () => {
            toast.success("Cliente atualizado");
            setSheetOpen(false);
          },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      insert.mutate(
        { ...payload, ativo: true },
        {
          onSuccess: () => {
            toast.success("Cliente cadastrado");
            setSheetOpen(false);
          },
          onError: (e) => toast.error(e.message),
        },
      );
    }
  };

  const inativoCount = (clientes as ClienteRow[]).filter((c) => c.ativo === false).length;

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Supermercados atendidos pelo galpão"
        actions={<Button onClick={openCreate}>Novo</Button>}
      />

      <MesclarCadastrosPanel
        tipo="cliente"
        rows={clientes as ClienteRow[]}
        aliases={aliases as { tipo: string; nome_externo: string; entidade_id?: string | null }[]}
        selecionados={selecionados}
        onLimparSelecao={() => setSelecionados([])}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          placeholder="Buscar cliente ou CNPJ…"
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
                  {row.cnpj ? <span className="text-muted-foreground"> · {row.cnpj}</span> : null}
                  {row.mesclado_em_id ? (
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      · mesclado em {nomePorId.get(row.mesclado_em_id) ?? "outro cadastro"}
                    </span>
                  ) : row.ativo === false ? (
                    <span className="text-muted-foreground"> · inativo</span>
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
            <li className="text-muted-foreground py-4 text-center">Nenhum cliente encontrado</li>
          )}
        </ul>
      )}

      <AlertDialog
        open={!!pendingDesativar}
        onOpenChange={(open) => !open && setPendingDesativar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar este cliente?</AlertDialogTitle>
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
                      toast.success("Cliente desativado");
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
            <SheetTitle>{editId ? "Editar cliente" : "Novo cliente"}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Código Wise</Label>
              <Input
                value={codigoWise}
                onChange={(e) => setCodigoWise(e.target.value)}
                placeholder="Ex.: 130572"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do supermercado"
              />
            </div>
            <div className="space-y-1">
              <Label>CNPJ</Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
            {editId && linkedDests.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Nomes antigos vinculados (destinatários legado)
                </Label>
                <ul className="text-xs space-y-1">
                  {linkedDests.map((d, i) => (
                    <li key={i} className="border rounded px-2 py-1">
                      {d}
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
