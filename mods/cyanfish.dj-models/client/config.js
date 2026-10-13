// mods/cyanfish.dj-models/client/config.js — 本 Mod 的参数：默认值 / 范围 / 清洗 / 老存档换算 / localStorage 持久化。
//
// ★ 存储键走本项目既有约定 `sp.pref.<短名>`（宿主 ui/settings.js = sp.pref.settings、公告 = sp.pref.announce、
//   皮肤语音 = sp.pref.skinvoice），这里 = `sp.pref.djModels`。
// ★ 本文件**不 import 宿主任何内部模块**（store.js 的 loadPref/savePref 是宿主内部路径，Mod 不该抓），
//   自己读写 localStorage；不可用（隐私模式 / Node 测试）时静默退化成"内存里的默认值"。
//
// ★★ 所有数值都过 `sanitize`：坏 JSON / 手改过的值 / 老版本残留字段都不会让引擎算出 NaN。
//    NaN 一旦进了 PIXI 的 scale，模型会直接消失（而且不报错），这是这类"整活 Mod"最容易踩的坑。
//
// ============================ ★★ v1.6.0：两条修复（服主测试服实测） ============================
// ① **晕眩 / 强控期间绝不碰模型选择**：宿主的"晕眩"是**动画模式**（`spine.js` `mode = 'stun'`：播 stun 剪辑，
//    没有 stun 剪辑就把当前姿态 `frozen` 冻住），与"挂正面骨架还是背面骨架"（`_wantsBack()` / `entryBack`）
//    是**正交**的两件事。我们原来在晕眩期间照样按 `cos θ` 的符号去调 `view.setDir()` ⇒ 触发宿主
//    `_syncModel()` → `_loadSpine()` → **在强控中途把整个 SpineActor 换掉**（旧 actor 被 `_dropActor()` 销毁、
//    新模型异步建出来才 `spineReady`）。这是一次"宿主没打算做的模型重建"，与宿主冻结的强控姿态打架。
//    现在把 晕眩 / 冻结 / 沉睡（宿主自己把这三位**等同**处理）加进 `frontback.js` 的"绝不碰"名单：
//    期间**一个字节都不写**（既不 `setDir`，也不动 `dir` / `facing` / `visFacing` / `hasDir`），把决定权完全留给宿主。
// ② **伤害数字改成"完整转圈"**（服主原话：「应该做成能够完整的转圈，而非仅是限定角度晃动」）：
//    `rotation = 原值 + θ`（0→360°，一个 `spinPeriod` 转满一圈，仍与全局周期一致、可对齐音乐）；
//    ★ 仍然**不写 `scale.x`**（`axisK ≡ 1`）—— 不许退回轴转，那正是撕裂的根源。
//
// ============================ ★★ v1.5.1：伤害数字恢复"恒定平面旋转"（防撕裂） ============================
// 服主原话：「测试发现**伤害数字中轴旋转会出现撕裂现象**，将**伤害数字旋转单独改为平面旋转**。」
//   · 只动**一条判据**：`num`（伤害数字 + 浮动标签）恒走平面内旋转，与全局 `spinMode` 解耦；
//   · **不新增任何参数 / 控件**：4 个旋转参数、两种模式、9 个分组、混乱模式、三档、换面开关一个字节未改；
//   · `PREF_V` 仍是 **7**（没有新键 ⇒ 存档外壳形状不变，老存档照读）；
//   · 老版那两个专用参数（`numSpinHz` / `numAmp`）**不恢复**（它们仍在 LEGACY_KEYS 里、仍然只读不换算）。
//
// ============================ ★★ v1.5.0：新增「转身换面（正/背）」两键 ============================
// 服主原话：「注意到干员的 spine 有**正面和背面**两种状态，能不能用**旋转宽度到达 0 像素宽度时切换正背面 spine**
//           来实现**更真实的旋转效果**？」
// 本版只**新增两个键**，4 个旋转参数、两种旋转模式、混乱模式、9 个分组、界面三档**一个字节都没改**：
//   fbSwap   转身换面总开关   布尔 · 默认 **true（开）**  —— 开 = `cos θ` 过零时正/背互换
//   fbDead   换面死区         0~0.30 · 默认 **0.04**（步进 0.01）—— |cos θ| ≤ 死区时保持上一次判定（迟滞）
//   ⇒ `PREF_V` **6 → 7**；老存档缺这两个键**按默认补**（缺 fbSwap ⇒ 开）⇒ 升级即生效、不会崩。
//   ★ 这两个键**不进 `ROT_KEYS`**（服主口径的"旋转只有 4 个参数"仍然成立：换面是**模型选择**，不是第 5 个旋转参数）。
//
// ============================ ★★ v1.4.0：两处精修（服主最新规格） ============================
// ① **两个周期参数改成"输入式"**：`spinPeriod` / `squashPeriod` 仍然是**整数帧**（范围 6~600、步进 1、
//    默认 67 / 38），但设置页不再用滑块拖，而是 **`<input type="number">` 直接键入**
//    （⇧ 上一版"滑块对齐到帧极不便"）。→ 见 section.js 的 NumberField；本文件只保证"精确到帧"：
//    `sanitize()` 里一律 `Math.round` + 夹到 6~600 ⇒ 键入 127 生效的就是 **127 帧**（127/60 s）。
// ② **UI 的单独开关从布尔 `domSpin` 换成三档 `domMode`**（'on' 开启 / 'sync' 同步 / 'off' 关闭）：
//    语义与迁移口径见下方 DEFAULTS.domMode 的长注释；`PREF_V` 因此 **5 → 6**，读旧档靠 `domSpin`
//    换算（`true` → 'on'，`false` → 'sync'），写档只写新键 ⇒ 老存档里的半吊子字段不会残留。
//
// ============================ ★★ v1.3.0：旋转参数**只剩 4 个**（服主最新规格） ============================
// 服主原话（验收口径）：
//   「所有单位的旋转仅包含以下几类参数：
//     · **水平旋转速度**：滑块调节的是**旋转周期**（精确到帧以方便对齐音乐）
//     · **压缩周期**：每次竖向压缩-归位的周期（精确到帧）
//     · **压缩强度**：**压缩到最低时的高度**，滑块调节**百分比（25%~75%）**
//     · **横向补偿**：**压缩到最低时的水平方向宽度倍率**，滑块调节**百分比（100%~150%）**
//     绕竖直轴 / 平面内旋转模式均应用以上参数。
//     所有的旋转不包含侧向偏移/透视，不需要原本的「转身透视」参数滑块。」
//
// 所以本版把参数体系整个换成**周期制 + 百分比制**（4 个键，两种旋转模式共用）：
//
//   键名            含义                                 单位/范围/默认/步进
//   spinPeriod      水平旋转周期（转一圈的帧数）           帧 · 6~600 · 默认 67 · 步进 1
//   squashPeriod    竖向压缩-归位的周期                    帧 · 6~600 · 默认 38 · 步进 1
//   squashMinPct    压缩到最低时的高度（占原高度百分比）      % · 25~75 · 默认 60 · 步进 1
//   widthMaxPct     压缩到最低时的水平宽度倍率               % · 100~150 · 默认 110 · 步进 1
//
//   ★ **精确到帧**：帧率基准固定 60 fps（FPS），秒 = 帧 / 60，**一律吸附到整数帧**（sanitize 里 Math.round）
//     ⇒ 面板显示「N 帧（≈X.XXs）」，与音乐对齐时按帧数算就是精确的。
//   ★ **两种旋转模式共用这 4 个参数**（'axis' 绕竖直轴 / 'flat' 平面内旋转，见 DEFAULTS.spinMode）。
//     ★★ v1.5.1 唯一例外（**判据**，不是新参数）：`num`（伤害数字与浮动标签）**恒为平面内旋转**
//        —— 见下面的 `FLAT_ONLY_GROUPS`；它照样用这 4 个参数里的 `spinPeriod` 定周期，
//        只是**不参与** `cos θ` 的横向压扁（压扁会撕裂字形抗锯齿）。
//     ★★ v1.6.0：这一组的"平面内旋转"是**完整一圈 360°**（`rotation = 原值 + θ`），
//        **不是** v1.5.1 的 ±15° 摆动（服主原话：「应该做成能够完整的转圈，而非仅是限定角度晃动」）。
//   ★ **没有任何"倾斜/透视"参数**：'axis' 模式在 2D 里就是「横向按 cosθ 压窄 + 镜像翻转」，
//     中途压成 0 宽正是"转到侧面"的表现（服主口径：不用担心 0 宽）。
//
// ============================ 老存档（v1.2.1 及更早）怎么换算 ============================
// `load()` / `sanitize()` 会认老键并**换算**成新键（只在"新键缺省"时生效 ⇒ 幂等、不会覆盖用户新设的值）：
//   老 squashHz（Hz，每秒几次上下）  → squashPeriod = round(60 / Hz)          帧
//   老 spinHz  （圈/秒）            → spinPeriod  = round(60 / Hz)          帧
//   老 squashAmp（scale.y 振幅）    → squashMinPct = round((1 - amp) × 100)  %
//   老 xComp（横向补偿比例）        → widthMaxPct  = round(100 × (1 + xComp × amp))  %
//   老 numSpinHz / numAmp           → **不换算**（★ v1.5.1 补注：伤害数字分组**仍然没有自己的参数**，
//                                      只是它的**旋转判据**恒为平面内 —— 见 FLAT_ONLY_GROUPS）
//   老「转身透视」滑块（透视斜切系数）→ **删除**：本版不再有任何斜切/透视（连字段都不再存在，键名见报告 29）
//   ★ 老存档里的**总开关 `on`、9 个分组开关、混乱模式四个参数一律原样保留**（缺的键按默认补，不会崩）。
//   ★ Hz = 0（老版"不转"）换算不出有限周期 ⇒ 取最长周期（600 帧 = 10 s），主观上几乎静止。
//
// ============================ 分组化（v1.1.0 起，不变） ============================
// "动谁"拆成 9 个**互不依赖**的分组，每组一个开关（`GROUPS`）；总开关 `on` 是唯一总闸（默认 false）。

