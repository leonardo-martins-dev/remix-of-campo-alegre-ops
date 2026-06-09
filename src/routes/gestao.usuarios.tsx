import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { CreateUserForm, UsersList } from "@/components/gestao/user-management";

type UsuariosSearch = { permUserId?: string };

export const Route = createFileRoute("/gestao/usuarios")({
  validateSearch: (search: Record<string, unknown>): UsuariosSearch => ({
    permUserId: typeof search.permUserId === "string" ? search.permUserId : undefined,
  }),
  component: Page,
  head: () => ({ meta: [{ title: "Criar Usuários · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin, refreshProfile } = useAuth();
  const { permUserId } = Route.useSearch();

  if (!isAdmin) {
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
        <UsersList permUserId={permUserId} />
      </div>
    </div>
  );
}
