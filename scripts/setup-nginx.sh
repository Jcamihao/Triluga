#!/bin/bash
# Instala e configura Nginx + Certbot na VPS para triluga.com.br
# Uso: bash scripts/setup-nginx.sh
set -e

DOMAIN="triluga.com.br"
API_DOMAIN="api.triluga.com.br"
EMAIL="johnmarcus3210@gmail.com"
CONF_FINAL="$(dirname "$0")/../docker/nginx/triluga.conf"

echo "▶ Instalando Nginx e Certbot..."
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

echo "▶ Configuração temporária HTTP (para validar domínio com Certbot)..."
cat > /etc/nginx/sites-available/triluga.conf << 'EOF'
server {
    listen 80;
    server_name triluga.com.br www.triluga.com.br;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; }
}
server {
    listen 80;
    server_name api.triluga.com.br;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; }
}
EOF

ln -sf /etc/nginx/sites-available/triluga.conf /etc/nginx/sites-enabled/triluga.conf
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/certbot

nginx -t && systemctl reload nginx

echo "▶ Gerando certificados SSL..."
certbot certonly --nginx \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL"

certbot certonly --nginx \
  -d "$API_DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL"

echo "▶ Aplicando configuração final com SSL..."
cp "$CONF_FINAL" /etc/nginx/sites-available/triluga.conf
nginx -t && systemctl reload nginx

echo "▶ Configurando renovação automática..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "✓ Pronto."
echo "  Frontend: https://$DOMAIN"
echo "  Backend:  https://$API_DOMAIN"