/** localStorage 键。 */
export const PREF_KEY = 'sp.pref.djModels';
/**
 * 存储格式版本。★ 读的时候 v1~v7 **多种外壳都认**（只看有没有 cfg 字段，不比对版本号）。
 * ★★ v1.4.0：**5 → 6**。这一版把 UI 的布尔开关 `domSpin` 换成三档键 `domMode`（'on'/'sync'/'off'）。
 * ★★ v1.5.0：**6 → 7**。这一版新增两个键 `fbSwap`（转身换面开关，默认**开**）与 `fbDead`（换面死区，默认 0.04）。
 *   读旧档仍然靠"**先看有没有 cfg 字段**"这条判据（不比对版本号），v1.2.1 / v1.3.0 / v1.4.0 的外壳（v:1~v:6）
 *   都能照读；缺键**按默认补**（老存档缺 `fbSwap` ⇒ 默认开、缺 `fbDead` ⇒ 0.04），`domSpin` 仍会被换算成 `domMode`。
 */
export const PREF_V = 7;

/** ★ 帧率基准：所有"周期"参数的单位都是**这个帧率下的帧数**。 */
export const FPS = 60;

/** 帧 → 秒（精确：帧 / 60）。 */
export const framesToSec = (n) => (Number.isFinite(n) ? n : 0) / FPS;

/**
 * ★ v1.3.0：**DOM 界面的角度硬上限（度）** —— 它**不再是一个用户参数**（规格里只有 4 个参数），
 *   而是内部安全常量：纯 `rotateY(θ)` 在正交投影下把元素的投影宽度乘 `|cos θ|`，
 *   θ = 90° ⇒ 宽度归零 ⇒ 那一刻点不到（服务器上最坏的情况就是"关不掉整活"）。
 *   夹在 60° ⇒ 最窄投影宽度 = cos60° = **50%**，按钮永远点得到（命中面积最小仍是原来的一半）。
 */
