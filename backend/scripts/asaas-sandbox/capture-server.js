#!/usr/bin/env node
// Servidor MÍNIMO que só registra o que o Asaas enviar ao webhook (para validar
// o formato real do payload e do header). NÃO é o backend do Triluga e não ativa nada.
//
// Uso:  CAPTURE_PATH=/<segredo-aleatorio> WEBHOOK_TOKEN=<token> PORT=3099 node capture-server.js
// Escuta em 127.0.0.1; o nginx expõe só o caminho secreto. Saída: captured.jsonl (a pasta atual).
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PORT = parseInt(process.env.PORT || '3099', 10);
const CAPTURE_PATH = process.env.CAPTURE_PATH || '';
const EXPECTED = process.env.WEBHOOK_TOKEN || '';
const OUT = process.env.CAPTURE_FILE || 'captured.jsonl';

if (!CAPTURE_PATH.startsWith('/') || CAPTURE_PATH.length < 20) {
  console.error('Defina CAPTURE_PATH começando com "/" e com um segredo longo (ex.: /hook-' + crypto.randomBytes(16).toString('hex') + ')');
  process.exit(1);
}
if (EXPECTED.length < 32) {
  console.error('Defina WEBHOOK_TOKEN com 32+ caracteres (o mesmo usado em register-webhook.js).');
  process.exit(1);
}

const sameToken = (got) => {
  const a = Buffer.from(String(got ?? ''));
  const b = Buffer.from(EXPECTED);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

http
  .createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith(CAPTURE_PATH)) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.length < 200 && chunks.push(c)); // limite de segurança
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').slice(0, 200_000);
      let body = null;
      try { body = JSON.parse(raw); } catch { /* guarda o texto cru */ }
      const entry = {
        at: new Date().toISOString(),
        // nomes dos headers e se o token bate — o VALOR do token nunca é gravado
        headerNames: Object.keys(req.headers),
        tokenHeaderPresent: 'asaas-access-token' in req.headers,
        tokenMatches: sameToken(req.headers['asaas-access-token']),
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent'],
        body,
        rawIfNotJson: body ? undefined : raw,
      };
      fs.appendFileSync(OUT, JSON.stringify(entry) + '\n');
      console.log(`[${entry.at}] evento=${body?.event ?? '?'} tokenOk=${entry.tokenMatches} payment=${body?.payment?.id ?? '-'} status=${body?.payment?.status ?? '-'}`);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`capturando POST ${CAPTURE_PATH} em 127.0.0.1:${PORT} -> ${OUT}`));
