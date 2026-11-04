// HTTP journey plus Engine.IO/Socket.IO connection; no browser rendering.
const os = require('node:os');
const WebSocket = require('/app/node_modules/ws');
const { setTimeout: delay } = require('node:timers/promises');
const base = 'http://backend:3000/api/v1';
const index = Number(process.env.ASSESSMENT_INDEX);
const startAt = Number(process.env.ASSESSMENT_START_AT);
const endAt = Number(process.env.ASSESSMENT_END_AT);
const vehicle = process.env.ASSESSMENT_VEHICLE;
const emit = value => console.log(JSON.stringify({ user: index, at: Date.now(), ...value }));

async function request(name, route, token, method = 'GET', body) {
  const started = performance.now();
  try {
    const response = await fetch(route.startsWith('http') ? route : base + route, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
    const valid = response.ok && (name === 'login' ? Boolean(data.accessToken) : name === 'search' ? Array.isArray(data.items) : name === 'detail' ? data.id === vehicle : name === 'ui' ? typeof data === 'string' && /triluga/i.test(data) : true);
    emit({ type: 'request', endpoint: name, status: response.status, valid, ms: +(performance.now() - started).toFixed(2) });
    return valid ? data : null;
  } catch (error) {
    emit({ type: 'request', endpoint: name, status: 0, valid: false, ms: +(performance.now() - started).toFixed(2), error: error.name });
    return null;
  }
}

async function main() {
  emit({ type: 'ready', ip: Object.values(os.networkInterfaces()).flat().find(n => n.family === 'IPv4' && !n.internal)?.address });
  await delay(Math.max(0, startAt - Date.now()));
  emit({ type: 'session_start' });
  const login = await request('login', '/auth/login', null, 'POST', { email: process.env.ASSESSMENT_EMAIL, password: process.env.ASSESSMENT_PASSWORD });
  if (!login) { emit({ type: 'session_failed' }); return; }
  const token = login.accessToken;
  const ws = new WebSocket('ws://backend:3000/socket.io/?EIO=4&transport=websocket');
  let socketReady = false;
  ws.on('message', raw => {
    const message = raw.toString();
    if (message.startsWith('0')) ws.send('40' + JSON.stringify({ token }));
    else if (message === '2') ws.send('3');
    else if (message.startsWith('40')) { socketReady = true; emit({ type: 'ws_authenticated' }); }
    else if (message.includes('chat:error')) emit({ type: 'ws_error' });
  });
  ws.on('error', () => emit({ type: 'ws_error' }));
  await request('ui', 'http://frontend/', null);
  await request('favorite_add', `/favorites/${vehicle}`, token, 'POST');
  let iteration = 0;
  while (Date.now() < endAt) {
    const cycleStarted = Date.now();
    // Fixed 5s cycle: below the unchanged 20/minute per-route/IP throttle.
    await Promise.all([
      request('search', `/vehicles?q=${encodeURIComponent(process.env.ASSESSMENT_PREFIX)}&limit=10&sort=${['newest', 'price_asc', 'relevance'][iteration % 3]}`, token),
      request('detail', `/vehicles/${vehicle}`, token),
      request('profile', '/profiles/me', token),
      request('favorites', '/favorites/my', token),
      request('chats', '/chats', token),
      request('notifications', '/notifications/my', token),
      request('stats', '/vehicles/stats', token),
    ]);
    iteration++;
    await delay(Math.max(0, Math.min(5000 - (Date.now() - cycleStarted), endAt - Date.now())));
  }
  await request('favorite_remove', `/favorites/${vehicle}`, token, 'DELETE');
  ws.close();
  emit({ type: 'session_end', iterations: iteration, socketReady });
}
main().catch(error => { emit({ type: 'client_error', error: error.message }); process.exitCode = 1; });
