import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorCadastro } from "@/components/seletor-cadastro";
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
  useSetUserPermissions,
  useActiveAdminCount,
  createUserViaEdge,
} from "@/hooks/use-users";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/super-admin";
import { useFornecedores, useMotoristas } from "@/hooks/use-cadastros";
import {
  USUARIOS_SLUG,
  completePermissionGaps,
  counterLabel,
  grantWithDeps,
  groupPagesByModule,
  incompletePermissions,
  requiredDepsOf,
  revokeWithDependents,
} from "@/lib/permission-deps";

type UserRow = {
  id: string;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
  motorista_id?: string | null;
  fornecedor_id?: string | null;
};

export function CreateUserForm({ onCreated }: { onCreated?: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user" | "fornecedor">("user");
  const [fornecedorId, setFornecedorId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: fornecedores = [] } = useFornecedores();
  const { data: motoristas = [] } = useMotoristas();

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
      await createUserViaEdge(nome.trim(), email.trim(), password, role, {
        fornecedor_id: role === "fornecedor" ? fornecedorId || null : null,
        motorista_id: motoristaId || null,
      });
      toast.success(`Usuário "${nome}" criado com sucesso`);
      setNome("");
      setEmail("");
      setPassword("");
      setRole("user");
      setFornecedorId("");
      setMotoristaId("");
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
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user" | "fornecedor")}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Operação</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="fornecedor">Fornecedor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "fornecedor" && (
            <div className="space-y-2">
              <Label>Fornecedor vinculado</Label>
              <SeletorCadastro
                tipo="fornecedor"
                value={fornecedorId || null}
                onChange={(id) => setFornecedorId(id)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Motorista vinculado (opcional)</Label>
            <SeletorCadastro
              tipo="motorista"
              value={motoristaId || null}
              onChange={(id) => setMotoristaId(id)}
              allowClear
              clearLabel="Nenhum"
              placeholder="Nenhum"
            />
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
  const setPermissions = useSetUserPermissions();
  const { data: adminCount = 0 } = useActiveAdminCount();
  const { data: perms = [], isLoading: loadingPerms } = useUserPermissions(open ? user?.id ?? null : null);

  const enabledSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const row of perms) {
      if (row.can_access !== true) continue;
      const slug = (row as { pages?: { slug?: string } | { slug?: string }[] | null }).pages;
      const s = Array.isArray(slug) ? slug[0]?.slug : slug?.slug;
      // fallback: resolve via allPages
      if (s) set.add(s);
      else {
        const page = allPages.find((p: { id: string }) => p.id === row.page_id);
        if (page?.slug) set.add(page.slug);
      }
    }
    return set;
  }, [perms, allPages]);

  const gaps = useMemo(() => incompletePermissions(enabledSlugs), [enabledSlugs]);
  const groups = useMemo(
    () =>
      groupPagesByModule(
        allPages.map((p: { id: string; slug: string; nome: string; grupo?: string; ordem?: number }) => ({
          id: p.id,
          slug: p.slug,
          nome: p.nome,
          grupo: p.grupo,
          ordem: p.ordem,
        })),
      ),
    [allPages],
  );

  const nomeBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPages) m.set(p.slug, p.nome);
    return m;
  }, [allPages]);

  const catalogSlugs = useMemo(() => allPages.map((p: { slug: string }) => p.slug), [allPages]);

  const persist = async (
    next: Set<string>,
    opts?: { toastAdded?: string[]; toastRemoved?: string[]; silentSuccess?: boolean },
  ) => {
    if (!user) return;
    // Trava client-side do último admin (servidor confirma)
    if (
      user.role === "admin" &&
      enabledSlugs.has(USUARIOS_SLUG) &&
      !next.has(USUARIOS_SLUG) &&
      adminCount <= 1
    ) {
      toast.error("Não é possível remover a permissão Usuários do último administrador");
      return;
    }
    try {
      await setPermissions.mutateAsync({
        userId: user.id,
        enabledSlugs: [...next],
      });
      if (opts?.toastAdded?.length) {
        const names = opts.toastAdded.map((s) => nomeBySlug.get(s) ?? s);
        toast.message("Dependências liberadas automaticamente", {
          description: names.join(", "),
        });
      } else if (opts?.toastRemoved?.length) {
        const names = opts.toastRemoved.map((s) => nomeBySlug.get(s) ?? s);
        toast.message("Permissões removidas em cascata", {
          description: names.join(", "),
        });
      } else if (!opts?.silentSuccess) {
        toast.success("Permissões atualizadas");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar permissões");
    }
  };

  const toggleSlug = (slug: string, turnOn: boolean) => {
    if (!user) return;
    if (turnOn) {
      const { next, added } = grantWithDeps(enabledSlugs, slug);
      if (added.length) {
        const primary = nomeBySlug.get(slug) ?? slug;
        const names = added.map((s) => nomeBySlug.get(s) ?? s);
        toast.message(`${primary} também liberou`, { description: names.join(", ") });
        void persist(next, { silentSuccess: true });
      } else {
        void persist(next);
      }
    } else {
      if (
        slug === USUARIOS_SLUG &&
        user.role === "admin" &&
        adminCount <= 1
      ) {
        toast.error("Não é possível remover a permissão Usuários do último administrador");
        return;
      }
      const { next, removed } = revokeWithDependents(enabledSlugs, slug, catalogSlugs);
      if (
        user.role === "admin" &&
        enabledSlugs.has(USUARIOS_SLUG) &&
        !next.has(USUARIOS_SLUG) &&
        adminCount <= 1
      ) {
        toast.error("Não é possível remover a permissão Usuários do último administrador (cascata)");
        return;
      }
      const others = removed.filter((s) => s !== slug);
      if (others.length > 0) {
        const names = others.map((s) => nomeBySlug.get(s) ?? s);
        toast.message("Também serão desmarcadas", { description: names.join(", ") });
      }
      void persist(next, { toastRemoved: others.length ? removed : undefined });
    }
  };

  const toggleGroup = (slugs: string[], turnOn: boolean) => {
    if (!user) return;
    let next = new Set(enabledSlugs);
    const added: string[] = [];
    const removed: string[] = [];
    if (turnOn) {
      for (const slug of slugs) {
        const r = grantWithDeps(next, slug);
        next = r.next;
        added.push(...r.added);
      }
      void persist(next, { toastAdded: [...new Set(added)] });
    } else {
      for (const slug of [...slugs].reverse()) {
        const r = revokeWithDependents(next, slug, catalogSlugs);
        next = r.next;
        removed.push(...r.removed);
      }
      if (
        user.role === "admin" &&
        enabledSlugs.has(USUARIOS_SLUG) &&
        !next.has(USUARIOS_SLUG) &&
        adminCount <= 1
      ) {
        toast.error("Não é possível remover a permissão Usuários do último administrador");
        return;
      }
      void persist(next, { toastRemoved: [...new Set(removed)] });
    }
  };

  const completeGaps = () => {
    const { next, added } = completePermissionGaps(enabledSlugs);
    void persist(next, { toastAdded: added });
  };

  useEffect(() => {
    if (!open) return;
    if (loadingPages || loadingPerms) {
      toast.info("Carregando permissões…");
    }
    if (pagesError) {
      toast.error("Erro ao carregar páginas");
    }
  }, [open, loadingPages, loadingPerms, pagesError]);

  const depLinked = useMemo(() => {
    const linked = new Set<string>();
    for (const slug of enabledSlugs) {
      for (const d of requiredDepsOf(slug)) {
        if (enabledSlugs.has(d)) linked.add(d);
      }
    }
    return linked;
  }, [enabledSlugs]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto z-[100]">
        <SheetHeader>
          <SheetTitle>Permissões — {user?.nome ?? ""}</SheetTitle>
          <SheetDescription>
            Agrupadas por módulo. Dependências são resolvidas pelo sistema — combinação quebrada não
            grava.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {user?.role === "admin" ? (
            <p className="text-sm text-muted-foreground">
              Administradores têm acesso a todas as páginas do sistema. A permissão Usuários do
              último admin não pode ser removida.
            </p>
          ) : null}

          {user && user.role !== "admin" && gaps.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
              <p className="text-sm font-semibold text-navy">Conjunto incompleto</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {gaps.map((g) => (
                  <li key={g.slug}>
                    <span className="font-medium text-foreground">{nomeBySlug.get(g.slug) ?? g.slug}</span>
                    {" precisa de "}
                    {g.missing.map((m) => nomeBySlug.get(m) ?? m).join(", ")}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                className="min-h-10"
                disabled={setPermissions.isPending}
                onClick={completeGaps}
              >
                Completar dependências
              </Button>
            </div>
          )}

          {user?.role === "admin" ? null : loadingPages || loadingPerms ? (
            <p className="text-sm text-muted-foreground">Carregando páginas…</p>
          ) : pagesError ? (
            <p className="text-sm text-destructive">
              Erro ao carregar páginas. Tente recarregar a página.
            </p>
          ) : allPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma página cadastrada.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const enabledIn = g.pages.filter((p) => enabledSlugs.has(p.slug)).length;
                const allOn = enabledIn === g.pages.length && g.pages.length > 0;
                return (
                  <div key={g.module} className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-secondary/40">
                      <div className="min-w-0">
                        <div className="font-semibold text-navy text-sm">{g.module}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {counterLabel(enabledIn, g.pages.length)}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium shrink-0">
                        <Checkbox
                          checked={allOn}
                          disabled={setPermissions.isPending}
                          onCheckedChange={(v) =>
                            toggleGroup(
                              g.pages.map((p) => p.slug),
                              !!v,
                            )
                          }
                        />
                        Grupo
                      </label>
                    </div>
                    <ul className="divide-y divide-border">
                      {g.pages.map((p) => {
                        const checked = enabledSlugs.has(p.slug);
                        const linked = depLinked.has(p.slug);
                        return (
                          <li key={p.id}>
                            <label className="flex items-start gap-2 text-sm px-3 py-2.5 min-h-11 cursor-pointer hover:bg-secondary/30">
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                disabled={setPermissions.isPending}
                                onCheckedChange={(v) => toggleSlug(p.slug, !!v)}
                              />
                              <span className="min-w-0">
                                <span className="font-medium text-navy">{p.nome}</span>
                                {linked && checked ? (
                                  <span className="ml-2 chip chip-info text-[10px]">dependência</span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
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

export function UsersList() {
  const { data: users = [], isLoading } = useProfiles();
  const { data: motoristas = [] } = useMotoristas();
  const { data: fornecedores = [] } = useFornecedores();
  const updateProfile = useUpdateProfile();
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const openUser = users.find((u: UserRow) => u.id === openUserId) ?? null;

  const openPermissions = (u: UserRow) => {
    setOpenUserId(u.id);
    toast.info(`Abrindo permissões de ${u.nome}`);
  };

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
                      <SelectItem value="user">Operação</SelectItem>
                      <SelectItem value="fornecedor">Fornecedor</SelectItem>
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
                  <button
                    type="button"
                    aria-expanded={openUserId === u.id}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    onClick={() => openPermissions(u)}
                  >
                    Permissões
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="w-44">
                  <SeletorCadastro
                    tipo="motorista"
                    value={u.motorista_id ?? null}
                    onChange={(id) =>
                      updateProfile.mutate(
                        { id: u.id, motorista_id: id || null },
                        { onSuccess: () => toast.success("Motorista vinculado") },
                      )
                    }
                    allowClear
                    clearLabel="Sem motorista"
                    placeholder="Motorista"
                  />
                </div>
                <div className="w-44">
                  <SeletorCadastro
                    tipo="fornecedor"
                    value={u.fornecedor_id ?? null}
                    onChange={(id) =>
                      updateProfile.mutate(
                        { id: u.id, fornecedor_id: id || null },
                        { onSuccess: () => toast.success("Fornecedor vinculado") },
                      )
                    }
                    allowClear
                    clearLabel="Sem fornecedor"
                    placeholder="Fornecedor"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <PermissionsSheet
        user={openUser}
        open={!!openUserId}
        onClose={() => setOpenUserId(null)}
      />
    </>
  );
}
