// mods/cyanfish.dj-all/client/confirm.js — ★★ ① **本 Mod 自己的二次确认层**（不复用宿主弹窗）。
//
// ============================ 为什么必须自己画 ============================
// 服主实测（2026-10-14）：「这个二次确认窗口和游戏内自身的设置窗口处于同一层级，所以会被压住」。
// 读宿主代码可以逐字确认这条：
//   · 宿主 `confirmDialog()`（`public/js/ui/components.js:495`）只是往 `.app-root` 的 `DialogHost` 里**入队**，
//     真正画出来的那一层用的是 `--z-modal: 80`（`public/css/theme.css:99`）；
//   · 本 Mod 的局内浮窗挂在 `<body>` 上、`.sp-dja__win { z-index: 950 }`（style.js）⇒ **无论怎么调透明度都在它上层**；
//   · 两条 0.4.x 的补丁（`classList.add('is-modal')` / `state.modalOn`）都只是在"让浮窗挪开"这条路上打转，
//     治不了"宿主的确认框本身就在 80 这层、而它下面还压着一整个 `.app-root` 里的游戏设置弹窗"这个事实。
//   ⇒ 服主的处方是对的：**别用它的弹窗**。自己画一个挂在 `<body>`、`z-index` 远高于浮窗的确认层。
//
// ============================ 实现要点 ============================
// ① **纯 DOM，不用 Preact**：这个弹窗在两处都会被用到 —— 局内浮窗（那里有 vendor preact）与固定设置页
//    （那里没有）。用原生 DOM 建节点 ⇒ 两处同一份实现、零加载依赖。
// ② **层级**：`#sp-dja-confirm { z-index: 10050 }` —— 高于本 Mod 的浮窗（950）、高亮层（900）、
//    「？」气泡层（9998）；也远高于宿主的 modal(80) / toast(90) / tooltip(95) / rotate(100)。
//    于是"看不见"与"点不到"这两件事**同时**被结构性地解决（不需要 MutationObserver、不需要猜宿主何时弹窗）。
// ③ **一次只留一个**：再调一次会把上一个按"取消"结掉（Promise 一定会被 resolve，不会吊住调用方）。
// ④ **键盘**：Esc = 取消、Enter = 确认；打开时把焦点放到确认键，关闭时还给原来的元素。
// ⑤ **卸载安全**：`closeConfirm()` 是幂等的；元素被外部移除时也不会抛（所有 DOM 操作都包在 try 里）。
// ⑥ 本文件整体是普通 JS（**没有模板字面量**）⇒ 不受"模板字面量里不许出现反引号"那条纪律影响。

import { installStyle } from './style.js';

/** 确认层的根 id（验收判据）。 */
export const CONFIRM_ID = 'sp-dja-confirm';

/**
 * ★① 弹确认时把局内浮窗**让开**（给它加 `is-modal`）。
 *
 * 为什么由本文件直接操作 DOM，而不是让面板回调（`onModalOpen`）通知浮窗：
 *   · 0.4.0 用 `el.classList.add('is-modal')` ⇒ 被 700ms 心跳重绘抹掉；
 *   · 0.5.0 改成把状态写进 vnode 的 `class` ⇒ 实测**没生效**（`out/adapt/dj-all-027-micro.txt`：`winCls` 里没有 is-modal）；
 *   · 0.6.0 试过"面板回调 → fab.setModal → 给宿主容器加类"，**仍然没生效**（同一份取证里 `fabModal:false`、`hostCls:""`，
 *     而同一次实测的 `sectionCbs:"mm"` 证明那两条回调 prop **确实到了组件**）。
 *   ⇒ 三次都失败的共同点是"这件事要经过面板/回调/重绘这条链"。本文件是**唯一自己知道"确认框开着"**的一方，
 *     直接找到浮窗的宿主容器加类 —— Preact 只管那个容器的**子节点**，永远不覆写容器自己的 class，
 *     所以这是唯一对重绘免疫、也不需要任何透传的写法。
 *
 * ★★ 定位方式刻意**不 import 任何 id 常量**：靠浮窗自己带的 `data-dja-win` 属性**反查它的父容器**。
 *   理由（这轮踩出来的）：`import { WIN_HOST_ID } from './fab.js'` 会让**已有的 `style.js` 多出一个 named export**，
 *   一旦浏览器混载了新老版本（刷新时命中旧缓存），就会 `SyntaxError: does not provide an export named …`
 *   ⇒ **整个 Mod 连 setup 都跑不到**，玩家看到的现象正是"所有动作都不生效"。
 *   本写法对"新文件"仍然需要 import，但对**已有模块的导出面零改动** ⇒ 少一类会整包炸掉的耦合。
 */
