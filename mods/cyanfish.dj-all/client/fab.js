// mods/cyanfish.dj-all/client/fab.js — ② **局内独立入口**：战斗里那颗可拖动的图标键 + 它打开的半透明浮窗。
//
// 服主口径：
//   「在战斗中新增可配置位置的独立入口（可在设置中关闭该局内入口显示），其图标使用 阿米娅旋转.gif（内带进 mod 文件），
//     通过该入口打开的该 mod 设置为**半透明浮动窗口**，以便 ③ 预览元素位置」
//
// ============================ 实现要点 ============================
// ① **图标**：`assets/amiya-spin.jpg`（随 Mod 打包）。用 `new URL('../assets/…', import.meta.url)` 取 URL ——
//    这样不管 Mod 被挂在哪个基址上、有没有加缓存查询串，都指向自己的资源（不写死 `/mods/<id>/…`）。
//    ★ 服主手上给的是**静态一帧**（不是真 .gif）⇒ 用 CSS 让它**匀速自转**来出"阿米娅旋转"的观感；
//      将来拿到动图原件，把 `assets/amiya-spin.gif` 放进来、把 `ASSET_FILE` 改成它即可（一行）。
// ② **位置可配置**：拖动即配置。位置存的是**视口宽高的比例**（0~1）而不是像素 ⇒ 换分辨率不会跑出屏幕；
//    面板里有「位置读数」与「回到默认位置」。拖动阈值 4px：小于它算"点击"（开窗），大于它算"拖动"（改位置）。
// ③ **可在设置中关闭**：`cfg.fab.on`。关闭 ⇒ 摘掉按钮与浮窗（零残留）。
// ④ **半透明浮窗**：不用宿主 `Modal`（它的遮罩会把战场压暗，正好挡住要看的东西）；
//    自己在 `<body>` 上开一个根，用 vendor 的 preact 渲染一扇**非模态**浮窗 ——
//    内容**复用同一个 `DjAllSection`**（所以与设置页里那一栏逐像素一致、没有第二套渲染器）。
//    ★ 这是 `cyanfish.mod-settings` 已经用过的同一条路子（`await import('/vendor/preact.module.js')` 的 render），
//      不是新造的接缝：vendor 是公共资源，不是宿主内部模块；`setup()` 仍然**同步返回**（vendor 只在这颗键被点时才加载）。

import { DjAllSection } from './section.js';

/** 按钮 id（验收判据）。 */
export const FAB_ID = 'sp-dja-fab';
/**
 * 浮窗宿主容器的 id。
 * ★ 本文件是它的**唯一所有者**（0.5.0 起就是这个写法）。0.6.0 一度把它挪到 `style.js` 再 import，
 *   已改回：**"给已有模块新增 named export、再由新文件 import"是个会整包炸掉的耦合**（混载新老版本时
 *   `SyntaxError: does not provide an export named` ⇒ 连 `setup()` 都跑不到）——详见 confirm.js 的 setWinAside 注释。
 *   确认层现在靠 `data-dja-win` 反查父容器，不需要这个常量。
 */
export const WIN_HOST_ID = 'sp-dja-win';
/**
 * 图标文件名（换图标就改这里 + 把文件放进 assets/）。
 * ★ 现在用的是**真动图** `amiya-spin.gif`（128×128 / 27 帧 / 117 KB）。
 *   它是从服主给的素材（`assets/阿米娅旋转.gif`，960×960 · 27 帧 · 1.8 MB）**只做缩放与调色板优化**得到的：
 *   帧率（10 fps）、时长（2.70 s）、循环方式、透明通道都原样保留。⇒ 原件不参与运行，留作素材源。
 * ★ 换成**静态图**时：把下面的 `ASSET_ANIMATED` 改成 `false`，图标会由 CSS 自转出「旋转」的观感。
 */
export const ASSET_FILE = 'amiya-spin.gif';
/**
 * 图标**自己会不会动**。
 *   `true`（现状）= 动图自带动画 ⇒ **不加** CSS 自转（否则会和动图叠成双倍转速，很怪）。
 *   `false`       = 静态图 ⇒ 加 `--spin` 修饰类，用 CSS 匀速自转。
 */
