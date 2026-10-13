// test/content/morph-dual-bonds.test.js — 变形同构体（「转职球」）的「双转职」× 基座接缝 `mechanics.bondCopyLayers`。
//
// 一个干员同时持有两份同一个盟约（官方合法状态）：跃跃（本身【精准】）+ 变形同构体 + 精准狙击镜，
// 或 瑕光（本身【突袭】）+ 变形同构体 + 突袭手雷。
//
// ★ 这条规则现在是**接缝**（server/sim/mechanics.js；值来自 `data/backups.json` 的 `mechanics`）：
//   关（**默认** = 上游）：`unitBonds` / `metaBonds` / `pieceBonds` / 客户端 `pieceBondIds` 四处**都去重**，
//     `gainLayers` 的上限键是 `${capKey}|${bondId}`（同一盟约共用一份预算）⇒ 与上游逐值相同。
//   开（Mod `cyanfish.fix-mechanism`）：四处保留重复条目、上限每份各记一份、详情卡显示两份。
//     ① 空弦 garrison_150（SERVER_ADD_BOND_POSITION +3）：跃跃的两条精准各 +3 ⇒ 精准 **+6**（关时 +3）。
//     ② 瑕光 garrison_106（bond_self +4/份，上限 12/份）：突袭 **8/16/24/24**（关时 4/8/12/12）；
//        精锐瑕光（+8/份、上限 24/份）**16/32/48/48**。
//     ③ 史尔特尔 garrison_107（bond_by_id 点名 raidShip +8、上限 50）：**负场景** —— 开/关都只 +8/次 ⇒ 8/16/24/32。
//   人数**永远**按干员去重（`bondMembers` / `membership` 的 Set）：重复条目仍然只算**一个**成员。
//
// 等价的充分条件：清单里没有重复时求并（∪）与不去重**逐元素相同**（`!out.includes(...)` 永不命中），
// 且上限键的第一份永远是 `#0`（对单份清单而言与旧键同值同行为）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { makeMatch, give, giveItem, DATA, legalTileFor } from '../match/harness.js';
import { unitBonds, isMember, bondMembers, bondLayers, gainLayers, layersUsed, setGameData, gameData } from '../../server/sim/content/support/index.js';
import { metaBonds } from '../../server/sim/content/support/meta.js';
import { pieceBonds } from '../../server/match/bondsMeta.js';
import { readMechanics, MECHANICS_DEFAULTS } from '../../server/sim/mechanics.js';
import { canPlace, placeClass, FIELD } from '../../server/match/board.js';
import { rotateOffset } from '../../server/sim/dir.js';

const ISO = 'chess_item_6_09_e_a';        // 变形同构体 (canGiveBond)
const PRECI_ITEM = 'chess_item_3_02_e_a'; // 精准狙击镜 → preciShip
const GRENADE = 'chess_item_3_11_e_a';    // 突袭手雷 → raidShip

const ARCHET = 'chess_char_3_21_a';       // 空弦  garrison_150_a  SERVER_ADD_BOND_POSITION +3 / 自身及身前一格
const YUEYUE = 'chess_char_1_09_a';       // 跃跃  本身 preciShip
const SHENDIAN = 'chess_char_1_17_a';     // 深靛  arcaneShip + preciShip（把【精准】顶到 2 名激活）
const BLEMISHINE = 'chess_char_3_12_a';   // 瑕光  garrison_106_a  bond_self +4 / 每份上限 12
const BLEMISHINE_B = 'chess_char_3_12_b'; // 精锐瑕光 garrison_106_b bond_self +8 / 每份上限 24
const SURTR = 'chess_char_5_07_a';        // 史尔特尔 garrison_107_a bond_by_id raidShip +8 / 上限 50
const JIAN = 'chess_char_6_19_a';         // 锏   kjerag/kazimierz/swift + garrison_155_a bond_self +8 / 每份上限 24

/** 战斗侧：突袭与卡西米尔都处于激活（直接喂 PlayerBattleInput.bonds）。 */
const BONDS = {
  raidShip: { count: 2, active: true, tier: 1, layers: 0 },
  kazimierzShip: { count: 3, active: true, tier: 1, layers: 0 },
};

const countOf = (arr, v) => arr.filter((x) => x === v).length;

