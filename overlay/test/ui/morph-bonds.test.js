// 变形同构体 on the client (player report after 0.1.0: "变形同构体配上对应装备能吃到盟约加成，但那个盟约的人口数量没有把
// 转职之后的干员算进去"). The server counts the wearer (bondsMeta.pieceBonds; test/match/morph-bonds.test.js), so the
// strip's "在场 n" was right — but the bond popup's member list (gameLogic bondMembers: "成员 x/y") and the wearer's own
// card (detailPanel BondChips) only read the chess records' bonds, so the converted operator was missing from both.
// Official rule: band 变形者集群 "与特定装备一同装备时装备者将视为特定盟约成员"; the item's talent (character_table
// trap_1073_acarm073) lists the 14 pairings "“维式重锤”系列装备→【维多利亚】盟约 …".

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bondMembers, grantedBonds, pieceBondIds, memberHeadCount } from '../../public/js/ui/gameLogic.js';
import { ownerBoard } from '../../public/js/ui/watchBonds.js';
import { pieceBonds } from '../../server/match/bondsMeta.js';
import { GameData } from '../../server/match/gamedata.js';
import { getData } from '../../server/data.js';
import { GEO } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const chess = load('chess.json');
const items = load('items.json');
const bonds = load('bonds.json');
const getChess = (id) => chess[id] || null;
const getItem = (id) => items[id] || null;

const ISO = 'chess_item_6_09_e_a'; // 变形同构体
const ISO_B = 'chess_item_6_09_e_b';
const HAMMER = 'chess_item_1_01_e_a'; // 维式重锤 → 维多利亚
const SHIELD = 'chess_item_1_02_e_a'; // 坚守盾牌 → 坚守
const WEARER = 'chess_char_1_01_a'; // 隐现 (拉特兰 / 迅捷), not 维多利亚
const VIC = Object.values(chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes('victoriaShip')).map((c) => c.chessId).sort();

let uid = 0;
const itemPiece = (id) => ({ uid: ++uid, id });
const piece = (id, its = [], extra = {}) => ({ uid: ++uid, kind: 'chess', id, golden: !!chess[id]?.isGolden, tier: chess[id]?.tier ?? 1, items: its.map(itemPiece), ...extra });
function privWith({ board = [], hand = [] } = {}) {
  const h = new Array(GEO.HAND_SIZE).fill(null);
  hand.forEach((p, i) => { h[i] = p; });
  return { board, hand: h, temp: new Array(GEO.TEMP_SIZE).fill(null) };
}

describe('变形同构体 — the client rule', () => {
  test('grantedBonds: the other item\'s giveBondId while a 变形同构体 is worn; nothing otherwise', () => {
    assert.deepEqual(grantedBonds([itemPiece(ISO), itemPiece(HAMMER)], getItem), ['victoriaShip']);
    assert.deepEqual(grantedBonds([HAMMER, ISO_B], getItem), ['victoriaShip'], 'item ids, the golden 变形同构体, any order');
    assert.deepEqual(grantedBonds([itemPiece(HAMMER)], getItem), [], 'the bond item alone grants nothing');
    assert.deepEqual(grantedBonds([itemPiece(ISO)], getItem), []);
    assert.deepEqual(grantedBonds([ISO, ISO_B], getItem), [], 'two 变形同构体: no partner bond');
    assert.deepEqual(grantedBonds(null, getItem), []);
    assert.deepEqual(pieceBondIds(chess[WEARER], [ISO, SHIELD], getItem), ['lateranoShip', 'swiftShip', 'steadShip']);
    assert.deepEqual(pieceBondIds(chess[WEARER], [], getItem), ['lateranoShip', 'swiftShip']);
  });

  test('the client rule equals the server\'s (bondsMeta.pieceBonds) for every bond item, normal and golden', () => {
    const gd = new GameData(getData({ log: { warn() {}, error() {}, info() {} } }), 'mode_multi_hard');
    const grants = Object.values(items).filter((r) => r.giveBondId);
    assert.equal(grants.length, 36, '18 bond items × normal / golden');
    for (const r of grants) {
      for (const iso of [ISO, ISO_B]) {
        const p = { id: WEARER, items: [{ id: r.id }, { id: iso }] };
        assert.deepEqual(pieceBondIds(chess[WEARER], p.items, getItem), pieceBonds(gd, p), `${r.id} + ${iso}`);
      }
    }
  });
});

