import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/super-admin";
import { CreateUserForm, UsersList } from "@/components/gestao/user-management";

export const Route = createFileRoute("/gestao/usuarios")({
  component: Page,
  head: () => ({ meta: [{ title: "Criar Usuários · Campo Alegre" }] }),
});

function Page() {
  const { profile, user, refreshProfile } = useAuth();

  if (!isSuperAdmin(profile?.email ?? user?.email)) {
    return <Navigate to="/" />;
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Criar Usuários"
        subtitle="Cadastro de novos usuários e permissões de acesso"
      />
      <div className="space-y-6">
        <CreateUserForm onCreated={refreshProfile} />
        <UsersList />
      </div>
    </div>
  );
}
