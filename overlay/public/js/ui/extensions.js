// Client mod channel (MOD SYSTEM): browser-only UI extensions shipped by mods/<id>/client/index.js.
//
// The Mod system has four landing axes; this file owns the fourth:
//   data/    → L1/L2 patches        (merged into /data/*.json — **both** hosts see the same JSON)
//   content/ → L3 battle behaviour  (installed on **both** hosts: the client simulates locally and the server
//                                    verifies, so a behaviour mod must be identical on both sides — DESIGN §14)
//   assets/  → mod-supplied art     (fallback search root for /assets/** — server/index.js)
//   client/  → **THIS FILE**: browser-only UI code. It never runs on the server and must have no effect there;
//              it hangs UI into named slots of the host screens (e.g. a button in the 干员调配 top bar).
//
// Why a slot registry rather than the mod injecting DOM itself: the screens are Preact components, so a node
// spliced into their DOM is wiped by the next render (the loadout screen re-renders on every selection change).
// A named slot is the smallest honest hook — the host owns *where*, the mod owns *what*.
//
// Wiring:
//   main.js  → loadClientMods() once at boot (fire-and-forget)
//   /mods    → every enabled mod with a `client` field carries its entry URL (server/index.js + server/mods/client.js)
//   import() → the module's default export (or a named `setup`) is called with the host API
//   screens  → render <UiSlot name="loadout.topbar" props=${…}/> (screens/loadout.js)
//              render <UiSlot name="loadout.rowActions" props=${…}/> (screens/loadout.js — one roster row's last column)
//              render <UiSlot name="loadout.detailVoice" props=${…}/> (screens/loadout.js — the detail panel, right below
//              the official 此干员语音 control, i.e. ui/operatorVoice.js OperatorVoice)
//              render <UiSlot name="loadout.diySlotActions" props=${…}/> (screens/diy.js — one 自选编队 slot's action column)
//              render <UiSlot name="settings.sections" props=${…}/> (ui/settings.js — the official 设置 dialog)
//              render <UiSlot name="game.cornerActions" props=${…}/> (screens/game.js — the in-match bottom-left button row)
//              render <UiSlot name="game.banners" props=${…}/> (screens/game.js — the in-match banner band, the narrow
//              strip right below the top bar, i.e. the one the official Ticker uses; 0.2.3 · 工序 77)
//
// ★ 0.2.3 · 工序 72：`loadout.topbarLeft` **撤除**（工序 64 为 cyanfish.skinvoice 的皮肤入口加的）。
//   服主的裁定是「顶栏左侧的皮肤控件不用留，顶栏只保留一个和官方相同的『设置』入口即可，因为右侧干员详情页
//   是默认展示的」⇒ 皮肤控件改放**详情面板**（新插槽 `loadout.detailVoice`，官方语音控件的下一行，
//   宽屏窄屏都在）。留着那条插槽就是**没有任何注册者的死插槽**（虽然空插槽零节点，但没有意义）⇒ 删掉。
//
// Failure is always contained: a broken / missing / old mod is logged and skipped, and `import()` of a URL a
// static host cannot serve simply yields no extensions — exactly like the battle-side mod layer (runner.js).

import { createStore, useStore } from '../store.js';
import { data } from '../data.js';
import { html, Icon, Button, MicroLabel, TextField, Modal, confirmDialog, alertDialog, Tooltip, TooltipLayer } from './components.js';
import { toast, toastError } from './toasts.js';
import { loadoutStore, setEntries } from './loadoutSync.js';
import * as loadoutModel from './loadoutModel.js';
import { useState, useRef, useEffect, useMemo, useCallback } from '../../vendor/hooks.module.js';

/** Host API version handed to a client mod's setup(). Bump when the shape below changes incompatibly. */
export const CLIENT_MOD_API = 1;

/**
 * Every slot a mod may register into. A mod naming a slot that is not here is rejected loudly (a typo would
 * otherwise fail silently, leaving the author hunting for "why is my button not there").
 */
