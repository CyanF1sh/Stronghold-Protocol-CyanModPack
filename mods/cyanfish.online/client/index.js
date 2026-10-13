// mods/cyanfish.online/client/index.js — 「首页在线人数」的界面侧（L4）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → render(<App/>) → GET /mods → import(本文件) → setup(hostApi)
//
// 干了一件事：往首页顶栏**左组**那条插槽（`lobby.topbar`，docs/MODS.md §6.3）渲染一枚状态胶囊
// 「在线 N · 房间 M · 对局 K」，数据取自宿主**已有的** `GET /healthz`（server/http/routes.js 的
// healthReport ← lobby.stats() + registry/network 的计数）。★ 没有为本 Mod 新增任何端点，也没有第二份真相。
//
// ★★ 五条实现纪律（与 cyanfish.banner / cyanfish.announce 同源）：
//   1. **setup 立刻返回、不 await**：extensions.js 是顺序 `await setup(...)` 装载的，等数据会拖住后面的 Mod。
//      这里只同步注册插槽，取数全在组件自己的 useEffect 里。
//   2. **返回值只能是"同步的"**：返回 dispose 函数（不是 Promise）。
//   3. **读不到就零痕迹**：从未成功读到 /healthz ⇒ 组件返回 `null`（不产生任何节点）⇒ 顶栏 DOM 与没有
//      这条插槽时**逐字节相同**；样式也只在真要画的时候才注入。
//   4. **绝不抛**：所有路径 try/catch，失败只留一条 warn 日志（规范 §1.3 约束 2 / §6.6）。
//   5. **轮询有节流**：默认 20 秒一次（`online.pollSec`，夹在 5~300 秒），页签隐藏时**停**、切回前台立刻补一次；
//      连续 3 个周期失败才把读数标成「可能过时」（变暗），而不是把它清掉。
//
// 悬浮说明用**原生 `title`**（多行）：宿主自己的 `.ping` 也是这么做的（components.js 的 PingPill），
// 两枚胶囊观感一致；本 Mod 不画自有气泡，因此 §4.12.2 的"两套框重合"禁令不适用。

import { parseConfig, readHealth, chipSegments, chipText, tipText, HEALTH_URL } from './plan.js';
import { installStyle } from './style.js';

const MOD_ID = 'cyanfish.online';
/** 本 Mod 用的插槽名（必须与宿主 UI_SLOTS 里的键值一致；拼错会被宿主**抛错**而不是静默失败）。 */
const SLOT = 'lobby.topbar';

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / data / mod / log …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  try {
    const names = api?.slots?.names;
    if (!names || names.LOBBY_TOPBAR !== SLOT) {
      api?.log?.warn?.(`[${MOD_ID}] 宿主没有 ${SLOT} 插槽（需要 0.2.3+），在线人数不可用`);
      return () => {};
    }
    const dispose = api.slots.register(SLOT, () => api.ui.html`<${OnlineChip} api=${api} />`);
    return () => { try { dispose?.(); } catch { /* ignore */ } };
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 注册顶栏插槽失败（忽略）`, e);
    return () => {};
  }
}

/** 读一次宿主数据单例里的 `config`（拿不到就 null ⇒ 走「没装 Mod」那一支）。 */
function readConfig(api) {
  try { return parseConfig(api?.data?.get?.('config')); } catch { return parseConfig(null); }
}

/**
 * 胶囊本体。注册进插槽的组件 —— 首页在时才轮询，离开首页（卸载）就停。
 * @param {{ api: any }} props
 */
function OnlineChip({ api }) {
  const { html, hooks } = api.ui;
  const { useState, useEffect, useMemo } = hooks;

  const [cfg, setCfg] = useState(() => readConfig(api));
  const [stats, setStats] = useState(null);
  const [stale, setStale] = useState(false);

  // ---- ① 数据补丁那一路：数据是**异步**到的 ⇒ 订阅 + 主动 load。
  useEffect(() => {
    let alive = true;
    const read = () => { if (alive) setCfg(readConfig(api)); };
    read();
    let unsub = null;
    try {
      unsub = api?.data?.subscribe?.(read) || null;
      void api?.data?.load?.('config');
    } catch { /* 数据层不可用 ⇒ 停在「没有胶囊」 */ }
    return () => { alive = false; try { unsub?.(); } catch { /* ignore */ } };
  }, [api]);

  // ---- ② 轮询 /healthz（页签隐藏时停、切回来立刻补一次；连续失败才变暗）。
  useEffect(() => {
    if (!cfg.enabled) return undefined;
    const doc = globalThis.document;
    let alive = true;
    let timer = null;
    let fails = 0;
    const read = async () => {
      try {
        const res = await fetch(HEALTH_URL, { cache: 'no-store' });
        if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : '?'}`);
        const next = readHealth(await res.json());
        if (!alive) return;
        if (next) { fails = 0; setStats(next); setStale(false); }
        else { fails++; setStale(fails >= 3); }   // 形状不认识（老服务端）⇒ 保留上一份、只是标旧
      } catch {
        if (!alive) return;
        fails++;
        // ★ 从未成功过 ⇒ 一直不渲染（零痕迹）；成功过 ⇒ 保留最后一份读数并变暗。
        setStale(fails >= 3);
      }
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
  }, [cfg.enabled, cfg.pollSec]);

  const segs = useMemo(() => chipSegments(stats, { showMatches: cfg.showMatches }), [stats, cfg.showMatches]);
  const text = useMemo(() => chipText(segs), [segs]);
  const tip = useMemo(() => tipText(stats), [stats]);
  const show = cfg.enabled === true && segs.length > 0;

  useEffect(() => { if (show) installStyle(); }, [show]);

  if (!show) return null;
  return html`<span class=${`sp-on${stale ? ' is-stale' : ''}`} title=${tip} data-sp-on=${text}
    role="status" aria-label=${tip}>
    ${segs.map((s, i) => html`<span class="sp-on__seg" key=${s.key} data-sp-on-k=${s.key}>
      ${i ? html`<span class="sp-on__sep" aria-hidden="true">·</span>` : null}
      <span class="sp-on__k">${s.label}</span><span class="sp-on__v">${s.value}</span>
    </span>`)}
  </span>`;
}
