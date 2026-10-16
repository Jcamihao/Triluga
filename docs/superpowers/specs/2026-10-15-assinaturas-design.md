# Assinaturas do Triluga — design

Data: 2026-10-15 · Status: aguardando revisão do dono

## 1. Objetivo

Limitar a conta grátis a **3 anúncios** e vender **dois planos pagos** (mais anúncios), cobrados por **assinatura recorrente no cartão** via Asaas. O destaque de anúncio continua como compra avulsa por PIX, sem mudança.

Sucesso = quem tem mais de 3 anúncios para publicar consegue assinar sozinho, o limite é aplicado no servidor, a renovação acontece sem intervenção, e nenhum anúncio já publicado some por causa de um plano.

## 2. Decisões tomadas (com o dono, 2026-10-15)

| Tema | Decisão |
|---|---|
| Conta grátis | 3 anúncios (ativos e publicados) |
| O que a assinatura vende | **Só mais anúncios.** Sem destaques incluídos, selo ou estatísticas extras |
| Planos pagos | **2** (Profissional e Frota), cada um mensal ou anual |
| Pagamento | **Só cartão**, renovação automática, checkout hospedado do Asaas (o app nunca vê CPF ou cartão) |
| Excedente | Anúncios acima do limite **continuam no ar**; o limite só impede **criar e reativar** |
| Abordagem | Adaptar o billing do Lumen, enxuto (`Lumen/docs/superpowers/specs/2026-09-27-billing-design.md`) |
| Ligação | Flag `BILLING_ENABLED`, **desligada** até o dono decidir |

## 3. Fora do escopo

Trial, plano compartilhado/membros, cota de IA, destaques incluídos no plano, PIX recorrente, trocar mensal↔anual direto (cancelar e assinar de novo resolve), reembolso self-service (manual pelo painel do Asaas), mudar a cobrança avulsa do destaque.

## 4. Catálogo (valores PROVISÓRIOS — o dono define)

| Plano | Anúncios | Mensal | Anual |
|---|---|---|---|
| Grátis | 3 | — | — |
| Profissional | até 10 | R$ 29,90 | R$ 299,00 |
| Frota | ilimitado | R$ 79,90 | R$ 799,00 |

Limites e preços ficam no catálogo e podem ser sobrescritos por configuração (`BILLING_PRICE_*`); nada fixo na lógica. Anual = 10 meses.

## 5. Arquitetura

Módulo novo `backend/src/billing/`, com o mesmo princípio do Lumen: **o resto do app só pergunta ao `EntitlementsService`; ele não conhece o Asaas.**

| Peça | Faz | Depende de |
|---|---|---|
| Catálogo | Planos, limites, preços | nada |
| `EntitlementsService` | Plano efetivo; `assertCanPublish(userId)`; `getUsage(userId)` | catálogo, Prisma |
| `BillingService` | Planos, `GET /billing/me`, concessões do admin | catálogo, `EntitlementsService` |
| `BillingPaymentsService` | Assinar, cancelar, sincronizar, processar webhook, `reconcileSubscription` | `AsaasClient`, catálogo |
| `BillingController` | Rotas (seção 9) | os serviços acima |

**`AsaasClient` compartilhado.** Hoje vive em `backend/src/featured/asaas.client.ts` (usado só pelo destaque). Com dois consumidores, passa para `backend/src/asaas/` (módulo próprio exportando o cliente) e ganha: `createCheckout`, `getSubscription`, `findSubscriptionByExternalReference`, `deleteSubscription`. O que o destaque já usa (`createCustomer`, `createPixPayment`, `getPixQrCode`, `getPaymentStatus`, `deletePayment`) não muda. Mantém as regras atuais: `User-Agent`, retry só em GET/DELETE, POST uma tentativa.

**`reconcileSubscription`** (porte do Lumen): lê `getSubscription(id)`; `deleted: true` → `CANCELED`; senão, `nextDueDate` mais novo que o `currentPeriodEnd` gravado (ou campo nulo) → `ACTIVE` com `currentPeriodEnd = nextDueDate`; senão → `PAST_DUE`. É usada pelo webhook e pelo `sync`, que nunca podem divergir. `PAYMENT_REFUNDED` é a exceção: encerra na hora, sem reconsultar. O estado sai de `deleted` e `nextDueDate`, nunca de um `status` do Asaas não verificado.

## 6. Modelo de dados (Prisma)

```prisma
enum BillingPlan        { PROFESSIONAL FLEET }
enum SubscriptionStatus { PENDING ACTIVE PAST_DUE CANCELED EXPIRED }
enum SubscriptionSource { ASAAS GRANT }
enum BillingInterval    { MONTHLY YEARLY }

model Subscription {
  id                  String             @id @default(uuid())
  ownerUserId         String
  plan                BillingPlan
  status              SubscriptionStatus @default(PENDING)
  source              SubscriptionSource
  interval            BillingInterval?
  currentPeriodEnd    DateTime?          // null + GRANT = sem fim
  pastDueSince        DateTime?
  cancelAtPeriodEnd   Boolean            @default(false)
  asaasCheckoutId     String?            @unique
  asaasSubscriptionId String?            @unique
  asaasCustomerId     String?
  grantedByUserId     String?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  owner               User               @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  @@index([ownerUserId, status])
}

model BillingEvent {
  id              String    @id @default(uuid())
  provider        String    @default("ASAAS")
  externalEventId String    @unique        // idempotência
  type            String
  payload         Json                     // já SANITIZADO (sem CPF nem cartão)
  processedAt     DateTime?
  error           String?
  createdAt       DateTime  @default(now())
  @@index([type, createdAt])
}
```

