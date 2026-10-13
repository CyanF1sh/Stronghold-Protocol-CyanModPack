// mods/cyanfish.dj-all/client/tips.js — ③ 面板上的「？」说明气泡：**挂在 `<body>` 的 fixed 层**。
//
// 服主反馈：「带圈问号说明的说明框渲染不会超出外框，导致超出部分的文字无法显示。」
//
// ============================ 为什么原来会被切掉 ============================
// 原来用的是纯 CSS 的 `.sp-dja__info::after`（`position:absolute`）—— 那个气泡是**小圆点的子元素**，
// 于是它会受**所有祖先的 `overflow`** 约束：面板那一栏本身在弹窗的滚动容器里（`.modal__body{overflow:auto}`），
// 我们的目录又是 `.sp-dja__tree{overflow:auto}` ⇒ 气泡一超出就被裁掉（越靠边的「？」越明显）。
//
// ============================ 现在怎么做 ============================
// ★ 一个挂在 `<body>` 的**独立 fixed 层**（`#sp-dja-tip`）：
//   · `position:fixed` ⇒ 不受任何祖先 `overflow` 约束（这就是"跳出外框"的关键）；
//   · 位置**按目标元素实时算 + 视口夹取**（先放上方，上方不够就放下方；左右各夹 8px）；
//   · 事件用**委托**（`mouseover/mouseout/focusin/focusout` 捕获阶段）认 `[data-tip]` —— 面板被重绘（Preact
//     每 700ms 心跳）也不会失效，不需要重新绑定；
//   · 同时支持**点击/触摸**（触屏没有 hover）：点一下「？」也能看到。
// ★ 只读：不改任何宿主元素（只读 `data-tip`、算位置），`dispose()` 摘掉整层 ⇒ 零残留。
//
// ★ 与宿主 `ui.Tooltip` 的区别：宿主的 Tooltip 画在 `.app-root` 里（`isolation:isolate`），
//   盖不到"挂在 body 的独立 Preact 根浮窗"之上（`extensions.js` 里写明了）；我们的浮窗就是那种，所以自建。

/** 气泡层的 id（验收判据）。 */
export const TIP_LAYER_ID = 'sp-dja-tip';
/** 气泡本体的类名。 */
export const TIP_CLASS = 'sp-dja__tip';
/** 离视口边缘的最小间距（px）。 */
const EDGE = 8;
/** 目标与气泡之间的间距（px）。 */
const GAP = 6;

let singleton = null;

/**
 * 装一次（幂等）。返回 dispose。
 * @param {{ doc?: any, win?: any }} [opts]
 */
export function installTips({ doc = globalThis.document, win = globalThis } = {}) {
  if (singleton) return singleton.dispose;
  if (!doc || !doc.body) return () => {};

  const layer = doc.createElement('div');
  layer.id = TIP_LAYER_ID;
  layer.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(layer);
  let target = null;

  function place() {
    if (!target || !target.isConnected) { hide(); return; }
    const text = target.getAttribute('data-tip') || '';
    if (!text) { hide(); return; }
    layer.textContent = '';
    const tip = doc.createElement('div');
    tip.className = TIP_CLASS;
    tip.textContent = text;
    layer.appendChild(tip);
    // 先放到视口外量尺寸，再算位置（避免闪一帧）
    tip.style.left = '-9999px';
    tip.style.top = '0px';
    const tb = tip.getBoundingClientRect();
    const rb = target.getBoundingClientRect();
    const vw = win.innerWidth || 1280;
    const vh = win.innerHeight || 720;
    // 左右：以目标中心对齐，并夹在视口内
    let left = rb.left + rb.width / 2 - tb.width / 2;
    left = Math.max(EDGE, Math.min(left, vw - tb.width - EDGE));
    // 上下：优先上方；放不下就放下方；都放不下就贴住视口上边
    let top = rb.top - tb.height - GAP;
    if (top < EDGE) {
      const below = rb.bottom + GAP;
      top = below + tb.height + EDGE <= vh ? below : Math.max(EDGE, vh - tb.height - EDGE);
    }
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.classList.add('is-on');
  }

  function hide() {
    target = null;
    if (layer.textContent) layer.textContent = '';
  }

  const find = (el) => (el && el.closest ? el.closest('[data-tip]') : null);
  const onOver = (e) => { const t = find(e.target); if (!t) return; target = t; place(); };
  const onOut = (e) => { if (!target) return; const t = find(e.target); if (t === target && !target.contains(e.relatedTarget)) hide(); };
  const onFocus = (e) => { const t = find(e.target); if (t) { target = t; place(); } };
  const onBlur = hide;
  const onClick = (e) => { const t = find(e.target); if (t) { target = t; place(); } else hide(); };
  const onMove = () => { if (target) place(); };        // 面板重绘/滚动/窗口变化时跟着挪

  doc.addEventListener('mouseover', onOver, true);
  doc.addEventListener('mouseout', onOut, true);
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('focusout', onBlur, true);
  doc.addEventListener('click', onClick, true);
  win.addEventListener('scroll', onMove, { passive: true, capture: true });
  win.addEventListener('resize', onMove, { passive: true });
  // ★ 面板每 700ms 心跳重绘 ⇒ 已挂的「？」节点会被换掉：定期确认它还连着，顺便重算位置
  const beat = setInterval(() => { if (target && (!target.isConnected || doc.hidden)) hide(); else if (target) place(); }, 500);
  if (typeof beat === 'object' && beat && typeof beat.unref === 'function') beat.unref();

  const dispose = () => {
    singleton = null;
    clearInterval(beat);
    doc.removeEventListener('mouseover', onOver, true);
    doc.removeEventListener('mouseout', onOut, true);
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('focusout', onBlur, true);
    doc.removeEventListener('click', onClick, true);
    win.removeEventListener('scroll', onMove, { capture: true });
    win.removeEventListener('resize', onMove);
    try { layer.parentNode.removeChild(layer); } catch { /* ignore */ }
  };
  singleton = { dispose, hide, place, layer };
  return dispose;
}

/** 现在气泡在不在（dev / E2E 用）。 */
export function tipsStats() {
  const el = globalThis.document ? globalThis.document.getElementById(TIP_LAYER_ID) : null;
  const tip = el ? el.querySelector('.' + TIP_CLASS) : null;
  return {
    layer: !!el,
    shown: !!tip,
    text: tip ? (tip.textContent || '').slice(0, 60) : null,
    rect: tip ? (() => { const r = tip.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
  };
}
