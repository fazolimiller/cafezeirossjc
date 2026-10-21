// Gera o "PIX copia e cola" (BR Code estático, padrão do Banco Central)
// já com o valor do pedido e o número do pedido como identificador.
const Pix = (() => {
  function campo(id, valor) {
    return id + String(valor.length).padStart(2, '0') + valor;
  }

  // Remove acentos e caracteres fora do padrão do BR Code.
  function normalizar(texto, max) {
    return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 .\-]/g, '')
      .toUpperCase().trim().slice(0, max);
  }

  function crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  // E-mail e chave aleatória vão como estão; telefone deve ser cadastrado com +55
  // (ex.: +5512999998888); qualquer outra coisa é tratada como CPF/CNPJ (só dígitos).
  function normalizarChave(chave) {
    const c = String(chave || '').trim();
    if (c.includes('@') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(c)) return c;
    if (c.startsWith('+')) return '+' + c.replace(/\D/g, '');
    return c.replace(/\D/g, '');
  }

  function copiaECola({ chave, nome, cidade, valor, txid }) {
    const conta = campo('00', 'br.gov.bcb.pix') + campo('01', normalizarChave(chave));
    const id = String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
    let payload =
      campo('00', '01') +
      campo('26', conta) +
      campo('52', '0000') +
      campo('53', '986') +
      (valor ? campo('54', Number(valor).toFixed(2)) : '') +
      campo('58', 'BR') +
      campo('59', normalizar(nome, 25) || 'CAFEZEIROS SJC') +
      campo('60', normalizar(cidade, 15) || 'SAO JOSE DOS CA') +
      campo('62', campo('05', id)) +
      '6304';
    return payload + crc16(payload);
  }

  return { copiaECola, crc16 };
})();
