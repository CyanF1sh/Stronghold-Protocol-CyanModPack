// mods/cyanfish.dj-all/client/engine-pixi.js — **画布侧引擎**：每帧改 PIXI 容器的 scale / rotation。
//
// ============================ 抓手（为什么不用改基座） ============================
// `public/js/ui/fieldHost.js:234` 宿主自己给 dev/E2E 挂了 `globalThis.__SP_VIEW__ = view;`
// （卸载时若仍指向自己会置回 null）。它是 guardView 包过的壳：`__SP_VIEW__.raw` 才是真视图
// （`public/js/render/app.js:1691` 的那个字面量对象）。真视图上的
//   `view.debug`（app.js:1844 `debug: { app, views, penViews, leader, tiles, fx, ctx, drag, pick }`）
// 就是全部抓手：`debug.views` / `debug.penViews` / `debug.leader` / `debug.fx` / `debug.app.ticker`。
// 全是**只读句柄**，不需要往 public/ 里加任何一行代码。★ `debug.leader` 是 getter（首领随时换人）⇒ 每帧现读。
//
// ============================ 逐字段结论（照搬 cyanfish.dj-models 的实测结论） ============================
// 宿主每帧覆写某些 transform 字段、另一些从来不碰。写"会被覆写"的字段 = 每帧和宿主抢顺序（脆弱）；
// 写"没人碰"的字段 = 写进去就稳。所以每一组都逐字段确认过，三种写法：
//   · 'free' —— **宿主从不写这个字段** ⇒ 第一次碰到时记下原值当基准，之后写 基准 × 系数（可绝对还原）。
//   · 'div'  —— **宿主每帧用绝对值覆写这个字段** ⇒ 我们写 (当前值 ÷ 上次系的数) × 新系数
//               （宿主每帧会先用绝对值重写一遍，读到的一定是"宿主的干净值"；除法只为防掉帧时自我累积）。
//   · null   —— 不碰这个字段。
// `ax/ay` 给了就做**绕自身锚点**的处理（写 pivot + position）—— 给"几何已经画在屏幕绝对坐标里"的
// Graphics / Mesh（装置箱体、单位血条）用；不写它就会被拽到画布角落。
//
//   op / enemy / token  UnitView.body      scale free · rot free   宿主从不写 body.*
//   item                ItemView.plate     scale div  · rot free   宿主每帧 units.js:1580 写 plate.scale
//   device              box.mesh / gfx     scale div  · rot free   绕 v.screen 锚点
//   hud                 单位 .hud 容器      scale free · rot free   绕 (screen.x, screen.top) 锚点
//   num                 伤害数字/浮动标签    scale div  · rot free   ★★ 恒为**平面内旋转**（防撕裂，见下）
//   fx                  粒子/弹道/环/光环…   scale div  · rot 部分   逐个句柄核对（见 collectFx 行内注释）
//
// ★★ **`num` 组恒为平面内旋转**（`dj-models` v1.5.1 立的规矩，本 Mod 照搬）：
//   'axis' 档在 2D 里只能靠 `scale.x = 原值 × cos θ` 表达 —— 那是把**整张位图连同字形**横向压扁。
//   伤害数字是 24 px 的 BitmapText，压到零点几倍宽时笔画只剩两三个像素 ⇒ 抗锯齿采样率 < 1 采样/像素
//   ⇒ 笔画明暗随机化 ⇒ **撕裂 / 毛边**（服主反馈过的现场）。文字的唯一用途就是"读" ⇒ 这一组不写 `cos θ`。
//
// ★ 本轮**不做**（如实登记）：转身换面（正/背）、混乱模式、dev 用的相位冻结。
//   它们都在 `dj-models` 里实现过，但服主本轮的规格里没有；等控制页定稿后再决定要不要回来补。

import { FPS } from './config.js';

