// mods/cyanfish.dj-models/client/targets.js — **分组抓手**：每个分组"动谁、动哪个字段、宿主每帧会不会盖掉"。
//
// ============================ 这份文件的存在理由 ============================
// 宿主每帧覆写某些 transform 字段，另一些从来不碰。写"会被覆写"的字段 = 每帧和宿主抢顺序（脆弱）；
// 写"没人碰"的字段 = 写进去就稳。所以**每一组都必须逐个字段确认**，并把结论写在这里（而不是散在引擎里）。
//
// 三种写法（引擎按 `scale` / `rot` 字段的模式执行）：
//   · 'free' —— **宿主从不写这个字段** ⇒ 第一次碰到时记下原值当基准，之后写 基准 × 系数（绝对可还原）。
//   · 'div'  —— **宿主每帧用绝对值覆写这个字段** ⇒ 我们写 (当前值 ÷ 我们上次乘的系数) × 新系数。
//               因为宿主每帧都会先用绝对值重写一遍，我们读到的一定是"宿主的干净值"，
//               再除以"我们上次乘的系数"只是为了防"宿主这一帧没更新"（掉帧 / 异常）时自我累积。
//   · null   —— 不碰这个字段。
// 另外 `ax` / `ay` 给了就做**绕自身锚点**的处理（写 pivot + position，让缩放/旋转发生在那个屏幕点上），
// 这是给"几何图形已经画在屏幕绝对坐标里"的 Graphics / Mesh（装置箱体）用的 —— 直接缩放它们会被拽到画布角落。
//
// ============================ 逐组结论（file:line 见 README 的分组表） ============================
//   op / enemy / token  UnitView.body        scale free · rot free   宿主从不写 body.*（整个 public/js 零命中）
//   item                ItemView.plate       scale div  · rot free   宿主每帧 units.js:1580 写 plate.scale
//   device              box.mesh / gfx       scale div  · rot free   宿主每帧写 scale（BoxMesh 只写 zIndex）
//   hud                 单位 .hud 容器        scale free · rot free   宿主只写 hud.visible(units.js:1144/1679) 与 hud.alpha(1160)
//   num                 fx.nums[].text       scale div  · rot free   宿主每帧 numbers.js:333 写 text.scale
//                                            ★ v1.5.1：**恒定平面旋转**（不写 cos θ、恒写 rotation）—— 防撕裂
//                                            ★ v1.6.0：那条 rotation 是**完整一圈 360°**（`原值 + θ`）
//   fx                  粒子/弹道/环/光环…    scale div  · rot 部分   见下面每个收集器的行号注释
//
// ★ 关于 `rotation`：PIXI 的 Sprite.rotation 是**赋值**语义，Graphics/Container 也一样；
//   只有粒子（fx/particles.js:96 `sp.rotation += p.spin * dt`）是**累加**语义 —— 我们要是赋值就会破坏它自己的自转，
//   所以粒子只做压缩（scale），旋转一律不碰。同理弹道的 core/trail、锁定环的 ring、光环的 hex 都是宿主每帧赋值的。

/** 目标记录：`o` 是 PIXI 对象，`scale` / `rot` 是上面三种模式，`ax` / `ay` 是可选的"绕自身锚点"。 */
export const MODE_FREE = 'free';
export const MODE_DIV = 'div';

/** 单位视图是否有 body 容器（DeviceView / ItemView 没有）。 */
export function hasBody(v) {
  return !!(v && !v.destroyed && v.body && v.body.scale);
}

/**
 * "模型加载完"的门：没加载完的视图只算 pending，不动它（和 v1.0.0 的干员判据完全一致）。
 * 合成验收里必须给 actor.spine + spineReady，否则算 pending。
 */
export function modelReady(v) {
  return !!(v && v.actor && v.spineReady && v.actor.spine);
}

/** 单位视图的 kind（渲染层就能拿到，不用翻模拟器）。 */
export function kindOf(v) {
  return v && v.info && typeof v.info.kind === 'string' ? v.info.kind : '';
}

