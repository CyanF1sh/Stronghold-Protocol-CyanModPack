// mods/cyanfish.dj-models/client/frontback.js — ★★ v1.5.0：**转身换面（正/背）**。
//
// ============================ 服主需求（原话） ============================
//   「注意到干员的 spine 有**正面和背面**两种状态，能不能用**旋转宽度到达 0 像素宽度时切换正背面 spine**
//     来实现**更真实的旋转效果**？」
// ⇒ 也就是：绕竖直轴转到**侧面（投影宽度过零）**那一刻把模型从正面换成背面、过了 180° 再换回来。
//   观感从"原地压扁成一张纸"变成"**真的转过身去**"。
//
// ============================ 为什么这件事在宿主里是"一句话" ============================
// `public/js/render/units.js:21-26` 的抬头注释逐字写着：**"the Back model for UP（when one exists）… the Front model for
// RIGHT and DOWN, mirrored for LEFT"**，并且 **`setDir(dir)` re-orients a live view (swapping Front ⇄ Back without a
// fallback flash)**。所以本项目**不需要**碰 public/**、**不需要**自己加载骨骼：
//   · `view.setDir('UP')`    ⇒ 宿主加载/切到**背面** skeleton（`_wantsBack()` 为真时）
//   · `view.setDir(其它)`    ⇒ 宿主切回**正面** skeleton（`dir !== 'UP'` ⇒ `_wantsBack()` 必为假）
//   而且换面走 `_syncModel()` → `_loadSpine()` → `_acquireSpine()`：**在原地替换模型、中间不闪 fallback 钻石**
//   （units.js:576-581 的 swap 分支；旧模型正在演的 fall / deploy 进度还会接着演）。
//
// ============================ ★ 判据：用谁说的话 ============================
// ① **换不换**：用**当前的 `cos θ` 符号**（这正是"宽度过零"的数学形式 —— `body.scale.x ∝ cos θ`）：
//      `cos θ > 0` ⇒ 正面；`cos θ < 0` ⇒ 背面。`'flat'` 档（平面内旋转）时 `axisK ≡ 1`、宽度不过零 ⇒ **不换面**。
// ② **能不能换**：用**宿主自己的判据**，绝不猜路径 ——
//      `view.ctx.assets.hasBack(id)`（= assets.js:203 `hasBackSpine`，与 `_wantsBack()` 里用的是**同一个函数**，
//      `id = info.spine || info.defId` 也与 `_wantsBack()` 逐字相同）。没有 back 就**一个字节都不写**。
// ③ **什么时候绝不碰**：`_wantsBack()` / `_syncModel()` 的判据（units.js:772-786）说明得很清楚 ——
//      · **倒地 / 死亡 / 正在淡出**：`_wantsBack()` 返回 `this.alive || dieClipDur(back) > 0`，即**135 个 Back 骨架里
//        只有 4 个自带 Die 剪辑**，其余 131 个必须退回 Front 播死亡（GitHub issue #25：否则背面会顶着攻击循环躺在
//        换人环下面）。⇒ 我们在这三种状态下**保持不动**（既不按背面、也不强行切回），把决定权**完全留给宿主**：
//        它会在下一帧的 `_syncModel()` 里按自己的判据把 `dir === 'UP'` 的挂背面单位退回 Front。
//        ★ 这是本文件最重要的一条纪律。
//      · ★★ **晕眩 / 冻结 / 沉睡**（v1.6.0 新加，与倒地同一条纪律）：宿主 `_baseFromAnim()`（units.js:716-720）
//        把这三位**完全等同**成一个 `'stun'` 静息态，而它在 `spine.js` 里是**动画模式**（`mode = 'stun'`，
//        没有 stun 剪辑还会 `frozen = true` 冻住姿态）—— 与"挂正面还是背面骨架"正交。
//        我们此刻换模型 = 替宿主在强控中途 `_dropActor()` + 异步重建 SpineActor ⇒ 渲染丢失 / 只渲染部分。
//        根因与行号见下面 v1.6.0 那一段。**期间一个字节都不写**。
//      · **替身 / 形态**（`view.form` 非空）：形态是一套 clip 集（FORMS），front/back 两套骨架的 clip 未必成对
//        ⇒ 有形态期间不换面。
//      · **备战盘 / 预览栏 / 首领 / 侦察盘**（`view.prep === true`）：那里的 `dir` 是**玩家正在编辑的部署方向本身**，
//        而且 app.js:772 每次备战状态同步都会 `v.setDir(info.dir)` 把它重设回来 ⇒ 我们插手只会两侧互抢。
//      · **敌人**：`setDir()` 对敌人本来就是 no-op（units.js:793），而且 `_wantsBack()` 对敌人恒为假。
//
// ============================ ★★ 死区（迟滞）与"零宽度切换" ============================
// `fbTarget(cosT, dead, wasBack)`：**唯一门限 `dead`**，两侧共用 ⇒ 等价于"过零前后各有一个小门限"：
//      · 正面 → 背面：要 `cos θ < −dead`（θ 越过 90° + asin(dead)）
//      · 背面 → 正面：要 `cos θ > +dead`（θ 越过 270° − asin(dead)）
//      · `|cos θ| ≤ dead` 这条**死区**里**保持上一次的判定**（迟滞：不会被浮点噪声 / 掉帧 / −0 骗得反复换面）。
// 默认 `fbDead = 0.04` ⇒ 死区 = 90° ± 2.29°（每个周期 4.6° ≈ **1.3% 的时间**）。取这个值的理由：
//      · 要**足够小**：换面发生在"宽度已经很小"的时刻 —— 报告里给出换面那一帧的实测 |scale.x|；
//        ★ 0.04 **小于默认周期（67 帧）一帧里 |Δcos θ| ≈ 0.094** ⇒ 死区**不会**把换面额外往后推一帧，
//          换面永远发生在过零后的**第一帧**（那是"最接近 0 宽"的可达帧）。
//      · 要**足够大**：相位在本引擎里是**单调递增**的（`phase += dt`，混乱模式只加**固定**相位偏移 `dPhi`，
//        不抖动），所以理论上不会抖；死区只用于防御"掉帧 / −0 符号 / 浮点边界"这一类意外。
//      ★ 实测（报告 §过零连续性）：换面那一刻 |scale.x| 只有原宽的百分之十几 —— 与"突然以完整宽度出现"
//        完全不是一回事（而且换面**不可能**在 |cos θ| 大的时候发生：判据就是 cos θ 的符号 + 这个死区）。
//
// ============================ ★★ 背面模型为什么用 |cos θ|（而不是 cos θ） ============================
// v1.4.0 的做法是 `scale.x = 原值 × xK × cos θ` —— `cos θ < 0` 时**横向镜像**，这对"只有正面一张图"的单位是
// **正确**的（平面卡片翻到背面看到的就是正面的镜像）。但换上真的背面骨骼之后，**背面资产本身就已经是"转过 180°
// 的那张图"**（角色背对我们 ⇒ 角色的右手在屏幕右侧），再镜像一次就变成"背面的镜像" ⇒ 观感是卡片在翻、不是人在转。
// 所以：**当屏幕上挂的确实是背面资产时（`entryBack === true` 且视图由本功能管理），横向用 `|cos θ|`**。
// ★ 这条只在**本功能真的接管了那个视图时**生效 —— 功能关掉时逐值回到 v1.4.0 的写法（`cos θ` 带符号）。
//
// ============================ ★ 换面**只换模型**，不动任何"朝向指示" ============================
// `setDir()` 顺手会写三个字段（units.js:796-800）：`dir`（= 我们要的）、`facing`、`visFacing`、`hasDir`。
// 后三个不是"模型"而是**朝向指示**：
//   · `dir`       → units.js:1098 地面那个橙色 › 的方向（只认 UP/RIGHT/DOWN/LEFT 四个离散值）
//   · `visFacing` → units.js:1024 模型镜像、units.js:1233-1234 **阻挡标记**画在哪一侧
//   · `hasDir`    → units.js:1087 要不要画那个 ›
// 所以本文件在每次 `setDir()` 之后**逐值还原** `facing` / `visFacing`，并把 `hasDir` **只在我们真的覆盖了 `dir`
// 期间**压成 false（= 那一小段时间不画 ›；`dir` 一回到宿主原值就立刻还原成宿主原值）。
// ⇒ 观感上：换面期间**没有**朝向指示在 90°/180° 之间来回跳（那会把"部署 / 攻击方向"这条**玩法信息**说错），
//   而一切都在功能关掉 / 视图退出时**逐值还原**（见 engine.js 的还原路径）。
//
// ============================ 与其它开关的正交性 ============================
//   · 与「混乱模式」正交：混乱只改**相位偏移**与**幅度**，`cos θ` 的符号序列不受影响 ⇒ 换面判据照旧（每周期 2 次）。
//   · 与「界面三档」（DOM）**完全无关**：那是 `<style>`/CSS，这里是 PIXI。
//   · 与**总开关 / 分组开关**的关系：总开关关、或 op/enemy/token 分组关掉时，引擎走**还原**路径
//     （`restoreAll()` / `restoreGroup(gid)`）⇒ `dir` 与三个指示字段逐值回到宿主自己的样子。

