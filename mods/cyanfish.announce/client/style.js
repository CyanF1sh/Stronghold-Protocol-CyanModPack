// mods/cyanfish.announce/client/style.js — 本 Mod 的样式（只加 .sp-an__* / .sp-an--* 新类）。
//
// ★ 规范 §6.4-3：能用宿主已有的 class 就用；这里只补宿主没有的部分（公告卡片）。
// ★ 尺寸一律用 rem（宿主按视口缩放根字号：桌面 1920 时 1rem≈100px，手机 40px），写死 px 会在 4K / 手机上一起翻车。
//
// ★★ 布局契约（有断言盯着，见 verify_announce.mjs 的 [D] 段）：
//   · `.sp-an` **自身不是滚动区**（没有 overflow / max-height）；
//   · 滚动区是 `.sp-an__list`；
//   · 提示行 `.sp-an__note` 挂在滚动区**外面** —— 若把它放进滚动区（曾经就是这样），
//     公告一多它就被顶到可视区之外，玩家在弹窗底边只看得见"半截字"（真机截图复现过）。
//
// ★ 为什么单独一个文件：`section.js`（模组设置里的「公告」栏位）也要注入同一份样式，
//   而 `index.js` 要 import `section.js` —— 样式留在 index.js 里会形成循环 import。

const STYLE_ID = 'sp-mod-cyanfish.announce-style';

const CSS = `
.sp-an { display: flex; flex-direction: column; gap: .12rem; min-width: min(5.6rem, 84vw); }
.sp-an__bar { display: flex; align-items: center; justify-content: space-between; gap: .12rem; }
.sp-an__count { color: var(--text-lo); font-size: .14rem; }
.sp-an__list { display: flex; flex-direction: column; gap: .14rem; max-height: 4.9rem; overflow: auto; padding-right: .04rem; }
.sp-an__item { padding: .14rem .16rem; border: 1px solid var(--line); border-left-width: 2px; background: var(--bg-1); }
.sp-an__item.is-warn { border-left-color: var(--amber); }
.sp-an__item.is-danger { border-left-color: var(--red-premium); }
.sp-an__head { display: flex; align-items: baseline; justify-content: space-between; gap: .12rem; margin-bottom: .06rem; }
.sp-an__title { margin: 0; font-size: .19rem; font-weight: 700; color: var(--text-hi); }
.sp-an__meta { flex: 0 0 auto; display: flex; align-items: baseline; gap: .08rem; }
.sp-an__badge { padding: .02rem .07rem; border: 1px solid var(--mint-700); color: var(--mint-400); font-size: .12rem; letter-spacing: .04em; }
.sp-an__date { color: var(--text-dim); font-family: var(--font-num); font-size: .14rem; white-space: nowrap; }
.sp-an__body { display: flex; flex-direction: column; gap: .06rem; }
.sp-an__p { margin: 0; color: var(--text-md); font-size: .17rem; line-height: 1.7; word-break: break-word; }
.sp-an__note { margin: 0; padding-top: .1rem; border-top: 1px solid var(--line); color: var(--text-lo); font-size: .14rem; }
.sp-an__ver { margin: 0; color: var(--text-dim); font-size: .13rem; }
.sp-an__empty { margin: .24rem .1rem; color: var(--text-lo); font-size: .16rem; text-align: center; }
.sp-an--flat { min-width: 0; }
.sp-an--flat .sp-an__list { max-height: none; overflow: visible; padding-right: 0; }
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
