# Cafezeiros SJC — Encomendas de café

Site para a compra coletiva mensal do grupo: as pessoas escolhem os cafés, enviam o pedido e
pagam via PIX (QR Code e copia-e-cola já com o valor exato). A organização acompanha tudo
num painel com relatórios por período.

- **`index.html`**: página de encomenda (pública)
- **`admin.html`**: painel da organização (protegido por senha)
- **`apps-script/Code.gs`**: banco de dados (Google Planilhas + Google Apps Script)

Sem nada configurado, o site roda em **modo demonstração**: os dados ficam só no navegador e a
senha do painel é `cafe`. Serve para testar antes de publicar.

## O que o painel faz

- **Pedidos**: lista por rodada (mês), busca por nome/telefone, status do pagamento
  (Aguardando PIX → PIX informado → Pago/confirmado, ou Cancelado), valor recebido
  (avisa se for diferente do total), link direto para o WhatsApp da pessoa, exportação CSV.
- **Relatórios**: escolha uma rodada ou um intervalo de datas (atalhos: mês atual, mês anterior,
  últimos 3 meses, ano, tudo) e veja:
  - total por café (quantidade e valor — é a lista para passar ao torrador);
  - total por rodada, quando o período tem mais de um mês;
  - pedidos e pagamentos, com total previsto, recebido e a receber.
  Tudo pode ser exportado em CSV (abre no Excel) ou impresso/salvo em PDF.
- **Cafés e preços**: cadastro, ordem, ativar/desativar. Cada pedido guarda o preço do
  momento da compra, então mudar o preço não altera pedidos antigos.
- **Configurações**: nome da rodada, abrir/fechar encomendas, prazo, aviso, chave PIX e
  WhatsApp da organização (para receber comprovantes).

## Instalação (uma vez só, ~15 minutos)

### 1. Banco de dados (Google Planilhas)

1. Crie uma planilha nova no Google Drive (ex.: "Cafezeiros SJC — Pedidos").
2. Menu **Extensões → Apps Script**. Apague o conteúdo do arquivo `Código.gs` e cole todo o
   conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs). Salve.
3. Na lista de funções (ao lado de "Depurar"), escolha **`configurar`** e clique em
   **Executar**. Autorize o acesso quando o Google pedir. Isso cria as abas
   `Pedidos`, `Itens`, `Cafes` e `Config`.
4. Defina a senha do painel: **Configurações do projeto** (ícone de engrenagem) →
   **Propriedades do script** → edite `ADMIN_SENHA` (começa como `troque-esta-senha`).
5. **Implantar → Nova implantação** → tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**

   Copie a **URL do app da Web** (termina em `/exec`).

> Ao alterar o `Code.gs` no futuro, use **Implantar → Gerenciar implantações → Editar →
> Nova versão** para manter a mesma URL.

### 2. Ligar o site ao banco

Abra [`js/config.js`](js/config.js) e cole a URL:

```js
window.CAFEZEIROS_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/……/exec'
};
```

### 3. Publicar o site (GitHub Pages, gratuito)

No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, escolha a
branch `main` e a pasta `/ (root)`. Em alguns minutos o site fica em
`https://<seu-usuário>.github.io/cafezeirossjc/` e o painel em `…/admin.html`.

### 4. Primeiro uso

Entre no painel, vá em **Configurações** (rodada, chave PIX, nome e cidade do recebedor,
WhatsApp) e em **Cafés e preços** (troque os cafés de exemplo pelos de verdade).

## Rotina mensal

1. **Configurações**: mude o nome da rodada (ex.: `Dezembro/2026`), o prazo e marque
   "Encomendas abertas". Atualize cafés e preços se mudaram.
2. Divulgue o link no grupo.
3. Confira os PIX no extrato e clique em **Confirmar PIX** em cada pedido.
4. No prazo, desmarque "Encomendas abertas" e use **Relatórios → Total por café** para
   fazer o pedido ao torrador.

## Sobre a chave PIX

O QR Code é um PIX estático com valor e número do pedido. Cadastre a chave assim:
telefone com `+55` e DDD (`+5512999998888`), CPF/CNPJ só com números, e-mail ou chave
aleatória como aparecem no banco.

## Os dados

A planilha é o banco de dados: dá para abrir, filtrar e criar tabelas dinâmicas direto nela.
A aba `Itens` tem uma linha por café de cada pedido, ideal para tabelas dinâmicas.
Evite renomear abas ou colunas.