export const DOM_MAX_DEG = 60;

/**
 * 分组表。**这是"动谁"的唯一权威清单**：设置页按它画开关，引擎按它取默认值。
 *   id    —— 分组短名（引擎 / 自省 API / 报告里用）
 *   key   —— sp.pref.djModels 里的布尔键
 *   dflt  —— 该组的默认开关（总开关打开时才有意义）
 *   label / hint —— 设置页文案
 */
export const GROUPS = Object.freeze([
  { id: 'op', key: 'gOp', dflt: true, label: '干员', hint: '我方干员小人（Spine 模型）' },
  { id: 'enemy', key: 'gEnemy', dflt: true, label: '敌方模型', hint: '战斗敌人 / 预览栏 / 首领' },
  { id: 'token', key: 'gToken', dflt: true, label: '召唤物', hint: '召唤物 token 的小人' },
  { id: 'device', key: 'gDevice', dflt: true, label: '装置 / 箱子', hint: '装置箱体（2D 底盘）与炮台' },
  { id: 'item', key: 'gItem', dflt: true, label: '装备 / 掉落物', hint: '棋盘上的装备牌 / 掉落物图标' },
  { id: 'hud', key: 'gHud', dflt: true, label: '场内 UI（血条）', hint: '每个单位的血条 / SP 条 / 状态图标' },
  { id: 'num', key: 'gNum', dflt: true, label: '伤害数字', hint: '伤害 / 治疗数字与浮动标签' },
  { id: 'fx', key: 'gFx', dflt: true, label: '其它特效', hint: '粒子 / 弹道 / 地面环 / 技能光环 / 喷火' },
  { id: 'dom', key: 'gDom', dflt: false, label: 'DOM 界面', hint: '战斗中的网页按钮 / 顶栏 / 面板（CSS 动画）' },
]);

/** id → 分组（引擎采样 / 报告用）。 */
export const GROUP_BY_ID = Object.freeze(GROUPS.reduce((m, g) => (m[g.id] = g, m), {}));

/**
 * 默认值。**总开关默认 `false`（关）**：这是个会改变整个战场外观的整活效果，
 * 默认开着会让不知情的玩家以为游戏坏了（服主口径：默认关，想看的人自己去模组设置里开）。
 *
 * ★ 4 个旋转参数的默认值刻意挑成"好看且能对上老观感"：
 *   · spinPeriod 67 帧 ≈ 1.117 s/圈（≈ 老版 0.9 圈/秒）；
 *   · squashPeriod 38 帧 ≈ 0.633 s（≈ 老版 1.6 次/秒）；
 *   · squashMinPct 60 %（最低压到六成高）；
 *   · widthMaxPct 110 %（压到最低时横向 1.10 倍，看起来像"被压扁所以摊开一点"）。
 */
