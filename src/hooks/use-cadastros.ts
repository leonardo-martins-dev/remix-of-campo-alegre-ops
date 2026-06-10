import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const CADASTRO_KEYS = {
  fornecedores: ["cadastros", "fornecedores"],
  clientes: ["cadastros", "clientes"],
  produtos: ["cadastros", "produtos"],
  motoristas: ["cadastros", "motoristas"],
  caminhoes: ["cadastros", "caminhoes"],
  rotas: ["cadastros", "rotas"],
  destinatarios: ["cadastros", "destinatarios"],
  familias: ["cadastros", "familias"],
  configuracoes: ["configuracoes"],
} as const;

function useCadastro<T>(table: string, key: readonly string[], select = "*") {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(select).order("nome");
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useFornecedores() {
  return useCadastro<{ id: string; nome: string; ativo: boolean }>("fornecedores", CADASTRO_KEYS.fornecedores);
}

export function useClientes() {
  return useCadastro<{ id: string; nome: string; ativo: boolean }>("clientes", CADASTRO_KEYS.clientes);
}

export function useProdutos() {
  return useQuery({
    queryKey: CADASTRO_KEYS.produtos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, unidade, familia_id, ativo, familias_produto(nome)")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMotoristas() {
  return useCadastro<{ id: string; nome: string; ativo: boolean }>("motoristas", CADASTRO_KEYS.motoristas);
}

export function useCaminhoes() {
  return useQuery({
    queryKey: CADASTRO_KEYS.caminhoes,
    queryFn: async () => {
      const { data, error } = await supabase.from("caminhoes").select("id, placa, modelo, ativo").order("placa");
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, nome: c.placa }));
    },
  });
}

export function useRotas() {
  return useCadastro<{ id: string; nome: string; ativo: boolean }>("rotas", CADASTRO_KEYS.rotas);
}

export function useDestinatarios() {
  return useCadastro<{ id: string; nome: string; ativo: boolean }>("destinatarios", CADASTRO_KEYS.destinatarios);
}

export function useFamilias() {
  return useQuery({
    queryKey: CADASTRO_KEYS.familias,
    queryFn: async () => {
      const { data, error } = await supabase.from("familias_produto").select("*").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConfiguracoes() {
  return useQuery({
    queryKey: CADASTRO_KEYS.configuracoes,
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracoes").select("*").order("chave");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCadastroMutations(table: string, queryKey: readonly string[]) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey });

  const insert = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const nome = typeof row.nome === "string" ? row.nome.trim() : "";
      const placa = typeof row.placa === "string" ? row.placa.trim() : "";
      if (table === "caminhoes") {
        if (!placa) throw new Error("Informe a placa do caminhão");
      } else if ("nome" in row && !nome) {
        throw new Error("Informe um nome");
      }
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...row }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase.from(table).update(row).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { insert, update, remove };
}

export function useUpdateConfiguracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chave, valor }: { chave: string; valor: unknown }) => {
      const { error } = await supabase
        .from("configuracoes")
        .update({ valor, updated_at: new Date().toISOString() })
        .eq("chave", chave);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CADASTRO_KEYS.configuracoes }),
  });
}

export function useDestinatarioClienteMap() {
  return useQuery({
    queryKey: ["destinatario-cliente-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinatario_cliente_map")
        .select("id, destinatario_id, cliente_id, destinatarios(nome), clientes(nome)");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveDestinatarioClienteMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { destinatario_id: string; cliente_id: string }) => {
      const { error } = await supabase.from("destinatario_cliente_map").upsert(payload, {
        onConflict: "destinatario_id,cliente_id",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["destinatario-cliente-map"] }),
  });
}

export const cadastroKeys = CADASTRO_KEYS;
