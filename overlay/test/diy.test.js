// test/diy.test.js — the 自选 rules of shared/diy.js over the real data (data/chess.json, data/backups.json; DATA.md §18):
// the legal picks per tier (diyPool, with and without the kit registry), one pick against a slot (checkDiyPick: the
// prototypes' locked skill / module, an owned operator's choice of skill and module at the slot's stage), the composed
// record (diyRecord: the slot's identity, no 特质, derived bonds, the operator's body at the slot form) and a whole roster
// (validateDiyPicks). Research 0.2.0 §2; the owner's decisions of 2026-10-05.
// Run: node --test test/diy.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diyPool, diySlot, diySlotIds, diyTiersOf, checkDiyPick, diyRecord, diyRecordOf, validateDiyPicks, lockedSelection, diyTokenOwner, isDiyModule, DIY_TIERS } from '../shared/diy.js';
import { unitForm, composeUnitRecord } from '../shared/standIn.js';
import { composeStats, composeTalents } from '../shared/loadoutRecord.js';
import { normalizeChess, resolveLoadout, loadoutRecord } from '../server/sim/simdata.js';
import { validateChessRecord } from '../server/mods/loader.js';
import { KITTED_CHARS, GENERIC_KIT_CHARS, STANDIN_KITS, OPERATOR_KITS } from '../server/sim/content/kits/index.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const chess = load('chess');
const backups = load('backups');
const DATA = { chess, backups };
/** 记录校验要用的整体数据（§4.9 那一组：引用完整性靠 bonds / garrisons / tokens，不能只有 chess+backups）。 */
const MERGED = { chess, backups, bonds: load('bonds'), garrisons: load('garrisons'), tokens: load('tokens') };
const { ownedPool, prototypes } = backups.diy;
const ELITES = ['char_608_acpion', 'char_609_acguad', 'char_610_acfend', 'char_611_acnipe', 'char_612_accast', 'char_613_acmedc', 'char_614_acsupo', 'char_615_acspec', 'char_617_sharp2'];
const RESERVES5 = ['char_601_cguard', 'char_602_cdfend', 'char_603_csnipe', 'char_604_ccast', 'char_605_cmedic', 'char_606_csuppo'];
const COLLAB = ['char_456_ash', 'char_1029_yato2', 'char_4123_ela', 'char_4141_marcil', 'char_4182_oblvns', 'char_4217_makoto'];
const SIEGE = 'char_112_siege';
const T5 = 'chess_char_5_diy1_a', T5B = 'chess_char_5_diy2_a', T6 = 'chess_char_6_diy1_a', T6B = 'chess_char_6_diy2_a';

test('slots: two per tier (5, 6), each with its elite twin', () => {
  assert.deepEqual(DIY_TIERS, [5, 6]);
  assert.deepEqual(diySlotIds(DATA), [T5, T5B, T6, T6B]);
  assert.deepEqual(diySlot('chess_char_6_diy2_b', DATA) && { ...diySlot('chess_char_6_diy2_b', DATA), normal: undefined, golden: undefined },
    { baseId: T6B, goldenId: 'chess_char_6_diy2_b', tier: 6, shopLevel: 6, elite: true, normal: undefined, golden: undefined });
  assert.deepEqual([T5, T5B, T6, T6B].map((id) => diySlot(id, DATA).shopLevel), [5, 5, 6, 6], 'shopLevelDisplayDataDict: the 调度中心 level that lists the slot');
  assert.equal(diySlot('chess_char_5_01_a', DATA), null, 'not a slot');
  assert.equal(diyTokenOwner(SIEGE, chess.chess_char_6_diy1_b.status), 'char_112_siege@2/60/7/3');
});

