// mods/cyanfish.dj-all/client/engine-dom.js — **DOM 侧引擎**：把配置编译成一份 `<style>`，注入 / 摘掉。
//
// ============================ 设计（为什么这么写） ============================
// ★★ **纯 CSS，不碰宿主 DOM**：本引擎只往 `<head>` 里加**一个** `<style>` 节点，别的一概不动 ——
//    不给元素加 class、不写内联样式、不绑事件。于是：
//      · 关掉 / 卸载 ⇒ 摘掉这**一个**节点，页面回到"没装过这个 Mod"的状态（零残留是**结构上**保证的，
//        不依赖"把加过的 class 一个个扫回来"）；
//      · 宿主的任何一次重渲染都不会把我们的效果冲掉（没有需要重打的标记）。
//
// ★★ 1.0.0 起的**三层结构**（"随机要落到元素实例上"这条需求把 CSS 的写法整个换了）：
//
//   ① **通用 keyframes（3 条，全站共用）** —— 只表达"形状"，不表达"幅度"：
//        sp-dja-p  `--sp-dja-s`：0 → 1 → 0 → 0（0%/40%/80%/100%，即"40% 压到底 + 40% 弹回 + 20% 保持原状"）
//        sp-dja-c  `--sp-dja-c`：cos θ 采样（绕竖直轴的横向乘数，允许为负 ⇒ 镜像）
//        sp-dja-r  `--sp-dja-r`：0deg → 360deg（平面内）
//      ★ 0.6.x 是"每个参数指纹各生成一套 keyframes"，那样**幅度只能按元素**写死；
//        现在幅度进了实例自己的变量 ⇒ keyframes 只留一套，CSS 反而**小得多**。
//
//   ② **每个作用项一条基准规则**：写这个元素的 `--sp-dja-m`（压缩强度）/`--sp-dja-w`（横向补偿）+ transform + animation。
//
//   ③ **位置桶变体**（只给"一屏会重复出现"的元素，见 config.js 的 `repeatOf`）：
//        `SELECTOR:nth-child(k)` 覆盖 `--sp-dja-m/--sp-dja-w/animation-delay`（k = 1..INSTANCE_BUCKETS）
//        ⇒ 同为兄弟的那些实例（队伍列 / 商店卡 / 角落四键…）**各有各的幅度与相位**。
//      ★ DOM 侧做不到"运行时给每个节点算一份"（那要写内联样式 + 周期性重扫 ⇒ 打破零痕迹），
//        所以这里用"位置桶"这个纯 CSS 的近似；**画布对象**（干员/敌人/特效）则是真正的逐实例（按 `view.uid`，见 engine-pixi.js）。
//
// ★★ **两条独立动画**：CSS 里"旋转"与"压缩"抢同一条 `transform`，一条 keyframes 服务两个周期
//    就只能取两者的最小公倍数（帧数一大就退化成抽搐）。所以用注册自定义属性 + 两条动画
//    （`@property` 自 Chrome 85 / Edge 85 / Safari 16.4 起可用；比"独立 rotate:/scale: 属性"兼容面更宽）。
//
// ★ 退出条件（任一命中就整体摘掉 style）：总配置没有任何启用项 / 命中 `prefers-reduced-motion: reduce`。

// ★ 本文件**不 import 任何宿主模块**，也不读 config 里的值 —— 它只把编译结果排版成 CSS（纯函数）。
//   （幅度/相位都在编译期算好放在每个实例上，所以这里连 config 都不需要。）

/** 注入的 `<style>` 的 id（也是验收里"在不在"的判据）。 */
export const STYLE_ID = 'sp-dja-dom-style';
/** 挂在 `<html>` 上的作用域根 class（所有选择器都带它，避免影响页面里其它同名类）。 */
export const ROOT_CLASS = 'sp-dja';
/** 战斗屏根选择器（"战斗中的 UI"的判据）。 */
export const MATCH_ROOT_SEL = '#app .screen.gm';

/** 四个注册自定义属性的名字（都带 `sp-dja-` 前缀，不可能和宿主撞）。 */
export const VAR_S = '--sp-dja-s';      // 压缩**深度**（0 = 原状，1 = 压到最低）—— 由 keyframes 驱动，全站共用
export const VAR_C = '--sp-dja-c';      // 绕竖直轴的 cos 乘数（-1..1，允许负 = 镜像）
export const VAR_R = '--sp-dja-r';      // 平面内旋转角（deg）
export const VAR_M = '--sp-dja-m';      // ★ 这个**实例**的压缩强度（= 面板「压缩强度」/100）
export const VAR_W = '--sp-dja-w';      // ★ 这个**实例**的横向补偿（= 面板「横向补偿」/100）