describe('变形同构体 — the bond popup\'s member list', () => {
  test('the wearer on the board is an on-board member of the granted bond (成员 x/y agrees with 在场)', () => {
    const b = bonds.victoriaShip;
    const priv = privWith({ board: [{ ...piece(VIC[0]), row: 9, col: 3 }, { ...piece(VIC[1]), row: 9, col: 4 }, { ...piece(WEARER, [ISO, HAMMER]), row: 9, col: 5 }] });
    const rows = bondMembers(b, priv, [], getChess, getItem);
    const on = rows.filter((r) => r.onBoard).map((r) => r.id).sort();
    assert.deepEqual(on, [VIC[0], VIC[1], WEARER].sort(), 'three in play, like the server\'s count');
    const w = rows.find((r) => r.id === WEARER);
    assert.equal(w.granted, true, 'marked as converted');
    assert.equal(w.owned, true);
    assert.equal(w.name, chess[WEARER].name);
    assert.equal(rows.length, b.visibleMembers.length + 1, 'the converted operator joins the list');
    assert.equal(rows.filter((r) => r.granted).length, 1);
    assert.deepEqual(w.items, [ISO, HAMMER], 'the row carries the wearer\'s item ids (its card shows the pair)');
    assert.ok(rows.filter((r) => !r.granted).every((r) => !('items' in r)), 'plain members carry none');
    // not a member of an unrelated bond, and not with the bond item alone
    assert.equal(bondMembers(bonds.steadShip, priv, [], getChess, getItem).some((r) => r.id === WEARER), false);
    const plain = privWith({ board: [{ ...piece(WEARER, [HAMMER]), row: 9, col: 5 }] });
    assert.equal(bondMembers(b, plain, [], getChess, getItem).some((r) => r.id === WEARER), false);
  });

  test('a wearer on the bench is owned, not in play; copies of one operator are one member (distinct members)', () => {
    const b = bonds.victoriaShip;
    const bench = privWith({ hand: [piece(WEARER, [ISO, HAMMER])] });
    const w = bondMembers(b, bench, [], getChess, getItem).find((r) => r.id === WEARER);
    assert.ok(w && w.granted && w.owned && !w.onBoard, 'bench: owned only (BOARD bonds count the board)');
    const two = privWith({
      board: [{ ...piece(WEARER, [ISO, HAMMER]), row: 9, col: 5 }, { ...piece(chess[WEARER].goldenId, [ISO_B, HAMMER]), row: 9, col: 6 }],
      hand: [piece(WEARER, [ISO, HAMMER])],
    });
    const rows = bondMembers(b, two, [], getChess, getItem).filter((r) => r.id === WEARER);
    assert.equal(rows.length, 1, 'one entry per operator (normal and elite share it)');
    assert.equal(rows[0].onBoard, true);
  });

  test('a teammate\'s operators on the field (ownerBoard) carry their items, so their popup lists the wearer too', () => {
    const field = { units: [
      { kind: 'op', ownerId: 'p2', defId: WEARER, items: [ISO, HAMMER] },
      { kind: 'op', ownerId: 'p2', defId: VIC[0] },
      { kind: 'op', ownerId: 'p1', defId: VIC[1], items: [ISO, SHIELD] },
    ] };
    const board = ownerBoard(field, 'p2');
    const on = bondMembers(bonds.victoriaShip, board, [], getChess, getItem).filter((r) => r.onBoard).map((r) => r.id).sort();
    assert.deepEqual(on, [VIC[0], WEARER].sort());
  });
});

