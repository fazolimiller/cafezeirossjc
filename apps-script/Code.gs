/**
 * Cafezeiros SJC — backend de encomendas (Google Apps Script + Google Planilhas)
 *
 * Como instalar: veja o README.md na raiz do repositório.
 * A planilha vinculada a este script vira o banco de dados, com as abas:
 *   Pedidos, Itens, Cafes e Config.
 * A senha do painel fica em Propriedades do script → ADMIN_SENHA.
 */

const ABAS = {
  Pedidos: ['id', 'criadoEm', 'rodada', 'nome', 'telefone', 'itens', 'total', 'status', 'valorPago', 'pagoEm', 'observacoes', 'atualizadoEm'],
  Itens: ['pedidoId', 'criadoEm', 'rodada', 'nome', 'cafeId', 'cafe', 'peso', 'moagem', 'preco', 'quantidade', 'subtotal', 'status'],
  // tamanhos: JSON [{"peso":"250 g","preco":45}, ...]; moagens: lista separada por vírgula
  Cafes: ['id', 'nome', 'torrefacao', 'descricao', 'tamanhos', 'moagens', 'ativo', 'ordem'],
  Config: ['chave', 'valor']
};

// Colunas que devem ser texto puro (evita perder zeros à esquerda em telefones etc.)
const COLUNAS_TEXTO = {
  Pedidos: ['id', 'rodada', 'nome', 'telefone', 'itens', 'status', 'observacoes'],
  Itens: ['pedidoId', 'rodada', 'nome', 'cafeId', 'cafe', 'peso', 'moagem', 'status'],
  Cafes: ['id', 'nome', 'torrefacao', 'descricao', 'tamanhos', 'moagens'],
  Config: ['chave', 'valor']
};

const CONFIG_PADRAO = {
  rodada: '',
  pedidosAbertos: 'sim',
  prazo: '',
  pixChave: '',
  pixNome: 'CAFEZEIROS SJC',
  pixCidade: 'SAO JOSE DOS CAMPOS',
  whatsapp: '',
  aviso: ''
};

const CONFIG_PUBLICA = ['rodada', 'pedidosAbertos', 'prazo', 'pixChave', 'pixNome', 'pixCidade', 'whatsapp', 'aviso'];

const STATUS = ['aguardando', 'informado', 'confirmado', 'cancelado'];

/* ---------------- Entrada HTTP ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  return responder_(() => rotear_(p.action || 'publico', p));
}

function doPost(e) {
  let corpo = {};
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, erro: 'Requisição inválida.' });
  }
  return responder_(() => rotear_(corpo.action, corpo));
}

function responder_(fn) {
  try {
    return json_({ ok: true, dados: fn() });
  } catch (err) {
    return json_({ ok: false, erro: err.message || String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rotear_(action, p) {
  garantirEstrutura_();
  switch (action) {
    case 'publico': return publico_();
    case 'criarPedido': return comTrava_(() => criarPedido_(p));
    case 'informarPagamento': return comTrava_(() => informarPagamento_(p));
    case 'admin.login': exigirAdmin_(p); return true;
    case 'admin.dados': exigirAdmin_(p); return dadosAdmin_();
    case 'admin.atualizarPedido': exigirAdmin_(p); return comTrava_(() => atualizarPedido_(p));
    case 'admin.salvarCafes': exigirAdmin_(p); return comTrava_(() => salvarCafes_(p.cafes || []));
    case 'admin.salvarConfig': exigirAdmin_(p); return comTrava_(() => salvarConfig_(p.config || {}));
    default: throw new Error('Ação desconhecida: ' + action);
  }
}

function comTrava_(fn) {
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    return fn();
  } finally {
    trava.releaseLock();
  }
}

function exigirAdmin_(p) {
  const senha = PropertiesService.getScriptProperties().getProperty('ADMIN_SENHA');
  if (!senha) throw new Error('Defina ADMIN_SENHA nas Propriedades do script.');
  if (String(p.senha || '') !== senha) throw new Error('Senha incorreta.');
}

/* ---------------- Ações ---------------- */

