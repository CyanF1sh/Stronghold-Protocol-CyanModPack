// mods/cyanfish.banner/client/index.js — 「实时横幅公告」的界面侧（L4）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → render(<App/>) → GET /mods → import(本文件) → setup(hostApi)
//
// 它只做一件事：往首页**顶栏下方**那条插槽（`lobby.banners`，docs/MODS.md §6.3）渲染若干行横幅。
// 内容有**两路**数据，同 id 时实时发布的那条赢（`plan.js mergeItems`）：
//   ① 数据补丁：合并后 /data/config.json 的 `banner.items` —— 常驻公告，随 Mod 分发、改它要重载；
//   ② 实时文档：/mods/cyanfish.banner/live.json —— 服主在 **Mod 管理页**发布/撤回（docs/MODS.md §4.14），
//      走宿主**已有**的 `/mods/` 静态挂载，发布不需要重载、不需要重启、不影响正在进行的对局。
//
// ★★ 五条实现纪律（与 cyanfish.announce/client/index.js 同源，都踩得到）：
//   1. **setup 必须立刻返回、不能 await 任何东西。** extensions.js 是 `for (...) { await setup(...) }`
//      顺序装载的 —— 一旦在这里 await 数据的到来，排在后面的 Mod 就要等我们。所以 setup 里只**同步注册**
//      插槽，真正的取数在组件自己的 useEffect 里（组件本来就在数据到达后重渲染）。
//   2. **返回值只能是"同步的"**：返回 dispose 函数（不是 Promise）。
//   3. **没有可用横幅时零痕迹**：不弹窗、不注入 <style>、组件返回 `null`（Preact 的 null **不产生节点**）
//      ⇒ 首页 DOM 与没有这条插槽时**逐字节相同**。
//   4. **绝不抛**：所有路径 try/catch，失败只留一条 warn 日志（规范 §1.3 约束 2 / §6.6）。
//   5. **不用轮询硬撑"实时"**：轮询只在页签可见时跑，默认 20 秒一次（`banner.pollSec`，夹在 5~300 秒），
//      切回前台**立刻**补一次；时间窗只靠一个 5 秒的**本地节拍**判定，不发网络请求。
//
// 为什么不用 alertDialog：那是「弹一次、必须点掉」的模态（`cyanfish.announce` 用它做进服公告）；
// 横幅要的是**常驻、不抢焦点、可随时出现/消失** —— 两者在宿主里是不同的插槽。

import { parseConfig, parseLive, mergeItems, pickActive, liveUrl } from './plan.js';
import { installStyle } from './style.js';

const MOD_ID = 'cyanfish.banner';
/** 本 Mod 用的插槽名（必须与宿主 UI_SLOTS 里的键值一致；拼错会被宿主**抛错**而不是静默失败）。 */
const SLOT_LOBBY = 'lobby.banners';
/** 对局内的那一条（0.2.3 · 工序 77；服主口径「对局中也要能看到」）。老宿主没有它 ⇒ 只注册首页那一条。 */
const SLOT_GAME = 'game.banners';
/** 展示时间窗的本地判定节拍（秒）：只决定「到点出现/消失」的准点程度，不发任何请求。 */
const WINDOW_TICK_SEC = 5;
/**
 * 对局内那条**弹幕**的参数（0.2.3 · 工序 77，服主口径「类似弹幕从靠顶部的右侧飘过 + 半透明 + 点击穿透」）：
 *   · 单次飘过时长 = 9 秒（自右向左横穿整屏；任一固定位置被经过约 2~4 秒 ⇒ 遮挡是瞬时的、不长期停留）；
 *   · 每隔 45 秒**再飘一次**（中途进局 / 中途发布的人都能看到，而不是只飘一次就没了）；
 *   · 尊重 prefers-reduced-motion：成立时**不位移**，改为原地静态短显 9 秒、每 45 秒再显一次。
 */
