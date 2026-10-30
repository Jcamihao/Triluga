#!/usr/bin/env bash
# Deploy do Triluga v2.9.0 (preço por diária) na VPS.
# Uso (em /root, copiado por scp; NÃO via heredoc). Código novo já em /root/Triluga (git pull/checkout), containers ainda antigos:
#   bash preco-diaria-deploy.sh preflight                      # SÓ LEITURA
#   ACK_DUMP=1 bash preco-diaria-deploy.sh deploy              # pg_dump (gate), tags pre-<TS>, build, up, healthcheck
#       (se o preflight mandou PARAR por divergência de preço: ACK_OWNER=1 também, só depois do dono aprovar)
#   PUBLIC_API=https://<dominio>/api/v1 bash preco-diaria-deploy.sh smoke   # SÓ LEITURA
#   bash preco-diaria-deploy.sh check-test <id-do-anuncio-de-teste>         # SÓ LEITURA
#   CONFIRM=1 bash preco-diaria-deploy.sh rollback-code <TS>   # só imagens; NÃO restaura o banco (ver runbook)
#   CONFIRM=1 bash preco-diaria-deploy.sh rollback-full <TS>   # DESTRUTIVO: recria o banco a partir do dump + imagens pre-<TS>
# Nenhum comando imprime segredos. Rode deploy em nohup/tmux (o build é longo).
set -uo pipefail
cd /root/Triluga || { echo "FALHA: /root/Triluga não existe"; exit 1; }

DC="docker compose"
BACKEND_C="triluga-backend-1"
API="http://127.0.0.1:3002/api/v1"
MIGRATION="20261015120000_vehicle_daily_rate_min_rental"
BACKUPS="/root/backups"
ok()   { echo "  [ok]   $*"; }
warn() { echo "  [ATENÇÃO] $*"; }
fail() { echo "  [FALHA] $*"; FAILED=1; }
FAILED=0
STOP_OWNER=0

psql_q() { $DC exec -T postgres psql -U triluga -d triluga -At -c "$1" </dev/null; }

