# Deploy do Triluga v2.8.0 (destaque via Asaas) — roteiro para o agente de infra

Escrito para: o agente que opera a VPS (`31.220.104.87`, compose project `triluga` em `/root/Triluga`). Script de apoio: [`triluga-deploy-v2.8.0.sh`](./triluga-deploy-v2.8.0.sh). Contexto da entrega: [`docs/releases/v2.8.0.md`](../releases/v2.8.0.md), spec e plano em `docs/superpowers/`.

**Esta entrega altera dinheiro e banco.** Siga na ordem, pare se qualquer verificação falhar e avise o dono.

## 0. Regras
- A VPS é compartilhada com Lumen e SelahIA e tem outro agente atuando. **Não faça dois deploys ao mesmo tempo** e não toque em nada que não seja o Triluga.
- Nunca imprima, copie para log ou grave a chave do Asaas. O script só imprime prefixo e tamanho.
- Antes de qualquer mudança no nginx: backup do arquivo (`cp arq arq.bak-$(date +%s)`) e `nginx -t`.
- Rode o script em `nohup`/`tmux` (o build é longo). Copie-o com `scp` e rode com `bash` — nada de heredoc via ssh.

## 1. Decisão do dono antes de começar: o que vai junto
`master` contém, desde o último deploy (`03d2130`), commits de **três frentes**. O deploy leva o `HEAD` inteiro, então o dono precisa confirmar:

| Frente | Commits | Observação |
|---|---|---|
| Home para motorista de app + cidade como seletor | `6768051`, `c9792dd` | prontas, verificadas |
| Correção de moeda pt-BR | `3f858ac` | frente paralela (outro agente) |
| **Destaque via Asaas** | `6f89b64` … `12cc87a`, `e90a30b` e docs | esta entrega |
| Mobile: km, seguro, mecânica, Detran | `fd6f1e4` | frente paralela; **confirmar se está pronta** — se não, deploy do SHA anterior (`e90a30b`) |

O SHA a implantar é o que o dono confirmar; anote-o: `__________`.

## 2. Pré-requisitos (dono + infra)
1. **Código na VPS.** O clone `/root/Triluga` puxa do GitHub, então o dono precisa autorizar o push (hoje há ~20 commits só locais).
   - Se o dono aprovou o `HEAD` inteiro: `git push origin master` e, na VPS, `cd /root/Triluga && git pull --ff-only origin master`.
   - Se aprovou só até um SHA anterior (ex.: sem o commit mobile pendente): no repositório do dono, `git push origin <SHA>:refs/heads/release/v2.8.0`, e na VPS `git fetch origin && git checkout release/v2.8.0` (volte para `master` depois do deploy, quando tudo estiver aprovado).
   - Sem push (último recurso): `git archive <SHA> | ssh root@<vps> 'tar -x -C /root/Triluga'` deixa o clone da VPS divergente do GitHub.
2. **`.env` da VPS** (`/root/Triluga/.env`, `chmod 600`), editado **pelo dono ou por você, nunca colado em chat**:
   ```
   ASAAS_API_KEY='$aact_prod_<chave>'     # ASPAS SIMPLES: a chave começa com '$', que o Compose interpreta como variável
   ASAAS_BASE_URL=https://api.asaas.com/v3 # sem isso o padrão do compose é SANDBOX e a chave de produção é recusada
   ASAAS_WEBHOOK_TOKEN=<openssl rand -hex 24>
   ```
   (Forma equivalente: `ASAAS_API_KEY=$$aact_prod_<chave>`.) Se existir `ASAAS_TIMEOUT_MS`, o padrão é 10000. **Não** ponha chave nenhuma no compose versionado.
3. **Chave restrita ao IP da VPS** no painel do Asaas, se a opção existir (endurecimento recomendado).
4. Consultar com o dono os **pedidos de destaque `PENDING`** (o preflight lista). A migration os **cancela**: alguém pode ter pago por PIX estático e estar esperando ativação manual. Cada um precisa ser resolvido (ativar pelo admin ou confirmar que pode cancelar) **antes** do deploy.

