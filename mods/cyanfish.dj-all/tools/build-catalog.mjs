// mods/cyanfish.dj-all/tools/build-catalog.mjs — 由**元素表**生成两份产物（作者工具，不随包分发）。
//
//   输入：`../client/elements.js`（元素表，唯一真相） + `./stages.js`（预览舞台）+ 各 Mod 的 `client/style.js`
//   输出：`../catalog.html`（自包含的逐元素预览页） + `../ELEMENTS.md`（人读的层级清单）
//
// 用法（在主力树根目录）：
//   node mods/cyanfish.dj-all/tools/build-catalog.mjs
//
// ★ 为什么页里的样式是**内联抄一份**而不是 `<link>`：
//   游戏的 CSS 在 `public/css/**`，Mod 的 CSS 在各自 `client/style.js` 里（是 JS 模块，不是 .css 文件）。
//   为了让 `catalog.html` **双击也能打开**（file:// 下 ES 模块与 fetch 都会被 CORS 挡掉），生成器把
//   Mod 的 CSS 原文内联进来；游戏的 CSS 走 `<link>`（协议自适应：服务端 `/css/**`，file:// 走 `public/css/**`），
//   因为 `window.load` 会等样式表加载完，量尺寸时样式一定已经到位。
//
// ★ 预览的尺寸口径：根字号固定 100px（= 桌面 1920 时 1rem 的真实值）⇒ 舞台恒为 19.2rem × 10.8rem = 1920×1080。
//   每个元素的预览 = 量出它自己的边框盒，把视窗裁到它周围并按可用空间缩放（不需要手写坐标）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENTS, LAYERS, TREE, groupByLayer, normalizeEntry } from '../client/elements.js';
import { STAGES } from './stages.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD_DIR = path.resolve(HERE, '..');            // mods/cyanfish.dj-all
const MODS_DIR = path.resolve(MOD_DIR, '..');        // mods/
const ROOT = path.resolve(MODS_DIR, '..');           // 主力树根

const ROT_TEXT = { ok: '可转（轴转 / 平面内）', flat: '只宜平面内', no: '默认不转', pixi: '画布对象（引擎接管）' };

/** 抽一个 `client/style.js` 里的 `const CSS = <模板字面量>` 的正文（这几份文件都不含 `${}` 与内层反引号）。 */
function extractModCss(rel) {
  const abs = path.join(ROOT, rel);
  try {
    const s = fs.readFileSync(abs, 'utf8');
    const i = s.indexOf('const CSS');
    if (i < 0) return '';
    const b = s.indexOf('`', i);
    if (b < 0) return '';
    const e = s.indexOf('`', b + 1);
    if (e < 0) return '';
    return s.slice(b + 1, e);
  } catch { return ''; }
}

/** 要内联的 Mod CSS（顺序 = 应用顺序；只服务预览页）。 */
const MOD_CSS_FILES = [
  'mods/cyanfish.chat/client/style.js',
  'mods/cyanfish.banner/client/style.js',
  'mods/cyanfish.debug-console/client/style.js',
  'mods/cyanfish.mod-settings/client/style.js',
  'mods/cyanfish.online/client/style.js',
  'mods/cyanfish.announce/client/style.js',
  'mods/cyanfish.skinvoice/client/style.js',
];

const modCss = MOD_CSS_FILES.map((f) => extractModCss(f)).filter(Boolean).join('\n\n');

/**
 * 要内联的**游戏** CSS（原文照抄，只服务预览页）。
 * ★ 为什么内联而不是 `<link>`：预览页要能**在任何地方打开** —— 双击（`file://`）、由游戏自身服务
 *   （`/mods/<id>/…` 的上一级是站点根）、以及被别人用只映射单个文件的静态预览托管（同级目录不可达）。
 *   三种形态下"相对路径找 CSS"各有各的坑（本工序实测踩过：本地实例与真服务器的目录布局不同；
 *   用 `fetch` 探测还会被游戏的 Service Worker 拦成非 2xx）。
 *   内联之后**零外部依赖**，上面这些全都不存在了。
 * ★ 版权：这 7 份 CSS 是上游（GPL-3.0-or-later）的原文，逐字节照抄、未作任何修改；
 *   `catalog.html` 是作者工具（不在 `.spmod` 分发白名单里，也不进开源发布集）。
 */
const GAME_CSS_FILES = [
  'public/css/theme.css',
  'public/css/components.css',
  'public/css/screens/game.css',
  'public/css/screens/game-shop.css',
  'public/css/screens/game-panels.css',
  'public/css/emotes.css',
  'public/css/devices.css',
];

function readGameCss(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; }
}

const gameCss = GAME_CSS_FILES
  .map((f) => '/* ===== ' + f + ' （上游原文，逐字节照抄） ===== */\n' + readGameCss(f))
  .filter((s) => s.length > 60)
  .join('\n');

// ==================================================================================================
// 页面
// ==================================================================================================