// ============================ ★★ v1.6.0：晕眩 / 强控状态 ⇒ **绝不碰** ============================
// 服主实测（本 Mod 的测试服）：「**干员晕眩时渲染丢失 / 只渲染部分**」。
//
// 先把"宿主的晕眩是什么"钉死（读代码，不猜）：
//   · `public/js/render/units.js:716-720` `_baseFromAnim()`：
//       `if (this.anim === ANIM.STUN || (this.flags & (UF.STUNNED | UF.FROZEN | UF.SLEEP))) return 'stun';`
//     ⇒ **晕眩 / 冻结 / 沉睡三者被宿主完全等同**（`sync()` 每帧把结果丢给 `actor.setBase()`）。
//   · `public/js/render/spine.js:254-282` `setBase('stun')` / `_enterStun()/ _leaveStun()`：
//     晕眩是一个**动画模式**（`this.mode = 'stun'`）：有 `roles.stun.begin` 就先播它再 queue loop，
//     只有 loop 就 loop，**两样都没有就 `this.frozen = true`（把当前姿态冻住，连 `spine.update()` 都不调）**。
//   · ⇒ 晕眩**不改模型**：它既不切 `/front/` `/back/`，也不改 `entryBack`（那是 `_wantsBack()` 管的事）。
//     它只是让宿主"用哪个骨架"的选择**原样驻留**在强控期间。
//
// 所以我们（本 Mod 里唯一会改模型的东西）在强控期间插手 `setDir()` 会干什么：
//   `setDir()` → `units.js:802 _syncModel()` → `_wantsBack() !== entryBack` → `_loadSpine()` → `_acquireSpine()`：
//   旧的 SpineActor 立刻被 `_dropActor()` 销毁（`spineReady = false`、`actor = null`），
//   新骨架**异步**下载/构建完才重新 `spineReady = true` 并 `this.actor.setBase(this._baseFromAnim())`。
//   ⇒ 这是**一次宿主完全没打算做的模型重建**，而且正好插在"宿主把强控姿态冻住 / 正在播 stun 剪辑"的当中
//     （`swapT = 1` 的交叉淡入、`_updateImpostor` 的贴图路径、`spineReady === false` 那一段都在这条路上）。
//     观感上正是"渲染丢失 / 只渲染一部分"这一类现场。
//
// ★ 治法（**低风险、理由充分**）：把这三个位（宿主自己等同处理的那三位）加进下面的"绝不碰"名单 ——
//   期间**一个字节都不写**：不 `setDir`、也不动 `dir` / `facing` / `visFacing` / `hasDir`，
//   把"挂正面还是背面"的决定权**完全留给宿主**（与"倒地 / 死亡 / 淡出"那条纪律逐字同源）。
//   等强控一结束，`step()` 下一帧就会按 `cos θ` 的符号重新对齐（那时 `setDir` 只调一次，代价可忽略）。
//
// ★ 代价（如实写在报告里）：强控期间旋转照旧在转（`scale.x ∝ cos θ` 照旧写），所以"正/背"在这一小段时间里
//   可能与 `cos θ` 的符号不一致（最多偏一个 ±90° 窗口）。这是**故意的**：宁可观感略有出入，
//   也不要在宿主冻结强控姿态的时候替它重建模型。
//
// ★ 难度诚实：服主自己说"晕眩比较难测" —— 本轮**未能**在真机里自然造出晕眩（证据与尝试路径见报告 §①）。
//   这条修复是**防御性**的：判据逐条来自上面那几个行号，单测（`33-05-unit-dj-models.mjs` 的 §H）覆盖了
//   "强控期间 setDir 调用数 = 0 / 模型一次都不重建 / 强控一结束就重新对齐"，但**未经真机眩晕验证**。

