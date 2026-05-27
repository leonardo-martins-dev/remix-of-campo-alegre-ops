// Mock data central — substituído depois pela API Wisetec / Excel import

export const fornecedores = [
  { id: "f1", nome: "Hortifruti São José", itensFaltantes: 2, itensTotal: 18, hora: "06:14" },
  { id: "f2", nome: "Sítio Boa Vista", itensFaltantes: 0, itensTotal: 12, hora: "06:42" },
  { id: "f3", nome: "Verduras Modelo", itensFaltantes: 7, itensTotal: 24, hora: "07:08" },
  { id: "f4", nome: "Folhas Premium", itensFaltantes: 1, itensTotal: 9, hora: "07:30" },
];

export const destinatarios = ["Campo Alegre", "Anderson", "Parceiro Sul"] as const;

export const pedidosRecebimento = [
  { id: "PC-2041", fornecedor: "Hortifruti São José", itens: 18, rateio: [["Campo Alegre", 12], ["Anderson", 6]], origem: "Wisetec", chegada: "06:14", status: "pendente" },
  { id: "PC-2042", fornecedor: "Sítio Boa Vista",   itens: 12, rateio: [["Campo Alegre", 8], ["Parceiro Sul", 4]], origem: "Wisetec", chegada: "06:42", status: "conferido" },
  { id: "PC-2043", fornecedor: "Verduras Modelo",   itens: 24, rateio: [["Campo Alegre", 14], ["Anderson", 6], ["Parceiro Sul", 4]], origem: "Manual", chegada: "07:08", status: "divergencia" },
  { id: "PC-2044", fornecedor: "Folhas Premium",    itens: 9,  rateio: [["Campo Alegre", 9]], origem: "Wisetec", chegada: "07:30", status: "pendente" },
];

export const itensPedido = [
  { produto: "Alface Crespa",  unid: "mç", pedido: 80, rateio: [["Campo Alegre", 50], ["Anderson", 30]], recebido: 80,  div: null as any },
  { produto: "Rúcula",         unid: "mç", pedido: 60, rateio: [["Campo Alegre", 40], ["Anderson", 20]], recebido: 58,  div: { tipo: "falta", qtd: 2 } },
  { produto: "Tomate Italiano",unid: "kg", pedido: 120, rateio: [["Campo Alegre", 90], ["Anderson", 30]], recebido: 120, div: null },
  { produto: "Pepino Japonês", unid: "kg", pedido: 45, rateio: [["Campo Alegre", 25], ["Anderson", 20]], recebido: 42,  div: { tipo: "qualidade", qtd: 3 } },
  { produto: "Cenoura",        unid: "kg", pedido: 100, rateio: [["Campo Alegre", 70], ["Anderson", 30]], recebido: 100, div: null },
];

export const cargasExpedicao = [
  { id: "RM-501", cliente: "Carrefour Pinheiros",  rota: "SP-01", caminhao: "MWX-2A14", motorista: "Carlos Souza",  inicio: "08:12", itens: 142, caixas: 38, status: "carregando", progresso: 0.62 },
  { id: "RM-502", cliente: "Assaí Tatuapé",        rota: "SP-04", caminhao: "JKL-1B09", motorista: "Edson Lima",    inicio: "07:55", itens: 98,  caixas: 22, status: "carregando", progresso: 0.34 },
  { id: "RM-503", cliente: "Atacadão Mooca",       rota: "SP-02", caminhao: "RTY-7C44", motorista: "Marcelo Pinto", inicio: "07:10", itens: 121, caixas: 31, status: "concluida", progresso: 1 },
  { id: "RM-504", cliente: "Carrefour Morumbi",    rota: "SP-03", caminhao: "PLM-3D02", motorista: "André Castro",  inicio: "—",     itens: 132, caixas: 34, status: "aguardando", progresso: 0 },
];

export const romaneioItens = [
  { familia: "Folhas",   itens: [
    { produto: "Alface Crespa",   romaneio: 30, real: 30, caixas: { G: 0, I: 0, P: 3 }, status: "ok" },
    { produto: "Rúcula",          romaneio: 24, real: 22, caixas: { G: 0, I: 0, P: 3 }, status: "corrigido" },
    { produto: "Espinafre",       romaneio: 18, real: 18, caixas: { G: 0, I: 0, P: 2 }, status: "ok" },
  ]},
  { familia: "Frutos",   itens: [
    { produto: "Tomate Italiano", romaneio: 60, real: 60, caixas: { G: 6, I: 0, P: 0 }, status: "ok" },
    { produto: "Pepino",          romaneio: 22, real: 0,  caixas: { G: 2, I: 0, P: 0 }, status: "pendente" },
  ]},
  { familia: "Raízes",   itens: [
    { produto: "Cenoura",         romaneio: 50, real: 50, caixas: { G: 5, I: 0, P: 0 }, status: "ok" },
    { produto: "Batata",          romaneio: 80, real: 80, caixas: { G: 8, I: 0, P: 0 }, status: "ok" },
  ]},
  { familia: "Refrigerados", itens: [
    { produto: "Couve flor",      romaneio: 12, real: 12, caixas: { G: 0, I: 2, P: 0 }, status: "ok" },
  ]},
];