/** 遍历"所有可能出现单位视图的地方"：战斗/备战 views、预览栏 penViews、首领 leader.view。 */
function eachView(host, fn) {
  if (host.views) for (const v of host.views.values()) fn(v);
  if (host.penViews) for (const v of host.penViews.values()) fn(v);
  if (host.leaderView) fn(host.leaderView);
}

/** 某一种 kind 的 UnitView → 写 body（scale free / rot free，宿主全都不碰）。
 *  ★ v1.5.0：记录里**多带一个 `v`（视图本体）与 `kind`** —— 转身换面要调 `v.setDir()`，
 *    而 `body` 容器上没有视图句柄（原来只 push 了 `v.body`）。多带一个字段不影响任何既有分组。 */
function collectUnits(host, kind, out, info) {
  eachView(host, (v) => {
    if (kindOf(v) !== kind) return;
    if (!hasBody(v)) return;
    if (!modelReady(v)) { if (info) info.pending++; return; }   // 模型没出来 → 本帧不动
    out.push({ o: v.body, scale: MODE_FREE, rot: MODE_FREE, v, kind });
  });
}

/** 装备 / 掉落物：ItemView 只有 plate（图标牌），宿主每帧写 plate.scale（units.js:1580）⇒ div。 */
function collectItem(host, out) {
  eachView(host, (v) => {
    if (kindOf(v) !== 'item' || v.destroyed) return;
    const plate = v.plate;
    if (!plate || !plate.scale) return;
    out.push({ o: plate, scale: MODE_DIV, rot: MODE_FREE });
  });
}

/**
 * 装置 / 箱子：DeviceView 没有 body。两个抓手都靠"绕自身屏幕锚点"（ax/ay = v.screen，即装置血条那个点，
 * 大约在箱体上方 0.35 格）：
 *   · box.mesh —— 2D 底盘的 PIXI Mesh，顶点是屏幕绝对坐标（tiles.js BoxMesh.update 只写 mesh.zIndex）
 *   · gfx      —— Graphics 兜底箱体 + 炮台头，同样是屏幕绝对坐标（units.js:1671-1676 只 clear/zIndex/alpha）
 * 两者宿主每帧都不写 position / pivot / scale / rotation ⇒ 全部 'free'。
 * ★ 为什么必须写 pivot：这两个对象的几何已经画在**屏幕绝对坐标**里，直接 scale/rotate 会绕画布原点转，
 *   箱子会被甩到左上角去。pivot=position=锚点 时变换恰好是恒等，缩放/旋转就发生在箱子自己身上。
 * ★ 3D 底盘（board3d）下的装置箱体句柄被 scene.createDevice 的闭包藏着（scene.js:468-491 返回的 h.mesh 恒 null），
 *   摸不到 ⇒ 3D 底盘下装置只跟 gfx（炮台/兜底箱体）与血条走，README 的"未做"里写明。
 */
function collectDevice(host, out) {
  eachView(host, (v) => {
    if (kindOf(v) !== 'device' || v.destroyed) return;
    const sc = v.screen;
    const ax = sc && Number.isFinite(sc.x) ? sc.x : null;
    const ay = sc && Number.isFinite(sc.y) ? sc.y : null;
    if (ax == null || ay == null) return;
    const mesh = v.box && v.box.mesh ? v.box.mesh : null;   // 3D 底盘下是 null
    if (mesh && mesh.scale && mesh !== v.gfx) out.push({ o: mesh, scale: MODE_FREE, rot: MODE_FREE, ax, ay });
    if (v.gfx && v.gfx.scale) out.push({ o: v.gfx, scale: MODE_FREE, rot: MODE_FREE, ax, ay });
  });
}

/**
 * 场内 UI：每个单位视图的 `hud` 容器（血条 / SP 条 / 状态图标 / 换人环）。
 * 宿主对 hud 只写 visible / alpha / 子节点的屏幕坐标（units.js:1144、1160、1172-1198）……
 * **从不写 hud.position / pivot / scale / rotation** ⇒ 三个字段都能安全写。
 * ★ 必须绕"单位头顶"这个锚点（screen.x, screen.top）：hud 的子节点用的是**屏幕绝对坐标**，
 *   直接缩放/旋转整个容器会把它甩到画布别处。
 */
