#!/usr/bin/env node
/*
 * apply-overlay.mjs —— 把本仓的**平台覆盖层**叠到你自备的官方《卫戍协议》0.2.5 上
 *
 * 它做什么：逐文件校验 + 先备份 + 再写入，最后可选把 11 个 Mod 一起拷进 mods/。
 * 它不做什么：不含任何官方素材；不会替你下载游戏本体；不联网。
 *
 * 用法（在本仓根目录下跑）：
 *   node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5" --dry-run
 *   node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5"
 *   node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5" --with-mods
 *   node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5" --with-mods --no-state
 *   node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5" --rollback "<备份目录>"
 *
 * `--with-mods` 把 **11 个 Mod** 拷进 `mods/`，它们**默认全部启用** ⇒ **不写** `mods/.state.json`；
 * 已存在的 `.state.json` **一个字都不动**。`--no-state` 保留为**兼容参数**（现在已经没有状态需要写了）。
 *
 * 三个安全闸：
 *   ① 完整性：overlay/ 里的每个文件都要与 overlay/MANIFEST.sha256 对得上（防下载损坏）；
 *   ② 原样性：目标文件必须与 overlay/ORIGIN.sha256 记录**逐字节相同**（= 你没改过官方文件），
 *      不一致 ⇒ 默认**拒绝覆盖**并报冲突（要用 --force 才强写）；
 *   ③ 可回滚：写之前把每个被覆盖的文件（含"原本不存在"这个事实）备份到
 *      <target>/.sp-overlay-backup-<时间戳>/，回滚只需把那个目录传回 --rollback。
 *
 * 退出码：0 = 成功（含 --dry-run 无冲突）；1 = 有冲突 / 校验失败；2 = 用法或路径错误。
 *
 * ★ 仓内这一份是**发布脚本逐字节复制**的产物（源副本留在开发工作区里，不随仓发布）。
 *   要改它请改工作区里的源副本再重新生成，不要直接编辑仓内副本。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OVERLAY = join(REPO, 'overlay');
const MANIFEST = join(OVERLAY, 'MANIFEST.sha256');
const ORIGIN = join(OVERLAY, 'ORIGIN.sha256');
const EXPECTED_GAME_VERSION = '0.2.5';

const argv = process.argv.slice(2);
function opt(name, fallback = null) { const i = argv.indexOf(name); return i === -1 ? fallback : (argv[i + 1] ?? true); }
const target = opt('--target');
const dryRun = argv.includes('--dry-run');
const withMods = argv.includes('--with-mods');
const force = argv.includes('--force');
const rollbackDir = opt('--rollback');
const jsonOut = opt('--json');

function usage(msg) {
  if (msg) console.error('错误: ' + msg);
  console.error('用法:');
  console.error('  node tools/apply-overlay.mjs --target <官方 0.2.5 目录> [--dry-run] [--with-mods] [--no-state] [--force] [--json <file>]');
  console.error('  node tools/apply-overlay.mjs --target <官方 0.2.5 目录> --rollback <备份目录>');
  process.exit(2);
}
if (!target) usage('缺 --target');
const TARGET = resolve(String(target));
if (!existsSync(TARGET)) usage('目标目录不存在: ' + TARGET);
if (!existsSync(MANIFEST) || !existsSync(ORIGIN)) usage('找不到 overlay/MANIFEST.sha256 或 overlay/ORIGIN.sha256（请在仓库根目录下跑）');

/* ---------------------------------------------------------------- 工具 */
function sha256(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }
function readList(p) {
  const out = new Map();
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    out.set(m[2].split(sep).join('/'), m[1]);
  }
  return out;
}
function hashOf(p) { return existsSync(p) ? sha256(p) : 'ABSENT'; }
function fmt(n) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function copyTree(src, dst, skipIfExists) {
  let n = 0, skipped = 0;
  const walk = (s, d) => {
    mkdirSync(d, { recursive: true });
    for (const e of readdirSync(s, { withFileTypes: true })) {
      const sp = join(s, e.name), dp = join(d, e.name);
      if (e.isDirectory()) { walk(sp, dp); continue; }
      if (!e.isFile()) continue;
      if (skipIfExists && existsSync(dp)) { skipped++; continue; }
      copyFileSync(sp, dp); n++;
    }
  };
  walk(src, dst);
  return { files: n, skipped };
}

