// mods/cyanfish.dj-all/client/style.js — 设置页那一栏自己的样式（**只加 `.sp-dja__*` 新类**）。
//
// ★ 类名空间（`MODS.md §4.12.9.2`）：本 Mod 占前缀 **`sp-dja__*`**（缩写 `dja` ≤ 6 字符）。
//   状态修饰固定 `is-*`；**宿主已有的控件照用不照抄**（`.set-list` / `.set-row` / `.set-row__label` /
//   `.set-row__val` / `.set-range` / `.set-seg` / `.set-toggle` / `ui.Button`）。
//
// ★ 字号跟 `--t`（§4.12.9.5）：所有**可读文字**一律 `calc(<比例> * var(--t))`（玩家在官方「设置 → 文字大小」
//   调档时本面板跟着变）；**布局值（宽/高/间距/圆角）一律 rem，不读 `--t`**。
//   要极窄视口下限的地方用 `max(calc(...), <px>)`。
//
// ★ 颜色只用宿主 token（theme.css 的 `--mint-*` / `--text-*` / `--line-*` / `--bg-*` / `--amber` / `--red-premium`）。
//   唯一的 `rgba()` 是"警示条底衬"（宿主没有这一档 token），理由写在那一行。
//
// ★ 动效必须有降级（R10）：本文件唯一的动画是"选中/危险行的一点过渡"，在
//   `prefers-reduced-motion: reduce` 下关掉。
//
// ★ 为什么这一栏要自备一份 `<style>`：规范要求长说明收进「？」小圈，而小圈必须有 CSS
//   （`::after { content: attr(data-tip) }`）；且这一栏在「独立 Preact 根弹窗」（mod-settings 自己的齿轮弹窗）
//   里也会被渲染，宿主 `.tooltip` 画不到那种弹窗之上（层叠限制，`MODS.md §4.12.2` 二）
//   ⇒ 与既有的两个 Mod（skinvoice / dj-models）做法一致：**幂等注入、选择器全部带前缀、不碰宿主任何 class 与 CSS**。
//
// ★ 本文件整体是 JS 模板字符串 —— 注释里不能出现反引号。

const STYLE_ID = 'sp-mod-cyanfish.dj-all-style';