preflight() {
  echo "== preflight (somente leitura) =="
  echo "- código no servidor: $(git rev-parse --short HEAD) | backend/package.json: $(grep -m1 '"version"' backend/package.json | tr -d ' ,') | frontend/package.json: $(grep -m1 '"version"' frontend/package.json | tr -d ' ,')"
  running=$(docker exec "$BACKEND_C" node -e "console.log(require('/app/package.json').version)" 2>/dev/null || echo "?")
  echo "- versão rodando agora (backend): $running"
  git status --short | grep -v '^??' | head -5 | sed 's/^/  alterações locais: /'
  [ -d "backend/prisma/migrations/$MIGRATION" ] && ok "código na VPS contém a migration $MIGRATION" || fail "migration $MIGRATION ausente no código da VPS (faltou git pull/checkout?)"

  $DC config -q </dev/null 2>/dev/null && ok "docker compose config válido" || fail "docker compose config falhou"
  if pgrep -af "docker compose (build|up)" | grep -v pgrep >/dev/null; then fail "há outro docker compose build/up rodando (não faça dois deploys ao mesmo tempo)"; else ok "nenhum outro deploy em andamento"; fi
  df -h / | tail -1 | awk '{print "- disco: "$4" livres ("$5" usado)"}'

  # (a) versão do PostgreSQL: a migration usa trim_scale (>= 13)
  sv=$(psql_q "SHOW server_version;" 2>/dev/null); svn=$(psql_q "SHOW server_version_num;" 2>/dev/null)
  if [ -n "$svn" ] && [ "$svn" -ge 130000 ] 2>/dev/null; then ok "PostgreSQL $sv (>= 13, trim_scale disponível)"; else fail "PostgreSQL '${sv:-?}' < 13 ou ilegível: a migration usa trim_scale"; fi

  # (b) _prisma_migrations completa
  n=$(psql_q "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null)
  if [ -n "$n" ]; then
    ok "_prisma_migrations existe ($n registradas)"
    missing=0
    for d in backend/prisma/migrations/*/; do
      m=$(basename "$d")
      [ "$m" = "$MIGRATION" ] && continue
      c=$(psql_q "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$m' AND finished_at IS NOT NULL;" 2>/dev/null)
      [ "$c" = "1" ] || { fail "migration anterior NÃO consta como concluída: $m (prisma migrate resolve --applied $m, só se o esquema já a contém)"; missing=1; }
    done
    [ "$missing" = 0 ] && ok "todas as migrations anteriores constam como concluídas"
  else
    fail "_prisma_migrations NÃO existe — o caminho P3005 do Dockerfile marcaria migrations sem rodar; NÃO faça o deploy sem avaliar"
  fi
  c=$(psql_q "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$MIGRATION';" 2>/dev/null)
  [ "$c" = "0" ] && ok "migration $MIGRATION ainda não aplicada (esperado)" || warn "migration $MIGRATION já consta como aplicada"

  # preços: a conversão assume preço visível = weeklyRate ?? dailyRate
  echo "- preços dos anúncios (total | sem_semanal | semanal_diferente):"
  row=$(psql_q "SELECT count(*), count(*) FILTER (WHERE \"weeklyRate\" IS NULL), count(*) FILTER (WHERE \"weeklyRate\" IS NOT NULL AND \"weeklyRate\" <> \"dailyRate\") FROM \"Vehicle\";" 2>/dev/null)
  echo "    $row"
  sem=$(echo "$row" | cut -d'|' -f2); dif=$(echo "$row" | cut -d'|' -f3)
  if [ -z "$row" ]; then
    fail "não consegui ler Vehicle.weeklyRate (a migration já rodou? banco inacessível?)"
  elif [ "${sem:-0}" != "0" ] || [ "${dif:-0}" != "0" ]; then
    STOP_OWNER=1
    echo "  [PARE] sem_semanal=$sem semanal_diferente=$dif: PARE e MOSTRE AO DONO antes de seguir (a conversão assume que o preço visível é weeklyRate ?? dailyRate). Amostra:"
    psql_q "SELECT id, \"dailyRate\", \"weeklyRate\" FROM \"Vehicle\" WHERE \"weeklyRate\" IS NULL OR \"weeklyRate\" <> \"dailyRate\" ORDER BY \"createdAt\" LIMIT 20;" | sed 's/^/    /'
    if [ "${ACK_OWNER:-}" = "1" ]; then warn "ACK_OWNER=1: dono já viu a divergência e aprovou"; else fail "divergência de preço sem aprovação do dono (use ACK_OWNER=1 só depois de ele aprovar)"; fi
  else
    ok "todos os anúncios têm weeklyRate igual ao dailyRate: conversão sem surpresa"
  fi

  # alertas
  echo "- alertas de busca:"
  echo "    com minPrice/maxPrice (serão convertidos): $(psql_q "SELECT count(*) FROM \"SearchAlert\" WHERE jsonb_typeof(filters)='object' AND (filters ? 'minPrice' OR filters ? 'maxPrice');" 2>/dev/null)"
  bad=$(psql_q "SELECT count(*) FROM \"SearchAlert\" WHERE jsonb_typeof(filters)='object' AND ((filters ? 'minPrice' AND (filters->>'minPrice') IS DISTINCT FROM NULL AND (filters->>'minPrice') !~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*\$') OR (filters ? 'maxPrice' AND (filters->>'maxPrice') IS DISTINCT FROM NULL AND (filters->>'maxPrice') !~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*\$') OR (filters ? 'minPrice' AND (filters->>'minPrice') IS NULL) OR (filters ? 'maxPrice' AND (filters->>'maxPrice') IS NULL));" 2>/dev/null)
  echo "    com valor de preço inválido (a migration DESCARTA em silêncio; se só um lado era válido o alerta fica mais largo): ${bad:-?}"
  [ "${bad:-0}" != "0" ] && { warn "alertas com preço inválido:"; psql_q "SELECT id, \"userId\", filters FROM \"SearchAlert\" WHERE jsonb_typeof(filters)='object' AND ((filters ? 'minPrice' AND ((filters->>'minPrice') IS NULL OR (filters->>'minPrice') !~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*\$')) OR (filters ? 'maxPrice' AND ((filters->>'maxPrice') IS NULL OR (filters->>'maxPrice') !~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*\$'))) LIMIT 20;" | sed 's/^/      /'; }
  dup=$(psql_q "SELECT count(*) FROM (SELECT 1 FROM \"SearchAlert\" WHERE jsonb_typeof(filters)='object' GROUP BY \"userId\", filters - 'minPrice' - 'maxPrice' - 'minDailyRate' - 'maxDailyRate', CASE WHEN (filters->>'minPrice') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*\$' THEN round((filters->>'minPrice')::numeric/7,2) ELSE (filters->>'minDailyRate')::numeric END, CASE WHEN (filters->>'maxPrice') ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*\$' THEN round((filters->>'maxPrice')::numeric/7,2) ELSE (filters->>'maxDailyRate')::numeric END HAVING count(*) > 1) t;" 2>/dev/null)
  echo "    grupos de alertas equivalentes após a conversão (queryHash não é recalculado: cada um notifica separado): ${dup:-?}"
  [ "${dup:-0}" != "0" ] && warn "há alertas que ficarão duplicados; avise o dono (não é bloqueante)"

  [ "$FAILED" = 0 ] && echo "== preflight OK ==" || echo "== preflight com FALHAS: corrija antes do deploy =="
  return $FAILED
}

deploy() {
  echo "== deploy =="
  [ "${ACK_DUMP:-}" = "1" ] || { echo "Defina ACK_DUMP=1: o pg_dump é gate obrigatório (rollback depende dele; a migration apaga weeklyRate e sobrescreve dailyRate)."; exit 2; }
  preflight || { echo "Abortado: preflight falhou."; exit 1; }
  TS=$(date +%Y%m%d-%H%M%S); echo "$TS" > /root/.triluga-deploy-ts
  mkdir -p "$BACKUPS"
  D="$BACKUPS/triluga-pre-deploy-$TS.sql.gz"
  echo "- pg_dump -> $D"
  $DC exec -T postgres pg_dump -U triluga triluga </dev/null | gzip > "$D"
  [ -s "$D" ] && gzip -t "$D" || { echo "FALHA: dump vazio ou corrompido — NADA foi alterado"; exit 1; }
  zcat "$D" | grep -q 'weeklyRate' || { echo "FALHA: o dump não contém weeklyRate (dump errado?) — NADA foi alterado"; exit 1; }
  echo "- dump ok ($(du -h "$D" | cut -f1)); snapshot de preços -> $BACKUPS/triluga-prices-$TS.psv (id|weeklyRate|dailyRate)"
  psql_q "SELECT id, COALESCE(\"weeklyRate\"::text,''), \"dailyRate\"::text FROM \"Vehicle\" ORDER BY id;" > "$BACKUPS/triluga-prices-$TS.psv"
  for s in backend frontend; do
    docker image inspect "triluga-$s:latest" >/dev/null 2>&1 || { echo "FALHA: imagem triluga-$s:latest não encontrada (ajuste o nome)"; exit 1; }
    docker tag "triluga-$s:latest" "triluga-$s:pre-$TS"
  done
  echo "- tags de rollback: triluga-{backend,frontend}:pre-$TS"
  echo "- build (pode levar vários minutos)"
  $DC build backend frontend </dev/null || { echo "FALHA no build — nada foi trocado."; exit 1; }
  echo "- subindo backend e frontend JUNTOS (o CMD roda prisma migrate deploy)"
  $DC up -d --no-deps backend frontend </dev/null
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$API/vehicles" || true)
    [ "$code" = "200" ] && { echo "- healthcheck OK (tentativa $i)"; echo "== deploy concluído (TS=$TS). Rode: bash $0 smoke =="; return 0; }
    sleep 3
  done
  echo "FALHA no healthcheck. NÃO voltei nada sozinho: a migration pode já ter rodado e o código antigo NÃO funciona com o banco novo (sem weeklyRate)."
  echo "Veja os logs: $DC logs --tail 100 backend | grep -iE 'migrat|error'"
  echo "Se a migration NÃO rodou (banco antigo): CONFIRM=1 bash $0 rollback-code $TS"
  echo "Se a migration rodou: CONFIRM=1 bash $0 rollback-full $TS  (restaura $D)"
  exit 1
}

smoke() {
  echo "== smoke (somente leitura) =="
  v=$(docker exec "$BACKEND_C" node -e "console.log(require('/app/package.json').version)" 2>/dev/null || echo "?")
  echo "- versão do backend rodando: $v (esperado: $(grep -m1 '"version"' backend/package.json | cut -d'"' -f4))"
  c() { curl -s -o /dev/null -w '%{http_code}' "$@" || echo 000; }
  [ "$(c "$API/vehicles")" = "200" ] && ok "GET /vehicles 200" || fail "GET /vehicles"
  [ "$(c "$API/vehicles?minDailyRate=1&maxDailyRate=100000")" = "200" ] && ok "busca ?minDailyRate=&maxDailyRate= 200" || fail "busca por minDailyRate"
  [ "$(c "$API/vehicles?minPrice=7&maxPrice=700000")" = "200" ] && ok "busca legada ?minPrice=&maxPrice= 200 (compatibilidade)" || fail "busca legada"
  [ "$(c "$API/vehicles?maxPrice=")" = "200" ] && ok "parâmetro vazio ?maxPrice= aceito (ignorado)" || fail "?maxPrice= vazio"
  [ "$(c "$API/vehicles/cities")" = "200" ] && ok "GET /vehicles/cities 200" || fail "GET /vehicles/cities"
  if [ -n "${PUBLIC_API:-}" ]; then
    [ "$(c "$PUBLIC_API/vehicles?minDailyRate=1")" = "200" ] && ok "busca pública 200 ($PUBLIC_API)" || fail "busca pública não respondeu 200 (nginx?)"
  else warn "defina PUBLIC_API=https://<dominio>/api/v1 para testar a rota pública"; fi

  # detalhe de um anúncio: weeklyEstimate, monthlyEstimate, minRentalDays
  id=$(psql_q "SELECT id FROM \"Vehicle\" WHERE \"isActive\" ORDER BY \"createdAt\" DESC LIMIT 1;")
  if [ -n "$id" ]; then
    body=$(curl -s "$API/vehicles/$id")
    for k in dailyRate weeklyEstimate monthlyEstimate minRentalDays minPeriodTotal weeklyRate; do
      echo "$body" | grep -q "\"$k\"" && ok "GET /vehicles/$id traz $k" || fail "GET /vehicles/$id sem $k"
    done
    echo "    $(echo "$body" | grep -oE '"(dailyRate|weeklyEstimate|monthlyEstimate|minRentalDays|minPeriodTotal|weeklyRate)":[^,}]*' | tr '\n' ' ')"
  else warn "nenhum anúncio ativo para testar o detalhe"; fi

  # esquema e migration
  psql_q "SELECT column_name FROM information_schema.columns WHERE table_name='Vehicle' AND column_name IN ('weeklyRate','minRentalDays','dailyRate') ORDER BY 1;" | tr '\n' ' ' | grep -q '^dailyRate minRentalDays $' && ok "Vehicle tem dailyRate e minRentalDays e não tem weeklyRate" || fail "colunas de Vehicle inesperadas"
  psql_q "SELECT finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name='$MIGRATION';" | grep -q '^t$' && ok "migration $MIGRATION concluída" || fail "migration $MIGRATION não concluída"
  left=$(psql_q "SELECT count(*) FROM \"SearchAlert\" WHERE jsonb_typeof(filters)='object' AND (filters ? 'minPrice' OR filters ? 'maxPrice');")
  [ "$left" = "0" ] && ok "nenhum alerta com minPrice/maxPrice restante" || fail "$left alerta(s) ainda com minPrice/maxPrice"

  # 5 anúncios: dailyRate novo ≈ (weeklyRate ?? dailyRate antigo) / 7, usando o snapshot do deploy
  snap=$(ls -t "$BACKUPS"/triluga-prices-*.psv 2>/dev/null | head -1)
  if [ -n "$snap" ]; then
    echo "- 5 anúncios (antigo -> novo), snapshot $(basename "$snap"):"
    bad=0
    while IFS='|' read -r vid w d; do
      new=$(psql_q "SELECT \"dailyRate\" FROM \"Vehicle\" WHERE id='$vid';")
      [ -n "$new" ] || { echo "    $vid: não existe mais (removido depois do deploy?)"; continue; }
      exp=$(awk -v w="$w" -v d="$d" 'BEGIN{x=(w==""?d:w)/7; printf "%.2f", x}')
      if awk -v a="$new" -v b="$exp" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(d<=0.011)}'; then echo "    $vid: antigo=${w:-$d} -> dailyRate=$new (esperado ~$exp) ok"; else echo "    $vid: antigo=${w:-$d} -> dailyRate=$new (esperado ~$exp) DIVERGE (editado depois do deploy?)"; bad=1; fi
    done < <(head -5 "$snap")
    [ "$bad" = 0 ] && ok "os 5 anúncios conferem com antigo ÷ 7" || fail "algum anúncio diverge do antigo ÷ 7"
  else warn "snapshot de preços não encontrado em $BACKUPS; confira a mão (dailyRate ≈ antigo ÷ 7)"; fi

  e=$($DC logs --since 10m backend </dev/null 2>&1 | grep -ciE ' ERROR '); [ "$e" = "0" ] && ok "sem ERROR nos logs recentes" || warn "$e linha(s) de ERROR: $DC logs --since 10m backend | grep -i ' ERROR '"
  echo "- falta (manual): criar anúncio de teste pelo app (diária 100, mínimo 1 mês), rodar: bash $0 check-test <id>, e removê-lo (veja o runbook)"
  [ "$FAILED" = 0 ] && echo "== smoke OK ==" || echo "== smoke com FALHAS =="
  return $FAILED
}

check_test() {
  id="${1:-}"; [ -n "$id" ] || { echo "informe o id do anúncio de teste"; exit 1; }
  echo "== anúncio de teste $id (somente leitura) =="
  psql_q "SELECT \"dailyRate\", \"minRentalDays\" FROM \"Vehicle\" WHERE id='$id';"
  echo "- esperado para diária 100 e mínimo 1 mês: 100.00|30"
  body=$(curl -s "$API/vehicles/$id"); echo "    $(echo "$body" | grep -oE '"(dailyRate|weeklyEstimate|monthlyEstimate|minRentalDays|minPeriodTotal)":[^,}]*' | tr '\n' ' ')"
  echo "- esperado na API: dailyRate 100, weeklyEstimate 700, monthlyEstimate 3000, minRentalDays 30, minPeriodTotal 3000"
}

rollback_code() {
  [ "${CONFIRM:-}" = "1" ] || { echo "Defina CONFIRM=1. Isto volta SÓ as imagens; se a migration já rodou, o código antigo quebra (weeklyRate não existe mais). Para isso use rollback-full."; exit 2; }
  TS="${1:-$(cat /root/.triluga-deploy-ts 2>/dev/null)}"; [ -n "$TS" ] || { echo "informe o TS"; exit 1; }
  echo "== rollback de código para pre-$TS =="
  for s in backend frontend; do docker tag "triluga-$s:pre-$TS" "triluga-$s:latest" || exit 1; done
  $DC up -d --no-deps --force-recreate backend frontend </dev/null
}

rollback_full() {
  [ "${CONFIRM:-}" = "1" ] || { echo "Defina CONFIRM=1. DESTRUTIVO: apaga o banco 'triluga' e o recria a partir de $BACKUPS/triluga-pre-deploy-<TS>.sql.gz (perde tudo o que entrou depois do dump). Avise o dono antes."; exit 2; }
  TS="${1:-$(cat /root/.triluga-deploy-ts 2>/dev/null)}"; [ -n "$TS" ] || { echo "informe o TS"; exit 1; }
  D="$BACKUPS/triluga-pre-deploy-$TS.sql.gz"
  [ -s "$D" ] && gzip -t "$D" || { echo "FALHA: dump $D ausente ou corrompido — NADA foi alterado"; exit 1; }
  for s in backend frontend; do docker image inspect "triluga-$s:pre-$TS" >/dev/null 2>&1 || { echo "FALHA: imagem triluga-$s:pre-$TS ausente — NADA foi alterado"; exit 1; }; done
  echo "== rollback total para pre-$TS =="
  $DC stop backend frontend </dev/null
  $DC exec -T postgres psql -U triluga -d postgres -c 'DROP DATABASE IF EXISTS triluga WITH (FORCE);' </dev/null || { echo "FALHA ao apagar o banco"; exit 1; }
  $DC exec -T postgres psql -U triluga -d postgres -c 'CREATE DATABASE triluga OWNER triluga;' </dev/null || { echo "FALHA ao criar o banco (restaure à mão com o dump!)"; exit 1; }
  zcat "$D" | $DC exec -T postgres psql -U triluga -d triluga -v ON_ERROR_STOP=1 -q || { echo "FALHA na restauração — banco incompleto! Mantenha backend parado e avise o dono"; exit 1; }
  for s in backend frontend; do docker tag "triluga-$s:pre-$TS" "triluga-$s:latest" || exit 1; done
  $DC up -d --no-deps --force-recreate backend frontend </dev/null
  echo "banco e imagens restaurados para pre-$TS. Confira: $(psql_q "SELECT count(*) FROM \"Vehicle\";") anúncios; weeklyRate existe: $(psql_q "SELECT count(*) FROM information_schema.columns WHERE table_name='Vehicle' AND column_name='weeklyRate';")"
}

case "${1:-}" in
  preflight) preflight ;;
  deploy) deploy ;;
  smoke) smoke ;;
  check-test) check_test "${2:-}" ;;
  rollback-code) rollback_code "${2:-}" ;;
  rollback-full) rollback_full "${2:-}" ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
