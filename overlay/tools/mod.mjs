#!/usr/bin/env node
// tools/mod.mjs — Mod 管理 CLI（本地严格校验 / 打包 / 安装 / 启停）。
//
// 用法：
//   node tools/mod.mjs list [--json]                 列出 Mod（含启用状态与校验结果）
//   node tools/mod.mjs validate [<id>] [--strict]    校验（默认全部）；有错误时退出码 1
//                                                    ★ 页面文案门禁：summary > 50 字只报「提示」，不影响退出码；
//                                                      `--strict` 才把它当失败（docs/MODS.md §4.12.8）
//   node tools/mod.mjs enable  <id>                  启用
//   node tools/mod.mjs disable <id>                  停用
//   node tools/mod.mjs pack    <id> [-o out.spmod]   打包成单文件（**先校验，不通过拒绝打包**）
//   node tools/mod.mjs install <file.spmod>          安装（解包到 mods/<id>/）
//   node tools/mod.mjs uninstall <id>                卸下（移动到 mods/_removed/，不直接删）
//   node tools/mod.mjs lint    <dir>                 校验一个 Mod 目录（预打包门禁用；不必在 mods/ 下）
//                                                    ★ 同样报 summary > 50 字的「提示」；`--strict` 才判失败
//   node tools/mod.mjs verify [--mode <modeId>] [--rolls N]
//                                                    在**真实引擎**上验证：合并后新增的干员是否真进了抽卡池
//                                                    （构造 GameData + SharedPool 实抽 N 次）
//
// 通用选项：--mods <dir> 指定 Mod 仓库（默认 <repo>/mods，其次环境变量 SP_MODS）
// 退出码：0 成功 / 1 校验或业务失败 / 2 用法错误

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOD_API_VERSION, MANIFEST_FILE, DATA_SUBDIR, CONTENT_SUBDIR, CONTENT_ENTRY, CLIENT_SUBDIR, CLIENT_ENTRY, ASSETS_SUBDIR, readState, writeState, validateManifest, validateChessRecord } from '../server/mods/loader.js';
import { applyOps, clone } from '../server/mods/patch.js';
import { zipWrite, zipRead } from '../server/mods/zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const APP_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return null; }
})();

const argv = process.argv.slice(2);
const flags = { json: false, strict: false };
let modsDirOpt = null;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') { flags.json = true; continue; }
  if (a === '--strict') { flags.strict = true; continue; }
  if (a === '--mods') { modsDirOpt = argv[++i]; continue; }
  if (a === '-o') { flags.out = argv[++i]; continue; }
  if (a === '--force') { flags.force = true; continue; }
  if (a === '--mode') { flags.mode = argv[++i]; continue; }
  if (a === '--rolls') { flags.rolls = Number(argv[++i]); continue; }
  rest.push(a);
}
const MODS_DIR = path.resolve(modsDirOpt || process.env.SP_MODS || path.join(ROOT, 'mods'));

