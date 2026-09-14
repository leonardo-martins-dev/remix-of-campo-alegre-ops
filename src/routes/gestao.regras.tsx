import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { RegrasPage } from "@/components/gestao/regras-page";

export const Route = createFileRoute("/gestao/regras")({
  component: Page,
  head: () => ({ meta: [{ title: "Regras do Sistema · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" />;
  return <RegrasPage />;
}
