// mods/cyanfish.skinvoice/client/panels.js — 设置弹窗里的两段"共用部件"：素材上游 / 配置备份。
//
// ★ 历史：v0.2.0 这里是"皮肤面板 + 语音面板"（各自一页）。v0.3.0 按用户口径改成
//   「顶栏下拉栏做切换、设置弹窗做参数」后，这两个面板不再需要，只留下两段
//   **语音/战斗/其他三个分栏都会用到**的部件。
// ★ 行样式统一走宿主的 .set-row / .set-seg / .set-hint（见 settings.js 顶部说明），
//   这样弹窗里三段和"游戏内设置"是同一套观感。

import { iconVNode } from './icons.js';
import { describe as describeMirror } from './mirrors.js';

/**
 * 信息小圈 ★★ **本文件的这一份是「？小圈」的规范实现（范式）**，规范条文见 `docs/MODS.md` §4.12。
 *
 * 用户口径（2026-10-08）：「所有的小字说明全部删除，过于冗杂影响观感，对于确实需要额外说明的
 * 选项，单独放一个信息小圈」；issue 清单 v1.3「待更新⑥」把它升级成**全平台规范**：
 * **短标签一行 + 长说明一律收进「？」小圈（点击 / 悬浮展开）**，长段落**不许**平铺在设置行里。
 *
 * 三条实现约定（改这一份之前先读 §4.12）：
 *   1. **只挂在「短标签」右侧**：小圈是标签的一部分（`.set-row__label` 的最后一个子元素），
 *      不要单独成列、也不要挂到控件或说明段落上 —— 面板窄时标签列会换行，挂在控件旁会被挤出可视区。
 *   2. **纯 CSS 弹出**（`style.js` 的 `.sp-sv__info::after` + `data-tip`），**不**设原生 `title`：
 *      原生 `title` 是浏览器自己画的、位置固定且**触屏上没有显示时机**；`tabindex="0"` + `:focus`
 *      让"点一下"也出。
 *      ★★ 工序 52 / 本工序（0.17.0）**把原生 `title` 从这一行的规范形状里删掉了**：`title` 与
 *      `data-tip` 同时存在 ⇒ 浏览器悬停弹**原生气泡**（白底黑字、样式不可控）、我们的 `::after`
 *      弹**自有面板**，**两套框重合**（服主口径「悬停时两套文本框重合」）。无障碍与触屏由
 *      `aria-label` + `tabindex="0"` + `:focus::after` 承担。规范条文见 `docs/MODS.md` §4.12.2 二。
 *      ★ 这份 CSS 与 `tools/mod-admin.html` 的 `.help` 是**同一套观感**（同样是 `?` 小圈 + `::after` + `data-tip`），
 *      两份都是参考实现；规范 §4.12 给出宿主 `ui/` 里那套配色 token，新写一份时按它对齐。
 *   3. **宿主 `ui.Tooltip` 已可用（0.2.2，工序 46），但本小圈暂时**不换**它** —— 原因是一条真机实测出来的
 *      层叠限制：`TooltipLayer` 渲染在宿主 `.app-root` 里，而 `.app-root` 有 `isolation: isolate`
 *      （`public/css/theme.css:228`）⇒ 它**画不到**任何挂在 `<body>` 的**独立 Preact 根弹窗**之上
 *      （`cyanfish.mod-settings` 的顶栏齿轮弹窗就是这种；`.modal` 的 `--z-modal:80` 在根层叠上下文里、
 *      而 `.tooltip` 的 `--z-tooltip:95` 被困在 `.app-root` 内部）。像素级证据（同一块截图逐字节比对：
 *      官方设置弹窗里**画得出来**、独立根弹窗里**逐字节相同 = 没画**）见
 *      `内部工序记录` §②。⇒ 在宿主解决"独立根弹窗之上的层"之前，
 *      换过去会让同一栏位在**官方设置弹窗里能弹、在顶栏齿轮弹窗里彻底不弹**（比"可能被裁"更糟）。
 *      ★ 想换的话**必须先**在宿主侧解决层叠（或由用它的 Mod 在自己的弹窗子树里渲染一份 `ui.TooltipLayer`）——
 *      后者我**没有**验证，别照抄。
 * @param {{ html:any, text:string }} props `text` = 长说明原文（一句话以内最好，多句用 `。` 分隔）
 */
