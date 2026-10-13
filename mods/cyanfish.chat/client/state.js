// mods/cyanfish.chat/client/state.js — 「对局内聊天」的**宿主胶水层**（拿 store / net / pref，不画界面）。
//
// ★ 为什么能拿到这些：宿主 `public/js/main.js` 在启动时挂
//   `globalThis.__SP__ = { store, net, data, version }` —— 这是"未文档化但**既有先例**"的成员
//   （`cyanfish.debug-console` / `cyanfish.danmaku` / `cyanfish.skinvoice` 都这么用）。
//   拿不到（静态托管 / 老宿主）⇒ 一律安静降级，**绝不抛**（规范 §6.6）。
//
// ★ 本 Mod **没有改 public/js/** 的任何一行**：
//   · 入站：`net.on('m.danmaku', …)` —— net 把**任何** S2C `t` 都按 `t` 派发（public/js/net.js `_emit`），
//     没有监听者时什么都不发生 ⇒ 不装本 Mod 的页面在这一层也是零成本。
//   · 出站：`net.request('g.danmaku', { text })` —— 与 `g.debug` / `g.emote` 完全同一条通道。
//     ★ 消息名 `g.danmaku` / `m.danmaku` 是**线格式常量**（从工序 90 沿用），语义已是"对局内聊天"。
//   · 读状态：`store.get()`（`room.state.spectators` / `match.public.players` / `me`）。
//   · 本机偏好：`loadPref('chat', …)` / `savePref('chat', …)`（`public/js/store.js` 的 `sp.pref.*`）——
//     ★ 这是**玩家自己的**旋钮（弹幕开关 / 速度 / 字号），与服务器那份 `config.chat`（规则）**互不覆盖**：
//     服务端管"能不能发、能发多长、多快"，本机管"我怎么看"。

import { FEED_MAX, appendFeed, dropPending, readPrefs, reconcileIncoming, sanitizeText, FALLBACK_MAX_LEN } from './plan.js';

export const MOD_ID = 'cyanfish.chat';
/** 本机偏好的存储键（落到 `sp.pref.chat`）。 */
export const PREF_KEY = 'chat';

/** 宿主应用 store（拿不到 ⇒ null，安静降级）。 */
export function appStore() {
  try { return globalThis.__SP__?.store ?? null; } catch { return null; }
}

/** 宿主 net（拿不到 ⇒ null）。 */
export function appNet() {
  try { return globalThis.__SP__?.net ?? null; } catch { return null; }
}

/** store 的当前快照（拿不到 ⇒ null）。 */
export function snapshot() {
  try {
    const s = appStore();
    return s && typeof s.get === 'function' ? s.get() : null;
  } catch { return null; }
}

/** 读合并后 /data/config.json 的 `config`（宿主数据单例；拿不到 ⇒ null ⇒ 走"没装 Mod"那一支）。 */
export function readConfig(api) {
  try { return api?.data?.get?.('config') ?? null; } catch { return null; }
}

// ---- 本机偏好（`sp.pref.chat`）------------------------------------------------------------------------

/** 读本机偏好（拿不到 localStorage / 写坏 ⇒ 出厂档）。 */
export function loadPrefs() {
  try {
    const raw = globalThis.localStorage?.getItem('sp.pref.' + PREF_KEY);
    return readPrefs(raw ? JSON.parse(raw) : null);
  } catch { return readPrefs(null); }
}

/** 写本机偏好（**绝不抛**；写不进去只影响"下次打开还是默认档"）。 */
export function savePrefs(next) {
  const val = readPrefs(next);
  try { globalThis.localStorage?.setItem('sp.pref.' + PREF_KEY, JSON.stringify(val)); } catch { /* ignore */ }
  return val;
}

// ---- 入站：m.danmaku → 聊天记录 + 本模块的订阅者（面板 / 弹幕层）-------------------------------------
//
// ★ 本模块是**唯一**的接收入口，它做三件事（顺序有意）：
//   ① 洗正文（纵深防御：渲染层永远只拿到干净的单行纯文本）；
//   ② 追加进**本机聊天记录**（面板读它；★ 只在内存里，不发回服务器）；
//   ③ 把 `{ item, mine }` 派发给订阅者（弹幕层拿它起一轮飘过；面板拿它更新未读数）。
// ★ `mine` 在这里算一次（`state.me.playerId`），因为"这条是不是我自己发的"是**接收时**的事实，
//   而不是渲染时能可靠重建的（重连之后 `me` 可能已经变了）。

/** @type {Set<(e: { item: object, mine: boolean }) => void>} */
const listeners = new Set();
let feedOff = null;
let seq = 0;

/**
 * 订阅一条刚到消息。返回**同步的**退订函数。
 * ★ 没有组件在听的时候，消息仍然**会进聊天记录**（面板收起时也要能补上未读）。
 * @param {(e: { item: object, mine: boolean }) => void} fn
 * @returns {() => void}
 */
