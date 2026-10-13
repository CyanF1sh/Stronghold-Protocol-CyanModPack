// test/match/debug-seam.test.js — 工序 115：`config.debug` 的三条新接缝（`setEnemyAttr` / `setLayers` / `setWaveList`）
// 与它们背后的按属性敌人倍率（`defMul` / `resMul` / `aspdMul`）。
//
// 六组断言：① 不装 Mod（`config.debug` 缺省）逐值等于官方；② 纯数据归一化帮手（协议层 / 意图层的夹取与拒绝）；
// ③ `enemyScale` / `roundMods` / spawn mods 的贯通；④ 真开一局（test/match/harness.js）走 `m.handle` 的端到端；
// ⑤ 双重闸门（非单人 / 未启用 / 动作不在白名单）一律被拒；⑥ ★ 1.4.1：**本 Mod 数据里的每个 `debug.max*`
// 都不许超过 `DEBUG_LIMITS` 的天花板**（否则 `readDebug` 会把它静默夹掉 —— 这正是 1.4.0 把 30 写成 20 的那个坑）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeMatch, DATA } from './harness.js';
import { DEBUG_WAVE_MAX } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { GameData } from '../../server/match/gamedata.js';
import { roundMods } from '../../server/match/waves.js';
import {
  DEBUG_ATTRS, DEBUG_ATTR_PERMILLE, DEBUG_DEFAULTS, DEBUG_LIMITS, debugAttrEntry, debugWaveList, readDebug,
} from '../../server/match/debug.js';

const ERR_WRONG = 'WRONG_PHASE';
const ERR_TARGET = 'BAD_TARGET';
const ERR_HAND_FULL = 'HAND_FULL';

/** 面板真正会发的动作白名单（与 `mods/cyanfish.debug-console/data/config.json` 同表）。 */
const ACTIONS = [
  'setRound', 'setFunds', 'setLp', 'addLayers', 'setLayers', 'grantChess', 'grantItem', 'equipItem',
  'setWave', 'setWaveList', 'setEnemyScale', 'setEnemyAttr', 'rebuildWave', 'applyChoice', 'clearChoice',
];

/** 合并后的数据 + 一段 `config.debug`（与 Mod 的 data/config.json 同形）。 */
const dataWith = (debug) => ({
  ...DATA,
  config: { ...DATA.config, debug: { enabled: true, actions: ACTIONS, maxRound: 15, maxFunds: 999, maxLp: 99, maxLayers: 999, maxCount: 30, ...debug } },
});

/** 一局单人 / 全 AI 对局，停在 PREP R1（harness 的 drive 会把草案与准备自动走完）。 */
const soloPrep = (debug = {}, opts = {}) => {
  const h = makeMatch({ mode: 'solo', fake: true, seed: 5, data: dataWith(debug), ...opts });
  h.start();
  h.toPrep(1);
  return h;
};

const debug = (m, msg) => m.handle('p_0', { t: 'g.debug', ...msg });

// ---- ① 不装 Mod = 官方 ------------------------------------------------------------------------------------------

test('readDebug: 缺省 / 非法 / enabled 不是字面 true ⇒ 一律逐值等于冻结的 DEBUG_DEFAULTS', () => {
  for (const cfg of [undefined, null, {}, { debug: null }, { debug: {} }, { debug: { enabled: false } },
    { debug: { enabled: 'true' } }, { debug: { enabled: 1 } }, { debug: 3 }]) {
    assert.deepEqual(readDebug(cfg), DEBUG_DEFAULTS, JSON.stringify(cfg));
  }
  assert.equal(DEBUG_DEFAULTS.enabled, false);
  assert.equal(DEBUG_DEFAULTS.actions, null);
});

