// 49-verify-3-diy.test.js —— 工序 49 ③：自选编队页的两处说明（栏标题右侧的常态小圈 / 行标题右侧的失效警告）。
//
// 口径（服主）：① 「III阶」栏标题**右侧**一个带圈感叹号，常态说明这条自选限制；它的**出现与否**由
//                `diy.slots[].voidedByTiers` 决定，**说什么 / 长什么样**由同一槽位的 `voidedNote` 决定
//                （v1.3.1 工序 113：文案与皮肤改由数据说，基座不再硬编码那句中文）；② 触发自选限制后的警告
//                **也在行标题右侧**，不在选择框里；两处不堆同一条信息。
//
// ★ 数据用**合并后的**那一份（基座 data/ + mods/ 里启用的补丁）：3 阶那个自选位与它的 `voidedByTiers:[5,6]`
//   都是 cyanfish.diy-34 加进来的，只读基座 data/ 看到的是"官方页面"（4 个 5/6 阶位、没有任何小圈）。
//   页面自己是通过 `/data/*.json` 拿数据的 ⇒ 这里把 fetch 指向合并结果，走的就是真机同一条路。
//   ★ v1.3.1 起还要**单独**跑一遍「不装 Mod」的分支：那一条用基座 data/ 现造一个只读数据源
//   （见下面的 withDataSource），证明 `voidedNote` 缺席时小圈与加这条缝之前**逐属性相同**。
//
// 本文件钉死六条不可回退的约定：
//   1. 小圈在 `h3.own-tier__head` 内、且是**最后一个**子元素（列标题右侧）；
//   2. 小圈只在**数据的 `voidedByTiers` 非空**的阶出现；
//   3. 失效警告在**卡片的 `diy-slot__head` 里**（行标题右侧），卡片正文与选人器里都没有它；
//   4. 文案与 data-tip / aria-label 一致（规范 §4.12.2）；★ 工序 52：**不许**再有原生 `title`（会与自有气泡重合）；
//   5. 触发不了的时候不画（官方形状 / 没填 5/6 阶）；
//   6. ★ 工序 113：`voidedNote` 缺席 ⇒ 小圈只有原来那 6 个属性（无 `data-sp-diy-note`、`style` 就是原字符串），
//      文案回落到基座那句 `选择 {tiers} 阶干员后，本项不生效` ⇒ 「不装 Mod 零影响」是断言而不是承诺。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUIET = { warn() {}, error() {}, info() {}, debug() {} };
const APP_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const BASE = {};
for (const name of ['chess', 'bonds', 'assets', 'garrisons', 'items', 'backups']) {
  BASE[name] = JSON.parse(readFileSync(path.join(ROOT, 'data', `${name}.json`), 'utf8'));
}
const { resolveMods } = await import('../../server/mods/loader.js');
const MERGED = resolveMods(BASE, path.join(ROOT, 'mods'), { log: QUIET, appVersion: APP_VERSION }).data;

globalThis.fetch = async (url) => {
  const name = String(url).split('?')[0].split('/').pop().replace(/\.json$/, '');
  const body = MERGED[name] !== undefined ? MERGED[name] : BASE[name];
  if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
};

const { DiyPanelView, DiyPickerView, voidedNoteOf } = await import('../../public/js/screens/diy.js');
const { data } = await import('../../public/js/data.js');
const { diySlotList } = await import('../../public/js/ui/diyModel.js');
await data.loadAll('chess', 'bonds', 'assets', 'garrisons', 'items', 'backups');

