// Asaas FALSO para a passada ponta a ponta. Não fala com o Asaas de verdade.
// Registra cada requisição, exige User-Agent e aceita configuração pelo endpoint /__control.
'use strict';
const http = require('http');

function createFakeAsaas({ port }) {
  const state = {
    requests: [],
    deleted: new Set(),
    checkoutSeq: 0,
    // configurações de falha, mudadas pelo teste via POST /__control
    failGetSubscriptionWith: null, // ex.: 500
    deleteStatus: 200,            // 200 normal; 404 para simular "já removida"
  };

  const send = (res, status, body) => {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(text);
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      let pathname = url.pathname;

      if (pathname === '/__control' && req.method === 'POST') {
        const cfg = raw ? JSON.parse(raw) : {};
        Object.assign(state, cfg);
        return send(res, 200, { ok: true, config: cfg });
      }
      if (pathname === '/__log' && req.method === 'GET') {
        return send(res, 200, state.requests);
      }
      if (pathname === '/__reset' && req.method === 'POST') {
        state.requests = [];
        return send(res, 200, { ok: true });
      }

      // prefixo /v3 igual ao Asaas real (ASAAS_BASE_URL=http://localhost:PORT/v3)
      pathname = pathname.replace(/^\/v3(?=\/|$)/, '');

      let body;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      const entry = {
        method: req.method,
        path: pathname + url.search,
        body,
        access_token_present: typeof req.headers.access_token === 'string',
        user_agent: req.headers['user-agent'] ?? null,
      };
      state.requests.push(entry);

      if (!req.headers['user-agent']) {
        return send(res, 403, { errors: [{ code: 'MISSING_USER_AGENT' }] });
      }

      if (req.method === 'POST' && pathname === '/checkouts') {
        state.checkoutSeq += 1;
        const id = `chk_fake_${state.checkoutSeq}`;
        return send(res, 200, {
          id,
          link: `https://sandbox.asaas.fake/checkout/${id}`,
        });
      }

      const subMatch = pathname.match(/^\/subscriptions\/([^/?]+)$/);
      if (subMatch && req.method === 'GET') {
        if (state.failGetSubscriptionWith) {
          return send(res, state.failGetSubscriptionWith, {
            errors: [{ code: 'FAKE_FAILURE' }],
          });
        }
        const id = subMatch[1];
        const nextDue = new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10);
        return send(res, 200, {
          id,
          deleted: state.deleted.has(id),
          nextDueDate: nextDue,
          externalReference: null,
        });
      }

      if (pathname === '/subscriptions' && req.method === 'GET') {
        // sem assinatura remota com esse externalReference (cenário do sync)
        return send(res, 200, { object: 'list', hasMore: false, data: [] });
      }

      if (subMatch && req.method === 'DELETE') {
        const id = subMatch[1];
        if (state.deleteStatus !== 200) {
          return send(res, state.deleteStatus, {
            errors: [{ code: 'FAKE_NOT_FOUND' }],
          });
        }
        state.deleted.add(id);
        return send(res, 200, { deleted: true, id });
      }

      return send(res, 404, { errors: [{ code: 'NOT_IMPLEMENTED_IN_FAKE' }] });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, state }));
  });
}

module.exports = { createFakeAsaas };

if (require.main === module) {
  const port = parseInt(process.env.FAKE_ASAAS_PORT || '3398', 10);
  createFakeAsaas({ port }).then(() => {
    console.log(`fake-asaas ouvindo em http://127.0.0.1:${port}/v3`);
  });
}
