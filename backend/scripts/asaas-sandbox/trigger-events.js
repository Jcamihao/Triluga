#!/usr/bin/env node
// Gera eventos de pagamento no SANDBOX para o webhook de teste capturar:
//  cobrança A: criada -> "recebida em dinheiro" (dispara PAYMENT_RECEIVED)
//  cobrança B: criada -> apagada (dispara PAYMENT_DELETED, o mesmo que o nosso cancelamento causa)
// No fim, apaga os clientes de teste. Uso: ASAAS_API_KEY=... node trigger-events.js
const { call, cpf, brDate } = require('./_asaas');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tag = Date.now();
  const customer = await call('POST', '/customers', {
    name: 'Teste Triluga Sandbox', cpfCnpj: cpf(), email: 'teste@triluga.example',
    externalReference: `triluga-webhook-${tag}`, notificationDisabled: true,
  });
  const mk = (n, v) => call('POST', '/payments', {
    customer: customer.id, billingType: 'PIX', value: v, dueDate: brDate(1),
    description: `Teste webhook ${n}`, externalReference: `order-webhook-${n}-${tag}`,
  });

  const a = await mk('A', 29.9);
  console.log('A criada:', a.id, a.status);
  await sleep(1500);
  const rec = await call('POST', `/payments/${a.id}/receiveInCash`, { paymentDate: brDate(0), value: 29.9, notifyCustomer: false });
  console.log('A recebida:', rec.status, '| externalReference:', rec.externalReference);

  const b = await mk('B', 49.9);
  console.log('B criada:', b.id, b.status);
  await sleep(1500);
  await call('DELETE', `/payments/${b.id}`);
  console.log('B apagada');

  await sleep(4000); // dá tempo de o Asaas entregar os webhooks
  const l = await call('GET', '/customers?name=' + encodeURIComponent('Teste Triluga Sandbox') + '&limit=50');
  let n = 0;
  for (const c of l.data ?? []) { try { await call('DELETE', `/customers/${c.id}`); n++; } catch { /* já apagado */ } }
  console.log('clientes de teste apagados:', n);
  console.log('Agora confira o captured.jsonl na VPS (esperado: PAYMENT_CREATED x2, PAYMENT_RECEIVED x1, PAYMENT_DELETED x1).');
})().catch((e) => { console.error('ERRO:', e.statusCode ?? '', e.message); process.exit(1); });