/**
 * 打开（on=true）/ 关闭接缝，跑完恢复。返回的 `fn(data)` 收到**这一轮该用的数据对象**：
 * sim 侧读 `gameData()`（`bondRecord` 同源），`server/match` 读 `gd.raw`（把同一份传给 makeMatch 的 `data`）。
 */
function withSeam(on, fn) {
  const base = gameData();
  const patched = on
    ? { ...base, backups: { ...(base.backups || {}), mechanics: { ...(base.backups?.mechanics || {}), bondCopyLayers: true } } }
    : base;
  setGameData(patched);
  try { return fn(patched); } finally { setGameData(base); }
}

/** 部署/再部署 `deploys` 次，返回每次之后的 [突袭层数, 卡西米尔层数] 与 unitBonds。 */
function deploys(chessId, items, n = 4) {
  const h = makeBattle({ units: [{ chessId, row: 10, col: 4, items }], bonds: structuredClone(BONDS), autoFinish: false, timeLimit: 120 });
  h.step(1);
  const u = h.b.allyUnits.find((x) => x.kind === 'op' && x.defId === chessId);
  assert.ok(u, `${chessId} deployed`);
  const snap = () => [bondLayers(h.b, 'p1', 'raidShip'), bondLayers(h.b, 'p1', 'kazimierzShip')];
  const steps = [snap()];
  for (let i = 1; i < n; i++) {
    h.b.retreat(u, { reason: 'retreat' });
    assert.equal(h.b.redeploy(u, { free: true }), true, 'redeployed');
    h.step(1);
    steps.push(snap());
  }
  checkInvariants(h.b);
  return { bonds: [...unitBonds(u)], steps, unit: u, battle: h.b };
}

// -------------------------------------------------------------------------------------------------------------------
// 接缝读数本身（非法 / 缺省一律回上游）

test('接缝 reader: 缺省 / 非法值一律 = 上游（bondCopyLayers:false），只认 `=== true`', () => {
  assert.deepEqual(readMechanics(null), MECHANICS_DEFAULTS);
  assert.deepEqual(readMechanics({}), MECHANICS_DEFAULTS);
  assert.deepEqual(readMechanics({ backups: {} }), MECHANICS_DEFAULTS);
  assert.deepEqual(readMechanics({ backups: { mechanics: null } }), MECHANICS_DEFAULTS);
  assert.deepEqual(readMechanics({ backups: { mechanics: 5 } }), MECHANICS_DEFAULTS);
  assert.deepEqual(readMechanics({ backups: { mechanics: [] } }), MECHANICS_DEFAULTS);
  assert.equal(readMechanics({ backups: { mechanics: { bondCopyLayers: 'true' } } }).bondCopyLayers, false, '字符串不算开');
  assert.equal(readMechanics({ backups: { mechanics: { bondCopyLayers: 1 } } }).bondCopyLayers, false, '数字不算开');
  assert.equal(readMechanics({ backups: { mechanics: { bondCopyLayers: true } } }).bondCopyLayers, true);
  // 官方数据里没有这一节
  assert.equal(readMechanics(gameData()).bondCopyLayers, false);
  assert.equal(readMechanics(gameData()).indomRaidSp, false);
});

// -------------------------------------------------------------------------------------------------------------------
// 接缝【关】= 上游

test('OFF: unitBonds 去重 —— 瑕光 + 变形同构体 + 突袭手雷 仍然只有一条突袭，且是 ONE member', () => {
  withSeam(false, () => {
    const h = makeBattle({
      units: [{ chessId: BLEMISHINE, row: 10, col: 4, items: [ISO, GRENADE] }],
      bonds: structuredClone(BONDS), autoFinish: false, timeLimit: 60,
    });
    h.step(1);
    const u = h.unit(BLEMISHINE);
    assert.deepEqual([...unitBonds(u)], ['kazimierzShip', 'raidShip'], '去重（上游）');
    assert.ok(isMember(h.b, u, 'raidShip'));
    assert.deepEqual(bondMembers(h.b, 'p1', 'raidShip').map((x) => x.defId), [BLEMISHINE], '成员按干员去重');
    checkInvariants(h.b);
  });
});

