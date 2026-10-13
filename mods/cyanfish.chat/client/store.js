// mods/cyanfish.chat/client/store.js — 本 Mod 的**本机偏好**（弹幕开关 / 速度 / 字号）的唯一真相。
//
// ★ 为什么需要它：同一份偏好有**三个消费者** —— 右侧聊天面板、对局内弹幕层、设置页那一栏。
//   各自 `loadPrefs()` 一份会得到三份真相（改一处另两处不跟），而且设置页在**官方设置弹窗**里、
//   面板挂在 `<body>` 的独立根上，两者不在同一棵组件树里 ⇒ 必须有一个共享的可订阅单例。
//
// ★ 与服务器那份 `config.chat` 的分工（不要混）：
//   · `config.chat`（`data/config.json`，服务端）= **规则**：能不能发、能发多长、多快、屏蔽词、按房间关。
//   · 这里（`sp.pref.chat`，本机）= **玩家自己怎么看**：弹幕开不开、飘多快、字多大。
//   两者**互不覆盖**：本机设置永远改不动服务端的规则，服务端的规则也不因玩家调了字号而变。
//
// ★ 绝不抛：localStorage 拿不到（隐私模式 / 静态托管）⇒ 停在出厂档，功能照常（只是记不住）。

import { PREF_DEFAULTS, readPrefs } from './plan.js';
import { loadPrefs, savePrefs } from './state.js';

let current = readPrefs(loadPrefs());
const subs = new Set();

/** 当前偏好（一份快照；调用方不要改它）。 */
export function getPrefs() { return { ...current }; }

/**
 * 订阅偏好变化。返回退订函数。★ 注册时不立即回调（调用方自己先 `getPrefs()` 取初值），
 * 与宿主 `store.subscribe` 的用法一致。
 * @param {() => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/**
 * 合并写一份偏好（只写传进来的键；未传的保持原值）。返回新的偏目快照。
 * @param {Partial<{danmaku:boolean, speed:number, font:number, open:boolean}>} patch
 */
export function setPrefs(patch) {
  try {
    const next = readPrefs({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
    // 值没变就不落盘、也不广播（省掉一次 localStorage 写入与一轮重渲染）。
    const same = Object.keys(PREF_DEFAULTS).every((k) => next[k] === current[k]);
    if (same) return getPrefs();
    current = next;
    savePrefs(current);
    for (const fn of [...subs]) { try { fn(); } catch { /* 一个订阅者坏了不影响其它 */ } }
    return getPrefs();
  } catch { return getPrefs(); }
}