function publico_() {
  const config = lerConfig_();
  const publica = {};
  CONFIG_PUBLICA.forEach(k => { publica[k] = config[k]; });
  return {
    config: publica,
    cafes: lerCafes_().filter(c => c.ativo)
  };
}

function criarPedido_(p) {
  const config = lerConfig_();
  if (config.pedidosAbertos !== 'sim') throw new Error('As encomendas deste mês estão fechadas.');

  const nome = limpar_(p.nome, 80);
  const telefone = String(p.telefone || '').replace(/\D/g, '').slice(0, 13);
  if (!nome) throw new Error('Informe seu nome.');
  if (telefone.length < 10) throw new Error('Informe um telefone/WhatsApp válido com DDD.');

  // O preço vem SEMPRE do catálogo da planilha, nunca do navegador.
  const cafes = {};
  lerCafes_().filter(c => c.ativo).forEach(c => { cafes[c.id] = c; });
  const itens = [];
  (p.itens || []).forEach(i => {
    const cafe = cafes[i.cafeId];
    const qtd = Math.floor(Number(i.quantidade) || 0);
    if (!cafe || qtd <= 0) return;
    const tamanho = cafe.tamanhos.filter(t => t.peso === i.peso)[0];
    if (!tamanho) throw new Error('Tamanho indisponível para ' + cafe.nome + '.');
    if (cafe.moagens.indexOf(i.moagem) < 0) throw new Error('Moagem indisponível para ' + cafe.nome + '.');
    if (qtd > 50) throw new Error('Quantidade muito alta para ' + cafe.nome + '.');
    itens.push({
      cafeId: cafe.id,
      cafe: cafe.nome,
      peso: tamanho.peso,
      moagem: i.moagem,
      preco: tamanho.preco,
      quantidade: qtd,
      subtotal: centavos_(tamanho.preco * qtd)
    });
  });
  if (!itens.length) throw new Error('Escolha pelo menos um café.');

  const agora = new Date();
  const pedido = {
    id: novoId_(agora),
    criadoEm: agora,
    rodada: config.rodada || rodadaPadrao_(agora),
    nome: nome,
    telefone: telefone,
    itens: itens,
    total: centavos_(itens.reduce((s, i) => s + i.subtotal, 0)),
    status: 'aguardando',
    valorPago: '',
    pagoEm: '',
    observacoes: limpar_(p.observacoes, 500),
    atualizadoEm: agora
  };

  anexar_('Pedidos', Object.assign({}, pedido, { itens: JSON.stringify(itens) }));
  const linhasItens = itens.map(i => Object.assign({
    pedidoId: pedido.id, criadoEm: agora, rodada: pedido.rodada, nome: nome, status: pedido.status
  }, i));
  anexarVarias_('Itens', linhasItens);
  return pedido;
}

function informarPagamento_(p) {
  const pedido = buscarPedido_(p.id);
  const telefone = String(p.telefone || '').replace(/\D/g, '');
  if (!pedido || pedido.dados.telefone !== telefone) throw new Error('Pedido não encontrado.');
  if (pedido.dados.status === 'aguardando') {
    alterarPedido_(pedido, { status: 'informado' });
  }
  return true;
}

function dadosAdmin_() {
  return {
    config: lerConfig_(),
    cafes: lerCafes_(),
    pedidos: ler_('Pedidos').map(normalizarPedido_)
  };
}

function atualizarPedido_(p) {
  const pedido = buscarPedido_(p.id);
  if (!pedido) throw new Error('Pedido não encontrado.');
  const mudancas = {};
  if (p.status !== undefined) {
    if (STATUS.indexOf(p.status) < 0) throw new Error('Status inválido.');
    mudancas.status = p.status;
    if (p.status === 'confirmado' && !pedido.dados.pagoEm) mudancas.pagoEm = new Date();
    if (p.status !== 'confirmado') mudancas.pagoEm = '';
  }
  if (p.valorPago !== undefined) mudancas.valorPago = p.valorPago === '' ? '' : centavos_(Number(p.valorPago) || 0);
  if (p.observacoes !== undefined) mudancas.observacoes = limpar_(p.observacoes, 500);
  return normalizarPedido_(alterarPedido_(pedido, mudancas));
}

