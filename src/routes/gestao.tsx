import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/hooks/use-cadastros";

export const Route = createFileRoute("/gestao")({
  component: Page,
  head: () => ({ meta: [{ title: "Configurações · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();

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
    </div>
  );
}

function CadastroTable({
  label,
  table,
  placeholder,
  useData,
}: {
  label: string;
  table: string;
  placeholder: string;
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
          <Input placeholder={placeholder} value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button
            onClick={() => {
              if (!nome.trim()) return;
              insert.mutate(
                table === "caminhoes" ? { placa: nome.trim().toUpperCase() } : { nome: nome.trim() },
                {
                  onSuccess: () => { setNome(""); toast.success("Cadastrado"); },
                  onError: (e) => toast.error(e.message),
                }
              );
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
        {!isLoading && (
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
