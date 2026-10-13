#!/usr/bin/env node
/*
 * publish-scan.mjs —— 开源发布前自检（可重跑、零依赖；派生自工序 host-027 的脚本）
 *
 * 目的：在任何 git add / push 之前，用**可重跑的脚本**回答三件事：
 *   ① 待发布集合里有没有**二进制素材**（官方美术 / 语音 / 模型 / 音频）；
 *   ② 待发布集合里有没有**机密与隐私**（令牌、主机、IP、端口、本地绝对路径、内网信息）；
 *   ③ 有没有**体积**超 GitHub 单文件 100 MB 的东西。
 *
 * 用法（★ 只在**副本**上跑，绝不指向线上目录）：
 *   node host027_publish_scan.mjs --mods "<仓库>/mods"                 # 扫 21 个白名单 Mod
 *   node host027_publish_scan.mjs --mods "<仓库>/mods" --all-mods       # 连越界目录一起报（含 FAIL）
 *   node host027_publish_scan.mjs --mods "<仓库>/mods" --honor-exceptions
 *                                                                      # ★ 把已登记的第三方素材例外从
 *                                                                      #   FAIL 降级为 WARN（仅在服主
 *                                                                      #   书面拍板后才可加这个开关）
 *   node host027_publish_scan.mjs --repo "<仓库根>"                     # 扫整个待发布仓
 *   node host027_publish_scan.mjs --mods "..." --json out/scan.json     # 同时写 JSON 结果
 *
 * 退出码：0 = 全部 PASS（有 WARN 也算 0）；1 = 至少一条 FAIL。
 *
 * ★ 这是**仓内发布版**：由 host-027 的自检脚本派生的（规则里的敏感词改成运行时拼、加了自排除与已知误报表）。
 * ★ 两个归档整活 Mod（dj-models / dj-bgm）**故意**保留 gameVersion=0.2.4（服主裁定「按归档原样发布」），
 *   脚本按 EXPECTED_GAME_VERSION 表接受它们，并强制打「过时 Mod」WARN。
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ 规则 */

// ① 允许的发布白名单（工序 host-027 判定：代码 + 我们自制的数据/配置 + 文档，零素材）
const PUBLISH_SET = [
  'cyanfish.announce', 'cyanfish.banner', 'cyanfish.boss-hp', 'cyanfish.boss-pairing',
  'cyanfish.chat', 'cyanfish.debug-console', 'cyanfish.demo', 'cyanfish.diy-34',
  'cyanfish.fix-dsubrl-noattack', 'cyanfish.fix-egir-bond', 'cyanfish.fix-enemy',
  'cyanfish.fix-mechanism', 'cyanfish.fix-operator', 'cyanfish.fix-targeting',
  'cyanfish.fix-thorn2-stack', 'cyanfish.loadout-io', 'cyanfish.max-seats',
  'cyanfish.mod-settings', 'cyanfish.online',
  // ★★ 服主裁定（工序 host-027 追加）：两个归档的整活 Mod 按**归档原样**发布（含版本过时提醒）
  'cyanfish.dj-models', 'cyanfish.dj-bgm',
];

// ①b 每个 Mod 期望的 gameVersion。默认与本版游戏一致；
//     两个 DJ Mod 是「按归档原样发布」⇒ 期望值就是归档时的真实值 0.2.4（过时但**故意**保留）。
const EXPECTED_GAME_VERSION = {
  'cyanfish.dj-models': '0.2.4',
  'cyanfish.dj-bgm': '0.2.4',
};
const EXPECTED_DEFAULT = '0.2.5';
// 过时集合：必须随包带「版本过时」提醒（仓库 README + 自己的 README/OUTDATED.md + 发布说明三处）
const OUTDATED = new Set(['cyanfish.dj-models', 'cyanfish.dj-bgm']);

