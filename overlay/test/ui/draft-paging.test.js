// 机变卡组分页（public/js/ui/choiceOverlay.js）：官方一轮 6 张，正好铺满 3×2。一个「联机人数上限突破」之类的
// Mod 会把每轮发卡数按人数抬起来（`config.coop.draftCards`，见 server/match/coop.js / mods/cyanfish.max-seats），
// 7 张起就放不进一页了 —— 于是多出来的卡走分页，并且**只在 > 6 张时才出现分页条**（官方情形逐像素不变）。
//
// 这里跑的是纯函数视图 ChoiceView（不挂 DOM，同 test/ui/playtest6-ui.test.js）：一个 preact vnode 树，深度优先找节点。
// 重点验：
//   ① ≤6 张：没有分页条、没有 --paged、6 张全在一页（渲染与改动前一致）
//   ② >6 张：一页 SP_PER_PAGE 张、页数 = ⌈n/6⌉、页码越界被夹住、idx 仍是"整轮里的序号"（选取/确认都靠它）
//   ③ 分页条是三个真按钮（上一页 / 下一页 / 页点）且端点会 disabled
//   ④ 点分页条**不会**取消已选中的卡（.spov__pager 与 .spcard / .spov__confirm 同列在豁免名单里）
//
// ★ 2026-10-XX（服主实测 待修复②）：本文件原先只测了「渲染」，没有跨出客户端一步，于是漏掉了真正的线上 bug ——
//   分页渲染完全正确、idx 也确实是整轮序号，但 `shared/protocol.js` 的 C2S 校验把 `g.choice.idx` 写死成
//   `0..5`（`isInt(v, 0, 5)`），第 2 页的 idx 6+ 一发出就被 net.js 的 validateC2S 判成 `bad field idx`
//   ⇒ ERR.BAD_MSG（「无效的请求」）。AI 走服务端内部路径（spDraft.js scheduleSpBot → _applyCard）不过协议
//   校验，所以只有真人点不动。**下面第三段 describe 就是那条缺掉的协议回归**：客户端分页点出来的 idx
//   必须能过 validateC2S。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// the browser data store reads the real data files from disk
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { ChoiceView, spPages, SP_PER_PAGE, spTap, cardPickable } = await import('../../public/js/ui/choiceOverlay.js');
const { normalizeSp } = await import('../../public/js/ui/gameLogic.js');
const { data } = await import('../../public/js/data.js');
const { validateC2S, C2S } = await import('../../shared/protocol.js');
const { MAX_DRAFT_CARDS } = await import('../../shared/constants.js');

await data.loadAll('items', 'effects', 'choices', 'assets', 'chess', 'bonds');

/** Every vnode of a preact tree (htm output), depth first. */
function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const nodes = (v) => [...walk(v)];
const text = (v) => nodes(v).map((n) => n.props?.children).flat(Infinity).filter((x) => typeof x === 'string' || typeof x === 'number').join('');

const players = Array.from({ length: 6 }, (_, i) => ({ playerId: `p${i}`, seat: i, name: `P${i}` }));
/** A server-shaped draft of `n` distinct cards (`cardView` output: idx + kind + id + name + desc + tier). */
const draftSp = (n, { family = 'bounty', picks = {}, busyIdx = null } = {}) => normalizeSp({
  family,
  name: '悬赏决策',
  desc: '选定悬赏目标，获取额外奖励。',
  cards: Array.from({ length: n }, (_, idx) => ({ idx, kind: 'bounty', id: `effect_${idx}`, name: `悬赏 ${idx + 1}`, desc: '接下来两场作战：敌人强度提升。', tier: (idx % 6) + 1 })),
  order: players.map((p) => p.playerId),
  turn: 'p0',
  picks,
}, players);

const view = (sp, extra = {}) => ChoiceView({ pub: { players, deadline: 0 }, sp, myId: 'p0', solo: false, busyIdx: null, ...extra });
const spcardNodes = (v) => nodes(v).filter((n) => hasClass(n, 'spcard'));
const gridNode = (v) => nodes(v).find((n) => hasClass(n, 'spov__grid'));
const pagerNode = (v) => nodes(v).find((n) => hasClass(n, 'spov__pager'));