test('diyPool: tier 5 = 15 prototypes + 72 owned 6★, tier 6 = 9 + 72; no preset, no collab; with the kit registry only kitted operators', () => {
  const p5 = diyPool(5, { data: DATA }), p6 = diyPool(6, { data: DATA });
  assert.deepEqual(p5, [...RESERVES5, ...ELITES, ...ownedPool]);
  assert.deepEqual(p6, [...ELITES, ...ownedPool]);
  assert.deepEqual([p5.length, p6.length], [87, 81]);
  const roster = new Set(Object.values(chess).map((c) => c.charId).filter(Boolean));
  for (const id of p5) assert.ok(!roster.has(id) && !COLLAB.includes(id), id);
  assert.deepEqual(diyPool(4, { data: DATA }), [], 'no 自选 slot at tier 4');
  // the kit registry: the 预备干员 run the generic kit (exact for their skills), the nine elites their stand-in kits, the
  // owned 6★ only with an operator kit file (kits/index.js OPERATOR_KIT_FILES), in pool order
  assert.deepEqual(GENERIC_KIT_CHARS.filter((id) => prototypes['5'].includes(id)), RESERVES5);
  for (const id of ELITES) assert.equal(typeof STANDIN_KITS[id], 'function', `${id}: stand-in kit`);
  const ops = ownedPool.filter((id) => typeof OPERATOR_KITS[id] === 'function');
  assert.deepEqual([...ops].sort(), Object.keys(OPERATOR_KITS).sort(), 'every operator kit is an owned-6★ pick');
  assert.deepEqual(diyPool(5, { data: DATA, kitted: KITTED_CHARS }), [...RESERVES5, ...ELITES, ...ops]);
  assert.deepEqual(diyPool(6, { data: DATA, kitted: KITTED_CHARS }), [...ELITES, ...ops]);
  assert.deepEqual(diyPool(6, { data: DATA, kitted: (id) => id === SIEGE }), [SIEGE], 'a predicate works too');
  assert.deepEqual(diyPool(5, { data: DATA, kitted: [] }), [], 'nothing kitted, nothing offered');
});

test('checkDiyPick: a prototype carries its locked skill / module (与系统补位时一致) — omitted ⇒ filled in, another ⇒ refused', () => {
  for (const [slot, tier] of [[T5, 5], [T6, 6]]) {
    for (const id of prototypes[tier]) {
      const lk = lockedSelection(DATA, tier, id);
      assert.deepEqual(checkDiyPick(slot, { charId: id }, DATA), { ok: true, pick: { charId: id, ...lk } }, `${id}@${tier}`);
      assert.deepEqual(checkDiyPick(slot, { charId: id, skillIndex: lk.skillIndex, uniEquipId: lk.uniEquipId }, DATA).ok, true);
      const other = lk.skillIndex === 0 ? 1 : 0;
      if (unitForm(backups, id, chess[slot].status).skills.some((s) => s.index === other)) {
        assert.match(checkDiyPick(slot, { charId: id, skillIndex: other }, DATA).error, /prototype carries skill/, `${id}@${tier}: skill-locked`);
      }
    }
  }
  assert.deepEqual(lockedSelection(DATA, 5, 'char_609_acguad'), { skillIndex: 2, uniEquipId: 'uniequip_002_acguad' });
  assert.deepEqual(lockedSelection(DATA, 6, 'char_617_sharp2'), { skillIndex: 0, uniEquipId: 'uniequip_002_sharp2' });
  assert.deepEqual(lockedSelection(DATA, 5, 'char_605_cmedic'), { skillIndex: 2, uniEquipId: null });
  assert.match(checkDiyPick(T5, { charId: 'char_609_acguad', uniEquipId: 'none' }, DATA).error, /prototype carries module/);
  assert.match(checkDiyPick(T5, { charId: 'char_609_acguad', uniEquipId: 'uniequip_001_acguad' }, DATA).error, /prototype carries module/);
  assert.deepEqual(checkDiyPick(T5, { charId: 'char_609_acguad', skillIndex: null, uniEquipId: null }, DATA).pick, { charId: 'char_609_acguad', skillIndex: 2, uniEquipId: 'uniequip_002_acguad' }, 'null = the locked selection');
  assert.equal(lockedSelection(DATA, 5, SIEGE), null, 'an owned operator has no lock');
});

