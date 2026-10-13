// mods/cyanfish.announce/client/section.js — 本 Mod 在「模组设置」（`cyanfish.mod-settings`）里注册的那一栏：「公告」。
//
// ★★ 为什么要有这一栏（用户口径 2026-10-08）：
//   「需要在mod设置注册栏位回看」。弹窗只在"有未读"时出现**一次**，点掉「我知道了」之后就再也看不到
//   （已读按 id 落在 localStorage，改文案也不会重弹）⇒ 没有这一栏的话，玩家想再看一遍公告就没处可看。
//
// ★ 依赖面刻意压到最小：`api`（只用到 ui.html / ui.Button / ui.hooks）、`items`（已解析的公告）、
//   `storage`（已读集）、`version`（只用于底部显示）。**不 import 注册表、不碰 settings 外壳的 DOM。**
//
// ★ 样式**惰性注入**：在 useEffect 里装（而不是在注册时）。
//   本 Mod 的"零痕迹"口径是：**没有可用公告** ⇒ 不注册栏位、不弹、不注入样式、不占插槽。
//   有公告但全已读时不该弹窗，也不该凭空往 <head> 塞一份样式 —— 只有玩家**真的打开这一栏**才注入。

import { readSeen, markSeen } from './plan.js';
import { installStyle } from './style.js';
import { AnnounceCard } from './card.js';

/**
 * 本 Mod 在「模组设置」里的那一栏（回看）。★ 零参渲染 —— 依赖都在 `index.js` 的闭包里（registry.js 契约）。
 * @param {{ api:any, items:Array<object>, storage:any, version?:string, seat?:{seats:string,ceiling:string}|null }} props
 *   version —— 只用于显示（版本自证 ③），不传则退化成 `v?`。
 *   seat —— ★ 正文里 `{seats}` / `{ceiling}` 的**实时值**（`plan.js seatPhrase(readSeatInfo(合并后的 config))`）。
 *     由调用方在**每次渲染时**现算 ⇒ 正文里不写死任何可配置的数值（服主口径「待修复⑨」）。
 */
export function AnnounceSection({ api, items, storage, version, seat = null }) {
  const { html, Button, hooks: { useState, useEffect } } = api.ui;
  const [, force] = useState(0);
  const repaint = () => force((n) => n + 1);

  // 打开这一栏才注入样式（见文件头）。拿不到 document 时 installStyle 自己会静默跳过。
  useEffect(() => { installStyle(); }, []);

  const list = Array.isArray(items) ? items : [];
  const seen = new Set(readSeen(storage));
  const unread = list.filter((it) => it && !seen.has(it.id));
  const unreadIds = new Set(unread.map((it) => it.id));

  /** 一次把当前所有未读标掉 —— 给"我不想看弹窗"的玩家一个一键出口。 */
  const markAll = () => {
    try { markSeen(storage, unread); } catch { /* 写不进去也照常刷新（storage 可能不可用） */ }
    repaint();
  };

  if (!list.length) {
    return html`<div class="sp-an sp-an--flat">
      <p class="sp-an__empty">暂无公告。</p>
    </div>`;
  }

  return html`<div class="sp-an sp-an--flat">
    <div class="sp-an__bar">
      <span class="sp-an__count">共 ${list.length} 条公告${unread.length ? ` · 未读 ${unread.length} 条` : ''}</span>
      ${unread.length ? html`<${Button} variant="secondary" size="sm" onClick=${markAll}>全部标记为已读<//>` : null}
    </div>
    <div class="sp-an__list">
      ${list.map((it) => html`<${AnnounceCard} api=${api} item=${it} badge=${unreadIds.has(it.id)} params=${seat} />`)}
    </div>
    <p class="sp-an__ver">服务器公告 Mod · v${version || '?'}</p>
  </div>`;
}
