// mods/cyanfish.dj-models/client/domui.js — DOM 界面分组：**注入一个 <style> + 给目标元素加 class/属性/动画延迟**，
// 别的一概不动。
//
// ============================ 铁律（服主 + 本项目纪律） ============================
//   ① **只许加一个 `<style>` 节点 + 加/删 class、属性、`animation-delay`**：不改宿主的 DOM 树、不绑任何事件、
//      不碰 textContent / 布局属性（width/height/display/position）。
//   ② 动画**只走 `transform`**：transform 不参与布局 ⇒ 不推挤、不换行、不出滚动条；
//      浏览器的命中测试跟着 transform 走 ⇒ 按钮还在它**看起来**在的地方，点击照旧。
//   ③ **退出零残留**：关开关 / 关总闸 / 卸载 / 不在战斗中 / 命中 reduce-motion 时，`<style>`、根元素上的 class、
//      每个元素上的 class / 属性 / inline animation-delay 全部摘掉（验收里用 `document.querySelectorAll` 计数回 0 证明）。
//   ④ **`prefers-reduced-motion: reduce` 命中时整个 DOM 分组不生效**（可访问性优先）。
//
// ============================ ★★ v1.4.0 的改动（服主最新规格） ============================
//
// 【A】**UI 的单独开关从布尔 `domSpin` 换成三档 `domMode`**（服主原话：DOM 对应切换有
//     「开启」「同步」「关闭」三个选项）。三档 = 三条**互不重叠的代码路径**：
//
//   档位        竖向压缩   水平旋转            相位                        混乱模式   生成的 CSS
//   ─────────────────────────────────────────────────────────────────────────────────────────────
//   'on' 开启   有         有（±60° 硬上限）   每个元素各自独立随机相位     **参与**   rotateY + scale 两条动画
//   'sync' 同步 有（+横向补偿）**无**（rotateY 0 次）**所有 UI 完全相同**（= 0 s）  ——   只有 scale 一条动画
//   'off' 关闭  **无**     **无**              ——                          ——       连 <style> 都不注入
//
//   · 'off' 走**与"DOM 分组关掉"完全相同**的退出路径（`sync()` 里 `domOn(c)` 这一道闸）⇒ 零残留；
//   · 'sync' 的"相位完全相同"是**逐个元素断言得了**的：每个被标记元素的 inline `animation-delay`
//     都是 `0s`（只有一个值，因为这一档只有一条动画），回显属性 `--sp-dj-phase` 都是 `0.000000`；
//   · 'on' 档在"混乱模式关"时也保持各元素独立随机相位（老行为不变），混乱模式开则再叠加最多
//     `chaosPhi` 个周期的确定性偏移 ⇒ **'开启'档参与混乱模式**。
//   · ★ v1.4.0 的一处口径修正：'sync'（同步）档**写横向补偿**（`--sp-dj-sx`）。v1.3.0 的"仅上下浮动"档
//     为了"宽度逐值恒定"连横向补偿都省了；但服主对'同步'的定义是"**仅竖向压缩，不旋转**"——
//     即"没有旋转"这条约束针对的是**旋转**，"压缩"这一档照旧完整（高度 + 横向补偿）。验收里
//     "同步档宽度/高度都会变、但 rotateY 出现 0 次"就是这条口径的实证。
//
// 【B】新增 `--sp-dj-phase`（**纯回显**、不带动画、不参与插值）+ `phaseOf()/collectPhases()`，
//     让"任意两个被标记 UI 相位差为 0"这条断言在**真机**上直接可测（不必反解 animation-delay 字符串）。
//
// ============================ ★★ v1.3.0 的四条改动（服主最新规格） ============================
//
// 【1】**只转"战斗中可见 UI"**（`MATCH_ROOT_SEL = '#app .screen.gm'`）。
//     服主口径：「UI 部分**仅战斗中可见 UI** 会发生旋转」。所以：
//       · 所有选择器都自动加前缀 `#app .screen.gm `（战斗屏根，screens/game.js:1310 `cx('screen','gm',…)`）；
//       · 顶部提示（`.toast-host`）是唯一例外 —— 宿主把它挂在 app 根上（main.js:287），
//         与战斗屏**同级**，所以它靠 `inMatch()` 做**运行时门控**（条目 `global: true`）；
//       · ★ **不在战斗中时连 `<style>` 都不注入**（`sync()` 门控）⇒ 标题屏 / 大厅 / 干员调配 / 自选编队上
//         `styleNodes = marked = attrs = rootClass = 0`（真·零残留，而不只是"没标记上"）。
//
// 【2】**以最小单位绕自身中心旋转**（`transform-origin: 50% 50%`）。
//     服主口径：「各 UI 以其**最小单位**来进行绕其中心点旋转（竖直轴模式绕其中轴，平面内旋转模式绕其中心点），
//     从而保证**其本体中心点位置不动**，可点击区域不发生较大偏移」。
//     ⇒ **容器不转，只有最小单位转**：标记时用"**最小单位优先**"——
//       某个候选元素的**后代里还有候选**时，它是容器 ⇒ **不标记**（stat 里记作 `containers`）。
//       v1.2.1 的口径是"最外层优先"（容器转、子元素不转），与这一版**相反**，v1.3.0 已按新规格翻转。
//     ⇒ 结论：父子**不会**叠加旋转（父没标记 ⇒ 子元素的合成角 = 它自己的 |θ| ≤ 60°）。
//
// 【3】**两个周期各自独立、都精确到帧**。CSS 里"旋转"与"压缩"抢同一条 `transform`，
//     若用一条 keyframes，两个周期就只能取最小公倍数（帧数一多就退化成抽搐）。
//     本版用 **注册自定义属性（`@property`）+ 两条独立动画**：
//       · `--sp-dj-r`（`<angle>`）：旋转角，动画时长 = `spinPeriod / 60` 秒；
//       · `--sp-dj-sx` / `--sp-dj-sy`（`<number>`）：压缩时的横向倍率 / 高度倍率，动画时长 = `squashPeriod / 60` 秒；
//       · 元素自己的 `transform: rotateY(var(--sp-dj-r)) scale(var(--sp-dj-sx), var(--sp-dj-sy))`。
//     `@property` 从 Chrome 85 / Edge 85 / Safari 16.4 起可用（本机 Chrome 99 与 Edge 154 实测都正常），
//     比"独立 `rotate:` / `scale:` 属性"（Chrome 104+）兼容面更宽，所以选它。
//
// 【4】**不再有任何倾斜/透视**：只剩 `rotateY`（或平面内的 `rotate`）与 `scale`，
//     **没有** perspective、没有斜切、没有 translate、没有 matrix、没有位移。
//     ★ **角度硬上限 `DOM_MAX_DEG = 60°` 仍然在**（config.js 的常量，不是用户参数）：
//       正交投影下投影宽度 = 宽度 × |cos θ|，θ = 90° 会归零 ⇒ 那一刻点不到；
//       夹在 60° ⇒ 最窄仍有 **50%** 宽 ⇒ **任何相位都点得开设置**。
//
// ============================ 服主点名的 11 类"战斗中可见 UI" → 选择器 ============================
//  ①顶部回合信息的**每个小窗格**      → .gtop__center 里的 roundbox / capsule / lp / iconbtn / misstag / dpbox
//  ②左上角**退出按键**                → .gtop__left .gtop__exit
//  ③左上角**延迟显示 + 难度标识**      → .gtop__left .ping / .gtop__left .dtag
//  ④左上角**盟约叠加图标**（每个独立） → .gm__bonds .bslot / .gm__bonds .bstrip__more
//  ⑤右上角**准备提示**                → .gtop__right .readybtn / .readywrap__count / .readywrap__why / .otwarn
//  ⑥左侧**玩家头像**（每个独立）       → .team .pavatar
//  ⑦左下角**表情/设置/玩法说明/全屏**  → .gm__corner .ewheel__btn / .gm__corner .gm__gear（4 个各转各的）
//  ⑧**表情列表里每个表情**（每个独立）  → .ewheel__panel .ewheel__item
//  ⑨右侧**当前生效 effect**（每个独立） → .gm__effects .effect
//  ⑩下方**商店附带 UI**（可放置/冻结/刷新） → .shopbar .shopbar__remain / .shopbar .toolbtn
//  ⑪**错误操作时的顶部提示**          → .toast-host .toast（宿主挂在 app 根 ⇒ 运行时门控）
//  ★ **不转**：干员/敌方/盟约/地块详情窗格 → `.dpanel`（详情面板）/ `.bpop`（盟约弹窗）/ `.edrawer`（敌方情报抽屉）
//    这三类**一个选择器都不在里面**，验收里直接断言它们角度恒 0（见 29-04 脚本）。
//  ★ **可选三项**（服主说"当前基底下做不到就不做"）：本版**做得到**，故一并纳入：
//    · 商店页具体干员卡片 → .shopbar .scard
//    · 商店页资金显示     → .shopbar .funds
//    · 悬赏/机变条目      → .spov__inner .spcard（机变阶段 3×2 的悬赏卡，每张独立转）
//
// ============================ 混乱模式（chaos）在 DOM 这一组 ＝ 什么 ============================
// PIXI 分组能精确控制每个目标的相位与幅度；CSS 只能给每个元素一个 `animation-delay`。所以这里：
//   · **相位偏移**：每个元素一个确定性随机的负延迟（旋转与压缩**各自独立**的一个分数相位；
//     开混乱时**加大**到最多 `chaosPhi` 个周期）；
//   · **幅度**：不做（一条 keyframes 服务所有元素，逐元素幅度要逐元素生成 keyframes，几百个元素不值当）。
//     ⇒ README / 报告里写明："DOM 组的混乱只覆盖时间偏移，不覆盖幅度；PIXI 组两者都覆盖"。
//   · ★ 周期不变：延迟只平移时间轴，**不改 `animation-duration`**（两条 animation 的时长都写死为配置值）。