import { isControlView } from './config.js';

/** 默认死区（|cos θ| 门限）。0.04 ⇒ 90° ± 2.29°（小于默认周期一帧的 |Δcos| ≈ 0.094 ⇒ 不会额外推后一帧）。 */
export const FB_DEFAULT_DEAD = 0.04;
/** 死区可调范围（与 config.js 的 RANGES.fbDead 保持一致）。 */
export const FB_DEAD_MIN = 0;
export const FB_DEAD_MAX = 0.3;
/** 正面模型要挂在哪个 dir 上：`dir !== 'UP'` ⇒ `_wantsBack()` 必为假 ⇒ 宿主必然加载/保持 Front。 */
export const FB_FRONT_DIR = 'RIGHT';
/** 背面模型：宿主里唯一会走 Back 模型的 dir（units.js:775）。 */
export const FB_BACK_DIR = 'UP';

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 洗一个死区值（NaN / 坏值 ⇒ 默认；越界 ⇒ 夹住）。 */
export function fbDeadOf(cfg) {
  const v = cfg && typeof cfg.fbDead === 'number' && Number.isFinite(cfg.fbDead) ? cfg.fbDead : FB_DEFAULT_DEAD;
  return clampNum(v, FB_DEAD_MIN, FB_DEAD_MAX);
}

