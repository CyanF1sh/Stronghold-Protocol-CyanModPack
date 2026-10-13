// mods/cyanfish.dj-all/client/config.js — 本 Mod 的参数模型：**逐节点**的「关 / 全局 / 独立」三档 + 全局数值。
//
// ============================ 服主口径（本文件按这段话实现） ============================
// 「本 mod 的配置页面中，顶部为配置页，包含「关 / 全局 / 独立」三个选项，**默认所有元素的 DJ 效果关闭**。
//   下方可按照目录层级展开所有可配置元素，选中时可在顶部调整其配置；
//   当切换为「关」时，默认其配置数值**不允许输入/修改，且显示为空**；
//   当切换为「全局」时，其配置数值**显示为当前全局数值**，修改时**修改全局数值**；
//   当切换为「独立」时，其配置数值**默认显示为当前全局数值**，修改时**只修改其独立数值**。」
//
// ⇒ 三档语义（`MODE`）：
//    'off'    关   —— 该节点不参与 DJ 效果；参数区**只读且显示为空**（不是显示全局值，是**空**）。
//    'global' 全局 —— 用**全局那份**数值；在顶部改任何一个参数 ⇒ **改的是全局数值**（所有"全局"档的节点一起变）。
//    'own'    独立 —— 用**自己那份**数值；**初值 = 当前全局数值**（读的时候回落），改只改自己。
//
// ★ 默认：`nodes` 为空 ⇒ **每个节点都是 'off'** ⇒ 「默认所有元素的 DJ 效果关闭」成立（且存档里一个字节都不占）。
// ★ 存储键沿用项目约定 `sp.pref.<短名>`（宿主 = sp.pref.settings、公告 = sp.pref.announce …）⇒ 本 Mod = `sp.pref.djAll`。
// ★ 本文件**不 import 宿主任何内部模块**，自己读写 localStorage；不可用（隐私模式 / Node 测试）时静默退化成内存默认值。
// ★★ 所有数值都过 `sanitize`：坏 JSON / 手改过的值 / 老版本残留字段都不会让引擎算出 NaN
//    —— NaN 一旦进了 PIXI 的 scale，模型会直接消失（而且不报错），这是这类"整活 Mod"最容易踩的坑。

/** localStorage 键。 */
export const PREF_KEY = 'sp.pref.djAll';
/** 存储格式版本（读的时候只看有没有 `cfg` 字段，不比对版本号）。 */
export const PREF_V = 1;

/** ★ 帧率基准：所有"周期"参数的单位都是**这个帧率下的帧数**（与 dj-models 同口径，便于对齐音乐）。 */
export const FPS = 60;

/** 帧 → 秒（精确：帧 / 60）。 */
export const framesToSec = (n) => (Number.isFinite(n) ? n : 0) / FPS;

/**
 * ★★ ② 整个 Mod 功能的总闸（服主第 ② 条；**不含**局内入口那个开关 —— 那是 fab.on）。
 * ★ **出厂 = 关**（服主 2026-10-14 定稿）：装上这个 Mod 之后，**在玩家自己打开总闸之前一个像素都不动**。
 *   与「每个元素默认也都是关」叠加 ⇒ 双重保险（改了元素档位却忘了开总闸 ⇒ 什么都不发生，是预期行为）。
 */
export const DEFAULT_ON = false;

/** 三档模式 + 中文名（面板与预览页共用同一套字）。 */
export const MODES = Object.freeze(['off', 'global', 'own']);
export const MODE_LABEL = Object.freeze({ off: '关', global: '全局', own: '独立' });
export const MODE_HINT = Object.freeze({
  off: '这个元素不参与 DJ 效果；下面的数值不可改、也不显示（= 出厂状态）。',
  global: '用**全局**那份数值；在这里改任何一个参数，等于改全局数值，所有选「全局」的元素一起跟着变。',
  own: '用**自己**那份数值（初值就是当前的全局数值）；改只影响这一个元素，不碰全局。',
});

/**
 * 旋转模式（★ 服主 2026-10-14 定稿：**三档**）。
 *   `axis`   绕竖直轴 —— 宽度额外乘一个 `cos θ` 模拟转一圈（**允许为负 ⇒ 镜像**，即"转过侧面对着我们"）；
 *   `squash` 仅压缩   —— **不乘 `cos θ`**（⇒ 「水平旋转速度」这一项不生效，面板里会给它置灰 + 说明）；
 *   `flat`   平面内   —— 只绕元素**中心点**在屏幕平面里转（`rotate(θ)`），按「水平旋转速度」定一圈的周期。
 */