import { DOM_MAX_DEG, framesToSec, groupOn, domOn } from './config.js';

/** 注入的 <style> 的 id（也是验收里"在不在"的判据）。 */
export const STYLE_ID = 'sp-dj-ui-style';
/** 挂在 <html> 上的作用域根 class。 */
export const ROOT_CLASS = 'sp-dj-dom';
/** 挂在每个被选中的元素上的标记 class（动画只命中带这个 class 的元素）。 */
export const MARK_CLASS = 'sp-dj-mark';
/** 挂在"受保护、不参与旋转"的元素上的标记 class（只用于验收计数与人工排错，不配任何样式）。 */
export const GUARD_CLASS = 'sp-dj-guard';
/** 每个元素的错落序号属性。 */
export const ORDER_ATTR = 'data-dj-i';
/** 每个元素的**相位档**属性（0..11）。 */
export const PHASE_ATTR = 'data-dj-p';
/** ★ v1.3.0：每个元素属于**哪一类 UI**（验收里"逐类断言"就靠它）。退出时必须一起摘掉。 */
export const KIND_ATTR = 'data-dj-k';

/** ★ v1.3.0：**战斗屏根选择器** —— "战斗中的 UI"的判据（screens/game.js:1310 的 `screen gm`）。 */
export const MATCH_ROOT_SEL = '#app .screen.gm';

/** 相位档数（12 档 ⇒ 回显用；真正的错落是连续分数相位）。 */
export const PHASE_STEPS = 12;

/** 一条 keyframes 的停靠点数（8 段 ⇒ 0/12.5/25/…/100%）。8 档足够表现正弦/余弦，也不至于让 CSS 变胖。 */
export const STOP_N = 8;

/** 三个注册自定义属性的名字（都带 `sp-dj-` 前缀，不可能和宿主撞）。 */
export const VAR_R = '--sp-dj-r';
export const VAR_SX = '--sp-dj-sx';
export const VAR_SY = '--sp-dj-sy';

/**
 * ★ v1.2.1 起保留的**「保护设置入口」兜底**（★ v1.3.0 默认**关**：规格要求左下角「设置」也参与旋转）。
 * 开 = 这些元素（自己或祖先命中）**不参与旋转**，也不加 `.sp-dj-mark`，只加 `.sp-dj-guard`。
 * 关 = 一视同仁（默认）。
 */
export const GUARD_SEL = [
  '.gm__gear', '.title-settings', '.gtop__iconbtn', '.sp-ms__gear',
  '.sp-ms__nav', '.sp-ms__tab', '.sp-ms__box',
  '.set-list', '.set-row', '.set-row__label', '.set-row__val',
  '.set-toggle', '.set-seg', '.set-range',
].join(',');

/** "里面就是设置"的容器（命中它 ⇒ 整块设置界面受保护）。 */
export const GUARD_ROOT_SEL = '.set-list, .sp-ms__box, .sp-ms__embed, .sp-ms__pane';

/** 兜底文字判据：短文案里带"设置/模组"的按钮也算设置入口。 */
export const GUARD_TEXT_RE = /(设置|模组|设定)/;
/** 文字判据的文案长度上限（太长的是正文/说明，不是入口）。 */
export const GUARD_TEXT_MAX = 8;

/**
 * ★ v1.3.0：DOM 分组覆盖什么 —— **逐条对上服主的 11 类枚举**（+ 3 项可选）。
 *
 *   kind   —— 类别短名（写进 `data-dj-k`，验收里逐类断言）
 *   label  —— 报告/设置页里的人类可读名
 *   sel    —— CSS 选择器（**不带** `#app .screen.gm` 前缀，由代码统一加）
 *   global —— true = 这条**不在战斗屏子树里**（顶部提示挂在 app 根），靠 `inMatch()` 运行时门控
 */
