// mods/cyanfish.dj-all/client/engine-dom.js — **DOM 侧引擎**：把配置编译成一份 `<style>`，注入 / 摘掉。
//
// ============================ 设计（为什么这么写） ============================
// ★★ **纯 CSS，不碰宿主 DOM**：本引擎只往 `<head>` 里加**一个** `<style>` 节点，别的一概不动 ——
//    不给元素加 class、不写内联样式、不绑事件。于是：
//      · 关掉 / 卸载 ⇒ 摘掉这**一个**节点，页面回到"没装过这个 Mod"的状态（零残留是**结构上**保证的，
//        不依赖"把加过的 class 一个个扫回来"）；
//      · 宿主的任何一次重渲染都不会把我们的效果冲掉（没有需要重打的标记）。
//    ★ 代价（如实登记）：**没有逐元素错相** —— 同一个元素（一个选择器命中的那几个）相位完全同步。
//      逐元素错相要往每个元素上写 inline `animation-delay`（那是 dj-models 的做法），
//      代价是"必须周期性重扫 DOM"，与他"零痕迹"这条比，本轮先不要。
//
// ★★ **两条独立动画**：CSS 里"旋转"与"压缩"抢同一条 `transform`，一条 keyframes 服务两个周期
//    就只能取两者的最小公倍数（帧数一大就退化成抽搐）。所以用注册自定义属性 + 两条动画
//    （`@property` 自 Chrome 85 / Edge 85 / Safari 16.4 起可用；比"独立 rotate:/scale: 属性"兼容面更宽）。
//
// ★★ **角度硬上限 60°**：轴转在正交投影下的投影宽度 = 宽度 × |cos θ|；θ = 90° 时归零 ⇒ 那一刻点不到。
//    夹在 60° ⇒ 最窄仍有 **50%** 宽 ⇒ **任何相位都点得开设置**。这条是 `dj-models` 从 v1.3.0 起立的规矩，
//    本 Mod 沿用（危险元素另有"切档二次确认"，见 §panels）。
//
// ★ 退出条件（任一命中就整体摘掉 style）：总配置没有任何启用项 / 命中 `prefers-reduced-motion: reduce`。

import { framesToSec } from './config.js';

/** 注入的 `<style>` 的 id（也是验收里"在不在"的判据）。 */
export const STYLE_ID = 'sp-dja-dom-style';
/** 挂在 `<html>` 上的作用域根 class（所有选择器都带它，避免影响页面里其它同名类）。 */
export const ROOT_CLASS = 'sp-dja';
/** 战斗屏根选择器（"战斗中的 UI"的判据）。 */
export const MATCH_ROOT_SEL = '#app .screen.gm';
/** 轴转 / 平面内旋转的**角度硬上限**（度）。 */
export const MAX_DEG = 60;
/** keyframes 的停靠点数（8 段 ⇒ 0/12.5/…/100%，够表现正弦且不让 CSS 变胖）。 */
export const STOP_N = 8;
/** 三个注册自定义属性的名字（都带 `sp-dja-` 前缀，不可能和宿主撞）。 */
export const VAR_R = '--sp-dja-r';
export const VAR_SX = '--sp-dja-sx';
export const VAR_SY = '--sp-dja-sy';

const TAU = Math.PI * 2;
const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 帧 → CSS 时长字符串（精确到帧：秒 = 帧 / 60）。 */
export function durSec(frames) {
  const f = Math.max(1, Math.round(Number(frames) || 0));
  return (f / 60).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + 's';
}

/** 归一化时间 u ∈ [0,1] → keyframes 的百分比选择器。 */
function pctAt(u) { return String(+(u * 100).toFixed(4)) + '%'; }

/** 本帧的旋转角（度）：θ(u) = A·sin(2πu)。★ |θ| ≤ A ≤ MAX_DEG 恒成立。 */
export function angleAt(u, deg) {
  const A = clampNum(deg == null ? MAX_DEG : deg, 0, MAX_DEG);
  const x = u - Math.floor(u);
  return A * Math.sin(TAU * x);
}

/** 归一化压缩深度 s ∈ [0,1]（0 = 原高，1 = 压到最低）。 */
export function depthAt(u) {
  const x = u - Math.floor(u);
  return 0.5 - 0.5 * Math.cos(TAU * x);
}

