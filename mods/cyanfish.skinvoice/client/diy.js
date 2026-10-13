// mods/cyanfish.skinvoice/client/diy.js — **自选编队页（第三页）按槽位的皮肤选择**。
//
// ★ 为什么要单独一份控件（服主需求原文）：
//   「自选编队的皮肤选择需要在**自选页面进行单独的皮肤选择 UI 适配**。」
//   背景：干员调配那个顶栏下拉（menu.js 的 SkinSelect）跟随的是「**名单里选中的干员**」
//   ——`index.js` 的 `currentOp()`：先读 `loadoutStore.sel`，读不到再读宿主名单卡上的
//   `.lo-grid [data-chess][aria-selected="true"]`。而**自选编队页没有「名单选中」这个概念**：
//   那一页是四个槽位各一名干员（5 阶 ×2、6 阶 ×2），而且这些干员**按设计不在名单里**
//   （`data/backups.json` 的 `diy.ownedPool` = 「名单外的 6★」+ 原型干员）⇒ 顶栏那条**永远指不到他们**，
//   所以必须在这一页按槽位给控件。
//
// ★ 宿主落点（不改基座）：
//   宿主在**每个已填充槽位**的操作区 `.diy-slot__acts` 里渲染插槽
//   `UI_SLOTS.LOADOUT_DIY_SLOT_ACTIONS`（'loadout.diySlotActions'，public/js/ui/extensions.js），
//   传下来的 props 是 `{ slotId, charId, tier, elite }`。宿主负责**在哪**、我们负责**放什么**。
//   ★ 空槽位（`.diy-slot__fill` 那条分支）宿主**根本不渲染** `.diy-slot__acts` ⇒ 我们连挂载都不会发生。
//   ★ 老宿主（没有这个插槽）⇒ `api.slots.register` 会**大声抛错**，`index.js` 里 try/catch 后**不注册**
//     （日志一行 warn），其余功能照常 —— 与 `cyanfish.mod-settings` 内嵌设置弹窗那条同一条纪律。
//
// ★ 与顶栏那一条的关系：**同一份配置、同一个 skins applier**。
//   两边都读 `cfg.get().skins[charId]`、都写 `skins.choose(charId, skinId)`（= 写配置 + 套用材质 + 触发重渲染）
//   ⇒ 「自选页选完，回干员调配页那个下拉也是同一套」不是靠同步代码，而是**同一份真相来源**。
//   ★ 而且自选池干员**不在名单里** ⇒ 顶栏那条只有在 `loadoutStore.sel` 被指向该干员时才画得出来
//     （验收脚本就是这么做的，见报告 §4 的说明）。
//
// ★ 为什么用原生 `<select>`（而不是自绘下拉）：与 `menu.js` 同一个理由 —— 宿主 loadout 页自己的筛选器
//   就是 `.lo-select > select`（loadout.css:111），原生控件在手机网页端走系统选择器、窄屏不溢出、
//   点按区域也够大；Mod 规范 §6.4-3 明确允许借用宿主已有的观感（我们借用的是本 Mod 自己那套
//   `.sp-sv__sel`，它在 style.js 里就是照 `.lo-select` 画的）。hostApi 的 ui 里**没有 Select 组件**，
//   所以这里就是「复用现有皮肤列表数据 + 现有观感」，不新造轮子。
//
// ★ 优雅降级（两条，都已真机验证）：
//   1. 槽位为空 ⇒ 宿主压根不渲染操作区 ⇒ 我们不被挂载（组件里也保留 `!charId` 守卫，双保险）；
//   2. 该干员**在皮肤表里没有可选时装**（`table.operators[charId].skins` 为空 / 无这个干员）
//      ⇒ 画一个**禁用态**的控件（同一个位置、同一个外形，`disabled` + 「该干员无时装」），
//      **不写配置、不发请求、不报错**。为什么不整块不画：四个槽位里缺一半控件会让人以为"这里坏了"，
//      一个灰掉的控件明确说了"是这名干员没有时装"。
//   ★★ 数据现状（实测于 2026-10-08，skinvoice.json 177 名干员 / 172 名有时装）：
//      自选编队那 88 名可上场干员（= `KITTED_CHARS` = `data/backups.json` 的 `units`）里
//      **57 名已在皮肤表里**（有可选时装 ⇒ 控件可用），另外 31 名没有（**主要是原型干员 / 4★ 预备干员**，
//      他们本来就没有官方时装）⇒ 那 31 个槽位稳定落在上面第 2 条禁用态。这正是禁用态存在的理由：
//      「这名干员没有时装」和「这个槽位空着」是两件事，界面上要看得出来。
//      ★ 这个数字**跟着皮肤表走**（补皮肤表的人把自选池纳入得越多，可用的槽位就越多），所以别写死。

import { iconVNode } from './icons.js';

