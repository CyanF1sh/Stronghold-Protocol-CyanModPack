// mods/cyanfish.dj-bgm/client/style.js — 本 Mod 的样式（只加 `.sp-djb*` 新类，不动宿主的任何 class）。
//
// ★ 规范 §6.4-3：能用宿主已有的 class 就用。设置栏位本体的行/开关/下拉**全部复用宿主的**
//   （`.set-row` / `.set-toggle` / `.lo-select`，见 public/css/screens/game.css:599 与 loadout.css:119），
//   这里只补宿主没有的三样：下拉的落位（`.set-row` 是三列 grid，控件要跨 2~3 列）、出处小字、版本行。
// ★ 尺寸一律用 rem：宿主按视口缩放根字号（桌面 1920 时 1rem≈100px，手机 40px），写死 px 会在 4K/手机上翻车。

const STYLE_ID = 'sp-mod-cyanfish.dj-bgm-style';

const CSS = `
.sp-djb { display: flex; flex-direction: column; gap: .1rem; min-width: min(5.6rem, 84vw); }
/* ★★ 工序 43：分组小标题 + 「？」小圈（形状与配色照 docs/MODS.md §4.12.2 的规范条文，
   与 cyanfish.skinvoice 的 .sp-sv__info / cyanfish.dj-models 的 .sp-djb__info 逐值一致）。 */
.sp-djb__group { display: flex; flex-direction: column; gap: .16rem; }
.sp-djb__groupname { font-size: .13rem; letter-spacing: .14em; color: var(--text-dim);
  padding-bottom: .06rem; border-bottom: 1px solid var(--line); }
.sp-djb__info { position: relative; display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; width: .17rem; height: .17rem; margin-left: .07rem; border: 1px solid var(--line-3); border-radius: 50%;
  color: var(--text-lo); font-size: .115rem; line-height: 1; cursor: help; outline: none;
  transition: color .12s var(--ease-out), border-color .12s var(--ease-out); }
.sp-djb__info:hover, .sp-djb__info:focus { border-color: var(--mint-500); color: var(--mint-400); }
.sp-djb__info::after { content: attr(data-tip); position: absolute; left: 50%; bottom: 165%; transform: translateX(-50%);
  width: 3.1rem; padding: .09rem .11rem; border: 1px solid var(--line-2); border-radius: 2px; background: var(--bg-2);
  color: var(--text-md); font-size: .125rem; line-height: 1.6; letter-spacing: .01em; text-align: left; white-space: normal;
  box-shadow: 0 4px 14px rgba(0,0,0,.35); opacity: 0; visibility: hidden; pointer-events: none; z-index: 9;
  transition: opacity .12s var(--ease-out); }
.sp-djb__info:hover::after, .sp-djb__info:focus::after { opacity: 1; visibility: visible; }
.sp-djb__ctl { grid-column: 2 / 4; justify-self: start; display: flex; align-items: center; gap: .1rem; min-width: 0; }
.sp-djb__ctl--off { opacity: .55; }
.sp-djb__sel {
  height: max(.38rem, 26px); min-width: 3.2rem; max-width: 100%;
  padding: 0 .3rem 0 .1rem; border: 1px solid var(--line-2); outline: none; cursor: pointer;
  font: inherit; font-size: max(.15rem, 11px); color: var(--text-hi); background-color: #0a0d0c;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%234ed8af' d='M7 9l5 6 5-6z'/></svg>");
  background-repeat: no-repeat; background-position: right .06rem center; background-size: .2rem .2rem;
  -webkit-appearance: none; appearance: none;
}
.sp-djb__sel:focus-visible { border-color: var(--mint-700); }
.sp-djb__sel option { background: var(--bg-2); color: var(--text-hi); }
.sp-djb__src { margin: 0; color: var(--text-dim); font-size: .13rem; line-height: 1.7; word-break: break-word; }
.sp-djb__ver { margin: 0; padding-top: .08rem; border-top: 1px solid var(--line); color: var(--text-dim); font-size: .13rem; }
.sp-djb__empty { margin: .24rem .1rem; color: var(--text-lo); font-size: .16rem; text-align: center; }
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
