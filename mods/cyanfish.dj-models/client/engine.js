// mods/cyanfish.dj-models/client/engine.js — 效果本体：找到渲染视图 → 每帧按**分组**改目标的 scale / rotation。
//
// ============================ 抓手（为什么不用改基座） ============================
// `public/js/ui/fieldHost.js:234` 宿主自己给 dev/E2E 挂了 `globalThis.__SP_VIEW__ = view;`
// （卸载时若仍指向自己会置回 null）。它是 guardView 包过的壳：`__SP_VIEW__.raw` 才是真视图
// （`public/js/render/app.js:1691` 的那个字面量对象）。真视图上的
// **`view.debug`（app.js:1844 `debug: { app, views, penViews, leader, tiles, fx, ctx, drag, pick }`）**
// 就是全部抓手：
//   · `debug.views`     : Map<key, view> —— 战斗/备战的全部 UnitView / DeviceView / ItemView
//   · `debug.penViews`  : Map<key, UnitView> —— 备战右侧的敌人预览栏（**不在 views 里**）
//   · `debug.leader`    : { key, view, … } —— 站在首领场上的回合首领（**既不在 views 也不在 penViews 里**）
//   · `debug.fx`        : FxSystem —— 伤害数字 / 粒子 / 弹道 / 地面环 / 技能光环 / 喷火 / 锁定环 / 区域
//   · `debug.app`       : PIXI.Application —— `.ticker` 就是宿主自己的 Ticker（app.js:1633 `app.ticker.add(frame)`）
// 全是**只读句柄**，不需要往 public/ 里加任何一行代码。
// ★ `debug.leader` 是 getter（app.js:1845）——首领随时会换人，所以每帧现读，不能缓存。
//
// ============================ ★★ v1.3.0：参数体系换成"4 个参数"（服主规格） ============================
// 服主口径（原话见 config.js 抬头）：
//   · **水平旋转速度**（滑块 = **旋转周期**，帧）         → `spinPeriod`
//   · **压缩周期**（每次竖向压缩-归位的周期，帧）          → `squashPeriod`
//   · **压缩强度**（压缩到最低时的高度，25%~75%）          → `squashMinPct`
//   · **横向补偿**（压缩到最低时的水平宽度倍率，100%~150%） → `widthMaxPct`
//   · **绕竖直轴 / 平面内旋转两种模式共用上面 4 个参数**；
//   · **不再有任何侧向偏移/透视**（老版的「转身透视」滑块与它对应的那个 PIXI 字段**整体删除**）。
//
// 每帧写进容器的东西只剩两样（这就是"没有倾斜"的机械保证）：
//   · `scale.x = 原值 × xK × axisK`，`scale.y = 原值 × yK`
//       – `yK`    = 竖向压缩（1 → squashMinPct/100 之间按余弦往复）
//       – `xK`    = 横向补偿（1 → widthMaxPct/100 之间按同一个相位走）
//       – `axisK` = `cos θ`（'axis' 模式）/ 1（'flat' 模式）
//   · `rotation = 原值 + θ`（**只在 'flat' 模式**；'axis' 模式不写 rotation）
//
// ============================ ★★ v1.6.0：两条修复（服主测试服实测） ============================
// ① **晕眩 / 强控期间绝不碰模型选择**（`frontback.js` 的 `'stun'` 分支，根因与行号写在那份文件抬头）：
//    宿主的晕眩是 `spine.js` 的**动画模式**（`mode = 'stun'`，没有 stun 剪辑就把姿态 `frozen` 冻住），
//    与"挂正面 / 背面骨架"正交。我们原来在晕眩期间照样按 `cos θ` 的符号调 `setDir()`
//    ⇒ 触发 `_syncModel()` → `_loadSpine()` → **在强控中途销毁并重建 SpineActor**（`spineReady = false`
//    那一段、`swapT` 交叉淡入、impostor 贴图路径都在那条路上）——服主看到的"渲染丢失 / 只渲染部分"。
//    现在晕眩 / 冻结 / 沉睡（宿主自己等同处理的那三位）期间**一个字节都不写**。
// ② **伤害数字改成"完整转圈"**（服主原话：「应该做成能够完整的转圈，而非仅是限定角度晃动」）：
//    `rotation = 原值 + θ`（0→360°，一个 `spinPeriod` 转满一圈，仍与全局周期逐值一致、可对齐音乐）；
//    ★ 仍然**不写 `scale.x`**（`axisK ≡ 1`）—— 不许退回轴转，`cos θ` 的横向压扁正是撕裂的根源。
//
// ============================ ★★ v1.5.1：伤害数字恢复"恒定平面旋转"（防撕裂） ============================
// 服主原话：「测试发现**伤害数字中轴旋转会出现撕裂现象**，将**伤害数字旋转单独改为平面旋转**。」
// 根因：'axis' 档的 `scale.x ∝ cos θ` 是把**整张位图连同字形**横向压扁 —— 24 px 的 BitmapText 压到零点几倍宽时
//   一个笔画只剩两三个像素（抗锯齿采样率 < 1 采样/像素）⇒ 笔画明暗随机化 ⇒ **撕裂 / 毛边 / 闪烁**。
// 治法（`config.js` 的 `FLAT_ONLY_GROUPS = ['num']`，判据在 `applyTarget` 的两行）：
//   · `num` 组**恒不写** `cos θ`（`axisK ≡ 1`）⇒ 横向只留"横向补偿"，**绝不被旋转压到过零**；
//   · `num` 组**恒写** `rotation`（v1.6.0：`原值 + θ` = **完整一圈 360°**）⇒ 平面内旋转，周期仍是全局 `spinPeriod`；
//   · 与全局 `spinMode` **解耦**（'axis' / 'flat' 两档下这一组的数值轨迹逐值相同，不叠加不双倍转）；
//   · **其它分组（fx / 单位 / 装置 / 血条 / DOM）照旧跟随全局档**，一个字都没改。
//   · ★ 只恢复"判据"，**不恢复** v1.1.0 的 `numSpinHz` / `numAmp` 两个专用参数（4 参数口径不动）。
//   2D 里"绕竖直轴转"本来就只能这样表达：**横向压窄 + 镜面翻转**，转到侧面时投影宽度趋 0 ——
//   服主口径明确说了"2D 图片就是中途压成 0 宽来体现出旋转"，所以这不是缺陷。
//   整个过程**不写 position / pivot**（= 没有任何侧向偏移），也**不写任何斜切字段**。
//
// ============================ 为什么改 `body`（宿主会不会覆写） ============================
//   1. `actor.spine.scale` 被宿主**每帧覆写**（units.js:1068 `this.actor.spine.scale.set(sc*flip, sc*this.modelKY)`）
//      ⇒ 写 spine 会被盖掉；而 `body.scale / rotation / position / pivot` 宿主**从头到尾没碰过**。
//      ★ 复核（`grep -n "\.body\.\(scale\|rotation\|pivot\|position\)" public/js -r` ⇒ **零命中**；
//        另外 `Select-String 'body\s*[:=]'` 在 render/ 里只命中 units.js:452 `this.body = new P.Container()`
//        与 453/456/585/1373/1448 的 addChild ⇒ 宿主只把它当纯容器，从不读写它的 transform）。
//   2. `body` 同时罩住 Spine 与 impostor 贴图 ⇒ 拥挤战场（走 impostor 那条路）也照样有弹簧效果。
//   3. `bounds()`（units.js:1481）与拾取（render/pick.js，按屏幕几何 + 地块）**都不读容器 transform**
//      ⇒ 命中判定 / 拖拽 / 方向轮 / 血条位置全都不受影响。
//
// ============================ 旋转是"绕单位自己的中轴、在原地"吗 ============================
//   · `this.body = new P.Container()`（units.js:452）**从未设置过** `position` / `pivot`
//     ⇒ 两者都是 PIXI 默认的 `(0,0)`。`body` 是 `root` 的子节点，而 `root.position.set(bx, by)`
//     （units.js:1019）就是**这个单位在地面上的投影点**（脚底）。
//   · `body` 的**唯一**子节点们都以这个"脚底点"为局部原点（`fallback` anchor(0.5,1)、`spine.position(0,0)`、
//     impostor 包围盒左右对称）⇒ `x = 0` 正是它们的**水平中心线**。
//   · `scale.x = s` 把局部点 `(x, y)` 映到 `(s·x, y)` —— 纵坐标不动，横坐标绕 `x = 0` 缩放
//     ⇒ **已经是"绕单位自己的竖直中轴"**。pivot 落在脚上不影响这个结论（`scale.x` 与 pivot 的 y 无关），
//     而 `scale.y` 绕脚缩放正是弹簧该有的样子（往地面压，不是横向位移）。
//   · 所以**不做 pivot 补偿**（补偿 = 主动位移，直接违反"原地"）；实测 `position` / `pivot` 在整个采样窗口里逐值不变。
//
// ============================ 预算（分组变多之后必须有） ============================
//   ① **每帧写入预算** `cfg.budget`：处理顺序 [op, enemy, token, device, item, hud, num, fx]，先到先得；
//      超预算的组整组跳过（stats.counts[g] = -1）。
//   ② **跳过不可见**：释放回池的粒子是 visible=false + alpha=0，收集阶段就丢掉。
//   ③ **缓存基准**：每个目标的对象 → `{ 原值 / 我们上次乘的系数 }` 存在 WeakMap 里（`state`），
//      每帧只做属性读写，不分配、不重算基准。