/**
 * 一个槽位的皮肤选择控件（带 hooks 的外壳：订阅配置 + 本地重画）。
 *
 * @param {{ api:any, cfg:any, skins:any, table:any,
 *           slotId?:string, charId?:string, tier?:number, elite?:any }} props
 *   `api/cfg/skins/table` 由 `index.js` 的闭包注入；`slotId/charId/tier/elite` 由宿主插槽传下来。
 *   `charId` = 该槽位当前干员（宿主 `SlotCard` 的 `rec.charId`，也是卡片上的 `data-char`）。
 *   `elite` 这里**不用**（宿主自己的立绘已经画了精锐形态），只是插槽契约的一部分、留着给别的 Mod。
 */
export function DiySlotSkin({ api, cfg, skins, table, ...rest }) {
  const { hooks: { useState, useEffect } } = api.ui;
  const [, force] = useState(0);
  const repaint = () => force((n) => n + 1);
  // 配置从**任何地方**改了（顶栏下拉 / 设置页的随机 / 导入 / 另一页）都要跟着刷新 —— 与 section.js 同一条做法。
  // ★ 放在这里（而不是视图里）：hooks 的调用次数不能随分支变化，而视图有提前 return。
  useEffect(() => { const off = cfg.subscribe(() => repaint()); return () => off?.(); }, []);
  return DiySlotSkinView({ api, cfg, skins, table, repaint, ...rest });
}

/**
 * 视图（**无 hooks**：测试直接画它 —— 与宿主 `DiyPanelView` / `DiyPickerView` 同一个约定）。
 * @param {{ api:any, cfg:any, skins:any, table:any, repaint?:Function,
 *           slotId?:string, charId?:string, tier?:number }} props
 *   （宿主的插槽 props 里还有 `elite`，本控件用不到 —— 不取它，免得留一个"看着像用了"的变量。）
 */
export function DiySlotSkinView({ api, cfg, skins, table, repaint, slotId, charId, tier }) {
  const { html } = api.ui;

  // 空槽位：宿主那时也不会画操作区；留着这行只是双保险（拿不到 charId 就什么都不画）。
  if (!charId) return null;

  const list = table?.operators?.[charId]?.skins;
  const mine = Array.isArray(list) ? list : [];
  const cur = (cfg.get().skins || {})[charId] || '';
  const curName = (mine.find((s) => s.id === cur) || null)?.name || '';
  const label = `当前：${curName || (mine.length ? '官方默认' : '无时装')}`;
  const title = mine.length
    ? `给本槽位的干员换皮肤（${mine.length} 套可选 · 立即生效 · 与顶栏是同一份配置）`
    : '该干员在当前皮肤表里没有可选时装';

  // ---- 降级 2：该干员没有可选时装 ⇒ 禁用态（同一个位置、同一个外形）----------------------------------
  if (!mine.length) {
    return html`<span class="sp-sv__diy is-off" data-slot=${slotId || ''} data-char=${charId}
        data-sp-sv-skins=${mine.length} data-sp-sv-skin="" data-sp-sv-skin-name="无时装" title=${title}>
      <span class="sp-sv__diysel is-off">${iconVNode(html, 'shirt')}
        <select disabled=${true} aria-label="该干员无时装"><option>该干员无时装</option></select></span>
      <span class="sp-sv__diyname">无时装</span>
    </span>`;
  }

  const onChange = (e) => {
    const id = String(e.currentTarget.value || '');
    // `choose` 自己会：写本地配置 → 把材质清单改成这套 → 触发宿主重渲染（skins.js）。
    // 这里只补一次本地重画（`cfg.subscribe` 其实已经会触发，重复一次是幂等的）。
    void Promise.resolve(skins.choose(charId, id || null)).then(repaint).catch(() => { /* choose 内部已 try/catch */ });
  };

  // data-* 是给验收脚本 / 测试用的（和顶栏根上的 data-sp-sv-* 同一套口径）：
  // `data-slot` / `data-char` 证明「这个控件属于哪个槽位、指向哪名干员」，
  // `data-sp-sv-skins` = 该干员可选时装数，`data-sp-sv-skin` / `-name` = 当前选中的那一套。
  return html`<span class=${`sp-sv__diy${cur ? ' is-on' : ''}`} data-slot=${slotId || ''} data-char=${charId}
      data-tier=${tier == null ? '' : String(tier)} data-sp-sv-skins=${mine.length}
      data-sp-sv-skin=${cur} data-sp-sv-skin-name=${curName || '官方默认'} title=${title}>
    <label class="sp-sv__diysel">
      ${iconVNode(html, 'shirt')}
      <select value=${cur} onChange=${onChange} aria-label=${`本槽位干员皮肤（${mine.length} 套可选）`}>
        <option value="">官方默认</option>
        ${mine.map((s) => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
      </select>
    </label>
    <span class="sp-sv__diyname">${label}</span>
  </span>`;
}
