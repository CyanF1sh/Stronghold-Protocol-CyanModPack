// 多人房间接缝（server/match/coop.js）：座位容量、房主可调的座位上限、牌库份数、共享领袖血池、每局 ban 数量。
//
// ★ 本文件证明两件事：
//   1. **基座默认（没有 `config.coop`）= 官方 4 人**：容量 4、`seatCeiling` 也是 4（房主改不动容量）、
//      每个因子恒等于 1、ban 用模式自带值，而且对**任意**入座/存活人数都成立（不是只测 4）。
//   2. 给了 `coop` 表之后，三条规则按表生效 —— 表就是 Mod 提供的东西（见 mods/cyanfish.max-seats）。
//      （`maxSeats` 抬过官方 4 时 `room.setSeats` 才放开房内调整，见 test/lobby.test.js 的两个 describe。）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, MAX_SEATS, ERR } from '../../shared/constants.js';
import { validateC2S, RESULT_LIMITS, setSeatLimit } from '../../shared/protocol.js';
import { pairPlayers, bossPoolHp, SharedBossPool } from '../../server/match/finalAssault.js';
import { createRng } from '../../server/sim/rng.js';
import { SEAT_CEILING, readCoop, COOP_DEFAULTS, poolCopyMulFor, itemPoolMulFor, bossPoolMulFor, coopBansFor, draftCardCountFor } from '../../server/match/coop.js';
import { BOT_NAMES } from '../../server/lobby.js';
import { draftCount } from '../../server/match/choices.js';
import { MAX_DRAFT_CARDS } from '../../shared/constants.js';
import { SharedPool, SharedItemPool } from '../../server/match/pool.js';
import { normalizeSeats, seatCapacity, SEATS_PER_ROW } from '../../public/js/screens/room.js';
import { seatHue } from '../../public/js/ui/gameComponents.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch, checkInvariants } from './harness.js';

const bossFields = () => FakeBattle.instances.filter((b) => b.kind === 'boss' || b.kind === 'hidden');

/** 造一份"带 coop 段"的数据（等价于一个 Mod 打了 config.json 的补丁）。 */
const withCoop = (coop) => ({ ...DATA, config: { ...(DATA.config ?? {}), coop } });

/** 所有计数（0..12）——"任意人数都不缩放"这句话要按整个定义域来测。 */
const COUNTS = Array.from({ length: 13 }, (_, i) => i);

// ---------------------------------------------------------------------------------------------------
// 读配置：缺省 / 写坏 / 越界都回到官方值
// ---------------------------------------------------------------------------------------------------

test('readCoop: 没有 coop 段（基座默认）时就是官方 4 人', () => {
  for (const cfg of [undefined, null, {}, { coop: null }, { coop: 5 }, { coop: [] }, { coop: 'x' }]) {
    const c = readCoop(cfg);
    assert.equal(c.maxSeats, 4, `maxSeats for ${JSON.stringify(cfg)}`);
    assert.equal(c.poolCopyMul, null);
    assert.equal(c.itemPoolMul, null);
    assert.equal(c.bossPoolMul, null);
    assert.equal(c.bans, null);
    assert.equal(c.draftCards, null);
    // ★ 房主可用 room.setSeats 调到的座位上限：没把 maxSeats 抬过官方 4 ⇒ 恒 = 4 ⇒ 房主改不动容量
    assert.equal(c.seatCeiling, MAX_SEATS, `seatCeiling for ${JSON.stringify(cfg)}`);
  }
  assert.equal(MAX_SEATS, 4, 'the shared constant stays the official 4');
  assert.equal(MAX_DRAFT_CARDS, 24, 'the draft-card ceiling is separate from the seat count');
});

test('readCoop: 官方 4 人时 AI 队友上限 = 座位数（= 4）⇒ 与改造前逐值相同', () => {
  // ★ 工序 105：`aiCap` 是第八个键。**没有这个键 ⇒ 按 maxSeats 兜**：不装 Mod 时 = 官方 4，而 4 座房
  //   最多 4 个 AI ⇒ 上限恒不可达 ⇒ 基座与官方逐值相同（连 ERR.AI_LIMIT 都不可能发出）。
  for (const cfg of [undefined, null, {}, { coop: null }, { coop: 5 }, { coop: [] }, { coop: 'x' }]) {
    const c = readCoop(cfg);
    assert.equal(c.aiCap, 4, `aiCap for ${JSON.stringify(cfg)}`);
    assert.equal(c.aiCap, c.maxSeats, 'the default cap tracks the seat capacity, not a hard-coded 4');
  }
  assert.equal(COOP_DEFAULTS.aiCap, null, 'the sentinel in COOP_DEFAULTS is null = "fall back to maxSeats"');
  // 显式写了 coop 但没抬高容量 ⇒ 仍是 4
  assert.equal(readCoop({ coop: { maxSeats: 4 } }).aiCap, 4);
  assert.equal(readCoop({ coop: { maxSeats: 6 } }).aiCap, 6, '抬高容量而没写 aiCap ⇒ 上限跟着容量（= 改造前的行为）');
});

