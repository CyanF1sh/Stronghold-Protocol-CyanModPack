// mods/cyanfish.diy-34/client/style.js —— 「III阶」小圈（V3「深渊低语」）的**气泡材质与动效**。
//
// 为什么只有这一小块在客户端：写进数据的（data/backups.json 的 diy.slots[].voidedNote.style）只能表达
// **内联样式**——也就是小圈本体那些不受状态影响的声明；而下面这些东西**内联样式表达不了**，只能由 Mod 自己
// 注入一份 CSS（基座里因此搜不到任何一个颜色值，见 docs/MODS.md §4.9「三层分工」）：
//   ① 气泡（::after 伪元素）的底色 / 描边 / 阴影；
//   ② hover / focus 那两态的颜色变化；
//   ③ @keyframes（浏览器不许内联样式定义关键帧），以及 prefers-reduced-motion 降级。
//
// ★ 挂点用的是基座留的**中性空属性** data-sp-diy-note（基座自己不读它），不是基座的类名 .diy-tier-note
//   —— 类名是宿主实现细节，改版就断；data-sp-diy-note 是这条缝的公开契约。
// ★ 一次性注入 + 幂等：模块只求值一次，样式表用 data-screen 标记，重复装载（重载 / HMR）不会叠加。
// ★ 零注册者语义：没装 / 停用本 Mod ⇒ 这个文件**不会被请求、不会被求值**（宿主只 import 有 client/index.js
//   的已启用 Mod）⇒ 基座页面与没装它逐字节相同。
// ★★ 本文件（以及同目录的 index.js）里**一律不写反引号**：一是纪律，二是这份 CSS 本身由数组拼成、
//    将来若改成模板字面量，注释里的反引号会当场把它截断（基座 diy.js 上真发生过一次）。

const STYLE_MARK = 'cyanfish.diy-34.tier-note';

/**
 * V3「深渊低语」的样式表。
 *
 * 读数口径（都跟 --t，尺寸一律 rem —— docs/MODS.md §4.12.9 第 2/3 条）：
 *   · 小圈在 1920×1080 下是 max(.17rem,11px) = 11–17px，描边/发光必须克制，否则小尺寸下糊成一团；
 *   · 气泡宽 3.1rem（与基座 DIYTIP_CSS 同值，不重写）；
 *   · 唯一的动效（悬浮呼吸）配了 prefers-reduced-motion 降级。
 */
export const TIER_NOTE_CSS = [
  /* ---- 小圈本体：hover / focus 的加深（常态那组在数据里，由基座拼成内联样式） ---- */
  '[data-sp-diy-note]:hover, [data-sp-diy-note]:focus {',
  '  color: #ffe2dd;',
  '  border-color: var(--red-abyss, #ff0024);',
  '  box-shadow: inset 0 0 0 1px rgba(255, 0, 36, .5), 0 0 14px rgba(231, 49, 24, .6);',
  '  outline: none;',
  '}',

  /* ---- 气泡：暗血材质 + 顶部警告带（--red-abyss 那条 2px 横线） ---- */
  '[data-sp-diy-note]::after {',
  '  background: linear-gradient(180deg, rgba(38, 7, 7, .96), var(--bg-2, #1e2421));',
  '  border: 1px solid rgba(255, 0, 36, .5);',
  '  border-top: 2px solid var(--red-abyss, #ff0024);',
  '  color: #ffd9d3;',
  '  font-size: max(calc(.13 * var(--t)), 10px);',
  '  box-shadow: 0 4px 18px rgba(0, 0, 0, .7), 0 0 18px rgba(231, 49, 24, .22);',
  '}',
  '[data-sp-diy-note]:hover::after, [data-sp-diy-note]:focus::after {',
  '  animation: sp-diy__pulse 1.6s var(--ease-out, cubic-bezier(.2, .8, .2, 1)) infinite;',
  '}',

  /* ---- 唯一的动效：红环呼吸 ---- */
  '@keyframes sp-diy__pulse {',
  '  0%, 100% { border-color: rgba(255, 0, 36, .5); box-shadow: 0 4px 18px rgba(0, 0, 0, .7), 0 0 12px rgba(231, 49, 24, .2); }',
  '  50% { border-color: rgba(255, 0, 36, .95); box-shadow: 0 4px 18px rgba(0, 0, 0, .7), 0 0 24px rgba(231, 49, 24, .5); }',
  '}',

  /* ---- 动效降级（§4.12.9 第 5 条：有关键帧就必须有这条） ---- */
  '@media (prefers-reduced-motion: reduce) {',
  '  [data-sp-diy-note]:hover::after, [data-sp-diy-note]:focus::after { animation: none; }',
  '}',
].join('\n');

let injected = false;

/**
 * 幂等注入（模块只求值一次；不碰宿主任何 CSS 文件）。SSR / 测试环境（没有 document）下是 no-op。
 * @param {Document|any} [doc]
 */
export function installTierNoteStyle(doc = globalThis.document) {
  if (injected || !doc || typeof doc.createElement !== 'function') return false;
  injected = true;
  const el = doc.createElement('style');
  el.setAttribute('data-screen', STYLE_MARK);
  el.textContent = TIER_NOTE_CSS;
  (doc.head || doc.documentElement).appendChild(el);
  return true;
}