export function onRow(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 兼容别名：只想拿 `item` 的调用方用这个（弹幕层）。 */
export function onMessage(fn) {
  if (typeof fn !== 'function') return () => {};
  return onRow((e) => fn(e && e.item));
}

/**
 * 开始接收 `m.danmaku`（幂等：setup 只调一次）。返回退订函数。
 * ★ 即使宿主没有 net，也返回一个可用的空退订 —— 调用点不需要写分支。
 * @returns {() => void}
 */
export function startFeed() {
  if (feedOff) return feedOff;
  const net = appNet();
  if (!net || typeof net.on !== 'function') {
    feedOff = () => {};
    return feedOff;
  }
  const maxLen = FALLBACK_MAX_LEN * 4; // 纵深防御：渲染层只拿干净文本（真正的上限在服务端）
  const onMsg = (msg) => {
    try {
      const playerId = msg && typeof msg.playerId === 'string' ? msg.playerId : '';
      // ★ 服务端**已经**洗过一次正文，这里再洗一次：渲染层永远只拿到干净的**单行**纯文本。
      const r = sanitizeText(msg && msg.text, maxLen);
      if (!r.text) return;
      const item = { seq: ++seq, playerId, text: r.text, at: Date.now() };
      const mine = !!(myId() && playerId && myId() === playerId);
      // ★★ 入站一律走**同一个**动作：撤掉本地乐观占位 + 追加正式记录（原子，不会漏掉其中一步）。
      //   踩过的坑写在 plan.js 的 `reconcileIncoming` 注释里（拆成两步 ⇒ 同一条消息出现两遍）。
      setFeed(reconcileIncoming(feed, item));
      for (const fn of [...listeners]) {
        try { fn({ item, mine }); } catch { /* 一个订阅者坏了不影响其它 */ }
      }
    } catch { /* 绝不抛：一条坏帧不该把对局画面带崩 */ }
  };
  const off = net.on('m.danmaku', onMsg);
  feedOff = () => {
    feedOff = null;
    try { off?.(); } catch { /* ignore */ }
  };
  return feedOff;
}

/** 我的 playerId（拿不到 ⇒ 空串）。 */
function myId() {
  try { return stateSnapshot()?.me?.playerId ?? ''; } catch { return ''; }
}

/** 本机聊天记录（面板用；**只在内存里**，与服务器无关）。 */
let feed = [];

/**
 * **唯一**一处写 `feed` 的地方。
 * ★★ 为什么要有这个 setter：`appendFeed` / `reconcileIncoming` / `dropPending` 都是**纯函数**
 *   （返回新数组），散着写 `feed = xxx(...)` 时极易出现"某一步的返回值没被接住"⇒ 状态倒退。
 *   真机上就是这么翻车的（同一条消息出现两遍）。收敛到一个入口后，这类错误只剩一个地方可能发生。
 */
function setFeed(next) {
  feed = Array.isArray(next) ? next : [];
  return feed;
}

/** 取一份记录快照。 */
export function feedSnapshot() { return feed.slice(); }

/** 记一条（返回新记录）。 */
export function pushFeed(item) {
  return setFeed(appendFeed(feed, item, FEED_MAX));
}

/** 清空本机记录（面板上的「清空」）。 */
export function clearFeed() {
  return setFeed([]);
}

/**
 * 把一条**乐观占位**放上屏（发送还没被服务端确认）。
 * ★ 为什么要有它：服务端广播回来要一个来回，没有占位的话自己发的消息会"延迟出现"。
 *   服务端确认后会有一条同文的正式记录到达 ⇒ 接收路径把它换掉（`dropPending`），不会出现两次。
 * ★ 为什么用 `pending: true` 标记而不是按时间戳：同一个人完全可能连发两条一样的短句。
 * @param {string} text 已 sanitize 的正文
 * @returns {object} 放进去的那一条（调用方失败时用 `dropRow` 撤回）
 */
export function pushPending(text) {
  const item = { seq: --pendingSeq, playerId: myId(), text, at: Date.now(), pending: true };
  feed = appendFeed(feed, item, FEED_MAX);
  return item;
}

/** 撤回一条乐观占位（发送被拒 / 失败时；返回新记录）。 */
/** 撤掉一条**乐观占位**（发送被拒 / 失败时；返回新记录）。 */
export function dropRow(item) {
  if (!item || typeof item.seq !== 'number') return feed;
  return setFeed(dropPending(feed, item.seq));
}

/** 乐观占位的序号空间：**负数**，与入站消息的正数序号永不相撞。 */
let pendingSeq = 0;

// ---- 出站：g.danmaku --------------------------------------------------------------------------------

/**
 * 发一条消息。**客户端这一层不做任何频率判断** —— 那是服务端的活（客户端的计时器不可信）。
 * 这里只做"别送出一个注定被结构校验拒掉的东西"：文本归一化 + 长度。
 *
 * @param {any} raw 输入框里的原文
 * @param {number} [maxLen] 服务端上限（`config.chat.maxLen`；缺省用兜底档）
 * @returns {Promise<{ ok: true } | { ok: false, local?: 'empty'|'too-long'|'offline', code?: string, message?: string,
 *   detail?: string|null, len?: number, max?: number }>}
 */
export async function sendChat(raw, maxLen = FALLBACK_MAX_LEN) {
  const r = sanitizeText(raw, maxLen);
  if (!r.ok) {
    return r.len ? { ok: false, local: 'too-long', len: r.len, max: maxLen } : { ok: false, local: 'empty' };
  }
  const net = appNet();
  if (!net || typeof net.request !== 'function') return { ok: false, local: 'offline' };
  const placeholder = pushPending(r.text);
  try {
    await net.request('g.danmaku', { text: r.text });
    return { ok: true };
  } catch (e) {
    // 服务端的拒绝原因：`code`（ERR.*）+ 本地化文案 `message` + 开发者 detail（"chat: at least 2000 ms …"）。
    // ★ 一定要 catch：`net.request` 的错误帧带 rid ⇒ 它 reject 这个 promise；没人 catch 就是一条
    //   未处理的 rejection（宿主不会替我们弹 toast）。
    // ★ 被拒 ⇒ 把占位**撤掉**（否则面板里会留一条"看起来发出去了、其实没有"的假记录）。
    dropRow(placeholder);
    return { ok: false, code: e?.code ?? 'INTERNAL', message: e?.message ?? '', detail: e?.detail ?? null };
  }
}