function salvarCafes_(lista) {
  const cafes = lista.map((c, i) => ({
    id: limpar_(c.id, 40) || Utilities.getUuid().slice(0, 8),
    nome: limpar_(c.nome, 80),
    torrefacao: limpar_(c.torrefacao, 80),
    descricao: limpar_(c.descricao, 400),
    tamanhos: JSON.stringify((c.tamanhos || [])
      .map(t => ({ peso: limpar_(t.peso, 30), preco: centavos_(Number(t.preco) || 0) }))
      .filter(t => t.peso && t.preco > 0)),
    moagens: (c.moagens || []).map(m => limpar_(m, 40)).filter(String).join(', '),
    ativo: c.ativo ? 'sim' : 'não',
    ordem: i + 1
  })).filter(c => c.nome);
  cafes.forEach(c => {
    if (c.tamanhos === '[]') throw new Error(c.nome + ': informe pelo menos um tamanho com preço.');
    if (!c.moagens) throw new Error(c.nome + ': marque pelo menos uma moagem.');
  });
  reescrever_('Cafes', cafes);
  return lerCafes_();
}

function salvarConfig_(novo) {
  const config = lerConfig_();
  Object.keys(CONFIG_PADRAO).forEach(k => {
    if (novo[k] !== undefined) config[k] = limpar_(novo[k], 300);
  });
  reescrever_('Config', Object.keys(config).map(k => ({ chave: k, valor: config[k] })));
  return config;
}

/* ---------------- Pedidos ---------------- */

function buscarPedido_(id) {
  const aba = aba_('Pedidos');
  const ids = aba.getRange(2, 1, Math.max(aba.getLastRow() - 1, 1), 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === String(id)) {
      const linha = i + 2;
      const valores = aba.getRange(linha, 1, 1, ABAS.Pedidos.length).getValues()[0];
      return { linha: linha, dados: paraObjeto_(ABAS.Pedidos, valores) };
    }
  }
  return null;
}

function alterarPedido_(pedido, mudancas) {
  const dados = Object.assign({}, pedido.dados, mudancas, { atualizadoEm: new Date() });
  aba_('Pedidos').getRange(pedido.linha, 1, 1, ABAS.Pedidos.length)
    .setValues([ABAS.Pedidos.map(c => valorCelula_(dados[c]))]);

  // Mantém o status espelhado na aba Itens (útil para tabelas dinâmicas na planilha).
  if (mudancas.status) {
    const aba = aba_('Itens');
    const n = aba.getLastRow() - 1;
    if (n > 0) {
      const colStatus = ABAS.Itens.indexOf('status') + 1;
      const ids = aba.getRange(2, 1, n, 1).getDisplayValues();
      ids.forEach((r, i) => {
        if (r[0] === dados.id) aba.getRange(i + 2, colStatus).setValue(mudancas.status);
      });
    }
  }
  return dados;
}

function normalizarPedido_(p) {
  let itens = [];
  try { itens = JSON.parse(p.itens || '[]'); } catch (e) { itens = []; }
  return Object.assign({}, p, {
    id: String(p.id),
    telefone: String(p.telefone),
    itens: itens,
    total: Number(p.total) || 0,
    valorPago: p.valorPago === '' ? '' : Number(p.valorPago) || 0,
    status: p.status || 'aguardando'
  });
}

function novoId_(data) {
  const base = Utilities.formatDate(data, 'America/Sao_Paulo', 'yyMMdd');
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'CF' + base + sufixo;
}

function rodadaPadrao_(data) {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mes = Number(Utilities.formatDate(data, 'America/Sao_Paulo', 'M')) - 1;
  return meses[mes] + '/' + Utilities.formatDate(data, 'America/Sao_Paulo', 'yyyy');
}

/* ---------------- Catálogo e configuração ---------------- */

