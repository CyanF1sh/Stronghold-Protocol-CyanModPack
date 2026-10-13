// test/match/boss-pairing.test.js — 「最终攻势的队友怎么配」这条接缝（server/match/bossPairing.js）的单元 + 端到端验收。
//
// 五件事（docs/MODS.md §4.4 第 7 条要求的四类，加一条"随机不污染别的流"）：
//   ① 不装 Mod 时**逐值等于官方**：`bossPairGroups(gd, …)` === `pairPlayers(alive)`，且 4 人 / 3 人 / 1 人的分组形状不变；
//   ② 表命中 'random' ⇒ 随机分组，且**成员集合与组数不变**（只是"谁和谁一组"变）、**组内左右按座位不变**；
//   ③ 表外计数走 `default`；非法值（"seat" / 数字 / null / 非对象）**一律回官方**，绝不抛、绝不自造第三种策略；
//   ④ 随机**不消耗本局任何既有随机流**（波次 / 商店 / 机变 / 机器人）；
//   ⑤ 真开一局（6 人房）：开接缝前后 `bossWaves` 的**波次内容逐字节相同**，只有 `players` 的配对变。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GameData } from '../../server/match/gamedata.js';
import { pairPlayers, bossPairGroups } from '../../server/match/finalAssault.js';
import { readBossPairing, bossPairingFor, BOSS_PAIRING_DEFAULTS } from '../../server/match/bossPairing.js';
import { deriveSeed } from '../../server/sim/rng.js';
import { getData } from '../../server/data.js';
import { makeMatch } from './harness.js';
import { FakeBattle } from './fakeBattle.js';
import { PHASE } from '../../shared/constants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = path.resolve(HERE, '..', '..');
const quiet = { warn() {}, error() {}, info() {}, debug() {} };
// ★ `modsDir: null` ⇒ 纯官方数据（不受本机 mods/ 与 SP_MODS 影响）
const RAW = getData({ log: quiet, modsDir: null });

/** 一行 Mod 补丁（`mods/cyanfish.boss-pairing/data/config.json`）的真身 —— 单测跟着真 Mod 走，不另抄一份值。 */
const MOD_ID = 'cyanfish.boss-pairing';
const MOD_PATCH = JSON.parse(readFileSync(path.join(TREE, 'mods', MOD_ID, 'data', 'config.json'), 'utf8'));
const patched = (table) => ({ ...RAW, config: { ...RAW.config, bossPairing: table } });

const p = (seat, playerId = `p_${seat}`) => ({ seat, playerId });
const seats = (n) => Array.from({ length: n }, (_, i) => p(i));
const shape = (groups) => groups.map((g) => g.map((x) => x.seat));

test('① 不装 Mod：bossPairGroups 与官方 pairPlayers 逐值相同（表缺失 ⇒ 不接管）', () => {
  const gd = new GameData(RAW, 'mode_multi_hard');
  assert.deepEqual(gd.bossPairing, BOSS_PAIRING_DEFAULTS, 'data/ 里没有 bossPairing ⇒ 归一化结果是官方默认');
  assert.deepEqual(readBossPairing(RAW.config), { pairing: null });
  for (const n of [0, 1, 2, 3, 4, 5, 6, 9, 12]) {
    const alive = seats(n);
    for (const seed of [1, 7, 606, 4294967295 % 100000]) {
      assert.deepEqual(shape(bossPairGroups(gd, seed, 14, alive)), shape(pairPlayers(alive)), `n=${n} seed=${seed}`);
    }
  }
  // 官方口径本身（形状 + 组内第一人 = 座位靠前者 = LEFT）
  assert.deepEqual(shape(pairPlayers([p(3), p(1), p(0), p(2)])), [[0, 1], [2, 3]]);
  assert.deepEqual(shape(pairPlayers([p(3), p(1), p(0)])), [[0, 1], [3]]);
  assert.deepEqual(shape(pairPlayers([])), []);
});