export const UI_SLOTS = Object.freeze({
  /** 干员调配 top bar, right side — rendered immediately LEFT of the 已同步 status chip. */
  LOADOUT_TOPBAR: 'loadout.topbar',
  /**
   * 自选编队 (screens/diy.js SlotCard) — **one filled slot's action column** `.diy-slot__acts`, right after the
   * official 更换 / 清空 buttons (a mod's node is the LAST child of that column; on narrow screens the host turns the
   * column into a right-aligned row, so a mod's node lands at the end of that row).
   *
   * 宿主负责**在哪**（哪一个槽位的那一条操作区），Mod 负责**放什么**（例如「该槽位当前干员的皮肤选择」——
   * cyanfish.skinvoice 用它做了按槽位选皮肤；顶栏那条 `loadout.topbar` 跟的是「名单里选中的干员」，
   * 而自选编队页没有「名单选中」这个概念，所以必须按槽位给控件）。
   *
   * props: `{ slotId, charId, tier, elite }` — `slotId` = the slot's base chess id (the card's `data-slot`),
   * `charId` = the operator standing in it (the card's `data-char`), `tier` = 5 | 6, `elite` = the elite-form unit
   * record of that operator (the same object the host draws the 精锐 portrait from; may be null).
   *
   * **空插槽零影响**：一个空槽位走 `.diy-slot__fill` 那条分支，**根本不渲染 `.diy-slot__acts`**（插槽不存在）；
   * 一个已填充的槽位在这个插槽没有注册者时，`UiSlot` 渲染成 `null`（见下面 UiSlot），Preact 的 `null`
   * 占位**不产生任何节点** ⇒ `.diy-slot__acts` 与加这个插槽之前**逐字节相同**（官方 更换 / 清空 一个不少、
   * 顺序与语义都不变）。停用 skinvoice / 一个 Mod 都不装时就是这一条。
   */
  LOADOUT_DIY_SLOT_ACTIONS: 'loadout.diySlotActions',
  /**
   * 干员调配 roster — **该行最右侧的一格**（`screens/loadout.js` RosterRow，紧跟官方第 4 列「潜能 · 练度」之后；
   * 表头 `RosterHead` 的同一格也在同一个插槽里，`props.head === true`）。
   *
   * 为什么要有这一条：skinvoice 的皮肤/语音控件原先挂在 `loadout.topbar`，跟随的是「名单里选中的干员」；
   * 0.2.2 把调配页重写成**每个干员一行**（一行里就有技能 / 模组 / 潜能·练度）⇒ 按行的控件必须**在行里**，
   * 否则玩家要"先选人、再跑去顶栏拉下拉"，与官方"就地调"的形态不一致。Mod 侧注入 DOM 是死路
   * （screens 是 Preact 组件，塞进去的节点会被下一次渲染冲掉 —— 本文件文件头那句话），所以宿主开这一格。
   *
   * ★★ 空插槽零影响（与 `loadout.diySlotActions` 同一条约定）：没有注册者时 `UiSlot` 渲染成 `null`，
   * Preact 的 `null` **不产生任何节点** ⇒ `.lo-card` / `.lo-list__head` 的 DOM 与加这个插槽之前**逐字节相同**；
   * 栅格模板也一样（`--cols` 在**没有任何注册者**时仍是官方的 4 列，第 5 列由注册方自己的 CSS 打开，
   * 见 `public/css/screens/loadout.css` 的 `.lo-arow` 一节）。
   *
   * props: `{ head: boolean, chess?: any, m?: any, charId?: string, golden?: any, level?: 'normal'|'elite',
   *   ops?: object, selected?: boolean }` —— 表头那一格只有 `head: true`（别的都取不到，表头不是一行干员）；
   * 行里那一格给全（`chess` = 这张卡当前形态的棋种记录，`charId` = 它的干员 id，`level` = 该行的普通/精锐）。
   */
  LOADOUT_ROW_ACTIONS: 'loadout.rowActions',
  /**
   * 干员调配 **详情面板**（`screens/loadout.js` DetailPanel 的 `.lo-detail__body`，紧跟官方「潜能与练度」那一段
   * `CultivationSection` 之后）。props: `{ m, chess, charId, golden, level, ops, notOwned }`。
   *
   * 为什么与 `loadout.rowActions` 成对：一行最右侧那一格在 **< 1600px** 放不下（实测：1440px 只剩 88.8px
   * 余量，1280px 起官方列自己就吃满）⇒ 注册方在窄屏把控件**降级到这里**。详情面板是纵向流、宽度富余、
   * 且官方自己的「潜能与练度」就在这里（`screens/cultivation.js`）⇒ 风格天然统一、没有横向溢出风险。
   * ★ 空插槽零影响与前两条同一条约定（`null` 不进 DOM）。
   */
  LOADOUT_DETAIL_ACTIONS: 'loadout.detailActions',
  /**
   * 干员调配 **详情面板**（`screens/loadout.js` DetailPanel 的 `.lo-detail__body`）里，
   * **紧跟在官方「此干员语音」控件之后**（`<OperatorVoice>`，`public/js/ui/operatorVoice.js`；
   * 它是这一块的**第一个**子节点，官方 0.2.3 新增）—— 即「语音控件的**下一行**」。
   * props: `{ m, chess, charId, golden, level, ops, notOwned, standIn }`（与 `loadout.detailActions` 同一组）。
   *
   * ★★ 为什么单开这一条（0.2.3 · 工序 72，服主裁定）：
   *   「我看官方把**干员独立配置语音放在了右侧的干员详情页**中 …… **把干员时装放在干员独立语音配置下一行**
   *     可能会好一些。」⇒ 详情面板此后是皮肤控件的**常驻**落点（宽屏也在：详情面板本来就开着），
   *     与 `loadout.rowActions`（名单行内那一格，≥1600px）**并列**，而不再只是窄屏降级。
   *   ★ 为什么不复用 `loadout.detailActions`：那一条在官方 **`CultivationSection`（潜能与练度）之后** ——
   *     与官方语音控件之间隔着一整段潜能/练度，量出来相距 300~400px（真机：1920 时语音底 464.5、
   *     旧落点顶 693.5），**不是"下一行"**。位置本身就是本工序的需求，所以由宿主再开一格。
   *
   * ★ 空插槽零影响（与本文档其它插槽同一条约定）：没有注册者时 `UiSlot` 渲染 `null`，
   *   Preact 的 `null` **不产生任何节点** ⇒ `.lo-detail__body` 的子节点列表与加这一条之前**逐字节相同**
   *   （不装 / 停用注册它的 Mod 时就是这一条；取证见 `<开发期报告>/72-skin-detailrow.md`）。
   */
  LOADOUT_DETAIL_VOICE: 'loadout.detailVoice',
  /**
   * The **official in-match settings dialog** (ui/settings.js SettingsModal, opened by the 左下角 `.gm__gear`):
   * the end of its content column, right after 快捷键 and before the closing hint line. This is how a mod
   * reaches the player through the same entry as the game's own settings instead of a second floating gear
   * (owner's decision: 更新①「mod-setting 应与官方游戏内设置（左下角）使用同一入口」).
   * Empty slot ⇒ SettingsModal renders the exact nodes it rendered before the slot existed.
   */
  SETTINGS_SECTIONS: 'settings.sections',
  /**
   * The **in-match bottom-left corner button row** (screens/game.js `.gm__corner`): the tail of the row, i.e.
   * **immediately right of** the official 设置 / 玩法说明 / 全屏 buttons (and of the emote wheel, which is its first
   * child). This is a **separate entry** from `settings.sections` — the owner's decision 更新④「控制台 mod 应独立入口，
   * 不与设置入口共用（游戏/mod 设置与控制台修改数据不为相同目的）」: a console writes match state, the settings
   * dialog holds preferences, and the row's three buttons are the row a player already reaches on every screen size.
   *
   * Registered node = a `<button class="gm__gear">` (the host's own class: same .56rem square, same border, same
   * hover), so the row stays one visual family; a mod adds its own accent only if it wants one.
   * ★ 空插槽零影响：没有注册者时 `UiSlot` 渲染 `null` ⇒ Preact 的 null 占位**不产生任何节点**，`.gm__corner`
   * 的子节点与加这一格之前**逐字节相同**（不装 / 停用注册它的 Mod 时就是这一条）。
   */
  GAME_CORNER_ACTIONS: 'game.cornerActions',
  /**
   * 首页（`screens/lobby.js` 的 LobbyScreen）—— **顶栏之下、`.lobby-body` 之上的整条横幅带**：
   * 插槽节点是 `.screen` 这个 flex 纵向容器的**直接子节点**，位于 `<header class="topbar">` 之后、
   * `.lobby-body` 之前。注册方自己的根节点负责 `flex: none` 与宽度（`.lobby-body` 的 `max-width:19.2rem`
   * 由注册方自己对齐，宿主不为它写任何 CSS）。
   *
   * 为什么单开一条：横幅是**常驻、不抢焦点**的信息（服务器即将重启这类实时提醒），与
   * `alertDialog`（弹一次、必须点掉）和 `settings.sections`（玩家主动打开）都不是一回事；
   * 而 Mod 自己往 DOM 塞节点是死路（见文件头：Preact 重渲染会冲掉）。
   * ★ 空插槽零影响：没有注册者时 `UiSlot` 渲染 `null` ⇒ `.screen` 的子节点与加这一条之前**逐字节相同**，
   * `.topbar` / `.lobby-body` 的几何一个像素都不动（不装 / 停用注册它的 Mod 时就是这一条）。
   */
  LOBBY_BANNERS: 'lobby.banners',
  /**
   * 首页顶栏**左组**（`screens/lobby.js` 的 `.topbar__left`，**紧随官方 `<PingPill>` 之后**）：
   * 状态读数这类「一眼扫过」的东西放这里（`PingPill` 就是同一族的：连接状态 + 延迟）。
   * ★ 为什么是左组而不是右组：`.topbar__right` 是按钮组（统计 / 继续对局 / 设置 / 玩法说明 / 干员调配 /
   * 玩家名片），往里塞读数会把它挤到换行或溢出；左组只有「返回 + PingPill」，宽度富余。
   * ★ 空插槽零影响：没有注册者时 `UiSlot` 渲染 `null` ⇒ `.topbar__left` 的子节点与加这一条之前**逐字节相同**。
   */
  LOBBY_TOPBAR: 'lobby.topbar',
  /**
   * **对局内**（`screens/game.js` 的 MatchScreen，即 .gm 这个战斗界面）—— `.gm__hud` 的**直接子节点**，
   * 紧跟官方 `<header class="gtop">`（顶栏）之后、`.gm__bonds`（盟约带）之前。
   * 承载一条**弹幕**形态的实时信息（自右向左从靠顶部飘过、半透明、整层 `pointer-events:none` 点击穿透）。
   *
   * ★★ 为什么是对局内只能用"飘过"这种形态（工序 77 用真机量过，不是估的）：对局界面是**满屏绝对定位**
   *   （战场 `inset:0` + HUD 各面板各自 `absolute`），**没有流内空行**可以插；竖直方向只剩一条 0.3rem 的缝
   *   （顶栏 `.gtop` 占 0 ~ 0.82rem，官方 `.ticker` 占 1.0 ~ 1.3rem，盟约带 `.gm__bonds` 从 1.36rem 起，
   *   而官方「回合」框在顶栏正中：1920 时 y 39 ~ 83）——
   *   ① 把常驻横幅放进 ticker 那条带：真机实测与 `.gm__bonds` **交叠 17px**；
   *   ② 放进顶部整幅窄带：与「回合」框**交叠 12~24px**（且是常驻，等于长期占用关键信息）。
   *   ⇒ 唯一既能显示又不长期占位的形式就是**飘过**：遮挡是瞬时的（任一固定点被经过 2~4 秒），
   *   且整层不吃指针事件 ⇒ 点击/拖拽全穿透（服主口径：「类似弹幕的从靠顶部的右侧飘过 + 半透明 + 点击穿透，
   *   这样就不用太考虑遮挡问题」）。
   *
   * ★ 契约：注册方自己的根节点负责**全部**定位与尺寸（通道位置、半透明、动画、`pointer-events`），
   *   并**必须** `pointer-events: none`（宿主 `.gm__hud > *` 是 `auto` ⇒ 注册方要用 `!important` 压过它，
   *   否则一个覆盖整条通道的层会拦掉底下所有点击）；宽度不得超过 7.6rem（官方 ticker 的宽度），
   *   否则 844×390 这种窄视口会横向溢出。宿主**不为它写任何 CSS**。
   *   无障碍：必须尊重 `prefers-reduced-motion`（成立时不位移 ⇒ 静态短显或干脆不飘）。
   * ★ 空插槽零影响：没有注册者时 `UiSlot` 渲染 `null` ⇒ `.gm__hud` 的子节点与加这一条之前**逐字节相同**
   *   （绝对定位不参与流式布局；不装 / 停用注册它的 Mod 时就是这一条；真机逐字段取证见
   *   `<开发期报告>/77-inmatch-banner-and-token.md`）。
   */
  GAME_BANNERS: 'game.banners',
});

