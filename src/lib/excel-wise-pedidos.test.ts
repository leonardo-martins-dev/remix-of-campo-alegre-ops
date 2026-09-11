import { readFileSync, existsSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseWisePedido } from "./excel-wise-pedidos";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

const htmlXls = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><body><table>
<tr>
<td><a href="?order=CODIGO_PRODUTO">Código</a></td>
<td><a href="?order=DATA_COMPRA">Data Compra</a></td>
<td><a href="?order=NR_PED">Nº Ped</a></td>
<td><a href="?order=FORNECEDOR">Fornecedor</a></td>
<td><a href="?order=PRODUTO">Produto</a></td>
<td><a href="?order=NOME_MARCA">Marca</a></td>
<td><a href="?order=QTDE">Qtde</a></td>
<td><a href="?order=VALOR">Valor</a></td>
</tr>
<tr>
<td>5</td><td>11/09/2026</td><td>30296</td>
<td>DIRCEU APARECIDO DO NASCIMENTO E OUTRA</td>
<td>ALFACE AMERICANA</td><td></td>
<td>6.000</td><td>6.000,00</td>
</tr>
<tr>
<td>20</td><td>11/09/2026</td><td>30270</td>
<td>N. AMADEO FERRARA PRODUTORA E COMERCIAL AGRICOLA LTDA</td>
<td>BROCOLIS NINJA 300g</td><td></td>
<td>2.300</td><td>4.600,00</td>
</tr>
<tr>
<td>92</td><td>11/09/2026</td><td>30296</td>
<td>DIRCEU APARECIDO DO NASCIMENTO E OUTRA</td>
<td>REPOLHO VERDE</td><td></td>
<td>3.000</td><td>4.590,00</td>
</tr>
<tr>
<td></td><td></td><td></td><td></td>
<td colspan="3"><label>68.846</label></td>
<td><label>77.224,26</label></td>
</tr>
</table></body></html>`;

const htmlParsed = parseWisePedido(toArrayBuffer(new TextEncoder().encode(htmlXls)));
assert(htmlParsed.ok, htmlParsed.ok ? "" : htmlParsed.error);
assert(htmlParsed.rows.length === 3, `html rows ${htmlParsed.rows.length}`);
assert(htmlParsed.ignoradas.length === 0, `ignoradas ${JSON.stringify(htmlParsed.ignoradas)}`);

const alface = htmlParsed.rows.find((r) => r.produto === "ALFACE AMERICANA");
assert(alface, "faltou ALFACE AMERICANA");
assert(alface.pedido === "30296", `pedido ${alface.pedido}`);
assert(alface.codigo_produto === "5", `codigo ${alface.codigo_produto}`);
assert(alface.quantidade === 6000, `qtde ${alface.quantidade}`);
assert(alface.preco_unitario === 1, `unit ${alface.preco_unitario}`);
assert(alface.unidade === "un", `unidade ${alface.unidade}`);
assert(alface.data_prevista === "2026-09-11", `data ${alface.data_prevista}`);

const brocolis = htmlParsed.rows.find((r) => r.codigo_produto === "20");
assert(brocolis?.pedido === "30270", `brocolis pedido ${brocolis?.pedido}`);
assert(brocolis?.quantidade === 2300, `brocolis qtde ${brocolis?.quantidade}`);
assert(brocolis?.preco_unitario === 2, `brocolis unit ${brocolis?.preco_unitario}`);

const repolho = htmlParsed.rows.find((r) => r.produto === "REPOLHO VERDE");
assert(repolho?.pedido === "30296", `repolho pedido ${repolho?.pedido}`);
assert(repolho?.preco_unitario === 1.53, `repolho unit ${repolho?.preco_unitario}`);

const modeloWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  modeloWb,
  XLSX.utils.json_to_sheet([
    {
      pedido: "W-2026-1001",
      fornecedor: "HORTIFRUTI VALE VERDE",
      codigo_produto: "880",
      produto: "COUVE MANTEIGA",
      quantidade: "80",
      preco_unitario: "3,20",
      data_prevista: "2026-09-09",
    },
  ]),
  "Pedido"
);
const modeloOut = XLSX.write(modeloWb, { type: "array", bookType: "xlsx" });
const modeloParsed = parseWisePedido(
  modeloOut instanceof Uint8Array ? toArrayBuffer(modeloOut) : (modeloOut as ArrayBuffer)
);
assert(modeloParsed.ok, modeloParsed.ok ? "" : modeloParsed.error);
assert(modeloParsed.rows.length === 1, `modelo rows ${modeloParsed.rows.length}`);
assert(modeloParsed.rows[0].pedido === "W-2026-1001", `modelo pedido ${modeloParsed.rows[0].pedido}`);
assert(modeloParsed.rows[0].quantidade === 80, `modelo qtde ${modeloParsed.rows[0].quantidade}`);
assert(modeloParsed.rows[0].preco_unitario === 3.2, `modelo unit ${modeloParsed.rows[0].preco_unitario}`);

const samplePath = "C:/Users/barre/Downloads/samples/Exportacao (6).xls";
if (existsSync(samplePath)) {
  const sample = parseWisePedido(toArrayBuffer(readFileSync(samplePath)));
  assert(sample.ok, sample.ok ? "" : sample.error);
  assert(sample.ignoradas.length === 0, `sample ignoradas ${JSON.stringify(sample.ignoradas)}`);
  assert(sample.rows.length === 81, `sample rows ${sample.rows.length}`);
  const first = sample.rows.find((r) => r.pedido === "30296" && r.codigo_produto === "5");
  assert(first?.quantidade === 6000, `sample alface qtde ${first?.quantidade}`);
  assert(first?.preco_unitario === 1, `sample alface unit ${first?.preco_unitario}`);
  assert(first?.data_prevista === "2026-09-11", `sample data ${first?.data_prevista}`);
  const pedidos = new Set(sample.rows.map((r) => r.pedido));
  assert(pedidos.has("30296") && pedidos.has("30271"), "faltaram pedidos da exportação");
  assert(!sample.rows.some((r) => !r.pedido), "linha de total entrou como pedido");
}

console.log("excel-wise-pedidos ok");
