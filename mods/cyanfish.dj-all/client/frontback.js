// mods/cyanfish.dj-all/client/frontback.js — ★★ ⑤b **转身换面（正 / 背）**。
//
// 从归档的 `cyanfish.dj-models/client/frontback.js` 移植（那是服主逐轮调过的定稿），本 Mod 只做三处适配：
//   ① 去掉那里的 `fbSwap` / `fbDead` 用户参数 —— 本 Mod 的规格里没有这两项，永远按"轴转模式才换面"跑；
//   ② `isControlView()`（晕眩 / 冻结 / 沉睡）本来就只在那边 config.js 里，这里**内联复刻**同一组常量与判据；
//   ③ 只保留本 Mod 需要的能力：`beginFrame / step / restoreView / restoreGroup / restoreAll / prune / probe / stats`。
//
// ============================ 为什么这件事只要一句话 ============================
// `public/js/render/units.js:21-26` 的抬头注释逐字写着：Back 模型用于 UP 方向，Front 用于 RIGHT / DOWN、
// LEFT 则镜像；`setDir(dir)` 能**原地换骨架**（`_syncModel() → _loadSpine() → _acquireSpine()`），
// 中间**不闪 fallback 钻石**（units.js:576-581）。⇒ 不需要碰 public/**、不需要自己加载骨骼。
//   · `view.setDir('UP')`    ⇒ 宿主挂**背面** skeleton
//   · `view.setDir(其它)`    ⇒ 宿主挂回**正面** skeleton
//
// ============================ ★ 判据：用谁说的话 ============================
// ① **换不换**：用当前 `cos θ` 的**符号**（这正是"宽度过零"的数学形式 —— `body.scale.x ∝ cos θ`）。
//    `'flat'`（平面内）/ `'squash'`（仅压缩）下宽度不过零 ⇒ **不换面**（调用方据此传 axis=false）。
// ② **能不能换**：用**宿主自己的判据**，绝不猜路径 —— `view.ctx.assets.hasBack(id)`
//    （与 `_wantsBack()` 里用的是同一个函数、同一个 id 取法）。没有 back 就**一个字节都不写**。
// ③ **什么时候绝不碰**：
//    · 倒地 / 死亡 / 淡出：135 个 Back 骨架里只有 4 个自带 Die 剪辑，其余必须退回 Front 播死亡
//      ⇒ 我们**保持不动**，把决定权完全留给宿主（它下一帧会自己按 `_wantsBack()` 退回 Front）。
//    · ★★ 晕眩 / 冻结 / 沉睡：宿主 `_baseFromAnim()`（units.js:716-720）把这三位完全等同成一个 `'stun'` 静息态，
//      而它在 `spine.js` 里是**动画模式**（还可能 `frozen` 冻住姿态）。此刻换模型 = 替宿主在强控中途
//      `_dropActor()` + 异步重建 SpineActor ⇒ 渲染丢失 / 只渲染部分（服主实测过）。**期间一个字节都不写**。
//    · 替身 / 形态（`view.form`）、备战盘与预览栏（`view.prep`）、敌人（`setDir` 对敌人本就是 no-op）。
//
// ============================ ★★ 死区（迟滞）与"零宽度切换" ============================
// 唯一门限 `dead`，两侧共用 ⇒ 等价于过零前后各一个小门限：
//   正面→背面要 `cos θ < −dead`；背面→正面要 `cos θ > +dead`；`|cos θ| ≤ dead` 里保持上一次判定。
// 死区 = 90° ± 2.29°，一个周期占 1.3% 的时间；取 0.04 是因为它**小于默认周期（67 帧）一帧的 |Δcos| ≈ 0.094**
// ⇒ 不会把换面额外往后推一帧（换面永远发生在过零后的第一帧，那是"最接近 0 宽"的可达帧）。
//
// ============ ★★ 背面时横向**不做** |cos θ| 修正（1.0.1 服主实测口径） ============
// 0.6.x 曾按"背面资产 = 把正面**转过 180°** 的那张图"这个推断做了一条修正：挂背面时把横向乘数从 `cos θ`
// 换成 `|cos θ|`（理由是"背面已经是转过 180° 的样子，再镜像一次就成'背面的镜像'"）。
//
// ★★ 服主 2026-10-14 实测**推翻了这条前提**，原话：
//    「在**整备阶段**不会调用干员的背面切换，**此时仅翻转**。但是在**战斗阶段**，实际上的**背面资产是对称
//      而非旋转 180°**，也就是说，**不需要将 cos θ 改为 |cos θ|**，而是**直接额外调宿主 setDir()**。」
//
// ⇒ 现在的口径（本文件按此实现）：
//    · **横向永远用带符号的 `cos θ`**，不做任何修正 —— 宽度过零时自然镜像，这就是"翻转"；
//    · **换面**（调 `setDir()`）只负责"换成背面资产"，与横向乘数**无关**；
//    · **整备阶段**（`view.prep === true`）**不调 `setDir()`**（那里 `dir` 是玩家正在编辑的部署方向，宿主每次同步都会重设）
//      ⇒ 那一阶段就是服主说的"**仅翻转**"，而这条本来就在下面的"绝不碰"名单里；
//    · 合起来即服主先前问的那个选项：**既切换正反、又进行镜像**。
//
// ★ `signOf()` 保留成函数（恒返回 1）而不是删掉：它是上面那个特例的唯一开关，
//   将来若某类资产的背面确实不对称、需要 `|cos θ|`，改这一行就能恢复。
//
// ============================ ★ 换面只换模型，不动"朝向指示" ============================
// `setDir()` 顺手会写 `dir` / `facing` / `visFacing` / `hasDir`。后三个是**朝向指示**（地面那个橙色 ›、
// 模型镜像、阻挡标记画在哪一侧），不是模型 ⇒ 每次 `setDir()` 之后**逐值还原** `facing` / `visFacing`，
// `hasDir` 只在"我们真的覆盖了 dir"期间压成 false。⇒ 换面期间不会有朝向指示在 90°/180° 之间来回跳
//（那会把"部署 / 攻击方向"这条**玩法信息**说错），而一切都在功能关掉 / 视图退出时**逐值还原**。