test('★★ 本 Mod 数据里的每个 config.debug.max* 都不超过 DEBUG_LIMITS 的对应天花板，而且逐值生效（不被静默夹掉）', () => {
  // 1.4.0 的坑：数据把 maxCount 写成 30，而 DEBUG_LIMITS.maxCount 当时是 20 ⇒ readDebug 用
  // `Math.min(数据, 天花板)` 把它**静默夹**成 20：面板（读原始合并 JSON）显示 30、服务端按 20 算。
  const cfg = JSON.parse(readFileSync(new URL('../../mods/cyanfish.debug-console/data/config.json', import.meta.url), 'utf8'));
  const dbg = cfg.ops.find((o) => o && o.path === 'debug')?.value;
  assert.ok(dbg && typeof dbg === 'object', '本 Mod 的数据里有 config.debug 段');
  const keys = ['maxRound', 'maxFunds', 'maxLp', 'maxLayers', 'maxCount'];
  for (const k of keys) {
    assert.ok(Number.isInteger(dbg[k]) && dbg[k] >= 1, `数据 ${k} 必须是 ≥1 的整数（实际 ${String(dbg[k])}）`);
    assert.ok(dbg[k] <= DEBUG_LIMITS[k], `★ 数据 ${k}=${dbg[k]} 超过天花板 DEBUG_LIMITS.${k}=${DEBUG_LIMITS[k]}：会被 readDebug 静默夹掉`);
  }
  // 逐值生效：归一化之后与数据里写的一模一样（这就是"天花板够高"的判据）
  const eff = readDebug({ debug: dbg });
  for (const k of keys) assert.equal(eff[k], dbg[k], `${k} 必须逐值生效（数据 ${dbg[k]} → 实际 ${eff[k]}）`);
  assert.equal(eff.maxCount, 30, '敌人 / 发牌的单次数量上限：数据写的就是服务端用的');
  // 天花板仍然管用（数据写坏时回落到天花板，不是放行）
  assert.equal(readDebug({ debug: { enabled: true, maxCount: 1e9 } }).maxCount, DEBUG_LIMITS.maxCount);
  assert.equal(readDebug({ debug: { enabled: true, maxCount: 0 } }).maxCount, null);
});

test('GameData: 没有 config.debug ⇒ 9 个模式 × 15 回合的 enemyScale(r) 与 baseEnemyScale(r) 逐值相同', () => {
  const modeIds = Object.keys(DATA.config.modes);
  assert.equal(modeIds.length, 9);
  let n = 0;
  for (const modeId of modeIds) {
    const gd = new GameData(DATA, modeId);
    assert.equal(gd.debug.enabled, false, modeId);
    assert.equal(gd.debugScaleMul, null, modeId);
    assert.equal(gd.debugAttrMul, null, modeId);
    for (let r = 1; r <= 15; r++) {
      assert.deepEqual(gd.enemyScale(r), gd.baseEnemyScale(r), `${modeId} R${r}`);
      assert.equal(gd.enemyScale(r).defMul, undefined, `${modeId} R${r}: 官方回合表没有 defMul 这一档`);
      assert.equal(gd.enemyScale(r).aspdMul, undefined, `${modeId} R${r}: 官方回合表没有 aspdMul 这一档`);
      n++;
    }
  }
  assert.equal(n, 135, '9 个模式 × 15 回合');
});

test('roundMods: 缺省一个键都不多；有覆盖时 def / res / aspd 原样带过去', () => {
  const base = { hpMul: 1.2, atkMul: 1.1, speedMul: 1 };
  assert.deepEqual(roundMods(base), { hpMul: 1.2, atkMul: 1.1, speedMul: 1 });
  assert.deepEqual(Object.keys(roundMods({ ...base, defMul: 2 })), ['hpMul', 'atkMul', 'speedMul', 'defMul']);
});

// ---- ② 纯数据帮手：不夹取越界值，非法一律 null -------------------------------------------------------------------

test('debugAttrEntry: 属性名与千分比的映射；0 = 还原（mul null）；越界 / 未知一律 null（不夹取）', () => {
  assert.deepEqual(debugAttrEntry('atk', 2000), { key: DEBUG_ATTRS.atk, mul: 2 });
  assert.deepEqual(debugAttrEntry('aspd', 500), { key: DEBUG_ATTRS.aspd, mul: 0.5 });
  assert.deepEqual(debugAttrEntry('hp', 0), { key: DEBUG_ATTRS.hp, mul: null });
  for (const bad of [['nope', 2000], ['def', -1], ['def', 1], ['def', 1e7], ['def', 1.5], [null, 1000], ['def', null]]) {
    assert.equal(debugAttrEntry(bad[0], bad[1]), null, JSON.stringify(bad));
  }
  assert.equal(DEBUG_ATTR_PERMILLE.min, 10);
});