describe('一页 6 张：≤6 张的官方情形与改动前逐节点相同', () => {
  test('6 张：一个 .spov__grid、6 张卡、**没有**分页条、没有 --paged', () => {
    const v = view(draftSp(6));
    assert.equal(spcardNodes(v).length, 6);
    assert.equal(nodes(v).filter((n) => hasClass(n, 'spov__grid')).length, 1);
    assert.ok(!hasClass(gridNode(v), 'spov__grid--paged'), '6 张不加 --paged');
    assert.equal(nodes(v).filter((n) => hasClass(n, 'spov__pager')).length, 0, '没有分页条');
    assert.equal(nodes(v).filter((n) => hasClass(n, 'spov__pgdot')).length, 0, '没有页点');
  });

  test('3 张（solo / 小卡组）：仍是官方那条 --3 单行布局，没有分页条', () => {
    const v = view(draftSp(3));
    assert.equal(spcardNodes(v).length, 3);
    assert.ok(hasClass(gridNode(v), 'spov__grid--3'), '3 张走 --3 布局');
    assert.equal(pagerNode(v), undefined);
  });

  test('5 张：一张 3×2 网格、没有分页条（不足 6 也不分页）', () => {
    const v = view(draftSp(5));
    assert.equal(spcardNodes(v).length, 5);
    assert.ok(!hasClass(gridNode(v), 'spov__grid--paged'));
    assert.equal(pagerNode(v), undefined);
  });

  test('spPages(6).pages = 1 且 shown 就是全量（不多切一刀）', () => {
    const cards = draftSp(6).cards;
    const r = spPages(cards, 0);
    assert.equal(r.pages, 1);
    assert.equal(r.shown.length, 6);
    assert.equal(r.shown, cards, '一页时原样返回同一个数组（不复制、不切）');
  });
});

describe('>6 张：分页（4 个家族都用同一套，因为分页只看张数）', () => {
  for (const [n, pages] of [[7, 2], [8, 2], [12, 2], [13, 3], [14, 3]]) {
    test(`${n} 张 = ${pages} 页，页点也是 ${pages} 个`, () => {
      const v = view(draftSp(n));
      assert.ok(hasClass(gridNode(v), 'spov__grid--paged'), `${n} 张要加 --paged`);
      assert.equal(spcardNodes(v).length, SP_PER_PAGE, '第一页恰好 6 张');
      assert.ok(pagerNode(v), '有分页条');
      assert.equal(nodes(v).filter((x) => hasClass(x, 'spov__pgdot')).length, pages, `页点 ${pages} 个`);
    });
  }

  test('第一页是 idx 0..5，第二页是 idx 6.. 且张数正确', () => {
    const sp = draftSp(8);
    const p1 = view(sp);
    assert.deepEqual(spcardNodes(p1).map((c) => c.key), [0, 1, 2, 3, 4, 5], '第一页 idx 0..5');
    const p2 = view(sp, { page: 1 });
    assert.deepEqual(spcardNodes(p2).map((c) => c.key), [6, 7], '第二页 idx 6..7');
    // 分页不改变 idx 语义：卡还是那两张卡
    assert.deepEqual(spcardNodes(p2).map((c) => nodes(c).find((x) => hasClass(x, 'spcard__name'))?.props.children), ['悬赏 7', '悬赏 8']);
  });

  test('第三页（14 张 = 12 座）拿到 idx 12..13', () => {
    const p3 = view(draftSp(14), { page: 2 });
    assert.deepEqual(spcardNodes(p3).map((c) => c.key), [12, 13]);
  });

  test('页码越界会被夹住（page=9 ⇒ 显示最后一页，不出现空白页）', () => {
    const p = view(draftSp(8), { page: 9 });
    assert.deepEqual(spcardNodes(p).map((c) => c.key), [6, 7], '夹到第 2 页');
    const neg = view(draftSp(8), { page: -3 });
    assert.deepEqual(spcardNodes(neg).map((c) => c.key), [0, 1, 2, 3, 4, 5], '负页码夹到第 1 页');
  });

  test('分页条上的文字报出「第 X / Y 页 · 共 N 张」（玩家知道还有多少）', () => {
    const t = text(view(draftSp(8)));
    assert.match(t, /第 1 \/ 2 页/);
    assert.match(t, /共 8 张/);
    const t2 = text(view(draftSp(14), { page: 1 }));
    assert.match(t2, /第 2 \/ 3 页/);
    assert.match(t2, /共 14 张/);
  });

  test('上一页 / 下一页是真的按钮，且两端会 disabled', () => {
    const btns = (v) => nodes(v).filter((n) => hasClass(n, 'spov__pg'));
    const first = btns(view(draftSp(8), { page: 0 }));
    assert.equal(first.length, 2, '两个箭头按钮');
    assert.equal(first[0].props['aria-label'], '上一页');
    assert.equal(first[1].props['aria-label'], '下一页');
    assert.equal(first[0].props.disabled, true, '第一页的「上一页」禁用');
    assert.equal(first[1].props.disabled, false);
    const last = btns(view(draftSp(8), { page: 1 }));
    assert.equal(last[0].props.disabled, false);
    assert.equal(last[1].props.disabled, true, '最后一页的「下一页」禁用');
  });

  test('点箭头 / 页点会请求目标页（onPage）', () => {
    const asked = [];
    const v = view(draftSp(14), { page: 1, onPage: (p) => asked.push(p) });
    const btns = nodes(v).filter((n) => hasClass(n, 'spov__pg'));
    btns[0].props.onClick();   // 上一页
    btns[1].props.onClick();   // 下一页
    const dots = nodes(v).filter((n) => hasClass(n, 'spov__pgdot'));
    assert.equal(dots.length, 3);
    dots[2].props.onClick();   // 直接跳第 3 页
    assert.deepEqual(asked, [0, 2, 2]);
  });

  test('当前页点带 is-cur + aria-current="page"', () => {
    const dots = nodes(view(draftSp(14), { page: 1 })).filter((n) => hasClass(n, 'spov__pgdot'));
    assert.deepEqual(dots.map((d) => hasClass(d, 'is-cur')), [false, true, false]);
    assert.deepEqual(dots.map((d) => d.props['aria-current']), [undefined, 'page', undefined]);
  });
});

