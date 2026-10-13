// mods/cyanfish.skinvoice/client/controls.js — **行内 / 详情面板**两处共用的**皮肤下拉**（`SkinControl`）：
//   只列**这名干员**的时装；与自选编队页按槽位那个控件共用同一份配置与 applier。
//
// ★★ 0.17.0（阶段 0 · 第二半）这里**只剩皮肤这一件**了：原来并排的「单干员语音档位」（`VoiceControlView`
//   / `VoiceControl`）整件删除 —— 上游 0.2.3 **原生实现了逐干员语音语言**
//   （`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`，存 `sp.pref.settings.voiceOverrides`），
//   与本 Mod 那一档**逐点等价**；两份并存时官方那份在 `audio.voice()` **内层**读 `voiceOverrides`、
//   我们那条在外层临时改 `audio.voiceLang` ⇒ 10 格真值表里有 2 格我们的设置被**静默吃掉**
//   （`内部工序记录` §3.4）⇒ 整条轴删除，能力交回官方。
//   ★ 行内第 5 格此后只剩皮肤下拉 ⇒ 控件总宽变松（原来两件合计 ≈150px，皮肤下拉最宽 152px）；
//     断点与档位阈值（`index.js` 的 `MIN_BUDGET`）**本工序不动**（保守：宁可少放一件，绝不压到标题）。
//
// ★★ 为什么这个控件长得像官方自己画的（`loadout.js` 的 `.lo-cult` 那一格）：
//   观感统一靠**借用官方已有的 class + 逐值复刻官方那一条规则**，不靠自绘：
//     · `.lo-select`（`public/css/screens/loadout.css:119`）= 官方筛选器 / 潜能·练度用的那个 native `<select>` 外壳
//       （右下角那颗 mint 三角是 CSS `background-image` 画的）；
//     · 我们落在 `.lo-arow`（第 5 列）里，**不是** `.lo-cult` 的子节点 ⇒ 官方那条
//       `.lo .lo-cult .lo-select { … }`（loadout.css:245-247，潜能/练度专用的"透明描边 + 极浅底"）
//       **命中不到我们**。工序 51 按服主口径把这一条**逐值复刻**到 `.sp-sv__lo` 上
//       （见 style.js 顶部"逐值复刻表"），于是两边 rest 态的计算样式逐项相同。
//       ★ 复刻的 6 项 = height / padding-left / border-color / background / select 的 padding / select 的 font-size；
//         其余（box-sizing / gap / display / cursor / 箭头图）本来就已经一致。
//
// ★★ 服主口径（工序 51）—— 这一行**不做"收成小图标"的展示**：
//   原先皮肤那件带一件衣服图标（`.sp-sv__svg`，来自 `icons.js` 的 `iconVNode`）。
//   服主要求**取消小图标**：① 它们是"这一格被压窄了所以收成图标"的展示，而窄屏本来就走
//   **顶部兜底 / 详情面板降级**（宿主 `@media (max-width:1599.98px){.lo-arow{display:none}}`）；
//   ② 图标挤掉了原生 `<select>` 的宽度，而"焦点绿框看起来比控件小"的观感也被它带偏。
//   ⇒ 图标节点**一个都不渲染**（DOM 里也查不到；`verify_skinvoice.mjs` 有一条硬断言盯着）。
//
// ★★ 0.19.0（工序 72）新增第三件：`SkinDetailRow` —— **详情面板**里那一行（官方「此干员语音」的下一行）。
//   它 = 「短标签 + 「？」小圈 + 皮肤下拉」的一行，**照官方 `.lo-voice` 那一行体系**（同 gap / 同 padding /
//   同字号 / 同控件高度；CSS 见 style.js 的 `.sp-sv__vrow` 一节，逐值对照在报告里给）。
//   ★ 为什么不复用 `SkinVoiceControls` 那层壳（`.lo-arow`）：那个类名是**行内那一格的接线** ——
//     宿主条件式第 5 列靠它开关、窄屏靠 `display:none` 降级。搬到详情面板里只会多一条
//     "用 `.sp-sv__detailrow .sp-sv__controls{display:flex}` 去盖掉 `.lo-arow{display:none}`"的隐式依赖。
//     所以详情面板这一行用**自己的外壳**；控件本体（`SkinControl` / `SkinControlView`）仍共用一份。