test('checkDiyPick: an owned 6★ chooses any of its 3 skills and any module of its elite form at the slot\'s stage (or none); illegal picks are refused', () => {
  for (const slot of [T5, T6]) {
    for (const s of [0, 1, 2]) {
      for (const m of [undefined, null, 'none', 'uniequip_002_siege', 'uniequip_003_siege']) {
        const c = checkDiyPick(slot, { charId: SIEGE, skillIndex: s, uniEquipId: m }, DATA);
        assert.deepEqual(c, { ok: true, pick: { charId: SIEGE, skillIndex: s, uniEquipId: m && m !== 'none' ? m : null } }, `${slot} S${s + 1} ${m}`);
      }
    }
  }
  const bad = [
    [T5, { charId: SIEGE }, /needs a skill index/],
    [T5, { charId: SIEGE, skillIndex: 3 }, /no skill 3/],
    [T5, { charId: SIEGE, skillIndex: 0, uniEquipId: 'uniequip_001_siege' }, /no module uniequip_001_siege/],
    [T5, { charId: SIEGE, skillIndex: 0, uniEquipId: 'uniequip_002_acguad' }, /no module/],
    [T6, { charId: 'char_601_cguard' }, /not a tier-6 自选 pick/],
    [T5, { charId: 'char_600_cpione' }, /not a tier-5/],
    [T5, { charId: 'char_607_cspec' }, /not a tier-5/],
    [T5, { charId: 'char_102_texas', skillIndex: 0 }, /not a tier-5/],
    [T6, { charId: 'char_1012_skadi2', skillIndex: 0 }, /not a tier-6/],
    [T5, { charId: 'char_456_ash', skillIndex: 0 }, /not a tier-5/],
    [T5, null, /bad pick/],
    [T5, { charId: 42 }, /bad pick/],
    ['chess_char_5_01_a', { charId: SIEGE, skillIndex: 0 }, /not a 自选 slot/],
  ];
  for (const [slot, pick, re] of bad) assert.match(checkDiyPick(slot, pick, DATA).error, re, JSON.stringify(pick));
});

test('validateDiyPicks: a roster never carries a module of another game mode — 集成战略 ISW-A / SO-A / SO-B, 生息演算 RA-A [ASSUMED, the owner\'s decision of 2026-10-05 for ISW-A]; the record still composes it', () => {
  const backups = DATA.backups;
  const refused = new Set();
  for (const charId of backups.diy.ownedPool) {
    for (const [slot, key] of [[T5, '2/60/7/1'], [T6, '2/60/7/3']]) {
      for (const mod of backups.units[charId].forms[key]?.modules ?? []) {
        const pick = { charId, skillIndex: 0, uniEquipId: mod.uniEquipId };
        assert.ok(checkDiyPick(slot, pick, DATA).ok, `${charId} ${mod.uniEquipId}: a legal record (the sim and the kits field it)`);
        const v = validateDiyPicks({ [slot]: pick }, { data: DATA });
        if (/^(ISW|SO|RA)-/.test(mod.typeName)) {
          assert.match(v.detail || '', /module of another game mode/, `${charId} ${mod.uniEquipId}`);
          assert.equal(isDiyModule(mod), false);
          refused.add(`${mod.typeName} ${mod.uniEquipId}`);
        } else assert.ok(v.ok, `${charId} ${mod.uniEquipId}: ${v.detail}`);
      }
    }
  }
  // 凯尔希, 傀影, 菲亚梅塔, 提丰, 艾丽妮, 霍尔海雅 (ISW-A); 电弧 SO-A / SO-B, 机械师 SO-A; 森蚺 RA-A
  assert.deepEqual([...refused].map((x) => x.split(' ')[0]).sort(), ['ISW-A', 'ISW-A', 'ISW-A', 'ISW-A', 'ISW-A', 'ISW-A', 'RA-A', 'SO-A', 'SO-A', 'SO-B']);
  // every refused module's own parts are tied to its mode: the text "在…中" of its trait / talents
  for (const charId of ['char_4195_radian', 'char_4230_mcnist', 'char_416_zumama']) {
    for (const mod of backups.units[charId].forms['2/60/7/3'].modules) {
      if (isDiyModule(mod)) continue;
      const text = JSON.stringify([mod.traitOverride ?? null, mod.talentChanges ?? []]);
      assert.match(text, /在(集成战略|【[^】]+】|生息演算)中/, `${charId} ${mod.uniEquipId}: a mode-only text`);
    }
  }
});