/**
 * 换面的**全局闸**：开关打开 **且** 绕竖直轴模式。
 * `'flat'`（平面内旋转）时 `axisK ≡ 1`、宽度不过零 ⇒ 按定义不换面（服主需求第 1 条）。
 */
export function fbGate(cfg) {
  return !!cfg && cfg.fbSwap === true && cfg.spinMode !== 'flat';
}

/**
 * ★ v1.6.0：这个视图此刻处于**晕眩 / 冻结 / 沉睡**吗（宿主 `_baseFromAnim()` 判据的逐字复刻）。
 * 实现与常量在 `config.js` 的 `isControlView()`（报告与单测直接调它，避免两份实现跑偏）。
 * @param {any} v 渲染层的 UnitView
 */
export function isStunnedView(v) {
  return isControlView(v);
}

/**
 * ★ 换面判据（**纯函数**，报告与单测直接复算它）：
 *   · 已经在背面：只有 `cos θ > +dead`（明确转到正面）才回正面；
 *   · 已经在正面：只有 `cos θ < −dead`（明确转到背面）才去背面；
 *   · `|cos θ| ≤ dead`（死区）：**保持上一次的判定**。
 * @param {number} cosT 当前的 cos θ（= 引擎写进 scale.x 的那个轴转乘数）
 * @param {number} dead 死区（0 ⇒ 无死区，纯符号）
 * @param {boolean} wasBack 上一次的判定（true = 当前挂着背面）
 * @returns {boolean} 这一帧**想要**背面吗
 */
export function fbTarget(cosT, dead, wasBack) {
  const c = typeof cosT === 'number' && Number.isFinite(cosT) ? cosT : 0;
  const d = clampNum(typeof dead === 'number' && Number.isFinite(dead) ? dead : FB_DEFAULT_DEAD, FB_DEAD_MIN, FB_DEAD_MAX);
  if (wasBack) return !(c > d);
  return c < -d;
}

/**
 * ★ 宿主自己的判据：这个视图有没有**背面**模型。**不猜路径** ——
 * 直接调宿主 assets 上的 `hasBack(id)`（assets.js:904 ⇒ `hasBackSpine`，与 `_wantsBack()` units.js:775
 * 用的是同一个函数、同一个 id 取法），拿不到就返回 false（fail-safe：宁可一个字节都不写）。
 * @param {any} v 渲染层的 UnitView
 */
export function viewHasBack(v) {
  try {
    const info = v && v.info;
    const a = v && v.ctx && v.ctx.assets;
    const id = info ? (info.spine || info.defId) : null;
    if (!a || !id || typeof a.hasBack !== 'function') return false;
    return !!a.hasBack(id);
  } catch { return false; }
}

