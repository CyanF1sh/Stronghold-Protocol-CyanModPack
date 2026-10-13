// mods/cyanfish.fix-enemy/content/index.js — **敌人侧**修复合并 Mod（L3）。
//
// 由 cyanfish.fix-targeting（v1.1.0）与 cyanfish.fix-dsubrl-noattack（v1.1.0）合并而成，并新增
// 「元核孽生者神经损伤不叠加」。契约见 `卫戍协议-Mod开发规范.md` §5：默认导出 `(api) => void`，
// ★ 不 import 任何引擎路径，一切经 hostApi 拿。
//
// ★★ **不改基座一行代码**：全部靠 `addInstall` 在 battle 实例上挂钩子 + 包一层实例方法。
// ★★ 「装上也绝不与官方打架」：**上游已修的项默认 enabled:false**，此时该修复**一个钩子都不注册**
//    （`installXxx` 第一行的 `if (!FIX.enabled) return;`）⇒ 零生效代码、零副作用。要回滚启用请先读 README。
//
// =====================================================================================================================
// FIXES 表（唯一的「修复台账」——基底版本更新时照这张表排查「官方是否已经修了」）
// =====================================================================================================================
//
//  id                    | 修什么                                      | 依据                                   | 基于基座 | 上游是否已修 | 默认
//  ----------------------|--------------------------------------------|----------------------------------------|---------|-------------|-----
//  targeting-spatial     | 敌人挑目标的空间第一顺位                     | 清单v1.0 第①条                          | 0.1.2   | 已修(0.1.3) | 否
//  dsubrl-noattack       | 巢涌者（普通/富营养）本应无普攻               | 清单v1.0 第③条 + enemies.json acType=DOT | 0.1.2   | 已修(0.1.3) | 否
//  nexus-neural-no-stack | 元核孽生者神经损伤不应随敌人数量叠加           | 清单v1.1 待修复③ + PRTS【孽生者的神经毒素】 | 0.2.1   | **未修**     | 是
//  gun-aspd-first-layer  | 假想敌：铳 的攻速下限写法 + 首击即 ≥1 层       | PRTS 假想敌：铳 天赋原文 + 服主裁定（工序 98） | 0.2.1   | **未修**     | 是
//
// 「上游已修」的两条**逐行取证**（0.2.1 施工树）：
//   · targeting-spatial — `server/sim/battle/lifecycle.js:20`「Until 0.1.3 the top row came first (row-major)」，
//     `:25` 排序键 `(mirror ? b.homeC - a.homeC : a.homeC - b.homeC) || b.homeR - a.homeR`（列主序）
//     ⇒ 全局最后部署者 = 最右列最下方；`server/sim/targeting.js:224-232 sortAllyTargets/aggroCmp` 据此自动给出用户口径。
//   · dsubrl-noattack — `server/sim/content/enemies/dot.js:36-54 kitDsubrl` 已内建 `e2.profile.noAttack = true`（:40）
//     与 `iv: NEST_PULSE_INTERVAL`（:44，= :22 的 1 秒）+ 逐秒 `hurt(..., 'arts')`（:45-53）；
//     `:94-97 DOT_KITS` 同时注册 `enemy_1234_dsubrl` 与 `enemy_1234_dsubrl_2`（正是本项管辖的两个 key）。
//     ⇒ 在 0.2.1 上启用本项 = 每 1 秒拍两次、法术伤害与神经损伤各 ×2，且绕过基座的闪避 / hidden 判定。
//
// 「截至 0.2.1 未修」的那条**逐行取证**：
//   · nexus-neural-no-stack — `server/sim/content/enemies/element.js:172-179 kitNucleus`：
//         function kitNucleus(ab) {
//           return [{
//             taken(c, b, e, a) { if (a.on) return; a.on = true; b.addBuff(e, { key: 'ab:combat', … }); },
//             iv: T(ab, '1.interval') ?? 1,
//             tick(b, e, a) { if (!a.on) return; for (const u of areaAllies(b, e, e.x, e.y, T(ab, '1.range_radius') ?? 0))
//                               elem(b, e, u, 'neural', e.s.atk * (T(ab, '1.ep_damage_ratio') ?? 0)); },
//           }];
//         }
//     注册在 `:201-202`（`enemy_1439_dslntf` 元核孽生者 / `enemy_1439_dslntf_2` 异光体孽生者）。
//     基座给**每一只**敌人各挂一个 `iv = 1` 的独立累加器（`server/sim/content/enemies.js:247-257` 的 `a._acc`），
//     各自 `elem(b, e, u, 'neural', …)` 一次 ⇒ 目标身上的神经损伤**线性相加**。
//     官方口径（《网页端bug清单v1.1》待修复③ 原文 / PRTS）：「半径2.5范围内的所有我方单位受到
//     【孽生者的神经毒素】效果影响：每秒受到元核孽生者攻击力10%的神经损伤（无视迷彩，**同名效果不叠加**，
//     来源为元核孽生者）」⇒ 多只同时覆盖同一目标时**只生效一份（取最强的一份）**，不是求和。
//     ⇒ 本项默认**启用**。
//   · gun-aspd-first-layer — `server/sim/content/bosses.js:326-330 aspdFloor()` + `:588-592 kitGun().attack`（0.2.3 行号）：
//         function aspdFloor(b, e, extra = 0) {
//           const rawAspd = e.def.raw && e.def.raw.stats ? Number(e.def.raw.stats.aspd) : NaN;
//           if (!(rawAspd === 0)) return;
//           b.addBuff(e, { key: 'boss:aspd', persist: true, mods: { aspd: Math.max(ASPD_FLOOR, rawAspd + extra) - e.base.aspd } });
//         }
//         attack(c, b2) { const t = c.targets[0]; if (t === P.last) P.n = Math.min(maxN, P.n + 1); else { P.last = t; P.n = 0; } setAspd(b2); }
//     两处叠加 ⇒ ①「下限 20」被写进**加法修正**（`max(20, 0+80n) − 100`）：0 层那一帧恰好等于下限；② `P.n = 0` 让**命中新目标
//     的那一发**只算 0 层 ⇒ 它后面的间隔回到 0 层的 22.5 s（实测：第 1 次攻击后仍 22.5 s；换目标后同样掉回 22.5 s）。
//     官方 PRTS 假想敌：铳 天赋原文「攻击相同目标时每次攻击使自身攻击速度+80，最多叠加5层，切换目标后失去所有层数
//     （**每次成功攻击前判定，至少生效1层增益**，持续时间无限）」+「基础攻击速度为0（※攻击速度的数值下限为20）」
//     ⇒ 命中即 ≥1 层（5.625 s），且下限是**对最终攻速的钳位**（`units.js:146 clamp(b.aspd + Σaspd, ASPD_MIN, ASPD_MAX)`）。
//     ⇒ 本项默认**启用**（详见 README §3）。