/** 每帧回调挂到宿主 ticker 上的优先级（PIXI v7 按 priority 降序；宿主自己的 frame 是 NORMAL(0)、渲染在 LOW(-25)）。 */
export const TICK_PRIORITY = -20;
/** 找视图的轮询间隔（ms）。视图按对局生命周期来去匆匆 ⇒ 必须有独立心跳重新解析抓手。 */
export const DISCOVER_MS = 200;
/** 单帧最大计入的 dt（秒）。标签页切回来时 rAF 会跳一大步，不夹住会让相位瞬移。 */
const MAX_DT = 0.25;
/** 每帧最多写多少个目标（固定预算，本轮不做成用户参数）。 */
export const BUDGET = 400;
/** 处理顺序：目标少的先（保证单位/血条永远拿得到预算），特效最后。 */
export const GROUP_ORDER = Object.freeze(['op', 'enemy', 'token', 'device', 'item', 'hud', 'num', 'fx']);
/** ★ 恒为平面内旋转的分组（防撕裂）。 */
export const FLAT_ONLY_GROUPS = Object.freeze(['num']);

const TAU = Math.PI * 2;
const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num0 = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

/** 解析当前渲染视图的抓手。任何一步拿不到就返回 null（调用方静默降级，绝不抛）。 */
export function resolveHost(g = globalThis) {
  try {
    const safe = g ? g.__SP_VIEW__ : null;
    if (!safe) return null;
    const raw = safe.raw && typeof safe.raw === 'object' ? safe.raw : safe;
    const dbg = raw.debug;
    const views = dbg && dbg.views;
    if (!views || typeof views.values !== 'function') return null;
    const app = dbg.app;
    const ticker = app && app.ticker && typeof app.ticker.add === 'function' && typeof app.ticker.remove === 'function'
      ? app.ticker : null;
    return { raw, views, penViews: dbg.penViews || null, fx: dbg.fx || null, ticker };
  } catch { return null; }
}

/** 单位视图是否有 body 容器（Device / Item 视图没有）。 */
function hasBody(v) { return !!(v && !v.destroyed && v.body && v.body.scale); }
/** "模型加载完"的门：没加载完的视图只算 pending，不动它。 */
function modelReady(v) { return !!(v && v.actor && v.spineReady && v.actor.spine); }
/** 单位视图的 kind（渲染层就能拿到）。 */
function kindOf(v) { return v && v.info && typeof v.info.kind === 'string' ? v.info.kind : ''; }

/** 遍历"所有可能出现单位视图的地方"：战斗/备战 views、预览栏 penViews、首领 leader.view。 */
function eachView(host, fn) {
  if (host.views) for (const v of host.views.values()) fn(v);
  if (host.penViews) for (const v of host.penViews.values()) fn(v);
  if (host.leaderView) fn(host.leaderView);
}

const MODE_FREE = 'free';
const MODE_DIV = 'div';

/** 某一种 kind 的 UnitView → 写 body（宿主全都不碰）。 */
function collectUnits(host, kind, out) {
  eachView(host, (v) => {
    if (kindOf(v) !== kind || !hasBody(v) || !modelReady(v)) return;
    out.push({ o: v.body, scale: MODE_FREE, rot: MODE_FREE });
  });
}

/** 装备 / 掉落物：ItemView 只有 plate，宿主每帧写 plate.scale ⇒ div。 */
function collectItem(host, out) {
  eachView(host, (v) => {
    if (kindOf(v) !== 'item' || v.destroyed) return;
    const plate = v.plate;
    if (!plate || !plate.scale) return;
    out.push({ o: plate, scale: MODE_DIV, rot: MODE_FREE });
  });
}

