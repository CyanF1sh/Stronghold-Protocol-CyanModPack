// mods/cyanfish.dj-all/client/section.js — 控制页（**两种摆放，一套代码**）。
//
// ============================ ★★ 两种摆放（服主第 ④ 条） ============================
// 服主口径：「关于本 mod 的设置，窗口设置和说明放在固定的 mod 设置页面，元素设置放在可拖动入口设置界面，
//   二者功能不重叠。且具有独立的恢复默认配置功能。」
//
//   `scope='full'`  —— **固定设置页**（设置 → 模组设置 → DJ 整活）：
//        说明 · 运行读数 · ★整个 Mod 的总开关 · 「局内」那一栏（入口显示 / 位置 / 浮窗不透明度 / 位置高亮开关）
//        · 「对局内浮窗」的指路 · 「全部恢复默认」（连局内设置一起回出厂）
//   `scope='elements'` —— **局内浮窗**（点战斗里那颗图标键打开）：
//        选中元素的「关 / 全局 / 独立」三档 + 五个参数 + ⚠ 危险警示 · 随机偏移 · 元素目录
//        · 「元素恢复默认」（只清元素相关，不动局内入口）
//   ★ 两边**不重复**：元素配置只在浮窗里，窗口/总闸/说明只在固定页里。
//
// ★★ 其余几版的口径仍然成立：
//    「关」⇒ 参数区只读且**留空**；「全局」⇒ 显示当前全局值、改它=改全局；「独立」⇒ 默认显示当前全局值、改只改自己。
//    默认每个元素都是「关」（`nodes` 为空）。
//    危险元素（设置入口 / 含设置入口的整体）在目录里带 ⚠，**从「关」切到「全局/独立」时二次确认**。
//
// ★ 第 ③⑤⑦ 条对应的实现：
//    ③ 「？」气泡不再用 ::after（会被祖先 overflow 裁掉）⇒ 交给 `client/tips.js` 画在 body 级 fixed 层。
//    ⑤ 目录的 `<details>` 改成**不受控**（不传 open、不 preventDefault）⇒ 展开/收起不再触发重绘、也不会跳回顶部；
//       另外额外做了一层"保 scrollTop"，防 700ms 心跳重绘把滚动位置顶掉。
//    ⑦ 弹二次确认**不再用宿主的 confirmDialog**（它与游戏内设置弹窗同层 `--z-modal:80`，必被局内浮窗压住）
//       ⇒ 改成本 Mod 自己的确认层（`client/confirm.js`：挂 body、`z-index:10050`；它还会顺手把浮窗让开）。

import { modeOf, leavesOf } from './config.js';
import { TEXTS, headModel, annotate, findNode, rndModel, fabModel, onModel } from './panels.js';
import { installStyle } from './style.js';
import { installTips } from './tips.js';
import { askConfirm } from './confirm.js';

/** 数值列不换行（宿主 .set-row__val 自带 width:.5rem）。 */
const VAL = 'white-space:nowrap;width:auto;text-align:right';
/** 跨满三列的一行（只给状态读数用）。 */
const RO = { 'data-dja-ro': '' };

