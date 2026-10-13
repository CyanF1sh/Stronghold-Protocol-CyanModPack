// mods/cyanfish.dj-all/client/section.js — 本 Mod 在「模组设置」里注册的那一栏（**控制页**）。
//
// ============================ 版面（服主口径） ============================
//   ┌ 栏位名 + 一行说明 + 运行读数 ─────────────────────────────────┐
//   ├ ★ 配置（选中的元素）─────────────────────────────────────────┤
//   │  三档分段：关 / 全局 / 独立        ← 默认「关」                 │
//   │  五个参数：旋转模式 + 4 个数值      ← 「关」时**留空且不可改**   │
//   │  ⚠ 危险元素警示（若是危险元素）                                │
//   ├ ★ 随机偏移（**可展开**）← 服主第 ④ 条 ─────────────────────────┤
//   │  开关 + 幅度范围（min~max%）—— 对全局与独立**都生效**、周期除外  │
//   ├ ★ 局内（入口与高亮）← 服主第 ②③ 条 ───────────────────────────┤
//   │  显示局内入口 · 入口位置（拖动即配置 / 回到默认）               │
//   │  浮窗不透明度 · 选中元素时在画面上标黄框                        │
//   ├ ★ 元素目录（按层级展开，可折叠）──────────────────────────────┤
//   └ 页脚：版本自证 + 「全部恢复默认」 ─────────────────────────────┘
//
// ★★ 三档语义（服主原话，逐条实现）：
//    「关」  ⇒ 该元素不参与效果；参数区**只读且显示为空**（不是显示全局值，是**空**）。
//    「全局」⇒ 参数区显示**当前全局数值**；在这里改 ⇒ **改的是全局数值**（所有「全局」档一起变）。
//    「独立」⇒ 参数区**默认显示当前全局数值**（读的时候回落，不落盘）；改 ⇒ **只改它自己**。
//   ★ 默认：`nodes` 为空 ⇒ 每个元素都是「关」⇒「默认所有元素的 DJ 效果关闭」。
// ★★ 危险元素（设置入口 / 含设置入口的整体 / 全屏容器）：目录里有 ⚠ 标记；
//    **从「关」切到「全局/独立」时二次确认**（服主原话）。名单与"自动向上传播"在 `client/elements.js`。
// ★★ ③ 位置高亮：选中目录里的元素 ⇒ 调 `highlighter.show()` 在画面上给它套黄框（实现在 `highlight.js`）。
//    由「局内」那一栏的开关控制；不在对局里 / 画布对象 都会给**明确的一句话**，不假装标了。
//
// ★ 三条渲染纪律（`registry.js` 契约 + 本仓踩过的坑）：
//   1. **零参渲染**：`render()` 只给 key、不给 props ⇒ 依赖在 `index.js` 的闭包里绑好再传进来；
//   2. **只复用宿主已有的表单 class**（`.set-list` / `.set-row` / `.set-range` / `.set-seg` / `ui.Button`），
//      面板自己的样式走 `.sp-dja__*`（`style.js`，幂等注入）；
//   3. **长说明一律收进「？」小圈**，行内只有短标签 + 控件 + 读数。

import { modeOf, leavesOf } from './config.js';
import { TEXTS, headModel, annotate, findNode, rndModel, fabModel } from './panels.js';
import { installStyle } from './style.js';

/** 数值列不换行（宿主 `.set-row__val` 自带 width:.5rem，内容一长就折行）。 */
const VAL = 'white-space:nowrap;width:auto;text-align:right';
/** 跨满三列的一行（只给状态读数用）。 */
const RO = { 'data-dja-ro': '' };

