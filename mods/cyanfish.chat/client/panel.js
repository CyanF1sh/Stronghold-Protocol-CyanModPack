// mods/cyanfish.chat/client/panel.js — 右侧那条**可收起**的聊天面板（L4 界面）。
//
// ★ 它挂在哪：`<body>` 上一个**独立 Preact 根**（`index.js` 的 mountPanel）——
//   不是宿主插槽。为什么必须这样（三条硬事实）：
//   ① 宿主 `UI_SLOTS` 里**没有**"对局内右侧常驻面板"这一格（只有 `game.banners` 的顶部弹幕通道、
//      `game.cornerActions` 的左下角按钮排、`settings.sections` 的官方设置弹窗）；
//   ② Mod **不许自己往宿主受控子树里塞节点**（Preact 下一次渲染就冲掉，§6.4-3）；
//   ③ 宿主可用的构建里**没有 `createPortal`**（§6.4-2）。
//   ⇒ 与 `cyanfish.mod-settings` 的顶栏齿轮面板**同一条路**：自己在 `<body>` 上开一个根，
//     自己负责定位与指针事件。`cyanfish.skinvoice` / `cyanfish.debug-console` 也是这么做的。
//
// ★ 指针事件是本文件最容易踩的一条：根节点 `.sp-chat` 铺满视口，**必须** `pointer-events: none`
//   （只有真正的面板块 / 窄标签开 `auto`）—— 否则一个透明的全覆盖层会把整个战场的点击吃光。
//
// ★ 面板的尺寸 / 位置**让开官方的关键信息**（真机几何，1920×1080，1rem = 100px）：
//   · 顶部：官方顶栏 0 ~ 1.0rem、官方 `.ticker` 1.0 ~ 1.34rem、盟约带从 1.36rem 起 ⇒ 面板从 1.42rem 起；
//   · 底部：商店条 `right:.26rem; bottom:.2rem`，卡牌 2.24rem + 工具行 .48rem ⇒ 面板底边留 2.9rem 余量；
//   · 右侧：`.gm__bonds` 的右边界是 5.2rem（团队面板在**左**侧），所以屏幕**右上角这条竖带是空的**。
//   ⇒ 面板与官方任何常驻元素都不重叠（唯一的例外是"右侧详情面板 / 盟约弹窗"，它们由玩家主动打开、
//     层级更高，玩家关掉即恢复）。
//
// ★ 消息正文**永远只进文本子节点**（`html` 模板里 `<span>${text}</span>` 那一格）——
//   本文件里没有、也不允许出现 `innerHTML` / `dangerouslySetInnerHTML` / 任何 HTML 解析路径。
//
// ★ 所有 hooks 都在**早退之前**：Preact 的 hooks 是按下标对位的，收起态那一支早退之后就不能再调 hook。

import {
  FEED_MAX, canSend, clampMaxLen, inputMaxLength, nameOf, readChatCfg, sanitizeText,
} from './plan.js';
import { clearFeed, feedSnapshot, onRow, pushFeed, sendChat, snapshot as stateSnapshot } from './state.js';
import { getPrefs, setPrefs, subscribe as subscribePrefs } from './store.js';

/** 一条**系统提示**（不是别人说的话）：渲染成 `.is-sys` 一行，不带名字。 */
const sysItem = (text) => ({ seq: ++localSeq, playerId: '', text, at: Date.now(), kind: 'sys' });
/** 一条**错误提示**（发送被拒 / 发送失败）。 */
const errItem = (text) => ({ seq: ++localSeq, playerId: '', text, at: Date.now(), kind: 'err' });
let localSeq = 0;

/**
 * 聊天图标（**自绘 inline SVG**，风格照宿主 `public/js/ui/components.js` 的 `ICONS`：线稿、`currentColor`、
 * `viewBox="0 0 24 24"`、`stroke-width` 1.8 —— 与左下角那排图标键同一个语族）。
 *
 * ★ 为什么不复用宿主 `ui.Icon`：那个组件只认它自己那张 `ICONS` 表，表里**没有"聊天"这个图标**
 *   （我核过 components.js 的 ICONS）⇒ 硬塞一个语义相近的（例如 `chat`/`message`）会渲染成 `null`，
 *   收起态就变成"一个空框"。⇒ 自绘是最小且正确的做法；颜色走 `currentColor`，不写死颜色。
 * @param {any} html 宿主的 html 标签函数
 */