test('readCoop: aiCap 只认与 maxSeats 同域的正整数，非法一律回落 maxSeats（绝不夹到 1）', () => {
  const cap = (v, maxSeats = 6) => readCoop({ coop: { maxSeats, aiCap: v } }).aiCap;
  assert.equal(cap(1), 1, 'the strictest legal cap');
  assert.equal(cap(3), 3);
  assert.equal(cap(6), 6);
  assert.equal(cap(SEAT_CEILING), SEAT_CEILING, 'the sanity ceiling is legal');
  for (const bad of [0, -1, -3, 1.5, 0.5, '6', '', null, undefined, NaN, Infinity, -Infinity, true, false, [], {}]) {
    assert.equal(cap(bad), 6, `aiCap ${JSON.stringify(bad)} is not a cap ⇒ falls back to maxSeats`);
  }
  assert.equal(cap(999), SEAT_CEILING, 'out of range clamps to the sanity ceiling (like maxSeats)');
  assert.equal(cap(7, 12), 7, 'independent of maxSeats as long as it is legal');
  assert.equal(readCoop({ coop: { maxSeats: 'x', aiCap: 5 } }).aiCap, 5, 'a broken maxSeats does not invalidate a legal aiCap');
  // 官方具名 AI 名录 = 服主要的默认上限取值来源
  assert.equal(BOT_NAMES.length, 6);
  assert.equal(new Set(BOT_NAMES).size, 6, 'no duplicate names ⇒ the 6 official AI are 6 distinct teammates');
});

test('readCoop: 把容量夹进 1..SEAT_CEILING，写坏了也不抛', () => {
  assert.equal(readCoop({ coop: { maxSeats: 6 } }).maxSeats, 6);
  assert.equal(readCoop({ coop: { maxSeats: 1 } }).maxSeats, 1);
  assert.equal(readCoop({ coop: { maxSeats: 0 } }).maxSeats, 4, '0 非法 ⇒ 官方值');
  assert.equal(readCoop({ coop: { maxSeats: -3 } }).maxSeats, 4);
  assert.equal(readCoop({ coop: { maxSeats: 1.5 } }).maxSeats, 4);
  assert.equal(readCoop({ coop: { maxSeats: '6' } }).maxSeats, 4, '字符串不算数');
  assert.equal(readCoop({ coop: { maxSeats: NaN } }).maxSeats, 4);
  assert.equal(readCoop({ coop: { maxSeats: 999 } }).maxSeats, SEAT_CEILING, '越界夹到防呆上限');
  // ★ seatCeiling 只在"抬过官方 4"时才放开：<=4 一律停在 4（房主改不动），>4 时放开到防呆上限
  assert.equal(readCoop({ coop: { maxSeats: 5 } }).seatCeiling, SEAT_CEILING, '刚抬过 4 ⇒ 房主可调到防呆上限');
  assert.equal(readCoop({ coop: { maxSeats: 12 } }).seatCeiling, SEAT_CEILING);
  assert.equal(readCoop({ coop: { maxSeats: 4 } }).seatCeiling, MAX_SEATS, '恰好 4 ⇒ 仍然改不动');
  assert.equal(readCoop({ coop: { maxSeats: 1 } }).seatCeiling, MAX_SEATS, '比官方还小 ⇒ 也改不动');
  assert.equal(SEAT_CEILING, 12);
});

// ---------------------------------------------------------------------------------------------------
// 基座默认 = 官方：整条定义域上恒等
// ---------------------------------------------------------------------------------------------------

test('★ 没有 coop 表时：牌库倍率恒等于 1、血池倍率**不接管**（null）、ban 都是 null', () => {
  const coop = readCoop({});
  for (const n of COUNTS) {
    assert.equal(poolCopyMulFor(n, coop), 1, `poolCopyMulFor(${n})`);
    assert.equal(itemPoolMulFor(n, coop), 1, `itemPoolMulFor(${n})`);
    assert.equal(bossPoolMulFor(n, coop), null, `bossPoolMulFor(${n})：没有表 ⇒ 不接管 ⇒ 走官方`);
    assert.equal(coopBansFor(n, coop), null, `coopBansFor(${n})`);
    assert.equal(draftCardCountFor(n, coop), null, `draftCardCountFor(${n})`);
  }
  // 也覆盖"没有 coop 对象本身"（老调用点 / 桩对象）
  for (const n of COUNTS) {
    assert.equal(poolCopyMulFor(n, undefined), 1);
    assert.equal(itemPoolMulFor(n, undefined), 1);
    assert.equal(bossPoolMulFor(n, undefined), null);
    assert.equal(coopBansFor(n, undefined), null);
    assert.equal(draftCardCountFor(n, undefined), null);
  }
});

test('★ 没有 coop 表时：机变发卡数 = 官方口径（schedule.cards，缺省 format 6 / solo 3），与人数无关', () => {
  const gd = makeMatch({ humans: 4, fake: true }).m.gd;
  const sch = gd.choices.schedule?.[gd.modeId]?.rounds ?? {};
  const rounds = Object.keys(sch);
  assert.ok(rounds.length > 0, `绝境有 schedule 轮次可测（拿到 ${rounds.length} 轮）`);
  for (const r of rounds) {
    const official = sch[r].cards;
    for (const n of COUNTS) assert.equal(draftCount(gd, sch[r], n), official, `R${r} @ ${n} 人`);
  }
  // 没有 schedule 描述的一轮 ⇒ 走 choices.format（co-op 6 / solo 3）
  for (const n of COUNTS) assert.equal(draftCount(gd, {}, n), 6, `format 兜底 @ ${n} 人`);
  const solo = makeMatch({ mode: 'solo', humans: 1, fake: true }).m.gd;
  for (const n of COUNTS) assert.equal(draftCount(solo, {}, n), 3, `solo format 兜底 @ ${n} 人`);
});