export const DEFAULTS = Object.freeze({
  /** 总开关。false = 一个像素都不动（连 ticker 回调都不装帧内写入）。 */
  on: false,
  /** ★ 水平旋转周期（帧，60 fps）。67 帧 ≈ 1.117 s 转一圈。 */
  spinPeriod: 67,
  /** ★ 竖向压缩-归位周期（帧，60 fps）。38 帧 ≈ 0.633 s 一次。 */
  squashPeriod: 38,
  /** ★ 压缩强度：压缩到最低时的**高度**（占原高度的百分比）。25~75，默认 60。 */
  squashMinPct: 60,
  /** ★ 横向补偿：压缩到最低时的**水平方向宽度倍率**（百分比）。100~150，默认 110。 */
  widthMaxPct: 110,
  /** 旋转模式：'axis' 绕竖直轴（meme 观感，默认）/ 'flat' 平面内旋转。**两者共用上面 4 个参数**。 */
  spinMode: 'axis',
  /**
   * ★★ v1.5.0（服主最新需求）：**转身换面（正/背）**。
   *   服主原话：「注意到干员的 spine 有**正面和背面**两种状态，能不能用**旋转宽度到达 0 像素宽度时切换正背面
   *   spine** 来实现**更真实的旋转效果**？」
   *   · **开（默认）**：`spinMode === 'axis'` 时，`cos θ` 过零那一刻把模型从**正面**换成**背面**（走宿主现成的
   *     `view.setDir('UP')`），过了 180° 再换回正面 ⇒ 观感从"原地压扁"变成"**真的转过身去**"。
   *   · **关**：逐值回到 v1.4.0 的写法（`scale.x ∝ cos θ`，转过 180° 是"镜像"而不是"背面"）。
   *   · ★ **只对"宿主自己说有背面模型"的单位生效**（`assets.hasBack(id)`，与 `_wantsBack()` 同一个判据；
   *     没有 back 的干员比如 `char_1012_skadi2` **一次都不换**）。
   *   · ★ **倒地 / 死亡 / 淡出 / 替身 / 备战盘**期间一律不碰（把 dir 留给宿主自己的 `_wantsBack()` +
   *     `_syncModel()` 去决定 —— 135 个 Back 骨架里 131 个没有 Die 剪辑，硬按背面会让死亡动画消失）。
   *   · ★ 纯渲染层：只调 `view.setDir()`，**不碰 sim**（不写任何 sim 状态、不发任何网络请求）。
   */
  fbSwap: true,
  /**
   * ★★ v1.5.0：**换面死区**（迟滞门限，|cos θ| 的比较值）。
   *   · 正面 → 背面 要 `cos θ < −fbDead`；背面 → 正面 要 `cos θ > +fbDead`；死区内**保持上一次的判定**。
   *   · 默认 **0.04**（≈ 90° ± 2.29°，一个周期里 1.3% 的时间）—— 小到换面必然发生在"几乎 0 宽"的时刻
   *     （★ 0.04 比默认周期 67 帧一帧的 |Δcos θ| ≈ 0.094 还小 ⇒ 死区不会把换面额外推后一帧），
   *     大到仍然是一条真正的迟滞带（浮点噪声 / 掉帧 / −0 都不会骗它反复换面）。
   *   · **0** = 纯符号（无死区）；**0.3** = 90° ± 17.5°（非常保守）。
   *   · ★ 无论取多少，**换面判据只依赖 `cos θ` 的符号与这个死区**，与周期 / 幅度 / 混乱模式都无关。
   */
  fbDead: 0.04,
  /**
   * ★★ v1.4.0（服主最新规格）：**界面（DOM）三档** —— 取代 v1.3.0 的布尔开关 `domSpin`。
   *   服主原话：「关于 UI 的单独开关，我的意思是其 DOM 对应切换有『**开启**』『**同步**』『**关闭**』三个选项：
   *     ·『**开启**』对应其与其他所有元素一样进行**压缩和水平旋转**，且**参与『混乱模式』**选项；
   *     ·『**同步**』对应**所有 UI 相位相同，仅竖向压缩，不旋转**；
   *     ·『**关闭**』时**不进行任何旋转**。」
   *
   *   本版实现的口径（**逐档 = 一行代码路径**，见 domui.js 的 buildCss / mark）：
   *
   *   档位      竖向压缩   水平旋转      相位                     混乱模式      生成的 CSS
   *   'on'      有         有（≤60°）    每个元素各自独立随机相位   参与           rotateY + scale 两条动画
   *   'sync'    有         无            **所有 UI 完全相同**       ——            只有 scale 一条动画（rotateY 0 次）
   *   'off'     无         无            ——                        ——            连 <style> 都不注入（= 不给 UI 加效果）
   *
   *   ★ **'off' 与「DOM 界面」分组开关的关系**：分组开关是"要不要给战斗 UI 加效果"的**总闸**，
   *     三档决定"**怎么加**"。'off' 档等价于"不给 UI 加效果"⇒ 走与"分组关"完全相同的退出路径
   *     （摘 <style>、摘 class/属性/延迟，逐元素零残留）。
   *   ★ **'关闭' 的歧义点（已在报告里标注）**：服主字面只说"不进行任何旋转"，但也说同步档是"仅竖向压缩"、
   *     开启档是"压缩和水平旋转"——即"压缩"是前两档共有的、旋转是开启档独有的。若把'关闭'理解成
   *     "仍有压缩、只是不旋转"，那它就与'同步'完全重合（同步档**已经是**"有压缩、无旋转"）。
   *     主会话已向服主确认口径：**'关闭' = 完全静态（既不压缩也不旋转）**，故按上表实现。
   *   ★ **相位**：'on' 档在"混乱模式关"时也保持各元素独立随机相位（老行为不变）；混乱模式开则在
   *     独立相位上再叠加最多 `chaosPhi` 个周期的确定性偏移（'on' 档**参与混乱模式**）。
   *     'sync' 档**所有元素用同一个固定相位**（`DELAY_UNIFORM`），与混乱模式无关、任意两元素延迟逐字符相同。
   *
   *   ★ 向后兼容：老存档的 `domSpin: true` → 'on'，`domSpin: false` → 'sync'
   *     （老的"仅上下浮动"档**就是**新'同步'档，语义逐条相同 ⇒ 老用户观感不变）；
   *     老 `domDeg = 0` → 'sync'、`domDeg > 0` → 'on'。缺键 ⇒ 默认 'on'。
   */
  domMode: 'on',
  /** ★ 每帧最多写多少个目标（预算）。分组变多以后粒子可能有上千个，必须封顶。 */
  budget: 400,
  // ---- 混乱模式（chaos，v1.2.0 起，语义不变）------------------------------------------------
  /** 混乱模式总开关。★ 默认关（老存档没有这个键 ⇒ 按默认值）。 */
  chaos: false,
  /** 混乱强度：每个目标的**时间偏移**上限，单位 = 自己的周期（0.5 ⇒ 最多错开半个周期）。
   *  ★ 只随机"相位"，**绝不随机频率** ⇒ 周期与设定值完全一致（服主口径）。 */
  chaosPhi: 0.5,
  /** 混乱幅度：每个目标的压缩幅度（压缩强度 + 横向补偿**同时**）围绕设定值活动的最大偏离比例。 */
  chaosAmp: 0.35,
  /** 混乱游走速度（Hz）：幅度起伏的快慢（低频 ⇒ 4 秒以上才走完一轮，不会闪）。 */
  chaosWanderHz: 0.12,
  // ---- DOM 界面的兜底 ----------------------------------------------------------------------
  /** ★★ v1.3.0：**「保护设置入口」安全兜底（默认关）**。
   *  关（默认）= 规格要求"战斗中的 UI 一视同仁地转"，左下角「设置」键**参与旋转**；
   *  开 = 设置齿轮/入口那一块、以及「模组设置」面板里的每一行开关**完全不参与旋转**（第二道闸）。
   *  ★ 不管这个开关是开是关，`DOM_MAX_DEG = 60°` 那道角度闸**永远在**（最窄仍有 50% 宽 ⇒ 点得到）。 */
  guardSettings: false,
  // ---- 分组开关（缺省值从 GROUPS 生成，见文件尾的 Object.assign）----
  gOp: true,
  gEnemy: true,
  gToken: true,
  gDevice: true,
  gItem: true,
  gHud: true,
  gNum: true,
  gFx: true,
  gDom: false,
});

/**
 * ★ v1.4.0：**界面（DOM）三档**的白名单。'on' = 压 + 转 + 参与混乱；'sync' = 只压不转、全体同相；
 * 'off' = 完全静态（等价于不给 UI 加效果）。
 */
export const DOM_MODES = Object.freeze(['on', 'sync', 'off']);
/** 三档的中文名（设置页与报告共用同一套字）。 */
export const DOM_MODE_LABELS = Object.freeze({ on: '开启', sync: '同步', off: '关闭' });