/** ★ 每项修复的台账：`enabled` 是唯一开关；`since` = 该 bug 所在的基座版本；`upstreamFixedIn` = 上游哪个版本已修（null = 截至 0.2.1 未修）。 */
const FIXES = [
  {
    id: 'targeting-spatial',
    what: '敌人（未被阻挡、且无嘲讽差异时）挑选目标的空间第一顺位：应为「最右列 → 同列内最下方」，不是「最下行 → 最右侧」',
    basis: '《网页端bug清单v1.0》第①条',
    since: '0.1.2',
    upstreamFixedIn: '0.1.3（列主序开局部署 + sortAllyTargets）',
    defaultEnabled: false,
    enabled: false,
    why: '0.2.1 基座已给出正确顺序；且本实现基于 0.1.x 的候选池构造，缺 0.2.x 新增的 blockFree 判据（见 README）。默认不注册钩子 ⇒ 装上也不与官方打架。',
  },
  {
    id: 'dsubrl-noattack',
    what: '「巢涌者」（enemy_1234_dsubrl / _2）本应没有普攻，只有每秒一次的持续光环（法术伤害 + 神经损伤）',
    basis: '《网页端bug清单v1.0》第③条；data/enemies.json acType=DOT、skills=[]、desc「持续对周围造成法术伤害和神经损伤；抵抗，且移动速度不会降低」',
    since: '0.1.2',
    upstreamFixedIn: '0.1.3（content/enemies/dot.js kitDsubrl：noAttack + 1 秒脉冲）',
    defaultEnabled: false,
    enabled: false,
    why: '0.2.1 基座已内建同一套逻辑；同时启用 = 每秒 2 拍、伤害 ×2，并绕过基座的闪避 / hidden 判定。默认不注册钩子。',
  },
  {
    id: 'nexus-neural-no-stack',
    what: '「元核孽生者」能力1 的【孽生者的神经毒素】不应随敌人数量叠加：多个元核孽生者盖住同一目标时只生效「最强的一份」',
    basis: '《网页端bug清单v1.1》待修复③（原文引 PRTS：「半径2.5范围内的所有我方单位受到【孽生者的神经毒素】效果影响：每秒受到元核孽生者攻击力10%的神经损伤（无视迷彩，同名效果不叠加，来源为元核孽生者）」）',
    since: '0.2.1（0.2.1 的 kitNucleus 实现）',
    upstreamFixedIn: null, // 截至 0.2.1 仍未修
    defaultEnabled: true,
    enabled: true,
    why: '官方明确「同名效果不叠加」；基座每只敌人各挂一个 iv=1 的 tick、各自 elem() ⇒ N 只线性叠加。',
  },
  {
    id: 'gun-aspd-first-layer',
    what: '「假想敌：铳」的攻速斜坡：① 「攻击速度下限 20」应当只作为**对最终攻速的钳位**（不参与 buff 求和）；② **每一次成功攻击（含第一次、含切换目标后的第一次）在结算前已生效 ≥1 层 +80** ⇒ 任何一次攻击的间隔都不再由 0 层的 22.5 s 决定',
    basis: 'PRTS 假想敌：铳（管/弦 同句）天赋原文：「基础攻击速度为0（※攻击速度的数值下限为20）」+「攻击相同目标时每次攻击使自身攻击速度+80，最多叠加5层，切换目标后失去所有层数（每次成功攻击前判定，至少生效1层增益，持续时间无限）」；PRTS 游戏数据基础 攻速公式（T = T0 / (clamp(S,10,600)/100)，且「攻击速度属性实际被限制了下限为20」）与 数值范围 ATTACK_SPEED（下限 20 / 默认 100）；服主裁定（工序 98：「除出场显示外，所有实际间隔 ≤ 5.625 s」）',
    since: '0.2.1（content/bosses.js aspdFloor 的 `Math.max(ASPD_FLOOR, rawAspd + extra) - e.base.aspd` 写法 + kitGun 的 `P.n = 0`）',
    upstreamFixedIn: null, // 截至 0.2.3 仍未修
    defaultEnabled: true,
    enabled: true,
    why: '基座把「下限」编成一条常驻加法修正，且让命中新目标的那一发只算 0 层 ⇒ 第 1 次攻击后与每次换目标后的间隔都掉回 22.5 s；官方口径是命中即 ≥1 层（5.625 s），0 层的 22.5 s 只该出现在出场显示上。显示层**不动**（详情卡的红 +18.00 是该判断流程的正常呈现）。',
  },
];
const FIX_OF = Object.fromEntries(FIXES.map((f) => [f.id, f]));

