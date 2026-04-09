const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const projectRoot = process.cwd();
const distEntry = join(projectRoot, 'dist', 'main.js');

if (!existsSync(distEntry)) {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const runtime = spawnSync('node', [distEntry], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(runtime.status ?? 0);