/** ？小圈（规范形状；★ 不设原生 title —— 与自有气泡会重合）。 */
function HintDot({ html, text }) {
  return html`<span class="sp-dja__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/** 清洗一个"帧数"输入：合法有限数 ⇒ 四舍五入并夹取；空 / 非数字 ⇒ null（= 不写仓库）。 */
export function cleanFrames(raw, lo, hi) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * ★③ 把一个树节点的**全部后代叶子**变成高亮要的作用项（**不按档位过滤** —— 高亮回答的是"它在哪"，与开不开无关）。
 * @returns {{ items: Array<{id:string,sel:string,global:boolean}>, pixi: number }}
 */
export function highlightItems(node) {
  const out = { items: [], pixi: 0 };
  for (const leaf of leavesOf(node)) {
    const el = leaf.el;
    if (!el) continue;
    if (el.pixi) { out.pixi++; continue; }        // 画布对象没有 DOM 选择器
    if (!el.sel) continue;
    out.items.push({ id: el.id, sel: el.sel, global: el.global === true });
  }
  return out;
}

/**
 * 本 Mod 在「模组设置」里的那一栏。★ **零参渲染** —— 依赖在 `index.js` 的闭包里（registry.js 契约）。
 * @param {{ api:any, store:any, tree:Array<any>, engine:any, version?:string,
 *           highlighter?:any, layout?:'embed'|'float' }} props
 *   `layout='float'` = 渲染在局内的半透明浮窗里（目录矮一点，别把窗口撑满）。
 */
export function DjAllSection({ api, store, tree, engine, version, highlighter = null, layout = 'embed' }) {
  const { html, Button, confirmDialog, hooks: { useState, useEffect } } = api.ui;
  const [cfg, setCfg] = useState(() => store.get());
  const [sel, setSel] = useState(null);
  const [exp, setExp] = useState(() => ({ 'L:top': true, 'L:corner': true, 'L:mod': true }));
  const [, force] = useState(0);

  useEffect(() => { try { installStyle(); } catch { /* ignore */ } }, []);
  useEffect(() => store.subscribe(setCfg), [store]);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 700); return () => clearInterval(id); }, []);

  const head = headModel(cfg, sel, tree);
  const rows = annotate(tree, cfg, sel, null);
  const rnd = rndModel(cfg);
  const fab = fabModel(cfg);
  const hl = highlighter && typeof highlighter.stats === 'function' ? highlighter.stats() : null;

  /** 展开 / 收起一个节点。 */
  const toggle = (id) => setExp((s) => ({ ...s, [id]: !s[id] }));

  // ---- ★③ 选中即高亮（黄框）----------------------------------------------------------------------
  useEffect(() => {
    if (!highlighter) return;
    if (!sel || !fab.hl) { highlighter.clear(); return; }
    const node = findNode(tree, sel);
    if (!node) { highlighter.clear(); return; }
    const packed = highlightItems(node);
    highlighter.show(packed.items, { pixi: packed.pixi });
  }, [sel, fab.hl, highlighter, tree]);
  // 卸载（栏位被摘 / 关窗）⇒ 清掉黄框，零残留
  useEffect(() => () => { try { highlighter?.clear?.(); } catch { /* ignore */ } }, [highlighter]);

  /**
   * 切档。★ 危险元素从「关」切到「全局 / 独立」时**二次确认**（服主口径）。
   * ★ `api.ui.confirmDialog` 是宿主现成的命令式对话框；老宿主没有就退化成浏览器 confirm（绝不抛）。
   */
  const pickMode = async (id, m) => {
    const wasOff = modeOf(cfg, id) === 'off';
    const node = findNode(tree, id);
    if (wasOff && m !== 'off' && node && node.danger === true) {
      let ok = false;
      const title = TEXTS.dangerConfirmTitle.replace('{name}', nodeNameOf(node));
      try {
        if (typeof confirmDialog === 'function') {
          ok = await confirmDialog({ title, text: TEXTS.dangerConfirmText, okText: TEXTS.dangerConfirmOk, cancelText: TEXTS.dangerConfirmCancel, danger: true, micro: '' });
        } else if (typeof globalThis.confirm === 'function') ok = globalThis.confirm(title + '\n\n' + TEXTS.dangerConfirmText);
      } catch { ok = false; }
      if (!ok) return;
    }
    store.setMode(id, m);
  };

  /** 改一个参数：全局档改全局、独立档改自己、关档不可改（控件本身就是 disabled）。 */
  const setParam = (key, v) => {
    if (!sel) return;
    if (head.mode === 'global') store.setGlobal({ [key]: v });
    else if (head.mode === 'own') store.setOwnValues(sel, { [key]: v });
  };

  const st = engine && typeof engine.stats === 'function' ? engine.stats() : null;
  const roText = st
    ? st.items + ' 项生效（DOM ' + st.domItems + ' · 画布 ' + st.groups.length + (st.groups.length ? '：' + st.groups.join('/') : '')
      + '）' + (st.dom.injected ? ' · 已注入样式 ' + Math.round(st.dom.cssLen / 1024) + ' KB' : ' · 未注入样式')
      + (st.dom.reduced ? ' · 系统要求减少动态效果 ⇒ 已自动停' : '')
      + (st.pixi.hook ? ' · 画布帧回调 ' + st.pixi.hook : ' · 未挂画布帧回调')
    : '—';

  /** ③ 高亮那一行的状态读数（**每一句都要是真的**，不许假装标了）。 */
  const hlText = !fab.hl ? TEXTS.hlOff
    : !sel ? '在目录里点一个元素就会标出来。'
      : (hl && hl.boxes > 0 ? ('已在画面上标出 ' + hl.boxes + ' 个位置')
        : (hl && hl.pixiSkipped > 0 ? TEXTS.hlPixi
          : (hl && hl.hits === 0 ? '没找到它在画面上的位置（这个元素此刻不在场）。' : TEXTS.hlNoMatch)));

  // ---- 一行参数（三类控件共用一个渲染函数）--------------------------------------------------------
  const ParamRow = ({ p }) => {
    if (p.kind === 'seg') {
      return html`<div class="set-row" data-dja-key=${p.key}>
        <span class="set-row__label">${p.label}<${HintDot} html=${html} text=${p.hint} /></span>
        <div class="set-seg" role="radiogroup">
          ${(p.options || []).map((o) => html`<button key=${o} type="button" role="radio" disabled=${p.disabled}
            aria-checked=${p.value === o ? 'true' : 'false'} class=${p.value === o ? 'is-on' : ''}
            onClick=${() => setParam(p.key, o)}>${(p.optionLabels || {})[o] || o}</button>`)}
        </div>
      </div>`;
    }
    if (p.kind === 'frames') {
      return html`<label class="set-row" data-dja-key=${p.key}>
        <span class="set-row__label">${p.label}<${HintDot} html=${html} text=${p.hint} /></span>
        <span class="sp-dja__numwrap">
          <input class="sp-dja__num" type="number" inputmode="numeric" min=${p.min} max=${p.max} step=${p.step}
            disabled=${p.disabled} value=${p.disabled ? '' : p.value} aria-label=${p.label + '（整数帧）'}
            onInput=${(e) => { const v = cleanFrames(e.currentTarget.value, p.min, p.max); if (v != null) setParam(p.key, v); }}
            onKeyDown=${(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const base = cleanFrames(e.currentTarget.value, p.min, p.max);
                if (base == null) return;
                setParam(p.key, cleanFrames(String(base + (e.key === 'ArrowUp' ? p.step : -p.step)), p.min, p.max));
              }
            }} />
          <span class="sp-dja__unit">帧</span>
        </span>
        <span class="set-row__val num" style=${VAL} data-dja-val=${p.key}>${p.text}</span>
      </label>`;
    }
    const pct = p.min === p.max ? 0 : Math.round(((p.value - p.min) / (p.max - p.min)) * 100);
    return html`<label class="set-row" data-dja-key=${p.key}>
      <span class="set-row__label">${p.label}<${HintDot} html=${html} text=${p.hint} /></span>
      <input class="set-range sp-dja__range" type="range" min=${p.min} max=${p.max} step=${p.step}
        disabled=${p.disabled} value=${p.disabled ? p.min : p.value} style=${'--pct:' + pct + '%'}
        onInput=${(e) => setParam(p.key, Number(e.currentTarget.value))} />
      <span class="set-row__val num" style=${VAL} data-dja-val=${p.key}>${p.text}</span>
    </label>`;
  };

  // ---- 目录树的一行（递归）------------------------------------------------------------------------
  const TreeRows = ({ list }) => html`${list.map((r) => (r.children
    ? html`<details key=${r.id} class="sp-dja__node" open=${!!exp[r.id]}>
        <summary class=${'dja-sum' + (r.selected ? ' is-sel' : '')}
          onClick=${(e) => { e.preventDefault(); toggle(r.id); if (r.kind !== 'leaf') setSel(r.id); }}>
          <span class="sp-dja__caret">▸</span>
          <span class="sp-dja__leafname">${r.name}</span>
          ${r.danger ? html`<span class="sp-dja__danger" title="危险元素：转起来可能点不到设置">⚠</span>` : null}
          <span class="sp-dja__count">${r.count}</span>
          <span class=${'sp-dja__badge is-' + r.mode}>${r.modeLabel}</span>
        </summary>
        <div class="sp-dja__kids"><${TreeRows} list=${r.children} /></div>
      </details>`
    : html`<div key=${r.id} class=${'sp-dja__leaf' + (r.selected ? ' is-sel' : '') + (r.unavailable ? ' is-un' : '')}
        data-dja-leaf=${r.id} onClick=${() => setSel(r.id)}
        title=${r.unavailable || r.sub}>
        <span class="sp-dja__leafname">${r.name}</span>
        ${r.danger ? html`<span class="sp-dja__danger" title="危险元素：转起来可能点不到设置">⚠</span>` : null}
        <span class="sp-dja__id">${r.sub}</span>
        <span class=${'sp-dja__badge is-' + r.mode}>${r.modeLabel}</span>
      </div>`))}`;

  return html`<div class=${'set-list' + (layout === 'float' ? ' sp-dja__float' : '')} data-dja-section="1">
    <div class="sp-dja__sec" data-dja-group="DJ 整活（逐元素）">
      <span class="sp-dja__h">DJ 整活（逐元素）</span>
      <div class="set-row"><span class="set-row__label">说明</span>
        <span class="sp-dja__mode-note">${TEXTS.intro}</span></div>
      <div class="set-row" ...${RO}><span class="set-row__label">运行读数<${HintDot} html=${html} text=${TEXTS.footer} /></span>
        <span class="sp-dja__ro" data-dja-ro="run">${roText}</span></div>
    </div>

    <div class="sp-dja__sec" data-dja-group="配置（选中的元素）">
      <span class="sp-dja__h">配置（选中的元素）</span>
      ${head.empty
        ? html`<div class="sp-dja__empty"><b>${TEXTS.emptyTitle}</b><br />${TEXTS.emptyHint}</div>`
        : html`<div class="sp-dja__sec">
            <div class="set-row" data-dja-head="1" data-dja-head-id=${head.id} data-dja-head-name=${head.name}>
              <span class="set-row__label">${head.name}<${HintDot} html=${html} text=${head.modeHint} /></span>
              <div class="sp-dja__side-by">
                <span class="sp-dja__id">${head.id}</span>
                <span class="sp-dja__count">${head.pathLabel}</span>
              </div>
            </div>
            <div class="set-row" data-dja-mode="1">
              <span class="set-row__label">档位</span>
              <div class="set-seg" role="radiogroup">
                ${head.modes.map((m) => html`<button key=${m.id} type="button" role="radio" data-dja-mode-opt=${m.id}
                  aria-checked=${m.on ? 'true' : 'false'} class=${m.on ? 'is-on' : ''}
                  onClick=${() => pickMode(head.id, m.id)}>${m.label}</button>`)}
              </div>
            </div>
            ${head.danger ? html`<div class="sp-dja__warn" data-dja-warn="1"><b>⚠ 危险元素</b><span>${head.dangerText}</span></div>` : null}
            ${head.params.map((p) => html`<${ParamRow} key=${p.key} p=${p} />`)}
          </div>`}
    </div>

    <details class="sp-dja__node" data-dja-rnd="1" open=${!!rnd.on}>
      <summary><span class="sp-dja__caret">▸</span>
        <span class="sp-dja__leafname">${TEXTS.rndGroup}<${HintDot} html=${html} text=${TEXTS.rndHint} /></span>
        <span class=${'sp-dja__badge ' + (rnd.on ? 'is-own' : 'is-off')} data-dja-rnd-badge="1">${rnd.text}</span>
      </summary>
      <div class="sp-dja__kids">
        <div class="set-row" data-dja-rnd-on="1">
          <span class="set-row__label">${TEXTS.rndOn}</span>
          <div class="sp-dja__side-by">
            <button type="button" class=${'set-toggle' + (rnd.on ? ' is-on' : '')} role="switch"
              aria-checked=${rnd.on ? 'true' : 'false'} onClick=${() => store.setRnd({ on: !rnd.on })}><i></i><span>${rnd.on ? '开' : '关'}</span></button>
          </div>
        </div>
        <label class="set-row" data-dja-rnd-key="loPct">
          <span class="set-row__label">最小幅度</span>
          <input class="set-range sp-dja__range" type="range" min=${rnd.min} max=${rnd.max} step="1" disabled=${!rnd.on}
            value=${rnd.loPct} style=${'--pct:' + Math.round(((rnd.loPct - rnd.min) / (rnd.max - rnd.min)) * 100) + '%'}
            onInput=${(e) => store.setRnd({ loPct: Number(e.currentTarget.value) })} />
          <span class="set-row__val num" style=${VAL} data-dja-rnd-val="loPct">${rnd.loPct}%</span>
        </label>
        <label class="set-row" data-dja-rnd-key="hiPct">
          <span class="set-row__label">最大幅度</span>
          <input class="set-range sp-dja__range" type="range" min=${rnd.min} max=${rnd.max} step="1" disabled=${!rnd.on}
            value=${rnd.hiPct} style=${'--pct:' + Math.round(((rnd.hiPct - rnd.min) / (rnd.max - rnd.min)) * 100) + '%'}
            onInput=${(e) => store.setRnd({ hiPct: Number(e.currentTarget.value) })} />
          <span class="set-row__val num" style=${VAL} data-dja-rnd-val="hiPct">${rnd.hiPct}%</span>
        </label>
        <div class="set-row" ...${RO}><span class="set-row__label">作用范围</span>
          <span class="sp-dja__ro" data-dja-ro="rnd">${rnd.affects} · ${TEXTS.rndNote}</span></div>
      </div>
    </details>

    <div class="sp-dja__sec" data-dja-group="局内" data-dja-fab="1">
      <span class="sp-dja__h">局内</span>
      <div class="set-row" data-dja-fab-on="1">
        <span class="set-row__label">${TEXTS.fabOn}<${HintDot} html=${html} text=${TEXTS.fabHint} /></span>
        <div class="sp-dja__side-by">
          <button type="button" class=${'set-toggle' + (fab.on ? ' is-on' : '')} role="switch"
            aria-checked=${fab.on ? 'true' : 'false'} onClick=${() => store.setFab({ on: !fab.on })}><i></i><span>${fab.on ? '开' : '关'}</span></button>
        </div>
      </div>
      <div class="set-row"><span class="set-row__label">${TEXTS.fabPos}</span>
        <div class="sp-dja__side-by">
          <span class="sp-dja__id" data-dja-fab-pos="1">${fab.posText}</span>
          <${Button} variant="secondary" size="sm" onClick=${() => store.setFab({ x: 0.952, y: 0.66 })}>${TEXTS.fabReset}<//>
        </div>
      </div>
      <label class="set-row" data-dja-fab-alpha="1">
        <span class="set-row__label">${TEXTS.fabAlpha}</span>
        <input class="set-range sp-dja__range" type="range" min="35" max="100" step="1" value=${fab.alphaPct}
          style=${'--pct:' + Math.round(((fab.alphaPct - 35) / 65) * 100) + '%'}
          onInput=${(e) => store.setFab({ alpha: Number(e.currentTarget.value) / 100 })} />
        <span class="set-row__val num" style=${VAL} data-dja-fab-alpha-val="1">${fab.alphaPct}%</span>
      </label>
      <div class="set-row" data-dja-hl-on="1">
        <span class="set-row__label">${TEXTS.hlOn}<${HintDot} html=${html} text=${TEXTS.hlHint} /></span>
        <div class="sp-dja__side-by">
          <button type="button" class=${'set-toggle' + (fab.hl ? ' is-on' : '')} role="switch"
            aria-checked=${fab.hl ? 'true' : 'false'} onClick=${() => store.setFab({ hl: !fab.hl })}><i></i><span>${fab.hl ? '开' : '关'}</span></button>
        </div>
      </div>
      <div class="set-row" ...${RO}><span class="set-row__label">位置高亮</span>
        <span class="sp-dja__ro" data-dja-ro="hl">${hlText}</span></div>
    </div>

    <div class="sp-dja__sec" data-dja-group="元素目录（按层级展开）">
      <span class="sp-dja__h">元素目录（按层级展开）</span>
      <div class="sp-dja__tree" data-dja-tree="1">
        <${TreeRows} list=${rows} />
      </div>
      <div class="set-row"><span class="set-row__label">批量<${HintDot} html=${html} text=${TEXTS.resetHint} /></span>
        <div class="sp-dja__side-by">
          <${Button} variant="secondary" size="sm" onClick=${() => { try { store.reset(); setSel(null); highlighter?.clear?.(); } catch { /* ignore */ } }}>${TEXTS.resetLabel}<//>
        </div>
      </div>
    </div>

    <p class="sp-dja__ver">cyanfish.dj-all · v${version || '?'} · ${TEXTS.footer}</p>
  </div>`;
}

/** 节点显示名（组节点要用中文分组名，不是键）。 */
function nodeNameOf(n) {
  if (!n) return '';
  if (n.kind === 'leaf') return n.el ? n.el.name : n.name;
  return n.name;
}