export const DANMAKU_TRAVEL_MS = 9000;
export const DANMAKU_REPEAT_MS = 45000;
export const DANMAKU_REDUCED_MS = 9000;
/** 键盘用户暂停/恢复弹幕的开关（无障碍：内容是信息，必须能被停下来读）。 */
export const DANMAKU_HOLD_KEY = 'p';

/** 宿主页面现在是不是「对局内」——用宿主自己的两个根类名判（不上 inMatchDoc 之外的第二套判据）。 */
function inMatchDoc() {
  try {
    const b = globalThis.document && globalThis.document.body;
    return !!(b && b.classList && (b.classList.contains('sp-in-match') || b.classList.contains('sp-in-room')));
  } catch { return false; }
}

/** 用户是不是要求"减少动效"（用宿主**已有**的机制：客户端本来就有 sp-reduce-motion 这个 body 类）。 */
function reduceMotion() {
  try {
    const doc = globalThis.document;
    if (!doc) return false;
    try { if (doc.defaultView && typeof doc.defaultView.matchMedia === 'function' && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch { /* ignore */ }
    return !!(doc.body && doc.body.classList && doc.body.classList.contains('sp-reduce-motion'));
  } catch { return false; }
}

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / data / mod / log …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  try {
    const names = api?.slots?.names;
    if (!names || names.LOBBY_BANNERS !== SLOT_LOBBY) {
      // 老宿主（没有这条插槽）⇒ 静默不工作。★ 不要改成「往 DOM 里塞一个」：Preact 下一次渲染就把它冲掉。
      api?.log?.warn?.(`[${MOD_ID}] 宿主没有 ${SLOT_LOBBY} 插槽（需要 0.2.3+），横幅不可用`);
      return () => {};
    }
    const disposers = [];
    // 两处用的是**同一个组件** ⇒ 同一份 plan.js 判据、同一套样式、同一段轮询逻辑（不是第二套时间判断）。
    // ★ 两个槽位分属两个屏幕（首页 / 对局），同一时刻只有一个挂在 DOM 上 ⇒ 轮询也只有一个在跑
    //   （切屏时旧组件卸载 ⇒ useEffect 清理 ⇒ 定时器停；新屏幕挂载 ⇒ 重新读一次）。
    disposers.push(api.slots.register(SLOT_LOBBY, () => api.ui.html`<${Banner} api=${api} />`));
    if (names.GAME_BANNERS === SLOT_GAME) {
      disposers.push(api.slots.register(SLOT_GAME, () => api.ui.html`<${Banner} api=${api} inGame=${true} />`));
    } else {
      api?.log?.warn?.(`[${MOD_ID}] 宿主没有 ${SLOT_GAME} 插槽（需要 0.2.3 · 工序 77+）⇒ 只在首页显示横幅`);
    }
    return () => { for (const d of disposers) { try { d?.(); } catch { /* ignore */ } } };
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 注册横幅插槽失败（忽略）`, e);
    return () => {};
  }
}

/** 读一次宿主数据单例里的 `config`（拿不到就 null ⇒ 走「没装 Mod」那一支）。 */
function readConfig(api) {
  try { return parseConfig(api?.data?.get?.('config')); } catch { return parseConfig(null); }
}

/**
 * 横幅本体。注册进插槽的组件 —— 每个宿主屏幕各渲染一次，卸载时轮询跟着停。
 * @param {{ api: any, inGame?: boolean }} props `inGame` = 对局内那一格（**临时提示 + 小图标入口**，见文件头 §1.2.0）
 */
function Banner({ api, inGame = false }) {
  const { html, hooks } = api.ui;
  const { useState, useEffect, useMemo, useRef } = hooks;

  const [cfg, setCfg] = useState(() => readConfig(api));
  const [live, setLive] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // ---- ① 数据补丁那一路：数据是**异步**到的（config 要等 /data/config.json 回来）⇒ 订阅 + 主动 load。
  useEffect(() => {
    let alive = true;
    const read = () => { if (alive) setCfg(readConfig(api)); };
    read();
    let unsub = null;
    try {
      unsub = api?.data?.subscribe?.(read) || null;
      void api?.data?.load?.('config');
    } catch { /* 数据层不可用 ⇒ 停在「没有横幅」 */ }
    return () => { alive = false; try { unsub?.(); } catch { /* ignore */ } };
  }, [api]);

  const merged = useMemo(() => mergeItems(cfg.items, live || []), [cfg, live]);

  // ---- ② 实时文档那一路：轮询 /mods/<id>/live.json（页签隐藏时停、切回来立刻补一次）。
  useEffect(() => {
    if (!cfg.enabled) return undefined;
    const url = liveUrl(api?.mod?.id);
    const doc = globalThis.document;
    if (!url) return undefined;
    let alive = true;
    let timer = null;
    const read = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : '?'}`);
        const r = parseLive(await res.json());
        // ★ 只有**解析成功**才替换：一次 404 / 网络抖动 / 半个文件不该把横幅清空。
        if (alive && r.ok) setLive(r.items);
      } catch { /* 静默：保留上一份（首次 = 只用数据补丁里的条目） */ }
    };
    const start = () => { if (timer == null) timer = setInterval(() => { void read(); }, cfg.pollSec * 1000); };
    const stop = () => { if (timer != null) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (doc && doc.hidden) stop(); else { void read(); start(); } };
    void read();
    if (!doc || !doc.hidden) start();
    try { doc?.addEventListener('visibilitychange', onVis); } catch { /* ignore */ }
    return () => {
      alive = false;
      stop();
      try { doc?.removeEventListener('visibilitychange', onVis); } catch { /* ignore */ }
    };
  }, [cfg.enabled, cfg.pollSec, api]);

  // ---- ③ 展示时间窗：只跑一个本地节拍（没有任何网络请求），且只有真写了时间窗的条目才需要它。
  //   ★ 1.1.0：`mins`（持续时间）也算"写了时间窗" —— 否则一条 from+当下分钟的公告不会到点消失。
  const windowed = useMemo(() => merged.some((it) => it.from != null || it.to != null || it.mins != null), [merged]);
  useEffect(() => {
    if (!windowed) return undefined;
    const t = setInterval(() => setNow(Date.now()), WINDOW_TICK_SEC * 1000);
    return () => clearInterval(t);
  }, [windowed]);

  const active = useMemo(() => pickActive(merged, now, cfg.maxItems), [merged, now, cfg.maxItems]);
  const show = cfg.enabled === true && active.length > 0;

  // ---- ④ 对局内的**弹幕**（0.2.3 · 工序 77；服主口径「类似弹幕的从靠顶部的右侧飘过 + 半透明 + 点击穿透」）
  //   为什么是弹幕：对局界面是满屏绝对定位，顶栏与盟约带之间只剩 ~0.3rem（那一条分给了官方 ticker）——
  //   任何**常驻**横幅都要长期压住「回合」框或盟约带。弹幕把"遮挡"变成**瞬时**的：自右向左飘过，
  //   任一固定位置只被经过 2~4 秒，且整层 pointer-events:none ⇒ 绝不拦点击/拖拽。
  //   ★ 判据仍然只有一份：`active` 来自 pickActive(mergeItems(...)) ⇒ 复用同一份 live.json 与 itemWindow。
  const fingerprint = useMemo(() => active.map((it) => `${it.id}:${it.text}:${it.level}:${it.href || ''}`).join('|'), [active]);
  const [pass, setPass] = useState(0);       // 每 +1 = 从头再飘一次（0 = 还没开始）
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const rowRef = useRef(null);
  const runRef = useRef('');                 // 已经起过的那一份内容（内容变了要立刻重新飘）
  useEffect(() => {
    if (!inGame) return undefined;
    if (!(cfg.enabled === true && active.length > 0)) { setVisible(false); runRef.current = ''; return undefined; }
    if (runRef.current !== fingerprint) { runRef.current = fingerprint; setVisible(true); setPass((n) => n + 1); return undefined; }
    if (!visible) { setVisible(true); setPass((n) => n + 1); return undefined; }
    if (paused) return undefined;
    const travel = reduceMotion() ? DANMAKU_REDUCED_MS : DANMAKU_TRAVEL_MS;
    const t = setTimeout(() => setPass((n) => n + 1), travel + DANMAKU_REPEAT_MS);
    return () => clearTimeout(t);
  }, [inGame, fingerprint, visible, paused, cfg.enabled, active.length]);
  // ★★ 每一轮**显式重启动画**：Preact 在"内容没变"时不会碰 DOM，CSS 动画跑完一次就停在终态
  //   ⇒ 只靠 setState 是**不会**再飘的（工序 77 实测：45 秒后弹幕再也不出现，只有第一轮）。
  //   这里按 componentDidUpdate 的时机把 animation 摘掉、强制回流、再挂回去 ⇒ 每一轮都真的重播。
  useEffect(() => {
    if (!inGame || !visible || paused) return undefined;
    const el = rowRef.current;
    if (!el) return undefined;
    try {
      el.style.animation = 'none';
      void el.offsetWidth;                    // 强制同步回流（CSS 动画重播的标准做法）
      el.style.animation = '';
    } catch { /* ignore */ }
    return undefined;
  }, [inGame, visible, paused, pass]);
  useEffect(() => {
    if (!inGame) return undefined;
    const onKey = (e) => {
      try {
        if (e.key !== DANMAKU_HOLD_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        setPaused((v) => !v);
      } catch { /* ignore */ }
    };
    globalThis.document?.addEventListener?.('keydown', onKey);
    return () => { try { globalThis.document?.removeEventListener?.('keydown', onKey); } catch { /* ignore */ } };
  }, [inGame]);

  // 只有**真的要画**才注入样式（文件头纪律 3）。installStyle 自己按 id 幂等。
  useEffect(() => { if (show) installStyle(); }, [show]);

  if (!show) return null;
  if (inGame) {
    // ★ 键要带上 pass 与 paused：每次飘过都是**新的 DOM 节点** ⇒ CSS 动画从头播放（不受上一次残留影响）；
    //   加 -paused 类 = 就地停住（`animation-play-state: paused`），用于「按 p 停下读」。
    const motion = reduceMotion();
    return html`<div class="sp-bn sp-bn--game" data-sp-danmaku=${pass} data-sp-paused=${paused ? 'true' : 'false'}>
      ${active.slice(0, 1).map((it) => html`<div ref=${rowRef} class=${`sp-bn__row is-${it.level}${paused ? ' is-paused' : ''}${motion ? ' is-static' : ''}`}
        key=${`${it.id}#${pass}`} data-sp-bn=${it.id} data-sp-pass=${pass}>
        <span class="sp-bn__dot" aria-hidden="true"></span>
        <span class="sp-bn__text" title=${it.text}>${it.text}</span>
        ${it.href ? html`<a class="sp-bn__link" href=${it.href} target="_blank" rel="noopener noreferrer">了解详情</a>` : null}
      </div>`)}
    </div>`;
  }
  return html`<div class="sp-bn" role="status" aria-live="polite">
    ${active.map((it) => html`<div class=${`sp-bn__row is-${it.level}`} key=${it.id} data-sp-bn=${it.id}>
      <span class="sp-bn__dot" aria-hidden="true"></span>
      <span class="sp-bn__text" title=${it.text}>${it.text}</span>
      ${it.href ? html`<a class="sp-bn__link" href=${it.href} target="_blank" rel="noopener noreferrer">了解详情</a>` : null}
    </div>`)}
  </div>`;
}