function collectHud(host, out) {
  eachView(host, (v) => {
    if (v.destroyed || !v.hud || !v.hud.scale) return;
    const sc = v.screen;
    if (!sc || !Number.isFinite(sc.x) || !Number.isFinite(sc.top)) return;
    out.push({ o: v.hud, scale: MODE_FREE, rot: MODE_FREE, ax: sc.x, ay: sc.top });
  });
}

/**
 * 伤害数字与浮动标签。
 *   · fx.nums[].text  —— BitmapText；宿主每帧 numbers.js:333 写 scale、334 写 position，**从不写 rotation**
 *   · fx.labels[].t   —— 同样的 BitmapText；宿主每帧 numbers.js:361-363 写 position.y 与 scale
 * ⇒ scale 'div' + rot 'free'。
 * ★ v1.3.0：这一组**没有自己的参数**（老版有 numSpinHz / numAmp）—— 服主规格是"所有单位的旋转仅包含 4 个参数"
 *   （旋转周期 / 压缩周期 / 压缩强度 / 横向补偿），伤害数字与其它分组**共用同一套**弹簧参数。
 * ★★ v1.5.1（服主口径，本文件这一组唯一的改动）：**旋转判据**恒为平面内 ——
 *   本组在 `config.js` 的 `FLAT_ONLY_GROUPS` 白名单里，引擎对它**不写 `cos θ`**（横向因此永不被压到过零）
 *   而是**写 `rotation`**（周期仍是全局 `spinPeriod`）。
 *   ★ v1.6.0：那条 rotation 从"±15° 摆动"改成**完整一圈 360°**（`原值 + θ`）—— 服主原话：
 *     「伤害数字水平旋转是应该做成能够完整的转圈，而非仅是限定角度晃动」。**仍然不写 `scale.x`**。
 *   根因：'axis' 档的 `scale.x ∝ cos θ` 把 24 px 的 BitmapText 连字形一起横向压扁，
 *   笔画只剩两三个像素时抗锯齿采样率 < 1 采样/像素 ⇒ **撕裂 / 毛边**（服主反馈的现场）。
 *   ★ 竖向压缩（yK）与横向补偿（xK）**照旧**（它们与旋转无关）；★ 其它分组照旧跟随全局档。
 *   ★ 文字**不做轴转** ≠ 文字有专用参数：这里仍然一个参数都没有（4 参数口径不变）。
 * ★ `fx.pops`（升格/入场提示里的 BitmapText，arrivals.js:95）**不在任何分组里** ⇒ 我们从不写它
 *   （既不会被压扁，也不参与本 Mod 的效果）—— 验收报告里按"未覆盖"标注。
 */
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

/**
 * 其它特效：粒子 / 弹道 / 地面环 / 技能光环 / 喷火 / 锁定环 / 持续区域。
 * 每个句柄的结论都写在行内注释里（行号指向 public/js/render/fx/*.js）。
 * ★ 光束（fx.beams，Graphics）**不做**：它的几何是每帧用 `moveTo/lineTo` 以屏幕绝对坐标重画的
 *   （beams.js:38-44、147-148），容器上没有可旋转的"局部坐标系"，转了只会让光条整体脱离单位 —— 详见 README。
 */
