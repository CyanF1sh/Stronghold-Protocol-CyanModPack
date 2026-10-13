// mods/cyanfish.skinvoice/client/menu.js — 顶栏/窄屏那一档的**皮肤**切换件（宽屏下拉 / 窄屏仅图标 + 浮层）。
//
// ★★ 0.15.0（工序 48）之后**本文件不再有语音件**，原因见 `officialroute.js` 文件头：
//   服主口径「时装专属语音应保留，但触发情况应整合进官方路线」⇒ 我们不再自己播语音 ⇒
//   "顶栏放一个语音下拉（中文 / 日文 / 关闭）"这件事**没有意义了**：
//     · 语种：官方设置里本来就有「语音语言（中文 / 日本語）」—— 我们不再另立一个；
//     · 开关：本 Mod **不许改任何官方默认设置**，官方「干员语音」音量滑块就是那个开关。
//   ⇒ `VoiceSelect` / `VOICE_ROWS` / `LANG_LABEL` / `LANG_SHORT` / `IconMenu` 的语音分支全部删除（不留死码）。
//   ★★ 0.17.0（阶段 0 · 第二半）补一句：连"**单干员**档位"也不再由本 Mod 提供 —— 上游 0.2.3 原生实现
//      了逐干员语音语言（`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`），我们那一整条轴删除
//      （真值表与理由见 `controls.js` 文件头）⇒ 本文件此后**只认皮肤**，顶栏与浮层里都只有皮肤一件。
//
// ★ 皮肤件保留原样（形态与取舍都没有变）：
//   · 宽屏（full / skin 档）= 原生皮肤**下拉栏**，★ 只列**当前观看的干员**的时装（v0.6.0 口径：
//     「直接显示所有干员皮肤列表很卡而且不好翻页与定位」）；
//   · 窄屏（icon / mini 档，手机横屏）= **仅图标按钮 + 点击展开的列表浮层**（手机网页端画面紧张，
//     用户口径「可以仅显示图标，点击时在图标左下展开列表」）。
//
// ★ 为什么用原生 <select> 而不是自绘下拉：宿主 loadout 页自己的筛选器就是 `.lo-select > select`
//   （loadout.css:119），原生控件在手机网页端走系统选择器，窄屏不会溢出、点按区域也够大。
//   Mod 规范 §6.4-3 明确允许"用宿主已有的 class"，所以这里直接借用 `.lo-select` 的观感，
//   再用 `.sp-sv__sel` 收一道宽度，避免长时装名把顶栏撑开。
//
// ★ 齿轮**不在本文件里**（v0.6.0 起）：由 `cyanfish.mod-settings` 提供（同一个插槽），
//   只有**没装**它时 `index.js` 才补一个 FallbackGear。

import { iconVNode } from './icons.js';

/** 把 nameOf 的依赖收进来（避免 menu ←→ panels 循环 import：names 是 Map，直接用）。 */
const nameOf = (names, charId) => (names && names.get && names.get(charId)) || charId;

/** 「有时装」的干员，按表里的顺序（gen 脚本已按 charId 排好）。★ 仅供统计/校验使用，下拉不再用它渲染。 */
export function opsWithSkins(table) {
  return Object.entries(table?.operators || {}).filter(([, o]) => Array.isArray(o.skins) && o.skins.length);
}

/**
 * 皮肤下拉栏（顶栏用）。
 *
 * ★★ 口径：只列**当前干员**的时装，一个「官方默认」+ 该干员的 N 套（绝大多数情况不超过 5 项）。
 *   ★ 值的编码仍是 `<charId>|<skinId>`（skinId 为空 = 官方默认）：`skinId` 里可能有 `#`
 *     （如 `char_4217_makoto_p3r#1`），所以**不能**用 `#` 分隔。
 *
 * @param {{ api:any, cfg:any, skins:any, table:any, names:Map<string,string>, op:string, display?:string, onChanged?:Function }} props
 *   `display` = 展示用名字（别的 Mod 新增干员的 chess.name ≠ charId 的官方名，见 index.js displayNameOf）
 */
