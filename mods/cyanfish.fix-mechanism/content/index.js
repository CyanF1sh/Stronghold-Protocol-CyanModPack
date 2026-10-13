// mods/cyanfish.fix-mechanism/content/index.js — **机制侧**修复合并 Mod 的 L3 行为代码（工序 host-006）。
//
// 本文件是 `cyanfish.fix-mechanism` 的 **L3（战斗行为）** 入口：默认导出 `(api) => void`，契约见
// `卫戍协议-Mod开发规范.md` §5（★ 不 import 任何引擎路径，一切经 hostApi 拿）。
// ★★ 本 Mod 从 1.1.0 起**同时**有 L2（`data/backups.json` 的两条 mechanics 接缝，见 README §2）与 L3（本文件）。
//    1.0.0 是纯 L2 Mod；本项 `leader-erosion` 只能落在 L3 —— 见下面的「为什么不用接缝」。
//
// =====================================================================================================================
// FIXES 表（唯一的「修复台账」——基底版本更新时照这张表排查「官方是否已经修了」）
// =====================================================================================================================
//
//  id              | 修什么                                     | 依据                                    | 基于基座 | 上游是否已修 | 默认
//  ----------------|--------------------------------------------|-----------------------------------------|---------|-------------|-----
//  leader-erosion  | 领袖（isBoss）也吃侵蚀损伤（计量 / 爆发 / 掉弹药） | 服主裁定（工序 host-006，原话见下）      | 0.2.4   | 不适用      | 是
//
// ★★ **服主裁定（2026-10-12，工序 host-006 原话）**：
//      「A 做，领袖能吃别的损伤凭什么侵蚀损伤不吃。」
//    ⇒ 这不是上游 bug，是**有意偏离官方贴士**的玩法改动：
//      官方贴士逐字写着「最终攻势中，敌方领袖不会受到侵蚀损伤」（PRTS 卫戍协议：盟约/PRTS盟约记录 专属贴士节），
//      而**同一批领袖**对灼燃 / 神经 / 凋亡 / 坏死四种损伤照常吃（0.2.4 发版时复核过十个最终领袖 × 五种损伤：
//      只有侵蚀被挡；见 `docs/history/0.2.4.md` §29.4 与 `docs/research/06-multiplayer-ux.md:457`）。
//      服主要的就是把这个**不一致**改掉 ⇒ 装本 Mod 后领袖与其它敌人同一条侵蚀路径。
//    ⇒ 具体后果：以侵蚀为主的干员（克莱门莎三技能「与海为敌」等）对领袖**明显变强** —— 这是本项的目的，不是副作用。
//
// 上游那一处的原文（`server/sim/content/bosses.js:267-268`，唯一的判定点）：
//      battle.on('elementHit', (c) => { if (c.target && c.target.isBoss && c.dmg.element === 'erosion') c.dmg.cancel = true; }, { priority: 100 });
// 唯一的下游消费者（`server/sim/damage.js:445-448`，`applyElement`）：
//      battle.emit('elementHit', { source, target, dmg });
//      if (dmg.cancel || !target.alive || !target.deployed || burstLocked(target, el)) return 0;
// ⇒ 被挡时**连计量都不涨**（`damage.js:454` 永远到不了）⇒ `damage.js:458` 的 elementBurst 自然永不触发
//   ⇒ 克莱门莎三技能不扣弹药（`kits/ops/op-clemnt.js:224-228` 只在 elementBurst 且 element === 'erosion' 时打标记、
//     `:129-149` 的 bombard 里才 skill.ammoLeft--）。
//
// ★★ **为什么不用「挂钩子 + priority」而是「吞掉那一次 cancel」**：
//    `battle.on` 的列表按 priority **降序**、同 priority 按注册顺序（`server/sim/battle/hooks.js:19-24`），
//    而基座那条免疫是 **priority 100（最大）**；Mod 的 `addInstall` 在基座 domain modules **之后**跑
//    （`server/sim/content/index.js:397-405`）⇒ 本 Mod 挂什么 priority 都**排在它后面**，那时
//    `c.dmg.cancel` 已经是 true ⇒ 钩子侧无法反悔。所以只能在**发出事件之前/之后**动手（下面包装 `battle.emit`）。
//
// ★★ **为什么不在基座加一条接缝（这是有意的选择，报告里有逐条理由）**：
//    ① L3 的 `addInstall(fn)` **本来就是平台给 Mod 的「包装 battle 实例方法」出口**（规范 §5.8「第五种 Mod 形态」，
//       `fix-targeting` / `fix-egir-bond` / `fix-thorn2-stack` 三个先例都靠它，零基座改动）；
//    ② 本项**不需要任何新参数**（开关就是「装不装这个 Mod」）⇒ 加一条 base 接缝只会多一份「不装 Mod 时必须
//       逐字节等于上游」的举证负担，收益为零；
//    ③ 基座不改 ⇒ 官方自带的回归用例 `test/content/enemies_bosses.test.js:2367`
//       （「最终攻势: leaders take no 侵蚀 (erosion) damage; other enemies do」）在**不装 Mod 时逐值不变**。
//
// ★ **只动侵蚀**：本项只在 `dmg.element === 'erosion'` 时改写 `cancel`，其它四种元素与所有非领袖目标
//   走**原来那一行**（`Object.defineProperty` 把原描述符 `c0` 原样装回去后调原 emit）⇒ 逐值不变。
//
// ★ 已知边界（诚实登记）：本项的判据是 `target.isBoss`（与上游那一行**逐字相同**），所以 `kind: 'hidden'`
//   （隐秘核心）里的领袖也一起吃侵蚀 —— 官方贴士只写「最终攻势」，**隐秘核心未给口径**，本次按"与上游同判据"处理。