/** ？小圈（③ 气泡由 tips.js 接管：`data-tip` 是唯一接口，不设原生 title 免得两套气泡打架）。 */
function HintDot({ ctx, text }) {
  return ctx.html`<span class="sp-dja__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/**
 * ★★ 这三个子组件**必须定义在模块级**（而不是 DjAllSection 内部）——
 *   在组件体内写 `const ParamRow = () => html\`…\`` 会让它**每次渲染都是一个新函数**，
 *   Preact 见到"组件类型变了"就**把整棵子树拆了重建**。真机上的三个症状全是它引起的：
 *     · ④ 滑块拖不动（拖到一半 input 被重建 ⇒ 拖动中断，只能点整条）；
 *     · ② 目录展开子级后自动关闭（`<details>` 被重建 ⇒ 展开态丢失，点不到子级）；
 *     · ③ 选中元素后视口跳到它那里（重建 + 滚动锚定）。
 *   ⇒ 挪到模块级（类型恒定、DOM 复用），依赖用 `ctx` 传进来。
 * ★ 另外 `<details>` 的展开态改**受控**（`exp` 状态）—— 组件稳定之后，受控不会再引起重建，
 *   而"点一下 summary"只改状态、DOM 原地复用 ⇒ 展开态不会丢、滑块也不会被换掉。
 */
function ParamRow({ ctx, p }) {
  const { html, setParam } = ctx;
  if (p.kind === 'seg') {
    return html`<div class="set-row" data-dja-key=${p.key}>
      <span class="set-row__label">${p.label}<${HintDot} ctx=${ctx} text=${p.hint} /></span>
      <div class="set-seg" role="radiogroup">
        ${(p.options || []).map((o) => html`<button key=${o} type="button" role="radio" disabled=${p.disabled}
          aria-checked=${p.value === o ? 'true' : 'false'} class=${p.value === o ? 'is-on' : ''}
          onClick=${() => setParam(p.key, o)}>${(p.optionLabels || {})[o] || o}</button>`)}
      </div>
    </div>`;
  }
  if (p.kind === 'frames') {
    return html`<label class="set-row" data-dja-key=${p.key}>
      <span class="set-row__label">${p.label}<${HintDot} ctx=${ctx} text=${p.hint} /></span>
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
    <span class="set-row__label">${p.label}<${HintDot} ctx=${ctx} text=${p.hint} /></span>
    <input class="set-range sp-dja__range" type="range" min=${p.min} max=${p.max} step=${p.step}
      disabled=${p.disabled} value=${p.disabled ? p.min : p.value} style=${'--pct:' + pct + '%'}
      onInput=${(e) => setParam(p.key, Number(e.currentTarget.value))} />
    <span class="set-row__val num" style=${VAL} data-dja-val=${p.key}>${p.text}</span>
  </label>`;
}

/** 一行开关（`set-toggle`）。★ 模块级（理由见 ParamRow 上面那段）。 */
function Toggle({ ctx, attr, label, hint, on: isOn, onToggle }) {
  const { html } = ctx;
  return html`<div class="set-row" ...${{ ['data-dja-' + attr]: '1' }}>
    <span class="set-row__label">${label}${hint ? html`<${HintDot} ctx=${ctx} text=${hint} />` : null}</span>
    <div class="sp-dja__side-by">
      <button type="button" class=${'set-toggle' + (isOn ? ' is-on' : '')} role="switch"
        aria-checked=${isOn ? 'true' : 'false'} onClick=${onToggle}><i></i><span>${isOn ? '开' : '关'}</span></button>
    </div>
  </div>`;
}

/**
 * 目录树的递归渲染。★ 模块级 + **受控展开**（`ctx.exp`）：组件类型恒定 ⇒ DOM 原地复用 ⇒
 * 展开态与滚动位置都不会因为重渲染而丢；点 summary 只切状态、不重建 DOM。
 */
function TreeRows({ ctx, list }) {
  const { html, exp, toggleExp, setSel, markScroll } = ctx;
  return html`${list.map((r) => (r.children
    ? html`<details key=${r.id} class="sp-dja__node" open=${!!exp[r.id]}>
        <summary class=${r.selected ? 'is-sel' : ''}
          onClick=${(e) => { e.preventDefault(); markScroll(); toggleExp(r.id); if (r.kind !== 'leaf') setSel(r.id); }}>
          <span class="sp-dja__caret">▸</span>
          <span class="sp-dja__leafname">${r.name}</span>
          ${r.danger ? html`<span class="sp-dja__danger" title="危险元素：转起来可能点不到设置">⚠</span>` : null}
          <span class="sp-dja__count">${r.count}</span>
          <span class=${'sp-dja__badge is-' + r.mode}>${r.modeLabel}</span>
        </summary>
        <div class="sp-dja__kids"><${TreeRows} ctx=${ctx} list=${r.children} /></div>
      </details>`
    : html`<div key=${r.id} class=${'sp-dja__leaf' + (r.selected ? ' is-sel' : '') + (r.unavailable ? ' is-un' : '')}
        data-dja-leaf=${r.id} onClick=${() => { markScroll(); setSel(r.id); }}
        title=${r.unavailable || r.sub}>
        <span class="sp-dja__leafname">${r.name}</span>
        ${r.danger ? html`<span class="sp-dja__danger" title="危险元素：转起来可能点不到设置">⚠</span>` : null}
        <span class="sp-dja__id">${r.sub}</span>
        <span class=${'sp-dja__badge is-' + r.mode}>${r.modeLabel}</span>
      </div>`))}`;
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
 * ★③ 把一个树节点的全部后代叶子变成高亮作用项（**不按档位过滤** —— 高亮回答"它在哪"，与开不开无关）。
 * @returns {{ items: Array<{id:string,sel:string,global:boolean}>, pixi: number }}
 */
export function highlightItems(node) {
  const out = { items: [], pixi: 0 };
  for (const leaf of leavesOf(node)) {
    const el = leaf.el;
    if (!el) continue;
    if (el.pixi) { out.pixi++; continue; }
    if (!el.sel) continue;
    out.items.push({ id: el.id, sel: el.sel, global: el.global === true });
  }
  return out;
}

/**
 * 控制页。★ **零参渲染**（registry.js 契约：依赖在 index.js 的闭包里）。
 * @param {{ api:any, store:any, tree:Array<any>, engine:any, version?:string, highlighter?:any,
 *           layout?:'embed'|'float', scope?:'full'|'elements',
 *           }} props  ★ 不再有 onModalOpen/onModalClose —— 让开浮窗由 confirm.js 自己做（见那边注释）
 */
export function DjAllSection({ api, store, tree, engine, version, highlighter = null, layout = 'embed',
  scope = 'full' }) {
  const { html, Button, confirmDialog, hooks: { useState, useEffect, useRef } } = api.ui;
  const [cfg, setCfg] = useState(() => store.get());
  const [sel, setSel] = useState(null);
  // ★ 目录的展开态（受控）：键 = 树节点 id。默认把最常用的三层展开着。
  const [exp, setExp] = useState(() => ({ 'L:top': true, 'L:corner': true, 'L:mod': true }));
  const [, force] = useState(0);
  const treeRef = useRef(null);
  // ★③ 待恢复的滚动位置：`null` = 没有待办；数字 = 下一次渲染要还回去的目标。
  //   必须是**一次性**的 —— 0.5.0 写成"每次渲染都对一遍"，于是玩家手动滚动之后，
  //   700ms 心跳重绘会把 old scrollTop 又写回去 ⇒ 服主看到的「后续就会回到哪个位置」。
  const keepScroll = useRef(null);

  const isFloat = scope === 'elements';

  useEffect(() => { try { installStyle(); installTips(); } catch { /* ignore */ } }, []);
  useEffect(() => store.subscribe(setCfg), [store]);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 700); return () => clearInterval(id); }, []);
  // ★③ 保滚动位置：**只还一次**（点元素 / 折展开时记下的那个值），还完就清空。
  //   配合 style.js 里 `.sp-dja__tree { overflow-anchor: none }`，
  //   玩家自己滚到哪里就停在哪里；心跳重绘不会再把它拽回"选中元素所在的位置"。
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    const want = keepScroll.current;
    if (want == null) return;
    keepScroll.current = null;                       // ★ 一次性：先清，避免嵌套渲染重复触发
    if (Math.abs(el.scrollTop - want) > 2) el.scrollTop = want;
  });
  // ★ 只对"这一轮交互引发的渲染"有效：设完就挂一个 0ms 的清理。
  //   万一那次点击没有真的改状态（点了已经选中的元素 ⇒ Preact 不重渲染），
  //   这个残留值也不会留到 700ms 心跳那一次去（否则又会"回到选中元素的位置"）。
  const markScroll = () => {
    const el = treeRef.current;
    if (!el) return;
    keepScroll.current = el.scrollTop;
    try { setTimeout(() => { keepScroll.current = null; }, 0); } catch { /* ignore */ }
  };
  const toggleExp = (id) => setExp((s0) => ({ ...s0, [id]: !s0[id] }));

  const head = headModel(cfg, sel, tree);
  const rows = annotate(tree, cfg, sel, null);
  const rnd = rndModel(cfg);
  const fab = fabModel(cfg);
  const on = onModel(cfg);
  const hl = highlighter && typeof highlighter.stats === 'function' ? highlighter.stats() : null;

  // ---- ★③ 选中即高亮（黄框）----------------------------------------------------------------------
  useEffect(() => {
    if (!highlighter) return;
    if (!sel || !fab.hl) { highlighter.clear(); return; }
    const node = findNode(tree, sel);
    if (!node) { highlighter.clear(); return; }
    const packed = highlightItems(node);
    highlighter.show(packed.items, { pixi: packed.pixi });
  }, [sel, fab.hl, highlighter, tree]);
  useEffect(() => () => { try { highlighter?.clear?.(); } catch { /* ignore */ } }, [highlighter]);

  /**
   * 切档。★ 危险元素从「关」切到「全局 / 独立」时先二次确认。
   *
   * ★★ ①（服主 2026-10-14 实测后的处方）**不再用宿主的 `confirmDialog`** ——
   *   它画在 `.app-root` 的 DialogHost 里、用 `--z-modal: 80`，与游戏内设置弹窗同层，
   *   而本 Mod 的局内浮窗挂在 body 上 z-index 950 ⇒ 确认框必然被压住（点不到）。
   *   现在改成本 Mod 自己的确认层（`client/confirm.js`：挂 body、z-index 10050）。
   *   宿主的 `confirmDialog` 只作为**极端降级**（拿不到 document 时）留在 catch 里。
   */
  const pickMode = async (id, m) => {
    const wasOff = modeOf(cfg, id) === 'off';
    const node = findNode(tree, id);
    if (wasOff && m !== 'off' && node && node.danger === true) {
      let ok = false;
      const title = TEXTS.dangerConfirmTitle.replace('{name}', nodeNameOf(node));
      const ask = { title, text: TEXTS.dangerConfirmText, okText: TEXTS.dangerConfirmOk,
        cancelText: TEXTS.dangerConfirmCancel, danger: true };
      // ★ "让局内浮窗让开"由确认层自己做（client/confirm.js 的 setWinAside）——
      //   不经面板回调，也不经 Preact 重绘。三次失败的两条路见那边与 fab.js 的注释。
      try {
        ok = await askConfirm(ask);
      } catch {
        try { ok = typeof confirmDialog === 'function' ? await confirmDialog(ask) : false; } catch { ok = false; }
      }
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
  // ★⑤b 换面的现场读数（服主实测时不用开控制台就能看到"到底换没换"）
  const fb = st && st.pixi && st.pixi.frontback ? st.pixi.frontback : null;
  const fbText = !fb ? ''
    : ' · 换面 ' + (fb.swapsTotal || 0) + ' 次' + (fb.managed ? '（' + fb.managed + ' 个正挂着背面）' : '')
      + (fb.noBack ? ' · ' + fb.noBack + ' 个没有背面模型' : '')
      + (fb.held ? ' · ' + fb.held + ' 个倒地中（不碰）' : '')
      + (fb.stun ? ' · ' + fb.stun + ' 个强控中（不碰）' : '');
  const roText = st
    ? st.items + ' 项生效（DOM ' + st.domItems + ' · 画布 ' + st.groups.length + (st.groups.length ? '：' + st.groups.join('/') : '')
      + '）' + (st.dom.injected ? ' · 已注入样式 ' + Math.round(st.dom.cssLen / 1024) + ' KB' : ' · 未注入样式')
      + (st.dom.reduced ? ' · 系统要求减少动态效果 ⇒ 已自动停' : '')
      + (st.pixi.hook ? ' · 画布帧回调 ' + st.pixi.hook : ' · 未挂画布帧回调')
      + fbText
    : '—';

  /** ③ 高亮那一行的状态读数（每一句都要是真的）。 */
  const hlText = !fab.hl ? TEXTS.hlOff
    : !sel ? '在目录里点一个元素就会标出来。'
      : (hl && hl.boxes > 0 ? ('已在画面上标出 ' + hl.boxes + ' 个位置')
        : (hl && hl.pixiSkipped > 0 ? TEXTS.hlPixi
          : (hl && hl.hits === 0 ? '没找到它在画面上的位置（这个元素此刻不在场）。' : TEXTS.hlNoMatch)));

  // ★ 模块级子组件的依赖都从这里传进去（组件类型恒定 ⇒ DOM 复用 ⇒ 滑块不中断 / 展开态不丢 / 不跳滚动）
  const ctx = { html, TEXTS, exp, toggleExp, setSel, markScroll, setParam, pickMode, cleanFrames };

  return html`<div class=${'set-list' + (layout === 'float' ? ' sp-dja__float' : '')} data-dja-section=${scope}>
    ${isFloat ? null : html`
    <div class="sp-dja__sec" data-dja-group="说明">
      <span class="sp-dja__h">说明</span>
      <div class="set-row"><span class="set-row__label">这个 Mod 做什么</span>
        <span class="sp-dja__mode-note">${TEXTS.intro}</span></div>
      ${on.on ? null : html`<div class="sp-dja__warn" data-dja-on-warn="1"><b>总开关是关的</b><span>${TEXTS.onOffNote}</span></div>`}
      <div class="set-row" ...${RO}><span class="set-row__label">运行读数<${HintDot} ctx=${ctx} text=${TEXTS.footer} /></span>
        <span class="sp-dja__ro" data-dja-ro="run">${roText}</span></div>
    </div>

    <div class="sp-dja__sec" data-dja-group="总开关">
      <span class="sp-dja__h">总开关</span>
      <${Toggle} ctx=${ctx} attr="on" label=${TEXTS.onLabel} hint=${TEXTS.onHint} on=${on.on}
        onToggle=${() => store.setOn(!on.on)} />
      <div class="set-row" ...${RO}><span class="set-row__label">当前</span>
        <span class="sp-dja__ro" data-dja-ro="on">${on.text}</span></div>
    </div>

    <div class="sp-dja__sec" data-dja-group="局内">
      <span class="sp-dja__h">局内</span>
      <${Toggle} ctx=${ctx} attr="fab-on" label=${TEXTS.fabOn} hint=${TEXTS.fabHint} on=${fab.on}
        onToggle=${() => store.setFab({ on: !fab.on })} />
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
      <${Toggle} ctx=${ctx} attr="hl-on" label=${TEXTS.hlOn} hint=${TEXTS.hlHint} on=${fab.hl}
        onToggle=${() => store.setFab({ hl: !fab.hl })} />
      <div class="set-row" ...${RO}><span class="set-row__label">位置高亮</span>
        <span class="sp-dja__ro" data-dja-ro="hl">${hlText}</span></div>
      <div class="set-row" ...${RO}><span class="set-row__label">元素配置在哪</span>
        <span class="sp-dja__ro" data-dja-ro="where">${TEXTS.scopeFloatNote}</span></div>
    </div>

    <div class="sp-dja__sec" data-dja-group="恢复出厂">
      <span class="sp-dja__h">恢复出厂</span>
      <div class="set-row"><span class="set-row__label">全部<${HintDot} ctx=${ctx} text=${TEXTS.resetHint} /></span>
        <div class="sp-dja__side-by">
          <${Button} variant="secondary" size="sm" onClick=${() => { try { store.reset(); setSel(null); highlighter?.clear?.(); } catch { /* ignore */ } }}>${TEXTS.resetLabel}<//>
        </div>
      </div>
    </div>`}

    ${isFloat ? html`
    <div class="sp-dja__sec" data-dja-group="配置（选中的元素）">
      <span class="sp-dja__h">配置（选中的元素）</span>
      ${head.empty
        ? html`<div class="sp-dja__empty"><b>${TEXTS.emptyTitle}</b><br />${TEXTS.emptyHint}</div>`
        : html`<div class="sp-dja__sec">
            <div class="set-row" data-dja-head="1" data-dja-head-id=${head.id} data-dja-head-name=${head.name}>
              <span class="set-row__label">${head.name}<${HintDot} ctx=${ctx} text=${head.modeHint} /></span>
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
            ${head.params.map((p) => html`<${ParamRow} ctx=${ctx} key=${p.key} p=${p} />`)}
          </div>`}
    </div>

    <details class="sp-dja__node" data-dja-rnd="1">
      <summary><span class="sp-dja__caret">▸</span>
        <span class="sp-dja__leafname">${TEXTS.rndGroup}<${HintDot} ctx=${ctx} text=${TEXTS.rndHint} /></span>
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

    <div class="sp-dja__sec" data-dja-group="元素目录">
      <span class="sp-dja__h">元素目录（按层级展开）</span>
      ${on.on ? null : html`<div class="sp-dja__warn" data-dja-on-warn="1"><b>总开关是关的</b><span>${TEXTS.onOffNote}</span></div>`}
      <div class="sp-dja__tree" data-dja-tree="1" ref=${treeRef}>
        <${TreeRows} ctx=${ctx} list=${rows} />
      </div>
      <div class="set-row"><span class="set-row__label">${TEXTS.resetElementsLabel}<${HintDot} ctx=${ctx} text=${TEXTS.resetElementsHint} /></span>
        <div class="sp-dja__side-by">
          <${Button} variant="secondary" size="sm"
            onClick=${() => { try { store.resetElements(); setSel(null); highlighter?.clear?.(); markScroll(); } catch { /* ignore */ } }}>${TEXTS.resetElementsLabel}<//>
        </div>
      </div>
    </div>` : null}

    <p class="sp-dja__ver">cyanfish.dj-all · v${version || '?'} · ${TEXTS.footer}</p>
  </div>`;
}

/** 节点显示名（组节点用中文分组名）。 */
function nodeNameOf(n) {
  if (!n) return '';
  if (n.kind === 'leaf') return n.el ? n.el.name : n.name;
  return n.name;
}
