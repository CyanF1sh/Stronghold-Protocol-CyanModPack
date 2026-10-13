// mods/cyanfish.debug-console/client/index.js — 「调试控制台」：测试服专用的局内调试面板（客户端入口）。
//
// ★ 入口（服主口径 更新④「控制台 mod 应独立入口，不与设置入口共用」）：
//   宿主插槽 **`game.cornerActions`**（`UI_SLOTS.GAME_CORNER_ACTIONS`）= 对局中**左下角那一排按键的尾部**，
//   也就是官方 **设置 / 玩法说明 / 全屏** 三个键的**右侧**。它用的就是宿主那三个键的同一个 class
//   （`gm__gear`：同样 .56rem 见方、同一描边、同一 hover）+ 宿主 `Button` 的 `is-active` 薄荷强调，
//   所以和那三个键**是一家人**而不是外来控件。点开是宿主 `Modal` 里的控制台面板（client/panel.js）。
//
//   ★ 为什么不沿用 v1.0.0 的 `settings.sections`：控制台**改对局数据**，设置弹窗**放偏好**，目的不同（服主原话）。
//   ★ 为什么不做「自己往 DOM 里塞一个按钮」：`screens/game.js` 是 Preact 组件，塞进去的节点会被下一次渲染
//     冲掉（`public/js/ui/extensions.js` 文件头写明的理由）⇒ 只能走宿主插槽（宿主负责**在哪**、Mod 负责**放什么**）。
//   ★ 老宿主（没有这一格插槽）⇒ `api.slots.register()` 抛 ⇒ 本 Mod **安静降级**：不挂入口、页面零残留，
//     其余 Mod 不受影响。这与 v1.0.0 挂在设置弹窗里的行为不同，会记在 CHANGELOG 里。
//
// ★ 闸门（保留）：**仅单人 / 全 AI 对局**（`state.loneHuman`，与服务端 `Match.loneHuman` 同口径）
//   —— 多人房里**入口按钮根本不渲染**；服务端那一层（`server/match/debug.js debugAllowed`）照旧是唯一的权限。
// ★ 不碰 admin：全程不读 `SP_ADMIN_TOKEN`、不 request `/admin/api/*`。改状态走普通玩家会话里的一条
//   `g.debug { action, value }`（与 g.pause / g.buy 同一条通道，权限 = 本局本人）。
// ★ 拿了宿主两样「未文档化但既有先例」的东西：`globalThis.__SP__.store`（应用 store，cyanfish.skinvoice 同样用它）
//   与 `globalThis.__SP__.net`（发消息）—— 见 client/state.js；拿不到就是安静降级，绝不抛。

import { installStyle } from './style.js';
import { appStore, readView, sendDebug, digits, hasAction, clampNum, phaseHint, currentWave, TABS } from './state.js';
import { ConsoleView } from './panel.js';

export { ConsoleView } from './panel.js';
export { CSS, installStyle } from './style.js';
export { readView, sendDebug, digits, hasAction, clampNum, phaseHint, currentWave, TABS } from './state.js';

const MOD_ID = 'cyanfish.debug-console';

/** 面板要的那几样东西（一次算好交给视图，视图只管画）。 */
const panelProps = (api) => ({
  api,
  store: appStore(),
  read: () => readView(api),
  // ★ `sendDebug(action, value, id, list)`：第四个参数是 `setWaveList` 的整波敌人清单（`g.debug.list`）。
  fire: sendDebug,
  digits,
  hint: phaseHint,
  has: (a) => hasAction(readView(api), a),
  clamp: {
    round: (n) => clampNum(readView(api), 'round', n, 1),
    funds: (n) => clampNum(readView(api), 'funds', n, 0),
    lp: (n) => clampNum(readView(api), 'lp', n, 1),
  },
});

/**
 * 左下角那一格：一个 `.gm__gear` 按钮 + 它自己的面板（两个兄弟节点，面板不嵌在按钮里）。
 * `readView().loneHuman` 为假（多人房 / 还没开局）⇒ **什么都不渲染**（连按钮都没有）。
 * 订阅应用 store：开局、人数变化、阶段变化都会让这一格重新决定「在不在」。
 */
function ConsoleEntry(api) {
  return function DebugConsoleEntry() {
    const { html, Button, hooks: { useState, useEffect } } = api.ui;
    const store = appStore();
    const [, force] = useState(0);
    const [open, setOpen] = useState(false);
    useEffect(() => {
      if (!store?.subscribe) return undefined;
      const off = store.subscribe(() => force((n) => n + 1));
      return () => { try { off?.(); } catch { /* ignore */ } };
    }, []);
    if (!readView(api).loneHuman) return null;
    return html`${[
      html`<${Button} key="btn" variant="secondary" size="md" icon="edit"
        class="gm__gear sp-dc__gear" data-testid="debug-console-entry"
        title=${'调试控制台（仅单人 / 全 AI 对局）'} aria-label=${'调试控制台'} aria-expanded=${open ? 'true' : 'false'}
        onClick=${() => setOpen((v) => !v)} />`,
      open ? html`<${ConsoleView} key="panel" ...${panelProps(api)} onClose=${() => setOpen(false)} />` : null,
    ]}`;
  };
}

/**
 * Mod 入口（宿主 extensions.js 会 await；抛错 = 本 Mod 被跳过，其余 Mod 不受影响）。
 * @param {any} api hostApi
 */
export default function setup(api) {
  const log = api.log || console;
  const disposers = [];
  let dispose = null;
  try {
    const names = api.slots.names || {};
    const slot = names.GAME_CORNER_ACTIONS || 'game.cornerActions';
    dispose = api.slots.register(slot, ConsoleEntry(api));
    log.info?.(`[${MOD_ID}] 调试控制台入口已挂到 ${slot}（左下角三键右侧；仅单人 / 全 AI 对局中渲染）`);
  } catch (e) {
    // 老宿主没有这一格 ⇒ 安静降级：没有入口，但也不报错、不留垃圾（面板只在插槽里渲染）。
    log.warn?.(`[${MOD_ID}] 宿主没有 ${'game.cornerActions'} 插槽（旧版本？）：调试控制台没有入口，其余照常`, e);
  }
  try { disposers.push(installStyle()); } catch { /* 注入失败 ⇒ 面板少一层观感，功能不受影响 */ }
  if (dispose) disposers.push(dispose);
  return () => { for (const d of disposers) { try { d(); } catch { /* ignore */ } } };
}
