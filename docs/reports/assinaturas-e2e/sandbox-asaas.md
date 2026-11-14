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

## O que NÃO foi verificado

- **Pagamento pela página hospedada.** O reCAPTCHA recusou o navegador automatizado ("Tente novamente e verifique o recaptcha"). Não contornei a proteção. Por isso não se sabe se o `externalReference` do checkout é copiado para a assinatura criada por ele, nem a ordem real de `CHECKOUT_PAID` e `PAYMENT_CONFIRMED`. O risco do `nextDueDate` igual a hoje não se repetiu no caminho por API; no caminho hospedado segue sem observação.
- **Webhook real.** Não há URL pública nesta máquina, então o Asaas nunca chamou o backend. O formato do payload e do header, e os nomes dos eventos no painel, continuam sem confirmação.
- **Conta de produção.** Não se sabe se ela precisa de ativação do checkout recorrente.

## Como completar

Uma pessoa abre o link de um checkout recém-criado no navegador, paga com o cartão de teste do sandbox e então roda `POST /billing/sync`; para o webhook, expor o backend por um túnel público e cadastrar a URL no painel do sandbox.
