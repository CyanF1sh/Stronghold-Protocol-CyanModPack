// mods/cyanfish.chat/client/index.js — 「对局内聊天」的界面侧（L4）。本 Mod 的入口。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → render(<App/>) → GET /mods → import(本文件) → setup(hostApi)
//
// 本文件做四件事，每一件都落在**已存在**的宿主契约上（没有新开任何插槽）：
//   ① 订阅一次入站的 `m.danmaku`（`net.on` 派发任何 S2C 类型；没有监听者时什么都不发生）；
//   ② 把**右侧可收起聊天面板**渲染进挂在 `<body>` 的独立 Preact 根 ——
//      宿主 `UI_SLOTS` 里没有"对局内右侧常驻面板"这一格，而 Mod 不许自己往受控子树里塞节点
//      （§6.4-3），宿主构建里也没有 `createPortal`（§6.4-2）⇒ 与 `cyanfish.mod-settings` 同一条路；
//   ③ 往 `game.banners`（对局内顶部那条弹幕通道）注册**弹幕层**（可选，设置页可关）；
//   ④ 往 `settings.sections`（官方设置弹窗）注册**本 Mod 那一栏**，走
//      `globalThis.__SP_MODSETTINGS__` 的跨 Mod 注册表（§4.8；本目录里那份 `registry.js`
//      与外壳**逐字节相同**）。
//
// ★★ 五条实现纪律（与 `cyanfish.banner` / `cyanfish.danmaku` 同源，都踩得到）：
//   1. **setup 必须尽快返回。** extensions.js 是 `for (...) { await setup(...) }` 顺序装载的 ——
//      一旦在这里 await 数据的到来，排在后面的 Mod 就要等我们。所以 setup 里只**同步注册**
//      插槽 + 订阅一次 `m.danmaku`；真正的取数在组件自己的 useEffect 里。
//      （★ 唯一的 await 是拿 `/vendor/preact.module.js` —— 那是**同源同 URL 的模块加载**，
//        与 `cyanfish.mod-settings` 的做法一致，且失败时安静降级。）
//   2. **返回值只能是"同步的"**：返回 dispose 函数（不是 Promise）。
//   3. **没有可用内容时零痕迹**：不弹窗、不注入 <style>、组件返回 `null`（Preact 的 null **不产生节点**）。
//   4. **绝不抛**：所有路径 try/catch，失败只留一条 warn 日志（规范 §1.3 约束 2 / §6.6）。
//   5. **不发网络请求**：本 Mod 没有任何轮询。消息是**推**过来的（服务端 `m.danmaku` 广播），
//      页面只在有人按发送时出一条 `g.danmaku`。
//
// ★★ 绝不把正文当 HTML：正文只出现在 `<span class="sp-chat__text">${text}</span>` 的**文本子节点**位置
//    （Preact 对字符串子节点走 document.createTextNode）。本目录里没有、也不允许出现
//    `innerHTML` / `dangerouslySetInnerHTML` / 任何 HTML 解析路径。

import { settingsRegistry, SETTINGS_API } from './registry.js';
import { installStyle } from './style.js';
import { DanmakuLayer } from './danmaku.js';
import { ChatPanel, readCfgSafe } from './panel.js';
import { renderChatSection, SECTION_ID, SECTION_ORDER, SECTION_TITLE } from './section.js';
import { readChatCfg } from './plan.js';
import { startFeed } from './state.js';

const MOD_ID = 'cyanfish.chat';
/** 弹幕层的插槽（★ 与「实时横幅公告」同一条；让位契约见 client/plan.js）。 */
const SLOT_GAME = 'game.banners';
/** 面板根的挂载点 id（与其它 Mod 的挂载点区分开）。 */
const HOST_ID = 'sp-mod-cyanfish.chat-root';

