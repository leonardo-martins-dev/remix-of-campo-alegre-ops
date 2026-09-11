import { useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
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
  useFamilias,
  useConfiguracoes,
  useCadastroMutations,
  useUpdateConfiguracao,
  useDestinatarioClienteMap,
  useSaveDestinatarioClienteMap,
} from "@/hooks/use-cadastros";
import { configLabel, statusLabel } from "@/lib/labels";
import { useCreateTipoCaixa, useDeleteTipoCaixa, useTiposCaixa, useUpdateTipoCaixa } from "@/hooks/use-tipos-caixa";
import { useAliases, usePendenciasVinculo } from "@/hooks/use-pedidos";
import { useResolverPendencia } from "@/hooks/use-wise-pedidos";
import { usePosicoes, useSaldosAbertura } from "@/hooks/use-ledger";
import { useMotivosAjuste, useSaveMotivoAjuste } from "@/hooks/use-inventario";
import { ProdutosCadastro } from "@/components/produtos-cadastro";

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
          <TabsTrigger value="caixas">Tipos de caixa</TabsTrigger>
          <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
          <TabsTrigger value="abertura">Saldos de abertura</TabsTrigger>
          <TabsTrigger value="motivos">Motivos</TabsTrigger>
          <TabsTrigger value="config">Parâmetros</TabsTrigger>
        </TabsList>
        <TabsContent value="cadastros" className="mt-4">
          <CadastrosPanel />
        </TabsContent>
        <TabsContent value="caixas" className="mt-4">
          <TiposCaixaPanel />
        </TabsContent>
        <TabsContent value="vinculos" className="mt-4">
          <VinculosPanel />
        </TabsContent>
        <TabsContent value="abertura" className="mt-4">
          <AberturaPanel />
        </TabsContent>
        <TabsContent value="motivos" className="mt-4">
          <MotivosPanel />
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
      <ProdutosCadastro />
      <FamiliasPanel />
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
          Legado: só para pedidos antigos com rateio. O fluxo novo usa cliente (CNPJ) direto no item — não é exigido para pedidos manuais ou Wise novos.
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
          {map.map((m) => (
            <li key={m.id} className="flex justify-between border-t border-border py-1">
              <span>{(Array.isArray(m.destinatarios) ? m.destinatarios[0] : m.destinatarios)?.nome}</span>
              <span className="text-muted-foreground">→ {(Array.isArray(m.clientes) ? m.clientes[0] : m.clientes)?.nome}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type CadastroRow = { id: string; nome?: string; placa?: string; cnpj?: string | null; ativo?: boolean };

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
  const { insert, update } = useCadastroMutations(table, ["cadastros", table]);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [touched, setTouched] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");

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
      table === "caminhoes"
        ? { placa: nome.trim().toUpperCase(), ativo: true }
        : table === "clientes"
          ? { nome: nome.trim(), cnpj: cnpj.replace(/\D/g, "") || null, ativo: true }
          : { nome: nome.trim(), ativo: true },
      {
        onSuccess: () => {
          setNome("");
          setCnpj("");
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
          <div className="flex flex-wrap gap-2">
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
            {table === "clientes" && (
              <Input
                className="w-44"
                placeholder="CNPJ"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
              />
            )}
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
              <li key={row.id} className={`flex justify-between items-center py-1 border-b border-border gap-2 ${row.ativo === false ? "opacity-50" : ""}`}>
                {editId === row.id ? (
                  <div className="flex flex-wrap gap-2 flex-1">
                    <Input
                      className="h-8"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                    />
                    {table === "clientes" && (
                      <Input className="h-8 w-36" value={editCnpj} onChange={(e) => setEditCnpj(e.target.value)} />
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        const payload: Record<string, unknown> = { id: row.id };
                        if (table === "caminhoes") payload.placa = editNome.trim().toUpperCase();
                        else payload.nome = editNome.trim();
                        if (table === "clientes") payload.cnpj = editCnpj.replace(/\D/g, "") || null;
                        update.mutate(payload as { id: string }, {
                          onSuccess: () => { toast.success("Atualizado"); setEditId(null); },
                          onError: (e) => toast.error(e.message),
                        });
                      }}
                    >
                      Salvar
                    </Button>
                  </div>
                ) : (
                  <span>
                    {rowLabel(row)}
                    {table === "clientes" && row.cnpj ? (
                      <span className="text-muted-foreground"> · {row.cnpj}</span>
                    ) : null}
                    {row.ativo === false ? <span className="text-muted-foreground"> · inativo</span> : null}
                  </span>
                )}
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      setEditId(row.id);
                      setEditNome(table === "caminhoes" ? row.placa ?? "" : row.nome ?? "");
                      setEditCnpj(row.cnpj ?? "");
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      update.mutate(
                        { id: row.id, ativo: row.ativo === false },
                        {
                          onSuccess: () => toast.success(row.ativo === false ? "Reativado" : "Inativado"),
                          onError: (e) => toast.error(e.message),
                        }
                      )
                    }
                  >
                    {row.ativo === false ? "Reativar" : "Inativar"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FamiliasPanel() {
  const { data: familias = [] } = useFamilias();
  const { insert, update } = useCadastroMutations("familias_produto", ["cadastros", "familias"]);
  const [nome, setNome] = useState("");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Famílias de produto</CardTitle></CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim()) return;
            insert.mutate(
              { nome: nome.trim(), ordem: (familias as { ordem?: number }[]).length + 1 },
              {
                onSuccess: () => { toast.success("Família cadastrada"); setNome(""); },
                onError: (err) => toast.error(err.message),
              }
            );
          }}
        >
          <Input placeholder="Nome da família" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button type="submit">Adicionar</Button>
        </form>
        <ul className="text-sm space-y-1">
          {(familias as { id: string; nome: string }[]).map((f) => (
            <li key={f.id} className="flex justify-between border-b border-border py-1">
              <span>{f.nome}</span>
              <Input
                className="h-8 w-48"
                defaultValue={f.nome}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (!next || next === f.nome) return;
                  update.mutate({ id: f.id, nome: next }, { onSuccess: () => toast.success("Família atualizada") });
                }}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TiposCaixaPanel() {
  const { data: tipos = [] } = useTiposCaixa(true);
  const create = useCreateTipoCaixa();
  const update = useUpdateTipoCaixa();
  const del = useDeleteTipoCaixa();
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [custo, setCusto] = useState("0");

  return (
    <Card>
      <CardHeader><CardTitle>Tipos de caixa</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { nome, sigla, custo_unitario: Number(custo) || 0 },
              {
                onSuccess: () => { toast.success("Tipo criado"); setNome(""); setSigla(""); },
                onError: (err) => toast.error(err.message),
              }
            );
          }}
        >
          <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input placeholder="Sigla" className="w-20" maxLength={2} value={sigla} onChange={(e) => setSigla(e.target.value)} />
          <Input placeholder="Custo" className="w-28" value={custo} onChange={(e) => setCusto(e.target.value)} />
          <Button type="submit">Adicionar</Button>
        </form>
        <ul className="text-sm space-y-2">
          {tipos.map((t) => (
            <li key={t.id} className={`flex flex-wrap items-center gap-2 border-b py-2 ${t.ativo ? "" : "opacity-50"}`}>
              <Input
                className="w-16"
                defaultValue={t.sigla}
                onBlur={(e) => {
                  const siglaNext = e.target.value.trim().toUpperCase();
                  if (!siglaNext || siglaNext === t.sigla) return;
                  update.mutate({ id: t.id, sigla: siglaNext }, {
                    onSuccess: () => toast.success("Sigla atualizada"),
                    onError: (err) => toast.error(err.message),
                  });
                }}
              />
              <Input
                className="w-36"
                defaultValue={t.nome}
                onBlur={(e) => {
                  const nomeNext = e.target.value.trim();
                  if (!nomeNext || nomeNext === t.nome) return;
                  update.mutate({ id: t.id, nome: nomeNext }, {
                    onSuccess: () => toast.success("Nome atualizado"),
                    onError: (err) => toast.error(err.message),
                  });
                }}
              />
              <Input
                className="w-28"
                defaultValue={t.custo_unitario}
                onBlur={(e) => update.mutate({ id: t.id, custo_unitario: Number(e.target.value) }, { onSuccess: () => toast.success("Custo atualizado") })}
              />
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: t.id, ativo: !t.ativo })}>
                {t.ativo ? "Inativar" : "Ativar"}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate(t.id, { onError: (e) => toast.error(e.message) })}>
                Excluir
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function VinculosPanel() {
  const { data: pendencias = [] } = usePendenciasVinculo();
  const { data: aliases = [] } = useAliases();
  const resolver = useResolverPendencia();
  const { user, isAdmin } = useAuth();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: produtos = [] } = useProdutos();
  const { data: destinatarios = [] } = useDestinatarios();
  const { data: clientes = [] } = useClientes();
  const [entidade, setEntidade] = useState<Record<string, string>>({});
  const [cliente, setCliente] = useState<Record<string, string>>({});

  if (!isAdmin) return <p className="text-sm">Somente administradores resolvem vínculos.</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Pendências de vínculo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(pendencias as { id: string; tipo: string; nome_externo: string; codigo_externo: string | null }[]).map((p) => {
            const lista = p.tipo === "fornecedor" ? fornecedores : p.tipo === "produto" ? produtos : destinatarios;
            return (
              <div key={p.id} className="border-b py-2 text-sm space-y-2">
                <p><strong>{p.tipo}</strong> · {p.nome_externo} {p.codigo_externo ? `(${p.codigo_externo})` : ""}</p>
                <div className="flex flex-wrap gap-2">
                  <select className="h-8 rounded-md border px-2" value={entidade[p.id] ?? ""} onChange={(e) => setEntidade((s) => ({ ...s, [p.id]: e.target.value }))}>
                    <option value="">Vincular a…</option>
                    {lista.map((x: { id: string; nome: string }) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                  {p.tipo === "destinatario" && (
                    <select className="h-8 rounded-md border px-2" value={cliente[p.id] ?? ""} onChange={(e) => setCliente((s) => ({ ...s, [p.id]: e.target.value }))}>
                      <option value="">Cliente (carga)…</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  )}
                  <Button size="sm" onClick={() => resolver.mutate({
                    pendenciaId: p.id, acao: "vincular", tipo: p.tipo as "fornecedor", nomeExterno: p.nome_externo,
                    codigoExterno: p.codigo_externo, entidadeId: entidade[p.id], userId: user!.id,
                  }, { onSuccess: () => toast.success("Vinculado") })}>Vincular</Button>
                  <Button size="sm" variant="outline" onClick={() => resolver.mutate({
                    pendenciaId: p.id, acao: "criar", tipo: p.tipo as "fornecedor", nomeExterno: p.nome_externo,
                    criarNome: p.nome_externo, clienteId: cliente[p.id], userId: user!.id,
                  }, { onSuccess: () => toast.success("Criado") })}>Criar</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    const motivo = window.prompt("Motivo para dispensar") ?? "";
                    resolver.mutate({
                      pendenciaId: p.id, acao: "dispensar", tipo: p.tipo as "fornecedor", nomeExterno: p.nome_externo,
                      motivo, userId: user!.id,
                    }, { onSuccess: () => toast.success("Dispensado") });
                  }}>Dispensar</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Aliases</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm">
            {(aliases as { id: string; tipo: string; nome_externo: string }[]).map((a) => (
              <li key={a.id}>{a.tipo} · {a.nome_externo}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AberturaPanel() {
  const { data: posicoes = [] } = usePosicoes();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: clientes = [] } = useClientes();
  const { data: fornecedores = [] } = useFornecedores();
  const { user } = useAuth();
  const abertura = useSaldosAbertura();
  const [pos, setPos] = useState("");
  const [sigla, setSigla] = useState("");
  const [qtd, setQtd] = useState("0");

  return (
    <Card>
      <CardHeader><CardTitle>Saldos de abertura</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Lançamento único da posição inicial. Não entra em enviadas/retornadas.</p>
        <select className="h-9 w-full rounded-md border px-2" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">Posição…</option>
          {(posicoes as { id: string; tipo: string; ref_id: string | null }[]).map((p) => {
            const nome = p.tipo === "galpao" ? "Galpão" : p.tipo === "cliente"
              ? clientes.find((c) => c.id === p.ref_id)?.nome
              : fornecedores.find((f) => f.id === p.ref_id)?.nome;
            return <option key={p.id} value={p.id}>{p.tipo} · {nome ?? p.ref_id}</option>;
          })}
        </select>
        <select className="h-9 w-full rounded-md border px-2" value={sigla} onChange={(e) => setSigla(e.target.value)}>
          <option value="">Tipo…</option>
          {tipos.map((t) => <option key={t.id} value={t.sigla}>{t.sigla}</option>)}
        </select>
        <Input value={qtd} onChange={(e) => setQtd(e.target.value)} />
        <Button onClick={() => abertura.mutate({
          posicao_id: pos, tipo_caixa: sigla, quantidade: Number(qtd), registrado_por: user!.id,
        }, { onSuccess: () => toast.success("Abertura lançada"), onError: (e) => toast.error(e.message) })}>
          Lançar abertura
        </Button>
      </CardContent>
    </Card>
  );
}

function MotivosPanel() {
  const { data: motivos = [] } = useMotivosAjuste(true);
  const save = useSaveMotivoAjuste();
  const [nome, setNome] = useState("");
  const [sentido, setSentido] = useState("saida");
  const [natureza, setNatureza] = useState("ajuste");
  const [custo, setCusto] = useState(false);
  const [contraria, setContraria] = useState(false);

  return (
    <Card>
      <CardHeader><CardTitle>Motivos de ajuste de caixa</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Nome do motivo" value={nome} onChange={(e) => setNome(e.target.value)} />
          <select className="h-9 rounded-md border px-2" value={sentido} onChange={(e) => setSentido(e.target.value)}>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="transferencia">Transferência</option>
          </select>
          <select className="h-9 rounded-md border px-2" value={natureza} onChange={(e) => setNatureza(e.target.value)}>
            <option value="ajuste">Ajuste</option>
            <option value="perda">Perda</option>
          </select>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={custo} onChange={(e) => setCusto(e.target.checked)} /> Entra em custo
          </label>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={contraria} onChange={(e) => setContraria(e.target.checked)} /> Exige posição contrária
          </label>
        </div>
        <Button
          onClick={() => {
            if (!nome.trim()) return;
            save.mutate(
              { nome: nome.trim(), sentido, natureza, entra_em_custo: custo, exige_posicao_contraria: contraria },
              { onSuccess: () => { toast.success("Motivo salvo"); setNome(""); } }
            );
          }}
        >
          Adicionar motivo
        </Button>
        <ul className="text-sm space-y-1">
          {motivos.map((m) => (
            <li key={m.id} className={`flex justify-between items-center border-t border-border pt-1 ${m.ativo ? "" : "opacity-50"}`}>
              <span>
                {m.nome} · {statusLabel(m.sentido)} · {statusLabel(m.natureza)}
                {m.entra_em_custo ? " · custo" : ""}
                {m.exige_posicao_contraria ? " · transferência" : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save.mutate({ ...m, ativo: !m.ativo }, { onSuccess: () => toast.success(m.ativo ? "Inativado" : "Reativado") })}
              >
                {m.ativo ? "Inativar" : "Reativar"}
              </Button>
            </li>
          ))}
        </ul>
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
            <Label>{configLabel(c.chave)}</Label>
            {c.descricao && <p className="text-[10px] text-muted-foreground">{c.descricao}</p>}
            <Input
              defaultValue={String(c.valor ?? "").replace(/"/g, "")}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (c.chave === "aging_alerta_dias") {
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 1 || n > 60) {
                    toast.error("aging_alerta_dias deve ser um número entre 1 e 60");
                    e.target.value = "7";
                    updateConfig.mutate({ chave: c.chave, valor: "7" });
                    return;
                  }
                }
                updateConfig.mutate(
                  { chave: c.chave, valor: raw },
                  { onSuccess: () => toast.success("Salvo") }
                );
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