export const tiposCaixaInit = [
  { id: "G", nome: "Grande",   custo: 38.0 },
  { id: "I", nome: "Isopor",   custo: 22.0 },
  { id: "P", nome: "Plástica", custo: 18.0 },
];

export const clientesSaldo = [
  { cliente: "Carrefour Pinheiros",  G: { env: 220, ret: 198 }, I: { env: 60, ret: 42 },  P: { env: 180, ret: 170 }, aging: 6,  trend: [4,5,6,5,7,8,7] },
  { cliente: "Assaí Tatuapé",        G: { env: 180, ret: 150 }, I: { env: 40, ret: 28 },  P: { env: 150, ret: 140 }, aging: 9,  trend: [3,4,5,6,7,9,11] },
  { cliente: "Atacadão Mooca",       G: { env: 260, ret: 250 }, I: { env: 70, ret: 65 },  P: { env: 210, ret: 205 }, aging: 4,  trend: [6,5,4,3,4,5,4] },
  { cliente: "Carrefour Morumbi",    G: { env: 140, ret: 110 }, I: { env: 30, ret: 18 },  P: { env: 120, ret: 95 },  aging: 11, trend: [2,3,5,7,9,10,12] },
  { cliente: "Assaí Santo Amaro",    G: { env: 200, ret: 180 }, I: { env: 50, ret: 40 },  P: { env: 170, ret: 165 }, aging: 5,  trend: [5,5,6,5,4,5,6] },
];

export const perdaPorCliente = [
  { cliente: "Carrefour Morumbi",   enviadas: 290, perdidas: 18, taxa: 6.2, trend: [3,4,5,6,7,8,9], pior: "Plástica" },
  { cliente: "Assaí Tatuapé",       enviadas: 370, perdidas: 14, taxa: 3.8, trend: [4,3,4,5,4,5,4], pior: "Isopor" },
  { cliente: "Carrefour Pinheiros", enviadas: 460, perdidas: 11, taxa: 2.4, trend: [2,2,3,2,3,2,3], pior: "Plástica" },
  { cliente: "Atacadão Mooca",      enviadas: 540, perdidas: 9,  taxa: 1.7, trend: [2,2,1,2,1,2,1], pior: "Grande" },
  { cliente: "Assaí Santo Amaro",   enviadas: 420, perdidas: 16, taxa: 3.8, trend: [3,3,4,3,4,4,5], pior: "Isopor" },
];

export const fillRateFornecedor = [
  { fornecedor: "Hortifruti São José", fill: 96.2, trend: [95,96,97,96,98,97,96], ultimaDiv: "Há 2 dias" },
  { fornecedor: "Sítio Boa Vista",     fill: 99.1, trend: [99,99,98,99,100,99,99], ultimaDiv: "Há 8 dias" },
  { fornecedor: "Verduras Modelo",     fill: 87.4, trend: [88,86,85,87,89,87,88], ultimaDiv: "Hoje" },
  { fornecedor: "Folhas Premium",      fill: 94.8, trend: [93,94,95,94,95,96,95], ultimaDiv: "Há 4 dias" },
];

export const tempoCargaPorLoja = [
  { loja: "Carrefour Pinheiros", inicio: "08:12", fim: "09:04", duracao: 52, itens: 142, ipm: 2.73 },
  { loja: "Assaí Tatuapé",       inicio: "07:55", fim: "08:48", duracao: 53, itens: 98,  ipm: 1.85 },
  { loja: "Atacadão Mooca",      inicio: "07:10", fim: "07:58", duracao: 48, itens: 121, ipm: 2.52 },
];

export const ciclo = [
  { etapa: "Chegada fornecedor",    tempo: 0 },
  { etapa: "Conferência ok",        tempo: 38 },
  { etapa: "Início da carga",       tempo: 95 },
  { etapa: "Caminhão na rua",       tempo: 148 },
  { etapa: "Retorno de caixas",     tempo: 1320 },
];
