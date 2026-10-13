// scripts/launch-app.mjs — double-click launcher (the "exe"): prepare, start, open the browser.
//
//   node scripts/launch-app.mjs [--port 3000] [--no-open] [--hidden] [-h]
//
// It does what scripts/launch.mjs does — the same readiness check (tools/setup.mjs) and the same server
// (server/index.js) — with three differences that make it behave like a little app:
//
//   * A port that already answers /healthz is treated as "already running": it just opens the browser instead of
//     failing, so clicking the icon twice never produces an error.
//   * `--hidden` (no console window) appends everything to logs/app-<date>.log, writes the server's pid to
//     logs/app.pid for 停止服务器.bat, and exits once the browser is open while the server keeps running.
//     Without it the server shares this terminal and Ctrl+C stops it.
//   * It is deliberately **not** a 4-/6-player switch: the seat capacity comes from the merged data
//     (`config.coop.maxSeats`, see server/match/coop.js), i.e. from whether the Mod `cyanfish.max-seats` is installed.
//
// The server itself is unchanged: this file only prepares, spawns and reports.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBrowser } from './open-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(ROOT, 'logs');
const PID_FILE = path.join(LOG_DIR, 'app.pid');

function parseArgs(argv) {
  const o = { port: null, host: null, open: true, hidden: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]) || null;
    else if (a.startsWith('--port=')) o.port = Number(a.slice(7)) || null;
    else if (a === '--host') o.host = argv[++i] ?? null;
    else if (a === '--no-open') o.open = false;
    else if (a === '--hidden') o.hidden = true;
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}

const o = parseArgs(process.argv.slice(2));
const port = o.port ?? (process.env.PORT ? Number(process.env.PORT) : 3000);
const host = o.host ?? process.env.HOST ?? '0.0.0.0';
const localUrl = `http://localhost:${port}`;

/** Where messages go: the terminal, or a log file in --hidden mode. Logging never breaks the launch. */
function makeLog(hidden) {
  if (!hidden) {
    return { say: (s = '') => console.log(s), warn: (s) => console.warn(s), logFile: null, done: () => {} };
  }
  // the project's logs/ first, the OS temp directory second, the console if neither can be written
  let file = null;
  for (const dir of [LOG_DIR, tmpdir()]) {
    try {
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);
      const candidate = path.join(dir, `stronghold-app-${stamp}.log`);
      const probe = createWriteStream(candidate, { flags: 'a' });
      probe.end('');
      file = candidate;
      break;
    } catch { /* try the next location */ }
  }
  if (!file) return { say: (s = '') => console.log(s), warn: (s) => console.warn(s), logFile: null, done: () => {} };

  let out = null;
  const write = (s) => {
    try {
      if (!out) out = createWriteStream(file, { flags: 'a' });
      out.write(s + '\n');
    } catch { /* best effort */ }
  };
  write(`\n===== ${new Date().toISOString()} start (port ${port}) =====`);
  return { say: write, warn: write, logFile: file, done: () => new Promise((r) => { try { if (out) out.end(r); else r(); } catch { r(); } }) };
}

const log = makeLog(o.hidden);

if (o.help) {
  log.say(`Usage: node scripts/launch-app.mjs [--port 3000] [--no-open] [--hidden]
  --port N     listen on N (default 3000, or $PORT)
  --no-open    do not open the browser
  --hidden     log to logs/app-<date>.log instead of the console (the .vbs launcher) and detach`);
  await log.done();
  process.exit(0);
}

/** Does something that looks like our server already answer on this port? */
async function alreadyRunning() {
  try {
    const res = await fetch(`${localUrl}/healthz`, { signal: AbortSignal.timeout(1200) });
    if (!res.ok) return null;
    const body = await res.json();
    return body && body.ok ? body : null;
  } catch {
    return null;
  }
}

/** Wait until /healthz answers (the asset check can take a few seconds on a cold start). */
async function waitReady(ms) {
  const until = Date.now() + ms;
  for (;;) {
    const h = await alreadyRunning();
    if (h) return h;
    if (Date.now() > until) return null;
    await new Promise((r) => setTimeout(r, 350));
  }
}

log.say('');
log.say('  卫戍协议：盟约 · Stronghold Protocol: Alliance');
log.say('  正在启动…');
log.say('');