test('② 表命中 "random"：成员集合与组数不变、组内左右仍按座位，但"谁和谁一组"随 seed 变', () => {
  const gd = new GameData(patched({ default: 'random' }), 'mode_multi_hard');
  assert.equal(readBossPairing(patched({ default: 'random' }).config).pairing.default, 'random');
  const alive = seats(6);
  const seen = new Set();
  for (let seed = 1; seed <= 64; seed++) {
    const groups = bossPairGroups(gd, seed, 14, alive);
    assert.deepEqual(shape(groups).flat().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5], `seed=${seed}: 成员集合不变`);
    assert.equal(groups.length, 3, `seed=${seed}: 战场数 = ⌈6/2⌉`);
    for (const g of groups) {
      assert.equal(g.length, 2, `seed=${seed}: 每组 2 人`);
      assert.ok(g[0].seat < g[1].seat, `seed=${seed}: 组内仍按 seat 升序（LEFT 仍是座位靠前的那位）`);
    }
    seen.add(shape(groups).map((g) => g.join('+')).join('|'));
  }
  // 4 人房 6 人房的合法分组数：6 人 = 15 种（3 组两两分组）；64 个 seed 至少要见到 5 种
  assert.ok(seen.size >= 5, `64 个 seed 里只见到 ${seen.size} 种分组 ⇒ 随机没生效`);
  // 2 人房：队友无从选择 ⇒ 洗牌只能翻左右，而组内按 seat 排序把它固定住 ⇒ 只有一种结果
  const two = new Set();
  for (let seed = 1; seed <= 32; seed++) two.add(shape(bossPairGroups(gd, seed, 14, seats(2))).map((g) => g.join('+')).join('|'));
  assert.deepEqual([...two], ['0+1'], '2 人房：分组恒为 0+1（左右不被翻）');
  // 同一 (seed, round, 存活集合) 永远同结果；不同 round 是两条派生流
  assert.deepEqual(shape(bossPairGroups(gd, 42, 14, alive)), shape(bossPairGroups(gd, 42, 14, alive)));
  assert.deepEqual(shape(bossPairGroups(gd, 42, 15, alive)), shape(bossPairGroups(gd, 42, 15, alive)));
});

test('③ 非法值一律回官方（绝不抛、绝不自造第三种策略）；表外计数走 default', () => {
  const gdOff = new GameData(RAW, 'mode_multi_hard');
  const official = shape(pairPlayers(seats(4)));
  for (const [table, why] of [
    [undefined, '没有表'], [null, 'null 表'], [5, '表不是对象'], ['random', '表是字符串'],
    [{}, '空表（无 default）'], [{ default: 'seat' }, '显式 seat = 不接管'], [{ default: true }, '布尔'],
    [{ default: 1 }, '数字'], [{ default: null }, 'default:null'], [{ default: 'RANDOM' }, '大小写不同'],
  ]) {
    const gd = table === undefined ? gdOff : new GameData(patched(table), 'mode_multi_hard');
    for (const seed of [1, 9, 77]) {
      assert.deepEqual(shape(bossPairGroups(gd, seed, 14, seats(4))), official, `${why}（seed=${seed}）`);
    }
    assert.equal(bossPairingFor(4, readBossPairing({ bossPairing: table })), null, `${why} ⇒ bossPairingFor = null`);
  }
  // 命中与 default 兜底：5 人写死 random、6 人没列到 ⇒ 走 default
  const bp = readBossPairing({ bossPairing: { 5: 'random', default: null } });
  assert.equal(bossPairingFor(5, bp), 'random');
  assert.equal(bossPairingFor(6, bp), null);
  assert.equal(bossPairingFor(0, readBossPairing({ bossPairing: { default: 'random' } })), 'random', '未传人数（0）也走 default');
  assert.equal(bossPairingFor(13, readBossPairing({ bossPairing: { default: 'random' } })), 'random', '表外计数走 default');
});

test('④ 随机不消耗本局任何既有随机流（rngWaves / rngDraft / rngMeta / rngShop / rngBots 逐值不动）', () => {
  const mk = (table) => {
    const data = table === undefined ? RAW : patched(table);
    FakeBattle.reset();
    const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 4, seed: 1234, data, fake: true });
    const m = h.m;
    // 先把五条流各取一个数作为"位置指纹"，再调用配对，再取一次 —— 打开接缝时两条指纹必须相同
    const keys = ['rngWaves', 'rngDraft', 'rngMeta', 'rngShop', 'rngBots'];
    const before = keys.map((k) => (typeof m[k] === 'function' ? m[k]() : null));
    bossPairGroups(m.gd, m.seed, m.round || 14, m.alivePlayers());
    const after = keys.map((k) => (typeof m[k] === 'function' ? m[k]() : null));
    m.dispose();
    return { keys, before, after };
  };
  const off = mk(undefined), on = mk({ default: 'random' });
  assert.ok(on.after.some((v) => typeof v === 'number'), '确实量到了至少一条随机流（免得断言恒真）');
  assert.deepEqual(on.after, off.after, '★ 配对不读、不推进任何既有随机流（同一 seed 下逐个相同）');
  assert.deepEqual(on.before, off.before, '（同上，调用之前的位置也对齐）');
  // 反例防线：派生流是确定的，但**不同 salt** 必须不同（否则"随机"是假的）
  assert.notEqual(deriveSeed(1234, 'bossPair:14'), deriveSeed(1234, 'bossPair:15'), '两个 boss 回合必须是两条派生流');
  assert.notEqual(deriveSeed(1234, 'bossPair:14'), deriveSeed(1235, 'bossPair:14'), '不同种子必须是两条派生流');
});