// ---------------------------------------------------------------------------------------------------------------------
// 各项修复用到的常量
// ---------------------------------------------------------------------------------------------------------------------

/** 受 `dsubrl-noattack` 管辖的敌人（普通 + 富营养）。 */
const DSUBRL_KEYS = new Set(['enemy_1234_dsubrl', 'enemy_1234_dsubrl_2']);
/** 受 `nexus-neural-no-stack` 管辖的敌人：元核孽生者 / 异光体孽生者（server/sim/content/enemies/element.js:201-202）。 */
const NEXUS_KEYS = new Set(['enemy_1439_dslntf', 'enemy_1439_dslntf_2']);

/** 受 `gun-aspd-first-layer` 管辖的领袖：假想敌：铳（普通 `enemy_9017_achunt` + 隐秘核心 `enemy_9017_achunt_2`）。 */
const GUN_KEYS = new Set(['enemy_9017_achunt', 'enemy_9017_achunt_2']);
/** 本项的钩子优先级：必须**晚于**基座 content 才能改写它写的那条 buff（`content/enemies.js:139` enemySpawn=100、
 *  `:145` attack=50；`content/bosses.js:266` 再挂一个 enemySpawn=90）。文档口径：想要「最后说话」取 < −500（§5）。 */
const GUN_PRIORITY = -700;
/** 基座给铳挂的那条攻速 buff 的 key（`content/bosses.js:329`）——本项接管的就是它（同名 replace ⇒ 本项的值说了算）。 */
const GUN_BUFF_KEY = 'boss:aspd';
/** 铳天赋的两个数据键：基座 `kitGun` 读的正是同一个黑板（`content/bosses.js:578 T(ab,'2.attack_speed' / '2.max_stack_cnt')`）。 */
const GUN_STEP_KEY = '2.attack_speed', GUN_MAX_KEY = '2.max_stack_cnt';

/** `targeting-spatial` 的钩子优先级：必须晚于基座（enemies.js 用 50）与所有 content（最低 -1000）才能定序。 */
const TARGETING_PRIORITY = -700;
/** `targeting-spatial` 的空间轴：'col' = 右列优先、同列内下方优先（用户口径）；'row' = 基座行主序口径。 */
const AXIS_ORDER = 'col';

/** `dsubrl-noattack` 的光环推拍粒度（秒）；真正的一拍间隔见 `intervalOf`。 */
const DSUBRL_STEP = 0.25;
/** `dsubrl-noattack` 一拍间隔的回退值（对应这两个单位的 bat 1 / aspd 100）。 */
const DSUBRL_FALLBACK_INTERVAL = 1;
/** 神经损伤占比的回退值（数据键 EpDamage.ep_damage_ratio）。 */
const NEURAL_RATIO_FALLBACK = 0.05;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));
const keyOf = (e) => String((e && e.def && (e.def.key ?? e.def.enemyKey)) ?? e?.defId ?? '');

