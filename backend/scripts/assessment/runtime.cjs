const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '../../..');
const reportDir = path.join(root, 'backend/reports/assessment');
fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
const stateFile = path.join(reportDir, 'session.private.json');
const config = { ...process.env, ...dotenv.parse(fs.readFileSync(path.join(root, '.env'))) };
function run(command, args, env = config) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
function loadState() { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
function saveState(state) { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); }
function dbUrl(state, local = true) {
  const url = new URL(config.DATABASE_URL);
  url.hostname = local ? '127.0.0.1' : 'postgres';
  url.port = local ? '5436' : '5432';
  url.pathname = `/${state.database}`;
  return url.toString();
}
if (require.main === module) {
  const action = process.argv[2];
  if (action === 'clone') {
    if (fs.existsSync(stateFile)) throw new Error('A session already exists; inspect it before creating another.');
    const state = { database: `triluga_assessment_${Date.now()}`, prefix: `assessment-${crypto.randomBytes(6).toString('hex')}`, password: crypto.randomBytes(18).toString('base64url') + '!9', createdAt: new Date().toISOString() };
    run('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'createdb -U "$POSTGRES_USER" -T "$POSTGRES_DB" "$1"', 'sh', state.database]);
    saveState(state);
    run(path.join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', 'backend/prisma/schema.prisma'], { ...config, DATABASE_URL: dbUrl(state) });
    console.log(JSON.stringify({ clonedDatabase: state.database, originalDatabasePreserved: true }));
  } else if (action === 'up') {
    const state = loadState();
    run('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.assessment.yml', 'up', '-d', '--no-build'], { ...config, ASSESSMENT_DATABASE_URL: dbUrl(state, false) });
  } else throw new Error('Usage: node backend/scripts/assessment/runtime.cjs clone|up');
}
module.exports = { root, reportDir, config, loadState, saveState, dbUrl };
