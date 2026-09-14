import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/page-header";
import { useMotoristas, useCaminhoes } from "@/hooks/use-cadastros";
import {
  useRotasComDetalhes,
  useSaveRota,
  useClientesPorRota,
  useAlocarClienteRota,
  SEM_ROTA_ID,
} from "@/hooks/use-expedicao-rotas";

const DIAS_SEMANA = [
  { value: "seg", label: "Seg" },
  { value: "ter", label: "Ter" },
  { value: "qua", label: "Qua" },
  { value: "qui", label: "Qui" },
  { value: "sex", label: "Sex" },
  { value: "sab", label: "Sáb" },
  { value: "dom", label: "Dom" },
];

type RotaRow = {
  id: string;
  nome: string;
  ativo: boolean;
  dias_semana: string[] | null;
  motorista_padrao_id: string | null;
  caminhao_padrao_id: string | null;
  motoristas: { nome: string } | null;
  caminhoes: { placa: string } | null;
};

export function RotasPage() {
  const { data: rotas = [], isLoading } = useRotasComDetalhes();
  const { data: clientesPorRota = [] } = useClientesPorRota();
  const { data: motoristas = [] } = useMotoristas();
  const { data: caminhoes = [] } = useCaminhoes();
  const saveRota = useSaveRota();
  const alocarCliente = useAlocarClienteRota();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [dias, setDias] = useState<string[]>([]);
  const [motoristaId, setMotoristaId] = useState("");
  const [caminhaoId, setCaminhaoId] = useState("");
  const [showInativos, setShowInativos] = useState(false);

  const rotasList = rotas.map((r) => ({
    ...r,
    motoristas: Array.isArray(r.motoristas) ? r.motoristas[0] : r.motoristas,
    caminhoes: Array.isArray(r.caminhoes) ? r.caminhoes[0] : r.caminhoes,
  })) as RotaRow[];

  const ativos = rotasList.filter((r) => r.ativo);
  const inativos = rotasList.filter((r) => !r.ativo);
  const rows = showInativos ? [...ativos, ...inativos] : ativos;

  const clientesSemRota = clientesPorRota.filter((c) => c.rota_id === SEM_ROTA_ID);

  const openCreate = () => {
    setEditId(null);
    setNome("");
    setDias([]);
    setMotoristaId("");
    setCaminhaoId("");
    setSheetOpen(true);
  };

  const openEdit = (r: RotaRow) => {
    setEditId(r.id);
    setNome(r.nome);
    setDias(r.dias_semana ?? []);
    setMotoristaId(r.motorista_padrao_id ?? "");
    setCaminhaoId(r.caminhao_padrao_id ?? "");
    setSheetOpen(true);
  };

  const save = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome da rota");
      return;
    }
    saveRota.mutate(
      {
        ...(editId ? { id: editId } : {}),
        nome: nome.trim(),
        dias_semana: dias,
        motorista_padrao_id: motoristaId || null,
        caminhao_padrao_id: caminhaoId || null,
        ...(editId ? {} : { ativo: true }),
      },
      {
        onSuccess: () => {
          toast.success(editId ? "Rota atualizada" : "Rota criada");
          setSheetOpen(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div>
      <PageHeader
        title="Rotas"
        subtitle="Rotas de expedição, dias de entrega e frota padrão"
        actions={<Button onClick={openCreate}>Nova</Button>}
      />

      {inativos.length > 0 && (
        <div className="mb-4">
          <label className="text-sm flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showInativos}
              onChange={(e) => setShowInativos(e.target.checked)}
            />
            Mostrar inativas ({inativos.length})
          </label>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ul className="space-y-2 text-sm mb-6">
          {rows.map((r) => {
            const clientesRota = clientesPorRota.filter((c) => c.rota_id === r.id);
            return (
              <li
                key={r.id}
                className={`border rounded-lg p-3 hover:bg-muted/30 cursor-pointer ${r.ativo ? "" : "opacity-50"}`}
                onClick={() => openEdit(r)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="font-semibold text-navy">{r.nome}</span>
                    {r.dias_semana?.length ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.dias_semana.map((d) => DIAS_SEMANA.find((x) => x.value === d)?.label).join(", ")}
                      </span>
                    ) : null}
                    {r.motoristas?.nome && (
                      <span className="ml-2 text-xs text-muted-foreground">· {r.motoristas.nome}</span>
                    )}
                    {r.caminhoes?.placa && (
                      <span className="ml-2 text-xs text-muted-foreground">· {r.caminhoes.placa}</span>
                    )}
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() =>
                        saveRota.mutate(
                          { id: r.id, nome: r.nome, ativo: !r.ativo },
                          {
                            onSuccess: () =>
                              toast.success(r.ativo ? "Rota inativada" : "Rota reativada"),
                          }
                        )
                      }
                    >
                      {r.ativo ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                </div>
                {clientesRota.length > 0 && (
                  <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    {clientesRota.map((c) => (
                      <span
                        key={c.cliente_id}
                        className="chip chip-muted text-xs flex items-center gap-1"
                      >
                        {c.cliente_nome}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            alocarCliente.mutate(
                              { clienteId: c.cliente_id, rotaId: null },
                              { onSuccess: () => toast.success("Cliente removido da rota") }
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          {!rows.length && (
            <li className="text-muted-foreground py-4 text-center">Nenhuma rota cadastrada</li>
          )}
        </ul>
      )}

      {clientesSemRota.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supermercados sem rota ({clientesSemRota.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {clientesSemRota.map((c) => (
              <div
                key={c.cliente_id}
                className="flex items-center justify-between gap-2 border-b border-border py-2"
              >
                <span className="font-medium text-sm">{c.cliente_nome}</span>
                <select
                  className="h-8 rounded-md border border-border px-2 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    alocarCliente.mutate(
                      { clienteId: c.cliente_id, rotaId: e.target.value },
                      { onSuccess: () => toast.success("Supermercado alocado à rota") }
                    );
                  }}
                >
                  <option value="">Selecionar rota…</option>
                  {rotasList
                    .filter((r) => r.ativo)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Editar rota" : "Nova rota"}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da rota" />
            </div>
            <div className="space-y-1">
              <Label>Dias de entrega</Label>
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map((d) => (
                  <label key={d.value} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={dias.includes(d.value)}
                      onChange={(e) =>
                        setDias(
                          e.target.checked
                            ? [...dias, d.value]
                            : dias.filter((x) => x !== d.value)
                        )
                      }
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Motorista padrão</Label>
              <select
                className="h-9 w-full rounded-md border border-border px-2 text-sm bg-background"
                value={motoristaId}
                onChange={(e) => setMotoristaId(e.target.value)}
              >
                <option value="">Nenhum</option>
                {motoristas.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Caminhão padrão</Label>
              <select
                className="h-9 w-full rounded-md border border-border px-2 text-sm bg-background"
                value={caminhaoId}
                onChange={(e) => setCaminhaoId(e.target.value)}
              >
                <option value="">Nenhum</option>
                {caminhoes.map((c) => (
                  <option key={c.id} value={c.id}>{c.placa ?? c.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saveRota.isPending}>
              {saveRota.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