/** 旋转模式白名单（两种模式共用那 4 个参数）。 */
export const SPIN_MODES = Object.freeze(['axis', 'flat']);

/** 三个控制位任一置起、或 `anim` 就是晕眩码 ⇒ 宿主把它当"晕眩"（`_baseFromAnim()` 的判据）。 */
export function isControlView(v) {
  if (!v || typeof v !== 'object') return false;
  const anim = typeof v.anim === 'number' ? v.anim : 0;
  if (anim === CONTROL_ANIM_STUN) return true;
  const f = typeof v.flags === 'number' ? v.flags : 0;
  return (f & CONTROL_UF_MASK) !== 0;
}

/**
 * ★★ v1.5.1：**恒定平面内旋转的分组白名单**（"防撕裂"保护，服主最新口径）。
 *
 * 服主原话：「测试发现**伤害数字中轴旋转会出现撕裂现象**，将**伤害数字旋转单独改为平面旋转**。」
 *
 * 根因（几何上的必然）：'axis'（绕竖直轴）档在 2D 里只能靠 `scale.x = 原值 × cos θ` 表达 ——
 * 那是把**整张位图连同字形**沿横向压扁。伤害数字是 24 px 的 BitmapText（`public/js/render/fx/numbers.js:289`），
 * 压到 0.1 倍宽时一个字形只剩 2~3 个像素、笔画的抗锯齿采样率远低于 1 采样/像素
 * ⇒ 每个笔画的明暗变成随机采样 ⇒ 看上去正是**撕裂 / 毛边 / 闪烁**（越接近侧面越明显）。
 * 文字的唯一用途就是"读"，所以这一组**永远用平面内旋转**（写 `rotation`），**绝不写 `cos θ`**。
 *
 * ★ 历史（为什么要"恢复"）：v1.1.0 曾经就这么保护过 —— 当时靠两个专用参数 `numSpinHz` / `numAmp`
 *   **外加**"强制 flat"；v1.3.0 的参数重做（收敛成 4 个参数）**把这条保护一起删掉了**
 *   ⇒ 数字开始跟着全局 `spinMode` 走 ⇒ 撕裂复现。
 *   v1.5.1 **只把"保护"恢复回来**，**不恢复那两个旧参数**（4 参数口径一个字节都不动）。
 *   ★ v1.6.0：保护照旧（一样不写 `cos θ`），只把角度从"±15° 摆动"改成"整圈 360°"。
 *
 * ★ 为什么用"分组白名单"而不是"再给 num 一套参数"：这条保护是**判据**、不是**旋钮**
 *   —— 服主只说"将伤害数字旋转单独改为平面旋转"，没有给它留任何可调空间；
 *   加回专用参数等于推翻 v1.3.0 的"旋转只有 4 个参数"口径，所以不做。
 */
export const FLAT_ONLY_GROUPS = Object.freeze(['num']);

/** 这个分组的旋转是否**恒为平面内**（与全局 `spinMode` 解耦）。 */
export function isFlatOnlyGroup(gid) {
  return FLAT_ONLY_GROUPS.indexOf(gid) >= 0;
}

/**
 * ★★ v1.6.0：**恒定平面旋转 = 完整一圈（360°）**（只对 `FLAT_ONLY_GROUPS`，即伤害数字 / 浮动标签生效）。
 *
 * 服主原话（本轮第 ③ 条）：「**伤害数字水平旋转是应该做成能够完整的转圈，而非仅是限定角度晃动**。」
 * ⇒ 把 v1.5.1 的"±15° 摆动"（`rotation = 15°·sin θ`）换成**整圈**：
 *
 *      rotation = 原值 + θ        θ = 2π·τ/spinPeriod  ⇒ 一个 `spinPeriod` 正好转满 360°
 *
 *   · **周期仍与全局逐值相同**（共用同一个 θ ⇒ 同一个 `spinPeriod`，照样"跟着节奏走、能对齐音乐"）；
 *   · **仍然不写 `scale.x`**（`axisK ≡ 1`）—— 这是 v1.5.1 立的规矩，**不许**退回轴转：
 *     轴转的 `scale.x ∝ cos θ` 会把 24 px 的 BitmapText 连字形一起横向压扁 ⇒ 那正是"撕裂"的根源；
 *   · 与全局 `spinMode` 仍**解耦**：全局 'axis' / 全局 'flat' 下这一组的数值轨迹**逐值相同**（不叠加、不双倍转）；
 *   · ★ 观感（如实描述）：整圈意味着**每个周期里有半圈数字是倒着的**（θ ∈ (90°,270°) 那一段）。
 *     服主明确要求"完整转圈"，所以照做 —— 伤害数字寿命 0.9~1.8 s（`numbers.js:14-16`），
 *     一个默认周期 67 帧 ≈ 1.12 s，所以大多数数字在它的一生里会经历"正 → 侧 → 倒 → 侧 → 正"。
 *   · ★ 与 v1.5.1 的**唯一**差别就是这句话：`rotation` 从"有界摆动"变成"整圈"。
 */
export const FLAT_ONLY_FULL_TURN = true;

/** `FLAT_ONLY_FULL_TURN` 为真 ⇒ **360°（整圈）**；为假 ⇒ v1.5.1 的 ±15° 摆动（回滚用的口径值）。 */
export const FLAT_ONLY_SWING_DEG = 15;
/** 这一组的旋转角上限（度）：整圈档 = **360**，摆动档 = 15（`limits().flatMaxDeg` 回显它）。 */
export const FLAT_ONLY_MAX_DEG = FLAT_ONLY_FULL_TURN ? 360 : FLAT_ONLY_SWING_DEG;