// =====================================================================================================================
// ① targeting-spatial —— 敌人索敌的空间优先序（上游已修 ⇒ 默认不生效）
// =====================================================================================================================
//
// 根因（0.1.2）：基座 `targeting.js aggroCmp` 只按「阻挡 → 嘲讽 → 最后部署」排序，**完全没有显式空间回退**；
// 而 0.1.2 的开局部署是**行主序**（最后部署 = 最下方一排的最右侧的那个）⇒ 优选序 BR → BL → TR → TL，
// 用户要的是 BR → TR → BL → TL（最右列 → 同列内最下方）。
// 0.1.3 起开局改为**列主序** ⇒ 基座的 `sortAllyTargets` 自动给出用户口径，本项随之多余（详见顶部 FIXES 表取证）。
//
// 做法：仿 `ai.js: enemyAttack()` 构造候选池，按「阻挡者 → 嘲讽等级 → 空间 → 最后部署」重排 `ctx.targets`；
// **安全闸**：只有引擎/其它 content 给的目标全落在本 Mod 重算的池子里时才替换，否则一律让路。

/** 空间轴的口径函数。 */
function spatialCmp(axisOrder) {
  return axisOrder === 'row'
    ? (a, b) => (b.tileR - a.tileR) || (b.tileC - a.tileC)   // 0.1.x 基座口径：最下方一排 → 其最右侧
    : (a, b) => (b.tileC - a.tileC) || (a.tileR - b.tileR);  // 本项口径：最右边一列 → 其最下方
}

function installTargeting(api, battle) {
  if (!FIX_OF['targeting-spatial'].enabled) return;   // ★ 上游已修 ⇒ 默认一个钩子都不注册
  if (!battle || typeof battle.on !== 'function') return;
  const T = api.targeting;
  const C = api.constants;
  if (!T || typeof T.canTargetAlly !== 'function') return;
  const collider = num(C && C.ALLY_COLLIDER_RADIUS, 0.25);
  const spatial = spatialCmp(AXIS_ORDER);

  /** 仿 `ai.js: enemyAttack()` 构造候选池（顺序已按本项规则排好）。 */
  function candidatePool(e) {
    const profile = e.profile || {};
    const melee = profile.melee ?? e.def?.applyWay === 'MELEE';
    const radius = melee ? 0 : num(e.base && e.base.rangeRadius, 0);
    const reach = radius > 0 ? radius + collider : 0;
    // 索敌不受阻挡影响（0.2.x 新增 e.profile.blockFree）：阻挡者**没有**优先权，也不享受 canTargetAlly 的阻挡者例外
    const blockFree = !!profile.blockFree;
    const blocker = blockFree ? null : e.blockedBy;
    let list = [];
    if (blocker) {
      if (radius > 0) {
        list = battle.alliesInRadius(e.x, e.y, reach, null).filter((a) => a === blocker || T.canTargetAlly(e, a, true));
        if (!list.includes(blocker) && blocker.alive) list.push(blocker);
      } else if (blocker.alive && blocker.deployed) list = [blocker];
    } else if (radius > 0) {
      list = battle.alliesInRadius(e.x, e.y, reach, null).filter((a) => T.canTargetAlly(e, a, true));
    }
    const own = typeof profile.canTarget === 'function' ? profile.canTarget : null;
    if (own && list.length) list = list.filter((a) => own(a));
    if (list.length <= 1) return list;
    // 「阻挡者 → 嘲讽等级 → 空间 → 最后部署」
    list.sort((a, b) => {
      const ba = blocker === a ? 0 : 1, bb = blocker === b ? 0 : 1;
      return ba - bb
        || (b.s.taunt || 0) - (a.s.taunt || 0)
        || spatial(a, b)
        || ((b.aggroSeq || b.deploySeq) - (a.aggroSeq || a.deploySeq));
    });
    return list;
  }

  battle.on('beforeAttack', (c) => {
    const e = c && c.attacker;
    if (!e || e.side !== 'enemy' || c.isSkill === true) return;
    const cur = (Array.isArray(c.targets) ? c.targets : []).filter(Boolean);
    if (!cur.length) return;
    let pool;
    try { pool = candidatePool(e); } catch { return; }
    if (pool.length <= 1) return;
    for (const t of cur) if (!pool.includes(t)) return;   // 安全闸：别人改写过的目标集 ⇒ 让路
    const n = Math.max(1, Math.floor(num(e.profile && e.profile.maxTargets, 1)) + Math.floor(num(e.s && e.s.maxTargets, 0)));
    c.targets = pool.slice(0, Math.max(n, cur.length));
  }, { priority: TARGETING_PRIORITY });
}