export const SPIN_MODES = Object.freeze(['axis', 'squash', 'flat']);
export const SPIN_MODE_LABEL = Object.freeze({ axis: '绕竖直轴', squash: '仅压缩', flat: '平面内' });
/** 不乘 `cos θ` 的模式（「水平旋转速度」对它们不生效）。 */
export const NO_SPIN_MODES = Object.freeze(['squash']);

/**
 * 参数定义（**面板顺序 = 这里的顺序**）。
 *   key/label/kind：控件类型 —— 'seg'（分段）/ 'frames'（整数帧输入框）/ 'pct'（百分比滑块）
 *   range：`[min, max, step]`；unit：`'frames' | 'pct'`
 * ★ 与 dj-models 同一套数值（那是服主逐轮定过口径的）：旋转周期 6~600 帧、压缩周期 6~600 帧、
 *   压缩强度 25~75 %、横向补偿 100~150 %。**参数个数仍是 4 个 + 1 个模式**，没有新增旋转参数。
 */
export const PARAMS = Object.freeze([
  { key: 'spinMode', label: '旋转模式', kind: 'seg', options: SPIN_MODES, optionLabels: SPIN_MODE_LABEL,
    hint: '绕竖直轴：横向按转到侧面的程度压窄，转过侧面时左右镜像（平面图表现「转过去」的方式）。'
      + '仅压缩：只做压扁与弹回、不做旋转（「水平旋转速度」不生效）。平面内：像指针一样绕元素中心在屏幕平面里转整圈。' },
  { key: 'spinPeriod', label: '水平旋转速度', kind: 'frames', range: [6, 600, 1], unit: 'frames', suffix: '/圈',
    hint: '转一整圈要多少帧（60 帧 = 1 秒）。右侧给出秒数换算，想对齐音乐就按帧数微调。★ 选「仅压缩」时这一项不生效。' },
  { key: 'squashPeriod', label: '压缩周期', kind: 'frames', range: [6, 600, 1], unit: 'frames', suffix: '/次',
    hint: '一次「压下去再弹回来」要多少帧，与旋转各走各的、互不干涉。' },
  { key: 'squashMinPct', label: '压缩强度', kind: 'pct', range: [25, 75, 1], unit: 'pct',
    hint: '压到最低时还剩多少高度：25% 几乎压成一条线，75% 只轻轻压一下。' },
  { key: 'widthMaxPct', label: '横向补偿', kind: 'pct', range: [100, 150, 1], unit: 'pct',
    hint: '压到最低时的水平宽度：100% 宽度不变，150% 是压扁的同时向两侧摊开到 1.5 倍。' },
]);

/**
 * ★ 随机偏移（服主的第 ④ 条）：「配置新增「随机偏移」行，可展开设置对于全局/独立均生效的随机偏移的开关和范围（除周期外）」。
 *   含义：每个元素在算完自己的数值之后，**除周期外**的参数（压缩强度 / 横向补偿）各自乘上 `1 ± k`，
 *   其中幅度 `k ∈ [loPct, hiPct] / 100`、正负号也随机。
 *   ★ **对「全局」档与「独立」档都生效**（它不挂在某个档位上，是"整份配置"的性质）。
 *   ★ 关键设计：**确定性**（种子 = 节点 id + 参数名）—— 同一个元素永远得到同一个偏移，
 *     所以"重开面板 / 刷新页面 / 改别的参数"都不会让战场上的幅度乱跳；只有改**范围**才会整体变。
 *   ★ 周期（spinPeriod / squashPeriod）**不参与**：那是玩家用来对齐音乐的量，随机化没有意义。
 */
export const DEFAULT_RND = Object.freeze({ on: false, loPct: 5, hiPct: 15 });
/** 随机偏移的幅度上限（%）：再大就不是"整活的错落感"而是把参数本身改坏了。 */
export const RND_MAX_PCT = 50;
/** 随机偏移作用到的参数（明确排除两个周期）。 */
export const RND_KEYS = Object.freeze(['squashMinPct', 'widthMaxPct']);