const colors = process.stdout.isTTY
  ? { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` }
  : { red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s };

// ---------------------------------------------------------------------------------------------------
// 校验（对任意目录都能跑；用于 lint 与 pack 门禁）
// ---------------------------------------------------------------------------------------------------

/**
 * 目录名是不是一个 Mod？
 * `.` 前缀 = 本机状态 / 导出包 / 上传缓存；`_` 前缀 = 平台自己的目录（uninstall 把 Mod 挪到 `_removed/`）。
 * ★ 两者都必须排除：否则被卸下的 Mod 会被当成「缺少 mod.json 的坏 Mod」，list/validate 里永远多一条噪声。
 */
const isModDirName = (name) => !name.startsWith('.') && !name.startsWith('_');

/**
 * `summary` 的字数上限（**含**中文 / 全角字符按 1 个字算）。
 * 出处 = `docs/MODS.md` §4.12.8.2 的分工表：`summary` ≤ 50 字、一句话、不含细节。
 */
const SUMMARY_MAX = 50;

/** 跨 Mod「内容包」的固定文件名（贡献方 Mod 根目录，纯数据；docs/MODS.md §4.7）。 */
const ROOT_DATA_PACK = 'skinvoice-pack.json';

/**
 * 「实时文档」的固定文件名（Mod 根目录，纯数据；docs/MODS.md §4.14）。
 * 它是**本机运行态**（服主在 Mod 管理页实时发布的东西），所以：
 *   · **允许**随包分发 —— 一律以**空文档**（LIVE_SEED）进包，消费者（Mod 的 client/ 代码）因此永远
 *     能 GET 到一个 200 的文件，不需要为「还没发布过」写一条 404 分支、也不会在控制台刷 404；
 *   · 但**发布过的内容绝不外流** —— 打包时逐字节替换成 LIVE_SEED（别人不该继承你这台服务器的横幅）。
 */
const LIVE_FILE = 'live.json';
/** 进包的**空**实时文档（逐字节固定；与 server/admin.js 的 LIVE_FILE 同名同格式）。 */
const LIVE_SEED = '{\n  "items": []\n}\n';

/**
 * 安装时允许落盘的包内条目（其余一律跳过）。
 * 必须是「Mod 运行真正需要的东西」的全集：清单 / 数据补丁 / 行为代码 / **界面扩展** / **自带美术** /
 * 根目录说明文档。
 * ★ 自带美术与界面扩展都极易漏 —— server/admin.js 的 hasAssets、server/index.js 的 /assets/** 兜底、
 *   管理页的「含美术」筛选都建立在 `assets/` 之上；GET /mods 的 client 入口 URL 建立在 `client/` 之上。
 *   漏掉白名单等于这些功能全部落空（且不报错）。
 */
const isInstallableEntry = (name) => (
  name === MANIFEST_FILE
  || name.startsWith(`${DATA_SUBDIR}/`)
  || name.startsWith(`${CONTENT_SUBDIR}/`)
  || name.startsWith(`${CLIENT_SUBDIR}/`)
  || name.startsWith(`${ASSETS_SUBDIR}/`)
  // 跨 Mod「内容包」：固定文件名、纯数据、放在贡献方 Mod 的**根目录**（docs/MODS.md §4.7；
  // 现成贡献方 = mods/cyanfish.makoto/skinvoice-pack.json，由 cyanfish.skinvoice 通过 /mods/<id>/… 读取）。
  // ★ 曾经这里漏了它 ⇒ 打包-分发-安装一圈下来，贡献包被**静默丢弃**，消费方永远发现不了它（不报错、只是没皮肤语音）。
  || name === ROOT_DATA_PACK
  // 「实时文档」（docs/MODS.md §4.14）：固定文件名、纯数据，进包时**一律**被替换成空文档（见 LIVE_SEED）。
  || name === LIVE_FILE
  || /^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|txt)$/.test(name)   // 根目录的 README/SOURCE/LICENSE 等说明
);

/** 读取基础数据（不做 Mod 合并）。 */
function readBaseData() {
  const out = {};
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    try { out[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { /* skip */ }
  }
  return out;
}

/** 对「一个 Mod 目录」做完整校验（不写入任何东西）。@returns {{errors:string[], warnings:string[], ops:Array}} */
function validateModDir(dir, id, baseData) {
  const errors = [];
  const warnings = [];
  const opsAll = [];
  const mp = path.join(dir, MANIFEST_FILE);
  if (!fs.existsSync(mp)) return { errors: [`缺少 ${MANIFEST_FILE}`], warnings, ops: opsAll };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) { return { errors: [`${MANIFEST_FILE} 解析失败: ${e.message}`], warnings, ops: opsAll }; }
  const v = validateManifest(manifest, id);
  errors.push(...v.errors);
  warnings.push(...v.warnings);
  if (APP_VERSION && manifest.gameVersion && manifest.gameVersion !== APP_VERSION) {
    errors.push(`gameVersion=${manifest.gameVersion} 与当前游戏版本 ${APP_VERSION} 不一致`);
  }
  // ★★ 页面文案门禁（docs/MODS.md §4.12.8.2 / §4.12.8.4）：管理页列表里那一行「功能简述」是**索引**，不是说明书。
  //   `summary` 只许「这个 Mod 干什么」的一句话，**≤ 50 字**；细节（参数清单 / 依赖与风险 / 上游是否已修 / 版本日志 /
  //   第二件事）一律搬进 `description`、`README.md`、`CHANGELOG.md`。
  //   ★ 只报 **warning**（不阻断）：存量 Mod 还在整改、且长度本身不影响运行 ⇒ 做成 error 会破坏现有流程；
  //     要把它当门禁用，加 `--strict`（把 warning 升级为退出码 1）。
  const summaryLen = typeof manifest.summary === 'string' ? [...manifest.summary.trim()].length : 0;
  if (summaryLen > SUMMARY_MAX) {
    warnings.push(`summary ${summaryLen} 字 > ${SUMMARY_MAX} 字（§4.12.8：列表那一行只写「这个 Mod 干什么」的一句话，`
      + '细节请搬进 description / README.md / CHANGELOG.md）');
  }
  const ddir = path.join(dir, DATA_SUBDIR);
  // L3 行为代码通道（server/mods/content.js）：两端都会装载 content/index.js。
  // ★ 曾经这里是「L3 本期未启用，将被忽略」——L3 早已落地（结城理的二段替身就靠它），
  //   那条提示会让 Mod 作者以为自己写的代码没生效，属于错误信息，已换成真正值得提示的情况。
  const cdir = path.join(dir, CONTENT_SUBDIR);
  const hasContent = fs.existsSync(path.join(cdir, CONTENT_ENTRY));
  if (fs.existsSync(cdir) && !hasContent) warnings.push(`content/ 下没有 ${CONTENT_ENTRY}：行为代码不会被装载（该目录会被忽略）`);
  // 客户端界面扩展通道（server/mods/client.js）：只在玩家浏览器里跑，服务端不加载。
  const kdir = path.join(dir, CLIENT_SUBDIR);
  const hasClient = fs.existsSync(path.join(kdir, CLIENT_ENTRY));
  if (fs.existsSync(kdir) && !hasClient) warnings.push(`client/ 下没有 ${CLIENT_ENTRY}：界面扩展不会被装载（该目录会被忽略）`);
  if (!fs.existsSync(ddir)) {
    // 与 server/mods/loader.js 同口径：data/ 与 content/index.js、client/index.js 都没有，才算「空 Mod」
    // ★ 必须把 manifest 一起返回：cmdList 靠它显示名字/版本/作者。曾经这里漏了它，
    //   于是「没有 data/ 的 Mod」在 list 里显示成 (无清单) v- by - （纯界面/纯美术 Mod 一眼看着像坏的）。
    if (!hasContent && !hasClient) warnings.push('既没有 data/ 补丁、content/ 行为模块，也没有 client/ 界面扩展（空 Mod？）');
    return { errors, warnings, ops: opsAll, manifest };
  }

  // 在一个临时副本上试跑，确认补丁真的能应用
  const work = {};
  for (const [k, val] of Object.entries(baseData)) work[k] = clone(val);
  /** target → 被触碰过的顶层 key 集合（用于记录级校验） */
  const touchedByTarget = new Map();
  for (const f of fs.readdirSync(ddir).sort()) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const target = f.slice(0, -5);
    if (!Object.hasOwn(work, target)) { errors.push(`data/${f}：目标文件 data/${target}.json 不存在`); continue; }
    let patch;
    try { patch = JSON.parse(fs.readFileSync(path.join(ddir, f), 'utf8')); } catch (e) { errors.push(`data/${f}: JSON 解析失败 ${e.message}`); continue; }
    if (!patch || typeof patch !== 'object' || !Array.isArray(patch.ops)) { errors.push(`data/${f}: 顶层必须是 { "ops": [ … ] }`); continue; }
    const res = applyOps(work[target], patch.ops, { where: `${id}/data/${f}` });
    errors.push(...res.errors);
    // path 疑点（如段里含 "/"）：只提示，不影响 ok / applied（见 server/mods/patch.js pathWarnings）
    if (res.warnings?.length) warnings.push(...res.warnings);
    const set = touchedByTarget.get(target) || new Set();
    for (const a of res.applied) set.add(a.path.split('.')[0]);
    touchedByTarget.set(target, set);
    opsAll.push(...res.applied.map((a) => ({ target, ...a })));
  }
  // 记录级校验：对「被本 Mod 触碰过的 key」跑干员记录的严格检查（与加载器同一套口径）
  for (const [target, touched] of touchedByTarget.entries()) {
    if (target !== 'chess') continue;
    for (const cid of [...touched].sort()) {
      const rec = work.chess?.[cid];
      if (rec === undefined) continue; // 被 remove 掉
      const r = validateChessRecord(cid, rec, work);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
  }
  return { errors, warnings, ops: opsAll, work, manifest };
}

// ---------------------------------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------------------------------

function cmdList() {
  if (!fs.existsSync(MODS_DIR)) {
    console.log(colors.dim(`（Mod 仓库不存在: ${MODS_DIR}）`));
    return 0;
  }
  const state = readState(MODS_DIR);
  const disabled = new Set(state.disabled);
  const rows = [];
  for (const d of fs.readdirSync(MODS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory() || !isModDirName(d.name)) continue;
    const dir = path.join(MODS_DIR, d.name);
    const v = validateModDir(dir, d.name, readBaseData());
    const m = v.manifest || {};
    // 落地轴一览（一眼看出这个 Mod 属于哪一类）：数据补丁 / 战斗行为 / 界面扩展 / 自带美术。
    const axes = [
      v.ops.length ? `数据×${v.ops.length}` : null,
      fs.existsSync(path.join(dir, CONTENT_SUBDIR, CONTENT_ENTRY)) ? '行为' : null,
      fs.existsSync(path.join(dir, CLIENT_SUBDIR, CLIENT_ENTRY)) ? '界面' : null,
      fs.existsSync(path.join(dir, ASSETS_SUBDIR)) ? '美术' : null,
    ].filter(Boolean).join('+') || '空';
    rows.push({
      id: d.name, name: m.name ?? '(无清单)', version: m.version ?? '-', author: m.author ?? '-',
      enabled: !disabled.has(d.name), errors: v.errors, warnings: v.warnings, ops: v.ops.length, axes,
    });
  }
  if (flags.json) { console.log(JSON.stringify({ modsDir: MODS_DIR, appVersion: APP_VERSION, mods: rows }, null, 2)); return rows.some((r) => r.errors.length) ? 1 : 0; }
  console.log(colors.bold(`Mod 仓库: ${MODS_DIR}   (游戏版本 ${APP_VERSION}, API v${MOD_API_VERSION})`));
  if (!rows.length) { console.log(colors.dim('  （空）')); return 0; }
  for (const r of rows) {
    const st = r.errors.length ? colors.red('✗ 错误') : r.enabled ? colors.green('● 启用') : colors.dim('○ 停用');
    console.log(`  ${st}  ${colors.bold(r.id)}  ${r.name} v${r.version}  ${colors.dim('by ' + r.author + '  [' + r.axes + ']')}`);
    for (const e of r.errors) console.log('        ' + colors.red('错误: ') + e);
    for (const w of r.warnings) console.log('        ' + colors.yellow('提示: ') + w);
  }
  const bad = rows.filter((r) => r.errors.length).length;
  console.log(bad ? colors.red(`\n${bad} 个 Mod 有错误`) : colors.green('\n全部 Mod 校验通过'));
  return bad ? 1 : 0;
}

function cmdValidate(only) {
  const ids = only ? [only] : (fs.existsSync(MODS_DIR) ? fs.readdirSync(MODS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && isModDirName(d.name)).map((d) => d.name) : []);
  const base = readBaseData();
  let failed = 0;
  let warned = 0;
  const out = [];
  for (const id of ids) {
    const dir = path.join(MODS_DIR, id);
    const v = validateModDir(dir, id, base);
    out.push({ id, errors: v.errors, warnings: v.warnings, ops: v.ops.length });
    if (v.errors.length) failed++;
    if (v.warnings.length) warned++;
  }
  // ★ `--strict`：把 warning 当失败（给"想拿它当门禁"的场合用）；默认只看 error，退出码不受 warning 影响。
  const strictBad = flags.strict ? warned : 0;
  if (flags.json) { console.log(JSON.stringify(out, null, 2)); return (failed || strictBad) ? 1 : 0; }
  for (const r of out) {
    const tag = r.errors.length ? colors.red('✗') : colors.green('✓');
    console.log(`${tag} ${r.id}  (${r.ops} ops)`);
    for (const e of r.errors) console.log('    ' + colors.red('错误: ') + e);
    for (const w of r.warnings) console.log('    ' + colors.yellow('提示: ') + w);
  }
  const tail = failed
    ? colors.red(`\n${failed}/${out.length} 个 Mod 校验未通过`)
    : colors.green(`\n${out.length} 个 Mod 全部通过`);
  console.log(tail + (warned ? colors.yellow(`  （另有 ${warned} 个 Mod 有提示，不影响通过）`) : ''));
  return (failed || strictBad) ? 1 : 0;
}

function setEnabled(id, on) {
  if (!fs.existsSync(path.join(MODS_DIR, id))) { console.error(colors.red(`Mod 不存在: ${id}`)); return 1; }
  const state = readState(MODS_DIR);
  const set = new Set(state.disabled);
  if (on) set.delete(id); else set.add(id);
  writeState(MODS_DIR, { ...state, disabled: [...set] });
  console.log(`${on ? colors.green('已启用') : colors.dim('已停用')} ${id}  ${colors.dim('（重启游戏服务后生效）')}`);
  return 0;
}

function cmdPack(id) {
  const dir = path.join(MODS_DIR, id);
  if (!fs.existsSync(dir)) { console.error(colors.red(`Mod 不存在: ${id}`)); return 1; }
  const v = validateModDir(dir, id, readBaseData());
  if (v.errors.length && !flags.force) {
    console.error(colors.red(`✗ ${id} 校验未通过，拒绝打包（--force 可强制）:`));
    for (const e of v.errors) console.error('    ' + e);
    return 1;
  }
  const ents = [];
  const walk = (abs, rel) => {
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue; // 不含本机状态/隐藏文件
      const a = path.join(abs, d.name);
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(a, r);
      // ★ 实时文档**强制**以空文档进包：它是本机运行态（服主发布过的横幅不该跟着 .spmod 跑到别人服务器上），
      //   但包里必须**有**这个文件（消费者因此永远 GET 到 200，不必为"还没发布过"写一条 404 分支）。
      else if (!rel && d.name === LIVE_FILE) ents.push({ name: r, data: Buffer.from(LIVE_SEED, 'utf8') });
      else ents.push({ name: r, data: fs.readFileSync(a) });
    }
  };
  walk(dir, '');
  const out = path.resolve(flags.out || `${id}-${v.manifest?.version || '0.0.0'}.spmod`);
  fs.writeFileSync(out, zipWrite(ents, { level: 9 }));
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(colors.green(`✓ 已打包 ${out}`) + colors.dim(`  (${ents.length} 个文件, ${kb} KB)`));
  return 0;
}

function cmdInstall(file) {
  if (!fs.existsSync(file)) { console.error(colors.red(`文件不存在: ${file}`)); return 1; }
  const { entries, errors } = zipRead(fs.readFileSync(file));
  if (errors.length) { console.error(colors.red('包有问题:')); for (const e of errors) console.error('    ' + e); return 1; }
  const mf = entries.find((e) => e.name === MANIFEST_FILE);
  if (!mf) { console.error(colors.red(`包里没有 ${MANIFEST_FILE}`)); return 1; }
  let manifest;
  try { manifest = JSON.parse(mf.data.toString('utf8')); } catch (e) { console.error(colors.red(`${MANIFEST_FILE} 解析失败: ${e.message}`)); return 1; }
  const id = manifest.id;
  const v = validateManifest(manifest, id);
  if (v.errors.length) { console.error(colors.red('清单校验失败:')); for (const e of v.errors) console.error('    ' + e); return 1; }
  const dest = path.join(MODS_DIR, id);
  if (fs.existsSync(dest)) { console.error(colors.red(`目标已存在: ${dest}（请先 uninstall）`)); return 1; }
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  let skipped = 0;
  for (const e of entries) {
    // ★ 白名单必须包含 assets/：Mod 自带美术靠 server/index.js 的 /assets/** 兜底搜索下发，
    //   漏掉它会让「打包 → 分发 → 安装」出来的 Mod **一个美术文件都不剩**（只有 data/ 补丁生效，
    //   皮肤/新干员立绘全部 404）。根目录的说明文档（README/SOURCE/LICENSE.md|txt）一并放行，让出处
    //   与授权声明能跟着包走；其余一律拒绝并计数，装完明确报出来。
    if (!isInstallableEntry(e.name)) {
      console.log(colors.yellow(`  跳过包内非预期文件: ${e.name}`));
      skipped++;
      continue;
    }
    const p = path.join(dest, ...e.name.split('/'));
    if (!p.startsWith(dest + path.sep)) { console.error(colors.red(`  拒绝越界路径: ${e.name}`)); skipped++; continue; }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, e.data);
    n++;
  }
  console.log(colors.green(`✓ 已安装 ${id} v${manifest.version}`) + colors.dim(`  → ${dest}  (${n} 个文件${skipped ? `, 跳过 ${skipped}` : ''})`));
  // 装完立刻校验一遍
  const chk = validateModDir(dest, id, readBaseData());
  if (chk.errors.length) {
    console.error(colors.red('⚠ 装完校验未通过，请修正后再启用:'));
    for (const e of chk.errors) console.error('    ' + e);
    return 1;
  }
  console.log(colors.green('  校验通过；默认已启用，重启游戏服务后生效。'));
  return 0;
}

function cmdUninstall(id) {
  const dir = path.join(MODS_DIR, id);
  if (!fs.existsSync(dir)) { console.error(colors.red(`Mod 不存在: ${id}`)); return 1; }
  const trash = path.join(MODS_DIR, '_removed');
  fs.mkdirSync(trash, { recursive: true });
  let dest = path.join(trash, id);
  if (fs.existsSync(dest)) dest = path.join(trash, `${id}-${Date.now()}`);
  fs.renameSync(dir, dest);
  console.log(colors.green(`✓ 已卸下 ${id}`) + colors.dim(`  → ${dest}（可直接删掉该目录）`));
  return 0;
}

/**
 * verify —— 在真实引擎上验证「新增的干员是否真的会出现在商店/抽卡池里」。
 *
 * 只信 data/*.json 里有是不够的：gamedata.js 会按 visible && !isGolden && !isDiy && !isHidden && tier 过滤出
 * visibleChess，pool.js 再按模式的 ban 与 poolCopies 建牌库。这里直接构造 GameData + SharedPool 并真抽 N 次，
 * 把「理论份额」和「实测出现次数」都打出来 —— 这是干员类 Mod 上线前最有说服力的自检。
 */
async function cmdVerify() {
  const { loadDataMerged } = await import('../server/data.js');
  const { GameData } = await import('../server/match/gamedata.js');
  const { SharedPool } = await import('../server/match/pool.js');
  const { createRng } = await import('../server/sim/rng.js');

  const rolls = Number.isFinite(flags.rolls) && flags.rolls > 0 ? Math.floor(flags.rolls) : 200000;
  const base = readBaseData();
  const quiet = { info() {}, warn() {}, error() {}, debug() {} };
  const merged = loadDataMerged(DATA_DIR, { log: quiet, modsDir: MODS_DIR, appVersion: APP_VERSION });
  const data = merged.data;

  const baseChess = base.chess && typeof base.chess === 'object' ? base.chess : {};
  const added = Object.keys(data.chess || {}).filter((id) => !Object.hasOwn(baseChess, id)).sort();
  const gone = Object.keys(baseChess).filter((id) => !Object.hasOwn(data.chess || {}, id)).sort();

  const modeId = flags.mode || 'mode_multi_hard';
  const gd = new GameData(data, modeId);
  const pool = new SharedPool(gd, { banned: [], players: 4 });
  const rng = createRng(0x5eed ^ 0x1234);

  const hits = new Map();
  for (let i = 0; i < rolls; i++) {
    const id = pool.roll(rng, { maxTier: 6 });
    if (id) hits.set(id, (hits.get(id) || 0) + 1);
  }
  const totalCopies = pool.totalLeft();

  const rows = added.map((id) => {
    const rec = data.chess[id] || {};
    const golden = rec.isGolden === true;
    const shareEligible = !!(rec.visible && !golden && !rec.isDiy && !rec.isHidden && Number.isInteger(rec.tier));
    const inVisible = gd.visibleChess.includes(id);
    const inPool = pool.has(id);
    const cap = inPool ? pool.cap(id) : 0;
    const observed = hits.get(id) || 0;
    const expected = inPool && totalCopies > 0 ? cap / totalCopies : 0;
    // 金色形态不进商店池（由三合一产生）：改查它的普通形态是否在池里
    const baseId = golden ? rec.baseId : null;
    const goldenOk = golden ? (typeof baseId === 'string' && pool.has(baseId)) : null;
    const ok = golden ? goldenOk === true : (shareEligible && inVisible && inPool);
    return { id, name: rec.name ?? null, tier: rec.tier ?? null, golden, shareEligible, inVisible, inPool, cap,
             observed, expected, baseId, goldenOk, ok };
  });

  const bad = rows.filter((r) => !r.ok);

  if (flags.json) {
    console.log(JSON.stringify({
      modsDir: MODS_DIR, mode: modeId, rolls, poolTotal: totalCopies,
      visibleChess: gd.visibleChess.length, chessTotal: Object.keys(data.chess || {}).length,
      added, removed: gone, rows, ok: bad.length === 0,
    }, null, 2));
    return bad.length ? 1 : 0;
  }

  console.log(colors.bold(`真实引擎验证 · 模式 ${modeId} · 抽 ${rolls} 次`));
  console.log(colors.dim(`  Mod 仓库 ${MODS_DIR}`));
  console.log(`  干员总数 ${Object.keys(baseChess).length} → ${Object.keys(data.chess || {}).length}` +
    `   可上商店(visibleChess) ${gd.visibleChess.length}   牌库总张数 ${totalCopies}`);
  if (merged.report && merged.report.patched.length) {
    console.log(colors.dim(`  被补丁的数据文件: ${merged.report.patched.join(', ')}`));
  }
  if (!added.length && !gone.length) {
    console.log(colors.yellow('\n  Mod 没有增删任何干员（只改了数值）—— 无可验证的新增项。'));
    return 0;
  }

  for (const r of rows) {
    const tag = r.ok ? colors.green('✓') : colors.red('✗');
    const kind = r.golden ? colors.dim('[金色/三合一产物]') : '';
    console.log(`\n  ${tag} ${colors.bold(r.id)}  ${r.name ?? '(无名)'}  T${r.tier ?? '?'} ${kind}`);
    if (r.golden) {
      console.log(`      普通形态 ${r.baseId ?? '(缺 baseId)'} → 在牌库中: ${r.goldenOk ? colors.green('是') : colors.red('否')}`);
      if (!r.goldenOk) console.log(colors.red('      ✗ 三合一目标不可得：普通形态不在池里，精英化会失败'));
    } else {
      console.log(`      商店资格(visible/非金/非DIY/非隐藏/tier): ${r.shareEligible ? colors.green('是') : colors.red('否')}`);
      console.log(`      进 visibleChess: ${r.inVisible ? colors.green('是') : colors.red('否')}` +
        `   进牌库: ${r.inPool ? colors.green('是') : colors.red('否')}   每人份数 cap=${r.cap}`);
      console.log(`      实测 ${rolls} 抽出现 ${colors.bold(String(r.observed))} 次` +
        `   理论份额 ${(r.expected * 100).toFixed(2)}%` +
        `   （约每次开店 ${(r.expected * 5).toFixed(3)} 张 / 5 格）`);
      if (!r.ok) console.log(colors.red('      ✗ 新干员进不了商店：检查 visible/isDiy/isGolden/isHidden/tier 或该模式的 ban'));
    }
  }
  for (const id of gone) {
    console.log(`\n  ${colors.yellow('⚠')} ${colors.bold(id)} 已被 Mod 移除` +
      colors.dim('（原版干员；引用它的地图/盟约会退化）'));
  }

  console.log(bad.length ? colors.red(`\n${bad.length} 个新增项无法进入商店`) : colors.green('\n全部新增项均可在商店正常出现'));
  return bad.length ? 1 : 0;
}

function cmdLint(dirArg) {
  const dir = path.resolve(dirArg);
  if (!fs.existsSync(dir)) { console.error(colors.red(`目录不存在: ${dir}`)); return 1; }
  let id = path.basename(dir);
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'));
    if (m.id) id = m.id;
  } catch { /* id 用目录名 */ }
  const v = validateModDir(dir, id, readBaseData());
  if (v.errors.length) { console.error(colors.red(`✗ ${id} 校验未通过:`)); for (const e of v.errors) console.error('    ' + e); }
  else console.log(colors.green(`✓ ${id} 校验通过`) + colors.dim(`  (${v.ops.length} ops)`));
  for (const w of v.warnings) console.log('    ' + colors.yellow('提示: ') + w);
  // ★ `--strict`：warning（如 summary 超 50 字）也算失败；默认不算（见文件头）。
  return (v.errors.length || (flags.strict && v.warnings.length)) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------------------------------

const [cmd, arg] = rest;
let code = 0;
switch (cmd) {
  case 'list': code = cmdList(); break;
  case 'validate': code = cmdValidate(arg); break;
  case 'enable': code = arg ? setEnabled(arg, true) : usage(); break;
  case 'disable': code = arg ? setEnabled(arg, false) : usage(); break;
  case 'pack': code = arg ? cmdPack(arg) : usage(); break;
  case 'install': code = arg ? cmdInstall(path.resolve(arg)) : usage(); break;
  case 'uninstall': code = arg ? cmdUninstall(arg) : usage(); break;
  case 'lint': code = arg ? cmdLint(arg) : usage(); break;
  case 'verify': code = await cmdVerify(); break;
  default: code = usage();
}
process.exit(code);

function usage() {
  console.error('用法: node tools/mod.mjs <list|validate|enable|disable|pack|install|uninstall|lint|verify> [参数]'
    + ' [--mods <dir>] [--json] [--strict] [-o out.spmod] [--force] [--mode <modeId>] [--rolls N]');
  console.error('  --strict  把 warning 也当失败（validate / lint；默认只看 error）'
    + '。页面文案门禁见 docs/MODS.md §4.12.8：summary 应 ≤ 50 字。');
  return 2;
}