import { GROUP_BY_ID, FPS, FLAT_ONLY_GROUPS, FLAT_ONLY_MAX_DEG, isFlatOnlyGroup } from './config.js';
import { collectTargets } from './targets.js';
import { createFrontBack, fbGate, fbDeadOf } from './frontback.js';

// ============================ ★★ v1.5.0：转身换面（正/背）怎么接进来 ============================
// 服主需求：绕竖直轴转到**侧面（宽度过零）**那一刻把模型从正面换成背面、过了 180° 再换回来。
// 实现全在 `client/frontback.js`（判据 / 死区 / 状态机 / 宿主判据的来龙去脉都写在那里），这里只做三件事：
//   ① 每帧把 op / enemy / token 三个单位分组的**视图句柄**交给 `fb.step(view, cos θ, 死区, gid)`；
//   ② 它返回这一帧 scale.x 该用的**符号**：−1 ⇒ 屏幕上挂的是背面资产 ⇒ 横向用 `|cos θ|`（详见 frontback.js 抬头）；
//   ③ 关掉 / 换代 / 卸载时走 `fb.restoreAll()` / `fb.restoreGroup(gid)`，把 `dir` 与三个朝向指示字段**逐值还原**。
// ★ 它是**渲染层**动作（只调 `view.setDir()`）—— 不写任何 sim 状态、不发任何网络请求（见 index.js 的纪律）。
//
// 每帧写进容器的东西仍然只有两样（v1.4.0 的"没有倾斜"保证不变）：
//   · `scale.x = 原值 × xK × axisK × (换面符号)`，`scale.y = 原值 × yK`
//       – 换面符号在**功能关掉时恒为 +1** ⇒ 与 v1.4.0 逐值相同（回归项）。
//   · `rotation = 原值 + θ`（**只在 'flat' 模式**）。

/** 每帧回调挂到宿主 ticker 上的优先级。 */
//  PIXI v7 的 Ticker 按 priority **降序**执行（vendor/pixi.min.js `_addListener`: `t.priority > e.priority` 才插到前面），
//  宿主自己的 `frame` 是默认 NORMAL(0)，渲染在 LOW(-25)（app.js:1634 注释）。
//  ⇒ -20 落在"所有单位/特效更新完"与"开始渲染"之间，写进去的 transform 当帧就能看到。
export const TICK_PRIORITY = -20;

/** 找视图的轮询间隔（ms）。视图是按对局生命周期来去匆匆的，ticker 也随视图一起销毁 ⇒ 必须有独立心跳。 */
export const DISCOVER_MS = 200;

/** 单帧最大计入的 dt（秒）。标签页切回来时 rAF 会跳一大步，不夹住会让相位瞬移。 */
const MAX_DT = 0.25;

const TAU = Math.PI * 2;

/** 引擎处理分组顺序：目标少的先（保证单位/血条永远拿得到预算），特效最后。 */
export const GROUP_ORDER = Object.freeze(['op', 'enemy', 'token', 'device', 'item', 'hud', 'num', 'fx']);

/** 默认预算（cfg.budget 缺失时兜底）。 */
const DEFAULT_BUDGET = 400;

/**
 * 解析当前渲染视图的抓手。**任何一步拿不到就返回 null**（调用方静默降级，绝不抛）。
 * @param {any} [g] 全局对象（测试可注入）
 * @returns {{ raw:any, views:Map<any,any>, penViews:Map<any,any>|null, fx:any|null, ticker:any|null }|null}
 */
export function resolveHost(g = globalThis) {
  try {
    const safe = g ? g.__SP_VIEW__ : null;
    if (!safe) return null;
    // __SP_VIEW__ 是 fieldHost.guardView 的壳；.raw 才是真视图（老宿主没有 .raw 时直接当它是真的）
    const raw = safe.raw && typeof safe.raw === 'object' ? safe.raw : safe;
    const dbg = raw.debug;
    const views = dbg && dbg.views;
    if (!views || typeof views.values !== 'function') return null;
    const app = dbg.app;
    const ticker = app && app.ticker && typeof app.ticker.add === 'function' && typeof app.ticker.remove === 'function'
      ? app.ticker : null;
    return { raw, views, penViews: dbg.penViews || null, fx: dbg.fx || null, ticker };
  } catch {
    return null;
  }
}

/** 数字裁剪。 */
const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 秒 → 周期的安全值（帧数至少 1，且必须有限）。 */
const periodSec = (frames) => Math.max(1, Number.isFinite(frames) ? frames : 1) / FPS;

/**
 * 本帧要写进容器的乘数（纯函数，便于单测与报告复算）。
 *
 * ★ 相位与形状（v1.3.0 定稿）：
 *   · 压缩 `s(τ) = (1 − cos(2π·τ/Tq)) / 2 ∈ [0,1]`：τ = 0 时 s=0（原高），τ = Tq/2 时 s=1（压到最低），
 *     τ = Tq 时回到 0 ⇒ **一个 Tq（= squashPeriod 帧）就是一次"压缩-归位"**，与滑块刻度一一对应。
 *   · `yK = 1 − (1 − M)·s`，M = squashMinPct/100 ⇒ 最低点高度**精确等于**滑块百分比。
 *   · `xK = 1 + (W − 1)·s`，W = widthMaxPct/100 ⇒ 最低点宽度**精确等于**滑块百分比。
 *   · `θ(τ) = 2π·τ/Ts`（Ts = spinPeriod 帧）⇒ 一个 Ts 正好转一圈（'axis' 模式取 cos θ，'flat' 模式写 rotation）。
 *
 * @param {{ squashPeriod:number, spinPeriod:number, squashMinPct:number, widthMaxPct:number, spinMode:string }} c
 * @param {number} phase 已经累计的动画时间（秒）
 * @returns {{ yK:number, xK:number, axisK:number, theta:number, axis:boolean, s:number }}
 *   yK     —— 竖向乘数（弹簧本体）
 *   xK     —— 横向补偿乘数
 *   axisK  —— 绕竖直轴：cos θ（'flat' 模式下恒 1）
 *   theta  —— 旋转角（弧度；'axis' 模式下只用来取 cos，不写 rotation）
 *   s      —— 归一化压缩深度（0 = 原高，1 = 最低）—— 报告里复算"最低点"用
 */
