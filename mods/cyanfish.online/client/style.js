// mods/cyanfish.online/client/style.js — 本 Mod 的样式（只加 .sp-on* 新类）。
//
// ★ 规范 §6.4-3：能用宿主已有的 class 就用。这枚胶囊刻意**复刻**宿主 `.ping`（public/css/components.css）
//   的形状与尺寸 —— 它俩在顶栏里是并排的兄弟节点，一个圆角、一个方角会立刻看出是两家人画的。
//   `.ping` 是宿主私有 class，Mod 不许改它，所以我们自己写一份同样的几何（高度 .32rem / 圆角 99px /
//   rgba(0,0,0,.5) 底 / var(--line) 描边 / --font-num 数字字体）。
// ★ 尺寸一律用 rem + var(--t) 字号系数（宿主按视口缩放根字号），写死 px 会在 4K / 手机上一起翻车。

const STYLE_ID = 'sp-mod-cyanfish.online-style';

const CSS = `
.sp-on { display: inline-flex; align-items: center; gap: .07rem; height: .32rem; padding: 0 .14rem;
  border-radius: 99px; background: rgba(0, 0, 0, .5); border: 1px solid var(--line);
  font-family: var(--font-num); font-size: calc(.17 * var(--t)); line-height: 1;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.sp-on__seg { display: inline-flex; align-items: baseline; gap: .04rem; }
.sp-on__k { color: var(--text-lo); font-size: calc(.14 * var(--t)); font-weight: 500; }
.sp-on__v { color: var(--mint-400); font-weight: 700; }
.sp-on__sep { color: var(--line-3); }
/* 连续失败若干周期 ⇒ 变暗表示"这个读数可能过时"，但**不消失**（消失会让玩家以为服务器挂了）。 */
.sp-on.is-stale { opacity: .55; }
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
