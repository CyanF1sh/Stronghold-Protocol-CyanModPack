// mods/cyanfish.chat/client/danmaku.js — 对局内那条**弹幕飘过**层（插槽 `game.banners` 的第二个生产者）。
//
// ★ 它是本 Mod 的**可选**一半（设置页「对局内弹幕」那一档；关掉它聊天面板照常工作）。
//   形态与 `cyanfish.banner`（实时横幅公告）**同值、可区分**；两条弹幕**永不重叠**，
//   仲裁判据写在 client/plan.js 的 `canStartPass()` / `laneObserve()` 一节。
//
// ★★ 为什么必须让位而不是各画各的：对局内**没有第二条可用通道**。真机几何（1920×1080，1rem=100px）：
//     官方顶栏 `.gtop`        0   ~ 1.0rem（官方「回合」框也在里面）
//     官方播报 `.ticker`      1.0 ~ 1.34rem   ← 这条通道（`top:1.0rem`，高 `.34rem`）
//     盟约带 `.gm__bonds`     1.36rem 起
//   ⇒ 100~136 这 36px 是整个对局界面里**唯一**一条既不在顶栏里、也不压关键信息的横带，而它已经给了
//     「实时横幅公告」。两个注册者各把根节点放在 `top:1.0rem` = 完全重叠。
//   ⇒ 本层：**横幅在屏时不起跑**（并抢占已经起来的我们那一条），横幅不在时我们才用。
//
// ★★ 为什么用**注入 @keyframes** 而不是 `Element.animate`：位移量必须是**正文实测宽度**的函数
//   （`calc(-100vw - 100%)` 只在行内宽度已知时才对，而这里行宽是变的），位移量又不能写成 CSS 变量
//   （`@keyframes` 里的 `var()` 在**解析期**求值，拿不到当次的测量值）。所以每条消息注入一条
//   **唯一名字**的关键帧（`sp-cm-fly-<seq>`，值就是这一次的实测像素数）⇒ 时长与位移都由真实测量决定，
//   也顺带解决"动画不重播"（新名字 = 新动画）。
//   ★ 降级仍然成立：`prefers-reduced-motion: reduce` 时**不起位移动画**，改为原地静态短显
//   （`style.js` 里那一条 `@media` 负责居中），到时撤下。
//
// ★ `p` 键就地停住/继续（与 `cyanfish.banner` 同一个键 —— 用户心里「停下滚动的东西」是一件事）。

import {
  LANE_OBSERVE_MS, QUEUE_MAX, TRAVEL_BUSY_MUL, TRAVEL_REDUCED_MS, canStartPass, enqueue, laneBusy, laneObserve,
  nameOf, newLaneArbiter, requeue, speedToMs,
} from './plan.js';
import { onMessage, snapshot as stateSnapshot } from './state.js';
import { getPrefs, subscribe as subscribePrefs } from './store.js';

/** 注入的关键帧节点 id 前缀（本 Mod 自己清理，不与宿主的样式表混在一起）。 */
const KF_ID = 'sp-cm-kf-';
/** 关键帧节点保留的条数上限（防呆：连发很多条时不至于在 <head> 里堆无限多个）。 */
const KF_KEEP = 8;
const KF_QUEUE = [];

