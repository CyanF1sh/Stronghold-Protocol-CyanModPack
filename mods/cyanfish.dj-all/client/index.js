// mods/cyanfish.dj-all/client/index.js — 「全局整活（所有可见元素可配置旋转）」的浏览器侧（L4 界面 Mod）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → GET /mods → 逐个 import(<id>/client/index.js) → setup(hostApi) → 收下返回的 dispose
//
// ============================ ★★ 本版（0.2.0）做什么 ============================
//   ① **元素表 + 层级树**（`client/elements.js`）：16 层 / 149 个元素 / 46 个分组，id 稳定；
//   ② **引擎**（`client/engine.js`）：按配置把元素转起来 ——
//      · DOM 侧（`engine-dom.js`）：**只注入一个 `<style>`**，不给元素加 class、不写内联样式（零残留是结构保证的）；
//      · 画布侧（`engine-pixi.js`）：每帧改 PIXI 容器的 scale / rotation（`__SP_VIEW__.debug` 的只读抓手）；
//   ③ **控制页**（`client/section.js`）：注册进「模组设置」（`settingsRegistry()` → `__SP_MODSETTINGS__`），
//      顶部是选中元素的「关 / 全局 / 独立」三档 + 五个参数，下方是**按层级展开的元素目录**；
//   ④ 只读自省句柄 `__SP_DJALL__`（清单 / 树 / 探针 / 配置读写 / 引擎读数）。
//
// ★★ 默认**全关**：`nodes` 为空 ⇒ 每个元素都是「关」⇒ 一个像素都不动（服主口径）。
// ★★ 零痕迹：关掉 / 卸载 ⇒ 摘 `<style>`（DOM 侧一个字节没改过）+ 画布容器 transform 逐值还原。
//
// ★ 四条实现纪律（照抄 dj-models / cyanfish.chat 踩过的坑）：
//   1. **setup 立刻返回**：extensions.js 是 `for (…) await setup(…)` 顺序装载的，这里绝不能 await
//      任何跟对局有关的东西（等对局等十分钟，后面所有 Mod 都别想加载了）。
//   2. **返回值只能是同步的 dispose**（不是 Promise）。
//   3. **绝不抛**：所有路径 try/catch，失败只留一条 warn；拿不到抓手就静默降级。
//   4. **卸载要干净**：摘栏位 → 停引擎（还原容器 transform）→ 摘句柄 → 落盘。

import { createStore, PREF_KEY, PREF_V, MODES, DEFAULT_GLOBAL, RND_KEYS, applyRandom, cleanRnd,
  cleanFab, compile, modeOf, valuesOf } from './config.js';
import { ELEMENTS, LAYERS, ELEMENT_BY_ID, LAYER_BY_ID, ROTATABLE, TREE, TREE_BY_ID, treeSel, treeMembers,
  treeGroups, groupByLayer, normalizeEntry } from './elements.js';
import { createEngine, resolveGroups } from './engine.js';
import { DjAllSection } from './section.js';
import { settingsRegistry } from './registry.js';
import { installStyle } from './style.js';
import { createHighlighter } from './highlight.js';
import { createFab, assetUrl, FAB_ID } from './fab.js';

/** Mod id（与目录名逐字符相同）。 */
const MOD_ID = 'cyanfish.dj-all';
/** 本 Mod 版本（与 mod.json 同步）。★ 改版本时两处一起改。 */
const MOD_VERSION = '0.3.3';
/** 注册进「模组设置」的栏位 id。 */
const SECTION_KEY = 'djAll';
/** 栏位顺序：皮肤与语音 20 → 公告 60 → 本栏 75（控制页排在后面）。 */
const SECTION_ORDER = 75;
/** 栏位标题（≤ 6 全角字，规范 §4.12.9 ①）。 */
const SECTION_TITLE = 'DJ 整活';
/** dev / E2E 自省句柄。 */
const DEBUG_KEY = '__SP_DJALL__';
/** 战斗屏根（"局内"的判据）。 */
const MATCH_ROOT_SEL = '#app .screen.gm';