/** 死区（|cos θ| 门限）。0.04 ⇒ 90° ± 2.29°（小于默认周期一帧的 |Δcos| ≈ 0.094 ⇒ 不会额外推后一帧）。 */
export const FB_DEFAULT_DEAD = 0.04;
/** 正面模型要挂在哪：`dir !== 'UP'` 时 `_wantsBack()` 必为假 ⇒ 宿主必然保持 Front。 */
export const FB_FRONT_DIR = 'RIGHT';
/** 背面模型：宿主里唯一会走 Back 模型的 dir。 */
export const FB_BACK_DIR = 'UP';

/** ★ 内联复刻 `shared/constants.js` 的三个位与 `ANIM.STUN`（与 dj-models 逐值相同）。 */
export const CONTROL_ANIM_STUN = 5;                 // ANIM.STUN
const CONTROL_UF_MASK = 2 | 4 | 256;                // UF.STUNNED | UF.FROZEN | UF.SLEEP

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * 这个视图此刻处于**晕眩 / 冻结 / 沉睡**吗（宿主 `_baseFromAnim()` 判据的逐字复刻）。
 * @param {any} v 渲染层的 UnitView
 */
export function isControlView(v) {
  if (!v || typeof v !== 'object') return false;
  const anim = typeof v.anim === 'number' ? v.anim : 0;
  if (anim === CONTROL_ANIM_STUN) return true;
  const f = typeof v.flags === 'number' ? v.flags : 0;
  return (f & CONTROL_UF_MASK) !== 0;
}

/**
 * ★ 换面判据（**纯函数**，报告与单测直接复算它）。
 * @param {number} cosT 当前的 cos θ
 * @param {number} dead 死区（0 ⇒ 无死区，纯符号）
 * @param {boolean} wasBack 上一次的判定（true = 当前挂着背面）
 * @returns {boolean} 这一帧**想要**背面吗
 */
export function fbTarget(cosT, dead, wasBack) {
  const c = typeof cosT === 'number' && Number.isFinite(cosT) ? cosT : 0;
  const d = clampNum(typeof dead === 'number' && Number.isFinite(dead) ? dead : FB_DEFAULT_DEAD, 0, 0.3);
  if (wasBack) return !(c > d);
  return c < -d;
}

/**
 * ★ 宿主自己的判据：这个视图有没有**背面**模型。**不猜路径** —— 直接问宿主的 assets。
 * @param {any} v
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
 * 这个视图为什么**不能**换面（'' = 可以）。返回值同时当统计口径用。
 * @returns {''|'destroyed'|'nosetdir'|'enemy'|'dead'|'dying'|'down'|'stun'|'form'|'prep'|'noback'}
 */
