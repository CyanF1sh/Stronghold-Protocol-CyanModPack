// mods/cyanfish.chat/client/section.js — 本 Mod 在**设置页**里的那一栏（`settings.sections` 插槽）。
//
// ★ 受众 = **玩家**（docs/MODS.md §4.12.3 / §4.12.8.2）。所以这一栏只回答四件事：
//   ① 这个开关对他意味着什么；② 他会看到什么变化；③ 怎么撤回；④ 该选哪一档。
//   ★ **不写**服主关心的部署 / 上游状态，**不写**代码词，**不写**实现细节（那些在 README / mod.json）。
//
// ★ 有效设置项自查（§4.12.8.3 三条判据，逐条对得上）：
//   | 条目 | 真实生效的键 | 改了会看到什么 | 撤回路径 |
//   |---|---|---|---|
//   | 对局内弹幕 | `sp.pref.chat.danmaku` | 对局内顶部那条飘过的弹幕出现 / 消失 | 开关本身就是撤回（默认**开**） |
//   | 弹幕速度 | `sp.pref.chat.speed` | 同一条消息飘过屏幕用的时间变短 / 变长 | 「标准」档 |
//   | 聊天字号 | `sp.pref.chat.font` | 右侧聊天面板里的名字与正文变大 / 变小 | 「标准」档 |
//   | 打开聊天键 | `sp.pref.chat.openKey` | 收起聊天后**按一下就能把聊天打开并直接打字**（回车 / T / 斜杠 / 禁用） | 「回车」档 |
//   ⇒ 四条都**有真值、有可观察差别、有撤回**，没有展示行 / 分隔行 / 占位旋钮。
//
// ★ 排版照 §4.12.9.3：一行一个控件（宿主 `.set-row` 的三列 grid）；控件全部用**宿主已有的** class
//   （`.set-toggle` / `.set-seg`），一个都不自己画。
//   ★★ **不摆行尾读数**（服主口径：「设置页不用显示 ×1 的具体倍率」）：`.set-toggle` 与 `.set-seg` 都是
//   `grid-column: 2 / 4` ⇒ 分段控件**独占**后两列，读数那第三列本来就空着。
//   ⇒ 「选了哪一档」由**分段控件自己的高亮**（`.is-on`）表达，内部倍率（`1×` / `1.25×`）是**实现细节**，
//   玩家不需要看到 —— 它对玩家没有决策价值（§4.12.8.3 的自查问句："把它从 A 调到 B，玩家会看到什么
//   不同？"答案在**文字变大 / 飘得更快**，不在"倍率从 1 变成 1.25"）。
//   `title` ≤ 6 全角字；长说明一律收进「？」小圈（`HintDot`，纯 CSS + `data-tip` + `tabindex`，
//   **不并存原生 `title`** —— §4.12.2 二 / §4.12.9.6 的 R7）。
//
// ★ 「？」小圈**正好 4 个**（每行一个），可数、可取证。小圈文案 ≤ 160 全角字、一句一档、零实现细节。
// ★ 唯一的一行**状态读数**（`.sp-chat__hint`）保留：它写的是"约 N 秒飘完"——**会变、是玩家能感知的量**，
//   而且用的是**真值**算出来的（不是把倍率换个说法）。

import { OPEN_KEY_CHOICES, TRAVEL_BASE_MS } from './plan.js';
import { getPrefs, setPrefs, subscribe as subscribePrefs } from './store.js';