export function frameFactors(c, phase) {
  const M = clampNum((num0(c && c.squashMinPct, 60)) / 100, 0.05, 1);
  const W = clampNum((num0(c && c.widthMaxPct, 110)) / 100, 1, 2);
  const Tq = periodSec(num0(c && c.squashPeriod, 38));
  const Ts = periodSec(num0(c && c.spinPeriod, 67));
  const s = 0.5 - 0.5 * Math.cos(TAU * (Number(phase) || 0) / Tq);
  const theta = TAU * (Number(phase) || 0) / Ts;
  const axis = !c || c.spinMode !== 'flat';
  return { yK: 1 - (1 - M) * s, xK: 1 + (W - 1) * s, axisK: axis ? Math.cos(theta) : 1, theta, axis, s };
}

/** 数值兜底（NaN / undefined 都用默认值）。 */
function num0(v, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

// ============================ ★★ v1.5.1 / v1.6.0：恒定平面旋转（防撕裂保护） ============================
// 服主原话（v1.5.1）：「测试发现**伤害数字中轴旋转会出现撕裂现象**，将**伤害数字旋转单独改为平面旋转**。」
// 服主原话（v1.6.0）：「**伤害数字水平旋转是应该做成能够完整的转圈，而非仅是限定角度晃动**。」
//
// 根因：'axis' 档只能靠 `scale.x = 原值 × cos θ` 表达绕竖直轴 —— 那是把**整张位图连同字形**横向压扁。
//   伤害数字是 24 px 的 BitmapText，压到零点几倍宽时笔画只剩两三个像素 ⇒ 抗锯齿采样率 < 1 采样/像素
//   ⇒ 笔画明暗随机化 ⇒ **撕裂 / 毛边 / 闪烁**（越接近侧面越明显，过零那一两帧几乎完全读不出）。
//   文字的唯一用途就是"读" ⇒ 这一组必须**恒为平面内旋转**。
//
// 实现只有**两处判据**（见 applyTarget）：
//   ① 横向：`axisK` 恒取 **1** ⇒ `scale.x = 原值 × xK`（只留"横向补偿"，那个与旋转无关、照旧）；
//   ② 旋转：**恒写** `rotation = 原值 + 旋转角`（不再"轴档不写 rotation"）。
//      ★ v1.5.1 的旋转角是"±15° 摆动"（`15°·sin θ`）；**v1.6.0 换成完整一圈**（`θ` 本身，0→360°）。
//   ⇒ 与全局 `spinMode` **解耦**：全局 'axis' 时它是平面旋转；全局 'flat' 时**行为逐值相同**（不叠加、不双倍转）。
//   ★ 竖向压缩 `yK` 与横向补偿 `xK` **一个字都没改** —— 它们与旋转无关，两组照样共用同一套弹簧参数。

/**
 * ★★ v1.6.0：**恒定平面旋转的旋转角**（纯函数，便于单测与报告复算）——
 * **完整一圈 360°**：直接用全局那个旋转相位 θ（`2π·τ/spinPeriod`）本身。
 *   · `rotation = 原值 + flatOnlyTheta(θ)` ⇒ 一个 `spinPeriod` 正好转满一圈（θ 单调递增 ⇒ 只往一个方向转）；
 *   · **周期与全局逐值相同**（共用同一个 θ ⇒ 同一个 `spinPeriod`，"跟着节奏走 / 可对齐音乐"照旧）；
 *   · ★ 与 v1.5.1 的差别只有这一句：v1.5.1 是 `15°·sin θ`（有界摆动、过零会折返），
 *     现在是 `θ`（整圈、始终同向）。
 * @param {number} theta 旋转相位（弧度）
 * @returns {number} 要写进 `rotation` 的**增量**（弧度；`FLAT_ONLY_FULL_TURN` 为真时就是 θ 本身）
 */
export function flatOnlyTheta(theta) {
  const t = Number(theta);
  if (!Number.isFinite(t)) return 0;
  // ★ 口径在 config.js：`FLAT_ONLY_MAX_DEG === 360`（`FLAT_ONLY_FULL_TURN` 为真）⇒ 整圈，直接写 θ；
  //   否则退回 v1.5.1 的 ±15° 摆动（一行回滚）。
  if (FLAT_ONLY_MAX_DEG >= 360) return t;
  return (FLAT_ONLY_MAX_DEG * Math.PI / 180) * Math.sin(t);
}

// ============================ 混乱模式（chaos，v1.2.0 起，语义不变） ============================
// 服主口径：「开启时**所有可旋转目标**都会有随机的时间偏移 + 压缩程度在设定值附近活动，
//           但**仍保证周期与设定值相同**」。
// ⇒ 只随机两样东西，**绝不随机频率**：
//     ① 相位偏移 φ —— 每个目标在它自己的周期里错开一个固定比例（= 时间偏移）；
//     ② 幅度扰动   —— 每个目标围绕设定幅度上下活动。
// ★ v1.3.0：新的"幅度"是**两个**（压缩强度 = 1 − M，横向补偿 = W − 1），
//   它们**乘同一个幅度因子 `af`** ⇒ 压缩强度与横向补偿**同时**在设定值附近游走（服主口径：
//   "它的幅度要同时作用在压缩强度与横向补偿上"）。两处一起缩放才能保持"压得越扁、摊得越开"的联动关系，
//   若只缩放其中一个，观感会变成"压扁了却不横向摊开"（不像被压，像被裁）。
//   下限保护：压缩深度夹在 ≤ 0.95（yK 仍 > 0.05，绝不会出现 0 高度）。
// ★ 幅度"在设定值附近活动"是怎么算的：
//     factor = 1 + chaosAmp/2 · inst + chaosAmp/2 · wander
//     · `inst ∈ [-1, 1]` 是**每个目标自己的固定随机量**（"这个目标天生比别人轻一点 / 重一点"）；
//     · `wander ∈ (-1, 1)` 是**低频游走**（同一个目标自己随时间缓慢起伏）；
//     · 两者各占一半权重 ⇒ |factor - 1| ≤ chaosAmp，**永远不越界**（默认 chaosAmp=0.35 ⇒ factor ∈ [0.65, 1.35]）。
// ★ 周期为什么严格不变：φ 只进 sin/cos 的**相位**，幅度因子只乘在**深度**上（恒 > 0）
//   ⇒ 压缩量的零交叉位置与未开混乱时逐点相同（验收里用"零交叉实测周期 vs 设定周期"的误差证明）。
// ★ 状态按**目标对象**记（WeakMap）⇒ 目标销毁即随之回收；播种按对象的 name/uid（确定性）
//   ⇒ 同一个目标不会因为一次开关就换一套随机数。

const CHAOS_SEED_BASE = 0x9e3779b9;

/** 32 位整数散列（确定性；同一目标永远得到同一套随机数）。 */
function hash32(x) {
  let h = (x | 0) + CHAOS_SEED_BASE;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 一串字符串 → 稳定整数。 */
function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** 某个目标的稳定身份（用于播种）。拿不到名字就退化成"本引擎见过的第 N 个对象"。 */
function idOf(o, seq) {
  try {
    if (o && typeof o.name === 'string' && o.name) return strHash(o.name);
    if (o && o.uid != null) return strHash('uid:' + o.uid);
    if (o && o.label != null) return strHash('lbl:' + o.label);
    if (o && typeof o.constructor === 'function' && o.constructor.name) return strHash('c:' + o.constructor.name) + seq;
  } catch { /* ignore */ }
  return seq;
}

/** 从 [0,1) 均匀取值。 */
const u01 = (h, salt) => (hash32((h | 0) ^ Math.imul(salt, 0x27d4eb2d)) % 100003) / 100003;

/** 造一份随机状态（确定性）。 */
export function makeChannel(seed, cfg) {
  const h = hash32(seed | 0);
  const wHz = clampNum(num0(cfg && cfg.chaosWanderHz, 0.12), 0.02, 1);
  return {
    seed: h,
    /** 这份随机状态这一帧在不在用（混乱关掉 ⇒ false）。 */
    active: false,
    /** 相位偏移比例 φ ∈ [-1, 1]（真正生效时再乘 chaosPhi 与周期）。 */
    phiFrac: u01(h, 0x11) * 2 - 1,
    /** 幅度扰动常量随机量 ∈ [-1, 1]。 */
    inst: u01(h, 0x22) * 2 - 1,
    /** 游走：两个互质低频的比例（0.6 : 1.7）叠加 ⇒ 起伏不重复、看起来"随机"。 */
    w1: wHz * (0.6 + 0.5 * u01(h, 0x33)),
    w2: wHz * (1.7 + 0.8 * u01(h, 0x44)),
    p1: u01(h, 0x55) * TAU,
    p2: u01(h, 0x66) * TAU,
  };
}

/**
 * 低频游走 ∈ (-1, 1)，取值为 0 的时刻**与相位无关**（因为它是 t 的函数，不含 φ）。
 * 归一化：(sin+sin)/2 的幅度是 1 ⇒ 结果严格落在 (-1,1)。
 */
export function chaosWander(ch, t) {
  return 0.5 * (Math.sin(TAU * ch.w1 * t + ch.p1) + Math.sin(TAU * ch.w2 * t + ch.p2));
}

/**
 * 把"设定幅度 + 混乱扰动"算成这一帧真正要用的**幅度因子**（纯函数，便于报告复算）。
 *   factor = 1 + a·inst + a·wander，其中 a = chaosAmp/2，inst/wander ∈ [-1,1] ⇒ |factor-1| ≤ chaosAmp。
 * @param {object} ch makeChannel() 的产物
 * @param {number} t 动画时间（秒）
 * @param {number} chaosAmp 混乱幅度（± 比例）
 * @returns {number} 幅度因子（1 = 就是设定值）
 */
export function chaosFactor(ch, t, chaosAmp) {
  const a = clampNum(num0(chaosAmp, 0.35), 0, 0.9) / 2;
  return 1 + a * clampNum(ch.inst, -1, 1) + a * chaosWander(ch, t);
}

/**
 * 造一个引擎实例。生命周期：`attach()` → 每帧 → `dispose()`。
 *
 * 设计取舍：
 *   · 引擎**自己**只读 `getConfig()` 的当前值 ⇒ 滑块改参数"实时生效"，不需要重挂回调。
 *   · 只有 `on === true` 时才真的写容器；`on === false`（或某一组关掉）时把写过的容器**逐个还原**再退出。
 *   · 全程 try/catch + 计数，绝不把异常抛进宿主的 rAF（那会连累整个战场渲染）。
 *
 * @param {{ getConfig:() => any, log?: any, win?: any, g?: any, nowMs?: () => number }} opts
 */
export function createEngine({ getConfig, log = null, win = globalThis, g = globalThis, nowMs = () => performance.now() } = {}) {
  /** 目标对象 → 我们记下的基准值 / 上次写入值（**缓存句柄**，每帧不再重算）。 */
  const state = new WeakMap();
  /** ★ v1.5.0：转身换面器（判据 / 死区 / 状态机 / 还原都在 client/frontback.js）。 */
  const fb = createFrontBack({ log });
  /** 目标对象 → 混乱模式的那一份随机状态（φ / 幅度扰动 / 游走）。按对象记 ⇒ 目标销毁自动回收。 */
  const channel = new WeakMap();
  /** 分组 → 已经被我们写过的对象集合（关组 / 关总闸 / 卸载时要还原）。 */
  const touched = new Map();
  /** 分组 → 复用的收集数组（每帧零分配）。 */
  const scratch = new Map();
  /** resolveHost() 的壳对象：每帧原地更新（首领视图要现读）。 */
  const hscratch = { raw: null, views: null, penViews: null, fx: null, ticker: null, leaderView: null };
  /** ★ 未开混乱时的共享乘数（所有目标同相、同幅度 ⇒ 每帧只算一次，零分配）。 */
  const baseCtx = { xK: 1, yK: 1, axisK: 1, axis: true, theta: 0, s: 0, af: 1, ch: null };
  /** 上一帧开着的分组（用来发现"这一帧关掉了"→ 还原一次）。 */
  const wasOn = new Set();

  let host = null;            // resolveHost() 的结果
  let attach = null;          // { ticker } | { raf: true }
  let rafId = 0;
  let timer = 0;
  let phase = 0;              // 动画相位（秒）
  let lastT = 0;              // 上一帧的时间戳（秒）
  let tickNo = 0;
  let disposed = false;
  let writes = 0;             // 累计写次数（自证"真的在动"）
  /** ★ v1.5.0：上一帧换面功能是否开着（用来发现"这一帧关掉了"⇒ 还原一次）。 */
  let fbWasOn = false;
  /** ★ v1.5.0：dev/E2E 专用 —— 冻结旋转相位（度）。null = 不冻结（正式游玩永远是 null）。 */
  let holdDeg = null;

  const counts = {};
  for (const gid of GROUP_ORDER) counts[gid] = 0;

  const stats = {
    hook: null,               // 'app' | 'raf' | null
    view: false,              // 现在拿得到渲染视图吗
    on: false,                // 本帧总闸是不是开着
    groupsOn: 0,              // 本帧开着的分组数
    ops: 0,                   // 本帧写了几个干员容器（v1.0.0 的字段名，保留）
    others: 0,                // 本帧写过的非干员目标数
    pending: 0,               // 单位视图模型还没加载完（本帧没动）
    everTouched: 0,           // 当前还记着的已写对象数（所有分组相加）
    writes: 0,
    writesFrame: 0,           // 本帧实际写入数
    budget: 0,                // 本帧生效的预算
    budgetHit: 0,             // 本帧因为预算被跳过/截断的分组数
    // ---- ★ v1.5.1：恒定平面旋转（防撕裂）的自证字段 ----
    flatWrites: 0,            // 本帧走"恒定平面旋转"分支的写入数（= 本帧的伤害数字 / 浮动标签数）
    flatGroups: FLAT_ONLY_GROUPS.join(','),   // 白名单（只有 'num'）
    flatMaxDeg: FLAT_ONLY_MAX_DEG,            // 该分支的摆角上限（度）
    costMs: 0,                // 本帧 tick 自身耗时的 EMA（ms）
    costMsMax: 0,             // 见过的单帧最大耗时（ms）
    errors: 0,
    phase: 0,
    // ---- 4 个旋转参数的回显（"参数真的进了引擎"的直接证据）----
    spinPeriod: 0,
    squashPeriod: 0,
    squashMinPct: 0,
    widthMaxPct: 0,
    // ---- 混乱模式的自证计数（"周期不变"是断言，不是口号）----
    chaos: false,
    chaosTargets: 0,          // 本帧带随机状态的目标数
    chaosPhiMin: 0,
    chaosPhiMax: 0,
    chaosAfMin: 0,
    chaosAfMax: 0,
    chaosAfSum: 0,
    // ---- ★ v1.5.0：转身换面（正/背）的自证计数 ----
    fb: false,                // 本帧换面功能是否开着（fbSwap 开关 + 绕竖直轴模式）
    fbEligible: 0,            // 本帧判定为"可以换面"的单位数
    fbBack: 0,                // 本帧结束时挂着**背面资产**的单位数（entryBack === true）
    fbSwaps: 0,               // 本帧换面次数（正→背、背→正各 1 次 ⇒ 一个周期恰好 2 次）
    fbSwapsTotal: 0,          // 累计换面次数
    fbEverManaged: 0,         // 累计接管过的视图数
    fbNoBack: 0,              // 本帧因为"宿主说没有 back 模型"而跳过的单位数
    fbHeld: 0,                // 本帧因为"倒地 / 死亡 / 淡出"而保持不动的单位数
    fbStun: 0,                // ★ v1.6.0：本帧因为"晕眩 / 冻结 / 沉睡"而保持不动的单位数（一个字节都不写）
    fbBlocked: 0,             // 本帧因为替身 / 备战盘 / 敌人而跳过的单位数
    fbRestored: 0,            // 累计被还原的视图数
    fbManaged: 0,             // 本帧 dir 真的被我们改着的视图数
    fbDead: 0,                // 本帧生效的死区
    counts,
  };

  const cfg = () => {
    const c = getConfig ? getConfig() : null;
    return c && typeof c === 'object' ? c : null;
  };

  /** 取（必要时建）某个对象的基准记录。 */
  function stOf(o) {
    let s = state.get(o);
    if (!s) { s = {}; state.set(o, s); }
    return s;
  }

  /** 本引擎见过的对象数（给"没有名字"的对象当播种用；单调递增，确定性只需要"稳定"）。 */
  let seenNo = 0;

  /** 每目标一份的可变 ctx（WeakMap 缓存，每帧只写字段、不分配）。 */
  const ctxs = new WeakMap();
  function ctxOf(o) {
    let x = ctxs.get(o);
    if (!x) {
      x = { xK: 1, yK: 1, axisK: 1, axis: true, theta: 0, s: 0, af: 1, ch: null };
      ctxs.set(o, x);
    }
    return x;
  }

  /** 取（必要时建）某个目标的混乱随机状态（确定性播种）。 */
  function chOf(o, c) {
    let ch = channel.get(o);
    if (!ch) {
      ch = makeChannel(idOf(o, (seenNo = (seenNo + 1) | 0)), c);
      channel.set(o, ch);
    }
    ch.active = c && c.chaos === true;
    return ch;
  }

  /** 该分组"写过的对象"集合。 */
  function setOf(gid) {
    let s = touched.get(gid);
    if (!s) { s = new Set(); touched.set(gid, s); }
    return s;
  }

  /** 收集数组（每个分组一个，永久复用）。 */
  function scratchOf(gid) {
    let a = scratch.get(gid);
    if (!a) { a = []; scratch.set(gid, a); }
    return a;
  }

  /**
   * 把一个目标还原到"我们碰它之前"的样子。
   * 'free' 字段直接写回原值；'div' 字段只有在"当前值还是我们最后写下的那个"时才除回系数
   * （否则说明宿主这一帧已经用绝对值重写过，我们不动它）；pivot 一并还原。
   */
  function restoreOne(o, s) {
    if (!o || o.destroyed || !s) return;
    try {
      if (o.scale) {
        if (typeof s.sx === 'number') {
          o.scale.set(s.sx, s.sy);
        } else if (typeof s.lx === 'number' && (s.lx !== 1 || s.ly !== 1)) {
          if (Number.isFinite(s.wx) && Number.isFinite(s.wy)
            && Math.abs(o.scale.x - s.wx) < 1e-4 && Math.abs(o.scale.y - s.wy) < 1e-4) {
            o.scale.set(s.wx / s.lx, s.wy / s.ly);
          }
          s.lx = 1; s.ly = 1;
        }
      }
      if (typeof s.rot === 'number' && typeof s.wr === 'number' && typeof o.rotation === 'number') {
        if (Math.abs(o.rotation - s.wr) < 1e-6) o.rotation = s.rot;
      }
      if (typeof s.ax === 'number' && o.pivot && o.position) {
        o.pivot.set(typeof s.oax === 'number' ? s.oax : 0, typeof s.oay === 'number' ? s.oay : 0);
        o.position.set(typeof s.opx === 'number' ? s.opx : 0, typeof s.opy === 'number' ? s.opy : 0);
        s.ax = undefined;
      }
    } catch { stats.errors++; }
  }

  /** 还原一个分组写过的全部对象。 */
  function restoreGroup(gid) {
    const set = touched.get(gid);
    if (!set || !set.size) return;
    for (const o of set) restoreOne(o, state.get(o));
    set.clear();
  }

  /** 还原所有分组（关总闸 / 视图换代 / 卸载都走它）。 */
  function restoreAll() {
    for (const gid of touched.keys()) restoreGroup(gid);
    // ★ v1.5.0：换面留下的 dir / facing / visFacing / hasDir 也一并逐值还原
    //   （视图换代时旧视图已经被 destroy ⇒ restoreOne 只清状态、不写它；这正是我们要的）
    fb.restoreAll();
    chaosDeactivate();
    wasOn.clear();
    stats.everTouched = 0;
    stats.ops = 0;
    stats.others = 0;
    for (const gid of GROUP_ORDER) counts[gid] = 0;
  }

  /** 把"这一帧在用随机状态"的标记清掉（混乱关掉 / 还原时）。值保留 ⇒ 再打开时逐点一模一样。 */
  function chaosDeactivate() {
    for (const set of touched.values()) {
      for (const o of set) {
        const ch = channel.get(o);
        if (ch) ch.active = false;
      }
    }
  }

  /** 本帧现读首领视图（debug.leader 是 getter，首领随时换人）。 */
  function liveLeader(h) {
    try {
      const dbg = h.raw && h.raw.debug;
      const l = dbg ? dbg.leader : null;
      return l && l.view ? l.view : null;
    } catch { return null; }
  }

  /**
   * 把一个目标"本帧要写的乘数"算出来，并在开了混乱模式时叠加该目标自己的 φ 与幅度扰动。
   * @param {number} t 全局动画时间（秒）
   * @param {object} c 当前配置
   * @param {object} ctx 复用的输出对象（含每目标那份 ch）
   * @returns {object} ctx
   */
  function outCtx(t, c, ctx) {
    const on = c.chaos === true;
    const M = clampNum(num0(c.squashMinPct, 60) / 100, 0.05, 1);
    const W = clampNum(num0(c.widthMaxPct, 110) / 100, 1, 2);
    const Tq = periodSec(num0(c.squashPeriod, 38));
    const Ts = periodSec(num0(c.spinPeriod, 67));
    // 幅度因子（⚠ 未开混乱时也算 —— 只用于统计/回显；没有 ch 时恒 1）
    const af = ctx.ch ? chaosFactor(ctx.ch, t, c.chaosAmp == null ? 0.35 : c.chaosAmp) : 1;
    const dPhi = on && ctx.ch ? ctx.ch.phiFrac * clampNum(num0(c.chaosPhi, 0.5), 0, 1) : 0;
    const effAf = on ? af : 1;
    // ★ φ 只进相位（周期一个字节都没改）；af 只乘深度（压缩强度与横向补偿**同时**走）
    const s = 0.5 - 0.5 * Math.cos(TAU * (t + dPhi * Tq) / Tq);
    const depth = clampNum((1 - M) * effAf, 0, 0.95);
    const width = clampNum((W - 1) * effAf, 0, 1);
    const axis = c.spinMode !== 'flat';
    const theta = TAU * (t + dPhi * Ts) / Ts;
    ctx.yK = 1 - depth * s;
    ctx.xK = 1 + width * s;
    ctx.axis = axis;
    ctx.axisK = axis ? Math.cos(theta) : 1;
    ctx.theta = theta;
    ctx.s = s;
    ctx.af = effAf;
    // ★ v1.5.0：dev/E2E 的"冻结相位"（正式游玩永远 null）—— 精确把 θ 定在给定角度、且不压缩，
    //   便于截图取"正面 / 侧面（窄）/ 背面"这些**确定**的相位。只影响这一帧写进容器的值。
    if (holdDeg != null) {
      const th = holdDeg * Math.PI / 180;
      ctx.theta = th;
      ctx.axisK = axis ? Math.cos(th) : 1;
      ctx.s = 0;
      ctx.yK = 1;
      ctx.xK = 1;
    }
    return ctx;
  }

  /**
   * 把一份参数乘数写进一个目标。`ctx` 是 outCtx() 的产物：{ xK, yK, axisK, theta, s }。
   * ★ v1.5.0：`axisSign` = 换面器给出的横向符号（−1 ⇒ 屏幕上挂的是背面资产 ⇒ 用 |cos θ|）。
   *   功能关掉 / 非单位分组时恒为 **1** ⇒ 与 v1.4.0 的写法逐值相同。
   * ★★ v1.5.1：**恒定平面旋转**（`FLAT_ONLY_GROUPS`，即伤害数字）走一条**不吃轴转**的分支：
   *   `axis` 强制 false ⇒ `axisK ≡ 1`（**绝不写 cos θ，因此横向永不被压到 0**）且**恒写 rotation**。
   *   ★ v1.6.0：那条 rotation 是**完整一圈 360°**（`原值 + θ`），不再是 v1.5.1 的 ±15° 摆动。
   *   其余分组照旧（`axis = ctx.axis`）⇒ 'fx' / 单位 / UI 跟随全局档，一个字节未变。
   */
  function applyTarget(t, ctx, gid, axisSign) {
    const o = t.o;
    if (!o || o.destroyed) return 0;
    const sgn = axisSign === -1 ? -1 : 1;
    // ★★ v1.5.1：这一组是不是"恒定平面旋转"（伤害数字）。是 ⇒ 与全局档解耦（不吃 cos θ、恒写 rotation）。
    const flatOnly = isFlatOnlyGroup(gid);
    const axis = ctx.axis && !flatOnly;
    const axisK = axis ? ctx.axisK * sgn : 1;
    const s = stOf(o);
    // ---- 绕自身锚点（几何画在屏幕绝对坐标里的 Graphics / Mesh）----
    if (typeof t.ax === 'number' && typeof t.ay === 'number' && o.pivot && o.position) {
      if (s.ax !== t.ax || s.ay !== t.ay) {
        if (typeof s.oax !== 'number') {
          s.oax = o.pivot.x; s.oay = o.pivot.y; s.opx = o.position.x; s.opy = o.position.y;
        }
        o.pivot.set(t.ax, t.ay);
        o.position.set(t.ax, t.ay);
        s.ax = t.ax; s.ay = t.ay;
      }
    }
    // ---- 缩放（横向乘数 = 弹簧的横向补偿 × 轴转的 cos θ；恒定平面旋转的组只有前者）----
    //   ★ v1.3.0：这里就是"没有倾斜"的机械保证 —— 只写 scale 的两个分量，
    //     不写 position / pivot（除非该组本来就要绕屏幕锚点），不写任何斜切字段。
    if (t.scale === 'free' && o.scale) {
      if (typeof s.sx !== 'number') { s.sx = o.scale.x; s.sy = o.scale.y; }
      const x = s.sx * ctx.xK * axisK, y = s.sy * ctx.yK;
      o.scale.set(x, y);
      s.wx = x; s.wy = y;
    } else if (t.scale === 'div' && o.scale) {
      const lx = typeof s.lx === 'number' && s.lx !== 0 ? s.lx : 1;
      const ly = typeof s.ly === 'number' && s.ly !== 0 ? s.ly : 1;
      const x = (o.scale.x / lx) * ctx.xK * axisK, y = (o.scale.y / ly) * ctx.yK;
      o.scale.set(x, y);
      s.lx = ctx.xK * axisK; s.ly = ctx.yK; s.wx = x; s.wy = y;
    }
    // ---- 旋转（宿主从不写这个字段的才碰）----
    //   'axis' 档**不写 rotation**（轴转靠 scale.x 表达）；
    //   ★ v1.5.1：恒定平面旋转的组**无论全局哪一档都写 rotation**；
    //   ★ v1.6.0：写的是**完整一圈**（`原值 + θ`，0→360°），不再是 ±15° 摆动。
    if (t.rot === 'free' && typeof o.rotation === 'number') {
      if (typeof s.rot !== 'number') s.rot = o.rotation;
      o.rotation = axis ? s.rot : s.rot + (flatOnly ? flatOnlyTheta(ctx.theta) : ctx.theta);
      s.wr = o.rotation;
    }
    setOf(gid).add(o);
    return 1;
  }

  /** 每帧：按分组的顺序写容器的 transform（受预算约束）。 */
  function tick() {
    if (disposed) return;
    const t0 = nowMs();
    const c = cfg();
    if (!c || c.on !== true) {
      // 关：先把痕迹擦干净，然后**什么都不做**（回调还挂着，但一帧只花一次属性读取）
      if (wasOn.size || fbWasOn) { restoreAll(); fbWasOn = false; phase = 0; lastT = 0; }
      stats.view = !!host;
      stats.on = false;
      stats.groupsOn = 0;
      stats.writesFrame = 0;
      stats.chaos = false;
      stats.chaosTargets = 0;
      stats.chaosPhiMin = 0; stats.chaosPhiMax = 0;
      stats.chaosAfMin = 0; stats.chaosAfMax = 0; stats.chaosAfSum = 0;
      stats.fb = false; stats.fbEligible = 0; stats.fbBack = 0; stats.fbSwaps = 0;
      stats.fbNoBack = 0; stats.fbHeld = 0; stats.fbStun = 0; stats.fbBlocked = 0; stats.fbManaged = 0;
      stats.flatWrites = 0;      // ★ v1.5.1：关掉时这一条分支一帧都不走
      return;
    }
    stats.on = true;
    const t = t0 / 1000;
    let dt = lastT ? t - lastT : 0;
    lastT = t;
    if (!(dt > 0)) dt = 0; else if (dt > MAX_DT) dt = MAX_DT;
    phase += dt;
    stats.phase = phase;
    stats.spinPeriod = num0(c.spinPeriod, 67);
    stats.squashPeriod = num0(c.squashPeriod, 38);
    stats.squashMinPct = num0(c.squashMinPct, 60);
    stats.widthMaxPct = num0(c.widthMaxPct, 110);

    const h = host;
    if (!h) {
      if (wasOn.size || fbWasOn) { restoreAll(); fbWasOn = false; }
      stats.view = false;
      stats.hook = attach ? stats.hook : null;
      return;
    }

    const budget = Number.isFinite(c.budget) && c.budget > 0 ? Math.round(c.budget) : DEFAULT_BUDGET;
    const chaosOn = c.chaos === true;
    // ★ v1.5.0：转身换面的全局闸。关掉（开关关 / 平面内模式）时**立刻整体还原**一次。
    const fbOn = fbGate(c);
    if (!fbOn) { if (fbWasOn) { fb.restoreAll(); fbWasOn = false; } } else fbWasOn = true;
    const fbDead = fbDeadOf(c);
    fb.beginFrame(fbOn);
    stats.fb = fbOn;
    stats.fbDead = fbDead;
    // ★ 未开混乱时所有目标共用同一个乘数 ⇒ 只算一次（开混乱才逐目标算 φ 与 af）。
    const base = chaosOn ? null : outCtx(phase, c, baseCtx);
    // 复用同一个壳对象（首领每帧现读；每帧新建对象会在热路径上分配）
    const hh = hscratch;
    hh.raw = h.raw; hh.views = h.views; hh.penViews = h.penViews; hh.fx = h.fx; hh.ticker = h.ticker;
    hh.leaderView = liveLeader(h);

    let frameWrites = 0, budgetHit = 0, groupsOn = 0, pending = 0, flatWrites = 0;
    let chN = 0, chPhiMin = Infinity, chPhiMax = -Infinity, chAfMin = Infinity, chAfMax = -Infinity, chAfSum = 0;
    try {
      for (const gid of GROUP_ORDER) {
        const g = GROUP_BY_ID[gid];
        const on = !!g && c[g.key] !== false;
        if (!on) {
          if (wasOn.has(gid)) { restoreGroup(gid); wasOn.delete(gid); }
          fb.restoreGroup(gid);          // ★ v1.5.0：这一组被我们换过面的，dir 一并逐值还原
          counts[gid] = 0;
          continue;
        }
        wasOn.add(gid);
        groupsOn++;
        // ★ v1.5.1：这一组是不是"恒定平面旋转"（伤害数字）—— 每组算一次，热路径上不做查找。
        const flatG = isFlatOnlyGroup(gid);
        if (frameWrites >= budget) { counts[gid] = -1; budgetHit++; continue; }
        const info = { pending: 0 };
        const list = collectTargets(gid, hh, scratchOf(gid), info);
        if (gid === 'op') pending = info.pending;
        let n = 0;
        for (let i = 0; i < list.length; i++) {
          if (frameWrites >= budget) { budgetHit++; break; }
          const tgt = list[i];
          let ctx;
          if (chaosOn) {
            ctx = ctxOf(tgt.o);
            ctx.ch = chOf(tgt.o, c);
            outCtx(phase, c, ctx);
            chN++;
            const phi = ctx.ch.phiFrac * clampNum(num0(c.chaosPhi, 0.5), 0, 1);
            if (phi < chPhiMin) chPhiMin = phi;
            if (phi > chPhiMax) chPhiMax = phi;
            if (ctx.af < chAfMin) chAfMin = ctx.af;
            if (ctx.af > chAfMax) chAfMax = ctx.af;
            chAfSum += ctx.af;
          } else {
            ctx = base;
          }
          // ★ v1.5.0：转身换面（只对 op / enemy / token 的单位视图；它们才带 `v`）。
          //   返回 −1 表示"屏幕上挂的是背面资产" ⇒ 横向用 |cos θ|（理由见 frontback.js 抬头）。
          let sgn = 1;
          if (fbOn && tgt.v) sgn = fb.step(tgt.v, ctx.axisK, fbDead, gid);
          const wrote = applyTarget(tgt, ctx, gid, sgn);
          frameWrites++; n++; writes++;
          // ★ v1.5.1：本帧走"恒定平面内旋转（防撕裂）"分支的写入数（报告里的自证计数）
          if (wrote && flatG) flatWrites++;
        }
        counts[gid] = n;
      }
    } catch (e) {
      stats.errors++;
      if (stats.errors === 1) log?.warn?.('[cyanfish.dj-models] 帧内写入失败（已忽略，效果可能不完整）', e);
    }
    const cost = nowMs() - t0;
    stats.costMs = stats.costMs * 0.9 + cost * 0.1;
    if (cost > stats.costMsMax) stats.costMsMax = cost;
    stats.ops = counts.op > 0 ? counts.op : 0;
    stats.others = frameWrites - (counts.op > 0 ? counts.op : 0);
    stats.pending = pending;
    stats.groupsOn = groupsOn;
    stats.writesFrame = frameWrites;
    stats.budget = budget;
    stats.budgetHit = budgetHit;
    stats.writes = writes;
    // ★ v1.5.1：恒定平面旋转（防撕裂）的自证计数 —— 本帧有几个目标走了这条分支
    stats.flatWrites = flatWrites;
    stats.flatGroups = FLAT_ONLY_GROUPS.join(',');
    stats.flatMaxDeg = FLAT_ONLY_MAX_DEG;
    stats.chaos = chaosOn;
    stats.chaosTargets = chN;
    stats.chaosPhiMin = chN ? chPhiMin : 0;
    stats.chaosPhiMax = chN ? chPhiMax : 0;
    stats.chaosAfMin = chN ? chAfMin : 0;
    stats.chaosAfMax = chN ? chAfMax : 0;
    stats.chaosAfSum = chN ? chAfSum : 0;
    // ★ v1.5.0：转身换面的自证计数（报告里的"每周期恰好 2 次换面"就读这几个字段）
    stats.fbEligible = fb.stats.eligible;
    stats.fbBack = fb.stats.back;
    stats.fbSwaps = fb.stats.swaps;
    stats.fbSwapsTotal = fb.stats.swapsTotal;
    stats.fbEverManaged = fb.stats.everManaged;
    stats.fbNoBack = fb.stats.noBack;
    stats.fbHeld = fb.stats.held;
    stats.fbStun = fb.stats.stun;      // ★ v1.6.0：本帧"因为晕眩 / 强控而一个字节都不写"的单位数
    stats.fbBlocked = fb.stats.blocked;
    stats.fbRestored = fb.stats.restored;
    stats.fbManaged = fb.stats.managed;
    let ever = 0;
    for (const s of touched.values()) ever += s.size;
    stats.everTouched = ever;

    // 清掉已经销毁的对象引用（一场仗打完会死很多单位，不能无限攒）
    if (ever && (++tickNo % 240) === 0) {
      for (const set of touched.values()) for (const o of set) if (o.destroyed) set.delete(o);
      stats.everTouched = 0;
      for (const s of touched.values()) stats.everTouched += s.size;
      fb.prune();          // ★ v1.5.0：换面器里那份"分组 → 视图集合"同样要定期清死对象
    }
  }

  /** 找到视图后把回调挂到宿主自己的 ticker 上；ticker 拿不到就退化成自己的 rAF。 */
  function bind(h) {
    unbind();
    if (h && h.ticker) {
      try { h.ticker.add(tick, null, TICK_PRIORITY); attach = { ticker: h.ticker }; stats.hook = 'app'; return; }
      catch { stats.errors++; }
    }
    if (typeof win?.requestAnimationFrame === 'function') {
      const loop = () => { if (disposed || !attach || !attach.raf) return; rafId = win.requestAnimationFrame(loop); tick(); };
      rafId = win.requestAnimationFrame(loop);
      attach = { raf: true };
      stats.hook = 'raf';
    } else {
      stats.hook = null;
    }
  }

  /** 摘掉回调（**卸载时必须走到**，否则宿主热重载会累积泄漏）。 */
  function unbind() {
    const a = attach;
    attach = null;
    if (!a) { stats.hook = null; return; }
    if (a.ticker) { try { a.ticker.remove(tick); } catch { stats.errors++; } }
    if (a.raf && rafId) { try { win?.cancelAnimationFrame?.(rafId); } catch { /* ignore */ } }
    rafId = 0;
    stats.hook = null;
  }

  /**
   * `resolveHost()` 每次都返回**新对象**，所以判"换没换代"要按**关键句柄的身份**
   * （views / penViews / fx / ticker / raw 任一变了才算换代），否则每 200 ms 都会白做一次全量还原。
   */
  function sameHost(a, b) {
    if (!a || !b) return a === b;
    return a.raw === b.raw && a.views === b.views && a.penViews === b.penViews && a.fx === b.fx && a.ticker === b.ticker;
  }

  /** 心跳：视图（以及它的 ticker）随对局来去 ⇒ 定期重新解析抓手，换了就重挂。 */
  function discover() {
    if (disposed) return;
    const h = resolveHost(g);
    if (sameHost(h, host)) { stats.view = !!h; return; }
    // 视图换代：旧视图已经 destroy（它的容器也没了），直接换新
    restoreAll();
    host = h;
    stats.view = !!h;
    if (h) bind(h); else unbind();
  }

  return {
    attach() {
      if (disposed || timer) return;
      discover();
      timer = setInterval(discover, DISCOVER_MS);
      if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref();
    },
    /** 立刻跑一次心跳（dev / E2E 用：不等 200 ms）。 */
    refresh() { discover(); },
    /** 手动跑一帧（dev / E2E 断言用：不依赖 ticker 时机）。 */
    step() { tick(); return { ...stats, counts: { ...counts } }; },
    /** 某个分组此刻会被动的目标数（只读，E2E 采样用）。 */
    probe(gid) {
      const h = host;
      const out = [];
      if (!h) return out;
      const list = collectTargets(gid, { ...h, leaderView: liveLeader(h) }, [], { pending: 0 });
      for (const t of list) out.push(t.o);
      return out;
    },
    /**
     * 把**每个目标此刻的混乱状态**读出来（只读，给"φ 互不相同 / 幅度在设定值附近"的断言用）。
     *   · 只报 `ch.active === true` 的目标 ⇒ 混乱关掉时结果恒为空；探针本身不改行为。
     */
    chaosProbe() {
      const c = cfg() || {};
      const phiK = clampNum(num0(c.chaosPhi, 0.5), 0, 1);
      const targets = [];
      let i = 0;
      for (const gid of GROUP_ORDER) {
        for (const o of touched.get(gid) || []) {
          const ch = channel.get(o);
          if (!ch || ch.active !== true) continue;
          const x = ctxs.get(o);
          targets.push({ gid, i: i++, phi: +(ch.phiFrac * phiK).toFixed(6), af: x ? +x.af.toFixed(6) : 1 });
        }
      }
      let phiMin = Infinity, phiMax = -Infinity, afMin = Infinity, afMax = -Infinity, afSum = 0;
      const uniq = new Set();
      for (const t of targets) {
        if (t.phi < phiMin) phiMin = t.phi;
        if (t.phi > phiMax) phiMax = t.phi;
        if (t.af < afMin) afMin = t.af;
        if (t.af > afMax) afMax = t.af;
        afSum += t.af;
        uniq.add(t.phi);
      }
      const n = targets.length;
      return {
        on: c.chaos === true,
        targets,
        phiMin: n ? +phiMin.toFixed(6) : 0,
        phiMax: n ? +phiMax.toFixed(6) : 0,
        phiDistinct: uniq.size,
        afMin: n ? +afMin.toFixed(6) : 0,
        afMax: n ? +afMax.toFixed(6) : 0,
        afMean: n ? +(afSum / n).toFixed(6) : 0,
      };
    },
    /**
     * 给定相位，算出某个目标"本帧会写进去的乘数"（**纯计算，不写任何对象**）。
     * 合成验收里"把采样点铺满一个周期、给出 min/max(scale.x·scale.y)"直接用它。
     *   · q.gid / q.targetIndex —— 用哪个分组的第几个目标（混乱模式下不同目标的 φ 不同）
     *   · q.chaos —— 这一次计算是否按"混乱开"算（默认按当前配置）
     *   · q.phase —— 动画时间（秒）
     */
    factorsAt(q = {}) {
      const c0 = cfg() || {};
      const gid = q.gid || 'op';
      const chaos = q.chaos === undefined ? c0.chaos === true : q.chaos === true;
      const c = { ...c0, chaos };
      const list = this.probe(gid);
      const o = list.length ? list[Math.max(0, Math.min(list.length - 1, q.targetIndex | 0))] : null;
      const ch = o ? (channel.get(o) || makeChannel(idOf(o, 0), c)) : makeChannel(1, c);
      const x = { xK: 1, yK: 1, axisK: 1, theta: 0, s: 0, af: 1, ch };
      outCtx(Number(q.phase) || 0, c, x);
      const phiK = clampNum(num0(c.chaosPhi, 0.5), 0, 1);
      return {
        gid, chaos, hasTarget: !!o, targets: list.length,
        xK: x.xK, yK: x.yK, axisK: x.axisK, theta: x.theta, s: x.s, af: x.af,
        phi: (chaos && o) ? ch.phiFrac * phiK : 0,
        // ★ v1.5.1 / v1.6.0：这一组是否走"恒定平面旋转"分支 + 它本帧会写进去的 rotation 增量（弧度）
        //   v1.6.0：整圈档下 `flatTheta === theta`（跨度 2π），不再是有界摆动。
        flatOnly: isFlatOnlyGroup(gid),
        flatTheta: isFlatOnlyGroup(gid) ? flatOnlyTheta(x.theta) : 0,
        flatMaxDeg: FLAT_ONLY_MAX_DEG,
      };
    },
    stats() { return { ...stats, counts: { ...counts } }; },
    /**
     * ★ v1.5.0：**转身换面的现场快照**（只读，dev/E2E 与报告用）：
     *   `rows[]` 逐个列出被我们接管过的视图 —— id / 当前 dir / 宿主原 dir / entryBack（屏幕上挂的是不是背面上）/ hasBack /
     *   alive / blocked（为什么跳过）/ 三个朝向指示字段的当前值。
     */
    fbProbe() { return { ...fb.probe(), stats: { ...fb.stats } }; },
    /**
     * ★ v1.5.0：dev/E2E 专用 —— 把旋转相位**冻结**在给定角度（度），同时把压缩归零（`s = 0`、`yK = xK = 1`）
     * ⇒ 截图能取到"正面 / 侧面（窄）/ 背面"这些**确定**的相位。`null` = 解除冻结。
     * ★ 正式游玩**永远不会**调到它（只有 `__SP_DJ__.hold()` 会）。
     */
    hold(deg) {
      holdDeg = (typeof deg === 'number' && Number.isFinite(deg)) ? deg : null;
      return holdDeg;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) { clearInterval(timer); timer = 0; }
      unbind();
      restoreAll();
      fb.restoreAll();          // ★ v1.5.0：换面留下的 dir / 朝向指示字段一并逐值还原
      fbWasOn = false;
      holdDeg = null;
      touched.clear();
      scratch.clear();
      ctxs.clear?.();
      host = null;
      stats.hook = null;
      stats.view = false;
      stats.on = false;
    },
  };
}