/**
 * ★★ 1.0.0：随机要落到**元素实例**上，而不是"目录里的那一项"。
 *
 * 服主原话：「随机偏移的随机需要具体到某一个元素实例上，例如**干员 A 与干员 B**，甚至**场上两个同名的干员**。」
 *
 * 两个世界各有各的"实例"：
 *   · **画布对象**（干员 / 敌人 / 召唤物 / 装置 / 特效…）的实例是**运行时的那个对象** ⇒
 *     用 `view.uid`（服务端 `nextUid()` 发的**每件棋子唯一**的号；两个同名干员 uid 不同）当种子，**每个对象各算一份**。
 *   · **DOM 元素**是纯 CSS 世界，没法在运行时给每个节点算一份随机（那要写内联样式 + 周期性重扫，
 *     代价是打破"零痕迹"）⇒ 改用**位置桶**：给一个选择器生成 `:nth-child(1..N)` 的变体规则，
 *     每个位置一份自己的随机值。**同为兄弟的那些实例**（队伍列 / 商店卡 / 角落四键…）就此各错各的。
 *
 * `INSTANCE_BUCKETS` = DOM 侧位置桶的个数（覆盖一屏内可能同时出现的同种实例；超出桶数的位置回落到基准那一份）。
 */
export const INSTANCE_BUCKETS = 8;
/** 位置桶的种子后缀（与"元素基准"的种子区分开，避免第 1 个位置刚好等于基准）。 */
export const bucketKey = (nodeId, k) => nodeId + '#' + k;

/**
 * 局内入口（服主的第 ② 条）：「在战斗中新增可配置位置的独立入口（可在设置中关闭该局内入口显示）」。
 *   `on` = 显示 / 隐藏；`x`/`y` = 位置，**视口宽高的比例**（0~1，指按钮左上角）——
 *   存比例而不是像素，换分辨率才不会跑出屏幕；拖动即配置（面板里有"回到默认位置"）。
 *   `alpha` = 那扇半透明浮窗的不透明度（0.35~1，默认 .72；浮窗要能看见背后的战场，见第 ③ 条）。
 */
export const DEFAULT_FAB = Object.freeze({ on: true, x: 0.952, y: 0.66, alpha: 0.72, hl: true });

/** 数值型参数的键（`spinMode` 是枚举，单独处理）。 */
export const VALUE_KEYS = Object.freeze(PARAMS.filter((p) => p.kind !== 'seg').map((p) => p.key));

/**
 * 全局数值的出厂默认（也是「恢复默认」要回到的那一份）。
 * ★ 挑的是"好看且对得上老观感"的一组（沿用 dj-models 的定稿值）：
 *   spinPeriod 67 帧 ≈ 1.117 s/圈 · squashPeriod 38 帧 ≈ 0.633 s/次 · 高度 60% · 宽度 110%。
 */
export const DEFAULT_GLOBAL = Object.freeze({
  spinMode: 'axis',
  spinPeriod: 67,
  squashPeriod: 38,
  squashMinPct: 60,
  widthMaxPct: 110,
});

/** 夹取到 [lo, hi]。 */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** 只认有限数；其它（含 NaN / 'abc' / undefined）一律取默认值。 */
const num = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

/** 一组数值的清洗（幂等）。周期类吸附到整数帧（"精确到帧"的实现点）。 */
export function cleanValues(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const out = {
    spinMode: SPIN_MODES.includes(o.spinMode) ? o.spinMode : DEFAULT_GLOBAL.spinMode,
  };
  for (const p of PARAMS) {
    if (p.kind === 'seg') continue;
    const [lo, hi] = [p.range[0], p.range[1]];
    const v = clamp(num(o[p.key], DEFAULT_GLOBAL[p.key]), lo, hi);
    out[p.key] = p.kind === 'frames' ? Math.round(v) : Math.round(v);
  }
  return out;
}

/** 清洗「随机偏移」块。 */
export function cleanRnd(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const lo = clamp(num(o.loPct, DEFAULT_RND.loPct), 0, RND_MAX_PCT);
  const hi = clamp(num(o.hiPct, DEFAULT_RND.hiPct), lo, RND_MAX_PCT);
  return { on: o.on === true, loPct: Math.round(lo), hiPct: Math.round(hi) };
}

