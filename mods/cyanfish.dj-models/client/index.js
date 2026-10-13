// mods/cyanfish.dj-models/client/index.js — 「DJ 干员（朋友的酒）」的浏览器侧（L4 纯界面 Mod）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → GET /mods → 逐个 import(<id>/client/index.js) → setup(hostApi) → 收下返回的 dispose
//
// 它干四件事（v1.6.0）：
//   ① 参数仓库（client/config.js）：`sp.pref.djModels` + 默认值/范围/清洗 + **9 个分组开关** + **混乱模式**
//      + ★ **只有 4 个旋转参数**（spinPeriod / squashPeriod / squashMinPct / widthMaxPct，周期类精确到帧、60 fps）
//      + 老存档（Hz / 振幅 / 补偿比例 / `domSpin` / `domDeg`）自动换算 + `guardSettings` 兜底开关（**默认关**）
//      + ★ v1.4.0：**界面（DOM）三档 `domMode`**（'on' 开启 / 'sync' 同步 / 'off' 关闭）
//      + ★★ v1.5.0：**`fbSwap` 转身换面（正/背，默认开）** 与 **`fbDead` 换面死区（默认 0.04）**，`PREF_V = 7`；
//      + ★★ v1.5.1：**`FLAT_ONLY_GROUPS = ['num']`** —— 伤害数字恒为平面内旋转（防撕裂），**不是新参数**；
//      + ★★ v1.6.0：同上，但旋转角从"±15° 摆动"改成**完整一圈 360°**（服主最新口径）；
//        另加**晕眩 / 冻结 / 沉睡期间绝不调 `setDir()`**（`frontback.js` 的 `'stun'` 分支）；
//   ② 效果引擎（client/engine.js）：跟宿主 ticker，每帧按分组改 PIXI 容器的 scale / rotation（带每帧预算）；
//      ★ 只写 `scale.x × cosθ`（绕竖直轴）或 `rotation + θ`（平面内），**不写 position / pivot / 斜切**；
//      ★ v1.4.0 单位侧**一个字节都没改**（4 个参数、无 skew 全部照旧）；
//      ★★ v1.5.0：**转身换面**（client/frontback.js）—— `cos θ` 过零时调宿主现成的 `view.setDir('UP')` 换到背面、
//        过 180° 再换回来（**渲染层动作，不碰 sim**）；没有 back 模型 / 倒地死亡 / 替身 / 备战盘一律不碰；
//      ★★ v1.5.1：**伤害数字（`num`）恒走平面内旋转** —— 不写 `cos θ`（横向不被压到过零）、
//        恒写 `rotation`（周期仍是全局 `spinPeriod`）；与全局档解耦，其它分组照旧；
//      ★★ v1.6.0：那条 rotation 是**完整一圈**（`原值 + θ`，0→360°）；且**晕眩 / 冻结 / 沉睡期间一个字都不写**
//        （宿主的晕眩是 `spine.js` 的动画模式，我们此刻换模型 = 替它在强控中途重建 SpineActor）；
//   ③ DOM 分组（client/domui.js）：**只在战斗屏存在时**注入一个 <style>，给"战斗中的 11 类最小单位 UI"
//      加 class 与相位属性；三档决定"怎么动"（开启 = 旋转 + 压缩两条动画 / 同步 = 只有压缩一条、全体同相 /
//      关闭 = 连 <style> 都不注入），角度硬夹 ±60°；
//   ④ 给「模组设置」（cyanfish.mod-settings）注册一栏「🎉 DJ 整活」（**两个周期是整数帧输入框** +
//      两个百分比滑块 + **转身换面开关 + 换面死区滑块** + 分组开关 + 混乱模式 + **界面三档分段控件** + 状态回显）。
//
// ★★ 本 Mod 的性质：**整活 · 纯视觉**。
//   没有 data/ 补丁、没有 content/ 行为模块、没有自带美术、不改 public/**、不 import 宿主内部模块
//   （唯一的外部输入是 globalThis 上的两个**只读**抓手：__SP_VIEW__ 与 __SP_MODSETTINGS__）。
//   它写的字节只有四种：PIXI 容器的 scale/rotation（必要时还有 pivot/position）、<html> 与若干元素上的 class、
//   一个 <style> 节点的 textContent、以及 localStorage 里自己那一格。**不碰宿主的 DOM 结构与事件**。
//
// ★★ 四条实现纪律（都是这个宿主里踩得到的坑）：
//   1. **setup 立刻返回**：extensions.js 是 `for (…) await setup(…)` 顺序装载的，这里绝不能 await
//      任何跟对局有关的东西（等对局等十分钟，后面所有 Mod 都别想加载了）。
//   2. **返回值只能是同步的 dispose 函数**（不是 Promise）——宿主 unloadClientMods() 靠它摘栏位、卸引擎。
//   3. **绝不抛**：所有路径 try/catch，失败只留一条 warn；拿不到抓手就静默降级（不刷屏、不阻断页面）。
//   4. **卸载要干净**：clearInterval / ticker.remove / 容器 transform 还原 / <style> 与全部 class 摘掉 /
//      栏位 dispose / 摘掉自己的全局句柄。