export const DOM_TARGETS = Object.freeze([
  // ① 顶部回合信息的每个小窗格（左查询键 / 回合 / 阶段胶囊 / 生命塔 / 漏怪标记 / 费用）
  { kind: 'pane', label: '顶部回合小窗格', sel:
    '.gtop__center .roundbox, .gtop__center .capsule, .gtop__center .lp, .gtop__center .gtop__iconbtn, '
    + '.gtop__center .misstag, .gtop__center .dpbox' },
  // ② 左上角退出按键
  { kind: 'exit', label: '左上角退出按键', sel: '.gtop__left .gtop__exit' },
  // ③ 左上角延迟显示 + 难度标识
  { kind: 'conn', label: '延迟显示 / 难度标识', sel: '.gtop__left .ping, .gtop__left .dtag' },
  // ④ 左上角盟约叠加图标（每个图标独立旋转）
  { kind: 'bond', label: '盟约图标', sel: '.gm__bonds .bslot, .gm__bonds .bstrip__more' },
  // ⑤ 右上角准备提示（准备按钮 / 已就绪计数 / 待处理提示 / 超时警告）
  { kind: 'ready', label: '准备提示', sel:
    '.gtop__right .readybtn, .gtop__right .readywrap__count, .gtop__right .readywrap__why, .gtop__right .otwarn' },
  // ⑥ 左侧玩家头像（每个头像独立旋转）
  { kind: 'team', label: '玩家头像', sel: '.team .pavatar' },
  // ⑦ 左下角 表情 / 设置 / 玩法说明 / 全屏 四个 UI 各自独立旋转
  //   ★★ v1.6.0（服主实测：**PC 网页端左下三个按键不动**）：这一条原来是
  //      `.gm__corner .ewheel__btn, .gm__corner .gm__gear` —— 只靠**两个 class 名**。
  //      实测（PORT=3409，PC 1440×900 与手机 844×390 各跑一遍，见报告 §②）：
  //        · 两个平台的左下角都是**同一个 DOM 结构**（PC 与手机只有 CSS 媒体查询不同，
  //          `public/css/devices.css` 在 <768px 时只把 `.gm__corner` 换成 `flex-wrap: wrap-reverse`），
  //          所以"PC 命中不到"**不是**这个选择器的锅（改前改后都命中 4 个）。
  //        · 真正的坑是**没有任何兜底**：一旦宿主改了 class 名（`.gm__gear` → 别的）或
  //          某个键只活在别处（例如全屏键是 `.fsbtn`，只有 `gm__fs` 这个附加类才把它拉进来），
  //          这一条就**静默漏掉**，而漏掉的表现正是"其余键在转、这三个不动"。
  //      ⇒ v1.6.0 改成**并列 + 兜底**的写法（顺序即优先级，同一元素只按第一条命中算）：
  //        a) 原来的两个 class（逐字节保留 ⇒ 老宿主行为不变）；
  //        b) 具体 class：`.gm__guide` / `.gm__fs` / `.fsbtn` / `.ewheel > button[aria-haspopup]`；
  //        c) 结构兜底：`.gm__corner > button, .gm__corner > [role=button]`（**只认直接子元素**）；
  //        d) 可访问名兜底：`.gm__corner > button[aria-label], .gm__corner > button[title]`。
  //      ★★ 口径纪律（v1.6.0 实测踩过**两次**，都写在这里）：
  //        ① `[aria-label]` / `[title]` 兜底**必须带 `button` 限定**；
  //        ② 结构兜底**必须带 `>`（只认直接子元素）** —— 写成 `.gm__corner button` 会把
  //           **表情展开面板里的每个表情**（`.ewheel__panel .ewheel__item`，也是 `<button>`）先抢走，
  //           于是第 ⑧ 类 `emote` 一个标记都没有（`33-03-verify-groups.mjs` §2 的逐类断言会红，
  //           实测 `byKind.corner = 6`（应为 4）、`emote` 缺席）。
  //        ⇒ 两条限定之后：两个平台各命中 **4** 个（报告 §②），第 ⑧ 类照旧是它自己的。
  { kind: 'corner', label: '左下角四键', sel:
    '.gm__corner .ewheel__btn, .gm__corner .gm__gear, '
    + '.gm__corner .gm__guide, .gm__corner .gm__fs, .gm__corner .fsbtn, .gm__corner .ewheel > button[aria-haspopup], '
    + '.gm__corner > button, .gm__corner > [role=button], '
    + '.gm__corner > button[aria-label], .gm__corner > button[title]' },
  // ⑧ 表情展开列表里每个表情独立旋转
  { kind: 'emote', label: '表情条目', sel: '.ewheel__panel .ewheel__item' },
  // ⑨ 右侧当前生效 effect（每个独立旋转）
  { kind: 'effect', label: '生效中的效果图标', sel: '.gm__effects .effect' },
  // ⑩ 下方商店附带 UI（可放置角色 / 冻结 / 刷新 各自独立旋转）
  { kind: 'shop', label: '商店附带 UI', sel: '.shopbar .shopbar__remain, .shopbar .toolbtn' },
  // ⑪ 错误操作时的顶部提示（如「无法部署在该位置」）—— 宿主挂在 app 根 ⇒ global + 运行时门控
  { kind: 'toast', label: '顶部错误提示', sel: '.toast-host .toast', global: true },
  // ---- 可选三项（服主："当前基底下做不到就不做"；本版做得到，故一并纳入）----
  { kind: 'scard', label: '商店干员卡片（可选）', sel: '.shopbar .scard' },
  { kind: 'funds', label: '商店资金显示（可选）', sel: '.shopbar .funds' },
  { kind: 'bounty', label: '悬赏 / 机变条目（可选）', sel: '.spov__inner .spcard' },
]);

/** 不参与旋转的三类详情窗格（**没有**任何选择器命中它们；验收里直接断言角度恒 0）。 */
export const DETAIL_SEL = '.dpanel, .bpop, .edrawer, .spov';

/** 稳定字符串散列（确定性：同一元素每次重扫都得到同一个相位）。 */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const TAU = Math.PI * 2;
const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 帧 → CSS 时长字符串（**精确到帧**：秒 = 帧 / 60）。 */
export function durSec(frames) {
  const f = Math.max(1, Math.round(Number(frames) || 0));
  return (f / 60).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + 's';
}

/** 归一化时间 u ∈ [0,1] → keyframes 的百分比选择器（`0%` / `12.5%` / `50%` / `100%`）。 */
export function pctAt(u) {
  return String(+(u * 100).toFixed(4)) + '%';
}