test('debugWaveList: 按 key 合并、0 条丢掉、单条夹到 maxCount、坏条目只丢自己、条数有上限', () => {
  assert.deepEqual(debugWaveList(['e_a:3', 'e_b:2', 'e_a:4', 'e_c:0', 'nope', 'e_d:-2'], 30),
    [{ enemyKey: 'e_a', count: 7 }, { enemyKey: 'e_b', count: 2 }]);
  assert.deepEqual(debugWaveList(['e_a:99'], 30), [{ enemyKey: 'e_a', count: 30 }]);
  assert.deepEqual(debugWaveList(['e_a:1', 'e_a:1'], 30), [{ enemyKey: 'e_a', count: 2 }]);
  assert.deepEqual(debugWaveList([], 30), []);
  assert.deepEqual(debugWaveList(null, 30), []);
  const many = Array.from({ length: DEBUG_WAVE_MAX + 4 }, (_, i) => `e_${i}:1`);
  assert.equal(debugWaveList(many, 30).length, DEBUG_WAVE_MAX);
});

test('协议层 g.debug.list：结构合法才过（其余动作不带 list ⇒ 与工序 115 之前逐字节相同）', () => {
  assert.equal(validateC2S({ t: 'g.debug', action: 'setWaveList', list: ['enemy_1001_bigbo:2'] }), null);
  assert.equal(validateC2S({ t: 'g.debug', action: 'setRound', value: 3 }), null);
  for (const bad of [['nope'], ['enemy_x:-1'], ['enemy_x'], [''], ['enemy x:1'], [1]]) {
    assert.equal(validateC2S({ t: 'g.debug', action: 'setWaveList', list: bad }), 'bad field list', JSON.stringify(bad));
  }
  assert.equal(validateC2S({ t: 'g.debug', action: 'setWaveList', list: Array.from({ length: DEBUG_WAVE_MAX + 1 }, () => 'e:1') }), 'bad field list');
  assert.equal(validateC2S({ t: 'g.debug', action: 'setWaveList', list: 'e:1' }), 'bad field list');
});

// ---- ③ 贯通：enemyScale → roundMods → spawn mods → m.public.debugScale ------------------------------------------

test('debugAttrMul: 绝对倍率替换该属性；三个官方表里没有的键按需出现；enemyScaleView 六个属性一个不缺', () => {
  const gd = new GameData(DATA, 'mode_single_normal');
  gd.debug = readDebug(dataWith({}).config);
  const b = gd.baseEnemyScale(3);
  gd.debugAttrMul = Object.freeze({ hpMul: 5, defMul: 2, aspdMul: 0.5 });
  const s = gd.enemyScale(3);
  assert.equal(s.hpMul, 5, '★ 绝对（不是 base × 5）');
  assert.equal(s.defMul, 2);
  assert.equal(s.aspdMul, 0.5);
  assert.deepEqual([s.atkMul, s.speedMul], [b.atkMul, b.speedMul], '没设过的属性照旧是官方值');
  assert.equal(s.resMul, undefined);
  assert.deepEqual(gd.enemyScaleView(3), {
    hpMul: 5, atkMul: b.atkMul, speedMul: b.speedMul, defMul: 2, resMul: 1, aspdMul: 0.5,
    base: { hpMul: b.hpMul, atkMul: b.atkMul, speedMul: b.speedMul },
  });
  // 六项都还原（null）⇒ 又走"直接 return base"的上游路径
  gd.debugAttrMul = null;
  assert.deepEqual(gd.enemyScale(3), gd.baseEnemyScale(3));
});

// ---- ④ 端到端：真开一局 -----------------------------------------------------------------------------------------

test('setWaveList：同波多种敌人 + 逐条数量 ⇒ wave.spawns 与战斗 spec 都是它；空清单 = 这一波没有敌人', () => {
  const h = soloPrep();
  const m = h.m;
  const keys = Object.keys(DATA.enemies).filter((k) => !DATA.enemies[k].tokenOnly).slice(0, 2);
  assert.deepEqual(debug(m, { action: 'setWaveList', list: [`${keys[0]}:3`, `${keys[1]}:2`] }), { ok: true });
  assert.deepEqual(m.wave.spawns.map((s) => [s.enemyKey, s.count]), [[keys[0], 3], [keys[1], 2]]);
  assert.deepEqual(m.wave.actions, [], '旧动作表随旧 spawns 一起作废（withBounties 的 retime 找不到宿主）');
  // 两端读到的是同一份：`_normalOpts` 就是战斗 spec 的组装点
  const opts = m._normalOpts(h.ps('p_0'));
  assert.deepEqual(opts.spawns.map((s) => [s.enemyKey, s.count]), [[keys[0], 3], [keys[1], 2]]);
  assert.ok(opts.spawns.every((s) => s.mods && Number.isFinite(s.mods.speedMul)), '倍率仍是官方 roundMods');
  h.invariants();
  // 空清单：这一波没有敌人（合法的调试局面）
  assert.deepEqual(debug(m, { action: 'setWaveList', list: [] }), { ok: true });
  assert.deepEqual(m.wave.spawns, []);
  assert.deepEqual(m._normalOpts(h.ps('p_0')).spawns, []);
  // 写坏的 key 明确拒（不做部分应用）
  assert.equal(debug(m, { action: 'setWaveList', list: ['no_such_enemy:1'] }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setWaveList', list: [`${keys[0]}:1`, 'no_such_enemy:1'] }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setWaveList' }).error, 'BAD_MSG', '没有 list');
  // 还原官方波次
  assert.deepEqual(debug(m, { action: 'rebuildWave' }), { ok: true });
  assert.ok(m.wave.spawns.length > 0, '官方波次回来了');
  h.invariants();
});

