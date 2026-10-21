// Painel da organização: pedidos, relatórios por período, cafés e configurações.
(() => {
  const $ = id => document.getElementById(id);
  const CHAVE_SENHA = 'cafezeiros-admin';
  const PENDENTES = ['aguardando', 'informado'];

  let senha = '';
  let dados = { config: {}, cafes: [], pedidos: [] };

  /* ---------- Sessão ---------- */

  function lerSessao() {
    try { return sessionStorage.getItem(CHAVE_SENHA) || ''; } catch (e) { return ''; }
  }
  function gravarSessao(v) {
    try { v ? sessionStorage.setItem(CHAVE_SENHA, v) : sessionStorage.removeItem(CHAVE_SENHA); } catch (e) { /* ignora */ }
  }

  const chamar = (acao, payload = {}) => Api.chamar(acao, Object.assign({ senha }, payload));

  $('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    $('erro-login').textContent = '';
    senha = $('senha').value;
    try {
      await chamar('admin.login');
      gravarSessao(senha);
      await entrar();
    } catch (err) {
      $('erro-login').textContent = err.message;
    }
  });

  $('sair').addEventListener('click', () => {
    gravarSessao('');
    location.reload();
  });

  async function entrar() {
    await carregar();
    $('tela-login').classList.add('oculto');
    $('tela-painel').classList.remove('oculto');
    $('sair').classList.remove('oculto');
  }

  async function carregar() {
    dados = await chamar('admin.dados');
    dados.pedidos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    preencherRodadas();
    renderPedidos();
    renderRelatorio();
    renderCafes();
    preencherConfig();
  }

  $('recarregar').addEventListener('click', async () => {
    try {
      await carregar();
      Util.aviso('Dados atualizados.');
    } catch (err) {
      Util.aviso(err.message, 'erro');
    }
  });

  /* ---------- Abas ---------- */

  document.querySelectorAll('[role="tab"]').forEach(botao => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', b === botao));
      document.querySelectorAll('.aba').forEach(a => a.classList.add('oculto'));
      $('aba-' + botao.dataset.aba).classList.remove('oculto');
    });
  });

  /* ---------- Cálculos ---------- */

  function recebido(p) {
    if (p.status === 'cancelado') return 0;
    if (p.valorPago !== '' && p.valorPago !== null && p.valorPago !== undefined) return Number(p.valorPago) || 0;
    return p.status === 'confirmado' ? p.total : 0;
  }

  function descItem(i) {
    return [i.cafe, i.peso, i.moagem].filter(Boolean).join(' · ');
  }

  // "250 g" → 0.25; "1 kg" → 1; "1,5kg" → 1.5. Peso não reconhecido → null.
  function emKg(peso) {
    const m = String(peso || '').match(/([\d.,]+)\s*(kg|g)\b/i);
    if (!m) return null;
    const n = Number(m[1].replace(',', '.'));
    return m[2].toLowerCase() === 'kg' ? n : n / 1000;
  }

  function kg(v) {
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' kg';
  }

  function diaLocal(v) {
    return new Date(v).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  // Rodadas da mais recente para a mais antiga (pela data do primeiro pedido).
  function rodadas() {
    const inicio = {};
    dados.pedidos.forEach(p => {
      const t = new Date(p.criadoEm).getTime();
      if (!(p.rodada in inicio) || t < inicio[p.rodada]) inicio[p.rodada] = t;
    });
    if (dados.config.rodada && !(dados.config.rodada in inicio)) inicio[dados.config.rodada] = Date.now();
    return Object.keys(inicio).sort((a, b) => inicio[b] - inicio[a]);
  }

  function filtrarStatus(lista, filtro) {
    if (filtro === 'validos') return lista.filter(p => p.status !== 'cancelado');
    if (filtro === 'pendentes') return lista.filter(p => PENDENTES.includes(p.status));
    if (filtro) return lista.filter(p => p.status === filtro);
    return lista;
  }

  function resumo(lista) {
    const validos = lista.filter(p => p.status !== 'cancelado');
    const total = validos.reduce((s, p) => s + p.total, 0);
    const receb = validos.reduce((s, p) => s + recebido(p), 0);
    return {
      pedidos: validos.length,
      pessoas: new Set(validos.map(p => p.telefone)).size,
      pacotes: validos.reduce((s, p) => s + p.itens.reduce((q, i) => q + i.quantidade, 0), 0),
      total,
      recebido: receb,
      aReceber: validos.filter(p => PENDENTES.includes(p.status)).reduce((s, p) => s + p.total, 0)
    };
  }

  function cartoes(r) {
    return `
      <div class="cartao"><span>Pedidos</span><strong>${r.pedidos}</strong></div>
      <div class="cartao"><span>Pessoas</span><strong>${r.pessoas}</strong></div>
      <div class="cartao"><span>Pacotes de café</span><strong>${r.pacotes}</strong></div>
      <div class="cartao cartao--cafe"><span>Valor total</span><strong>${Util.moeda(r.total)}</strong></div>
      <div class="cartao"><span>PIX recebido</span><strong>${Util.moeda(r.recebido)}</strong></div>
      <div class="cartao cartao--alerta"><span>A receber</span><strong>${Util.moeda(r.aReceber)}</strong></div>`;
  }

  /* ---------- Pedidos ---------- */

  function preencherRodadas() {
    const lista = rodadas();
    const opcoes = lista.map(r => `<option value="${Util.esc(r)}">${Util.esc(r)}</option>`).join('');
    const atualPed = $('ped-rodada').value;
    const atualRel = $('rel-rodada').value;
    $('ped-rodada').innerHTML = opcoes + '<option value="*">Todas as rodadas</option>';
    $('rel-rodada').innerHTML = opcoes;
    $('ped-rodada').value = atualPed && (atualPed === '*' || lista.includes(atualPed)) ? atualPed : (lista[0] || '*');
    if (atualRel && lista.includes(atualRel)) $('rel-rodada').value = atualRel;
  }

  function pedidosFiltrados() {
    const rodada = $('ped-rodada').value;
    const busca = $('ped-busca').value.trim().toLowerCase();
    const buscaNum = busca.replace(/\D/g, '');
    let lista = dados.pedidos.filter(p => rodada === '*' || p.rodada === rodada);
    lista = filtrarStatus(lista, $('ped-status').value);
    if (busca) {
      lista = lista.filter(p => p.nome.toLowerCase().includes(busca) || p.id.toLowerCase().includes(busca) ||
        (buscaNum && p.telefone.includes(buscaNum)));
    }
    return lista;
  }

  function renderPedidos() {
    const lista = pedidosFiltrados();
    const rodada = $('ped-rodada').value;
    $('ped-resumo').innerHTML = cartoes(resumo(dados.pedidos.filter(p => rodada === '*' || p.rodada === rodada)));
    if (!lista.length) {
      $('ped-lista').innerHTML = '<tr><td colspan="7" class="carregando">Nenhum pedido encontrado.</td></tr>';
      return;
    }
    $('ped-lista').innerHTML = lista.map(p => {
      const rec = p.valorPago === '' ? '' : p.valorPago;
      const diverge = p.valorPago !== '' && Math.abs(Number(p.valorPago) - p.total) > 0.009;
      return `
      <tr data-id="${Util.esc(p.id)}" class="${p.status === 'cancelado' ? 'linha--cancelado' : ''}">
        <td><span class="ped-id">${Util.esc(p.id)}</span><br><span class="suave">${Util.data(p.criadoEm, true)}</span>${rodada === '*' ? `<br><span class="suave">${Util.esc(p.rodada)}</span>` : ''}</td>
        <td>${Util.esc(p.nome)}<br><a class="suave" href="${Util.whatsappLink(p.telefone)}" target="_blank" rel="noopener">${Util.telefone(p.telefone)}</a>${p.observacoes ? `<br><span class="suave">“${Util.esc(p.observacoes)}”</span>` : ''}</td>
        <td><ul class="ped-itens">${p.itens.map(i => `<li>${i.quantidade}× ${Util.esc(descItem(i))} <span class="suave">(${Util.moeda(i.preco)})</span></li>`).join('')}</ul></td>
        <td class="num">${Util.moeda(p.total)}</td>
        <td>
          <select class="select-mini" data-campo="status" aria-label="Status do pedido">
            ${Object.keys(Util.STATUS).map(s => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${Util.STATUS[s]}</option>`).join('')}
          </select>
          ${p.pagoEm ? `<br><span class="suave">pago em ${Util.data(p.pagoEm)}</span>` : ''}
        </td>
        <td class="num">
          <input class="entrada-mini" data-campo="valorPago" type="number" step="0.01" min="0" inputmode="decimal" value="${rec}" placeholder="${p.total.toFixed(2)}" aria-label="Valor recebido">
          ${diverge ? `<span class="divergente">diferença de ${Util.moeda(Number(p.valorPago) - p.total)}</span>` : ''}
        </td>
        <td>${p.status !== 'confirmado' && p.status !== 'cancelado' ? '<button class="botao botao--peq" data-acao="confirmar" type="button">Confirmar PIX</button>' : ''}</td>
      </tr>`;
    }).join('');
  }

  ['ped-rodada', 'ped-status'].forEach(id => $(id).addEventListener('change', renderPedidos));
  $('ped-busca').addEventListener('input', renderPedidos);

  async function atualizarPedido(id, mudancas) {
    try {
      const novo = await chamar('admin.atualizarPedido', Object.assign({ id }, mudancas));
      const i = dados.pedidos.findIndex(p => p.id === id);
      dados.pedidos[i] = Object.assign({}, dados.pedidos[i], novo, { itens: dados.pedidos[i].itens });
      renderPedidos();
      renderRelatorio();
      Util.aviso('Pedido atualizado.');
    } catch (err) {
      Util.aviso(err.message, 'erro');
      renderPedidos();
    }
  }

  $('ped-lista').addEventListener('change', e => {
    const linha = e.target.closest('tr[data-id]');
    if (!linha) return;
    const campo = e.target.dataset.campo;
    if (campo === 'status') atualizarPedido(linha.dataset.id, { status: e.target.value });
    if (campo === 'valorPago') atualizarPedido(linha.dataset.id, { valorPago: e.target.value === '' ? '' : Number(e.target.value) });
  });

  $('ped-lista').addEventListener('click', e => {
    const botao = e.target.closest('[data-acao="confirmar"]');
    if (!botao) return;
    const id = botao.closest('tr').dataset.id;
    const p = dados.pedidos.find(x => x.id === id);
    const mudancas = { status: 'confirmado' };
    if (p.valorPago === '') mudancas.valorPago = p.total;
    botao.disabled = true;
    atualizarPedido(id, mudancas);
  });

  $('ped-csv').addEventListener('click', () => {
    const linhas = [['Pedido', 'Data', 'Rodada', 'Nome', 'Telefone', 'Itens', 'Total', 'Status', 'Valor recebido', 'Pago em', 'Observações']];
    pedidosFiltrados().forEach(p => linhas.push([
      p.id, Util.data(p.criadoEm, true), p.rodada, p.nome, Util.telefone(p.telefone),
      p.itens.map(i => `${i.quantidade}x ${descItem(i)}`).join(' | '), p.total, Util.STATUS[p.status] || p.status,
      recebido(p), Util.data(p.pagoEm), p.observacoes || ''
    ]));
    Util.baixar(`pedidos-${nomeArquivo($('ped-rodada').value === '*' ? 'todas' : $('ped-rodada').value)}.csv`, Util.csv(linhas));
  });

  function nomeArquivo(t) {
    return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  }

  /* ---------- Relatórios ---------- */

  $('rel-modo').addEventListener('change', () => {
    const datas = $('rel-modo').value === 'datas';
    $('rel-campo-rodada').classList.toggle('oculto', datas);
    $('rel-campo-de').classList.toggle('oculto', !datas);
    $('rel-campo-ate').classList.toggle('oculto', !datas);
    if (datas && !$('rel-de').value) aplicarAtalho('mes');
    renderRelatorio();
  });
  ['rel-rodada', 'rel-de', 'rel-ate', 'rel-status'].forEach(id => $(id).addEventListener('change', renderRelatorio));
  $('rel-imprimir').addEventListener('click', () => window.print());

  $('rel-atalhos').addEventListener('click', e => {
    const b = e.target.closest('[data-atalho]');
    if (!b) return;
    $('rel-modo').value = 'datas';
    $('rel-modo').dispatchEvent(new Event('change'));
    aplicarAtalho(b.dataset.atalho);
    renderRelatorio();
  });

  function aplicarAtalho(tipo) {
    const hoje = new Date();
    const iso = d => d.toLocaleDateString('en-CA');
    const y = hoje.getFullYear();
    const m = hoje.getMonth();
    let de;
    let ate = new Date(y, m + 1, 0);
    if (tipo === 'mes') de = new Date(y, m, 1);
    if (tipo === 'mes-anterior') { de = new Date(y, m - 1, 1); ate = new Date(y, m, 0); }
    if (tipo === '3meses') de = new Date(y, m - 2, 1);
    if (tipo === 'ano') { de = new Date(y, 0, 1); ate = new Date(y, 11, 31); }
    if (tipo === 'tudo') {
      const datas = dados.pedidos.map(p => new Date(p.criadoEm));
      de = datas.length ? new Date(Math.min(...datas)) : new Date(y, m, 1);
      ate = datas.length ? new Date(Math.max(...datas)) : ate;
    }
    $('rel-de').value = iso(de);
    $('rel-ate').value = iso(ate);
  }

  function pedidosRelatorio() {
    let lista = dados.pedidos;
    let titulo;
    if ($('rel-modo').value === 'rodada') {
      const r = $('rel-rodada').value;
      lista = lista.filter(p => p.rodada === r);
      titulo = `Rodada ${r}`;
    } else {
      const de = $('rel-de').value;
      const ate = $('rel-ate').value;
      lista = lista.filter(p => {
        const d = diaLocal(p.criadoEm);
        return (!de || d >= de) && (!ate || d <= ate);
      });
      titulo = `Período de ${de ? Util.data(de + 'T12:00:00') : '…'} a ${ate ? Util.data(ate + 'T12:00:00') : '…'}`;
    }
    return { lista: filtrarStatus(lista, $('rel-status').value), titulo };
  }

  // Agrupa por café + tamanho + moagem + preço (se o preço mudou no período, aparecem linhas separadas).
  function porCafe(lista) {
    const grupos = {};
    lista.forEach(p => p.itens.forEach(i => {
      const k = [i.cafe, i.peso, i.moagem, i.preco].join('|');
      grupos[k] = grupos[k] || { cafe: i.cafe, peso: i.peso || '', moagem: i.moagem || '', preco: i.preco, quantidade: 0, total: 0, kg: 0, pedidos: new Set() };
      grupos[k].quantidade += i.quantidade;
      grupos[k].total += i.subtotal;
      grupos[k].kg += (emKg(i.peso) || 0) * i.quantidade;
      grupos[k].pedidos.add(p.id);
    }));
    return Object.values(grupos).sort((a, b) => a.cafe.localeCompare(b.cafe, 'pt-BR') ||
      (emKg(a.peso) || 0) - (emKg(b.peso) || 0) || a.moagem.localeCompare(b.moagem, 'pt-BR') || a.preco - b.preco);
  }

  function porRodada(lista) {
    const g = {};
    lista.forEach(p => {
      g[p.rodada] = g[p.rodada] || [];
      g[p.rodada].push(p);
    });
    return rodadas().filter(r => g[r]).map(r => Object.assign({ rodada: r }, resumo(g[r])));
  }

  let ultimoRelatorio = null;

  function renderRelatorio() {
    if (!$('rel-rodada').value && $('rel-modo').value === 'rodada') {
      $('relatorio').innerHTML = '<p class="carregando">Ainda não há pedidos.</p>';
      return;
    }
    const { lista, titulo } = pedidosRelatorio();
    const r = resumo(lista);
    const cafes = porCafe(lista);
    const rods = porRodada(lista);
    const filtroTxt = $('rel-status').selectedOptions[0].textContent;
    ultimoRelatorio = { lista, titulo, cafes, rods };

    const totalQtd = cafes.reduce((s, c) => s + c.quantidade, 0);
    const totalValor = cafes.reduce((s, c) => s + c.total, 0);
    const totalKg = cafes.reduce((s, c) => s + c.kg, 0);

    $('relatorio').innerHTML = `
      <div class="relatorio-cabecalho">
        <h1>${Util.esc(titulo)}</h1>
        <p class="suave">${Util.esc(filtroTxt)} · gerado em ${Util.data(new Date(), true)}</p>
      </div>
      <div class="cartoes">${cartoes(r)}</div>

      <div class="relatorio-bloco">
        <h2>Total por café <button class="botao botao--sec botao--peq" data-csv="cafes" type="button">CSV</button></h2>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Café</th><th>Tamanho</th><th>Moagem</th><th class="num">Preço unit.</th><th class="num">Pedidos</th><th class="num">Quantidade</th><th class="num">Peso total</th><th class="num">Total</th></tr></thead>
          <tbody>${cafes.map(c => `<tr><td>${Util.esc(c.cafe)}</td><td>${Util.esc(c.peso)}</td><td>${Util.esc(c.moagem)}</td><td class="num">${Util.moeda(c.preco)}</td><td class="num">${c.pedidos.size}</td><td class="num">${c.quantidade}</td><td class="num">${c.kg ? kg(c.kg) : '—'}</td><td class="num">${Util.moeda(c.total)}</td></tr>`).join('') || '<tr><td colspan="8" class="carregando">Sem pedidos no período.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="5">Total</td><td class="num">${totalQtd}</td><td class="num">${kg(totalKg)}</td><td class="num">${Util.moeda(totalValor)}</td></tr></tfoot>
        </table></div>
      </div>

      ${rods.length > 1 ? `
      <div class="relatorio-bloco">
        <h2>Por rodada <button class="botao botao--sec botao--peq" data-csv="rodadas" type="button">CSV</button></h2>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Rodada</th><th class="num">Pedidos</th><th class="num">Pacotes</th><th class="num">Total</th><th class="num">Recebido</th><th class="num">A receber</th></tr></thead>
          <tbody>${rods.map(x => `<tr><td>${Util.esc(x.rodada)}</td><td class="num">${x.pedidos}</td><td class="num">${x.pacotes}</td><td class="num">${Util.moeda(x.total)}</td><td class="num">${Util.moeda(x.recebido)}</td><td class="num">${Util.moeda(x.aReceber)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${r.pedidos}</td><td class="num">${r.pacotes}</td><td class="num">${Util.moeda(r.total)}</td><td class="num">${Util.moeda(r.recebido)}</td><td class="num">${Util.moeda(r.aReceber)}</td></tr></tfoot>
        </table></div>
      </div>` : ''}

      <div class="relatorio-bloco">
        <h2>Pedidos e pagamentos <button class="botao botao--sec botao--peq" data-csv="pedidos" type="button">CSV</button></h2>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Pedido</th><th>Nome</th><th>Itens</th><th class="num">Total</th><th>Status</th><th class="num">Recebido</th></tr></thead>
          <tbody>${lista.map(p => `<tr class="${p.status === 'cancelado' ? 'linha--cancelado' : ''}"><td><span class="ped-id">${Util.esc(p.id)}</span><br><span class="suave">${Util.data(p.criadoEm)}</span></td><td>${Util.esc(p.nome)}<br><span class="suave">${Util.telefone(p.telefone)}</span></td><td><ul class="ped-itens">${p.itens.map(i => `<li>${i.quantidade}× ${Util.esc(descItem(i))}</li>`).join('')}</ul></td><td class="num">${Util.moeda(p.total)}</td><td><span class="selo selo--${p.status}">${Util.STATUS[p.status] || p.status}</span></td><td class="num">${Util.moeda(recebido(p))}</td></tr>`).join('') || '<tr><td colspan="6" class="carregando">Sem pedidos no período.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="num">${Util.moeda(lista.filter(p => p.status !== 'cancelado').reduce((s, p) => s + p.total, 0))}</td><td></td><td class="num">${Util.moeda(r.recebido)}</td></tr></tfoot>
        </table></div>
      </div>`;
  }

  $('relatorio').addEventListener('click', e => {
    const b = e.target.closest('[data-csv]');
    if (!b || !ultimoRelatorio) return;
    const { lista, titulo, cafes, rods } = ultimoRelatorio;
    const nome = nomeArquivo(titulo);
    if (b.dataset.csv === 'cafes') {
      const linhas = [['Café', 'Tamanho', 'Moagem', 'Preço unitário', 'Pedidos', 'Quantidade', 'Peso total (kg)', 'Total']];
      cafes.forEach(c => linhas.push([c.cafe, c.peso, c.moagem, c.preco, c.pedidos.size, c.quantidade, c.kg, c.total]));
      linhas.push(['TOTAL', '', '', '', '', cafes.reduce((s, c) => s + c.quantidade, 0),
        cafes.reduce((s, c) => s + c.kg, 0), cafes.reduce((s, c) => s + c.total, 0)]);
      Util.baixar(`cafes-${nome}.csv`, Util.csv(linhas));
    }
    if (b.dataset.csv === 'rodadas') {
      const linhas = [['Rodada', 'Pedidos', 'Pacotes', 'Total', 'Recebido', 'A receber']];
      rods.forEach(x => linhas.push([x.rodada, x.pedidos, x.pacotes, x.total, x.recebido, x.aReceber]));
      Util.baixar(`rodadas-${nome}.csv`, Util.csv(linhas));
    }
    if (b.dataset.csv === 'pedidos') {
      const linhas = [['Pedido', 'Data', 'Rodada', 'Nome', 'Telefone', 'Café', 'Tamanho', 'Moagem', 'Preço', 'Quantidade', 'Subtotal', 'Status', 'Valor recebido do pedido']];
      lista.forEach(p => p.itens.forEach((i, n) => linhas.push([
        p.id, Util.data(p.criadoEm, true), p.rodada, p.nome, Util.telefone(p.telefone),
        i.cafe, i.peso || '', i.moagem || '', i.preco, i.quantidade, i.subtotal, Util.STATUS[p.status] || p.status, n === 0 ? recebido(p) : ''
      ])));
      Util.baixar(`pedidos-${nome}.csv`, Util.csv(linhas));
    }
  });

  /* ---------- Cafés ---------- */

  function renderCafes() {
    $('lista-cafes').innerHTML = dados.cafes.map(linhaCafe).join('') || '<p class="suave">Nenhum café cadastrado.</p>';
  }

  const MOAGENS = ['Em grãos', 'Moído'];

  function linhaCafe(c) {
    const v = k => Util.esc(c[k] === undefined ? '' : c[k]);
    const extras = (c.moagens || []).filter(m => !MOAGENS.includes(m));
    return `
      <div class="item-cafe ${c.ativo ? '' : 'item-cafe--inativo'}" data-id="${v('id')}">
        <div class="campo campo--nome"><label>Nome</label><input data-k="nome" value="${v('nome')}" placeholder="Nome do café"></div>
        <div class="campo"><label>Torrefação</label><input data-k="torrefacao" value="${v('torrefacao')}"></div>
        <div class="item-cafe__acoes">
          <label class="check"><input data-k="ativo" type="checkbox" ${c.ativo ? 'checked' : ''}> Ativo</label>
        </div>
        <div class="campo campo--desc"><label>Descrição</label><input data-k="descricao" value="${v('descricao')}" placeholder="Notas, origem, processo…"></div>
        <div class="campo">
          <span class="rotulo">Tamanhos e preços</span>
          <div class="tamanhos">
            ${(c.tamanhos || []).map(linhaTamanho).join('')}
          </div>
          <button class="link-acao" data-add-tamanho type="button">+ tamanho</button>
        </div>
        <div class="campo">
          <span class="rotulo">Moagens disponíveis</span>
          ${MOAGENS.concat(extras).map(m => `<label class="check"><input type="checkbox" data-moagem value="${Util.esc(m)}" ${(c.moagens || []).includes(m) ? 'checked' : ''}> ${Util.esc(m)}</label>`).join('')}
        </div>
        <div class="item-cafe__acoes item-cafe__ordem">
          <button class="botao botao--sec botao--peq" data-mover="-1" type="button" title="Subir">↑</button>
          <button class="botao botao--sec botao--peq" data-mover="1" type="button" title="Descer">↓</button>
          <button class="botao botao--perigo botao--peq" data-remover type="button" title="Remover">✕</button>
        </div>
      </div>`;
  }

  function linhaTamanho(t) {
    return `
      <div class="tamanho">
        <input class="entrada" data-t="peso" value="${Util.esc(t.peso)}" placeholder="250 g" aria-label="Tamanho">
        <input class="entrada" data-t="preco" type="number" step="0.01" min="0" inputmode="decimal" value="${Util.esc(t.preco)}" placeholder="Preço R$" aria-label="Preço">
        <button class="botao botao--perigo botao--peq" data-remover-tamanho type="button" title="Remover tamanho">✕</button>
      </div>`;
  }

  function lerCafesDaTela() {
    return [...document.querySelectorAll('.item-cafe')].map(el => {
      const c = { id: el.dataset.id };
      el.querySelectorAll('[data-k]').forEach(i => { c[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; });
      c.tamanhos = [...el.querySelectorAll('.tamanho')].map(t => ({
        peso: t.querySelector('[data-t="peso"]').value.trim(),
        preco: t.querySelector('[data-t="preco"]').value === '' ? '' : Number(t.querySelector('[data-t="preco"]').value)
      }));
      c.moagens = [...el.querySelectorAll('[data-moagem]:checked')].map(i => i.value);
      return c;
    });
  }

  $('add-cafe').addEventListener('click', () => {
    dados.cafes = lerCafesDaTela();
    dados.cafes.push({
      id: '', nome: '', torrefacao: '', descricao: '', ativo: true,
      tamanhos: [{ peso: '250 g', preco: '' }, { peso: '1 kg', preco: '' }], moagens: MOAGENS.slice()
    });
    renderCafes();
    const ultimo = [...document.querySelectorAll('.item-cafe')].pop();
    ultimo.querySelector('input').focus();
  });

  $('lista-cafes').addEventListener('click', e => {
    const item = e.target.closest('.item-cafe');
    if (!item) return;
    const lista = lerCafesDaTela();
    const i = [...document.querySelectorAll('.item-cafe')].indexOf(item);
    if (e.target.closest('[data-add-tamanho]')) {
      item.querySelector('.tamanhos').insertAdjacentHTML('beforeend', linhaTamanho({ peso: '', preco: '' }));
      item.querySelector('.tamanho:last-child input').focus();
      return;
    }
    if (e.target.closest('[data-remover-tamanho]')) {
      e.target.closest('.tamanho').remove();
      return;
    }
    if (e.target.closest('[data-remover]')) {
      if (!confirm(`Remover "${lista[i].nome || 'café sem nome'}"? Pedidos antigos não são afetados.`)) return;
      lista.splice(i, 1);
    } else if (e.target.closest('[data-mover]')) {
      const j = i + Number(e.target.closest('[data-mover]').dataset.mover);
      if (j < 0 || j >= lista.length) return;
      [lista[i], lista[j]] = [lista[j], lista[i]];
    } else {
      return;
    }
    dados.cafes = lista;
    renderCafes();
  });

  $('lista-cafes').addEventListener('change', e => {
    if (e.target.dataset.k === 'ativo') e.target.closest('.item-cafe').classList.toggle('item-cafe--inativo', !e.target.checked);
  });

  $('salvar-cafes').addEventListener('click', async () => {
    const lista = lerCafesDaTela();
    if (lista.some(c => !c.nome.trim())) return Util.aviso('Todo café precisa de um nome.', 'erro');
    for (const c of lista) {
      if (!c.tamanhos.length) return Util.aviso(`${c.nome}: adicione pelo menos um tamanho.`, 'erro');
      if (c.tamanhos.some(t => !t.peso || !(t.preco > 0))) return Util.aviso(`${c.nome}: todo tamanho precisa de peso e preço maior que zero.`, 'erro');
      if (new Set(c.tamanhos.map(t => t.peso)).size < c.tamanhos.length) return Util.aviso(`${c.nome}: há tamanhos repetidos.`, 'erro');
      if (!c.moagens.length) return Util.aviso(`${c.nome}: marque pelo menos uma moagem.`, 'erro');
    }
    $('salvar-cafes').disabled = true;
    try {
      dados.cafes = await chamar('admin.salvarCafes', { cafes: lista });
      renderCafes();
      Util.aviso('Cafés salvos! O site já mostra os novos preços.');
    } catch (err) {
      Util.aviso(err.message, 'erro');
    } finally {
      $('salvar-cafes').disabled = false;
    }
  });

  /* ---------- Configurações ---------- */

  function preencherConfig() {
    const f = $('form-config');
    Object.keys(dados.config).forEach(k => {
      const campo = f.elements[k];
      if (!campo) return;
      if (campo.type === 'checkbox') campo.checked = dados.config[k] === 'sim';
      else campo.value = dados.config[k] || '';
    });
  }

  $('form-config').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const config = {};
    [...f.elements].forEach(el => {
      if (!el.name) return;
      config[el.name] = el.type === 'checkbox' ? (el.checked ? 'sim' : 'não') : el.value.trim();
    });
    try {
      dados.config = await chamar('admin.salvarConfig', { config });
      preencherRodadas();
      renderPedidos();
      Util.aviso('Configurações salvas.');
    } catch (err) {
      Util.aviso(err.message, 'erro');
    }
  });

  /* ---------- Início ---------- */

  if (Api.demo) $('faixa-demo').classList.remove('oculto');
  senha = lerSessao();
  if (senha) entrar().catch(() => { gravarSessao(''); senha = ''; });
})();
