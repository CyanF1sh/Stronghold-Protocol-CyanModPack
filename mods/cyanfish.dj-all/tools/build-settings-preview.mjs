// mods/cyanfish.dj-all/tools/build-settings-preview.mjs — 生成**设置页注册区的独立预览**
//（`settings-preview.html`，作者工具 / 服主审查用；不进 `.spmod` 分发白名单）。
//
// 用法（主力树根目录）：node mods/cyanfish.dj-all/tools/build-settings-preview.mjs
//
// ============================ 为什么这么生成 ============================
// ★ 目标：**双击就能看**（`file://` 下 `<script type="module">` 会被 CORS 挡掉，所以不能用 ESM）；
//   同时又要与真机**同一份数据/同一份口径**（否则审查没有意义）。做法：
//     ① 把 `client/elements.js` / `config.js` / `panels.js` 三个**纯函数模块**打包成一个**经典脚本**
//        （去掉 `import` / `export` 关键字后顺序拼接；这三个文件之间的依赖是单向的，且没有默认导出）；
//     ② 把游戏 CSS（7 份）+ 本 Mod 的面板 CSS（`client/style.js` 里的原文）+ 预览页自己的 CSS **内联**；
//     ③ 预览页的**渲染器**（纯 DOM）读的是 `panels.js` 算出来的**同一份描述**，产出的**类名与结构与
//        `client/section.js`（真机的 htm+Preact 渲染器）逐条对齐**。
//   ⇒ 「哪些行、什么控件、什么值、可不可改、什么文案、⚠ 在哪」全部同源；差别只有渲染器不同（DOM vs Preact）。
//
// ★ 兜底断言：打包时若还残留行首的 `import `/`export `，直接**报错退出**（不生成一个坏页面）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES } from './stages.js';        // ★ 与 catalog.html 共用同一套预览舞台（战斗屏骨架）

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD_DIR = path.resolve(HERE, '..');                 // mods/cyanfish.dj-all
const ROOT = path.resolve(MOD_DIR, '..', '..');           // 主力树根

/** 读一个源文件。 */
const read = (rel) => fs.readFileSync(path.join(MOD_DIR, rel), 'utf8');

/** 抽 `client/style.js` 里的 `const CSS = <模板字面量>` 正文。 */
function extractCss(src) {
  const i = src.indexOf('const CSS');
  if (i < 0) return '';
  const b = src.indexOf('`', i);
  const e = src.indexOf('`', b + 1);
  return b >= 0 && e > b ? src.slice(b + 1, e) : '';
}

/**
 * 把一个 ESM 模块变成"经典脚本"片段：去掉 `import` 行与 `export ` 关键字。
 * ★ 只对**确定无默认导出、无多行 import** 的这三个文件用（生成时断言）。
 */
