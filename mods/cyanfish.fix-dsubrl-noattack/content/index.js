// mods/cyanfish.fix-dsubrl-noattack/content/index.js — 《网页端bug清单v1.0》第③条「巢涌者错误的进行普攻」的 L3 修复。
//
// 契约：默认导出 `(api) => void`（`卫戍协议-Mod开发规范.md` §5）。★ 不 import 任何引擎路径。
// ★★ **不改基座一行代码**：用 `enemySpawn` 关掉这两个单位的普攻，再由自己按固定节奏驱动同一套伤害。
//
// ---------------------------------------------------------------------------------------------------------------------
// 根因
// ---------------------------------------------------------------------------------------------------------------------
// `server/sim/content/enemies.js`：
//     const hitAllInRadius = (r) => ({ before(c, b, e) { const l = areaAllies(b, e, e.x, e.y, r); if (l.length) c.targets = byPriority(e, l); } });
//     function kitDsubrl(ab, e) {
//       return [hitAllInRadius(e.base.rangeRadius || 1.6), ep('neural', T(ab, 'EpDamage.ep_damage_ratio') ?? 0), resist(['sluggish'])];
//     }
//     enemy_1234_dsubrl: kitDsubrl,  enemy_1234_dsubrl_2: kitDsubrl,
//
// 这三件东西（把普攻目标改成范围内全部友方 · 附带神经损伤 · 抵抗+免疫停顿）里，前两件都**挂在普攻流程上**
// （`before` 是 `beforeAttack` 钩子、`ep` 是 `dealt` 钩子）。敌方的 `atk` 是 140 / 160（不为 0），
// 于是 `ai.js: enemyAttack()` 照常走完整普攻：抬手、攻击动画、`atkCd`、非阻挡时还按攻击片段站立，
// 并且可被【麻痹】打断、受攻速影响。
//
// 官方数据（`data/enemies.json`）明确否定「普攻」这一读法：
//     desc     「持续对周围造成法术伤害和神经损伤；抵抗，且移动速度不会降低」
//     abilities「持续对周围造成法术伤害和神经损伤」/「抵抗且免疫停顿」
//     acTypes  ["DOT"]        acType "DOT"
//     skills   []             ← 没有任何技能
// 同类光环（【污染秽蚀】的 dmgZone 等）在基座里都是**固定间隔的独立计时**，与攻速无关。
//
// ---------------------------------------------------------------------------------------------------------------------
// 做法
// ---------------------------------------------------------------------------------------------------------------------
// 1. `enemySpawn`（以及入场时已在场的同名单）里把 `e.profile.noAttack = true` ⇒ `enemyAttack()` 第一行就返回，
//    抬手 / 动画 / 站立 / 麻痹打断 / 攻速影响**全部消失**。
// 2. 自己按**固定 1 秒**（= 这两个单位的基础攻击间隔 `bat 1 / aspd 100`，与关闭前逐值相同）推一次光环：
//      · 范围：`rangeRadius + ALLY_COLLIDER_RADIUS`（1.6 + 0.25 = 1.85，与原先普攻的判定完全一致）
//      · 可选性：`api.targeting.areaSelectable(e, a)`（原先 `areaAllies` 用的就是它：隐匿除阻挡者外不可选中、
//        飞行/起飞按对地规避排除、不可选中/沉睡排除）
//      · 法术伤害：`amount = e.s.atk`（`atkScale` 缺省 1，与原先一致）
//      · 神经损伤：`atk × EpDamage.ep_damage_ratio`，从该敌人自己的数据读（缺省 0.05），走 `dealDamage` 的 element 分支
// 3. ★ 伤害**不带 `isAttack`** —— 它不再是攻击，所以不触发反伤 / 受击回复（这也是「持续环境伤害」的正确语义）。
//
// 未装本 Mod ⇒ 与改动前逐值相同（`profile.noAttack` 只在装了 Mod 时才被置位）。

/** 受本 Mod 管辖的敌人（普通 + 富营养）。要扩展就加 key。 */
const KEYS = new Set(['enemy_1234_dsubrl', 'enemy_1234_dsubrl_2']);
/** 光环推一拍的粒度（秒）。真正的一拍间隔见 `intervalOf`。 */
const STEP = 0.25;
/** 光环的一拍间隔回退值（对应这两个单位的 `bat 1 / aspd 100`）。 */
const FALLBACK_INTERVAL = 1;
/** 神经损伤占比的回退值（数据键 `EpDamage.ep_damage_ratio`）。 */
const FALLBACK_NEURAL = 0.05;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));
const keyOf = (e) => String((e && e.def && (e.def.key ?? e.def.enemyKey)) ?? e?.defId ?? '');

/** 光环的一拍间隔：由**基础**攻击间隔得出（`bat / (aspd/100)`），与攻速变更无关。 */
function intervalOf(e) {
  const bat = num(e && e.base && e.base.bat, 0);
  const aspd = num(e && e.base && e.base.aspd, 100);
  const iv = bat > 0 && aspd > 0 ? bat / (aspd / 100) : FALLBACK_INTERVAL;
  return iv > 0.1 ? iv : FALLBACK_INTERVAL;
}

/** 神经损伤占比：读该敌人自己的数据（`talents.bb['EpDamage.ep_damage_ratio']`）。 */
function neuralRatioOf(e) {
  const bb = (e && e.def && e.def.talents && e.def.talents.bb) || {};
  const v = num(bb['EpDamage.ep_damage_ratio'], NaN);
  return Number.isFinite(v) && v >= 0 ? v : FALLBACK_NEURAL;
}

export default function setup(api) {
  const T = api.targeting;
  const C = api.constants;

  api.addInstall((battle) => {
    if (!battle || typeof battle.on !== 'function' || typeof battle.every !== 'function') return;
    /** 已被本 Mod 接管的敌人 → 光环的累计器。 */
    const armed = new Map();

    const arm = (e) => {
      if (!e || !KEYS.has(keyOf(e)) || armed.has(e)) return;
      armed.set(e, { acc: 0, interval: intervalOf(e), neural: neuralRatioOf(e) });
      if (e.profile) e.profile.noAttack = true;      // ← 这一行就取消了普攻
    };

    // 入场即接管；已经在场的（Mod 热重载 / 先 spawn 后安装）也补一次
    battle.on('enemySpawn', (c) => { try { arm(c && c.enemy); } catch { /* 单只失败不影响整局 */ } });
    for (const e of battle.enemies || []) arm(e);

    battle.every(STEP, () => {
      for (const [e, st] of armed) {
        if (!e.alive) continue;
        st.acc += STEP;
        if (st.acc < st.interval - 1e-9) continue;
        st.acc -= st.interval;
        const reach = num(e.base && e.base.rangeRadius, 0) + num(C && C.ALLY_COLLIDER_RADIUS, 0.25);
        const list = battle.alliesInRadius(e.x, e.y, reach).filter((a) => T.areaSelectable(e, a));
        for (const a of list) {
          // 法术伤害（不是攻击：不复现抬手，也不触发反伤 / 受击回复）
          battle.dealDamage(e, a, { amount: e.s.atk, type: 'arts' });
          // 神经损伤（原先由 ep('neural', ratio) 在普攻命中时附带）
          const ep = e.s.atk * st.neural;
          if (ep > 0) battle.dealDamage(e, a, { type: 'element', element: 'neural', amount: ep });
        }
      }
    });
  });
}