/** 已挂的实例（setup 是同步返回的，这些都在闭包里交出）。 */
let live = null;

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / data / log / mod …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  const log = api && api.log && typeof api.log.warn === 'function' ? api.log : console;
  try {
    teardown();                                    // 热重载：上一次的实例先收干净
    const store = createStore({ onError: (e) => log.warn?.('[' + MOD_ID + '] 参数写盘失败（忽略）', e) });
    const engine = createEngine({ getCfg: () => store.get(), tree: TREE, log });
    engine.attach();                               // 画布侧挂帧回调；DOM 侧等第一次 sync
    const offSub = store.subscribe(() => { try { engine.sync(); } catch { /* ignore */ } });
    try { installStyle(); } catch { /* ignore */ }
    const highlighter = createHighlighter({ log });
    const disposeSection = registerSection(api, store, engine, highlighter, log);
    // ★ ② 局内独立入口（图标键 + 半透明浮窗）：`fab.attach()` 只是建按钮/订阅，**不加载 vendor preact**
    //   （那要等玩家真的点开浮窗），所以 setup 仍然是同步、立刻返回的。
    const fab = createFab({ api, store, tree: TREE, engine, version: MOD_VERSION, highlighter, log });
    fab.attach();
    const onHide = () => { try { store.flush(); } catch { /* ignore */ } };
    try { globalThis.document?.addEventListener?.('visibilitychange', onHide); } catch { /* ignore */ }

    live = { store, engine, highlighter, fab, disposeSection, offSub, onHide, log };
    installDebugHandle();
    const s = engine.sync();
    log.info?.('[' + MOD_ID + '] 已就绪：' + ELEMENTS.length + ' 个元素 / ' + LAYERS.length + ' 层 / '
      + treeGroups().length + ' 个集合节点 · 默认全关 · 当前生效 ' + s.items + ' 项（DOM ' + s.domItems + ' · 画布 ' + s.groups.length + '）'
      + ' · 控制页在「模组设置 → ' + SECTION_TITLE + '」'
      + ' · 局内入口 ' + (store.get().fab && store.get().fab.on ? '已显示（可拖动）' : '已隐藏') + ' · 位置高亮 ' + (store.get().fab && store.get().fab.hl !== false ? '开' : '关'));
  } catch (e) {
    log.warn?.('[' + MOD_ID + '] 初始化失败（忽略，页面不受影响）', e);
    teardown();
  }
  return function dispose() { teardown(); };
}

/** 收摊：先摘外部引用与栏位，再停引擎（还原容器 transform），最后落盘。任何一步失败都不影响后面。 */
function teardown() {
  const cur = live;
  live = null;
  if (!cur) { try { removeDebugHandle(); } catch { /* ignore */ } return; }
  try { globalThis.document?.removeEventListener?.('visibilitychange', cur.onHide); } catch { /* ignore */ }
  try { removeDebugHandle(); } catch { /* ignore */ }
  try { cur.offSub?.(); } catch { /* ignore */ }
  try { cur.disposeSection?.(); } catch { /* ignore */ }
  try { cur.store.flush(); } catch { /* ignore */ }
  try { cur.fab?.dispose?.(); } catch { /* ignore */ }
  try { cur.highlighter?.dispose?.(); } catch { /* ignore */ }
  try { cur.engine.dispose(); } catch { /* ignore */ }
  try { cur.log?.info?.('[' + MOD_ID + '] 已卸载（样式已摘、画布 transform 已逐值还原）'); } catch { /* ignore */ }
}

/**
 * 把控制页交给「模组设置」。
 * 没装那个 Mod 也不会报错 —— 注册表只是 globalThis 上的一个对象，谁先跑谁建（registry.js 的幂等引导）。
 */
function registerSection(api, store, engine, highlighter, log) {
  try {
    const reg = settingsRegistry();
    if (!reg || typeof reg.register !== 'function') return () => {};
    const dispose = reg.register({
      id: SECTION_KEY,
      title: SECTION_TITLE,
      order: SECTION_ORDER,
      // ★ 不传 micro：栏位列表里只留中文名（用户口径：英文 eyebrow 一律清掉）
      render: () => api.ui.html`<${DjAllSection} api=${api} store=${store} tree=${TREE} engine=${engine}
        version=${MOD_VERSION} highlighter=${highlighter} layout="embed" />`,
    });
    log.info?.('[' + MOD_ID + '] 已在「模组设置」注册「' + SECTION_TITLE + '」栏位（三档 + 五参数 + 层级目录）');
    return dispose;
  } catch (e) {
    log.warn?.('[' + MOD_ID + '] 注册设置栏位失败（忽略）', e);
    return () => {};
  }
}

/** 运行时的"现在在不在局内"。 */
function inMatch(doc) {
  try { return !!(doc && typeof doc.querySelector === 'function' && doc.querySelector(MATCH_ROOT_SEL)); }
  catch { return false; }
}

/** 取探针用的根：局内取战斗屏根，局外取 document（`global: true` 的元素永远按 document 数）。 */
function probeRoot(doc, global) {
  if (!doc) return null;
  if (global) return doc;
  try { return doc.querySelector(MATCH_ROOT_SEL) || doc; } catch { return doc; }
}

