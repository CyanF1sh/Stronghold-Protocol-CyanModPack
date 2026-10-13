// mods/cyanfish.loadout-io/client/index.js — 「干员调配」配置导入/导出（客户端界面扩展 Mod）。
//
// 这是**界面 Mod**（QoL 型），不是加内容的 Mod：没有 data/ 补丁、没有 content/ 战斗行为、没有美术，
// 只是往宿主界面留出的插槽里挂一个按钮。装载方是 public/js/ui/extensions.js 的 loadClientMods()：
// 页面启动 → GET /mods → import('/mods/cyanfish.loadout-io/client/index.js') → setup(hostApi)。
//
// 干了什么：
//   · 在「干员调配」右上角、「已同步」的左边挂一个「导入/导出」按钮；
//   · 导出：把本机**已调整**的干员（技能 + 精锐模组）写成 JSON，附名字表与当时的 Mod 清单；
//   · 导入：读回 JSON，逐条按**本服当前数据**校验 —— 本服没有的干员（多半来自未安装 / 已停用的 Mod）
//     会明确列出来并丢弃；技能或模组与当前版本不符的条目只保留仍然合法的部分。
//
// 判定逻辑全在 ./format.js（纯函数，可离线断言）；这里只管界面与 I/O。
//
// ★ 只依赖 hostApi，不 import 游戏内部模块：Mod 目录可能在游戏仓库之外，相对路径不可靠。

import {
  REASON_TEXT, normalizeInput, planImport, buildExport, exportFilename, mergeEntries, describeDrops,
} from './format.js';

/** 插槽名（api.slots.names 里也有一份，这里写常量是为了让本文件自解释）。 */
const SLOT = 'loadout.topbar';
const MOD_ID = 'cyanfish.loadout-io';
const LABEL = '导入/导出';
const STYLE_ID = `sp-mod-${MOD_ID}-style`;

const CSS = `
.loio{display:flex;flex-direction:column;gap:max(.14rem,9px);min-width:min(5.4rem,84vw);font-size:max(.17rem,12px);line-height:1.65}
.loio__sec{display:flex;flex-direction:column;gap:max(.1rem,6px);padding:max(.14rem,9px);border:1px solid var(--line);background:var(--bg-1)}
.loio__h{display:flex;align-items:center;gap:max(.08rem,6px);margin:0;font-size:max(.18rem,13px);font-weight:700;letter-spacing:.06em;color:var(--text-hi)}
.loio__h .icon{width:max(.2rem,14px);height:max(.2rem,14px);color:var(--mint-500)}
.loio__p{margin:0;color:var(--text-md)}
.loio__hint{margin:0;color:var(--text-lo);font-size:max(.15rem,11px);word-break:break-all}
.loio__hint code{font-family:var(--font-num);color:var(--text-md)}
.loio__err{display:flex;align-items:flex-start;gap:max(.08rem,6px);margin:0;color:var(--red-premium)}
.loio__err .icon{width:max(.18rem,13px);height:max(.18rem,13px);margin-top:.12em}
.loio__file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.loio__note{margin:0;padding-top:max(.1rem,6px);border-top:1px solid var(--line);color:var(--text-lo);font-size:max(.14rem,10px);line-height:1.6}
.loio__plan{display:flex;flex-direction:column;gap:max(.1rem,6px)}
.loio__row{display:flex;flex-wrap:wrap;gap:max(.08rem,6px)}
.loio__badge{padding:.02rem .1rem;border:1px solid var(--line-2);color:var(--text-md);font-size:max(.15rem,11px);white-space:nowrap}
.loio__badge.is-ok{color:var(--mint-400);border-color:var(--mint-800)}
.loio__badge.is-warn{color:var(--amber);border-color:rgba(246,163,41,.45)}
.loio__badge.is-bad{color:var(--red-premium);border-color:rgba(255,84,84,.45)}
.loio__drop{padding:max(.1rem,6px);border:1px solid rgba(255,84,84,.35);background:rgba(255,84,84,.06);color:var(--text-md)}
/* 列表标记跟宿主自己的习惯一致：不用 UA 的 disc（在 --font-cjk 下会渲染成一个小斜点，很难看），
   用宿主列表同款的小方块旋转 45°（见 css/screens/room.css 的 .solo-brief li::before），
   颜色取这个告警框的语义色。 */
.loio__list{max-height:max(1.5rem,104px);margin:max(.06rem,4px) 0 0;padding:0;list-style:none;overflow:auto}
.loio__list li{position:relative;margin:.02rem 0;padding-left:max(.18rem,12px)}
.loio__list li::before{content:'';position:absolute;left:0;top:.58em;width:max(.06rem,4px);height:max(.06rem,4px);background:var(--red-premium);transform:rotate(45deg)}
.loio__list code{font-family:var(--font-num);color:var(--text-lo)}
@media (max-width:900px){.loio-btn .btn__label{display:none}}
`;

