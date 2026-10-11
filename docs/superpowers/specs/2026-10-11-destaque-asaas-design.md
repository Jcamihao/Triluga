# Destaque pago via Asaas (PIX no app) — design

Data: 2026-10-11 · Status: aguardando revisão do dono

## Objetivo

Trocar o EfiPay pelo **Asaas** na cobrança do **destaque de anúncio**, mantendo a experiência atual (QR Code + copia-e-cola dentro do app) e removendo o EfiPay por completo.

Sucesso = o anunciante gera o PIX, paga, e o destaque ativa sozinho via webhook seguro, sem nenhum caminho manual silencioso.

## Contexto (verificado no código em 2026-10-11)

- Hoje só existe cobrança avulsa de destaque: 3 planos fixos em `featured.constants.ts` (7 dias R$ 29,90 · 15 dias R$ 49,90 · 30 dias R$ 89,90). Não há assinatura nem limite por conta, e isso **não muda**.
- `EfipayService` gera cobrança PIX; se o EfiPay não está configurado, cai em **chave PIX estática com ativação manual** (e-mail de alerta ao admin).
- `FeaturedService.handlePixWebhook` só valida o token **se ele estiver configurado** — sem token, qualquer chamada ativa pedidos.
- Ativação manual pelo admin já existe (`PATCH /admin/featured-orders/:id/activate`) e permanece.
- `Profile.documentNumber` (CPF/CNPJ) é **nullable** no schema; o cadastro novo exige, contas antigas ou editadas podem não ter.
- O Lumen usa Asaas para assinatura recorrente (`Lumen/backend/src/billing/asaas-client.ts`). A máquina de assinatura não se aplica aqui; reaproveita-se só o padrão do cliente HTTP (retry, timeout), da config e do webhook com token.

## Fora do escopo

Assinatura recorrente, cartão de crédito, checkout hospedado, limites de conta grátis, reembolso self-service, refatorar a duplicação entre `doActivateOrder` e `AdminService.activateFeaturedOrder`.

## Design

### 1. Remoção do EfiPay

- Remover `featured/efipay.service.ts`, `config/efipay.config.ts` (e o registro em `app.module.ts`), o provider em `featured.module.ts` e a dependência `sdk-typescript-apis-efi` (`backend/package.json` + lockfile).
- Remover o **fallback de chave PIX estática** e o e-mail `sendFeaturedOrderStaticPixAlert`. Sem Asaas configurado, `POST /featured/orders` responde **503** com mensagem clara.
- Frontend: remover o ramo "chave estática" (`pixKey`, `pixKeyType`, `instructions` de caso manual) de `owner-dashboard-list.component.html`, do modelo em `domain.models.ts` e o comentário "Efipay" em `vehicle-wizard.component.html`.
- README: trocar as menções a EfiPay por Asaas.
- Notas de versões antigas em `docs/releases/` ficam como estão (histórico).

### 2. Cobrança (`AsaasClient` + `FeaturedService.createOrder`)

- `backend/src/featured/asaas.client.ts` (+ `config/asaas.config.ts`), copiado do padrão do Lumen, com **só** estes métodos: `findCustomerByExternalReference`, `createCustomer`, `createPixPayment`, `getPixQrCode`, `deletePayment`. Retry de 3 tentativas e timeout configurável, como no Lumen.
- Fluxo de `createOrder(userId, dto)`:
  1. Mantém as validações atuais (plano válido, veículo ativo do usuário, sem destaque ativo/pendente).
  2. Exige `profile.documentNumber`; se ausente, **400** "Complete seu CPF/CNPJ no perfil para pagar o destaque."
  3. Acha ou cria o cliente Asaas com `externalReference = userId` (nome, CPF/CNPJ, e-mail do cadastro).
  4. Cria cobrança PIX: `billingType: PIX`, `value` do plano, `dueDate` = hoje + 1 dia, `description`, `externalReference = orderId`.
  5. Busca o QR (`/payments/{id}/pixQrCode`) → `payload` (copia-e-cola) e `encodedImage` (base64 puro; o backend monta o `data:image/png;base64,...` para o front — **formato a confirmar no sandbox**, já que não foi testado ainda).
  6. Grava o pedido com `paymentId` e `pixCopiaECola`.
