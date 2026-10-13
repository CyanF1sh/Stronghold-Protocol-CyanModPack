// 自选编队 (0.2.0 DIY; research 0.2.0 §2, the owner's decisions of 2026-10-05): the third tab of the 干员调配 overlay
// (screens/loadout.js). The slots are the ones the loaded data has (4 official: 5阶 ×2, 6阶 ×2; a Mod may add tiers —
// docs/MODS.md §4.9), each filled with an operator: a 6★ the player owns outside the
// chess pool (any of its three skills, any module of its elite form but a 集成战略 one) or a prototype (原型干员, its skill
// and module locked as when it stands in). Only operators with a kit are listed (the server's welcome.diyKitted). The
// slot picker lists the legal picks of the slot's tier — avatar, name, class, the bonds derived from its factions, a
// 原型 / 已持有 tag —, an operator held by another slot greyed out with where it is. In the match the operator is sold
// only in this player's shop, from 调度中心 level 5 (tier 5) / 6 (tier 6), and fights with the pick (server/match/player
// /diy.js). Out of match: the next match takes the picks. The picks live in ui/loadoutSync.js (localStorage + room.diy);
// the model is ui/diyModel.js. Styles: css/screens/loadout.css (diy-*). An owned pick's card carries its operator's 潜能 /
// 练度 selects (0.2.2, screens/cultivation.js — the same per-operator settings as 干员调配, `ops`); a prototype has neither.
// Every FILLED slot's action column carries the client-mod slot `loadout.diySlotActions` (ui/extensions.js) after the
// official 更换 / 清空: the host owns *where*, a mod owns *what* (cyanfish.skinvoice puts that slot's operator skin picker
// there). With nothing registered `UiSlot` renders null, so the column is byte-for-byte what it was before the slot existed.

import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Button, TierChip } from '../ui/components.js';
import { Img, RichText, BondGlyph } from '../ui/gameComponents.js';
import { chessAvatarUrl, chessPortraitUrl, profIconUrl, skillRecordIconUrl, moduleTypeIconUrl } from '../ui/assetUrls.js';
import { data } from '../data.js';
import { PROF_NAME, skillLabel, moduleBadge, fullTraitText, skillTags } from '../ui/loadoutModel.js';
import { diySlotList, pickChoices, pickOptions, slotRecord, defaultPick } from '../ui/diyModel.js';
import { diyVoidedByTiers } from '../../../shared/diy.js';
import { OperatorVoice } from '../ui/operatorVoice.js';
import { LoadoutStats } from '../ui/loadoutStats.js';
import { CultivationSelects } from './cultivation.js';
// 客户端 Mod 的落点：**每个槽位的操作区** `.diy-slot__acts` 末尾（ui/extensions.js 的 LOADOUT_DIY_SLOT_ACTIONS）。
// 官方那两个按钮（更换 / 清空）照旧、顺序语义不变；这个插槽没有注册者时 `UiSlot` 渲染成 `null`，
// Preact 的 null 占位不产生节点 ⇒ 空插槽时 `.diy-slot__acts` 与加插槽之前逐字节相同。
import { UiSlot, UI_SLOTS } from '../ui/extensions.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** `data/backups.json` 的 `diy` 段（`diy.slots` 必须是个对象），否则 null —— 与 shared/diy.js 同一判据。 */
const diyOf = (data) => {
  const d = isObj(data?.backups) ? data.backups.diy : null;
  return isObj(d) && isObj(d.slots) ? d : null;
};

/** The data the 自选 rules read (shared/diy.js): chess.json + backups.json (localized copies). */
export const diyData = () => ({ chess: data.get('chess'), backups: data.get('backups') });

/**
 * The 4★ 原型干员 (预备干员, no 先锋 / 特种) of a tier, or none: `data/backups.json diy.prototypes[tier]` minus the 6★
 * ones (`diy.ownedPool` is the owned 6★; the nine 6★ elites are not in it, so the reserves are told apart by the 4★
 * 预备干员 ids alone). 0 for a tier without its own `prototypes` table. The picker's note reads this instead of
 * assuming the reserves only exist at tier 5 (a Mod may give another tier the same table).
 */
const reserveCount = (tier) => {
  const d = diyData().backups?.diy;
  const list = d?.prototypes?.[tier];
  return (Array.isArray(list) ? list : []).filter((id) => /^char_60[0-7]_c/.test(String(id))).length;
};

/** A unit summary's avatar / portrait URL (a backups.json unit or a composed record). */
const avatarOf = (m, unit, elite = false) => chessAvatarUrl(m, unit && { charId: unit.charId, assets: { avatar: elite ? unit.assets?.avatarGolden : unit.assets?.avatar } });
const classLine = (u) => `${t(PROF_NAME[u?.profession] || '') || ''}${u?.subProfessionName ? ` · ${u.subProfessionName}` : ''}`;
const bondName = (id) => data.lookup('bonds', id)?.name || id;

/** The 原型 / 已持有 tag of a pick. */
function KindTag({ proto }) {
  return html`<span class=${cx('diy-tag', proto ? 'diy-tag--proto' : 'diy-tag--own')}>${proto ? t('原型') : t('已持有')}</span>`;
}

/** Bond chips (the bonds derived from the operator's factions; 协防 when none matches). */
function Bonds({ bonds }) {
  return html`<span class="diy-bonds">${(bonds || []).map((b) => html`<span key=${b} class="diy-bond"><${BondGlyph} bondId=${b} /><span>${bondName(b)}</span></span>`)}</span>`;
}