function setWinAside(doc, on) {
  try {
    if (!doc || typeof doc.querySelector !== 'function') return false;
    const win = doc.querySelector('.sp-dja__win[data-dja-win]');
    const box = win && win.parentElement;
    if (!box || !box.classList) return false;
    box.classList.toggle('is-modal', !!on);
    return box.classList.contains('is-modal');
  } catch { return false; }
}

/** 当前打开的那一个（同一时刻只可能有一个）。 */
let cur = null;

/** 现在有没有确认框开着（dev / E2E 用）。 */
export function isConfirmOpen() { return !!cur; }

/**
 * 关掉当前的确认框并按 `result` 结掉它的 Promise（幂等）。
 * @param {boolean} [result]
 */
export function closeConfirm(result = false) {
  const c = cur;
  if (!c) return;
  cur = null;
  try { setWinAside(c.doc, false); } catch { /* ignore */ }        // ★① 浮窗回来
  try { c.doc.removeEventListener('keydown', c.onKey, true); } catch { /* ignore */ }
  try { if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el); } catch { /* ignore */ }
  try { const f = c.prevFocus; if (f && typeof f.focus === 'function' && (f.isConnected !== false)) f.focus(); } catch { /* ignore */ }
  try { c.resolve(!!result); } catch { /* ignore */ }
}

/**
 * 弹一个本 Mod 自己的二次确认框。
 * @param {{ title?:string, text?:string, okText?:string, cancelText?:string, danger?:boolean }} [opts]
 * @param {Document} [doc]
 * @returns {Promise<boolean>} 确认 = true；取消 / Esc / 点遮罩 / 被新的顶掉 = false
 */
export function askConfirm(opts = {}, doc = globalThis.document) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (!doc || !doc.body || typeof doc.createElement !== 'function') return Promise.resolve(false);
  try { installStyle(doc); } catch { /* ignore */ }
  closeConfirm(false);                                   // ★ 同一时刻只留一个（上一个按"取消"结掉）

  return new Promise((resolve) => {
    let prevFocus = null;
    try { prevFocus = doc.activeElement; } catch { /* ignore */ }

    const el = doc.createElement('div');
    el.id = CONFIRM_ID;
    el.className = 'sp-dja__cfm-wrap' + (o.danger ? ' is-danger' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');

    const back = doc.createElement('div');
    back.className = 'sp-dja__cfm-back';

    const box = doc.createElement('div');
    box.className = 'sp-dja__cfm';

    const title = doc.createElement('div');
    title.className = 'sp-dja__cfm-title';
    title.textContent = String(o.title || '确认');

    const text = doc.createElement('div');
    text.className = 'sp-dja__cfm-text';
    text.textContent = String(o.text || '');

    const row = doc.createElement('div');
    row.className = 'sp-dja__cfm-row';

    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'sp-dja__cfm-btn is-cancel';
    cancel.textContent = String(o.cancelText || '取消');

    const ok = doc.createElement('button');
    ok.type = 'button';
    ok.className = 'sp-dja__cfm-btn is-ok';
    ok.textContent = String(o.okText || '确定');

    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(title);
    if (text.textContent) box.appendChild(text);
    box.appendChild(row);
    el.appendChild(back);
    el.appendChild(box);

    const onKey = (e) => {
      if (!e) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeConfirm(false); }
      else if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); closeConfirm(true); }
    };
    cancel.addEventListener('click', (e) => { e.preventDefault(); closeConfirm(false); });
    ok.addEventListener('click', (e) => { e.preventDefault(); closeConfirm(true); });
    back.addEventListener('click', (e) => { e.preventDefault(); closeConfirm(false); });
    box.addEventListener('click', (e) => { try { e.stopPropagation(); } catch { /* ignore */ } });
    doc.addEventListener('keydown', onKey, true);

    (doc.body || doc.documentElement).appendChild(el);
    cur = { el, doc, resolve, onKey, prevFocus };
    setWinAside(doc, true);                                          // ★① 浮窗让开（挂上类再聚焦）
    try { ok.focus(); } catch { /* ignore */ }
  });
}

/** 供断言用：确认层的 z-index 口径（写在 style.js，这里只留一个自证常量）。 */
export const CONFIRM_Z = 10050;
