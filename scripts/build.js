import { spawn } from 'child_process';
import './patch-mastra-build.js';

const isWindows = process.platform === 'win32';
const mastraCmd = isWindows ? 'npx.cmd' : 'npx';

console.log('[Build Runner] Starting Mastra build...');

const child = spawn(mastraCmd, ['mastra', 'build', '-s'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
  env: process.env,
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

let completed = false;

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  if (
    text.includes('You can now deploy the .mastra/output directory') ||
    text.includes('Build successful, you can now deploy')
  ) {
    if (!completed) {
      completed = true;
      console.log('\n[Build Runner] Detected build completion. Finalizing exit in 1s...');
      setTimeout(() => {
        child.kill();
        process.exit(0);
      }, 1000);
    }
  }
});

child.on('exit', (code) => {
  if (!completed) {
    process.exit(code ?? 0);
  }
});
