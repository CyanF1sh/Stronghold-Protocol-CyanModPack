// mods/cyanfish.music-overlay/client/style.js —— 本 Mod 的样式（只加 `.sp-mo*` 新类，不动宿主任何 class）。
//
// ★ 规范 §6.4-3：能用宿主已有的 class 就用。设置栏位的行 / 开关 / 分段选择**全部复用宿主的**
//   （`.set-row` / `.set-toggle` / `.set-seg`，见 public/css/screens/game.css:610-636），
//   这里只补宿主没有的：搜索框落位、状态读数、可滚动列表、行内动作、「？」小圈。
// ★ 尺寸口径 §4.12.9.5：字号用 `calc(n * var(--t))`（跟随宿主「文字大小」档），需要下限处用 `max(…, <px>)`。
// ★ 「？」小圈 = §4.12.2 二的**规范形状**（圆形 .17rem / 描边 --line-3 / hover 与 focus 时 --mint-500 + --mint-400
//   / 弹出面板 --bg-2 + --line-2 + 2px 圆角 + 深阴影 / 宽 3.1rem / white-space:normal），类名用自己的命名空间。

const STYLE_ID = 'sp-mod-cyanfish.music-overlay-style';

const CSS = `
.sp-mo { display: flex; flex-direction: column; gap: .12rem; min-width: min(6.4rem, 86vw); }
.sp-mo__group { display: flex; flex-direction: column; gap: .16rem; }
.sp-mo__groupname { font-size: calc(.13 * var(--t)); letter-spacing: .14em; color: var(--text-dim);
  padding-bottom: .06rem; border-bottom: 1px solid var(--line); }
.sp-mo__ctl { grid-column: 2 / 4; justify-self: start; display: flex; align-items: center; gap: .1rem; min-width: 0; max-width: 100%; }
.sp-mo__info { position: relative; display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: max(calc(.17 * var(--t)), 14px); height: max(calc(.17 * var(--t)), 14px);
  margin-left: .07rem; border: 1px solid var(--line-3); border-radius: 50%;
  color: var(--text-lo); font-size: calc(.115 * var(--t)); line-height: 1; cursor: help; outline: none;
  transition: color .12s var(--ease-out), border-color .12s var(--ease-out); }
.sp-mo__info:hover, .sp-mo__info:focus { border-color: var(--mint-500); color: var(--mint-400); }
.sp-mo__info::after { content: attr(data-tip); position: absolute; left: 0; bottom: 165%;
  width: 3.1rem; max-width: 70vw; padding: .09rem .11rem; border: 1px solid var(--line-2); border-radius: 2px; background: var(--bg-2);
  color: var(--text-md); font-size: calc(.125 * var(--t)); line-height: 1.6; letter-spacing: .01em; text-align: left; white-space: normal;
  box-shadow: 0 4px 14px rgba(0,0,0,.35); opacity: 0; visibility: hidden; pointer-events: none; z-index: 9;
  transition: opacity .12s var(--ease-out); }
.sp-mo__info:hover::after, .sp-mo__info:focus::after { opacity: 1; visibility: visible; }
.sp-mo__search { width: 100%; min-width: 0; height: max(calc(.38 * var(--t)), 26px); padding: 0 .12rem;
  border: 1px solid var(--line-2); outline: none; font: inherit; font-size: calc(.15 * var(--t));
  color: var(--text-hi); background: #0a0d0c; }
.sp-mo__search:focus-visible { border-color: var(--mint-700); }
.sp-mo__search::placeholder { color: var(--text-lo); }
.sp-mo__stat { margin: 0; color: var(--text-dim); font-size: calc(.13 * var(--t)); line-height: 1.7; word-break: break-word; }
.sp-mo__list { display: flex; flex-direction: column; gap: .04rem; max-height: min(4.2rem, 46vh); overflow-y: auto;
  padding: .06rem; border: 1px solid var(--line); background: rgba(0,0,0,.18); }
.sp-mo__row { display: flex; align-items: center; justify-content: space-between; gap: .1rem;
  min-height: max(calc(.42 * var(--t)), 30px); padding: .03rem .06rem; border-bottom: 1px solid var(--line); }
.sp-mo__row:last-child { border-bottom: 0; }
.sp-mo__rowmain { min-width: 0; display: flex; flex-direction: column; gap: .02rem; }
.sp-mo__name { font-size: calc(.15 * var(--t)); line-height: 1.35; color: var(--text-md); overflow-wrap: anywhere; }
.sp-mo__refs { font-size: calc(.12 * var(--t)); color: var(--text-lo); }
.sp-mo__acts { flex: 0 0 auto; display: flex; align-items: center; gap: .06rem; flex-wrap: wrap; justify-content: flex-end; }
.sp-mo__on { color: var(--mint-400); font-size: calc(.13 * var(--t)); }
.sp-mo__file { display: none; }
.sp-mo__empty { margin: .18rem .1rem; color: var(--text-lo); font-size: calc(.15 * var(--t)); text-align: center; }
.sp-mo__warn { margin: 0; color: var(--warn-400, var(--mint-400)); font-size: calc(.13 * var(--t)); line-height: 1.7; }
.sp-mo__ver { margin: 0; padding-top: .08rem; border-top: 1px solid var(--line); color: var(--text-dim); font-size: calc(.13 * var(--t)); }
`;

/** 幂等注入；拿不到 document（静态托管 / Node 测试）就静默跳过。 */
export function installStyle(doc = globalThis.document) {
  try {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const el = doc.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(el);
  } catch { /* 样式不可用不影响逻辑 */ }
}

/** 供断言用。 */
export const STYLE_ELEMENT_ID = STYLE_ID;
export const STYLE_TEXT = CSS;