/**
 * 本帧的旋转角（度），`u ∈ [0,1]` 是旋转那条动画里的归一化时间。
 *   θ(u) = A·sin(2πu)：0 → +A（u=0.25，最窄相位）→ 0（u=0.5）→ −A（u=0.75）→ 0。
 * ★ **|θ| ≤ A ≤ DOM_MAX_DEG** 恒成立（正弦采样点 + 线性插值不会越过采样点的极值）。
 * @param {number} u 0..1
 * @param {number} [deg] 幅度（度），内部再夹一次 DOM_MAX_DEG
 */
export function angleAt(u, deg) {
  const A = clampNum(deg == null ? DOM_MAX_DEG : deg, 0, DOM_MAX_DEG);
  const x = u - Math.floor(u);
  return A * Math.sin(TAU * x);
}

/** 归一化压缩深度 `s ∈ [0,1]`（0 = 原高，1 = 压到最低）—— 与 engine.js 的 `frameFactors` 同一形状。 */
export function depthAt(u) {
  const x = u - Math.floor(u);
  return 0.5 - 0.5 * Math.cos(TAU * x);
}

/**
 * 旋转那条 keyframes 的停靠点（8 个正弦采样）。
 * @param {number} deg 角度幅度（度）
 */
export function rotStops(deg) {
  const out = [];
  for (let k = 0; k <= STOP_N; k++) {
    const u = k / STOP_N;
    out.push(pctAt(u) + '{' + VAR_R + ':' + angleAt(u, deg).toFixed(3) + 'deg}');
  }
  return out.join('');
}

/**
 * 压缩那条 keyframes 的停靠点（8 个余弦采样）。
 * ★ 在 u = 0.5（压缩最低点）取到的就是**滑块的设定值本身**：`scaleY = squashMinPct/100`、
 *   `scaleX = widthMaxPct/100` ⇒ 面板上的百分比就是屏幕上量得到的高度/宽度百分比。
 * @param {number} minPct 压缩到最低时的高度（%）
 * @param {number} maxPct 压缩到最低时的水平宽度倍率（%）
 * @param {boolean} [noSx] true = ★v1.4.0「同步」档：**只写 `--sp-dj-sy`**（`--sp-dj-sx` 一个字都不写）。
 *   ★ v1.4.0 口径修正：v1.3.0 的"仅上下浮动"档为了"宽度逐值恒定"连横向补偿都不写；
 *     v1.4.0 的「同步」档定义是"**仅竖向压缩，不旋转**"⇒ **横向补偿照写**（它就是压缩的一部分，
 *     只不过不旋转 ⇒ 没有 cosθ 投影 ⇒ "仅竖向"这条约束针对的是**旋转**，不是横向补偿）。
 *     验收里"同步档宽度会随压缩变化、高度也变化，但 `rotateY` 出现 0 次"就是这条口径的实证。
 */
export function sqStops(minPct, maxPct, noSx) {
  const M = clampNum(Number(minPct) / 100, 0.05, 1);
  const W = clampNum(Number(maxPct) / 100, 1, 2);
  const out = [];
  for (let k = 0; k <= STOP_N; k++) {
    const u = k / STOP_N;
    const s = depthAt(u);
    const sy = (1 - (1 - M) * s).toFixed(4);
    out.push(pctAt(u) + '{'
      + (noSx ? '' : VAR_SX + ':' + (1 + (W - 1) * s).toFixed(4) + ';')
      + VAR_SY + ':' + sy + '}');
  }
  return out.join('');
}

/**
 * ★★ v1.4.0：配置 → **界面（DOM）三档**。老键（`domSpin` / `domDeg`）在这里再兜一次底，
 *   这样单测/验收脚本可以直接把"老形态的配置对象"喂进来（不必先过 `sanitize`）。
 *   · `'on'`（开启）：压缩 + 水平旋转 + 每个元素独立相位（**参与混乱模式**）；
 *   · `'sync'`（同步）：仅竖向压缩、**不产生 `rotateY`**、**所有 UI 相位完全相同**；
 *   · `'off'`（关闭）：**无压缩无旋转**（连 `<style>` 都不注入，等价于不给 UI 加效果）。
 * @param {any} c
 * @returns {'on'|'sync'|'off'}
 */
export function domModeOf(c) {
  if (!c || typeof c !== 'object') return 'on';
  if (c.domMode === 'on' || c.domMode === 'sync' || c.domMode === 'off') return c.domMode;
  // 老形态兜底（正常路径上 sanitize 已经换算过了）
  if (c.domSpin != null) return c.domSpin === false || c.domSpin === 0 || c.domSpin === 'false' || c.domSpin === '0' ? 'sync' : 'on';
  if (typeof c.domDeg === 'number') return c.domDeg > 0 ? 'on' : 'sync';
  return 'on';
}

/** ★ 「同步」档：有竖向压缩、**没有**旋转（CSS 里 `rotateY` 出现 0 次）。 */
export function isBobOnly(c) {
  return domModeOf(c) === 'sync';
}

/** ★ 「开启」档：压缩 + 水平旋转（才会产生 `rotateY`）。 */
export function isSpinOn(c) {
  return domModeOf(c) === 'on';
}

/** `'off'`（关闭）⇒ 不给 UI 加任何效果（等价于分组关）。 */
export function isDomOff(c) {
  return domModeOf(c) === 'off';
}

/** 有效旋转角（度）：只有「开启」档 = 硬上限 `DOM_MAX_DEG`，另两档恒 0。 */
export function degOf(c) {
  return isSpinOn(c) ? DOM_MAX_DEG : 0;
}

/**
 * ★★ v1.4.0：「同步」档所有元素共用的**同一个相位**（秒）。
 *   取 0 是刻意的 —— 它让"所有 UI 相位完全相同"这条断言**逐字符可查**（每个元素的
 *   `--sp-dj-phase` 都写 `0.000000`、inline `animation-delay` 都是 `0s`），
 *   不会出现"大家同样错开 1/3 周期但被误读成没同步"的模糊地带。
 */
export const SYNC_PHASE_SEC = 0;

/** 相位回显用的自定义属性（**纯回显**：不带动画、不参与插值，只给验收/面板读）。 */
export const VAR_PHASE = '--sp-dj-phase';

/** 相位回显的文本格式（6 位小数，负零归一成 `0.000000`）。 */
export function phaseText(sec) {
  const v = Number(sec);
  const s = Number.isFinite(v) ? v : 0;
  return (s === 0 ? 0 : s).toFixed(6);
}

