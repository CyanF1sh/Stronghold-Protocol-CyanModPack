// mods/cyanfish.fix-targeting/content/index.js — 《网页端bug清单v1.0》第①条「敌人索敌」的 L3 修复。
//
// 契约：默认导出 `(api) => void`（`卫戍协议-Mod开发规范.md` §5）。★ 不 import 任何引擎路径。
// ★★ **不改基座一行代码**：只在 `beforeAttack` 上挂一个**最后执行**（priority -700）的钩子，重排 `ctx.targets`。
//
// ---------------------------------------------------------------------------------------------------------------------
// 根因
// ---------------------------------------------------------------------------------------------------------------------
// 基座 `server/sim/targeting.js`：
//     export function sortAllyTargets(enemy, cands) {
//       cands.sort((a, b) => { const ba = …, bb = …; return ba - bb || aggroCmp(a, b); });   // 阻挡 → 仇恨值
//     }
//     export function aggroCmp(a, b) {
//       const ta = a.s.taunt || 0, tb = b.s.taunt || 0;
//       if (ta !== tb) return tb - ta;
//       return (b.aggroSeq || b.deploySeq) - (a.aggroSeq || a.deploySeq);                     // 最后部署的优先
//     }
// 即：**只有** 阻挡 → 嘲讽 → 「最后部署」，**完全没有显式的空间回退**。
//
// 而 `Battle.start()` 的开局部署是行主序：
//     sort((a, b) => b.homeR - a.homeR || (ps.mirror ? b.homeC - a.homeC : a.homeC - b.homeC) || a.id - b.id)
// 行 0 = 棋盘**底部** ⇒ 最后部署者 = 「最下方一排里最靠右的那个」。
//
// 实测（`<开发期脚本>/probe_bug_fixes.mjs` P4，2×2 方阵 TL/TR/BL/BR）：
//     部署序：TL(12,4)=1 → TR(12,5)=2 → BL(9,4)=3 → BR(9,5)=4
//     优选序：BR → BL → TR → TL      ← 与用户描述的**当前**行为逐字吻合（「最下方一排的最右侧」）
// 用户期望：BR → TR → BL → TL        ← 「最右边一排的最下方」
//
// ★ 首选项（BR，右下角）两种口径相同，**差别只在第 2、3 顺位** —— 复盘时别被"看起来没变"骗了。
//
// ---------------------------------------------------------------------------------------------------------------------
// 做法
// ---------------------------------------------------------------------------------------------------------------------
// 1. 仿照 `ai.js: enemyAttack()` 的候选池构造（同样的 `melee` 判定、同样的 `rangeRadius + ALLY_COLLIDER_RADIUS`
//    碰撞体半径、同样的 `api.targeting.canTargetAlly(e, a, true)`、同样的 `e.profile.canTarget` 过滤）。
// 2. 按新规则排序：**阻挡者 → 嘲讽等级 → 空间（右列优先，同列内下方优先）→ 最后部署**。
// 3. **安全闸**：只有当引擎自己挑出来的 `ctx.targets` 全都落在本 Mod 重算的候选池里时，才替换（个数取
//    `max(n, 引擎给的个数)`）。否则说明有 content（敌方的 `before` 钩子，如巢涌者的 hitAllInRadius）改写了目标集，
//    本 Mod **一律让路、什么都不做** —— 宁可没修也不改坏别人的行为。
//
// ★ 空间判据用**战场坐标** `tileR/tileC`（不是 homeR/homeC）。行号小的在下（DESIGN §3：行 0 = 棋盘底部），
//   所以「最下方」= tileR 最小、「最右侧」= tileC 最大。镜像玩家（右侧 boss 场）也用同一套战场坐标。
//
// 未装本 Mod ⇒ 与改动前逐值相同。

/** 空间轴的口径。'col' = 右列优先、同列内下方优先（本 Mod 的默认，用户指定）；'row' = 基座的行主序（下方一排优先、其最右侧优先）。 */
const OPTIONS = {
  axisOrder: 'col',
};

/** 必须**晚于**基座与所有 content 的 `beforeAttack`（基座 enemies.js 用 50、kit 用 0/-100，最低 -1000）才能定序。 */
const HOOK_PRIORITY = -700;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export default function setup(api) {
  const T = api.targeting;
  const C = api.constants;
  const collider = num(C && C.ALLY_COLLIDER_RADIUS, 0.25);

  /** 仿 `ai.js: enemyAttack()` 构造候选池（顺序已按本 Mod 的规则排好）。 */
  function candidatePool(battle, e) {
    const profile = e.profile || {};
    const melee = profile.melee ?? e.def?.applyWay === 'MELEE';
    const radius = melee ? 0 : num(e.base && e.base.rangeRadius, 0);
    const reach = radius > 0 ? radius + collider : 0;
    let list = [];
    if (e.blockedBy) {
      const bl = e.blockedBy;
      if (radius > 0) {
        list = battle.alliesInRadius(e.x, e.y, reach, null).filter((a) => a === bl || T.canTargetAlly(e, a, true));
        if (!list.includes(bl) && bl.alive) list.push(bl);
      } else if (bl.alive && bl.deployed) list = [bl];
    } else if (radius > 0) {
      list = battle.alliesInRadius(e.x, e.y, reach, null).filter((a) => T.canTargetAlly(e, a, true));
    }
    const own = typeof profile.canTarget === 'function' ? profile.canTarget : null;
    if (own && list.length) list = list.filter((a) => own(a));
    if (list.length <= 1) return list;

    const spatial = OPTIONS.axisOrder === 'row'
      ? (a, b) => (b.tileR - a.tileR) || (b.tileC - a.tileC)      // 基座口径：最下方一排 → 其最右侧
      : (a, b) => (b.tileC - a.tileC) || (a.tileR - b.tileR);     // 本 Mod 口径：最右边一列 → 其最下方
    // 「阻挡者 → 嘲讽等级 → 空间 → 最后部署」
    list.sort((a, b) => {
      const ba = e.blockedBy === a ? 0 : 1, bb = e.blockedBy === b ? 0 : 1;
      return ba - bb
        || (b.s.taunt || 0) - (a.s.taunt || 0)
        || spatial(a, b)
        || ((b.aggroSeq || b.deploySeq) - (a.aggroSeq || a.deploySeq));
    });
    return list;
  }

  api.addInstall((battle) => {
    if (!battle || typeof battle.on !== 'function') return;
    battle.on('beforeAttack', (c) => {
      const e = c && c.attacker;
      if (!e || e.side !== 'enemy' || c.isSkill === true) return;
      const cur = (Array.isArray(c.targets) ? c.targets : []).filter(Boolean);
      if (!cur.length) return;
      let pool;
      try { pool = candidatePool(battle, e); } catch { return; }
      if (pool.length <= 1) return;
      // 安全闸：引擎/其它 content 给的目标必须全在重算的池子里，否则让路
      for (const t of cur) if (!pool.includes(t)) return;
      const n = Math.max(1, Math.floor(num(e.profile && e.profile.maxTargets, 1)) + Math.floor(num(e.s && e.s.maxTargets, 0)));
      c.targets = pool.slice(0, Math.max(n, cur.length));
    }, { priority: HOOK_PRIORITY });
  });
}
