// test/content/mechanics-seam-mods.test.js — 两条**规则接缝**的 Mod 侧（数据补丁）能不能真的打开它们。
//
// 这一组用例走的是**平台真实补丁路径**：把 Mod 的 `data/<target>.json` 交给 `server/mods/patch.js applyOps`
// 打到一份刚从 `data/*.json` 读出来的数据上（与 `server/mods/loader.js` 合并 Mod 时同一套 op 语义、
// 同一个冲突/原子性规则），然后把这份数据喂给 sim（`support.setGameData`）与 `server/match`（`GameData.raw`）。
//
//   · `cyanfish.fix-mechanism`  → `data/backups.json` 的 `add mechanics`（两个机制开关）
//   · `cyanfish.fix-operator`   → ★ **工序 54 起没有 data/ 补丁了**：它原来的
//     `data/garrisons.json`（`merge garrison_108_a/b.bb.doll_swap_deploy`）已随 `fartooth-dollswap` 停用而删除
//     —— 上游 0.2.3 已在同一个安装器函数里内建同一条（GitHub #415 / PR #429），我们的接缝与数据补丁都已撤除。
//     本文件保留一条「官方数据没有旗标 + 本 Mod 没有 data/」的护栏用例。
//
// 验收口径（docs/MODS.md §4.10）：
//   装 Mod ⇒ 接缝武装、行为按服主口径变；不装 / 把补丁撤掉 ⇒ 接缝缺省、行为逐值等于上游。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, checkInvariants, enemyRec } from '../helpers/battleHarness.js';
import { applyOps } from '../../server/mods/patch.js';
import { unitBonds, bondLayers, setGameData, gameData } from '../../server/sim/content/support/index.js';
import { readMechanics, MECHANICS_DEFAULTS } from '../../server/sim/mechanics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ISO = 'chess_item_6_09_e_a';
const GRENADE = 'chess_item_3_11_e_a';
const BLEMISHINE = 'chess_char_3_12_a';
const GHOST2 = 'chess_char_5_13_a';
const FARTOOTH = 'chess_char_4_20_a';
const GRAVEL = 'chess_char_2_12_a';
const MLYNAR = 'chess_char_5_19_a';
const SNOWHUNT = 'chess_char_3_11_a';
const LISKARM = 'chess_char_1_20_a';

/** data/*.json 的一份未冻结副本（与 server/data.js 合并 Mod 之前的那一份同形）。 */
function freshData() {
  const out = {};
  const dir = path.join(ROOT, 'data');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    out[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return out;
}

/** 应用某个 Mod 的 data/ 补丁（真实 op 语义），返回新的数据对象。没有 `data/` 目录的 Mod 视作零补丁。 */
function applyMod(data, modId) {
  const dir = path.join(ROOT, 'mods', modId, 'data');
  if (!fs.existsSync(dir)) return data;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const target = f.replace(/\.json$/, '');
    const patch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(Array.isArray(patch.ops), `${modId}/data/${f}: 顶层必须是 { "ops": [ … ] }`);
    const res = applyOps(data[target], patch.ops, { where: `${modId}/data/${f}` });
    assert.equal(res.ok, true, `${modId}/data/${f}: ${res.errors.join('; ')}`);
  }
  return data;
}

const manifestOf = (modId) => JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', modId, 'mod.json'), 'utf8'));

// ---------------------------------------------------------------------------------------------------------------------

test('两个 Mod 的清单合门禁：id = 目录名、apiVersion 1、gameVersion 与宿主严格相等', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const id of ['cyanfish.fix-mechanism', 'cyanfish.fix-operator']) {
    const m = manifestOf(id);
    assert.equal(m.id, id, `${id}: id 必须等于目录名`);
    assert.equal(m.apiVersion, 1, `${id}: apiVersion`);
    assert.equal(m.gameVersion, app.version, `${id}: gameVersion 严格相等`);
    assert.match(m.version, /^\d+\.\d+\.\d+/, `${id}: semver`);
    assert.ok(typeof m.summary === 'string' && m.summary.length > 0, `${id}: 管理页只显示 summary`);
  }
});

test('cyanfish.fix-mechanism 的 data/backups.json 打开两个开关（缺省时是上游）', () => {
  const plain = freshData();
  assert.deepEqual(readMechanics(plain), MECHANICS_DEFAULTS, '官方数据里没有 mechanics 一节');
  const patched = applyMod(freshData(), 'cyanfish.fix-mechanism');
  assert.deepEqual(readMechanics(patched), { bondCopyLayers: true, indomRaidSp: true });
  // 只加了 `mechanics` 这一节，别的顶层键一个不多一个不少
  assert.deepEqual(Object.keys(patched.backups).sort(), [...Object.keys(plain.backups), 'mechanics'].sort());
  assert.deepEqual(patched.backups.units, plain.backups.units);
  assert.deepEqual(patched.backups.tokens, plain.backups.tokens);
  assert.deepEqual(patched.backups.diy, plain.backups.diy);
});

