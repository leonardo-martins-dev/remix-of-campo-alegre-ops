import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { CreateUserForm, UsersList } from "@/components/gestao/user-management";

export const Route = createFileRoute("/gestao/usuarios")({
  component: Page,
  head: () => ({ meta: [{ title: "Usuários · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin, refreshProfile } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/" />;
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Cadastro de novos usuários e permissões de acesso"
      />
      <div className="space-y-6">
        <CreateUserForm onCreated={refreshProfile} />
        <UsersList />
      </div>
    </div>
  );
}