/**
 * A tier's 自选位限制的常态说明（v1.2.0，服主口径「3 阶的自选限制条件应在常态说明」）：
 * 「III阶」**栏标题最右**一个**带圈感叹号**（`data-testid="diy-tier-note"`）：**哪几阶会出现**由
 * `diy.slots[].voidedByTiers` 决定（`cyanfish.diy-34` 给 3 阶位写了 `[5, 6]`），**文案与皮肤**由同一槽位的
 * `voidedNote` 决定（v1.3.1，见下）—— 两个键都没有的阶**不渲染任何东西**
 * ⇒ 官方 5 / 6 阶、或停用该 Mod 时，`h3.own-tier__head` 的子节点与加这一行之前**逐节点相同**。
 *
 * ★ 它讲的是**规则**（选了 V / VI 阶会怎样），**不**讲此刻的结果 —— 结果由行标题右侧那条琥珀色警告讲
 *   （`SlotCard` 的 `data-testid="diy-slot-voided"`）：两处同一位置体系、不堆同一条信息。
 * ★ 形状照 docs/MODS.md §4.12.2 的规范小圈：`.diy-tier-note` + `data-tip` + `tabindex="0"`（触屏点一下也能看），
 *   样式是**这一页自己注入**的一小块（下面的 `DIYTIP_CSS`，与 Mod 自带样式同一个做法），**没动宿主任何 CSS**。
 *   ★★ v1.2.1（工序 52）：**不再设原生 `title`** —— 之前 `title` 与自有气泡（`::after{content:attr(data-tip)}`）
 *   同时存在 ⇒ 浏览器悬停时**两套框重合**（原生气泡白底黑字 + 我们那套 UI 风格的面板）。
 *   提示只剩一套（自有气泡）；无障碍由 `aria-label`（屏幕阅读器）+ `:focus`（键盘 Tab / 触屏点一下）承担：
 *   `tabindex="0"` 的元素一点就 focus，`DIYTIP_CSS` 里 `:focus::after` 立刻弹出 ⇒ 触屏 / 无悬浮环境仍有说明。
 *   ★ 不设 `title` 的代价（诚实登记）：桌面端**长按**也看不到原生气泡了 —— 但自有气泡悬停即出，本页不缺这条路。
 * ★ 为什么不用宿主 `ui.Tooltip`：真机实测（工序 49）它在**这一页**画错位置 —— 本页 `.lo` 是 `position:fixed`
 *   的全屏浮层，宿主 `TooltipLayer` 那份 `position:fixed` 提示落在浮层的定位上下文里，弹出面板跑到视口左上角
 *   （实测：小圈在 y=167，弹出面板却画在 y=116，离小圈 50px 且压住「每个自选名额…」那一段），
 *   ⇒ 按 §4.12.2「长度上限 + 纯 CSS 小圈」的默认路线走（那条已知取舍见同节）。
 *
 * ★ v1.3.1（工序 113）：小圈的**文案与配色改由数据说**（`diy.slots[].voidedNote`，docs/MODS.md §4.9）。
 * 形状 = 「显式开关 + 一个字符串 + 一个声明表」；**缺任意一项就整个不生效**（`enabled !== true` ⇒ null），
 * 基座走上面那条原来的路径 ⇒ 官方数据下页面与加这一段之前**逐节点相同**。
 *
 * 为什么要有这条缝（服主口径，2026-10-12）：「不装载该 Mod 时原游戏完全无影响」，且「更新 0.2.5 等后续版本时
 * 本 Mod 只需小修改 / 无修改」。原实现把那句话**硬编码在基座**、还占了 5 个语言包各一条 msgid ⇒ 每次平台升级
 * 重缝都要接 i18n 键冲突。改由数据给之后，基座对这句话**零新文案**，Mod 侧只改自己的 JSON。
 *
 * 三层分工（登记在 §4.9）：① 骨架（尺寸 / 定位 / ::after 气泡 / tabindex / 文字跟 --t）留在本文件的
 * `DIYTIP_CSS`，**中性**；② 皮肤（颜色 / 圆角 / 描边）由下面的 `style` 声明表拼成内联样式，**加**在原样式之后；
 * ③ 特效（气泡材质 / 关键帧 / 动效降级）由 Mod 自己的 `client/**` 注入，基座里搜不到任何一个颜色值。
 * ★ 数据里**没有** `{tiers}` 占位符：装了这个键就照它的原文渲染（多语言由 Mod 自己负责），
 *   没装才回落到基座原来那句 `t('选择 {tiers} 阶干员后，本项不生效')`。
 * @param {any} data @param {string} slotId 该阶**任一**声明了 voidedByTiers 的槽位（文案就挂在这条槽位上）
 * ★ 导出是为了让测试能**直接钉住这条缝的语义**，而不必去 patch 页面读的那份数据单例（工序 113 踩过的坑：
 *   patch 单例会让**同进程后面的其它测试文件**读到被换掉的数据 ⇒ 假红）。它是纯函数，导出不改变任何调用方。
 */
export function voidedNoteOf(data, slotId) {
  const cfg = diyOf(data)?.slots?.[slotId]?.voidedNote;
  if (!isObj(cfg) || cfg.enabled !== true) return null;
  const text = typeof cfg.text === 'string' ? cfg.text.trim() : '';
  if (!text) return null;
  return { text, style: styleDeclsOf(cfg.style) };
}

