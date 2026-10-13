// mods/cyanfish.dj-all/client/engine.js — **总装配**：把配置编译成两侧引擎各自要的输入，并统一暴露开关。
//
//   配置（client/config.js）
//        │  compile(cfg, tree)      ← 纯数据：一个启用节点 = 一到两条"作用项"
//        ▼
//   ┌──────────────────────┬──────────────────────────────┐
//   │ DOM 侧（纯 CSS 注入）  │ 画布侧（PIXI，每帧改 transform）│
//   │ engine-dom.sync(items)│ engine-pixi.getGroups()      │
//   └──────────────────────┴──────────────────────────────┘
//
// ★ 两侧的**分工**由元素表决定：元素有 DOM 选择器 ⇒ DOM 侧；是画布对象（`pixi` 非空）⇒ 画布侧。
//   `pixi.range` / `pixi.beam` 在元素表里标了 `unavailable`（本 Mod 不提供开关）⇒ 永不出现。
//
// ★★ **同一个画布分组被多个节点指向时的去重规则**：**更具体的节点优先**（叶子 > 组 > 层）。
//    例：`G:canvas/unit`（组，全局档）与 `E:pixi.op`（叶，独立档）同时开着 ⇒ 画布分组 `op` 用**叶**那一份。
//    这条规则是确定的、可复算的（`resolveGroups()` 是纯函数，单测直接调）。

import { compile } from './config.js';
import { createDomEngine } from './engine-dom.js';
import { createPixiEngine, GROUP_ORDER, FLAT_ONLY_GROUPS } from './engine-pixi.js';

/** 节点的"具体程度"（去重时大的赢）。 */
const RANK = { leaf: 3, group: 2, layer: 1 };

/**
 * 从编译结果里挑出画布侧的分组（**去重**：一个 gid 只留最具体的那个节点）。
 * @param {Array<any>} items `compile()` 的产物
 * @returns {Array<{gid:string, id:string}>}
 */
export function resolveGroups(items) {
  const best = new Map();
  for (const it of items || []) {
    if (!it || !it.pixi) continue;
    const rank = RANK[it.kind] || 0;
    const cur = best.get(it.pixi);
    if (!cur || rank > cur.rank) best.set(it.pixi, { gid: it.pixi, id: it.id, vals: it.vals, phase: it.phase || 0, rank });
  }
  // 输出顺序固定按 GROUP_ORDER（= 引擎处理顺序），便于复算与取证
  const out = [];
  for (const gid of GROUP_ORDER) if (best.has(gid)) out.push({ gid, id: best.get(gid).id, vals: best.get(gid).vals, phase: best.get(gid).phase || 0 });
  return out;
}

/**
 * 造总引擎。
 * @param {{ getCfg: () => any, tree: Array<any>, log?: any, doc?: any, win?: any, g?: any }} opts
 */
export function createEngine({ getCfg, tree, log = null, doc = globalThis.document, win = globalThis, g = globalThis } = {}) {
  /** 最近一次编译结果（面板的"状态读数"与验收脚本都读它）。 */
  let items = [];
  let groups = [];
  let domItems = [];

  /** 一次快照（sync 与对外的 stats() 共用同一份实现）。 */
  function snapshot() {
    const d = dom.stats();
    const p = pixi.stats();
    return {
      items: items.length,
      domItems: domItems.length,
      groups: groups.map((x) => x.gid),
      groupNodes: groups.map((x) => x.id),
      dom: d,
      pixi: p,
      flatOnly: FLAT_ONLY_GROUPS.slice(),
      resolved: groups.map((x) => ({ gid: x.gid, node: x.id })),
    };
  }

  const dom = createDomEngine({
    log, doc, win,
    getItems: () => domItems,
  });
  const pixi = createPixiEngine({
    log, win, g,
    getGroups: () => groups,
    // ★★ 1.0.0：把「随机偏移」那一块也交给画布引擎 —— 它按 `view.uid` **逐实例**算幅度与初相位。
    getRnd: () => { try { const c = getCfg(); return c ? c.rnd : null; } catch { return null; } },
  });

  /** 重新编译（配置变了 / 树变了都调它）——**同步、幂等**。 */
  function sync() {
    let cfg = null;
    try { cfg = getCfg(); } catch { cfg = null; }
    try {
      items = compile(cfg, tree);
    } catch (e) {
      items = [];
      log?.warn?.('[cyanfish.dj-all] 编译配置失败（已按"全关"处理）', e);
    }
    domItems = items.filter((it) => it.sel);
    groups = resolveGroups(items);
    dom.sync();
    // ★ 画布侧不需要"注入"：它每帧读 groups，发现本帧一个分组都不生效就自己 restoreAll()（见 tick 开头）。
    return snapshot();
  }

  return {
    attach() { dom.sync(); pixi.attach(); },
    sync,
    /** 立刻跑一帧画布侧（dev / E2E 用：不等 ticker 时机）。 */
    step() { return pixi.step(); },
    /** ★ ⑤b 换面现场（只读）：每个被管过的单位视图的 dir / 正背 / 被什么挡住（报告与 E2E 用）。 */
    fbProbe: () => pixi.fbProbe(),
    /** DOM 侧当前会注入的 CSS 原文（报告 / 排错用）。 */
    domCss: () => dom.css(),
    stats: snapshot,
    /** 某个画布分组此刻会被动的目标数（只读）。 */
    probe: (gid) => pixi.probe(gid),
    /** ★ 1.0.0 逐实例读数：某分组前 N 个目标**此刻**用的实例键 / 幅度 / 相位（只读）。 */
    instProbe: (gid, max) => pixi.instProbe(gid, max),
    /** 卸载：DOM 摘 style、画布逐值还原。 */
    dispose() {
      try { dom.dispose(); } catch { /* ignore */ }
      try { pixi.dispose(); } catch { /* ignore */ }
      items = []; groups = []; domItems = [];
    },
  };
}
