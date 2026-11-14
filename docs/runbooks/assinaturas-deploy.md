# Deploy do Triluga v2.10.0 (assinaturas) — roteiro para o agente de infra

Escrito para: o agente que opera a VPS (mesma do runbook [v2.8.0](./triluga-deploy-v2.8.0.md)), projeto do compose `triluga`. Contexto da entrega: [`docs/releases/v2.10.0.md`](../releases/v2.10.0.md). Spec: `docs/superpowers/specs/2026-10-15-assinaturas-design.md`.

**Esta entrega mexe em banco e prepara cobrança.** Siga na ordem. Se qualquer verificação falhar, pare e avise o dono.

Estado ao escrever: a cobrança vem **desligada** (`BILLING_ENABLED=false`). A ativação do checkout real no sandbox do Asaas ainda **não foi validada** (ver seção 6).

---

## 0. Regras

- A VPS é compartilhada com outros projetos. **Não faça dois deploys ao mesmo tempo** e não toque em nada que não seja o Triluga.
- **Nunca** imprima, copie para log ou grave a chave do Asaas nem o token do webhook. Para conferir presença, use contagem (`grep -c`), nunca `cat` do `.env`.
- Antes de qualquer mudança no nginx: backup do arquivo (`cp arq arq.bak-$(date +%s)`) e `nginx -t`.
- Não existe script para esta versão. Os comandos abaixo são para rodar à mão, um por vez, lendo a saída.

---

## 1. Decisões do dono antes de começar

1. **Código.** O deploy leva o `HEAD` do `master` na VPS. O dono precisa autorizar o push e confirmar o SHA a implantar: `__________`.
2. **Ligar a cobrança agora ou não.** Recomendação: **não ligar no primeiro deploy**. A versão sobe com `BILLING_ENABLED=false`: só a tabela nova e a página `/plano` (sem preço) ficam disponíveis.
3. **Termos de Uso, Política de Privacidade e política de reembolso** precisam estar publicados antes de ligar a flag (seção 6). Não é técnico: o dono confirma.

---

## 2. Preflight (somente leitura)

Nada aqui altera o banco nem os containers.

```bash
cd /root/Triluga                                  # caminho do projeto na VPS
git rev-parse --short HEAD                        # confirma o SHA aprovado pelo dono
docker --version && docker compose version        # versões do Docker
df -h /                                           # espaço livre suficiente para o build e para o dump
docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT pg_size_pretty(pg_database_size('triluga'));"   # tamanho do banco, para comparar com o espaço livre
docker system df                                  # espaço ocupado por imagens e cache
```

Estado do banco:

```bash
docker compose exec -T postgres psql -U triluga -d triluga -c "SHOW server_version;"
# PostgreSQL >= 13 é obrigatório (a migration de preço usa trim_scale). Abaixo de 13: pare.

docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"
# Esperado: última migration aplicada é 20261015120000_vehicle_daily_rate_min_rental.

docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT to_regclass('\"Subscription\"') AS subscription, to_regclass('\"BillingEvent\"') AS billing_event;"
# Esperado antes do deploy: as duas colunas vazias (tabelas ainda não existem).
```

Status das migrations pelo Prisma (somente leitura):

```bash
docker compose exec backend npx prisma migrate status
```

- Esperado: a migration `20261113120000_billing_subscriptions` aparece como pendente.
- Pode aparecer também o aviso de **drift pré-existente** (seção 5). Isso não é falha desta entrega.
- **Não verificado**: o texto exato dessa saída em produção. Só foi rodado em banco descartável.

Configuração (só contagem, nunca o valor):

```bash
grep -c '^ASAAS_API_KEY=' .env          # esperado: 1
grep -c '^ASAAS_WEBHOOK_TOKEN=' .env    # esperado: 1
grep -c '^FRONTEND_URL=https://' .env   # esperado: 1 (URL pública em https)
```

Se algum resultado não bater, pare e corrija o `.env` antes do passo 3.

---

## 3. Backup obrigatório (`pg_dump`)

**Antes de qualquer outra mudança.** Sem o dump, não há como voltar o banco.

```bash
mkdir -p /root/backups
TS=$(date +%Y%m%d-%H%M%S)
docker compose exec -T postgres pg_dump -U triluga -d triluga | gzip > /root/backups/triluga-pre-assinaturas-$TS.sql.gz
gunzip -t /root/backups/triluga-pre-assinaturas-$TS.sql.gz && echo "dump OK"
ls -lh /root/backups/triluga-pre-assinaturas-$TS.sql.gz
```

- Esperado: `dump OK` e tamanho compatível com o banco (não zero bytes).
- Guarde `$TS` e informe o dono.
- Tags das imagens atuais, para rollback:

  ```bash
  docker images | grep triluga                    # confirme os nomes reais das imagens
  docker tag <imagem-backend-atual> triluga-backend:pre-assinaturas-$TS
  docker tag <imagem-frontend-atual> triluga-frontend:pre-assinaturas-$TS
  ```