const SLOT_NAMES = new Set(Object.values(UI_SLOTS));
/** slot → [{ modId, render }] in registration order (mods load in /mods order, i.e. load order). */
const registry = new Map();
/** Registration changes are rare (boot only) but a slot must re-render when one lands. */
const revision = createStore({ n: 0 });
const bump = () => revision.set({ n: revision.get().n + 1 });

/** Mods currently installed (set by loadClientMods; [] before boot / on a static host). */
let installed = [];

/**
 * Register a component into a slot.
 * @param {string} slot one of UI_SLOTS
 * @param {(props?: object) => any} render Preact component (may use hooks — it is rendered as a component, not called)
 * @param {{ modId?: string|null }} [opts]
 * @returns {() => void} dispose
 */
export function registerUiExtension(slot, render, { modId = null } = {}) {
  if (!SLOT_NAMES.has(slot)) throw new Error(`unknown UI slot "${slot}" (available: ${[...SLOT_NAMES].join(', ')})`);
  if (typeof render !== 'function') throw new Error('slot renderer must be a function (a Preact component)');
  const list = registry.get(slot) || [];
  const entry = { modId, render };
  list.push(entry);
  registry.set(slot, list);
  bump();
  return () => {
    const cur = registry.get(slot);
    if (!cur) return;
    const i = cur.indexOf(entry);
    if (i < 0) return;
    cur.splice(i, 1);
    if (!cur.length) registry.delete(slot);
    bump();
  };
}