function toClassic(name, src) {
  const lines = src.split('\n');
  const out = [];
  // ★ 必须能吃掉**多行** import：`import { a, b,\n  c } from './x.js';`
  //   —— 只跳过第一行的话，第二行会变成裸的 `... } from './x.js';` ⇒ 生成页语法错（本工序踩过）。
  let skipping = false;
  for (const line of lines) {
    const t = line.trimStart();
    if (skipping) { if (/;\s*$/.test(t)) skipping = false; continue; }
    if (/^import\b/.test(t) || /^export\s*\{/.test(t)) { if (!/;\s*$/.test(t)) skipping = true; continue; }
    out.push(line.replace(/^export\s+(default\s+)?/, ''));
  }
  const joined = out.join('\n');
  if (/^\s*(import|export)\s/m.test(joined)) {
    throw new Error('打包 ' + name + ' 时仍残留 import/export，拒绝生成坏页面');
  }
  // ★ 语法兜底：直接让 JS 引擎解析一遍（出错就当场抛，不生成一个"打开是白屏"的页面）
  try { new Function(joined); } catch (e) {
    throw new Error('打包 ' + name + ' 后语法不通过：' + e.message);
  }
  return joined;
}

const bundle = [
  '/* ===== client/elements.js（去 import/export） ===== */',
  toClassic('elements.js', read('client/elements.js')),
  '/* ===== client/config.js ===== */',
  toClassic('config.js', read('client/config.js')),
  '/* ===== client/panels.js ===== */',
  toClassic('panels.js', read('client/panels.js')),
  '',
  '/* 把上面三个模块的顶层名字收成一个命名空间（预览页只读这一份）。 */',
  'window.DJA = { ELEMENTS, LAYERS, TREE, TREE_BY_ID, SUBGROUP_NAMES, subgroupName, normalizeEntry,',
  '  groupByLayer, treeSel, treeMembers, treeGroups, buildTree,',
  '  PREF_KEY, PREF_V, MODES, MODE_LABEL, MODE_HINT, PARAMS, DEFAULT_GLOBAL, FPS, framesToSec,',
  '  RND_KEYS, RND_MAX_PCT, DEFAULT_RND, DEFAULT_FAB, cleanRnd, cleanFab, hash01, applyRandom, leavesOf,',
  '  cleanValues, modeOf, valuesOf, sanitize, compile,',
  '  TEXTS, annotate, headModel, findNode, nodeName, pathOf, paramText, framesText, modeHint, rndModel, fabModel };'
].join('\n');

/** 游戏 CSS（与 catalog.html 同一套 7 份，原文照抄）。 */
const GAME_CSS = [
  'public/css/theme.css', 'public/css/components.css', 'public/css/screens/game.css',
  'public/css/screens/game-shop.css', 'public/css/screens/game-panels.css', 'public/css/emotes.css', 'public/css/devices.css',
];
const gameCss = GAME_CSS.map((f) => '/* ===== ' + f + '（上游原文，逐字节照抄） ===== */\n' + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

// 战斗画面（与 catalog.html 的 shell 舞台同源）：③ 的位置高亮要有真实元素才能落框
function battleStageHtml() {
  const st = STAGES.shell;
  return '<div class="screen gm gm--combat" data-camera="field">'
    + '<div class="gm__field"></div><div class="gm__vignette" aria-hidden="true"></div>'
    + '<div class="gm__hud">' + st.html + '</div></div>';
}
const BATTLE_HTML = battleStageHtml();

const panelCss = extractCss(read('client/style.js'));
if (!panelCss) throw new Error('没能从 client/style.js 里抽出面板 CSS');

/** 预览页自己的样式（px；根字号要让给游戏 CSS 的 rem 换算）。 */
const PAGE_CSS = [
  // ★ 与 catalog.html 同一个坑：内联了游戏 CSS ⇒ 它的 `body{overflow:hidden}`（固定画布）会让页面滚不动。
  //   本页的 `<style>` 放在所有内联 CSS **之后**，并显式恢复滚动。
  'html{overflow-y:auto !important;height:auto !important;touch-action:auto !important}',
  'body{overflow-y:auto !important;height:auto !important;position:static !important;display:block !important}',
  'html{font-size:100px !important}',
  'body{margin:0;background:#0a0d0c;color:#cfe0da;font:14px/1.65 system-ui,"Noto Sans SC",sans-serif}',
  '.pv-head{position:sticky;top:0;z-index:30;background:rgba(8,11,10,.95);border-bottom:1px solid #24302c;padding:12px 20px}',
  '.pv-head h1{margin:0 0 4px;font-size:16px;color:#eaf6f1}',
  '.pv-head p{margin:0;color:#7d8f8a;font-size:12px;line-height:1.7}',
  '.pv-head code{background:#111816;border:1px solid #223029;border-radius:3px;padding:0 4px;color:#7fd0ad}',
  '.pv-note{margin-top:8px;padding:7px 10px;border:1px solid #2f6b46;border-radius:3px;background:#0e1a15;color:#8fe2b6;font-size:12px}',
  '.pv-note b{color:#c7f5df}',
  // 真机设置弹窗的"舞台"：把我们的栏位放进一个与宿主同尺度的弹窗里看
  '.pv-stage{position:relative;width:19.2rem;height:10.8rem;margin:18px auto;border:1px solid #24302c;border-radius:4px;overflow:hidden;background:#080b0a}',
  '.pv-stage__hint{position:absolute;left:.2rem;top:.14rem;color:#6f817c;font-size:12px;z-index:5}',
  // ★ 覆盖游戏的 .screen 固定定位（这里没有 .screen，弹窗直接铺在这块舞台里）
  '.pv-stage .modal{position:absolute !important;inset:0 !important}',
  '.pv-stage *{animation:none !important}',
  // 面板在弹窗里要能滚（真机上由弹窗自己的 .modal__body 滚）
  '.pv-stage .modal__body{overflow:auto}',
  // 审查用的"假宿主行"（音量 / 文字大小 / 全屏）—— 明确标注是 mock
  '.pv-mock{opacity:.55}',
  '.pv-mock-tag{color:#8a7f5a;font-size:11px;margin-left:6px}',
  // 预览页自己的确认框（复刻真机 confirmDialog 的形态与文案）
  // ★ z-index 必须高于宿主弹窗层：`.modal` 自带很高的 z-index（宿主），40 会被它盖住 ⇒ 确认框「存在但看不见」（本工序踩过）。
  //   真机上这道确认由 api.ui.confirmDialog 画在 app 根（本来就在弹窗之上），这里是预览页自己的实现。
  '.pv-confirm{position:absolute;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}',
  '.pv-confirm__box{width:6.6rem;background:#0e1312;border:1px solid #6b4a2f;border-left:3px solid #f6a329;border-radius:3px;padding:.16rem}',
  '.pv-confirm__t{color:#f6a329;font-size:calc(.18 * var(--t));margin:0 0 .1rem}',
  '.pv-confirm__x{color:#cfe0da;font-size:calc(.15 * var(--t));line-height:1.75;margin:0 0 .14rem;white-space:pre-line}',
  '.pv-confirm__acts{display:flex;gap:.1rem;justify-content:flex-end}',
  '.pv-toast{position:fixed;right:14px;bottom:14px;z-index:50;background:#0e1a15;border:1px solid #2f6b46;border-radius:3px;color:#8fe2b6;font-size:12px;padding:8px 12px;max-width:360px}',
  // ★③ 预览舞台里的"位置高亮"层：与真机同色的黄框（真机上的层在 highlight.js 里建）
  '.pv-hl{position:absolute;inset:0;z-index:9998;pointer-events:none}',   // 必须高过宿主 .modal（与确认框同一课）
  '.pv-hl i{position:absolute;box-sizing:border-box;border:2px solid #ffd54a;border-radius:2px;',
  '  box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 10px rgba(255,213,74,.45)}',
  '.pv-hl b{position:absolute;left:-2px;top:-1.15em;white-space:nowrap;background:#ffd54a;color:#14100a;',
  '  font-size:11px;line-height:1.5;padding:0 5px;border-radius:2px}',
  '.pv-hl-note{position:absolute;left:.2rem;bottom:.12rem;z-index:7;color:#f6a329;font-size:12px;',
  '  background:rgba(6,10,9,.8);border:1px solid #6b4a2f;border-radius:2px;padding:1px 6px}',
].join('\n');

// ==================================================================================================
// 预览页的渲染器（纯 DOM，**类名与 client/section.js 逐条对齐**）
// ==================================================================================================
const RENDERER = [
  '(function () {',
  '  var D = window.DJA;',
  '  var TEXTS = D.TEXTS;',
  '  var cfg = D.sanitize(null);                 // ★ 预览从**出厂状态**开始：默认全关、全局数值是默认值',
  '  var sel = null;',
  '  var exp = { "L:top": true, "L:corner": true, "L:mod": true };',
  '  var root = document.getElementById("pv-section");',
  '',
  '  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }',
  '  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }',
  '  function hint(text) { var s = el("span", "sp-dja__info", "?"); s.setAttribute("role", "img"); s.tabIndex = 0; s.setAttribute("aria-label", text); s.setAttribute("data-tip", text); return s; }',
  '',
  '  /** 提交一个"和面板一样"的改动（预览页没有引擎，只改配置并重画）。 */',
  '  function setMode(id, m) {',
  '    var node = D.findNode(D.TREE, id);',
  '    var wasOff = D.modeOf(cfg, id) === "off";',
  '    if (wasOff && m !== "off" && node && node.danger === true) {',
  '      confirmDanger(node, function (ok) { if (ok) { cfg = applyMode(id, m); draw(); } });',
  '      return;',
  '    }',
  '    cfg = applyMode(id, m); draw();',
  '  }',
  '  function applyMode(id, m) {',
  '    var nodes = Object.assign({}, cfg.nodes);',
  '    nodes[id] = (m === "own") ? { m: "own" } : { m: m };',
  '    // ★ 必须把 rnd / fab 一起带上：sanitize 对缺失的块会用出厂值补齐 ⇒ 漏了就会把随机偏移悄悄关掉',
  '    return D.sanitize({ glob: cfg.glob, rnd: cfg.rnd, fab: cfg.fab, nodes: nodes });',
  '  }',
  '  function setParam(key, v) {',
  '    if (!sel) return;',
  '    var m = D.modeOf(cfg, sel);',
  '    if (m === "global") cfg = D.sanitize({ glob: Object.assign({}, cfg.glob, kv(key, v)), rnd: cfg.rnd, fab: cfg.fab, nodes: cfg.nodes });',
  '    else if (m === "own") {',
  '      var cur = D.valuesOf(cfg, sel);',
  '      var nodes = Object.assign({}, cfg.nodes);',
  '      nodes[sel] = { m: "own", v: D.cleanValues(Object.assign({}, cur, kv(key, v))) };',
  '      cfg = D.sanitize({ glob: cfg.glob, rnd: cfg.rnd, fab: cfg.fab, nodes: nodes });',
  '    }',
  '    draw();',
  '  }',
  '  function kv(k, v) { var o = {}; o[k] = v; return o; }',
  '',
  '  /** ★ 二次确认（复刻真机 confirmDialog 的文案与按钮；真机上由 api.ui.confirmDialog 承担）。 */',
  '  function confirmDanger(node, cb) {',
  '    var wrap = el("div", "pv-confirm");',
  '    var box = el("div", "pv-confirm__box brackets");',
  '    var name = node.kind === "leaf" ? node.el.name : node.name;',
  '    box.appendChild(el("h3", "pv-confirm__t", TEXTS.dangerConfirmTitle.replace("{name}", name)));',
  '    box.appendChild(el("p", "pv-confirm__x", TEXTS.dangerConfirmText));',
  '    var acts = el("div", "pv-confirm__acts");',
  '    var cancel = el("button", "btn btn--secondary btn--md"); cancel.appendChild(el("span", "btn__label", TEXTS.dangerConfirmCancel));',
  '    var ok = el("button", "btn btn--danger btn--md"); ok.appendChild(el("span", "btn__label", TEXTS.dangerConfirmOk));',
  '    cancel.onclick = function () { wrap.remove(); cb(false); };',
  '    ok.onclick = function () { wrap.remove(); cb(true); };',
  '    acts.appendChild(cancel); acts.appendChild(ok); box.appendChild(acts); wrap.appendChild(box);',
  '    document.getElementById("pv-stage").appendChild(wrap);',
  '  }',
  '',
  '  // ---- 一行参数（三类控件；与 section.js 的 ParamRow 一一对应）----',
  '  function paramRow(p) {',
  '    if (p.kind === "seg") {',
  '      var row = el("div", "set-row"); row.setAttribute("data-dja-key", p.key);',
  '      var lb = el("span", "set-row__label", p.label); lb.appendChild(hint(p.hint)); row.appendChild(lb);',
  '      var seg = el("div", "set-seg"); seg.setAttribute("role", "radiogroup");',
  '      (p.options || []).forEach(function (o) {',
  '        var b = el("button", p.value === o ? "is-on" : "", (p.optionLabels || {})[o] || o);',
  '        b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", p.value === o ? "true" : "false");',
  '        if (p.disabled) b.disabled = true; else b.onclick = function () { setParam(p.key, o); };',
  '        seg.appendChild(b);',
  '      });',
  '      row.appendChild(seg); return row;',
  '    }',
  '    var lab = el("label", "set-row"); lab.setAttribute("data-dja-key", p.key);',
  '    var l2 = el("span", "set-row__label", p.label); l2.appendChild(hint(p.hint)); lab.appendChild(l2);',
  '    if (p.kind === "frames") {',
  '      var wrap = el("span", "sp-dja__numwrap");',
  '      var inp = el("input", "sp-dja__num"); inp.type = "number"; inp.inputMode = "numeric";',
  '      inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.disabled = !!p.disabled;',
  '      if (!p.disabled) inp.value = p.value;',
  '      inp.oninput = function () { var v = Number(inp.value); if (Number.isFinite(v)) setParam(p.key, Math.round(v)); };',
  '      wrap.appendChild(inp); wrap.appendChild(el("span", "sp-dja__unit", "帧")); lab.appendChild(wrap);',
  '    } else {',
  '      var r = el("input", "set-range sp-dja__range"); r.type = "range";',
  '      r.min = p.min; r.max = p.max; r.step = p.step; r.disabled = !!p.disabled;',
  '      r.value = p.disabled ? p.min : p.value;',
  '      r.style.setProperty("--pct", (p.max === p.min ? 0 : Math.round(((p.value - p.min) / (p.max - p.min)) * 100)) + "%");',
  '      if (!p.disabled) r.oninput = function () { setParam(p.key, Number(r.value)); };',
  '      lab.appendChild(r);',
  '    }',
  '    var val = el("span", "set-row__val num", p.text); val.style.cssText = "white-space:nowrap;width:auto;text-align:right";',
  '    val.setAttribute("data-dja-val", p.key); lab.appendChild(val); return lab;',
  '  }',
  '',
  '  // ---- 目录树（与 section.js 的 TreeRows 一一对应）----',
  '  function treeRows(list) {',
  '    var frag = document.createDocumentFragment();',
  '    list.forEach(function (r) {',
  '      if (r.children) {',
  '        var d = el("details", "sp-dja__node"); d.open = !!exp[r.id];',
  '        var sm = el("summary", r.selected ? "is-sel" : "");',
  '        sm.appendChild(el("span", "sp-dja__caret", "▸"));',
  '        sm.appendChild(el("span", "sp-dja__leafname", r.name));',
  '        if (r.danger) { var w = el("span", "sp-dja__danger", "⚠"); w.title = "危险元素：转起来可能点不到设置"; sm.appendChild(w); }',
  '        sm.appendChild(el("span", "sp-dja__count", String(r.count)));',
  '        sm.appendChild(el("span", "sp-dja__badge is-" + r.mode, r.modeLabel));',
  '        sm.onclick = function (e) { e.preventDefault(); exp[r.id] = !exp[r.id]; sel = r.id; draw(); };',
  '        d.appendChild(sm);',
  '        var kids = el("div", "sp-dja__kids"); kids.appendChild(treeRows(r.children)); d.appendChild(kids);',
  '        frag.appendChild(d);',
  '      } else {',
  '        var lf = el("div", "sp-dja__leaf" + (r.selected ? " is-sel" : "") + (r.unavailable ? " is-un" : ""));',
  '        lf.setAttribute("data-dja-leaf", r.id);',
  '        lf.title = r.unavailable || r.sub;',
  '        lf.appendChild(el("span", "sp-dja__leafname", r.name));',
  '        if (r.danger) { var w2 = el("span", "sp-dja__danger", "⚠"); w2.title = "危险元素：转起来可能点不到设置"; lf.appendChild(w2); }',
  '        lf.appendChild(el("span", "sp-dja__id", r.sub));',
  '        lf.appendChild(el("span", "sp-dja__badge is-" + r.mode, r.modeLabel));',
  '        lf.onclick = function () { sel = r.id; draw(); };',
  '        frag.appendChild(lf);',
  '      }',
  '    });',
  '    return frag;',
  '  }',
  '',
  '  function section(label, children) {',
  '    var s = el("div", "sp-dja__sec"); s.setAttribute("data-dja-group", label);',
  '    s.appendChild(el("span", "sp-dja__h", label));',
  '    (children || []).forEach(function (c) { s.appendChild(c); });',
  '    return s;',
  '  }',
  '',
  '  function draw() {',
  '    var head = D.headModel(cfg, sel, D.TREE);',
  '    var rows = D.annotate(D.TREE, cfg, sel, null);',
  '    root.textContent = "";',
  '    // ---- 说明 + 运行读数 ----',
  '    var r1 = el("div", "set-row"); r1.appendChild(el("span", "set-row__label", "说明"));',
  '    r1.appendChild(el("span", "sp-dja__mode-note", TEXTS.intro)); root.appendChild(section("DJ 整活（逐元素）", [r1, mockReadout()]));',
  '    // ---- 配置区 ----',
  '    var sec2 = [];',
  '    if (head.empty) {',
  '      var em = el("div", "sp-dja__empty"); em.innerHTML = "<b>" + esc(TEXTS.emptyTitle) + "</b><br />" + esc(TEXTS.emptyHint);',
  '      sec2.push(em);',
  '    } else {',
  '      var nrow = el("div", "set-row"); nrow.setAttribute("data-dja-head", "1");',
  '      nrow.setAttribute("data-dja-head-id", head.id); nrow.setAttribute("data-dja-head-name", head.name);',
  '      var nl = el("span", "set-row__label", head.name); nl.appendChild(hint(head.modeHint)); nrow.appendChild(nl);',
  '      var side = el("div", "sp-dja__side-by");',
  '      side.appendChild(el("span", "sp-dja__id", head.id)); side.appendChild(el("span", "sp-dja__count", head.pathLabel));',
  '      nrow.appendChild(side); sec2.push(nrow);',
  '      var mrow = el("div", "set-row"); mrow.setAttribute("data-dja-mode", "1");',
  '      mrow.appendChild(el("span", "set-row__label", "档位"));',
  '      var seg = el("div", "set-seg"); seg.setAttribute("role", "radiogroup");',
  '      head.modes.forEach(function (m) {',
  '        var b = el("button", m.on ? "is-on" : "", m.label); b.type = "button"; b.setAttribute("role", "radio");',
  '        b.setAttribute("data-dja-mode-opt", m.id); b.setAttribute("aria-checked", m.on ? "true" : "false");',
  '        b.onclick = function () { setMode(head.id, m.id); }; seg.appendChild(b);',
  '      });',
  '      mrow.appendChild(seg); sec2.push(mrow);',
  '      if (head.danger) {',
  '        var warn = el("div", "sp-dja__warn"); warn.setAttribute("data-dja-warn", "1");',
  '        warn.appendChild(el("b", "", "⚠ 危险元素")); warn.appendChild(el("span", "", head.dangerText)); sec2.push(warn);',
  '      }',
  '      head.params.forEach(function (p) { sec2.push(paramRow(p)); });',
  '    }',
  '    root.appendChild(section("配置（选中的元素）", sec2));',
  '    // ---- 目录树 ----',
  '    // ---- ④ 随机偏移（可展开）----',
  '    root.appendChild(rndGroup());',
  '    // ---- ② 局内（入口 + 高亮）----',
  '    root.appendChild(fabGroup());',
  '    var tw = el("div", "sp-dja__tree"); tw.setAttribute("data-dja-tree", "1"); tw.appendChild(treeRows(rows));',
  '    var brow = el("div", "set-row"); brow.appendChild(el("span", "set-row__label", "批量"));',
  '    var bwrap = el("div", "sp-dja__side-by");',
  '    var rb = el("button", "btn btn--secondary btn--sm"); rb.appendChild(el("span", "btn__label", TEXTS.resetLabel));',
  '    rb.onclick = function () { cfg = D.sanitize(null); sel = null; draw(); };',
  '    bwrap.appendChild(rb); brow.appendChild(bwrap);',
  '    root.appendChild(section("元素目录（按层级展开）", [tw, brow]));',
  '    root.appendChild(el("p", "sp-dja__ver", "cyanfish.dj-all · v0.3.0 · " + TEXTS.footer));',
'    hlDraw();   // ★③ 选中元素 ⇒ 在预览舞台里给它套黄框（真机上是画在战斗画面上）',
  '    paintStatus();',
  '  }',
  '',
  '  /** 运行读数（预览页没有真引擎 ⇒ 用配置复算，并明确标注）。 */',
  '  function toggle(cls, on, label) {',
  '    var b = el("button", (cls ? cls + " " : "") + "set-toggle" + (on ? " is-on" : ""));',
  '    b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", on ? "true" : "false");',
  '    b.appendChild(el("i", "")); b.appendChild(el("span", "", label || (on ? "开" : "关"))); return b;',
  '  }',
  '  function slider(attr, min, max, v, dis, cb) {',
  '    var i = el("input", "set-range sp-dja__range"); i.type = "range"; i.min = min; i.max = max; i.step = 1;',
  '    i.disabled = !!dis; i.value = v; i.setAttribute("data-" + attr, "1");',
  '    i.style.setProperty("--pct", Math.round(((v - min) / (max - min)) * 100) + "%");',
  '    if (!dis) i.oninput = function () { cb(Number(i.value)); };',
  '    return i;',
  '  }',
  '',
  '  // ★④ 随机偏移那一组（与 section.js 逐条对齐：开关 + 两个幅度滑块 + 作用范围读数）',
  '  function rndGroup() {',
  '    var r = D.rndModel(cfg);',
  '    var box = el("details", "sp-dja__node"); box.setAttribute("data-dja-rnd", "1"); box.open = !!r.on;',
  '    var sm = el("summary", "");',
  '    sm.appendChild(el("span", "sp-dja__caret", "▸"));',
  '    sm.appendChild(el("span", "sp-dja__leafname", TEXTS.rndGroup)); sm.appendChild(hint(TEXTS.rndHint));',
  '    var bd = el("span", "sp-dja__badge " + (r.on ? "is-own" : "is-off"), r.text); bd.setAttribute("data-dja-rnd-badge", "1");',
  '    sm.appendChild(bd); box.appendChild(sm);',
  '    var kids = el("div", "sp-dja__kids");',
  '    var row0 = el("div", "set-row"); row0.setAttribute("data-dja-rnd-on", "1");',
  '    row0.appendChild(el("span", "set-row__label", TEXTS.rndOn));',
  '    var w0 = el("div", "sp-dja__side-by");',
  '    w0.appendChild(toggle("", r.on, r.on ? "开" : "关"));',
  '    w0.firstChild.onclick = function () { setRnd({ on: !r.on }); };',
  '    row0.appendChild(w0); kids.appendChild(row0);',
  '    var lab1 = el("label", "set-row"); lab1.setAttribute("data-dja-rnd-key", "loPct");',
  '    lab1.appendChild(el("span", "set-row__label", "最小幅度"));',
  '    lab1.appendChild(slider("dja-rnd-lo", r.min, r.max, r.loPct, !r.on, function (v) { setRnd({ loPct: v }); }));',
  '    var v1 = el("span", "set-row__val num", r.loPct + "%"); v1.setAttribute("data-dja-rnd-val", "loPct"); v1.style.cssText = VAL;',
  '    lab1.appendChild(v1); kids.appendChild(lab1);',
  '    var lab2 = el("label", "set-row"); lab2.setAttribute("data-dja-rnd-key", "hiPct");',
  '    lab2.appendChild(el("span", "set-row__label", "最大幅度"));',
  '    lab2.appendChild(slider("dja-rnd-hi", r.min, r.max, r.hiPct, !r.on, function (v) { setRnd({ hiPct: v }); }));',
  '    var v2 = el("span", "set-row__val num", r.hiPct + "%"); v2.setAttribute("data-dja-rnd-val", "hiPct"); v2.style.cssText = VAL;',
  '    lab2.appendChild(v2); kids.appendChild(lab2);',
  '    var row3 = el("div", "set-row"); row3.setAttribute("data-dja-ro", "");',
  '    row3.appendChild(el("span", "set-row__label", "作用范围"));',
  '    var ro3 = el("span", "sp-dja__ro", r.affects + " · " + TEXTS.rndNote); ro3.setAttribute("data-dja-ro", "rnd");',
  '    row3.appendChild(ro3); kids.appendChild(row3);',
  '    box.appendChild(kids); return box;',
  '  }',
  '',
  '  // ★② 局内那一组（入口开关 / 位置 / 不透明度 / 高亮开关 / 高亮读数）',
  '  function fabGroup() {',
  '    var f = D.fabModel(cfg);',
  '    var body = [];',
  '    var row0 = el("div", "set-row"); row0.setAttribute("data-dja-fab-on", "1");',
  '    var l0 = el("span", "set-row__label", TEXTS.fabOn); l0.appendChild(hint(TEXTS.fabHint)); row0.appendChild(l0);',
  '    var w0 = el("div", "sp-dja__side-by");',
  '    var tg = toggle("", f.on, f.on ? "开" : "关"); tg.onclick = function () { setFab({ on: !f.on }); }; w0.appendChild(tg);',
  '    row0.appendChild(w0); body.push(row0);',
  '    var row1 = el("div", "set-row");',
  '    row1.appendChild(el("span", "set-row__label", TEXTS.fabPos));',
  '    var w1 = el("div", "sp-dja__side-by");',
  '    var pos = el("span", "sp-dja__id", f.posText); pos.setAttribute("data-dja-fab-pos", "1"); w1.appendChild(pos);',
  '    var rb = el("button", "btn btn--secondary btn--sm"); rb.type = "button";',
  '    var rl = el("span", "btn__label", TEXTS.fabReset); rb.appendChild(rl);',
  '    rb.onclick = function () { setFab({ x: 0.952, y: 0.66 }); }; w1.appendChild(rb);',
  '    row1.appendChild(w1); body.push(row1);',
  '    var lab2 = el("label", "set-row"); lab2.setAttribute("data-dja-fab-alpha", "1");',
  '    lab2.appendChild(el("span", "set-row__label", TEXTS.fabAlpha));',
  '    lab2.appendChild(slider("dja-fab-alpha", 35, 100, f.alphaPct, false, function (v) { setFab({ alpha: v / 100 }); }));',
  '    var av = el("span", "set-row__val num", f.alphaPct + "%"); av.setAttribute("data-dja-fab-alpha-val", "1"); av.style.cssText = VAL;',
  '    lab2.appendChild(av); body.push(lab2);',
  '    var row3 = el("div", "set-row"); row3.setAttribute("data-dja-hl-on", "1");',
  '    var l3 = el("span", "set-row__label", TEXTS.hlOn); l3.appendChild(hint(TEXTS.hlHint)); row3.appendChild(l3);',
  '    var w3 = el("div", "sp-dja__side-by");',
  '    var tg3 = toggle("", f.hl, f.hl ? "开" : "关"); tg3.onclick = function () { setFab({ hl: !f.hl }); }; w3.appendChild(tg3);',
  '    row3.appendChild(w3); body.push(row3);',
  '    var row4 = el("div", "set-row"); row4.setAttribute("data-dja-ro", "");',
  '    row4.appendChild(el("span", "set-row__label", "位置高亮"));',
  '    var rt = el("span", "sp-dja__ro", hlText()); rt.setAttribute("data-dja-ro", "hl"); row4.appendChild(rt); body.push(row4);',
  '    return section("局内", body);',
  '  }',
  '',
  '  var VAL = "white-space:nowrap;width:auto;text-align:right";',
  '  function setRnd(patch) { cfg = D.sanitize({ glob: cfg.glob, rnd: Object.assign({}, cfg.rnd, patch), fab: cfg.fab, nodes: cfg.nodes }); draw(); }',
  '  function setFab(patch) { cfg = D.sanitize({ glob: cfg.glob, rnd: cfg.rnd, fab: Object.assign({}, cfg.fab, patch), nodes: cfg.nodes }); draw(); }',
  '  /** ③ 高亮读数（与 section.js 同一套判断，不许假装标了）。 */',
  '  function hlText() {',
  '    var f = D.fabModel(cfg);',
  '    if (!f.hl) return TEXTS.hlOff;',
  '    if (!sel) return "在目录里点一个元素就会标出来。";',
  '    var n = hlCount();',
  '    if (n.pixi > 0 && n.boxes === 0) return TEXTS.hlPixi;',
  '    if (n.boxes > 0) return "已在画面上标出 " + n.boxes + " 个位置";',
  '    if (n.miss > 0) return "这块预览画面里没有它（预览只搭了战斗屏骨架那一层，真机上是完整画面）。";',
  '    return "没找到它在画面上的位置（这个元素此刻不在场）。";',
  '  }',
  '',
  '  /** 取一个树节点的全部后代叶子（叶子带 .el）。 */',
  '  function leavesOfNode(node) {',
  '    var out = [];',
  '    (function w(n) { if (!n) return; if (n.kind === \'leaf\') { out.push(n); return; } (n.children || []).forEach(w); })(node);',
  '    return out;',
  '  }',
  '  /** ③ 在预览舞台里画黄框；返回计数（给读数用）。 */',
  '  function hlDraw() {',
  '    var layer = document.getElementById(\'pv-hl\');',
  '    var stage = document.getElementById(\'pv-battle\') || document.getElementById(\'pv-stage\');',
  '    var res = { boxes: 0, miss: 0, pixi: 0 };',
  '    if (!layer || !stage) return res;',
  '    layer.textContent = \'\';',
  '    var f = D.fabModel(cfg);',
  '    if (!f.hl || !sel) return res;',
  '    var node = D.TREE_BY_ID[sel];',
  '    if (!node) return res;',
  '    var sb = stage.getBoundingClientRect();',
  '    var seen = {};',
  '    leavesOfNode(node).forEach(function (lf) {',
  '      var e = lf.el;',
  '      if (!e) return;',
  '      if (e.pixi) { res.pixi++; return; }',
  '      if (!e.sel) return;',
  '      var els = [];',
  '      try { els = stage.querySelectorAll(e.sel); } catch (err) { els = []; }',
  '      if (!els.length) { res.miss++; return; }',
  '      for (var i = 0; i < els.length; i++) {',
  '        var r = els[i].getBoundingClientRect();',
  '        if (r.width <= 0.5 && r.height <= 0.5) continue;',
  '        var d = document.createElement(\'i\');',
  '        d.style.left = Math.round(r.left - sb.left) + \'px\';',
  '        d.style.top = Math.round(r.top - sb.top) + \'px\';',
  '        d.style.width = Math.round(r.width) + \'px\';',
  '        d.style.height = Math.round(r.height) + \'px\';',
  '        if (!seen[e.id]) { seen[e.id] = 1; var t = document.createElement(\'b\'); t.textContent = e.id; d.appendChild(t); }',
  '        layer.appendChild(d); res.boxes++;',
  '      }',
  '    });',
  '    return res;',
  '  }',
  '  function hlCount() { return hlDraw(); }',
  '  function mockReadout() {',
  '    var row = el("div", "set-row"); row.setAttribute("data-dja-ro", "");',
  '    var lb = el("span", "set-row__label", "运行读数"); lb.appendChild(hint(TEXTS.footer)); row.appendChild(lb);',
  '    var items = D.compile(cfg, D.TREE);',
  '    var dom = items.filter(function (i) { return i.sel; });',
  '    var grp = items.filter(function (i) { return i.pixi; });',
  '    var ro = el("span", "sp-dja__ro", "预览页没有真引擎：按配置复算 ⇒ 生效 " + items.length + " 项（DOM " + dom.length',
  '      + " · 画布 " + grp.length + "）。真机上这里是引擎实测读数（注入 KB / 帧耗时 / 画布帧回调）。");',
  '    ro.setAttribute("data-dja-ro", "run"); row.appendChild(ro); return row;',
  '  }',
  '',
  '  function paintStatus() {',
  '    var box = document.getElementById("pv-state");',
  '    if (!box) return;',
  '    box.textContent = "当前配置：" + JSON.stringify({ glob: cfg.glob, rnd: cfg.rnd, fab: cfg.fab, nodes: cfg.nodes });',
  '  }',
  '',
  '  draw();',
  '  window.__DJA_PREVIEW__ = {',
  '    cfg: function () { return JSON.parse(JSON.stringify(cfg)); },',
  '    sel: function () { return sel; },',
  '    pick: function (id) { sel = id; draw(); return sel; },',
  '    setMode: function (id, m) { cfg = applyMode(id, m); draw(); return D.modeOf(cfg, id); },',
  '    setParam: setParam,',
  '    reset: function () { cfg = D.sanitize(null); sel = null; draw(); },',
  '    rnd: function () { return D.rndModel(cfg); },',
  '    fab: function () { return D.fabModel(cfg); },',
  '    setRnd: setRnd, setFab: setFab,',
  '    hl: function () { return hlDraw(); },',
  '    treeLeaves: function () { var n = 0; (function w(l) { l.forEach(function (r) { r.children ? w(r.children) : n++; }); })(D.annotate(D.TREE, cfg, null, null)); return n; },',
  '  };',
  '})();',
].join('\n');

// ==================================================================================================
// 页面
// ==================================================================================================
function build() {
  const nEl = (bundle.match(/id: '/g) || []).length;
  const out = [];
  out.push('<!doctype html>');
  out.push('<html lang="zh-CN">');
  out.push('<head>');
  out.push('<meta charset="utf-8" />');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  out.push('<title>cyanfish.dj-all · 设置页注册区（独立预览）</title>');
  out.push('<style id="pv-game-css">');
  out.push(gameCss);
  out.push('</style>');
  out.push('<style id="pv-panel-css">');
  out.push('/* ---- 原样内联自 mods/cyanfish.dj-all/client/style.js（真机面板用的就是这一份） ---- */');
  out.push(panelCss);
  out.push('</style>');
  out.push('<style id="pv-page-css">');
  out.push(PAGE_CSS);
  out.push('</style>');
  out.push('</head>');
  out.push('<body>');
  out.push('<header class="pv-head">');
  out.push('  <h1>cyanfish.dj-all · 设置页注册区（独立预览 · 供审查）</h1>');
  out.push('  <p>这是「模组设置」里本 Mod 那一栏的预览：上方是选中元素的「关 / 全局 / 独立」三档 + 五个参数，'
    + '下方是按层级展开的元素目录。真机上它就是 <code>设置 → 模组设置 → DJ 整活</code> 那一栏。</p>');
  out.push('  <div class="pv-note"><b>审查要点</b>：① 默认每个元素都是「关」（数值留空且不可改）；'
    + '② 切「全局」改的是全局数值、切「独立」只改自己；③ 目录里 <b>⚠</b> 是危险元素（设置入口 / 含设置入口的整体 / 全屏容器），'
    + '从「关」切到非「关」会先弹二次确认；④ 「元素目录」可逐级展开、点一行就选中它。</div>');
  out.push('  <div class="pv-note" style="border-color:#2a3833;background:#0d1210;color:#8ba39c">'
    + '与真机的差别（只有两处）：本页用纯 DOM 渲染器、真机用 htm+Preact；本页不接引擎（不真的转起来），'
    + '真机切档后元素立刻开始动。两边读的是 client/panels.js 算出来的同一份描述、' 
    + '类名与结构逐条对齐。真机地址：<code>/mods/cyanfish.dj-all/</code>（或在控制台跑 <code>__SP_DJALL__.settingsPreview()</code>）。</div>');
  out.push('</header>');
  out.push('<div class="pv-stage" id="pv-stage">');
  out.push('  <div class="pv-stage__hint">↓ 官方「设置」弹窗的等比舞台（19.2rem × 10.8rem，1rem = 100px）；本 Mod 的栏位在弹窗最下面。'
    + '★ 在下面目录里点一个元素 ⇒ 这块舞台里它所在的位置会套上**黄色外框**（真机上是同一个效果，画在真实战斗画面上）</div>');
  out.push('  <!-- ★③ 的黄框层不在这里：它跟着「战斗画面」那块舞台走（下面 pv-battle 里） -->');
  out.push('  <div class="modal" role="presentation">');
  out.push('    <div class="modal__box brackets modal__box--mint" style="width:7.6rem;height:9.6rem">');
  out.push('      <div class="modal__stripe" aria-hidden="true"></div>');
  out.push('      <header class="modal__head"><span class="micro">SETTINGS</span><h2 class="modal__title">设置</h2></header>');
  out.push('      <div class="modal__body">');
  out.push('        <div class="set-list">');
  out.push('          <div class="pv-mock">');
  out.push('            <div class="set-row"><span class="set-row__label">音量<span class="pv-mock-tag">（假宿主行，仅作上下位参照）</span></span>'
    + '<input class="set-range" type="range" min="0" max="100" value="70" style="--pct:70%" /><span class="set-row__val num">70</span></div>');
  out.push('            <div class="set-row"><span class="set-row__label">文字大小</span><div class="set-seg" role="radiogroup">'
    + '<button type="button" role="radio" class="is-on" aria-checked="true">标准</button>'
    + '<button type="button" role="radio" aria-checked="false">大</button></div></div>');
  out.push('          </div>');
  out.push('          <div id="pv-section"></div>');
  out.push('        </div>');
  out.push('      </div>');
  out.push('      <footer class="modal__actions">'
    + '<button type="button" class="btn btn--secondary btn--md"><span class="btn__label">玩法说明</span></button>'
    + '<button type="button" class="btn btn--primary btn--md"><span class="btn__label">完成</span></button></footer>');
  out.push('    </div>');
  out.push('  </div>');
  out.push('</div>');
  // ★③ 战斗画面舞台：点目录里的元素 ⇒ 这块舞台里它所在的位置套上黄框（真机上是画在真实战斗画面上）
  out.push('<div class="pv-head" style="position:static;border-top:1px solid #24302c;border-bottom:none;margin-top:10px">');
  out.push('  <h1 style="font-size:15px">③ 战斗画面（黄框落点）</h1>');
  out.push('  <p>下面这块是与 catalog.html 同源的<b>战斗屏骨架</b>（19.2rem × 10.8rem，1rem = 100px）。'
    + '在上面目录里点一个元素 ⇒ 它在这块画面里的位置会套上<b>黄色外框</b>（带元素 id 标签）。'
    + '画布对象（单位 / 血条 / 特效）没有 DOM 位置，标不出来，会用一行字说明 —— 真机上也是这个行为。</p>');
  out.push('</div>');
  out.push('<div class="pv-stage" id="pv-battle">');
  out.push('  ' + BATTLE_HTML);
  out.push('  <div class="pv-hl" id="pv-hl"></div>');
  out.push('</div>');
  out.push('<div class="pv-head" style="position:static;border-top:1px solid #24302c;border-bottom:none;margin-top:8px">');
  out.push('  <p><b>当前配置（存档形状）</b>：<span id="pv-state" style="color:#7fd0ad;font-family:ui-monospace,Consolas,monospace;font-size:11px"></span></p>');
  out.push('  <p style="margin-top:6px">这就是写进 <code>sp.pref.djAll</code> 的内容：<code>nodes</code> 为空 = 每个元素都「关」；'
    + '「全局」档不存数值（跟着全局走）；「独立」档只在真改过之后才落数值。</p>');
  out.push('</div>');
  out.push('<script>');
  out.push(bundle);
  out.push('</script>');
  out.push('<script>');
  out.push(RENDERER);
  out.push('</script>');
  out.push('</body>');
  out.push('</html>');
  out.push('');
  return { html: out.join('\n'), nEl };
}

const built = build();
const dest = path.join(MOD_DIR, 'settings-preview.html');
fs.writeFileSync(dest, built.html, 'utf8');
console.log('✓ 生成 settings-preview.html  ' + (built.html.length / 1024).toFixed(1) + ' KB');
console.log('  内联：游戏 CSS ' + (gameCss.length / 1024).toFixed(1) + ' KB · 面板 CSS ' + (panelCss.length / 1024).toFixed(1) + ' KB · 纯函数包 ' + (bundle.length / 1024).toFixed(1) + ' KB');
console.log('  元素表条目（打包内计数）≈ ' + built.nEl);