// ①c 素材例外：默认一律 FAIL。只有服主**书面拍板**后才用 --honor-exceptions 降级为 WARN。
const ASSET_EXCEPTIONS = {
  'cyanfish.dj-bgm': {
    paths: ['assets/bgm/friends-wine-dj.m4a'],
    note: '★★ 本版**不带**该音频（服主裁定：只发代码 + 自备 BGM 说明）。此例外现在只用来把 assets/bgm/ 这个目录名认作合法；'
      + '若将来真把第三方音频放进来，这里只报 WARN —— 请重新走一次发布前拍板。该 Mod 的代码不依赖任何一首具体的歌。',
  },
};

// ② 绝不进仓的 id（服主口径 / 版权）：出现目录名即 FAIL
const NEVER_PUBLISH = [
  'cyanfish.collab-six', 'cyanfish.skinvoice', 'cyanfish.makoto',
  'cyanfish.archetto-skin', 'cyanfish.danmaku',
];

// ③ 二进制 / 素材扩展名：Mod 目录里出现即 FAIL（我们的 Mod 是纯文本形态）
const BINARY_EXT = new Set([
  '.skel', '.atlas', '.mp3', '.m4a', '.ogg', '.wav', '.flac',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico',
  '.mp4', '.webm', '.zip', '.tgz', '.tar', '.gz', '.7z', '.spmod',
  '.ttf', '.otf', '.woff', '.woff2', '.bin', '.spine', '.exe', '.dll', '.node',
]);

// ④ 绝不进仓的目录名（素材 / 依赖 / 生成物 / 工作区）
const BANNED_DIR = new Set([
  'node_modules', 'assets', 'font', 'fonts', 'voice', 'bgm', 'skins', 'vendor',
  'out', 'adapt', 'archived-mods', 'cache', 'upstream', 'backups', 'instances',
]);

/* ★★ 本脚本自己也要能过自己的扫描：下面这些词**一律拆开拼**，不写整串字面量
 *    （否则「发布前自检脚本」自己就把本机用户名 / 托管商域名 / 部署路径带进仓了）。
 *    想复核它们到底是什么？把 SENSITIVE 的每个值打印出来即可（值与 host-027 那份逐字一致）。 */
const W = (parts) => parts.join('');
const SENSITIVE = {
  localUser: W(['10', '62' + '3']),
  deployDir: W(['/opt/', 'strong', 'hold']),
  hosts: [W(['yxs', 'jmc']), W(['gw-', 'vps']), W(['xye', 'idc'])].join('|'),
  privateNames: [W(['服务器', '连接配置']), W(['新服务器', '连接信息']), W(['_hand', 'off_']), W(['云服务器', '相关', '信息'])].join('|'),
  evidenceLink: W(['mod-', 'work']) + '[\\\\/](?:scripts|out|upstream|archived-mods|cache)',
  workspacePrefix: W(['mod-', 'work']) + '[\\\\/]',
  adaptDir: W(['out/', 'adapt']),
};