const D = { chess: MERGED.chess, backups: MERGED.backups };
const T3 = 'chess_char_3_diy1_a';
const T5A = 'chess_char_5_diy1_a';
const T6A = 'chess_char_6_diy1_a';
const SIEGE = 'char_112_siege';
const PICK3 = { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_002_siege' };

/**
 * ★ 工序 113：`voidedNote` 是可选第三层，它的语义由**纯函数** `voidedNoteOf(data, slotId)` 决定。
 * 这些用例直接喂它一份 **data**（`{chess, backups}`），**不去 patch 页面读的那份数据单例** ——
 * 踩过的坑：patch 单例（`data.get = ...`）确实能让屏幕读到"不装 Mod 的数据"，但那份 patch 会漏给
 * **同进程里后面跑的其它测试文件**（工序 113 的真机实测：diy-ui.test.js 单独跑 20/20 全过，
 * 和本文件同一进程跑就 2 条假红）⇒ 判据改成「纯函数 + 屏幕」两层，谁也不碰全局。
 */
const withSlot = (mutate, slotId = T3) => {
  const data2 = { chess: D.chess, backups: JSON.parse(JSON.stringify(D.backups)) };
  mutate(data2.backups.diy.slots[slotId]);
  return data2;
};
/** 逐属性取出屏幕真正渲染的那一层（`expand()` 已把函数型 vnode 展开成它画出来的那一层）。 */
const noteOf = (tree) => [...walk(tree)].find((v) => hasClass(v, 'diy-tier-note'));
/**
 * 小圈那 6 个属性的规范形状。
 * ★ 去掉值为 `undefined` 的键：Preact 把「没给」的条件属性留成 `key: undefined`，渲染时**不落 DOM**
 *   ⇒ 判"逐属性相同"时要看的是**真实落进 DOM 的那一组**，否则 `data-sp-diy-note=${cond ? '' : undefined}`
 *   这条中性挂点会被误判成"多了一个属性"。
 */
const noteProps = (note) => Object.fromEntries(Object.entries(note.props).filter(([, v]) => v !== undefined));

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
function expand(v, depth = 8) {
  if (Array.isArray(v)) return v.map((x) => expand(x, depth));
  if (!v || typeof v !== 'object') return v;
  if (typeof v.type === 'function' && depth > 0) {
    try { return expand(v.type(v.props || {}), depth - 1); } catch { return v; }
  }
  const children = v.props?.children;
  return children === undefined ? v : { ...v, props: { ...v.props, children: expand(children, depth) } };
}
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
  .filter((x) => typeof x === 'string' || typeof x === 'number').join('');

/** 合并后真数据下的自选编队（3 阶 1 + 5 阶 2 + 6 阶 2）。 */
const SLOTS = diySlotList(D);
const drawPanel = (picks, voided) => expand(DiyPanelView({
  m: data.get('assets'), picks, legal: picks, voided, kitted: Object.keys(MERGED.backups.units), onSet() {}, picking: null, onPicking() {},
}));
const headOfTier = (tree, roman) => [...walk(tree)].find((v) => hasClass(v, 'own-tier__head') && textOf(v).includes(roman));

describe('③ 自选编队页：常态说明在栏标题右侧 / 失效警告在行标题右侧', () => {
  test('前提：合并后的数据里 3 阶位存在，且它声明了 voidedByTiers [5, 6]', () => {
    assert.deepEqual(SLOTS.map((s) => [s.slotId, s.tier]), [[T3, 3], [T5A, 5], ['chess_char_5_diy2_a', 5], [T6A, 6], ['chess_char_6_diy2_a', 6]]);
    assert.deepEqual(MERGED.backups.diy.slots[T3].voidedByTiers, [5, 6]);
  });

  test('「III阶」栏标题：带圈感叹号是 own-tier__head 的最后一个子元素', () => {
    const tree = drawPanel({}, []);
    const head = headOfTier(tree, 'III');
    assert.ok(head, 'III 阶的栏标题存在');
    // 展平之后（函数型 vnode 已被展开成它画出来的那一层）：最后一个非空子节点就是小圈
    const kids = (head.props.children || []).filter((c) => c != null);
    const last = kids[kids.length - 1];
    const note = [...walk(last)].find((v) => hasClass(v, 'diy-tier-note'));
    assert.ok(note, '常态小圈是栏标题的最后一个子元素（列标题右侧）');
    assert.equal(kids.length, 4, 'TierChip + III + 阶 + 小圈');
  });

  test('小圈文案/属性：装了这个 Mod ⇒ 数据给的文案 + data-sp-diy-note 挂点 + 数据给的皮肤', () => {
    const note = noteOf(drawPanel({}, []));
    const want = '以失去所有高阶自选为束缚\n换取一个III阶自选位';
    const cfg = D.backups.diy.slots[T3].voidedNote;
    assert.equal(cfg.enabled, true, '前提：本 Mod 在数据里显式打开了这条提示');
    assert.equal(cfg.text, want, '前提：文案就是数据里那两句（其中的换行是数据里的 \\n）');
    assert.equal(note.props['data-tip'], want);
    assert.equal(note.props['aria-label'], want);
    assert.equal(note.props.title, undefined,
      '★ 工序 52：不许有原生 title —— 它会与自有气泡（::after{content:attr(data-tip)}）同时弹出来，两套框重合');
    assert.equal(note.props.role, 'img');
    assert.equal(note.props.tabindex, '0', '触屏点一下也能看（规范 §4.12.2 的 tabindex=0）');
    assert.equal(String(note.props.children), '!', '带圈感叹号的可见字符是「!」');
    // ★ 中性挂点（Mod 的 client/** 靠它挂气泡材质与关键帧；基座自己不读它）
    assert.equal(note.props['data-sp-diy-note'], '', 'data-sp-diy-note 是空属性');
    // ★ 皮肤：数据里那几条声明原样出现在 style 的**末尾**（追加，不替换骨架）
    const style = String(note.props.style);
    assert.match(style, /^display:inline-flex;/, '骨架仍是基座那一串，开头不变');
    assert.ok(style.endsWith('border:1px solid rgba(255,0,36,.6);border-radius:2px;background:linear-gradient(180deg, rgba(231,49,24,.32), rgba(20,4,4,.85));box-shadow:inset 0 0 0 1px rgba(255,0,36,.22), 0 0 8px rgba(231,49,24,.3);color:#ffb9ae'),
      '数据里的 5 条声明按 JSON 顺序追加在骨架之后：' + style.slice(-170));
  });

  test('只有声明了 voidedByTiers 的阶才有小圈（5 / 6 阶的标题上没有）', () => {
    const tree = drawPanel({}, []);
    const notes = [...walk(tree)].filter((v) => hasClass(v, 'diy-tier-note'));
    assert.equal(notes.length, 1, '真数据里只有 3 阶位声明了 voidedByTiers: [5, 6]');
    assert.ok([...walk(headOfTier(tree, 'III'))].includes(notes[0]), '那一个是 III 阶的标题');
    assert.equal([...walk(headOfTier(tree, 'V'))].some((v) => hasClass(v, 'diy-tier-note')), false);
    assert.equal([...walk(headOfTier(tree, 'VI'))].some((v) => hasClass(v, 'diy-tier-note')), false);
  });

  test('失效警告在行标题右侧：3 阶卡片触发后，警告跟在行标题那一行、正文里没有', () => {
    const tree = drawPanel({ [T3]: PICK3, [T5A]: { charId: SIEGE } }, [T3]);
    const card = [...walk(tree)].find((v) => hasClass(v, 'diy-slot') && v.props['data-slot'] === T3);
    assert.ok(card, '3 阶卡片存在');
    const bad = [...walk(card)].find((v) => v.props?.['data-testid'] === 'diy-slot-voided');
    assert.ok(bad, '失效警告存在');
    assert.equal(bad.props['data-voided'], '1');
    assert.match(textOf(bad), /已选择 5 \/ 6 阶自选：本项无效，不会进入卡池/);
    // 位置：**行标题那一行**（`.diy-slot__head`）的最后一个子节点 = 行标题右侧
    const head = [...walk(card)].find((v) => hasClass(v, 'diy-slot__head'));
    assert.ok(head, '行标题存在');
    const headKids = (head.props.children || []).filter((c) => c != null);
    assert.equal(headKids[headKids.length - 1], bad, '警告是行标题那一行的最后一个子节点（行标题右侧）');
    assert.match(textOf(head), /3阶 自选/, '跟的就是行标题本身（「{tier}阶 自选」）');
    // 正文里没有重复：正文里的行标题之外（干员 / 技能 / 模组）没有这条文字
    const body = [...walk(card)].find((v) => hasClass(v, 'diy-slot__body'));
    assert.ok(body, '卡片正文存在');
    const bodyRest = textOf({ props: { children: (body.props.children || []).filter((c) => c !== head) } });
    assert.equal(/本项无效/.test(bodyRest), false, '正文（行标题之外）没有这条警告的文字');
    assert.match(bodyRest, /推进之王/, '正文照旧画选中的干员');
    // 没触发的槽位不该有它
    const card5 = [...walk(tree)].find((v) => hasClass(v, 'diy-slot') && v.props['data-slot'] === T5A);
    assert.equal([...walk(card5)].some((v) => v.props?.['data-testid'] === 'diy-slot-voided'), false);
  });

  test('选择框里不再重复这条警告（diy-pick 子树里没有它，也没有 diy-slot__bad）', () => {
    const tree = expand(DiyPickerView({ m: data.get('assets'), slot: SLOTS.find((s) => s.slotId === T3), picks: { [T3]: PICK3 }, kitted: [SIEGE], onDone() {}, onClose() {},
      filter: 'all', query: '', draft: { ...PICK3 }, onFilter() {}, onQuery() {}, onDraft() {} }));
    const pick = [...walk(tree)].find((v) => hasClass(v, 'diy-pick'));
    assert.ok(pick, '选人器画出来了');
    assert.equal([...walk(pick)].some((v) => v.props?.['data-testid'] === 'diy-slot-voided'), false);
    assert.equal([...walk(pick)].some((v) => hasClass(v, 'diy-slot__bad')), false);
    assert.equal(/本项无效/.test(textOf(pick)), false, '选择框里没有这条文字');
  });

  test('★ 空着的受限槽位也要有警告（工序 49 真机抓到的回归点：先选 5 / 6 阶、3 阶还空着）', () => {
    // 只填 5 阶、3 阶**空着**：voided 数组（shared/diy.js diyVoidedSlots）是空的 —— 页面必须自己补上
    const tree = drawPanel({ [T5A]: { charId: SIEGE } }, []);
    const card = [...walk(tree)].find((v) => hasClass(v, 'diy-slot') && v.props['data-slot'] === T3);
    assert.ok(card, '3 阶卡片存在');
    assert.ok(hasClass(card, 'is-empty'), '这一格是空的');
    const bad = [...walk(card)].find((v) => v.props?.['data-testid'] === 'diy-slot-voided');
    assert.ok(bad, '空着也警告');
    assert.match(textOf(bad), /已选择 5 \/ 6 阶自选：本项无效，不会进入卡池/);
    assert.ok(hasClass(card, 'is-bad'), '卡片自己也进 is-bad 状态');
    // 空卡片没有行标题 ⇒ 挂在「选择干员」那一行的右侧
    const head = [...walk(card)].find((v) => hasClass(v, 'diy-slot__head'));
    assert.ok(head, '空卡片也有一行标题（选择干员那一行）');
    assert.equal((head.props.children || []).filter((c) => c != null).at(-1), bad, '警告在那一行的最后一个子节点');
    // 且照旧可以点进去选（选择框里不重复这条话）
    assert.ok([...walk(card)].some((v) => hasClass(v, 'diy-slot__fill')), '填充按钮还在（照样能点）');
  });

  test('没触发就不画：填了 5 阶但 voided 为空 ⇒ 也必须有警告（同上一条的反面：不填 5/6 阶才没有）', () => {
    const tree = drawPanel({}, []);
    assert.equal([...walk(tree)].some((v) => v.props?.['data-testid'] === 'diy-slot-voided'), false, '一个 5/6 阶位都没填 ⇒ 没有警告');
    assert.equal([...walk(tree)].filter((v) => hasClass(v, 'diy-tier-note')).length, 1, '小圈是常态说明，一直在');
  });
});

/**
 * ★ 工序 113：`voidedNote`（小圈的文案 + 皮肤）是**可选**的第三层。
 * 这一段是「不装载该 Mod 时原游戏完全无影响」的**判据**，分两层：
 *   ① **纯函数层**（`voidedNoteOf`）：这条缝的语义 —— 缺键 / 开关不是 `true` / 文案不是非空字符串
 *      ⇒ 一律 `null`；`style` 只收 CSS 属性形状的键，坏的一个都不留。
 *   ② **屏幕层**：`null` 时小圈那 6 个属性**逐属性相同**（没有 `data-sp-diy-note`、`style` 没有追加段）。
 * ★ 为什么不去 patch 页面读的那份数据单例：试过（把 `data.get` 换成另一份数据源），能让屏幕读到"不装 Mod
 *   的数据"，但那份 patch 会漏给**同进程里后面跑的其它测试文件** —— 实测 `test/ui/diy-ui.test.js` 单独跑
 *   20/20 全过、与本文件同进程跑就 2 条假红。所以判据改成"纯函数 + 屏幕"两层，谁也不碰全局。
 */
describe('③-113 缝的回落：数据没给 voidedNote ⇒ 小圈逐属性等于加这条缝之前', () => {
  const mergeOf = () => ({ chess: D.chess, backups: JSON.parse(JSON.stringify(D.backups)) });
  const withoutNote = () => { const d = mergeOf(); for (const s of Object.values(d.backups.diy.slots)) delete s.voidedNote; return d; };
  const withNote = (voidedNote, slotId = T3) => { const d = mergeOf(); d.backups.diy.slots[slotId].voidedNote = voidedNote; return d; };
  const OK = { text: '以失去所有高阶自选为束缚\n换取一个III阶自选位', style: '' };

  test('★ 纯函数：数据没给这个键 ⇒ null（这就是"不装 Mod 完全无影响"的第一层保证）', () => {
    assert.equal(voidedNoteOf(withoutNote(), T3), null, '合并数据里删掉 voidedNote ⇒ null');
    assert.equal(voidedNoteOf({ chess: BASE.chess, backups: BASE.backups }, 'chess_char_5_diy1_a'), null,
      '真·官方数据（voidedNote 从来不存在）⇒ null');
    assert.equal(voidedNoteOf(null, T3), null, 'data = null 也不抛');
    assert.equal(voidedNoteOf({}, T3), null, 'data = {} 也不抛');
    assert.equal(voidedNoteOf(mergeOf(), 'not_a_slot'), null, '不是槽位 ⇒ null');
  });

  test('★ 纯函数：三条拒绝分支（缺开关 / 开关不是 true / 文案不是非空字符串）', () => {
    const cases = [
      ['键 = null', null],
      ['键 = []', []],
      ['键 = "x"', 'x'],
      ['键 = 7', 7],
      ['enabled 缺席', { text: 'x' }],
      ['enabled = "true"（字符串）', { enabled: 'true', text: 'x' }],
      ['enabled = 1', { enabled: 1, text: 'x' }],
      ['enabled = false', { enabled: false, text: 'x' }],
      ['text 缺席', { enabled: true }],
      ['text = ""', { enabled: true, text: '' }],
      ['text = "   "（只有空白）', { enabled: true, text: '   ' }],
      ['text = 123', { enabled: true, text: 123 }],
      ['text = null', { enabled: true, text: null }],
    ];
    for (const [label, v] of cases) assert.equal(voidedNoteOf(withNote(v), T3), null, label + ' ⇒ 必须整个不生效');
  });

  test('★ 纯函数：文案去掉首尾空白；skin 只收 CSS 属性形状的键（坏键一个都不留）', () => {
    assert.deepEqual(voidedNoteOf(withNote({ enabled: true, text: '  契约  ' }), T3), { text: '契约', style: '' });
    assert.deepEqual(voidedNoteOf(withNote({ enabled: true, text: '契约', style: { 'bad key': 'x', width: 0, color: '#0f0' } }), T3),
      { text: '契约', style: 'width:0;color:#0f0' }, '带空格的键被丢、数值型照收');
    assert.deepEqual(voidedNoteOf(withNote({ enabled: true, text: '契约', style: ['a'] }), T3), OK.style === '' ? { text: '契约', style: '' } : null, '数组不是声明表 ⇒ 皮肤为空');
  });

  test('★ 屏幕层：小圈渲染出来的属性 = 骨架 + 数据给的皮肤（逐条列出，防止悄悄多改了什么）', () => {
    const merged = noteOf(drawPanel({}, []));
    assert.ok(merged, '前提：本 Mod 的数据会让小圈出现');
    const p = noteProps(merged);
    // ★ 这一组的**规范形状**：骨架那一段是"老基座路径"就有的、逐字符写死；皮肤一律追加在它之后。
    const SKELETON = 'display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:max(.17rem,11px);height:max(.17rem,11px);border:1px solid var(--line-3);border-radius:50%;font-size:max(.11rem,8px);font-weight:700;line-height:1;color:var(--text-dim);cursor:help;position:relative';
    assert.equal(p.class, 'diy-tier-note');
    assert.equal(p.role, 'img');
    assert.equal(p.tabindex, '0', '触屏点一下也能看（§4.12.2）');
    assert.equal(p.children, '!', '可见字符是「!」');
    assert.equal(p.title, undefined, '★ 工序 52：不许有原生 title（会与自有气泡重合）');
    assert.equal(p['data-sp-diy-note'], '', '装了才有这个中性挂点（Mod 的 client/** 靠它）');
    assert.equal(String(p.style).startsWith(SKELETON), true, '★ 骨架逐字符不变（老基座路径渲染的就是它），皮肤只是追加');
    assert.equal(String(p.style), SKELETON + ';' + voidedNoteOf(withNote(D.backups.diy.slots[T3].voidedNote), T3).style,
      '★ 屏幕上的 style = 骨架 + 数据里那 5 条声明（不多不少）');
  });

  test('★ 屏幕层：装 Mod 那一支与老基座路径**只差**该差的（文案 + 挂点 + 追加皮肤）', () => {
    const p = noteProps(noteOf(drawPanel({}, [])));
    const base = voidedNoteOf(withoutNote(), T3);
    assert.equal(base, null, '老基座路径：这个读取器返回 null');
    // 老基座路径渲染出来的那 4 个属性（骨架 / 角色 / 焦点 / 可见字符）在装 Mod 时必须一个都不变
    assert.deepEqual([p.class, p.role, p.tabindex, p.children], ['diy-tier-note', 'img', '0', '!']);
    // 会变的三处，逐处点名：
    assert.equal(p['aria-label'], D.backups.diy.slots[T3].voidedNote.text, '① 文案来自数据');
    assert.equal(p['data-tip'], D.backups.diy.slots[T3].voidedNote.text, '① data-tip 与 aria-label 同源');
    assert.equal('data-sp-diy-note' in p, true, '② 多一个中性挂点');
    assert.equal(String(p.style).endsWith('color:#ffb9ae'), true, '③ style 末尾追加了皮肤');
  });

  test('★ 屏幕层：官方数据（真·不装 Mod）一个槽位都没有这两个键', () => {
    const official = { chess: BASE.chess, backups: BASE.backups };
    for (const id of Object.keys(BASE.backups.diy.slots)) {
      assert.equal(voidedNoteOf(official, id), null, id + '：官方数据没有 voidedNote');
      assert.deepEqual(BASE.backups.diy.slots[id].voidedByTiers, undefined, id + '：官方数据也没有 voidedByTiers');
    }
    // ⇒ 官方页面上 5/6 阶标题的最后一个子节点仍然是"阶"这个字，没有第 4 个孩子（见本文件第 1 个 describe 的断言）
  });
});