test('OFF: 场景② 瑕光（bond_self +4、上限 12 一份预算）⇒ 突袭 4/8/12/12', () => {
  withSeam(false, () => {
    const r = deploys(BLEMISHINE, [ISO, GRENADE], 4);
    assert.deepEqual(r.steps, [[4, 4], [8, 8], [12, 12], [12, 12]], '两条突袭共用一份 12 的预算（上游）');
    assert.equal(countOf(r.bonds, 'raidShip'), 1, '清单里只有一条突袭');
  });
});

test('OFF: 精锐瑕光（+8、上限 24 一份预算）⇒ 突袭 8/16/24/24', () => {
  withSeam(false, () => {
    const r = deploys(BLEMISHINE_B, [ISO, GRENADE], 4);
    assert.deepEqual(r.steps, [[8, 8], [16, 16], [24, 24], [24, 24]]);
  });
});

test('OFF: 负场景③ 史尔特尔（bond_by_id 突袭 +8、上限 50）⇒ 8/16/24/32', () => {
  withSeam(false, () => {
    const r = deploys(SURTR, [ISO, GRENADE], 4);
    assert.deepEqual([...r.bonds], ['raidShip', 'arcaneShip'], '清单去重');
    assert.deepEqual(r.steps.map((s) => s[0]), [8, 16, 24, 32]);
  });
});

test('OFF: gainLayers 的键是 `${capKey}|${bondId}`（两条突袭共用一份预算）', () => {
  withSeam(false, () => {
    const h = makeBattle({
      defs: { chess: {} },
      units: [{ chessId: YUEYUE, row: 10, col: 3 }],
      bonds: { preciShip: { count: 2, active: true, tier: 1, layers: 0 } },
      autoFinish: false, timeLimit: 60,
    });
    h.step(1);
    const a = gainLayers(h.b, { playerId: 'p1', bonds: ['preciShip', 'preciShip'], n: 4, cap: 12, capKey: 'g2' });
    const b = gainLayers(h.b, { playerId: 'p1', bonds: ['preciShip', 'preciShip'], n: 4, cap: 12, capKey: 'g2' });
    const c = gainLayers(h.b, { playerId: 'p1', bonds: ['preciShip', 'preciShip'], n: 4, cap: 12, capKey: 'g2' });
    assert.deepEqual([a, b, c], [8, 4, 0], '共用一份 12：8 → 4 → 0');
    assert.equal(layersUsed(h.b, 'g2', 'preciShip'), 12);
    checkInvariants(h.b);
  });
});

test('OFF: 场景① 空弦（SERVER_ADD_BOND_POSITION +3）只付一次 ⇒ 精准 +3，人数 2', () => {
  const r = archetCase(false);
  assert.deepEqual(r.bonds, ['preciShip'], 'server/match 清单去重');
  assert.deepEqual(r.simBonds, ['preciShip'], 'sim 准备期派发清单去重');
  assert.equal(r.gained, 3);
  assert.equal(r.count, 2);
});

// -------------------------------------------------------------------------------------------------------------------
// 接缝【开】= 修正后

test('ON: unitBonds 保留重复条目，而成员仍然只算一个干员', () => {
  withSeam(true, () => {
    const h = makeBattle({
      units: [{ chessId: BLEMISHINE, row: 10, col: 4, items: [ISO, GRENADE] }],
      bonds: structuredClone(BONDS), autoFinish: false, timeLimit: 60,
    });
    h.step(1);
    const u = h.unit(BLEMISHINE);
    const own = [...unitBonds(u)];
    assert.deepEqual(own.slice().sort(), ['kazimierzShip', 'raidShip', 'raidShip'], '两条突袭条目');
    assert.equal(countOf(own, 'raidShip'), 2);
    assert.deepEqual(bondMembers(h.b, 'p1', 'raidShip').map((x) => x.defId), [BLEMISHINE], '成员数仍按干员去重（1 名）');
    checkInvariants(h.b);
  });
});

test('ON: 场景② 瑕光 ⇒ 突袭 8/16/24/24（上限每份 12，合计 24；卡西米尔仍 12）', () => {
  withSeam(true, () => {
    const r = deploys(BLEMISHINE, [ISO, GRENADE], 4);
    assert.deepEqual(r.steps, [[8, 4], [16, 8], [24, 12], [24, 12]]);
    assert.equal(countOf(r.bonds, 'raidShip'), 2, '两条突袭各付 +4');
  });
});