/** 清洗「局内入口」块。位置一律夹在 [0.02, 0.98]，别让按钮跑到屏幕外就再也拖不回来。 */
export function cleanFab(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    on: o.on !== false,                       // 缺省 = 显示
    x: clamp(num(o.x, DEFAULT_FAB.x), 0.02, 0.98),
    y: clamp(num(o.y, DEFAULT_FAB.y), 0.02, 0.98),
    alpha: clamp(num(o.alpha, DEFAULT_FAB.alpha), 0.35, 1),
    hl: o.hl !== false,                       // ★ ③「选中元素时在画面上标黄框」：缺省 = 开
  };
}

/** 确定性哈希：把字符串揉成 [0,1) 的两个分量（用于"每个元素固定的随机偏移"）。 */
export function hash01(str, salt) {
  const t = String(str) + '|' + String(salt);
  let h = 2166136261 >>> 0;                    // FNV-1a
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let g = (h ^ 0x9e3779b9) >>> 0;
  g = Math.imul(g ^ (g >>> 15), 2246822507) >>> 0;
  return ((g ^ (g >>> 13)) >>> 0) / 4294967296;
}

/**
 * 把一份数值按"节点 id + 参数名"做**确定性随机偏移**（除周期外）。导出的纯函数，单测与报告直接复算。
 * @param {any} vals 已经算好的数值（全局档或独立档）
 * @param {string} nodeId 树节点 id
 * @param {any} rnd `cleanRnd()` 的产物
 */
export function applyRandom(vals, nodeId, rnd) {
  const out = { ...vals };
  const r = cleanRnd(rnd);
  if (!r.on) return out;
  const lo = r.loPct / 100, hi = r.hiPct / 100;
  for (const key of RND_KEYS) {
    const p = PARAMS.find((x) => x.key === key);
    if (!p || !p.range) continue;
    const hA = hash01(nodeId, key + ':amp');
    const hB = hash01(nodeId, key + ':sign');
    const k = lo + (hi - lo) * hA;
    const sign = hB < 0.5 ? -1 : 1;
    const raw = out[key] * (1 + sign * k);
    out[key] = Math.round(clamp(raw, p.range[0], p.range[1]));
  }
  return out;
}

/**
 * ★ 节点 id 归一化（**容错**）：树节点的 id 有前缀（`E:` / `G:` / `L:`），而"元素 id"（如 `top.roundbox`）没有。
 *   外部（E2E / 控制台 / 别的 Mod）很容易拿元素 id 直接来调 —— 那样 `cfg.nodes['top.roundbox']` 永远匹配不到
 *   `compile()` 里查的 `E:top.roundbox`，于是**配置写进去了、效果却没出现**（本工序的 014 探针就踩了这个）。
 *   ⇒ 这里统一补前缀：没有 `:` 的一律当元素 id 处理（`E:` 前缀）。
 */
export function normId(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  return s.includes(':') ? s : 'E:' + s;
}

/**
 * ★★ 压缩脉冲的形状（**服主 2026-10-14 定稿**，DOM 与画布两侧共用同一份实现）：
 *
 *   「在『绕竖直轴』模式下，元素在周期内**前 40%** 时间高度达到最低、宽度达到最大，
 *     然后在**后 40%** 时间内回到原位，在**剩余的 20%** 时间内保持原状。由此产生节奏感。」
 *
 *   ⇒ 归一化相位 `u ∈ [0,1)` 上的深度 `s`（0 = 原状，1 = 压到最低）：
 *        u ∈ [0, 0.4)       s = u / 0.4                （0 → 1，单调压到底）
 *        u ∈ [0.4, 0.8)     s = 1 − (u−0.4) / 0.4      （1 → 0，单调弹回原位）
 *        u ∈ [0.8, 1)       s = 0                      （**保持原状** —— 这 20% 就是"节奏感"的来源）
 *   ★ 形状是**线性三角波 + 尾部静止**，不是余弦：余弦没有"保持原状"那一段，听不出节奏。
 *   ★ 这条曲线只有四个折点（0 / 0.4 / 0.8 / 1），所以 CSS 那条 keyframes 也只需要四个停靠点 —— 精确且最省。
 */