// =====================================================================================================================
// ② dsubrl-noattack —— 巢涌者没有普攻（上游已修 ⇒ 默认不生效）
// =====================================================================================================================
//
// 根因（0.1.2）：`content/enemies.js` 的 `kitDsubrl` 把这条光环挂在**普攻流程**上（`before` = beforeAttack 钩子、
// `ep` = dealt 钩子），而这两个单位的 `atk` 是 140 / 160（不为 0）⇒ 它们会抬手、播攻击动画、站定打人，
// 还会被【麻痹】打断、受攻速影响。官方数据（`data/enemies.json`）里 `acType = DOT`、`skills = []`，
// 注释原文「持续对周围造成法术伤害和神经损伤；抵抗，且移动速度不会降低」⇒ 这是光环，不是普攻。
// 0.1.3 起基座已自行改正（`content/enemies/dot.js:36-54`）⇒ 本项多余，同时启用会每秒双拍。

/** 光环的一拍间隔：由**基础**攻击间隔得出（`bat / (aspd/100)`），与攻速变更无关。 */
function dsubrlIntervalOf(e) {
  const bat = num(e && e.base && e.base.bat, 0);
  const aspd = num(e && e.base && e.base.aspd, 100);
  const iv = bat > 0 && aspd > 0 ? bat / (aspd / 100) : DSUBRL_FALLBACK_INTERVAL;
  return iv > 0.1 ? iv : DSUBRL_FALLBACK_INTERVAL;
}

/** 神经损伤占比：读该敌人自己的数据（`talents.bb['EpDamage.ep_damage_ratio']`）。 */
function dsubrlNeuralOf(e) {
  const bb = (e && e.def && e.def.talents && e.def.talents.bb) || {};
  const v = num(bb['EpDamage.ep_damage_ratio'], NaN);
  return Number.isFinite(v) && v >= 0 ? v : NEURAL_RATIO_FALLBACK;
}

function installDsubrl(api, battle) {
  if (!FIX_OF['dsubrl-noattack'].enabled) return;   // ★ 上游已修 ⇒ 默认一个钩子都不注册
  if (!battle || typeof battle.on !== 'function' || typeof battle.every !== 'function') return;
  const T = api.targeting;
  const C = api.constants;
  if (!T || typeof T.areaSelectable !== 'function') return;
  /** 已被本项接管的敌人 → 光环累计器。 */
  const armed = new Map();

  const arm = (e) => {
    if (!e || !DSUBRL_KEYS.has(keyOf(e)) || armed.has(e)) return;
    armed.set(e, { acc: 0, interval: dsubrlIntervalOf(e), neural: dsubrlNeuralOf(e) });
    if (e.profile) e.profile.noAttack = true;   // ← 这一行就取消了普攻
  };

  battle.on('enemySpawn', (c) => { try { arm(c && c.enemy); } catch { /* 单只失败不影响整局 */ } });
  for (const e of battle.enemies || []) arm(e);

  battle.every(DSUBRL_STEP, () => {
    for (const [e, st] of armed) {
      if (!e.alive) continue;
      st.acc += DSUBRL_STEP;
      if (st.acc < st.interval - 1e-9) continue;
      st.acc -= st.interval;
      const reach = num(e.base && e.base.rangeRadius, 0) + num(C && C.ALLY_COLLIDER_RADIUS, 0.25);
      const list = battle.alliesInRadius(e.x, e.y, reach).filter((a) => T.areaSelectable(e, a));
      for (const a of list) {
        battle.dealDamage(e, a, { amount: e.s.atk, type: 'arts' });   // 法伤：不是攻击，不复现抬手 / 反伤 / 受击回复
        const ep = e.s.atk * st.neural;
        if (ep > 0) battle.dealDamage(e, a, { type: 'element', element: 'neural', amount: ep });
      }
    }
  });
}

// =====================================================================================================================
// ③ nexus-neural-no-stack —— 元核孽生者神经损伤不叠加（截至 0.2.1 未修 ⇒ 默认生效）
// =====================================================================================================================
//
// 基座（`element.js:172-179 kitNucleus`）给**每一只**元核孽生者各挂一个 `iv = 1` 的独立 tick；同一目标被 N 只
// 盖住时，`elem()` 被调用 N 次（`damage.js applyElement` 是纯累加，没有任何「同名来源去重」）⇒ 神经损伤 ×N。
//
// 本项实现两个约束：
//   ① 同名效果不叠加 —— 同一目标、同一时间窗内**只生效一份，且取最强的一份**（不是求和、不是取第一只）；
//   ② 每秒剂量 = 该来源自己的 `e.s.atk × 1.ep_damage_ratio` —— 直接复用被抑制的那次调用里的**同一个数值**
//      （不重算、不近似），标签 / 元素 / 可达性（`ignoreSelect`）全部原样透传，来源仍是该敌人。
//
// 手段（零基座改动）：包一层 `battle.dealDamage`，把「来源 ∈ 元核孽生者 且 type='element' 且 element='neural'」
// 的那一次**不立即结算**，只记进「按目标取最大值」的累加器；再按**基座自己的节拍**（`1.interval`，默认 1 秒）
// 把这**一份**补发出去。补发时刻与原实现对齐（`_acc` 在 tick 里先累加 dt 再结算，故补发发生在该来源第二次出现
// 之后的帧末），因此**单只**场景下逐值等于官方。场上没有元核孽生者时，包层一次都不介入 ⇒ 逐值等于官方。
//
// 有意不做：不合并「不同元素」的损伤、不碰 burst 逻辑、不改 `e.s.atk` 侧的任何乘区、不动其它敌人（含巢涌者）。