import { createStore, DEFAULTS, RANGES, SPIN_MODES, GROUPS, DOM_MAX_DEG, ROT_KEYS, FPS, DOM_MODES,
  FLAT_ONLY_GROUPS, FLAT_ONLY_MAX_DEG, FLAT_ONLY_FULL_TURN, CONTROL_UF_MASK, CONTROL_ANIM_STUN } from './config.js';
import { createEngine, GROUP_ORDER } from './engine.js';
import { createDomUi, STYLE_ID, ROOT_CLASS, MARK_CLASS, GUARD_CLASS, GUARD_SEL, ORDER_ATTR, PHASE_ATTR, KIND_ATTR,
  MATCH_ROOT_SEL, DETAIL_SEL, DOM_TARGETS, inMatch, buildCss, collectPhases } from './domui.js';
import { DjModelsSection } from './section.js';
import { settingsRegistry } from './registry.js';

const MOD_ID = 'cyanfish.dj-models';
/** 本 Mod 版本（mod.json 同步）。★ v1.6.0：晕眩/强控期间不碰模型选择 + 伤害数字改成完整转圈；4 个旋转参数一个字节未改。 */
const MOD_VERSION = '1.6.0';
/** 注册进「模组设置」的栏位 id（与 announce / skinvoice 区分开）。 */
const SECTION_KEY = 'djModels';
/** 栏位顺序：皮肤与语音 20 → 公告 60 → 本栏 70（纯整活，排最后）。 */
const SECTION_ORDER = 70;
/** dev / E2E 自省句柄（同宿主 __SP_VIEW__ 的用法：装载时挂、卸载时摘）。 */
const DEBUG_KEY = '__SP_DJ__';