export function HintDot({ html, text }) {
  return html`<span class="sp-sv__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/** 旧名（本 Mod 早期调用点）：与 `HintDot` **是同一个组件**（保留导出只为不改老调用点）。 */
export const InfoDot = HintDot;

/**
 * 从 chess 数据建 charId → 名字 的映射。
 *
 * ★ chess 记录按 `chessId` 索引，且 **chessId ≠ charId**（实测：`chess_char_1_01_a` → `char_498_inside`）。
 * ★★ 一个 charId 可以对应**多条**记录，甚至跨 Mod：实测 `char_498_inside` 有 **4** 条 ——
 *    官方 `chess_char_1_01_a/b`（隐现）+ `cyanfish.demo` 的 `cyanfish_demo_a/b`（隐现·改，
 *    共用同一个模板 charId）。所以「谁赢」必须定个规矩，否则标签会随机变成别的 Mod 的名字
 *    （实测踩过：官方的隐现在下拉里被显示成「隐现·改」）。
 *    规矩 = **首条优先**：`data.list('chess')` 的顺序是 base `data/chess.json` 的键序，
 *    官方记录在前面、Mod 追加的在后 ⇒ 取到的是官方名。金色形态（`isGolden`）单独处理：
 *    优先用非金色那条的名字（金色常带「·改」后缀），但两者同 charId 时以先出现的为准。
 */
function buildNames(api) {
  const map = new Map();
  try {
    for (const rec of api.data.list('chess') || []) {
      if (!rec || typeof rec.charId !== 'string') continue;
      const has = map.has(rec.charId);
      if (has) {
        // 已有名字：只有当已有的是"金色"而新来的是"普通"时才替换（普通形态的名字不带「·改」）
        if (!map.get(rec.charId).golden || rec.isGolden) continue;
      }
      map.set(rec.charId, { name: rec.name || rec.charId, golden: !!rec.isGolden });
    }
  } catch { /* 数据没装好就算了，回落到 charId */ }
  const flat = new Map();
  for (const [k, v] of map) flat.set(k, v.name);
  return flat;
}

const nameOf = (names, charId) => (names && names.get && names.get(charId)) || charId;

// ---- 配置导入 / 导出（皮肤 + 语音 + 参数，一整份）--------------------------------------------------

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * 导入 / 导出整份皮肤与语音配置。
 * @param {{ api:any, cfg:any, onChanged:() => void }} props
 */
function ConfigIo({ api, cfg, onChanged }) {
  const { html, Button, hooks: { useRef } } = api.ui;
  const fileRef = useRef(null);
  const nSkin = Object.keys(cfg.get().skins || {}).length;

  const onExport = () => {
    const payload = {
      kind: 'skinvoice',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: cfg.export(),
    };
    downloadText(`skinvoice-${stamp()}.json`, JSON.stringify(payload, null, 2));
    api.ui.toast(`已导出配置（${nSkin} 名干员的皮肤）`, 'success');
  };

  const onFile = async (e) => {
    const file = e?.currentTarget?.files?.[0] || e?.target?.files?.[0] || null;
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const body = raw && raw.config ? raw.config : raw;      // 容忍裸配置
      if (!body || typeof body !== 'object') throw new Error('不是一个配置对象');
      cfg.import(body);
      onChanged?.();
      api.ui.toast(`配置已导入并生效（${Object.keys(cfg.get().skins || {}).length} 名干员的皮肤）`, 'success');
    } catch (err) {
      api.ui.toast(`导入失败：${err?.message || err}`, 'error');
    }
  };

  // ★ 组件必须返回**单个** vnode：多根一律包一层 .sp-sv__blk（它内部自己排 gap，观感同 .set-list）。
  // ★ 导入结果只走 toast，不再在行下面挂一段动态小字（用户口径：小字一律删）。
  return html`<div class="sp-sv__blk">
    <div class="set-row">
      <span class="set-row__label">${iconVNode(html, 'palette')}配置备份<${InfoDot} html=${html}
        text="皮肤、语音与全部参数都存在本机浏览器，不影响队友；导出成 JSON 即可换设备或分享给别人。" /></span>
      <div class="sp-sv__listen">
        <${Button} variant="secondary" size="sm" icon="download" onClick=${onExport}>导出 JSON<//>
        <input ref=${fileRef} class="sp-sv__file" type="file" accept="application/json,.json" onChange=${onFile} />
        <${Button} variant="secondary" size="sm" icon="upload" onClick=${() => fileRef.current?.click()}>导入 JSON<//>
      </div>
    </div>
  </div>`;
}

// ---- 素材上游（立绘与语音共用） --------------------------------------------------------------------

/**
 * 线路选择。改完要**重新把皮肤写进 manifest**（URL 形态变了）并重渲染，否则详情立绘还是旧的。
 * @param {{ api:any, cfg:any, repaint?:Function, onReapply?:Function }} props
 */
function UpstreamSection({ api, cfg, repaint, onReapply }) {
  const { html } = api.ui;
  const c = cfg.get();
  const set = async (mode) => {
    if (c.mirror === mode) return;
    cfg.set({ mirror: mode });
    try { await onReapply?.(); } catch { /* 失败也别挡住切档 */ }
    repaint?.();
    api.ui.toast(`素材上游已切换：${describeMirror(mode)}`, 'success');
  };

  return html`<div class="sp-sv__blk">
    <div class="set-row">
      <span class="set-row__label">${iconVNode(html, 'globe')}素材上游<${InfoDot} html=${html}
        text=${`立绘与语音都由浏览器直连公开转储（服务器不存素材）。当前：${describeMirror(c.mirror)}。`
          + '实测反代中位 0.5s、直连 3.0s 且偶发连接重置 ⇒ 默认走反代，某一环失败自动落到下一环。'
          + '反代只把公开素材原样转发给浏览器，不接触任何玩家数据；不放心可切「仅直连」。'} /></span>
      <div class="set-seg" role="radiogroup">
        ${[['auto', '自动'], ['proxy', '仅反代'], ['raw', '仅直连']].map(([id, l]) => html`<button key=${id} type="button" role="radio"
          aria-checked=${c.mirror === id ? 'true' : 'false'} class=${c.mirror === id ? 'is-on' : ''}
          onClick=${() => { void set(id); }}>${l}</button>`)}
      </div>
    </div>
  </div>`;
}

export { ConfigIo, UpstreamSection, buildNames, nameOf };