test('★ 没有 coop 表时：牌库份数 = 官方 0.2.4 口径（档位值 / 干员覆盖 × 同盟倍率），与人数无关', () => {
  const gd = makeMatch({ humans: 4, fake: true }).m.gd;
  const ov = gd.economy.poolCopiesOverrides ?? {};
  // ★ 工序 99（0.2.4 口径变更）：官方在 `GameData.poolCopies` 里加了**同盟倍率**这一层
  //   （`economy.coopPoolMultiplier`，与队伍人数无关，且**连 `poolCopiesOverrides` 一起放大**；
  //   单人 / DIY 恒 1）。本接缝（没有 `config.coop.poolCopyMul`）必须**逐值等于官方**，
  //   所以在整条定义域上「与人数无关」这一条不变，但期望值要跟着官方那一层走。
  const coopMul = Number.isInteger(gd.economy.coopPoolMultiplier) && gd.economy.coopPoolMultiplier > 0
    ? gd.economy.coopPoolMultiplier : 1;
  const officialOf = (id) => {
    const mul = gd.isSolo || gd.chess(id)?.isDiy ? 1 : coopMul;
    const base = Number.isInteger(ov[id]) && ov[id] >= 0
      ? ov[id]
      : (gd.economy.poolCopies?.[gd.tierOf(id)] ?? 10);
    return Math.round(base * mul);
  };
  let checked = 0;
  for (const id of gd.visibleChess) {
    const official = officialOf(id);
    for (const n of COUNTS) {
      assert.equal(gd.poolCopies(id, n), official, `${id} @ ${n} players`);
      assert.equal(gd.poolCopies(id, n), gd.poolCopies(id, 0), `${id} @ ${n} players：与人数无关（接缝没接活）`);
    }
    checked++;
  }
  assert.ok(checked > 100, `覆盖了 ${checked} 名干员（应该上百）`);
});

test('★ 没有 coop 表时：装备共享库存 = 官方 0.2.4 口径（逐件份数 / 逐件覆盖），与人数无关', () => {
  const gd = makeMatch({ humans: 4, fake: true }).m.gd;
  const ov = gd.economy.itemPoolCopiesOverrides ?? {};
  // 官方 0.2.4 的 `GameData.itemPoolCopies(id)`：`itemPoolCopiesOverrides[baseId] ?? itemPoolCopies[tier]`，
  // **没有任何人数层**（与干员牌库不同：牌库在同盟里是 2 倍）。本接缝（没有 `config.coop.itemPoolMul`）必须逐值相等。
  const officialOf = (id) => {
    const base = gd.baseIdOf(id), rec = gd.item(base);
    if (!rec) return null;
    const c = ov[base] ?? gd.economy.itemPoolCopies?.[rec.tier];
    return Number.isInteger(c) && c >= 0 ? c : null;
  };
  const ids = [...new Set(Object.values(gd.shopItemsByTier).flat().map((id) => gd.baseIdOf(id)))];
  assert.ok(ids.length > 40, `拿到 ${ids.length} 件有库存的商店装备`);
  let checkedOv = 0;
  for (const id of ids) {
    const official = officialOf(id);
    for (const n of COUNTS) {
      assert.equal(gd.itemPoolCopies(id, n), official, `${id} @ ${n} players`);
      assert.equal(gd.itemPoolCopies(id, n), gd.itemPoolCopies(id, 0), `${id} @ ${n} players：与人数无关（接缝没接活）`);
    }
    if (Number.isInteger(ov[id]) && ov[id] >= 0) checkedOv++;
  }
  assert.ok(checkedOv > 0, `data 里那条 itemPoolCopiesOverrides 路径**真的被走到**了（${checkedOv} 件）`);
  // 效果类 / 不占库存的装备永远是 null（倍率不参与）
  assert.equal(gd.itemPoolCopies('chess_item_2_03_e_a'), null);
});

test('★ 没有 coop 表时：领袖血池走 0.2.1 官方口径（接缝完全不接管，两条路径逐值一致）', () => {
  const gd = makeMatch({ humans: 4, fake: true }).m.gd;
  const ids = Object.keys(gd.raw.bosses ?? {}).filter((id) => gd.boss(id));
  assert.ok(ids.length > 0, `数据里有 boss 可测（拿到 ${ids.length} 个）`);
  let checked = 0;
  for (const id of ids) {
    // ★ 0.2.1 的官方规则（gamedata.js bossPoolShareOf，config.bossHpScale.perPlayer = true）：
    //   co-op share = coop(1) × 开战时存活人数，封顶 aliveFull(4) ⇒ 血池**随存活人数变化**（0.1.x 是固定血量）。
    //   本接缝（没有 `config.coop.bossPoolMul`）必须**完全不插手**：倍率恒 null，两条实现路径逐值相同。
    const full = gd.bossPoolHp(id);                       // aliveCount 省略 ⇒ 满编（aliveFull = 4）
    for (const alive of [1, 2, 3, 4, 5, 6]) {
      assert.equal(bossPoolMulFor(alive, gd.coop), null, `没有表 ⇒ 不接管（alive=${alive}）`);
      const official = gd.bossPoolHp(id, alive);          // 官方路径（GameData.bossPoolHp）
      assert.equal(bossPoolHp(gd, id, alive), official, `${id} alive=${alive}: finalAssault 路径与 GameData 逐值一致`);
      checked++;
    }
    assert.equal(gd.bossPoolHp(id, 4), full, `${id}: 满编 4 人 = 默认调用（省略 aliveCount）`);
    assert.equal(gd.bossPoolHp(id, 6), full, `${id}: 存活 6 人也封顶在 aliveFull = 4`);
    assert.ok(gd.bossPoolHp(id, 2) < full, `${id}: 存活更少 ⇒ 血池更小（0.2.1 官方 perPlayer 规则）`);
  }
  assert.ok(checked >= 6, `覆盖了 ${checked} 组 (boss, 存活数)`);
});