/** `diy.slots[].voidedNote.style` → 内联样式串：只收 CSS 属性形状的键（`--` 自定义属性也算），空表 ⇒ ''。 */
function styleDeclsOf(style) {
  if (!isObj(style)) return '';
  return Object.entries(style)
    .filter(([k, v]) => /^(--[a-z0-9-]+|[a-z-]+)$/.test(k) && (typeof v === 'string' || typeof v === 'number'))
    .map(([k, v]) => k + ':' + v)
    .join(';');
}

/** 该阶的 `voidedNote`（该阶任一槽位声明了就用它；升序取第一个 = id 序最小那条，保证多槽位同阶时可复现）。 */
function tierVoidedNote(slots, tier) {
  const D = diyData();
  for (const s of [...slots].filter((x) => x.tier === tier).sort((a, b) => (a.slotId < b.slotId ? -1 : 1))) {
    const cfg = voidedNoteOf(D, s.slotId);
    if (cfg) return cfg;
  }
  return null;
}

function DiyTierNote({ tiers, note = null, noteStyle = '', marker = false }) {
  if (!tiers || !tiers.length) return null;
  const text = note ? note.text : t('选择 {tiers} 阶干员后，本项不生效', { tiers: tiers.map((x) => ROMAN[x] || x).join('、') });
  const style = 'display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:max(.17rem,11px);height:max(.17rem,11px);border:1px solid var(--line-3);border-radius:50%;font-size:max(.11rem,8px);font-weight:700;line-height:1;color:var(--text-dim);cursor:help;position:relative'
    + (noteStyle ? ';' + noteStyle : '');
  // ★ `data-sp-diy-note` 是给 Mod 客户端用的**中性挂点**（一个空属性，基座自己不读它 ⇒ 不装 Mod 时零行为差异）：
  //   Mod 的 `client/**` 用 `[data-sp-diy-note]` 选择器给它加气泡材质 / 关键帧，而不必去猜基座的类名。
  return html`<span class="diy-tier-note" data-sp-diy-note=${marker ? '' : undefined} role="img" tabindex="0"
    aria-label=${text} data-tip=${text} style=${style}>!</span>`;
}

/**
 * 小圈弹出面板的样式（只服务 `.diy-tier-note`；一次性注入，见文件末尾的 `installDiyTipStyle()`）。
 * ★ 这一块是**骨架**（中性）：尺寸、定位、气泡的可读性口径。颜色 / 圆角 / 描边 / 发光这些**皮肤**由数据的
 *   `voidedNote.style` 以内联样式叠加（§4.9），气泡材质与动效由 Mod 的 `client/**` 以 `[data-sp-diy-note]`
 *   选择器叠加 ⇒ 基座里既没有 Mod 的颜色值，也没有 Mod 的文案。
 *
 * ★ v1.3.1（工序 113）：`.diy-tier-note[data-sp-diy-note]::after` 那一条只在**数据给了 voidedNote** 时命中
 *   （`data-sp-diy-note` 是基座挂的中性属性）—— 独立成一条而不是并进上面那条，是为了让「不装 Mod」时的
 *   规则文本**一个字节都不变**。两件事：① 气泡改用 `pre-line`（数据里的文案可以自带换行，例如
 *   「…为束缚 / 换取…」）；② 气泡离小圈 8px 而不是 4px（给 V3 的呼吸描边留出距离，否则动效会贴上气泡）。
 *   ★★ 这段说明**必须留在模板字面量之外**（工序 117）：本块由反引号定界，把中文注释写进模板里既会被
 *   `tools/i18n.mjs` 当成"未包裹的中文 UI 文案"报出来（`test/i18n.test.js` 那条红），又离反引号截断
 *   只差一个字符（真发生过一次）。⇒ 模板里只留 CSS，中文一律写在这里。
 */
const DIYTIP_CSS = `
.diy-tier-note::after {
  content: attr(data-tip);
  position: absolute;
  left: 0; top: calc(100% + 4px);
  z-index: 95;
  width: 3.1rem; padding: .07rem .09rem;
  font-size: max(.13rem, 10px); font-weight: 400; line-height: 1.5; letter-spacing: 0; white-space: normal;
  color: var(--text-md); background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 2px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .55);
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 120ms var(--ease-out, ease-out);
}
.diy-tier-note[data-sp-diy-note]::after {
  top: calc(100% + 8px);
  white-space: pre-line;
}
.diy-tier-note:hover, .diy-tier-note:focus { color: var(--mint-400); border-color: var(--mint-500); outline: none; }
.diy-tier-note:hover::after, .diy-tier-note:focus::after { opacity: 1; visibility: visible; }
`;

let diyTipStyled = false;
/** 幂等注入（模块只加载一次；一个 `<style>`，不碰宿主 CSS 文件）。 */
function installDiyTipStyle() {
  if (diyTipStyled || typeof document === 'undefined') return;
  diyTipStyled = true;
  const el = document.createElement('style');
  el.setAttribute('data-screen', 'diy-tier-note');
  el.textContent = DIYTIP_CSS;
  document.head.appendChild(el);
}
installDiyTipStyle();

/** 一个槽位当前失效时行标题右侧那条警告的文案（v1.2.0：位置从卡片正文挪到行标题右侧）。 */
const voidedText = (tiers) => t('已选择 {tiers} 阶自选：本项无效，不会进入卡池', { tiers: (tiers || []).join(' / ') });

/**
 * 某一阶的**常态限制**（`h3.own-tier__head` 右侧那个带圈感叹号要引用的阶）：本份数据里该阶**任一**槽位声明
 * `voidedByTiers` 时取它（升序去重）。官方数据里没有任何槽位写这个键 ⇒ 每一阶都返回 `[]` ⇒ 标题上没有小圈
 * （不装 / 停用 `cyanfish.diy-34` 时页面与上游逐节点相同）。
 */