/** `nexus-neural-no-stack`：补发钩子的优先级（无竞争，取一个靠后的值即可）。 */
const NEXUS_FLUSH_PRIORITY = -800;
/** 引擎一拍（`TICK`）：仅作为「帧号 <-> 战斗时间」的换算精度用，不依赖 `api.constants.TICK` 的具体值。 */
const FRAME = 1 / 30;
/**
 * 冷却判据的容差。★ 必须有：`battle.time` 是 `TICK` 累加出来的（0.0333… × N），`lastEmit + interval`
 * 与下一拍的 `time` 在浮点上**不保证**严格相等 —— 实测 `1.9667 >= 0.9667 + 1` 会判 false，
 * 那一拍就被并进下一拍（净少一份）。加 1e-9 容差后逐拍都成立。
 */
const COOLDOWN_EPS = 1e-9;

/** 是否属于本项要接管的「神经毒素」伤害：来源是元核孽生者 且 是神经损伤 且 由敌人能力发出。 */
function isNexusNeural(source, dmg) {
  if (!dmg || dmg.type !== 'element' || dmg.element !== 'neural') return false;
  if (!source || source.side !== 'enemy' || !NEXUS_KEYS.has(keyOf(source))) return false;
  return Array.isArray(dmg.tags) && dmg.tags.includes('enemyAbility');
}

/** 帧号：与 `battle.time` 同步（引擎每帧 `time += TICK`）。 */
const frameOf = (t) => Math.round(num(t, 0) / FRAME);

