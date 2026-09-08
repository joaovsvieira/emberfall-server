# Loja Pix — ativação do vendedor

Implementação Mercado Pago **Payments API** (`POST /v1/payments`). Produto `premium-10`: **10 cristais por R$ 0,01**, definido no servidor. Cristais pertencem à conta e são separados do gold. Colyseus continua responsável pelas partidas, não pelo processamento financeiro.

## Para funcionar de verdade

1. Tenha uma conta de vendedor brasileira no Mercado Pago, conclua as verificações exigidas e cadastre uma chave Pix. Crie uma aplicação em **Suas integrações**, usando Checkout API/Payments.
2. Obtenha o Access Token privado da aplicação. Configure notificações **Payments/pagamentos**, com a URL `https://emberfall-server.onrender.com/payments/mercadopago/webhook`, e obtenha a assinatura secreta. Esta integração não usa os eventos Orders.
3. No Render, serviço Emberfall → **Environment**, configure:

| Variável | Valor |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token privado do vendedor |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta das notificações |
| `PIX_WEBHOOK_URL` | `https://emberfall-server.onrender.com/payments/mercadopago/webhook` |
| `PIX_LIVE_MODE` | `true` para credenciais de produção e recebimentos reais |

Não compartilhe os valores secretos no chat, GitHub ou frontend. Salve as variáveis e aguarde o serviço reiniciar.

4. Na loja, informe e-mail e CPF do pagador, gere a cobrança, confira **R$ 0,01** no aplicativo bancário e pague. Use um comprador diferente do vendedor na validação. Confira o pagamento no painel do Mercado Pago e **+10 cristais** no jogo. Recarregar/consultar novamente não pode duplicar o crédito.
5. O dinheiro é recebido na **conta Mercado Pago vinculada ao Access Token**, conforme tarifas e disponibilidade dessa conta. Depois pode ser transferido para sua conta bancária.

**Ainda não houve transação financeira real nesta entrega:** faltam as credenciais do vendedor. A documentação consultada não permitiu confirmar se esta conta/produto aceita **R$ 0,01**. O preço pedido foi mantido exatamente. Se o provedor recusar, nenhuma cobrança maior será gerada automaticamente: confirmar o mínimo e autorizar outro preço ou provedor. O valor líquido depende das tarifas do vendedor; confirme no painel.

## Confirmação, testes e recuperação

- Sem token/segredo a loja informa que aguarda configuração e não gera cobranças falsas.
- `PIX_LIVE_MODE` ausente/false significa teste. Pagamentos com `live_mode=false` nunca concedem moeda real. O ambiente do pagamento deve coincidir com o pedido.
- Valor, quantidade e conta são determinados no servidor. O CPF é enviado ao Mercado Pago, sem persistir no banco do jogo. Não guardamos dados bancários do comprador.
- Cada tentativa usa UUID v4 como `X-Idempotency-Key`. Após falha de geração, repita com os mesmos dados. Depois de F5, use **Consultar** nas cobranças recentes antes de criar outra. Busca por referência recupera cobranças cuja resposta inicial se perdeu.
- Webhook valida HMAC SHA-256 com `data.id`, `x-request-id` e timestamp (tolerância 10 minutos), e consulta o pagamento na API oficial. Ele não precisa de sessão do jogo.
- Só `approved`, valor exato, BRL, Pix, referência e ambiente corretos concedem cristais. Dados do navegador/comprovantes não confirmam pagamento.
- Consulta autenticada pelo comprador também revalida, recuperando webhook perdido. Pedidos de outras contas não são expostos.
- Saldo e marcador de concessão são atômicos em `D1.batch`. Duplicatas não concedem duas vezes. Observações antigas não substituem as novas; estorno/chargeback revoga o crédito uma vez e impede nova concessão nesse pedido.
- Ainda não há gasto de cristais. Antes de vender cosméticos, definir política de dívida/revogação de itens após estorno. Há limite de dez cobranças por hora/conta e limite de solicitações da API.
- Logs não incluem token, CPF ou resposta completa do provedor. Preço/quantidade ficam como snapshot no pedido; novos produtos devem usar catálogo versionado no servidor.

Os testes locais incluem HTTP com provedor simulado, assinaturas, valor/ambiente, isolamento e crédito idempotente. Não comprovam aprovação comercial, tarifas, mínimo nem recebimento bancário real.

Referências: [Pix na Payments API](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/payment-brick/payment-submission/pix), [assinatura de notificações](https://www.mercadopago.com.br/developers/en/docs/checkout-pro/additional-settings/optional-notifications), [exemplo oficial Node/Pix](https://github.com/mercadopago/pix-payment-sample-node).