test('★ 没有 coop 表时：任意人数都用模式自带的 ban 值', () => {
  const gd = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, fake: true }).m.gd;
  const official = { ...gd.bans('HARD') };
  for (const n of COUNTS) assert.deepEqual(gd.bans('HARD', n), official, `${n} seats`);
  assert.deepEqual(official, { core: 3, addon: 4 }, '绝境的官方值是 核心 3 + 附加 4');
});

// ---------------------------------------------------------------------------------------------------
// 给了 coop 表之后按表生效（这就是 Mod 做的事）
// ---------------------------------------------------------------------------------------------------

const COOP6 = {
  maxSeats: 6,
  poolCopyMul: { 5: 1.25, 6: 1.5, default: 1 },
  // ★ 工序 101：装备共享库存的第二层倍率（值 = 人数 ÷ 4 ⇒ >4 人时人均回到官方 4 人房水平）。
  itemPoolMul: { 5: 1.25, 6: 1.5, default: 1 },
  // ★ bossPoolMul 的键是 **boss 回合开始时的存活人数**（不是入座人数）：每人 1 份 = 0.25 ⇒ 值 = 存活 / 4
  bossPoolMul: {
    1: 0.25, 2: 0.5, 3: 0.75, 4: 1, 5: 1.25, 6: 1.5,
    7: 1.75, 8: 2, 9: 2.25, 10: 2.5, 11: 2.75, 12: 3, default: null,
  },
  bans: { 5: { core: 2, addon: 3 }, 6: { core: 2, addon: 3 }, default: null },
  draftCards: { 5: 7, 6: 8, default: null },
};

test('查表：列到的计数取值，没列到的走 default', () => {
  const coop = readCoop({ coop: COOP6 });
  assert.equal(coop.maxSeats, 6);
  assert.equal(poolCopyMulFor(5, coop), 1.25);
  assert.equal(poolCopyMulFor(6, coop), 1.5);
  assert.equal(poolCopyMulFor(4, coop), 1, 'default');
  assert.equal(poolCopyMulFor(12, coop), 1, 'default');
  assert.equal(itemPoolMulFor(5, coop), 1.25);
  assert.equal(itemPoolMulFor(6, coop), 1.5);
  assert.equal(itemPoolMulFor(4, coop), 1, 'default');
  assert.equal(itemPoolMulFor(12, coop), 1, 'default');
  assert.equal(bossPoolMulFor(1, coop), 0.25, '存活 1 人 = 1 份');
  assert.equal(bossPoolMulFor(4, coop), 1, '4 人满编 = 官方 1 倍');
  assert.equal(bossPoolMulFor(6, coop), 1.5);
  assert.equal(bossPoolMulFor(12, coop), 3, '12 人全活 = 3 倍（不封顶）');
  assert.equal(bossPoolMulFor(0, coop), null, 'default: null ⇒ 不接管 ⇒ 回官方');
  assert.equal(bossPoolMulFor(99, coop), null, '表外计数 ⇒ 不接管');
  assert.deepEqual(coopBansFor(6, coop), { core: 2, addon: 3 });
  assert.equal(coopBansFor(4, coop), null, 'default: null ⇒ 用模式自带值');
  assert.equal(coopBansFor(9, coop), null);
  assert.equal(draftCardCountFor(5, coop), 7);
  assert.equal(draftCardCountFor(6, coop), 8);
  assert.equal(draftCardCountFor(4, coop), null, 'default: null ⇒ 官方发卡数');
  assert.equal(draftCardCountFor(12, coop), null);
});

test('★ 机变发卡数：表命中就覆盖官方口径（含 schedule 里写死的 cards）；表外/写坏一律回官方', () => {
  const gd = makeMatch({ humans: 4, data: withCoop(COOP6), fake: true }).m.gd;
  const sch = { cards: 6 };                        // 官方这一轮写的是 6 张
  assert.equal(draftCount(gd, sch, 0), 6, '没人数据（0）⇒ 官方 6');
  assert.equal(draftCount(gd, sch, 4), 6, '4 座 ⇒ 官方 6');
  assert.equal(draftCount(gd, sch, 5), 7, '5 座 ⇒ 表里的 7');
  assert.equal(draftCount(gd, sch, 6), 8, '6 座 ⇒ 表里的 8');
  assert.equal(draftCount(gd, sch, 7), 6, '7 座没列到、default 是 null ⇒ 回官方 6（这就是"表外回官方"）');
  // 表缺失时 schedule.cards 仍然说了算（老数据 / 老调用点）
  const gdOff = makeMatch({ humans: 4, fake: true }).m.gd;
  assert.equal(draftCount(gdOff, { cards: 6 }, 6), 6);
  // schedule 没写 cards ⇒ format（co-op 6 / solo 3）
  assert.equal(draftCount(gdOff, {}, 9), 6);
  // ★ 上限：无论数据写多大都不会发出去超过 MAX_DRAFT_CARDS 张
  const coopBig = readCoop({ coop: { draftCards: { 6: 500 } } });
  assert.equal(draftCardCountFor(6, coopBig), MAX_DRAFT_CARDS, '表值先被夹到上限');
  assert.equal(draftCount(gdOff, { cards: 500 }, 0), MAX_DRAFT_CARDS, 'schedule.cards 也被夹到上限（不再有 6 的硬上限）');
  assert.equal(draftCount(gdOff, { cards: 9 }, 0), 9, 'schedule 写 9 就发 9（旧代码会夹成 6）');
});

