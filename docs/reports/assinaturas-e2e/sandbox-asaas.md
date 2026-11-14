# Passada contra o sandbox real do Asaas (Step 2 da Task 12)

Data: 2026-11-14. Backend real do Triluga (`dist/main`, `BILLING_ENABLED=true`), Postgres descartável, `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`, `FRONTEND_URL=https://triluga.example.com` (o Asaas aceitou este domínio de exemplo nas URLs de retorno). A chave de sandbox foi usada só por variável de ambiente, fora do repositório; nada dela está neste arquivo. Os clientes e assinaturas criados no sandbox foram apagados ao fim de cada execução.

## O que foi verificado contra o Asaas real

| Item | Resultado |
|---|---|
| Chave e `User-Agent` | `GET /customers` responde 200. |
| `POST /billing/checkout` (backend real) | 201 com `link` em `sandbox.asaas.com/.../checkoutSession/show/...`. O Asaas aceitou o corpo que o Triluga monta (cartão, recorrente, `items`, `callback`, `externalReference`, `subscription.nextDueDate`). A linha local ficou `PENDING` com `asaasCheckoutLink` gravado. |
| Página hospedada | Abre (200). Mostra "Plano Profissional do Triluga", "Assinatura mensal", R$ 29,90, recorrência Mensal, primeira cobrança no dia, prazo de 60 minutos. Tem 3 etapas (identificação, endereço, pagamento) e reCAPTCHA. |
| Assinatura de cartão criada pela API com `externalReference` = id local | Nasce `ACTIVE`; o primeiro pagamento já aparece `CONFIRMED` (vencimento hoje); `nextDueDate` já está um mês à frente na primeira leitura (2026-12-14), sem atraso perceptível. |
| `POST /billing/sync` | Achou a assinatura por `externalReference`, gravou `asaasSubscriptionId`, status `ACTIVE`, fim do período 2026-12-14. `GET /billing/me` devolveu `PROFESSIONAL`, origem `ASAAS`. |
| Webhook `PAYMENT_CONFIRMED` com carga montada por nós | 200; a assinatura continua `ACTIVE` com o mesmo fim (o `nextDueDate` não avançou de novo, e o backend não rebaixou). |
| `DELETE /subscriptions/:id` | Assinatura existente: 200 `{"deleted":true,"id":...}`. Repetir o DELETE: 200 igual. Id inexistente: **404 com corpo vazio** (confirma a tolerância de 404 no cancelamento). |
| `GET /subscriptions/:id` depois do DELETE | 200 com `status: INACTIVE` e `deleted: true`, que o `reconcile` lê como cancelada. |
| `GET /subscriptions?externalReference=` depois do DELETE | Lista **vazia**. Assinatura apagada some da busca por `externalReference`; só a leitura por id a mostra. Efeito: uma linha local ainda sem `asaasSubscriptionId` cuja assinatura foi apagada fica `PENDING` no `sync`. |

## Pagamento pela página hospedada (feito por uma pessoa) e bug achado

Depois, o dono pagou um checkout criado pelo backend, na página hospedada do sandbox, com o cartão de teste. Resultado real:

- A assinatura foi criada (`ACTIVE`, R$ 29,90, mensal, cobrança `CONFIRMED`), mas com **`externalReference: null`**. O `externalReference` do checkout **não** é copiado para a assinatura nem para o cliente.
- O vínculo real é o campo **`checkoutSession`**, presente na assinatura e em cada pagamento, igual ao id do checkout (`asaasCheckoutId` local).
- O filtro `GET /subscriptions?checkoutSession=` é **ignorado** pelo Asaas (um id falso devolve a assinatura mesmo assim). `GET /checkouts/{id}` responde 404.

Consequência: o `sync` antigo (só por `externalReference`) nunca recuperaria um pagamento cujo webhook se perdeu. Correção feita no código (varredura das 3 páginas mais recentes por `checkoutSession` no `sync` e no `CHECKOUT_PAID` sem `checkout.subscription`; ligação por `payment.checkoutSession` nos eventos `PAYMENT_*`), com testes e mutantes. O método novo foi conferido contra o sandbox real: achou a assinatura pelo `checkoutSession` e devolveu `null` para um id inexistente.

## O que NÃO foi verificado

- **Ordem real de `CHECKOUT_PAID` e `PAYMENT_CONFIRMED`**: sem webhook real não foi observada. No caminho hospedado, a primeira leitura da assinatura já veio com `nextDueDate` avançado um mês (2026-12-14), então o risco de vir igual a hoje não apareceu, mas isso não prova a ordem dos eventos.
- **Navegador automatizado**: o reCAPTCHA da página recusa (não contornado); o pagamento foi feito por uma pessoa.
- **Cancelamento pelo backend de uma assinatura criada pelo checkout**: o DELETE foi testado em assinaturas criadas por API; o fluxo `POST /billing/cancel` sobre uma assinatura do checkout não foi rodado.
- **Webhook real.** Não há URL pública nesta máquina, então o Asaas nunca chamou o backend. O formato do payload e do header, e os nomes dos eventos no painel, continuam sem confirmação.
- **Conta de produção.** Não se sabe se ela precisa de ativação do checkout recorrente.

## Como completar

Para o webhook, expor o backend por um túnel público e cadastrar a URL no painel do sandbox, e repetir um pagamento humano conferindo `BillingEvent` e `/billing/me`.
