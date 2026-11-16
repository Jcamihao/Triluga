# Revisão do vínculo por checkoutSession

Data: 2026-11-16. Revisor: sonnet (item de segurança/acesso por plano).

## Escopo

Commits revisados: `e5d4709` (correção) e `c43825c` (revisão parcial anterior).

- `backend/src/asaas/asaas.client.ts`: `findSubscriptionByCheckoutSession`.
- `backend/src/billing/billing-payments.service.ts`: `sync`, `handleCheckoutPaid`, `linkAsaasSubscription`, `findLocalByPaymentSubscription`.
- Specs: `asaas.client.spec.ts` e `billing-payments.service.spec.ts`.

Pergunta central: a correção pode ligar a assinatura do Asaas à linha local errada, ou conceder plano a quem não pagou?

## Método

1. Leitura dos diffs dos dois commits, depois dos arquivos inteiros, do relatório de sandbox e dos testes novos.
2. Caça a bugs de produção: vínculo cruzado entre usuários, duplo vínculo, corrida e idempotência, P2002, ids vazios ou de tipo errado, paginação, EXPIRED terminal, reprocessamento de webhook, vazamento em log.
3. Mutação manual dirigida, 53 mutantes. Um runner em primeiro plano aplica cada mutante, roda só o spec do arquivo (`npx jest <spec> --runInBand`) e restaura com `git checkout --` dentro de `finally`. Nenhum processo ficou vivo; a árvore terminou limpa.

## Resultado dos mutantes

53 mutantes: 48 mortos, 5 sobreviventes, todos equivalentes (sem mudança de comportamento observável). Houve 6 sobreviventes na primeira rodada; o sexto (S26, troca de `warn` por `debug`) era real e foi morto com teste novo.

### asaas.client.ts (`findSubscriptionByCheckoutSession`)

| Id | Linha aprox. | Mutação | Resultado | Teste que mata |
|---|---|---|---|---|
| C01 | 247 | remove `typeof !== 'string'` do guard | morto | ids `undefined` e `null` devolvem null sem listar |
| C02 | 247 | remove `length === 0` do guard | morto | id string vazia |
| C03 | 247 | `\|\|` vira `&&` no guard | morto | ids vazio, undefined, null |
| C04 | 248 | guard devolve `undefined` em vez de `null` | morto | mesmos testes de id inválido (`toBeNull`) |
| C05 | 60 | `MAX_PAGES` 3 vira 2 | morto | para depois de 3 páginas |
| C06 | 60 | `MAX_PAGES` 3 vira 4 | morto | para depois de 3 páginas |
| C07 | 252 | `page <` vira `page <=` | morto | para depois de 3 páginas |
| C08 | 59 | `PAGE_SIZE` 100 vira 50 | morto | URL `limit=100` na 1ª e 2ª página |
| C09 | 254 | `offset` com `(page + 1)` | morto | URL `offset=0` e `offset=100` |
| C10 | 263 | `===` vira `!==` no casamento | morto | acha na 1ª página; segue para a próxima |
| C11 | 263 | `===` vira `==` | sobreviveu, equivalente | `checkoutId` é string não vazia, então `==` e `===` coincidem |
| C12 | 267 | `!hasMore` vira `hasMore` | morto | segue para a próxima página; devolve null sem mais páginas |
| C13 | 267 | remove o `return null` por `!hasMore` | morto | devolve null sem mais páginas (1 chamada); resposta sem data |
| C14 | 262 | `data?.find` vira `data!.find` | morto | resposta sem data |
| C15 | 264 | `if (match)` vira `if (true)` | morto | testes de paginação e de nada casa |
| C16 | 271 | retorno final `undefined` em vez de `null` | morto | para depois de 3 páginas (`toBeNull`) |
| C17 | 265 | mapeia `data[0]` em vez do `match` | morto | acha na 1ª página (casa o 2º item) |
| C18 | 267 | `!hasMore` vira `hasMore === false` | morto | resposta sem data (hasMore ausente) |
| C19 | 253 | remove `limit` da query | morto | URL exata |
| C20 | 258 | acrescenta `&checkoutSession=` à URL | morto | URL exata |

### billing-payments.service.ts