test('写坏的表不会让服务器崩（类型不对 ⇒ 退回官方）', () => {
  const coop = readCoop({ coop: { maxSeats: 6, poolCopyMul: {}, itemPoolMul: { 6: '1.5' }, bossPoolMul: { 6: 'x' }, bans: { 6: { core: 1 } }, draftCards: { 6: 0 } } });
  assert.equal(poolCopyMulFor(6, coop), 1);
  assert.equal(itemPoolMulFor(6, coop), 1, '字符串不算数 ⇒ 回 ×1（官方）');
  assert.equal(bossPoolMulFor(6, coop), null, '不是有限数 ⇒ 不接管 ⇒ 回官方血池');
  assert.equal(coopBansFor(6, coop), null, 'core/addon 不全 ⇒ 不用它');
  assert.equal(draftCardCountFor(6, coop), null, '发 0 张等于谁也拿不到 ⇒ 回官方');
  // ★ 血池：0 / 负 / 字符串 / 布尔 都不接管（绝不发出 0 倍血池 —— 那等于 boss 出场即死）。
  //   注意 0.5 / 1.25 这类小数是**合法**倍率（存活 2 人 / 5 人），不在坏值之列。
  for (const bad of [0, -3, '2', null, undefined, NaN, true]) {
    assert.equal(bossPoolMulFor(6, readCoop({ coop: { bossPoolMul: { 6: bad } } })), null, `bossPoolMul = ${String(bad)} ⇒ 不接管`);
  }
  assert.equal(bossPoolMulFor(6, readCoop({ coop: { bossPoolMul: 2 } })), null, 'bossPoolMul 不是对象 ⇒ 不接管');
  assert.equal(bossPoolMulFor(2, readCoop({ coop: { bossPoolMul: { 2: 0.5 } } })), 0.5, '0.5 是合法倍率（存活 2 人）');
  assert.equal(coopBansFor(6, readCoop({ coop: { bans: { 6: { core: -1, addon: 3 } } } })), null, '负数不算');
  for (const bad of [0, -3, 1.5, '8', null, undefined, NaN, true]) {
    assert.equal(draftCardCountFor(6, readCoop({ coop: { draftCards: { 6: bad } } })), null, `draftCards = ${String(bad)} ⇒ 回官方`);
  }
  assert.equal(draftCardCountFor(6, readCoop({ coop: { draftCards: 8 } })), null, 'draftCards 不是对象 ⇒ 回官方');
});

test('开了表之后：牌库 = 官方同盟倍率 × 我们的表（两层都在；覆盖按官方一起放大，不另立口径）', () => {
  const data = withCoop(COOP6);
  const gd = makeMatch({ humans: 4, data, fake: true }).m.gd;
  const ov = gd.economy.poolCopiesOverrides ?? {};
  // ★ 工序 99（0.2.4 口径变更）：官方那一层（同盟 ×`coopPoolMultiplier`，与人数无关、**覆盖也放大**）
  //   原样保留；我们的 `config.coop.poolCopyMul` 只作**第二层**加在 >4 人上。
  //   ⇒ 4 人 = 官方口径；6 人 = 官方口径 × 1.5。**旧口径「干员覆盖不放大」已按官方撤销**
  //     （0.2.3 时官方根本没有这一层，所以那一条在 0.2.3 上是对的；0.2.4 起跟随官方）。
  const coopMul = Number.isInteger(gd.economy.coopPoolMultiplier) && gd.economy.coopPoolMultiplier > 0
    ? gd.economy.coopPoolMultiplier : 1;
  const official = (cid) => {
    const mul = gd.isSolo || gd.chess(cid)?.isDiy ? 1 : coopMul;
    const base = Number.isInteger(ov[cid]) && ov[cid] >= 0
      ? ov[cid]
      : (gd.economy.poolCopies?.[gd.tierOf(cid)] ?? 10);
    return Math.round(base * mul);
  };
  const base4 = new SharedPool(gd, { players: 4 });
  const base6 = new SharedPool(gd, { players: 6 });
  let checked = 0;
  let checkedOv = 0;
  for (const cid of base4.entries.keys()) {
    assert.equal(base4.cap(cid), official(cid), `4 人 = 官方 0.2.4 口径（${cid}）`);
    assert.equal(base6.cap(cid), Math.round(official(cid) * 1.5), `6 人 = 官方口径 × 1.5（${cid}）`);
    checked++;
    if (Number.isInteger(ov[cid]) && ov[cid] >= 0) checkedOv++;
  }
  assert.ok(checked > 100, `覆盖了 ${checked} 名干员`);
  assert.ok(checkedOv > 0, `data 里那条 poolCopiesOverrides 路径**真的被走到**了（${checkedOv} 名）`);
  assert.ok(base6.totalLeft() > base4.totalLeft(), '6 人拿到更大的牌库');
  const ratio = base6.totalLeft() / base4.totalLeft();
  assert.ok(ratio > 1.4 && ratio < 1.6, `总份数约 ×1.5（${base4.totalLeft()} → ${base6.totalLeft()}）`);
});