/** 三条通用 keyframes 的名字。 */
export const KF_P = 'sp-dja-p';
export const KF_C = 'sp-dja-c';
export const KF_R = 'sp-dja-r';

/** `cos θ` 那条 keyframes 的采样段数（linear 插值足够平滑；每段 45°，误差 < 1.5%）。 */
export const COS_SAMPLES = 8;

const TAU = Math.PI * 2;

/** 帧 → CSS 时长字符串（精确到帧：秒 = 帧 / 60）。 */
export function durSec(frames) {
  const f = Math.max(1, Math.round(Number(frames) || 0));
  return (f / 60).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + 's';
}

/** 归一化时间 u ∈ [0,1] → keyframes 的百分比选择器。 */
function pctAt(u) { return String(+(u * 100).toFixed(4)) + '%'; }

/** 绕竖直轴那一帧的 cos 乘数（**允许负** ⇒ 镜像）。 */
export function cosAt(u) {
  const x = (Number(u) || 0) - Math.floor(Number(u) || 0);
  return Math.cos(TAU * x);
}

/** ① 压缩脉冲那条通用 keyframes：只写"深度"，幅度由每个实例的 `--sp-dja-m/--sp-dja-w` 决定。 */
function pulseKf() {
  return '@keyframes ' + KF_P + '{0%{' + VAR_S + ':0}40%{' + VAR_S + ':1}80%{' + VAR_S + ':0}100%{' + VAR_S + ':0}}';
}

/** ② 绕竖直轴那条通用 keyframes（`cos θ` 采样）。 */
function cosKf(n = COS_SAMPLES) {
  const out = [];
  for (let k = 0; k <= n; k++) out.push(pctAt(k / n) + '{' + VAR_C + ':' + cosAt(k / n).toFixed(4) + '}');
  return '@keyframes ' + KF_C + '{' + out.join('') + '}';
}

/** ③ 平面内那条通用 keyframes：0° → 360°（绕元素中心一圈）。 */
function spinKf() { return '@keyframes ' + KF_R + '{0%{' + VAR_R + ':0deg}100%{' + VAR_R + ':360deg}}'; }

/**
 * 把一个选择器逐项加上作用域前缀。
 * ★ 必须**逐项**拼 —— 只在整个字符串末尾拼前缀的话，逗号列表里只有最后一个分支带前缀（真机踩过）。
 */
export function scopeSel(sel, rootClass = ROOT_CLASS, prefix = MATCH_ROOT_SEL + ' ') {
  return String(sel).split(',').map((s) => 'html.' + rootClass + ' ' + prefix + s.trim()).join(',');
}

/** 这个作用项的 transform（幅度从实例变量里读 ⇒ 同一段 CSS 服务所有实例）。 */
export function transformOf(mode) {
  // ★★ 每一处自定义属性都必须用 `var()` 包起来 —— 少一层就整条 `calc()` 非法，
  //    浏览器会**静默丢掉整条 transform**（元素一动不动，而 animation 看着"已经挂上了"）。1.0.0 第一版就栽在这。
  const sx = 'calc(1 + (var(' + VAR_W + ') - 1) * var(' + VAR_S + '))';
  const sy = 'calc(1 - (1 - var(' + VAR_M + ')) * var(' + VAR_S + '))';
  if (mode === 'axis') return 'transform:scaleX(calc(' + sx + ' * var(' + VAR_C + '))) scaleY(' + sy + ');';
  if (mode === 'flat') return 'transform:rotate(var(' + VAR_R + ')) scaleX(' + sx + ') scaleY(' + sy + ');';
  return 'transform:scaleX(' + sx + ') scaleY(' + sy + ');';
}

/** 负的动画延迟 = 初相位（秒字符串 ⇒ 秒字符串）。 */
function delayOf(phi, durText) {
  const sec = parseFloat(durText) || 0;
  return '-' + ((Number(phi) || 0) * sec).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + 's';
}

/** 这个作用项的两条动画（名字 + 时长）与它们各自的延迟。 */
function animOf(it, phi) {
  const mode = it.vals.spinMode;
  const tq = durSec(it.vals.squashPeriod);
  const names = [KF_P + ' ' + tq + ' linear infinite'];
  const durs = [tq];
  if (mode === 'axis') { const ts = durSec(it.vals.spinPeriod); names.push(KF_C + ' ' + ts + ' linear infinite'); durs.push(ts); }
  if (mode === 'flat') { const ts = durSec(it.vals.spinPeriod); names.push(KF_R + ' ' + ts + ' linear infinite'); durs.push(ts); }
  return { anim: 'animation:' + names.join(',') + ';', delay: 'animation-delay:' + durs.map((d) => delayOf(phi, d)).join(',') + ';' };
}