test('cyanfish.fix-operator 已不再带 data/ 补丁（接缝撤除；远牙换体由上游 0.2.3 内建）', () => {
  const plain = freshData();
  assert.equal(plain.garrisons.garrison_108_a.bb.doll_swap_deploy, undefined, '官方数据没有这枚旗标');
  assert.equal(plain.garrisons.garrison_108_b.bb.doll_swap_deploy, undefined);
  // ★ 工序 54：`fartooth-dollswap` 停用（上游 0.2.3 已内建同一条，GitHub #415 / PR #429）⇒ data/ 补丁整体删除。
  const dir = path.join(ROOT, 'mods', 'cyanfish.fix-operator', 'data');
  assert.equal(fs.existsSync(dir), false, '本 Mod 现在没有 data/ 目录（L2 轴已撤销）');
  const patched = applyMod(freshData(), 'cyanfish.fix-operator');
  assert.deepEqual(patched.garrisons, plain.garrisons, '没有数据补丁 ⇒ 官方数据逐值不变');
  // 台账护栏：FIXES 里那一项必须是停用状态（`enabled: false` 且写明上游哪个版本已修）
  const src = fs.readFileSync(path.join(ROOT, 'mods', 'cyanfish.fix-operator', 'content', 'index.js'), 'utf8');
  assert.match(src, /id: 'fartooth-dollswap',[\s\S]{0,2400}?enabled: false/, 'FIXES 的 fartooth-dollswap 必须 enabled: false');
  assert.match(src, /upstreamFixedIn: '0\.2\.3（GitHub #415 \/ PR #429）/, 'FIXES 必须写明上游 0.2.3 已修（#415 / PR #429）');
});

test('两个 Mod 一起装：双转职（瑕光 8/16/24/24）仍生效；换体叠层来自上游 0.2.3 内建（我们的接缝已撤除）', () => {
  const both = applyMod(applyMod(freshData(), 'cyanfish.fix-mechanism'), 'cyanfish.fix-operator');
  const base = gameData();
  setGameData(both);
  try {
    // ① 双转职：瑕光 + 变形同构体 + 突袭手雷
    const h = makeBattle({
      units: [{ chessId: BLEMISHINE, row: 10, col: 4, items: [ISO, GRENADE] }],
      bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 0 }, kazimierzShip: { count: 3, active: true, tier: 1, layers: 0 } },
      autoFinish: false, timeLimit: 120,
    });
    h.step(1);
    const u = h.unit(BLEMISHINE);
    assert.deepEqual([...unitBonds(u)].sort(), ['kazimierzShip', 'raidShip', 'raidShip'], '清单保留两份');
    const snap = () => [bondLayers(h.b, 'p1', 'raidShip'), bondLayers(h.b, 'p1', 'kazimierzShip')];
    const steps = [snap()];
    for (let i = 1; i < 4; i++) { h.b.retreat(u, { reason: 'retreat' }); h.b.redeploy(u, { free: true }); h.step(1); steps.push(snap()); }
    assert.deepEqual(steps, [[8, 4], [16, 8], [24, 12], [24, 12]], '突袭 8/16/24/24');
    checkInvariants(h.b);

    // ② 换体 × 远牙：★ 工序 54 撤掉了我们的 `bb.doll_swap_deploy` 接缝、工序 56 把基座换成 0.2.3
    //    ⇒ 这里的 +4/+4 是**上游 0.2.3 内建**的行为（#415 / PR #429，回归用例 `test/content/fartooth-doll-swap.test.js`），
    //    与我们的接缝无关（旗标写与不写逐值相同，见 `audit-indom-deploy-triggers.test.js`）。
    const d = makeBattle({
      units: [
        { chessId: FARTOOTH, row: 10, col: 3 }, { chessId: GRAVEL, row: 10, col: 5 }, { chessId: GHOST2, row: 10, col: 8 },
        { chessId: MLYNAR, row: 11, col: 4 }, { chessId: SNOWHUNT, row: 11, col: 6 }, { chessId: LISKARM, row: 12, col: 4 },
      ],
      bonds: {
        kazimierzShip: { count: 3, active: true, tier: 1, layers: 20 }, preciShip: { count: 2, active: true, tier: 1, layers: 20 },
        indomShip: { count: 3, active: true, tier: 2, layers: 300 },
      },
      defs: { enemies: { e_dummy: enemyRec({ key: 'e_dummy', hp: 1e9, atk: 0, speed: 0 }) } },
      routes: [{ motion: 'WALK', start: [9, 10], end: [9, 10], checkpoints: [] }],
      enemies: [{ key: 'e_dummy', time: 0, route: 0 }],
      autoFinish: false, timeLimit: 60,
    });
    d.step();
    const ghost = d.unit(GHOST2);
    const dep0 = d.hooksOf('deploy').length;
    const before = [bondLayers(d.b, 'p1', 'kazimierzShip'), bondLayers(d.b, 'p1', 'preciShip')];
    assert.deepEqual(before, [25, 24], '初次部署 +4/+4（卡西米尔另有砾的 +1）');
    d.b.dealDamage(null, ghost, { amount: 1e9, type: 'true' });
    d.step();
    assert.deepEqual([bondLayers(d.b, 'p1', 'kazimierzShip'), bondLayers(d.b, 'p1', 'preciShip')], [29, 28], '★ 换体 +4/+4（上游 0.2.3 内建，不是我们的接缝）');
    assert.equal(d.hooksOf('deploy').length, dep0, '换体不是通用部署');
    checkInvariants(d.b);
  } finally {
    setGameData(base);
  }
});