test('★★ 开了表之后：装备共享库存 = 官方 × 我们的表（≤4 人逐值等于官方；>4 人人均回到官方 4 人房水平，工序 101）', () => {
  const data = withCoop(COOP6);
  const gd = makeMatch({ humans: 4, data, fake: true }).m.gd;
  const ov = gd.economy.itemPoolCopiesOverrides ?? {};
  // 官方那一层（与人数无关）：这是「不装 Mod / ≤4 人」必须逐值相等的期望值。
  const official = (id) => {
    const base = gd.baseIdOf(id), rec = gd.item(base);
    const c = ov[base] ?? gd.economy.itemPoolCopies?.[rec.tier];
    return Number.isInteger(c) && c >= 0 ? c : null;
  };
  const ids = [...new Set(Object.values(gd.shopItemsByTier).flat().map((id) => gd.baseIdOf(id)))];
  let checked = 0; let checkedOv = 0;
  for (const id of ids) {
    const base = official(id);
    for (const n of [0, 1, 2, 3, 4]) assert.equal(gd.itemPoolCopies(id, n), base, `≤4 人（${n}）逐值等于官方：${id}`);
    assert.equal(gd.itemPoolCopies(id, 5), Math.round(base * 1.25), `5 人 = 官方 × 1.25：${id}`);
    assert.equal(gd.itemPoolCopies(id, 6), Math.round(base * 1.5), `6 人 = 官方 × 1.5：${id}`);
    assert.ok(gd.itemPoolCopies(id, 6) >= base, `放大只增不减：${id}`);
    checked++;
    if (Number.isInteger(ov[id]) && ov[id] >= 0) checkedOv++;
  }
  assert.ok(checked > 40, `覆盖了 ${checked} 件装备`);
  assert.ok(checkedOv > 0, `逐件覆盖（itemPoolCopiesOverrides）**跟着一起放大**（${checkedOv} 件）`);
  // 人均对照：官方 4 人房人均 = 总份数 / 4。取整沿用 `poolCopies` 的同一约定（逐件 `Math.round`，单点取整）
  // ⇒ 残差只来自取整（≤ 每件 0.5 份），人均不会低于官方（向上取整居多的那一侧）。
  const total = (n) => ids.reduce((s, id) => s + gd.itemPoolCopies(id, n), 0);
  const perCap4 = total(4) / 4;
  for (const n of [5, 6]) {
    const per = total(n) / n;
    assert.ok(per >= perCap4 && per / perCap4 - 1 < 0.05,
      `${n} 人人均 ${per.toFixed(2)} vs 官方 4 人房人均 ${perCap4.toFixed(2)}（偏差 ${((per / perCap4 - 1) * 100).toFixed(2)}%，余量来自逐件取整）`);
  }
  // ★ 真一局：`Match` → `SharedItemPool` 这条路真的把 `seatCount` 传下去了（不是只在 GameData 上成立）
  const m6 = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 6, data, seed: 11, fake: true }).start();
  const m4 = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 4, data, seed: 11, fake: true }).start();
  assert.equal(m6.m.seatCount, 6);
  assert.equal(m6.m.itemPool.seats, 6);
  assert.equal(m4.m.itemPool.seats, 4);
  for (const id of ids) {
    assert.equal(m6.m.itemPool.cap(id), Math.round(official(id) * 1.5), `6 座真局 = 官方 × 1.5：${id}`);
    assert.equal(m4.m.itemPool.cap(id), official(id), `4 座真局逐值等于官方：${id}`);
  }
  // ★ 不装 Mod（没有 coop 表）的 6 座房：装备库存**不放大**（逐值等于官方 —— 接缝没接活）
  const m6off = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 6, seed: 11, fake: true }).start();
  assert.equal(m6off.m.seatCount, 6);
  for (const id of ids) assert.equal(m6off.m.itemPool.cap(id), official(id), `不装 Mod 的 6 座房逐值等于官方：${id}`);
  m6.m.dispose(); m4.m.dispose(); m6off.m.dispose();
});

test('开了表之后：ban 数量按表走，并且真的少禁了盟约', () => {
  const data = withCoop(COOP6);
  const h4 = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, data, seed: 5, fake: true });
  const h6 = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 6, data, seed: 5, fake: true });
  assert.deepEqual(h4.m.gd.bans('HARD', 4), { core: 3, addon: 4 }, '4 人仍是官方值');
  assert.deepEqual(h4.m.gd.bans('HARD', 0), { core: 3, addon: 4 });
  assert.deepEqual(h6.m.gd.bans('HARD', 6), { core: 2, addon: 3 });
  assert.equal(h4.m.disabledBonds.length, 7, '4 人：3 核心 + 4 附加');
  assert.equal(h6.m.disabledBonds.length, 5, '6 人：2 核心 + 3 附加');
  const coreOf = (m) => m.disabledBonds.filter((b) => m.gd.bond(b)?.isCore).length;
  assert.equal(coreOf(h4.m), 3);
  assert.equal(coreOf(h6.m), 2);
});

test('★ 血池倍率按 **boss 回合时的实际存活人数**（每人 1 份），与入座人数无关', () => {
  const data = withCoop(COOP6);
  const gd6 = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 6, data, fake: true }).m.gd;
  const gd4 = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, data, fake: true }).m.gd;
  const id = Object.keys(gd6.raw.bosses ?? {}).find((b) => gd6.boss(b));
  const official = DATA.bosses[id].bloodPoint.HARD;   // 官方口径（血池与存活人数无关，aliveScaling 关）

  // 4 人满编 = 1 倍 ⇒ 与官方逐值相同
  assert.equal(gd6.bossPoolHp(id, 4), official, '4 人全活 = 官方值');
  // ★ 每人算 1 份（1 份 = 0.25 = 官方单人份）⇒ 倍数 = 存活 / 4，满编以上不封顶
  for (const [alive, mul] of [[1, 0.25], [2, 0.5], [3, 0.75], [6, 1.5], [8, 2], [12, 3]]) {
    assert.equal(gd6.bossPoolHp(id, alive), Math.max(1, Math.round(official * mul)), `存活 ${alive} ⇒ ×${mul}`);
  }
  // ★ 与**入座人数**无关：同一个存活数，6 座房与 4 座房拿到同一个值（本次勘误的关键）
  for (const alive of [1, 2, 3, 4, 6]) {
    assert.equal(gd6.bossPoolHp(id, alive), gd4.bossPoolHp(id, alive), `存活 ${alive}：6 座房 == 4 座房`);
  }
  // finalAssault.js 里那条平行实现同口径
  for (const alive of [1, 3, 6]) {
    assert.equal(bossPoolHp(gd6, id, alive), gd6.bossPoolHp(id, alive), `finalAssault 路径 alive=${alive}`);
  }
  // solo 房永远不接管：装表与不装表逐值相同（0.2.1 官方 solo share = bossHpScale.solo，现值为 1）
  const soloOff = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true }).m.gd;
  const solo = makeMatch({ mode: 'solo', difficulty: 'HARD', data, fake: true }).m.gd;
  assert.equal(solo.bossPoolHp(id, 1), soloOff.bossPoolHp(id, 1), '★ solo 房：装表与不装表逐值相同（coop 表永不接管）');
  assert.equal(solo.bossPoolHp(id, 1), Math.max(1, Math.round(official * solo.bossPoolShare(1))), 'solo 走官方 share');
});