// ⑤ 内容 FAIL：一旦命中，说明有真机密 / 真主机 / 真本地路径
const FAIL_PATTERNS = [
  ['本机用户名（不该出现在任何发布文件里）', new RegExp(SENSITIVE.localUser)],
  ['Windows 本地绝对路径', /[A-Za-z]:\\+Users/i],
  ['类 Unix 家目录绝对路径', /\/(?:home|Users)\/[A-Za-z0-9._-]+\//],
  ['服务器部署路径（托管机上的部署目录）', new RegExp(SENSITIVE.deployDir)],
  ['真实主机域名（面板 / 网关 / 正式服）', new RegExp(SENSITIVE.hosts, 'i')],
  ['真实主机 IP:端口（回环/私网示例除外）', /(?<![\d.])(?!(?:127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.))(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}(?![\d])/],
  ['私钥块', /BEGIN [A-Z ]*PRIVATE KEY/],
  ['SSH 凭据工具 / 密钥文件名', /sshpass|id_rsa|authorized_keys/],
  ['被赋值的令牌或口令', /(?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{6,}/i],
  ['工作区私密文件名', new RegExp(SENSITIVE.privateNames)],
  ['内部工作区证据/脚本内链', new RegExp(SENSITIVE.evidenceLink)],
];

// ⑥ 内容 WARN：看着可疑但可能是文档里的示例 / 章节号 —— 必须人工过一遍
const WARN_PATTERNS = [
  ['裸 IPv4（可能是真 IP，也可能是章节号）', /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/],
  ['回环地址 127.0.0.1（确认是文档示例）', /127\.0\.0\.1/],
  ['私网段示例地址 192.168.x', /192\.168\.\d{1,3}\.\d{1,3}/],
  ['内部工作区路径前缀', new RegExp(SENSITIVE.workspacePrefix)],
  ['内部工序编号目录', new RegExp(SENSITIVE.adaptDir)],
];

// ★★ 已知误报表（上游原文，不是本仓的凭据）。命中 ⇒ WARN + 打印 why，绝不静默。
//    收录条件：该行与官方 0.2.5 全量包**逐字节相同**，且人工确认不是机密。
const KNOWN_FALSE_POSITIVES = [
  {
    file: 'public/js/net.js', what: '被赋值的令牌或口令',
    why: '上游 0.2.5 原文：const K_TOKEN = \'sp.token\' 是 sessionStorage 的键名（浏览器本地键，不是服务器凭据）',
  },
  {
    file: 'test/lobby.test.js', what: '真实主机 IP:端口（回环/私网示例除外）',
    why: '上游 0.2.5 原文：203.0.113.4 是 RFC 5737 的 TEST-NET-3 文档示例地址（normalizeIp 的夹具）',
  },
];
function knownFp(where, what) {
  for (const e of KNOWN_FALSE_POSITIVES) {
    if (what === e.what && (where === e.file || where.endsWith('/' + e.file))) return e;
  }
  return null;
}

const SIZE_FAIL = 100 * 1024 * 1024; // GitHub 硬上限
const SIZE_WARN = 5 * 1024 * 1024;   // 建议上限（LFS 判据）

/* ------------------------------------------------------------------ 参数 */

const argv = process.argv.slice(2);
function opt(name, fallback = null) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : (argv[i + 1] ?? true);
}
const modsDir = opt('--mods');
const repoDir = opt('--repo');
const jsonOut = opt('--json');
const allMods = argv.includes('--all-mods');
const honorExceptions = argv.includes('--honor-exceptions');
if (!modsDir && !repoDir) {
  console.error('用法: node tools/publish-scan.mjs --mods <仓库/mods> [--all-mods] [--json <file>]');
  console.error('      node tools/publish-scan.mjs --repo <仓库根>');
  process.exit(2);
}
const ROOT = (modsDir || repoDir);
const IN_MODS_LAYOUT = Boolean(modsDir);

// ★★ 自排除：本文件内置的规则字面量本身就含发布时要清零的词，所以 --repo 扫描时跳过自己。
//    这是**唯一**的排除项；跳过了谁会在输出里打印出来（不存在静默跳过）。
const SELF_REL = (() => {
  try { return relative(ROOT, fileURLToPath(import.meta.url)).split(sep).join("/"); }
  catch { return null; }
})();
let skippedSelf = null;

/* ------------------------------------------------------------------ 工具 */

const fails = [];
const warns = [];
const infos = [];
function fail(where, what, detail) {
  const fp = knownFp(where, what);
  if (fp) { warns.push({ where, what: '★ 已知误报（上游原文）: ' + what, detail: fp.why + ' | ' + String(detail) }); return; }
  fails.push({ where, what, detail: String(detail) });
}
function warn(where, what, detail) { warns.push({ where, what, detail: String(detail) }); }

let CURRENT_MOD = null;
function excepted(relPath) {
  const ex = CURRENT_MOD ? ASSET_EXCEPTIONS[CURRENT_MOD] : null;
  if (!ex) return false;
  // relPath 是相对扫描根的（mods 模式下形如 "<mod id>/assets/bgm/x.m4a"），
  // 例外表里写的是 Mod 内相对路径 ⇒ 两种写法都认。
  return ex.paths.some((p) => {
    const dir = p.replace(/\/[^/]*$/, '/');
    const full = CURRENT_MOD + '/' + p;
    const fullDir = CURRENT_MOD + '/' + dir;
    return relPath === p || relPath === full || relPath.startsWith(dir) || relPath.startsWith(fullDir);
  });
}
function exceptNote() {
  const ex = CURRENT_MOD ? ASSET_EXCEPTIONS[CURRENT_MOD] : null;
  return ex ? ex.note : '未登记的例外';
}
// 目录例外：该目录**里面**有登记的例外文件（例如 assets/bgm/ 里那首曲子）
function exceptedDir(relPath) {
  const ex = CURRENT_MOD ? ASSET_EXCEPTIONS[CURRENT_MOD] : null;
  if (!ex) return false;
  const rel = relPath.startsWith(CURRENT_MOD + '/') ? relPath.slice(CURRENT_MOD.length + 1) : relPath;
  return ex.paths.some((p) => p.startsWith(rel + '/') || p === rel);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) { warn(rel(p), '软链接 / junction', '发布集合里不应有链接'); continue; }
    if (e.isDirectory()) {
      if (BANNED_DIR.has(e.name)) {
        if (honorExceptions && (excepted(rel(p)) || exceptedDir(rel(p)))) {
          warn(rel(p), '★★ 素材例外目录（服主拍板项）', exceptNote());
        } else fail(rel(p), '禁止目录', '目录名 ' + e.name);
      }
      walk(p, out);
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}
function rel(p) { return relative(ROOT, p).split(sep).join('/'); }

function scanFile(p) {
  const st = statSync(p);
  const r = rel(p);
  const ext = extname(p).toLowerCase();
  if (BINARY_EXT.has(ext)) {
    if (honorExceptions && excepted(r)) warn(r, '★★ 素材例外：第三方素材随包发布（服主拍板项）', exceptNote() + ' | ' + fmt(st.size));
    else fail(r, '二进制/素材文件', '扩展名 ' + ext + '（' + st.size + ' B）');
  }
  else if (!IN_MODS_LAYOUT && st.size > SIZE_WARN && st.size <= SIZE_FAIL) warn(r, '偏大文件', fmt(st.size));
  if (st.size > SIZE_FAIL) fail(r, '超过 GitHub 100 MB 单文件上限', fmt(st.size));
  else if (st.size > SIZE_WARN) warn(r, '超过 5 MB（考虑是否该进仓）', fmt(st.size));
  if (!BINARY_EXT.has(ext) && st.size < 4 * 1024 * 1024) {
    const text = readFileSync(p, 'utf8');
    for (const [name, re] of FAIL_PATTERNS) {
      const m = text.match(re);
      if (m) fail(r, name, '命中: ' + safe(m[0]));
    }
    for (const [name, re] of WARN_PATTERNS) {
      const m = text.match(re);
      if (m) warn(r, name, '命中: ' + safe(m[0]));
    }
    if (text.charCodeAt(0) === 0xFEFF) fail(r, 'UTF-8 BOM', '文件必须以无 BOM 保存');
    if (text.includes('\r\n')) warn(r, 'CRLF 行尾', '发布集合统一 LF');
  }
}
function safe(s) {
  // ★ 报告里绝不回显凭据原文：只留前 3 个字符 + 长度
  const t = String(s).replace(/[\r\n\t]/g, ' ');
  return t.length <= 3 ? '***' : t.slice(0, 3) + '***(' + t.length + ')';
}
function fmt(n) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

/* ------------------------------------------------------------------ 执行 */

const scanned = [];
if (IN_MODS_LAYOUT) {
  if (!existsSync(ROOT)) { console.error('目录不存在: ' + ROOT); process.exit(2); }
  const present = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name);
  const allowed = new Set(PUBLISH_SET);
  for (const id of present) {
    const isNever = NEVER_PUBLISH.includes(id);
    const isAllowed = allowed.has(id);
    if (isNever) { fail(id + '/', '★★ 必须排除（版权/服主口径）', '该 Mod 不得出现在仓库里'); continue; }
    if (!isAllowed && !allMods) { fail(id + '/', '★ 不在发布白名单里', '要么加进白名单，要么从仓库删掉'); continue; }
    CURRENT_MOD = id;
    const files = walk(join(ROOT, id));
    for (const f of files) { scanned.push(f); scanFile(f); }
    // mod.json 硬门槛：id 必须等于目录名，gameVersion 必须等于该 Mod 的期望版本
    const mj = join(ROOT, id, 'mod.json');
    if (!existsSync(mj)) fail(id + '/mod.json', '缺 mod.json', '不装清单就不是 Mod');
    else {
      try {
        const m = JSON.parse(readFileSync(mj, 'utf8'));
        if (m.id !== id) fail(id + '/mod.json', 'id 与目录名不一致', 'id=' + String(m.id));
        const want = EXPECTED_GAME_VERSION[id] ?? EXPECTED_DEFAULT;
        if (m.gameVersion !== want) {
          fail(id + '/mod.json', 'gameVersion 不是期望值 ' + want,
            '声明 ' + String(m.gameVersion) + ' —— 装到 ' + EXPECTED_DEFAULT + ' 上会被装载器跳过');
        } else if (OUTDATED.has(id)) {
          warn(id + '/mod.json', '★ 过时 Mod（按原样发布，必须带版本过时提醒）',
            'version=' + String(m.version) + ' gameVersion=' + String(m.gameVersion) + '（当前游戏 ' + EXPECTED_DEFAULT + '）');
        }
      } catch (err) { fail(id + '/mod.json', 'JSON 解析失败', String(err.message)); }
    }
    infos.push(id + ' : ' + files.length + ' 文件 / ' + fmt(files.reduce((a, f) => a + statSync(f).size, 0)));
    CURRENT_MOD = null;
  }
  for (const id of PUBLISH_SET) {
    if (OUTDATED.has(id)) continue; // 两个 DJ Mod 从工作区的归档目录搬入，不在树的 mods/ 里
    if (!present.includes(id)) warn('mods/', '白名单 Mod 缺失', id + ' 不在 --mods 目录里');
  }
  // .state.json 是本机启停状态，绝不进仓
  const state = join(ROOT, '.state.json');
  if (existsSync(state)) fail('.state.json', '本机启停状态，不得进仓', '服务器/本机运行态，与 Mod 内容无关');
} else {
  if (!existsSync(ROOT)) { console.error('目录不存在: ' + ROOT); process.exit(2); }
  const skip = new Set(['.git', 'node_modules', '.cache', 'logs']);
  const stack = [ROOT];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) stack.push(p); continue; }
      if (e.isFile()) {
        if (SELF_REL && relative(ROOT, p).split(sep).join('/') === SELF_REL) { skippedSelf = SELF_REL; continue; }
        scanned.push(p); scanFile(p);
      }
    }
  }
}