export const ASSET_ANIMATED = true;
/** 拖动判定阈值（px）：小于它算点击。 */
const DRAG_SLOP = 4;
/** vendor preact 的地址（与 cyanfish.mod-settings 用的是同一个）。 */
const VENDOR_PREACT = '/vendor/preact.module.js';

/** 取图标 URL（拿不到 import.meta.url 就退回常规路径）。 */
export function assetUrl() {
  try { return new URL('../assets/' + ASSET_FILE, import.meta.url).href; }
  catch { return '/mods/cyanfish.dj-all/assets/' + ASSET_FILE; }
}

/**
 * 造局内入口。
 * @param {{ api:any, store:any, tree:Array<any>, engine:any, version:string, highlighter?:any,
 *           log?:any, doc?:any, win?:any }} opts
 */
export function createFab({ api, store, tree, engine, version, highlighter = null, log = null,
  doc = globalThis.document, win = globalThis } = {}) {
  let btn = null;
  let host = null;                 // 浮窗的挂载根
  let winApi = null;               // 当前浮窗句柄
  let tick = 0;                     // 浮窗开着时的心跳（只为了让标题栏的存活读数跟着"进/出对局"变）
  let preact = null;
  let preactTried = false;
  let offSub = null;
  let disposed = false;
  const stats = { visible: false, open: false, x: 0, y: 0, renders: 0, errors: 0 };

  /** 按配置把按钮放到该在的位置（比例 → 像素）。 */
  function place(fab) {
    if (!btn) return;
    const w = (win.innerWidth || 1280), h = (win.innerHeight || 720);
    const size = 44;
    const x = Math.max(0, Math.min(w - size, fab.x * w));
    const y = Math.max(0, Math.min(h - size, fab.y * h));
    btn.style.left = Math.round(x) + 'px';
    btn.style.top = Math.round(y) + 'px';
    stats.x = fab.x; stats.y = fab.y;
  }

  /** 同步显隐（`cfg.fab.on` 关了就摘掉按钮，**不留空壳**）。 */
  function sync() {
    if (disposed || !doc) return;
    const fab = store.get().fab;
    if (!fab || fab.on !== true) {
      if (btn && btn.parentNode) { try { btn.parentNode.removeChild(btn); } catch { stats.errors++; } }
      btn = null;
      stats.visible = false;
      closeWin();
      return;
    }
    if (!btn) buildBtn();
    place(fab);
    stats.visible = true;
    if (winApi) winApi.refresh(fab);       // 浮窗开着时，不透明度跟着改
  }

  /** 造按钮（一次）+ 绑拖动。 */
  function buildBtn() {
    const el = doc.createElement('div');
    el.id = FAB_ID;
    el.className = 'sp-dja__fab';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.title = 'DJ 整活（拖动可改位置）';
    el.setAttribute('aria-label', 'DJ 整活');
    const img = doc.createElement('img');
    img.className = 'sp-dja__fabimg' + (ASSET_ANIMATED ? '' : ' sp-dja__fabimg--spin');
    img.alt = '';
    img.draggable = false;
    img.src = assetUrl();
    el.appendChild(img);
    (doc.body || doc.documentElement).appendChild(el);
    btn = el;

    let down = null;
    const onDown = (e) => {
      const r = el.getBoundingClientRect();
      down = { mx: e.clientX, my: e.clientY, ox: r.left, oy: r.top, moved: false };
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      el.classList.add('is-drag');
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - down.mx, dy = e.clientY - down.my;
      if (!down.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
      down.moved = true;
      const w = (win.innerWidth || 1280), h = (win.innerHeight || 720);
      const size = 44;
      const px = Math.max(0, Math.min(w - size, down.ox + dx));
      const py = Math.max(0, Math.min(h - size, down.oy + dy));
      el.style.left = Math.round(px) + 'px';
      el.style.top = Math.round(py) + 'px';
    };
    const onUp = () => {
      if (!down) return;
      const moved = down.moved;
      down = null;
      el.classList.remove('is-drag');
      if (moved) {
        const w = (win.innerWidth || 1280), h = (win.innerHeight || 720);
        const r = el.getBoundingClientRect();
        try { store.setFab({ x: r.left / w, y: r.top / h }); } catch { stats.errors++; }
      } else {
        try { toggleWin(); } catch (e) { stats.errors++; log?.warn?.('[cyanfish.dj-all] 打开浮窗失败', e); }
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); try { toggleWin(); } catch { /* ignore */ } } });
  }

  /** 浮窗需要 preact（懒加载一次；拿不到就提示，不抛）。 */
  async function ensurePreact() {
    if (preact || preactTried) return preact;
    preactTried = true;
    try {
      const m = await import(/* @vite-ignore */ VENDOR_PREACT);
      preact = m && typeof m.render === 'function' ? m : null;
    } catch (e) { preact = null; log?.warn?.('[cyanfish.dj-all] 拿不到 vendor preact，局内浮窗不可用（设置页里的那一栏不受影响）', e); }
    return preact;
  }

  /** 浮动窗标题栏右侧的**存活读数**（服主 2026-10-14：「刷新后所有动作都不生效」时无从判断）。
   *  一眼分清三种"没动"：总闸关 / 不在对局 / 真的在跑多少项。 */
  function statusText() {
    try {
      const on = store.get().on === true;
      const st = engine && typeof engine.stats === 'function' ? engine.stats() : null;
      const n = st ? st.items : 0;
      const inMatch = !!(doc && doc.querySelector && doc.querySelector('#app .screen.gm'));
      if (!on) return '总闸关 · 去设置里打开';
      if (!n) return '本元素都没开';
      const fb = st && st.pixi && st.pixi.frontback ? st.pixi.frontback : null;
      const swap = fb && fb.swapsTotal ? ' · 换面 ' + fb.swapsTotal : '';
      if (!inMatch) return n + ' 项待生效 · 不在对局中';
      return n + ' 项生效 · 画布 ' + (st && st.groups ? st.groups.length : 0) + ' 组' + swap;
    } catch { return '—'; }
  }

  /** 浮窗本体（非模态、可拖、半透明；内容复用 DjAllSection）。 */
  function Win({ fab, onClose }) {
    const { html } = api.ui;
    const startDrag = (e) => {
      const hostEl = host && host.firstElementChild;
      if (!hostEl) return;
      const r = hostEl.getBoundingClientRect();
      // ★★⑥ 先把**定位方式归一化**再拖：窗口本来靠 `left:50%;top:50% + transform:translate(-50%,-50%)` 居中，
      //   而拖动是写 `left/top` 的 —— 不归一化的话，`translate(-50%,-50%)` 会额外把窗口推走**半个宽高**
      //   （服主看到的「向左上偏移半个长宽」就是这个）。改成：量出当前位置 ⇒ 写死 left/top ⇒ 去掉 transform。
      hostEl.style.transform = 'none';
      hostEl.style.left = Math.round(r.left) + 'px';
      hostEl.style.top = Math.round(r.top) + 'px';
      hostEl.classList.add('is-dragging');
      const d = { mx: e.clientX, my: e.clientY, ox: r.left, oy: r.top };
      const mv = (ev) => {
        hostEl.style.left = Math.round(d.ox + ev.clientX - d.mx) + 'px';
        hostEl.style.top = Math.round(d.oy + ev.clientY - d.my) + 'px';
      };
      const up = () => {
        win.removeEventListener('pointermove', mv);
        win.removeEventListener('pointerup', up);
        try { hostEl.classList.remove('is-dragging'); } catch { /* ignore */ }
      };
      win.addEventListener('pointermove', mv);
      win.addEventListener('pointerup', up);
      e.preventDefault();
    };
    return html`<div class="sp-dja__win" data-dja-win="1" style=${'--sp-dja-alpha:' + (fab.alpha || 0.72)}>
      <div class="sp-dja__winbar" onPointerDown=${startDrag}>
        <span class="sp-dja__wintitle">DJ 整活</span>
        <span class="sp-dja__winsub" title="局内浮窗 · 半透明 · 拖标题栏可移动">${statusText()}</span>
        <button type="button" class="sp-dja__winx" title="关闭（顺便清掉位置高亮）" onClick=${onClose}>✕</button>
      </div>
      <div class="sp-dja__winbody">
        <${DjAllSection} api=${api} store=${store} tree=${tree} engine=${engine} version=${version}
          highlighter=${highlighter} layout="float" scope="elements" />
      </div>
    </div>`;
  }

  async function openWin() {
    if (disposed || winApi || !doc) return null;
    const p = await ensurePreact();
    if (!p || typeof p.render !== 'function') {
      try { api.ui.toastError?.('这个 Mod 的局内浮窗不可用（拿不到 vendor preact）；请在「设置 → 模组设置 → DJ 整活」里操作'); } catch { /* ignore */ }
      return null;
    }
    host = doc.getElementById(WIN_HOST_ID) || doc.createElement('div');
    host.id = WIN_HOST_ID;
    if (!host.parentNode) (doc.body || doc.documentElement).appendChild(host);
    const refresh = (fab) => { try { p.render(Win({ fab, onClose: closeWin }), host); stats.renders++; } catch (e) { stats.errors++; log?.warn?.('[cyanfish.dj-all] 浮窗重绘失败', e); } };
    // ★★ ① "确认期间把浮窗让开"**不在这里实现** —— 由确认层自己按 `data-dja-win` 反查容器加 `is-modal`。
    //   0.4.0（classList）/ 0.5.0（vnode class）/ 0.6.0 试过的"面板回调 → 本文件 setModal"三条路实测**都没生效**
    //   （取证：out/adapt/dj-all-027-micro.txt 的 `fabModal:false` / `hostCls:""`，而 `sectionCbs:"mm"` 证明 prop 到了组件）。
    //   唯一稳的写法是"谁开着确认框谁动手"，见 client/confirm.js 的 setWinAside。
    winApi = { refresh, render: (fab) => refresh(fab) };
    refresh(store.get().fab);
    // ★ 让标题栏的存活读数跟着"进/出对局"更新（它不由 store 变化驱动）
    if (tick) { try { clearInterval(tick); } catch { /* ignore */ } }
    tick = setInterval(() => { if (!disposed) refresh(store.get().fab); }, 1000);
    if (typeof tick === 'object' && tick && typeof tick.unref === 'function') tick.unref();
    stats.open = true;
    return winApi;
  }

  function closeWin() {
    if (!winApi) return;
    if (tick) { try { clearInterval(tick); } catch { /* ignore */ } tick = 0; }
    const p = preact;
    try { if (p && host) p.render(null, host); } catch { stats.errors++; }
    try { host?.classList?.remove('is-modal'); } catch { /* ignore */ }   // ★① 别把"让开"状态留在容器上
    try { host?.remove?.(); } catch { /* ignore */ }
    host = null; winApi = null; stats.open = false;
    try { highlighter?.clear?.(); } catch { /* ignore */ }
  }

  function toggleWin() { return winApi ? (closeWin(), null) : openWin(); }

  return {
    /** 装配：建按钮（若该显示）+ 订阅配置。 */
    attach() {
      if (disposed) return;
      offSub = store.subscribe(() => { try { sync(); } catch (e) { stats.errors++; log?.warn?.('[cyanfish.dj-all] 局内入口同步失败', e); } });
    },
    /** 现在显不显示 / 开没开（dev / E2E 用）。 */
    stats() { return { ...stats, asset: assetUrl() }; },
    /** 手动开 / 关浮窗（dev / E2E 用）。 */
    open: () => openWin(),
    close: () => { closeWin(); },
    toggle: () => toggleWin(),
    el: () => btn,
    dispose() {
      if (disposed) return;
      disposed = true;
      try { offSub?.(); } catch { /* ignore */ }
      closeWin();
      if (btn && btn.parentNode) { try { btn.parentNode.removeChild(btn); } catch { stats.errors++; } }
      btn = null;
      stats.visible = false;
    },
  };
}
