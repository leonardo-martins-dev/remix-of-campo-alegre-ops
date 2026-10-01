/**
 * NOP-467 — folha da parede: produto → cores → fornecedor.
 * Janela de impressão (mesmo padrão de etiquetas em ordem-separacao).
 */
import type { SecaoFolhaProduto } from "./consulta-cor-carga";
import { formatDateBRT, formatTimeBRT } from "./utils-date";

export function imprimirFolhaCoresParede(
  secoes: SecaoFolhaProduto[],
  opts?: { geradoEm?: Date },
): { ok: true } | { ok: false; erro: string } {
  if (typeof window === "undefined") {
    return { ok: false, erro: "Impressão só no navegador" };
  }
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    return { ok: false, erro: "Libere pop-ups para imprimir a folha" };
  }

  const agora = opts?.geradoEm ?? new Date();
  const data = formatDateBRT(agora.toISOString());
  const hora = formatTimeBRT(agora.toISOString());

  const blocos = secoes
    .map((s) => {
      const alerta = s.alertaIrmao
        ? `<div class="alerta">⚠ NÃO CONFUNDIR com: ${escapeHtml(s.irmaosNomes.join(" · "))}</div>`
        : "";
      const linhas = s.cores
        .map(
          (c) => `
        <div class="linha">
          <span class="swatch" style="background:${escapeHtml(c.hex)};color:${escapeHtml(c.onHex)};border:2px solid #111">${escapeHtml(c.corNome)}</span>
          <span class="forn">${escapeHtml(c.fornecedorNome)}</span>
        </div>`,
        )
        .join("");
      return `
      <section class="produto ${s.alertaIrmao ? "produto-alerta" : ""}">
        <h2>${escapeHtml(s.produtoNome)}</h2>
        ${alerta}
        ${linhas || "<p class='vazio'>Sem cores atribuídas</p>"}
      </section>`;
    })
    .join("");

  win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Cores da carga · Campo Alegre</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 16px 20px 48px;
      color: #111;
    }
    header {
      border-bottom: 3px solid #111;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    header h1 {
      font-size: 28px;
      font-weight: 800;
      margin: 0 0 4px;
      letter-spacing: 0.02em;
    }
    header p {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    .aviso {
      margin-top: 6px;
      font-size: 13px;
      color: #444;
    }
    .produto {
      border: 2px solid #111;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .produto-alerta {
      border-width: 3px;
      border-color: #b45309;
      background: #fffbeb;
    }
    .produto h2 {
      font-size: 26px;
      font-weight: 800;
      margin: 0 0 8px;
      line-height: 1.15;
      text-transform: uppercase;
    }
    .alerta {
      font-size: 15px;
      font-weight: 700;
      color: #92400e;
      background: #fde68a;
      border: 1px solid #b45309;
      border-radius: 6px;
      padding: 6px 10px;
      margin-bottom: 10px;
    }
    .linha {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 8px 0;
    }
    .swatch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 110px;
      height: 44px;
      padding: 0 12px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .forn {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
    }
    .vazio { font-size: 16px; color: #666; }
    footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px 20px;
      border-top: 2px solid #111;
      background: #fff;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding-bottom: 36px; }
      footer { position: fixed; }
      .produto { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Cores da carga · Packing House</h1>
    <p>De quem é esta <strong>carga</strong>? (produto + cor → fornecedor)</p>
    <p class="aviso">A cor identifica a viagem, não a caixa vazia. Caixa vazia não tem dono por cor.</p>
  </header>
  ${blocos || "<p>Nenhum vínculo produto+cor cadastrado.</p>"}
  <footer>
    <span>Campo Alegre · folha de parede</span>
    <span>Gerado em ${escapeHtml(data)} às ${escapeHtml(hora)}</span>
  </footer>
</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