| Id | Trecho | Mutação | Resultado | Teste que mata |
|---|---|---|---|---|
| S01 | sync | condição `local.asaasCheckoutId` vira `true` | morto | sem asaasCheckoutId não consulta o checkoutSession |
| S02 | sync | `??` vira `\|\|` | sobreviveu, equivalente | o operando esquerdo é objeto (sempre truthy) ou null |
| S03 | sync | pula a busca por externalReference | morto | acha pelo externalReference; achado por externalReference não consulta checkoutSession |
| S04 | sync | `: null` vira `: undefined` | sobreviveu, equivalente | o código só testa `!remote` |
| S05 | handleCheckoutPaid | `=== null` vira `!== null` | morto | liga pela busca por checkoutSession; com checkout.subscription não varre |
| S06 | handleCheckoutPaid | condição vira `true` | morto | com checkout.subscription não varre o Asaas |
| S07 | handleCheckoutPaid | `if (remote)` vira `true` | morto | sem achado remoto não altera nada |
| S08 | handleCheckoutPaid | remove `if (!linked) return` | morto | CHECKOUT_PAID P2002 não relança nem altera |
| S09 | handleCheckoutPaid | remove `updated = linked` | morto | liga pela busca por checkoutSession e reconcilia |
| S10 | linkAsaasSubscription | `isUniqueViolation` vira `false` | morto | CHECKOUT_PAID P2002 |
| S11 | linkAsaasSubscription | `!isUniqueViolation` | morto | CHECKOUT_PAID P2002 |
| S12 | linkAsaasSubscription | `return null` vira `undefined` | sobreviveu, equivalente | os chamadores só testam `!linked` |
| S13 | findLocal | `isNonEmptyString(checkoutSession)` vira `true` | morto | checkoutSession ausente, objeto, número, vazio |
| S14 | findLocal | remove `source: 'ASAAS'` | morto | só liga linha ASAAS (nunca GRANT) |
| S15 | findLocal | `=== null` vira `!== null` | morto | liga a linha sem assinatura; não religa linha já ligada |
| S16 | findLocal | remove a checagem de `asaasSubscriptionId === null` | morto | não religa linha que já aponta para outra assinatura |
| S17 | findLocal | liga com `checkoutSession` em vez do id da assinatura | morto | liga a linha e reconcilia |
| S18 | findLocal | `if (local)` vira `if (!local)` | morto | 16 testes |
| S19 | linkAsaasSubscription | grava em `asaasCheckoutId` | morto | 4 testes de ligação |
| S20 | handleCheckoutPaid | varre por `local.id` em vez de `checkoutId` | morto | liga pela busca por checkoutSession |
| S21 | sync | varre por `local.id` em vez de `asaasCheckoutId` | morto | acha pelo checkoutSession |
| S22 | findLocal | lê `payload.checkoutSession` (raiz, não `payment`) | morto | liga a linha do checkout |
| S23 | isUniqueViolation | `P2002` vira `P2003` | morto | idempotência e P2002 |
| S24 | reconcile | remove o guard de EXPIRED | morto | EXPIRED retorna sem consultar; EXPIRED ligada não volta a ACTIVE |
| S25 | sync | `data: {}` em vez do id | morto | sync grava o id |
| S26 | findLocal | `warn` vira `debug` na linha não encontrada | sobreviveu, depois morto | teste novo: warn com o id da assinatura |
| S27 | findLocal | `source: 'GRANT'` | morto | liga a linha; só ASAAS |
| S28 | findLocal | `=== undefined` em vez de `=== null` | morto | liga a linha sem assinatura |
| S29 | handleCheckoutPaid | liga `local` em vez de `updated` | sobreviveu, equivalente | `linkAsaasSubscription` só usa `local.id`, igual nos dois |
| S30 | findLocal | liga mas devolve a linha antiga | morto | liga e reconcilia; falha do Asaas depois de ligar |
| S31 | sync (pós-correção) | remove `if (!updated) return` | morto | sync P2002 |
| S32 | sync (pós-correção) | liga com `local.id` | morto | testes de sync por checkoutSession |
| S33 | link (pós-correção) | `warn` vira `debug` no P2002 | morto | sync P2002 (assere o warn) |

Equivalentes: C11, S02, S04, S12, S29.

## Bugs achados e corrigidos

Commit `c16d52f`.

1. **`sync` virava 500 em P2002 (severidade baixa).** O `sync` gravava `asaasSubscriptionId` direto. Se a assinatura achada (por externalReference ou por checkoutSession) já pertencesse a outra linha local, o erro de unicidade do Prisma subia como 500 a cada clique em sincronizar, sem chance de resolver. O webhook já tratava isso (warn, sem relançar). O `sync` agora usa `linkAsaasSubscription`. Teste novo falhava antes e passa depois. Outro teste confirma que erro de banco que não é P2002 continua relançando.
2. **Lacuna de teste (S26).** Nenhum teste fixava o `warn` quando o pagamento não casa nenhuma linha local, nem por `subscription` nem por `checkoutSession`. Teste novo cobre.