/**
 * 现场探针（**只读**）：逐个元素给出现刻的命中数。
 *   · `global: true`（战斗屏之外的元素，如顶部 toast）**永远**按 document 数；
 *   · 不在局内时，非 global 的元素一律记 `inMatch: false`；
 *   · `pixi` 类的元素没有选择器 ⇒ `count: null`（它们是画布对象，要数得走引擎，见 `probeGroup(gid)`）。
 */
export function probe(opts) {
  const doc = (opts && opts.doc) || (typeof document !== 'undefined' ? document : null);
  const only = opts && Array.isArray(opts.only) && opts.only.length ? new Set(opts.only) : null;
  const rows = [];
  const inM = inMatch(doc);
  for (const e of ELEMENTS) {
    const n = normalizeEntry(e);
    if (only && !only.has(n.id)) continue;
    let count = null;
    let err = null;
    if (n.sel) {
      const root = probeRoot(doc, n.global);
      try { count = root ? root.querySelectorAll(n.sel).length : 0; } catch (ex) { err = String(ex && ex.message || ex); count = null; }
    }
    rows.push({ id: n.id, name: n.name, layer: n.layer, path: n.path, src: n.src, rot: n.rot, sel: n.sel, global: n.global, count, error: err });
  }
  return { inMatch: inM, total: rows.length, rows };
}

/** 逐层汇总。 */
export function audit(opts) {
  const p = probe(opts);
  const byLayer = {};
  const bySrc = { vanilla: 0 };
  let present = 0, absent = 0, noSel = 0, errors = 0;
  for (const r of p.rows) {
    const L = byLayer[r.layer] || (byLayer[r.layer] = { total: 0, present: 0, absent: 0, noSel: 0, errors: 0 });
    L.total++;
    if (r.sel === '') { L.noSel++; noSel++; }
    else if (r.error) { L.errors++; errors++; }
    else if (r.count > 0) { L.present++; present++; }
    else { L.absent++; absent++; }
    if (r.src !== 'vanilla') bySrc[r.src] = (bySrc[r.src] || 0) + 1;
    else bySrc.vanilla++;
  }
  return { inMatch: p.inMatch, total: p.total, present, absent, noSel, errors, byLayer, bySrc };
}

/** 把一个树节点复制成"只读快照"（给出去的东西不能指向内部对象）。 */
function cloneNode(n) {
  const o = { id: n.id, kind: n.kind, name: n.name, layer: n.layer, path: n.path, sel: n.sel,
    leafCount: n.leafCount, memberIds: n.memberIds.slice(), danger: n.danger === true };
  if (n.desc) o.desc = n.desc;
  if (n.dangerCount != null) o.dangerCount = n.dangerCount;
  if (n.children) o.children = n.children.map(cloneNode);
  if (n.el) o.el = normalizeEntry(n.el);
  return o;
}