/** 预览页自身的样式（**只用 px**：根字号要让给游戏 CSS 的 rem 换算）。 */
const PAGE_CSS = [
  // ★★ 这两行是**必须的**（本页内联了游戏 CSS，而游戏是固定画布 ⇒ 它的 `body{overflow:hidden}` 会被视口继承，
  //   页面就再也滚不动了 —— 真机实测：`body.overflow = hidden`、`scrollingElement.scrollHeight = 25664`
  //   却出不来滚动条。PAGE_CSS 被放在所有内联 CSS **之后**，这里再用 !important 双保险。
  'html{overflow-y:auto !important;height:auto !important;touch-action:auto !important;overscroll-behavior:auto !important}',
  'body{overflow-y:auto !important;height:auto !important;min-height:100vh;position:static !important;'
  + 'display:block !important;overscroll-behavior:auto !important}',
  'html{font-size:100px !important}',   // ★ 桌面 1920 时游戏真实的 1rem 值
  'body{margin:0;background:#0a0d0c;color:#cfe0da;font:14px/1.65 system-ui,"Noto Sans SC",sans-serif}',
  '.dja-head{position:sticky;top:0;z-index:20;background:rgba(8,11,10,.94);border-bottom:1px solid #24302c;padding:14px 20px 12px}',
  '.dja-head h1{margin:0 0 4px;font-size:17px;font-weight:600;letter-spacing:.02em;color:#eaf6f1}',
  '.dja-head p{margin:0;color:#7d8f8a;font-size:12px}',
  '.dja-head code{background:#111816;border:1px solid #223029;border-radius:3px;padding:0 4px;color:#7fd0ad}',
  '.dja-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}',
  '.dja-bar input{flex:1 1 260px;min-width:180px;background:#0f1513;border:1px solid #24302c;color:#dcefe8;border-radius:3px;padding:6px 10px;font-size:13px;outline:none}',
  '.dja-bar input:focus{border-color:#2f6b56}',
  '.dja-chipbar{display:flex;flex-wrap:wrap;gap:5px}',
  '.dja-chip{background:#0f1513;border:1px solid #24302c;color:#93a8a2;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer}',
  '.dja-chip.is-on{background:#12301f;border-color:#2f7a52;color:#8fe2b6}',
  '.dja-stat{color:#6f817c;font-size:12px}',
  // ---- 两栏：左「层级目录」+ 右卡片 ----
  '.dja-wrap{display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px;align-items:start;padding:16px 20px 60px;max-width:1560px}',
  '@media (max-width:1080px){.dja-wrap{grid-template-columns:1fr}}',
  '.dja-side{position:sticky;top:136px;max-height:calc(100vh - 160px);overflow:auto;background:#0d1210;'
  + 'border:1px solid #1f2a26;border-radius:4px;padding:8px 8px 10px}',
  '@media (max-width:1080px){.dja-side{position:static;max-height:340px}}',
  '.dja-side__hd{position:sticky;top:0;background:#0d1210;padding:2px 4px 6px;border-bottom:1px solid #1b241f;'
  + 'color:#e6f4ef;font-size:12.5px;font-weight:600;margin-bottom:4px}',
  '.dja-side__note{display:block;color:#6f817c;font-size:11px;font-weight:400;line-height:1.5;margin-top:2px}',
  '.dja-side details{margin:0 0 1px}',
  '.dja-side summary{cursor:pointer;padding:3px 6px;border-radius:3px;color:#cfe8de;font-size:12.5px;list-style:none;outline:none}',
  '.dja-side summary::-webkit-details-marker{display:none}',
  '.dja-side summary::before{content:"▸";display:inline-block;width:11px;color:#5c8f76;transition:transform .12s}',
  '.dja-side details[open] > summary::before{transform:rotate(90deg)}',
  '.dja-side summary:hover{background:#131c19}',
  '.dja-side .dja-t-g{color:#cfe8de}',
  '.dja-side .dja-t-body{margin-left:11px;border-left:1px solid #1b241f;padding-left:3px}',
  '.dja-side .dja-t-leaf{padding:2px 6px;border-radius:3px;color:#9db3ac;font-size:12px;cursor:pointer;line-height:1.5}',
  '.dja-side .dja-t-leaf:hover{background:#131c19;color:#8fe2b6}',
  '.dja-side .dja-t-leaf.is-sel{background:#12301f;color:#8fe2b6}',
  '.dja-side .dja-t-meta{color:#5c8f76;font-size:11px;margin-left:4px}',
  '.dja-side .dja-t-pick{cursor:pointer;color:#4f7a66;font-size:11px;margin-left:4px}',
  '.dja-side .dja-t-pick:hover{color:#8fe2b6}',
  '.dja-filterbar{display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:7px 10px;background:#0f1a16;'
  + 'border:1px solid #2f6b46;border-radius:4px;color:#8fe2b6;font-size:12.5px}',
  '.dja-filterbar button{background:none;border:1px solid #2f6b46;color:#8fe2b6;border-radius:3px;padding:1px 8px;font-size:12px;cursor:pointer}',
  '.dja-main{padding:0;max-width:none}',
  '.dja-layer{margin:0 0 26px}',
  '.dja-layer > h2{margin:0 0 2px;font-size:14px;font-weight:600;color:#cfe8de;letter-spacing:.03em}',
  '.dja-layer > p{margin:0 0 12px;color:#6f817c;font-size:12px}',
  '.dja-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}',
  '.dja-card{background:#0d1210;border:1px solid #1f2a26;border-radius:4px;overflow:hidden;display:flex;flex-direction:column}',
  '.dja-card.is-hidden{display:none}',
  '.dja-card.is-hit{border-color:#2f7a52;box-shadow:0 0 0 2px rgba(47,122,82,.55)}',
  '.dja-card__hd{padding:8px 10px 7px;border-bottom:1px solid #1b241f;display:flex;flex-direction:column;gap:3px}',
  '.dja-card__name{font-size:13px;color:#e6f4ef;font-weight:600}',
  '.dja-card__id{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#6fb695}',
  '.dja-card__tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}',
  '.dja-tag{font-size:10.5px;line-height:1.5;border-radius:2px;padding:0 5px;border:1px solid #2a3833;color:#8ba39c}',
  '.dja-tag--ok{border-color:#2f6b46;color:#8fe2b6}',
  '.dja-tag--flat{border-color:#6b5a2f;color:#e2cf8f}',
  '.dja-tag--no{border-color:#4a3230;color:#c99a95}',
  '.dja-tag--pixi{border-color:#2f4a6b;color:#8fc4e2}',
  '.dja-tag--mod{border-color:#5a2f6b;color:#cfa2e2}',
  '.dja-tag--van{border-color:#2a3833;color:#7d8f8a}',
  '.dja-tag--danger{border-color:#6b4a2f;color:#f6a329}',
  '.dja-crop{position:relative;overflow:hidden;height:250px;background:#080b0a;cursor:zoom-in}',
  '.dja-card.is-zoom .dja-crop{height:520px}',
  '.dja-pan{position:absolute;left:0;top:0}',
  '.dja-stage{position:relative;width:19.2rem;height:10.8rem;overflow:hidden;color:#cfe0da;font-family:inherit;transform-origin:0 0}',
  '.dja-stage > .screen{position:absolute;inset:0}',
  '.dja-stage > .dja-plain{position:absolute;inset:0;padding:.4rem;display:flex;flex-direction:column;gap:.34rem;align-items:flex-start;overflow:auto;background:#0a0f0d}',
  // 预览要静止：入场 / 飘过 / 脉冲动画会让人看不清元素本身（真实运行时当然照旧）
  '.dja-stage *{animation:none !important}',
  // 预览专用：两条弹幕共用同一条通道（运行时互斥），这里上下错开一格以便同屏看清
  '.dja-stage .sp-bn--game{top:1.62rem}',
  '.dja-stage .sp-cm__row,.dja-stage .sp-bn--game .sp-bn__row{left:.7rem !important}',
  // 预览专用：这些在游戏里是**一次只出现一块**的全屏层（居中 / 铺满 / 贴边），预览里要把它们错开，
  //   否则每一张卡片里都会叠着别人的内容。★ 只在预览页、不改游戏行为（真实运行时它们照旧）。
  '.dja-stage [data-dja-shift="a"]{transform:translate(-4.8rem,-1.9rem)}',
  '.dja-stage [data-dja-shift="b"]{transform:translate(4.8rem,-1.9rem)}',
  '.dja-stage [data-dja-shift="c"]{transform:translate(-4.8rem,2.1rem)}',
  '.dja-stage [data-dja-shift="d"]{transform:translate(4.8rem,2.1rem)}',
  // 这些在游戏里是 fixed（贴视口），在预览里要贴舞台
  '.dja-stage .modal,.dja-stage .toast-host,.dja-stage .spov,.dja-stage .awayov,.dja-stage .tooltip,'
  + '.dja-stage .pbanner,.dja-stage .rdialog,.dja-stage .sp-chat,.dja-stage .sp-chat__tab,.dja-stage .sp-chat__box,'
  + '.dja-stage .sp-sv__fab,.dja-stage .sp-dc__pane,.dja-stage .sp-dc__gear{position:absolute !important}',
  '.dja-stage .sp-dc__gear{left:.22rem;top:1.62rem}',
  // 调试面板在游戏里贴在左下角、按内容撑高；预览里给它一个确定的盒子（否则会横跨整个舞台、盖住聊天面板）
  '.dja-stage .sp-dc__pane{left:.22rem;top:2.2rem;right:auto;bottom:auto;width:5.8rem;height:4.6rem;overflow:auto}',
  '.dja-stage .sp-sv__fab{left:5.8rem;top:.16rem;right:auto;bottom:auto}',
  '.dja-card__meta{padding:8px 10px 10px;font-size:11.5px;color:#8ba39c;display:flex;flex-direction:column;gap:4px}',
  '.dja-card__meta b{color:#a9bdb6;font-weight:600}',
  '.dja-card__sel{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#79c7a1;word-break:break-all}',
  '      + \'<span class="dja-card__note">\' + esc(e.note) + (e.unavailable ? \'　本 Mod 不提供开关：\' + esc(e.unavailable) : "") + "</span>";',
  '.dja-miss{padding:26px 12px;color:#8a6b4a;font-size:12px}',
  '.dja-foot{margin-top:26px;border-top:1px solid #1f2a26;padding-top:12px;color:#6f817c;font-size:12px}',
  '.dja-foot code{background:#111816;border:1px solid #223029;border-radius:3px;padding:0 4px}',
  // ---- 画布示意图（PIXI 层专用，游戏不提供这些样式）----
  '.dja-field{position:absolute;inset:0;background:radial-gradient(60% 55% at 50% 45%,#16211d 0%,#0a0f0d 70%)}',
  '.dja-field__grid{position:absolute;inset:2.2rem 1.2rem 1.6rem;background-image:linear-gradient(rgba(120,190,160,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(120,190,160,.10) 1px,transparent 1px);background-size:1.2rem 1.2rem}',
  '.dja-pixi{position:absolute;display:grid;place-items:center}',
  '.dja-pixi__tag{position:absolute;bottom:-.26rem;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;color:#8fe2b6;background:rgba(6,10,9,.85);border:1px solid #2f6b46;border-radius:2px;padding:0 5px}',
  '.dja-op{width:.62rem;height:1.7rem;border-radius:50% 50% 34% 34%;background:linear-gradient(#9fe8c6,#3f8f6c);box-shadow:0 0 0 1px #0a1412}',
  '.dja-enemy{width:.58rem;height:1.5rem;border-radius:46% 46% 30% 30%;background:linear-gradient(#e8a09f,#8f4644)}',
  '.dja-token{width:.36rem;height:.62rem;border-radius:40% 40% 30% 30%;background:linear-gradient(#a9c8e8,#4a6f8f)}',
  '.dja-device{width:.7rem;height:.7rem;background:linear-gradient(#d8cfa0,#8f8460);border:1px solid #0a1412}',
  '.dja-item{width:.5rem;height:.5rem;background:linear-gradient(#e8d59f,#8f7a44);border:1px solid #0a1412;transform:rotate(45deg)}',
  '.dja-num{font:700 20px ui-monospace,Consolas,monospace;color:#ffd66b;text-shadow:0 1px 2px #000}',
  '.dja-fx{width:1.2rem;height:.6rem;border-radius:50%;background:radial-gradient(circle,rgba(120,220,255,.65),transparent 70%)}',
  '.dja-range{width:2.2rem;height:2.2rem;background:rgba(120,200,255,.20);border:1px solid rgba(150,220,255,.55)}',
  '.dja-bar{position:absolute;left:6%;top:0;width:88%;height:.14rem;background:#1b2420;border:1px solid #2a3a33}',
  '.dja-bar i{display:block;height:100%;background:#5fd39a}',
  '.dja-sp{position:absolute;left:6%;top:.18rem;width:88%;height:.1rem;background:#1b2420;border:1px solid #2a3a33}',
  '.dja-sp i{display:block;height:100%;background:#6cb6e8}',
  '.dja-beam{width:.16rem;height:2rem;background:linear-gradient(rgba(255,190,90,.85),transparent)}',
  '.dja-outrow{position:absolute;left:.4rem;top:.4rem;display:flex;flex-wrap:wrap;gap:.24rem;max-width:18rem}',
  '.dja-outcell{display:flex;flex-direction:column;align-items:flex-start;gap:.06rem;padding:.08rem;border:1px dashed #2a3833;border-radius:2px}',
  '.dja-outlabel{font-size:11px;color:#6f817c}',
].join('\n');