/** 本项的内部开关。★ 恒为 true：服主要的就是「生效」；不过它仍然是一个开关，因为「关掉这一项」= 停用本 Mod
 *  （L3 的 `addInstall` 只在装载本 Mod 时注册，不装就一个钩子都不挂）。留着它是为了让「关掉 = 与上游逐值相同」
 *  这件事在测试里可被直接断言（`test/mods/fix-mechanism-leader-erosion.test.js` 的 installLeaderErosion(battle, false)）。 */
export const FIXES = Object.freeze({
  'leader-erosion': true,
});

/** 本 Mod 的 id（日志 / 诊断用；与 `mods/cyanfish.fix-mechanism/mod.json` 的 `id` 逐字相同）。 */
export const MOD_ID = 'cyanfish.fix-mechanism';

/** 幂等标记（同一个 battle 被重复 install 时不要包两层）。 */
const WRAPPED = Symbol.for('cyanfish.fix-mechanism.leader-erosion');

/** 诊断计数（只读；仿 fix-enemy 的 `FIX_OF`，给验收脚本与报告取数用；引擎行为不受它影响）。 */
export const LEADER_EROSION_STATE = { installed: 0, swallowed: 0, leaders: 0, lastTarget: null, lastError: null };

/** 清空诊断计数（复现脚本每个场景前调一次）。 */
export function resetLeaderErosionState() { LEADER_EROSION_STATE.installed = 0; LEADER_EROSION_STATE.swallowed = 0; LEADER_EROSION_STATE.leaders = 0; LEADER_EROSION_STATE.lastTarget = null; LEADER_EROSION_STATE.lastError = null; }

