// test/render/skinvoice-diy.test.js — 0.10.0「自选编队页**按槽位**的皮肤选择」的**逻辑层**回归
// （无浏览器、无 DOM：直接画 `client/diy.js` 的无 hooks 视图 `DiySlotSkinView`，与宿主
// `DiyPanelView` / `DiyPickerView` 同一个约定）。
//
// 覆盖服主需求里最容易被改坏的四条：
//   1. 控件**认槽位**：`data-slot` / `data-char` 来自宿主插槽 props（= 卡片上的那两个 data-*），
//      所以四个槽位各画各的，不会串到别人身上；
//   2. **只列该干员的时装** + 一个「官方默认」（列表来自 `table.operators[charId].skins`，
//      与顶栏那条是**同一张表**）；
//   3. 选中 ⇒ 调 `skins.choose(charId, skinId)`（写配置 + 套材质 + 触发重渲染的唯一入口）；
//      「官方默认」⇒ `choose(charId, null)`；
//   4. **两条降级**：槽位为空（没有 charId）⇒ 什么都不画（返回 null）；
//      该干员没有可选时装 ⇒ 一个**禁用态**控件（`disabled`、不写配置、不报错）。
//
// ★ 为什么断言这些 data-*：验收脚本（<开发期报告>/17-probe-diy-skin.mjs）就是靠它们
//   把「控件 ↔ 槽位 ↔ 干员」对上号的；它们同时也是"没有偷偷用别的真相来源"的证据。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DiySlotSkinView } from '../../mods/cyanfish.skinvoice/client/diy.js';
import { html } from '../../public/js/ui/components.js';

/** 最小数据表：A 有两套时装（其中一套是"当前选中"）/ B 有一套 / C 完全没有 skins 字段 / D 空数组。 */
const TABLE = {
  operators: {
    char_A: { skins: [{ id: 'A1', name: '时装甲' }, { id: 'A2', name: '时装乙' }] },
    char_B: { skins: [{ id: 'B1', name: '唯一一套' }] },
    char_C: { voices: [] },
    char_D: { skins: [] },
  },
};

/** 一套被测装置：假 hostApi（只用到 ui.html）+ 记录 choose 调用的假 skins + 可读的假 cfg。 */
function makeHarness({ skins: picked = {} } = {}) {
  const calls = [];
  const state = { skins: { ...picked } };
  const cfg = {
    get: () => state,
    set: (patch) => { Object.assign(state, patch); return state; },
    subscribe: () => () => {},
  };
  const skins = {
    choose: (charId, skinId) => { calls.push([charId, skinId]); if (skinId) state.skins[charId] = skinId; else delete state.skins[charId]; return Promise.resolve(null); },
  };
  return { api: { ui: { html } }, cfg, skins, table: TABLE, calls, state };
}

const vnodes = (v) => (v?.props?.children || []).flat().filter((c) => c && typeof c === 'object' && c.type);
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const findClass = (v, c) => [...walk(v)].find((n) => hasClass(n, c));
const findTag = (v, tag) => [...walk(v)].find((n) => n.type === tag);
/** `<select>` 的选项（htm 把 `${array.map(...)}` 嵌成数组，所以用 walk 展平后按 type 取）。 */
const optionsOf = (select) => [...walk(select)].filter((n) => n.type === 'option');
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
  .filter((x) => typeof x === 'string' || typeof x === 'number').join('');