/** 把元素表打包成页面数据（舞台片段单独一份，见 buildHtml 的 dja-stages）。 */
function pageData() {
  // ★ 树只带渲染要用的字段（叶子里的 el 已经是 normalizeEntry 过的记录）
  return { layers: LAYERS, elements: ELEMENTS.map(normalizeEntry), tree: TREE };
}

/** 舞台片段 + 它该嵌在哪一层容器里。 */
function stageHtml(stageKey) {
  const st = STAGES[stageKey] || STAGES.shell;
  if (st.wrap === 'hud') {
    return '<div class="screen gm gm--combat" data-camera="field"><div class="gm__field"></div><div class="gm__hud">'
      + st.html + '</div></div>';
  }
  if (st.wrap === 'plain') return '<div class="dja-plain">' + st.html + '</div>';
  return '<div class="screen gm gm--combat" data-camera="field">' + st.html + '</div>';
}

function buildHtml() {
  const data = pageData();
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  const stagesJson = JSON.stringify(Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [k, stageHtml(k)])))
    .replace(/<\//g, '<\\/');
  const nTotal = ELEMENTS.length;
  const nRot = ELEMENTS.filter((e) => e.rot === 'ok' || e.rot === 'flat' || e.rot === 'pixi').length;
  const nNo = ELEMENTS.filter((e) => e.rot === 'no').length;
  const nMod = ELEMENTS.filter((e) => e.src !== 'vanilla').length;

  const out = [];
  out.push('<!doctype html>');
  out.push('<html lang="zh-CN">');
  out.push('<head>');
  out.push('<meta charset="utf-8" />');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  out.push('<title>cyanfish.dj-all · 局内元素目录与预览</title>');
  out.push('<script>');
  out.push('// 样式已经**全部内联**（见下面三个 <style>）：本页零外部依赖，双击 / 由游戏服务 / 单文件托管都能用。');
  out.push('// 这个对象只是给探针脚本读的（告诉它"样式到位了、来自内联"）。');
  out.push('window.__DJA_CSS__ = { ready: true, base: "inline", ok: ' + GAME_CSS_FILES.length + ', failed: 0 };');
  out.push('</script>');
  out.push('<style id="dja-game-css">');
  out.push(gameCss);
  out.push('');
  out.push('/* ★ 预览的尺寸口径：舞台里的文字尺寸按游戏 body 的默认值算（1rem 已被本页固定成 100px） */');
  out.push('.dja-stage { font-size: calc(.18 * var(--t)); }');
  out.push('</style>');
  out.push('<style id="dja-mod-css">');
  out.push('/* ---- 以下 ' + MOD_CSS_FILES.length + ' 段原样内联自各 Mod 的 client/style.js（预览页要按它们的类名还原外观） ---- */');
  out.push(modCss);
  out.push('</style>');
  // ★★ PAGE_CSS **必须放在最后**：游戏 CSS 里有 `body{overflow:hidden}`（游戏是固定画布、本来就不许滚动），
  //   它与我们同在 body 选择器上 ⇒ 谁在后面谁生效。放在最后才是"本页说了算"。
  out.push('<style id="dja-page-css">');
  out.push(PAGE_CSS);
  out.push('</style>');
  out.push('</head>');
  out.push('<body>');
  out.push('<header class="dja-head">');
  out.push('  <h1>cyanfish.dj-all · 局内元素目录与预览</h1>');
  out.push('  <p>按层级列出战斗屏（<code>#app .screen.gm</code>）里所有可见元素 —— 原版与 Mod 新增都在内。每张卡片是一块'
    + '真实 DOM 舞台（用游戏自己的 CSS 渲染），并按该元素的位置自动裁剪与缩放。点预览可放大。</p>');
  out.push('  <div class="dja-bar">');
  out.push('    <input id="dja-q" type="search" placeholder="按元素名 / id / 选择器 / 来源 过滤（例如：血条 · 设置 · sp-chat · gtop）" autocomplete="off" />');
  out.push('    <span class="dja-chipbar" id="dja-rot">');
  out.push('      <button class="dja-chip is-on" data-rot="all">全部</button>');
  out.push('      <button class="dja-chip" data-rot="ok">可转</button>');
  out.push('      <button class="dja-chip" data-rot="flat">只宜平面内</button>');
  out.push('      <button class="dja-chip" data-rot="no">默认不转</button>');
  out.push('      <button class="dja-chip" data-rot="pixi">画布对象</button>');
  out.push('      <button class="dja-chip" data-rot="mod">只看 Mod 新增</button>');
  out.push('    </span>');
  out.push('    <span class="dja-stat" id="dja-stat"></span>');
  out.push('  </div>');
  out.push('</header>');
  out.push('<div class="dja-wrap">');
  out.push('  <nav class="dja-side" id="dja-side" aria-label="元素层级目录">');
  out.push('    <div class="dja-side__hd">层级目录<span class="dja-side__note">点分组名 = 只看这一组；点元素名 = 跳到它的卡片</span></div>');
  out.push('    <div id="dja-tree"></div>');
  out.push('  </nav>');
  out.push('  <main class="dja-main" id="dja-main"></main>');
  out.push('</div>');
  out.push('<script id="dja-data" type="application/json">' + json + '</script>');
  out.push('<script id="dja-stages" type="application/json">' + stagesJson + '</script>');
  out.push('<script>');
  out.push(RENDER_JS);
  out.push('</script>');
  out.push('</body>');
  out.push('</html>');
  out.push('');

  return { html: out.join('\n'), nTotal, nRot, nNo, nMod };
}