import { HintDot } from './panels.js';
import { makeT } from './i18n.js';

/** 本文件的界面文案翻译器（与 section.js 同一套：拿不到宿主 i18n 时退回中文原文 = msgid）。 */
const t = makeT(console);

/**
 * 详情面板那一行的「？」说明（§4.12.2 二：短标签 + 小圈，**不把长句平铺在行里**）。
 * ★ 一句一义、不写实现细节（不提变量名 / 存储键）；≤ 160 全角字。
 */
const DETAIL_SKIN_TIP = '只列这名干员的时装；选好立即生效，不用开设置页。'
  + '选择只保存在此浏览器，不影响其他玩家。没有可选时装的干员，这一栏是灰的。';

/**
 * 该干员的皮肤下拉（视图，无 hooks —— 与 `diy.js` 的 `DiySlotSkinView` 同一个约定，测试直接画它）。
 *
 * @param {{ api:any, cfg:any, skins:any, table:any, charId?:string, repaint?:Function,
 *           variant?:'row'|'detail', disabled?:boolean }} props
 *   `charId` 不给 ⇒ 画禁用态（行里理论上不会发生：宿主只在有干员的行里渲染这一格）。
 *   `variant` 只影响 `data-*` 与 title 文案（两处共用同一份配置与 applier，行为完全一致）。
 */
export function SkinControlView({ api, cfg, skins, table, charId, repaint, variant = 'row' }) {
  const { html } = api.ui;
  const list = table?.operators?.[charId]?.skins;
  const mine = Array.isArray(list) ? list : [];
  const cur = (cfg.get().skins || {})[charId] || '';
  const curName = (mine.find((s) => s.id === cur) || null)?.name || '';
  const title = mine.length
    ? `皮肤：${curName || '官方默认'}（${mine.length} 套可选 · 立即生效）`
    : '该干员没有可选时装';

  // 没有可选时装 ⇒ **禁用态**（同一个位置、同一个外形，不写配置、不发请求、不报错）。
  // ★ 不整块不画：一个灰掉的控件明确说了"是这名干员没有时装"，比一个空洞好读（与自选编队页同一条口径）。
  // ★★ 工序 51：**不画图标**（见文件头）——外形完全交给 `.sp-sv__lo`（= 官方潜能/练度那一套）。
  if (!mine.length) {
    return html`<label class=${`sp-sv__lo is-off sp-sv__lo--skin${variant === 'detail' ? ' sp-sv__lo--detail' : ''}`}
        data-sp-sv-pick=${charId || ''} data-sp-sv-skins="0" title=${title}>
      <select disabled=${true} aria-label="该干员没有可选时装"><option>无时装</option></select>
    </label>`;
  }

  const onChange = (e) => {
    const id = String(e.currentTarget.value || '');
    // `choose` 自己会：写本地配置 → 把材质清单改成这套 → 触发宿主重渲染（skins.js）。
    // 这里只补一次本地重画（`cfg.subscribe` 其实已经会触发，重复一次是幂等的）。
    void Promise.resolve(skins.choose(charId, id || null)).then(() => repaint?.()).catch(() => { /* choose 内部已 try/catch */ });
  };

  return html`<label class=${`sp-sv__lo sp-sv__lo--skin${cur ? ' is-on' : ''}${variant === 'detail' ? ' sp-sv__lo--detail' : ''}`}
      data-sp-sv-pick=${charId || ''} data-sp-sv-skins=${mine.length} data-sp-sv-skin=${cur}
      data-sp-sv-skin-name=${curName || '官方默认'} title=${title}>
    <select value=${cur} onChange=${onChange} aria-label=${`皮肤（${mine.length} 套可选）`}>
      <option value="">官方默认</option>
      ${mine.map((s) => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
    </select>
  </label>`;
}

/**
 * 带 hooks 的外壳：订阅配置，任何地方改了都跟着重画（与 `DiySlotSkin` / `SkinVoiceSection` 同一条做法）。
 * @param {{ api:any, cfg:any, skins:any, table:any, charId?:string, variant?:'row'|'detail' }} props
 */
