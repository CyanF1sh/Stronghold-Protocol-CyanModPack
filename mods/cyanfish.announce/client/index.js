// mods/cyanfish.announce/client/index.js — 「服务器公告」的界面侧（L4）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → render(<App/>)（DialogHost 已挂上）→ GET /mods → import(本文件) → setup(hostApi)
//
// 干了两件事：
//   1. **弹一次**：读 /data/config.json 的 `announce.items`，与玩家浏览器里记的「已读 id」求差，
//      有未读就在应用根部弹一屏公告（alertDialog 的 text 可以是组件元素 —— 宿主没有 portal，
//      这就是「既能弹富面板、又有正确层级」的唯一姿势，见规范 §6.4-2）；玩家关掉之后才记账。
//   2. **交一栏「回看」**：把「公告」栏位注册给 `cyanfish.mod-settings`（注册表见 registry.js）。
//      没有这一栏的话，公告点掉「我知道了」之后就再也看不到（已读按 id 记，改文案也不重弹）。
//
// ★★ 四条实现纪律（都踩得到）：
//   1. **setup 必须立刻返回、不能 await 弹窗。** extensions.js 是 `for (...) { await setup(...) }`
//      顺序装载的 —— 一旦在这里 await alertDialog，排在后面的 Mod 要等玩家点掉公告才会被装载。
//      所以真正的流程挂在 fire-and-forget 的 run() 上。
//   2. **返回值只能是"同步的"**：返回一个 dispose 函数（不是 Promise）。`await` 一个非 thenable 立即解析
//      ⇒ 不卡顺序队列；同时宿主 `unloadClientMods()` 才能把我们注册的设置栏位摘掉。
//   3. **没有可用公告时零痕迹**：不注册栏位、不弹窗、不注入 <style>、不注册插槽（本 Mod 根本不用插槽）。
//   4. **绝不抛**：所有路径 try/catch，失败只留一条 warn 日志（规范 §1.3 约束 2 / §6.6）。
//
// 为什么不用插槽：宿主只在「干员调配」顶栏留了一个插槽（UI_SLOTS 只有 loadout.topbar），
// 公告要的是「玩家一进来就看到」，与那个插槽无关 —— 直接走 app 根的 DialogHost 才是对的。
//
// 为什么注册表要**各放一份**而不是从 mod-settings 里 import：见 registry.js 文件头
// （宿主没有 Mod 依赖概念、也没有多余插槽；`/mods` 里本 Mod 排在 mod-settings **之前**，
//  必须先建表并注册，后到的设置 Mod 靠 subscribe/setHost 的 emit 拿到同一份列表）。

import {
  parseAnnouncements, pickUnread, markSeen, readSeen, defaultStorage, seatPhrase,
} from './plan.js';
import { installStyle } from './style.js';
import { AnnounceCard } from './card.js';
import { AnnounceSection } from './section.js';
import { settingsRegistry } from './registry.js';

const MOD_ID = 'cyanfish.announce';
/** 注册进「模组设置」的栏位 id（与 skinvoice 的 `skinvoice` 区分开）。 */
const SECTION_KEY = 'announce';
/** 栏位排序：皮肤与语音是 20，公告是纯信息，排在它后面。 */
const SECTION_ORDER = 60;