function lerCafes_() {
  return ler_('Cafes')
    .map(c => Object.assign({}, c, {
      id: String(c.id),
      tamanhos: lerTamanhos_(c.tamanhos),
      moagens: String(c.moagens || '').split(',').map(m => m.trim()).filter(String),
      ativo: String(c.ativo).toLowerCase() === 'sim' || c.ativo === true,
      ordem: Number(c.ordem) || 0
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

function lerTamanhos_(texto) {
  try {
    return JSON.parse(texto || '[]').map(t => ({ peso: String(t.peso), preco: Number(t.preco) || 0 }));
  } catch (e) {
    return [];
  }
}

function lerConfig_() {
  const config = Object.assign({}, CONFIG_PADRAO);
  ler_('Config').forEach(r => { if (r.chave) config[r.chave] = String(r.valor); });
  if (!config.rodada) config.rodada = rodadaPadrao_(new Date());
  return config;
}

/* ---------------- Planilha ---------------- */

/** Rode esta função uma vez pelo editor para criar as abas e o catálogo de exemplo. */
function configurar() {
  garantirEstrutura_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_SENHA')) props.setProperty('ADMIN_SENHA', 'troque-esta-senha');
}

function garantirEstrutura_() {
  const planilha = SpreadsheetApp.getActive();
  Object.keys(ABAS).forEach(nome => {
    if (planilha.getSheetByName(nome)) return;
    const aba = planilha.insertSheet(nome);
    const cab = ABAS[nome];
    aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1f3b2c').setFontColor('#f6efe2');
    aba.setFrozenRows(1);
    (COLUNAS_TEXTO[nome] || []).forEach(c => {
      aba.getRange(2, cab.indexOf(c) + 1, aba.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    if (nome === 'Cafes') reescrever_('Cafes', CAFES_EXEMPLO);
    if (nome === 'Config') reescrever_('Config', Object.keys(CONFIG_PADRAO).map(k => ({ chave: k, valor: CONFIG_PADRAO[k] })));
  });
}

// Preços de exemplo: substitua pelo painel em "Cafés e preços".
const CAFES_EXEMPLO = [
  { id: 'exemplo-1', nome: 'Café de exemplo', torrefacao: 'Torrefação (editar)', descricao: 'Edite pelo painel: notas sensoriais, origem, processo.', tamanhos: '[{"peso":"250 g","preco":45},{"peso":"1 kg","preco":160}]', moagens: 'Em grãos, Moído', ativo: 'sim', ordem: 1 },
  { id: 'julia', nome: 'Café da Júlia', torrefacao: 'Torrefação (editar)', descricao: 'Disponível só em 250 g.', tamanhos: '[{"peso":"250 g","preco":50}]', moagens: 'Em grãos, Moído', ativo: 'sim', ordem: 2 }
];

function aba_(nome) {
  return SpreadsheetApp.getActive().getSheetByName(nome);
}

function ler_(nome) {
  const aba = aba_(nome);
  const n = aba.getLastRow() - 1;
  if (n <= 0) return [];
  const cab = ABAS[nome];
  return aba.getRange(2, 1, n, cab.length).getValues()
    .filter(r => r.some(v => v !== ''))
    .map(r => paraObjeto_(cab, r));
}

function anexar_(nome, obj) {
  anexarVarias_(nome, [obj]);
}

function anexarVarias_(nome, lista) {
  if (!lista.length) return;
  const aba = aba_(nome);
  const cab = ABAS[nome];
  aba.getRange(aba.getLastRow() + 1, 1, lista.length, cab.length)
    .setValues(lista.map(o => cab.map(c => valorCelula_(o[c]))));
}

function reescrever_(nome, lista) {
  const aba = aba_(nome);
  const cab = ABAS[nome];
  if (aba.getLastRow() > 1) aba.getRange(2, 1, aba.getLastRow() - 1, cab.length).clearContent();
  anexarVarias_(nome, lista);
}

function paraObjeto_(cab, linha) {
  const o = {};
  cab.forEach((c, i) => { o[c] = linha[i]; });
  return o;
}

function valorCelula_(v) {
  return v === undefined || v === null ? '' : v;
}

function limpar_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

function centavos_(v) {
  return Math.round(v * 100) / 100;
}