/**
 * 这个视图为什么**不能**换面（'' = 可以）。返回值同时当统计口径用（报告里"为什么跳过"就数它）。
 * 判定次序与 `_wantsBack()` / `_syncModel()` 的关切一一对应。
 * ★ v1.6.0：`'stun'` = 晕眩 / 冻结 / 沉睡（宿主 `_baseFromAnim()` 里被等同处理的那三位）——
 *   与 `'dead'` / `'dying'` / `'down'` 同一条纪律：**绝不碰**（保持不动，把决定权留给宿主）。
 * @param {any} v
 * @returns {''|'destroyed'|'nosetdir'|'enemy'|'dead'|'dying'|'down'|'stun'|'form'|'prep'|'noback'}
 */
export function fbBlockedBy(v) {
  if (!v || v.destroyed) return 'destroyed';
  if (typeof v.setDir !== 'function') return 'nosetdir';
  if (v.info && v.info.kind === 'device') return 'nosetdir';
  if (v.isEnemy) return 'enemy';
  // ★★ 倒地 / 死亡 / 淡出：**绝不硬按背面**（135 个 Back 骨架里 131 个没有 Die 剪辑）
  if (v.alive === false) return 'dead';
  if (v.dying > 0) return 'dying';
  if (v.down) return 'down';
  // ★★ v1.6.0 晕眩 / 强控：`_baseFromAnim()` 说 'stun' 的那三位（晕眩 / 冻结 / 沉睡）——
  //    与倒地同一条纪律：期间一个字节都不写，绝不替宿主重建模型（根因见本文件抬头 v1.6.0 段）。
  if (isControlView(v)) return 'stun';
  // 替身 / 形态：clip 集可能对不上
  if (v.form) return 'form';
  // 备战盘 / 侦察盘 / 预览栏 / 首领：dir 就是玩家正在编辑的部署方向，宿主每次同步都会重设
  if (v.prep === true) return 'prep';
  // ★ 宿主自己的判据：有没有 back 模型
  if (!viewHasBack(v)) return 'noback';
  return '';
}

/** 把宿主自己的那三个"朝向指示"字段按记录还原；`hasDir` 只在"我们真的覆盖了 dir"期间压住。 */
function syncIndicators(v, s) {
  try {
    if (!v || v.destroyed) return;
    if (v.facing !== s.baseFacing) v.facing = s.baseFacing;
    if (v.visFacing !== s.baseVis) v.visFacing = s.baseVis;
    const want = v.dir === s.baseDir ? !!s.baseHasDir : false;
    if (v.hasDir !== want) v.hasDir = want;
  } catch { /* ignore */ }
}

/** 正面时该挂哪个 dir：宿主原本就是 UP 的话必须换一个非 UP 的（否则 `_wantsBack()` 仍为真、模型根本不会换）。 */
function frontDirOf(s) {
  return s.baseDir === FB_BACK_DIR ? FB_FRONT_DIR : s.baseDir;
}

/** 这一帧该用的横向符号：屏幕上挂的是背面资产 ⇒ −1 ⇒ 用 |cos θ|。 */
const signOf = (v) => (v && v.entryBack === true ? -1 : 1);

/**
 * 造一个"换面器"。生命周期与引擎一致：每帧 `step()`，关掉 / 卸载时 `restoreAll()`。
 *
 * ★ 状态按**视图对象**记（WeakMap：视图销毁自动回收），另有一份**分组 → 视图集合**用于枚举还原
 *   （Set 里持有强引用，所以引擎会定期 `prune()` 掉已销毁的）。
 *
 * @param {{ log?: any }} [opts]
 */
