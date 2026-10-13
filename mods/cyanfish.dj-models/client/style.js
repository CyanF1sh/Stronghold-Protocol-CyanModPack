// mods/cyanfish.dj-models/client/style.js — 「🎉 DJ 整活」设置栏位的样式（**只加 `.sp-djb*` 新类**）。
//
// ★ 为什么这一栏从"零样式"变成"自备一份"：规范 `docs/MODS.md` §4.12.2 要求**长说明一律收进「？」小圈**，
//   而小圈必须有 CSS（`::after { content: attr(data-tip) }`）。★ 工序 52 更正：0.2.2 起宿主 `ui` 句柄
//   **已经**暴露了 `ui.Tooltip` / `ui.TooltipLayer`（§6.2，工序 46）；本栏**暂时仍自备一份**，因为它在
//   「独立 Preact 根弹窗」里也会被渲染，而宿主 `.tooltip` 画不到那种弹窗之上（`isolation:isolate`，
//   详见 `docs/MODS.md` §4.12.2 二那条层叠限制）。Mod 依旧不许 import 宿主内部模块（§4.6 纪律 4）。
//   ⇒ 只能自备一份。做法与既有的两个 Mod 完全一致（`cyanfish.skinvoice` 的 `.sp-sv__info`、
//   `cyanfish.mod-settings` 的 `.sp-ms__*`）：**幂等注入、选择器全部带前缀、不碰宿主任何 class 与 CSS**。
//
// ★ 尺寸一律用 rem：宿主按视口缩放根字号（桌面 1920 时 1rem≈100px，手机 40px），写死 px 会在 4K / 手机上翻车。
//
// ★★ 工序 43：本文件是**新增**的（v1.6.0 及以前这一栏刻意不注入 <style>，只靠内联样式）。
//   新增的三类：① 分组小标题（与 `cyanfish.skinvoice` 的 `.sp-sv__group` / `.sp-sv__groupname` 同一套观感）；
//   ② ？小圈（形状与配色照 §4.12.2 的规范条文：圆形 .17rem / 描边 --line-3 / hover 与 focus 用薄荷 token /
//   弹出面板 --bg-2 + --line-2 + 2px 圆角 + 深阴影、宽 3.1rem、可换行）；③ 状态读数行与分组开关胶囊。
//
// ★ 本文件整体是 JS 模板字符串 —— 注释里不能出现反引号。

const STYLE_ID = 'sp-mod-cyanfish.dj-models-style';

const CSS = `
/* 栏位根：分组之间留一个 gap（宿主 .set-list 本身只在行之间排 gap，分组要自己排） */
.sp-djb__group { display: flex; flex-direction: column; gap: .16rem; }
.sp-djb__group + .sp-djb__group { margin-top: .12rem; }
/* 分组小标题：中文，不用英文 eyebrow（用户口径：英文副标题一律清掉） */
.sp-djb__groupname { font-size: .13rem; letter-spacing: .14em; color: var(--text-dim);
  padding-bottom: .06rem; border-bottom: 1px solid var(--line); }

/* ---- ★★ 「？」小圈（规范形状，与 cyanfish.skinvoice / docs/MODS.md §4.12.2 逐值一致） ---- */
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

/* ---- 分组开关胶囊（9 个分组收在一行里，省掉 9 行） ---- */
.sp-djb__grid { grid-column: 2 / 4; justify-self: start; display: flex; flex-wrap: wrap; align-items: center;
  gap: max(.06rem, 4px); min-width: 0; }
.sp-djb__chip { min-width: 0; height: max(.32rem, 22px); padding: 0 .1rem; background: #0a0d0c;
  border: 1px solid var(--line-2); color: var(--text-lo); font: inherit; font-size: max(.15rem, 11px);
  line-height: 1; cursor: pointer; white-space: nowrap;
  transition: color .12s var(--ease-out), border-color .12s var(--ease-out), background-color .12s var(--ease-out); }
.sp-djb__chip:hover { border-color: var(--line-3); color: var(--text-md); }
.sp-djb__chip.is-on { background: var(--mint-a10); border-color: var(--mint-800); color: var(--mint-400); }

/* ---- 整数帧输入框那一格（输入框 + 「帧」单位，占第 2 列） ---- */
.sp-djb__numwrap { grid-column: 2 / 3; justify-self: stretch; display: flex; align-items: center;
  gap: .06rem; min-width: 0; }
.sp-djb__unit { font-size: .15rem; color: var(--text-lo); margin-left: .06rem; white-space: nowrap; }

/* ---- 状态读数（规范 §4.12.2 的「状态读数」例外：会变的值，允许一行、--text-dim、带 data-*） ---- */
.sp-djb__ro { grid-column: 2 / 4; justify-self: start; color: var(--text-dim);
  font-size: max(.13rem, 10px); line-height: 1.6; white-space: normal; overflow-wrap: anywhere; }

/* ---- 恢复默认那一行（按钮落在第 2 列，与其它控件左边缘对齐） ---- */
.sp-djb__act { grid-column: 2 / 3; justify-self: start; display: flex; flex-wrap: wrap; align-items: center;
  gap: max(.08rem, 6px); min-width: 0; }

/* ---- 页脚版本自证 ---- */
.sp-djb__ver { margin: .06rem 0 0; color: var(--text-dim); font-size: max(.12rem, 9px); line-height: 1.6; opacity: .8; }
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