// ---- the components (htm vnodes walked like test/ui/watch-bonds.test.js) -------------------------------------------
// the browser data store reads the real data files from disk
// ★ `backupsOverride` 让用例把 `/data/backups.json` 换成装了 Mod 之后的那一份（接缝 `mechanics.bondCopyLayers`）。
let backupsOverride = null;
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    if (name === 'backups.json' && backupsOverride) return { ok: true, status: 200, json: async () => backupsOverride };
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
const { data } = await import('../../public/js/data.js');
await data.loadAll('bonds', 'chess', 'items', 'assets', 'garrisons');
const { BondPopup } = await import('../../public/js/ui/bondStrip.js');
const { BondChips, ChessDetail, resolveDetail } = await import('../../public/js/ui/detailPanel.js');

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const textOf = (v) => {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return textOf(v.props?.children);
};

describe('变形同构体 — what the popup and the card show', () => {
  test('the popup: 在场 3 and 成员 3/11 — the wearer lit, tagged 同构, titled 变形同构体', () => {
    const priv = privWith({ board: [{ ...piece(VIC[0]), row: 9, col: 3 }, { ...piece(VIC[1]), row: 9, col: 4 }, { ...piece(WEARER, [ISO, HAMMER]), row: 9, col: 5 }] });
    const entry = { bondId: 'victoriaShip', count: 3, active: true, tier: 1, layers: 0, thresholds: [3, 6], countsHand: false };
    const v = BondPopup({ bondId: 'victoriaShip', entry, priv, onClose() {} });
    const head = [...walk(v)].filter((x) => x.type === 'h4').map(textOf).find((t) => t.startsWith('成员'));
    assert.equal(head.replace(/\s+/g, ''), `成员3/${bonds.victoriaShip.visibleMembers.length + 1}`);
    assert.match(textOf([...walk(v)].find((x) => hasClass(x, 'bpop__facts'))), /在场\s*3/);
    const iso = [...walk(v)].filter((x) => hasClass(x, 'bpop__member') && hasClass(x, 'is-granted'));
    assert.equal(iso.length, 1);
    assert.ok(hasClass(iso[0], 'is-on'));
    assert.match(iso[0].props.title, /变形同构体/);
    assert.ok([...walk(iso[0])].some((x) => hasClass(x, 'bpop__iso') && textOf(x) === '同构'));
  });

  test('the card\'s bond chips: the granted bond with its count, dashed and tagged; resolveDetail hands a teammate unit\'s items on', () => {
    const ids = pieceBondIds(chess[WEARER], [ISO, HAMMER], getItem);
    const mine = [{ bondId: 'victoriaShip', count: 3, active: true, tier: 1, layers: 0, thresholds: [3, 6] }];
    const v = BondChips({ bondIds: ids, bonds: mine, granted: ['victoriaShip'], onBond() {} });
    const chips = [...walk(v)].filter((x) => hasClass(x, 'dbond'));
    assert.deepEqual(chips.map((x) => x.props['data-bond']), ['lateranoShip', 'swiftShip', 'victoriaShip']);
    const vic = chips[2];
    assert.ok(hasClass(vic, 'is-granted') && hasClass(vic, 'is-active'));
    assert.match(vic.props.title, /维多利亚（变形同构体）：在场 3\/6/);
    assert.ok(!hasClass(chips[0], 'is-granted'));
    const d = resolveDetail({ kind: 'unit', unit: { id: 7, side: 'ally', ownerId: 'p2', defId: WEARER, items: [ISO, HAMMER] } }, new Map());
    assert.deepEqual(d.unitItems, [ISO, HAMMER]);
    assert.equal(resolveDetail({ kind: 'unit', unit: { id: 8, side: 'ally', ownerId: 'p2', defId: WEARER } }, new Map()).unitItems, null);
  });

  test('a 同构 row opens the wearer\'s card with its items: the pair (read-only 装备) and the granted chip', () => {
    const priv = privWith({ board: [{ ...piece(VIC[0]), row: 9, col: 3 }, { ...piece(WEARER, [ISO, HAMMER]), row: 9, col: 5 }] });
    const entry = { bondId: 'victoriaShip', count: 2, active: false, tier: 0, layers: 0, thresholds: [3, 6], countsHand: false };
    const calls = [];
    const v = BondPopup({ bondId: 'victoriaShip', entry, priv, onClose() {}, onMember: (...a) => calls.push(a) });
    const rows = [...walk(v)].filter((x) => hasClass(x, 'bpop__member'));
    rows.find((x) => hasClass(x, 'is-granted')).props.onClick();
    rows.find((x) => !hasClass(x, 'is-granted') && hasClass(x, 'is-on')).props.onClick();
    assert.deepEqual(calls, [[WEARER, [ISO, HAMMER]], [VIC[0], null]]);
    // the screen turns the click into { kind: 'chess', id, owner, items } (screens/game.js) → resolveDetail
    const d = resolveDetail({ kind: 'chess', id: WEARER, owner: 'p1', items: [ISO, HAMMER] }, new Map());
    assert.deepEqual(d.unitItems, [ISO, HAMMER]);
    assert.equal('unitItems' in resolveDetail({ kind: 'chess', id: WEARER, owner: 'p1', items: null }, new Map()), false, 'a plain member card: no items');
    const mine = [{ bondId: 'victoriaShip', count: 2, active: false, tier: 0, layers: 0, thresholds: [3, 6] }];
    const blocks = ChessDetail({ chess: d.chess, piece: null, editable: false, bonds: mine, loadout: null, unitItems: d.unitItems });
    const chips = [...walk(blocks)].find((x) => x.type === BondChips);
    assert.ok(chips.props.bondIds.includes('victoriaShip') && chips.props.granted.includes('victoriaShip'), 'the granted chip');
    const vic = [...walk(BondChips(chips.props))].find((x) => hasClass(x, 'dbond') && x.props['data-bond'] === 'victoriaShip');
    assert.ok(vic && hasClass(vic, 'is-granted'));
    const equip = blocks.find((b) => b?.key === 'equip');
    assert.ok(equip, 'a read-only 装备 section without an own piece');
    assert.deepEqual([...walk(equip)].filter((x) => x.props?.itemId).map((x) => x.props.itemId), [ISO, HAMMER]);
    assert.ok(![...walk(equip)].some((x) => hasClass(x, 'dempty')), 'no "drag to equip" hint on a read-only list');
    // a plain record card (shop, a plain member) keeps no 装备 section and no granted chip
    const bare = ChessDetail({ chess: d.chess, piece: null, editable: false, bonds: mine, loadout: null });
    assert.equal(bare.some((b) => b?.key === 'equip'), false);
    assert.deepEqual([...walk(bare)].find((x) => x.type === BondChips).props.granted, []);
  });
});

