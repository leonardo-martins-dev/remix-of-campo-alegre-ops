import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import {
  useProfiles,
  useUpdateProfile,
  useAllPages,
  useUserPermissions,
  useSetPermission,
  createUserViaEdge,
} from "@/hooks/use-users";
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
} from "@/hooks/use-cadastros";

export const Route = createFileRoute("/gestao")({
  component: Page,
  head: () => ({ meta: [{ title: "Configurações · Campo Alegre" }] }),
});

function Page() {
  const { profile, refreshProfile } = useAuth();
  const isAdmin = profile?.role === "admin";

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
      <PageHeader title="Configurações" subtitle="Gestão de usuários, cadastros e parâmetros" />
      <Tabs defaultValue="usuarios" className="max-w-4xl">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          <TabsTrigger value="config">Parâmetros</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios" className="space-y-6 mt-4">
          <CreateUserForm onCreated={refreshProfile} />
          <UsersList />
        </TabsContent>
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

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !password.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoading(true);
    try {
      await createUserViaEdge(nome.trim(), email.trim(), password);
      toast.success(`Usuário "${nome}" criado`);
      setNome("");
      setEmail("");
      setPassword("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar usuário");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar Usuário</CardTitle>
        <CardDescription>Nome, email e senha — perfil criado automaticamente</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar Usuário"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UsersList() {
  const { data: users = [], isLoading } = useProfiles();
  const { data: allPages = [] } = useAllPages();
  const updateProfile = useUpdateProfile();
  const setPermission = useSetPermission();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const { data: perms = [] } = useUserPermissions(selectedUser);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando usuários...</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Usuários</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {users.map((u: { id: string; nome: string; email: string; role: string; ativo: boolean }) => (
          <div key={u.id} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <div className="font-semibold text-navy">{u.nome}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={u.role}
                  onValueChange={(role) => updateProfile.mutate({ id: u.id, role }, { onSuccess: () => toast.success("Role atualizada") })}
                >
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateProfile.mutate({ id: u.id, ativo: !u.ativo })}
                >
                  {u.ativo ? "Desativar" : "Ativar"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedUser(selectedUser === u.id ? null : u.id)}>
                  Permissões
                </Button>
              </div>
            </div>
            {selectedUser === u.id && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border">
                {allPages.map((p: { id: string; slug: string; nome: string }) => {
                  const perm = perms.find((x: { page_id: string }) => x.page_id === p.id);
                  const checked = u.role === "admin" || perm?.can_access === true;
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={u.role === "admin"}
                        onCheckedChange={(v) =>
                          setPermission.mutate(
                            { userId: u.id, pageId: p.id, canAccess: !!v },
                            { onSuccess: () => toast.success("Permissão atualizada") }
                          )
                        }
                      />
                      {p.nome}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CadastrosPanel() {
  const tables = [
    { label: "Fornecedores", table: "fornecedores", hook: useFornecedores },
    { label: "Clientes", table: "clientes", hook: useClientes },
    { label: "Motoristas", table: "motoristas", hook: useMotoristas },
    { label: "Caminhões", table: "caminhoes", hook: useCaminhoes },
    { label: "Rotas", table: "rotas", hook: useRotas },
    { label: "Destinatários", table: "destinatarios", hook: useDestinatarios },
  ] as const;

  return (
    <div className="space-y-6">
      {tables.map(({ label, table, hook }) => (
        <CadastroTable key={table} label={label} table={table} useData={hook} />
      ))}
      <ProdutosTable />
    </div>
  );
}

function CadastroTable({
  label,
  table,
  useData,
}: {
  label: string;
  table: string;
  useData: () => { data?: { id: string; nome: string }[]; isLoading: boolean };
}) {
  const { data = [], isLoading } = useData();
  const { insert, remove } = useCadastroMutations(table, ["cadastros", table]);
  const [nome, setNome] = useState("");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Input placeholder="Placa do caminhão" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button
            onClick={() => {
              if (!nome.trim()) return;
              insert.mutate(
                table === "caminhoes" ? { placa: nome.trim().toUpperCase() } : { nome: nome.trim() },
                {
                onSuccess: () => { setNome(""); toast.success("Cadastrado"); },
                onError: (e) => toast.error(e.message),
              });
            }}
          >
            Adicionar
          </Button>
        </div>
        {isLoading ? <p className="text-xs text-muted-foreground">Carregando...</p> : (
          <ul className="space-y-1 text-sm">
            {data.map((row) => (
              <li key={row.id} className="flex justify-between items-center py-1 border-b border-border">
                <span>{row.nome}</span>
                <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => remove.mutate(row.id, { onSuccess: () => toast.success("Removido") })}>
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProdutosTable() {
  const { data = [], isLoading } = useProdutos();
  const { insert, remove } = useCadastroMutations("produtos", ["cadastros", "produtos"]);
  const [nome, setNome] = useState("");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Produtos</CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Input placeholder="Nome do produto" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button
            onClick={() => {
              if (!nome.trim()) return;
              insert.mutate({ nome: nome.trim(), unidade: "un" }, {
                onSuccess: () => { setNome(""); toast.success("Produto cadastrado"); },
              });
            }}
          >
            Adicionar
          </Button>
        </div>
        {isLoading ? null : (
          <ul className="space-y-1 text-sm">
            {(data as { id: string; nome: string }[]).map((row) => (
              <li key={row.id} className="flex justify-between py-1 border-b border-border">
                <span>{row.nome}</span>
                <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => remove.mutate(row.id)}>Excluir</Button>
              </li>
            ))}
          </ul>
        )}
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