test('ON: 精锐瑕光 ⇒ 突袭 16/32/48/48（上限每份 24，合计 48）', () => {
  withSeam(true, () => {
    const r = deploys(BLEMISHINE_B, [ISO, GRENADE], 4);
    assert.deepEqual(r.steps, [[16, 8], [32, 16], [48, 24], [48, 24]]);
  });
});

test('ON: 负场景③ 史尔特尔仍然只 +8/次（点名盟约的来源不读所属清单）', () => {
  withSeam(true, () => {
    const r = deploys(SURTR, [ISO, GRENADE], 4);
    assert.deepEqual([...r.bonds].sort(), ['arcaneShip', 'raidShip', 'raidShip'], '清单里确实多了一条');
    assert.deepEqual(r.steps.map((s) => s[0]), [8, 16, 24, 32], '但输出逐值不变');
    assert.equal(r.steps[0][0], 8, '不是 16');
  });
});

test('ON: 等价性 锏（转职给她一个本来没有的盟约）—— 卡西米尔逐值不变，只多一条突袭', () => {
  withSeam(true, () => {
    const withIso = deploys(JIAN, [ISO, GRENADE], 4);
    withSeam(false, () => {
      const alone = deploys(JIAN, [GRENADE], 4);
      assert.deepEqual(withIso.steps.map((s) => s[1]), alone.steps.map((s) => s[1]), '卡西米尔相同');
      assert.deepEqual(alone.steps.map((s) => s[1]), [8, 16, 24, 24], '锏 garrison_155_a：+8/份、上限 24');
    });
    assert.deepEqual(withIso.bonds.slice().sort(), ['kazimierzShip', 'kjeragShip', 'raidShip', 'swiftShip']);
  });
});

test('ON: gainLayers 每份各自记预算；单份清单逐值等于旧键', () => {
  withSeam(true, () => {
    const h = makeBattle({
      defs: { chess: {} },
      units: [{ chessId: YUEYUE, row: 10, col: 3 }],
      bonds: { preciShip: { count: 2, active: true, tier: 1, layers: 0 } },
      autoFinish: false, timeLimit: 60,
    });
    h.step(1);
    const g = [];
    for (let i = 0; i < 4; i++) g.push(gainLayers(h.b, { playerId: 'p1', bonds: ['preciShip', 'preciShip'], n: 4, cap: 12, capKey: 'g2' }));
    assert.deepEqual(g, [8, 8, 8, 0], '两份各自 12 ⇒ 三次到 24');
    assert.equal(layersUsed(h.b, 'g2', 'preciShip'), 24, '各份求和');
    assert.equal(gainLayers(h.b, { playerId: 'p1', bonds: ['preciShip'], n: 4, cap: 12, capKey: 'g3' }), 4);
    assert.equal(layersUsed(h.b, 'g3', 'preciShip'), 4, '单份 = 旧键行为');
    checkInvariants(h.b);
  });
});

test('ON: 场景① 空弦 ⇒ 精准 +6，而人数仍是 2（跃跃 + 深靛）', () => {
  const r = archetCase(true);
  assert.equal(r.gained, 6, '两条精准各 +3');
  assert.equal(r.count, 2, '重复条目不算第二个成员');
  assert.equal(r.layers, 6);
  assert.deepEqual(r.simBonds, ['preciShip', 'preciShip'], 'sim 准备期派发清单');
  assert.deepEqual(r.bonds, ['preciShip', 'preciShip'], 'server/match 清单（详情卡 / 成员表那份）也显示两份');
});

