#!/usr/bin/env node
// Gerencia o webhook de TESTE no sandbox do Asaas.
//   ASAAS_API_KEY=... WEBHOOK_URL=https://dominio/<caminho-secreto> WEBHOOK_TOKEN=<32+ chars> WEBHOOK_EMAIL=voce@x.com \
//     node register-webhook.js register
//   ASAAS_API_KEY=... node register-webhook.js list
//   ASAAS_API_KEY=... node register-webhook.js delete <id>
const { call } = require('./_asaas');

const EVENTS = [
  'PAYMENT_CREATED', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_DELETED',
  'PAYMENT_REFUNDED', 'PAYMENT_OVERDUE',
];

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'list') {
    const r = await call('GET', '/webhooks');
    for (const w of r.data ?? []) console.log(w.id, '|', w.name, '|', w.url, '| enabled:', w.enabled, '| interrupted:', w.interrupted, '| events:', (w.events ?? []).join(','));
    console.log('total:', (r.data ?? []).length);
  } else if (cmd === 'delete' && arg) {
    await call('DELETE', `/webhooks/${arg}`);
    console.log('webhook removido:', arg);
  } else if (cmd === 'register') {
    const { WEBHOOK_URL, WEBHOOK_TOKEN, WEBHOOK_EMAIL } = process.env;
    if (!WEBHOOK_URL || !WEBHOOK_TOKEN || !WEBHOOK_EMAIL) throw new Error('Defina WEBHOOK_URL, WEBHOOK_TOKEN (32+ chars) e WEBHOOK_EMAIL.');
    const w = await call('POST', '/webhooks', {
      name: 'Triluga - validacao (temporario)',
      url: WEBHOOK_URL,
      email: WEBHOOK_EMAIL,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: WEBHOOK_TOKEN,
      sendType: 'SEQUENTIALLY',
      events: EVENTS,
    });
    console.log('webhook registrado: id =', w.id, '| url =', w.url, '| events =', (w.events ?? []).join(','));
    console.log('APAGUE ao terminar:  node register-webhook.js delete ' + w.id);
  } else {
    console.error('uso: register | list | delete <id>');
    process.exit(2);
  }
})().catch((e) => { console.error('ERRO:', e.statusCode ?? '', e.message); process.exit(1); });