/** 装置 / 箱子：`box.mesh`（2D 底盘 Mesh）+ `gfx`（Graphics 兜底箱体/炮台头），绕 `v.screen` 锚点。 */
function collectDevice(host, out) {
  eachView(host, (v) => {
    if (kindOf(v) !== 'device' || v.destroyed) return;
    const sc = v.screen;
    const ax = sc && Number.isFinite(sc.x) ? sc.x : null;
    const ay = sc && Number.isFinite(sc.y) ? sc.y : null;
    if (ax == null || ay == null) return;
    const mesh = v.box && v.box.mesh ? v.box.mesh : null;      // 3D 底盘下是 null
    if (mesh && mesh.scale && mesh !== v.gfx) out.push({ o: mesh, scale: MODE_FREE, rot: MODE_FREE, ax, ay });
    if (v.gfx && v.gfx.scale) out.push({ o: v.gfx, scale: MODE_FREE, rot: MODE_FREE, ax, ay });
  });
}

/** 场内 UI（血条 / SP 条 / 状态图标）：每个单位视图的 `hud` 容器，绕 (screen.x, screen.top) 锚点。 */
function collectHud(host, out) {
  eachView(host, (v) => {
    if (v.destroyed || !v.hud || !v.hud.scale) return;
    const sc = v.screen;
    if (!sc || !Number.isFinite(sc.x) || !Number.isFinite(sc.top)) return;
    out.push({ o: v.hud, scale: MODE_FREE, rot: MODE_FREE, ax: sc.x, ay: sc.top });
  });
}