test('diyRecord: the slot\'s identity (tier, price, merge, status), no 特质, derived bonds, the operator\'s body at the slot form; module active on the elite only, stage 1 / 3', () => {
  const cases = [[T5, false, '2/1/4/0', 0], [T5, true, '2/60/7/1', 1], [T6, false, '2/1/4/0', 0], [T6, true, '2/60/7/3', 3]];
  for (const [slotId, elite, key, stage] of cases) {
    for (const mod of [null, 'uniequip_002_siege', 'uniequip_003_siege']) {
      const r = diyRecord(slotId, { charId: SIEGE, skillIndex: 1, uniEquipId: mod }, { elite, data: DATA });
      const slot = chess[elite ? backups.diy.slots[slotId].goldenId : slotId];
      const form = backups.units[SIEGE].forms[key];
      const label = `${slot.chessId} ${mod}`;
      assert.deepEqual([r.chessId, r.baseId, r.isGolden, r.tier, r.price, r.sellPrice, r.upgradeNum, r.chessType, r.isDiy], [slot.chessId, slotId, elite, slot.tier, 4, 1, elite ? 0 : 3, 'DIY', true], label);
      assert.deepEqual([r.charId, r.diyFor, r.name, r.profession, r.rarity], [SIEGE, slotId, '推进之王', 'PIONEER', 6], label);
      assert.deepEqual([r.garrisonIds, r.bonds, r.standInFor], [[], ['victoriaShip'], undefined], `${label}: no 特质, 维多利亚 from 维多利亚 / 格拉斯哥帮`);
      assert.deepEqual(r.status, slot.status, label);
      assert.deepEqual([r.skill.skillId, r.skill.level], ['skchr_siege_2', elite ? 7 : 4], `${label}: S2 at the slot's rank`);
      assert.deepEqual(r.skills.filter((s) => s.isDefault).map((s) => s.index), [1]);
      const m = mod && elite ? form.modules.find((x) => x.uniEquipId === mod) : null;
      assert.deepEqual(r.stats, composeStats(form.stats, m?.attr), `${label}: stats`);
      assert.deepEqual(r.talents, composeTalents(form.talents, m?.talentChanges), `${label}: talents`);
      assert.deepEqual(r.trait, m?.traitOverride ?? form.trait, `${label}: trait`);
      assert.equal(!!r.module?.active, !!m, `${label}: module active`);
      if (m) assert.equal(r.module.level, stage, `${label}: stage ${stage}`);
      if (elite) assert.deepEqual(r.modules.map((x) => [x.uniEquipId, x.level, x.isDefault]), form.modules.map((x) => [x.uniEquipId, stage, x.uniEquipId === mod]), label);
      assert.equal(r.assets.avatar, elite ? `${SIEGE}_2` : SIEGE, `${label}: E2 art on the elite`);
      // chess-shaped: the loadout machinery and the sim read it unchanged
      assert.equal(loadoutRecord(r, resolveLoadout(r, null)), r);
      const def = normalizeChess(r);
      assert.deepEqual([def.id, def.baseId, def.charId, def.diyFor, def.golden, def.tier, def.skill.id], [slot.chessId, slotId, SIEGE, slotId, elite, slot.tier, 'skchr_siege_2'], label);
    }
  }
  // a prototype's derived bond is 协防; 煌 gets 炎 + 维多利亚 (subPower only); the composed record equals composeUnitRecord's
  const sharp = diyRecord(T6, { charId: 'char_609_acguad' }, { elite: true, data: DATA });
  assert.deepEqual([sharp.bonds, sharp.skill.skillId, sharp.module.id, sharp.module.level, sharp.garrisonIds], [['emptyShip'], 'skchr_acguad_3', 'uniequip_002_acguad', 3, []]);
  assert.deepEqual(diyRecord(T5, { charId: 'char_017_huang', skillIndex: 0 }, { data: DATA }).bonds, ['yanShip', 'victoriaShip']);
  const slot = chess.chess_char_5_diy2_b;
  const { diyFor, ...rest } = diyRecordOf(slot, { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_003_siege' }, DATA);
  assert.equal(diyFor, T5B);
  assert.deepEqual(rest, composeUnitRecord(slot, backups.units[SIEGE], unitForm(backups, SIEGE, slot.status), { skillIndex: 2, moduleId: 'uniequip_003_siege', bonds: ['victoriaShip'] }));
  assert.equal(diyRecord(T6, { charId: 'char_601_cguard' }, { data: DATA }), null, 'illegal ⇒ null');
  assert.equal(diyRecordOf(chess.chess_char_5_01_a, { charId: SIEGE, skillIndex: 0 }, DATA), null, 'not a slot record');
});

test('validateDiyPicks: a prototype may fill a tier-5 and a tier-6 slot, an owned operator one slot, the picks of a tier differ; unkitted operators are refused', () => {
  const sharp = { charId: 'char_609_acguad' };
  const ok = validateDiyPicks({ [T5]: sharp, [T5B]: { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_002_siege' }, [T6]: sharp, [T6B]: null }, { data: DATA, kitted: [...KITTED_CHARS, SIEGE] });
  assert.deepEqual(ok, { ok: true, picks: {
    [T5]: { charId: 'char_609_acguad', skillIndex: 2, uniEquipId: 'uniequip_002_acguad' },
    [T5B]: { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_002_siege' },
    [T6]: { charId: 'char_609_acguad', skillIndex: 2, uniEquipId: 'uniequip_002_acguad' },
  } });
  assert.deepEqual(validateDiyPicks({}, { data: DATA }), { ok: true, picks: {} }, 'empty slots are fine');
  const err = (picks, opts = {}) => validateDiyPicks(picks, { data: DATA, ...opts });
  assert.match(err({ [T5]: sharp, [T5B]: sharp }).detail, /fills two tier-5 slots/);
  assert.match(err({ [T5]: { charId: SIEGE, skillIndex: 0 }, [T6]: { charId: SIEGE, skillIndex: 1 } }).detail, /an owned operator fills one slot/);
  assert.match(err({ [T5]: { charId: 'char_017_huang', skillIndex: 0 } }, { kitted: KITTED_CHARS.filter((id) => id !== 'char_017_huang') }).detail, /has no kit yet/);
  assert.match(err({ [T5]: sharp }, { kitted: (id) => id !== 'char_609_acguad' }).detail, /char_609_acguad has no kit yet/);
  assert.deepEqual(err({ [T5]: { charId: 'char_017_huang', skillIndex: 0 } }).ok, true, 'without the registry every legal pick passes');
  assert.match(err({ chess_char_5_01_a: sharp }).detail, /not a 自选 slot/);
  assert.match(err({ [T6]: { charId: 'char_602_cdfend' } }).detail, /not a tier-6/);
  assert.match(err({ [T5]: { charId: 'char_609_acguad', skillIndex: 0 } }).detail, /prototype carries skill 2/);
  assert.deepEqual(err('x'), { error: 'BAD_MSG', detail: 'bad 自选 picks' });
  assert.equal(err([sharp]).error, 'BAD_MSG');
});

// ---- 新增阶（Mod 通过 data/backups.json 的 diy.slots 加阶；docs/MODS.md §4.9）----------------------------------------
//
// 这一组钉死「阶数由数据决定」这条接缝的两端：**官方数据上的逐值等价**（不装 Mod 时不许有任何变化）与
// **加阶之后的行为**（闸门、页面分段顺序、候选池口径、记录校验）。造出来的迷你数据不依赖任何 Mod 目录。

/** 官方数据 + 一个 3 阶位与一个 4 阶位（与 mods/cyanfish.diy-34 同形：tier / shopLevel / requirement / status）。 */
const D34 = (() => {
  const c = (id, tier, identifier, golden) => ({
    ...(golden ? chess.chess_char_5_diy1_b : chess.chess_char_5_diy1_a),
    chessId: id, identifier, tier,
    baseId: golden ? id.replace(/_b$/, '_a') : id,
    goldenId: id.replace(/_a$/, '_b'),
    upgradeChessId: golden ? null : id.replace(/_a$/, '_b'),
    upgradeNum: golden ? 0 : 3,
    status: golden ? { phase: 2, level: 60, skillLevel: 7, equipLevel: 1 } : { phase: 2, level: 1, skillLevel: 4, equipLevel: 0 },
    price: 3,
  });
  const slot = (tier) => ({ tier, goldenId: `chess_char_${tier}_diy1_b`, shopLevel: tier, requirement: 'TIER_6' });
  return {
    // 普通干员、bonds、garrisons、tokens 都沿用同一批对象引用 ⇒ 记录校验能过、deepEqual 也不会因为副本而假红
    ...MERGED,
    chess: {
      ...chess,
      chess_char_3_diy1_a: c('chess_char_3_diy1_a', 3, 266, false), chess_char_3_diy1_b: c('chess_char_3_diy1_b', 3, 267, true),
      chess_char_4_diy1_a: c('chess_char_4_diy1_a', 4, 268, false), chess_char_4_diy1_b: c('chess_char_4_diy1_b', 4, 269, true),
    },
    // ★ 新键**追加在末尾**（L2 补丁的 add 就是这样落地的）—— 页面顺序仍然必须是 3/4/5/6
    backups: { ...backups, diy: { ...backups.diy, slots: { ...backups.diy.slots, chess_char_3_diy1_a: slot(3), chess_char_4_diy1_a: slot(4) } } },
  };
})();

test('新增阶：diyTiersOf 由数据决定（DIY_TIERS 仍是官方口径的 [5, 6]），diySlotIds 按 (tier, id) 升序 ⇒ 新键追加在末尾也不会乱序', () => {
    assert.deepEqual(DIY_TIERS, [5, 6], '★ 文档性常量：不许跟着数据走，也不许被当闸门用');
  assert.deepEqual(diyTiersOf(DATA), [5, 6], '官方数据 ⇒ 就是 DIY_TIERS');
  assert.deepEqual(diyTiersOf(D34), [3, 4, 5, 6], '装 Mod 后 ⇒ 数据里出现过的阶，升序去重');
  assert.deepEqual(diyTiersOf({ chess, backups: { ...backups, diy: { ...backups.diy, slots: {} } } }), [], '没有 slots ⇒ 空的');
  assert.deepEqual(diyTiersOf(null), []);
  // 顺序：官方数据是空操作（正是 diy-ui.test.js:84 钉死的那 4 个），加了阶之后 3/4 排到前面
  assert.deepEqual(diySlotIds(DATA), [T5, T5B, T6, T6B], '官方数据：与改动前的 Object.keys(diy.slots) 逐元素相同');
  assert.deepEqual(diySlotIds(D34), ['chess_char_3_diy1_a', 'chess_char_4_diy1_a', T5, T5B, T6, T6B], 'III → IV → V → VI');
});

test('新增阶：闸门从 DIY_TIERS 改成「该阶在 diy.slots 里存在」，新阶的候选池与 5 阶位同一个口径', () => {
  assert.deepEqual(diyPool(4, { data: DATA }), [], '官方数据：没有 4 阶位 ⇒ 空池');
  assert.deepEqual(diyPool(3, { data: DATA }), [], '官方数据：没有 3 阶位 ⇒ 空池');
  // ★ 同一个 ownedPool：新阶的「持有的 6★」那一半与 5 阶位逐个相同、顺序也相同（服主决定 1）
  const ownedOf = (tier) => diyPool(tier, { data: D34 }).filter((id) => ownedPool.includes(id));
  assert.deepEqual(ownedOf(3), ownedOf(5), '★ 3 阶位的 ownedPool 部分 == 5 阶位的（71 名）');
  assert.deepEqual(ownedOf(4), ownedOf(5), '★ 4 阶位的 ownedPool 部分 == 5 阶位的');
  // ★ 原型干员那一半按「该阶自己的 diy.prototypes[该阶]」：3 / 4 阶没有这张表 ⇒ 半个原型都没有（规则一个字没改）
  const protoOf = (tier) => diyPool(tier, { data: D34 }).filter((id) => !ownedPool.includes(id));
  assert.deepEqual(protoOf(3), [], '3 阶没有自己的 prototypes 表 ⇒ 没有原型干员可挑');
  assert.deepEqual(protoOf(4), [], '4 阶同上');
  assert.deepEqual(protoOf(5), [...RESERVES5, ...ELITES], '5 阶仍然是 15 个原型（口径没变）');
  assert.deepEqual(diyPool(3, { data: D34 }), ownedPool, '3 阶位的池 = ownedPool（数据顺序）');
  assert.deepEqual(diyPool(4, { data: D34 }), ownedPool, '4 阶位同上');
  assert.deepEqual(diyPool(7, { data: D34 }), [], '没有 7 阶位 ⇒ 仍然是空池');
  // 装了 kit 名单时也只留 kitted 的，与官方阶同一条路径
  assert.deepEqual(diyPool(3, { data: D34, kitted: [SIEGE] }), [SIEGE]);
  assert.deepEqual(diyPool(3, { data: D34, kitted: KITTED_CHARS }), diyPool(5, { data: D34, kitted: KITTED_CHARS }).filter((id) => ownedPool.includes(id)), '装了名单后同样只差原型那一段');
  // 一个新阶位的两个形态都能被 diySlot 认出来，且 shopLevel = 该阶
  const s3 = diySlot('chess_char_3_diy1_a', D34);
  assert.deepEqual([s3.baseId, s3.goldenId, s3.tier, s3.shopLevel, s3.elite], ['chess_char_3_diy1_a', 'chess_char_3_diy1_b', 3, 3, false]);
  const s4b = diySlot('chess_char_4_diy1_b', D34);
  assert.deepEqual([s4b.baseId, s4b.tier, s4b.shopLevel, s4b.elite], ['chess_char_4_diy1_a', 4, 4, true]);
  // 两种合法 pick 都能走通，并组合成合法 unit（tier / price / status 形态正确）
  const owned = checkDiyPick('chess_char_3_diy1_a', { charId: SIEGE, skillIndex: 0, uniEquipId: 'uniequip_002_siege' }, D34);
  assert.deepEqual(owned, { ok: true, pick: { charId: SIEGE, skillIndex: 0, uniEquipId: 'uniequip_002_siege' } });
  // 原型干员没变：该阶自己的 prototypes 表说了算 ⇒ 5 阶位照旧拿锁定技能/模组，3/4 阶位不收（虽然 5 阶位收）
  assert.deepEqual(checkDiyPick(T5, { charId: 'char_609_acguad' }, D34), { ok: true, pick: { charId: 'char_609_acguad', skillIndex: 2, uniEquipId: 'uniequip_002_acguad' } }, '5 阶位的原型干员：拿锁定技能/模组');
  assert.match(checkDiyPick('chess_char_3_diy1_a', { charId: 'char_609_acguad' }, D34).error, /is not a tier-3 自选 pick/, '3 阶没有自己的 prototypes 表 ⇒ 不收原型干员');
  assert.match(checkDiyPick('chess_char_4_diy1_a', { charId: 'char_601_cguard' }, D34).error, /is not a tier-4 自选 pick/, '4★ 预备干员同理');
  // 第二个合法 pick（另一名 owned 6★，换技能、不带模组）
  assert.deepEqual(checkDiyPick('chess_char_4_diy1_a', { charId: 'char_017_huang', skillIndex: 1 }, D34), { ok: true, pick: { charId: 'char_017_huang', skillIndex: 1, uniEquipId: null } });
  const rec = diyRecord('chess_char_3_diy1_a', { charId: SIEGE, skillIndex: 0, uniEquipId: null }, { data: D34 });
  assert.deepEqual([rec.charId, rec.diyFor, rec.tier, rec.price, rec.sellPrice, rec.isDiy, rec.status.equipLevel, rec.garrisonIds, rec.bonds],
    [SIEGE, 'chess_char_3_diy1_a', 3, 3, 1, true, 0, [], ['victoriaShip']]);
  assert.equal(diyRecord('chess_char_4_diy1_a', { charId: 'char_601_cguard' }, { data: D34 }), null, '4★ 预备干员仍然不是 4 阶位的合法 pick（口径不变）');
  // 整份 roster：3 阶位 + 4 阶位 + 5/6 阶位各自独立；一个 owned 干员仍然只能占一格；原型干员仍然可以跨 5/6 阶重复
  const roster = validateDiyPicks({
    chess_char_3_diy1_a: { charId: SIEGE, skillIndex: 0 }, chess_char_4_diy1_a: { charId: 'char_017_huang', skillIndex: 1 },
    [T5]: { charId: 'char_609_acguad' }, [T6]: { charId: 'char_609_acguad' },
  }, { data: D34 });
  assert.equal(roster.ok, true, JSON.stringify(roster));
  assert.deepEqual(Object.keys(roster.picks), ['chess_char_3_diy1_a', 'chess_char_4_diy1_a', T5, T6], '按 (tier, id) 升序，与页面分段同序');
  assert.match(validateDiyPicks({ chess_char_3_diy1_a: { charId: SIEGE, skillIndex: 0 }, [T5]: { charId: SIEGE, skillIndex: 1 } }, { data: D34 }).detail,
    /an owned operator fills one slot/, '跨阶仍然是「一个 owned 干员只占一格」');
});

test('新增阶：loader 的干员记录校验按 diy.slots 认自选位（官方 8 条自选位记录不再被判 error）', () => {
  const ok = (id, rec, merged) => {
    const v = validateChessRecord(id, rec, merged);
    assert.deepEqual(v.errors, [], `${id}: ${v.errors.join(' | ')}`);
    return v;
  };
  // 官方自己的 8 条：改动前每一条都是 3 errors（profession / stats / isDiy）—— 这正是「L2 补丁加不了自选位」的原因
  for (const id of Object.keys(chess).filter((x) => /^chess_char_[56]_diy\d_[ab]$/.test(x))) {
    const v = ok(id, chess[id], MERGED);
    assert.ok(v.warnings.some((w) => /visible=false/.test(w)), `${id}: 只剩「不进商店」这条提示`);
  }
  ok('chess_char_3_diy1_a', D34.chess.chess_char_3_diy1_a, D34);
  ok('chess_char_3_diy1_b', D34.chess.chess_char_3_diy1_b, D34);
  ok('chess_char_4_diy1_a', D34.chess.chess_char_4_diy1_a, D34);
  ok('chess_char_4_diy1_b', D34.chess.chess_char_4_diy1_b, D34);
  // 自选位少写 isDiy:true ⇒ error（diyRecordOf 的唯一守卫）；非自选位写 isDiy:true ⇒ 仍然 error
  const errs = (id, rec, merged) => validateChessRecord(id, rec, merged).errors.join(' | ');
  assert.match(errs('chess_char_3_diy1_a', { ...D34.chess.chess_char_3_diy1_a, isDiy: false }, D34), /必须写 "isDiy": true/);
  assert.match(errs('chess_char_3_diy1_b', { ...D34.chess.chess_char_3_diy1_b, isDiy: false }, D34), /必须写 "isDiy": true/);
  assert.match(errs('chess_char_5_diy1_a', { ...chess.chess_char_5_diy1_a, isDiy: false }, MERGED), /必须写 "isDiy": true/);
  // ★ 非自选位记录的口径逐字不变：三条检查一条不少
  const normal = chess.chess_char_1_01_a;
  assert.match(errs('chess_char_1_01_a', { ...normal, profession: null }, MERGED), /profession "null" 无效/);
  assert.match(errs('chess_char_1_01_a', { ...normal, stats: null }, MERGED), /缺少 stats 对象/);
  assert.match(errs('chess_char_1_01_a', { ...normal, isDiy: true }, MERGED), /isDiy=true 会被引擎排除出商店/);
  assert.deepEqual(validateChessRecord('chess_char_1_01_a', normal, MERGED).errors, [], '官方普通干员：0 error（不改口径的证明）');
  // 不装任何 Mod 时 merged.backups 缺失 / 没有 diy ⇒ 一律按非自选位判（旧的严格口径）
  assert.match(validateChessRecord('chess_char_5_diy1_a', chess.chess_char_5_diy1_a, { chess }).errors.join(' | '), /isDiy=true 会被引擎排除出商店/);
});
