// mods/cyanfish.debug-console/client/style.js — 调试控制台的样式（**Mod 自带，一行宿主 CSS 都不加**）。
//
// 为什么自带：控制台面板是宿主 Modal 里的自定义内容（`.sp-dc__*`），宿主没有这几个 class；而 Mod 不许改宿主 CSS
// （`public/css/**` 是宿主的文件）。自注入 `<style>` 是**本项目既有先例**（cyanfish.skinvoice / dj-bgm /
// dj-models / mod-settings / announce 的 client/style.js 都是这一套），停用 Mod 时随 dispose 一起摘掉
// ⇒ 不装 / 停用本 Mod 时页面**零残留**。
//
// ★ 观感口径：尺寸 / 圆角 / 描边 / 颜色一律复用宿主 theme.css 的 token（`--bg-1/2` / `--line-2/3` / `--mint-400`
//   / `--mint-500` / `--amber` / `--text-dim` …），字号与 `.modal` 里的其它内容同档 —— 不出现"两套观感"。
// ★★ 工序 115 整改（`node <开发期脚本>/112-page-spec-audit.mjs` 的两条硬/软项）：
//   ① 类名从 `.dc*` 改成 **`.sp-dc__*`**（docs/MODS.md §4.12.9.2 的 R1 硬规则：自造类名必须是 `sp-<缩写>__<元素>`；
//      缩写 `dc` 已登记进那张表）。入口键那一个组合类也从 `.gm__gear.gm__console` 改成 `.gm__gear.sp-dc__gear`
//      （宿主的 `.gm__gear` 照用，自己的修饰类走自己的命名空间）。
//   ② 字号全部改成 `max(calc(<比例> * var(--t)), <px>)`（§4.12.9.5 的 R5：**可读文字**必须跟随「文字大小」；
//      px 只作极窄视口下限）。布局值（宽 / 高 / 间距 / 圆角）**不读** `--t` —— 与宿主同一口径。

export const MOD_ID = 'cyanfish.debug-console';