/**
 * ★★ v1.6.0：**晕眩 / 强控状态**（第 ① 条修复用）—— 这些状态下**绝不调 `view.setDir()`**。
 *
 * 依据（**逐条照抄宿主自己的判据**，不猜）：
 *   · `public/js/render/units.js:716-720` 的 `_baseFromAnim()`：
 *       `if (this.anim === ANIM.STUN || (this.flags & (UF.STUNNED | UF.FROZEN | UF.SLEEP))) return 'stun';`
 *     ⇒ 宿主把**晕眩 / 冻结 / 沉睡**三者**完全等同**（同一个 `'stun'` 静息态、同一个状态图标、同一套着色）。
 *   · `public/js/render/spine.js` 的 `_enterStun()/setBase('stun')`：那是**动画模式**（`mode = 'stun'`，
 *     播 `roles.stun` 的 begin/loop，**没有 stun 剪辑时 `frozen = true` 把当前姿态冻住**）——
 *     与"挂正面骨架还是背面骨架"（`entryBack` / `_wantsBack()`）**是两件正交的事**。
 *   · `server/sim/snapshot.js:70` 的位定义：`f.stun && !f.freeze && !f.sleep` ⇒ `UF.STUNNED`（2）；
 *     `UF.FROZEN`（4）/ `UF.SLEEP`（256）各自独立；`animOf()` 里 `s.flags.stun` ⇒ `ANIM.STUN`（5）。
 *   · 服务端把 晕眩 / 冻结 / 沉睡 / 浮空 都合并进 `flags.stun`（`server/sim/units.js:174`）⇒ 客户端这三位
 *     就是"强控"的**全集**（浮空落在 `UF` 里没有独立位，但它的 `anim` 仍是 `ANIM.STUN`）。
 */
export const CONTROL_ANIM_STUN = 5;                 // shared/constants.js ANIM.STUN
export const CONTROL_UF_STUNNED = 2;                // shared/constants.js UF.STUNNED
export const CONTROL_UF_FROZEN = 4;                 // shared/constants.js UF.FROZEN
export const CONTROL_UF_SLEEP = 256;                // shared/constants.js UF.SLEEP
/** 这三个位任一置起 ⇒ 宿主按"晕眩"处理（与 `_baseFromAnim()` 逐字相同）。 */
export const CONTROL_UF_MASK = CONTROL_UF_STUNNED | CONTROL_UF_FROZEN | CONTROL_UF_SLEEP;

/**
 * 每个滑块的 [最小, 最大, 步进]。
 * ★ 4 个旋转参数**步进都是 1**（帧/百分比的整数刻度）——「精确到帧」在 UI 层就是这个 1 帧步进。
 */
export const RANGES = Object.freeze({
  /** 水平旋转周期（帧）。6 帧 = 10 圈/秒（快到糊），600 帧 = 10 秒/圈（几乎静止）。 */
  spinPeriod: [6, 600, 1],
  /** 竖向压缩周期（帧）。 */
  squashPeriod: [6, 600, 1],
  /** 压缩到最低时的高度（%）。 */
  squashMinPct: [25, 75, 1],
  /** 压缩到最低时的水平宽度倍率（%）。 */
  widthMaxPct: [100, 150, 1],
  /** ★ v1.5.0：换面死区（|cos θ| 的门限）。0 = 纯符号；0.3 = 90° ± 17.5°。 */
  fbDead: [0, 0.3, 0.01],
  budget: [40, 2000, 20],
  chaosPhi: [0, 1, 0.05],
  chaosAmp: [0, 0.9, 0.01],
  chaosWanderHz: [0.02, 1, 0.01],
});

/** 4 个旋转参数的键名（设置页与报告都按这个顺序）。 */
export const ROT_KEYS = Object.freeze(['spinPeriod', 'squashPeriod', 'squashMinPct', 'widthMaxPct']);

/** 老键清单（只用于报告/换算，代码里**不再有这些字段**）。★ v1.4.0 起 `domSpin` 也进了这张表。 */
export const LEGACY_KEYS = Object.freeze(['squashHz', 'squashAmp', 'spinHz', 'xComp', 'numSpinHz', 'numAmp', 'domDeg', 'domSpin']);

/** 夹取到 [lo, hi]。 */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** 只认有限数；其它（含 NaN / 'abc' / undefined）一律取默认值。 */
const num = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

/**
 * 老布尔开关 `domSpin` → 新的三档 `domMode`（v1.4.0 的迁移口径，**读时换算、写时只写新键**）：
 *   · `domSpin === true`（默认档：竖向浮动 + 绕中轴旋转，参与混乱）  → **'on'**（开启）
 *   · `domSpin === false`（老"仅上下浮动"档：只压缩、不旋转、宽度逐值恒定）→ **'sync'**（同步）
 *     ★ 老档的"仅上下浮动"在语义上**就是**新'同步'档（有竖向压缩、无任何旋转），所以这样映射
 *       ⇒ 老用户升级后观感**一个像素都不变**，不会突然开始转。
 *   · 缺键（更老的存档，连 `domSpin` 都没有）→ **默认 'on'**。
 * @param {any} v
 * @returns {'on'|'sync'|'off'|null} null = "没有这个键"
 */
export function domSpinToMode(v) {
  if (v == null) return null;
  return bool(v, true) ? 'on' : 'sync';
}

/** 老「界面角度」（0–60°）→ 新三档：`> 0` 换算成 'on'（满角 60°），`  0` 换算成 'sync'（只压不转）。 */
export function domDegToMode(deg) {
  return num(deg, DOM_MAX_DEG) > 0 ? 'on' : 'sync';
}

/** 把任意输入洗成合法的三档值；`null`/缺省 ⇒ `dflt`（默认值在**调用时**才读 `DEFAULTS`，避免 TDZ）。 */
export function normalizeDomMode(v, dflt) {
  const d = dflt === undefined ? DEFAULTS.domMode : dflt;
  return DOM_MODES.includes(v) ? v : d;
}