/**
 * 给一条（可能是逗号列表的）选择器逐项加作用域前缀，并可给**每一项**加同一个后缀。
 * ★ 后缀**不能**只拼在整个字符串末尾 —— `'a,b,' + '.mark'` 只有最后一个分支带后缀，
 *   前面的分支照样命中所有元素（v1.2.1 真机验收抓到过这个 bug）。所以逐项拼。
 * @param {string} sel 逗号列表
 * @param {string} [suffix] 每个分支都要带上的后缀（例如 `.sp-dj-mark`）
 * @param {string} [prefix] 每个分支都要带上的前缀（默认 `#app .screen.gm `）
 */
export function scopeSel(sel, suffix = '', prefix = MATCH_ROOT_SEL + ' ') {
  const sfx = suffix ? String(suffix) : '';
  return String(sel).split(',')
    .map((s) => 'html.' + ROOT_CLASS + ' ' + String(prefix) + s.trim() + sfx)
    .join(',');
}

/** 拼出整份 CSS（纯函数，便于报告里复算 / 单测）。 */
export function buildCss(c) {
  const cfg = c && typeof c === 'object' ? c : {};
  const spinFrames = Math.max(1, Math.round(Number(cfg.spinPeriod) || 67));
  const sqFrames = Math.max(1, Math.round(Number(cfg.squashPeriod) || 38));
  const minPct = clampNum(Number(cfg.squashMinPct) || 60, 25, 75);
  const maxPct = clampNum(Number(cfg.widthMaxPct) || 110, 100, 150);
  const axis = cfg.spinMode !== 'flat';
  const mode = domModeOf(cfg);
  const A = degOf(cfg);
  const bob = mode !== 'on';                           // ★v1.4.0：'sync' 与 'off' 都不产生任何旋转
  const parts = [];
  parts.push('/* cyanfish.dj-models v1.4.0 · DOM 整活分组（只绕自身中心 · 无倾斜/透视） */');
  parts.push('/* 界面三档 = ' + mode + '（' + (mode === 'on' ? '开启：压缩 + 水平旋转（±' + A.toFixed(3) + '°，硬上限 '
    + DOM_MAX_DEG + '°）+ 各元素独立相位（参与混乱）'
    : mode === 'sync' ? '同步：仅竖向压缩（+ 横向补偿），**不产生任何旋转**，所有 UI 相位完全相同 = '
      + phaseText(SYNC_PHASE_SEC) + ' s'
    : '关闭：无压缩无旋转（这一档压根不注入本样式）') + '） */');
  parts.push('/* 旋转周期 = ' + spinFrames + ' 帧（' + durSec(spinFrames) + '）· 压缩周期 = ' + sqFrames + ' 帧（'
    + durSec(sqFrames) + '）· 最低高度 = ' + minPct + '% · 最低宽度 = ' + maxPct + '% */');
  parts.push('/* 变换只有"绕竖直轴 / 平面内的旋转"与"缩放"两种：没有透视、没有斜切、没有位移、没有矩阵；容器不转，只有最小单位转 */');
  // ---- 注册自定义属性（`@property` ⇒ 可插值；继承关掉 ⇒ 不会渗到子元素）----
  //   ★★ v1.4.0 修正（**同步档离散跳变的根因**）：`--sp-dj-sx` / `--sp-dj-sy` **两个档都注册**。
  //     v1.4.0 早期版本只在"有旋转"的分支里注册 `--sp-dj-sx`，但「同步」档的 `sqStops()` 照样写它、
  //     `transform` 也照样用它 —— **未注册的自定义属性不做插值**（按 CSS 规范，它退化成"离散"替换：
  //     只在每个 keyframe 停靠点一次性换值）⇒ 同步档的横向补偿会变成 **8 段/周期的阶梯跳变**
  //     （而不是连续的正弦式摊开）。注册之后才真正逐帧插值。
  //   ★ 只有 `--sp-dj-r`（旋转角）是"只在「开启」档才注册"：同步 / 关闭档**根本不写旋转量**，
  //     连 `@keyframes sp-dj-r` 都不生成，注册了也没人用。
  if (!bob) parts.push('@property ' + VAR_R + '{syntax:"<angle>";inherits:false;initial-value:0deg}');
  parts.push('@property ' + VAR_SX + '{syntax:"<number>";inherits:false;initial-value:1}');
  parts.push('@property ' + VAR_SY + '{syntax:"<number>";inherits:false;initial-value:1}');
  // ---- keyframes：旋转（一个周期 = spinPeriod 帧）+ 压缩（一个周期 = squashPeriod 帧）----
  //   ★ 「同步」/「关闭」档**不生成旋转 keyframes** ⇒ 整份 CSS 里 `rotateY` / `rotate(` 出现次数为 **0**。
  if (!bob) parts.push('@keyframes sp-dj-r{' + rotStops(A) + '}');
  parts.push('@keyframes sp-dj-q{' + sqStops(minPct, maxPct, false) + '}');
  const tf = bob
    ? 'transform:scale(var(' + VAR_SX + '),var(' + VAR_SY + '));'
    : (axis
      ? 'transform:rotateY(var(' + VAR_R + ')) scale(var(' + VAR_SX + '),var(' + VAR_SY + '));'
      : 'transform:rotate(var(' + VAR_R + ')) scale(var(' + VAR_SX + '),var(' + VAR_SY + '));');
  const anim = bob
    ? 'animation:sp-dj-q ' + durSec(sqFrames) + ' linear infinite;'
    : 'animation:sp-dj-r ' + durSec(spinFrames) + ' linear infinite,'
      + 'sp-dj-q ' + durSec(sqFrames) + ' linear infinite;';
  const rules = [];
  for (const t of DOM_TARGETS) {
    const prefix = t.global ? '' : MATCH_ROOT_SEL + ' ';
    rules.push(scopeSel(t.sel, '.' + MARK_CLASS, prefix) + '{'
      + 'transform-origin:50% 50%;'
      + tf + anim
      + 'will-change:transform}');
  }
  parts.push(rules.join('\n'));
  // 双保险①：即使系统设置在注入之后才切到 reduce，也立刻停掉动画
  parts.push('@media (prefers-reduced-motion: reduce){html.' + ROOT_CLASS + ' .' + MARK_CLASS + '{animation:none !important}}');
  // 双保险②（纯 CSS 的第二道闸）：万一某次标记把 `.sp-dj-mark` 加到了受保护元素上，
  //   只要它同时带 `.sp-dj-guard` 就一律不动画。
  //   ★ 只许写 `animation:none`，**不许**写 `transform:none` —— 宿主的 `.modal__box` 自带入场动画，
  //     `transform:none !important` 会连宿主的 transform 一起按掉（那是改宿主观感，本 Mod 的红线）。
  parts.push('html.' + ROOT_CLASS + ' .' + MARK_CLASS + '.' + GUARD_CLASS + '{animation:none !important}');
  return parts.join('\n');
}