/** 面板是不是"对局中"才该出现（首页 / 房间页不该有一条聊天窗）。 */
function inMatch(state) {
  try { return !!(state && state.match && (state.match.public || state.match.phase)); } catch { return false; }
}

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ ui / slots / data / mod / log …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  const disposers = [];
  const log = api?.log || (typeof console !== 'undefined' ? console : { warn() {} });

  try {
    installStyle(globalThis.document);
  } catch { /* 样式不可用不影响逻辑 */ }

  // ---- ① 订阅入站消息（幂等；没有 net 时拿到一个空退订）-----------------------------------------
  try {
    const off = startFeed();
    if (off) disposers.push(off);
  } catch (e) { try { log.warn?.('[' + MOD_ID + '] 订阅 m.danmaku 失败（忽略）', e); } catch { /* ignore */ } }

  // ---- ② 右上角聊天面板（独立根，见文件头）------------------------------------------------------
  const panel = mountPanel({ api, log });
  if (panel) disposers.push(() => panel.dispose());

  // ---- ③ 弹幕层（可选一半；注册失败不影响面板）--------------------------------------------------
  try {
    const names = api?.slots?.names || {};
    if (names.GAME_BANNERS === SLOT_GAME) {
      disposers.push(api.slots.register(SLOT_GAME, () => api.ui.html`<${DanmakuLayer} api=${api} />`));
    } else {
      // 老宿主（没有这条插槽）⇒ 静默不工作。★ 不要改成"往 DOM 里塞一个"：Preact 下一次渲染就把它冲掉。
      try { log.warn?.('[' + MOD_ID + '] 宿主没有 ' + SLOT_GAME + ' 插槽，弹幕层不可用（聊天面板照常）'); } catch { /* ignore */ }
    }
  } catch (e) { try { log.warn?.('[' + MOD_ID + '] 注册弹幕层失败（忽略）', e); } catch { /* ignore */ } }

  // ---- ④ 设置页那一栏（走跨 Mod 注册表；没有外壳也照常注册）-------------------------------------
  try {
    const reg = settingsRegistry();
    if (reg.apiVersion !== SETTINGS_API) log.warn?.('[' + MOD_ID + '] 注册表版本 ' + String(reg.apiVersion) + ' ≠ ' + String(SETTINGS_API));
    const undo = reg.register({
      id: SECTION_ID,
      title: SECTION_TITLE,
      order: SECTION_ORDER,
      // ★ 故意**不传 micro**：服主口径是「英文 eyebrow / 副标题一律清掉」。
      render: renderChatSection({ api }),
    });
    disposers.push(() => { try { undo?.(); } catch { /* ignore */ } });
  } catch (e) { try { log.warn?.('[' + MOD_ID + '] 注册设置栏位失败（忽略）', e); } catch { /* ignore */ } }

  try { log.info?.('[' + MOD_ID + '] 已装载（对局内聊天 + 弹幕 + 设置栏）'); } catch { /* ignore */ }

  return () => {
    for (const d of disposers) { try { d?.(); } catch { /* ignore */ } }
    try { log.info?.('[' + MOD_ID + '] 已卸载'); } catch { /* ignore */ }
  };
}

/**
 * 把右侧聊天面板渲染进挂在 `<body>` 的独立 Preact 根。
 *
 * ★ 为什么不用宿主插槽直接渲染：宿主 `UI_SLOTS` 里没有"对局内右侧常驻面板"这一格；而把面板塞进
 *   `game.cornerActions`（左下角按钮排）或 `game.banners`（顶部通道）都会**改变官方那两处的布局**，
 *   而需求是"右侧一条可收起的小窗，不挡关键信息"。
 * ★ 为什么不用 `alertDialog`（§6.4-2 的富面板出口）：那是**模态**的 —— 打开即挡住并暂停操作，
 *   而聊天窗要在对局进行中**一直**开着且不吃战场的点击。
 * ★ 指针事件：根节点铺满视口但 `pointer-events: none`（见 style.js），只有面板 / 窄标签开 `auto`
 *   ⇒ 面板之外的地方点击照常落到战场上。
 *
 * @param {{ api:any, log:any }} ctx
 * @returns {{ open:Function, close:Function, dispose:Function }|null}
 */
function mountPanel({ api, log }) {
  let preact = null;
  let host = null;
  // ★ 拿不到 vendor preact ⇒ 面板不可用（安静降级；弹幕层与设置栏照常）。
  //   这里**同步**拿不到就只记一条 warn —— setup 不能为了这个 await（见文件头纪律 1）。
  const boot = (async () => {
    try { preact = await import('/vendor/preact.module.js'); } catch { preact = null; }
    if (!preact || typeof preact.render !== 'function') {
      try { log.warn?.('[' + MOD_ID + '] 面板不可用（拿不到 vendor preact）；弹幕层与设置栏照常'); } catch { /* ignore */ }
      return;
    }
    try {
      host = globalThis.document.createElement('div');
      host.id = HOST_ID;
      globalThis.document.body.appendChild(host);
      draw();
    } catch (e) { try { log.warn?.('[' + MOD_ID + '] 挂载聊天面板失败（忽略）', e); } catch { /* ignore */ } }
  })();

  const html = api?.ui?.html;
  /** 画一帧（对局中才画；不在对局里 ⇒ 渲染 null，DOM 零痕迹）。 */
  function draw() {
    if (!preact || !host || !html) return;
    try {
      const store = globalThis.__SP__?.store ?? null;
      const state = (() => { try { return store?.get?.() ?? null; } catch { return null; } })();
      const cfg = readChatCfg(readCfgSafe(api));
      const show = cfg.enabled === true && inMatch(state);
      preact.render(show ? html`<${ChatPanel} api=${api} />` : null, host);
    } catch (e) { try { log.warn?.('[' + MOD_ID + '] 渲染聊天面板失败', e); } catch { /* ignore */ } }
  }

  // ★ 面板是**对局内**的东西 ⇒ 订阅宿主应用 store：进局 / 出局时重画一次。
  //   宿主 store 的 subscribe 返回退订函数（public/js/store.js）。
  let offStore = null;
  try {
    const store = globalThis.__SP__?.store ?? null;
    if (store && typeof store.subscribe === 'function') offStore = store.subscribe(() => draw());
  } catch { /* 没有 store ⇒ 只画第一次（拿不到状态就是 null ⇒ 不画） */ }

  return {
    open: () => { draw(); },
    close: () => { try { if (preact && host) preact.render(null, host); } catch { /* ignore */ } },
    dispose: () => {
      try { offStore?.(); } catch { /* ignore */ }
      try { if (preact && host) preact.render(null, host); } catch { /* ignore */ }
      try { host?.remove?.(); } catch { /* ignore */ }
      void boot;
    },
  };
}