/** 「？」小圈的规范形状（§4.12.2 二：`aria-label` + `data-tip` + `tabindex`，**不加原生 `title`**）。 */
function HintDot(html, text) {
  return html`<span class="sp-chat__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/** 三档文本（档位之和 ≤ 4，每档 ≤ 2 全角字 —— 宿主 `.set-seg button` 是 min-width .8rem）。 */
const SPEED_STEPS = [
  { v: 0.7, label: '慢' },
  { v: 1, label: '标准' },
  { v: 1.5, label: '快' },
];
const FONT_STEPS = [
  { v: 0.9, label: '小' },
  { v: 1, label: '标准' },
  { v: 1.25, label: '大' },
];

/** 速度 → 一句人话（同一条消息在屏上大约待多久）。★ 用**真值**算，不写死一个数字。 */
function speedPhrase(v) {
  const s = Number(v) > 0 ? Number(v) : 1;
  const sec = Math.round((TRAVEL_BASE_MS / s) / 100) / 10;
  return '当前：约 ' + String(sec) + ' 秒飘完';
}

/**
 * 栏位内容（`register({ id, title, order, render })` 的 `render`）。
 * ★ 零参组件函数 —— 注册表契约（`client/registry.js`）：注册方在闭包里带上自己的依赖。
 * @param {{ api:any }} ctx
 * @returns {Function} 组件函数
 */
export function renderChatSection({ api }) {
  return function ChatSection() {
    const { html, hooks } = api.ui;
    const { useState, useEffect } = hooks;
    const [prefs, setLocal] = useState(() => getPrefs());

    useEffect(() => {
      const off = subscribePrefs(() => setLocal(getPrefs()));
      return () => { try { off?.(); } catch { /* ignore */ } };
    }, []);

    return html`<div class="set-list" data-sp-chat-section="1">
      <div class="set-row">
        <span class="set-row__label">${'对局内弹幕'}${HintDot(html,
          '开启后，别人发的消息会在对局画面顶部飘过一条。关掉只影响飘过的那一条，右侧聊天窗口照常显示。')}</span>
        <button type="button" class=${'set-toggle' + (prefs.danmaku ? ' is-on' : '')}
          role="switch" aria-checked=${prefs.danmaku ? 'true' : 'false'}
          data-sp-chat-set="danmaku" data-sp-chat-value=${prefs.danmaku ? 'on' : 'off'}
          onClick=${() => setLocal(setPrefs({ danmaku: !prefs.danmaku }))}>
          <i aria-hidden="true"></i><span>${prefs.danmaku ? '开启' : '关闭'}</span>
        </button>
      </div>

      <div class="set-row">
        <span class="set-row__label">${'弹幕速度'}${HintDot(html,
          '慢：一条消息在屏上待得久，看得清。标准：默认档。快：一掠而过，消息多的时候不排队。')}</span>
        <div class="set-seg" role="radiogroup" aria-label=${'弹幕速度'} data-sp-chat-set="speed">
          ${SPEED_STEPS.map((s) => html`<button key=${String(s.v)} type="button" role="radio"
            aria-checked=${prefs.speed === s.v ? 'true' : 'false'}
            class=${prefs.speed === s.v ? 'is-on' : ''} data-sp-chat-value=${String(s.v)}
            onClick=${() => setLocal(setPrefs({ speed: s.v }))}>${s.label}</button>`)}
        </div>
      </div>

      <div class="set-row">
        <span class="set-row__label">${'聊天字号'}${HintDot(html,
          '小：右侧聊天窗口的字小一点，一屏能多看几条。标准：默认档。大：字更大，远看也清楚。')}</span>
        <div class="set-seg" role="radiogroup" aria-label=${'聊天字号'} data-sp-chat-set="font">
          ${FONT_STEPS.map((s) => html`<button key=${String(s.v)} type="button" role="radio"
            aria-checked=${prefs.font === s.v ? 'true' : 'false'}
            class=${prefs.font === s.v ? 'is-on' : ''} data-sp-chat-value=${String(s.v)}
            onClick=${() => setLocal(setPrefs({ font: s.v }))}>${s.label}</button>`)}
        </div>
      </div>

      <div class="set-row">
        <span class="set-row__label">${'打开聊天键'}${HintDot(html,
          '收起聊天后，按这个键把聊天窗打开，光标会直接落在输入框里，抬手就能打字。回车是默认档；T 或斜杠适合和游戏里已有的按键错开；选「禁用」就只用鼠标点开。')}</span>
        <div class="set-seg" role="radiogroup" aria-label=${'打开聊天键'} data-sp-chat-set="openKey">
          ${OPEN_KEY_CHOICES.map((c) => html`<button key=${c.v || 'off'} type="button" role="radio"
            aria-checked=${prefs.openKey === c.v ? 'true' : 'false'}
            class=${prefs.openKey === c.v ? 'is-on' : ''} data-sp-chat-value=${c.v || 'off'}
            onClick=${() => setLocal(setPrefs({ openKey: c.v }))}>${c.label}</button>`)}
        </div>
      </div>

      <div class="sp-chat__hint" data-sp-chat-hint="speed">${speedPhrase(prefs.speed)}</div>
    </div>`;
  };
}

/** 供断言用：本栏位在注册表里的 id / 标题（`title` ≤ 6 全角字）。 */
export const SECTION_ID = 'cyanfish.chat';
export const SECTION_TITLE = '对局聊天';
export const SECTION_ORDER = 46;