function installNexusNeural(api, battle) {
  if (!FIX_OF['nexus-neural-no-stack'].enabled) return;
  if (!battle || typeof battle.dealDamage !== 'function' || typeof battle.every !== 'function') return;
  const orig = battle.dealDamage.bind(battle);
  /**
   * target -> { amount, dmg, source, interval, lastEmit, expire }：
   *   `amount`   = 自上次补发以来**最强的一份**（不是求和、也不是取第一只）；
   *   `lastEmit` = 上一次补发的战斗时间（每 `interval` 至多补发一次 = 「同名效果不叠加」）；
   *   `expire`   = 兜底：若此后 `interval` 秒内再没有新的被抑制份，就把手上这份补发掉
   *                （来源死了 / 离场了 / 不再覆盖目标时，最后那一拍不会凭空消失）。
   *
   * ★ 时刻对齐（本项唯一容易做错的地方，实测踩过两版）：
   *   基座 `enemies.js:254-256` 的 `a._acc` 在 tick 里 **先 `+= dt` 再结算**（`dt = TICK`、`iv = 1`）
   *   ⇒ 脉冲落在 `time = k − TICK`（实测 0.9667 / 1.9667 / 2.9667 …）。本项**在脉冲那一拍就地补发**
   *   （冷却判据见 `emitNow`），所以逐拍时刻与官方同一帧；同一拍里的第 2..N 只只更新「最强的一份」，
   *   不额外发、也不把时刻往后推。
   */
  const pending = new Map();
  /** 脉冲间隔回退值（秒）：与 `element.js:175` 的 `iv: T(ab,'1.interval') ?? 1` 一致。 */
  const DEFAULT_INTERVAL = 1;

  /** 该来源的脉冲间隔（秒）：读它自己的数据 `talents.bb['1.interval']`，缺省 1。 */
  const intervalOf = (source) => {
    const bb = (source && source.def && source.def.talents && source.def.talents.bb) || {};
    const v = num(bb['1.interval'], NaN);
    return Number.isFinite(v) && v >= FRAME ? v : DEFAULT_INTERVAL;
  };

  /** 把手上这一份补发出去（来源、元素、可达性、乘区全部原样透传）。 */
  const flush = (target, rec) => {
    const d = rec.dmg || {};
    orig(rec.source ?? null, target, {
      amount: rec.amount, type: 'element', element: 'neural',
      mul: num(d.mul, 1), ignoreSelect: !!d.ignoreSelect, tags: d.tags || [],
    });
  };

  battle.dealDamage = (source, target, dmg, ...rest) => {
    if (isNexusNeural(source, dmg)) {
      const amt = num(dmg && dmg.amount, 0);
      if (!(amt > 0)) return 0;
      const t = battle.time;
      const iv = intervalOf(source);
      const rec = pending.get(target);
      if (!rec) {
        // 目标第一次被神经毒素覆盖：就地在**这一拍**补发（冷却起点 = 现在）
        flush(target, { amount: amt, dmg, source });
        pending.set(target, { amount: 0, dmg: null, source: null, interval: iv, lastEmit: t, expire: t + iv });
      } else if (t - rec.lastEmit >= rec.interval - COOLDOWN_EPS) {
        // 新的一拍：先把手上的最强一份补发（它可能来自另一只、数值更大），再开新窗口
        const had = rec.amount > 0 ? { amount: rec.amount, dmg: rec.dmg, source: rec.source } : { amount: amt, dmg, source };
        if (amt > rec.amount) { had.amount = amt; had.dmg = dmg; had.source = source; }
        flush(target, had);
        rec.amount = 0; rec.dmg = null; rec.source = null;
        rec.lastEmit = t;
        rec.expire = t + iv;   // 兜底：此后 2 个 interval 内没有新脉冲才用（见定时器）
      } else {
        // ★ 同一拍（含同帧/相邻帧的多只）：同名效果不叠加 => 只留最强的一份，不发、不改时刻
        if (amt > rec.amount) { rec.amount = amt; rec.dmg = dmg; rec.source = source; }
      }
      return 0;   // 不立即结算
    }
    return orig(source, target, dmg, ...rest);
  };

  // 兜底：来源不再脉冲时（死亡 / 离场 / 不再覆盖目标），把手上的最后一份补发掉。
  // 正常持续脉冲时**不会触发** —— 下一拍总是先到（`t - lastEmit >= interval`），expire 只在
  // 「连一个 interval 都没有下一拍」时才兜底，因此不会与正常补发重复计算。
  battle.every(FRAME, () => {
    if (!pending.size) return;
    const t = battle.time;
    for (const [target, rec] of Array.from(pending.entries())) {
      if (!target || !target.alive || target.removed || target.hidden || !target.deployed) { pending.delete(target); continue; }
      if (!(rec.amount > 0) || t - rec.lastEmit < rec.interval * 2 - COOLDOWN_EPS) continue;
      pending.delete(target);
      flush(target, rec);
    }
  }, { priority: NEXUS_FLUSH_PRIORITY });
}

// =====================================================================================================================
// ④ gun-aspd-first-layer —— 假想敌：铳 的攻速下限写法 + 首击即 ≥1 层（截至 0.2.3 未修 ⇒ 默认生效）
// =====================================================================================================================
//
// 基座（`content/bosses.js`）的两处写法（行号 = 0.2.3）：
//   ① `:326-330 aspdFloor(b, e, extra = 0)`：`mods: { aspd: Math.max(ASPD_FLOOR, rawAspd + extra) - e.base.aspd }`
//      —— 把「攻击速度下限 20」写进**加法修正**。0 层时 `max(20, 0) − 100 = −80`，与 base 100 相加仍得 20（22.5 s）✓；
//      但面板/斜坡真正需要的是「下限只钳最终值」：`clamp(0 + Σ修正, 20, 600)`（`units.js:146` 本来就是这一处 clamp）。
//   ② `:588-592 kitGun().attack`：`if (t === P.last) P.n = min(maxN, P.n+1); else { P.last = t; P.n = 0; }`
//      —— 命中**新目标**的那一发只算 0 层，于是紧随其后的间隔仍是 0 层的 22.5 s（实测：第 1 次攻击后 22.5 s；
//      每次换目标后又掉回 22.5 s）。官方口径（PRTS 天赋「每次成功攻击前判定，**至少生效1层增益**」）= 命中即 1 层。
//
// 本项**零基座改动**地接管这条 buff（`boss:aspd`，同名 replace ⇒ 谁最后写谁说了算）：
//   · `enemySpawn`（priority −700，晚于基座的 100/90）→ 记下该铳的 `step/maxN/raw/base`，并把 0 层那一帧写成
//     `raw + 0 − base`（= −100）：**下限不再参与求和**（这一帧仍是 clamp(0) = 20 ⇒ 出场显示值 22.5 s 逐值不变）。
//   · `attack`（priority −700，晚于基座的 50）→ 立刻重写同一条 buff 为 `raw + step·n − base`，
//     `n = (命中同一目标 ? min(maxN, n+1) : 1)`。这一发命中 ⇒ 这一发之后**至少 1 层**（5.625 s）。
//
// 为什么挂 `attack` 而不是 `beforeAttack`：引擎在**同一次攻击里**的顺序是
//   `beforeAttack`(ai.js:894-899) → 伤害(911-923) → `attack`(924) → `e.atkCd = e.s.interval`(925)
// ⇒ 在 `attack` 里改写，冷却读到的就是新值；且 `attack` 与「真正命中了一发」一一对应（被麻痹打断的攻击两个钩子都不发）。
//
// 等价性：在铳的数据下（`raw = 0`、`step = 80`）本项写的是 `80n − 100`，而基座写的是 `max(20, 80n) − 100`
// ⇒ `n ≥ 1` 时 `80n ≥ 80 > 20`，两者**逐值相同**；唯一被改动的时刻就是「0 层的 22.5 s 不该决定任何一次攻击」那一段。
// 不装本 Mod、关掉本项、或场上没有 `enemy_9017_achunt(_2)` 时，本项**一个钩子都不注册 / 一行都不介入** ⇒ 逐值等于上游。
// 管 / 弦（同 aspd=0、无加攻速天赋）不在管辖内，逐值不变。