export function fbBlockedBy(v) {
  if (!v || v.destroyed) return 'destroyed';
  if (typeof v.setDir !== 'function') return 'nosetdir';
  if (v.info && v.info.kind === 'device') return 'nosetdir';
  if (v.isEnemy) return 'enemy';
  if (v.alive === false) return 'dead';
  if (v.dying > 0) return 'dying';
  if (v.down) return 'down';
  if (isControlView(v)) return 'stun';            // ★ 晕眩 / 冻结 / 沉睡：与倒地同一条纪律
  if (v.form) return 'form';
  if (v.prep === true) return 'prep';
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

/** 正面时该挂哪个 dir：宿主原本就是 UP 的话必须换一个非 UP 的（否则 `_wantsBack()` 仍为真、模型根本不换）。 */
function frontDirOf(s) { return s.baseDir === FB_BACK_DIR ? FB_FRONT_DIR : s.baseDir; }

/**
 * 这一帧该用的横向符号。★ 1.0.1 起**恒为 1** —— 横向永远用**带符号**的 `cos θ`（不做 `|cos θ|` 修正）。
 * 导出成常量是为了让门禁能把它钉住（`out/adapt/dj-all-028-fbunit.mjs` 直接断言它）；理由见本文件抬头。
 */
export const FB_HORIZONTAL_SIGN = 1;
const signOf = () => FB_HORIZONTAL_SIGN;

/**
 * 造一个"换面器"。生命周期与画布引擎一致：每帧 `beginFrame()` + 逐视图 `step()`；关掉 / 卸载时 `restoreAll()`。
 * @param {{ log?: any }} [opts]
 */
export function createFrontBack({ log = null } = {}) {
  /** 视图 → { baseDir, baseFacing, baseVis, baseHasDir, want, gid } */
  const st = new WeakMap();
  /** 分组 → 被我们接管过的视图集合（还原时要能枚举）。 */
  const byGroup = new Map();

  const stats = {
    gate: false, eligible: 0, back: 0, swaps: 0, swapsTotal: 0, everManaged: 0,
    noBack: 0, held: 0, stun: 0, blocked: 0, restored: 0, managed: 0,
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
    try { if (typeof dir === 'string' && dir && v.dir !== dir) v.setDir(dir); }
    catch (e) { log?.warn?.('[cyanfish.dj-all] setDir 失败（已忽略，重试下一帧）', e); }
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
    stats.eligible = 0; stats.back = 0; stats.swaps = 0;
    stats.noBack = 0; stats.held = 0; stats.stun = 0; stats.blocked = 0; stats.managed = 0;
  }

  /**
   * 每帧对一个单位视图调用一次。
   * @param {any} v 渲染层的 UnitView（"模型已加载"由收集器保证）
   * @param {number} cosT 本帧的 `cos θ`
   * @param {number} dead 死区
   * @param {string} gid 分组 id（用于分组还原）
   * @returns {number} 这一帧横向该用的**符号**（1.0.1 起恒为 1 —— 横向永远用带符号的 `cos θ`）
   */
  function step(v, cosT, dead, gid) {
    const why = fbBlockedBy(v);
    const s = st.get(v);
    if (why) {
      let sign = 1;
      if (s) {
        if (why === 'dead' || why === 'dying' || why === 'down') {
          stats.held++;
          sign = signOf();                               // 保持不动，把 dir 留在原处
        } else if (why === 'stun') {
          stats.stun++;                                  // ★ 一个字节都不写
          sign = signOf();
        } else {
          restoreOne(v, s);                              // 其它原因：逐值还原，一个字节都不留
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
      stats.swaps++;                                     // ★ 正→背、背→正 各算 1 次 ⇒ 一个周期应恰好 2 次
      stats.swapsTotal++;
    } else if (v.dir !== dir) {
      applyDir(v, cur, dir);                             // 宿主可能把 dir 写回去了 ⇒ 每帧对齐，但不算"换面"
    } else {
      syncIndicators(v, cur);
    }
    if (v.dir !== cur.baseDir) stats.managed++;
    if (v.entryBack === true) stats.back++;
    return signOf();
  }

  /** 这个视图此刻被我们管着吗（自省 / 报告用）。 */
  function isManaged(v) { return !!st.get(v); }

  /** 单个视图的还原（分组切到"不换面"的模式时用）。 */
  function restoreView(v) { const s = st.get(v); if (s) restoreOne(v, s); }

  /** 还原一个分组（分组开关关掉时）。 */
  function restoreGroup(gid) {
    const set = byGroup.get(gid);
    if (!set || !set.size) return;
    for (const v of [...set]) restoreOne(v, st.get(v));
    set.clear();
  }

  /** 还原全部（总闸关 / 视图换代 / 卸载）。 */
  function restoreAll() {
    for (const [gid, set] of [...byGroup]) {
      for (const v of [...set]) restoreOne(v, st.get(v));
      set.clear();
      byGroup.delete(gid);
    }
    stats.back = 0;
    stats.managed = 0;
  }

  /** 清掉已经销毁的视图引用（引擎定期调，防 Set 里攒死对象）。 */
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
    return { gate: stats.gate, managed: rows.length, eligible: stats.eligible, back: stats.back,
      swaps: stats.swaps, swapsTotal: stats.swapsTotal, noBack: stats.noBack, held: stats.held,
      stun: stats.stun, blocked: stats.blocked, rows };
  }

  return { beginFrame, step, isManaged, restoreView, restoreGroup, restoreAll, prune, probe, stats };
}
