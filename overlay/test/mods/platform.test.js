// test/mods/platform.test.js — the Mod platform's patch engine (server/mods/patch.js) and the merge (server/mods/loader.js):
// the seven ops' strict semantics, the path DSL (`.` segments; a key that really contains a dot is escaped `\.`) and the
// ★ path guardrail added 2026-10-08: a segment containing `/` is a **literal character**, never a separator — that is
// almost always a typo (`a.b/c` instead of `a.b.c`), and it used to fail **silently** (the Mod loads, `ops` counts it,
// `anyErrors` is false, and the feature does nothing: the branch's real case was `diy.slots/<slotId>`, which wrote a key
// literally named `slots/<slotId>`). It now produces a WARNING and changes nothing else — see docs/MODS.md §3.3.
//
// Run: node --test test/mods/platform.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePath, pathWarnings, applyOps, resolvePath, clone } from '../../server/mods/patch.js';
import { resolveMods, validateChessRecord } from '../../server/mods/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUIET = { warn() {}, error() {}, info() {} };
// ★ 宿主版本**从 package.json 读**（2026-10-10 升级 0.2.2 时踩过：这里曾经写死 '0.2.1'，
//   于是 gameVersion 严格相等门禁把所有 Mod 都跳过，resolveMods 的断言全崩）。
const APP_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** A temporary mods repo with one Mod. `files` maps a relative path inside the Mod to its JSON body (or a string). */
function tempMods(files, { id = 'test.mod' } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sp-mods-'));
  const put = (rel, body) => {
    const full = path.join(dir, id, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  };
  put('mod.json', { id, name: 'T', version: '1.0.0', apiVersion: 1, gameVersion: APP_VERSION, author: 'T', summary: 's', description: 'd', loadAfter: [] });
  for (const [rel, body] of Object.entries(files)) put(rel, body);
  return dir;
}

// ---- path DSL ----------------------------------------------------------------------------------------------------------

test('parsePath: `.` segments, `\\.` escapes a dot inside a key, array indices are just segments, and the empty-segment typos throw', () => {
  assert.deepEqual(parsePath('a.b.c'), ['a', 'b', 'c']);
  assert.deepEqual(parsePath('modes.mode_multi_hard.rounds.3.template'), ['modes', 'mode_multi_hard', 'rounds', '3', 'template']);
  assert.deepEqual(parsePath('a.b\\.c.d'), ['a', 'b.c', 'd'], 'a key that really contains a dot');
  assert.deepEqual(parsePath('a\\\\b'), ['a\\b'], 'a key that really contains a backslash');
  assert.deepEqual(parsePath('a/b'), ['a/b'], '★ `/` is NOT a separator: it is one key literally named "a/b"');
  assert.throws(() => parsePath(''), /path 必须是非空字符串/);
  assert.throws(() => parsePath('a..b'), /空段/);
  assert.throws(() => parsePath('.a'), /空段/);
  assert.throws(() => parsePath('a\\'), /以转义符结尾/);
  assert.throws(() => parsePath(null), /path 必须是非空字符串/);
});

test('pathWarnings: a segment containing "/" warns (with the dot-form suggestion); everything legal stays silent', () => {
  const w = pathWarnings('diy.slots/chess_char_3_diy1_a');
  assert.equal(w.length, 1);
  assert.match(w[0], /段 "slots\/chess_char_3_diy1_a" 里含 "\/"/);
  assert.match(w[0], /你是不是想写 "diy\.slots\.chess_char_3_diy1_a"/);
  assert.match(w[0], /只用 "\." 分段/);
  assert.match(pathWarnings('a/b', { label: 'from' })[0], /^from "/, 'the label says which field it was');
  // `a/b/c` 里没有 `.` ⇒ 整串就是**一个**段，所以只点这一个段（段是按 `.` 切出来的，这正是要教的规则）
  assert.match(pathWarnings('a/b/c')[0], /的段 "a\/b\/c" 里含/);
  assert.match(pathWarnings('diy.slots/x')[0], /的段 "slots\/x" 里含/, '有 `.` 时只点含 `/` 的那一段');
  // 合法写法一律不产 warning（既有补丁一条都不多）
  for (const p of ['a.b.c', 'modes.mode_multi_hard.rounds.3.template', 'a.b\\.c', 'a\\\\b', 'latin-id_1.x', 'diy.slots.chess_char_3_diy1_a']) {
    assert.deepEqual(pathWarnings(p), [], p);
  }
  assert.deepEqual(pathWarnings(''), [], 'nothing to parse, nothing to warn about');
  assert.deepEqual(pathWarnings('a..b'), [], 'unparsable: applyOps reports the error, not this');
  assert.deepEqual(pathWarnings(null), []);
});

test('applyOps: a slash path still applies **literally** (semantics unchanged) and adds one warning', () => {
  const root = { diy: { slots: { a: { tier: 5 } } } };
  const res = applyOps(root, [{ op: 'add', path: 'diy.slots/chess_char_3_diy1_a', value: { tier: 3 } }], { where: 'test/data/backups.json' });
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /\[test\/data\/backups\.json\] ops\[0\]: path "diy\.slots\/chess_char_3_diy1_a"/);
  assert.deepEqual(res.applied, [{ op: 'add', path: 'diy.slots/chess_char_3_diy1_a' }], 'applied is unchanged');
  assert.deepEqual(Object.keys(root.diy.slots), ['a'], '★ the real container is untouched');
  assert.deepEqual(root.diy['slots/chess_char_3_diy1_a'], { tier: 3 }, 'the literal key is what got written');
  // 对照：写成点分段就是对的，而且没有 warning
  const root2 = { diy: { slots: { a: { tier: 5 } } } };
  const res2 = applyOps(root2, [{ op: 'add', path: 'diy.slots.chess_char_3_diy1_a', value: { tier: 3 } }]);
  assert.deepEqual(res2.warnings, []);
  assert.deepEqual(Object.keys(root2.diy.slots), ['a', 'chess_char_3_diy1_a']);
  // clone 的 from 也查
  const res3 = applyOps({ a: { x: 1 } }, [{ op: 'clone', from: 'a/b', path: 'c', value: {} }]);
  assert.equal(res3.ok, false, 'from 不存在 ⇒ 仍然是 error');
  assert.equal(res3.warnings.length, 1, '但 from 的写法疑点也照样提示');
  assert.match(res3.warnings[0], /from "a\/b"/);
});

test('applyOps: the seven ops keep their strict semantics (add/clone require absence, the rest require presence)', () => {
  const root = { a: { n: 1, list: [1, 2] }, arr: [1, 2, 3] };
  assert.deepEqual(applyOps(root, [{ op: 'replace', path: 'a.n', value: 5 }]).applied.length, 1);
  assert.equal(root.a.n, 5);
  assert.deepEqual(applyOps(root, [{ op: 'add', path: 'a.n', value: 6 }]).ok, false, 'add 要求不存在');
  assert.deepEqual(applyOps(root, [{ op: 'replace', path: 'a.zz', value: 6 }]).ok, false, 'replace 要求存在');
  assert.deepEqual(applyOps(root, [{ op: 'merge', path: 'a', value: { m: 2 } }]).ok, true);
  assert.deepEqual(root.a, { n: 5, list: [1, 2], m: 2 });
  assert.deepEqual(applyOps(root, [{ op: 'deepMerge', path: 'a', value: { list: [9] } }]).ok, true);
  assert.deepEqual(root.a.list, [9], 'deepMerge 的数组整体替换');
  assert.deepEqual(applyOps(root, [{ op: 'append', path: 'arr', value: 4 }]).ok, true);
  assert.deepEqual(applyOps(root, [{ op: 'append', path: 'arr', value: 4 }]).ok, true);
  assert.deepEqual(root.arr, [1, 2, 3, 4], 'append 幂等');
  assert.deepEqual(applyOps(root, [{ op: 'append', path: 'a', value: 4 }]).ok, false, 'append 要求数组');
  assert.deepEqual(applyOps(root, [{ op: 'remove', path: 'arr.0' }]).ok, true);
  assert.deepEqual(root.arr, [2, 3, 4]);
  assert.deepEqual(applyOps(root, [{ op: 'remove', path: 'a.zz' }]).ok, false, 'remove 要求存在');
  assert.deepEqual(applyOps(root, [{ op: 'nope', path: 'a' }]).ok, false);
  // 原子性：第 2 条失败 ⇒ 第 1 条虽然成功了也在 applied 里，但**第 3 条不再执行**
  const atomic = applyOps(root, [
    { op: 'add', path: 'fresh', value: 1 },
    { op: 'replace', path: 'nope', value: 1 },
    { op: 'add', path: 'never', value: 1 },
  ]);
  assert.equal(atomic.ok, false);
  assert.deepEqual(atomic.applied.map((a) => a.path), ['fresh']);
  assert.equal(Object.hasOwn(root, 'never'), false, '★ 失败即停：后面的 op 一条都不跑');
  assert.deepEqual(applyOps(root, [{ op: 'add', path: 'a' }]), { ok: false, errors: ['ops[0]: op=add 必须带 value'], warnings: [], applied: [] });
  assert.deepEqual(applyOps(root, 'x').errors, ['ops 必须是数组']);
  assert.deepEqual(resolvePath(root, ['a', 'n']).value, 5);
  assert.equal(resolvePath(root, ['a', 'zz']).ok, false);
  assert.deepEqual(clone({ a: [1] }), { a: [1] });
});

// ---- the merge (resolveMods) -------------------------------------------------------------------------------------------

/** The repo's real data, as baseData (what server/data.js hands the loader). */
function baseData() {
  const out = {};
  for (const f of readdirSync(path.join(ROOT, 'data'))) {
    if (f.toLowerCase().endsWith('.json')) out[f.slice(0, -5)] = JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
  }
  return out;
}

test('resolveMods: a Mod using the slash typo loads with no error, and the platform now says so (row.warnings)', () => {
  const dir = tempMods({ 'data/backups.json': { ops: [{ op: 'add', path: 'diy.slots/chess_char_3_diy1_a', value: { tier: 3, goldenId: 'x', shopLevel: 3, requirement: 'TIER_6' } }] } });
  try {
    const res = resolveMods(baseData(), dir, { log: QUIET, appVersion: APP_VERSION });
    const row = res.report.mods.find((m) => m.id === 'test.mod');
    assert.deepEqual(row.errors, [], '★ 不判错（引擎允许任意键名）');
    assert.equal(row.skipped, undefined);
    assert.equal(row.ops, 1);
    assert.equal(res.report.patched.includes('backups'), true);
    const mine = row.warnings.filter((w) => w.includes('里含'));
    assert.equal(mine.length, 1, '★ 但一定提示');
    assert.match(mine[0], /里含 "\/" —— 本 DSL 只用 "\." 分段/);
    assert.match(mine[0], /你是不是想写 "diy\.slots\.chess_char_3_diy1_a"/);
    assert.match(mine[0], /^\[test\.mod\/data\/backups\.json\] ops\[0\]: /, '定位到「哪个 Mod 的哪个补丁文件的第几条 op」');
    assert.equal(res.report.ok, true, 'warning 不影响 ok');
    // ★ 平台报告里的 report.warnings 是**全局**问题（sortMods / 清单级），per-Mod 的提示在 row.warnings
    assert.deepEqual(res.report.errors, []);
    assert.deepEqual(res.report.warnings, []);
    // 功能确实没生效（这正是要提示的原因）
    assert.deepEqual(Object.keys(res.data.backups.diy.slots).sort(), ['chess_char_5_diy1_a', 'chess_char_5_diy2_a', 'chess_char_6_diy1_a', 'chess_char_6_diy2_a']);
    assert.deepEqual(res.data.backups.diy['slots/chess_char_3_diy1_a'], { tier: 3, goldenId: 'x', shopLevel: 3, requirement: 'TIER_6' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolveMods: the shipped cyanfish.diy-34 uses `.` segments ⇒ 0 errors, 5 ops, and diy.slots really grows to 5 (v1.1.0: the tier-4 slot is gone, the tier-3 one declares voidedByTiers)', () => {
  const res = resolveMods(baseData(), path.join(ROOT, 'mods'), { log: QUIET, appVersion: APP_VERSION });
  const row = res.report.mods.find((m) => m.id === 'cyanfish.diy-34');
  assert.ok(row, 'the Mod is in the repo');
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.warnings.filter((w) => w.includes('里含')), [], '★ 一条 path 疑点都没有（写法正确）');
  assert.deepEqual(row.warnings, [
    'chess_char_3_diy1_a: visible=false → 不会出现在商店',
    'chess_char_3_diy1_b: visible=false → 不会出现在商店',
  ], '★ 只剩 2 条「不进商店」提示 —— 与官方自选位同款（这只是提示，不是错误）');
  assert.equal(row.ops, 5, '2 条 chess + 3 条 backups（v1.1.0 取消了 4 阶位）');
  assert.deepEqual(row.files, [{ target: 'backups', ops: 3 }, { target: 'chess', ops: 2 }], '按目标文件分开记账');
  assert.deepEqual(Object.keys(res.data.backups.diy.slots), [
    'chess_char_5_diy1_a', 'chess_char_5_diy2_a', 'chess_char_6_diy1_a', 'chess_char_6_diy2_a',
    'chess_char_3_diy1_a',
  ], '5 格：III 1 + V 2 + VI 2');
  // ★ v1.1.0：4 阶位整位取消（diy.slots 无键、chess 无记录、没有 prototypes/locked["4"]）
  assert.equal(Object.hasOwn(res.data.backups.diy.slots, 'chess_char_4_diy1_a'), false, '★ 4 阶位不在 diy.slots 里');
  assert.equal(Object.hasOwn(res.data.chess, 'chess_char_4_diy1_a'), false, '★ 4 阶位的两条记录也没了');
  assert.equal(res.data.backups.diy.prototypes['4'], undefined, '★ 没有 prototypes["4"]');
  assert.equal(res.data.backups.diy.locked['4'], undefined, '★ 没有 locked["4"]');
  // ★ 3 阶位有自己的 prototypes / locked 表（Mod 加的静态副本），与 5 阶逐元素 / 逐字段相同
  const official = baseData();
  assert.deepEqual(res.data.backups.diy.prototypes['3'], official.backups.diy.prototypes['5']);
  assert.deepEqual(res.data.backups.diy.locked['3'], official.backups.diy.locked['5']);
  assert.deepEqual(Object.keys(res.data.backups.diy.prototypes).sort(), ['3', '5', '6']);
  assert.equal(res.report.ok, true, '全部 Mod（含本 Mod）都过');
  // 2 条新记录在合并后的 chess 里，且逐字段是定的
  for (const [id, tier, identifier, sortId] of [
    ['chess_char_3_diy1_a', 3, 266, 22], ['chess_char_3_diy1_b', 3, 267, 22],
  ]) {
    const c = res.data.chess[id];
    assert.deepEqual([c.chessId, c.tier, c.identifier, c.shopSortId, c.price, c.sellPrice], [id, tier, identifier, sortId, 3, 1], id);
    assert.equal(c.isDiy, true);
    assert.equal(c.diyRequirement, 'TIER_6');
    assert.deepEqual(validateChessRecord(id, c, res.data).errors, [], `${id}: 记录校验通过`);
  }
  assert.deepEqual(res.data.chess.chess_char_3_diy1_a.status, { phase: 2, level: 1, skillLevel: 4, equipLevel: 0 });
  assert.deepEqual(res.data.chess.chess_char_3_diy1_b.status, { phase: 2, level: 60, skillLevel: 7, equipLevel: 1 });
  // ★ v1.1.0：3 阶位声明 voidedByTiers —— 5/6 阶任意一格有自选 ⇒ 本格作废（shared/diy.js diyVoidedSlots）
  // ★ v1.3.1（工序 113）：同一槽位还带 voidedNote（小圈的文案 + 皮肤，基座 §4.9 的可选第三层）
  assert.deepEqual(res.data.backups.diy.slots.chess_char_3_diy1_a, {
    tier: 3,
    goldenId: 'chess_char_3_diy1_b',
    shopLevel: 3,
    requirement: 'TIER_6',
    voidedByTiers: [5, 6],
    voidedNote: {
      enabled: true,
      text: '以失去所有高阶自选为束缚\n换取一个III阶自选位',
      style: {
        border: '1px solid rgba(255,0,36,.6)',
        'border-radius': '2px',
        background: 'linear-gradient(180deg, rgba(231,49,24,.32), rgba(20,4,4,.85))',
        'box-shadow': 'inset 0 0 0 1px rgba(255,0,36,.22), 0 0 8px rgba(231,49,24,.3)',
        color: '#ffb9ae',
      },
    },
  });
});

test('resolveMods: without a slash the same patch is silent AND effective (the positive control)', () => {
  const dir = tempMods({ 'data/backups.json': { ops: [{ op: 'add', path: 'diy.slots.zz_probe_a', value: { tier: 3, goldenId: 'zz_probe_b', shopLevel: 3, requirement: 'TIER_6' } }] } });
  try {
    const res = resolveMods(baseData(), dir, { log: QUIET, appVersion: APP_VERSION });
    const row = res.report.mods.find((m) => m.id === 'test.mod');
    assert.deepEqual([row.errors, row.warnings], [[], []]);
    assert.ok(Object.hasOwn(res.data.backups.diy.slots, 'zz_probe_a'), '★ 真的写进了 diy.slots');
    assert.equal(Object.hasOwn(res.data.backups.diy, 'slots/zz_probe_a'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- ★ 工序 88：同值幂等（add/clone）与「跨 Mod 同路径同值不算冲突」 ---------------------------------------
// 背景：`cyanfish.collab-six` 与 `cyanfish.makoto` 都 `add` 同一条 `data/assets.json` 的记录（7 条路径、值逐字节相同）。
// 旧语义下后加载那条的 `add` 直接失败 ⇒ 平台按原子性把它**整份数据补丁**回滚（skipped=true, ops=0）。
// 现在：值逐字节相同 ⇒ `add` 幂等通过；跨 Mod 同路径同值 ⇒ 只出一条聚合 warning。值不同仍然必须拆键。

test('applyOps: add/clone 的**同值**幂等豁免（逐字节相同才放过；值不同/键序不同一律照旧报错）', () => {
  const root = { a: { n: 1 }, arr: [1] };
  const ok = applyOps(root, [{ op: 'add', path: 'a.n', value: 1 }]);
  assert.equal(ok.ok, true, '★ 目标已存在但值逐字节相同 ⇒ add 幂等通过');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.applied, [{ op: 'add', path: 'a.n' }], '记入 applied（= 一次同值重写）');
  assert.equal(root.a.n, 1);
  // 深相等不够：判据是**逐字节**（键序不同 ⇒ 照旧报错，逼作者把字面量对齐）
  const root2 = { a: { x: { p: 1, q: 2 } } };
  assert.equal(applyOps(root2, [{ op: 'add', path: 'a.x', value: { q: 2, p: 1 } }]).ok, false, '键序不同 ⇒ 仍然报错');
  // clone 用**算出来的结果**比：一样 ⇒ 幂等；不一样 ⇒ 报错
  assert.equal(applyOps({ src: { v: 1 }, same: { v: 1 } }, [{ op: 'clone', from: 'src', path: 'same', value: {} }]).ok, true, '★ clone 结果相同 ⇒ 幂等');
  const c2 = applyOps({ src: { v: 1 }, other: { v: 2 } }, [{ op: 'clone', from: 'src', path: 'other', value: {} }]);
  assert.equal(c2.ok, false, 'clone 结果不同 ⇒ 仍然报错');
  assert.match(c2.errors[0], /clone 要求目标不存在/);
  // 既有严格语义一点没松
  assert.equal(applyOps({ a: { n: 1 } }, [{ op: 'add', path: 'a.n', value: 2 }]).ok, false, '不同值 ⇒ 仍然报错');
});

test('resolveMods: 两条 Mod add 同一条记录（值逐字节相同）⇒ 两条都生效、都不回滚，后写者出一条聚合 warning', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sp-mods-shared-'));
  const put = (id, files) => {
    const mp = path.join(dir, id, 'mod.json');
    mkdirSync(path.dirname(mp), { recursive: true });
    writeFileSync(mp, JSON.stringify({ id, name: 'T', version: '1.0.0', apiVersion: 1, gameVersion: APP_VERSION, author: 'T', summary: 's', description: 'd', loadAfter: [] }, null, 2));
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(dir, id, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, JSON.stringify(body, null, 2));
    }
  };
  const rec = { avatar: '/assets/char/avatar/zz_shared.png' };
  try {
    put('test.a', { 'data/assets.json': { ops: [{ op: 'add', path: 'chars.zz_shared', value: rec }] } });
    put('test.b', {
      'data/assets.json': {
        ops: [
          { op: 'add', path: 'chars.zz_shared', value: rec },
          { op: 'add', path: 'skills.zz_shared_1', value: '/assets/skill/zz_shared_1.png' },
        ],
      },
    });
    const res = resolveMods(baseData(), dir, { log: QUIET, appVersion: APP_VERSION });
    const a = res.report.mods.find((m) => m.id === 'test.a');
    const b = res.report.mods.find((m) => m.id === 'test.b');
    assert.deepEqual([a.errors, b.errors], [[], []], '★ 同路径同值不算冲突：两条都没有 error');
    assert.equal(a.skipped, undefined);
    assert.equal(b.skipped, undefined, '★ 后写者不再被整份回滚');
    assert.equal(res.report.ok, true);
    assert.deepEqual(res.data.assets.chars.zz_shared, rec, '这条记录真的在合并结果里');
    assert.deepEqual(res.data.assets.skills.zz_shared_1, '/assets/skill/zz_shared_1.png', '后写者**其余**的 op 也照样生效');
    assert.deepEqual(b.files, [{ target: 'assets', ops: 2 }], '两条 op 都记了账（含那条幂等的）');
    assert.match(b.warnings.find((w) => w.includes('重复写入')) || '', /与 "test\.a" 重复写入 1 条相同路径（值逐字节相同/);
    assert.deepEqual(a.warnings, [], '先写者一条提示都不该有');
    // 反向：改写成**不同的值** ⇒ 照旧冲突 + 整份回滚（既有语义不变）
    writeFileSync(path.join(dir, 'test.b', 'data/assets.json'),
      JSON.stringify({ ops: [{ op: 'replace', path: 'chars.zz_shared', value: { avatar: '/assets/char/avatar/zz_other.png' } }] }, null, 2));
    const res2 = resolveMods(baseData(), dir, { log: QUIET, appVersion: APP_VERSION });
    const b2 = res2.report.mods.find((m) => m.id === 'test.b');
    assert.equal(b2.skipped, true, '★ 值不同 ⇒ 仍然整份回滚');
    assert.match(b2.errors[0], /与其它 Mod 冲突: chars\.zz_shared 已被 "test\.a" 改过/);
    assert.equal(res2.report.ok, false);
    assert.deepEqual(res2.data.assets.chars.zz_shared, rec, '回滚后留下的是先写者那条');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