/** Registered renderers of a slot (copy). */
export const uiExtensions = (slot) => (registry.get(slot) || []).slice();
/** How many renderers a slot has (0 → UiSlot renders nothing at all). */
export const uiExtensionCount = (slot) => (registry.get(slot) || []).length;
/** Drop every registration (tests / teardown). */
export function clearUiExtensions() {
  registry.clear();
  bump();
}

/**
 * Renders every mod component registered into `name`, as siblings (no wrapper element, so the host's flex
 * gap applies to them exactly like to its own children). Nothing registered → renders nothing.
 * @param {{ name: string, props?: object }} props
 */
export function UiSlot({ name, props }) {
  useStore((s) => s.n, Object.is, revision); // re-render when a mod registers after the first paint
  const list = registry.get(name);
  if (!list || !list.length) return null;
  return html`${list.map((e, i) => html`<${e.render} ...${props || {}} key=${`${e.modId || 'ui'}#${i}`} />`)}`;
}

// ---- host API -------------------------------------------------------------------------------------------------------

/**
 * The API a client mod's setup() receives. Deliberately narrow: the UI kit (so a mod reuses the game's own
 * components and looks native without copying CSS), the slot registry, the loadout store/model, and the data
 * store. Nothing here can reach the server or the sim.
 * @param {any} mod one entry of GET /mods `.mods[]`
 * @param {any} snapshot the whole GET /mods payload (null on a static host)
 * @param {{ track?: (dispose: () => void) => void }} [opts]
 */