/** 伤害数字与浮动标签：`fx.nums[].text` / `fx.labels[].t`（宿主每帧写 scale/position，从不写 rotation）。 */
function collectNum(host, out) {
  const fx = host.fx;
  if (!fx) return;
  if (Array.isArray(fx.nums)) {
    for (const t of fx.nums) {
      const tx = t && t.text;
      if (!tx || tx.destroyed || !tx.scale) continue;
      out.push({ o: tx, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  if (Array.isArray(fx.labels)) {
    for (const l of fx.labels) {
      const tx = l && l.t;
      if (!tx || tx.destroyed || !tx.scale) continue;
      out.push({ o: tx, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
}

/** 其它特效：粒子 / 弹道 / 地面环 / 技能光环 / 喷火 / 锁定环 / 持续区域（逐句柄结论见行内）。 */
function collectFx(host, out) {
  const fx = host.fx;
  if (!fx) return;
  // 粒子：宿主每帧写 position 与 scale；rotation 是 `+=` 累加 ⇒ 只做 scale(div)。释放回池的是 visible=false。
  if (Array.isArray(fx.parts)) {
    for (const p of fx.parts) {
      const sp = p && p.sp;
      if (!sp || sp.destroyed || !sp.scale) continue;
      if (sp.visible === false || !(sp.alpha > 0.02)) continue;
      out.push({ o: sp, scale: MODE_DIV, rot: null });
    }
  }
  // 弹道：halo 只写 position/scale ⇒ 可加 rotation；core / trail 的 rotation 宿主每帧赋值 ⇒ 只压缩。
  if (Array.isArray(fx.projs)) {
    for (const pr of fx.projs) {
      if (!pr) continue;
      if (pr.halo && pr.halo.scale && !pr.halo.destroyed) out.push({ o: pr.halo, scale: MODE_DIV, rot: MODE_FREE });
      if (pr.core && pr.core.scale && !pr.core.destroyed) out.push({ o: pr.core, scale: MODE_DIV, rot: null });
      if (pr.trail && pr.trail.scale && !pr.trail.destroyed) out.push({ o: pr.trail, scale: MODE_DIV, rot: null });
    }
  }
  // 地面环
  if (Array.isArray(fx.rings)) {
    for (const r of fx.rings) {
      const sp = r && r.sp;
      if (!sp || sp.destroyed || !sp.scale || sp.visible === false) continue;
      out.push({ o: sp, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 技能光环（根的 rotation 空着，hex 的 rotation 在子节点）
  if (fx.auras && typeof fx.auras.values === 'function') {
    for (const a of fx.auras.values()) {
      const sp = a && a.sp;
      if (!sp || sp.destroyed || !sp.scale || !(sp.alpha > 0.01)) continue;
      out.push({ o: sp, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 喷火（炎佑）
  if (Array.isArray(fx.flames)) {
    for (const F of fx.flames) {
      if (!F) continue;
      if (F.disc && F.disc.scale && !F.disc.destroyed) out.push({ o: F.disc, scale: MODE_DIV, rot: MODE_FREE });
      if (F.edge && F.edge.scale && !F.edge.destroyed) out.push({ o: F.edge, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 锁定环（蕾缪安）：ring 的 rotation 被赋值、core 从不写 ⇒ core 加 rot
  if (Array.isArray(fx.locks)) {
    for (const L of fx.locks) {
      if (!L) continue;
      if (L.ring && L.ring.scale && !L.ring.destroyed) out.push({ o: L.ring, scale: MODE_DIV, rot: null });
      if (L.core && L.core.scale && !L.core.destroyed) out.push({ o: L.core, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 持续区域（zone / telegraph）
  if (Array.isArray(fx.zones)) {
    for (const z of fx.zones) {
      if (!z) continue;
      if (z.disc && z.disc.scale && !z.disc.destroyed) out.push({ o: z.disc, scale: MODE_DIV, rot: MODE_FREE });
      if (z.edge && z.edge.scale && !z.edge.destroyed) out.push({ o: z.edge, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
}

/** 收集器入口。@param {string} gid @param {any} host @param {Array<any>} out 复用同一个数组（每帧不分配） */
export function collectTargets(gid, host, out) {
  out.length = 0;
  if (!host || !gid) return out;
  try {
    switch (gid) {
      case 'op': collectUnits(host, 'op', out); break;
      case 'enemy': collectUnits(host, 'enemy', out); break;
      case 'token': collectUnits(host, 'token', out); break;
      case 'item': collectItem(host, out); break;
      case 'device': collectDevice(host, out); break;
      case 'hud': collectHud(host, out); break;
      case 'num': collectNum(host, out); break;
      case 'fx': collectFx(host, out); break;
      default: break;
    }
  } catch { out.length = 0; }
  return out;
}

/**
 * 本帧要写进容器的乘数（纯函数，便于单测与报告复算）。
 *   s(τ)  = (1 − cos(2π·τ/Tq)) / 2      压缩深度，0 = 原高，1 = 压到最低
 *   yK    = 1 − (1 − M)·s               M = squashMinPct/100   ⇒ 最低点高度 = 面板百分比
 *   xK    = 1 + (W − 1)·s               W = widthMaxPct/100    ⇒ 最低点宽度 = 面板百分比
 *   θ(τ)  = 2π·τ/Ts                     Ts = spinPeriod/60 ⇒ 一个 Ts 正好一圈
 *   axisK = cos θ（绕竖直轴）/ 1（平面内）
 * @param {{spinMode:string,spinPeriod:number,squashPeriod:number,squashMinPct:number,widthMaxPct:number}} c
 * @param {number} t 已经累计的动画时间（秒）
 */
export function frameFactors(c, t) {
  const M = clampNum(num0(c && c.squashMinPct, 60) / 100, 0.05, 1);
  const W = clampNum(num0(c && c.widthMaxPct, 110) / 100, 1, 2);
  const Tq = Math.max(1, num0(c && c.squashPeriod, 38)) / FPS;
  const Ts = Math.max(1, num0(c && c.spinPeriod, 67)) / FPS;
  const s = 0.5 - 0.5 * Math.cos(TAU * (Number(t) || 0) / Tq);
  const theta = TAU * (Number(t) || 0) / Ts;
  const axis = !c || c.spinMode !== 'flat';
  return { yK: 1 - (1 - M) * s, xK: 1 + (W - 1) * s, axisK: axis ? Math.cos(theta) : 1, theta, axis, s };
}

/**
 * 造一个引擎实例。生命周期：`attach()` → 每帧 → `dispose()`。
 * @param {{ getGroups: () => Array<{gid:string, vals:any}>, log?: any, win?: any, g?: any, nowMs?: () => number }} opts
 *        `getGroups()` 返回**去重后的** `[{ gid, vals }]`（谁生效由调用方决定，见 engine.js 的"更具体的节点优先"）。
 */
export function createPixiEngine({ getGroups, log = null, win = globalThis, g = globalThis, nowMs = () => performance.now() } = {}) {
  const state = new WeakMap();          // 目标对象 → 基准值 / 上次写入值（缓存句柄，每帧不重算）
  const touched = new Map();            // gid → 被我们写过的对象集合（关组 / 关总闸 / 卸载要还原）
  const scratch = new Map();            // gid → 复用的收集数组（每帧零分配）
  const hscratch = { raw: null, views: null, penViews: null, fx: null, ticker: null, leaderView: null };
  const counts = {};
  for (const gid of GROUP_ORDER) counts[gid] = 0;

  const stats = {
    hook: null, view: false, groupsOn: 0, writesFrame: 0, writes: 0, budget: BUDGET, budgetHit: 0,
    pending: 0, everTouched: 0, costMs: 0, costMsMax: 0, errors: 0, phase: 0,
    counts, flatWrites: 0,
  };

  let host = null, attach = null, rafId = 0, timer = 0, phase = 0, lastT = 0, tickNo = 0, disposed = false, writes = 0;
  const wasOn = new Set();

  const setOf = (gid) => { let s = touched.get(gid); if (!s) { s = new Set(); touched.set(gid, s); } return s; };
  const scratchOf = (gid) => { let a = scratch.get(gid); if (!a) { a = []; scratch.set(gid, a); } return a; };
  const stOf = (o) => { let s = state.get(o); if (!s) { s = {}; state.set(o, s); } return s; };

  /** 把一个目标还原到"我们碰它之前"的样子。 */
  function restoreOne(o, s) {
    if (!o || o.destroyed || !s) return;
    try {
      if (o.scale) {
        if (typeof s.sx === 'number') o.scale.set(s.sx, s.sy);
        else if (typeof s.lx === 'number' && (s.lx !== 1 || s.ly !== 1)) {
          if (Number.isFinite(s.wx) && Number.isFinite(s.wy)
            && Math.abs(o.scale.x - s.wx) < 1e-4 && Math.abs(o.scale.y - s.wy) < 1e-4) {
            o.scale.set(s.wx / s.lx, s.wy / s.ly);
          }
          s.lx = 1; s.ly = 1;
        }
      }
      if (typeof s.rot === 'number' && typeof s.wr === 'number' && typeof o.rotation === 'number'
        && Math.abs(o.rotation - s.wr) < 1e-6) o.rotation = s.rot;
      if (typeof s.ax === 'number' && o.pivot && o.position) {
        o.pivot.set(typeof s.oax === 'number' ? s.oax : 0, typeof s.oay === 'number' ? s.oay : 0);
        o.position.set(typeof s.opx === 'number' ? s.opx : 0, typeof s.opy === 'number' ? s.opy : 0);
        s.ax = undefined;
      }
    } catch { stats.errors++; }
  }

  function restoreGroup(gid) {
    const set = touched.get(gid);
    if (!set || !set.size) return;
    for (const o of set) restoreOne(o, state.get(o));
    set.clear();
  }

  function restoreAll() {
    for (const gid of touched.keys()) restoreGroup(gid);
    wasOn.clear();
    stats.everTouched = 0;
    for (const gid of GROUP_ORDER) counts[gid] = 0;
  }

  /** 本帧现读首领视图（debug.leader 是 getter）。 */
  function liveLeader(h) {
    try {
      const dbg = h.raw && h.raw.debug;
      const l = dbg ? dbg.leader : null;
      return l && l.view ? l.view : null;
    } catch { return null; }
  }

  /** 把一份参数乘数写进一个目标。 */
  function applyTarget(tgt, ctx, gid) {
    const o = tgt.o;
    if (!o || o.destroyed) return 0;
    const flatOnly = FLAT_ONLY_GROUPS.indexOf(gid) >= 0;
    const axis = ctx.axis && !flatOnly;              // ★ num 组恒为平面内（不吃 cos θ）
    const axisK = axis ? ctx.axisK : 1;
    const s = stOf(o);
    if (typeof tgt.ax === 'number' && typeof tgt.ay === 'number' && o.pivot && o.position) {
      if (s.ax !== tgt.ax || s.ay !== tgt.ay) {
        if (typeof s.oax !== 'number') { s.oax = o.pivot.x; s.oay = o.pivot.y; s.opx = o.position.x; s.opy = o.position.y; }
        o.pivot.set(tgt.ax, tgt.ay);
        o.position.set(tgt.ax, tgt.ay);
        s.ax = tgt.ax; s.ay = tgt.ay;
      }
    }
    if (tgt.scale === MODE_FREE && o.scale) {
      if (typeof s.sx !== 'number') { s.sx = o.scale.x; s.sy = o.scale.y; }
      const x = s.sx * ctx.xK * axisK, y = s.sy * ctx.yK;
      o.scale.set(x, y); s.wx = x; s.wy = y;
    } else if (tgt.scale === MODE_DIV && o.scale) {
      const lx = typeof s.lx === 'number' && s.lx !== 0 ? s.lx : 1;
      const ly = typeof s.ly === 'number' && s.ly !== 0 ? s.ly : 1;
      const x = (o.scale.x / lx) * ctx.xK * axisK, y = (o.scale.y / ly) * ctx.yK;
      o.scale.set(x, y);
      s.lx = ctx.xK * axisK; s.ly = ctx.yK; s.wx = x; s.wy = y;
    }
    if (tgt.rot === MODE_FREE && typeof o.rotation === 'number') {
      if (typeof s.rot !== 'number') s.rot = o.rotation;
      o.rotation = axis ? s.rot : s.rot + ctx.theta;
      s.wr = o.rotation;
    }
    setOf(gid).add(o);
    return 1;
  }

  /** 每帧：按分组写容器的 transform（受固定预算约束）。 */
  function tick() {
    if (disposed) return;
    const t0 = nowMs();
    let list = [];
    try { list = getGroups() || []; } catch { list = []; }
    if (!list.length) {
      if (wasOn.size) { restoreAll(); phase = 0; lastT = 0; }
      stats.groupsOn = 0; stats.writesFrame = 0;
      return;
    }
    const t = t0 / 1000;
    let dt = lastT ? t - lastT : 0;
    lastT = t;
    if (!(dt > 0)) dt = 0; else if (dt > MAX_DT) dt = MAX_DT;
    phase += dt;
    stats.phase = phase;

    const h = host;
    if (!h) { if (wasOn.size) restoreAll(); stats.view = false; return; }
    const hh = hscratch;
    hh.raw = h.raw; hh.views = h.views; hh.penViews = h.penViews; hh.fx = h.fx; hh.ticker = h.ticker;
    hh.leaderView = liveLeader(h);

    let frameWrites = 0, budgetHit = 0, groupsOn = 0, pending = 0, flatWrites = 0;
    const onNow = new Set();
    try {
      for (const it of list) {
        const gid = it && it.gid;
        if (!gid) continue;
        onNow.add(gid);
        if (wasOn.has(gid) === false) wasOn.add(gid);
        groupsOn++;
        if (frameWrites >= BUDGET) { counts[gid] = -1; budgetHit++; continue; }
        const ctx = frameFactors(it.vals, phase);
        const flatOnly = FLAT_ONLY_GROUPS.indexOf(gid) >= 0;
        const targets = collectTargets(gid, hh, scratchOf(gid));
        let n = 0;
        for (let i = 0; i < targets.length; i++) {
          if (frameWrites >= BUDGET) { budgetHit++; break; }
          const wrote = applyTarget(targets[i], ctx, gid);
          frameWrites++; n++; writes++;
          if (wrote && flatOnly) flatWrites++;
        }
        counts[gid] = n;
        if (gid === 'op') pending = 0;
      }
      // 这一帧不再生效的分组 ⇒ 立刻还原
      for (const gid of [...wasOn]) if (!onNow.has(gid)) { restoreGroup(gid); wasOn.delete(gid); }
    } catch (e) {
      stats.errors++;
      if (stats.errors === 1) log?.warn?.('[cyanfish.dj-all] 帧内写入失败（已忽略，效果可能不完整）', e);
    }
    const cost = nowMs() - t0;
    stats.costMs = stats.costMs * 0.9 + cost * 0.1;
    if (cost > stats.costMsMax) stats.costMsMax = cost;
    stats.groupsOn = groupsOn; stats.writesFrame = frameWrites; stats.writes = writes;
    stats.budgetHit = budgetHit; stats.pending = pending; stats.flatWrites = flatWrites;
    let ever = 0;
    for (const s2 of touched.values()) ever += s2.size;
    stats.everTouched = ever;
    if (ever && (++tickNo % 240) === 0) {
      for (const set of touched.values()) for (const o of set) if (o.destroyed) set.delete(o);
      stats.everTouched = 0;
      for (const s2 of touched.values()) stats.everTouched += s2.size;
    }
  }

  function bind(h) {
    unbind();
    if (h && h.ticker) {
      try { h.ticker.add(tick, null, TICK_PRIORITY); attach = { ticker: h.ticker }; stats.hook = 'app'; return; }
      catch { stats.errors++; }
    }
    if (typeof win?.requestAnimationFrame === 'function') {
      const loop = () => { if (disposed || !attach || !attach.raf) return; rafId = win.requestAnimationFrame(loop); tick(); };
      rafId = win.requestAnimationFrame(loop);
      attach = { raf: true }; stats.hook = 'raf';
    } else stats.hook = null;
  }

  function unbind() {
    const a = attach;
    attach = null;
    if (!a) { stats.hook = null; return; }
    if (a.ticker) { try { a.ticker.remove(tick); } catch { stats.errors++; } }
    if (a.raf && rafId) { try { win?.cancelAnimationFrame?.(rafId); } catch { /* ignore */ } }
    rafId = 0; stats.hook = null;
  }

  const sameHost = (a, b) => (!a || !b ? a === b
    : a.raw === b.raw && a.views === b.views && a.penViews === b.penViews && a.fx === b.fx && a.ticker === b.ticker);

  function discover() {
    if (disposed) return;
    const h = resolveHost(g);
    if (sameHost(h, host)) { stats.view = !!h; return; }
    restoreAll();                                   // 视图换代：旧视图已经 destroy，直接换新
    host = h; stats.view = !!h;
    if (h) bind(h); else unbind();
  }

  return {
    attach() {
      if (disposed || timer) return;
      discover();
      timer = setInterval(discover, DISCOVER_MS);
      if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref();
    },
    refresh() { discover(); },
    step() { tick(); return this.stats(); },
    stats() { return { ...stats, counts: { ...counts } }; },
    /** 某个分组此刻会被动的目标数（只读）。 */
    probe(gid) {
      const h = host;
      const out = [];
      if (!h) return out;
      const list = collectTargets(gid, { ...h, leaderView: liveLeader(h) }, []);
      for (const t of list) out.push(t.o);
      return out;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) { clearInterval(timer); timer = 0; }
      unbind();
      restoreAll();
      touched.clear(); scratch.clear();
      host = null;
      stats.hook = null; stats.view = false; stats.groupsOn = 0; stats.writesFrame = 0;
    },
  };
}