/* ---------------------------------------------------------------- 回滚 */
if (rollbackDir) {
  const rb = resolve(String(rollbackDir));
  const meta = join(rb, 'BACKUP.json');
  if (!existsSync(meta)) usage('备份目录里没有 BACKUP.json: ' + rb);
  const rec = JSON.parse(readFileSync(meta, 'utf8'));
  let restored = 0, removed = 0, failed = 0;
  for (const e of rec.files) {
    const tp = join(TARGET, e.rel.split('/').join(sep));
    if (e.state === 'ABSENT') {
      if (existsSync(tp)) { rmSync(tp); removed++; }
      continue;
    }
    const bp = join(rb, 'files', e.rel.split('/').join(sep));
    if (!existsSync(bp)) { console.error('备份缺文件: ' + e.rel); failed++; continue; }
    mkdirSync(dirname(tp), { recursive: true });
    copyFileSync(bp, tp);
    if (hashOf(tp) !== e.state) { console.error('回滚校验失败: ' + e.rel); failed++; } else restored++;
  }
  console.log('=== apply-overlay 回滚 ===');
  console.log('还原 ' + restored + ' 个文件 · 删除本次新建 ' + removed + ' 个 · 失败 ' + failed);
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK（目标已回到打补丁前的状态）');
  process.exit(failed ? 1 : 0);
}

/* ---------------------------------------------------------------- 读清单 */
const manifest = readList(MANIFEST);
const origin = readList(ORIGIN);
const rels = [...manifest.keys()].sort();
if (!rels.length) usage('MANIFEST.sha256 是空的');

/* 闸①：覆盖层自身完整性 */
const corrupt = [];
for (const rel of rels) {
  const p = join(OVERLAY, rel.split('/').join(sep));
  if (!existsSync(p)) { corrupt.push(rel + '（缺文件）'); continue; }
  if (sha256(p) !== manifest.get(rel)) corrupt.push(rel + '（sha256 不符）');
}

/* 目标是不是官方 0.2.5 */
let gameVersion = null;
const pkg = join(TARGET, 'package.json');
if (existsSync(pkg)) {
  try { gameVersion = JSON.parse(readFileSync(pkg, 'utf8')).version ?? null; } catch { gameVersion = null; }
}
const versionOk = gameVersion === EXPECTED_GAME_VERSION;

/* 闸②：逐文件对现状 */
const plan = { write: [], conflict: [], already: [] };
for (const rel of rels) {
  const tp = join(TARGET, rel.split('/').join(sep));
  const cur = hashOf(tp);
  const want = origin.get(rel) ?? 'ABSENT';
  if (cur === want) plan.write.push({ rel, size: statSync(join(OVERLAY, rel.split('/').join(sep))).size });
  else if (cur === manifest.get(rel)) plan.already.push(rel);
  else plan.conflict.push({ rel, now: cur, expect: want });
}

console.log('=== apply-overlay · 把平台补丁叠到官方 0.2.5 ===');
console.log('仓库    : ' + REPO);
console.log('目标    : ' + TARGET);
console.log('目标版本: package.json version = ' + String(gameVersion) + (versionOk ? '  ✓' : '  ✗ 期望 ' + EXPECTED_GAME_VERSION));
console.log('覆盖层  : ' + rels.length + ' 个文件');
console.log('闸① 覆盖层自身完整性: ' + (corrupt.length ? '✗ ' + corrupt.length + ' 个不符' : '✓ ' + rels.length + '/' + rels.length));
for (const c of corrupt.slice(0, 10)) console.log('    x ' + c);
console.log('闸② 目标现状: 可写 ' + plan.write.length + ' · 已是本仓版本 ' + plan.already.length + ' · 冲突 ' + plan.conflict.length);
for (const c of plan.conflict.slice(0, 20)) console.log('    ! ' + c.rel + '  现在=' + c.now.slice(0, 12) + '  期望=' + c.expect.slice(0, 12));
if (plan.conflict.length > 20) console.log('    ... 其余 ' + (plan.conflict.length - 20) + ' 个冲突见 --json');

if (dryRun) {
  console.log('--- --dry-run：一个字节都没写 ---');
  const ok = !corrupt.length && !plan.conflict.length && versionOk;
  console.log(ok ? 'RESULT: OK（可以真跑）' : 'RESULT: FAIL（先解决上面带 x / ! 的项）');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ target: TARGET, dryRun: true, gameVersion, overlayCount: rels.length, corrupt, plan }, null, 2) + '\n', 'utf8');
  process.exit(ok ? 0 : 1);
}

if (corrupt.length) { console.error('★ 覆盖层自身校验失败 ⇒ 拒绝写入（重新下载本仓）'); process.exit(1); }
if (!versionOk && !force) { console.error('★ 目标不是官方 ' + EXPECTED_GAME_VERSION + ' ⇒ 拒绝写入（确认无误可加 --force）'); process.exit(1); }
const todo = force ? rels : plan.write.map((x) => x.rel);
if (!force && plan.conflict.length) {
  console.error('★ 有 ' + plan.conflict.length + ' 个文件与官方原版不一致 ⇒ 拒绝写入（你改过它们；确认可用 --force 覆盖）');
  process.exit(1);
}

