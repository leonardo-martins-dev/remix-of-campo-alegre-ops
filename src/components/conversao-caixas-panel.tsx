import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { TableWrapper } from "@/components/table-wrapper";
import { Button } from "@/components/ui/button";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useConversoesProduto,
  useConversoesFornecedor,
  useRecentConversaoHistorico,
  useSaveConversaoProduto,
  useSaveConversaoFornecedor,
  useToggleConversaoProduto,
  useToggleConversaoFornecedor,
  useSaveImportacaoConversao,
  useProdutosSemConversao,
  type ConversaoProduto,
  type ConversaoFornecedor,
  type ImportConversaoResult,
} from "@/hooks/use-conversoes";
import { useProdutos, useFornecedores } from "@/hooks/use-cadastros";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useAuth } from "@/lib/auth";
import { normalizeKey } from "@/lib/normalize";
import {
  parseConversaoExcel,
  flattenConversaoRows,
  downloadPendencias,
  normalizeTipoCaixa,
  type ConversaoImportItem,
} from "@/lib/excel-conversao";
import { supabase } from "@/lib/supabase";

type FormProduto = {
  id?: string;
  produto_id: string;
  tipo_caixa_id: string;
  fator: string;
};

type FormFornecedor = {
  id?: string;
  fornecedor_id: string;
  produto_id: string;
  tipo_caixa_id: string;
  fator: string;
};

const EMPTY_FORM_PRODUTO: FormProduto = { produto_id: "", tipo_caixa_id: "", fator: "" };
const EMPTY_FORM_FORNECEDOR: FormFornecedor = { fornecedor_id: "", produto_id: "", tipo_caixa_id: "", fator: "" };

