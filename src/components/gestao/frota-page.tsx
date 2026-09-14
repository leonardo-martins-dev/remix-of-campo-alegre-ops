import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/page-header";
import { useMotoristas, useCaminhoes, useCadastroMutations } from "@/hooks/use-cadastros";
import { normalizeKey } from "@/lib/normalize";

type MotoristaRow = { id: string; nome: string; ativo: boolean };
type CaminhaoRow = { id: string; placa?: string; modelo?: string; nome: string; ativo: boolean };

export function FrotaPage() {
  const [tab, setTab] = useState("motoristas");

  return (
    <div>
      <PageHeader title="Motoristas e caminhões" subtitle="Frota de entrega do galpão" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="motoristas">Motoristas</TabsTrigger>
          <TabsTrigger value="caminhoes">Caminhões</TabsTrigger>
        </TabsList>
        <TabsContent value="motoristas">
          <MotoristasTab />
        </TabsContent>
        <TabsContent value="caminhoes">
          <CaminhoesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MotoristasTab() {
  const { data: motoristas = [], isLoading } = useMotoristas();
  const { insert, update } = useCadastroMutations("motoristas", ["cadastros", "motoristas"]);

  const [busca, setBusca] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");

  const rows = useMemo(() => {
    const q = normalizeKey(busca);
    let list = motoristas as MotoristaRow[];
    if (q) list = list.filter((m) => normalizeKey(m.nome).includes(q));
    const ativos = list.filter((m) => m.ativo !== false);
    const inativos = list.filter((m) => m.ativo === false);
    return showInativos ? [...ativos, ...inativos] : ativos;
  }, [motoristas, busca, showInativos]);

  const openCreate = () => {
    setEditId(null);
    setNome("");
    setSheetOpen(true);
  };
  const openEdit = (m: MotoristaRow) => {
    setEditId(m.id);
    setNome(m.nome);
    setSheetOpen(true);
  };

  const save = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do motorista");
      return;
    }
    if (editId) {
      update.mutate(
        { id: editId, nome: nome.trim() },
        {
          onSuccess: () => { toast.success("Motorista atualizado"); setSheetOpen(false); },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      insert.mutate(
        { nome: nome.trim(), ativo: true },
        {
          onSuccess: () => { toast.success("Motorista cadastrado"); setSheetOpen(false); },
          onError: (e) => toast.error(e.message),
        }
      );
    }
  };

  const inativoCount = (motoristas as MotoristaRow[]).filter((m) => m.ativo === false).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          placeholder="Buscar motorista…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={openCreate} size="sm">Novo</Button>
        {inativoCount > 0 && (
          <label className="text-sm flex items-center gap-1.5 ml-auto">
            <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
            Mostrar inativos ({inativoCount})
          </label>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ul className="text-sm space-y-0.5">
          {rows.map((m) => (
            <li
              key={m.id}
              className={`flex justify-between items-center py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer border-b border-border ${m.ativo === false ? "opacity-50" : ""}`}
              onClick={() => openEdit(m)}
            >
              <span>
                {m.nome}
                {m.ativo === false && <span className="text-muted-foreground"> · inativo</span>}
              </span>
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost" size="sm" className="h-7"
                  onClick={() => update.mutate(
                    { id: m.id, ativo: m.ativo === false },
                    { onSuccess: () => toast.success(m.ativo === false ? "Reativado" : "Inativado"), onError: (e) => toast.error(e.message) }
                  )}
                >
                  {m.ativo === false ? "Reativar" : "Inativar"}
                </Button>
              </div>
            </li>
          ))}
          {!rows.length && <li className="text-muted-foreground py-4 text-center">Nenhum motorista encontrado</li>}
        </ul>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{editId ? "Editar motorista" : "Novo motorista"}</SheetTitle></SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do motorista" />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={insert.isPending || update.isPending}>
              {insert.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function CaminhoesTab() {
  const { data: caminhoes = [], isLoading } = useCaminhoes();
  const { insert, update } = useCadastroMutations("caminhoes", ["cadastros", "caminhoes"]);

  const [busca, setBusca] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");

  const rows = useMemo(() => {
    const q = normalizeKey(busca);
    let list = caminhoes as CaminhaoRow[];
    if (q) list = list.filter((c) => normalizeKey(c.placa ?? c.nome).includes(q) || normalizeKey(c.modelo ?? "").includes(q));
    const ativos = list.filter((c) => c.ativo !== false);
    const inativos = list.filter((c) => c.ativo === false);
    return showInativos ? [...ativos, ...inativos] : ativos;
  }, [caminhoes, busca, showInativos]);

  const openCreate = () => {
    setEditId(null);
    setPlaca("");
    setModelo("");
    setSheetOpen(true);
  };
  const openEdit = (c: CaminhaoRow) => {
    setEditId(c.id);
    setPlaca(c.placa ?? c.nome);
    setModelo(c.modelo ?? "");
    setSheetOpen(true);
  };

  const save = () => {
    if (!placa.trim()) {
      toast.error("Informe a placa do caminhão");
      return;
    }
    const payload: Record<string, unknown> = { placa: placa.trim().toUpperCase() };
    if (modelo.trim()) payload.modelo = modelo.trim();
    if (editId) {
      update.mutate(
        { id: editId, ...payload },
        {
          onSuccess: () => { toast.success("Caminhão atualizado"); setSheetOpen(false); },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      insert.mutate(
        { ...payload, ativo: true },
        {
          onSuccess: () => { toast.success("Caminhão cadastrado"); setSheetOpen(false); },
          onError: (e) => toast.error(e.message),
        }
      );
    }
  };

  const inativoCount = (caminhoes as CaminhaoRow[]).filter((c) => c.ativo === false).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          placeholder="Buscar placa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={openCreate} size="sm">Novo</Button>
        {inativoCount > 0 && (
          <label className="text-sm flex items-center gap-1.5 ml-auto">
            <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
            Mostrar inativos ({inativoCount})
          </label>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ul className="text-sm space-y-0.5">
          {rows.map((c) => (
            <li
              key={c.id}
              className={`flex justify-between items-center py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer border-b border-border ${c.ativo === false ? "opacity-50" : ""}`}
              onClick={() => openEdit(c)}
            >
              <span>
                <span className="font-mono font-semibold">{c.placa ?? c.nome}</span>
                {c.modelo && <span className="text-muted-foreground"> · {c.modelo}</span>}
                {c.ativo === false && <span className="text-muted-foreground"> · inativo</span>}
              </span>
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost" size="sm" className="h-7"
                  onClick={() => update.mutate(
                    { id: c.id, ativo: c.ativo === false },
                    { onSuccess: () => toast.success(c.ativo === false ? "Reativado" : "Inativado"), onError: (e) => toast.error(e.message) }
                  )}
                >
                  {c.ativo === false ? "Reativar" : "Inativar"}
                </Button>
              </div>
            </li>
          ))}
          {!rows.length && <li className="text-muted-foreground py-4 text-center">Nenhum caminhão encontrado</li>}
        </ul>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{editId ? "Editar caminhão" : "Novo caminhão"}</SheetTitle></SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Placa</Label>
              <Input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC-1234" />
            </div>
            <div className="space-y-1">
              <Label>Modelo (opcional)</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Modelo do caminhão" />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={insert.isPending || update.isPending}>
              {insert.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