/** 注入本 Mod 的样式（自包含：不往仓库的 css/ 里加文件，卸载 Mod 即彻底消失）。 */
function installStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** 浏览器下载一个文本文件。 */
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const chosenText = (api, got) => [
  got.skill != null ? `技能 ${api.loadout.model.skillLabel(got.skill)}` : null,
  got.module ? '模组设置' : null,
].filter(Boolean).join('、') || '（空）';

const reasonText = (d) => (
  d.reason === 'disabled' && d.mod
    ? `所属 Mod「${d.mod.name || d.mod.id}」未启用`
    : REASON_TEXT[d.reason] || d.reason
);

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / loadout / data / getMods / log）
 */
export default function setup(api) {
  installStyle();
  const { html, Button } = api.ui;

  /** 干员调配顶栏按钮：与旁边的「全部恢复默认」同为 secondary/sm，所以尺寸与风格自动一致。 */
  function LoadoutIoButton() {
    return html`<${Button} variant="secondary" size="sm" icon="swap" class="loio-btn"
      title="导入 / 导出干员的技能与模组配置（JSON）"
      onClick=${() => { void openPanel(api); }}>${LABEL}<//>`;
  }

  api.slots.register(api.slots.names.LOADOUT_TOPBAR || SLOT, LoadoutIoButton);
  api.log?.info?.(`[${MOD_ID}] 已挂载「干员调配」导入/导出按钮（插槽 ${SLOT}）`);
}

/** 打开面板。先确保干员数据在手，否则一切校验都会误判成「本服没有」。 */
async function openPanel(api) {
  const { html, alertDialog, toast } = api.ui;
  try {
    const loaded = await api.data.load('chess');
    if (loaded == null) {
      toast('干员数据未能载入，暂时无法导入/导出配置', 'error');
      return;
    }
    await alertDialog({
      title: '干员调配 · 配置导入导出',
      micro: 'LOADOUT CONFIG',
      okText: '关闭',
      text: html`<${IoPanel} api=${api} />`,
    });
  } catch (e) {
    api.log?.warn?.(`[${MOD_ID}] 面板打开失败`, e);
  }
}

/**
 * 面板本体。作为 alertDialog 的 text 渲染 —— 于是它挂在 app 根的 DialogHost 上：
 * 有正确的层级（不会被 .lo 的 z-index 压住）、不会被「按钮里套按钮」、也不吃 loadout 顶栏的按钮尺寸规则。
 * 它是一个真正的组件，所以这里可以用 hooks。
 */