Nenhum bug de concessão indevida de plano, vínculo cruzado entre usuários ou duplo vínculo foi achado.

## Análise sem bug (verificado por leitura e testes)

- **Vínculo cruzado:** o `checkoutSession` do pagamento só liga linha com `asaasCheckoutId` igual, `source ASAAS` e `asaasSubscriptionId` nulo. `asaasCheckoutId` e `asaasSubscriptionId` são `@unique` no schema, então não há duas linhas candidatas. O `sync` varre com o `asaasCheckoutId` da própria linha do usuário autenticado, nunca com dado de outro usuário.
- **Duplo vínculo:** a unicidade do banco barra; P2002 vira warn sem alteração, tanto no webhook quanto no `sync`.
- **Corrida:** webhook e `sync` ligando a mesma assinatura à mesma linha gravam o mesmo valor (idempotente). Ligando a linhas diferentes, o índice único decide e o perdedor cai no P2002.
- **EXPIRED terminal:** `reconcileSubscription` retorna cedo para EXPIRED. Linha EXPIRED pode ser ligada, mas nunca volta a ACTIVE. Coberto por teste.
- **Id inválido:** `undefined`, `null`, vazio e não-string retornam null sem listar, tanto no cliente quanto no serviço. Isso evita casar assinaturas criadas por API, que têm `checkoutSession` nulo.
- **Paginação:** `offset = page * 100`, para quando `hasMore` é falso, teto de 3 páginas. Valores fixados por testes.
- **Reprocessamento de webhook:** `BillingEvent.externalEventId` único; reenvio sem `processedAt` reprocessa, e a ligação é idempotente. Coberto por teste.
- **Log:** os warns trazem só ids de assinatura e de linha local. Sem CPF, e-mail ou dado de cartão.

## Riscos residuais (não corrigidos, decisão do dono)

1. **Linha achada por externalReference com `asaasCheckoutId` diferente.** Em `handleCheckoutPaid`, se o evento trouxer `checkout.id = X` e `externalReference` de uma linha cujo `asaasCheckoutId` é Y, a varredura usa X e liga a assinatura do checkout X à linha dessa referência. Isso exige payload inconsistente vindo do Asaas, já autenticado por token. O fallback por externalReference já existia antes desta correção. Endurecer (exigir `local.asaasCheckoutId` nulo ou igual a `checkoutId`) é uma linha, mas muda um comportamento antigo; ficou como sugestão.
2. **PAYMENT_OVERDUE liga linha PENDING.** Se o CHECKOUT_PAID se perder, um PAYMENT_OVERDUE de ciclo posterior liga e ativa a linha por `reconcileSubscription`. No sandbox a assinatura do checkout nasceu ACTIVE com o primeiro pagamento CONFIRMED (presumido para produção, não verificado), então quem chega aí já pagou o primeiro ciclo. Ainda assim, o `nextDueDate` usado pode não refletir a inadimplência exata.
3. **Teto de 300 assinaturas na varredura.** Se houver mais de 300 assinaturas novas entre o pagamento e o `sync`, o `sync` não acha. O webhook (imediato) não sofre disso. Limite aceito na decisão original.

## O que NÃO foi coberto (só o Asaas real mostra)

- A ordem de `GET /subscriptions` (se as mais recentes vêm primeiro). O relatório do sandbox afirma, mas os testes usam resposta simulada.
- Se o payload real do `CHECKOUT_PAID` traz ou não `checkout.subscription`.
- Se o `PAYMENT_*` real sempre traz `payment.checkoutSession` no checkout hospedado.
- O comportamento de `deleted` e de assinaturas inativas na listagem paginada.
- Concorrência real no banco (os testes usam um fake em memória sem índice único; o P2002 é simulado).
- Nenhuma chamada de rede ao Asaas foi feita nesta revisão.

## Números finais

- Jest completo do backend: 25 suites, 629 testes verdes (base anterior: 626; +3 testes novos).
- `tsc --noEmit`: sem erros. `npm run lint:ci`: sem avisos. `npm run build`: ok.
- `git diff` dos dois arquivos de produção: vazio ao fim (a única mudança de produção é o commit `c16d52f`).