function tierTiers(slots, tier) {
  const out = new Set();
  for (const s of slots) {
    if (s.tier !== tier) continue;
    for (const x of diyVoidedByTiers(diyData(), s.slotId) || []) out.add(x);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * ★ v1.2.0（工序 49 真机复测抓到的**真问题**）：还要标出**空着的**受限槽位。
 *
 * `shared/diy.js diyVoidedSlots(data, picks)` 只回答「**这一格自己填了**、且更高阶也填了 ⇒ 本格不生效」——
 * 它看的是 `picks` 里**已填**的键。于是**3 阶还空着**（最常见的那种局面：先选 5 / 6 阶、再回头看 3 阶）时，
 * 那一格**一条提示都没有**：玩家要一直到填完 3 阶、再回到列表页，才会看到"本项无效"。这不符合服主口径
 * 「触发自选限制后的警告说明应出现在行标题右侧」—— 触发条件一满足就该说。
 *
 * ⇒ 这里把它补全：**只要更高阶（`voidedByTiers` 列出的阶）已经填了**，受限的那一格就进名单，**不管它自己空不空**。
 *   空着时它照旧可以点进去选（选择框里不重复这条话）—— 但标题右侧先告诉你这一步的代价。
 *   官方数据里没有任何槽位声明 `voidedByTiers` ⇒ 这个函数恒返回 `[]`，是**纯加成**。
 */
function voidedWithEmpty(data, picks, voided) {
  const set = new Set(voided);
  const slots = data?.backups?.diy?.slots;
  if (!slots) return [...set];
  const filled = Object.keys(picks || {}).filter((id) => picks[id] != null && Object.prototype.hasOwnProperty.call(slots, id));
  for (const [id, s] of Object.entries(slots)) {
    if (set.has(id) || !s) continue;
    const tiers = diyVoidedByTiers(data, id);
    if (tiers.length && filled.some((other) => other !== id && tiers.includes(slots[other]?.tier))) set.add(id);
  }
  return [...set];
}

/** One slot: the pick (operator, class, bonds, skill, module, an owned pick's 潜能 / 练度) or an empty slot to fill. */
function SlotCard({ m, slot, pick, illegal, voided = false, voidedTiers = [], onOpen, onClear, ops = {}, onOps = null }) {
  const D = diyData();
  const rec = pick ? slotRecord(slot.slotId, pick, D) : null;
  const elite = pick ? slotRecord(slot.slotId, pick, D, { elite: true }) : null;
  const label = t('{tier}阶 自选', { tier: slot.tier });
  /**
   * ★ 不生效（`diy.slots[].voidedByTiers`：5/6 阶已经自选 ⇒ 3 阶位无效；本项不进卡池，但留在页面上让玩家看见自己选了什么）
   *   的警告 —— **行标题右侧**那一条（v1.2.0：服主口径「警告说明也应出现在行标题右侧而非选择框中」）。
   *
   * ★★ 工序 58（服主实测「一个框里两个 `[V 5阶 自选 已持有]`」）：v1.2.0 当时把「行标题那一行」做成了卡片里
   *   **多出来的第 1 行**（`data-diy-head="1"` + `grid-column:2 / 4` + `grid-template-rows:auto auto`），
   *   却**没有删掉**上游正文里原有的那一个 `.diy-slot__head` ⇒ 「TierChip + `{tier}阶 自选` + KindTag」
   *   这一份行标题被画了两遍（整页同列、纵向错开一行，5/6 阶也一样，因为它们共用这段代码）。
   *   现在改为**就地追加**：挂在**上游原有的那一个** `.diy-slot__head` 末尾（紧跟 KindTag 之后 = 行标题右侧），
   *   窄视口由宿主 `.diy-slot__head` 的 `display:flex` 自然折行：不生效那一支在**同一个** head 上加
   *   `flex-wrap:wrap`（警告整条落到标题下一行，绝不把标题挤成「3阶 自/选」），其余一概不加属性，
   *   **不新增行、不动 `grid-template-rows` / `grid-row`、不加属性** ⇒ 不触发的卡片与上游逐节点相同。
   *   ★★ 顺手记一条踩过的坑：**不许**写成 `<div class="diy-slot__head"${cond ? html` style=…` : null}>` ——
   *   htm 会把紧跟属性值后面的 `${}` 当成**那个 class 值的续接**（真机实测得到 `class="diy-slot__headnull"`，
   *   voided 那支更糟：整段 `style="flex-wrap:wrap"` 被并进 class 值里）。条件属性要么用属性值本身
   *   （`style=${…}`，会留下 `style=""`）、要么像下面空卡片那样**整块条件渲染**。
   *   空卡片没有行标题，改挂「选择干员」那一行的右侧（上游那条 `illegal` 提示见下）。
   *
   * ★★ 只由我们这份数据的 `voidedByTiers` 触发：官方数据里没有任何槽位写这个键 ⇒ `voided` 恒 false ⇒
   *   这个节点**一个都不渲染**（不装 / 停用 `cyanfish.diy-34` 时页面与上游逐值相同）。
   * ★ 官方那条 `illegal`（选了已不可用的干员）的提示**保持上游原样**，不借机改位置：
   *   空卡片 = 填充按钮之后一条，填了干员的卡片 = 正文末尾一条（与上游同一处、同一句）。
   */
  const voidedLine = voided
    ? html`<p class="diy-slot__bad" data-testid="diy-slot-voided" data-voided="1"
        style="margin:0;min-width:0"><${Icon} name="warn" /><span>${voidedText(voidedTiers)}</span></p>` : null;
  if (!rec) {
    const fill = html`<button type="button" class="diy-slot__fill" onClick=${() => onOpen(slot.slotId)} aria-label=${t('{slot}：选择干员', { slot: label })}>
      <${TierChip} tier=${slot.tier} size="sm" />
      <span class="diy-slot__plus"><${Icon} name="plus" /></span>
      <b>${t('选择干员')}</b>
      <small>${t('调度中心等级 {level} 起出现在商店', { level: slot.shopLevel })}</small>
    </button>`;
    return html`<div class=${cx('diy-slot', `diy-slot--t${slot.tier}`, 'is-empty', (pick || voided) && 'is-bad')} data-slot=${slot.slotId}>
      ${voidedLine
        ? html`<div class="diy-slot__head" style="align-items:flex-start;padding:.06rem .06rem 0">${fill}${voidedLine}</div>`
        : html`${fill}${pick ? html`<p class="diy-slot__bad"><${Icon} name="warn" />${t('这项自选在当前版本不可用，开局时会被移除')}</p>` : null}`}
    </div>`;
  }
  const proto = !!pick && D.backups?.diy?.prototypes?.[slot.tier]?.includes(pick.charId);
  const sk = rec.skill;
  const mod = elite?.module?.active ? elite.module : null;
  // ★ 行标题那三个孩子（TierChip + 「{tier}阶 自选」 + KindTag）单独拎出来：**只有不生效那一支**才需要
  //   在同一个 `.diy-slot__head` 上加 `flex-wrap:wrap`（让警告整条折到标题下一行，而不是把标题挤成「3阶 自/选」）。
  //   不生效之外的那一支渲染出来就是 `<div class="diy-slot__head">`，与上游逐字节相同（工序 58 已按 outerHTML 比过）。
  const headKids = [html`<${TierChip} tier=${slot.tier} size="sm" />`, html`<span class="diy-slot__label">${label}</span>`, html`<${KindTag} proto=${proto} />`];
  return html`<div class=${cx('diy-slot', `diy-slot--t${slot.tier}`, (illegal || voided) && 'is-bad')} data-slot=${slot.slotId} data-char=${rec.charId}>
    <div class="diy-slot__art"><${Img} src=${chessPortraitUrl(m, elite || rec)} fallback=${html`<b>${[...(rec.name || '?')][0]}</b>`} /></div>
    <div class="diy-slot__body">
      ${voidedLine
        ? html`<div class="diy-slot__head" style="flex-wrap:wrap">${headKids}${voidedLine}</div>`
        : html`<div class="diy-slot__head">${headKids}</div>`}
      <b class="diy-slot__name">${rec.name}</b>
      <small class="diy-slot__class">${classLine(rec)}</small>
      <${Bonds} bonds=${rec.bonds} />
      <span class="diy-slot__kit" data-skill=${sk?.index ?? ''}>
        <${Img} src=${skillRecordIconUrl(m, sk, { empty: false })} class="diy-slot__sicon" fallback=${html`<b class="num">${skillLabel(sk?.index)}</b>`} />
        <span><b class="num">${skillLabel(sk?.index)}</b> ${sk?.name || ''}${proto ? html` <small class="t-dim">${t('（锁定）')}</small>` : null}</span>
      </span>
      <span class="diy-slot__kit" data-module=${mod ? mod.id : 'none'}>
        ${mod ? html`<${Img} src=${moduleTypeIconUrl(data.get('local'), mod.type)} class="diy-slot__micon" fallback=${html`<b class="num">${moduleBadge({ typeName: mod.type })}</b>`} />` : html`<span class="diy-slot__micon diy-slot__micon--none">—</span>`}
        <span>${mod ? html`<b class="num">${mod.type || ''}</b> ${mod.name || ''}` : t('不装备模组')} <small class="t-dim">${t('（精锐时生效）')}</small></span>
      </span>
      ${proto ? html`<small class="diy-slot__cult t-dim">${t('原型干员没有潜能与练度')}</small>`
        : onOps ? html`<span class="diy-slot__cult"><${CultivationSelects} charId=${rec.charId} ops=${ops} onSet=${onOps} /></span>` : null}
      <${OperatorVoice} charId=${rec.charId} />
      ${illegal ? html`<p class="diy-slot__bad"><${Icon} name="warn" />${t('这项自选在当前版本不可用，开局时会被移除')}</p>` : null}
    </div>
    <div class="diy-slot__acts">
      <${Button} variant="secondary" size="sm" icon="refresh" data-testid="diy-change" onClick=${() => onOpen(slot.slotId)}>${t('更换')}<//>
      <${Button} variant="ghost" size="sm" icon="close" data-testid="diy-clear" onClick=${() => onClear(slot.slotId)}>${t('清空')}<//>
      <${UiSlot} name=${UI_SLOTS.LOADOUT_DIY_SLOT_ACTIONS}
        props=${{ slotId: slot.slotId, charId: rec.charId, tier: slot.tier, elite }} />
    </div>
  </div>`;
}

/** One operator of the picker's list. */
function OptionCard({ m, opt, selected, onSel }) {
  const u = opt.unit;
  const name = u?.name || opt.charId;
  const takenBy = opt.taken ? diySlotList(diyData()).find((s) => s.slotId === opt.taken) : null;
  return html`<button type="button" role="option" aria-selected=${selected ? 'true' : 'false'} data-char=${opt.charId}
      class=${cx('diy-opt', selected && 'is-sel', opt.taken && 'is-taken')} disabled=${!!opt.taken} onClick=${() => onSel(opt.charId)}
      title=${takenBy ? t('已在{tier}阶自选中', { tier: takenBy.tier }) : name}>
    <span class="diy-opt__ava"><${Img} src=${avatarOf(m, u)} fallback=${html`<b>${[...name][0]}</b>`} /></span>
    <span class="diy-opt__txt">
      <span class="diy-opt__top"><b class="diy-opt__name">${name}</b><${KindTag} proto=${opt.proto} /></span>
      <small class="diy-opt__class"><${Img} src=${profIconUrl(m, u?.profession)} class="diy-opt__prof" />${classLine(u)}</small>
      <${Bonds} bonds=${opt.bonds} />
    </span>
    ${takenBy ? html`<span class="diy-opt__taken">${t('已在{tier}阶自选中', { tier: takenBy.tier })}</span>` : null}
  </button>`;
}

/** A skill choice of an owned pick (or the locked skill of a prototype). */
function SkillRow({ m, s, on, locked, onPick, level }) {
  const rec = level === 'elite' ? s.elite || s.normal : s.normal || s.elite;
  const tags = skillTags(rec);
  return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} data-skill=${s.index} disabled=${locked}
      class=${cx('diy-choice', on && 'is-on')} onClick=${() => onPick(s.index)}>
    <span class="diy-choice__icon"><${Img} src=${skillRecordIconUrl(m, rec, { empty: false })} fallback=${html`<b class="num">${skillLabel(s.index)}</b>`} /></span>
    <span class="diy-choice__body">
      <span class="diy-choice__head"><b class="num">${skillLabel(s.index)}</b><b>${rec?.name || ''}</b>${on ? html`<span class="lo-badge lo-badge--on"><${Icon} name="check" />${locked ? t('锁定') : t('已选择')}</span>` : null}</span>
      <span class="diy-choice__tags"><span>${tags.sp}</span>${!tags.passive ? html`<span>${t('初始')} ${tags.init} · ${t('消耗')} ${tags.cost}</span>` : null}${tags.duration ? html`<span>${tags.duration}</span>` : null}</span>
      <${RichText} as="span" class="diy-choice__desc" text=${rec?.descRaw || rec?.desc || ''} />
    </span>
  </button>`;
}

/** A module choice of an owned pick (不装备 or a module of the elite form). */
function ModuleRow({ id, rec, on, locked, onPick }) {
  const none = id == null;
  const talents = rec && Array.isArray(rec.talentChanges) ? rec.talentChanges.filter((x) => x && x.desc && !x.hidden) : [];
  // the trait this module gives: the class trait (or the module's rewrite), then its extra line (item 16.2)
  const trait = rec?.traitOverride ? fullTraitText(rec.traitOverride) || null : null;
  return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} data-module=${none ? 'none' : id} disabled=${locked}
      class=${cx('diy-choice', 'diy-choice--mod', on && 'is-on')} onClick=${() => onPick(id)}>
    <span class="diy-choice__icon">${none ? html`<b>—</b>` : html`<${Img} src=${moduleTypeIconUrl(data.get('local'), rec.typeName)} fallback=${html`<b class="num">${moduleBadge(rec)}</b>`} />`}</span>
    <span class="diy-choice__body">
      <span class="diy-choice__head">${none ? html`<b>${t('不装备')}</b>` : html`<b class="num">${rec.typeName || ''}</b><b>${rec.name || id}</b>`}${on ? html`<span class="lo-badge lo-badge--on"><${Icon} name="check" />${locked ? t('锁定') : t('已选择')}</span>` : null}</span>
      ${trait ? html`<${RichText} as="span" class="diy-choice__desc" text=${trait} />` : null}
      ${talents.map((x, i) => html`<${RichText} key=${i} as="span" class="diy-choice__desc" text=${x.descRaw || x.desc} />`)}
    </span>
  </button>`;
}

/**
 * The slot picker: the legal operators of the slot's tier (prototypes first, then the owned 6★; a 原型 / 已持有 filter and
 * a search), the chosen one's skill / module (an owned pick) or its locked selection (a prototype), 确认 / 取消. The
 * state (filter, search, the draft pick) lives here; DiyPickerView draws it.
 * @param {{ m: any, slot: any, picks: Record<string, any>, kitted: string[]|null, onDone: (pick: any) => void, onClose: () => void }} props
 */
export function DiyPicker(props) {
  const [previewLevel, setPreviewLevel] = useState('elite');
  const cur = props.picks[props.slot.slotId] || null;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(cur ? { ...cur } : null);
  // Esc cancels only the picker, like its 取消 (GitHub #284, idea from PR #286); the 干员调配 overlay's own Esc skips
  // while a picker is open, and a dialog over the picker (导入) still takes Esc first. A layout effect: the listener is
  // attached in the same commit as the picker (a plain effect waits for the next frame, and an Esc pressed in between
  // was swallowed — the overlay skipped it, the picker did not hear it yet; the 0.2.2 full browser pass)
  useLayoutEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      props.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [props.onClose]);
  return DiyPickerView({ ...props, previewLevel, onPreviewLevel: setPreviewLevel, filter, query, draft, onFilter: setFilter, onQuery: setQuery, onDraft: setDraft });
}