export const SQUASH_IN = 0.4;
export const SQUASH_OUT = 0.4;
export function squashProfile(u) {
  let x = Number(u) || 0;
  x -= Math.floor(x);                       // 折回 [0,1)
  if (x < SQUASH_IN) return x / SQUASH_IN;
  if (x < SQUASH_IN + SQUASH_OUT) return 1 - (x - SQUASH_IN) / SQUASH_OUT;
  return 0;
}

/**
 * ★★ 这个元素自己的随机初相位 `φ ∈ [0,1)`（服主 2026-10-14 定稿的第 ⑤ 条末段）：
 *   「关于随机偏移，还需要给每个元素一个**随机的初相位**，使得其处于相同周期的不同位置，
 *     否则会出现『开启了随机偏移但是所有元素仍然是都在压缩 / 都在回弹』。」
 *
 *   ★ 由「节点 id」确定性哈希 ⇒ 同一个元素永远同一个相位（重开面板 / 刷新都不跳）；
 *   ★ **不是**一个新参数：它跟着「随机偏移」的开关走（`rnd.on === true` 才生效，否则全体 φ=0、完全同步）。
 *   ★ 用途：DOM 侧把它变成 `animation-delay: −φ × 周期`（纯 CSS，零每帧开销）；
 *     画布侧把它加进相位（`phase + φ × T`）。
 */
export function phaseOf(cfg, nodeId) {
  const r = cleanRnd(cfg && cfg.rnd);
  if (!r.on) return 0;
  return hash01(nodeId, 'phase');
}

/** 一个节点的档位（缺省 = 'off'）。★ 参数可以是元素 id（自动补 `E:`）。 */
export function modeOf(cfg, id) {
  const n = cfg && cfg.nodes ? cfg.nodes[normId(id)] : null;
  return n && MODES.includes(n.m) ? n.m : 'off';
}

/**
 * 一个节点**此刻实际生效**的数值（面板与引擎都用它，保证"看到的就是生效的"）。
 * @returns {{ spinMode:string, spinPeriod:number, squashPeriod:number, squashMinPct:number, widthMaxPct:number }}
 *   'off' ⇒ 返回全局值（调用方按 mode 决定要不要用）；'global' ⇒ 全局值；'own' ⇒ 自己的值（缺省回落全局）。
 */
export function valuesOf(cfg, id) {
  const g = cleanValues(cfg && cfg.glob);
  const m = modeOf(cfg, id);
  if (m !== 'own') return g;
  const own = cfg.nodes[normId(id)] && cfg.nodes[normId(id)].v;
  return own ? cleanValues(own) : g;      // ★ 「独立」档默认显示当前全局数值 = 这里回落
}

/** `sanitize` 用的一个节点清洗。 */
function cleanNode(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const m = MODES.includes(raw.m) ? raw.m : 'off';
  if (m === 'off') return null;                  // 关：不占存档
  if (m === 'global') return { m: 'global' };    // 全局：不存数值（跟着全局走）
  const hasV = raw.v && typeof raw.v === 'object';
  return hasV ? { m: 'own', v: cleanValues(raw.v) } : { m: 'own' };
}

/** 把任意输入洗成一份**保证合法**的配置（幂等）。 */
export function sanitize(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const nodes = {};
  const src = o.nodes && typeof o.nodes === 'object' ? o.nodes : {};
  for (const rawId of Object.keys(src)) {
    const id = normId(rawId);              // ★ 裸元素 id 也接受（归一化到 `E:` 前缀），见 normId 的注释
    if (!id) continue;
    const n = cleanNode(src[rawId]);
    if (n) nodes[id] = n;
  }
  // ★ 总闸：**只有显式 true 才算开**（缺省 = 关）⇒ 出厂与老存档升级后都是「全部停手」，要玩家自己打开
  return { v: PREF_V, on: o.on === true, glob: cleanValues(o.glob), rnd: cleanRnd(o.rnd), fab: cleanFab(o.fab), nodes };
}

/** 读一份配置；坏 JSON / 没有 localStorage ⇒ 默认值。★ 多种外壳都认（只看有没有 `cfg` 字段）。 */
export function load(storage = safeStorage()) {
  const empty = () => sanitize(null);
  if (!storage) return empty();
  try {
    const raw = storage.getItem(PREF_KEY);
    if (!raw) return empty();
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return empty();
    const body = j.cfg && typeof j.cfg === 'object' ? j.cfg : j;
    return sanitize(body);
  } catch { return empty(); }
}