/** dev / E2E 自省句柄。只读为主 + 少量"等于面板操作"的写入口，不给任何能改宿主对象的能力。 */
function installDebugHandle() {
  try {
    const g = globalThis;
    if (g[DEBUG_KEY]) { try { g[DEBUG_KEY].__dispose?.(); } catch { /* ignore */ } }
    const cur = () => live;
    const origin = () => {
      try { return (typeof location !== 'undefined' && location.origin) ? location.origin : ''; } catch { return ''; }
    };
    g[DEBUG_KEY] = {
      mod: MOD_ID,
      version: MOD_VERSION,
      // ---- 清单 / 树（只读）----
      elements: () => ELEMENTS.map(normalizeEntry),
      element: (id) => (ELEMENT_BY_ID[id] ? normalizeEntry(ELEMENT_BY_ID[id]) : null),
      layers: () => LAYERS.slice(),
      layer: (id) => LAYER_BY_ID[id] || null,
      grouped: () => groupByLayer().map((x) => ({ layer: x.layer, count: x.items.length, ids: x.items.map((i) => i.id) })),
      tree: () => TREE.map(cloneNode),
      node: (id) => (TREE_BY_ID[id] ? cloneNode(TREE_BY_ID[id]) : null),
      groups: () => treeGroups().map(cloneNode),
      selOf: (id) => treeSel(id),
      members: (id) => treeMembers(id),
      rotatable: () => ROTATABLE.slice(),
      // ---- 现场（只读）----
      probe: (only) => probe({ only }),
      audit: () => audit(),
      inMatch: () => inMatch(typeof document !== 'undefined' ? document : null),
      catalogUrl: () => origin() + '/mods/' + MOD_ID + '/catalog.html',
      indexPath: () => '/mods/' + MOD_ID + '/ELEMENTS.md',
      /** ★ 设置页的**独立预览**地址（服主审查用；与真机同一份渲染数据，但用它自己的渲染器）。 */
      settingsPreview: () => origin() + '/mods/' + MOD_ID + '/settings-preview.html',
      // ---- 配置（等同于在面板上操作）----
      config: () => JSON.parse(JSON.stringify(cur() ? cur().store.get() : {})),
      modeOf: (id) => (cur() ? modeOf(cur().store.get(), id) : 'off'),
      valuesOf: (id) => (cur() ? valuesOf(cur().store.get(), id) : null),
      /** 切档（★ 与面板同一个入口。面板上危险元素的二次确认在 UI 层，这里直接切 —— 给 E2E 用）。 */
      setMode: (id, m) => (cur() ? cur().store.setMode(id, m) : null),
      setGlobal: (patch) => (cur() ? cur().store.setGlobal(patch) : null),
      setOwn: (id, patch) => (cur() ? cur().store.setOwnValues(id, patch) : null),
      reset: () => (cur() ? cur().store.reset() : null),
      // ---- ④ 随机偏移（对全局与独立都生效；周期不参与）----
      rnd: () => (cur() ? cleanRnd(cur().store.get().rnd) : null),
      setRnd: (patch) => (cur() ? cur().store.setRnd(patch) : null),
      /** ★ 纯函数复算：某个节点在"开随机"之后实际拿到的数值（报告 / 验收直接调它）。 */
      randomOf: (id) => (cur() ? applyRandom(valuesOf(cur().store.get(), id), id, cur().store.get().rnd) : null),
      rndKeys: () => RND_KEYS.slice(),
      // ---- ② 局内入口 ----
      fab: () => (cur() ? cleanFab(cur().store.get().fab) : null),
      setFab: (patch) => (cur() ? cur().store.setFab(patch) : null),
      fabStats: () => (cur() && cur().fab ? cur().fab.stats() : null),
      /** 手动开 / 关局内浮窗（dev / E2E 用；真机上是点那颗图标键）。 */
      openWindow: () => (cur() && cur().fab ? cur().fab.toggle() : null),
      fabAsset: () => assetUrl(),
      fabElementId: FAB_ID,
      // ---- ③ 位置高亮 ----
      hlStats: () => (cur() && cur().highlighter ? cur().highlighter.stats() : null),
      /** 手动高亮一组作用项（[{sel, global}]）；传空数组 = 清除。 */
      hlShow: (items, extra) => (cur() && cur().highlighter ? cur().highlighter.show(items, extra) : null),
      hlClear: () => (cur() && cur().highlighter ? cur().highlighter.clear() : null),
      hlRepaint: () => (cur() && cur().highlighter ? cur().highlighter.repaint() : null),
      // ---- 引擎（自证 + dev）----
      engineStats: () => (cur() ? cur().engine.stats() : null),
      sync: () => (cur() ? cur().engine.sync() : null),
      /** 当前会注入的 DOM CSS 原文（报告 / 排错用）。 */
      domCss: () => (cur() ? cur().engine.domCss() : ''),
      /** 配置 → 引擎入参的纯函数复算（验收脚本据此独立复算）。 */
      compile: () => (cur() ? compile(cur().store.get(), TREE) : []),
      /** 画布分组的去重规则（纯函数复算：更具体的节点优先）。 */
      resolveGroups: (items) => resolveGroups(items || (cur() ? compile(cur().store.get(), TREE) : [])),
      probeGroup: (gid) => (cur() ? cur().engine.probe(gid) : []),
      step: () => (cur() ? cur().engine.step() : null),
      // ---- 常量自证 ----
      limits: () => ({
        prefKey: PREF_KEY, prefV: PREF_V, modes: MODES.slice(), defaultGlobal: { ...DEFAULT_GLOBAL },
        matchRootSel: MATCH_ROOT_SEL, sectionKey: SECTION_KEY, sectionTitle: SECTION_TITLE, sectionOrder: SECTION_ORDER,
      }),
      /** 卸载本 Mod（等价于宿主 unloadClientMods 走到本支）。 */
      __dispose: () => { try { teardown(); } catch { /* ignore */ } try { g[DEBUG_KEY] = null; } catch { /* ignore */ } },
    };
  } catch { /* 静态托管 / 冻结 globalThis：没有句柄也能跑 */ }
}

/** 摘掉自省句柄（只在它还是"我们的"时候摘）。 */
function removeDebugHandle() {
  const g = globalThis;
  if (g[DEBUG_KEY] && g[DEBUG_KEY].mod === MOD_ID) g[DEBUG_KEY] = null;
}
