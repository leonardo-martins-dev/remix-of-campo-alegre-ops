import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useProfiles,
  useUpdateProfile,
  useAllPages,
  useUserPermissions,
  useSetPermission,
  createUserViaEdge,
} from "@/hooks/use-users";

export function CreateUserForm({ onCreated }: { onCreated?: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !password.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoading(true);
    try {
      await createUserViaEdge(nome.trim(), email.trim(), password, role);
      toast.success(`Usuário "${nome}" criado com sucesso`);
      setNome("");
      setEmail("");
      setPassword("");
      setRole("user");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar usuário");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo usuário</CardTitle>
        <CardDescription>Preencha nome, email, senha e perfil de acesso.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="usuario@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Perfil</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Operação</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
            {loading ? "Criando..." : "Criar usuário"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function UsersList() {
  const { data: users = [], isLoading } = useProfiles();
  const { data: allPages = [] } = useAllPages();
  const updateProfile = useUpdateProfile();
  const setPermission = useSetPermission();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const { data: perms = [] } = useUserPermissions(selectedUser);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando usuários...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários cadastrados</CardTitle>
        <CardDescription>Gerencie roles, status e permissões por página</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {users.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
        )}
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
                  onValueChange={(role) =>
                    updateProfile.mutate({ id: u.id, role }, { onSuccess: () => toast.success("Role atualizada") })
                  }
                >
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => updateProfile.mutate({ id: u.id, ativo: !u.ativo })}>
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
