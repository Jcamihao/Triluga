// Cliente HTTP mínimo (sem dependências) para os scripts de validação do Asaas.
// A chave vem SEMPRE de variável de ambiente; nunca é gravada nem impressa.
const https = require('node:https');

const BASE = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
const KEY = process.env.ASAAS_API_KEY || '';

if (!KEY) {
  console.error('Defina ASAAS_API_KEY (chave de SANDBOX) no ambiente.');
  process.exit(1);
}
if (!BASE.includes('sandbox')) {
  console.error('Recusado: ASAAS_BASE_URL não é de sandbox. Estes scripts são só para validação em sandbox.');
  process.exit(1);
}

const redact = (s) => String(s).split(KEY).join('[chave]');

function call(method, path, body) {
  const url = new URL(BASE + path);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          access_token: KEY,
          'User-Agent': 'Triluga-validacao/1.0 (Node.js)',
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
          const err = new Error(redact(`${method} ${path} -> ${res.statusCode}: ${text}`).slice(0, 700));
          err.statusCode = res.statusCode;
          reject(err);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(new Error(redact(e.message))));
    if (payload) req.write(payload);
    req.end();
  });
}

// CPF válido gerado ao acaso (o sandbox valida o dígito verificador).
function cpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const dv = (a) => { const s = a.reduce((x, v, i) => x + v * (a.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join('');
}

// Data "hoje"/"amanhã" no Brasil (UTC-3), YYYY-MM-DD.
const brDate = (addDays = 0) => new Date(Date.now() - 3 * 3600_000 + addDays * 86_400_000).toISOString().slice(0, 10);

module.exports = { call, cpf, brDate, redact };
