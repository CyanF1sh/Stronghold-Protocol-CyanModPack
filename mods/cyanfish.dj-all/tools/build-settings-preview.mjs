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
  '  TEXTS, annotate, headModel, findNode, nodeName, pathOf, paramText, framesText, modeHint, rndModel, fabModel, onModel };'
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
// ★ 渲染器改成独立文件 + 整体内联（0.3.x 那版把它塞在"单引号字符串数组"里，改一行要动几十处引号，连续踩语法坑）
const RENDERER = (function () {
  const src = fs.readFileSync(path.join(HERE, 'preview-renderer.js'), 'utf8');
  if (src.includes('</' + 'script')) throw new Error('preview-renderer.js 里出现了 </script，不能内联');
  return src;
})();

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
  // ★④ 局内浮窗舞台：与真机同一份面板（scope=elements）——半透明窗口 + 只放元素配置与元素目录
  out.push('<div class="pv-head" style="position:static;border-top:1px solid #24302c;border-bottom:none;margin-top:12px">');
  out.push('  <h1 style="font-size:15px">④ 局内浮窗（点战斗里那颗图标键打开）</h1>');
  out.push('  <p>这一栏<b>只放元素配置与元素目录</b>（含它自己的「元素恢复默认」）；说明、总开关、局内入口设置都在上面那块固定设置页里 —— 两边不重复。'
    + '真机上这扇窗是<b>半透明、可拖动</b>的（拖动标题栏；贴住战场，便于看元素位置）。</p>');
  out.push('</div>');
  out.push('<div class="pv-stage pv-stage--win">');
  out.push('  <div class="sp-dja__win" data-dja-win="1" style="--sp-dja-alpha:0.9;position:absolute">');
  out.push('    <div class="sp-dja__winbar"><span class="sp-dja__wintitle">DJ 整活</span>'
    + '<span class="sp-dja__winsub">局内浮窗 · 半透明 · 拖标题栏可移动</span>'
    + '<button type="button" class="sp-dja__winx">✕</button></div>');
  out.push('    <div class="sp-dja__winbody"><div class="set-list sp-dja__float" id="pv-float-section"></div></div>');
  out.push('  </div>');
  out.push('</div>');
  out.push('<div class="pv-head" style="position:static;border-top:1px solid #24302c;border-bottom:none;margin-top:8px">');
  out.push('  <p><b>当前配置（存档形状）</b>：<span id="pv-state" style="color:#7fd0ad;font-family:ui-monospace,Consolas,monospace;font-size:11px"></span></p>');
  out.push('  <p style="margin-top:6px">这就是写进 <code>sp.pref.djAll</code> 的内容：<code>nodes</code> 为空 = 每个元素都「关」；'
    + '「全局」档不存数值（跟着全局走）；「独立」档只在真改过之后才落数值。</p>');
  out.push('</div>');
  out.push('<div id="sp-dja-tip" style="position:fixed;inset:0;z-index:9999;pointer-events:none"></div>');
  out.push('<script>');
  out.push('// ★③ 气泡：与真机 client/tips.js 同一套做法（body 级 fixed 层 + 事件委托），所以它**不会**被祖先的 overflow 裁掉');
  out.push("(function () {");
  out.push("  var layer = document.getElementById('sp-dja-tip');");
  out.push("  var cur = null;");
  out.push("  function place(t) {");
  out.push("    if (!t || !t.isConnected) { hide(); return; }");
  out.push("    var text = t.getAttribute('data-tip') || ''; if (!text) { hide(); return; }");
  out.push("    layer.textContent = '';");
  out.push("    var tip = document.createElement('div'); tip.className = 'sp-dja__tip'; tip.textContent = text;");
  out.push("    tip.style.left = '-9999px'; layer.appendChild(tip);");
  out.push("    var tb = tip.getBoundingClientRect(), rb = t.getBoundingClientRect();");
  out.push("    var vw = innerWidth, vh = innerHeight;");
  out.push("    var left = Math.max(8, Math.min(rb.left + rb.width / 2 - tb.width / 2, vw - tb.width - 8));");
  out.push("    var top = rb.top - tb.height - 6;");
  out.push("    if (top < 8) { var below = rb.bottom + 6; top = (below + tb.height + 8 <= vh) ? below : Math.max(8, vh - tb.height - 8); }");
  out.push("    tip.style.left = Math.round(left) + 'px'; tip.style.top = Math.round(top) + 'px';");
  out.push("  }");
  out.push("  function hide() { cur = null; layer.textContent = ''; }");
  out.push("  var find = function (e) { return e && e.closest ? e.closest('[data-tip]') : null; };");
  out.push("  document.addEventListener('mouseover', function (e) { var t = find(e.target); if (t) { cur = t; place(t); } }, true);");
  out.push("  document.addEventListener('mouseout', function (e) { var t = find(e.target); if (t && t === cur) hide(); }, true);");
  out.push("  document.addEventListener('focusin', function (e) { var t = find(e.target); if (t) { cur = t; place(t); } }, true);");
  out.push("  document.addEventListener('click', function (e) { var t = find(e.target); if (t) { cur = t; place(t); } else hide(); }, true);");
  out.push("  setInterval(function () { if (cur) place(cur); }, 600);");
  out.push("  window.__DJA_TIPS__ = { layer: function () { return !!layer; }, shown: function () { return layer.textContent ? layer.textContent : null; }, rect: function () { var t = layer.firstChild; if (!t) return null; var r = t.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; } };");
  out.push("})();");
  out.push('</scr' + 'ipt>');
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