/** 一个实例的幅度变量（`--sp-dja-m` / `--sp-dja-w`）。 */
const ampOf = (m, w) => VAR_M + ':' + (Number(m) / 100).toFixed(4) + ';' + VAR_W + ':' + (Number(w) / 100).toFixed(4) + ';';

/**
 * 把"作用项"编译成整份 CSS（**纯函数**，便于单测与报告复算）。
 * @param {Array<{id:string, sel:string, vals:any, mode:string, phase:number, global:boolean, buckets?:Array<{m:number,w:number,phi:number}>}>} items
 * @returns {string}
 */
export function buildCss(items) {
  const list = (items || []).filter((it) => it && it.sel);
  const parts = [];
  parts.push('/* cyanfish.dj-all · DOM 侧（只绕自身中心，无倾斜 / 无透视 / 无位移） */');
  parts.push('/* 作用项 ' + list.length + ' 个 · 压缩脉冲 = 40% 压到底 + 40% 弹回 + 20% 保持原状（' + VAR_S + '）· '
    + '绕竖直轴模式下宽度额外乘 cos θ（过零时镜像）· 幅度与相位**逐实例**（基准 + :nth-child 位置桶） */');
  if (!list.length) return parts.join('\n');
  // ---- 注册自定义属性（可插值；inherits:false ⇒ 不会渗到子元素）----
  parts.push('@property ' + VAR_S + '{syntax:"<number>";inherits:false;initial-value:0}');
  parts.push('@property ' + VAR_C + '{syntax:"<number>";inherits:false;initial-value:1}');
  parts.push('@property ' + VAR_R + '{syntax:"<angle>";inherits:false;initial-value:0deg}');
  parts.push('@property ' + VAR_M + '{syntax:"<number>";inherits:false;initial-value:1}');
  parts.push('@property ' + VAR_W + '{syntax:"<number>";inherits:false;initial-value:1}');
  // ---- 三条**通用** keyframes（全站共用一套；幅度与相位都在每个实例上）----
  parts.push(pulseKf());
  parts.push(cosKf());
  parts.push(spinKf());
  // ---- 逐个作用项：一条基准规则 + （会重复的元素）若干位置桶变体 ----
  const rules = [];
  for (const it of list) {
    const mode = it.vals.spinMode;
    const a = animOf(it, it.phase || 0);
    // ★★ 前缀只能算**一次**：基准规则与位置桶变体必须用**同一个**前缀字符串。
    //    1.0.0 第一版在变体那里写了 `MATCH_ROOT_SEL + ''`（漏掉尾空格）⇒ 选择器变成 `.screen.gm.team`，
    //    **一条变体都匹配不上**（而基准规则照常生效，所以现象是"所有实例完全一致"）。真机取证见 dj-all-036-nth.txt。
    const prefix = it.global === true ? '' : MATCH_ROOT_SEL + ' ';
    rules.push('/* ' + it.id + (it.buckets ? ' · 会重复出现 ⇒ 附 ' + it.buckets.length + ' 个位置桶变体' : '') + ' */\n'
      + scopeSel(it.sel, ROOT_CLASS, prefix) + '{'
      + ampOf(it.vals.squashMinPct, it.vals.widthMaxPct)
      + 'transform-origin:50% 50%;' + transformOf(mode) + a.anim + a.delay
      + 'backface-visibility:visible;will-change:transform}');
    // ★ 位置桶：只覆盖"这个实例自己的"三个量（幅度两个 + 延迟），不重复 transform / animation
    if (it.buckets && it.buckets.length) {
      for (let k = 0; k < it.buckets.length; k++) {
        const b = it.buckets[k];
        const a2 = animOf(it, b.phi);
        rules.push(scopeSel(it.sel, ROOT_CLASS, prefix)
          .split(',').map((s) => s + ':nth-child(' + (k + 1) + ')').join(',')
          + '{' + ampOf(b.m, b.w) + a2.delay + '}');
      }
    }
  }
  parts.push(rules.join('\n'));
  // ---- 双保险：系统要求"减少动态效果"时立刻停 ----
  parts.push('@media (prefers-reduced-motion: reduce){html.' + ROOT_CLASS + ' .sp-dja-any{animation:none !important}}');
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
        // ★ 只有文本真的变了才写（写 textContent 会重建 CSSOM ⇒ 正在跑的动画会重启动）
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
