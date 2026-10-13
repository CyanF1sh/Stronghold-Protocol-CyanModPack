// mods/cyanfish.dj-all/client/highlight.js — ③ **元素位置高亮**：选中目录里的元素时，在画面上给它画一圈黄框。
//
// 服主口径：「在元素目录中选中对应元素时，在客户端渲染该元素的位置（黄色外框）以便玩家确认」。
//
// ============================ 怎么做 ============================
// 一个 `position:fixed` 的**全屏覆盖层**（`pointer-events:none`，挂在 `<body>`，z-index 很高）：
//   · 对每个命中的 DOM 元素，量它的 `getBoundingClientRect()`，在覆盖层里画一个同位置的黄框；
//   · 框随**滚动 / 视口变化 / 元素移动**更新（rAF 节流 + 400ms 心跳 —— 战场里的元素位置是会变的）；
//   · `clear()` 把**整个**层摘掉 ⇒ 零残留（我们从不改宿主元素本身：不加 class、不写内联样式）。
//
// ★ 两个来源分开处理，因为作用域不同（`hint.toast` 在战斗屏之外）：
//   传进来的就是 `compile()` 风格的作用项 `[{ sel, global }]`，各按各的作用域查。
// ★ **画布对象（`pixi.*`）没有 DOM 位置** ⇒ 画不了框；`countOf()` 会把它们的数量单独报出来，
//   由调用方给玩家一句"这类元素在画面里，无法用外框标注"的说明（不要假装标了）。
// ★ 框上带一个**标签**（节点名），因为一个分组可能命中几十个元素，光有黄框看不出是哪一个。

/** 覆盖层的 id（验收时"在不在"的判据）。 */
export const HL_LAYER_ID = 'sp-dja-hl';
/** 单个黄框的类名。 */
export const HL_BOX_CLASS = 'sp-dja__hl';
/** 战斗屏根（与引擎同一个判据）。 */
const MATCH_ROOT_SEL = '#app .screen.gm';
/** 心跳间隔（ms）：战场里的元素会自己走动，光靠 scroll/resize 不够。 */
const BEAT_MS = 400;

/** 按作用项收集命中的 DOM 元素（纯读，不改）。 */
export function collectEls(items, doc) {
  const out = [];
  if (!doc) return out;
  for (const it of items || []) {
    if (!it || !it.sel) continue;
    let root = doc;
    if (!it.global) { try { root = doc.querySelector(MATCH_ROOT_SEL) || doc; } catch { root = doc; } }
    try {
      for (const el of root.querySelectorAll(it.sel)) out.push({ el, id: it.id || '' });
    } catch { /* 选择器坏了就跳过这一项 */ }
  }
  return out;
}

/**
 * 造一个高亮器。
 * @param {{ doc?: any, win?: any, log?: any, matchRoot?: string }} opts
 */
