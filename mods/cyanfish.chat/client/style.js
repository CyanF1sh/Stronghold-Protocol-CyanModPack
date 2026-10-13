// mods/cyanfish.chat/client/style.js — 本 Mod 的样式（只加 `.sp-chat__*` / `.sp-cm__*` 新类）。
//
// ★ 类名空间（docs/MODS.md §4.12.9.2）：本 Mod 占两个前缀 ——
//   `.sp-chat__*`（右侧聊天面板 + 左下角开关键）· `.sp-cm__*`（对局内那条弹幕通道的第二个生产者）。
//   宿主已有的控件（`.set-row` / `.set-toggle` / `.set-seg` / `.gm__gear` / `ui.Button`）**照用不照抄**。
//
// ★ 字号一律 `calc(<比例> * var(--t))`（§4.12.9.5）：玩家在官方「设置 → 文字大小」调档时本面板跟着变。
//   默认档 `--t: 1rem` ⇒ 与写死 rem 逐值相同。**布局值（宽 / 高 / 间距 / 圆角）一律用 rem，不读 `--t`**。
//
// ★ 颜色只用宿主 token（theme.css 的 `--mint-*` / `--text-*` / `--line-*` / `--bg-*` / `--amber`），
//   唯一的 `rgba()` 是**半透明底衬**（宿主没有"面板半透明底"这一档 token），理由写在使用处那一行。
//
// ★ `!important` 的唯一用法是 `game.banners` 通道的 `pointer-events: none`（§4.12.9.6 的 R3/R11：
//   宿主 `.gm__hud > *` 是 `auto` ⇒ 不压过它，一条盖满整幅宽的通道会拦掉底下所有点击）。
//
// ★ 动效必须有降级（R10）：`.sp-cm__row` 的飘过动画在 `prefers-reduced-motion: reduce` 下改成
//   原地静态短显（`animation: none` + 居中）。
//
// ★★ 与「实时横幅公告」共用同一条通道的**让位契约**写在 client/plan.js 的仲裁小节；本文件只负责形态。
//   两条弹幕的**形态参数有意同值**（`top: 1.0rem`、高 `.34rem`、自右向左、行 `opacity:.78`），
//   但**视觉可区分**：本 Mod 加一颗说话人的名字与 `[聊]` 方标、左侧描边用 `--mint-500`。

const STYLE_ID = 'sp-mod-cyanfish.chat-style';