/* ---------------------------------------------------------------- 写盘（先备份） */
const backupDir = String(opt('--backup', join(TARGET, '.sp-overlay-backup-' + stamp())));
mkdirSync(join(backupDir, 'files'), { recursive: true });
const backupRec = { target: TARGET, at: new Date().toISOString(), overlayCount: todo.length, files: [] };
let written = 0, backedUp = 0, bytes = 0;
for (const rel of todo) {
  const tp = join(TARGET, rel.split('/').join(sep));
  const op = join(OVERLAY, rel.split('/').join(sep));
  const before = hashOf(tp);
  if (before !== 'ABSENT') {
    const bp = join(backupDir, 'files', rel.split('/').join(sep));
    mkdirSync(dirname(bp), { recursive: true });
    copyFileSync(tp, bp);
    backedUp++;
  }
  backupRec.files.push({ rel, state: before });
  mkdirSync(dirname(tp), { recursive: true });
  copyFileSync(op, tp);
  written++; bytes += statSync(op).size;
}
writeFileSync(join(backupDir, 'BACKUP.json'), JSON.stringify(backupRec, null, 2) + '\n', 'utf8');

/* 写后复核 */
const bad = [];
for (const rel of todo) {
  if (hashOf(join(TARGET, rel.split('/').join(sep))) !== manifest.get(rel)) bad.push(rel);
}
console.log('--- 已写入 ---');
console.log('文件 ' + written + ' 个 / ' + fmt(bytes) + ' · 覆盖前备份 ' + backedUp + ' 个（原本不存在的记 ABSENT）');
console.log('备份目录: ' + backupDir);
console.log('写后逐文件复核: ' + (bad.length ? '✗ ' + bad.length + ' 个不符' : '✓ ' + todo.length + '/' + todo.length + ' sha256 一致'));

/* ★ 2026-10-13（发布集收窄）：仓里只剩**已上线**的 Mod（外加样例包 `demo`）—— **11 个默认全部启用**
 *   ⇒ **不再需要**写 `mods/.state.json`（7 个历史归档 Mod 已整体移出仓库，没有要停用的东西了）。
 *   `--no-state` 保留为**兼容参数**（现在是空操作），免得旧命令行报错。 */
const noState = argv.includes('--no-state');   // 兼容保留：现在没有状态需要写

/* 可选：把 11 个 Mod 拷进 mods/ */
let modsResult = null;
if (withMods) {
  const src = join(REPO, 'mods');
  const dst = join(TARGET, 'mods');
  const ids = readdirSync(src, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  mkdirSync(dst, { recursive: true });
  const skipped = ids.filter((id) => existsSync(join(dst, id)));
  let n = 0;
  for (const id of ids) { if (skipped.includes(id)) continue; n += copyTree(join(src, id), join(dst, id), false).files; }
  modsResult = { mods: ids.length, copied: ids.length - skipped.length, skipped, files: n };
  console.log('--- Mods ---');
  console.log('拷入 ' + modsResult.copied + '/' + modsResult.mods + ' 个 Mod（' + n + ' 文件）到 ' + dst);
  if (skipped.length) console.log('★ 已存在、未覆盖（请自己确认要不要换）: ' + skipped.join(', '));

  const statePath = join(dst, '.state.json');
  let stateAction;
  if (existsSync(statePath)) {
    stateAction = '已有 mods/.state.json ⇒ 一个字都没动（11 个 Mod 默认全启用；要停用请自己跑'
      + ' node tools/mod.mjs disable <id>）';
  } else {
    stateAction = '11 个 Mod **默认全部启用** ⇒ 不写 mods/.state.json'
      + (noState ? '（--no-state 已保留为兼容参数）' : '');
  }
  modsResult.stateAction = stateAction;
  console.log('启停状态: ' + stateAction);
  console.log('★ 若某个 Mod 的 gameVersion 与目标本体不一致，它会在 /mods 列表里带一行');
  console.log('  「gameVersion=X 与当前游戏版本 Y 不一致」并被 skipped —— 不装载、**不崩服**，其余 Mod 照常；');
  console.log('  此时 `mod.mjs validate` 会以退出码 1 报出它们。★ 版本号必须与本体 package.json 的');
  console.log('  version **严格相等**（严格相等硬门槛；打了新版本要所有 Mod 一起改）。');
}

console.log('--- 下一步 ---');
console.log('  cd "' + TARGET + '" && node tools/mod.mjs validate');
console.log('  回滚: node tools/apply-overlay.mjs --target "' + TARGET + '" --rollback "' + backupDir + '"');
const ok = !bad.length;
console.log(ok ? 'RESULT: OK' : 'RESULT: FAIL');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ target: TARGET, gameVersion, backupDir, written, backedUp, bytes, bad, modsResult }, null, 2) + '\n', 'utf8');
process.exit(ok ? 0 : 1);