/** 铳的天赋斜坡：`step` 每层、`maxN` 上限；两者都取自该铳自己的黑板（缺任何一个 ⇒ 本项不接管）。
 *  黑板 = 基座 `abOf()` 造的那一份（`e.mem.ab.t`，已并入本局的 `enemyOverrides`），回退到归一化后的 `e.def.talent`
 *  （`server/sim/simdata.js:301 talent: e.talents?.bb ?? e.talent ?? {}`）。 */
function gunRampOf(e) {
  const t = (e && e.mem && e.mem.ab && e.mem.ab.t) || (e && e.def && e.def.talent) || {};
  const step = num(t[GUN_STEP_KEY], 0), maxN = num(t[GUN_MAX_KEY], 0);
  if (!(step > 0) || !(maxN > 0)) return null;
  const raw = e && e.def && e.def.raw && e.def.raw.stats ? Number(e.def.raw.stats.aspd) : NaN;
  return {
    step,
    maxN: Math.floor(maxN),
    raw: Number.isFinite(raw) ? raw : 0,
    base: num(e && e.base && e.base.aspd, 100),
  };
}

function installGunAspd(api, battle) {
  if (!FIX_OF['gun-aspd-first-layer'].enabled) return;   // ★ 关掉本项 ⇒ 一个钩子都不注册
  if (!battle || typeof battle.on !== 'function' || typeof battle.addBuff !== 'function') return;
  /** 已被本项接管的铳 → { ramp, n, last }。 */
  const armed = new Map();

  /** 写「第 n 层」的攻速修正：`raw + step·n − base`（下限由 units.js 的最终 clamp 施加，不在求和里）。 */
  const write = (e, st, n) => {
    st.n = n;
    battle.addBuff(e, { key: GUN_BUFF_KEY, persist: true, mods: { aspd: st.ramp.raw + st.ramp.step * n - st.ramp.base } });
  };

  const arm = (e) => {
    if (!e || e.side !== 'enemy' || armed.has(e) || !GUN_KEYS.has(keyOf(e))) return;
    const ramp = gunRampOf(e);
    if (!ramp) return;   // 数据里没有这条斜坡（例如 override 拿掉了天赋）⇒ 本项不接管，逐值等于上游
    const st = { ramp, n: 0, last: null };
    armed.set(e, st);
    write(e, st, 0);     // 0 层：出场显示值（22.5 s）逐值不变，但下限已不参与求和
  };

  battle.on('enemySpawn', (c) => { try { arm(c && c.enemy); } catch { /* 单只失败不影响整局 */ } }, { priority: GUN_PRIORITY });
  for (const e of battle.enemies || []) arm(e);

  battle.on('attack', (c) => {
    const e = c && c.attacker;
    if (!e || e.side !== 'enemy' || c.isSkill === true) return;
    const st = armed.get(e);
    if (!st) return;
    const t = Array.isArray(c.targets) ? (c.targets[0] || null) : null;
    const n = t && t === st.last ? Math.min(st.ramp.maxN, st.n + 1) : Math.min(st.ramp.maxN, 1);
    st.last = t;
    write(e, st, n);
  }, { priority: GUN_PRIORITY });
}

// =====================================================================================================================
// 入口
// =====================================================================================================================

export default function setup(api) {
  api.addInstall((battle) => { try { installTargeting(api, battle); } catch { /* 单项失败不影响其余 */ } });
  api.addInstall((battle) => { try { installDsubrl(api, battle); } catch { /* 同上 */ } });
  api.addInstall((battle) => { try { installNexusNeural(api, battle); } catch { /* 同上 */ } });
  api.addInstall((battle) => { try { installGunAspd(api, battle); } catch { /* 同上 */ } });
}