/**
 * 在 `dmg` 上装一个「吞掉 cancel」的陷阱：把 `cancel` 换成一个 setter 为空的访问器，让**本次 elementHit 期间**
 * 任何 `dmg.cancel = true` 都写不进去，同一次事件里的后续 handler 与 `damage.js:447` 读到的都是同一个假值
 * （与「从来没有人写过 cancel」逐值同义）。
 *
 * ★ 只在需要时才装（`Object.defineProperty` 的代价 + 不改非领袖 / 非侵蚀对象的任何东西）；
 * ★ 事件结束后 `Object.defineProperty(dmg, 'cancel', c0)` 把**原描述符原样装回去** ⇒ `dmg` 的形状逐字节复原
 *   （`makeDamageInfo` 一定给出 `cancel: false` 这个**数据属性**，所以 `c0` 总是存在；写入失败的兜底在下面）；
 *   `c0` 为空（`cancel` 本来不存在）时把临时属性删掉（`delete` 不触发我们自己的 setter）。
 * ★ 两个计数器只为取证：`swallowed` = 被吞掉的 `cancel = true` 次数（>0 说明基座那条免疫确实跑到了）。
 * @param {object} dmg `elementHit` 的载荷（`server/sim/damage.js` 的 `dmg`）
 * @param {object} target
 * @returns {false|{restore: () => void}} 陷阱句柄（`restore()` 复原描述符并记账），或 false = 没装（让路 / 写不动）
 */
function trapErosionCancel(dmg, target) {
  if (!dmg || dmg.element !== 'erosion' || dmg.cancel === true) return false;   // 已经有人先一步判了免疫 ⇒ 让路
  if (!target || !target.isBoss) return false;
  let blocked = 0;
  const c0 = Object.getOwnPropertyDescriptor(dmg, 'cancel');
  try {
    Object.defineProperty(dmg, 'cancel', {
      configurable: true, enumerable: c0 ? c0.enumerable : true,
      get() { return c0 && !c0.get ? c0.value : (c0 && c0.get ? c0.get.call(this) : false); },
      set(v) { if (v) blocked = blocked + 1; },                        // 领袖的侵蚀免疫：写了也不认
    });
  } catch (e) { LEADER_EROSION_STATE.lastError = 'trap: ' + (e && e.message ? e.message : String(e)); return false; }
  LEADER_EROSION_STATE.leaders++;
  LEADER_EROSION_STATE.lastTarget = String(target.defId ?? target.id ?? '?');
  return { restore() {
    LEADER_EROSION_STATE.swallowed += blocked;
    try {
      if (c0) Object.defineProperty(dmg, 'cancel', c0);
      else delete dmg.cancel;
    } catch (e) { LEADER_EROSION_STATE.lastError = 'restore: ' + (e && e.message ? e.message : String(e)); }
  } };
}

/**
 * 包装 `battle.emit`：只对 `elementHit` 的「领袖 + 侵蚀」这一种载荷装陷阱，其余调用逐字转发。
 * @param {object} battle
 */
function swallowLeaderErosionImmunity(battle) {
  if (battle[WRAPPED]) return false;
  const orig = battle.emit.bind(battle);
  battle.emit = (name, ctx) => {
    if (name !== 'elementHit' || !ctx) return orig(name, ctx);
    const trap = trapErosionCancel(ctx.dmg, ctx.target);
    if (!trap) return orig(name, ctx);
    try { return orig(name, ctx); } catch (e) { LEADER_EROSION_STATE.lastError = 'emit: ' + (e && e.message ? e.message : String(e)); throw e; } finally { trap.restore(); }
  };
  Object.defineProperty(battle, WRAPPED, { value: true, enumerable: false, configurable: true });
  LEADER_EROSION_STATE.installed++;
  return true;
}

/**
 * 把 `leader-erosion` 装进一局战斗（每局钩子；由下面的 `api.addInstall` 调用）。
 * @param {object} battle
 * @param {boolean} [enabled] 默认取 `FIXES['leader-erosion']`（true）；传 false = 本项不生效（零副作用，供对照用）
 * @returns {boolean} 是否真的装上了
 */
export function installLeaderErosion(battle, enabled = FIXES['leader-erosion']) {
  if (enabled !== true) return false;
  if (!battle || typeof battle.emit !== 'function') return false;
  return swallowLeaderErosionImmunity(battle);
}

/**
 * L3 入口（`server/sim/content/index.js` 的 `registerModContent` 调用默认导出的这个函数）。
 * @param {{ addInstall: (fn: Function) => void, id?: string, log?: object }} api 宿主句柄
 */
export default function setup(api) {
  api.addInstall((battle) => { installLeaderErosion(battle); });
}
