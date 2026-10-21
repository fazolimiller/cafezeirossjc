// Página pública de encomendas.
(() => {
  const $ = id => document.getElementById(id);
  const CHAVE_CLIENTE = 'cafezeiros-cliente';
  const CHAVE_ULTIMO = 'cafezeiros-ultimo-pedido';

  let config = {};
  let cafes = [];
  const quantidades = {};

  function lerLocal(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
  }
  function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* ignora */ }
  }

  async function iniciar() {
    if (Api.demo) $('faixa-demo').classList.remove('oculto');
    const cliente = lerLocal(CHAVE_CLIENTE);
    if (cliente) {
      $('nome').value = cliente.nome || '';
      $('telefone').value = cliente.telefone || '';
    }
    try {
      const dados = await Api.chamar('publico');
      config = dados.config;
      cafes = dados.cafes;
    } catch (e) {
      $('cafes').innerHTML = `<p class="erro">Não foi possível carregar os cafés: ${Util.esc(e.message)}</p>`;
      $('estado').textContent = 'Indisponível';
      return;
    }
    mostrarCabecalho();
    mostrarCafes();
    atualizarCarrinho();

    const ultimo = lerLocal(CHAVE_ULTIMO);
    if (ultimo && ultimo.rodada === config.rodada && location.hash === '#pedido') mostrarConfirmacao(ultimo);
  }

  function aberto() {
    return config.pedidosAbertos === 'sim';
  }

  function mostrarCabecalho() {
    $('rodada-titulo').textContent = config.rodada;
    document.title = `Encomenda ${config.rodada} · Cafezeiros SJC`;
    $('estado').textContent = aberto() ? 'Encomendas abertas' : 'Encomendas fechadas no momento';
    $('estado').classList.toggle('estado--fechado', !aberto());
    $('prazo').textContent = config.prazo ? `Pedidos até ${config.prazo}` : '';
    if (config.aviso) {
      $('aviso').textContent = config.aviso;
      $('aviso').classList.remove('oculto');
    }
    if (!aberto()) {
      $('enviar').disabled = true;
      $('enviar').textContent = 'Encomendas fechadas';
    }
  }

  function mostrarCafes() {
    if (!cafes.length) {
      $('cafes').innerHTML = '<p class="carregando">Nenhum café disponível nesta rodada.</p>';
      return;
    }
    $('cafes').innerHTML = cafes.map(c => `
      <article class="cafe" data-id="${Util.esc(c.id)}">
        ${c.torrefacao ? `<span class="cafe__torra">${Util.esc(c.torrefacao)}</span>` : ''}
        <h3>${Util.esc(c.nome)}</h3>
        <p class="cafe__desc">${Util.esc(c.descricao)}</p>
        <div class="cafe__rodape">
          <span class="cafe__preco">${Util.moeda(c.preco)}<span class="cafe__peso">${Util.esc(c.peso)}</span></span>
          <span class="qtd" role="group" aria-label="Quantidade de ${Util.esc(c.nome)}">
            <button type="button" data-acao="-" aria-label="Diminuir" ${aberto() ? '' : 'disabled'}>−</button>
            <output aria-live="polite">0</output>
            <button type="button" data-acao="+" aria-label="Aumentar" ${aberto() ? '' : 'disabled'}>+</button>
          </span>
        </div>
      </article>`).join('');
  }

  $('cafes').addEventListener('click', e => {
    const botao = e.target.closest('button[data-acao]');
    if (!botao) return;
    const card = botao.closest('.cafe');
    const id = card.dataset.id;
    const atual = quantidades[id] || 0;
    const nova = Math.max(0, Math.min(50, atual + (botao.dataset.acao === '+' ? 1 : -1)));
    quantidades[id] = nova;
    card.querySelector('output').textContent = nova;
    card.classList.toggle('cafe--selecionado', nova > 0);
    atualizarCarrinho();
  });

  function itensEscolhidos() {
    return cafes.filter(c => quantidades[c.id] > 0).map(c => ({ cafe: c, quantidade: quantidades[c.id] }));
  }

  function atualizarCarrinho() {
    const itens = itensEscolhidos();
    $('carrinho-itens').innerHTML = itens.map(i =>
      `<li><span>${i.quantidade}× ${Util.esc(i.cafe.nome)}</span><span>${Util.moeda(i.cafe.preco * i.quantidade)}</span></li>`).join('');
    $('carrinho-vazio').classList.toggle('oculto', itens.length > 0);
    $('carrinho-total').textContent = Util.moeda(itens.reduce((s, i) => s + i.cafe.preco * i.quantidade, 0));
  }

  $('telefone').addEventListener('input', e => {
    const n = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = n.length > 6 ? `(${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`
      : n.length > 2 ? `(${n.slice(0, 2)}) ${n.slice(2)}` : n;
  });

  $('form-pedido').addEventListener('submit', async e => {
    e.preventDefault();
    $('erro').textContent = '';
    const itens = itensEscolhidos();
    const nome = $('nome').value.trim();
    const telefone = $('telefone').value;
    if (!itens.length) return ($('erro').textContent = 'Escolha pelo menos um café.');
    if (!nome) return ($('erro').textContent = 'Informe seu nome.');
    if (telefone.replace(/\D/g, '').length < 10) return ($('erro').textContent = 'Informe o WhatsApp com DDD.');

    $('enviar').disabled = true;
    $('enviar').textContent = 'Enviando…';
    try {
      const pedido = await Api.chamar('criarPedido', {
        nome, telefone, observacoes: $('observacoes').value,
        itens: itens.map(i => ({ cafeId: i.cafe.id, quantidade: i.quantidade }))
      });
      gravarLocal(CHAVE_CLIENTE, { nome, telefone });
      gravarLocal(CHAVE_ULTIMO, pedido);
      mostrarConfirmacao(pedido);
    } catch (err) {
      $('erro').textContent = err.message;
    } finally {
      $('enviar').disabled = !aberto();
      $('enviar').textContent = 'Enviar pedido';
    }
  });

  function mostrarConfirmacao(pedido) {
    $('tela-loja').classList.add('oculto');
    $('tela-confirmacao').classList.remove('oculto');
    location.hash = 'pedido';
    $('conf-id').textContent = pedido.id;
    $('conf-rodada').textContent = pedido.rodada;
    $('conf-nome').textContent = `${pedido.nome} · ${Util.telefone(pedido.telefone)}`;
    $('conf-itens').innerHTML = pedido.itens.map(i => `
      <tr><td>${Util.esc(i.cafe)}</td><td class="num">${i.quantidade}</td>
      <td class="num">${Util.moeda(i.preco)}</td><td class="num">${Util.moeda(i.subtotal)}</td></tr>`).join('');
    $('conf-total').textContent = Util.moeda(pedido.total);
    $('pix-valor').textContent = Util.moeda(pedido.total);

    const temChave = !!(config.pixChave || '').trim();
    $('pix-sem-chave').classList.toggle('oculto', temChave);
    $('pix-qr').innerHTML = '';
    $('pix-qr').classList.toggle('oculto', !temChave);
    if (temChave) {
      const codigo = Pix.copiaECola({
        chave: config.pixChave, nome: config.pixNome, cidade: config.pixCidade,
        valor: pedido.total, txid: pedido.id
      });
      $('pix-copia').value = codigo;
      $('pix-dados').innerHTML = `Chave: <strong>${Util.esc(config.pixChave)}</strong><br>${Util.esc(config.pixNome)}`;
      if (window.QRCode) {
        new QRCode($('pix-qr'), { text: codigo, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
      }
    }

    const ja = pedido.status && pedido.status !== 'aguardando';
    $('ja-paguei').disabled = ja;
    $('ja-paguei').textContent = ja ? 'Pagamento informado ✓' : 'Já fiz o PIX';

    if (config.whatsapp) {
      const texto = `Olá! Segue o comprovante do PIX do pedido ${pedido.id} (${pedido.rodada}) — ${pedido.nome} — ${Util.moeda(pedido.total)}.`;
      $('enviar-whats').href = Util.whatsappLink(config.whatsapp, texto);
      $('enviar-whats').classList.remove('oculto');
    }
    window.scrollTo({ top: $('tela-confirmacao').offsetTop - 16, behavior: 'smooth' });

    $('ja-paguei').onclick = async () => {
      $('ja-paguei').disabled = true;
      try {
        await Api.chamar('informarPagamento', { id: pedido.id, telefone: pedido.telefone });
        pedido.status = 'informado';
        gravarLocal(CHAVE_ULTIMO, pedido);
        $('ja-paguei').textContent = 'Pagamento informado ✓';
        Util.aviso('Obrigado! A organização vai conferir o PIX.');
      } catch (err) {
        $('ja-paguei').disabled = false;
        Util.aviso(err.message, 'erro');
      }
    };
  }

  $('copiar-pix').addEventListener('click', async () => {
    const ok = await Util.copiar($('pix-copia').value);
    Util.aviso(ok ? 'Código PIX copiado!' : 'Não foi possível copiar.', ok ? 'ok' : 'erro');
  });

  $('novo-pedido').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    $('tela-confirmacao').classList.add('oculto');
    $('tela-loja').classList.remove('oculto');
    Object.keys(quantidades).forEach(k => { quantidades[k] = 0; });
    mostrarCafes();
    atualizarCarrinho();
    $('observacoes').value = '';
  });

  iniciar();
})();