- **Grátis = não ter assinatura com acesso** (sem linha). `PENDING` nunca concede acesso; `PENDING` com mais de 24 h é ignorado.
- Sem contadores denormalizados: o uso é contado em `Vehicle`.
- Migration normal do Prisma (`prisma migrate`), aditiva. As tabelas novas não dependem de `db push`.

## 7. Plano efetivo e limite

**Acesso de uma assinatura** (calculado na leitura, sem job de expiração):

| Status | Dá acesso enquanto |
|---|---|
| ACTIVE, PAST_DUE | Paga (Asaas): `agora ≤ (currentPeriodEnd ?? ∞) + 7 dias` (tolerância de atraso só para ela). Concessão (`GRANT`): `agora ≤ (currentPeriodEnd ?? ∞)`, sem tolerância |
| CANCELED | `agora ≤ currentPeriodEnd` |
| PENDING, EXPIRED | nunca |

**Plano efetivo** = o maior plano entre as assinaturas com acesso; senão grátis. Com `BILLING_ENABLED=false` devolve "sem limites" e nada é aplicado (comportamento de hoje).

**Contagem:** `Vehicle` do dono com `isActive = true` **e** `isPublished = true`. Anúncio vencido (o job diário põe `isActive = false`) ou despublicado não conta.

**Onde se aplica** — sempre que a ação **transforma um anúncio não contado em contado**:
- `VehiclesService.create` (anúncio novo publicado);
- `VehiclesService.update` quando o corpo leva `isPublished` de `false` para `true` (sem isso bastaria despublicar e recriar para burlar);
- qualquer outro caminho que reative `isActive` — o **plano de implementação deve listar todos** (hoje `remove` e o job de vencimento só desativam; o fluxo de renovação, se existir, entra aqui).

Editar um anúncio que **já está contado** nunca é bloqueado. Estourou: `403` com `{ code: "PLAN_LIMIT", limit, used, plan, message }`. **Nunca apaga nem despublica nada**: quem cai de plano, ou já tem mais de 3 hoje, continua com tudo no ar e só não publica novos até ficar abaixo do limite.

## 8. Fluxos

**Assinar.** `POST /billing/checkout { plan, interval }`. Antes de criar: (1) já existe assinatura `ACTIVE`/`PAST_DUE` de plano igual ou maior → `400`; (2) já existe checkout `PENDING` recente (< 60 min) **do mesmo plano e ciclo** → devolve o mesmo `link` (lição do Lumen: sem o filtro por plano+ciclo devolvia o link errado); (3) senão cria `Subscription PENDING` e pede ao Asaas um Checkout `RECURRENT` com `billingTypes: ["CREDIT_CARD"]`, valor do catálogo, ciclo `MONTHLY`/`YEARLY`, **sem `customerData`** (a página do Asaas coleta), `externalReference` = id da assinatura local, `callback` em `FRONTEND_URL/plano?...`, `minutesToExpire: 60`. A volta ao app **não libera nada**: mostra "Confirmando pagamento…" e consulta `GET /billing/me` por até 60 s.