/** 写一份配置（失败静默：隐私模式 / 配额满）。 */
export function save(cfg, storage = safeStorage()) {
  if (!storage) return false;
  try { storage.setItem(PREF_KEY, JSON.stringify(sanitize(cfg))); return true; } catch { return false; }
}

/** localStorage 句柄；拿不到（Node / 被策略禁掉）返回 null。 */
export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__sp_dja_probe__';       // Safari 隐私模式：存在但 setItem 抛 QuotaExceededError
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch { return null; }
}

/**
 * 参数仓库：**同步读、同步写、订阅式广播**。引擎与设置面板共享同一个实例。
 * 写盘**去抖**（拖滑块时每帧都会 set，直接写 localStorage 会掉帧）。
 */
export function createStore({ storage = safeStorage(), debounceMs = 250, onError = null } = {}) {
  let cfg = load(storage);
  const subs = new Set();
  let timer = 0;

  const emit = () => {
    const snap = cfg;                            // 配置对象是"一次性替换"的，快照直接给引用（内部不再改它）
    for (const fn of [...subs]) { try { fn(snap); } catch (e) { onError?.(e); } }
  };
  const writeNow = () => { timer = 0; try { save(cfg, storage); } catch (e) { onError?.(e); } };

  return {
    /** 当前配置（**只读语义**：改请走 set / setMode / setValues）。 */
    get() { return cfg; },
    /**
     * 改若干字段（走同一套清洗 + 广播 + 持久化）。
     * @param {{ on?:any, glob?:any, nodes?:any }} patch
     */
    set(patch) {
      const p = patch && typeof patch === 'object' ? patch : {};
      const next = sanitize({
        on: p.on === undefined ? cfg.on : p.on,
        glob: p.glob ? { ...cfg.glob, ...p.glob } : cfg.glob,
        rnd: p.rnd ? { ...cfg.rnd, ...p.rnd } : cfg.rnd,
        fab: p.fab ? { ...cfg.fab, ...p.fab } : cfg.fab,
        nodes: p.nodes === undefined ? cfg.nodes : p.nodes,
      });
      cfg = next;
      emit();
      if (debounceMs > 0) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(writeNow, debounceMs);
        if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref();
      } else writeNow();
      return cfg;
    },
    /** 改全局数值里的某几个键（」全局「档的节点与所有回落都用它）。 */
    setGlobal(patch) { return this.set({ glob: patch }); },
    /** 改某个节点的档位；切到 'own' 时**不写数值** ⇒ 界面自然显示"当前全局数值"。 */
    setMode(rawId, mode) {
      const id = normId(rawId);
      if (!id) return cfg;
      const m = MODES.includes(mode) ? mode : 'off';
      const nodes = { ...cfg.nodes };
      if (m === 'off' || m === 'global') nodes[id] = { m };
      else nodes[id] = { m: 'own' };             // ★ 独立档：先不落数值（回落全局）⇒ "默认显示当前全局数值"
      return this.set({ nodes });
    },
    /** 改某个节点**自己那份**数值（只对 'own' 档有意义）。 */
    setOwnValues(rawId, patch) {
      const id = normId(rawId);
      if (!id) return cfg;
      if (modeOf(cfg, id) !== 'own') return cfg;
      const cur = valuesOf(cfg, id);
      const nodes = { ...cfg.nodes };
      nodes[id] = { m: 'own', v: cleanValues({ ...cur, ...(patch && typeof patch === 'object' ? patch : {}) }) };
      return this.set({ nodes });
    },
    /** ★② 改总闸（整个 Mod 功能的总开关；不影响局内入口 `fab.on`）。 */
    setOn(v) { return this.set({ on: v !== false }); },
    /** ★④ 只把**元素相关**的配置恢复出厂（清 nodes + 全局数值回出厂 + 随机偏移回出厂），不动局内入口。 */
    resetElements() {
      cfg = sanitize({ on: cfg.on, fab: cfg.fab });
      emit();
      if (debounceMs > 0) { if (timer) clearTimeout(timer); timer = setTimeout(writeNow, debounceMs); if (typeof timer === 'object' && timer && typeof timer.unref === 'function') timer.unref(); }
      else writeNow();
      return cfg;
    },
    /** 改「随机偏移」（开关 / 幅度范围）。★ 对全局与独立两档都生效。 */
    setRnd(patch) { return this.set({ rnd: { ...cfg.rnd, ...(patch && typeof patch === 'object' ? patch : {}) } }); },
    /** 改「局内入口」（显示开关 / 位置 / 浮窗不透明度）。 */
    setFab(patch) { return this.set({ fab: { ...cfg.fab, ...(patch && typeof patch === 'object' ? patch : {}) } }); },
    /** 把某个节点恢复成出厂（= 关） */
    clearNode(rawId) {
      const id = normId(rawId);
      if (!id) return cfg;
      const nodes = { ...cfg.nodes };
      delete nodes[id];
      return this.set({ nodes });
    },
    /** 全部恢复默认（= 每个元素都是「关」+ 全局数值回出厂）。 */
    reset() { cfg = sanitize(null); emit(); if (timer) clearTimeout(timer); writeNow(); return cfg; },
    /** 立刻落盘（卸载 / 页面隐藏时用）。 */
    flush() { if (timer) clearTimeout(timer); writeNow(); },
    /** 订阅（注册时立即回调一次）。返回 unsubscribe。 */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      try { fn(cfg); } catch (e) { onError?.(e); }
      return () => subs.delete(fn);
    },
  };
}