---

## 4. Deploy: backend e frontend juntos

Backend e frontend vão no **mesmo** deploy. A página `/plano` e o aviso de limite dependem da API nova.

```bash
git pull --ff-only origin master                  # ou o SHA aprovado, se o dono não aprovou o HEAD inteiro
docker compose build backend frontend
docker compose up -d --no-deps backend frontend
```

- A migration roda sozinha: o `backend/Dockerfile` executa `prisma migrate deploy` ao subir o container.
- Acompanhe o log:

  ```bash
  docker compose logs --tail=150 backend
  ```

  Esperado: linhas de `migrate deploy` sem erro e o app escutando na porta. Erro `P3005` ou `P3018` = pare e avise o dono antes de qualquer outra coisa.
- Confira a migration no banco:

  ```bash
  docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261113120000_billing_subscriptions';"
  ```

  Esperado: uma linha com `finished_at` preenchido.
- Confira as tabelas novas:

  ```bash
  docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT to_regclass('\"Subscription\"'), to_regclass('\"BillingEvent\"');"
  ```

  Esperado: as duas com nome (não vazias).

---

## 5. Variáveis (`.env` da VPS)

Edite o `.env` (permissão `600`) pelo dono ou por você. **Nunca cole valores em chat.**

```
BILLING_ENABLED=false
ASAAS_API_KEY='$aact_...'                 # aspas simples: a chave começa com '$', que o Compose interpreta como variável
ASAAS_BASE_URL=https://api.asaas.com/v3   # produção. Sem isso o padrão do compose é SANDBOX e a chave de produção é recusada
ASAAS_WEBHOOK_TOKEN=<openssl rand -hex 24>
ASAAS_TIMEOUT_MS=10000
FRONTEND_URL=https://<domínio público do app>   # https obrigatório: o Asaas recusa localhost nas URLs de retorno
```

- `ASAAS_API_KEY` com aspas simples: regra do runbook v2.8.0. Forma equivalente: `ASAAS_API_KEY=$$aact_...`.
- O `ASAAS_WEBHOOK_TOKEN` é segredo gerado por você. O **mesmo valor** vai para o painel do Asaas (seção 7).
- `BILLING_PRICE_*` ficam vazios: valem os preços provisórios do catálogo (R$ 29,90 / 299,00 / 79,90 / 799,00). Só preencha se o dono definir preço final.
- `render.yaml` não lista `FRONTEND_URL`. Isso não afeta a VPS (que usa o compose), mas vale saber se o deploy for em outro lugar.
- Mudou o `.env`? Recrie o backend para ler as variáveis: `docker compose up -d --no-deps backend`.

---

## 6. Smoke (com a cobrança desligada)

Use a URL pública da API:

```bash
API=https://<domínio-da-api>/api/v1

curl -s -o /dev/null -w "plans %{http_code}\n" $API/billing/plans
# Esperado: plans 200

curl -s -o /dev/null -w "webhook sem token %{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' $API/billing/webhooks/asaas
# Esperado: webhook sem token 403

curl -s -o /dev/null -w "webhook destaque sem token %{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' $API/featured/webhook/asaas
# Esperado: 403 (igual antes desta versão)
```

- `plans` deve responder `"enabled": false` no corpo (`curl -s $API/billing/plans`). Se vier `true`, pare: a flag foi ligada sem querer.
- Abra `/plano` logado: deve mostrar a página **sem** preço e com a mensagem de planos indisponíveis.
- Crie um anúncio como usuário comum e publique um quarto: com a flag desligada, o limite não deve aplicar. **Não verificado** em produção: a regra vem da spec e só foi testada com a flag ligada, no ponta a ponta.

---

## 7. Registrar os dois webhooks no painel do Asaas

O Asaas envia eventos `PAYMENT_*` do destaque **e** das assinaturas. Por isso são **dois** webhooks, com o **mesmo** token. Cada um ignora o que não é dele.

No painel do Asaas (produção), em Integrações → Webhooks:

1. **Destaque (já existe)**
   - URL: `https://<domínio-da-api>/api/v1/featured/webhook/asaas`
   - Token de autenticação: o `ASAAS_WEBHOOK_TOKEN` (header `asaas-access-token`)
   - Eventos: os mesmos de antes (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_REFUNDED`, `PAYMENT_REVERSED`, `PAYMENT_CHARGEBACK_*`, `PAYMENT_DELETED`)
2. **Assinaturas (novo)**
   - URL: `https://<domínio-da-api>/api/v1/billing/webhooks/asaas`
   - Token de autenticação: o **mesmo** `ASAAS_WEBHOOK_TOKEN`
   - Eventos (conforme a spec; **não verificado** que os nomes batem com o painel, confira na tela): `CHECKOUT_PAID`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`
3. Confirme que os dois aparecem na lista e que o token é o mesmo nos dois.

Sem o token certo no painel, o Asaas recebe 403 e não entrega nada. Veja o log do backend: `docker compose logs backend | grep -i webhook`.

---

## 8. Só ligar a cobrança depois de tudo

**Pré-requisitos (todos):**

1. Termos de Uso, Política de Privacidade e política de reembolso **publicados** (dono confirma).
2. Preços finais definidos pelo dono (ou os provisórios aceitos por escrito).
3. Checkout validado no **sandbox** do Asaas (num ambiente com `ASAAS_BASE_URL` de sandbox, **não** na produção): um checkout criado pelo backend, a página hospedada aberta e o retorno para `/plano` conferido. **Hoje isso não foi feito.** Enquanto não for feito, a cobrança **não** é ligada.
4. Os dois webhooks registrados (seção 7).

Ligar:

```bash
# edite no .env: BILLING_ENABLED=true
docker compose up -d --no-deps backend
curl -s $API/billing/plans | grep -o '"enabled":[a-z]*'     # esperado: "enabled":true
```

### Verificação pós-ligar

1. Dono faz **um checkout real de teste** com a própria conta (valor real). Anote o plano e o ciclo escolhidos.
2. Confirme no log que o webhook chegou:

   ```bash
   docker compose logs --since 15m backend | grep -iE "billing|webhook|ERROR"
   ```
3. Confirme no banco a assinatura e o evento:

   ```bash
   docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT status, plan, source, \"currentPeriodEnd\" FROM \"Subscription\" ORDER BY \"createdAt\" DESC LIMIT 3;"
   docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT type, \"processedAt\" IS NOT NULL AS processado, error FROM \"BillingEvent\" ORDER BY \"createdAt\" DESC LIMIT 5;"
   ```
   Esperado: assinatura `ACTIVE`; evento `CHECKOUT_PAID` processado e sem erro.
4. Confira `GET /billing/me` logado como o dono: `plan` deve mostrar o plano pago.
5. Cancele o teste pela própria `/plano` (cancelamento em duas etapas) e confirme que o acesso segue até o fim do período e que a assinatura aparece **cancelada** no painel do Asaas.

**Se o webhook não chegar:** confirme a URL e o token no painel (403 = token diferente), o nginx (a rota `/api/v1/billing/webhooks/` precisa chegar ao backend) e a fila de eventos do Asaas. Recuperação: o dono pode conceder o plano pelo admin (`/admin`, bloco "Planos concedidos").

---

## 9. Rollback

Escolha o nível certo. Os três são independentes.

**A. Desligar a cobrança, sem reverter código (o primeiro recurso).**
- `BILLING_ENABLED=false` no `.env` e `docker compose up -d --no-deps backend`.
- Efeito esperado: sem limite, sem preço, sem checkout. Nada é apagado.
- **Assinaturas ativas no Asaas continuam cobrando.** Cancele no painel do Asaas as que não devem seguir. **Não verificado** o que o backend faz com eventos do Asaas enquanto a flag está desligada.

**B. Voltar as imagens anteriores (só código).**
- `docker tag` / `docker compose up -d --no-deps backend frontend` usando as tags `pre-assinaturas-<TS>` (seção 3).
- As tabelas `Subscription` e `BillingEvent` **podem ficar**: são aditivas e o código antigo não as lê.
- Não rode `DROP TABLE` sem o dono.

**C. Restaurar o banco do dump (último recurso).**
- Apaga tudo o que foi gravado depois do `pg_dump`, inclusive anúncios, mensagens e assinaturas. Só com aprovação do dono, depois de decidir o que se perde.
- Antes, cancele no painel do Asaas as assinaturas ativas, senão elas seguem cobrando.

---

## 10. Drift de migrations (pré-existente)

- O `schema.prisma` tem tabelas e colunas (`Report`, `AuditLog`, `FeaturedOrder`, `User.emailVerified`, entre outras) que nenhuma migration cria. A produção nasceu parcialmente de `db push`.
- `prisma migrate deploy` em **banco novo, zerado**: deixa **32 diferenças** de schema. O `backend/Dockerfile` contorna com `db push`. Foi o que o e2e reproduziu (ver `docs/reports/assinaturas-e2e/e2e-output.txt`, passo 1).
- **Instalação nova exige esse contorno.** Em **produção existente, nada muda**: o Dockerfile já cai no caminho certo.
- A migration de assinaturas não inclui esse drift de propósito. Corrigir o drift é decisão separada do dono.

---

## 11. Depois

- Avise o dono com: SHA implantado, `$TS` do dump, resultado do smoke e estado da flag.
- Atualize o registro de infra: versão em produção (backend 2.29.0, frontend 2.28.0), tags de rollback e caminho do dump.
- Se a cobrança foi ligada, anote a data e o resultado da verificação pós-ligar.