export function ConversaoCaixasPanel() {
  const [tab, setTab] = useState("produto");
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversão de caixas</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Fonte única de un/cx: produto × tipo de caixa (padrão) e fornecedor (sobrepõe). Usado no Conferir e na Expedição.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="produto">Por produto</TabsTrigger>
            <TabsTrigger value="fornecedor">Por fornecedor</TabsTrigger>
            <TabsTrigger value="importar">Importar planilha</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="produto">
            <ConversaoProdutoTab />
          </TabsContent>
          <TabsContent value="fornecedor">
            <ConversaoFornecedorTab />
          </TabsContent>
          <TabsContent value="importar">
            <ImportarConversaoTab />
          </TabsContent>
          <TabsContent value="historico">
            <HistoricoTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ConversaoProdutoTab() {
  const { data: conversoes = [], isLoading } = useConversoesProduto(true);
  const { data: semConversao = [] } = useProdutosSemConversao();
  const semSaida = semConversao.filter((p) => p.falta_saida);
  const { data: produtos = [] } = useProdutos();
  const { data: tiposCaixa = [] } = useTiposCaixa(true);
  const save = useSaveConversaoProduto();
  const toggle = useToggleConversaoProduto();
  
  const [form, setForm] = useState<FormProduto>(EMPTY_FORM_PRODUTO);
  const [formOpen, setFormOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [mostrarSem, setMostrarSem] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeKey(busca);
    if (!q) return conversoes;
    return conversoes.filter(
      (c) =>
        normalizeKey(c.produto_nome).includes(q) ||
        normalizeKey(c.produto_codigo ?? "").includes(q) ||
        normalizeKey(c.tipo_caixa_sigla).includes(q)
    );
  }, [conversoes, busca]);

  const openCreateFor = (produtoId?: string) => {
    setForm({ ...EMPTY_FORM_PRODUTO, produto_id: produtoId ?? "" });
    setFormOpen(true);
  };

  const openCreate = () => openCreateFor();

  const openEdit = (row: ConversaoProduto) => {
    setForm({
      id: row.id,
      produto_id: row.produto_id,
      tipo_caixa_id: row.tipo_caixa_id,
      fator: String(row.fator),
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    const fator = Number(form.fator);
    if (!form.produto_id || !form.tipo_caixa_id || !fator || fator <= 0) {
      toast.error("Preencha todos os campos. Fator deve ser maior que zero.");
      return;
    }
    save.mutate(
      { id: form.id, produto_id: form.produto_id, tipo_caixa_id: form.tipo_caixa_id, fator },
      {
        onSuccess: () => {
          toast.success(form.id ? "Conversão atualizada" : "Conversão cadastrada");
          setFormOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Buscar por produto ou tipo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Button
          type="button"
          size="sm"
          variant={mostrarSem ? "default" : "outline"}
          onClick={() => setMostrarSem((v) => !v)}
        >
          Sem conversão ({semSaida.length})
        </Button>
        <Button type="button" size="sm" onClick={openCreate}>
          Nova conversão
        </Button>
      </div>

      {mostrarSem && semSaida.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-warning">
            Produtos sem fator de saída — ordenados por uso recente em pedidos
          </p>
          <ul className="text-sm max-h-48 overflow-y-auto divide-y">
            {semSaida.map((p) => (
              <li key={p.produto_id} className="flex justify-between items-center py-1.5 gap-2">
                <span>
                  <span className="font-medium">{p.produto_nome}</span>
                  {p.produto_codigo && (
                    <span className="text-muted-foreground"> · {p.produto_codigo}</span>
                  )}
                  {p.falta_fornecedor && (
                    <span className="chip chip-muted text-[10px] ml-1">
                      forn. × tipo ({p.qtd_fornecedores_sem_fator})
                    </span>
                  )}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => openCreateFor(p.produto_id)}>
                  Cadastrar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <ul className="text-sm max-h-[400px] overflow-y-auto divide-y">
          {filtered.map((row) => (
            <li
              key={row.id}
              className={`flex justify-between items-center py-2 gap-2 ${!row.ativo ? "opacity-50" : ""}`}
            >
              <span>
                <span className="font-medium">{row.produto_nome}</span>
                {row.produto_codigo && (
                  <span className="text-muted-foreground"> · {row.produto_codigo}</span>
                )}
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium">{row.tipo_caixa_sigla}</span>
                <span className="text-muted-foreground"> = </span>
                <span className="font-semibold text-primary">{row.fator} un/cx</span>
                {!row.ativo && <span className="text-muted-foreground"> · inativo</span>}
              </span>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7" onClick={() => openEdit(row)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    toggle.mutate(
                      { id: row.id, ativo: !row.ativo },
                      {
                        onSuccess: () => toast.success(row.ativo ? "Inativado" : "Reativado"),
                        onError: (e) => toast.error(e.message),
                      }
                    )
                  }
                >
                  {row.ativo ? "Inativar" : "Reativar"}
                </Button>
              </div>
            </li>
          ))}
          {!filtered.length && (
            <li className="text-muted-foreground py-2">Nenhuma conversão encontrada</li>
          )}
        </ul>
      )}
      
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar conversão" : "Nova conversão"}</DialogTitle>
            <DialogDescription>
              Define quantas unidades do produto cabem no tipo de caixa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Produto</Label>
              <SeletorCadastro
                tipo="produto"
                value={form.produto_id || null}
                onChange={(id) => setForm((s) => ({ ...s, produto_id: id }))}
                disabled={!!form.id}
              />
            </div>
            <div className="grid gap-1">
              <Label>Tipo de caixa</Label>
              <SeletorCadastro
                tipo="tipo_caixa"
                value={form.tipo_caixa_id || null}
                onChange={(id) => setForm((s) => ({ ...s, tipo_caixa_id: id }))}
                disabled={!!form.id}
              />
            </div>
            <div className="grid gap-1">
              <Label>Fator (unidades por caixa)</Label>
              <Input
                type="number"
                min={1}
                value={form.fator}
                onChange={(e) => setForm((s) => ({ ...s, fator: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConversaoFornecedorTab() {
  const { data: conversoes = [], isLoading } = useConversoesFornecedor(true);
  const { data: fornecedores = [] } = useFornecedores();
  const { data: produtos = [] } = useProdutos();
  const { data: tiposCaixa = [] } = useTiposCaixa(true);
  const save = useSaveConversaoFornecedor();
  const toggle = useToggleConversaoFornecedor();
  
  const [form, setForm] = useState<FormFornecedor>(EMPTY_FORM_FORNECEDOR);
  const [formOpen, setFormOpen] = useState(false);
  const [busca, setBusca] = useState("");
  
  const filtered = useMemo(() => {
    const q = normalizeKey(busca);
    if (!q) return conversoes;
    return conversoes.filter(
      (c) =>
        normalizeKey(c.fornecedor_nome).includes(q) ||
        normalizeKey(c.produto_nome).includes(q) ||
        normalizeKey(c.produto_codigo ?? "").includes(q) ||
        normalizeKey(c.tipo_caixa_sigla).includes(q)
    );
  }, [conversoes, busca]);
  
  const openCreate = () => {
    setForm(EMPTY_FORM_FORNECEDOR);
    setFormOpen(true);
  };
  
  const openEdit = (row: ConversaoFornecedor) => {
    setForm({
      id: row.id,
      fornecedor_id: row.fornecedor_id,
      produto_id: row.produto_id,
      tipo_caixa_id: row.tipo_caixa_id,
      fator: String(row.fator),
    });
    setFormOpen(true);
  };
  
  const handleSave = () => {
    const fator = Number(form.fator);
    if (!form.fornecedor_id || !form.produto_id || !form.tipo_caixa_id || !fator || fator <= 0) {
      toast.error("Preencha todos os campos. Fator deve ser maior que zero.");
      return;
    }
    save.mutate(
      {
        id: form.id,
        fornecedor_id: form.fornecedor_id,
        produto_id: form.produto_id,
        tipo_caixa_id: form.tipo_caixa_id,
        fator,
      },
      {
        onSuccess: () => {
          toast.success(form.id ? "Conversão atualizada" : "Conversão cadastrada");
          setFormOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };
  
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Buscar por fornecedor, produto ou tipo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" size="sm" onClick={openCreate}>
          Nova conversão
        </Button>
      </div>
      
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <ul className="text-sm max-h-[400px] overflow-y-auto divide-y">
          {filtered.map((row) => (
            <li
              key={row.id}
              className={`flex justify-between items-center py-2 gap-2 ${!row.ativo ? "opacity-50" : ""}`}
            >
              <span>
                <span className="font-medium">{row.fornecedor_nome}</span>
                <span className="text-muted-foreground"> → </span>
                <span>{row.produto_nome}</span>
                {row.produto_codigo && (
                  <span className="text-muted-foreground"> ({row.produto_codigo})</span>
                )}
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium">{row.tipo_caixa_sigla}</span>
                <span className="text-muted-foreground"> = </span>
                <span className="font-semibold text-primary">{row.fator} un/cx</span>
                {!row.ativo && <span className="text-muted-foreground"> · inativo</span>}
              </span>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7" onClick={() => openEdit(row)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    toggle.mutate(
                      { id: row.id, ativo: !row.ativo },
                      {
                        onSuccess: () => toast.success(row.ativo ? "Inativado" : "Reativado"),
                        onError: (e) => toast.error(e.message),
                      }
                    )
                  }
                >
                  {row.ativo ? "Inativar" : "Reativar"}
                </Button>
              </div>
            </li>
          ))}
          {!filtered.length && (
            <li className="text-muted-foreground py-2">Nenhuma conversão encontrada</li>
          )}
        </ul>
      )}
      
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar conversão" : "Nova conversão"}</DialogTitle>
            <DialogDescription>
              Fator específico do fornecedor sobrepõe o padrão do produto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Fornecedor</Label>
              <SeletorCadastro
                tipo="fornecedor"
                value={form.fornecedor_id || null}
                onChange={(id) => setForm((s) => ({ ...s, fornecedor_id: id }))}
                disabled={!!form.id}
              />
            </div>
            <div className="grid gap-1">
              <Label>Produto</Label>
              <SeletorCadastro
                tipo="produto"
                value={form.produto_id || null}
                fornecedorId={form.fornecedor_id || null}
                onChange={(id) => setForm((s) => ({ ...s, produto_id: id }))}
                disabled={!!form.id}
              />
            </div>
            <div className="grid gap-1">
              <Label>Tipo de caixa</Label>
              <SeletorCadastro
                tipo="tipo_caixa"
                value={form.tipo_caixa_id || null}
                onChange={(id) => setForm((s) => ({ ...s, tipo_caixa_id: id }))}
                disabled={!!form.id}
              />
            </div>
            <div className="grid gap-1">
              <Label>Fator (unidades por caixa)</Label>
              <Input
                type="number"
                min={1}
                value={form.fator}
                onChange={(e) => setForm((s) => ({ ...s, fator: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportarConversaoTab() {
  const { user } = useAuth();
  const { data: produtos = [] } = useProdutos();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: tiposCaixa = [] } = useTiposCaixa(true);
  const saveImport = useSaveImportacaoConversao();
  
  const [preview, setPreview] = useState<ConversaoImportItem[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportConversaoResult | null>(null);
  
  const produtoByCode = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }>();
    for (const p of produtos as { id: string; nome: string; codigo?: string | null }[]) {
      if (p.codigo) map.set(p.codigo, { id: p.id, nome: p.nome });
    }
    return map;
  }, [produtos]);
  
  const fornecedorByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fornecedores) {
      map.set(normalizeKey(f.nome), f.id);
    }
    return map;
  }, [fornecedores]);
  
  const tipoCaixaBySigla = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tiposCaixa) {
      map.set(normalizeKey(t.sigla), t.id);
      map.set(normalizeKey(t.nome), t.id);
    }
    return map;
  }, [tiposCaixa]);
  
  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setFileName(file.name);
      setResult(null);
      
      const buffer = await file.arrayBuffer();
      const { rows, errors } = parseConversaoExcel(buffer, "Itens Pedido");
      
      if (errors.length && !rows.length) {
        toast.error(errors[0].motivo);
        return;
      }
      
      const items = flattenConversaoRows(rows);
      
      for (const item of items) {
        const prod = produtoByCode.get(item.produtoCodigo);
        if (!prod) {
          item.status = "rejeitado";
          item.motivo = `Produto código ${item.produtoCodigo} não encontrado`;
        }
      }
      
      setPreview(items);
    },
    [produtoByCode]
  );
  
  const handleImport = async () => {
    if (!preview || !user) return;
    
    setImporting(true);
    const result: ImportConversaoResult = {
      linhasLidas: preview.length,
      conversoesCriadas: 0,
      conversoesAtualizadas: 0,
      pendencias: [],
      rejeitadas: [],
    };
    
    const produtoDefaultSet = new Set<string>();
    
    for (const item of preview) {
      if (item.status === "rejeitado") {
        result.rejeitadas.push({
          linha: item.linha,
          motivo: item.motivo ?? "Rejeitado",
          dados: { produto: item.produtoNome, codigo: item.produtoCodigo, fornecedor: item.fornecedorNome },
        });
        continue;
      }
      
      if (item.status === "pendente" || !item.fator || item.fator <= 0) {
        result.pendencias.push({
          linha: item.linha,
          motivo: item.motivo ?? "Fator 0 ou vazio",
          dados: {
            produto: item.produtoNome,
            codigo: item.produtoCodigo,
            fornecedor: item.fornecedorNome,
            tipoCaixa: item.tipoCaixa,
          },
        });
        continue;
      }
      
      const prod = produtoByCode.get(item.produtoCodigo);
      if (!prod) {
        result.rejeitadas.push({
          linha: item.linha,
          motivo: `Produto código ${item.produtoCodigo} não encontrado`,
          dados: { produto: item.produtoNome, codigo: item.produtoCodigo },
        });
        continue;
      }
      
      const tipoCaixaId = tipoCaixaBySigla.get(normalizeKey(item.tipoCaixa));
      if (!tipoCaixaId) {
        result.rejeitadas.push({
          linha: item.linha,
          motivo: `Tipo de caixa "${item.tipoCaixa}" não encontrado`,
          dados: { produto: item.produtoNome, tipoCaixa: item.tipoCaixa },
        });
        continue;
      }
      
      const fornecedorId = item.fornecedorNome
        ? fornecedorByName.get(normalizeKey(item.fornecedorNome))
        : null;
      
      if (item.fornecedorNome && !fornecedorId) {
        result.rejeitadas.push({
          linha: item.linha,
          motivo: `Fornecedor "${item.fornecedorNome}" não encontrado`,
          dados: { produto: item.produtoNome, fornecedor: item.fornecedorNome },
        });
        continue;
      }
      
      try {
        if (fornecedorId) {
          const { data: existing } = await supabase
            .from("conversoes_fornecedor")
            .select("id")
            .eq("fornecedor_id", fornecedorId)
            .eq("produto_id", prod.id)
            .eq("tipo_caixa_id", tipoCaixaId)
            .maybeSingle();
          
          if (existing) {
            await supabase
              .from("conversoes_fornecedor")
              .update({ fator: item.fator, ativo: true })
              .eq("id", existing.id);
            result.conversoesAtualizadas++;
          } else {
            await supabase.from("conversoes_fornecedor").insert({
              fornecedor_id: fornecedorId,
              produto_id: prod.id,
              tipo_caixa_id: tipoCaixaId,
              fator: item.fator,
              ativo: true,
            });
            result.conversoesCriadas++;
          }
        }
        
        const prodKey = `${prod.id}:${tipoCaixaId}`;
        if (!produtoDefaultSet.has(prodKey)) {
          const { data: existingProd } = await supabase
            .from("conversoes_produto_caixa")
            .select("id")
            .eq("produto_id", prod.id)
            .eq("tipo_caixa_id", tipoCaixaId)
            .maybeSingle();
          
          if (!existingProd) {
            await supabase.from("conversoes_produto_caixa").insert({
              produto_id: prod.id,
              tipo_caixa_id: tipoCaixaId,
              fator: item.fator,
              ativo: true,
            });
            result.conversoesCriadas++;
          }
          produtoDefaultSet.add(prodKey);
        }
      } catch (err) {
        result.rejeitadas.push({
          linha: item.linha,
          motivo: err instanceof Error ? err.message : "Erro ao salvar",
          dados: { produto: item.produtoNome },
        });
      }
    }
    
    await saveImport.mutateAsync({
      arquivo: fileName,
      usuario_id: user.id,
      result,
    });
    
    setResult(result);
    setImporting(false);
    
    toast.success(
      `Importação concluída: ${result.conversoesCriadas} criadas, ${result.conversoesAtualizadas} atualizadas, ${result.pendencias.length} pendentes`
    );
  };
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Importe uma planilha no formato do modelo (colunas: Código, Fornecedor, Produto, Tipo de Caixa 1/2, Conversão 1/2).
          O produto é casado pelo código Wise. Fatores 0 ou vazios vão para pendências.
        </p>
        <div className="flex gap-2 items-center">
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="max-w-xs"
          />
          <a
            href="/templates/conversao-import-modelo.xlsx"
            download
            className="text-sm text-primary hover:underline"
          >
            Baixar modelo
          </a>
        </div>
      </div>
      
      {preview && !result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Stat label="Total de itens" value={preview.length} />
            <Stat label="OK para importar" value={preview.filter((i) => i.status === "ok").length} />
            <Stat label="Pendentes (fator 0)" value={preview.filter((i) => i.status === "pendente").length} />
          </div>
          
          <div className="max-h-[300px] border rounded-md">
            <TableWrapper stickyFirstColumn>
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 whitespace-nowrap">Linha</th>
                    <th className="text-left p-2 whitespace-nowrap">Código</th>
                    <th className="text-left p-2 whitespace-nowrap">Produto</th>
                    <th className="text-left p-2 whitespace-nowrap">Fornecedor</th>
                    <th className="text-left p-2 whitespace-nowrap">Tipo</th>
                    <th className="text-left p-2 whitespace-nowrap">Fator</th>
                    <th className="text-left p-2 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((item, i) => (
                    <tr
                      key={i}
                      className={
                        item.status === "pendente"
                          ? "bg-warning/10"
                          : item.status === "rejeitado"
                            ? "bg-destructive/10"
                            : ""
                      }
                    >
                      <td className="p-2">{item.linha}</td>
                      <td className="p-2 whitespace-nowrap">{item.produtoCodigo}</td>
                      <td className="p-2 whitespace-nowrap">{item.produtoNome}</td>
                      <td className="p-2 whitespace-nowrap">{item.fornecedorNome || "—"}</td>
                      <td className="p-2">{item.tipoCaixa}</td>
                      <td className="p-2">{item.fator ?? "—"}</td>
                      <td className="p-2">
                        {item.status === "ok" && <span className="text-green-600">OK</span>}
                        {item.status === "pendente" && (
                          <span className="text-warning">{item.motivo}</span>
                        )}
                        {item.status === "rejeitado" && (
                          <span className="text-destructive">{item.motivo}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importando…" : "Confirmar importação"}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      
      {result && (
        <div className="space-y-3">
          <div className="rounded-md bg-secondary/60 p-4">
            <h4 className="font-medium mb-2">Resultado da importação</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="Linhas lidas" value={result.linhasLidas} />
              <Stat label="Criadas" value={result.conversoesCriadas} />
              <Stat label="Atualizadas" value={result.conversoesAtualizadas} />
              <Stat label="Pendentes" value={result.pendencias.length} />
            </div>
          </div>
          
          {result.pendencias.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Pendências ({result.pendencias.length})</h4>
              <ul className="text-sm max-h-[200px] overflow-auto space-y-1">
                {result.pendencias.map((p, i) => (
                  <li key={i} className="text-muted-foreground">
                    Linha {p.linha}: {p.motivo} — {p.dados.produto as string}
                    {p.dados.fornecedor ? ` (${p.dados.fornecedor})` : ""}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPendencias(result.pendencias)}
              >
                Baixar pendências (.xlsx)
              </Button>
            </div>
          )}
          
          <Button
            variant="outline"
            onClick={() => {
              setPreview(null);
              setResult(null);
            }}
          >
            Nova importação
          </Button>
        </div>
      )}
    </div>
  );
}

function HistoricoTab() {
  const { data: historico = [], isLoading } = useRecentConversaoHistorico();
  
  const formatAcao = (acao: string) => {
    switch (acao) {
      case "INSERT":
        return "Criado";
      case "UPDATE":
        return "Alterado";
      case "DELETE":
        return "Removido";
      default:
        return acao;
    }
  };
  
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Últimas 50 alterações em conversões de caixa.
      </p>
      
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <ul className="text-sm max-h-[400px] overflow-y-auto divide-y">
          {historico.map((h) => (
            <li key={h.id} className="py-2">
              <div className="flex justify-between items-start gap-2">
                <span>
                  <span className="font-medium">{formatAcao(h.acao)}</span>
                  {h.descricao && <span className="text-muted-foreground"> · {h.descricao}</span>}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(h.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {h.fator_anterior != null && h.fator_novo != null && h.fator_anterior !== h.fator_novo && (
                  <span>Fator: {h.fator_anterior} → {h.fator_novo}</span>
                )}
                {h.fator_novo != null && h.fator_anterior == null && (
                  <span>Fator: {h.fator_novo}</span>
                )}
                {h.ativo_anterior != null && h.ativo_novo != null && h.ativo_anterior !== h.ativo_novo && (
                  <span> · {h.ativo_novo ? "Reativado" : "Inativado"}</span>
                )}
                {h.alterado_por_nome && <span> · por {h.alterado_por_nome}</span>}
              </div>
            </li>
          ))}
          {!historico.length && (
            <li className="text-muted-foreground py-2">Nenhum histórico encontrado</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