/** 取一个节点底下的全部叶子（叶子返回它自己）。★ 导出：设置面板的「位置高亮」要用它。 */
export function leavesOf(n) {
  if (!n) return [];
  if (n.kind === 'leaf') return [n];
  const out = [];
  const walk = (ns) => { for (const x of ns) { if (x.kind === 'leaf') out.push(x); else if (x.children) walk(x.children); } };
  walk(n.children || []);
  return out;
}

/**
 * 这个元素会不会**在同一屏里重复出现**（`count: 'n'` 或 > 1）⇒ 需要"位置桶"变体。
 * ★ 依据是元素表里的 `count`（`'n'` = 一屏多个；数字 = 同时存在几个），不猜。
 */
function repeatOf(el) {
  const c = el && el.count;
  if (c === 'n') return true;
  return typeof c === 'number' && c > 1;
}

/**
 * 给一个会重复的 DOM 元素算 N 份"位置桶"随机值（`:nth-child(k)` 用）。
 * @returns {Array<{m:number, w:number, phi:number}>} 长度 = INSTANCE_BUCKETS，下标 0 对应 `:nth-child(1)`
 */
function bucketVariants(baseVals, nodeId, rnd) {
  const out = [];
  for (let k = 1; k <= INSTANCE_BUCKETS; k++) {
    const key = bucketKey(nodeId, k);
    const v = applyRandom(baseVals, key, rnd);
    out.push({ m: v.squashMinPct, w: v.widthMaxPct, phi: phaseOf({ rnd }, key) });
  }
  return out;
}

/**
 * 把配置**编译**成引擎要的东西：一串"作用项"。
 *
 *   一条作用项 = `{ id, kind, mode, vals, phase, danger, sel, global, pixi }`
 *   · 只有"这条路线上有档位不是 off"的叶子才会出现；
 *   · **DOM 元素**：`sel` 非空、`global` 标它是不是"战斗屏之外"（只有 `hint.toast`）；
 *   · **画布对象**：`sel === ''`、`pixi` 非空（= 引擎分组键），交给 PIXI 侧引擎。
 *
 * ★★ 0.6.0 起改为**逐叶子**产出（服主 2026-10-14 的第 ⑤ 条末段：「还需要给每个元素一个随机的初相位，
 *    使得其处于相同周期的不同位置，否则会出现『开启了随机偏移但是所有元素仍然是都在压缩 / 都在回弹』」）。
 *    旧写法把"一个节点底下的所有叶子"拼成一个并集选择器、共用一份数值与**同一个相位** ⇒
 *    玩家给一整层（或一整组）开效果时，那一层的元素**完全同步**地一起压、一起弹 —— 正是服主看到的现场。
 *    现在每个叶子各出一条：相位 = 那个元素自己的哈希（`phaseOf`，仍跟着「随机偏移」开关走），
 *    随机偏移的幅度也逐元素算（`applyRandom(…, 叶子 id, …)`）。⇒ 一整层一起开也天然错落。
 *
 * ★ 档位与数值**沿树向下继承**（最近的祖先说了算），语义与"选一整组 = 这一组里的元素一起用同一个档位"一致：
 *   · 叶子自己设了档位 ⇒ 用自己的（`valuesOf(cfg, 叶子 id)`）；
 *   · 只有祖先设了档位 ⇒ 用祖先那一份（`global` 档 = 全局数值；`own` 档 = 祖先自己那份数值）；
 *   · 一条路线上谁都没开 ⇒ 这个叶子**不产出**（零残留）。
 * ★ `kind` 取**"真正下这个档位的那个节点"的 kind** —— 画布侧的去重规则（更具体的节点优先，见 engine.js）
 *   依赖它，所以不能让"层给的档位"看起来像"叶子自己设的"。
 *
 * ★ 这里**不查 DOM**，纯数据 —— 便于单测，也保证"设置页看到的就是引擎拿到的"。
 * @param {any} cfg
 * @param {Array<any>} tree `buildTree()` 的产物
 */