/** 旋转那条 keyframes 的停靠点（8 个正弦采样）。 */
function rotStops(deg) {
  const out = [];
  for (let k = 0; k <= STOP_N; k++) out.push(pctAt(k / STOP_N) + '{' + VAR_R + ':' + angleAt(k / STOP_N, deg).toFixed(3) + 'deg}');
  return out.join('');
}

/**
 * 压缩那条 keyframes 的停靠点（8 个余弦采样）。
 * ★ 在 u = 0.5（压缩最低点）取到的就是**面板上的设定值本身**：
 *   `scaleY = squashMinPct/100`、`scaleX = widthMaxPct/100` ⇒ 面板里的百分比就是屏幕上量得到的百分比。
 */
function sqStops(minPct, maxPct) {
  const M = clampNum(Number(minPct) / 100, 0.05, 1);
  const W = clampNum(Number(maxPct) / 100, 1, 2);
  const out = [];
  for (let k = 0; k <= STOP_N; k++) {
    const s = depthAt(k / STOP_N);
    out.push(pctAt(k / STOP_N) + '{' + VAR_SX + ':' + (1 + (W - 1) * s).toFixed(4) + ';'
      + VAR_SY + ':' + (1 - (1 - M) * s).toFixed(4) + '}');
  }
  return out.join('');
}

/** 一组参数的指纹（相同的参数共用同一对 keyframes）。 */
function fpOf(v) {
  return [v.spinMode, v.spinPeriod, v.squashPeriod, v.squashMinPct, v.widthMaxPct].join('|');
}

/**
 * 把一个选择器逐项加上作用域前缀。
 * ★ 必须**逐项**拼 —— 只在整个字符串末尾拼前缀的话，逗号列表里只有最后一个分支带前缀（真机踩过）。
 */
export function scopeSel(sel, rootClass = ROOT_CLASS, prefix = MATCH_ROOT_SEL + ' ') {
  return String(sel).split(',').map((s) => 'html.' + rootClass + ' ' + prefix + s.trim()).join(',');
}

/**
 * 把"作用项"编译成整份 CSS（**纯函数**，便于单测与报告复算）。
 * @param {Array<{id:string, sel:string, vals:any, mode:string}>} items
 * @param {{ globalScope?: boolean }} [opts]
 * @returns {string}
 */
export function buildCss(items, opts) {
  const list = (items || []).filter((it) => it && it.sel);
  const parts = [];
  parts.push('/* cyanfish.dj-all · DOM 侧（只绕自身中心，无倾斜 / 无透视 / 无位移） */');
  parts.push('/* 作用项 ' + list.length + ' 个 · 角度硬上限 ' + MAX_DEG + '°（最窄仍有 ' + (Math.cos(MAX_DEG * Math.PI / 180) * 100).toFixed(1) + '% 宽 ⇒ 任何相位都点得开设置） */');
  if (!list.length) return parts.join('\n');
  // ---- 注册自定义属性（可插值；inherits:false ⇒ 不会渗到子元素）----
  parts.push('@property ' + VAR_R + '{syntax:"<angle>";inherits:false;initial-value:0deg}');
  parts.push('@property ' + VAR_SX + '{syntax:"<number>";inherits:false;initial-value:1}');
  parts.push('@property ' + VAR_SY + '{syntax:"<number>";inherits:false;initial-value:1}');
  // ---- 按"参数指纹"生成 keyframes（同参数的多个元素共用一对）----
  const fpIndex = new Map();
  const kf = [];
  for (const it of list) {
    const fp = fpOf(it.vals);
    if (fpIndex.has(fp)) continue;
    const i = fpIndex.size;
    fpIndex.set(fp, i);
    kf.push('@keyframes sp-dja-r' + i + '{' + rotStops(MAX_DEG) + '}');
    kf.push('@keyframes sp-dja-q' + i + '{' + sqStops(it.vals.squashMinPct, it.vals.widthMaxPct) + '}');
  }
  parts.push(kf.join('\n'));
  // ---- 逐个作用项一条规则 ----
  const rules = [];
  for (const it of list) {
    const i = fpIndex.get(fpOf(it.vals));
    const axis = it.vals.spinMode !== 'flat';
    const scope = it.global === true ? '' : MATCH_ROOT_SEL + ' ';
    const tf = axis
      ? 'transform:rotateY(var(' + VAR_R + ')) scale(var(' + VAR_SX + '),var(' + VAR_SY + '));'
      : 'transform:rotate(var(' + VAR_R + ')) scale(var(' + VAR_SX + '),var(' + VAR_SY + '));';
    const anim = 'animation:sp-dja-r ' + durSec(it.vals.spinPeriod) + ' linear infinite,'
      + 'sp-dja-q ' + durSec(it.vals.squashPeriod) + ' linear infinite;';
    rules.push('/* ' + it.id + ' */\n' + scopeSel(it.sel, ROOT_CLASS, scope) + '{'
      + 'transform-origin:50% 50%;' + tf + anim + 'will-change:transform}');
  }
  parts.push(rules.join('\n'));
  // ---- 双保险：系统要求"减少动态效果"时立刻停 ----
  parts.push('@media (prefers-reduced-motion: reduce){html.' + ROOT_CLASS + ' .' + 'sp-dja-any{animation:none !important}}');
  return parts.join('\n');
}

