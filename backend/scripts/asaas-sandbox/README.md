# Validação do webhook do Asaas (sandbox) na VPS

Objetivo: capturar um webhook **real** do sandbox do Asaas e conferir o header e o formato do payload que o `handleAsaasWebhook` espera (`backend/src/featured/featured.service.ts`). Hoje o código segue a documentação pública; isto confirma na prática.

**Não sobe o backend do Triluga e não toca no banco.** Um servidor mínimo só grava o que chega. Zero dependências (Node puro).

> **Por que não usar o backend de produção com a chave de sandbox?** Usuários reais receberiam um PIX de sandbox, que não pode ser pago. Por isso a captura roda à parte.

## Regras de segurança
- A chave de **sandbox** vai só em variável de ambiente (`ASAAS_API_KEY`). Nunca em arquivo, `.env` ou log. Os scripts recusam `ASAAS_BASE_URL` que não seja de sandbox.
- Trate a chave que foi colada em chat como exposta: gere outra no painel do sandbox antes de começar e revogue ao terminar.
- O caminho público do webhook é um segredo longo e aleatório; o servidor responde 404 para qualquer outro caminho/método. O valor do token **nunca** é gravado (só se bate ou não).
- A VPS é compartilhada com Lumen e SelahIA e tem outro agente atuando: **não rodar deploy ao mesmo tempo, não mexer em nada deles**, fazer backup de qualquer arquivo do nginx antes de editar.

## Passo a passo (agente de infra)

1. **Copiar** esta pasta para a VPS (o clone `/root/Triluga` só tem o que já foi enviado ao GitHub, e estes scripts ainda não foram): `scp -r backend/scripts/asaas-sandbox root@<vps>:/root/asaas-validation`. Node 18+ é necessário (`node -v`; se não houver no host, usar `docker run --rm -it --network host -v /root/asaas-validation:/w -w /w node:20 ...`).
2. **Gerar os segredos** (anote só em variáveis do shell da sessão):
   ```bash
   export WEBHOOK_TOKEN=$(openssl rand -hex 24)            # 48 chars (o Asaas exige 32+)
   export CAPTURE_PATH=/hook-$(openssl rand -hex 16)       # caminho secreto
   ```
3. **Subir o servidor de captura** (loopback, porta livre — confirme com `ss -ltn | grep 3099`):
   ```bash
   cd /root/asaas-validation
   PORT=3099 nohup node capture-server.js > server.log 2>&1 &
   echo $! > capture.pid
   ```
4. **Expor só esse caminho no nginx**, dentro do bloco `443` do domínio do Triluga (descubra qual arquivo em `/etc/nginx/sites-enabled/`). Backup primeiro (`cp arquivo arquivo.bak-$(date +%s)`), depois, dentro do `server { ... }`:
   ```nginx
   location = /hook-XXXXXXXX {          # o CAPTURE_PATH exato
       client_max_body_size 1m;
       proxy_pass http://127.0.0.1:3099;
   }
   ```
   `nginx -t && systemctl reload nginx`.
5. **Conferir de fora** (deve dar 200 com o POST e 404 com GET):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<dominio>$CAPTURE_PATH" -H "asaas-access-token: $WEBHOOK_TOKEN" -H 'content-type: application/json' -d '{"event":"TESTE"}'
   ```
   Depois apague essa linha de teste do `captured.jsonl` (ou apague o arquivo).
6. **Registrar o webhook no sandbox e gerar eventos** (a chave de sandbox em `ASAAS_API_KEY`):
   ```bash
   export ASAAS_API_KEY='<chave de sandbox>'           # só no shell
   WEBHOOK_URL="https://<dominio>$CAPTURE_PATH" WEBHOOK_EMAIL='<email do dono>' node register-webhook.js register   # anote o id
   node trigger-events.js
   ```
7. **Coletar o resultado**: `cat captured.jsonl` e `cat server.log`. **Esperado**: `PAYMENT_CREATED` ×2, `PAYMENT_RECEIVED` ×1 (cobrança A, "recebida em dinheiro") e `PAYMENT_DELETED` ×1 (cobrança B), todos com `tokenMatches: true` e `asaas-access-token` em `headerNames`. Se vier 0 eventos: `node register-webhook.js list` (a fila pode ter ficado `interrupted: true`) e `server.log`.
8. **Opcional, mais fiel**: se o painel do sandbox permitir *simular pagamento* de um PIX, crie uma cobrança, pague pelo painel e capture o `PAYMENT_RECEIVED` com `billingType: PIX` (o `trigger-events.js` usa "recebido em dinheiro", que é parecido mas não idêntico).
9. **Limpar tudo**:
   ```bash
   node register-webhook.js delete <id>      # remove o webhook do sandbox
   kill $(cat capture.pid)
   # remover o bloco `location` do nginx, nginx -t && systemctl reload nginx
   # guardar uma cópia do captured.jsonl (não contém o token) e então apagar /root/asaas-validation
   unset WEBHOOK_TOKEN CAPTURE_PATH ASAAS_API_KEY
   ```
   E revogar a chave de sandbox no painel do Asaas.

## O que o `captured.jsonl` deve responder
| Pergunta | Onde olhar | O código assume |
|---|---|---|
| O header é mesmo `asaas-access-token`? | `headerNames`, `tokenMatches` | sim (`@Headers('asaas-access-token')`) |
| O corpo traz `event` e `payment`? | `body.event`, `body.payment` | sim |
| `payment.id`, `payment.value` (número), `payment.externalReference`, `payment.status` | `body.payment` | usados na ativação e na conferência de valor |
| `externalReference` é o id do nosso pedido? | em `trigger-events.js` é `order-webhook-A-<ts>` | idem, no fluxo real é o `orderId` |
| Eventos extras ou ordem inesperada? | sequência no arquivo | só `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` ativam |

Devolva o `captured.jsonl` a quem desenvolveu: ele vira fixture dos testes e, se o formato divergir, o handler é ajustado antes do deploy.

## Fora do escopo
- Deploy da v2.8.0 (siga `docs/releases/v2.8.0.md`). **Atenção:** sem uma chave Asaas de **produção** configurada, criar destaque devolve 503 — o caminho manual antigo (chave PIX estática) deixa de existir. Decida o momento do deploy com isso em mente.
- Validar um PIX realmente pago (a chave de API de sandbox não tem permissão para pagar QR pela API).