## 3. Execução
```bash
scp docs/runbooks/triluga-deploy-v2.8.0.sh root@<vps>:/root/
ssh root@<vps>
cd /root && bash triluga-deploy-v2.8.0.sh preflight        # tudo [ok]? se houver [FALHA], pare
ACK_PENDING=1 nohup bash triluga-deploy-v2.8.0.sh deploy > deploy.log 2>&1 &
tail -f deploy.log                                         # pg_dump -> tags pre-<TS> -> build -> up -> healthcheck
PUBLIC_API=https://<dominio-da-api>/api/v1 bash triluga-deploy-v2.8.0.sh smoke
```
O `deploy` faz: pg_dump em `/root/backups/triluga-pre-deploy-<TS>.sql.gz`, tags `triluga-{backend,frontend}:pre-<TS>`, build, `up -d --no-deps backend frontend` (o CMD roda `prisma migrate deploy`; log silencioso = sucesso), healthcheck em `GET /api/v1/vehicles` e, se falhar, volta as imagens (só código) e avisa sobre o banco.

O `smoke` precisa terminar com `== smoke OK ==`. Ele confere, entre outros: versão do backend, `featured/plans` e `vehicles/cities` em 200, `stats` com as chaves novas, **webhook sem token = 403** (loopback e público), a chave **de produção** efetivamente recebida no container (prefixo `$aact_prod_` — é o teste real do problema do `$`), colunas de `FeaturedOrder` (`paymentId`, sem `txid`/`pixKey`) e migration concluída.

## 4. Webhook de produção no painel do Asaas
Painel do Asaas (produção) → Integrações → Webhooks → novo (se o menu tiver outro nome, procure "Webhooks"):
- **URL:** `https://<dominio-da-api>/api/v1/featured/webhook/asaas`
- **Token de autenticação:** o mesmo `ASAAS_WEBHOOK_TOKEN` do `.env` (aparece no Asaas como header `asaas-access-token`).
- **Fila sequencial:** ligada. **E-mail** para avisos: o do dono.
- **Eventos:** `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` (ativam o destaque); `PAYMENT_REFUNDED`, `PAYMENT_REVERSED`, `PAYMENT_DELETED` e `PAYMENT_CHARGEBACK_*` (só geram log; DELETED de pedido não ativo é informativo).
- O sandbox **não** serve de referência para o painel de produção: o webhook de sandbox (se existir) é separado.

## 5. Primeiro teste real (dono, valor real)
Com a própria conta do dono, em um anúncio dele:
1. Promover → plano 7 dias (R$ 29,90) → aparece o QR e o copia-e-cola. Pagar o PIX.
2. Em segundos o painel mostra **"Ativo"** com a data de expiração, e o anúncio aparece em destaque. No servidor:
   `docker compose logs --since 5m backend | grep -iE "ativado via webhook|ERROR"` → esperado `Pedido <id> ativado via webhook Asaas`; e
   `docker compose exec -T postgres psql -U triluga -d triluga -c "SELECT id,status,\"paymentId\",\"expiresAt\" FROM \"FeaturedOrder\" ORDER BY \"createdAt\" DESC LIMIT 3;"`.
3. **Cancelamento:** criar outro pedido e cancelar antes de pagar → some do painel e a cobrança aparece como removida no Asaas.
4. **Opcional (valida estorno):** estornar o PIX de teste no painel do Asaas → o backend deve logar `ERROR ... PAYMENT_REFUNDED` com o orderId (o destaque **não** é desativado sozinho — lacuna conhecida; desative pelo admin: `PATCH /admin/vehicles/:id/feature` com `{ "featured": false }`).
Se o pedido **não** ativar: `docker compose logs backend | grep -i webhook` (403 = token diferente entre `.env` e painel; nada chegando = URL/nginx; "valor divergente" = veja a mensagem), e o painel do Asaas mostra a fila de webhooks. Recuperação imediata: ativar o pedido pelo admin (`PATCH /admin/featured-orders/:id/activate`).

## 6. Rollback
- **Só código** (o banco continua compatível com o código antigo? **Não**: a migration renomeou `txid` e removeu `pixKey`, e o código antigo os usa em `/featured`): `bash triluga-deploy-v2.8.0.sh rollback <TS>` **e** `CONFIRM=1 bash triluga-deploy-v2.8.0.sh rollback-db` (SQL reverso; os `PENDING` cancelados **não** voltam sozinhos).
- **Total:** restaurar `/root/backups/triluga-pre-deploy-<TS>.sql.gz` e as imagens `pre-<TS>`.
- Decida com o dono antes: reverter volta o destaque ao fluxo antigo (chave PIX estática, ativação manual).

## 7. Depois
- Avisar o dono com: SHA implantado, `<TS>`, resultado do `smoke`, e o resultado do primeiro teste real.
- Atualizar a memória/registro de infra (versão em produção, tags de rollback, dump).
- Remover o `/root/asaas-validation` e o bloco de nginx da captura de sandbox, se a validação do webhook em sandbox foi feita antes (`backend/scripts/asaas-sandbox/README.md`).