const CSS = `
/* ==================================================================================================
   ① 右侧聊天面板（挂在 <body> 的独立 Preact 根里 —— 不在 .app-root 内部，所以不受它的
      isolation:isolate / overflow:hidden 影响，也不会被任何一次宿主重渲染冲掉）
   ================================================================================================== */
/* 根节点：铺满视口但**不吃指针**（空的覆盖层不该拦掉战场上的点击）；真正的面板块自己开 auto。 */
.sp-chat { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
/* ★★ 右边界为什么不是 .26rem（与商店条同一个边距）而是 .96rem —— **真机实测撞出来的**：
   官方 .gm__effects（生效效果那一列，game.css:444 的 right:.3rem; top:2.4rem）与面板同在右上角
   那条竖带，真机量到它占 x 1828.2 ~ 1890（宽 61.8px，@1rem=100px）⇒ 面板若停在 .26rem
   （右缘 1894）就会**盖住那一列图标**。⇒ 面板右缘退到 x 1820（.96rem）把它整列让出来。
   ★ 为什么不改 .gm__effects 的 right：那是**宿主**的定位，而且它的注释写明这一列是**故意**
   「跟着就绪数往下让」（game.css:445-447，手机上防止撞到就绪计数）⇒ 该让位的是**我们**。
   ★ 改动已用真机 getBoundingClientRect 复核：.gm__effects 与面板**不再相交**（见报告「真机取证」）。 */
.sp-chat__box {
  position: absolute; right: .96rem; top: 1.42rem;
  width: 3.6rem; max-width: calc(100vw - 1.2rem);
  /* 高度上限：顶部让开盟约带（1.36rem），底部让开商店条（2.24rem 卡 + .48rem 工具行 + .2rem 边距）。 */
  height: min(5.4rem, calc(100vh - 4.1rem));
  display: flex; flex-direction: column; min-height: 2.2rem;
  background: rgba(12, 16, 15, .92);   /* 宿主没有"面板半透明底"这一档 token ⇒ 唯一一处 rgba（半透明是需求） */
  border: 1px solid var(--line-2); border-top: 2px solid var(--mint-700);
  box-shadow: 0 .08rem .3rem rgba(0, 0, 0, .55);
  pointer-events: auto;
  font-family: var(--font-cjk);
}
/* 收起态：**右上角一枚方块图标键**，大小与官方「生效效果」那一列的单框**相同**（.5rem × .5rem），
   摆在**那一列的正上方**；风格照官方左下角那排图标键（.gm__gear）——**只有一个 SVG 图标、没有文字**。
   ★★ 服主口径（2026-10-12 第三轮）：「聊天框现在在右侧的 EFFECTS 单独一个框很奇怪，我的建议是收起时
     只显示一个框 + 聊天 SVG 图标（风格类似左下的设置栏），大小与右侧 EFFECTS 单框相同，置于 EFFECTS
     栏的上方」。
   ★ 为什么不是"一枚竖排窄标签"（上一版）：那一版是 .56rem × 1.5rem 的**竖向长条 + 竖排文字**，
     夹在一列 .5rem 方块（EFFECTS）旁边显得是两个语族的控件。
   ★ 具体数值的来历（都是**量的**，不是猜的）：
     · 尺寸 = 官方 .effect（game.css:449-450 的 width:.5rem; height:.5rem）⇒ 收起态与 EFFECTS 单框同大；
     · right:.3rem = 官方 .gm__effects 的 right（game.css:444）⇒ **与那一列右对齐**（实测两者右缘都是 1890）；
       ★ 刻意**不跟** .gm__gear 的 .24rem / bottom:.24rem：那是**左下角**那一排的边距，
       跟着它反而与 EFFECTS 错开 6px；
     · top:1.72rem = 让"图标键 + 它对下那一个框"正好落在 EFFECTS 列的顶边（2.4rem）之上 ——
       算式：2.4 − .5(自己) − .12(gap) − .06(视觉间隙) = 1.72。
   ★ 外观（背景 / 描边 / hover）与 .gm__gear 同值，这样它与左下角那排是**一家人**，
     与它下方那列 EFFECTS 又是**同一尺寸**。 */
.sp-chat__tab {
  position: absolute; right: .3rem; top: 1.72rem; width: .5rem; height: .5rem;
  display: grid; place-items: center; padding: 0;
  background: rgba(8, 11, 10, .85); border: 1px solid var(--line-2);
  color: var(--text-lo); cursor: pointer; pointer-events: auto;
  transition: color var(--t-fast), border-color var(--t-fast);
}
.sp-chat__tab:hover { color: var(--mint-400); border-color: var(--mint-700); }
/* ★★ 坑（必须显式写，否则 hidden 属性不起作用）：浏览器对 [hidden] 的默认 display:none 来自
   **UA 样式表**，而上面那条 .sp-chat__tab { display: grid } 是**作者样式** ⇒ 作者样式胜出，
   于是 el.hidden = true 时元素**照样显示**（真机上会让"收起态的图标键"与"展开的面板"同时出现）。
   ★ 这条不是本 Mod 独有的问题：任何给元素设了 display 又用 hidden 属性切换的地方都会踩到。
   （预览页就是这么切的：它用 hidden 属性；本 Mod 自己的渲染层走 Preact 条件渲染 return null，
     不依赖 hidden 属性 —— 这一条是给前者兜底。） */
.sp-chat__tab[hidden], .sp-chat__box[hidden], .sp-chat__dot[hidden] { display: none; }
/* 图标尺寸照官方 .gm__gear .icon（game.css:469 的 .28rem）；颜色由容器的 currentColor 定（不写死颜色）。 */
.sp-chat__tab svg { width: .28rem; height: .28rem; }
/* ★★ 未读提示：**只有一颗红点**（服主口径：「仅显示一个提示红点**不显示数字**」）。
   绝对定位在图标键的右上角。★ 颜色用宿主 --red-premium（theme.css:45），不另造颜色。 */
.sp-chat__dot {
  position: absolute; right: -.03rem; top: -.03rem; width: .16rem; height: .16rem;
  background: var(--red-premium); border: 1px solid var(--bg-1); border-radius: 50%;
}

/* ---- 顶栏：一个短标签 + 两个动作键 ---------------------------------------------------------------- */
.sp-chat__head {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: .1rem;
  padding: .1rem .12rem .08rem; border-bottom: 1px solid var(--line);
}
.sp-chat__title { color: var(--text-hi); font-size: calc(.16 * var(--t)); letter-spacing: .06em; }
.sp-chat__acts { display: flex; align-items: center; gap: .08rem; }
.sp-chat__icon {
  width: .3rem; height: .3rem; display: grid; place-items: center; padding: 0;
  background: none; border: 1px solid var(--line-2); color: var(--text-lo); cursor: pointer;
  transition: color var(--t-fast), border-color var(--t-fast);
}
.sp-chat__icon:hover { color: var(--mint-400); border-color: var(--mint-700); }
.sp-chat__icon .icon, .sp-chat__icon svg { width: .16rem; height: .16rem; }

/* ---- 消息流 ------------------------------------------------------------------------------------- */
.sp-chat__feed {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: .08rem; padding: .1rem .12rem;
  scrollbar-width: thin; scrollbar-color: var(--line-2) transparent;
}
.sp-chat__empty { margin: auto .1rem; color: var(--text-lo); font-size: calc(.15 * var(--t)); text-align: center; }
.sp-chat__msg { display: flex; flex-direction: column; gap: .02rem; }
.sp-chat__who { color: var(--mint-400); font-size: calc(.14 * var(--t) * var(--sp-chat-fs, 1)); }
.sp-chat__who.is-me { color: var(--text-lo); }
.sp-chat__text {
  color: var(--text-hi); font-size: calc(.17 * var(--t) * var(--sp-chat-fs, 1)); line-height: 1.5;
  overflow-wrap: anywhere; white-space: pre-wrap;
}
.sp-chat__msg.is-sys .sp-chat__text { color: var(--text-lo); font-size: calc(.14 * var(--t) * var(--sp-chat-fs, 1)); }
.sp-chat__msg.is-err .sp-chat__text { color: var(--amber); font-size: calc(.14 * var(--t) * var(--sp-chat-fs, 1)); }

/* ---- 底栏：输入 + 计数 + 发送 ------------------------------------------------------------------- */
.sp-chat__foot { flex: none; border-top: 1px solid var(--line); padding: .08rem .12rem .1rem; }
.sp-chat__inputrow { display: flex; align-items: flex-end; gap: .08rem; }
.sp-chat__field { flex: 1 1 auto; min-width: 0; min-height: .6rem; resize: none; }
.sp-chat__meta {
  display: flex; align-items: center; justify-content: space-between; gap: .1rem;
  margin-top: .06rem; color: var(--text-dim); font-size: calc(.12 * var(--t));
}
.sp-chat__count { font-family: var(--font-num, monospace); }
.sp-chat__count.is-over { color: var(--amber); }

/* ---- 设置页那一栏（插槽 settings.sections）-------------------------------------------------------
   ★ 「？」小圈的**规范形状**照 docs/MODS.md §4.12.2 二：圆 .17rem / 描边 --line-3 / 圆角 50% / cursor:help，
     hover 与 focus 时转 mint；弹出面板 --bg-2 底 + --line-2 描边 + 2px 圆角 + 深阴影，宽 3.1rem。
   ★★ 与宿主 .tooltip **同观感**，但**不并存原生 title**（R7）：无障碍与触屏由 aria-label +
     tabindex="0" + :focus::after 承担。
   ★ 已知取舍（诚实登记，与 skinvoice 同一份结论）：纯 CSS 小圈**不做视口夹取**，矮视口 + 长标签时
     弹出面板的顶可能被 overflow 祖先（宿主 .modal__body 是 overflow:auto）截掉 ⇒ 长度上限是防裁手段。 */
.sp-chat__info {
  flex: none; width: .17rem; height: .17rem; display: inline-grid; place-items: center; position: relative;
  border: 1px solid var(--line-3); border-radius: 50%; color: var(--text-dim); cursor: help;
  font-size: calc(.12 * var(--t)); line-height: 1;
}
.sp-chat__info:hover, .sp-chat__info:focus { border-color: var(--mint-500); color: var(--mint-400); outline: none; }
.sp-chat__info::after {
  content: attr(data-tip); position: absolute; left: 0; bottom: calc(100% + .06rem); z-index: 6;
  width: 3.1rem; padding: .08rem .1rem; background: var(--bg-2); border: 1px solid var(--line-2);
  border-radius: 2px; box-shadow: 0 .1rem .3rem rgba(0, 0, 0, .7);
  color: var(--text-lo); font-size: calc(.14 * var(--t)); line-height: 1.6; white-space: normal;
  opacity: 0; visibility: hidden; transition: opacity var(--t-fast) var(--ease-out);
}
.sp-chat__info:hover::after, .sp-chat__info:focus::after { opacity: 1; visibility: visible; }
/* 状态读数：一行小字、--text-dim、≤ 40 全角字、带 data-* 标记（§4.12.8.3 允许的那一类）。 */
.sp-chat__hint { margin-top: .06rem; color: var(--text-dim); font-size: calc(.13 * var(--t)); }

/* ---- 窄视口（手机）：展开的面板占满宽度（否则 3.6rem 在 40px/rem 下比屏幕还宽）-------------------
   ★ 收起态的图标键仍贴**右上角**，只把边距收窄（手机没有 .3rem 那种余量）。 */
@media (max-width: 767px) {
  .sp-chat__box { right: .12rem; left: .12rem; width: auto; top: 1.16rem; height: calc(100vh - 3.4rem); }
  .sp-chat__tab { right: .12rem; top: 1.46rem; }
}

/* ==================================================================================================
   ② 对局内弹幕通道（插槽 game.banners 的**第二个**生产者；形态与 cyanfish.banner 同值、可区分）
   ================================================================================================== */
.sp-cm { position: absolute; left: 0; right: 0; top: 1.0rem; height: .34rem; overflow: hidden;
  /* ★ R3/R11：宿主 .gm__hud > * 是 auto ⇒ 必须压过它，否则一条盖满整幅宽的通道会拦掉底下所有点击。 */
  pointer-events: none !important; }
.sp-cm__row {
  position: absolute; top: 0; left: 100%; will-change: transform;
  display: flex; align-items: center; gap: .08rem; height: 100%; width: max-content;
  max-width: 7.6rem; overflow: hidden; padding: 0 .2rem;
  border-left: 2px solid var(--mint-500);
  background: rgba(6, 9, 8, .55);   /* 与横幅同值的半透明底衬（宿主无此 token；半透明是需求） */
  color: var(--text-hi); font-size: calc(.18 * var(--t) * var(--sp-cm-fs, 1)); line-height: 1.5;
  opacity: .78;
  /* ★ 起点是 left:100%（行首贴在右缘之外）。时长与位移都由**行内样式 / 注入的关键帧**给
     （见 client/danmaku.js 的 injectKeyframes）：位移取决于正文实测宽度，写死在 CSS 里只能对某一种宽度正确。
     ★ 「暂停」也走**行内样式**（animation-play-state）而不是这里的类：§4.12.9.6 的 R3 规定
     !important 只能用来压 pointer-events，而行内样式本来就压过类，不需要 !important。 */
}
.sp-cm__badge { flex: 0 0 auto; color: var(--mint-500); font-size: calc(.16 * var(--t)); }
.sp-cm__who { flex: 0 0 auto; max-width: 2.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--mint-400); }
.sp-cm__sep { flex: 0 0 auto; color: var(--text-dim); }
/* ★★ 正文：overflow:hidden + nowrap ⇒ 永远不会长到多行（服务端也限了长度，这是第二道）。 */
.sp-cm__text { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .9), 0 0 3px rgba(0, 0, 0, .7); }
/* ★ R10：系统开了「减少动态效果」⇒ 不位移，改为原地静态短显（居中、限宽）。
   ★ 这里**只**给限宽（left 与 transform 由 danmaku.js 用**行内样式**给 —— 行内样式压过基础规则，
     不需要 !important，见上面那条 R3 的说明）。 */
@media (prefers-reduced-motion: reduce) {
  .sp-cm__row { max-width: 7.32rem; }
}
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

/** 供断言用（测试里比对结构契约）。 */
export const STYLE_ELEMENT_ID = STYLE_ID;
export const STYLE_TEXT = CSS;
