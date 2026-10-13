#!/usr/bin/env node
// ============================================================================
// mods/cyanfish.skinvoice/tools/fetch-assets.mjs
//
// 皮肤与语音 Mod · **素材自取脚本**（战斗小人 spine + 时装专属语音）。
//
// ★ 为什么需要它：本仓**不含任何官方素材**（版权归鹰角 / Yostar，不可再分发，上游铁律
//   「No game art in git」）。本 Mod 的代码 + 数据 + 本脚本进仓；约 296 MB 官方素材由玩家
//   在**自己的机器 / 服务器**上用本脚本自取，落到本 Mod 的 assets/ 下（不进 git）。
//
// ★ 战斗小人**为什么必须落盘**（不能像立绘那样浏览器直连）：
//   宿主 public/js/assets.js 的 validSpine 要求 `skel` 是 `/` 开头的**同源路径**，且
//   `/mods/` 是只读静态目录 ⇒ Mod 无法注册动态 HTTP 路由代理 ⇒ 文件必须真的落在服务器磁盘。
//   而 validSpine 还要求 `anims`（从 .skel 解析出的角色映射）⇒「下载完」≠「能用」，
//   必须再用**宿主自己的**工具链解析并写回数据表（本脚本第 ③ 步）。
//
// ★ 幂等 / 可重跑：已存在且体检通过的文件跳过；只处理「还没装好」的条目；装完再跑不会重下。
//
// ★ 缺素材不崩：没跑过本脚本时战斗小人保持官方默认，只换立绘 / 头像与语音
//   （客户端 skins.js 有运行时可得性探测，只认明确 404）。
//
// ---------------------------------------------------------------------------
// 用法：node mods/cyanfish.skinvoice/tools/fetch-assets.mjs [选项]
//   （完整选项见 --help）
// ============================================================================

import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = resolve(HERE, '..');
const DEFAULT_GAME = resolve(MOD, '..', '..');

const MB = (n) => (n / 1048576).toFixed(2) + ' MB';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFile = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

/* ------------------------------------------------------------------ 参数 --- */

const USAGE = [
  '用法：node mods/cyanfish.skinvoice/tools/fetch-assets.mjs [选项]',
  '',
  '  无参数              全量自取（战斗小人 + 时装专属语音）',
  '  --only spine|voice  只处理其中一类',
  '  --plan              联网探一遍选源与体积，不写盘',
  '  --dry               只报告要处理哪些条目（不联网不写盘）',
  '  --verify            自检已装情况（不联网不写盘）',
  '  --target-only       只打印会写入哪里，立即退出',
  '  --force             全表重建（默认只处理还没装好的条目）',
  '  --limit N           只处理前 N 条（冒烟测试用）',
  '  --game <dir>        游戏根目录（默认 = 本 Mod 的 ../../）',
  '  --assets <dir>      素材落点（默认 = 本 Mod 的 assets/）',
  '  --table <file>      数据表（默认 = 本 Mod 的 client/skinvoice.json）',
  '  --source <ids>      只用这些来源（逗号分隔，顺序即优先级）',
  '  --mirror <base>     自建镜像根（与本 Mod assets/ 同构）',
  '  --zip <file>        自备素材包 zip（离线 / 兜底）',
  '  --conc N            并发（默认 8）',
  '  --json <file>       --plan / --verify 的结果另存 JSON',
  '  -h, --help          显示帮助',
  '',
  '来源链（默认，前一个失败自动落到下一个）：',
  '  战斗小人：PRTS → PRTS单面 → fexli → jsDelivr → 自建镜像 → 自备 zip',
  '  语音：    官方 dump → jsDelivr → 自建镜像 → 自备 zip',
].join('\n');

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) { console.log(USAGE); process.exit(0); }