export const CSS = `
/* 入口键：与官方 设置 / 玩法说明 / 全屏 三个键**.56rem 逐值同尺寸**。
   ★ 为什么要这两行：宿主 Button 的 .btn--md（.5rem 高）是**单类**选择器、在 components.css 里；
   本文件由 Mod 运行时注入、在文档里**排在宿主样式之后**，同特异度 ⇒ 这两行赢，按钮与三键同高。
   （宽度 .56rem / 高度 .56rem / padding 0 = .gm__gear 的三个尺寸值，一个不改。） */
.gm__gear.sp-dc__gear { width: .56rem; height: .56rem; padding: 0; }
.gm__gear.sp-dc__gear .btn__icon { width: .28rem; height: .28rem; }
.gm__gear.sp-dc__gear.is-active { color: var(--mint-400); border-color: var(--mint-500); }
.gm__gear.sp-dc__gear:hover { color: var(--mint-400); border-color: var(--mint-700); }

/* 控制台：分类键 + 一栏内容。观感一律复用宿主 token，不出现"两套观感"。 */
.sp-dc { display: flex; flex-direction: column; gap: .14rem; }
.sp-dc__tabs { display: flex; flex-wrap: wrap; gap: .06rem; padding-bottom: .08rem; border-bottom: 1px solid var(--line-2); }
/* ★ 唯一的滚动容器（.sp-dc__body 是它的内容，不再自己滚）：工序 115 的滚动位置修复就挂在它身上。 */
.sp-dc__pane { min-height: 2.2rem; max-height: 4.4rem; overflow-y: auto; }
.sp-dc__body { display: flex; flex-direction: column; gap: .1rem; }
.sp-dc__state { display: grid; grid-template-columns: repeat(auto-fit, minmax(max(1.5rem, 96px), 1fr)); gap: .1rem; margin: 0; }
.sp-dc__stat { display: flex; flex-direction: column; gap: .02rem; padding: .08rem .1rem; background: var(--bg-2); border: 1px solid var(--line-2); }
.sp-dc__stat dt { font-size: max(calc(.12 * var(--t)), 9px); color: var(--text-dim); letter-spacing: .06em; }
.sp-dc__stat dd { margin: 0; font-size: max(calc(.2 * var(--t)), 13px); font-weight: 700; color: var(--text-hi); }
.sp-dc__row { display: flex; align-items: center; gap: .1rem; flex-wrap: wrap; }
/* 顶部固定栏（敌人 / 盟约两页）：贴着滚动区上沿，不随内容滚走 */
.sp-dc__topbar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: .1rem; flex-wrap: wrap;
  padding: .06rem 0; background: var(--bg-1); border-bottom: 1px solid var(--line-2); }
.sp-dc__sel { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: max(calc(.14 * var(--t)), 11px); color: var(--mint-400); }
.sp-dc__label { display: inline-flex; align-items: center; gap: .04rem; min-width: 1.1rem; white-space: nowrap; font-size: max(calc(.14 * var(--t)), 11px); color: var(--text-dim); }
.sp-dc__num { width: 1.1rem; }
.sp-dc__count { width: .74rem; }
.sp-dc__searchwrap { flex: 1 1 auto; min-width: 1.6rem; }
.sp-dc__chips { display: inline-flex; flex-wrap: wrap; gap: .04rem; align-items: center; }
.sp-dc__rows { display: flex; flex-direction: column; }
.sp-dc__listrow { display: flex; align-items: center; gap: .08rem; padding: .04rem .06rem; border-bottom: 1px solid var(--line-2); }
.sp-dc__listrow:hover { background: var(--bg-2); }
/* 可点选的行（敌人 / 盟约）：点一下就是"选中它"，顶部固定栏随后改的就是它 */
.sp-dc__listrow--pick { cursor: pointer; }
.sp-dc__listrow--pick.is-picked { background: var(--bg-2); box-shadow: inset 2px 0 0 var(--mint-500); }
.sp-dc__listrow--wrap { flex-wrap: wrap; }
.sp-dc__rowname { flex: 0 0 auto; font-size: max(calc(.14 * var(--t)), 11px); color: var(--text-hi); }
.sp-dc__rowsub { flex: 0 0 auto; font-size: max(calc(.12 * var(--t)), 9px); color: var(--text-dim); }
.sp-dc__rowid { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: max(calc(.11 * var(--t)), 9px); color: var(--text-dim); }
.sp-dc__rowacts { flex: 0 0 auto; display: inline-flex; gap: .04rem; align-items: center; }
.sp-dc__rowdesc { flex: 1 0 100%; font-size: max(calc(.11 * var(--t)), 9px); line-height: 1.4; color: var(--text-dim); }
.sp-dc__read { margin: 0; font-size: max(calc(.13 * var(--t)), 10px); color: var(--text-dim); }
.sp-dc__more { margin: 0; font-size: max(calc(.12 * var(--t)), 9px); color: var(--text-dim); }
.sp-dc__hint { margin: 0; font-size: max(calc(.13 * var(--t)), 10px); color: var(--text-dim); }
.sp-dc__gate { display: flex; align-items: center; gap: .06rem; margin: 0; font-size: max(calc(.13 * var(--t)), 10px); color: var(--amber); }
.sp-dc__gate .icon { width: max(.16rem, 11px); height: max(.16rem, 11px); }

/* 「？」小圈：规范形状与样式口径照 docs/MODS.md §4.12.2 二/三（纯 CSS 弹出、无原生 title）。 */
.sp-dc__info {
  display: inline-flex; align-items: center; justify-content: center; width: .17rem; height: .17rem;
  border: 1px solid var(--line-3); border-radius: 50%; cursor: help; position: relative;
  font-size: max(calc(.1 * var(--t)), 8px); line-height: 1; color: var(--text-dim);
}
.sp-dc__info:hover, .sp-dc__info:focus { border-color: var(--mint-500); color: var(--mint-400); outline: none; }
.sp-dc__info::after {
  content: attr(data-tip); position: absolute; left: 0; top: calc(100% + .06rem); z-index: 2;
  width: 3.1rem; padding: .08rem .1rem; white-space: normal; text-align: left;
  background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 2px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .45);
  font-size: max(calc(.12 * var(--t)), 10px); line-height: 1.45; color: var(--text-hi);
  opacity: 0; visibility: hidden; pointer-events: none;
}
.sp-dc__info:hover::after, .sp-dc__info:focus::after { opacity: 1; visibility: visible; }
`;

/**
 * 注入样式，返回 dispose（摘掉那个 `<style>`）。
 * @param {Document} [doc] 注入目标（测试可传一个假的）
 */
export function installStyle(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return () => {};
  const el = doc.createElement('style');
  el.setAttribute('data-mod', MOD_ID);
  el.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(el);
  return () => { try { el.remove(); } catch { /* ignore */ } };
}