export function makeHostApi(mod, snapshot, { track = () => {} } = {}) {
  return Object.freeze({
    apiVersion: CLIENT_MOD_API,
    mod: Object.freeze({ id: mod?.id ?? null, name: mod?.name ?? null, version: mod?.version ?? null, author: mod?.author ?? null }),
    /** The GET /mods payload as fetched at boot (may be null: static host without a game server). */
    snapshot,
    /** Re-fetch GET /mods (fresh mod list, e.g. right before an import). */
    getMods: () => fetchModsSnapshot(),
    ui: Object.freeze({
      html, Icon, Button, MicroLabel, TextField, Modal, confirmDialog, alertDialog, toast, toastError,
      // ★ 0.2.2 追加（服主已批准，纯加成）：宿主**已有**的悬浮提示 —— `Tooltip` + `TooltipLayer`（后者已由
      // `UiHosts` 常驻挂在 app 根，`position:fixed` + 视口夹取）。★ **限制**：`.app-root` 有 `isolation:isolate`
      // ⇒ 它画不到挂在 <body> 的**独立 Preact 根弹窗**之上（`cyanfish.mod-settings` 的顶栏齿轮弹窗就属于这种；
      // 官方设置弹窗在 `.app-root` 内部，不受影响）。见 docs/MODS.md §4.12.2 二。
      Tooltip, TooltipLayer,
      // The game's own Preact instance: a mod MUST use these hooks (and `ui.html`) so its components live in the
      // host's vnode tree. `confirmDialog`/`alertDialog` render at the app root, and their `text` may be a component
      // element — that is how a mod shows a rich panel without a portal.
      hooks: Object.freeze({ useState, useRef, useEffect, useMemo, useCallback }),
    }),
    slots: Object.freeze({
      register(slot, render) {
        const dispose = registerUiExtension(slot, render, { modId: mod?.id ?? null });
        track(dispose);
        return dispose;
      },
      names: UI_SLOTS,
    }),
    loadout: Object.freeze({
      store: loadoutStore,
      getEntries: () => loadoutStore.get().entries,
      setEntries,
      subscribe: (fn) => loadoutStore.subscribe(fn),
      model: loadoutModel,
      isSlot: loadoutModel.isLoadoutSlot,
      sanitize: loadoutModel.sanitizeEntries,
      toStored: loadoutModel.toStored,
      parseStored: loadoutModel.parseStored,
    }),
    data,
    log: console,
  });
}