/** 已注册的栏位 dispose + 引擎 + 仓库 + DOM 分组：setup 是同步返回的，这些都在闭包里交出。 */
let live = null;

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / data / log / mod …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  const log = api?.log && typeof api.log.warn === 'function' ? api.log : console;
  const dispose = () => { teardown(); };
  try {
    teardown();               // 热重载：上一次的实例先收干净（宿主也可能只调 setup 不调 dispose）
    const store = createStore({ onError: (e) => log.warn?.(`[${MOD_ID}] 参数写盘失败（忽略）`, e) });
    const engine = createEngine({ getConfig: () => store.get(), log });
    const dom = createDomUi({ getConfig: () => store.get(), log });
    engine.attach();          // 内部自己找 __SP_VIEW__；找不到就是空转（200 ms 一次属性读取）
    dom.attach();             // 自己找 document；不在战斗中 / reduce-motion / 关开关时它自己整体退出
    // 参数一变就把 DOM 分组同步一次（开关、两个周期、两个百分比都影响注入的 CSS）
    const offSub = store.subscribe(() => { try { dom.sync(); } catch { /* ignore */ } });
    const disposeSection = registerSection(api, store, engine, dom, log);
    installDebugHandle(store, engine, dom);

    // 页面关掉 / 切到后台时把去抖中的参数落盘（浏览器随时可能不给下一次机会）
    const onHide = () => { try { store.flush(); } catch { /* ignore */ } };
    try { globalThis.document?.addEventListener?.('visibilitychange', onHide); } catch { /* ignore */ }

    live = { store, engine, dom, disposeSection, offSub, onHide, log };
    log.info?.(`[${MOD_ID}] DJ 整活已就绪：9 个分组 · 4 个旋转参数（周期为整数帧输入）· 界面三档 · 转身换面（正/背） · 伤害数字恒为平面旋转（防撕裂） · 默认关闭（模组设置 → 🎉 DJ 整活）`);
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 初始化失败（忽略，页面不受影响）`, e);
    teardown();
  }
  return dispose;
}

/** 收摊：顺序是"先摘外部引用，再停引擎/DOM，最后归还容器与样式"。任何一步失败都不影响后面。 */
function teardown() {
  const cur = live;
  live = null;
  if (!cur) return;
  try { globalThis.document?.removeEventListener?.('visibilitychange', cur.onHide); } catch { /* ignore */ }
  try { removeDebugHandle(); } catch { /* ignore */ }
  try { cur.offSub?.(); } catch { /* ignore */ }
  try { cur.disposeSection?.(); } catch { /* ignore */ }
  try { cur.store.flush(); } catch { /* ignore */ }
  try { cur.dom?.dispose(); } catch { /* ignore */ }      // <style> + 全部 class/属性 都摘掉
  try { cur.engine.dispose(); } catch { /* ignore */ }    // 内部会 unbind + restoreAll
  try { cur.log?.info?.(`[${MOD_ID}] 已卸载（容器与注入的样式已还原）`); } catch { /* ignore */ }
}

/**
 * 把「🎉 DJ 整活」栏位交给「模组设置」。
 * 没装那个 Mod 也不会报错 —— 注册表只是 globalThis 上的一个对象，谁先跑谁建（registry.js 的幂等引导）。
 * @returns {() => void} dispose（没有注册成功时是空函数）
 */
function registerSection(api, store, engine, dom, log) {
  try {
    const reg = settingsRegistry();
    if (!reg || typeof reg.register !== 'function') return () => {};
    const dispose = reg.register({
      id: SECTION_KEY,
      title: '🎉 DJ 整活',
      order: SECTION_ORDER,
      // ★ 不传 micro：栏位列表里只留中文名（用户口径：英文 eyebrow 一律清掉）
      render: () => api.ui.html`<${DjModelsSection} api=${api} store=${store} rng=${RANGES} defaults=${DEFAULTS}
        spinModes=${SPIN_MODES} groups=${GROUPS} version=${MOD_VERSION}
        onStatus=${() => engine.stats()} onDomStatus=${() => dom.stats()} />`,
    });
    log.info?.(`[${MOD_ID}] 已在「模组设置」注册「🎉 DJ 整活」栏位（4 个旋转参数 + 转身换面（正/背）+ 9 个分组开关 + 混乱模式 + 界面三档）`);
    return dispose;
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 注册设置栏位失败（忽略）`, e);
    return () => {};
  }
}

