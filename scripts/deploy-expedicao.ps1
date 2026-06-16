# Deploy checklist: Expedição pós-conferência (v2)
# Rode na raiz do repositório.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== 1. Migrations Supabase (00009-00014) ===" -ForegroundColor Cyan
Write-Host "Aplique no SQL Editor do projeto (ordem):"
@(
  "00009_admin_pedido_policies.sql",
  "00010_divergencia_liberacao.sql",
  "00011_conferencia_aguardando_liberacao.sql",
  "00012_expedicao_bridge.sql",
  "00013_views_motoristas_faltas.sql",
  "00014_seed_destinatario_cliente_map.sql"
) | ForEach-Object { Write-Host "  supabase/migrations/$_" }

Write-Host "`n=== 2. Verificação ===" -ForegroundColor Cyan
Write-Host "  Rode supabase/scripts/verificar_banco.sql e aplicar_expedicao_v2.sql"

Write-Host "`n=== 3. Build frontend ===" -ForegroundColor Cyan
Set-Location $root
npm run build

Write-Host "`n=== 4. Deploy Cloudflare (Wrangler) ===" -ForegroundColor Cyan
Write-Host "  npx wrangler deploy"

Write-Host "`n=== 5. Edge Function sync-wise-cargas ===" -ForegroundColor Cyan
Write-Host "  supabase functions deploy sync-wise-cargas"

Write-Host "`nConcluído localmente. Execute deploy remoto conforme ambiente." -ForegroundColor Green