export function SkinSelect({ api, cfg, skins, table, names, op, display, onChanged }) {
  const { html, hooks: { useState } } = api.ui;
  const [, force] = useState(0);
  const c = cfg.get();
  const opLabel = display || nameOf(names, op);
  const list = table?.operators?.[op]?.skins;
  const mine = Array.isArray(list) ? list : [];

  // 当前观看的干员没有时装（Mod 新增干员 / 官方没出时装的干员）⇒ 只留一个占位项，
  // 否则 <select> 会显示空白（值仍是 `<charId>|`，与"官方默认"等价，不会写坏配置）。
  const value = `${op}|${(c.skins || {})[op] || ''}`;

  const onChange = (e) => {
    const raw = String(e.currentTarget.value || '');
    const i = raw.indexOf('|');
    const charId = i < 0 ? raw : raw.slice(0, i);
    const skinId = i < 0 ? '' : raw.slice(i + 1);
    void Promise.resolve(skins.choose(charId, skinId || null))
      .then(() => { force((n) => n + 1); onChanged?.(); })
      .catch(() => { /* choose 内部已 try/catch；这里只兜底不冒泡 */ });
  };

  return html`<label class="sp-sv__sel" title=${`切换皮肤（仅当前干员：${opLabel}，立即生效）`}>
    ${iconVNode(html, 'shirt')}
    <select value=${value} onChange=${onChange} aria-label="切换皮肤" data-sp-sv-skins=${mine.length}>
      <option value=${`${op}|`}>${mine.length ? '官方默认' : `${opLabel} · 无时装`}</option>
      ${mine.map((s) => html`<option key=${s.id} value=${`${op}|${s.id}`}>${s.name}</option>`)}
    </select>
  </label>`;
}

/** 顶栏要显示"跳过皮肤"时的轻量提示（拿不到 vendor preact / 数据表时用）。 */
export function TopbarHint({ api, text }) {
  const { html } = api.ui;
  return html`<span class="sp-sv__topwarn" title=${text}>${iconVNode(html, 'gear')}皮肤不可用</span>`;
}

// ------------------------------------------------------------------------------------------------
// 仅图标档（`icon` / `mini`；手机横屏）
//
// ★★ 用户口径（2026-10-08）：「在手机网页端未出现皮肤/语言切换按键，但 mod 设置按键正常出现。
//    手机网页端画面紧张不好显示的话可以仅显示图标，点击时在图标左下展开列表」。
//
// ★ 为什么手机上看不到（实测，`probe_mobile_topbar*.mjs` / 15 个宽度档）：
//   竖屏（<768px 宽）被宿主的「请将设备横屏」遮罩挡住，真实场景是横屏手机；而横屏时右簇余量只有
//   **46~73px**（宿主自己的 `已同步/已调整/全部恢复默认` 就吃掉 260~300px），连 `皮肤下拉 ≥70px`
//   都放不下 ⇒ `TIER_BY_BUDGET` 给出 `'gear'` ⇒ 下拉被整个 display:none，页面上只剩
//   `cyanfish.mod-settings` 画的那颗齿轮。这正是用户看到的现象。
//
// ★ 所以窄屏不再"什么都不画"：一个 22px 的图标按钮，点一下在下方展开该干员的时装列表。
//   ★★ 0.15.0：语音那一个按钮**删了** —— 顶栏不再承载语种（见文件头）。

/**
 * 一个图标按钮 + 它点击后展开的列表浮层（**只列皮肤**）。
 *
 * @param {{ api:any, cfg:any, skins:any, table:any, names:Map<string,string>, op:string,
 *           display?:string, onChanged?:Function, align?:'left'|'right', micro?:boolean }} props
 *   ★★ 0.18.0 新增 `align`：入口 0.18.0 起挂在**顶栏左簇**（插槽 `loadout.topbarLeft`），而左簇贴着
 *   屏幕**左**缘 ⇒ 浮层必须**向右**展开（`left:0`）；右簇时代那套 `right:0`（向左展开）在左簇上会把
 *   整块伸出屏幕外点不到。默认 `'right'` = 老行为（老宿主没有左簇插槽时整簇退回右簇，方向也得跟着回去）。
 *   ★ `micro`：最后一档（375px 竖屏这种"宿主左列只剩几十像素"时）—— 同一个按钮，只是缩到 14px。
 */