const CSS = `
/* 栏位根：两组之间留一个 gap（宿主 .set-list 只在行之间排 gap） */
.sp-dja__top { display: flex; flex-direction: column; gap: .16rem; }
.sp-dja__sec { display: flex; flex-direction: column; gap: .16rem; }
.sp-dja__sec + .sp-dja__sec { margin-top: .14rem; }
/* 分组小标题：中文，不用英文 eyebrow（用户口径：英文副标题一律清掉） */
.sp-dja__h { font-size: .13rem; letter-spacing: .14em; color: var(--text-dim);
  padding-bottom: .06rem; border-bottom: 1px solid var(--line); }

/* ---- ★★ 「？」小圈（规范形状，与 skinvoice / dj-models 逐值一致） ---- */
.sp-dja__info { position: relative; display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: .17rem; height: .17rem; margin-left: .07rem; border: 1px solid var(--line-3); border-radius: 50%;
  color: var(--text-lo); font-size: .115rem; line-height: 1; cursor: help; outline: none;
  transition: color .12s var(--ease-out), border-color .12s var(--ease-out); }
.sp-dja__info:hover, .sp-dja__info:focus { border-color: var(--mint-500); color: var(--mint-400); }
/* ★③ 气泡**不再**用 ::after：那是小圆点的子元素，会被祖先的 overflow 裁掉
   （弹窗 .modal__body{overflow:auto} + 我们的 .sp-dja__tree{overflow:auto}）⇒ 越靠边的「？」越看不全。
   现在由 client/tips.js 画在**挂在 body 的 fixed 层** #sp-dja-tip 上（见文件末尾那一节）。 */
#sp-dja-tip { position: fixed; inset: 0; z-index: 9998; pointer-events: none; }
.sp-dja__tip { position: fixed; max-width: 3.4rem; padding: .09rem .11rem; border: 1px solid var(--line-3);
  border-radius: 2px; background: var(--bg-2); color: var(--text-md); font-size: max(calc(.13 * var(--t)), 10px);
  line-height: 1.65; letter-spacing: .01em; text-align: left; white-space: normal; overflow-wrap: anywhere;
  box-shadow: 0 4px 14px rgba(0,0,0,.45); }

/* ---- 危险警示条 ---- */
.sp-dja__warn { display: flex; gap: .1rem; align-items: flex-start; padding: .1rem .12rem;
  border: 1px solid var(--amber); border-left-width: 3px; border-radius: 2px;
  background: rgba(246, 163, 41, .10);  /* 宿主没有"警示底衬"这一档 token ⇒ 唯一一处 rgba（半透明是需求） */
  color: var(--text-md); font-size: calc(.14 * var(--t)); line-height: 1.6; }
.sp-dja__warn b { color: var(--amber); font-weight: 700; }

/* ---- 未选中元素时的空态 ---- */
.sp-dja__empty { padding: .12rem .1rem; color: var(--text-lo); font-size: calc(.15 * var(--t)); line-height: 1.7; }
.sp-dja__empty b { color: var(--text-md); font-weight: 600; }

/* ---- 三档 + 参数区 ---- */
.sp-dja__side-by { display: flex; align-items: center; gap: .1rem; flex-wrap: wrap; }
.sp-dja__mode-note { color: var(--text-dim); font-size: max(calc(.12 * var(--t)), 10px); line-height: 1.6; }
/* 参数行的数值列：不换行（宿主 .set-row__val 自带 width:.5rem，内容一长就折行） */
.sp-dja__val { white-space: nowrap; width: auto; text-align: right; }
/* 帧输入框（"精确到帧"：键入 127 生效的就是 127 帧） */
.sp-dja__num { width: 100%; max-width: 2.4rem; height: .38rem; box-sizing: border-box; text-align: right;
  background: #0a0d0c; border: 1px solid var(--line-2); color: var(--mint-400);
  font-size: calc(.17 * var(--t)); font-variant-numeric: tabular-nums; padding: 0 .1rem; outline: none; }
.sp-dja__num:disabled { opacity: .45; cursor: not-allowed; }
.sp-dja__numwrap { grid-column: 2 / 3; justify-self: stretch; display: flex; align-items: center; gap: .06rem; min-width: 0; }
.sp-dja__unit { font-size: calc(.15 * var(--t)); color: var(--text-lo); margin-left: .06rem; white-space: nowrap; }
.sp-dja__range:disabled { opacity: .45; cursor: not-allowed; }
.sp-dja__segb { font: inherit; }

/* ---- 状态读数（规范 §4.12.2 的「状态读数」例外：会变的值，一行、--text-dim、带 data-*） ---- */
.sp-dja__ro { grid-column: 2 / 4; justify-self: start; color: var(--text-dim);
  font-size: max(calc(.13 * var(--t)), 10px); line-height: 1.6; white-space: normal; overflow-wrap: anywhere; }

/* ---- ★★ 可展开目录树 ---- */
/* ★③ overflow-anchor:none —— 滚动锚定是"点一个元素后视口跳到它那儿"的真凶之一：
   浏览器会在内容变化时挑一个"锚点元素"、把它的位置钉住 ⇒ 目录自己往上/往下挪。
   关掉它，再把"保 scrollTop"改成一次性的（见 section.js），滚动位置就完全由玩家掌握。 */
.sp-dja__tree { max-height: 6.4rem; overflow: auto; border: 1px solid var(--line); border-radius: 2px;
  padding: .06rem .04rem; background: #0a0d0c; overflow-anchor: none; }
.sp-dja__node { margin: 0; }
.sp-dja__node > summary { display: flex; align-items: center; gap: .06rem; cursor: pointer; list-style: none;
  padding: .035rem .06rem; border-radius: 2px; outline: none; }
.sp-dja__node > summary::-webkit-details-marker { display: none; }
.sp-dja__caret { flex: 0 0 auto; width: .12rem; color: var(--text-lo); font-size: calc(.12 * var(--t));
  transition: transform .12s var(--ease-out); }
.sp-dja__node[open] > summary > .sp-dja__caret { transform: rotate(90deg); }
.sp-dja__node > summary:hover { background: var(--bg-2); }
.sp-dja__kids { margin-left: .1rem; padding-left: .06rem; border-left: 1px solid var(--line); }
/* 叶子行：整行可点 ⇒ 选中它 */
.sp-dja__leaf { display: flex; align-items: center; gap: .06rem; padding: .03rem .06rem; border-radius: 2px;
  cursor: pointer; color: var(--text-md); font-size: calc(.145 * var(--t)); }
.sp-dja__leaf:hover { background: var(--bg-2); color: var(--text-hi); }
.sp-dja__leaf.is-sel, .sp-dja__node > summary.is-sel { background: var(--mint-a10); color: var(--mint-400); }
.sp-dja__leaf.is-un { opacity: .5; cursor: not-allowed; }
.sp-dja__leafname { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-dja__id { flex: 0 0 auto; color: var(--text-dim); font-size: max(calc(.11 * var(--t)), 9px); }
/* 档位徽章：关 = 灰、全局 = 蓝、独立 = 薄荷；有档位才显示文字，否则只显示一个点 */
.sp-dja__badge { flex: 0 0 auto; font-size: max(calc(.11 * var(--t)), 9px); line-height: 1.4; border-radius: 2px;
  padding: 0 .05rem; border: 1px solid var(--line-2); color: var(--text-lo); }
.sp-dja__badge.is-off { border-color: var(--line-2); color: var(--text-dim); }
.sp-dja__badge.is-global { border-color: var(--ice-600, var(--line-3)); color: var(--ice-400, var(--text-md)); }
.sp-dja__badge.is-own { border-color: var(--mint-700); color: var(--mint-400); }
/* ⚠ 危险标记（设置入口 / 含设置入口的整体） */
.sp-dja__danger { flex: 0 0 auto; font-size: calc(.14 * var(--t)); line-height: 1; color: var(--amber); cursor: help; }
.sp-dja__count { flex: 0 0 auto; color: var(--text-dim); font-size: max(calc(.11 * var(--t)), 9px); }

/* ---- 页脚版本自证 ---- */
.sp-dja__ver { margin: .06rem 0 0; color: var(--text-dim); font-size: max(calc(.12 * var(--t)), 9px); line-height: 1.6; opacity: .8; }

/* ================================================================================
   ★★ ③ 元素位置高亮（黄色外框）
   一个挂在 <body> 的全屏覆盖层：pointer-events:none ⇒ 不挡任何点击；
   黄框本身**不改宿主元素**（不加 class、不写内联样式），只是在我们自己的层里画同位置的框。
   颜色用高饱和黄 + 一圈深色描边：亮战场（雪地）与暗战场（夜战）都看得见。
   ================================================================================ */
#sp-dja-hl { position: fixed; inset: 0; z-index: 900; pointer-events: none; }
.sp-dja__hl { position: absolute; box-sizing: border-box; border: 2px solid #ffd54a;
  box-shadow: 0 0 0 1px rgba(0,0,0,.65), 0 0 10px rgba(255,213,74,.45);
  border-radius: 2px; pointer-events: none; }
/* 框上的标签：只在每个元素 id 的**第一个**框上挂，避免一屏几十个标签糊成一片 */
.sp-dja__hl-tag { position: absolute; left: -2px; top: -1.15em; white-space: nowrap;
  background: #ffd54a; color: #14100a; font-size: max(calc(.11 * var(--t)), 9px); line-height: 1.5;
  padding: 0 .05rem; border-radius: 2px; }

/* ================================================================================
   ★★ ② 局内独立入口（图标键）+ 它打开的半透明浮窗
   按钮尺寸 44px 与 client/fab.js 里的 FAB 尺寸常量一致（拖动换位置时按它算边界）。
   ================================================================================ */
.sp-dja__fab { position: fixed; z-index: 940; width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; cursor: grab;
  background: rgba(8,11,10,.55); border: 1px solid var(--line-3);
  box-shadow: 0 2px 10px rgba(0,0,0,.45); touch-action: none;
  transition: transform .12s var(--ease-out), border-color .12s var(--ease-out); }
.sp-dja__fab:hover { border-color: var(--mint-500); transform: scale(1.06); }
.sp-dja__fab.is-drag { cursor: grabbing; border-color: var(--mint-400); }
.sp-dja__fabimg { width: 38px; height: 38px; object-fit: contain; border-radius: 50%;
  pointer-events: none; user-select: none; }
/* ★ 只有**静态图**才加这个修饰类（动图自己会动；再加自转就成了双倍转速）。
   现状用的是真动图 ⇒ 这个类不会出现（见 fab.js 的 ASSET_ANIMATED）。 */
.sp-dja__fabimg--spin { animation: sp-dja-spin 6s linear infinite; }
@keyframes sp-dja-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* 半透明浮窗：不遮战场（这正是它存在的理由） */
.sp-dja__win { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 8.4rem; max-height: 9.8rem; display: flex; flex-direction: column; z-index: 950;
  opacity: var(--sp-dja-alpha, .72); background: rgba(10,13,12,.88);
  border: 1px solid var(--line-3); border-left-width: 3px; border-radius: 3px;
  box-shadow: 0 8px 28px rgba(0,0,0,.5); backdrop-filter: blur(2px); }
.sp-dja__winbar { flex: 0 0 auto; display: flex; align-items: center; gap: .06rem; cursor: move;
  padding: .06rem .1rem; border-bottom: 1px solid var(--line-2); background: rgba(0,0,0,.25); user-select: none; }
.sp-dja__win.is-dragging { backdrop-filter: none; }
/* ★① 确认期间把浮窗**彻底移出视野**（不再只是 opacity:0）。
   类打在**宿主容器** #sp-dja-win 上（不是 vnode 的 class）—— Preact 只管容器的子节点，
   永远不会覆写容器自己的 class ⇒ 对 700ms 心跳重绘免疫。理由与两次失败的写法见 client/fab.js 的 setModal 注释。 */
#sp-dja-win.is-modal { display: none !important; }
.sp-dja__wintitle { color: var(--text-hi); font-size: calc(.15 * var(--t)); font-weight: 600; }
.sp-dja__winsub { flex: 1 1 auto; min-width: 0; color: var(--text-dim); font-size: max(calc(.11 * var(--t)), 9px);
  text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-dja__winx { flex: 0 0 auto; background: none; border: 1px solid var(--line-2); color: var(--text-lo);
  border-radius: 2px; font-size: calc(.13 * var(--t)); line-height: 1.2; padding: 0 .05rem; cursor: pointer; }
.sp-dja__winx:hover { border-color: var(--red-premium); color: var(--red-premium); }
.sp-dja__winbody { flex: 1 1 auto; overflow: auto; padding: .08rem .1rem .12rem; overflow-anchor: none; }
/* 浮窗里的目录矮一点，别把窗口撑满（窗口要能"看着像浮在上面"） */
.sp-dja__float .sp-dja__tree { max-height: 3.6rem; }
.sp-dja__float { gap: .12rem; }

/* ================================================================================
   ★★ ① 本 Mod 自己的二次确认层（client/confirm.js）
   为什么不用宿主的 confirmDialog：它画在 .app-root 的 DialogHost 里、用的是 --z-modal: 80
   （public/css/theme.css:99）—— 与游戏内设置弹窗**同一层**，而本 Mod 的局内浮窗挂在 body 上、
   z-index 950 ⇒ 确认框必然被压住（服主 2026-10-14 的实测结论）。
   所以这里自己建一层挂在 body 上、z-index 10050：高于本 Mod 的浮窗(950)/高亮(900)/气泡(9998)，
   也远高于宿主的 modal(80)/toast(90)/tooltip(95)/rotate(100)。
   ================================================================================ */
#sp-dja-confirm { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: center;
  justify-content: center; }
.sp-dja__cfm-back { position: absolute; inset: 0; background: rgba(4,6,5,.66); }
.sp-dja__cfm { position: relative; z-index: 1; box-sizing: border-box; width: 5.2rem;
  max-width: calc(100vw - 1.1rem); max-height: calc(100vh - 1.1rem); overflow: auto;
  display: flex; flex-direction: column; gap: .14rem; padding: .18rem .2rem .16rem;
  background: var(--bg-2); border: 1px solid var(--line-3); border-left-width: 3px; border-radius: 3px;
  box-shadow: 0 14px 40px rgba(0,0,0,.6); }
.sp-dja__cfm-wrap.is-danger .sp-dja__cfm { border-left-color: var(--amber); }
.sp-dja__cfm-title { color: var(--text-hi); font-size: calc(.19 * var(--t)); font-weight: 600; line-height: 1.55; }
.sp-dja__cfm-text { color: var(--text-md); font-size: calc(.155 * var(--t)); line-height: 1.75;
  overflow-wrap: anywhere; }
.sp-dja__cfm-row { display: flex; justify-content: flex-end; gap: .1rem; margin-top: .04rem; }
.sp-dja__cfm-btn { font: inherit; font-size: calc(.16 * var(--t)); line-height: 1.5; padding: .06rem .18rem;
  border-radius: 2px; border: 1px solid var(--line-2); background: transparent; color: var(--text-md);
  cursor: pointer; transition: border-color .12s var(--ease-out), color .12s var(--ease-out); }
.sp-dja__cfm-btn:hover { border-color: var(--mint-500); color: var(--mint-400); }
.sp-dja__cfm-btn.is-ok { border-color: var(--line-3); color: var(--mint-400); }
.sp-dja__cfm-wrap.is-danger .sp-dja__cfm-btn.is-ok { border-color: var(--amber); color: var(--amber); }
.sp-dja__cfm-btn:focus-visible { outline: 2px solid var(--mint-500); outline-offset: 1px; }

@media (prefers-reduced-motion: reduce) {
  .sp-dja__info, .sp-dja__caret, .sp-dja__leaf, .sp-dja__node > summary, .sp-dja__fab,
  .sp-dja__cfm-btn { transition: none; }
  .sp-dja__fabimg--spin { animation: none; }   /* ★ 系统要求"减少动态效果"时，静态图不再自转（动图无法用 CSS 停） */
}
`;

/** 幂等注入（拿不到 document / 已经注入过就直接返回）。 */
export function installStyle(doc = globalThis.document) {
  try {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const el = doc.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(el);
  } catch { /* 静态托管 / Node 测试：样式不可用不影响逻辑 */ }
}

/** 供断言用。 */
export const STYLE_ELEMENT_ID = STYLE_ID;
export const STYLE_TEXT = CSS;