/**
 * 计算某个元素这次应该用的两个 `animation-delay`（负值 = 从动画中途开始）。
 *   · 旋转与压缩**各用各的确定性分数相位**（两个不同盐的散列）⇒ 同一排元素不会像军训，
 *     而且"旋转相位"与"压缩相位"不会绑死成一条线；
 *   · 混乱模式（chaos）：额外叠加最多 `chaosPhi` 个周期的确定性偏移（**只平移时间轴，不改时长 ⇒ 周期不变**）。
 * ★★ v1.4.0 第三档「同步」（`uniform = true`）：**所有元素返回同一个相位**（旋转 = `SYNC_PHASE_SEC`、
 *   压缩 = `SYNC_PHASE_SEC`），与元素身份、与混乱模式都无关 ⇒ 任意两个被标记元素的
 *   `animation-delay` / `--sp-dj-phase` **逐字符相同**（相位差恒 = 0）。
 * @param {string} key 元素身份（id|kind|idx）
 * @param {number} spinSec 旋转周期（秒）
 * @param {number} sqSec 压缩周期（秒）
 * @param {number} phiFrac 混乱相位上限（0 = 不开）
 * @param {boolean} [uniform] ★v1.4.0「同步」档：所有元素同一个相位
 * @returns {{ r:number, q:number, p:number }}
 */
export function delayOf(key, spinSec, sqSec, phiFrac, uniform) {
  if (uniform) return { r: SYNC_PHASE_SEC, q: SYNC_PHASE_SEC, p: 0 };
  const fr = (hashStr(String(key) + '|rot') % 997) / 997;
  const fq = (hashStr(String(key) + '|sq') % 991) / 991;
  const fc = (hashStr(String(key) + '|chaos') % 983) / 983;
  const phi = clampNum(Number(phiFrac) || 0, 0, 1);
  const r = -(fr + phi * fc) * Math.max(0, spinSec);
  const q = -fq * Math.max(0, sqSec);
  const p = Math.round((hashStr(String(key) + '|bucket') % PHASE_STEPS));
  // `+ 0` 把 `-0` 归一成 `0`（`(-0).toFixed(4)` 会得到 "-0.0000"，断言/回显看起来像 bug）
  return { r: +r.toFixed(6) + 0, q: +q.toFixed(6) + 0, p };
}

/**
 * 「保护设置入口」判定。判定链（按代价从低到高，任何一步命中就返回 true）：
 *   ① `el.matches(GUARD_SEL)`；② `el.closest(GUARD_SEL)`；③ 短文案含"设置/模组"的按钮；
 *   ④ `ctx.boxes`（"里面就是设置"的容器 + 它的后代 + 它的祖先）。
 * ★ 任何异常一律返回 **true**（fail-safe）：宁可少转一个 UI，也不能出现"玩家关不掉"。
 */
export function isGuarded(el, ctx) {
  if (!el || typeof el.matches !== 'function') return true;
  try {
    if (el.matches(GUARD_SEL)) return true;
    if (typeof el.closest === 'function' && el.closest(GUARD_SEL)) return true;
    const tag = el.tagName;
    if (tag === 'BUTTON' || (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'switch')) {
      const labels = [
        String(el.textContent || '').trim(),
        typeof el.getAttribute === 'function' ? String(el.getAttribute('aria-label') || '').trim() : '',
        typeof el.getAttribute === 'function' ? String(el.getAttribute('title') || '').trim() : '',
      ];
      for (const txt of labels) {
        if (txt.length > 0 && txt.length <= GUARD_TEXT_MAX && GUARD_TEXT_RE.test(txt)) return true;
      }
    }
    const boxes = ctx && ctx.boxes;
    if (boxes && boxes.size) {
      if (boxes.has(el)) return true;
      for (const b of boxes) { if (b.contains && b.contains(el)) return true; }
    }
    return false;
  } catch { return true; }
}

/** 一次 rescan 里只算一次的"受保护容器集合"（根 + 它们的全部祖先，爬到 body 之前为止）。 */
export function guardContext(doc) {
  const roots = [];
  const boxes = new Set();
  if (!doc || typeof doc.querySelectorAll !== 'function') return { roots, boxes };
  try {
    for (const r of doc.querySelectorAll(GUARD_ROOT_SEL)) {
      roots.push(r);
      boxes.add(r);
      let p = r.parentElement, hops = 0;
      const stop = doc.body || null;
      while (p && p !== stop && p !== doc.documentElement && hops++ < 32) { boxes.add(p); p = p.parentElement; }
    }
  } catch { /* ignore */ }
  return { roots, boxes };
}

/** ★ v1.3.0：**现在是不是"战斗中"**（战斗屏挂在页面上吗）。 */
export function inMatch(doc) {
  try { return !!(doc && typeof doc.querySelector === 'function' && doc.querySelector(MATCH_ROOT_SEL)); }
  catch { return false; }
}

/** 把某个元素上的标记 / 属性 / inline 延迟全部摘掉（幂等）。★v1.4.0 还要摘掉相位回显属性。 */
export function clearMarks(el) {
  try {
    if (el.classList) {
      el.classList.remove(MARK_CLASS);
      el.classList.remove(GUARD_CLASS);
    }
    if (typeof el.removeAttribute === 'function') {
      el.removeAttribute(ORDER_ATTR);
      el.removeAttribute(PHASE_ATTR);
      el.removeAttribute(KIND_ATTR);
    }
    if (el.style && typeof el.style.removeProperty === 'function') {
      el.style.removeProperty('animation-delay');
      el.style.removeProperty(VAR_PHASE);
    }
  } catch { /* ignore */ }
}

/**
 * ★v1.4.0：读一个被标记元素当前的**相位**（秒）。给验收/面板做"所有 UI 相位完全相同"的断言用。
 * `--sp-dj-phase` 是纯回显属性，读不到时退回读 inline `animation-delay` 的第一个值。
 * @returns {number|null}
 */