export function SkinIconMenu({ api, cfg, skins, table, names, op, display, onChanged, align = 'right', micro = false }) {
  const { html, hooks: { useState, useEffect, useRef } } = api.ui;
  const c = cfg.get();
  const opLabel = display || nameOf(names, op);
  const list = table?.operators?.[op]?.skins;
  const mine = Array.isArray(list) ? list : [];
  const curSkin = (c.skins || {})[op] || '';

  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const rootRef = useRef(null);

  // ★ 关浮层的两条路：点外面（捕获阶段，pointerdown 比 click 早、和原生 <select> 手感一致）
  //   与 Esc。★ 必须判 `contains(e.target)`：否则点按钮自己会先被 onDown 关掉、再被 onClick 打开，
  //   表现成"点了没反应"。
  useEffect(() => {
    if (!open) return () => {};
    const onDown = (e) => { try { if (!rootRef.current || !rootRef.current.contains(e.target)) setOpen(false); } catch { /* ignore */ } };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pickSkin = (skinId) => {
    void Promise.resolve(skins.choose(op, skinId || null))
      .then(() => { force((n) => n + 1); setOpen(false); onChanged?.(); })
      .catch(() => { /* choose 内部已 try/catch；这里只兜底不冒泡 */ });
  };

  const title = `切换皮肤（仅当前干员：${opLabel}，立即生效）`;

  const skinBlock = html`<div class="sp-sv__pophead">皮肤 · ${opLabel}</div>
    <button key="__default" type="button" data-sp-sv-pick=""
      class=${`sp-sv__item${curSkin ? '' : ' is-on'}`}
      onClick=${() => pickSkin('')}>${mine.length ? '官方默认' : '无时装'}</button>
    ${mine.map((s) => html`<button key=${s.id} type="button" data-sp-sv-pick=${s.id}
      class=${`sp-sv__item${curSkin === s.id ? ' is-on' : ''}`}
      onClick=${() => pickSkin(s.id)}>${s.name}</button>`)}`;

  return html`<span class=${`sp-sv__iconwrap${align === 'left' ? ' sp-sv__iconwrap--left' : ''}`} ref=${rootRef}>
    <button type="button" class=${`sp-sv__iconbtn${micro ? ' sp-sv__iconbtn--micro' : ''}`} title=${title} aria-label=${title}
      aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
      data-sp-sv-icon="skin" data-sp-sv-skins=${mine.length}
      onClick=${() => setOpen((v) => !v)}>${iconVNode(html, 'shirt')}</button>
    ${open ? html`<div class="sp-sv__pop" role="menu" aria-label=${title}>${skinBlock}</div>` : null}
  </span>`;
}

/**
 * 顶栏「仅图标」档：**只有一个皮肤按钮**（`single` 这个形参保留只为兼容旧调用点，两个档现在同形）。
 * @param {{ api:any, cfg:any, skins:any, table:any, names:Map<string,string>, op:string,
 *           display?:string, onChanged?:Function, single?:boolean, align?:'left'|'right', micro?:boolean }} props
 *   `align='left'` ⇒ 浮层向右展开（0.18.0 起入口在顶栏左簇，贴着屏幕左缘）。默认 `'right'` = 老行为。
 *   `micro=true` ⇒ 14px 极小图标（`micro` 档，见 index.js 的 LEFT_TIER_BY_BUDGET）。
 */
export function IconBar({ api, cfg, skins, table, names, op, display, onChanged, align = 'right', micro = false }) {
  const { html } = api.ui;
  return html`<div class=${`sp-sv__icons${micro ? ' sp-sv__icons--micro' : ''}`}>
    <${SkinIconMenu} api=${api} cfg=${cfg} skins=${skins} table=${table} names=${names}
      op=${op} display=${display} onChanged=${onChanged} align=${align} micro=${micro} />
  </div>`;
}
