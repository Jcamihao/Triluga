#!/usr/bin/env bash
# Deploy do Triluga v2.8.0 (destaque via Asaas) na VPS.
# Uso (em /root, copiado por scp; NÃO via heredoc):
#   bash triluga-deploy-v2.8.0.sh preflight        # só leitura
#   ACK_PENDING=1 bash triluga-deploy-v2.8.0.sh deploy   # backup, build, up, healthcheck (+rollback de código se falhar)
#   bash triluga-deploy-v2.8.0.sh smoke            # verificações pós-deploy
#   bash triluga-deploy-v2.8.0.sh rollback <TS>    # volta as imagens para pre-<TS>
#   CONFIRM=1 bash triluga-deploy-v2.8.0.sh rollback-db   # SQL reverso da migration (só se precisar)
# Nenhum comando imprime segredos. Rode em nohup/tmux para o build não ser morto por timeout.
set -uo pipefail
cd /root/Triluga || { echo "FALHA: /root/Triluga não existe"; exit 1; }

DC="docker compose"
BACKEND_C="triluga-backend-1"
API="http://127.0.0.1:3002/api/v1"
MIGRATION="20261011120000_featured_asaas_payment"
ok()   { echo "  [ok]   $*"; }
warn() { echo "  [ATENÇÃO] $*"; }
fail() { echo "  [FALHA] $*"; FAILED=1; }
FAILED=0

psql_q() { $DC exec -T postgres psql -U triluga -d triluga -At -c "$1" </dev/null; }
env_val() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }

preflight() {
  echo "== preflight (somente leitura) =="
  echo "- código no servidor: $(git rev-parse --short HEAD) | backend/package.json: $(grep -m1 '"version"' backend/package.json | tr -d ' ,')"
  running=$(docker exec "$BACKEND_C" node -e "console.log(require('/app/package.json').version)" 2>/dev/null || echo "?")
  echo "- versão rodando agora (backend): $running"
  git status --short | grep -v '^??' | head -5 | sed 's/^/  alterações locais: /'

  # .env — nunca imprime valores
  key=$(env_val ASAAS_API_KEY); base=$(env_val ASAAS_BASE_URL); tok=$(env_val ASAAS_WEBHOOK_TOKEN)
  [ -n "$key" ] && ok "ASAAS_API_KEY definida no .env" || fail "ASAAS_API_KEY ausente no .env"
  case "$key" in
    "'\$aact_prod_"*|"\$\$aact_prod_"*) ok "ASAAS_API_KEY é de produção e protegida contra interpolação ('...' ou \$\$)" ;;
    "\$aact_prod_"*) warn "chave de produção com '\$' solto: o Compose interpreta como variável e ela chega VAZIA. Use ASAAS_API_KEY='\$aact_prod_...' (aspas simples) ou \$\$aact_prod_..." ;;
    *hmlg*) fail "ASAAS_API_KEY parece ser de SANDBOX" ;;
    "") ;;
    *) warn "formato inesperado da ASAAS_API_KEY (esperado começar com \$aact_prod_)" ;;
  esac
  [ "$base" = "https://api.asaas.com/v3" ] && ok "ASAAS_BASE_URL = produção" || fail "ASAAS_BASE_URL deve ser https://api.asaas.com/v3 (o padrão do compose é SANDBOX)"
  [ "${#tok}" -ge 32 ] && ok "ASAAS_WEBHOOK_TOKEN com 32+ caracteres" || fail "ASAAS_WEBHOOK_TOKEN ausente ou curto (openssl rand -hex 24)"
  [ "$(stat -c %a .env)" = "600" ] && ok ".env com permissão 600" || warn ".env não está 600"

  $DC config -q </dev/null 2>/dev/null && ok "docker compose config válido" || fail "docker compose config falhou"
  if pgrep -af "docker compose (build|up)" | grep -v pgrep >/dev/null; then fail "há outro docker compose build/up rodando (não faça dois deploys ao mesmo tempo)"; else ok "nenhum outro deploy em andamento"; fi
  df -h / | tail -1 | awk '{print "- disco: "$4" livres ("$5" usado)"}'

  # banco
  n=$(psql_q "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null)
  if [ -n "$n" ]; then ok "_prisma_migrations existe ($n migrations registradas)"; else fail "_prisma_migrations NÃO existe — o caminho P3005 do Dockerfile marcaria migrations sem rodar; NÃO faça o deploy sem avaliar"; fi
  pend=$(psql_q "SELECT count(*) FROM \"FeaturedOrder\" WHERE status='PENDING';" 2>/dev/null)
  echo "- pedidos de destaque PENDING: ${pend:-?}"
  if [ "${pend:-0}" != "0" ]; then
    warn "a migration CANCELA todos os PENDING. Resolva cada um com o dono antes (alguém pode ter pago por PIX estático):"
    psql_q "SELECT id, \"userId\", \"vehicleId\", price, \"createdAt\" FROM \"FeaturedOrder\" WHERE status='PENDING' ORDER BY \"createdAt\";" | sed 's/^/    /'
  fi
  psql_q "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$MIGRATION';" | grep -q '^0$' && ok "migration $MIGRATION ainda não aplicada (esperado)" || warn "migration $MIGRATION já consta como aplicada"
  [ "$FAILED" = 0 ] && echo "== preflight OK ==" || echo "== preflight com FALHAS: corrija antes do deploy =="
  return $FAILED
}

