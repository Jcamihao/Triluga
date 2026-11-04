const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { root, reportDir, loadState } = require('./runtime.cjs');
const state = loadState();
const start = Date.now() + 20000;
const events = [], health = [], samples = [], errors = [], names = new Set();
const output = fs.createWriteStream(path.join(reportDir, 'stress-local.events.jsonl'));
let finished = false, abortReason = null;
const phases = [{ name: 'single-source', sources: 1, requestedRps: 40, durationSeconds: 15 }, { name: 'twenty-sources', sources: 20, requestedRps: 200, durationSeconds: 20 }, { name: 'twenty-sources-burst', sources: 20, requestedRps: 400, durationSeconds: 20 }];
const quantile = (rows, p) => rows.length ? [...rows].sort((a,b) => a-b)[Math.min(rows.length-1, Math.ceil(rows.length*p)-1)] : null;
function command(args) {
  return new Promise(resolve => {
    const child = spawn('docker', args, { cwd: root }); let stdout = '';
    child.stdout.on('data', d => stdout += d); child.on('close', code => resolve({ stdout, code })); child.on('error', () => resolve({ stdout, code: -1 }));
  });
}
async function probe(stage) {
  const started = performance.now();
  try {
    const r = await fetch('http://127.0.0.1:3002/api/v1', { signal: AbortSignal.timeout(3500) });
    const text = await r.text();
    const row = { at: Date.now(), stage, status: r.status, healthy: r.status === 200 && text.includes('Triluga API is healthy'), ms: +(performance.now()-started).toFixed(2) };
    health.push(row); return row;
  } catch { const row = { at: Date.now(), stage, status: 0, healthy: false, ms: +(performance.now()-started).toFixed(2) }; health.push(row); return row; }
}
async function monitor() {
  let bad = 0;
  while (!finished) {
    const h = await probe(Date.now() < start ? 'warmup' : 'traffic');
    bad = !h.healthy || h.ms > 3000 ? bad + 1 : 0;
    const stats = await command(['stats', '--no-stream', '--format', '{{json .}}', 'triluga-backend-1', 'triluga-postgres-1', 'triluga-redis-1']);
    for (const line of stats.stdout.trim().split('\n')) { try { samples.push({ at: Date.now(), ...JSON.parse(line) }); } catch {} }
    console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now()-start)/1000), requests: events.filter(r=>r.type==='response').length, healthStatus: h.status, healthMs: h.ms }));
    if (bad >= 3) {
      abortReason = 'Three consecutive unhealthy or >3s legitimate health probes';
      if (names.size) await command(['stop', '-t', '1', ...names]);
      return;
    }
    await delay(5000);
  }
}
function client(i) {
  const name = `triluga-stress-local-${i}`; names.add(name);
  const env = { ...process.env, STRESS_START: String(start), STRESS_INDEX: String(i), STRESS_SOURCES: '20' };
  return new Promise(resolve => {
    const child = spawn('docker', ['run', '--rm', '--name', name, '--label', `triluga.assessment=${state.prefix}`, '--network', 'triluga_default', '--memory=96m', '--pids-limit=64', '--mount', `type=bind,src=${path.join(__dirname,'stress-client.cjs')},dst=/stress-client.cjs,readonly`, '-e', 'STRESS_START', '-e', 'STRESS_INDEX', '-e', 'STRESS_SOURCES', '--entrypoint', 'node', 'triluga-backend', '--max-old-space-size=32', '--jitless', '/stress-client.cjs'], { cwd: root, env });
    let pending = '', stderr = '';
    child.stdout.on('data', data => { pending += data; let pos; while ((pos=pending.indexOf('\n'))>=0) { const line=pending.slice(0,pos);pending=pending.slice(pos+1);try { const r=JSON.parse(line); events.push(r);output.write(JSON.stringify(r)+'\n'); } catch { errors.push('Invalid client output'); } } });
    child.stderr.on('data', data => stderr += data);
    child.on('error', e => { errors.push(e.message);names.delete(name);resolve(); });
    child.on('close', code => { names.delete(name); if(code) errors.push(`Client ${i} exit=${code}: ${stderr.slice(0,150)}`); resolve(); });
  });
}
async function main() {
  console.log(JSON.stringify({ target: 'Local Triluga only', maxSources: 20, maxRps: 400, maxConcurrentRequests: 160, trafficSeconds: 55, stopAfterBadHealthProbes: 3, starts: new Date(start).toISOString() }));
  const monitoring = monitor();
  await Promise.all(Array.from({length:20},(_,i)=>client(i)));
  finished=true;await monitoring;output.end();
  for(let i=0;i<3;i++){await probe('recovery');await delay(1500);}
  const rows=events.filter(r=>r.type==='response');
  const metrics = list => {
    const statuses={};for(const r of list) statuses[r.status]=(statuses[r.status]||0)+1;
    return { total:list.length, statuses, errors:list.filter(r=>r.status===0||r.status>=500).length, rateLimited:list.filter(r=>r.status===429).length, p95_ms:quantile(list.map(r=>r.ms),.95), max_ms:list.length?Math.max(...list.map(r=>r.ms)):null };
  };
  const report={target:'Triluga local marketplace',generatedAt:new Date().toISOString(),scope:'Bounded local HTTP denial-of-service resilience simulation; no Internet targets, no amplification, no production DDoS certification.',limits:{sources:20,maxRequestedRps:400,trafficSeconds:55,maxConcurrentRequests:160,perRequestTimeoutMs:3000,maxPlannedRequests:12600},uniqueSourceIPs:new Set(events.filter(r=>r.type==='ready').map(r=>r.ip)).size,completedSources:events.filter(r=>r.type==='finished').length,phases:phases.map(p=>({...p,...metrics(rows.filter(r=>r.phase===p.name))})),overall:metrics(rows),health,resourceSamples:samples,abortReason,runnerErrors:errors,skippedRequests:events.filter(r=>r.type==='skipped').length};
  fs.writeFileSync(path.join(reportDir,'stress-local.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,health:{probes:health.length,failed:health.filter(h=>!h.healthy).length,p95_ms:quantile(health.map(h=>h.ms),.95),recovery:health.filter(h=>h.stage==='recovery')},resourceSamples:samples.length},null,2));
  if(abortReason||report.overall.errors||errors.length||health.some(h=>!h.healthy))process.exitCode=1;
}
main().catch(async e=>{finished=true;console.error(e.message);if(names.size)await command(['stop','-t','1',...names]);process.exitCode=1;});