// ---- 1. already running? ---------------------------------------------------------------------------
const live = await alreadyRunning();
if (live) {
  log.say(`  这个端口上已经有一个服务器在跑了（${localUrl}），直接打开页面。`);
  log.say(`  座位数 maxSeats=${live.maxSeats}，房间数 ${live.rooms}`);
  const opened = o.open ? openBrowser(localUrl) : true;
  if (!opened) log.say(`  请手动打开：${localUrl}`);
  await log.done();
  process.exit(0);
}

// ---- 2. Node version -------------------------------------------------------------------------------
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  log.warn(`  Node.js 版本过旧（当前 ${process.versions.node}），需要 22 或更高。`);
  log.warn('  升级：winget upgrade OpenJS.NodeJS.LTS   或  https://nodejs.org/zh-cn/download');
  if (!o.hidden) { log.say(''); log.say('  按回车键关闭…'); await pause(); }
  await log.done();
  process.exit(1);
}

// ---- 3. first-run preparation (dependencies, art, data) --------------------------------------------
if (!existsSync(path.join(ROOT, 'node_modules', 'ws', 'package.json'))) {
  log.say('  首次运行：正在安装依赖（npm ci）…');
}
const prep = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'setup.mjs'), '--quiet', '--no-local'], {
  cwd: ROOT, stdio: o.hidden ? 'ignore' : 'inherit',
});
if (prep.status !== 0) {
  log.warn('  准备工作没有成功完成（可能是素材下载中断）。');
  log.warn('  在项目目录里运行一次 `npm install` 和 `npm run setup` 可以补上，之后这个启动器就能直接用。');
}
if (!existsSync(path.join(ROOT, 'node_modules', 'ws', 'package.json'))) {
  log.warn('  缺少运行依赖（node_modules/ws），无法启动。');
  log.warn('  请在项目目录里运行：npm install');
  if (!o.hidden) { log.say(''); log.say('  按回车键关闭…'); await pause(); }
  await log.done();
  process.exit(1);
}

// ---- 4. the server ---------------------------------------------------------------------------------
const env = { ...process.env, PORT: String(port), HOST: host, SP_NO_BROWSER: '1' };

const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env,
  stdio: o.hidden ? 'ignore' : 'inherit',
  detached: false,
});

const ready = await waitReady(20000);
if (!ready) {
  log.warn(`  服务器在 20 秒内没有响应 ${localUrl}/healthz。`);
  if (log.logFile) log.warn(`  详情见日志：${log.logFile}`);
  log.warn('  常见原因：端口被别的程序占用，或防火墙拦截。换端口试试：--port 3001');
  try { child.kill(); } catch { /* already gone */ }
  if (!o.hidden) { log.say(''); log.say('  按回车键关闭…'); await pause(); }
  await log.done();
  process.exit(1);
}

log.say(`  服务器已启动：${localUrl}`);
log.say(`  同盟房间座位数 maxSeats=${ready.maxSeats}（官方 4；装了 Mod cyanfish.max-seats 则为 6）`);
log.say('');
log.say('  同盟模拟 → 创建房间 → 把「同盟密钥」或「复制链接」发给朋友。');
log.say('');

if (o.open) {
  const opened = openBrowser(localUrl);
  if (!opened) log.say(`  未能自动打开浏览器，请手动访问：${localUrl}`);
}

if (o.hidden) {
  // detach: the server keeps running, this process leaves. 停止服务器.bat kills the pid below.
  let pidFile = PID_FILE;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
  } catch {
    // no writable logs/ (a read-only install): keep the server up, just without the stop helper
    pidFile = null;
    log.warn('  无法写入 logs/app.pid，因此「停止服务器.bat」无法定位这个进程。');
    log.warn('  可用任务管理器结束 node 进程来关闭服务器。');
  }
  log.say(`  已在后台运行（pid ${child.pid}）。`);
  if (pidFile) log.say('  关闭：双击「停止服务器.bat」，或在任务管理器里结束该 node 进程。');
  if (log.logFile) log.say(`  日志：${log.logFile}`);
  child.unref();
  await log.done();
  process.exit(0);
}

// attached (.bat path): Ctrl+C / closing the window stops the server
log.say('  按 Ctrl+C 停止服务器。');
let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  try { child.kill(); } catch { /* already gone */ }
  try { rmSync(PID_FILE, { force: true }); } catch { /* nothing to clean */ }
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
child.on('exit', (code) => stop(code ?? 0));

/** Wait for one Enter key (only used on errors in an interactive window). */
function pause() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { resolve(); return; }
    process.stdin.resume();
    process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
  });
}
