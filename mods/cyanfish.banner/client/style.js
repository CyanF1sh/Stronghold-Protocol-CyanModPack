// mods/cyanfish.banner/client/style.js — 本 Mod 的样式（只加 .sp-bn* 新类）。
//
// ★ 规范 §6.4-3：能用宿主已有的 class 就用；这里补的是宿主没有的那一条「横幅带」。
// ★ 尺寸一律用 rem（宿主按视口缩放根字号）+ var(--t) 字号系数，写死 px 会在 4K / 手机上一起翻车。
// ★ 宽度与内边距**对齐** `.lobby-body`（public/css/screens/lobby.css：max-width 19.2rem、
//   padding 左右 .6rem、水平居中）—— 否则横幅会比它下面的卡片宽出一条，一眼就看出是外挂的。
//
// ★ 位置契约（首页 `lobby.banners`）：插槽是 `.screen`（flex 纵向容器）的直接子节点、位于 `.topbar` 之后、
//   `.lobby-body` 之前 ⇒ 这里必须 `flex: none`（横幅不参与剩余空间的分配，`.lobby-body` 照旧吃掉全部余量）。
//
// ★ 位置契约（对局 `game.banners`，0.2.3 · 工序 77）：插槽是 `.gm__hud`（`inset:0` 的绝对定位层）的直接子节点，
//   对局界面**全是绝对定位**、没有流内空行 ⇒ 本 Mod 的变体 `.sp-bn--game` 自己 `position:absolute`，
//   占满顶部一条 `.46rem` 高的窄带（`top:0`，自带不透明底衬，单行），宽度上限 7.32rem
//   （< 官方 ticker 的 7.6rem）。宿主不为它写一行 CSS。

const STYLE_ID = 'sp-mod-cyanfish.banner-style';

const CSS = `
.sp-bn { flex: none; display: flex; flex-direction: column; gap: .06rem; width: 100%; max-width: 19.2rem;
  margin: 0 auto; padding: .12rem .6rem 0; }
.sp-bn__row { display: flex; align-items: center; gap: .12rem; min-height: .4rem; padding: .06rem .16rem;
  border: 1px solid var(--line); border-left-width: 2px; background: linear-gradient(90deg, rgba(78, 216, 175, .10), rgba(0, 0, 0, .35) 45%);
  color: var(--text-hi); font-size: calc(.18 * var(--t)); line-height: 1.5; }
.sp-bn__row.is-warn { border-left-color: var(--amber); background: linear-gradient(90deg, rgba(246, 163, 41, .14), rgba(0, 0, 0, .35) 45%); }
.sp-bn__row.is-danger { border-left-color: var(--red-premium); background: linear-gradient(90deg, rgba(231, 49, 24, .16), rgba(0, 0, 0, .35) 45%); }
.sp-bn__dot { flex: 0 0 auto; width: .12rem; height: .12rem; background: var(--mint-500);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.sp-bn__row.is-warn .sp-bn__dot { background: var(--amber); }
.sp-bn__row.is-danger .sp-bn__dot { background: var(--red-premium); }
.sp-bn__text { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-bn__link { flex: 0 0 auto; color: var(--mint-400); font-size: calc(.16 * var(--t)); text-decoration: underline; }
/* ---- 对局内（插槽 game.banners，0.2.3 · 工序 77）------------------------------------------------------
   ★ 形态 = **弹幕**（服主口径「类似弹幕的从靠顶部的右侧飘过 + 半透明 + 点击穿透，这样就不用太考虑遮挡问题」）：
     自右向左横穿靠顶部的一条 0.34rem 高通道（top 1.0rem，即官方 .ticker 用的那一条），单次 9 秒，
     每 45 秒再飘一次；整层 pointer-events:none（★ 用 !important 压过宿主 .gm__hud > * 的 auto）。
   ★ 为什么不做常驻横幅带（真机量过）：对局界面全是绝对定位 —— 顶栏 .gtop 占 0 ~ 0.82rem，
     官方 .ticker 占 1.0 ~ 1.3rem（那一条已经分给了它），盟约带 .gm__bonds 从 1.36rem 起，
     官方「回合」框在顶栏正中（1920 时 y 39 ~ 83）⇒ 常驻横幅必然长期压住「回合」框或盟约带。
     弹幕把遮挡变成**瞬时**的（任一固定位置只被经过 2~4 秒）⇒ 这是唯一既能显示又不长期占位的形式。
   ★ 半透明：整行 .78 + 底衬 .55（底下是 .ticker 那条带/盟约带上方，没有正文数据）；文字用极轻的
     1px 暗描边（text-shadow）保证在战场画面上也读得清 —— 只加描边、不加背景块，避免视觉重量。
   ★ 无障碍：@media (prefers-reduced-motion: reduce) 下**不位移**，改为原地静态短显（9 秒）。
   ★ 零痕迹：没有活跃公告 ⇒ 组件返回 null ⇒ 对局内 DOM 与上游**逐字节相同**。 */
.sp-bn--game { position: absolute; left: 0; right: 0; top: 1.0rem; height: .34rem; overflow: hidden;
  pointer-events: none !important; }
.sp-bn--game .sp-bn__row { position: absolute; top: 0; left: 100%; will-change: transform;
  min-height: 0; height: 100%; width: max-content; max-width: 7.6rem; overflow: hidden; padding: 0 .2rem;
  animation: sp-bn-danmaku 9s linear 1 both;
  opacity: .78; background: rgba(6, 9, 8, .55); border-left: 2px solid var(--mint-500); }
.sp-bn--game .sp-bn__text { text-shadow: 0 1px 2px rgba(0, 0, 0, .9), 0 0 3px rgba(0, 0, 0, .7); }
.sp-bn--game .sp-bn__row.is-warn { border-left-color: var(--amber); }
.sp-bn--game .sp-bn__row.is-danger { border-left-color: var(--red-premium); }
.sp-bn--game .sp-bn__row.is-paused { animation-play-state: paused; }
@keyframes sp-bn-danmaku {
  from { transform: translateX(0); }
  to   { transform: translateX(calc(-100vw - 100%)); }
}
@media (prefers-reduced-motion: reduce) {
  .sp-bn--game .sp-bn__row { animation: none; left: 50%; transform: translateX(-50%); max-width: 7.32rem; }
  .sp-bn--game .sp-bn__row.is-static { animation: none; }
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