- Ordem para não deixar lixo: criar o pedido `PENDING` **antes** de chamar o Asaas (precisa do `orderId` como `externalReference`); se a chamada ao Asaas falhar, marcar o pedido `CANCELLED` e responder 502/503.
- Resposta ao front mantém `payment.pixCopiaECola` e `payment.qrCodeImage`.
- `cancelOrder` de pedido `PENDING` também chama `deletePayment` no Asaas, **sem falhar** se a cobrança já não existir (erro logado, pedido cancelado mesmo assim).

### 3. Webhook

- `POST /featured/webhook/asaas`, `@Public()` (a rota já fica fora de CSRF por esse decorator).
- Valida o header `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN`. **Token não configurado ou diferente → 403** (falha fechada; corrige a falha atual).
- Eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`: localiza o pedido por `payment.externalReference` (orderId), com fallback por `paymentId`.
- Ativa **só se** o pedido está `PENDING` (idempotente: reentrega do mesmo evento não reativa) **e** `payment.value` é igual a `order.price`. Divergência de valor → não ativa, loga erro com orderId e valores.
- Eventos desconhecidos ou pedido inexistente → 200 `{ ok: true, activated: 0 }` (Asaas não deve reenviar sem fim).
- A rota antiga `/featured/webhook/pix` é removida.

### 4. Banco (uma migration)

- `FeaturedOrder.txid` → renomeado para `paymentId` (preserva histórico; continua `@unique`).
- `FeaturedOrder.pixKey` removida (só existia para o fallback estático).
- Pedidos `PENDING` existentes viram `CANCELLED` na própria migration (foram criados sem cobrança Asaas e nunca poderiam ser confirmados pelo webhook novo).
- Segue o fluxo de migrations do projeto (`prisma migrate`), sem `db push`.

### 5. Configuração

Novas variáveis (documentar em `.env.example` e no README): `ASAAS_API_KEY`, `ASAAS_BASE_URL` (padrão sandbox `https://api-sandbox.asaas.com/v3`), `ASAAS_WEBHOOK_TOKEN`, `ASAAS_TIMEOUT_MS` (padrão 10000). Variáveis `EFIPAY_*` são removidas de qualquer exemplo/doc.

## Testes

- `asaas.client.spec.ts`: monta o corpo certo de cada chamada, mapeia erro HTTP em erro do cliente, faz retry em falha transitória.
- `featured.service.spec.ts` com cliente Asaas falso: criar pedido (caminho feliz), sem CPF/CNPJ, falha do Asaas cancela o pedido, cancelar apaga cobrança (e tolera falha), webhook com token ausente/inválido/válido, reentrega do mesmo evento, valor divergente, pedido já ativo, evento desconhecido.
- Verificação final: type-check, `lint:ci`, build do front, testes do backend verdes.

## Produção (decisões de vocês, não bloqueiam o desenvolvimento)

1. Chave Asaas de **sandbox** para validar o fluxo de ponta a ponta antes de produção.
2. Conta de produção do Asaas: decidir CPF ou MEI/CNPJ (mesma pendência do Lumen).
3. Definir os 3 segredos na VPS e cadastrar o webhook no painel do Asaas apontando para `/api/v1/featured/webhook/asaas` com o mesmo token.
4. O deploy continua manual; o agente de infra aplica a migration (`prisma migrate deploy`).

## Limitações aceitas

- Cobrança PIX do Asaas expira no vencimento; pedido `PENDING` com cobrança vencida só sai de `PENDING` por cancelamento do usuário (não há rotina de expiração automática nesta entrega).
- Usuário sem CPF/CNPJ no perfil precisa completá-lo antes de pagar.
- Teste real do webhook só é possível com túnel público ou em produção; antes disso a cobertura vem dos testes com cliente falso.