/**
 * The picker's view (no hooks: the tests draw it): `filter` 'all' | 'proto' | 'owned', `query`, `draft` the pick being
 * made (null = none chosen yet) and their setters.
 */
export function DiyPickerView({ m, slot, picks, kitted, onDone, onClose, filter, query, draft, onFilter: setFilter, onQuery: setQuery, onDraft: setDraft, ops = {}, onOps = null, previewLevel = 'elite', onPreviewLevel = () => {} }) {
  const D = diyData();
  const cur = picks[slot.slotId] || null;
  const options = pickOptions(slot.slotId, picks, D, kitted);
  const q = query.trim().toLowerCase();
  const list = options.filter((o) => (filter === 'all' || (filter === 'proto') === o.proto)
    && (!q || [o.unit?.name, o.unit?.appellation, o.unit?.subProfessionName, t(PROF_NAME[o.unit?.profession] || ''), ...o.bonds.map(bondName)].some((x) => typeof x === 'string' && x.toLowerCase().includes(q))));
  const ch = draft ? pickChoices(draft.charId, slot.slotId, D) : null;
  const sel = (charId) => {
    if (draft?.charId === charId) return;
    setDraft(cur && cur.charId === charId ? { ...cur } : defaultPick(charId, slot.slotId, D));
  };
  const lk = ch?.locked || null;
  const skillOn = ch ? (ch.proto ? lk?.skillIndex : draft.skillIndex) : null;
  const modOn = ch ? (ch.proto ? lk?.uniEquipId ?? null : draft.uniEquipId ?? null) : null;
  const unit = draft ? D.backups?.units?.[draft.charId] : null;
  const label = t('{tier}阶 自选', { tier: slot.tier });
  const potential = ops[draft?.charId]?.potential ?? 6;
  const base = draft ? slotRecord(slot.slotId, draft, D, { potential }) : null;
  const golden = draft ? slotRecord(slot.slotId, draft, D, { elite: true, potential }) : null;
  const previewEntries = base ? { [base.baseId || base.chessId]: { skill: skillOn, module: modOn || 'none' } } : {};
  const previewChess = (id) => id === golden?.chessId ? golden : base;
  return html`<section class="diy-pick" role="dialog" aria-label=${t('{slot}：选择干员', { slot: label })} data-testid="diy-picker" data-slot=${slot.slotId}>
    <header class="diy-pick__head">
      <${TierChip} tier=${slot.tier} size="sm" /><b>${label}</b>
      <span class="diy-pick__note">${reserveCount(slot.tier) > 0 ? t('6★ 原型干员与持有的 6★ 干员，另有 4★ 原型干员（先锋、特种除外）') : t('6★ 原型干员与持有的 6★ 干员')}</span>
      <button type="button" class="diy-pick__x" aria-label=${t('关闭')} onClick=${onClose}><${Icon} name="close" /></button>
    </header>
    <div class="diy-pick__bar">
      <div class="lo-chips" role="group" aria-label=${t('筛选')}>
        ${[['all', t('全部')], ['proto', t('原型')], ['owned', t('已持有')]].map(([k, text]) => html`<button key=${k} type="button" class=${cx('lo-chip', filter === k && 'is-on')}
          aria-pressed=${filter === k ? 'true' : 'false'} data-filter=${k} onClick=${() => setFilter(k)}>${text}</button>`)}
      </div>
      <input type="search" class="diy-pick__search" value=${query} placeholder=${t('搜索干员 / 职业 / 盟约')} aria-label=${t('搜索干员 / 职业 / 盟约')}
        onInput=${(e) => setQuery(String(e.currentTarget.value).slice(0, 24))} />
    </div>
    <div class="diy-pick__main">
      <div class="diy-pick__list" role="listbox" aria-label=${t('可选干员')}>
        ${kitted == null ? html`<p class="lo-empty t-dim">${t('连接服务器后才能选择自选干员')}</p>`
          : list.length ? list.map((o) => html`<${OptionCard} key=${o.charId} m=${m} opt=${o} selected=${draft?.charId === o.charId} onSel=${sel} />`)
            : html`<p class="lo-empty t-dim">${t('没有符合条件的干员')}</p>`}
      </div>
      <div class="diy-pick__detail">
        ${ch && unit ? html`
          <div class="diy-pick__who">
            <span class="diy-pick__ava"><${Img} src=${avatarOf(m, unit, true)} fallback=${html`<b>${[...(unit.name || '?')][0]}</b>`} /></span>
            <span class="diy-pick__wtxt"><b>${unit.name}</b><small>${classLine(unit)}</small></span>
            <${KindTag} proto=${ch.proto} />
          </div>
          ${!ch.proto && onOps ? html`<section class="lo-sec"><header class="lo-sec__head"><h3>${t('潜能与练度')}</h3></header><${CultivationSelects} charId=${draft.charId} ops=${ops} onSet=${onOps} /></section>` : null}
          <${LoadoutStats} base=${base} golden=${golden} entries=${previewEntries} level=${previewLevel}
            onLevel=${onPreviewLevel} getChess=${previewChess} ops=${ch.proto ? null : ops} />
          <h4 class="diy-pick__sec">${t('技能')}${ch.proto ? html`<small>${t('原型干员的技能与补位时一致，不可更改')}</small>` : null}</h4>
          <div role="radiogroup" aria-label=${t('选择技能')} class="diy-pick__choices">
            ${ch.skills.filter((s) => !ch.proto || s.index === skillOn).map((s) => html`<${SkillRow} key=${s.index} m=${m} s=${s} level=${previewLevel} on=${s.index === skillOn} locked=${ch.proto}
              onPick=${(i) => setDraft({ ...draft, skillIndex: i })} />`)}
          </div>
          <h4 class="diy-pick__sec">${t('模组')}<small>${t('精锐时生效 · 模组等级 {stage}', { stage: ch.stage })}</small></h4>
          <div role="radiogroup" aria-label=${t('选择模组')} class="diy-pick__choices">
            ${ch.proto
              ? html`<${ModuleRow} id=${modOn} rec=${modOn ? ch.elite.modules?.find((x) => x.uniEquipId === modOn) || null : null} on=${true} locked=${true} onPick=${() => {}} />`
              : [html`<${ModuleRow} key="none" id=${null} rec=${null} on=${modOn == null} locked=${false} onPick=${() => setDraft({ ...draft, uniEquipId: null })} />`,
                ...ch.modules.map((x) => html`<${ModuleRow} key=${x.uniEquipId} id=${x.uniEquipId} rec=${x.rec} on=${modOn === x.uniEquipId} locked=${false}
                  onPick=${(id) => setDraft({ ...draft, uniEquipId: id })} />`)]}
          </div>` : html`<p class="lo-empty t-dim">${t('从左侧选择一名干员')}</p>`}
      </div>
    </div>
    <footer class="diy-pick__foot">
      <${Button} variant="ghost" onClick=${onClose}>${t('取消')}<//>
      <${Button} variant="primary" icon="check" data-testid="diy-confirm" disabled=${!ch} onClick=${() => onDone(ch.proto ? { charId: draft.charId } : draft)}>${t('确认')}<//>
    </footer>
  </section>`;
}