/** 系统的"减少动态效果"偏好（拿不到 matchMedia 就当作 false）。 */
function reducedMotion(win) {
  try {
    const mq = win && win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!(mq && mq.matches);
  } catch { return false; }
}

/**
 * 造一个 DOM 引擎。`sync(items)` 幂等：想开就装、想关就全撤。
 * @param {{ getItems: () => any[], log?: any, doc?: any, win?: any }} opts
 *        `getItems()` 直接返回 `compile(cfg, tree)` 里 `sel !== ''` 的那些项（调用方负责过滤）。
 */
export function createDomEngine({ getItems, log = null, doc = globalThis.document, win = globalThis } = {}) {
  let styleEl = null;
  let styleText = '';
  let rootEl = null;
  let disposed = false;
  const stats = { active: false, items: 0, cssLen: 0, injected: false, reduced: false, errors: 0, lastSync: 0 };

  const unstyle = () => {
    try { if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); } catch { stats.errors++; }
    styleEl = null; styleText = '';
    try { if (rootEl) rootEl.classList.remove(ROOT_CLASS); } catch { stats.errors++; }
    rootEl = null;
    stats.active = false; stats.injected = false; stats.cssLen = 0; stats.items = 0;
  };

  return {
    /** 把当前配置搬到 DOM 上（幂等）。 */
    sync() {
      if (disposed || !doc) return this.stats();
      let items = [];
      try { items = getItems() || []; } catch (e) { stats.errors++; log?.warn?.('[cyanfish.dj-all] 取作用项失败（已忽略）', e); }
      const red = reducedMotion(win);
      stats.reduced = red;
      if (!items.length || red) { if (styleEl || rootEl) unstyle(); return this.stats(); }
      try {
        if (!styleEl) {
          styleEl = doc.getElementById(STYLE_ID);
          if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = STYLE_ID;
            (doc.head || doc.documentElement).appendChild(styleEl);
          }
        }
        const css = buildCss(items);
        // ★ 只有文本真的变了才写（写 textContent 会重建 CSSOM ⇒ 正在跑的动画会重启动、跳相位）
        if (styleText !== css) { styleEl.textContent = css; styleText = css; }
        rootEl = doc.documentElement;
        rootEl.classList.add(ROOT_CLASS);
        stats.active = true; stats.injected = true; stats.items = items.length;
        stats.cssLen = css.length; stats.lastSync = Date.now();
      } catch (e) {
        stats.errors++;
        log?.warn?.('[cyanfish.dj-all] DOM 注入失败（已整体回退）', e);
        unstyle();
      }
      return this.stats();
    },
    stats() { return { ...stats }; },
    /** 当前会注入的 CSS 原文（报告 / 排错 / 验收用；不注入）。 */
    css() { let items = []; try { items = getItems() || []; } catch { /* ignore */ } return buildCss(items); },
    /** 卸载：摘掉 `<style>` 与根 class（DOM 一个字节都没被我们改过）。 */
    dispose() {
      if (disposed) return;
      disposed = true;
      unstyle();
    },
  };
}
