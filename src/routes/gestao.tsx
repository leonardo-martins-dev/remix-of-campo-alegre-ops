import { useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useAuth } from "@/lib/auth";
import {
  useFornecedores,
  useClientes,
  useProdutos,
  useMotoristas,
  useCaminhoes,
  useRotas,
  useDestinatarios,
  useConfiguracoes,
  useCadastroMutations,
  useUpdateConfiguracao,
  useDestinatarioClienteMap,
  useSaveDestinatarioClienteMap,
} from "@/hooks/use-cadastros";

export const Route = createFileRoute("/gestao")({
  component: Page,
  head: () => ({ meta: [{ title: "Configurações · Campo Alegre" }] }),
});

function Page() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname.startsWith("/gestao/") && pathname !== "/gestao";
  const { isAdmin } = useAuth();

  if (isChildRoute) {
    return <Outlet />;
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Configurações" subtitle="Acesso restrito a administradores" />
        <p className="text-sm text-muted-foreground">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Cadastros e parâmetros do sistema" />
      <Tabs defaultValue="cadastros" className="max-w-4xl">
        <TabsList>
          <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          <TabsTrigger value="config">Parâmetros</TabsTrigger>
        </TabsList>
        <TabsContent value="cadastros" className="mt-4">
          <CadastrosPanel />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <ConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CadastrosPanel() {
  const tables = [
    { label: "Fornecedores", table: "fornecedores", hook: useFornecedores, placeholder: "Nome do fornecedor" },
    { label: "Clientes", table: "clientes", hook: useClientes, placeholder: "Nome do cliente" },
    { label: "Motoristas", table: "motoristas", hook: useMotoristas, placeholder: "Nome do motorista" },
    { label: "Caminhões", table: "caminhoes", hook: useCaminhoes, placeholder: "Placa do caminhão" },
    { label: "Rotas", table: "rotas", hook: useRotas, placeholder: "Nome da rota" },
    { label: "Destinatários", table: "destinatarios", hook: useDestinatarios, placeholder: "Nome do destinatário" },
  ] as const;

  return (
    <div className="space-y-6">
      {tables.map(({ label, table, hook, placeholder }) => (
        <CadastroTable key={table} label={label} table={table} placeholder={placeholder} useData={hook} />
      ))}
      <ProdutosTable />
      <MapeamentoExpedicao />
    </div>
  );
}

function MapeamentoExpedicao() {
  const { data: destinatarios = [] } = useDestinatarios();
  const { data: clientes = [] } = useClientes();
  const { data: map = [] } = useDestinatarioClienteMap();
  const save = useSaveDestinatarioClienteMap();
  const [destId, setDestId] = useState("");
  const [cliId, setCliId] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mapeamento Destinatário → Cliente (expedição)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Vincule destinatários do rateio (recebimento) aos clientes do painel de carga.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-border px-2 text-sm"
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
          >
            <option value="">Destinatário…</option>
            {destinatarios.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-border px-2 text-sm"
            value={cliId}
            onChange={(e) => setCliId(e.target.value)}
          >
            <option value="">Cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!destId || !cliId || save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({ destinatario_id: destId, cliente_id: cliId });
                toast.success("Mapeamento salvo");
                setDestId("");
                setCliId("");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao salvar");
              }
            }}
          >
            Vincular
          </Button>
        </div>
        <ul className="text-sm space-y-1">
          {map.map((m: {
            id: string;
            destinatarios: { nome: string } | null;
            clientes: { nome: string } | null;
          }) => (
            <li key={m.id} className="flex justify-between border-t border-border py-1">
              <span>{m.destinatarios?.nome}</span>
              <span className="text-muted-foreground">→ {m.clientes?.nome}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type CadastroRow = { id: string; nome?: string; placa?: string };

function CadastroTable({
  label,
  table,
  placeholder,
  useData,
}: {
  label: string;
  table: string;
  placeholder: string;
  useData: () => { data?: CadastroRow[]; isLoading: boolean };
}) {
  const { data = [], isLoading } = useData();
  const { insert, remove } = useCadastroMutations(table, ["cadastros", table]);
  const [nome, setNome] = useState("");
  const [touched, setTouched] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const emptyLabel = table === "caminhoes" ? "Informe a placa" : "Informe um nome";

  const rowLabel = (row: CadastroRow) =>
    table === "caminhoes" ? row.placa ?? row.nome ?? "—" : row.nome ?? "—";

  const showError = touched && !nome.trim();

  const handleAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!nome.trim()) {
      toast.error(emptyLabel);
      return;
    }
    insert.mutate(
      table === "caminhoes" ? { placa: nome.trim().toUpperCase() } : { nome: nome.trim() },
      {
        onSuccess: () => {
          setNome("");
          setTouched(false);
          toast.success("Cadastrado");
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleAdd} className="mb-1">
          <div className="flex gap-2">
            <Input
              placeholder={placeholder}
              value={nome}
              aria-invalid={showError}
              aria-describedby={showError ? `${table}-nome-error` : undefined}
              className={showError ? "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive" : ""}
              onChange={(e) => {
                setNome(e.target.value);
                if (e.target.value.trim()) setTouched(false);
              }}
            />
            <Button type="submit">Adicionar</Button>
          </div>
          {showError && (
            <p id={`${table}-nome-error`} className="text-sm font-medium text-destructive mt-2" role="alert">
              {emptyLabel} para cadastrar
            </p>
          )}
        </form>
        {isLoading ? <p className="text-xs text-muted-foreground">Carregando...</p> : (
          <ul className="space-y-1 text-sm">
            {data.map((row) => (
              <li key={row.id} className="flex justify-between items-center py-1 border-b border-border">
                <span>{rowLabel(row)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7"
                  onClick={() => setDeleteId(row.id)}
                >
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
        )}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!deleteId) return;
                  remove.mutate(deleteId, {
                    onSuccess: () => {
                      toast.success("Removido");
                      setDeleteId(null);
                    },
                    onError: (e) => toast.error(e.message),
                  });
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function ProdutosTable() {
  const { data = [], isLoading } = useProdutos();
  const { insert, remove } = useCadastroMutations("produtos", ["cadastros", "produtos"]);
  const [nome, setNome] = useState("");
  const [touched, setTouched] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const showError = touched && !nome.trim();

  const handleAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!nome.trim()) {
      toast.error("Informe um nome");
      return;
    }
    insert.mutate(
      { nome: nome.trim(), unidade: "un" },
      {
        onSuccess: () => {
          setNome("");
          setTouched(false);
          toast.success("Produto cadastrado");
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Produtos</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleAdd} className="mb-1">
          <div className="flex gap-2">
            <Input
              placeholder="Nome do produto"
              value={nome}
              aria-invalid={showError}
              aria-describedby={showError ? "produto-nome-error" : undefined}
              className={showError ? "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive" : ""}
              onChange={(e) => {
                setNome(e.target.value);
                if (e.target.value.trim()) setTouched(false);
              }}
            />
            <Button type="submit">Adicionar</Button>
          </div>
          {showError && (
            <p id="produto-nome-error" className="text-sm font-medium text-destructive mt-2" role="alert">
              Informe um nome para cadastrar
            </p>
          )}
        </form>
        {!isLoading && (
          <ul className="space-y-1 text-sm">
            {(data as { id: string; nome: string }[]).map((row) => (
              <li key={row.id} className="flex justify-between py-1 border-b border-border">
                <span>{row.nome}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7"
                  onClick={() => setDeleteId(row.id)}
                >
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
        )}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!deleteId) return;
                  remove.mutate(deleteId, {
                    onSuccess: () => {
                      toast.success("Removido");
                      setDeleteId(null);
                    },
                    onError: (e) => toast.error(e.message),
                  });
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function ConfigPanel() {
  const { data: configs = [] } = useConfiguracoes();
  const updateConfig = useUpdateConfiguracao();

  return (
    <Card>
      <CardHeader><CardTitle>Parâmetros do sistema</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {configs.map((c: { id: string; chave: string; valor: unknown; descricao: string | null }) => (
          <div key={c.id} className="space-y-1">
            <Label>{c.chave}</Label>
            {c.descricao && <p className="text-[10px] text-muted-foreground">{c.descricao}</p>}
            <Input
              defaultValue={String(c.valor ?? "").replace(/"/g, "")}
              onBlur={(e) =>
                updateConfig.mutate(
                  { chave: c.chave, valor: e.target.value },
                  { onSuccess: () => toast.success("Salvo") }
                )
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