function chatIcon(html) {
  // 一个对话气泡 + 里面三点：气泡用圆角矩形路径（线稿），三点是实心小圆。
  return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M20.4 12.6c0 3.6-3.5 6.4-8.4 6.4-1 0-2-.15-2.9-.42L4.6 20.4l1.1-3.2C4.3 16.1 3.6 14.5 3.6 12.6c0-3.6 3.5-6.4 8.4-6.4s8.4 2.8 8.4 6.4z" />
    <circle cx="8.6" cy="12.6" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12.6" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="12.6" r="1.05" fill="currentColor" stroke="none" />
  </svg>`;
}

/**
 * 面板组件。由 `index.js` 传给独立根渲染（props: `{ api, onCollapse }`）。
 * @param {{ api:any, onCollapse?:Function }} props
 */
export function ChatPanel({ api, onCollapse }) {
  const { html, Button, Icon, hooks } = api.ui;
  const { useState, useEffect, useRef, useCallback } = hooks;

  const [prefs, setLocalPrefs] = useState(() => getPrefs());
  const [feed, setFeed] = useState(() => feedSnapshot());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  /** 未读提示：**一个布尔**（只是"有新消息我不知道"这件事）。★ 不显示数字 —— 见下面那个 effect 的注释。 */
  const [unreadDot, setUnreadDot] = useState(false);
  const store = (() => { try { return globalThis.__SP__?.store ?? null; } catch { return null; } })();
  const [, force] = useState(0);
  const feedRef = useRef(null);
  /** 输入框的 ref：**打开后必须立刻可打字** —— 由下面那条 `[open]` effect 统一聚焦（鼠标点开也一样）。 */
  const fieldRef = useRef(null);
  const open = prefs.open;

  // ---- 本机偏好（设置页也会改它 ⇒ 订阅）--------------------------------------------------------
  useEffect(() => {
    const off = subscribePrefs(() => setLocalPrefs(getPrefs()));
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  // ---- 新消息：进记录；**弹幕关着**且面板收起时，才点一颗未读红点 -------------------------------
  //   ★★ 服主口径：「未读消息数显示（当前的"聊天 3"）**仅在弹幕功能关闭且收起时**显示，
  //      且**仅显示一个提示红点不显示数字**」。
  //   ★ 为什么"弹幕开着就不点红点"：弹幕开着时，新消息已经在屏幕上飘过一条 —— 玩家**已经看到了**，
  //     再点一颗红点就是重复提示（那是噪音，不是信息）。
  //   ★ 只留一个**布尔**（`unreadDot`），不再累计条数 ⇒ 窄标签里也不再出现数字。
  useEffect(() => {
    const off = onRow(({ mine }) => {
      try {
        setFeed(feedSnapshot());
        if (getPrefs().open || mine || getPrefs().danmaku) return;
        setUnreadDot(true);
      } catch { /* ignore */ }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  // ---- 队友 / 观战席名册变化（用来解析"谁说的"）⇒ 重渲染一次 -----------------------------------
  useEffect(() => {
    if (!store?.subscribe) return undefined;
    const off = store.subscribe(() => force((n) => n + 1));
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [store]);

  // ---- 打开面板就清掉未读红点；记录变长就滚到底 ------------------------------------------------
  useEffect(() => { if (open && unreadDot) setUnreadDot(false); }, [open, unreadDot]);
  // ★ 弹幕被打开 ⇒ 新消息会在屏上飘过（玩家已经看到）⇒ 红点的前提不成立，顺手清掉。
  useEffect(() => { if (prefs.danmaku && unreadDot) setUnreadDot(false); }, [prefs.danmaku, unreadDot]);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    try { el.scrollTop = el.scrollHeight; } catch { /* ignore */ }
  }, [feed.length, open]);

  // ---- ★★ 按键打开聊天（设置页「打开聊天键」可改 / 可禁用，出厂 `Enter`）-------------------------
  //   ★ 服主口径：「增加一个打开聊天框的按键配置（默认 Enter）；**打开时即可输入**，
  //      而不是还要用鼠标去点输入框」。
  //   ★ 五条边界（每条都有原因，别删）：
  //     ① **捕获阶段**监听：宿主或别的 Mod 也可能用同一个键 ⇒ 捕获阶段先拿到，再 `preventDefault()` 拦下；
  //     ② 焦点在别的输入框（INPUT / TEXTAREA / contenteditable）**一律不管** —— 否则玩家在别处打字会被打断；
  //     ③ 带 Ctrl / Alt / Meta 的组合键不管；中文输入法组字中（`isComposing`）不管；
  //     ④ 已经开着（`prefs.open`）或被禁用（`openKey === ''`）不管；
  //     ⑤ 真正的"点一下才能打字"根因是**焦点没进输入框** ⇒ 交给下面那条 `[open]` effect（渲染完再 focus）。
  useEffect(() => {
    const onKey = (e) => {
      try {
        const p = getPrefs();
        if (p.open || !p.openKey) return;
        if (e.defaultPrevented || e.isComposing || e.key !== p.openKey) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        setPrefs({ open: true });
      } catch { /* ignore */ }
    };
    const doc = globalThis.document;
    try { doc?.addEventListener?.('keydown', onKey, true); } catch { /* ignore */ }
    return () => { try { doc?.removeEventListener?.('keydown', onKey, true); } catch { /* ignore */ } };
  }, []);

  // ---- 打开就把光标放进输入框（鼠标点开 / 按键开 都走这里 ⇒ 行为统一）----------------------------
  //   ★ Preact 的渲染是**异步**的：`setPrefs({open:true})` 之后同一帧里 DOM 还没挂上 ⇒ 直接 focus 会扑空，
  //     玩家就得再点一次 —— 这正是"打开后还要用鼠标点输入框"的根因。所以：先试一次，没挂上再等 rAF（最多 3 帧）。
  useEffect(() => {
    if (!open) return undefined;
    const focusField = () => {
      const el = fieldRef.current || document.querySelector('.sp-chat__field[data-sp-chat-input="1"]');
      if (!el) return false;
      try { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ }
      return true;
    };
    if (focusField()) return undefined;
    let n = 0;
    const tick = () => { if (n < 3) { n += 1; if (!focusField()) globalThis.requestAnimationFrame?.(tick); } };
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') raf(tick); else focusField();
    return undefined;
  }, [open]);

  const onSend = useCallback(() => {
    if (busy) return;
    const cfg = readChatCfg(readCfgSafe(api));
    const r = sanitizeText(draft, cfg.maxLen);
    if (!r.ok) {
      if (r.len) setFeed(pushFeed(errItem('太长：最多 ' + String(cfg.maxLen) + ' 个字')));
      return;
    }
    setBusy(true);
    Promise.resolve(sendChat(draft, cfg.maxLen)).then((res) => {
      setBusy(false);
      if (res && res.ok) { setDraft(''); return; }
      if (res && res.local === 'offline') { setFeed(pushFeed(errItem('还没有连上房间'))); return; }
      // ★ 服务端给的拒绝原因原样摊出来（code + 开发者 detail）—— 不自己编一套文案。
      const detail = res && res.detail ? '（' + String(res.detail) + '）' : '';
      setFeed(pushFeed(errItem('被拒：' + String((res && res.code) || 'ERROR') + detail)));
    }).catch(() => {
      setBusy(false);
      setFeed(pushFeed(errItem('发送失败')));
    });
  }, [api, busy, draft]);

  // ---- 收起态：**右上角一枚方块图标键**（大小 = 官方 EFFECTS 单框，摆在那一列正上方）----------------
  //   ★★ 服主口径：「收起时只显示一个框 + 聊天 SVG 图标（风格类似左下的设置栏），
  //      大小与右侧 EFFECTS 单框相同，置于 EFFECTS 栏的上方」。
  //   ★ 文字标签没有了（原来是竖排「聊天」）⇒ 无障碍靠 `aria-label`（触屏 / 读屏都读得到）。
  if (!open) {
    return html`<button type="button" class="sp-chat__tab" data-sp-chat-tab="1" data-sp-chat-unread=${unreadDot ? '1' : '0'}
      aria-label=${unreadDot ? '展开聊天（有新消息）' : '展开聊天'} aria-expanded=${'false'}
      onClick=${() => setPrefs({ open: true })}>
      ${chatIcon(html)}
      ${unreadDot ? html`<span class="sp-chat__dot" data-sp-chat-dot="1" aria-hidden="true"></span>` : null}
    </button>`;
  }

  const cfg = readChatCfg(readCfgSafe(api));
  const state = stateSnapshot();
  const ability = canSend(state);
  const roomCode = state?.room?.code ?? null;
  const roomBlocked = !!roomCode && cfg.denyRooms.includes(roomCode);
  const enabled = cfg.enabled === true && ability.can && !roomBlocked;
  const cap = clampMaxLen(cfg.maxLen);
  const typed = sanitizeText(draft, cap);
  const typedLen = typeof draft === 'string' ? [...draft].length : 0;
  const hint = !cfg.enabled
    ? '这台服务器没有开启对局内聊天'
    : (roomBlocked ? '本房间已关闭聊天' : (ability.can ? '' : '进入对局后可用'));

  return html`<div class="sp-chat__box" data-sp-chat-open="1" data-sp-chat-fs=${String(prefs.font)}
    style=${'--sp-chat-fs:' + String(prefs.font)}>
    <div class="sp-chat__head">
      <span class="sp-chat__title">${'对局聊天'}</span>
      <span class="sp-chat__acts">
        <button type="button" class="sp-chat__icon" aria-label=${'清空记录'} data-sp-chat-clear="1"
          onClick=${() => { clearFeed(); setFeed(feedSnapshot()); }}>
          <${Icon} name="close" />
        </button>
        <button type="button" class="sp-chat__icon" aria-label=${'收起聊天'} aria-expanded=${'true'}
          data-sp-chat-collapse="1" onClick=${() => { setPrefs({ open: false }); onCollapse?.(); }}>
          <${Icon} name="chevronRight" />
        </button>
      </span>
    </div>

    <div class="sp-chat__feed" ref=${feedRef} role="log" aria-live="polite"
      data-sp-chat-count=${String(feed.length)} data-sp-chat-max=${String(FEED_MAX)}>
      ${feed.length === 0 ? html`<p class="sp-chat__empty">${'还没有人说话。'}</p>` : null}
      ${feed.map((m) => {
        const who = m.playerId ? nameOf(state, m.playerId) : '';
        const mine = !!(state?.me?.playerId && m.playerId === state.me.playerId);
        const kindCls = m.kind === 'sys' ? ' is-sys' : (m.kind === 'err' ? ' is-err' : '');
        const cls = 'sp-chat__msg' + kindCls + (mine ? ' is-me' : '');
        return html`<div class=${cls} key=${'m' + String(m.seq)} data-sp-chat-msg=${String(m.seq)}>
          ${who && !kindCls ? html`<span class=${'sp-chat__who' + (mine ? ' is-me' : '')}>${mine ? '我' : who}</span>` : null}
          <span class="sp-chat__text">${m.text}</span>
        </div>`;
      })}
    </div>

    <div class="sp-chat__foot">
      <div class="sp-chat__inputrow">
        <textarea class="sp-chat__field" data-sp-chat-input="1" ref=${fieldRef}
          placeholder=${enabled ? '说点什么…' : (hint || '暂时不能发言')}
          disabled=${!enabled} rows=${2} maxlength=${String(inputMaxLength(cap))}
          value=${draft}
          onInput=${(e) => setDraft(e && e.currentTarget ? String(e.currentTarget.value) : '')}
          onKeyDown=${(e) => {
            // Enter 发送 / Shift+Enter 换行（输入框是 textarea，所以要自己判）。
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSend(); }
            if (e.key === 'Escape') { setPrefs({ open: false }); onCollapse?.(); }
          }}></textarea>
        <${Button} variant="primary" size="sm" loading=${busy} disabled=${!enabled || !typed.ok}
          onClick=${onSend}>${'发送'}<//>
      </div>
      <div class="sp-chat__meta">
        <span data-sp-chat-hint=${hint || 'ok'}>${hint || ('每条最多 ' + String(cap) + ' 个字')}</span>
        <span class=${'sp-chat__count' + (typedLen > cap ? ' is-over' : '')}
          data-sp-chat-typed=${String(typedLen)}>${String(typedLen) + ' / ' + String(cap)}</span>
      </div>
    </div>
  </div>`;
}

/** 读一次合并后的 `config`（拿不到 ⇒ null ⇒ 走"没装 Mod"那一支）。 */
export function readCfgSafe(api) {
  try { return api?.data?.get?.('config') ?? null; } catch { return null; }
}