/** 一个布尔字段：默认 true 时"显式 false"才关；默认 false 时"显式 true"才开。 */
function bool(v, dflt) {
  if (dflt) return !(v === false || v === 0 || v === 'false' || v === '0');
  return v === true || v === 1 || v === 'true' || v === '1';
}

/**
 * 老键 → 新键的换算（**只读**，不写任何东西）。给 sanitize 与报告/验收共用，
 * 所以做成导出函数：验收脚本可以直接调它复算"换算前后对照"。
 *
 *   hzToPeriod(hz)  = round(60 / hz)，hz ≤ 0 ⇒ 取最长周期 600（≈ 不转）
 *   ampToMinPct(a)  = round((1 − a) × 100)
 *   compToWidthPct  = round(100 × (1 + xComp × amp))
 *
 * @param {any} o 任意老配置对象
 * @returns {{ spinPeriod?:number, squashPeriod?:number, squashMinPct?:number, widthMaxPct?:number, from:string[] }}
 */
export function legacyConvert(o) {
  const src = o && typeof o === 'object' ? o : {};
  const out = { from: [] };
  const hzToPeriod = (hz) => {
    const h = num(hz, 0);
    if (!(h > 0)) return RANGES.spinPeriod[1];              // 老版 Hz=0（不转）⇒ 最长周期
    return clamp(Math.round(FPS / h), RANGES.spinPeriod[0], RANGES.spinPeriod[1]);
  };
  if (typeof src.spinHz === 'number') { out.spinPeriod = hzToPeriod(src.spinHz); out.from.push('spinHz→spinPeriod'); }
  if (typeof src.squashHz === 'number') { out.squashPeriod = hzToPeriod(src.squashHz); out.from.push('squashHz→squashPeriod'); }
  const amp = typeof src.squashAmp === 'number' ? clamp(src.squashAmp, 0, 0.6) : null;
  if (amp != null) {
    out.squashMinPct = clamp(Math.round((1 - amp) * 100), RANGES.squashMinPct[0], RANGES.squashMinPct[1]);
    out.from.push('squashAmp→squashMinPct');
  }
  if (typeof src.xComp === 'number' && amp != null) {
    out.widthMaxPct = clamp(Math.round(100 * (1 + clamp(src.xComp, 0, 1) * amp)), RANGES.widthMaxPct[0], RANGES.widthMaxPct[1]);
    out.from.push('xComp→widthMaxPct');
  }
  // ★ 老「界面角度」（0–60°）→ 新三档：> 0 ⇒ 'on'（满角 60°），= 0 ⇒ 'sync'（只压不转）
  if (typeof src.domDeg === 'number') {
    out.domMode = domDegToMode(src.domDeg);
    out.from.push('domDeg→domMode');
  }
  // ★★ v1.4.0：老布尔开关 `domSpin` → 新三档 `domMode`（true ⇒ 'on'，false ⇒ 'sync'）
  //   次序：`domDeg` 在前、`domSpin` 在后 —— 两个都在时以**更晚出现的换算法**为准；
  //   实际上 v1.3.0 的存档里 domSpin 是权威（domDeg 只是更老的残留键），所以这个次序是对的。
  if (src.domSpin != null) {
    out.domMode = domSpinToMode(src.domSpin);
    out.from.push('domSpin→domMode');
  }
  return out;
}

/**
 * 把任意输入洗成一份**保证合法**的配置（幂等）。
 * ★ 新键优先；新键缺省时才用老键换算（⇒ 老存档能平滑升级，新存档不受影响）。
 * @param {any} raw
 */
export function sanitize(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const leg = legacyConvert(o);
  const pick = (k) => (o[k] == null ? leg[k] : o[k]);
  const rng = (k, dflt) => {
    const d = num(dflt, DEFAULTS[k]);
    const [lo, hi] = RANGES[k];
    return clamp(num(pick(k), d), lo, hi);
  };
  /** 周期类：**吸附到整数帧**（"精确到帧"的实现点）。 */
  const rngInt = (k, dflt) => Math.round(rng(k, dflt));
  const out = {
    on: bool(o.on, false),
    // ---- ★ v1.3.0：4 个旋转参数（两种旋转模式共用）----
    spinPeriod: rngInt('spinPeriod', DEFAULTS.spinPeriod),
    squashPeriod: rngInt('squashPeriod', DEFAULTS.squashPeriod),
    squashMinPct: rngInt('squashMinPct', DEFAULTS.squashMinPct),
    widthMaxPct: rngInt('widthMaxPct', DEFAULTS.widthMaxPct),
    spinMode: SPIN_MODES.includes(o.spinMode) ? o.spinMode : DEFAULTS.spinMode,
    // ★★ v1.5.0：转身换面（正/背）+ 换面死区。
    //   · `fbSwap` 默认**开**（服主需求）；老存档缺这个键 ⇒ 走默认值 ⇒ 升级后自动生效。
    //   · `fbDead` 洗成**两位小数**（滑块步进 0.01）⇒ 存档里不会出现 0.04000000000000001 这种噪声。
    fbSwap: bool(o.fbSwap, DEFAULTS.fbSwap),
    fbDead: (() => {
      const [lo, hi] = RANGES.fbDead;
      const v = clamp(num(o.fbDead, DEFAULTS.fbDead), lo, hi);
      return Math.round(v * 100) / 100;
    })(),
    // ★★ v1.4.0：界面（DOM）三档。判定次序：
    //   ① **新键 `domMode` 存在**（合法即用，坏值 ⇒ 默认 'on'；不再回头看老键 ⇒ 幂等）；
    //   ② 老 `domSpin`（true ⇒ 'on'，false ⇒ 'sync'）；
    //   ③ 老 `domDeg`（> 0 ⇒ 'on'，= 0 ⇒ 'sync'）；④ 默认 'on'。
    //   ★ `domSpin` / `domDeg` 这两个键**不再写出**（save() 只写 sanitize 的结果 ⇒ 老键自动消失）。
    domMode: (() => {
      if (o.domMode != null) return normalizeDomMode(o.domMode, DEFAULTS.domMode);
      // ★ 两个老键**都在**时以 `domSpin` 为准（v1.3.0 里它是权威；`domDeg` 只是更老的残留键，
      //   而 v1.3.0 的默认 `domDeg = 60` 会在"用户把界面旋转关掉"之后继续存在）。
      //   这里直接读 legacyConvert 的结果 —— 它与规则 ② 是同一份实现，不会两边跑偏。
      if (o.domSpin != null) return normalizeDomMode(leg.domMode, DEFAULTS.domMode);
      if (typeof o.domDeg === 'number') return domDegToMode(o.domDeg);
      return normalizeDomMode(leg.domMode, DEFAULTS.domMode);
    })(),
    budget: Math.round(rng('budget', DEFAULTS.budget)),
    // 混乱模式（语义不变；老存档缺这几个键 ⇒ 一律走默认值，chaos 默认 false）
    chaos: bool(o.chaos, false),
    chaosPhi: rng('chaosPhi', DEFAULTS.chaosPhi),
    chaosAmp: rng('chaosAmp', DEFAULTS.chaosAmp),
    chaosWanderHz: rng('chaosWanderHz', DEFAULTS.chaosWanderHz),
    // 「保护设置入口」兜底：★ v1.3.0 默认 **false（关）** —— 规格要求"设置键也参与旋转"。
    guardSettings: bool(o.guardSettings, DEFAULTS.guardSettings),
  };
  // 分组开关：按 GROUPS 的默认值补齐（老存档没有这些键 ⇒ 走默认值，不崩、不丢 on）
  for (const g of GROUPS) out[g.key] = bool(o[g.key], g.dflt);
  return out;
}

