// Finite, paced local resilience probe. The target is deliberately not configurable.
const { setTimeout: delay } = require('node:timers/promises');
const os = require('node:os');
const START = Number(process.env.STRESS_START);
const INDEX = Number(process.env.STRESS_INDEX);
const SOURCES = Number(process.env.STRESS_SOURCES);
if (!Number.isInteger(INDEX) || INDEX < 0 || INDEX >= 20 || SOURCES !== 20) throw new Error('Local test requires exactly 20 bounded sources.');
const base = 'http://backend:3000/api/v1';
const phases = [
  { name: 'single-source', sources: 1, rps: 40, seconds: 15 },
  { name: 'twenty-sources', sources: 20, rps: 10, seconds: 20 },
  { name: 'twenty-sources-burst', sources: 20, rps: 20, seconds: 20 },
];
const emit = value => console.log(JSON.stringify({ source: INDEX, at: Date.now(), ...value }));
const active = new Set();
let inFlight = 0;
async function main() {
  emit({ type: 'ready', ip: Object.values(os.networkInterfaces()).flat().find(n => n.family === 'IPv4' && !n.internal)?.address });
  await delay(Math.max(0, START - Date.now()));
  let scheduledStart = START;
  for (const phase of phases) {
    const end = scheduledStart + phase.seconds * 1000;
    await delay(Math.max(0, scheduledStart - Date.now()));
    if (INDEX < phase.sources) {
      const count = phase.rps * phase.seconds;
      for (let i = 0; i < count && Date.now() < end; i++) {
        await delay(Math.max(0, scheduledStart + i * 1000 / phase.rps - Date.now()));
        if (inFlight >= 8) { emit({ type: 'skipped', phase: phase.name }); continue; }
        inFlight++;
        const started = performance.now();
        const task = (async () => {
          try {
            const response = await fetch(base + '/vehicles/stats', { signal: AbortSignal.timeout(3000) });
            await response.arrayBuffer();
            emit({ type: 'response', phase: phase.name, status: response.status, ms: +(performance.now() - started).toFixed(2) });
          } catch (error) { emit({ type: 'response', phase: phase.name, status: 0, ms: +(performance.now() - started).toFixed(2), error: error.name }); }
          finally { inFlight--; }
        })();
        active.add(task); task.finally(() => active.delete(task));
      }
    }
    await delay(Math.max(0, end - Date.now()));
    scheduledStart = end;
  }
  await Promise.allSettled([...active]);
  emit({ type: 'finished' });
}
main().catch(error => { emit({ type: 'runner_error', message: error.message }); process.exitCode = 1; });