test('ON: 四处实现受同一个开关控制（战斗 / 准备期 / server/match / 客户端同源同义）', () => {
  // 客户端那一份（public/js/ui/gameLogic/bonds.js 的 pieceBondIds）在 test/ui/morph-bonds.test.js 里同一口径验证。
  withSeam(true, (data) => {
    const piece = { kind: 'chess', uid: 0, id: YUEYUE, items: [{ id: ISO }, { id: PRECI_ITEM }] };
    const ctx = { piece: () => piece, chessRecord: (id) => DATA.chess[id], gd: { item: (id) => DATA.items[id], bond: (id) => DATA.bonds[id] } };
    assert.deepEqual([...metaBonds(ctx, piece)], ['preciShip', 'preciShip'], 'sim 准备期');
    const h = makeBattle({ units: [{ chessId: YUEYUE, row: 10, col: 3, items: [ISO, PRECI_ITEM] }], bonds: { preciShip: { count: 2, active: true, tier: 1, layers: 0 } }, autoFinish: false, timeLimit: 60 });
    h.step(1);
    assert.deepEqual([...unitBonds(h.unit(YUEYUE))], ['preciShip', 'preciShip'], 'sim 战斗内');
    const gd = { chess: (id) => DATA.chess[id], item: (id) => DATA.items[id], bond: (id) => DATA.bonds[id], raw: data };
    assert.deepEqual(pieceBonds(gd, piece), ['preciShip', 'preciShip'], 'server/match');
    checkInvariants(h.b);
  });
});

// -------------------------------------------------------------------------------------------------------------------
// 场景① 的准备期真实派发

/** 找一对正交相邻的合法格子：t1 放 `aId`，t2 放 `bId`，返回 [t1, t2, dir]。 */
function adjacentPair(ps, aId, bId) {
  const map = ps.deployMap();
  const ca = placeClass(ps, DATA.chess[aId]);
  const cb = placeClass(ps, DATA.chess[bId]);
  for (let r = FIELD.r1; r >= FIELD.r0; r--) {
    for (let c = FIELD.c0; c <= FIELD.c1; c++) {
      if (!canPlace(map, ca, r, c)) continue;
      for (const d of ['UP', 'RIGHT', 'DOWN', 'LEFT']) {
        const [dr, dc] = rotateOffset(0, 1, d);
        const [r2, c2] = [r + dr, c + dc];
        if (r2 < FIELD.r0 || r2 > FIELD.r1 || c2 < FIELD.c0 || c2 > FIELD.c1) continue;
        if (canPlace(map, cb, r2, c2)) return [[r, c], [r2, c2], d];
      }
    }
  }
  return null;
}

/** 空弦 + 身前一格的跃跃（变形同构体 + 精准狙击镜）+ 深靛；进入 R2 休整期跑真派发。 */
function archetCase(iso) {
  return withSeam(iso, (data) => {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', humans: 1, seed: 41, fake: true, data }).start();
    h.toPrep(1);
    const m = h.m;
    const ps = h.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
    ps.funds = 50; ps.bandId = null; ps.layers = {}; ps.recompute();

    const pair = adjacentPair(ps, ARCHET, YUEYUE);
    assert.ok(pair, 'an adjacent pair for 空弦 / 跃跃');
    const [tA, tY, dir] = pair;
    const arch = give(m, ps, ARCHET, 'board', tA);
    if (dir !== 'RIGHT') assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: arch.uid, to: { area: 'board', row: tA[0], col: tA[1] }, dir }), { ok: true });
    const yue = give(m, ps, YUEYUE, 'hand');
    for (const id of [ISO, PRECI_ITEM]) {
      assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: giveItem(m, ps, id).uid, targetUid: yue.uid }), { ok: true });
    }
    assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: yue.uid, to: { area: 'board', row: tY[0], col: tY[1] } }), { ok: true });
    const sd = give(m, ps, SHENDIAN, 'hand');
    const tS = legalTileFor(m, ps, SHENDIAN);
    assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: sd.uid, to: { area: 'board', row: tS[0], col: tS[1] } }), { ok: true });

    const bonds = pieceBonds(m.gd, yue);
    const ctx = { piece: () => yue, chessRecord: (id) => DATA.chess[id], gd: { item: (id) => DATA.items[id], bond: (id) => DATA.bonds[id] } };
    const simBonds = [...metaBonds(ctx, yue)];
    const before = ps.layers.preciShip ?? 0;
    h.toPrep(2); // 进入休整期 → SERVER_PREP_START (garrison_150_a, 空弦 on the board)
    const after = ps.layers.preciShip ?? 0;
    h.invariants();
    return { gained: after - before, count: ps.bonds.preciShip?.count ?? 0, layers: after, bonds: [...bonds], simBonds };
  });
}
