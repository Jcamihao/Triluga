const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { root, reportDir, loadState } = require('./runtime.cjs');
const state = loadState();
const baseline = process.argv.includes('--baseline');
const users = baseline ? 1 : Number(process.argv.find(a => a.startsWith('--users='))?.split('=')[1] ?? 100);
if (!Number.isInteger(users) || users < 1 || users > 200 || state.cleanedAt || state.users.length < users) throw new Error('Need active fixtures for 1-200 users.');
const rampMs = baseline ? 0 : users === 200 ? 40000 : 20000;
const holdMs = baseline ? 10000 : 90000;
const drainMs = baseline ? 0 : 10000;
const runId = baseline ? 'baseline' : `load-${users}`;
const eventsFile = path.join(reportDir, `${runId}.events.jsonl`);
const eventStream = fs.createWriteStream(eventsFile);
const records = [], runnerErrors = [], samples = [];
const t0 = Date.now() + (baseline ? 4000 : users === 200 ? 65000 : 45000);
const clientSource = path.join(__dirname, 'load-client.cjs');
let done = false;
let aborted = null;
const running = new Set();
let healthFailures = 0;
const healthProbes = [];
function consume(chunk) {
  for (const line of chunk.trim().split('\n')) {
    if (!line.trim()) continue;
    try { const record = JSON.parse(line); records.push(record); eventStream.write(JSON.stringify(record) + '\n'); }
    catch { runnerErrors.push(line.slice(0, 150)); }
  }
}
function startClient(i) {
  const env = { ...process.env,
    ASSESSMENT_EMAIL: state.users[i].email, ASSESSMENT_PASSWORD: state.password,
    ASSESSMENT_INDEX: String(i), ASSESSMENT_PREFIX: state.prefix,
    ASSESSMENT_VEHICLE: state.vehicles[i % 11].id,
    ASSESSMENT_START_AT: String(t0 + Math.floor(i / users * rampMs)),
    ASSESSMENT_END_AT: String(t0 + rampMs + holdMs + Math.floor(i / users * drainMs)),
  };
  const keys = Object.keys(env).filter(k => k.startsWith('ASSESSMENT_'));
  const name = `triluga-${runId}-client-${i}`;
  running.add(name);
  const args = ['run', '--rm', '--name', name, '--label', `triluga.assessment=${state.prefix}`, '--network', 'triluga_default', '--memory=96m', '--pids-limit=64', '--mount', `type=bind,src=${clientSource},dst=/assessment-client.cjs,readonly`, ...keys.flatMap(k => ['-e', k]), '--entrypoint', 'node', 'triluga-backend', '--max-old-space-size=32', '--jitless', '/assessment-client.cjs'];
  return new Promise(resolve => {
    const child = spawn('docker', args, { cwd: root, env });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; let pos; while ((pos = stdout.indexOf('\n')) >= 0) { consume(stdout.slice(0, pos)); stdout = stdout.slice(pos + 1); } });
    child.stderr.on('data', c => { stderr += c; });
    child.on('error', e => { runnerErrors.push(e.message); resolve(); });
    child.on('close', code => { running.delete(name); if (stdout) consume(stdout); if (code) runnerErrors.push(`client ${i}: exit ${code}: ${stderr.slice(0, 180)}`); resolve(); });
  });
}
const quantile = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)] : null;
async function monitor() {
  while (!done) {
    const output = await new Promise(resolve => {
      const p = spawn('docker', ['stats', '--no-stream', '--format', '{{json .}}', 'triluga-backend-1', 'triluga-postgres-1', 'triluga-redis-1'], { cwd: root });
      let value = ''; p.stdout.on('data', c => value += c); p.on('close', () => resolve(value)); p.on('error', () => resolve(''));
    });
    for (const line of output.trim().split('\n')) { try { samples.push({ at: Date.now(), ...JSON.parse(line) }); } catch {} }
    const probeStarted = performance.now();
    try {
      const response = await fetch('http://127.0.0.1:3002/api/docs', { signal: AbortSignal.timeout(4000) });
      await response.arrayBuffer();
      const ms = performance.now() - probeStarted;
      healthFailures = response.status >= 500 || ms > 3000 ? healthFailures + 1 : 0;
      healthProbes.push({ at: Date.now(), status: response.status, ms: +ms.toFixed(2) });
    } catch { healthFailures++; healthProbes.push({ at: Date.now(), status: 0 }); }
    if (healthFailures >= 3 && !aborted) {
      aborted = 'Three consecutive failed/slow API health probes';
      const names = [...running];
      if (names.length) await new Promise(resolve => { const child = spawn('docker', ['stop', '-t', '1', ...names], { stdio: 'ignore' }); child.on('close', resolve); child.on('error', resolve); });
    }
    const started = records.filter(r => r.type === 'session_start').length;
    const ended = records.filter(r => ['session_end', 'session_failed'].includes(r.type)).length;
    console.log(JSON.stringify({ run: runId, elapsedFromRampSeconds: Math.round((Date.now() - t0) / 1000), ready: records.filter(r => r.type === 'ready').length, active: started - ended, requests: records.filter(r => r.type === 'request').length }));
    await delay(8000);
  }
}
async function main() {
  console.log(JSON.stringify({ run: runId, users, rampSeconds: rampMs / 1000, holdSeconds: holdMs / 1000, drainSeconds: drainMs / 1000, rampStarts: new Date(t0).toISOString() }));
  const monitoring = monitor();
  await Promise.all(Array.from({ length: users }, (_, i) => startClient(i)));
  done = true; await monitoring; eventStream.end();
  const requests = records.filter(r => r.type === 'request');
  const statusCounts = {}, endpoints = {};
  for (const r of requests) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    (endpoints[r.endpoint] ??= []).push(r);
  }
  for (const [key, rows] of Object.entries(endpoints)) {
    const times = rows.map(r => r.ms), statuses = {};
    rows.forEach(r => statuses[r.status] = (statuses[r.status] ?? 0) + 1);
    endpoints[key] = { total: rows.length, failed: rows.filter(r => !r.valid).length, statuses, p50_ms: quantile(times, .5), p95_ms: quantile(times, .95), p99_ms: quantile(times, .99), max_ms: Math.max(...times) };
  }
  const lifecycle = records.filter(r => ['session_start', 'session_end', 'session_failed'].includes(r.type)).sort((a, b) => a.at - b.at);
  let active = 0, peak = 0, fullStart = null, fullDuration = 0;
  for (const event of lifecycle) {
    if (active === users && fullStart !== null) { fullDuration += event.at - fullStart; fullStart = null; }
    active += event.type === 'session_start' ? 1 : -1; peak = Math.max(peak, active);
    if (active === users) fullStart = event.at;
  }
  const elapsed = (Math.max(...requests.map(r => r.at)) - Math.min(...requests.map(r => r.at))) / 1000;
  const apiTimes = requests.filter(r => r.endpoint !== 'ui').map(r => r.ms);
  const report = { target: 'Triluga (vehicle marketplace)', generatedAt: new Date().toISOString(), originalCounts: state.originalCounts, requestedUsers: users, completedUsers: records.filter(r => r.type === 'session_end').length, uniqueClientIPs: new Set(records.filter(r => r.type === 'ready').map(r => r.ip)).size, peakActiveSessions: peak, secondsAtFullConcurrency: +(fullDuration / 1000).toFixed(2), measuredDurationSeconds: +elapsed.toFixed(2), requests: requests.length, failedRequests: requests.filter(r => !r.valid).length, statusCounts, requestsPerSecond: +(requests.length / elapsed).toFixed(2), apiP95_ms: quantile(apiTimes, .95), websocketAuthenticated: records.filter(r => r.type === 'ws_authenticated').length, websocketErrors: records.filter(r => r.type === 'ws_error').length, endpoints, runnerErrors, resourceSamples: samples, healthProbes, aborted, clientSettings: { memoryMiB: 96, v8OldSpaceMiB: 32, jit: false, rampMs, holdMs, drainMs }, limitation: 'HTTP protocol simulation and authenticated WebSocket connections, not rendered browsers; generators share the host. The 200-user run uses a longer ramp and smaller client heaps than the earlier 100-user run.' };
  fs.writeFileSync(path.join(reportDir, `${runId}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, resourceSamples: `${samples.length} samples (see JSON)` }, null, 2));
  if (report.failedRequests || report.completedUsers !== users || runnerErrors.length) process.exitCode = 1;
}
main().catch(e => { done = true; console.error(e); process.exitCode = 1; });