// ---------------------------------------------------------------------------------------------------
// 真开一局 6 人
// ---------------------------------------------------------------------------------------------------

test('6 人真开一局：3 个战场、共用一条血池、血池 = 官方的 1.5 倍', () => {
  const data = withCoop(COOP6);
  const script = (b) => (b.kind === 'boss' ? { bossDps: 1e9 } : {});
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 6, data, seed: 606, fake: true, script }).start();
  const m = h.m;
  assert.equal(m.seatCount, 6);
  assert.equal(m.players.size, 6);

  // ≤4 的那一局逐份额不缩放
  const h4 = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 4, data, seed: 606, fake: true }).start();
  assert.equal(h4.m.seatCount, 4);
  const ids4 = [...h4.m.pool.entries.keys()];
  const plain4 = new SharedPool(h4.m.gd, { players: 4, banned: h4.m.bannedChess });
  for (const cid of ids4) assert.equal(h4.m.pool.cap(cid), plain4.cap(cid), `4 人：${cid} 保持官方份数`);

  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  const fields = bossFields();
  assert.equal(fields.length, 3, '6 人 = 3 对 = 3 个战场');
  assert.deepEqual(fields.map((f) => f.fieldId), ['b1', 'b2', 'b3']);
  const pool = fields[0].sharedBoss;
  assert.ok(fields.every((f) => f.sharedBoss === pool), '每个战场打的是同一条领袖血池');
  // 6 人全活到 boss 回合 ⇒ 表值 1.5（每人 1 份）⇒ = 官方 bloodPoint 的 1.5 倍
  const bloodHp = m.gd.bossPoolHp(m.bossId, 4);
  assert.equal(pool.maxHp, Math.round(bloodHp * 1.5), '6 人全活 ⇒ 官方血池的 1.5 倍');
  for (const f of fields) {
    assert.deepEqual(f.opts.players.map((p) => p.side), ['L', 'R'], '每个战场保持左右半场');
    assert.ok(f.opts.players.every((p) => p.lpForBoss === m.teamLp), '共用同一条队伍生命值');
  }
});

test('★ 机变草稿按入座人数发卡：6 人真开一局第一个机变回合就有 8 张，4 人仍是 6 张', () => {
  const data = withCoop(COOP6);
  const firstDraft = (humans) => {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans, data, seed: 606, fake: true }).start();
    h.drive(() => h.m.phase === PHASE.SP_DRAFT);
    return h.m.sp;
  };
  const sp6 = firstDraft(6);
  assert.equal(sp6.cards.length, 8, `6 座 ⇒ 人越多卡越多（表里的 8，实际 ${sp6.cards.length}）`);
  assert.deepEqual(sp6.cards.map((c) => c.idx), [0, 1, 2, 3, 4, 5, 6, 7], 'idx 是 0..n-1（分页/选取都靠它）');
  assert.equal(new Set(sp6.cards.map((c) => c.id)).size, 8, '8 张互不相同（悬赏不会重复发同一张）');
  const sp4 = firstDraft(4);
  assert.equal(sp4.cards.length, 6, '4 座 ⇒ 官方的 6 张');
  // 4 人：装了这张表的局与不装 Mod 的局，草稿字段完全一致
  const off = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, seed: 606, fake: true }).start();
  off.drive(() => off.m.phase === PHASE.SP_DRAFT);
  assert.deepEqual(sp4.cards.map((c) => c.id), off.m.sp.cards.map((c) => c.id), '★ 4 座：装与不装的机变草稿逐张相同');
  assert.equal(sp4.family, off.m.sp.family, '★ 4 座：家族也相同');
});