export function compile(cfg, tree) {
  const out = [];
  // ★★ ② 总闸关掉 ⇒ 直接不产出任何作用项（引擎两侧都会因此停手、并把已经写过的还回去）
  //    出厂 on === false（见 DEFAULT_ON）⇒ 装上 Mod 后必须先去设置里把总闸打开，元素才会动。
  if (!cfg || cfg.on !== true) return out;
  const rnd = cfg && cfg.rnd;
  /**
   * @param {Array<any>} ns 同级节点
   * @param {null|{mode:string, vals:any, danger:boolean, srcKind:string}} inh 从祖先继承下来的档位
   */
  const walk = (ns, inh) => {
    for (const n of ns) {
      const m = modeOf(cfg, n.id);
      // 本节点自己的档位（'off' ⇒ 不改继承，让祖先的继续生效）。
      // ★ 这里**不做**随机偏移 —— 随机必须逐元素算（见下面 emit 处），否则一整层的随机幅度是一样的。
      const cur = m !== 'off'
        ? { mode: m, vals: valuesOf(cfg, n.id), danger: n.danger === true, srcKind: n.kind }
        : inh;
      // ★★ 组 / 层：**无条件下探**，哪怕自己是「关」。
      //    这里曾经写成"先 `if (!cur) continue` 再判叶子"⇒ 只要某一层/组自己是「关」，**整棵子树都被跳掉**
      //    ⇒ **单独给一个元素设档位完全不生效**（0.6.0 的真机事故：服主"刷新后所有动作都不生效"、
      //    而两个探针恰好都用整层 `L:top` 在测 ⇒ 一路假绿）。判据必须留在**叶子**那一支里。
      if (n.kind !== 'leaf') {
        if (n.children) walk(n.children, cur);
        continue;
      }
      if (!cur) continue;                            // 叶子：自己与祖先都没开 ⇒ 不产出
      // ★★ 逐实例落地的两个"随机"：**幅度**（applyRandom，作用到压缩强度/横向补偿）与**初相位**（phaseOf）。
      //    画布对象在运行时按 `view.uid` 逐对象算（见 engine-pixi.js 的 instanceFactors）；
      //    DOM 侧在这里按"基准 + 位置桶"预先把值算好（engine-dom.js 只负责排版，保持纯函数）。
      const el = n.el;
      if (!el) continue;
      const danger = n.danger === true || cur.danger === true;
      if (el.sel) {
        out.push({ id: n.id, kind: 'leaf', mode: cur.mode, vals: applyRandom(cur.vals, n.id, rnd),
          phase: phaseOf(cfg, n.id), danger, sel: el.sel, global: !!el.global, pixi: '',
          // ★ 会重复出现的那种元素（`count: 'n'` / >1）⇒ 附上"位置桶"变体，让每个实例各错各的
          buckets: repeatOf(el) ? bucketVariants(cur.vals, n.id, rnd) : null });
      }
      if (el.pixi) {
        out.push({ id: n.id, kind: cur.srcKind, mode: cur.mode, vals: applyRandom(cur.vals, n.id, rnd),
          phase: phaseOf(cfg, n.id), danger, sel: '', global: false, pixi: el.pixi });
      }
    }
  };
  walk(tree || [], null);
  return out;
}