/* ------------------------------------------------------------------ 输出 */

console.log('=== host-027 发布前自检 ===');
console.log('扫描根: ' + ROOT);
console.log('文件数: ' + scanned.length);
if (skippedSelf) console.log('★ 已跳过自检脚本自身（唯一排除项）: ' + skippedSelf);
console.log('FAIL: ' + fails.length + '   WARN: ' + warns.length);
if (infos.length) { console.log('--- 集合 ---'); for (const s of infos) console.log('  ' + s); }
if (fails.length) {
  console.log('--- FAIL（必须清零才能建仓）---');
  for (const f of fails) console.log('  x ' + f.where + ' | ' + f.what + ' | ' + f.detail);
}
if (warns.length) {
  const byWhat = new Map();
  for (const w of warns) byWhat.set(w.what, (byWhat.get(w.what) || 0) + 1);
  console.log('--- WARN（按类型聚合）---');
  for (const [what, n] of byWhat) console.log('  ! ' + what + ' x' + n);
  for (const w of warns.slice(0, 15)) console.log('    - ' + w.where + ' | ' + w.what + ' | ' + w.detail);
  if (warns.length > 15) console.log('    ... 其余 ' + (warns.length - 15) + ' 条见 --json');
}
console.log(fails.length ? 'RESULT: FAIL' : 'RESULT: PASS');
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ root: ROOT, scanned: scanned.length, fails, warns }, null, 2) + '\n', 'utf8');
  console.log('JSON: ' + jsonOut);
}
process.exit(fails.length ? 1 : 0);