// ---- loading --------------------------------------------------------------------------------------------------------

/** GET /mods, never throwing (a static host / an old server / offline → null). */
export async function fetchModsSnapshot({ modsUrl = '/mods', fetchFn = null } = {}) {
  const doFetch = fetchFn || ((...a) => globalThis.fetch(...a));
  try {
    const res = await doFetch(modsUrl, { cache: 'no-cache' });
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let booting = null;

/**
 * Load every enabled mod's client extension once. Idempotent: the second call returns the first result.
 * @param {{ modsUrl?: string, fetchFn?: Function, log?: object }} [opts]
 * @returns {Promise<{ snapshot: any, loaded: string[], failed: string[] }>}
 */
export function loadClientMods({ modsUrl = '/mods', fetchFn = null, log = console } = {}) {
  if (booting) return booting;
  booting = (async () => {
    const snapshot = await fetchModsSnapshot({ modsUrl, fetchFn });
    const list = Array.isArray(snapshot?.mods) ? snapshot.mods : [];
    const loaded = [];
    const failed = [];
    for (const m of list) {
      if (!m || typeof m.client !== 'string' || !m.client) continue;
      const disposers = [];
      try {
        // Runtime URL (the host computes it from the mod's own directory): no bundler, no import-map entry.
        const mod = await import(/* @vite-ignore */ m.client);
        const setup = typeof mod?.default === 'function' ? mod.default : typeof mod?.setup === 'function' ? mod.setup : null;
        if (!setup) throw new Error('模块既没有默认导出的 setup 函数，也没有具名 setup');
        const undo = await setup(makeHostApi(m, snapshot, { track: (d) => disposers.push(d) }));
        installed.push({ id: m.id, dispose: () => { for (const d of disposers) { try { d(); } catch { /* ignore */ } } if (typeof undo === 'function') undo(); } });
        loaded.push(m.id);
        log.info?.(`[mods] 客户端界面扩展已装载: ${m.id}`);
      } catch (e) {
        for (const d of disposers) { try { d(); } catch { /* ignore */ } } // never leave half a registration behind
        failed.push(m.id);
        log.warn?.(`[mods] 客户端界面扩展装载失败（忽略该 Mod）: ${m.id}`, e);
      }
    }
    return { snapshot, loaded, failed };
  })();
  return booting;
}

/** Uninstall every client extension (their slot registrations and any returned cleanup). */
export function unloadClientMods() {
  const all = installed;
  installed = [];
  booting = null;
  for (const it of all) { try { it.dispose(); } catch { /* ignore */ } }
  return all.map((it) => it.id);
}

/** Mod ids whose client extension is currently installed. */
export const installedClientMods = () => installed.map((it) => it.id);