export function createHighlighter({ doc = globalThis.document, win = globalThis, log = null, matchRoot = MATCH_ROOT_SEL } = {}) {
  let layer = null;
  let raf = 0;
  let beat = 0;
  let items = [];
  let disposed = false;
  const stats = { shown: false, boxes: 0, hits: 0, pixiSkipped: 0, errors: 0, lastAt: 0 };

  const ensureLayer = () => {
    if (layer || !doc) return layer;
    const el = doc.createElement('div');
    el.id = HL_LAYER_ID;
    el.setAttribute('aria-hidden', 'true');
    (doc.body || doc.documentElement).appendChild(el);
    layer = el;
    return layer;
  };

  const clearBoxes = () => { if (layer) layer.textContent = ''; };

  /** 量一遍并重画（**只读宿主** + 只在自家层里写）。 */
  function paint() {
    if (disposed || !layer) return;
    const els = collectEls(items, doc);
    const boxes = [];
    for (const rec of els) {
      const el = rec.el;
      if (!el || el.destroyed) continue;
      let r = null;
      try { r = el.getBoundingClientRect(); } catch { r = null; }
      if (!r || (r.width <= 0.5 && r.height <= 0.5)) continue;
      // 只在视口内画（屏幕外的没意义，还浪费节点）
      if (r.bottom < -8 || r.top > (win.innerHeight || 0) + 8 || r.right < -8 || r.left > (win.innerWidth || 0) + 8) continue;
      boxes.push({ r, id: rec.id });
    }
    clearBoxes();
    const frag = doc.createDocumentFragment();
    const seenLabel = new Set();
    for (const b of boxes) {
      const d = doc.createElement('div');
      d.className = HL_BOX_CLASS;
      d.style.left = Math.round(b.r.left) + 'px';
      d.style.top = Math.round(b.r.top) + 'px';
      d.style.width = Math.round(b.r.width) + 'px';
      d.style.height = Math.round(b.r.height) + 'px';
      // 只在**第一个**框旁边挂标签，避免一屏几十个标签糊成一片
      if (b.id && !seenLabel.has(b.id)) {
        seenLabel.add(b.id);
        const t = doc.createElement('span');
        t.className = 'sp-dja__hl-tag';
        t.textContent = b.id;
        d.appendChild(t);
      }
      frag.appendChild(d);
    }
    layer.appendChild(frag);
    stats.boxes = boxes.length;
    stats.hits = els.length;
    stats.lastAt = Date.now();
    return boxes.length;
  }

  const schedulePaint = () => {
    if (disposed || raf || !items.length) return;
    const run = () => { raf = 0; try { paint(); } catch { stats.errors++; } };
    raf = win && typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(run) : (setTimeout(run, 16), 1);
  };

  return {
    /**
     * 显示一组作用项的高亮（同上一次不同就重画）。传空数组 = 清除。
     * @param {Array<{id?:string, sel:string, global?:boolean}>} next
     * @param {{ pixi?: number }} [extra] `pixi` = 这次选择里有多少个画布对象（画不了框，只是记账给玩家看）
     */
    show(next, extra) {
      if (disposed) return stats;
      items = Array.isArray(next) ? next : [];
      stats.pixiSkipped = extra && Number.isFinite(extra.pixi) ? extra.pixi : 0;
      if (!items.length) { this.clear(); return stats; }
      ensureLayer();
      if (!layer) return stats;
      // ★ 首次进入显示态：开滚动静音心跳（只在这段时间监听，避免常态占用）
      if (!beat) {
        beat = setInterval(() => { if (!doc || !doc.querySelector || doc.hidden) return; try { paint(); } catch { stats.errors++; } }, BEAT_MS);
        if (typeof beat === 'object' && beat && typeof beat.unref === 'function') beat.unref();
        try { win.addEventListener('scroll', schedulePaint, { passive: true, capture: true }); } catch { /* ignore */ }
        try { win.addEventListener('resize', schedulePaint, { passive: true }); } catch { /* ignore */ }
      }
      stats.shown = true;
      try { paint(); } catch { stats.errors++; }
      return stats;
    },
    /** 清除（摘掉整层 —— 零残留）。 */
    clear() {
      items = [];
      if (beat) { clearInterval(beat); beat = 0; }
      try { win.removeEventListener('scroll', schedulePaint, { capture: true }); } catch { /* ignore */ }
      try { win.removeEventListener('resize', schedulePaint); } catch { /* ignore */ }
      if (layer) { try { layer.parentNode.removeChild(layer); } catch (e) { stats.errors++; } layer = null; }
      stats.shown = false; stats.boxes = 0; stats.hits = 0; stats.pixiSkipped = 0;
      return stats;
    },
    stats() { return { ...stats }; },
    /** 立刻重画一次（dev / E2E 用，不等心跳）。 */
    repaint() { return paint(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf && win && typeof win.cancelAnimationFrame === 'function') { try { win.cancelAnimationFrame(raf); } catch { /* ignore */ } }
      raf = 0;
      this.clear();
    },
  };
}