test('⑤ 真开一局（6 人房）：开接缝前后波次内容逐字节相同，只有 players 的配对变', () => {
  const play = (data, seed) => {
    FakeBattle.reset();
    const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 6, seed, data, fake: true, script: (b) => (b.kind === 'boss' ? { bossDps: 1e9 } : {}) });
    h.start();
    h.drive(() => h.m.bossWaves != null || h.ended != null);
    const m = h.m;
    const out = {
      groups: (m.bossWaves || []).map((w) => w.players.slice().sort().join('+')),
      waves: (m.bossWaves || []).map((w) => JSON.stringify(w.wave)).sort(),
    };
    m.dispose();
    return out;
  };
  let diffGroups = 0, compared = 0;
  for (const seed of [606, 11, 202, 3003]) {
    const off = play(RAW, seed);
    const on = play(patched({ default: 'random' }), seed);
    assert.equal(off.groups.length, 3, `seed=${seed}: 6 人 ⇒ 3 个战场`);
    assert.equal(on.groups.length, 3, `seed=${seed}: 开接缝后战场数不变`);
    assert.deepEqual(on.waves, off.waves, `seed=${seed}: ★ 波次内容逐字节相同（随机不碰 rngWaves）`);
    // ★ 分组**应该**变（这正是本接缝的目的）；不变的是"参与配对的人"与"战场数"
    assert.deepEqual(on.groups.join(',').split(/[+,]/).sort(), off.groups.join(',').split(/[+,]/).sort(), `seed=${seed}: 参与配对的人不变`);
    compared++;
    if (JSON.stringify(on.groups) !== JSON.stringify(off.groups)) diffGroups++;
  }
  assert.ok(diffGroups >= 1, `${compared} 个种子里开接缝后的配对一次都没变 ⇒ 随机没生效`);
});

test('⑥ 真 Mod 的补丁内容：恰好一条 add bossPairing、值只认 random（出厂即本文件所写）', () => {
  assert.deepEqual(MOD_PATCH.ops.map((o) => `${o.op} ${o.path}`), ['add bossPairing']);
  assert.deepEqual(MOD_PATCH.ops[0].value, { default: 'random' });
  const man = JSON.parse(readFileSync(path.join(TREE, 'mods', MOD_ID, 'mod.json'), 'utf8'));
  assert.equal(man.id, MOD_ID);
  assert.equal(man.apiVersion, 1);
  assert.equal(man.gameVersion, JSON.parse(readFileSync(path.join(TREE, 'package.json'), 'utf8')).version, 'gameVersion 必须与宿主严格相等');
  assert.deepEqual(man.loadAfter, []);
  // 纯数据：没有 content / assets / client
  for (const d of ['content', 'assets', 'client']) assert.equal(existsSync(path.join(TREE, 'mods', MOD_ID, d)), false, `不应该有 ${d}/`);
  // 与 max-seats 不冲突：本 Mod 不写 coop（平台补丁语言里 add 要求目标不存在）
  assert.ok(!JSON.stringify(MOD_PATCH).includes('coop'), '本 Mod 的补丁不许碰 config.coop');
});

test('⑦ 端到端：机变/boss 流程照跑不炸（PHASE 常量导入可用，audit 复核路径不抛）', () => {
  const gd = new GameData(patched({ default: 'random' }), 'mode_multi_hard');
  const groups = bossPairGroups(gd, 5, 14, seats(3));
  assert.deepEqual(shape(groups).flat().sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(groups.length, 2, '3 人 ⇒ 2 个战场（一组满编 + 一个单人，与官方同一形状）');
  assert.equal(PHASE.FINAL_ASSAULT, 'FINAL_ASSAULT');
});