function IoPanel({ api }) {
  const { html, Icon, Button, hooks: { useState, useRef } } = api.ui;
  const getChess = (id) => api.data.lookup('chess', id);

  const [state, setState] = useState({ file: null, plan: null, error: null, done: null });
  const [busy, setBusy] = useState(null); // null | 'export' | 'read'
  const inputRef = useRef(null);

  // 当前可导出的条目（与真正发给服务器的是同一套清洗口径：非法的、已失效的直接不算）
  const exportable = api.loadout.sanitize(api.loadout.getEntries(), getChess);
  const nExport = Object.keys(exportable).length;

  const onExport = async () => {
    if (!nExport || busy) return;
    setBusy('export');
    try {
      const snap = await api.getMods();
      const payload = buildExport({
        entries: exportable,
        getChess,
        mods: snap?.mods ?? [],
        game: snap ? { app: snap.app ?? null, revision: snap.revision ?? null } : null,
      });
      downloadText(exportFilename(), JSON.stringify(payload, null, 2));
      api.ui.toast(`已导出 ${nExport} 名干员的配置`, 'success');
    } catch (e) {
      api.ui.toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (e) => {
    const file = e?.currentTarget?.files?.[0] || e?.target?.files?.[0] || null;
    if (!file) return;
    setBusy('read');
    try {
      const norm = normalizeInput(await file.text());
      if (norm.error) {
        setState({ file: file.name, plan: null, error: norm.error, done: null });
        api.ui.toast(`配置文件认不出：${norm.error}`, 'error');
        return;
      }
      const snap = await api.getMods();
      const plan = planImport({
        entries: norm.entries,
        getChess,
        isSlot: api.loadout.isSlot,
        sanitize: api.loadout.sanitize,
        options: api.loadout.model.chessOptions,
        mods: snap?.mods ?? [],
        names: norm.meta.names,
      });
      setState({ file: file.name, plan, error: null, done: null });
      if (plan.dropped.length) {
        api.ui.toast(`配置文件里有 ${plan.dropped.length} 名本服务器没有的干员，导入时会被丢弃`, 'warn');
      }
    } catch (err) {
      setState({ file: file.name, plan: null, error: `读取失败：${err?.message || err}`, done: null });
      api.ui.toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const onApply = () => {
    const plan = state.plan;
    if (!plan || !plan.applied.length) return;
    api.loadout.setEntries(mergeEntries(api.loadout.getEntries(), plan.entries));
    setState({ file: state.file, plan: null, error: null, done: { n: plan.applied.length, dropped: plan.dropped.length } });
    api.ui.toast(`已导入 ${plan.applied.length} 名干员的配置`, 'success');
    if (plan.dropped.length) {
      api.ui.toast(`已丢弃 ${plan.dropped.length} 名本服没有的干员：${describeDrops(plan.dropped)}`, 'warn');
    }
  };

  return html`<div class="loio">
    <section class="loio__sec">
      <h4 class="loio__h"><${Icon} name="download" />导出</h4>
      <p class="loio__p">把当前已调整的 <b class="num">${nExport}</b> 名干员（技能 + 精锐模组）写成 JSON 文件，发给队友即可复现同一套调配。</p>
      <${Button} variant="secondary" size="sm" icon="download" loading=${busy === 'export'} disabled=${!!busy || !nExport} onClick=${onExport}>导出为 JSON 文件<//>
      ${nExport ? null : html`<p class="loio__hint">当前没有调整过任何干员 —— 全部是默认配置，没有可导出的内容。</p>`}
    </section>

    <section class="loio__sec">
      <h4 class="loio__h"><${Icon} name="upload" />导入</h4>
      <p class="loio__p">选择一份 JSON 配置：导入后与当前配置<b>合并</b>（同名干员以文件为准，其余保留）。</p>
      <input ref=${inputRef} class="loio__file" type="file" accept="application/json,.json" onChange=${onFile} />
      <${Button} variant="secondary" size="sm" icon="upload" disabled=${!!busy} onClick=${() => inputRef.current?.click()}>选择 JSON 文件<//>
      ${state.file ? html`<p class="loio__hint">已读取 <code>${state.file}</code></p>` : null}
      ${state.error ? html`<p class="loio__err"><${Icon} name="warn" />${state.error}</p>` : null}

      ${state.plan ? html`<div class="loio__plan">
        <div class="loio__row">
          <span class="loio__badge is-ok">可导入 <b class="num">${state.plan.applied.length}</b></span>
          ${state.plan.adjusted.length ? html`<span class="loio__badge is-warn">部分保留 <b class="num">${state.plan.adjusted.length}</b></span>` : null}
          ${state.plan.skipped.length ? html`<span class="loio__badge">无需导入 <b class="num">${state.plan.skipped.length}</b></span>` : null}
          ${state.plan.dropped.length ? html`<span class="loio__badge is-bad">丢弃 <b class="num">${state.plan.dropped.length}</b></span>` : null}
        </div>
        ${state.plan.adjusted.length ? html`<ul class="loio__list">
          ${state.plan.adjusted.map((a) => html`<li key=${a.id}>${a.name} —— 本服没有这个模组或技能等级，只导入了 ${chosenText(api, a.got)}</li>`)}
        </ul>` : null}
        ${state.plan.dropped.length ? html`<div class="loio__drop"><b>以下干员本服务器没有，将被丢弃（多半来自未安装或已停用的 Mod）：</b>
          <ul class="loio__list">
            ${state.plan.dropped.map((d) => html`<li key=${d.id}>${d.name} <code>${d.id}</code> —— ${reasonText(d)}</li>`)}
          </ul>
        </div>` : null}
        <${Button} variant="primary" size="sm" icon="check" disabled=${!state.plan.applied.length} onClick=${onApply}>
          导入这 ${state.plan.applied.length} 名干员<//>
      </div>` : null}

      ${!state.plan && state.done ? html`<p class="loio__hint">上一次导入：收下 <b class="num">${state.done.n}</b> 名${state.done.dropped ? `，丢弃 <b class="num">${state.done.dropped}</b> 名` : ''}。可继续选择别的文件。</p>` : null}
    </section>

    <p class="loio__note">配置文件只含「哪名干员带哪个技能 / 模组」，不含账号、战绩或任何服务端数据。导入前会按本服当前数据逐条校验：本服没有的干员会被列出来并丢弃，技能或模组对不上的只保留仍然合法的部分。</p>
  </div>`;
}
