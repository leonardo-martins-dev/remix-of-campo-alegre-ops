import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src_lines = (root / "migrations/00001_modelo_completo.sql").read_text(encoding="utf-8").splitlines()
out: list[str] = []
out.append("-- REPARO IDEMPOTENTE: schema Campo Alegre (tabelas faltando, enums ja existem)")
out.append("-- Se user_role veio de outro projeto (super_admin, hr, etc.), rode 00001c antes.")
out.append("-- Rode ESTE arquivo antes de 00003-00008")
out.append("")

enums = [
    ("user_role", "('admin', 'user')"),
    ("status_pedido", "('pendente', 'conferido', 'divergencia')"),
    ("origem_pedido", "('wisetec', 'manual', 'excel')"),
    ("status_conferencia", "('em_andamento', 'parcial', 'finalizada')"),
    ("status_carga", "('aguardando', 'carregando', 'concluida', 'cancelada')"),
    ("status_romaneio", "('pendente', 'ok', 'corrigido')"),
    ("tipo_caixa_enum", "('G', 'I', 'P')"),
    ("tipo_divergencia", "('falta', 'sobra', 'qualidade')"),
    ("tipo_movimentacao", "('envio', 'retorno', 'perda', 'ajuste')"),
    ("unidade_medida", "('mc', 'kg', 'un', 'cx', 'pct')"),
    ("status_cobranca", "('pendente', 'cobrado', 'pago', 'cancelado')"),
]
for name, vals in enums:
    out.append(
        f"DO $$ BEGIN CREATE TYPE public.{name} AS ENUM {vals}; "
        f"EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    )
out.append("")
out.append("-- Garante valores faltantes em enums ja existentes (ex: user_role sem 'user')")
for name, vals in enums:
    for label in re.findall(r"'([^']+)'", vals):
        out.append(
            f"DO $$\n"
            f"BEGIN\n"
            f"  IF EXISTS (\n"
            f"    SELECT 1 FROM pg_type t\n"
            f"    WHERE t.typname = '{name}' AND t.typnamespace = 'public'::regnamespace\n"
            f"  ) AND NOT EXISTS (\n"
            f"    SELECT 1 FROM pg_enum e\n"
            f"    JOIN pg_type t ON e.enumtypid = t.oid\n"
            f"    WHERE t.typname = '{name}' AND t.typnamespace = 'public'::regnamespace\n"
            f"      AND e.enumlabel = '{label}'\n"
            f"  ) THEN\n"
            f"    ALTER TYPE public.{name} ADD VALUE '{label}';\n"
            f"  END IF;\n"
            f"END $$;"
        )
out.append("")

started = False
skip_section = False
for line in src_lines:
    if line.strip().startswith("-- 1. ENUMS"):
        skip_section = True
        continue
    if line.strip().startswith("-- 2. CONTROLE DE ACESSO"):
        skip_section = False
        started = True
    if not started or skip_section:
        continue
    if line.startswith("CREATE TYPE "):
        continue
    if line.startswith("-- 14. SEED: ADMIN USER"):
        break
    if line.startswith("-- 13. SEED"):
        break

    l = line
    l = re.sub(r"^CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", l)
    l = re.sub(
        r"^CREATE (UNIQUE )?INDEX ",
        lambda m: f"CREATE {m.group(1) or ''}INDEX IF NOT EXISTS ",
        l,
    )
    if l.startswith("CREATE TRIGGER "):
        m = re.search(r"CREATE TRIGGER (\S+).* ON ((?:public|auth)\.\S+)", l)
        if m:
            out.append(f"DROP TRIGGER IF EXISTS {m.group(1)} ON {m.group(2)};")
    if l.startswith("CREATE POLICY "):
        m = re.search(r"CREATE POLICY (\S+) ON (public\.\S+)", l)
        if m:
            out.append(f"DROP POLICY IF EXISTS {m.group(1)} ON {m.group(2)};")
    out.append(l)

text = "\n".join(out)

# Make operational-table policies idempotent
policy_ops = [
    ("_select_auth", "FOR SELECT TO authenticated USING (TRUE)"),
    ("_insert_auth", "FOR INSERT TO authenticated WITH CHECK (TRUE)"),
    ("_update_auth", "FOR UPDATE TO authenticated USING (TRUE)"),
    (
        "_delete_admin",
        "FOR DELETE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin'')",
    ),
]
for suffix, clause in policy_ops:
    old = (
        f"    EXECUTE format(\n"
        f"      'CREATE POLICY %I ON public.%I {clause}',\n"
        f"      tbl || '{suffix}', tbl\n"
        f"    );"
    )
    new = (
        f"    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '{suffix}', tbl);\n"
        f"    EXECUTE format(\n"
        f"      'CREATE POLICY %I ON public.%I {clause}',\n"
        f"      tbl || '{suffix}', tbl\n"
        f"    );"
    )
    text = text.replace(old, new)

text += """

-- Seeds (idempotentes)
INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('dashboard', 'Dashboard', 'Navegacao', 'LayoutDashboard', 1),
  ('recebimento', 'Conferencia', 'Recebimento', 'ClipboardCheck', 2),
  ('recebimento/conferir', 'Conferir Chegada', 'Recebimento', 'PackageCheck', 3),
  ('recebimento/faltas', 'Relatorio de Faltas', 'Recebimento', 'AlertTriangle', 4),
  ('expedicao', 'Painel de Carga', 'Expedicao', 'Truck', 5),
  ('expedicao/tv', 'Modo TV', 'Expedicao', 'Monitor', 6),
  ('caixas/saldo', 'Saldo por Cliente', 'Caixas', 'Package', 7),
  ('caixas/economia', 'Custo & Perda', 'Caixas', 'TrendingDown', 8),
  ('caixas/retorno', 'Registro de Retorno', 'Caixas', 'RotateCcw', 9),
  ('indicadores', 'Tempos & Ciclo', 'Indicadores', 'Clock', 10),
  ('gestao', 'Configuracoes', 'Gestao', 'Settings', 11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.tipos_caixa (id, nome, custo_unitario) VALUES
  ('G', 'Grande', 38.00), ('I', 'Isopor', 22.00), ('P', 'Plastica', 18.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.familias_produto (nome, ordem) VALUES
  ('Folhas', 1), ('Frutos', 2), ('Raizes', 3), ('Refrigerados', 4)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.destinatarios (nome) VALUES
  ('Campo Alegre'), ('Anderson'), ('Parceiro Sul')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('impacto_falta_por_unidade', '4.50', 'Valor em R$ usado para calcular impacto financeiro de faltas'),
  ('benchmark_taxa_perda', '2.0', 'Taxa de perda benchmark (%) para calculo de economia potencial'),
  ('aging_alerta_dias', '6', 'Dias de aging para disparar alerta amarelo'),
  ('aging_critico_dias', '10', 'Dias de aging para disparar alerta vermelho'),
  ('auto_rotate_tv_segundos', '20', 'Intervalo de rotacao automatica no modo TV')
ON CONFLICT (chave) DO NOTHING;

-- Profile do admin (auth.users ja deve existir; nao recria usuario)
INSERT INTO public.profiles (id, nome, email, role)
SELECT u.id, 'Administrador', u.email, 'admin'::public.user_role
FROM auth.users u WHERE lower(u.email) = 'admin@noponto.io'
ON CONFLICT (id) DO UPDATE SET role = 'admin'::public.user_role, updated_at = now();

-- Verificacao
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'profiles'
) AS profiles_criada;
"""

out_path = root / "migrations/00001b_repair_schema.sql"
out_path.write_text(text, encoding="utf-8", newline="\n")
print(f"Wrote {out_path} ({len(text.splitlines())} lines)")
