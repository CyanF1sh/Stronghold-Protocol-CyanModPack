// mods/cyanfish.mod-settings/client/style.js — 设置外壳的样式（只加 .sp-ms__* 前缀的新类）。
//
// ★ 规范 §6.4-3：能用宿主已有的 class 就用（外壳本身是宿主的 .modal / .set-list / .set-row），
//   这里只补宿主**没有**的那部分 —— "左侧竖排栏位 + 右侧内容"的两栏布局。
//   `.tabs` 是横排的（components.css:543），硬掰成竖排会跟宿主的 tab 指示条打架，所以自建最小一套。
// ★ 尺寸一律用 rem（宿主按视口缩放根字号：桌面 1920 时 1rem≈100px，手机 40px），
//   写死 px 会在 4K / 手机上一起翻车。
// ★★ 1.2.0：**字号一律写 calc(<比例> * var(--t))**，不再写死 rem —— 依据是宿主自己的口径
//   （`public/js/ui/settings.js:41`：文字根 `--t`「every readable font-size reads; **no layout value does**」，
//   `theme.css:139-142` 是它的四个档）。写死 rem 的后果是：玩家把「设置 → 文字大小」调大，
//   模组这一页**不跟着变大**（与官方设置页并排看就是两套观感）。
//   默认档 `--t: 1rem` ⇒ `calc(.17 * var(--t))` 与原来的 `.17rem` **逐值相同**，默认观感零变化。
//   尺寸 / 间距 / 圆角仍然用 rem（它们**不该**跟文字大小走）。
// ★ 颜色只用宿主 token（`--mint-a10` 那一族），不写死 rgba。

const STYLE_ID = 'sp-mod-cyanfish.mod-settings-style';

const CSS = `
.sp-ms__box { display: flex; align-items: stretch; gap: .16rem; min-height: 4.6rem; }
.sp-ms__nav { flex: 0 0 1.62rem; display: flex; flex-direction: column; gap: .06rem; padding-right: .14rem; border-right: 1px solid var(--line); }
.sp-ms__tab { display: flex; flex-direction: column; gap: .02rem; padding: .1rem .12rem .1rem .14rem; border: 0; border-left: 2px solid transparent;
  background: none; color: var(--text-lo); font-family: var(--font-cjk); font-size: calc(.17 * var(--t)); text-align: left; cursor: pointer;
  transition: color .12s var(--ease-out), background-color .12s var(--ease-out), border-color .12s var(--ease-out); }
.sp-ms__tab:hover { color: var(--text-hi); background: var(--mint-a10); }
.sp-ms__tab.is-active { color: var(--mint-400); background: var(--mint-a10); border-left-color: var(--mint-500); }
.sp-ms__tabmicro { color: var(--text-dim); font-size: calc(.12 * var(--t)); letter-spacing: .06em; }
.sp-ms__tab.is-active .sp-ms__tabmicro { color: var(--mint-700); }
.sp-ms__pane { flex: 1 1 auto; min-width: 0; }
/* ★★ 三档分段控件（声道模式 / 素材上游）在窄面板里放不下 —— 宿主的 .set-seg 是 nowrap、
   按钮 min-width .8rem，而 .set-row 左标签列固定 3.3rem ⇒ 剩下两列装不下 3×.8rem，
   第三档会被面板右缘裁掉（**点都点不到**）。面板宽度已在 index.js 提到 9rem（≥1180px 的桌面一行放下）；
   这里给更窄的视口兜底：**允许整组换行**（宁可换行，也不要把选项裁没）。
   选择器带 .sp-ms__pane 前缀 ⇒ 只影响本面板，不动宿主自己的设置面板。 */
.sp-ms__pane .set-seg { flex-wrap: wrap; }
.sp-ms__empty { margin: .3rem .1rem; color: var(--text-lo); font-size: calc(.16 * var(--t)); text-align: center; }
.sp-ms__gear { display: inline-flex; align-items: center; justify-content: center; }
.sp-ms__gear svg { width: .2rem; height: .2rem; }

/* ★★ 更新①：同一份面板挂在**官方设置弹窗**里时的形态（index.js 的 embedded=true）。
   ★ 为什么必须变：官方弹窗宽 7.4rem、内部左右各 .3rem 内边距 ⇒ 内容列 6.8rem；宿主 .set-row 的左标签列
     固定 3.3rem，若照搬独立弹窗的"左竖排栏位 + 右内容"，内容列只剩 ~5rem，三档分段控件（声道模式 /
     素材上游）会溢出到点不到。所以内嵌形态把栏位折成**顶部横排**，内容列整宽 —— 与手机端的折法同一套
     规则（宿主 .tabs 本来就是横排，观感一致），只是不依赖视口断点（弹窗宽度是 rem，与视口不成比例）。
   ★ 只作用于 .sp-ms__box--embed 内部 ⇒ 独立弹窗（顶栏齿轮那条路）视觉一个像素都不变。 */
.sp-ms__embed > .sp-ms__box--embed { display: flex; flex-direction: column; gap: .12rem; min-height: 0; }
.sp-ms__box--embed > .sp-ms__nav { flex: 0 0 auto; flex-direction: row; overflow-x: auto; gap: .04rem;
  padding: 0 0 .08rem; border-right: 0; border-bottom: 1px solid var(--line); }
.sp-ms__box--embed > .sp-ms__nav .sp-ms__tab { border-left: 0; border-bottom: 2px solid transparent; white-space: nowrap; padding: .07rem .16rem .09rem; }
.sp-ms__box--embed > .sp-ms__nav .sp-ms__tab.is-active { border-left-color: transparent; border-bottom-color: var(--mint-500); }
.sp-ms__box--embed > .sp-ms__pane { flex: 1 1 auto; min-width: 0; padding-top: 0; }
/* 内嵌时左右各再让出一点：官方 .set-row 的 min-height .44rem × 十几行已经很高，不额外加内边距 */
.sp-ms__embed { display: block; }

/* 窄屏（手机）把竖排栏位折成横排，否则内容区只剩一条缝 */
@media (max-width: 767px) {
  .sp-ms__box { flex-direction: column; gap: .1rem; }
  .sp-ms__nav { flex: 0 0 auto; flex-direction: row; overflow-x: auto; padding: 0 0 .08rem; border-right: 0; border-bottom: 1px solid var(--line); }
  .sp-ms__tab { border-left: 0; border-bottom: 2px solid transparent; white-space: nowrap; }
  .sp-ms__tab.is-active { border-left-color: transparent; border-bottom-color: var(--mint-500); }
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
  } catch { /* 静态托管 / 测试环境：样式不可用不影响逻辑 */ }
}