export function phaseOf(el, win = globalThis) {
  try {
    const cs = win && win.getComputedStyle ? win.getComputedStyle(el) : null;
    if (cs && typeof cs.getPropertyValue === 'function') {
      const raw = String(cs.getPropertyValue(VAR_PHASE) || '').trim();
      if (raw) { const v = parseFloat(raw); if (Number.isFinite(v)) return v; }
    }
  } catch { /* ignore */ }
  try {
    const d = String((el.style && el.style.getPropertyValue('animation-delay')) || '').split(',')[0].trim();
    if (!d) return null;
    const v = parseFloat(d);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** ★v1.4.0：把页面上所有被标记元素的相位收集成 `[{kind, phase}]`（验收断相位的抓手）。 */
export function collectPhases(doc = globalThis.document, win = globalThis) {
  const out = [];
  try {
    for (const el of doc.querySelectorAll('.' + MARK_CLASS)) {
      out.push({ kind: el.getAttribute(KIND_ATTR) || '?', phase: phaseOf(el, win),
        delay: String((el.style && el.style.getPropertyValue('animation-delay')) || '') });
    }
  } catch { /* ignore */ }
  return out;
}

/** 系统的"减少动态效果"偏好（拿不到 matchMedia 就当作 false）。 */
function reducedMotion(win) {
  try {
    const mq = win && win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!(mq && mq.matches);
  } catch { return false; }
}

/**
 * 造一个 DOM 分组管理器。`sync()` 幂等：想开就装、想关就全撤。
 * @param {{ getConfig:() => any, log?: any, doc?: any, win?: any }} opts
 */
export function createDomUi({ getConfig, log = null, doc = globalThis.document, win = globalThis } = {}) {
  let styleEl = null;
  let styleText = '';
  let rootEl = null;              // 挂 ROOT_CLASS 的元素（一般是 <html>）
  let timer = 0;
  let mq = null;
  let onMq = null;
  let disposed = false;
  const stats = { active: false, reduced: false, styled: false, inMatch: false, marked: 0, rescans: 0, errors: 0,
    styleId: STYLE_ID, spinMode: 'spin', chaos: false, delays: 0, maxDeg: DOM_MAX_DEG, guard: false, guarded: 0,
    containers: 0, perKind: {}, spinPeriod: 67, squashPeriod: 38, squashMinPct: 60, widthMaxPct: 110, cssLen: 0,
    domMode: 'on', deg: DOM_MAX_DEG, bobOnly: false, rotCount: 0, uniformPhase: false, phases: 0, phaseSpread: 0 };

  const cfg = () => {
    const c = getConfig ? getConfig() : null;
    return c && typeof c === 'object' ? c : null;
  };

  /** 把所有痕迹撤干净（class + 三个属性 + inline animation-delay），并数一遍残留。 */
  function unmark() {
    if (!doc) return 0;
    try {
      const list = doc.querySelectorAll('.' + MARK_CLASS + ', .' + GUARD_CLASS + ', ['
        + ORDER_ATTR + '], [' + PHASE_ATTR + '], [' + KIND_ATTR + ']');
      for (const el of list) {
        try { clearMarks(el); } catch { stats.errors++; }
      }
      return list.length;
    } catch { stats.errors++; return 0; }
  }

  /** 摘掉 <style> 与根 class。 */
  function unstyle() {
    try {
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch { stats.errors++; }
    styleEl = null;
    styleText = '';
    try {
      if (rootEl) rootEl.classList.remove(ROOT_CLASS);
    } catch { stats.errors++; }
    rootEl = null;
    stats.styled = false;
    stats.cssLen = 0;
  }

  /** 整体退出：先摘元素标记，再摘 style 与根 class（顺序无关，但这样中间态也不会有"孤立标记"）。 */
  function off() {
    unmark();
    unstyle();
    stats.active = false;
    stats.marked = 0;
    stats.delays = 0;
    stats.guarded = 0;
    stats.containers = 0;
    stats.perKind = {};
    stats.uniformPhase = false;
    stats.phases = 0;
    stats.phaseSpread = 0;
  }

  /**
   * 给当前 DOM 里所有目标打标记。规则（v1.3.0）：
   *   ① 每个 target 的候选集 = `#app .screen.gm <sel>`（`global: true` 的不加前缀，但整个 mark() 只在
   *      `inMatch()` 为真时才会被调用 ⇒ 顶部提示同样只在战斗中才转）；
   *   ② 受保护元素（guardSettings 开时）直接跳过；
   *   ③ **最小单位优先**：后代里还有候选的候选 ⇒ 它是容器 ⇒ 不标记（`containers`）；
   *   ④ 只动"值真的变了"的元素（不整批重加 class）⇒ 摘掉 `.sp-dj-mark` 不会重启动画、不会跳相位；
   *   ⑤ 每轮把"这一轮不该再标记"的旧标记清掉（零残留的常规保证）。
   */
  function mark(c) {
    let n = 0, delays = 0, guarded = 0, containers = 0;
    const perKind = {};
    const mode = domModeOf(c);
    const spinSec = framesToSec(c && c.spinPeriod != null ? c.spinPeriod : 67);
    const sqSec = framesToSec(c && c.squashPeriod != null ? c.squashPeriod : 38);
    // ★v1.4.0：只有「开启」档参与混乱模式（'sync' 档全体同相、'off' 档根本不标）
    const phiFrac = mode === 'on' && c && c.chaos === true ? clampNum(c.chaosPhi == null ? 0.5 : c.chaosPhi, 0, 1) : 0;
    const guard = !(c && c.guardSettings === false);
    const gctx = guard ? guardContext(doc) : null;
    // ★v1.4.0：'sync'（同步）档 ⇒ 所有元素同一个相位；'on'（开启）档 ⇒ 各元素独立相位（+ 混乱偏移）
    const uniform = mode === 'sync';
    const bob = mode !== 'on';

    // ---- 第一遍：收集候选（受保护的元素在这里就出局，并且会把上一轮的痕迹摘掉）----
    const cands = [];
    const candSet = new Set();
    for (const t of DOM_TARGETS) {
      const sel = t.global ? t.sel : (MATCH_ROOT_SEL + ' ' + t.sel);
      let list;
      try { list = doc.querySelectorAll(sel); } catch { continue; }
      let i = 0;
      for (const el of list) {
        try {
          if (guard && isGuarded(el, gctx)) {
            if (el.classList.contains(MARK_CLASS) || el.hasAttribute(ORDER_ATTR) || el.hasAttribute(KIND_ATTR)) clearMarks(el);
            if (!el.classList.contains(GUARD_CLASS)) el.classList.add(GUARD_CLASS);
            guarded++;
            i++;
            continue;
          }
          if (el.classList.contains(GUARD_CLASS)) el.classList.remove(GUARD_CLASS);
          const idx = i++;
          if (candSet.has(el)) continue;          // 同一元素被多个选择器命中 ⇒ 只按第一个分组算
          candSet.add(el);
          cands.push({ el, kind: t.kind, idx });
        } catch { stats.errors++; }
      }
    }

    // ---- 第二遍：**最小单位优先**（后代里还有候选 ⇒ 本元素是容器 ⇒ 不转）----
    const hasCandDesc = new Set();
    for (const el of candSet) {
      let p = el.parentElement, hops = 0;
      while (p && hops++ < 64) { if (candSet.has(p)) hasCandDesc.add(p); p = p.parentElement; }
    }
    const next = new Set();
    // ★v1.4.0：相位统计（"任意两个被标记 UI 相位差为 0" 的现场证据）
    let phaseMin = Infinity, phaseMax = -Infinity;
    for (const cd of cands) {
      const el = cd.el;
      try {
        if (hasCandDesc.has(el)) {
          if (el.classList.contains(MARK_CLASS) || el.hasAttribute(KIND_ATTR)) clearMarks(el);
          containers++;
          continue;
        }
        if (!el.classList.contains(MARK_CLASS)) el.classList.add(MARK_CLASS);
        const v = String(cd.idx % 6);
        if (el.getAttribute(ORDER_ATTR) !== v) el.setAttribute(ORDER_ATTR, v);
        if (el.getAttribute(KIND_ATTR) !== cd.kind) el.setAttribute(KIND_ATTR, cd.kind);
        const key = (el.id || '') + '|' + cd.kind + '|' + String(cd.idx);
        const d = delayOf(key, spinSec, sqSec, phiFrac, uniform);
        if (el.getAttribute(PHASE_ATTR) !== String(d.p)) el.setAttribute(PHASE_ATTR, String(d.p));
        const want = bob ? (d.q + 's') : (d.r + 's, ' + d.q + 's');
        const cur = el.style && typeof el.style.getPropertyValue === 'function' ? el.style.getPropertyValue('animation-delay') : '';
        if (cur !== want) { el.style.setProperty('animation-delay', want); delays++; }
        // ★v1.4.0：相位回显（纯只读属性；「同步」档所有元素都是同一个值 = 0.000000）
        const ptxt = phaseText(d.r);
        if (el.style && typeof el.style.getPropertyValue === 'function'
          && el.style.getPropertyValue(VAR_PHASE) !== ptxt) el.style.setProperty(VAR_PHASE, ptxt);
        perKind[cd.kind] = (perKind[cd.kind] || 0) + 1;
        if (d.r < phaseMin) phaseMin = d.r;
        if (d.r > phaseMax) phaseMax = d.r;
        next.add(el);
        n++;
      } catch { stats.errors++; }
    }
    // ---- 第三遍：清掉"这一轮不该再标记"的旧痕迹（元素还在页面上、但已经不是目标了）----
    try {
      for (const el of doc.querySelectorAll('.' + MARK_CLASS)) if (!next.has(el)) clearMarks(el);
      for (const el of doc.querySelectorAll('[' + KIND_ATTR + ']')) if (!next.has(el)) clearMarks(el);
    } catch { stats.errors++; }

    stats.marked = n;
    stats.delays = delays;
    stats.guarded = guarded;
    stats.containers = containers;
    stats.perKind = perKind;
    stats.uniformPhase = uniform;
    stats.phases = n;
    stats.phaseSpread = n ? +(phaseMax - phaseMin).toFixed(6) : 0;
  }

  /** 装：注入 <style> + 给根挂 class + 给目标打标记。 */
  function on(c) {
    if (!doc) return;
    try {
      if (!styleEl) {
        styleEl = doc.getElementById(STYLE_ID);
        if (!styleEl) {
          styleEl = doc.createElement('style');
          styleEl.id = STYLE_ID;
          (doc.head || doc.documentElement).appendChild(styleEl);
        }
      }
      // ★ 只有文本真的变了才写（写 textContent 会重建 CSSOM ⇒ 正在跑的动画会重启动、跳相位）
      const css = buildCss(c || {});
      if (styleText !== css) { styleEl.textContent = css; styleText = css; }
      stats.styled = true;
      stats.cssLen = css.length;
      stats.spinMode = c && c.spinMode === 'flat' ? 'flat' : 'axis';
      stats.chaos = !!(c && c.chaos === true);
      stats.guard = !(c && c.guardSettings === false);
      stats.spinPeriod = Math.round(Number(c && c.spinPeriod) || 67);
      stats.squashPeriod = Math.round(Number(c && c.squashPeriod) || 38);
      stats.squashMinPct = Math.round(Number(c && c.squashMinPct) || 60);
      stats.widthMaxPct = Math.round(Number(c && c.widthMaxPct) || 110);
      stats.domMode = domModeOf(c || {});
      stats.deg = degOf(c || {});
      stats.bobOnly = stats.deg <= 0;
      stats.rotCount = stats.bobOnly ? 0 : 1;
      rootEl = doc.documentElement;
      rootEl.classList.add(ROOT_CLASS);
      mark(c || {});
      stats.active = true;
    } catch (e) {
      stats.errors++;
      log?.warn?.('[cyanfish.dj-models] DOM 分组注入失败（已整体回退）', e);
      off();
    }
  }

  return {
    /**
     * 幂等地把当前配置搬到 DOM 上。参数变了 / 系统偏好变了 / **屏幕换了**（进/出战斗）都调它。
     * ★ v1.3.0：**不在战斗中 ⇒ 整体退出**（连 <style> 都不留）—— 这是"标题屏/大厅零残留"的实现点。
     * ★ v1.4.0：门控链 = 总开关 `on` → DOM 分组 `gDom` → **三档 `domMode !== 'off'`** → 在战斗中 → 未命中 reduce。
     *   'off'（关闭）档走**与"分组关"完全相同**的退出路径 ⇒ 无压缩无旋转、逐元素零残留。
     */
    sync() {
      if (disposed || !doc) return this.stats();
      const c = cfg();
      const want = !!(c && groupOn(c, 'dom') && domOn(c));
      const red = reducedMotion(win);
      const inM = inMatch(doc);
      stats.reduced = red;
      stats.inMatch = inM;
      if (c) stats.domMode = domModeOf(c);
      if (!want || red || !inM) { if (stats.active || styleEl || rootEl) off(); return this.stats(); }
      on(c);
      return this.stats();
    },
    /** 屏幕换代之后补齐新元素（1000 ms 一次；**先 sync 再补标**，这样"刚进战斗"1 秒内就会开始转）。 */
    rescan() {
      if (disposed) return;
      stats.rescans++;
      try { this.sync(); } catch { stats.errors++; }
    },
    attach() {
      if (disposed || timer) return;
      // 系统偏好变化：reduce 一开就整体撤掉，reduce 一关再按参数装回来
      try {
        mq = win && win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
        if (mq) {
          onMq = () => { try { this.sync(); } catch { /* ignore */ } };
          if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);
          else if (typeof mq.addListener === 'function') mq.addListener(onMq);
        }
      } catch { /* 老浏览器：只有 sync() 时那次判定 */ }
      timer = setInterval(() => this.rescan(), 1000);
      if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref();
      this.sync();
    },
    stats() { return { ...stats, perKind: { ...stats.perKind } }; },
    /** 卸载：先摘监听，再整体退出（**必须把所有痕迹清空**）。 */
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) { clearInterval(timer); timer = 0; }
      try {
        if (mq && onMq) {
          if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onMq);
          else if (typeof mq.removeListener === 'function') mq.removeListener(onMq);
        }
      } catch { /* ignore */ }
      mq = null; onMq = null;
      off();
    },
  };
}