test('★ 8 张草稿时第 7、8 张（idx 6 / 7）**真人可选**：协议层放行 + 业务层接受（服主实测 待修复②）', () => {
  const data = withCoop(COOP6);
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 6, data, seed: 606, fake: true }).start();
  const m = h.m;
  h.drive(() => m.phase === PHASE.SP_DRAFT);
  assert.equal(m.phase, PHASE.SP_DRAFT);
  assert.equal(m.sp.cards.length, 8, '6 座 ⇒ 8 张（表值）');
  // ① 协议层（shared/protocol.js 的 C2S 白名单）：第 2 页的 idx 必须放行。
  //    修复前 `'g.choice'` 写死 `isInt(v, 0, 5)` ⇒ idx 6 / 7 在这里就被判 `bad field idx` ⇒ ERR.BAD_MSG
  //    「无效的请求」，请求根本到不了 pickCard —— 这正是服主看到的现象（第 2 页点不动、报无效的请求）。
  for (const idx of [6, 7]) assert.equal(validateC2S({ t: 'g.choice', idx }), null, `idx ${idx} 必须过协议校验`);
  // ② 上界是结构上限（MAX_DRAFT_CARDS），不是「这一轮确实有几张卡」：idx 8 协议放行，由业务层按实际卡数拒
  assert.equal(validateC2S({ t: 'g.choice', idx: 8 }), null, '结构上限之内 ⇒ 协议不管，交给业务层');
  assert.notEqual(validateC2S({ t: 'g.choice', idx: MAX_DRAFT_CARDS }), null, '超过 MAX_DRAFT_CARDS ⇒ 协议拒');
  // ③ 业务层：真人把最后两张选走，服务器必须回 { ok: true }（AI 走 spDraft.js 内部路径，本来就不受影响）
  const cur = m.spTurn();
  assert.ok(cur, '第一个决策者');
  assert.deepEqual(m.handle(cur, { t: 'g.choice', idx: 8 }), { error: ERR.BAD_TARGET }, '实际只有 8 张 ⇒ idx 8 被业务层拒');
  assert.equal(m.sp.picks[cur], undefined, '被拒的请求不消耗回合');
  const picked = [];
  for (const want of [7, 6]) {
    const pid = m.spTurn();
    assert.ok(pid, `还有可决策的人（已选 ${picked.length}）`);
    assert.deepEqual(m.handle(pid, { t: 'g.choice', idx: want }), { ok: true }, `${pid} 选 idx ${want}`);
    assert.equal(m.sp.picks[pid], want, 'picks 记的是整轮序号');
    assert.equal(m.sp.taken[want], pid);
    picked.push(want);
  }
  assert.deepEqual(picked, [7, 6], '第 7、8 张都被真人拿走了');
  // ④ 已拿走的下标在业务层是 SOLD_OUT（不是协议层那种「无效的请求」）
  const nxt = m.spTurn();
  if (nxt) assert.equal(m.handle(nxt, { t: 'g.choice', idx: 7 }).error, ERR.SOLD_OUT, '已拿走 ⇒ SOLD_OUT');
  checkInvariants(m);
  m.dispose();
});

test('4 人及以下完全不受影响：2 个战场、官方血池', () => {
  const data = withCoop(COOP6);
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 4, data, seed: 44, fake: true, script: (b) => (b.kind === 'boss' ? { bossDps: 1e9 } : {}) }).start();
  const m = h.m;
  assert.equal(m.seatCount, 4);
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  const fields = bossFields();
  assert.equal(fields.length, 2, '官方就是 2 个战场');
  assert.deepEqual(fields.map((f) => f.fieldId), ['b1', 'b2']);
  assert.equal(fields[0].sharedBoss.maxHp, bossPoolHp(m.gd, m.bossId, 4), '官方血池，未放大');
  assert.equal(fields[0].sharedBoss.maxHp, new SharedBossPool(bossPoolHp(m.gd, m.bossId, 4)).maxHp);
});

// ---------------------------------------------------------------------------------------------------
// 座位容量在两端怎么走
// ---------------------------------------------------------------------------------------------------

test('战场数与配对：每 2 名存活玩家 1 个战场（与座位上限无关，由存活数决定）', () => {
  const p = (seat) => ({ seat, playerId: `s${seat}` });
  // ★ 0.2.5 起 `pairPlayers` 的第二个参数是**必需**的 rng（官方新签名 `(alive, rng, previous)`）：
  //   基座两处调用点都传 `createRng(deriveSeed(seed, 'boss-pairs'))`。传 `null` 会 TypeError
  //   （官方那行 `rng.shuffle(sorted)` 不再有 `if (rng)` 守卫）—— 故这里喂一个固定种子的 rng，
  //   只断言**战场数**（与洗牌结果无关）。
  const groups = (n) => pairPlayers(Array.from({ length: n }, (_, i) => p(i)), createRng(1));
  for (const [n, want] of [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [8, 4]]) {
    assert.equal(groups(n).length, want, `${n} 存活 → ${want} 个战场`);
  }
  assert.equal(groups(7).length, 4, '7 人 → 4 个战场（多出来的那个人独占一个）');
});

test('协议边界跟着座位上限走（room.removeBot 的座位号、b.result 的每人条目）', () => {
  try {
    assert.equal(RESULT_LIMITS.players, 4);
    assert.notEqual(validateC2S({ t: 'room.removeBot', seat: 4 }), null, '4 座时座位 4 越界');
    setSeatLimit(6);
    assert.equal(RESULT_LIMITS.players, 6);
    assert.equal(validateC2S({ t: 'room.removeBot', seat: 5 }), null, '6 座时座位 5 可移除');
    assert.notEqual(validateC2S({ t: 'room.removeBot', seat: 6 }), null, '座位 6 仍越界');
  } finally {
    setSeatLimit(4);
  }
});

test('客户端座位补格与座位配色：4 人时逐值等于官方', () => {
  assert.equal(seatCapacity({ mode: 'coop', maxSeats: 6, seats: [] }), 6);
  assert.equal(normalizeSeats({ mode: 'coop', maxSeats: 6, seats: new Array(6).fill(null) }).length, 6);
  assert.equal(normalizeSeats({ mode: 'coop', seats: [null, null, null, null] }).length, 4, '回退：按服务端发来的数组');
  assert.equal(normalizeSeats({ mode: 'coop' }).length, MAX_SEATS, '回退：MAX_SEATS');
  assert.equal(normalizeSeats({ mode: 'solo', maxSeats: 6, seats: [null] }).length, 1, '单人房永远 1 个座位');
  assert.equal(SEATS_PER_ROW, 4, '一排 4 个（官方布局），多于这个数才换多排');
  // 官方 4 个座位的色相必须一个都不能变
  assert.deepEqual([0, 1, 2, 3].map(seatHue), [162, 196, 38, 280]);
  const many = Array.from({ length: 12 }, (_, i) => seatHue(i));
  assert.equal(new Set(many).size, 12, '12 个座位 12 种颜色，不撞色');
});