describe('选取语义：分页不影响两段式确认与「谁已经拿了」', () => {
  test('已被拿走的卡在第 2 页照样显示 taken 状态与头像', () => {
    const sp = normalizeSp({
      family: 'bounty', name: '悬赏决策', desc: '',
      cards: Array.from({ length: 8 }, (_, idx) => ({ idx, kind: 'bounty', id: `e${idx}`, name: `卡${idx}`, desc: '', tier: 1, takenBy: idx === 6 ? 'p1' : null })),
      order: players.map((p) => p.playerId), turn: 'p0', picks: {},
    }, players);
    const p2 = view(sp, { page: 1 });
    const cards = spcardNodes(p2);
    assert.deepEqual(cards.map((c) => cards.includes(c) && hasClass(c, 'is-taken')), [true, false]);
    assert.equal(cards[0].props.disabled, true, '被拿走的卡不可点');
    assert.ok(nodes(cards[0]).some((n) => hasClass(n, 'spcard__taker')), '第 2 页照样显示拿走者的头像');
    assert.equal(p2.props?.onTap, undefined);
  });

  test('点分页条不会取消已选中的卡（.spov__pager 在豁免名单里）', () => {
    let sel = null;
    const root = view(draftSp(8), { armed: 2, onDisarm: () => { sel = 'disarmed'; } });
    const dialog = nodes(root).find((n) => hasClass(n, 'spov'));
    assert.ok(typeof dialog.props.onPointerDown === 'function', '根节点挂了取消选中用的 onPointerDown');
    dialog.props.onPointerDown({ target: { closest: (s) => { sel = `selector:${s}`; return {}; } } });
    assert.match(sel, /\.spov__pager/, '分页条与 .spcard / .spov__confirm 一样被豁免');
  });

  test('点空白处仍然取消选中（豁免名单没有把整页都放过去）', () => {
    let disarmed = 0;
    const root = view(draftSp(8), { armed: 2, onDisarm: () => { disarmed++; } });
    const dialog = nodes(root).find((n) => hasClass(n, 'spov'));
    dialog.props.onPointerDown({ target: { closest: () => null } });
    assert.equal(disarmed, 1, '空白处 ⇒ 取消选中');
  });
});

