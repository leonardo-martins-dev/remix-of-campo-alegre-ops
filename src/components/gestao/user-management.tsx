import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useProfiles,
  useUpdateProfile,
  useAllPages,
  useUserPermissions,
  useSetPermission,
  createUserViaEdge,
} from "@/hooks/use-users";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/super-admin";
import { cn } from "@/lib/utils";

type UserRow = { id: string; nome: string; email: string; role: string; ativo: boolean };

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
    if (isSuperAdmin(email.trim())) {
      toast.error(`O email ${SUPER_ADMIN_EMAIL} é reservado ao administrador do sistema`);
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

function PermissionsSheet({
  user,
  open,
  onClose,
}: {
  user: UserRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: allPages = [], isLoading: loadingPages, isError: pagesError } = useAllPages();
  const setPermission = useSetPermission();
  const { data: perms = [], isLoading: loadingPerms } = useUserPermissions(open ? user?.id ?? null : null);

  useEffect(() => {
    if (!open) return;
    if (loadingPages || loadingPerms) {
      toast.info("Carregando permissões…");
    }
    if (pagesError) {
      toast.error("Erro ao carregar páginas");
    }
  }, [open, loadingPages, loadingPerms, pagesError]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Permissões — {user?.nome ?? ""}</SheetTitle>
          <SheetDescription>
            Defina quais páginas o usuário pode acessar.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4">
          {user?.role === "admin" ? (
            <p className="text-sm text-muted-foreground">
              Administradores têm acesso a todas as páginas do sistema.
            </p>
          ) : loadingPages || loadingPerms ? (
            <p className="text-sm text-muted-foreground">Carregando páginas…</p>
          ) : pagesError ? (
            <p className="text-sm text-destructive">
              Erro ao carregar páginas. Tente recarregar a página.
            </p>
          ) : allPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma página cadastrada.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {allPages.map((p: { id: string; slug: string; nome: string }) => {
                const perm = perms.find((x: { page_id: string }) => x.page_id === p.id);
                const checked = perm?.can_access === true;
                return (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setPermission.mutate(
                          { userId: user!.id, pageId: p.id, canAccess: !!v },
                          {
                            onSuccess: () => toast.success("Permissão atualizada"),
                            onError: (e) => toast.error(e.message),
                          }
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

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UsersList({ permUserId }: { permUserId?: string }) {
  const navigate = useNavigate({ from: "/gestao/usuarios" });
  const { data: users = [], isLoading } = useProfiles();
  const updateProfile = useUpdateProfile();

  const permsUser = users.find((u: UserRow) => u.id === permUserId) ?? null;

  const closePermissions = () => navigate({ search: {} });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando usuários...</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Usuários cadastrados</CardTitle>
          <CardDescription>Gerencie roles, status e permissões por página</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
          )}
          {users.map((u: UserRow) => (
            <div key={u.id} className="border border-border rounded-lg p-4">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateProfile.mutate({ id: u.id, ativo: !u.ativo })}
                  >
                    {u.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <Link
                    to="/gestao/usuarios"
                    search={{ permUserId: u.id }}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    aria-expanded={permUserId === u.id}
                    onClick={() => toast.info(`Abrindo permissões de ${u.nome}`)}
                  >
                    Permissões
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <PermissionsSheet
        user={permsUser}
        open={!!permUserId}
        onClose={closePermissions}
      />
    </>
  );
}