export function SkinControl(props) {
  const { api, cfg } = props;
  const { hooks: { useState, useEffect } } = api.ui;
  const [, force] = useState(0);
  useEffect(() => { const off = cfg.subscribe(() => force((n) => n + 1)); return () => off?.(); }, []);
  return SkinControlView({ ...props, repaint: () => force((n) => n + 1) });
}

/**
 * 行里那一格 / 详情面板里那一条**共用的一层壳** —— 保证两处的 DOM 形状一致，
 * 验收脚本量行内与详情面板时可以**用同一个选择器**。
 *
 * ★★ 0.17.0：这一层里现在只有**皮肤**那一件（语音那一件已随"单干员语种"轴删除）。
 *   保留这一层壳而不直接返回 `SkinControl`，是因为顶层类名 `.lo-arow` 是**接线**而不是观感（见下）。
 * @param {{ api:any, cfg:any, skins:any, table:any, charId?:string, variant?:'row'|'detail' }} props
 */
export function SkinVoiceControls({ api, ...rest }) {
  const { html } = api.ui;
  // ★★ 顶层那一层**必须**是宿主那一格的类名 `.lo-arow` —— 这不是观感问题，是**接线**问题：
  //   宿主 `public/css/screens/loadout.css` 的条件式第 5 列是
  //      `.lo-list:has(> .lo-list__rows > .lo-card > .lo-arow:not(:empty)) { --cols: …第 5 列… }`
  //   而 `.lo-arow{display:flex;…}`（≥1600px）/ `.lo-arow{display:none}`（<1600px）也只认这个类名。
  //   我们注册进 `loadout.rowActions` 的那一格**就是** `.lo-card` 的那个直接子节点 ⇒ 这个类名必须由我们给。
  //   ★ 少了它：`:has()` 永不匹配 ⇒ 第 5 列永不打开 ⇒ 控件被挤成第 5 个隐式栅格项（换行/被裁），
  //     而 `display:none` 也不生效 ⇒ 窄屏降级失效（同一处控件在两处同时出现）。两者都是"静默错"。
  //   ★ 表头那一格（`props.head`）也走同一个插槽，由调用方交出一个**空的** `.lo-arow`（见 index.js）。
  return html`<span class="lo-arow sp-sv__controls">
    <${SkinControl} api=${api} ...${rest} />
  </span>`;
}

/**
 * ★★ 0.19.0（工序 72）：**详情面板**里那一行 —— 「短标签 + 「？」小圈 + 皮肤下拉」。
 *
 * 位置由宿主决定：`screens/loadout.js` 的 `Detail` 里，`<OperatorVoice>`（官方「此干员语音」，0.2.3 新增）
 * **之后的一行**（插槽 `loadout.detailVoice`）。★ 宽屏窄屏都在（详情面板本来就开着）——
 * 它不再是"行内放不下时的窄屏降级"，而是与行内那一格**并列**的常驻入口。
 *
 * 观感 = 官方 `.lo-voice` 那一行体系：`gap` / `padding` / `font-size` 逐值相同，控件高度按官方 `.lo-select`
 * （`.lo-voice .lo-select`）那一套（见 style.js 的 `.sp-sv__vrow`；真机 computed style 逐项对照在报告里给）。
 *
 * ★ 说明走「？」小圈（§4.12.2 二），**不**在行里平铺长句；小圈形状与 §4.12.2 二的规范形状**逐字相同**
 *   （`panels.js` 的 `HintDot`，纯 CSS `::after` + `data-tip`，无原生 `title`）。
 *
 * @param {{ api:any, cfg:any, skins:any, table:any, charId?:string }} props
 */
export function SkinDetailRow({ api, cfg, skins, table, charId }) {
  const { html } = api.ui;
  if (!charId) return null;
  return html`<div class="sp-sv__vrow" data-sp-sv-detail-row="voice" data-sp-sv-detail-char=${charId}>
    <span class="sp-sv__vrow__k">${t('干员时装')}</span>
    ${HintDot({ html, text: t(DETAIL_SKIN_TIP) })}
    <${SkinControl} api=${api} cfg=${cfg} skins=${skins} table=${table} charId=${charId} variant="detail" />
  </div>`;
}
