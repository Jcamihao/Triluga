#!/bin/bash
# Instala e configura Nginx + Certbot na VPS para triluga.com.br
# Uso: bash scripts/setup-nginx.sh
set -e

DOMAIN="triluga.com.br"
API_DOMAIN="api.triluga.com.br"
EMAIL="johnmarcus3210@gmail.com"
CONF_SRC="$(dirname "$0")/../docker/nginx/triluga.conf"

echo "▶ Instalando Nginx e Certbot..."
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

echo "▶ Copiando configuração..."
cp "$CONF_SRC" /etc/nginx/sites-available/triluga.conf
ln -sf /etc/nginx/sites-available/triluga.conf /etc/nginx/sites-enabled/triluga.conf
rm -f /etc/nginx/sites-enabled/default

echo "▶ Testando configuração Nginx (HTTP only primeiro)..."
# Comenta temporariamente os blocos SSL para validar antes dos certs
nginx -t

echo "▶ Gerando certificados SSL..."
certbot --nginx \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL"

certbot --nginx \
  -d "$API_DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL"

echo "▶ Aplicando configuração final..."
cp "$CONF_SRC" /etc/nginx/sites-available/triluga.conf
nginx -t && systemctl reload nginx

echo "▶ Configurando renovação automática..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "✓ Nginx e SSL configurados com sucesso."
echo "  Frontend: https://$DOMAIN"
echo "  Backend:  https://$API_DOMAIN"