/** 一组开关的当前状态（引擎按它决定跳不跳这一组）。 */
export function groupOn(cfg, id) {
  const g = GROUP_BY_ID[id];
  if (!g || !cfg) return false;
  return cfg.on === true && cfg[g.key] !== false;
}

/**
 * ★ v1.4.0：**DOM 三档 → 要不要给 UI 加效果**。
 *   · `'off'`（关闭）⇒ **false** —— 与"DOM 分组开关关掉"走**完全相同**的退出路径（逐元素零残留）；
 *   · `'on'` / `'sync'` ⇒ true（这两种是"怎么加"：压 + 转 / 只压不转）。
 * ★ 拿不到配置对象（`null` / 非对象）⇒ **false**（fail-safe：宁可不动，也不要在配置不明时给 UI 加效果）。
 * ★ 真正的门控顺序在 domui.js 的 `sync()`：`总开关 on` → `gDom 分组` → `domMode !== 'off'` → `在战斗中` → `未命中 reduce-motion`。
 */
export function domOn(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  return cfg.domMode !== 'off';
}

/**
 * 读一份配置；坏 JSON / 没有 localStorage ⇒ 默认值。
 * ★ v1.1.0 之后**多种外壳都认**：`{v:N,cfg:{…}}`（新）、`{v:1,cfg:{…}}`（老）、以及"裸配置对象"（更老的写法）。
 *   关键是**先看有没有 cfg 字段**，而不是比对版本号 —— 否则老存档的 on:true 会在换版本时被丢掉。
 */
export function load(storage = safeStorage()) {
  if (!storage) return { ...DEFAULTS };
  try {
    const raw = storage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULTS };
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return { ...DEFAULTS };
    const body = j.cfg && typeof j.cfg === 'object' ? j.cfg : j;
    return sanitize(body);
  } catch {
    return { ...DEFAULTS };
  }
}

/** 写一份配置（失败静默：隐私模式 / 配额满）。 */
export function save(cfg, storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(PREF_KEY, JSON.stringify({ v: PREF_V, cfg: sanitize(cfg) }));
    return true;
  } catch {
    return false;
  }
}

/** localStorage 句柄；拿不到（Node / 被策略禁掉）返回 null。 */
export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Safari 隐私模式下 localStorage 存在但 setItem 抛 QuotaExceededError：探一次
    const probe = '__sp_dj_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * 参数仓库：**同步读、同步写、订阅式广播**。引擎与设置栏共享同一个实例。
 * 写盘**去抖**（滑块拖动时每帧都会 set，直接写 localStorage 会掉帧）。
 * @param {{ storage?: any, debounceMs?: number, onError?: Function }} [opts]
 */
export function createStore({ storage = safeStorage(), debounceMs = 250, onError = null } = {}) {
  let cfg = load(storage);
  const subs = new Set();
  let timer = 0;

  const emit = () => {
    const snap = { ...cfg };
    for (const fn of [...subs]) { try { fn(snap); } catch (e) { onError?.(e); } }
  };
  /** 立刻写盘（去抖到期 / 显式 flush 都走它）。 */
  const writeNow = () => {
    timer = 0;
    try { save(cfg, storage); } catch (e) { onError?.(e); }
  };

  return {
    /** 当前配置（**拷贝**：外部改不动内部状态）。 */
    get() { return { ...cfg }; },
    /**
     * 改若干字段并广播（返回实际生效的这份）。
     * @param {object} patch
     */
    set(patch) {
      const next = sanitize({ ...cfg, ...(patch && typeof patch === 'object' ? patch : {}) });
      const same = Object.keys(next).every((k) => next[k] === cfg[k]);
      cfg = next;
      if (!same) {
        emit();
        if (debounceMs > 0) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(writeNow, debounceMs);
          if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref();
        } else writeNow();
      }
      return { ...cfg };
    },
    /** 立刻落盘（卸载 / 页面隐藏时用）。 */
    flush() { if (timer) clearTimeout(timer); writeNow(); },
    /** 订阅（注册时立即回调一次）。返回 unsubscribe。 */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      try { fn({ ...cfg }); } catch (e) { onError?.(e); }
      return () => subs.delete(fn);
    },
    /** 重置为默认值（并广播）。 */
    reset() { return this.set({ ...DEFAULTS }); },
  };
}