// ---------------------------------------------------------------------------------------------------
// ★ 协议回归（服主实测 待修复②）：分页点出来的 idx 必须能过 C2S 校验
//
// 这是原先缺掉的一环：ChoiceView 的渲染全对，但「客户端发出的那条 g.choice」从没被 validateC2S 验过。
// 修复前 `shared/protocol.js` 的 `'g.choice'` 是 `idx: (v) => isInt(v, 0, 5)` ⇒ idx ≥ 6 一律 `bad field idx`。
// ---------------------------------------------------------------------------------------------------
describe('★ 待修复② / 协议：第 7+ 张卡发出去的 g.choice 必须过 validateC2S', () => {
  test('8 张草稿：每一张（含第 2 页的 idx 6 / 7）的 idx 都过校验', () => {
    const sp = draftSp(8);
    assert.deepEqual(sp.cards.map((c) => c.idx), [0, 1, 2, 3, 4, 5, 6, 7], 'idx 是整轮里的序号');
    for (const card of sp.cards) {
      assert.equal(validateC2S({ t: 'g.choice', idx: card.idx }), null,
        `idx ${card.idx} 必须能发出去（修复前 idx ≥ 6 ⇒ 'bad field idx' ⇒ ERR.BAD_MSG「无效的请求」）`);
    }
  });

  test('★ 最短复现路径：第 2 页点第 1 张（idx 6）⇒ spTap 给出 6 ⇒ g.choice 过校验', () => {
    const sp = draftSp(8);
    const p2 = spPages(sp.cards, 1);
    assert.deepEqual(p2.shown.map((c) => c.idx), [6, 7], '第 2 页就是 idx 6 / 7');
    const card = p2.shown[0];
    const o = { myId: 'p0', solo: false, busyIdx: null };
    // UI 上它确实可点（按钮没 disabled）—— 所以这不是「按钮点不动」，而是「点到了但请求被判无效」
    assert.equal(cardPickable(sp, card, o), true, '第 2 页的卡是可点的');
    const first = spTap(null, card.idx, cardPickable(sp, card, o));
    assert.deepEqual(first, { armed: 6, pick: null }, '第一次点：选中（idx 仍是整轮里的 6）');
    const second = spTap(first.armed, card.idx, cardPickable(sp, card, o));
    assert.deepEqual(second, { armed: null, pick: 6 }, '第二次点：确认，发出去的就是 6');
    assert.equal(validateC2S({ t: 'g.choice', idx: second.pick }), null, '★ 这条修复前必红');
  });

  test('每一页的每一张卡都能过校验（12 座 14 张 ⇒ 第 3 页的 idx 12 / 13 也在内）', () => {
    const sp = draftSp(14);
    const sent = [];
    for (let page = 0; page < spPages(sp.cards, 0).pages; page++) {
      for (const card of spPages(sp.cards, page).shown) {
        const pick = spTap(null, card.idx, cardPickable(sp, card, { myId: 'p0', solo: false })).armed;
        const done = spTap(pick, card.idx, cardPickable(sp, card, { myId: 'p0', solo: false })).pick;
        sent.push(done);
        assert.equal(validateC2S({ t: 'g.choice', idx: done }), null, `第 ${page + 1} 页：idx ${done}`);
      }
    }
    assert.deepEqual(sent, sp.cards.map((c) => c.idx), '14 张全都能发出去，一张不漏');
  });

  test('上界是 MAX_DRAFT_CARDS（结构上限）而不是官方可见的 6；越界/非整数仍然被拒', () => {
    assert.equal(MAX_DRAFT_CARDS, 24, 'shared/constants.js 的防呆上限（服务端也夹到这个值）');
    assert.equal(validateC2S({ t: 'g.choice', idx: 0 }), null);
    assert.equal(validateC2S({ t: 'g.choice', idx: MAX_DRAFT_CARDS - 1 }), null, '最大可发的卡号');
    assert.notEqual(validateC2S({ t: 'g.choice', idx: MAX_DRAFT_CARDS }), null, 'MAX_DRAFT_CARDS 本身越界');
    for (const bad of [-1, 1.5, '3', null, undefined]) {
      assert.notEqual(validateC2S({ t: 'g.choice', idx: bad }), null, `idx = ${String(bad)} 仍然被拒`);
    }
    assert.notEqual(validateC2S({ t: 'g.choice' }), null, '缺 idx 仍然被拒');
    assert.match(validateC2S({ t: 'g.choice', idx: -1 }) || '', /bad field idx/, 'detail 就是 net.js 回给客户端的那条');
    // ★ 0.2.2：这条消息多了可选字段 `choiceId`（前端按 id 选卡）⇒ `$optional` 现在是 `['choiceId']`。
    //   本项要钉的语义是「**idx 仍然必填**」（上界才是本接缝动的那一位），所以改成对 $optional 的成员判断。
    const optional = C2S['g.choice'].$optional || [];
    assert.ok(!optional.includes('idx'), 'idx 是必填（不在 $optional 里）');
    assert.deepEqual(optional, ['choiceId'], '0.2.2 起唯一可选的字段是 choiceId');
  });

  test('★ 不装 Mod 的对照：官方 6 张 = 一页、没有分页条，客户端只可能发出 idx 0..5', () => {
    const sp = draftSp(6);
    const r = spPages(sp.cards, 0);
    assert.equal(r.pages, 1, '★ 官方只有 1 页');
    assert.equal(r.shown, sp.cards, '一页时不切不动');
    const v = view(sp);
    assert.equal(pagerNode(v), undefined, '★ 官方情形没有分页条（逐节点与改动前相同）');
    assert.deepEqual(spcardNodes(v).map((c) => c.key), [0, 1, 2, 3, 4, 5]);
    for (const card of sp.cards) assert.equal(validateC2S({ t: 'g.choice', idx: card.idx }), null, `官方 idx ${card.idx}`);
    // 官方的 6 张里没有 idx 6 ⇒ 这条上界对官方局是**不可达**的（改了上界不改变官方行为）
    assert.equal(sp.cards.some((c) => c.idx >= 6), false);
  });
});