deploy() {
  echo "== deploy =="
  [ "${ACK_PENDING:-}" = "1" ] || { echo "Defina ACK_PENDING=1 depois de resolver os pedidos PENDING com o dono (veja o preflight)."; exit 2; }
  preflight || { echo "Abortado: preflight falhou."; exit 1; }
  TS=$(date +%Y%m%d-%H%M%S); echo "$TS" > /root/.triluga-deploy-ts
  mkdir -p /root/backups
  echo "- pg_dump -> /root/backups/triluga-pre-deploy-$TS.sql.gz"
  $DC exec -T postgres pg_dump -U triluga triluga </dev/null | gzip > "/root/backups/triluga-pre-deploy-$TS.sql.gz"
  [ -s "/root/backups/triluga-pre-deploy-$TS.sql.gz" ] || { echo "FALHA: dump vazio"; exit 1; }
  for s in backend frontend; do
    docker image inspect "triluga-$s:latest" >/dev/null 2>&1 || { echo "FALHA: imagem triluga-$s:latest não encontrada (ajuste o nome)"; exit 1; }
    docker tag "triluga-$s:latest" "triluga-$s:pre-$TS"
  done
  echo "- tags de rollback: pre-$TS"
  echo "- build (pode levar vários minutos)"
  $DC build backend frontend </dev/null || { echo "FALHA no build — nada foi trocado."; exit 1; }
  echo "- subindo backend e frontend"
  $DC up -d --no-deps backend frontend </dev/null
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$API/vehicles" || true)
    [ "$code" = "200" ] && { echo "- healthcheck OK (tentativa $i)"; echo "== deploy concluído (TS=$TS). Rode: bash $0 smoke =="; return 0; }
    sleep 3
  done
  echo "FALHA no healthcheck — voltando as imagens para pre-$TS (código apenas)"
  rollback "$TS"
  echo "ATENÇÃO: se a migration já tinha rodado, o banco está no esquema NOVO. Veja 'rollback-db' ou restaure o dump /root/backups/triluga-pre-deploy-$TS.sql.gz."
  exit 1
}

