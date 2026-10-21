// Funções utilitárias compartilhadas pelo site de encomendas e pelo painel.
const Util = (() => {
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const STATUS = {
    aguardando: 'Aguardando PIX',
    informado: 'PIX informado',
    confirmado: 'Pago (confirmado)',
    cancelado: 'Cancelado'
  };

  function moeda(v) {
    return brl.format(Number(v) || 0);
  }

  function data(v, comHora) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    const op = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' };
    if (comHora) Object.assign(op, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('pt-BR', op);
  }

  function rodadaPadrao(d = new Date()) {
    return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
  }

  function telefone(t) {
    const n = String(t || '').replace(/\D/g, '');
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return n;
  }

  function whatsappLink(t, texto = '') {
    let n = String(t || '').replace(/\D/g, '');
    if (n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // CSV com ";" e vírgula decimal, que o Excel em português abre direto.
  function csv(linhas) {
    return '﻿' + linhas.map(l => l.map(c => {
      let v = typeof c === 'number' ? String(c).replace('.', ',') : String(c === undefined || c === null ? '' : c);
      if (/[";\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    }).join(';')).join('\r\n');
  }

  function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      const ta = Object.assign(document.createElement('textarea'), { value: texto });
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function aviso(msg, tipo = 'ok') {
    let el = document.getElementById('toast');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'toast', role: 'status' });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `toast toast--${tipo} toast--visivel`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('toast--visivel'), 3500);
  }

  return { moeda, data, rodadaPadrao, telefone, whatsappLink, esc, csv, baixar, copiar, aviso, STATUS, MESES };
})();