// ==================================================================================================
// 页面脚本（纯 classic script：file:// 下也能跑）
// ==================================================================================================
const RENDER_JS = [
  '(function () {',
  '  var DATA = JSON.parse(document.getElementById("dja-data").textContent);',
  '  var STAGESV = JSON.parse(document.getElementById("dja-stages").textContent);',
  '  var LAYER = {}; for (var i = 0; i < DATA.layers.length; i++) LAYER[DATA.layers[i].id] = DATA.layers[i];',
  '  var ROT = { ok: "可转（轴转 / 平面内）", flat: "只宜平面内", no: "默认不转", pixi: "画布对象（引擎接管）" };',
  '  var ROTCLS = { ok: "dja-tag--ok", flat: "dja-tag--flat", no: "dja-tag--no", pixi: "dja-tag--pixi" };',
  '  var main = document.getElementById("dja-main");',
  '  var cards = [], byId = {};',
  '',
  '  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }',
  '',
  '  // ---- 卡片（每层一段）--------------------------------------------------------------------------',
  '  var groups = [];',
  '  for (var li = 0; li < DATA.layers.length; li++) {',
  '    var L = DATA.layers[li];',
  '    var items = DATA.elements.filter(function (e) { return e.layer === L.id; });',
  '    if (!items.length) continue;',
  '    groups.push({ L: L, items: items });',
  '  }',
  '  var frag = document.createDocumentFragment();',
  '  for (var gi = 0; gi < groups.length; gi++) {',
  '    var g = groups[gi];',
  '    var sec = document.createElement("section"); sec.className = "dja-layer"; sec.dataset.layer = g.L.id;',
  '    var h2 = document.createElement("h2"); h2.textContent = g.L.name + " · " + g.items.length;',
  '    var p = document.createElement("p"); p.textContent = g.L.desc;',
  '    sec.appendChild(h2); sec.appendChild(p);',
  '    var grid = document.createElement("div"); grid.className = "dja-grid";',
  '    for (var ei = 0; ei < g.items.length; ei++) grid.appendChild(makeCard(g.items[ei]));',
  '    sec.appendChild(grid);',
  '    frag.appendChild(sec);',
  '  }',
  '  main.appendChild(frag);',
  '',
  '  function makeCard(e) {',
  '    var card = document.createElement("article");',
  '    card.className = "dja-card";',
  '    card.dataset.el = e.id; card.dataset.rot = e.rot; card.dataset.src = e.src;',
  '    card.dataset.search = (e.id + " " + e.name + " " + e.sel + " " + e.src + " " + ROT[e.rot] + " " + e.note).toLowerCase();',
  '',
  '    var hd = document.createElement("header"); hd.className = "dja-card__hd";',
  '    hd.innerHTML = \'<span class="dja-card__name">\' + esc(e.name) + \'</span>\'',
  '      + \'<span class="dja-card__id">\' + esc(e.id) + \'</span>\'',
  '      + \'<span class="dja-card__tags">\'',
  '      + \'<span class="dja-tag \' + (ROTCLS[e.rot] || "") + \'">\' + esc(ROT[e.rot] || e.rot) + "</span>"',
  '      + \'<span class="dja-tag \' + (e.src === "vanilla" ? "dja-tag--van" : "dja-tag--mod") + \'">\' + esc(e.src === "vanilla" ? "原版" : e.src) + "</span>"',
  '      + \'<span class="dja-tag">\' + esc(e.count === "n" ? "一屏多个（各自独立）" : "单件") + "</span>"',
  '      + (e.global ? \'<span class="dja-tag">战斗屏之外（运行时门控）</span>\' : "")',
  '      + (e.danger ? \'<span class="dja-tag dja-tag--danger">⚠ 危险元素（切档要二次确认）</span>\' : "")',
  '      + (e.unavailable ? \'<span class="dja-tag">本 Mod 不提供开关</span>\' : "")',
  '      + "</span>";',
  '    card.appendChild(hd);',
  '',
  '    var crop = document.createElement("div"); crop.className = "dja-crop";',
  '    var pan = document.createElement("div"); pan.className = "dja-pan";',
  '    var stage = document.createElement("div"); stage.className = "dja-stage";',
  '    stage.innerHTML = STAGESV[e.stage] || STAGESV.shell;',
  '    pan.appendChild(stage); crop.appendChild(pan);',
  '    card.appendChild(crop);',
  '',
  '    var meta = document.createElement("div"); meta.className = "dja-card__meta";',
  '    meta.innerHTML = \'<span><b>选择器</b> \' + (e.sel ? \'<span class="dja-card__sel">\' + esc(e.sel) + "</span>" : \'<span class="dja-card__sel">（画布对象，无 DOM 选择器）</span>\') + "</span>"',
  '      + \'<span><b>层级</b> \' + esc((LAYER[e.layer] || {}).name || e.layer) + (e.path ? " › " + esc(e.path) : "") + "</span>"',
  '      + \'<span class="dja-card__note">\' + esc(e.note) + "</span>";',
  '    card.appendChild(meta);',
  '',
  '    crop.addEventListener("click", function () { card.classList.toggle("is-zoom"); fit(card); });',
  '    cards.push({ el: card, e: e, stage: stage, crop: crop, pan: pan, pick: e.pick || "" });',
  '    byId[e.id] = card;',
  '    return card;',
  '  }',
  '',
  '  /** 量出目标元素在舞台里的位置，把视窗裁到它附近并缩放（不需要手写坐标）。 */',
  '  function fit(rec) {',
  '    var stage = rec.stage, crop = rec.crop, pan = rec.pan;',
  '    stage.style.transform = "";',
  '    pan.style.left = "0px"; pan.style.top = "0px";',
  '    var sb = stage.getBoundingClientRect();',
  '    if (!sb.width) return;',
  '    var t = null;',
  '    if (rec.pick) { try { t = stage.querySelector(rec.pick) || stage.querySelectorAll(rec.pick)[0] || null; } catch (err) { t = null; } }',
  '    var tb = t ? t.getBoundingClientRect() : sb;',
  '    if (!tb.width && !tb.height) tb = sb;',
  '    var pad = 0.10 * 100;                                  // rem -> px（根字号 100px）',
  '    var x = tb.left - sb.left - pad, y = tb.top - sb.top - pad;',
  '    var w = tb.width + pad * 2, h = tb.height + pad * 2;',
  '    if (w < 26) { x -= (26 - w) / 2; w = 26; }',
  '    if (h < 26) { y -= (26 - h) / 2; h = 26; }',
  '    // 大块元素（整条顶栏 / 商店条 / 满宽弹幕…）按比例缩完就太小了 ⇒ 裁到它自己的**中间**一块',
  '    var MAXW = 1200, MAXH = 600;',
  '    if (w > MAXW) { x += (w - MAXW) / 2; w = MAXW; }',
  '    if (h > MAXH) { y += (h - MAXH) / 2; h = MAXH; }',
  '    x = Math.max(0, Math.min(x, sb.width - 1)); y = Math.max(0, Math.min(y, sb.height - 1));',
  '    w = Math.min(w, sb.width - x); h = Math.min(h, sb.height - y);',
  '    var cw = crop.clientWidth, ch = crop.clientHeight;',
  '    var s = Math.min(cw / w, ch / h, 6);',
  '    stage.style.transformOrigin = "0 0";',
  '    stage.style.transform = "scale(" + s + ") translate(" + (-x) + "px," + (-y) + "px)";',
  '    pan.style.left = Math.round((cw - w * s) / 2) + "px";',
  '    pan.style.top = Math.round((ch - h * s) / 2) + "px";',
  '  }',
  '',
  '  function fitAll() { for (var i = 0; i < cards.length; i++) { try { fit(cards[i]); } catch (err) {} } }',
  '',
  '  // ---- ★★ 层级目录树（可展开）------------------------------------------------------------------',
  '  var NODE = {}, MEMBERS = {};',
  '  (function walk(ns) {',
  '    for (var i = 0; i < ns.length; i++) {',
  '      var n = ns[i]; NODE[n.id] = n; MEMBERS[n.id] = n.memberIds || [];',
  '      if (n.children) walk(n.children);',
  '    }',
  '  })(DATA.tree || []);',
  '',
  '  var treeBox = document.getElementById("dja-tree");',
  '  var filterBar = null;',
  '  var treeFilter = null;                          // 当前"只看哪一组"的节点 id',
  '',
  '  function treeDom(nodes, depth) {',
  '    var box = document.createElement("div");',
  '    for (var i = 0; i < nodes.length; i++) {',
  '      var n = nodes[i];',
  '      if (n.kind === "leaf") {',
  '        var lf = document.createElement("div");',
  '        lf.className = "dja-t-leaf";',
  '        lf.dataset.node = n.id; lf.dataset.leaf = n.el.id;',
  '        lf.innerHTML = esc(n.name) + \'<span class="dja-t-meta">\' + esc(n.el.id) + "</span>";',
  '        lf.title = n.el.id + "\\n" + (n.sel || "（画布对象）") + "\\n" + n.el.note;',
  '        lf.addEventListener("click", function (ev) { gotoLeaf(ev.currentTarget.dataset.leaf); });',
  '        box.appendChild(lf);',
  '        continue;',
  '      }',
  '      var d = document.createElement("details");',
  '      if (depth <= 1) d.open = true;                      // 层与一级分组默认展开；叶子层收起',
  '      var s = document.createElement("summary");',
  '      s.className = n.kind === "layer" ? "dja-t-g" : "";',
  '      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = n.name;',
  '      var ct = document.createElement("span"); ct.className = "dja-t-meta"; ct.textContent = n.memberIds.length;',
  '      var pk = document.createElement("span"); pk.className = "dja-t-pick"; pk.textContent = "◎";',
  '      pk.title = "只看这一组（" + n.memberIds.length + " 个元素）";',
  '      var picker = function (node) { return function (ev) { ev.preventDefault(); ev.stopPropagation(); setTreeFilter(node.id); }; };',
  '      nm.addEventListener("click", picker(n));',
  '      ct.addEventListener("click", picker(n));',
  '      pk.addEventListener("click", picker(n));',
  '      s.appendChild(nm); s.appendChild(ct); s.appendChild(pk);',
  '      d.appendChild(s);',
  '      var body = document.createElement("div"); body.className = "dja-t-body";',
  '      body.appendChild(treeDom(n.children, depth + 1));',
  '      d.appendChild(body);',
  '      box.appendChild(d);',
  '    }',
  '    return box;',
  '  }',
  '',
  '  function setTreeFilter(id) {',
  '    treeFilter = id;',
  '    renderFilterBar();',
  '    apply();',
  '    var n = NODE[id];',
  '    if (n && n.memberIds.length) gotoLeaf(n.memberIds[0], true);',
  '  }',
  '',
  '  function renderFilterBar() {',
  '    if (filterBar) { filterBar.parentNode.removeChild(filterBar); filterBar = null; }',
  '    var old = document.getElementById("dja-fbar"); if (old) old.parentNode.removeChild(old);',
  '    if (!treeFilter) return;',
  '    var n = NODE[treeFilter]; if (!n) return;',
  '    var bar = document.createElement("div"); bar.className = "dja-filterbar"; bar.id = "dja-fbar";',
  '    bar.innerHTML = \'只看：<b>\' + esc(n.name) + \'</b>\' + (n.kind === "leaf" ? "" : "（" + n.memberIds.length + " 个元素）")',
  '      + \' \\u00b7 \' + (n.sel ? \'<code style="color:#7fd0ad">\' + esc(n.sel.slice(0, 90)) + (n.sel.length > 90 ? "…" : "") + "</code>" : "（画布对象）");',
  '    var b = document.createElement("button"); b.type = "button"; b.textContent = "× 显示全部";',
  '    b.addEventListener("click", function () { setTreeFilter(null); });',
  '    bar.appendChild(b);',
  '    main.insertBefore(bar, main.firstChild);',
  '  }',
  '',
  '  /** 跳到某个元素的卡片并高亮（必要时先清掉"只看某组"的筛选）。 */',
  '  function gotoLeaf(id, silent) {',
  '    var card = byId[id]; if (!card) return;',
  '    if (treeFilter && MEMBERS[treeFilter] && MEMBERS[treeFilter].indexOf(id) < 0) setTreeFilter(null);',
  '    card.classList.remove("is-hidden");',
  '    try { card.scrollIntoView({ block: "center", behavior: silent ? "auto" : "smooth" }); } catch (e) { card.scrollIntoView(); }',
  '    card.classList.add("is-hit");',
  '    setTimeout(function () { card.classList.remove("is-hit"); }, 1800);',
  '    var lf = document.querySelector(\'.dja-t-leaf[data-leaf="\' + id + \'"]\');',
  '    var all = document.querySelectorAll(".dja-t-leaf.is-sel");',
  '    for (var i = 0; i < all.length; i++) all[i].classList.remove("is-sel");',
  '    if (lf) lf.classList.add("is-sel");',
  '  }',
  '',
  '  treeBox.appendChild(treeDom(DATA.tree || [], 0));',
  '',
  '  // ---- 检索 / 过滤 -----------------------------------------------------------------------------',
  '  var q = document.getElementById("dja-q");',
  '  var rotBar = document.getElementById("dja-rot");',
  '  var stat = document.getElementById("dja-stat");',
  '  var rotFilter = "all";',
  '  function apply() {',
  '    var kw = (q.value || "").trim().toLowerCase();',
  '    var mem = treeFilter && MEMBERS[treeFilter] ? MEMBERS[treeFilter] : null;',
  '    var shown = 0;',
  '    for (var i = 0; i < cards.length; i++) {',
  '      var c = cards[i], e = c.e;',
  '      var okQ = !kw || c.el.dataset.search.indexOf(kw) >= 0;',
  '      var okR = rotFilter === "all" ? true',
  '        : rotFilter === "mod" ? e.src !== "vanilla"',
  '          : e.rot === rotFilter;',
  '      var okT = !mem || mem.indexOf(e.id) >= 0;',
  '      var show = okQ && okR && okT;',
  '      c.el.classList.toggle("is-hidden", !show);',
  '      if (show) shown++;',
  '    }',
  '    var secs = document.querySelectorAll(".dja-layer");',
  '    for (var s2 = 0; s2 < secs.length; s2++) {',
  '      var any = secs[s2].querySelector(".dja-card:not(.is-hidden)");',
  '      secs[s2].style.display = any ? "" : "none";',
  '    }',
  '    stat.textContent = "显示 " + shown + " / " + cards.length + " 个元素"',
  '      + (treeFilter ? "（只看 " + (NODE[treeFilter] || {}).name + "）" : "");',
  '  }',
  '  q.addEventListener("input", apply);',
  '  rotBar.addEventListener("click", function (ev) {',
  '    var b = ev.target.closest ? ev.target.closest(".dja-chip") : null;',
  '    if (!b) return;',
  '    rotFilter = b.dataset.rot;',
  '    var all = rotBar.querySelectorAll(".dja-chip");',
  '    for (var i = 0; i < all.length; i++) all[i].classList.toggle("is-on", all[i] === b);',
  '    apply();',
  '  });',
  '',
  '  function boot() { fitAll(); apply(); }',
  '  function whenCss(cb) {',
  '    var n = 0;',
  '    (function poll() {',
  '      if (window.__DJA_CSS__ && window.__DJA_CSS__.ready) return cb();',
  '      if (++n > 120) return cb();                 // 6 s 上限：实在拿不到样式也要把内容画出来',
  '      setTimeout(poll, 50);',
  '    })();',
  '  }',
  '  if (document.readyState === "complete") whenCss(boot);',
  '  else window.addEventListener("load", function () { whenCss(boot); });',
  '  setTimeout(function () { try { boot(); } catch (e) {} }, 2500);',
  '  var rt = 0;',
  '  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(fitAll, 120); });',
  '})();',
].join('\n');