export function createFrontBack({ log = null } = {}) {
  /** 视图 → { baseDir, baseFacing, baseVis, baseHasDir, want, gid } */
  const st = new WeakMap();
  /** 分组 → 被我们接管过的视图集合（还原时要能枚举）。 */
  const byGroup = new Map();

  const stats = {
    gate: false,          // 本帧换面功能是否开着（开关 + 绕竖直轴）
    eligible: 0,          // 本帧判定为"可以换面"的单位数
    back: 0,              // 本帧结束时挂着背面资产的单位数（entryBack === true）
    swaps: 0,             // 本帧发生的换面次数（正→背、背→正**各算 1 次** ⇒ 一个周期应恰好 2 次）
    swapsTotal: 0,        // 累计
    everManaged: 0,       // 累计接管过多少个视图（去重按"接管次数"，视图销毁后可能重复）
    noBack: 0,            // 本帧因为"没有 back 模型"而跳过的单位数
    held: 0,              // 本帧因为"倒地 / 死亡 / 淡出"而**保持不动**的单位数
    stun: 0,              // ★ v1.6.0：本帧因为"晕眩 / 冻结 / 沉睡"而**保持不动**的单位数（一个字节都不写）
    blocked: 0,           // 本帧因为其它原因（替身 / 备战 / 敌人）跳过的单位数
    restored: 0,          // 累计被还原的视图数
    managed: 0,           // 本帧 dir 真的被我们改着的视图数
  };

  function groupSet(gid) {
    let s = byGroup.get(gid);
    if (!s) { s = new Set(); byGroup.set(gid, s); }
    return s;
  }

  /** 取（必要时建）某个视图的记录 —— **记录的那一刻就是"宿主原值"的基准**。 */
  function stateOf(v, gid) {
    let s = st.get(v);
    if (!s) {
      s = {
        baseDir: typeof v.dir === 'string' && v.dir ? v.dir : FB_FRONT_DIR,
        baseFacing: v.facing === -1 ? -1 : 1,
        baseVis: v.visFacing === -1 ? -1 : 1,
        baseHasDir: !!v.hasDir,
        want: false,
        gid,
      };
      st.set(v, s);
      groupSet(gid).add(v);
      stats.everManaged++;
    }
    return s;
  }

  /** 把 dir 换成 `dir`（变了才调 setDir），随后立刻还原三个"朝向指示"字段。 */
  function applyDir(v, s, dir) {
    try {
      if (typeof dir === 'string' && dir && v.dir !== dir) v.setDir(dir);
    } catch (e) {
      log?.warn?.('[cyanfish.dj-models] setDir 失败（已忽略，重试下一帧）', e);
    }
    syncIndicators(v, s);
  }

  /** 完整还原一个视图：dir 回到宿主自己的值，三个指示字段逐值还原（销毁的视图只清状态）。 */
  function restoreOne(v, s) {
    if (!s) return;
    try {
      if (v && !v.destroyed && typeof v.setDir === 'function' && typeof s.baseDir === 'string' && v.dir !== s.baseDir) {
        v.setDir(s.baseDir);
      }
      if (v && !v.destroyed) {
        v.facing = s.baseFacing;
        v.visFacing = s.baseVis;
        v.hasDir = !!s.baseHasDir;
      }
      stats.restored++;
    } catch { /* ignore */ }
    st.delete(v);
    const set = byGroup.get(s.gid);
    if (set) set.delete(v);
  }

  /** 每帧开始时清零逐帧计数（累计量保留）。 */
  function beginFrame(gate) {
    stats.gate = !!gate;
    stats.eligible = 0;
    stats.back = 0;
    stats.swaps = 0;
    stats.noBack = 0;
    stats.held = 0;
    stats.stun = 0;
    stats.blocked = 0;
    stats.managed = 0;
  }

  /**
   * 每帧对一个单位视图调用一次。
   * @param {any} v 渲染层的 UnitView（"模型已加载"由 targets.js 的 modelReady 保证）
   * @param {number} cosT 本帧的 `cos θ`（= 引擎即将写进 scale.x 的轴转乘数）
   * @param {number} dead 死区
   * @param {string} gid 分组 id（用于分组还原）
   * @returns {number} 这一帧 scale.x 该用的**符号**：−1 ⇒ 屏幕上挂的是背面资产 ⇒ 横向用 |cos θ|
   */
  function step(v, cosT, dead, gid) {
    const why = fbBlockedBy(v);
    const s = st.get(v);
    if (why) {
      let sign = 1;
      if (s) {
        if (why === 'dead' || why === 'dying' || why === 'down') {
          // ★★ 倒地 / 死亡 / 淡出：**保持不动**，把 dir 留在原处 —— 宿主自己的 `_wantsBack()` 会在下一帧的
          //    `_syncModel()` 里决定要不要退回 Front 播死亡（131/135 个 Back 骨架没有 Die 剪辑）。
          stats.held++;
          sign = signOf(v);
        } else if (why === 'stun') {
          // ★★ v1.6.0 晕眩 / 强控：同样**保持不动**、**一个字节都不写**（不 setDir、不碰任何指示字段）。
          //    理由见本文件抬头：宿主的晕眩是 `spine.js` 的动画模式（还可能 `frozen` 冻住姿态），
          //    我们此刻换模型 = 替宿主在强控中途销毁并重建 SpineActor。
          //    强控一结束，下一帧的 `step()` 会照常按 `cos θ` 的符号重新对齐（那时才可能调一次 setDir）。
          stats.stun++;
          sign = signOf(v);
        } else {
          restoreOne(v, s);      // 替身 / 备战 / 没有 back / 敌人 / 视图换代：**逐值还原**，一个字节都不留
        }
      }
      if (why === 'noback') stats.noBack++;
      else if (why === 'form' || why === 'prep' || why === 'enemy') stats.blocked++;
      return sign;
    }
    stats.eligible++;
    const cur = stateOf(v, gid);
    const want = fbTarget(cosT, dead, cur.want);
    const dir = want ? FB_BACK_DIR : frontDirOf(cur);
    if (want !== cur.want) {
      cur.want = want;
      applyDir(v, cur, dir);
      stats.swaps++;               // ★ 正→背、背→正 各算 1 次
      stats.swapsTotal++;
    } else if (v.dir !== dir) {
      // 宿主有可能把 dir 写回去了（备战同步 / 朝向轮）⇒ 每帧对齐一次，但**不计**成"换面"
      applyDir(v, cur, dir);
    } else {
      syncIndicators(v, cur);
    }
    if (v.dir !== cur.baseDir) stats.managed++;
    if (v.entryBack === true) stats.back++;
    return signOf(v);
  }

  /** 这个视图此刻被我们管着吗（自省/报告用）。 */
  function isManaged(v) { return !!st.get(v); }

  /** 还原一个分组（分组开关关掉时）。 */
  function restoreGroup(gid) {
    const set = byGroup.get(gid);
    if (!set || !set.size) return;
    for (const v of [...set]) restoreOne(v, st.get(v));
    set.clear();
  }

  /** 还原全部（总开关关 / 功能关 / 视图换代 / 卸载）。 */
  function restoreAll() {
    for (const [gid, set] of [...byGroup]) {
      for (const v of [...set]) restoreOne(v, st.get(v));
      set.clear();
      byGroup.delete(gid);
    }
    stats.back = 0;
    stats.managed = 0;
  }

  /** 清掉已经销毁的视图引用（引擎每 240 帧调一次，防 Set 里攒死对象）。 */
  function prune() {
    for (const [gid, set] of [...byGroup]) {
      for (const v of [...set]) if (!v || v.destroyed) restoreOne(v, st.get(v));
      if (!set.size) byGroup.delete(gid);
    }
    return byGroup.size;
  }

  /** 给自省 API / 报告用的现场快照（**只读**）。 */
  function probe() {
    const rows = [];
    for (const [gid, set] of byGroup) {
      for (const v of set) {
        const s = st.get(v);
        if (!s) continue;
        rows.push({
          gid,
          id: (v.info && (v.info.spine || v.info.defId)) || null,
          dir: v.dir, baseDir: s.baseDir, want: !!s.want,
          entryBack: v.entryBack === true, hasBack: viewHasBack(v),
          alive: v.alive !== false, blocked: fbBlockedBy(v),
          anim: typeof v.anim === 'number' ? v.anim : null,
          uf: typeof v.flags === 'number' ? v.flags : null,
          stunned: isControlView(v),
          hasDir: !!v.hasDir, facing: v.facing === -1 ? -1 : 1, visFacing: v.visFacing === -1 ? -1 : 1,
        });
      }
    }
    return { gate: stats.gate, managed: rows.length, eligible: stats.eligible, back: stats.back, swaps: stats.swaps,
      swapsTotal: stats.swapsTotal, noBack: stats.noBack, held: stats.held, stun: stats.stun, blocked: stats.blocked, rows };
  }

  return { beginFrame, step, isManaged, restoreGroup, restoreAll, prune, probe, stats };
}