describe('自选编队页的按槽位皮肤控件 (cyanfish.skinvoice/client/diy.js)', () => {
  test('认槽位：data-slot / data-char / data-tier 来自宿主插槽 props；选项 = 官方默认 + 该干员的时装', () => {
    const h = makeHarness();
    const view = DiySlotSkinView({ ...h, slotId: 'chess_char_5_diy1_a', charId: 'char_A', tier: 5, elite: { isGolden: true } });
    assert.equal(view.props['data-slot'], 'chess_char_5_diy1_a');
    assert.equal(view.props['data-char'], 'char_A');
    assert.equal(view.props['data-tier'], '5');
    assert.equal(view.props['data-sp-sv-skins'], 2);
    assert.equal(view.props['data-sp-sv-skin'], '');
    assert.equal(view.props['data-sp-sv-skin-name'], '官方默认');
    assert.equal(textOf(findClass(view, 'sp-sv__diyname')), '当前：官方默认');
    const select = findTag(view, 'select');
    assert.ok(select, '有一个原生 select（与顶栏那条同一种控件）');
    assert.equal(select.props.disabled, undefined);
    assert.deepEqual(optionsOf(select).map((o) => o.props.value), ['', 'A1', 'A2']);
    assert.deepEqual(optionsOf(select).map((o) => textOf(o)), ['官方默认', '时装甲', '时装乙']);
  });

  test('当前的选中的那一套会显示出来（「这套皮肤名」提示）+ 选中值就是它', () => {
    const h = makeHarness({ skins: { char_A: 'A2' } });
    const view = DiySlotSkinView({ ...h, slotId: 's', charId: 'char_A', tier: 6 });
    assert.equal(view.props['data-sp-sv-skin'], 'A2');
    assert.equal(view.props['data-sp-sv-skin-name'], '时装乙');
    assert.equal(textOf(findClass(view, 'sp-sv__diyname')), '当前：时装乙');
    assert.ok(hasClass(view, 'is-on'), '有选中时装时根节点带 is-on（用来把它标成"已改过"）');
    assert.equal(findTag(view, 'select').props.value, 'A2');
  });

  test('选择时装 ⇒ skins.choose(charId, skinId)；选「官方默认」⇒ skins.choose(charId, null)', async () => {
    const h = makeHarness();
    const view = DiySlotSkinView({ ...h, slotId: 's', charId: 'char_A', tier: 5 });
    findTag(view, 'select').props.onChange({ currentTarget: { value: 'A1' } });
    await Promise.resolve();
    assert.deepEqual(h.calls, [['char_A', 'A1']]);
    findTag(view, 'select').props.onChange({ currentTarget: { value: '' } });
    await Promise.resolve();
    assert.deepEqual(h.calls.at(-1), ['char_A', null], '官方默认 = 传 null（choose 会把这个键删掉）');
  });

  test('降级①：槽位为空（没有 charId）⇒ 什么都不画', () => {
    const h = makeHarness();
    assert.equal(DiySlotSkinView({ ...h, slotId: 's', charId: null, tier: 5 }), null);
    assert.equal(DiySlotSkinView({ ...h, slotId: 's', tier: 5 }), null);
  });

  test('降级②：没有可选时装（无 skins 字段 / 空数组）⇒ 禁用态，且绝不写配置', async () => {
    const h = makeHarness();
    for (const charId of ['char_C', 'char_D', 'char_unknown']) {
      const view = DiySlotSkinView({ ...h, slotId: 's', charId, tier: 5 });
      assert.ok(view, `${charId} 仍然画一个控件（灰掉，而不是整块消失）`);
      assert.equal(view.props['data-sp-sv-skins'], 0);
      assert.equal(view.props['data-sp-sv-skin-name'], '无时装');
      assert.equal(view.props['data-char'], charId);
      const select = findTag(view, 'select');
      assert.equal(select.props.disabled, true, '禁用态');
      assert.equal(textOf(findClass(view, 'sp-sv__diyname')), '无时装');
      assert.ok(hasClass(findClass(view, 'sp-sv__diysel'), 'is-off'));
    }
    assert.deepEqual(h.calls, [], '禁用态下一次 choose 都不会发生');
    assert.deepEqual(h.state.skins, {});
  });

  test('时装列表为空数组 / 缺 skins 字段时也不抛错（脏表容忍，与 packs/skins 同一态度）', () => {
    const h = makeHarness();
    const dirty = { operators: { char_X: null, char_Y: 'nope', char_Z: { skins: 'no' } } };
    for (const charId of Object.keys(dirty.operators)) {
      const view = DiySlotSkinView({ ...h, table: dirty, slotId: 's', charId, tier: 5 });
      assert.equal(view.props['data-sp-sv-skins'], 0);
    }
    assert.equal(DiySlotSkinView({ ...h, table: null, slotId: 's', charId: 'char_A', tier: 5 }).props['data-sp-sv-skins'], 0);
  });
});