// ==================================================================================================
// ELEMENTS.md
// ==================================================================================================
function buildMd(stats) {
  const L = [];
  L.push('# 局内元素目录（`cyanfish.dj-all`）');
  L.push('');
  L.push('> ★ 本文件由 `tools/build-catalog.mjs` 从 `client/elements.js` **生成** —— 要改内容就改那份元素表，然后重跑：');
  L.push('> `node mods/cyanfish.dj-all/tools/build-catalog.mjs`。');
  L.push('> 配套的可视化预览页 = `catalog.html`（服务端从 `/mods/cyanfish.dj-all/catalog.html` 打开，或直接双击文件）。');
  L.push('');
  L.push('## 0. 三十秒速览');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('|---|---|');
  L.push('| 元素总数 | **' + stats.nTotal + '** |');
  L.push('| 可转（`ok` + `flat` + `pixi`） | **' + stats.nRot + '** |');
  L.push('| 默认不转（`no`） | **' + stats.nNo + '** |');
  L.push('| 其中 Mod 新增 | **' + stats.nMod + '** |');
  L.push('| 层级 | **' + LAYERS.length + '** 层 |');
  L.push('');
  L.push('**可旋转性四档**（`rot`）：');
  L.push('');
  L.push('| 值 | 含义 | 为什么 |');
  L.push('|---|---|---|');
  L.push('| `ok` | 与其它元素一视同仁（绕竖直轴 / 平面内都行） | 形状对称或本来就是图形，压扁不损失信息 |');
  L.push('| `flat` | **只宜平面内旋转** | 里面是要读的文字 / 细长条：绕竖直轴压窄到 0 宽时读不出来 |');
  L.push('| `no` | **默认不转** | 详情窗格 / 弹窗 / 输入框 / 唯一入口键这类"要读要点的功能面"（dj-models 从 v1.3.0 起立的规矩） |');
  L.push('| `pixi` | 画布对象 | 不是 DOM：引擎改 PIXI 容器的 transform，不走 CSS |');
  L.push('');
  L.push('★ `no` 是**默认值**不是硬禁：控制页会给每个元素一个开关，但出厂默认按这里的判定走。');
  L.push('');
  L.push('---');
  L.push('');

  // ★ 按**层级树**输出（与页面左侧那份目录同源）：层 → 分组 → 元素；并给出树节点的稳定 id
  //   （`L:<层>` / `G:<层>/<组>` / `E:<元素 id>`）—— 那是后续"设置页选中元素或元素集合"要用的键。
  const mdRow = (it) => {
    const src = it.src === 'vanilla' ? '原版' : it.src;
    const cnt = it.count === 'n' ? '一屏多个（各自独立）' : '单件';
    const sel = it.sel ? '`' + it.sel + '`' + (it.global ? '（战斗屏之外）' : '') : '—（画布对象）';
    return '| `' + it.id + '` | ' + (it.danger ? '⚠ ' : '') + it.name + ' | ' + sel + ' | ' + src + ' | ' + cnt + ' | ' + ROT_TEXT[it.rot] + ' | '
      + String(it.note).replace(/\|/g, '\\|')
      + (it.unavailable ? ' **（本 Mod 不提供开关：' + String(it.unavailable).replace(/\|/g, '\\|') + '）**' : '') + ' |';
  };
  const HEAD = ['| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |', '|---|---|---|---|---|---|---|'];

  L.push('## 1. 层级目录（可展开的那棵树）');
  L.push('');
  L.push('> 页面左侧那一栏就是它。**节点 id 是稳定键**：后续在「模组设置」里"选中某个元素或某个元素集合"存参数时，');
  L.push('> 存的就是这些 id（`L:` 层 / `G:` 组 / `E:` 元素）。选**组** = 对集合一次性配置；选**元素** = 单独配置。');
  L.push('');
  L.push('| 节点 id | 名称 | 含元素 | 集合选择器（该组所有元素的选择器并集，截断） |');
  L.push('|---|---|---|---|');
  for (const ln of TREE) {
    L.push('| `' + ln.id + '` | **' + ln.name + '** | ' + ln.leafCount + ' | `' + String(ln.sel).slice(0, 110) + (String(ln.sel).length > 110 ? '…' : '') + '` |');
    for (const c of ln.children) {
      if (c.kind !== 'group') continue;
      L.push('| `' + c.id + '` | ↳ ' + c.name + ' | ' + c.leafCount + ' | `' + String(c.sel).slice(0, 110) + (String(c.sel).length > 110 ? '…' : '') + '` |');
    }
  }
  L.push('');
  L.push('---');
  L.push('');

  L.push('## 2. 逐元素表（按上面那棵树分组）');
  L.push('');
  for (const ln of TREE) {
    L.push('### ' + ln.name + '（' + ln.leafCount + ' 个）');
    L.push('');
    L.push('> 层节点 `' + ln.id + '`' + (ln.desc ? ' · ' + ln.desc : ''));
    L.push('');
    for (const c of ln.children) {
      if (c.kind === 'leaf') {
        L.push(...HEAD.slice(), mdRow(c.el), '');
        continue;
      }
      L.push('#### ' + c.name + '（' + c.leafCount + ' 个）· 组节点 `' + c.id + '`');
      L.push('');
      L.push(...HEAD.slice());
      for (const k of c.children) L.push(mdRow(k.el));
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push('## 附 A · 选择器的口径');
  L.push('');
  L.push('* 表里的 `sel` **一律相对战斗屏根** `#app .screen.gm`（控制页在装的时候会自动加这个前缀）。');
  L.push('* 唯一的例外是标了「战斗屏之外」的 `hint.toast`：宿主把 `.toast-host` 挂在 app 根上，与战斗屏同级 ⇒');
  L.push('  它靠"现在在不在战斗中"做**运行时门控**（与 dj-models 的 `global: true` 同口径）。');
  L.push('* `shell.screen` 自带 `#app` 前缀（它自己就是那一层）。');
  L.push('');
  L.push('## 附 B · 已知没有纳入清单的东西（如实登记）');
  L.push('');
  L.push('1. **`fx.pops`**（升格 / 入场提示的 `BitmapText`，`public/js/render/fx/arrivals.js:95`）——');
  L.push('   dj-models 时代就"不在任何分组里"，本目录同样不列它；要纳进来得先给它一个引擎分组。');
  L.push('2. **光束（`fx.beams`）**：列进清单但**标了不做**（几何每帧以屏幕绝对坐标重画，容器上没有可旋转的局部坐标系）。');
  L.push('3. **3D 底盘下的装置箱体**：句柄被 `scene.createDevice` 的闭包藏着（`h.mesh` 恒 `null`），抓不到。');
  L.push('4. **官方美术相关**：本机没有 `public/assets`，预览里的立绘 / 头像 / 盟约图标一律走组件的兜底字形 ——');
  L.push('   这是"预览的缺图"，不是结构差异。');
  L.push('');
  L.push('## 附 C · 怎么复核这份清单');
  L.push('');
  L.push('```');
  L.push('# ① 元素表里凡是非空的 sel，都应该能在运行中的战斗屏里命中：');
  L.push('#    打开一局 → 控制台粘贴（结果里 count=0 的就是"当时不在场上"，或选择器过期了）');
  L.push('await import("/mods/cyanfish.dj-all/client/elements.js").then(m => {');
  L.push('  const root = document.querySelector("#app .screen.gm") || document;');
  L.push('  const rows = m.ELEMENTS.filter(e => e.sel).map(e => [e.id, e.global ? 0 : root.querySelectorAll(e.sel).length]);');
  L.push('  console.table(rows.filter(r => !r[1]).map(r => ({ id: r[0], count: r[1] })));');
  L.push('});');
  L.push('```');
  L.push('');
  L.push('> 或者直接用本 Mod 的自省句柄：`__SP_DJALL__.audit()`（见 `README.md`）。');
  L.push('');
  return L.join('\n');
}

// ==================================================================================================
// main
// ==================================================================================================
const built = buildHtml();
fs.writeFileSync(path.join(MOD_DIR, 'catalog.html'), built.html, 'utf8');
fs.writeFileSync(path.join(MOD_DIR, 'ELEMENTS.md'), buildMd(built), 'utf8');
console.log('✓ 生成 catalog.html  ' + (built.html.length / 1024).toFixed(1) + ' KB');
console.log('✓ 生成 ELEMENTS.md   ' + (fs.statSync(path.join(MOD_DIR, 'ELEMENTS.md')).size / 1024).toFixed(1) + ' KB');
console.log('  元素 ' + built.nTotal + ' 个（可转 ' + built.nRot + ' · 默认不转 ' + built.nNo + ' · Mod 新增 ' + built.nMod + '）');
console.log('  内联 Mod CSS ' + (modCss.length / 1024).toFixed(1) + ' KB（来自 ' + MOD_CSS_FILES.length + ' 个 client/style.js）');