**Confirmação.** `POST /billing/webhooks/asaas`: token `asaas-access-token` em tempo constante (**fail closed**: sem token configurado, recusa tudo), resposta **HTTP 200** (`@HttpCode(200)`), payload sanitizado, `BillingEvent` com id único (reentrega = 200 sem efeito), falha ao processar = 5xx para o Asaas reenviar. Eventos: `CHECKOUT_PAID` → resolve assinatura e cliente por API, `ACTIVE` · `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → reconcilia · `PAYMENT_OVERDUE` → `PAST_DUE` · `SUBSCRIPTION_DELETED`/`INACTIVATED` → `CANCELED` · `PAYMENT_REFUNDED` → encerra na hora · desconhecido → registra e ignora. Casa por `asaasSubscriptionId`/`asaasCustomerId`, não pelo `externalReference`.

**Sincronizar** (`POST /billing/sync`): reconcilia com o Asaas. **Nunca rebaixa quem está `ACTIVE` em dia:** se o `currentPeriodEnd` conhecido ainda não venceu, nem consulta (bug real do Lumen). `PAST_DUE` é sempre rechecado.

**Cancelar** (`POST /billing/cancel`): remove no Asaas, marca `cancelAtPeriodEnd`; acesso segue até `currentPeriodEnd`. **Regularizar atraso:** `/plano` mostra o `invoiceUrl` da cobrança em atraso ao lado de "Cancelar e assinar de novo". **Reembolso (CDC art. 49, 7 dias):** manual no painel do Asaas; o evento encerra o acesso.

**Concessão pelo admin** (`POST/DELETE /billing/admin/grants`): cria `Subscription` `source = GRANT` (sem fim se sem data), revoga na hora e mantém o registro. Só `ADMIN`, com `grantedByUserId`.

## 9. API

| Rota | Acesso | Função |
|---|---|---|
| `GET /billing/plans` | público | Catálogo + `enabled` |
| `GET /billing/me` | autenticado | Plano efetivo, status, fim/renovação, uso × limite |
| `POST /billing/checkout` | autenticado | Abre checkout (5/hora por usuário) |
| `POST /billing/sync` | autenticado | Reconcilia (10/hora) |
| `POST /billing/cancel` | autenticado | Cancela ao fim do período |
| `POST /billing/webhooks/asaas` | público + token | Eventos do Asaas, **fora do rate limit global** (`@SkipThrottle`) |
| `GET/POST/DELETE /billing/admin/grants` | ADMIN | Lista, concede, revoga |

## 10. Convivência com o webhook do destaque

O mesmo Asaas entrega eventos `PAYMENT_*` das duas coisas. Registram-se **dois webhooks** no painel (URLs `/featured/webhook/asaas` e `/billing/webhooks/asaas`), com o **mesmo** `ASAAS_WEBHOOK_TOKEN`, e cada lado **ignora o que não é dele**:
- o webhook do destaque ignora (sem log de aviso) pagamentos que trazem `payment.subscription`;
- o de assinatura ignora pagamentos sem `subscription`.
Isso exige uma pequena mudança no handler do destaque e um teste de cada lado.

## 11. Frontend (desktop e mobile, o Triluga duplica os dois)

- **`/plano`:** uso ("2 de 3"), planos, "Assinar" (mensal/anual → checkout → "Confirmando pagamento…"), "Cancelar" (mostra "acesso até DD/MM"), "Regularizar pagamento".
- **Ao publicar:** contador de uso e, no `PLAN_LIMIT`, aviso com link para `/plano` (tratamento central do erro).
- **Admin:** bloco "Conceder plano". **Landing/rodapé:** preços exibidos só com `enabled`.
- Segue o design system MD3 existente.

## 12. Configuração

`BILLING_ENABLED` (padrão `false`), `BILLING_PRICE_*` (sobrescreve os preços do catálogo) e as `ASAAS_*` já existentes. A flag é lida no backend e exposta em `/billing/plans`: ligar não exige rebuild do frontend. `docker-compose.yml`, `render.yaml` e `.env*.example` precisam listar as variáveis novas (o compose só repassa o que está na lista `environment`).

## 13. Segurança e privacidade

Token em tempo constante e fail closed; preço sempre do catálogo no servidor; payload sanitizado; nenhum CPF ou cartão passa pelo Triluga; Asaas como operador dos dados de pagamento; **Termos de uso, Política de Privacidade e política de reembolso atualizados antes de cobrar**.

## 14. Testes

Unitários: catálogo; limite (inclusive despublicar e republicar); "cair de plano não apaga nada"; tolerância de 7 dias; concessão sem fim; flag desligada; `sync` não rebaixa; checkout reaproveitado só do mesmo plano e ciclo; token e idempotência; sanitização; cada webhook ignora o do outro. Ponta a ponta com Postgres real e **Asaas falso**, depois uma passada contra o **sandbox real** (como feito com o destaque), cobrindo: bater no limite → `PLAN_LIMIT` → checkout → webhook → publicar → cancelar. Navegador real: `/plano`, aviso de limite, admin, mobile.

## 15. Fases de entrega

1. **Núcleo sem cobrar:** catálogo, tabelas, `EntitlementsService`, limite, `/billing/me`, `/plano` (uso), concessões. Flag desligada.
2. **Cobrança:** `AsaasClient` compartilhado, checkout, webhook, sincronizar, cancelar, regularizar. **Começa com um spike curto no sandbox** (checkout `RECURRENT` na conta do Triluga).
3. **Lançamento:** preços na landing, Termos e reembolso, só então ligar `BILLING_ENABLED`.

## 16. Riscos e pendências do dono

- **Preços e limites** são provisórios (seção 4).
- **Termos de uso e reembolso** precisam existir antes de cobrar.
- **Só cartão** deixa de fora quem prefere PIX; somar PIX depois se os números mostrarem perda.
- **Checkout recorrente na conta de produção** do Asaas: não verificado se a conta precisa de ativação do recurso.
- **Payload e header reais do webhook** ainda não foram vistos de verdade (mesma pendência do destaque).
- **Donos com mais de 3 anúncios hoje** não perdem nada (regra do excedente), mas também não têm pressão imediata para assinar.

## 17. Premissas a confirmar

- "Anúncio ativo" = `isActive` e `isPublished`; vencido ou despublicado não conta.
- Tolerância de 7 dias de atraso para assinatura paga (valor do Lumen).
- Anual = 10 meses.
- Cada pessoa tem uma assinatura efetiva por vez (o maior plano com acesso vale).