/**
 * The tab's body: the slots by tier (III → V → VI with cyanfish.diy-34 v1.1.0), and the picker of the slot being filled
 * (`picking`, kept here).
 * @param {{ m: any, picks: Record<string, any>, legal: Record<string, any>, voided?: string[], kitted: string[]|null,
 *   onSet: (slotId: string, pick: any) => void, ops?: Record<string, any>,
 *   onOps?: ((charId: string, patch: { potential?: number, cultivate?: number }) => void) | null }} props
 *   `ops` / `onOps`: the stored 潜能 / 练度 and their setter (0.2.2 — an owned pick's card shows its selects);
 *   `voided`: the slots whose pick a higher tier voids (shared/diy.js diyVoidedSlots — v1.2.0: the card's 行标题右侧
 *   说这一次的结果，`DiyTierNote` 在栏标题上说这条规则；选人器里不再重复一遍)
 */
export function DiyPanel(props) {
  const [picking, setPicking] = useState(null);
  return DiyPanelView({ ...props, picking, onPicking: setPicking });
}

/** The tab's view (no hooks: the tests draw it): `picking` = the slot being filled, or null. */
export function DiyPanelView({ m, picks, legal, voided = [], kitted, onSet, picking, onPicking: setPicking, ops = {}, onOps = null }) {
  const slots = diySlotList(diyData());
  const slot = picking ? slots.find((s) => s.slotId === picking) : null;
  const tiers = [...new Set(slots.map((s) => s.tier))];
  const voidedSet = new Set(voidedWithEmpty(diyData(), picks, voided));
  // ★ v1.3.1：某一阶的「常态说明」整块（文案 + 皮肤）由数据说；没装 cyanfish.diy-34 的那个键 ⇒ 全是 null / 空串
  //   ⇒ 下面两个参数一个都不起作用，画出来与加这条缝之前逐节点相同。
  const notes = new Map(tiers.map((tier) => [tier, tierVoidedNote(slots, tier)]));
  return html`<main class="diy" data-testid="diy">
    <div class="own__bar">
      <p class="own__lead">${t('每个自选名额都可以选择持有的 6★ 干员（任选技能与模组）或原型干员（技能锁定）。自选干员只出现在你自己的商店里，调度中心达到该阶等级后才会刷新，价格与同阶干员相同；盟约按干员实际所属阵营分配，没有特质。')}</p>
    </div>
    <div class="diy__body">
      ${tiers.map((tier) => {
        const note = notes.get(tier) || null;
        return html`<section key=${tier} class="own-tier diy-tier" data-tier=${tier} aria-label=${t('{tier}阶', { tier })}>
        <h3 class="own-tier__head"><${TierChip} tier=${tier} size="sm" /><span class="num">${ROMAN[tier]}</span><span>${t('阶')}</span><${DiyTierNote} tiers=${tierTiers(slots, tier)} note=${note} noteStyle=${note ? note.style : ''} marker=${!!note} /></h3>
        <div class="diy-grid">
          ${slots.filter((s) => s.tier === tier).map((s) => html`<${SlotCard} key=${s.slotId} m=${m} slot=${s} pick=${picks[s.slotId] || null}
            illegal=${!!picks[s.slotId] && !legal[s.slotId]} voided=${voidedSet.has(s.slotId)}
            voidedTiers=${diyVoidedByTiers(diyData(), s.slotId)} onOpen=${setPicking} onClear=${(id) => onSet(id, null)} ops=${ops} onOps=${onOps} />`)}
        </div>
      </section>`;
      })}
    </div>
    ${slot ? html`<${DiyPicker} m=${m} slot=${slot} picks=${picks} kitted=${kitted} ops=${ops} onOps=${onOps}
      onClose=${() => setPicking(null)}
      onDone=${(pick) => { onSet(slot.slotId, pick); setPicking(null); }} />` : null}
  </main>`;
}
