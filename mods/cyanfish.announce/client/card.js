// mods/cyanfish.announce/client/card.js — 单条公告的卡片。**弹窗与「模组设置」里的回看栏位共用同一份**。
//
// 抽出来的理由：两处的卡片长得必须一模一样（否则玩家回看时看到的排版和当初弹的不一致），
// 而唯一差别只是"要不要打『未读』角标" ⇒ 用一个 `badge` 开关，而不是复制两段 markup。
//
// ★ 纯展示：不碰 storage、不碰注册表、不注入样式（样式由调用方在装载时注入一次）。

import { splitBody, fillParams } from './plan.js';

/**
 * @param {{ api:any, item:{id:string,title:string,body:string,date:string,level:string}, badge?:boolean,
 *           params?:Record<string,string|number> }} props
 *   badge —— 是否显示「未读」角标（弹窗里全部都是未读，打了反而啰嗦，所以弹窗不传）。
 *   params —— ★ 正文里的**实时值占位符**（`{seats}` / `{ceiling}` …）在**渲染时**替换成从合并数据取到的真值。
 *     值由调用方注入（`plan.js seatPhrase(readSeatInfo(合并后的 config))`）：这样正文里**不写死**任何
 *     可配置的数值，数据变了文案就跟着变（服主口径「待修复⑨」：不许有过时信息）。见 plan.js 的说明。
 */
export function AnnounceCard({ api, item, badge = false, params = null }) {
  const { html } = api.ui;
  const lines = splitBody(fillParams(item.body, params));
  const hasHead = !!(item.title || item.date || badge);
  return html`<article class=${`sp-an__item is-${item.level}`} key=${item.id}>
    ${hasHead ? html`<header class="sp-an__head">
      ${item.title ? html`<h4 class="sp-an__title">${item.title}</h4>` : null}
      ${badge || item.date ? html`<div class="sp-an__meta">
        ${badge ? html`<span class="sp-an__badge">未读</span>` : null}
        ${item.date ? html`<time class="sp-an__date">${item.date}</time>` : null}
      </div>` : null}
    </header>` : null}
    <div class="sp-an__body">
      ${lines.map((line, i) => html`<p class="sp-an__p" key=${i}>${line}</p>`)}
    </div>
  </article>`;
}
