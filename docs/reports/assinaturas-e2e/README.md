# Passada ponta a ponta: assinaturas (Asaas falso)

Prova que o backend real (`backend/dist/main`) sobe contra Postgres de verdade e fala HTTP com um Asaas falso local. Não toca no Asaas real.

## Como rodar

Na raiz do Triluga:

```
cd backend && npm run build && cd ..
node docs/reports/assinaturas-e2e/run-e2e.js
```

- Saída: `docs/reports/assinaturas-e2e/e2e-output.txt` (também no terminal). Exit 0 = todos os passos OK.
- Tempo: ~15 s.
- Postgres: `embedded-postgres` 18 (binários de `/home/caminhao/coding/codeStage/Lumen/backend/node_modules`, caminho fixo em `run-e2e.js`). Porta 54399, dados em diretório temporário que é apagado no fim.
- Portas padrão: API 3099, Asaas falso 3398. Sobrescrevem com `E2E_PG_PORT`, `E2E_API_PORT`, `E2E_FAKE_PORT`.
- Nenhuma dependência nova no `package.json`. Nada de produção é alterado.

## Schema (drift conhecido)

`prisma migrate deploy` sozinho não deixa o banco igual ao `schema.prisma`: o diff traz 32 comandos SQL (tabelas `Report`, `AuditLog`, `FeaturedOrder` e colunas como `User.emailVerified`, `Vehicle.isFeatured`). O script então roda `prisma db push --skip-generate --accept-data-loss`, o mesmo contorno que o `backend/Dockerfile` usa no ramo P3005. Em banco vazio, esse `db push` é só a criação do que falta. Depois o diff fica vazio (verificado no script).

## Configuração do backend nos testes

`BILLING_ENABLED=true`, `ASAAS_BASE_URL=http://127.0.0.1:3398/v3`, `ASAAS_WEBHOOK_TOKEN=token-e2e-teste`, `FRONTEND_URL=https://triluga.example.com`, `ADMIN_ACCOUNT_EMAIL` = e-mail do admin de teste (o `RolesGuard` exige isso além do role ADMIN). Sem `REDIS_URL`. Chaves JWT e do Asaas são falsas.

## O que não é coberto

Asaas real, webhook vindo da internet (túnel), ramo ACTIVE do `sync` (que não consulta o Asaas dentro do período), PAST_DUE, PAYMENT_OVERDUE, SUBSCRIPTION_DELETED e throttling do checkout.