smoke() {
  echo "== smoke =="
  v=$(docker exec "$BACKEND_C" node -e "console.log(require('/app/package.json').version)" 2>/dev/null || echo "?"); echo "- versão do backend rodando: $v (esperado: a de backend/package.json = $(grep -m1 '"version"' backend/package.json | tr -d ' ,"version:'))"
  c() { curl -s -o /dev/null -w '%{http_code}' "$@" || echo 000; }
  [ "$(c "$API/vehicles")" = "200" ] && ok "GET /vehicles 200" || fail "GET /vehicles"
  [ "$(c "$API/featured/plans")" = "200" ] && ok "GET /featured/plans 200" || fail "GET /featured/plans"
  [ "$(c "$API/vehicles/cities")" = "200" ] && ok "GET /vehicles/cities 200" || fail "GET /vehicles/cities"
  curl -s "$API/vehicles/stats" | grep -q '"economy"' && ok "stats com as novas chaves" || fail "stats sem as novas chaves"
  [ "$(c -X POST "$API/featured/webhook/asaas")" = "403" ] && ok "webhook sem token -> 403 (loopback)" || fail "webhook sem token deveria dar 403"
  if [ -n "${PUBLIC_API:-}" ]; then
    [ "$(c -X POST "$PUBLIC_API/featured/webhook/asaas")" = "403" ] && ok "webhook sem token -> 403 (público: $PUBLIC_API)" || fail "webhook público não respondeu 403 (nginx?)"
  else warn "defina PUBLIC_API=https://<dominio>/api/v1 para testar a rota pública"; fi
  # chave dentro do container: só prefixo e tamanho
  pre=$($DC exec -T backend sh -c 'printf %s "$ASAAS_API_KEY" | cut -c1-11' </dev/null); len=$($DC exec -T backend sh -c 'printf %s "${#ASAAS_API_KEY}"' </dev/null)
  [ "$pre" = '$aact_prod_' ] && ok "container recebeu a chave de produção (tamanho $len)" || fail "container NÃO tem chave de produção (prefixo '$pre', tamanho ${len:-0}) — veja aspas simples no .env"
  base=$($DC exec -T backend sh -c 'printf %s "$ASAAS_BASE_URL"' </dev/null); [ "$base" = "https://api.asaas.com/v3" ] && ok "ASAAS_BASE_URL de produção no container" || fail "ASAAS_BASE_URL no container: $base"
  psql_q "SELECT column_name FROM information_schema.columns WHERE table_name='FeaturedOrder' AND column_name IN ('paymentId','txid','pixKey') ORDER BY 1;" | tr '\n' ' ' | grep -q '^paymentId $' && ok "FeaturedOrder tem paymentId e não tem txid/pixKey" || fail "colunas de FeaturedOrder inesperadas"
  psql_q "SELECT finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name='$MIGRATION';" | grep -q '^t$' && ok "migration $MIGRATION concluída" || fail "migration $MIGRATION não concluída"
  e=$($DC logs --since 10m backend </dev/null 2>&1 | grep -ciE ' ERROR |webhooks serão recusados'); [ "$e" = "0" ] && ok "sem ERROR / aviso de token nos logs recentes" || warn "$e linha(s) de ERROR/aviso nos logs: $DC logs --since 10m backend | grep -iE ' ERROR |webhooks'"
  [ "$FAILED" = 0 ] && echo "== smoke OK ==" || echo "== smoke com FALHAS =="
  return $FAILED
}

rollback() {
  TS="${1:-$(cat /root/.triluga-deploy-ts 2>/dev/null)}"; [ -n "$TS" ] || { echo "informe o TS"; exit 1; }
  echo "== rollback de código para pre-$TS =="
  for s in backend frontend; do docker tag "triluga-$s:pre-$TS" "triluga-$s:latest" || exit 1; done
  $DC up -d --no-deps --force-recreate backend frontend </dev/null
}

rollback_db() {
  [ "${CONFIRM:-}" = "1" ] || { echo "Defina CONFIRM=1. Isto desfaz o esquema da migration (NÃO restaura os PENDING cancelados; para isso use o dump)."; exit 2; }
  psql_q "ALTER TABLE \"FeaturedOrder\" RENAME COLUMN \"paymentId\" TO \"txid\"; ALTER INDEX IF EXISTS \"FeaturedOrder_paymentId_key\" RENAME TO \"FeaturedOrder_txid_key\"; ALTER TABLE \"FeaturedOrder\" ADD COLUMN IF NOT EXISTS \"pixKey\" TEXT; DELETE FROM _prisma_migrations WHERE migration_name='$MIGRATION';"
  echo "esquema revertido (rode agora o rollback de código se ainda não rodou)"
}

case "${1:-}" in
  preflight) preflight ;;
  deploy) deploy ;;
  smoke) smoke ;;
  rollback) rollback "${2:-}" ;;
  rollback-db) rollback_db ;;
  *) sed -n '2,10p' "$0"; exit 2 ;;
esac
