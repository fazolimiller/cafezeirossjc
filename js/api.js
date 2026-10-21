// Comunicação com o banco de dados.
// Com API_URL configurada, conversa com o Google Apps Script (planilha).
// Sem ela, usa um banco de demonstração no próprio navegador (localStorage),
// que imita as mesmas ações para você testar o site antes de publicar.
const Api = (() => {
  const URL_API = ((window.CAFEZEIROS_CONFIG || {}).API_URL || '').trim();
  const demo = !URL_API;

  async function remoto(action, payload) {
    // text/plain evita a verificação CORS "preflight", que o Apps Script não responde.
    const res = await fetch(URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload))
    });
    if (!res.ok) throw new Error('Falha de conexão com o servidor.');
    const r = await res.json();
    if (!r.ok) throw new Error(r.erro || 'Erro inesperado.');
    return r.dados;
  }

  /* ---------- Modo demonstração ---------- */

  const CHAVE = 'cafezeiros-demo-v3';
  const SENHA_DEMO = 'cafe';

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (salvo) return salvo;
    } catch (e) { /* começa do zero */ }
    return {
      config: {
        rodada: Util.rodadaPadrao(), pedidosAbertos: 'sim', prazo: '', pixChave: '',
        pixNome: 'CAFEZEIROS SJC', pixCidade: 'SAO JOSE DOS CAMPOS', whatsapp: '', aviso: ''
      },
      cafes: JSON.parse(JSON.stringify(window.CATALOGO_INICIAL || [])),
      pedidos: []
    };
  }

  function salvar(db) {
    try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch (e) { /* sem armazenamento */ }
  }

  const centavos = v => Math.round(v * 100) / 100;

  function exigirAdmin(p) {
    if (p.senha !== SENHA_DEMO) throw new Error('Senha incorreta. (No modo demonstração a senha é "cafe".)');
  }

  const acoesDemo = {
    publico(db) {
      return { config: db.config, cafes: db.cafes.filter(c => c.ativo) };
    },
    criarPedido(db, p) {
      if (db.config.pedidosAbertos !== 'sim') throw new Error('As encomendas deste mês estão fechadas.');
      const nome = String(p.nome || '').trim().slice(0, 80);
      const telefone = String(p.telefone || '').replace(/\D/g, '').slice(0, 13);
      if (!nome) throw new Error('Informe seu nome.');
      if (telefone.length < 10) throw new Error('Informe um telefone/WhatsApp válido com DDD.');
      const itens = [];
      (p.itens || []).forEach(i => {
        const cafe = db.cafes.find(c => c.id === i.cafeId && c.ativo);
        const qtd = Math.floor(Number(i.quantidade) || 0);
        if (!cafe || qtd <= 0) return;
        const tamanho = cafe.tamanhos.find(t => t.peso === i.peso);
        if (!tamanho) throw new Error(`Tamanho indisponível para ${cafe.nome}.`);
        const moagem = cafe.moagens.length ? i.moagem : '';
        if (cafe.moagens.length && !cafe.moagens.includes(moagem)) throw new Error(`Moagem indisponível para ${cafe.nome}.`);
        itens.push({
          cafeId: cafe.id, cafe: cafe.nome, peso: tamanho.peso, moagem,
          preco: tamanho.preco, quantidade: qtd, subtotal: centavos(tamanho.preco * qtd)
        });
      });
      if (!itens.length) throw new Error('Escolha pelo menos um café.');
      const agora = new Date();
      const pedido = {
        id: 'CF' + agora.toISOString().slice(2, 10).replace(/-/g, '') + Math.random().toString(36).slice(2, 6).toUpperCase(),
        criadoEm: agora.toISOString(), rodada: db.config.rodada || Util.rodadaPadrao(agora),
        nome, telefone, itens, total: centavos(itens.reduce((s, i) => s + i.subtotal, 0)),
        status: 'aguardando', valorPago: '', pagoEm: '', observacoes: String(p.observacoes || '').slice(0, 500),
        atualizadoEm: agora.toISOString()
      };
      db.pedidos.push(pedido);
      return pedido;
    },
    informarPagamento(db, p) {
      const ped = db.pedidos.find(x => x.id === p.id && x.telefone === String(p.telefone || '').replace(/\D/g, ''));
      if (!ped) throw new Error('Pedido não encontrado.');
      if (ped.status === 'aguardando') ped.status = 'informado';
      return true;
    },
    'admin.login'(db, p) { exigirAdmin(p); return true; },
    'admin.dados'(db, p) { exigirAdmin(p); return db; },
    'admin.atualizarPedido'(db, p) {
      exigirAdmin(p);
      const ped = db.pedidos.find(x => x.id === p.id);
      if (!ped) throw new Error('Pedido não encontrado.');
      if (p.status !== undefined) {
        ped.status = p.status;
        if (p.status === 'confirmado' && !ped.pagoEm) ped.pagoEm = new Date().toISOString();
        if (p.status !== 'confirmado') ped.pagoEm = '';
      }
      if (p.valorPago !== undefined) ped.valorPago = p.valorPago === '' ? '' : centavos(Number(p.valorPago) || 0);
      if (p.observacoes !== undefined) ped.observacoes = p.observacoes;
      ped.atualizadoEm = new Date().toISOString();
      return ped;
    },
    'admin.salvarCafes'(db, p) {
      exigirAdmin(p);
      db.cafes = (p.cafes || []).filter(c => c.nome).map((c, i) => ({
        ...c, id: c.id || Math.random().toString(36).slice(2, 10), ativo: !!c.ativo, ordem: i + 1,
        tamanhos: (c.tamanhos || []).map(t => ({ peso: String(t.peso).trim(), preco: centavos(Number(t.preco) || 0) }))
          .filter(t => t.peso && t.preco > 0),
        moagens: (c.moagens || []).filter(Boolean)
      }));
      db.cafes.forEach(c => {
        if (!c.tamanhos.length) throw new Error(`${c.nome}: informe pelo menos um tamanho com preço.`);
      });
      return db.cafes;
    },
    'admin.salvarConfig'(db, p) {
      exigirAdmin(p);
      Object.assign(db.config, p.config || {});
      return db.config;
    }
  };

  async function local(action, payload) {
    const fn = acoesDemo[action];
    if (!fn) throw new Error('Ação desconhecida: ' + action);
    const db = carregar();
    const r = fn(db, payload);
    salvar(db);
    await new Promise(ok => setTimeout(ok, 150));
    return JSON.parse(JSON.stringify(r));
  }

  return {
    demo,
    chamar: (action, payload = {}) => (demo ? local(action, payload) : remoto(action, payload))
  };
})();