test('setEnemyAttr：千分比进 debugAttrMul ⇒ 本波每条 spawn 的 mods 都吃到；0 = 还原；越界/未知拒', () => {
  const h = soloPrep();
  const m = h.m;
  assert.deepEqual(debug(m, { action: 'setEnemyAttr', id: 'def', value: 2000 }), { ok: true });
  assert.deepEqual(m.gd.debugAttrMul, { defMul: 2 });
  assert.ok(m.wave.spawns.length > 0);
  assert.ok(m.wave.spawns.every((s) => s.mods.defMul === 2), '本波所有敌人都生效（不只某一种）');
  assert.equal(m.gd.enemyScaleView(m.round).defMul, 2);
  // 面板读的就是 m.public.debugScale（只在 config.debug.enabled 时出现）—— m.public 是节流后 flush 出来的
  h.flushAll();
  assert.equal(h.lastBc('m.public').debugScale.defMul, 2);
  assert.deepEqual(debug(m, { action: 'setEnemyAttr', id: 'aspd', value: 500 }), { ok: true });
  assert.deepEqual(m.gd.debugAttrMul, { defMul: 2, aspdMul: 0.5 });
  assert.ok(m.wave.spawns.every((s) => s.mods.aspdMul === 0.5));
  // 还原 def
  assert.deepEqual(debug(m, { action: 'setEnemyAttr', id: 'def', value: 0 }), { ok: true });
  assert.deepEqual(m.gd.debugAttrMul, { aspdMul: 0.5 });
  assert.ok(m.wave.spawns.every((s) => s.mods.defMul === undefined && s.mods.aspdMul === 0.5));
  // 全部还原 ⇒ 整格 null ⇒ enemyScale 又走上游路径
  assert.deepEqual(debug(m, { action: 'setEnemyAttr', id: 'aspd', value: 0 }), { ok: true });
  assert.equal(m.gd.debugAttrMul, null);
  assert.deepEqual(m.gd.enemyScale(m.round), m.gd.baseEnemyScale(m.round));
  // 越界 / 未知属性：明确拒（不夹取）
  assert.equal(debug(m, { action: 'setEnemyAttr', id: 'nope', value: 2000 }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setEnemyAttr', id: 'def', value: 1 }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setEnemyAttr', id: 'def', value: 1e7 }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setEnemyAttr', id: 'def' }).error, 'BAD_MSG');
  assert.equal(m.gd.debugAttrMul, null, '被拒的请求一个数字都没改');
  h.invariants();
});

test('setLayers：绝对设置（含归零 / 满层），走 ps.setLayers 的同一组副作用（recompute + onLayers）', () => {
  const h = soloPrep();
  const m = h.m;
  const ps = h.ps('p_0');
  const bondId = Object.keys(DATA.bonds)[0];
  assert.deepEqual(debug(m, { action: 'setLayers', id: bondId, value: 40 }), { ok: true });
  assert.equal(ps.layers[bondId], 40);
  assert.deepEqual(debug(m, { action: 'setLayers', id: bondId, value: 0 }), { ok: true });
  assert.equal(ps.layers[bondId] ?? 0, 0, '★ 归零（官方 addLayers 到不了 0）');
  h.invariants();
  assert.deepEqual(debug(m, { action: 'setLayers', id: bondId, value: 999 }), { ok: true });
  assert.equal(ps.layers[bondId], 999, '满层');
  h.invariants();
  // 越界 / 未知盟约 / 缺 value
  assert.equal(debug(m, { action: 'setLayers', id: bondId, value: 1000 }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setLayers', id: 'no_such_bond', value: 1 }).error, ERR_TARGET);
  assert.equal(debug(m, { action: 'setLayers', id: bondId }).error, 'BAD_MSG');
  assert.equal(ps.layers[bondId], 999, '被拒的请求一个数字都没改');
  // 与官方的 addLayers 并存：加层照旧
  assert.deepEqual(debug(m, { action: 'addLayers', id: bondId, value: 1 }), { error: ERR_TARGET, detail: `debug: ${bondId} is at the layer cap` });
  assert.deepEqual(debug(m, { action: 'setLayers', id: bondId, value: 1 }), { ok: true });
  assert.deepEqual(debug(m, { action: 'addLayers', id: bondId, value: 2 }), { ok: true });
  assert.equal(ps.layers[bondId], 3);
  h.invariants();
});

test('grantItem：控制台发装备**照旧占用共享库存**（0.2.5 口径）；只有固定赠品能超发', () => {
  const h = soloPrep();
  const m = h.m;
  const ps = h.ps('p_0');
  const id = Object.values(DATA.items).filter((it) => it && it.itemType === 'EQUIP' && !it.isGolden && it.tier === 1).map((it) => it.id).sort()[0];
  assert.equal(m.itemPool.left(id), m.itemPool.cap(id), '一开局库存是满的');
  const cap = m.itemPool.cap(id);
  // ★★ 0.2.5 口径（`docs/history/0.2.5.md` §30.1）：**每一件**产出的装备都照旧占 1 / 2 份，
  //   例外只在**能不能产出** —— 只有 5 个 `SERVER_GAIN_EQUIP` 固定赠品家族（+ 变形者集群发的同一件）能超发。
  //   控制台（`source: 'debug'`）**不是**固定赠品 ⇒ 照旧吃商店份额、也会被库存挡住。
  //   ★ 这一条在 0.2.4 树上是相反的（工序 118 的服主特批口径「除商店购买外全部不占库存」）——
  //     0.2.5 重缝时按上游收敛，故此处重钉。
  let ok = 0;
  for (let i = 0; i < 10; i++) if (debug(m, { action: 'grantItem', id, value: 1 }).ok) ok++;
  assert.ok(ok >= 1, '至少发出一件');
  assert.equal(m.itemPool.left(id), 0, '★ 份额被吃光（与"买了 cap 份"同一结果）');
  assert.equal(m.itemPool.canGain(id), false, '库存被发空 ⇒ 不能再发');
  assert.ok(m.itemPool.held(id) >= cap, 'Σ held 至少等于 cap（三合一计入 golden 的 2 份）');
  assert.ok(ps.hand.length + ps.temp.length < 20, '失败原因不是格子不够');
  assert.equal(m.itemPool.left(id), 0, '★ 0.2.5：调试来源**不豁免**库存（与工序 118 的口径相反）');
  // ★ 落点确认：`intents.js:_debugGrant` 一件都没发出去 ⇒ 回 `HAND_FULL + "debug: no room for the item"`。
  //   （它把"库存被拒"与"格子满"都归到这一条；两者都不改账本，故这里只钉"失败 + 没发出去"。）
  assert.deepEqual(debug(m, { action: 'grantItem', id, value: 1 }), { error: ERR_HAND_FULL, detail: 'debug: no room for the item' },
    '库存空 ⇒ 控制台也发不出去（与干员/效果来源同一道闸门）');
  h.invariants();
  // 对照：**商店购买**那条路照旧受 cap 限制（连买 cap 次成功，再多就被拒）——库存模型本身没被拆掉。
  const h2 = soloPrep();
  const m2 = h2.m, ps2 = h2.ps('p_0');
  const id2 = Object.values(DATA.items).filter((it) => it && it.itemType === 'EQUIP' && !it.isGolden && it.tier === 2).map((it) => it.id).sort()[0];
  let bought = 0;
  for (let i = 0; i < m2.itemPool.cap(id2) + 2; i++) if (ps2.acquireItem(id2, { source: 'buy' })) bought++;
  assert.equal(bought, m2.itemPool.cap(id2), '商店购买恰好买得走 cap 份');
  assert.equal(m2.itemPool.canGain(id2), false);
  h2.invariants();
  // ★ 干员走引擎的 overdraw（`acquireChess` 的 `take(..., { overdraw: true })`）⇒ 库存空了照样发得出去，
  //   只是**账本继续守恒**（raw left 变负，Σ held 同步变大）。这不是我们的特例，是引擎既有模型
  //   （`server/match/pool.js` 文件头："chess granted by effects while the pool is empty … hold 0"、
  //   "raw left ≤ cap and raw left + Σ held copies == cap"）。★ 6 阶库存只有 5 份、合并（3 合一）不会把手牌塞满。
  const chessId = Object.values(DATA.chess).filter((c) => c && c.visible && !c.isGolden && !c.isDiy && c.tier === 6).map((c) => c.chessId).sort()[0];
  const base = m.gd.baseIdOf(chessId);
  const entry = m.pool.entries.get(base);
  assert.equal(entry.cap, 5, '6 阶每人的份数是 5（config.economy.poolCopies）');
  for (let i = 0; i < 8 && entry.left > 0; i++) assert.deepEqual(debug(m, { action: 'grantChess', id: chessId, value: 1 }), { ok: true });
  assert.ok(entry.left <= 0, `库存已打空（raw left=${entry.left}）`);
  const before = entry.left;
  assert.deepEqual(debug(m, { action: 'grantChess', id: chessId, value: 1 }), { ok: true }, '干员在库存空了之后仍然发得出去');
  assert.equal(entry.left, before - 1, 'raw left 继续变负 = 超发；Σ held 同步 +1 ⇒ 账本仍守恒');
  h.invariants();
});

// ---- ⑤ 双重闸门 ------------------------------------------------------------------------------------------------

test('闸门：非单人房 / 未启用 / 动作不在白名单 ⇒ 三个新动作与老动作一样被拒（状态零变化）', () => {
  // ① 两个人 ⇒ Match.loneHuman 为假
  const coop = makeMatch({ mode: 'coop', humans: 2, fake: true, seed: 3, data: dataWith({}) });
  coop.start();
  for (const msg of [{ action: 'setWaveList', list: ['e:1'] }, { action: 'setEnemyAttr', id: 'def', value: 2000 }, { action: 'setLayers', id: 'x', value: 0 }]) {
    assert.equal(coop.m.handle('p_0', { t: 'g.debug', ...msg }).error, ERR_WRONG, JSON.stringify(msg));
  }
  assert.equal(coop.ps('p_0').layers.x, undefined);
  // ② 单人房但数据里没开（= 不装 Mod 的服务器）
  const off = makeMatch({ mode: 'solo', fake: true, seed: 3, data: DATA });
  off.start();
  assert.equal(off.m.gd.debug.enabled, false);
  for (const msg of [{ action: 'setWaveList', list: ['e:1'] }, { action: 'setEnemyAttr', id: 'def', value: 2000 }, { action: 'setLayers', id: 'x', value: 0 }]) {
    assert.equal(off.m.handle('p_0', { t: 'g.debug', ...msg }).error, ERR_WRONG, JSON.stringify(msg));
  }
  // ③ 白名单里没有它
  const narrow = soloPrep({ actions: ['setRound'] });
  for (const msg of [{ action: 'setWaveList', list: ['e:1'] }, { action: 'setEnemyAttr', id: 'def', value: 2000 }, { action: 'setLayers', id: 'x', value: 0 }]) {
    assert.equal(debug(narrow.m, msg).error, ERR_WRONG, JSON.stringify(msg));
  }
  assert.equal(narrow.m.gd.debugAttrMul, null);
  // ④ 白名单为空数组 = 一个动作都不许（fail-closed），不是"全放行"
  const none = soloPrep({ actions: [] });
  assert.equal(debug(none.m, { action: 'setEnemyAttr', id: 'def', value: 2000 }).error, ERR_WRONG);
});

test('m.public.debugScale 只在 config.debug.enabled 时出现（不装 Mod 的房间逐键相同）', () => {
  const off = makeMatch({ mode: 'solo', fake: true, seed: 3, data: DATA });
  off.start();
  off.flushAll();
  assert.equal(Object.hasOwn(off.lastBc('m.public') || {}, 'debugScale'), false);
  const on = soloPrep();
  on.flushAll();
  assert.deepEqual(Object.keys(on.lastBc('m.public').debugScale).sort(),
    ['aspdMul', 'atkMul', 'base', 'defMul', 'hpMul', 'resMul', 'speedMul']);
});