function collectFx(host, out) {
  const fx = host.fx;
  if (!fx) return;

  // 粒子：particles.js:93-96 每帧写 position 与 scale（scale 是绝对值），rotation 是 `+=` 累加 ⇒ 只做 scale(div)。
  // 释放回池的粒子是 visible=false + alpha=0 + scale(0,0)（particles.js:75-78）⇒ 跳过它们既是正确性也是性能。
  if (Array.isArray(fx.parts)) {
    for (const p of fx.parts) {
      const sp = p && p.sp;
      if (!sp || sp.destroyed || !sp.scale) continue;
      if (sp.visible === false || !(sp.alpha > 0.02)) continue;
      out.push({ o: sp, scale: MODE_DIV, rot: null });
    }
  }
  // 弹道：halo 只写 position/scale（projectiles.js:188-189、334-335）⇒ 加 rotation；
  //       core / trail 的 rotation 宿主每帧赋值（183、194、266、330）⇒ 只做 scale(div)。
  if (Array.isArray(fx.projs)) {
    for (const pr of fx.projs) {
      if (!pr) continue;
      if (pr.halo && pr.halo.scale && !pr.halo.destroyed) out.push({ o: pr.halo, scale: MODE_DIV, rot: MODE_FREE });
      if (pr.core && pr.core.scale && !pr.core.destroyed) out.push({ o: pr.core, scale: MODE_DIV, rot: null });
      if (pr.trail && pr.trail.scale && !pr.trail.destroyed) out.push({ o: pr.trail, scale: MODE_DIV, rot: null });
    }
  }
  // 地面环：rings.js:46-47 写 position/scale，rotation 从不写 ⇒ scale(div) + rot(free)。
  if (Array.isArray(fx.rings)) {
    for (const r of fx.rings) {
      const sp = r && r.sp;
      if (!sp || sp.destroyed || !sp.scale || sp.visible === false) continue;
      out.push({ o: sp, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 技能光环：rings.js:118-120 写根容器 position/scale（hex 的 rotation 是子节点）⇒ 根的 rot 空着。
  if (fx.auras && typeof fx.auras.values === 'function') {
    for (const a of fx.auras.values()) {
      const sp = a && a.sp;
      if (!sp || sp.destroyed || !sp.scale) continue;
      if (!(sp.alpha > 0.01)) continue;
      out.push({ o: sp, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 喷火（炎佑）：beams.js:101-102 写 disc/edge 的 position/scale，rotation 从不写。
  if (Array.isArray(fx.flames)) {
    for (const F of fx.flames) {
      if (!F) continue;
      if (F.disc && F.disc.scale && !F.disc.destroyed) out.push({ o: F.disc, scale: MODE_DIV, rot: MODE_FREE });
      if (F.edge && F.edge.scale && !F.edge.destroyed) out.push({ o: F.edge, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 锁定环（蕾缪安）：locks.js:98-103 —— ring 的 rotation 被赋值、core 从不写 rotation ⇒ core 加 rot。
  if (Array.isArray(fx.locks)) {
    for (const L of fx.locks) {
      if (!L) continue;
      if (L.ring && L.ring.scale && !L.ring.destroyed) out.push({ o: L.ring, scale: MODE_DIV, rot: null });
      if (L.core && L.core.scale && !L.core.destroyed) out.push({ o: L.core, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
  // 持续区域（zone / telegraph）：zones.js:139-140 写 disc/edge 的 position/scale。
  if (Array.isArray(fx.zones)) {
    for (const z of fx.zones) {
      if (!z) continue;
      if (z.disc && z.disc.scale && !z.disc.destroyed) out.push({ o: z.disc, scale: MODE_DIV, rot: MODE_FREE });
      if (z.edge && z.edge.scale && !z.edge.destroyed) out.push({ o: z.edge, scale: MODE_DIV, rot: MODE_FREE });
    }
  }
}

/**
 * 收集器的唯一入口。`dom` 不在这里 —— 它走 client/domui.js（注入 CSS + class，不碰 PIXI）。
 * @param {string} gid
 * @param {any} host resolveHost() 的结果
 * @param {Array<any>} out 复用同一个数组（每帧不分配）
 * @param {{ pending?: number }} [info] 顺带汇报"模型没加载完"的单位数
 */
export function collectTargets(gid, host, out, info) {
  out.length = 0;
  if (!host || !gid) return out;
  try {
    switch (gid) {
      case 'op': collectUnits(host, 'op', out, info); break;
      case 'enemy': collectUnits(host, 'enemy', out, info); break;
      case 'token': collectUnits(host, 'token', out, info); break;
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