// ---- 接缝 `mechanics.bondCopyLayers`（客户端那一份读法） ----------------------------------------------------------
// 关（默认 = 上游，`/data/backups.json` 里没有 mechanics 一节）⇒ 去重，详情卡只显示一条；
// 开（Mod `cyanfish.fix-mechanism`）⇒ 保留两份，详情卡的 chips 真的画两个。
// 读法与 server/sim/mechanics.js 同源同义：值来自被补丁改写过的 /data/backups.json（两端同一份数据）。

describe('变形同构体 — 接缝 mechanics.bondCopyLayers（客户端）', () => {
  const YUEYUE = 'chess_char_1_09_a';       // 跃跃 本身 preciShip
  const PRECI_ITEM = 'chess_item_3_02_e_a'; // 精准狙击镜 → preciShip（授予她**已经有**的盟约）

  // ★ 一个用例做完三个口径（关 / 开 / 非法值）：`backupsOverride` 是模块级共享状态，
  //   拆成多个 async 用例会被 node:test 并发跑而互相踩（同一进程、同一份 data store）。
  test('关 = 上游（去重）、开 = 显示两份、非法值一律按上游', async () => {
    const raw = JSON.parse(readFileSync(path.join(ROOT, 'data', 'backups.json'), 'utf8'));
    const ids = () => pieceBondIds(chess[YUEYUE], [ISO, PRECI_ITEM], getItem);

    // ① 关：backups.json 未加载 / 没有 mechanics 一节 ⇒ 去重
    assert.equal(data.get('backups'), null, 'backups.json 尚未加载 ⇒ 接缝按上游');
    assert.deepEqual(ids(), ['preciShip'], '关：去重（上游）');
    assert.deepEqual(grantedBonds([itemPiece(ISO), itemPiece(PRECI_ITEM)], getItem), ['preciShip']);
    assert.deepEqual(grantedBonds(['iso', 'a1', 'a2'], (id) => (id === 'iso' ? { canGiveBond: true } : { giveBondId: 'preciShip' })), ['preciShip'], '关：授予清单去重');
    assert.equal([...walk(BondChips({ bondIds: ids(), bonds: [], onBond() {} }))].filter((x) => x.props?.['data-bond'] === 'preciShip').length, 1);

    // ② 开：Mod `cyanfish.fix-mechanism` 打过的 `/data/backups.json`
    backupsOverride = { ...raw, mechanics: { bondCopyLayers: true } };
    await data.load('backups');
    try {
      assert.deepEqual(ids(), ['preciShip', 'preciShip'], '开：清单两份（记录里的 preciShip + 授予的 preciShip）');
      // 授予清单本身只有一条（这一对里只有精准狙击镜给出 giveBondId ⇒ 重复来自「记录 + 授予」的合并）
      assert.deepEqual(grantedBonds([itemPiece(ISO), itemPiece(PRECI_ITEM)], getItem), ['preciShip']);
      // grantedBonds 自己的去重开关：两件装备给出同一个盟约 + 一个变形同构体 ⇒ 开时两条
      const stub = (id) => (id === 'iso' ? { canGiveBond: true } : { giveBondId: 'preciShip' });
      assert.deepEqual(grantedBonds(['iso', 'a1', 'a2'], stub), ['preciShip', 'preciShip'], '开：授予清单保留重复');
      // 没有重复时逐值不变（对照：授予一个她**没有**的盟约）
      assert.deepEqual(pieceBondIds(chess[WEARER], [ISO, SHIELD], getItem), ['lateranoShip', 'swiftShip', 'steadShip']);
      const v = BondChips({ bondIds: ids(), bonds: [{ bondId: 'preciShip', count: 2, active: true, tier: 1, layers: 0, thresholds: [2, 3] }], onBond() {} });
      assert.equal([...walk(v)].filter((x) => x.props?.['data-bond'] === 'preciShip').length, 2, '详情卡显示两份');
      // 盟约**人数**不受影响：成员行仍按干员去重
      const priv = privWith({ board: [piece(YUEYUE, [ISO, PRECI_ITEM]), piece('chess_char_1_17_a')] });
      const rows = bondMembers(bonds.preciShip, priv, [], getChess, getItem);
      assert.equal(rows.filter((r) => r.onBoard).length, 2, '两名干员 = 两行（重复条目不加行）');
      assert.equal(memberHeadCount(rows), 2);
    } finally {
      backupsOverride = null;
      await data.invalidate('backups');
    }
    assert.deepEqual(ids(), ['preciShip'], '撤回接缝后回到去重');

    // ③ 非法值：字符串 / 数字 / 空节都不算开
    for (const mechanics of [{ bondCopyLayers: 'true' }, { bondCopyLayers: 1 }, {}]) {
      backupsOverride = { ...raw, mechanics };
      await data.invalidate('backups');
      assert.deepEqual(ids(), ['preciShip'], `非法值按上游：${JSON.stringify(mechanics)}`);
    }
    backupsOverride = null;
    await data.invalidate('backups');
  });
});