/** 已注册的栏位 dispose（run() 异步填进来；setup 早就返回了）。 */
let disposeSection = null;

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / data / log …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  try {
    void run(api).catch((e) => api?.log?.warn?.(`[${MOD_ID}] 公告装载失败（忽略）`, e));
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 公告初始化失败（忽略）`, e);
  }
  return () => {
    try { disposeSection?.(); } catch { /* ignore */ }
    disposeSection = null;
  };
}

/**
 * 真正的流程（不阻塞宿主）。
 * @param {object} api
 */
async function run(api) {
  const cfg = await loadConfig(api);
  const { items, dropped } = parseAnnouncements(cfg);
  if (dropped) api?.log?.warn?.(`[${MOD_ID}] 有 ${dropped} 条公告字段不合法，已跳过`);
  if (!items.length) return;                       // 没配置 / 全写坏 ⇒ 零痕迹（连栏位都不注册）

  const storage = defaultStorage();

  // ---- ① 先把「回看」栏位交出去 ----------------------------------------------------------------
  // ★ 放在"有没有未读"判断**之前**：玩家读完之后仍然要能回看，这正是这一栏存在的理由。
  registerSection(api, items, storage, cfg);

  // ---- ② 有未读才弹 ---------------------------------------------------------------------------
  const unread = pickUnread(items, readSeen(storage));
  if (!unread.length) return;                      // 全看过 ⇒ 不弹（样式等玩家打开栏位时再注入）

  installStyle();
  const alert = api?.ui?.alertDialog;
  if (typeof alert !== 'function') {
    api?.log?.warn?.(`[${MOD_ID}] 宿主没有 alertDialog，公告无法展示`);
    return;
  }
  try {
    await alert({
      title: '服务器公告',
      micro: '',                                   // 留空 ⇒ 不渲染英文 eyebrow（默认值是 'CONFIRMATION'）
      okText: '我知道了',
      text: api.ui.html`<${AnnouncePanel} api=${api} items=${unread} seat=${seatPhrase(cfg)} />`,
    });
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 公告面板异常（忽略）`, e);
  }
  // ★ 关闭之后才记账（无论点按钮、按 Esc 还是点背景关闭都会走到这里）。
  //   放在弹窗**之前**记会有真实风险：面板还没渲染出来、页面就崩了 ⇒ 公告被永久吞掉。
  markSeen(storage, unread);
}

/**
 * 把「公告」栏位注册给「模组设置」。没装那个 Mod 也不会报错 —— 注册表只是个 globalThis 上的对象，
 * 谁先跑谁建（`registry.js` 的幂等引导），后到的设置 Mod 会拿到同一份列表。
 */
function registerSection(api, items, storage, cfg) {
  try {
    const reg = settingsRegistry();
    if (!reg || typeof reg.register !== 'function') return;
    disposeSection = reg.register({
      id: SECTION_KEY,
      title: '公告',
      order: SECTION_ORDER,
      // ★ 不传 micro：栏位列表里只留中文名（用户口径：英文 eyebrow 一律清掉）
      // ★ `seat` 在 `render` 里**现算**（不是注册时算一次）：这条通道是"回看"，玩家可能在设置页
      //   停留很久、服务器也可能中途「重载 Mod」换了数据 —— 每次重画都取当下的合并数据。
      render: () => {
        const live = api?.data?.get?.('config') || cfg;
        return api.ui.html`<${AnnounceSection} api=${api} items=${items} storage=${storage}
          seat=${seatPhrase(live)} version=${api?.mod?.version} />`;
      },
    });
    api?.log?.info?.(`[${MOD_ID}] 已在「模组设置」注册「公告」栏位`);
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 注册设置栏位失败（忽略）`, e);
  }
}

/** 取合并后的 config；已在内存里就直接用，否则自己去拉一次（拉了也不阻塞别人）。 */
async function loadConfig(api) {
  try {
    const cached = api?.data?.get?.('config');
    if (cached && typeof cached === 'object') return cached;
    return await api.data.load('config');
  } catch {
    return null;
  }
}

/**
 * 弹窗里的那一屏（全部未读）。作为 alertDialog 的 text 渲染 ⇒ 挂在 app 根的 DialogHost 上
 * （正确的层级、不会被任何 screen 的 z-index 压住、也不吃顶栏的按钮尺寸规则）。
 * ★ 卡片刻意与「模组设置」里的回看栏位**共用同一个组件**（card.js），只是不打「未读」角标
 *   —— 弹窗里每一条都是未读，再打标就啰嗦了（底部那行「共 N 条新公告」已经说了）。
 */
function AnnouncePanel({ api, items, seat }) {
  const { html } = api.ui;
  return html`<div class="sp-an">
    <div class="sp-an__list">
      ${items.map((it) => html`<${AnnounceCard} api=${api} item=${it} params=${seat} />`)}
    </div>
    <p class="sp-an__note">共 ${items.length} 条新公告，关闭后不再自动弹出。</p>
  </div>`;
}