/** 读一个自定义属性的数值（拿不到就 null）。 */
function cssNum(cs, name) {
  try {
    if (!cs || typeof cs.getPropertyValue !== 'function') return null;
    const raw = String(cs.getPropertyValue(name) || '').trim();
    if (!raw) return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/**
 * ★★ v1.4.0：**DOM 侧的逐类审计**（验收脚本直接用；报告里的"逐类证据"就来自它）。
 *   · 每个被标记元素的**类别**（`data-dj-k`）、**当前旋转角**（`--sp-dj-r`）、当前横向/竖向倍率；
 *   · ★ 新增**相位**（`--sp-dj-phase`）：`phases` / `phaseSpread` / `uniformPhase` —— "同步档所有 UI 相位完全相同"
 *     的断言直接读这三个（`phaseSpread === 0` 即任意两个元素相位差为 0）；
 *   · `withMarkedAncestor`：**祖先里还有标记元素**的个数 —— 必须是 **0**（"最小单位"= 容器不转的证据）；
 *   · 每个"不参与旋转"的详情窗格（`.dpanel / .bpop / .edrawer / .spov`）的类别数与当前角（必须是 0 / null）。
 * ★ 只读：不改任何元素、不新建状态。
 */
function auditDom() {
  const d = globalThis.document;
  if (!d) return null;
  try {
    const sel = '.' + MARK_CLASS;
    const marks = [...d.querySelectorAll(sel)];
    const perKind = {};
    const rows = [];
    let maxAbs = 0, withMarkedAncestor = 0;
    let phMin = Infinity, phMax = -Infinity;
    for (const el of marks) {
      const kind = el.getAttribute(KIND_ATTR) || '?';
      const cs = globalThis.getComputedStyle ? globalThis.getComputedStyle(el) : null;
      const ang = cssNum(cs, '--sp-dj-r') || 0;
      const sx = cssNum(cs, '--sp-dj-sx');
      const sy = cssNum(cs, '--sp-dj-sy');
      const ph = cssNum(cs, '--sp-dj-phase');
      if (ph != null) { if (ph < phMin) phMin = ph; if (ph > phMax) phMax = ph; }
      const anc = el.parentElement && el.parentElement.closest ? el.parentElement.closest(sel) : null;
      if (anc) withMarkedAncestor++;
      const a = Math.abs(ang);
      if (a > maxAbs) maxAbs = a;
      const rec = perKind[kind] || (perKind[kind] = { n: 0, maxAbs: 0, minSx: null, maxSx: null, minSy: null, maxSy: null });
      rec.n++;
      if (a > rec.maxAbs) rec.maxAbs = a;
      if (sx != null) { rec.minSx = rec.minSx == null ? sx : Math.min(rec.minSx, sx); rec.maxSx = rec.maxSx == null ? sx : Math.max(rec.maxSx, sx); }
      if (sy != null) { rec.minSy = rec.minSy == null ? sy : Math.min(rec.minSy, sy); rec.maxSy = rec.maxSy == null ? sy : Math.max(rec.maxSy, sy); }
      if (rows.length < 200) {
        rows.push({ kind, tag: el.tagName, cls: String(el.className || '').slice(0, 70),
          angle: +ang.toFixed(3), sx: sx == null ? null : +sx.toFixed(4), sy: sy == null ? null : +sy.toFixed(4),
          phase: ph == null ? null : +ph.toFixed(6),
          delay: String((el.style && el.style.getPropertyValue('animation-delay')) || ''),
          ancestorMarked: !!anc, origin: cs ? cs.transformOrigin : null,
          // 未变换的边框盒尺寸（transform 不影响 offsetWidth/Height）——用来验证 origin 就是"自身中心"
          ow: el.offsetWidth, oh: el.offsetHeight });
      }
    }
    for (const k of Object.keys(perKind)) {
      const r = perKind[k];
      r.maxAbs = +r.maxAbs.toFixed(3);
      r.minSx = r.minSx == null ? null : +r.minSx.toFixed(4); r.maxSx = r.maxSx == null ? null : +r.maxSx.toFixed(4);
      r.minSy = r.minSy == null ? null : +r.minSy.toFixed(4); r.maxSy = r.maxSy == null ? null : +r.maxSy.toFixed(4);
    }
    // 详情窗格：一个都不许转（角度恒 0、不许带标记、不许有动画）
    const details = [];
    for (const el of d.querySelectorAll(DETAIL_SEL)) {
      const cs = globalThis.getComputedStyle ? globalThis.getComputedStyle(el) : null;
      details.push({ cls: String(el.className || '').slice(0, 60), marked: el.classList.contains(MARK_CLASS),
        angle: +(cssNum(cs, '--sp-dj-r') || 0).toFixed(3), anim: cs ? cs.animationName : null,
        transform: cs ? String(cs.transform).slice(0, 40) : null });
    }
    return {
      marked: marks.length, maxAbsAngle: +maxAbs.toFixed(3), cap: DOM_MAX_DEG, withMarkedAncestor,
      perKind, rows, details,
      // ★ v1.4.0：相位证据 —— phaseSpread = 0 就是"任意两个被标记 UI 相位完全相同"
      phases: (phMin === Infinity ? [] : marks.map((el) => {
        const cs = globalThis.getComputedStyle ? globalThis.getComputedStyle(el) : null;
        return cssNum(cs, '--sp-dj-phase');
      })),
      phaseMin: phMin === Infinity ? null : +phMin.toFixed(6),
      phaseMax: phMax === -Infinity ? null : +phMax.toFixed(6),
      phaseSpread: (phMin === Infinity ? 0 : +(phMax - phMin).toFixed(6)),
      uniformPhase: phMin !== Infinity && phMax - phMin === 0,
      distinctPhases: new Set(marks.map((el) => {
        const cs = globalThis.getComputedStyle ? globalThis.getComputedStyle(el) : null;
        return String(cssNum(cs, '--sp-dj-phase'));
      })).size,
      distinctDelays: new Set(marks.map((el) => String((el.style && el.style.getPropertyValue('animation-delay')) || ''))).size,
      detailMarked: details.filter((x) => x.marked).length,
      detailMaxAbsAngle: details.reduce((m, x) => Math.max(m, Math.abs(x.angle)), 0),
    };
  } catch { return null; }
}

/**
 * dev / E2E 自省句柄（和宿主 `__SP_VIEW__` 同一套用法：装载时挂、卸载时摘）。
 * 只暴露**只读 + 参数写入**，不给任何能改宿主对象的能力。
 * @internal
 */
function installDebugHandle(store, engine, dom) {
  try {
    const g = globalThis;
    if (g[DEBUG_KEY]) { try { g[DEBUG_KEY].__dispose?.(); } catch { /* ignore */ } }
    g[DEBUG_KEY] = {
      mod: MOD_ID,
      version: MOD_VERSION,
      /** 当前参数（拷贝）。 */
      config: () => store.get(),
      /** 改参数（走同一套清洗 + 广播 + 持久化）。 */
      set: (patch) => store.set(patch),
      /** 重置为默认（关）。 */
      reset: () => store.reset(),
      /** 引擎计数：hook / 每组本帧动了几个 / 预算 / 本帧耗时 / errors… */
      stats: () => engine.stats(),
      /** DOM 分组的计数：active / reduced / inMatch / marked / perKind / containers… */
      domStats: () => dom.stats(),
      /** 注入的 CSS 原文（报告/排错用）。 */
      domCss: () => buildCss(store.get()),
      /** 立刻解析一次抓手 + 跑一帧 + 同步 DOM（E2E 不等 200 ms 心跳、不等 rAF）。 */
      poke: () => { engine.refresh(); engine.step(); dom.sync(); return { engine: engine.stats(), dom: dom.stats() }; },
      /** 采样：**所有分组**的 transform + 判据（只读，给"逐值不变 / 残差 0"的断言用）。 */
      sample: () => sampleAll(engine),
      /** 每个目标的混乱状态（φ / 幅度因子）——"φ 互不相同 / 幅度在设定值附近"的断言用它。 */
      chaos: () => engine.chaosProbe(),
      /** 给定相位算某目标的乘数（**纯计算**）——"铺满一个周期求 min/max"用它。 */
      factors: (q) => engine.factorsAt(q || {}),
      /** ★ v1.4.0：DOM 侧逐类审计（角度上限 / 最小单位 / 详情窗格不转 / 相位跨度的现场证据）。 */
      audit: () => auditDom(),
      /**
       * ★★ v1.5.0：**转身换面（正/背）的现场快照**（只读）—— 逐个视图给出
       * `id / dir / baseDir / entryBack / hasBack / alive / blocked / hasDir / facing / visFacing`，
       * 外加逐帧计数 `{gate, eligible, back, swaps, swapsTotal, noBack, held, blocked, managed}`。
       * 真机验收里的"每周期恰好 2 次换面 / 没 back 的一次都不换 / 死亡期间不硬按背面"全部读它。
       */
      fb: () => engine.fbProbe(),
      /**
       * ★★ v1.5.0：dev/E2E 专用 —— 把旋转相位**冻结**在给定角度（度）并把压缩归零（`s = 0`），
       * 便于取"正面 / 侧面（窄）/ 背面"这些**确定**相位的截图。`hold(null)` 解除冻结。
       * ★ 只有这个自省句柄会调它，正式游玩永远不会冻相位。
       */
      hold: (deg) => engine.hold(deg === undefined ? null : deg),
      /** ★ v1.4.0：所有被标记元素的相位清单（`[{kind, phase, delay}]`）——"同步档全体同相"的断言用它。 */
      phases: () => collectPhases(g.document, g),
      /** 分组 id 清单（顺序 = 引擎处理顺序 + dom 收尾）。 */
      groups: () => GROUP_ORDER.concat(['dom']),
      /** ★ v1.3.0（v1.4.0 扩了 domMode）：本版的硬约束与判据（验收脚本不需要自己硬编码这些常量）。 */
      limits: () => ({
        maxDeg: DOM_MAX_DEG, minWidthRatio: +Math.cos(DOM_MAX_DEG * Math.PI / 180).toFixed(6),
        markClass: MARK_CLASS, guardClass: GUARD_CLASS, guardSel: GUARD_SEL, kindAttr: KIND_ATTR,
        orderAttr: ORDER_ATTR, phaseAttr: PHASE_ATTR, matchRootSel: MATCH_ROOT_SEL, detailSel: DETAIL_SEL,
        fps: FPS, rotKeys: ROT_KEYS, kinds: DOM_TARGETS.map((t) => ({ kind: t.kind, label: t.label, global: !!t.global })),
        /** ★ v1.4.0：界面（DOM）三档的默认值与白名单（'on' 开启 / 'sync' 同步 / 'off' 关闭）。 */
        domModeDflt: DEFAULTS.domMode, domModes: DOM_MODES,
        /** ★ v1.4.0：两个周期参数的范围（输入式控件用它画 min/max/step）。 */
        spinRange: RANGES.spinPeriod, squashRange: RANGES.squashPeriod,
        /** ★ v1.5.0：转身换面（正/背）的默认值与死区范围。 */
        fbSwapDflt: DEFAULTS.fbSwap, fbDeadDflt: DEFAULTS.fbDead, fbDeadRange: RANGES.fbDead,
        /** 换面时挂背面用的那个 dir（宿主里唯一会走 Back 模型的：units.js:775）。 */
        fbBackDir: 'UP',
        /**
         * ★★ v1.5.1 / v1.6.0：**恒定平面旋转**（防撕裂）的判据 —— 验收脚本不必硬编码。
         *   `flatGroups` 里的分组**恒为平面内旋转**（不写 `cos θ`、恒写 `rotation`），与全局 `spinMode` 解耦；
         *   `flatMaxDeg` 是它们的**旋转角上限（度）**；`flatMode` 是"整圈"还是"摆动"的口径标记
         *   （★ v1.6.0 = **'cycle'**（完整一圈 360°），v1.5.1 = 'swing'（±15° 摆动））。
         *   `flatFullTurn` 是布尔口径（true = 整圈）；`flatDeg` 是整圈档下的跨度（360）。
         */
        flatGroups: FLAT_ONLY_GROUPS.slice(), flatMaxDeg: FLAT_ONLY_MAX_DEG,
        flatMode: FLAT_ONLY_FULL_TURN ? 'cycle' : 'swing',
        flatFullTurn: FLAT_ONLY_FULL_TURN, flatTurnDeg: FLAT_ONLY_FULL_TURN ? 360 : FLAT_ONLY_MAX_DEG,
        /** ★ v1.5.1：恒定平面旋转的分组**没有自己的参数**（4 参数口径不变 ⇒ 回显 4 个键）。 */
        flatHasOwnParams: false,
        /**
         * ★★ v1.6.0：**晕眩 / 强控期间不碰模型选择**的自省位 —— 验收脚本按它断言
         *   `blockReasons` 里有 `'stun'`，且强控期间 `setDir` 调用数 = 0。
         */
        controlBlockReason: 'stun',
        controlUfMask: CONTROL_UF_MASK,
        controlAnimStun: CONTROL_ANIM_STUN,
      }),
      /** 某组此刻会被动的目标数（只读；给"覆盖了多少个目标"的计数用）。 */
      probe: (gid) => engine.probe(gid).length,
      /** ★ v1.3.0：现在算不算"战斗中"（DOM 分组是否该生效的判据）。 */
      inMatch: () => inMatch(g),
      /** 卸载本 Mod：**等价于宿主 unloadClientMods 走到本 Mod 这一支**（引擎、DOM、栏位、句柄全部收干净）。 */
      __dispose: () => { try { teardown(); } catch { /* ignore */ } try { g[DEBUG_KEY] = null; } catch { /* ignore */ } },
    };
  } catch { /* 静态托管 / 冻结 globalThis：没有句柄也能跑 */ }
}

/** 摘掉自省句柄（只在它还是"我们的"时候摘）。 */
function removeDebugHandle() {
  const g = globalThis;
  if (g[DEBUG_KEY] && g[DEBUG_KEY].mod === MOD_ID) g[DEBUG_KEY] = null;
}

/** 读一个 PIXI 对象的 transform（只读，绝不写）。★ v1.3.0：没有斜切这一项。 */
function readXf(o, i) {
  const r = { i, sx: null, sy: null, rot: null, px: null, py: null, pvx: null, pvy: null };
  try {
    if (o.scale) { r.sx = o.scale.x; r.sy = o.scale.y; }
    if (typeof o.rotation === 'number') r.rot = o.rotation;
    if (o.position) { r.px = o.position.x; r.py = o.position.y; }
    if (o.pivot) { r.pvx = o.pivot.x; r.pvy = o.pivot.y; }
  } catch { /* ignore */ }
  return r;
}

/**
 * 采样**所有分组**的抓手（**只读**，不动任何东西）。E2E 靠它做"逐值不变 / 关掉后残差 0"的断言。
 */
function sampleAll(engine) {
  const out = { groups: {}, views: [], dom: null, stats: null, domStats: null };
  try {
    out.stats = engine.stats();
    for (const gid of GROUP_ORDER) {
      const list = engine.probe(gid);
      const arr = [];
      for (let i = 0; i < list.length; i++) arr.push(readXf(list[i], i));
      out.groups[gid] = arr;
    }
    out.views = sampleViews();
    out.dom = sampleDom();
  } catch { /* ignore */ }
  return out;
}

/** DOM 分组的现场快照（验收里数 style / class / 属性的残留）。 */
function sampleDom() {
  const d = globalThis.document;
  const r = { reduced: false, styled: false, inMatch: false, rootClass: false, marked: 0, attrs: 0, phases: 0, kinds: 0,
    delays: 0, styleNodes: 0, hasStyleId: false, api: null, animName: null, dur: null, rotVar: null, scaleVar: null,
    transformOrigin: null, guard: null, guarded: 0, containers: 0, perKind: {}, deg: DOM_MAX_DEG,
    domMode: 'on', domOff: false, bobOnly: false, cssLen: 0, rotateYCount: 0, rotateCount: 0,
    uniformPhase: false, phaseSpread: 0, phaseVars: 0 };
  try {
    if (!d) return r;
    r.hasStyleId = !!d.getElementById(STYLE_ID);
    r.styleNodes = d.querySelectorAll('style#' + STYLE_ID).length;
    // ★ 直接数注入 CSS 里的字符串（0% 档的"rotateY 出现 0 次"就是在这里取证）
    const st = d.getElementById(STYLE_ID);
    const css = st ? String(st.textContent || '') : '';
    r.cssLen = css.length;
    r.rotateYCount = (css.match(/rotateY/g) || []).length;
    r.rotateCount = (css.match(/rotate\(/g) || []).length;
    r.rootClass = !!(d.documentElement && d.documentElement.classList.contains(ROOT_CLASS));
    r.marked = d.querySelectorAll('.' + MARK_CLASS).length;
    r.attrs = d.querySelectorAll('[' + ORDER_ATTR + ']').length;
    r.phases = d.querySelectorAll('[' + PHASE_ATTR + ']').length;
    r.kinds = d.querySelectorAll('[' + KIND_ATTR + ']').length;
    const first = d.querySelector('.' + MARK_CLASS);
    if (first) {
      const cs = globalThis.getComputedStyle ? globalThis.getComputedStyle(first) : null;
      if (cs) {
        r.animName = cs.animationName; r.dur = cs.animationDuration; r.transformOrigin = cs.transformOrigin;
        r.rotVar = cssNum(cs, '--sp-dj-r'); r.scaleVar = cssNum(cs, '--sp-dj-sy');
      }
    }
    for (const el of d.querySelectorAll('.' + MARK_CLASS)) {
      if (el.style && el.style.getPropertyValue('animation-delay')) delays++;
      if (el.style && el.style.getPropertyValue('--sp-dj-phase')) phaseVars++;
    }
    r.delays = delays;
    r.phaseVars = phaseVars;
    r.styled = r.hasStyleId && r.rootClass;
    r.inMatch = inMatch(d);
    try { r.reduced = !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { /* ignore */ }
    const dj = globalThis[DEBUG_KEY];
    if (dj && typeof dj.domStats === 'function') {
      r.api = dj.domStats();
      r.guard = r.api.guard;
      r.guarded = r.api.guarded;
      r.containers = r.api.containers;
      r.perKind = r.api.perKind;
      r.domMode = r.api.domMode;
      r.deg = r.api.deg;
      r.bobOnly = r.api.bobOnly;
      r.domOff = r.api.domMode === 'off';
      r.uniformPhase = r.api.uniformPhase;
      r.phaseSpread = r.api.phaseSpread;
    }
  } catch { /* ignore */ }
  return r;
}

/**
 * 读一遍当前所有单位视图（**只读**）。保留 v1.0.0 的字段名，方便老的验收脚本继续用。
 */
function sampleViews() {
  const out = [];
  try {
    const safe = globalThis.__SP_VIEW__;
    const raw = safe && safe.raw ? safe.raw : safe;
    const views = raw && raw.debug && raw.debug.views;
    if (!views || typeof views.values !== 'function') return out;
    for (const [key, v] of views) {
      if (!v || !v.body || !v.body.scale || !v.info) continue;
      out.push({
        key: String(key), kind: String(v.info.kind || ''), side: String(v.info.side || ''), id: v.info.id ?? null,
        op: v.info.kind === 'op', spine: !!(v.actor && v.spineReady),
        sx: v.body.scale.x, sy: v.body.scale.y, rot: v.body.rotation,
        px: v.body.position.x, py: v.body.position.y,
        // ★ v1.5.0：转身换面的现场字段（只读；老的验收脚本不看这几个字段，加上去不影响它们）
        spineId: v.info.spine || v.info.defId || null,
        dir: typeof v.dir === 'string' ? v.dir : null,
        back: v.entryBack === true,
        alive: v.alive !== false,
        prep: v.prep === true,
      });
    }
  } catch { /* ignore */ }
  return out;
}
