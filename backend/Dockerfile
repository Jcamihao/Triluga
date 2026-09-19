FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Startup: tenta migrate deploy; se falhar com P3005 (banco com schema mas sem
# histórico de migrations), faz baseline das migrations existentes, sincroniza
# o schema via db push para aplicar colunas ainda ausentes, e retenta deploy.
CMD ["sh", "-c", "\
  out=$(npx prisma migrate deploy 2>&1); rc=$?; \
  if [ $rc -ne 0 ] && echo \"$out\" | grep -q 'P3005'; then \
    echo 'Baseline necessário — marcando migrations como aplicadas...'; \
    for m in $(ls -d prisma/migrations/*/); do \
      npx prisma migrate resolve --applied \"$(basename $m)\" || true; \
    done; \
    echo 'Sincronizando colunas ausentes via db push...'; \
    npx prisma db push; \
    npx prisma migrate deploy; \
  elif [ $rc -ne 0 ]; then \
    echo \"$out\"; exit 1; \
  fi && node dist/main \
"]