/** 用户是不是要求"减少动效"（用宿主**已有**的机制：客户端本来就有 sp-reduce-motion 这个 body 类）。 */
function reduceMotion() {
  try {
    const doc = globalThis.document;
    if (!doc) return false;
    try {
      if (doc.defaultView && typeof doc.defaultView.matchMedia === 'function'
        && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch { /* ignore */ }
    return !!(doc.body && doc.body.classList && doc.body.classList.contains('sp-reduce-motion'));
  } catch { return false; }
}

/** 视口宽度（拿不到 ⇒ 0）。 */
function viewportWidth() {
  try {
    const doc = globalThis.document;
    return (doc?.documentElement?.clientWidth) || (doc?.defaultView?.innerWidth) || 0;
  } catch { return 0; }
}

/**
 * 注入一条**唯一名字**的关键帧：从"贴着右缘之外"移到"完全离开左缘"。
 * @param {number} dist 像素（含整条行的宽度）
 * @param {number} seq 这条消息的序号（名字唯一即可）
 * @returns {string|null} 动画名；拿不到 document ⇒ null
 */
function injectKeyframes(dist, seq) {
  try {
    const doc = globalThis.document;
    if (!doc || !doc.head) return null;
    const name = 'sp-cm-fly-' + String(seq);
    const el = doc.createElement('style');
    el.id = KF_ID + String(seq);
    // 起点 left:100%（行首在右缘之外）⇒ 只要再左移 (视口宽 + 行宽) 就完全离屏。
    el.textContent = '@keyframes ' + name + ' { from { transform: translateX(0); } to { transform: translateX('
      + String(-Math.round(dist)) + 'px); } }';
    doc.head.appendChild(el);
    KF_QUEUE.push(el);
    while (KF_QUEUE.length > KF_KEEP) {
      const old = KF_QUEUE.shift();
      try { old?.remove?.(); } catch { /* ignore */ }
    }
    return name;
  } catch { return null; }
}

/**
 * 「实时横幅公告」的生产者此刻在不在（它那条通道的根节点）。
 * ★ 只读 `.sp-bn--game`：这是对方自己的类名，属于**读**、不是耦合，而且是**登记过的跨 Mod 契约**
 *   （docs/MODS.md §4.12.9.2 的分配表）。没有它 ⇒ 通道上没有第二个生产者。
 */
function bannerRootPresent() {
  try {
    const doc = globalThis.document;
    return !!(doc && typeof doc.querySelector === 'function' && doc.querySelector('.sp-bn--game'));
  } catch { return false; }
}

/**
 * 横幅那一行此刻在不在**屏上**（★ **几何**判据 —— 那个根节点在 45 秒空档里也挂着，
 * 行只是被 `translateX(-100vw - 100%)` 挪到屏外，只看节点会以为它一直在飘）。
 */
function bannerOnLane() {
  try {
    const doc = globalThis.document;
    if (!doc || typeof doc.querySelector !== 'function') return false;
    const row = doc.querySelector('.sp-bn--game .sp-bn__row');
    if (!row || typeof row.getBoundingClientRect !== 'function') return false;
    const r = row.getBoundingClientRect();
    // ★ 判据用 plan.js 的 `laneBusy`（纯函数、有单测）：只看与视口横向的**几何**交集。
    return laneBusy({ left: r.left, right: r.right }, viewportWidth());
  } catch { return false; }
}

/**
 * 弹幕层组件（注册进 `api.slots.register('game.banners', …)`）。
 *
 * 状态机（**同一时刻最多一条**在屏上）：
 *   ① 入站一条 → 进队列（上限 `QUEUE_MAX`，超出丢最旧的）；
 *   ② **一个** `LANE_OBSERVE_MS` 的节拍同时做三件事（只有真要画的时候才跑）：
 *        · 采一次相位（`laneObserve`：`{ rootPresent, busy }` → 起飞/离屏时刻 + 实测周期）；
 *        · **抢占**：横幅在屏而我们的行还在 ⇒ **横幅赢**，把我们的行撤下来放回队首（最长延迟 = 一个节拍）；
 *        · **起跑**：没有行在飘、队列非空、且 `canStartPass()` ⇒ 出队成为 `cur`；
 *   ③ 定时器到点 / 动画结束 ⇒ `cur = null` ⇒ 回到 ②。
 * ★ 队列的**真值**放在 ref 里（`queueRef`），`queueLen` 只是驱动渲染分叉的读数 —— 避免在 `setState`
 *   的更新函数里做副作用（那会被 Preact 在重放更新时执行两次）。
 * ★ 每一条都是**新的 key**（`item.seq`）⇒ 新的 DOM 节点 + 新的关键帧名 ⇒ 动画从头播（不会"只飘第一条"）。
 */
export function DanmakuLayer({ api }) {
  const { html, hooks } = api.ui;
  const { useState, useEffect, useRef } = hooks;

  const [cur, setCur] = useState(null);
  const [queueLen, setQueueLen] = useState(0);
  const [paused, setPaused] = useState(false);
  const [prefs, setLocalPrefs] = useState(() => getPrefs());
  const rowRef = useRef(null);
  const timerRef = useRef(null);
  const queueRef = useRef([]);
  const curRef = useRef(null);
  const arbRef = useRef(null);
  if (arbRef.current == null) arbRef.current = newLaneArbiter(Date.now());

  // ---- 偏好（设置页改它 ⇒ 立刻生效；正在飘的那一条下次起跑用新时长）------------------------------
  useEffect(() => {
    const off = subscribePrefs(() => setLocalPrefs(getPrefs()));
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  /** 这一轮结束（正常飘完 / 被抢占）。 */
  const finish = () => {
    try { clearTimeout(timerRef.current); } catch { /* ignore */ }
    timerRef.current = null;
    curRef.current = null;
    setCur(null);
  };

  // ---- ① 入站：收到一条就进队列（说话人的名字在这里解析一次）------------------------------------
  useEffect(() => {
    if (!prefs.danmaku) return undefined;
    const off = onMessage((item) => {
      const who = nameOf(stateSnapshot(), item.playerId);
      queueRef.current = enqueue(queueRef.current, { ...item, who }, QUEUE_MAX);
      setQueueLen(queueRef.current.length);
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [prefs.danmaku]);

  // ---- ② 单节拍：相位观测 + 抢占 + 起跑（合并成一个定时器，见函数头）------------------------------
  useEffect(() => {
    if (!prefs.danmaku) return undefined;
    const beat = () => {
      try {
        const now = Date.now();
        const rootPresent = bannerRootPresent();
        arbRef.current = laneObserve(arbRef.current, { now, rootPresent, busy: rootPresent && bannerOnLane() });
        // ★ 抢占：横幅赢。被撤下来的那一条放回**队首**（不丢）。
        if (arbRef.current.on && curRef.current) {
          const back = curRef.current;
          queueRef.current = requeue(queueRef.current,
            { seq: back.seq, playerId: back.playerId, text: back.text, at: back.at, who: back.who }, QUEUE_MAX);
          setQueueLen(queueRef.current.length);
          finish();
          return;
        }
        if (curRef.current || !queueRef.current.length) return;
        const rest = queueRef.current.slice(1);
        const dur = speedToMs(getPrefs().speed, rest.length > 0 ? TRAVEL_BUSY_MUL : 1);
        if (!canStartPass(arbRef.current, now, dur)) return;
        const q = queueRef.current;
        queueRef.current = q.slice(1);
        setQueueLen(queueRef.current.length);
        curRef.current = { ...q[0], dur };
        setCur(curRef.current);
      } catch { /* 一个节拍坏掉不该把对局画面带崩 */ }
    };
    beat();
    const t = setInterval(beat, LANE_OBSERVE_MS);
    return () => clearInterval(t);
  }, [prefs.danmaku]);

  // ---- ③ 一条新行真的挂上 DOM 之后：测量 + 注入关键帧 + 起动画 + 定好收尾时刻 ----------------------
  //   ★ 依赖只有 `cur.seq`：换了一条才重新测、重新起。paused 不在这里处理（否则恢复暂停会把正在飘的
  //     那条弹回起点）—— 暂停只切 `animation-play-state`（CSS 那一档）。
  const curSeq = cur ? cur.seq : 0;
  useEffect(() => {
    if (!curSeq) return undefined;
    const item = curRef.current;
    const node = rowRef.current;
    if (!item || !node) return undefined;
    const vw = viewportWidth();
    const w = (() => {
      try {
        const r = node.getBoundingClientRect();
        return r && r.width ? r.width : 0;
      } catch { return 0; }
    })();
    const motion = reduceMotion();
    if (motion) {
      // 降级：不位移 —— 用**行内样式**把它居中（行内样式压过 CSS 的 left:100%，且不需要 !important，
      // 见 §4.12.9.6 的 R3），原地短显 item.dur 毫秒后撤下。
      try {
        node.style.animation = 'none';
        node.style.left = '50%';
        node.style.transform = 'translateX(-50%)';
      } catch { /* ignore */ }
      timerRef.current = setTimeout(finish, item.dur || TRAVEL_REDUCED_MS);
      return () => { try { clearTimeout(timerRef.current); } catch { /* ignore */ } };
    }
    const name = injectKeyframes(vw + w, item.seq);
    if (!name) {
      // 拿不到 document.head（极老宿主）⇒ 不位移，至少让内容可见，然后撤下。
      timerRef.current = setTimeout(finish, item.dur || TRAVEL_REDUCED_MS);
      return () => { try { clearTimeout(timerRef.current); } catch { /* ignore */ } };
    }
    try {
      node.style.animation = 'none';
      void node.offsetWidth;                       // 强制同步回流（CSS 动画重播的标准做法）
      node.style.animation = name + ' ' + String(item.dur) + 'ms linear 1 both';
      // ★ 暂停状态用**行内样式**（不是 CSS 类 + !important）：见 §4.12.9.6 的 R3。
      node.style.animationPlayState = paused ? 'paused' : 'running';
    } catch { /* ignore */ }
    timerRef.current = setTimeout(finish, item.dur + 40);
    return () => { try { clearTimeout(timerRef.current); } catch { /* ignore */ } };
  }, [curSeq]);

  // ---- ④ 键盘：按 `p` 就地停住/继续（★ 与 `cyanfish.banner` 同一个键）----------------------------
  useEffect(() => {
    if (!prefs.danmaku) return undefined;
    const doc = globalThis.document;
    const onKey = (e) => {
      try {
        if (e.key !== 'p' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        setPaused((v) => !v);
      } catch { /* ignore */ }
    };
    doc?.addEventListener?.('keydown', onKey);
    return () => { try { doc?.removeEventListener?.('keydown', onKey); } catch { /* ignore */ } };
  }, [prefs.danmaku]);

  // ---- ⑤ 暂停开关：直接改那一行的 `animation-play-state`（**行内样式**，不用 CSS 类 + !important）------
  //   ★ 为什么不在 ③ 里一并处理：③ 的依赖只有 `cur.seq` —— 恢复暂停不该把正在飘的那一条弹回起点，
  //     所以它只在**换了一条**时跑一次；暂停/恢复是**同一行内**的状态切换，单独一条 effect。
  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    try { node.style.animationPlayState = paused ? 'paused' : 'running'; } catch { /* ignore */ }
  }, [paused, curSeq]);

  // ---- ⑥ 偏好被关掉：立刻把屏上那一条撤下来（列表里也不再进新的）--------------------------------
  useEffect(() => {
    if (prefs.danmaku) return;
    queueRef.current = [];
    setQueueLen(0);
    finish();
  }, [prefs.danmaku]);

  if (!prefs.danmaku || !cur) return null;
  const motion = reduceMotion();
  return html`<div class="sp-cm" role="status" aria-live="polite" data-sp-cm=${String(cur.seq)}
    data-sp-cm-queue=${String(queueLen)} data-sp-cm-speed=${String(prefs.speed)}
    data-sp-cm-paused=${paused ? 'true' : 'false'} style=${'--sp-cm-fs:' + String(prefs.font)}>
    <div ref=${rowRef} key=${'r' + String(cur.seq)}
      class=${'sp-cm__row' + (motion ? ' is-static' : '')}
      data-sp-cm-row=${String(cur.seq)} data-sp-cm-who=${cur.who || ''}>
      <span class="sp-cm__badge" aria-hidden="true">[聊]</span>
      ${cur.who ? html`<span class="sp-cm__who">${cur.who}</span><span class="sp-cm__sep" aria-hidden="true">·</span>` : null}
      <span class="sp-cm__text">${cur.text}</span>
    </div>
  </div>`;
}
