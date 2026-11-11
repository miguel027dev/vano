import { spawn } from 'node:child_process';
const env = { ...process.env };
const processes = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env }),
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:client'], { stdio: 'inherit', env }),
];
const terminate = () => { for (const proc of processes) if (!proc.killed) proc.kill(); };
process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);
for (const proc of processes) proc.on('exit', (code) => { if (code && code !== 0) process.exitCode = code; terminate(); });