const opt = (name, dflt = null) => {
  const i = argv.indexOf(name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const has = (name) => argv.includes(name);
const strOpt = (name) => { const v = opt(name); return v && v !== true ? String(v) : null; };

const GAME = resolve(strOpt('--game') || DEFAULT_GAME);
const ASSETS = resolve(strOpt('--assets') || join(MOD, 'assets'));
const TABLE = resolve(strOpt('--table') || join(MOD, 'client/skinvoice.json'));
const VOICE_TABLE = join(MOD, 'client/voice-extras.json');
const MIRROR = strOpt('--mirror') ? strOpt('--mirror').replace(/\/+$/, '') : null;
const ZIP = strOpt('--zip') ? resolve(strOpt('--zip')) : null;
const JSON_OUT = strOpt('--json') ? resolve(strOpt('--json')) : null;
const CONC = (() => { const n = Number(opt('--conc', 8)); return Number.isFinite(n) && n > 0 ? Math.min(16, Math.floor(n)) : 8; })();
const LIMIT = (() => { const n = Number(opt('--limit', 0)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; })();
const onlyRaw = opt('--only', 'all');
const ONLY = ['spine', 'voice', 'all'].includes(onlyRaw) ? onlyRaw : 'all';
const WANT_SRC = strOpt('--source') ? strOpt('--source').split(',').map((s) => s.trim()).filter(Boolean) : null;

const PLAN = has('--plan');
const DRY = has('--dry');
const VERIFY = has('--verify');
const FORCE = has('--force');
const TARGET_ONLY = has('--target-only');

if (TARGET_ONLY) {
  console.log('[target] 会写入：');
  console.log('[target]   游戏根   ：' + GAME);
  console.log('[target]   素材落点 ：' + ASSETS);
  console.log('[target]   数据表   ：' + TABLE);
  console.log('[target] --target-only 只报目标，不下不写。');
  process.exit(0);
}

/* -------------------------------------------------------------- 来源定义 --- */

const SPINE_SOURCES = [
  { id: 'prts', label: 'PRTS torappu /assets/char_spine · front|back', sides: 'both',
    url: (c, p, s, e) => 'https://torappu.prts.wiki/assets/char_spine/' + c + '/' + p + '/' + s + '/' + p + '.' + e },
  { id: 'prts-spine', label: 'PRTS torappu · spine（单面）', sides: 'front',
    url: (c, p, s, e) => 'https://torappu.prts.wiki/assets/char_spine/' + c + '/' + p + '/spine/' + p + '.' + e },
  { id: 'fexli', label: 'fexli/ArknightsResource', sides: 'both',
    url: (c, p, s, e) => 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine/' + c + '/' + p + '/' + (s === 'front' ? 'Front' : 'Back') + '/' + p + '.' + e },
  { id: 'jsdelivr', label: 'jsDelivr · fexli 镜像', sides: 'both',
    url: (c, p, s, e) => 'https://cdn.jsdelivr.net/gh/fexli/ArknightsResource@main/spine/' + c + '/' + p + '/' + (s === 'front' ? 'Front' : 'Back') + '/' + p + '.' + e },
];
if (MIRROR) SPINE_SOURCES.push({ id: 'mirror', label: '自建镜像', sides: 'both',
  url: (c, p, s, e) => MIRROR + '/spine/op/' + p + '/' + s + '/' + p + '.' + e });

const AA2 = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2';
const voiceDirOf = (lang) => (lang === 'CN' ? 'voice_cn' : 'voice');
const encHash = (s) => String(s).replace(/#/g, '%23');
const VOICE_SOURCES = [
  { id: 'raw', label: '官方 dump · ArknightsAssets2', url: (lang, wk, f) => AA2 + '/' + voiceDirOf(lang) + '/' + encHash(wk) + '/' + f },
  { id: 'jsdelivr', label: 'jsDelivr · ArknightsAssets2@voice', url: (lang, wk, f) => 'https://cdn.jsdelivr.net/gh/ArknightsAssets/ArknightsAssets2@voice/voice/assets/dyn/audio/sound_beta_2/' + voiceDirOf(lang) + '/' + encHash(wk) + '/' + f },
];
if (MIRROR) VOICE_SOURCES.push({ id: 'mirror', label: '自建镜像', url: (lang, wk, f) => MIRROR + '/voice-skin/' + String(wk).replace(/#/g, '_') + '/' + lang + '/' + f });

const KNOWN_SRC = new Set([...SPINE_SOURCES.map((s) => s.id), ...VOICE_SOURCES.map((s) => s.id), 'zip']);
/** 按 --source 过滤/排序；未知 id 报错；本类别下都没有则返回空（交给 zip）。 */
function orderSources(list, wanted) {
  if (!wanted) return list;
  for (const id of wanted) if (!KNOWN_SRC.has(id)) { console.error('未知来源 id：' + id + '（可用：' + [...KNOWN_SRC].join(', ') + '）'); process.exit(2); }
  return wanted.map((id) => list.find((x) => x.id === id)).filter(Boolean);
}

/* -------------------------------------------------------------- zip 读取 --- */

/** 极简 ZIP 读取（stored / deflate），返回 (rel) => Buffer|null。只读，不落盘。 */
async function makeZipLookup(zipPath) {
  const buf = await readFile(zipPath);
  const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50;
  let e = -1;
  const lo = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= lo; i--) if (buf.readUInt32LE(i) === EOCD) { e = i; break; }
  if (e < 0) throw new Error('不是合法的 zip（找不到 EOCD）：' + zipPath);
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const entries = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== CEN) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8').replace(/\\/g, '/');
    entries.set(name, { method, csize, lho });
    p += 46 + nlen + elen + clen;
  }
  const norm = (s) => String(s).replace(/\\/g, '/').replace(/^\.\//, '');
  return (rel) => {
    const want = norm(rel);
    for (const [name, meta] of entries) {
      if (name === want || name.endsWith('/' + want)) {
        if (buf.readUInt32LE(meta.lho) !== LOC) return null;
        const nlen = buf.readUInt16LE(meta.lho + 26);
        const elen = buf.readUInt16LE(meta.lho + 28);
        const start = meta.lho + 30 + nlen + elen;
        const raw = buf.subarray(start, start + meta.csize);
        try { return meta.method === 0 ? Buffer.from(raw) : inflateRawSync(raw); } catch { return null; }
      }
    }
    return null;
  };
}

/* ---------------------------------------------------------- 内容体检 --- */

const STUB = /^\s*<(!doctype|html|script)/i;
const MIN_BYTES = { skel: 1024, atlas: 32, png: 256, mp3: 512 };
function looksReal(ext, buf) {
  if (!buf || buf.length < (MIN_BYTES[ext] || 1)) return false;
  if (STUB.test(buf.subarray(0, 64).toString('latin1'))) return false;
  if (ext === 'png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (ext === 'mp3') return buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
  if (ext === 'atlas') return !/[\u0000-\u0008\u000e-\u001f]/.test(buf.subarray(0, 256).toString('latin1'));
  return true;
}

/* ------------------------------------------------------------ 取文件 --- */

/** 取一个文件（重试 + 体检）。range=true 时只取前 1 KB（探测用），返回 {ok:true,len}。 */
async function httpGet(url, ext, range = false) {
  for (let a = 0; a < 4; a++) {
    try {
      const o = { signal: AbortSignal.timeout(120_000) };
      if (range) o.headers = { Range: 'bytes=0-1023' };
      const r = await fetch(url, o);
      if (r.status === 404) return null;
      if (range && r.status === 206) {
        const b = Buffer.from(await r.arrayBuffer());
        const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
        const len = m ? Number(m[1]) : 0;
        const ok = len >= (MIN_BYTES[ext] || 1) && !STUB.test(b.subarray(0, 64).toString('latin1'));
        return ok ? { ok: true, len } : null;
      }
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        if (!looksReal(ext, b)) throw new Error('内容体检不过（' + b.length + ' B）');
        return { ok: true, buf: b, len: b.length };
      }
    } catch { /* 退避重试 */ }
    await sleep(500 * (a + 1));
  }
  return null;
}

/* ------------------------------------------------------------ 工作清单 --- */

const spineTable = JSON.parse(await readFile(TABLE, 'utf8'));
const pidOf = (localSkel) => { const m = /^\/assets\/spine\/op\/([^/]+)\/front\/[^/]+\.skel$/.exec(String(localSkel || '')); return m ? m[1] : null; };

const EXTS = ['skel', 'atlas', 'png'];
const spineWork = [];
for (const [op, o] of Object.entries(spineTable.operators || {})) {
  for (const s of o.skins || []) {
    if (!s.battle) continue;
    const pid = pidOf(s.battle.skel);
    if (!pid) continue;
    spineWork.push({ op, skin: s.id, pid, rec: s });
  }
}
const spineDone = (rec) => rec.battle && rec.battle.hasSpine === true && rec.battle.anims && typeof rec.battle.anims === 'object';

let voiceTable = null;
try { voiceTable = JSON.parse(await readFile(VOICE_TABLE, 'utf8')); } catch { /* 可选 */ }
const voiceAll = [];
if (voiceTable && voiceTable.skins) {
  for (const [wordKey, rec] of Object.entries(voiceTable.skins)) {
    for (const lang of ['CN', 'JP']) {
      const slots = rec[lang];
      if (!slots) continue;
      for (const arr of Object.values(slots)) for (const local of arr) {
        const rel = String(local).replace(/^\/assets\//, '');
        voiceAll.push({ wordKey, lang, file: rel.split('/').pop(), rel });
      }
    }
  }
}
const voiceDedup = [...new Map(voiceAll.map((v) => [v.rel, v])).values()];

let spineList = spineWork.filter((w) => FORCE || !spineDone(w.rec));
let voiceList = [...voiceDedup];
if (LIMIT) { spineList = spineList.slice(0, LIMIT); voiceList = voiceList.slice(0, LIMIT); }

/* ------------------------------------------------------------ --verify --- */
if (VERIFY) {
  const out = { spine: {}, voice: {} };
  if (ONLY !== 'voice') {
    let have = 0, want = 0; const missing = [];
    for (const w of spineWork) for (const side of ['front', 'back']) for (const ext of EXTS) {
      want++;
      if (await isFile(join(ASSETS, 'spine/op', w.pid, side, w.pid + '.' + ext))) have++;
      else missing.push(w.pid + '/' + side + '.' + ext);
    }
    const parsed = spineWork.filter((w) => spineDone(w.rec)).length;
    out.spine = { filesHave: have, filesWant: want, parsed, total: spineWork.length, missing: missing.slice(0, 8) };
    console.log('战斗小人：文件 ' + have + '/' + want + '（背面天生缺失属正常）· 数据表已解析 ' + parsed + '/' + spineWork.length);
    if (missing.length) console.log('  缺 ' + missing.length + ' 个（前 8）：' + missing.slice(0, 8).join(' '));
  }
  if (ONLY !== 'spine') {
    let have = 0; const missing = [];
    for (const v of voiceDedup) { if (await isFile(join(ASSETS, v.rel))) have++; else missing.push(v.rel); }
    out.voice = { filesHave: have, filesWant: voiceDedup.length, missing: missing.slice(0, 8) };
    console.log('时装专属语音：文件 ' + have + '/' + voiceDedup.length);
    if (missing.length) console.log('  缺 ' + missing.length + ' 个（前 8）：' + missing.slice(0, 8).join(' '));
  }
  if (JSON_OUT) { await mkdir(dirname(JSON_OUT), { recursive: true }); await writeFile(JSON_OUT, JSON.stringify(out, null, 1) + '\n'); }
  process.exit(0);
}

/* --------------------------------------------------------------- --dry --- */
if (DRY) {
  const note = ONLY === 'voice' ? '（--only voice 跳过战斗小人）' : (ONLY === 'spine' ? '（--only spine 跳过语音）' : '');
  console.log('要处理：战斗小人 ' + spineList.length + ' / ' + spineWork.length + ' 套' + (ONLY === 'voice' ? '（已跳过）' : '')
    + '；语音 ' + voiceList.length + ' 个文件' + (ONLY === 'spine' ? '（已跳过）' : '') + ' ' + note);
  console.log('落点：' + ASSETS);
  console.log('数据表：' + TABLE);
  console.log('--dry：不联网、不写盘。');
  process.exit(0);
}

/* ---------------------------------------------------------- 下载引擎 --- */

let zipLookup = null;
if (ZIP) { zipLookup = await makeZipLookup(ZIP); console.log('已载入自备 zip：' + ZIP); }

const SPINE_SRC = orderSources(SPINE_SOURCES, WANT_SRC);
const VOICE_SRC = orderSources(VOICE_SOURCES, WANT_SRC);
console.log('来源链 · 战斗小人：' + (SPINE_SRC.map((s) => s.id).join(' > ') || '(无)') + (ZIP ? ' > zip' : ''));
console.log('来源链 · 语音    ：' + (VOICE_SRC.map((s) => s.id).join(' > ') || '(无)') + (ZIP ? ' > zip' : ''));

const spineLocal = (pid, side, ext) => join(ASSETS, 'spine/op', pid, side, pid + '.' + ext);

/** 探一遍某源能否服务这套；返回 { srcId, jobs }（两阶段：先探后下，禁止跨源混用）。 */
async function pickSpineSource(w) {
  for (const src of SPINE_SRC) {
    const useSides = src.sides === 'both' ? ['front', 'back'] : ['front'];
    const jobs = [];
    let frontSkelOk = false;
    for (const side of useSides) for (const ext of EXTS) {
      const local = spineLocal(w.pid, side, ext);
      if (await isFile(local)) { if (side === 'front' && ext === 'skel') frontSkelOk = true; continue; }
      const h = await httpGet(src.url(w.op, w.pid, side, ext), ext, true);
      if (h) { jobs.push({ side, ext, url: src.url(w.op, w.pid, side, ext) }); if (side === 'front' && ext === 'skel') frontSkelOk = true; }
    }
    if (frontSkelOk) return { srcId: src.id, jobs };
  }
  return { srcId: null, jobs: [] };
}

async function fetchSpineOne(w) {
  const allPresent = (await Promise.all(['front', 'back'].flatMap((s) => EXTS.map((e) => isFile(spineLocal(w.pid, s, e)))))).every(Boolean);
  if (allPresent || ((await isFile(spineLocal(w.pid, 'front', 'skel'))) && spineDone(w.rec) && !FORCE)) return { srcId: null, skipped: true };
  const pick = await pickSpineSource(w);
  if (pick.srcId) {
    if (!PLAN) for (const j of pick.jobs) {
      const g = await httpGet(j.url, j.ext);
      if (g && g.buf) { const local = spineLocal(w.pid, j.side, j.ext); await mkdir(dirname(local), { recursive: true }); await writeFile(local, g.buf); }
    }
    return { srcId: pick.srcId };
  }
  if (zipLookup) {
    let okFront = false;
    for (const side of ['front', 'back']) for (const ext of EXTS) {
      const rel = 'spine/op/' + w.pid + '/' + side + '/' + w.pid + '.' + ext;
      const local = join(ASSETS, rel);
      if (await isFile(local)) { if (side === 'front' && ext === 'skel') okFront = true; continue; }
      const buf = zipLookup(rel);
      if (buf && looksReal(ext, buf)) { await mkdir(dirname(local), { recursive: true }); await writeFile(local, buf); if (side === 'front' && ext === 'skel') okFront = true; }
    }
    if (okFront) return { srcId: 'zip' };
  }
  return { srcId: null, failed: [w.pid] };
}

async function headOk(url, ext) { return !!(await httpGet(url, ext, true)); }

async function fetchVoiceOne(v) {
  const local = join(ASSETS, v.rel);
  if (await isFile(local)) return { srcId: 'have', skipped: true };
  for (const src of VOICE_SRC) {
    const url = src.url(v.lang, v.wordKey, v.file);
    if (PLAN) { if (await headOk(url, 'mp3')) return { srcId: src.id, skipped: true }; continue; }
    const g = await httpGet(url, 'mp3');
    if (g && g.buf) { await mkdir(dirname(local), { recursive: true }); await writeFile(local, g.buf); return { srcId: src.id }; }
  }
  if (zipLookup) { const buf = zipLookup(v.rel); if (buf && looksReal('mp3', buf)) { await mkdir(dirname(local), { recursive: true }); await writeFile(local, buf); return { srcId: 'zip' }; } }
  return { srcId: null, failed: [v.rel] };
}

async function runPool(list, fn) {
  let i = 0, done = 0;
  const results = new Array(list.length);
  async function worker() {
    while (true) {
      const k = i++;
      if (k >= list.length) return;
      results[k] = await fn(list[k]);
      if (++done % 20 === 0) process.stdout.write('  ' + done + '/' + list.length + '\n');
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, list.length || 1) }, worker));
  return results;
}

let exitFail = 0;
const t0 = Date.now();

if (ONLY !== 'voice' && spineList.length) {
  console.log('\n战斗小人：处理 ' + spineList.length + ' 套…');
  const res = await runPool(spineList, fetchSpineOne);
  const bySrc = {};
  for (const r of res) if (r.srcId) bySrc[r.srcId] = (bySrc[r.srcId] || 0) + 1;
  const bad = res.filter((r) => r.failed && r.failed.length).length;
  console.log('  完成：选到源 ' + res.filter((r) => r.srcId).length + ' 套（' + Object.entries(bySrc).map(([k, n]) => k + '=' + n).join(' ') + '）· 跳过 ' + res.filter((r) => r.skipped).length + ' · 拿不到 ' + bad);
  exitFail += bad;
}

if (ONLY !== 'spine' && voiceList.length) {
  console.log('\n时装专属语音：处理 ' + voiceList.length + ' 个文件…');
  const res = await runPool(voiceList, fetchVoiceOne);
  console.log('  完成：新下 ' + res.filter((r) => r.srcId && r.srcId !== 'have').length + ' · 已存在 ' + res.filter((r) => r.skipped).length + ' · 拿不到 ' + res.filter((r) => r.srcId === null).length);
  exitFail += res.filter((r) => r.srcId === null).length;
}

/* ------------------------------------------------- 解析 spine + 写回表 --- */
if (!PLAN && ONLY !== 'voice') {
  const tools = await loadSpineTools();
  if (!tools) {
    console.log('\n⚠ 找不到游戏工具链（' + join(GAME, 'tools/assets') + '）⇒ 已下文件但未解析。');
    console.log('  请在游戏根目录运行，或用 --game <游戏根> 指定；未解析时战斗小人保持官方默认（优雅降级）。');
  } else {
    let nOk = 0, nFail = 0;
    for (const w of spineWork) {
      if (!FORCE && spineDone(w.rec)) continue;
      const front = await parseSide(tools, join(ASSETS, 'spine/op', w.pid, 'front'), w.pid, w.op);
      if (!front) { w.rec.battle.hasSpine = false; delete w.rec.battle.source; nFail++; continue; }
      Object.assign(w.rec.battle, {
        hasSpine: true, source: 'fetch-assets',
        anims: front.anims, animations: front.animations, events: front.events, hits: front.hits, bounds: front.bounds,
      });
      const back = await parseSide(tools, join(ASSETS, 'spine/op', w.pid, 'back'), w.pid, w.op);
      if (back) Object.assign(w.rec.battle, { backAnims: back.anims, backAnimations: back.animations, backEvents: back.events, backHits: back.hits, backBounds: back.bounds });
      else for (const k of ['backSkel', 'backAtlas', 'backTextures', 'backAnims', 'backAnimations', 'backEvents', 'backHits', 'backBounds']) delete w.rec.battle[k];
      nOk++;
    }
    spineTable.source.spine = 'PRTS(torappu.prts.wiki/assets/char_spine) 优先 + fexli/ArknightsResource(jsDelivr 镜像) 兜底（已落地到本 Mod assets/，battle.hasSpine/anims 由 tools/fetch-assets.mjs 写入）';
    await writeFile(TABLE, JSON.stringify(spineTable, null, 1) + '\n');
    console.log('\n解析：可用 ' + nOk + ' 套 · 失败 ' + nFail + ' 套 · 数据表已更新：' + TABLE);
    exitFail += nFail;
  }
  const nDirs = (await readdir(join(ASSETS, 'spine/op')).catch(() => [])).length;
  console.log('落地目录：' + join(ASSETS, 'spine/op') + '（' + nDirs + ' 个模型）');
}

if (PLAN) console.log('\n--plan：只探测，未写盘。');

console.log('\nEND · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's · 失败 ' + exitFail);
process.exit(exitFail ? 1 : 0);

/* ------------------------------------------------- 解析工具（宿主自带） --- */

/** 从游戏树加载 spine 解析工具 + 研究数据；缺任一返回 null（fail-soft）。 */
async function loadSpineTools() {
  try {
    const T = (f) => pathToFileURL(join(GAME, 'tools/assets', f)).href;
    const { parseSkel, skelParserAvailable } = await import(T('skel.mjs'));
    if (!skelParserAvailable()) return null;
    const { atlasInfo, normalizeAtlas } = await import(T('atlas.mjs'));
    const { resolveRoles } = await import(T('anim-roles.mjs'));
    const { pngSize } = await import(T('formats.mjs'));
    const { safeName } = await import(T('sources.mjs'));
    const { skillIndicesByChar } = await import(T('plan.mjs'));
    const ops03 = JSON.parse(await readFile(join(GAME, 'docs/research/03-operators.json'), 'utf8'));
    const assets07 = JSON.parse(await readFile(join(GAME, 'docs/research/07-assets.json'), 'utf8'));
    const SKILL_IDX = skillIndicesByChar(ops03);
    const skillIndicesFor = (opId) => {
      const idx0 = SKILL_IDX.get(opId) || [0];
      const o = assets07 && assets07.operators && assets07.operators[opId];
      const extra = ((o && o.skills) || []).map((k) => k.index).filter((i) => Number.isInteger(i) && i >= 0 && !idx0.includes(i)).sort((a, b) => a - b);
      return [...idx0, ...extra];
    };
    return { parseSkel, atlasInfo, normalizeAtlas, resolveRoles, pngSize, safeName, skillIndicesFor };
  } catch { return null; }
}

/** 解析一个朝向（与宿主 plan.mjs / anim-roles.mjs 逐值同源的口径）。 */
async function parseSide(tools, dir, pid, op) {
  const { parseSkel, atlasInfo, normalizeAtlas, resolveRoles, pngSize, safeName, skillIndicesFor } = tools;
  const skelPath = join(dir, pid + '.skel');
  const atlasPath = join(dir, pid + '.atlas');
  if (!(await isFile(skelPath)) || !(await isFile(atlasPath))) return null;
  const text0 = await readFile(atlasPath, 'utf8');
  const info0 = atlasInfo(text0);
  if (!info0.pages.length) return null;
  const sizes = new Map();
  for (const page of info0.pages) {
    const buf = await readFile(join(dir, safeName(page))).catch(() => null);
    const sz = buf ? pngSize(buf) : null;
    if (!sz) return null;
    sizes.set(page, sz);
  }
  const norm = normalizeAtlas(text0, { pageSize: (p) => sizes.get(p) || null, pma: false, renamePage: safeName });
  if (norm.missingSize.length) return null;
  if (norm.changed) await writeFile(atlasPath, norm.text);
  const info = atlasInfo(norm.changed ? norm.text : text0);
  let sk;
  try { sk = parseSkel(await readFile(skelPath), info.regions); } catch { return null; }
  if (!sk || !sk.animations || !sk.animations.length) return null;
  const anims = resolveRoles(sk.animations, { skillIndices: skillIndicesFor(op), durations: sk.durations });
  return { anims, animations: sk.durations, events: sk.events, hits: sk.hits, bounds: sk.bounds };
}
