// mods/cyanfish.fix-egir-bond/content/index.js — 《网页端bug清单v1.0》第②条「阿戈尔盟约」的 L3 修复模块。
//
// 契约：默认导出 `(api) => void`。api 见 `卫戍协议-Mod开发规范.md` §5.2。★ 本模块**不 import 任何引擎路径**，
// 一切经 api 拿（api.support / api.data / api.constants / api.damage）。
//
// ★★ 本模块**一行都不改基座**，全部靠在 battle 实例上挂钩子 + 包一层实例方法完成。
//    所有开关默认关掉时，行为与改动前逐值相同（见 <开发期脚本>/verify_fix_egir_bond.mjs）。
//
// =====================================================================================================================
// 官方口径（用户 2026-10-07 明确）：协防开局的结算顺序是
//
//     部署 → 吞噬 → 击倒（包含「吞噬击倒」与「原本击倒」）→ 按顺序复活
//
// 且「复活顺序 = 从左到右、从上到下」= **列主序**（与基座 devour 里那句「更靠左和靠上」是同一个口径）。
// 这两条把三个子问题的根因都串起来了 —— 见下。
//
// =====================================================================================================================
// ① chainThroughDown —— 协防阶段的吞噬链被「上一阶段被击倒」的中间干员截断
// ---------------------------------------------------------------------------------------------------------------------
// 基座 `server/sim/content/bonds/core.js: devour()`：
//   const order = members.filter(S.onField)...          // ← 只有「活着且在场上」的成员才能发起吞噬
//   const opAt = (u) => { … return a && S.isOp(a) && a.alive ? a : null; }   // ← 目标也必须是活的
//
// 协防（`kind:'unite'`）开局时，上一阶段被击倒的干员是 `FORCED_EXIT` 状态
//   （`Battle.start()` 第 377-381 行：`u.hp = 0; retreat(u, {reason: FORCED_EXIT})`）⇒ `alive=false / deployed=false`
//   ⇒ 它既不能当标记者、也不能当目标 ⇒ 它身后的整条链**一个都不啃**。
//
// 实测（`<开发期脚本>/probe_bug_fixes.mjs` P2，链路 g1 → g2 → 杂兵）：
//   对照（g2 在场）：g1.atk = 348(base) + 1065(= g2 365 + 杂兵 700)，吞噬事件 2 条，杂兵 20000 → 15900
//   g2 带 `carryState.down`：**吞噬事件 0 条**，g1.atk = 348（只剩自己的 base），杂兵满血 20000
// ⇒ 不是「丢一部分」，是整条链归零。
//
// ★ 修法（两个层次，互为保险）：
//   (a) `deferForcedExit`：把「强制退场」从「部署之后、battleStart 之前」推迟到**吞噬结算完之后**，
//       于是基座的 devour 看到的是**满编的棋盘** —— 链、5000 物理流失、【吞噬】击倒全都正常发生，
//       这就是用户要的「部署 → 吞噬 → 击倒」。退场本身仍在同一次 `battleStart` 里跑完，
//       因此 `Battle.start()` 末尾「重读再部署计时」那段照常覆盖它。
//       ★ 关键约束（`docs/DESIGN.md` §19.3）：**强制退场不是新的击倒** —— 不触发 `kill` / 不增加 `deaths`，
//         所以本 Mod 会在「待强制退场者」身上做两件事，把它按基座自己的规则判成「已经击倒」：
//           ① 吞掉打在它身上的【吞噬】伤害（它本来就已经倒地，基座规则：pass 中被击倒的目标不再结算剩余标记）；
//           ② 吞掉**由它作为标记者**发出的【吞噬】伤害（基座规则：标记者不在场 ⇒ 不再产生标记）。
//         合起来，协防的吞噬结果与「全员都在场」的对照**逐值相同** —— 这就是用户说的「无视链路上干员的击倒情况」。
//         ★ 实测对照：杂兵 HP 15900 / g1.atk 1413，两者完全相同（`verify_fix_egir_bond.mjs` §②）。
//   (b) `chainThroughDown`：即使 (a) 被关掉，也在基座 devour **之后**（priority −50）重算一条
//       「允许链路成员处于倒地状态」的链，并把差额补上（用独立 key `bond:egir:devour:fix`，只补不重复）；
//       同时把基座因断链而**漏掉的【吞噬】伤害**补给「仍在场上的」目标。⇒ 「吞噬过程仍需进行」。
//       (a) 生效时这一层自动退化成空操作（差额为 0、没有漏掉的标记）。
//
// ★ 有意**不**做的事：不补盟约层数。`S.gainLayers` 在联防 / boss / 隐藏关本来就受
//   `battle.flags.layerGainsEnabled` 限制（= 用户说的「盟约为协防阶段限制不会叠加」），无需本 Mod 介入。
//
// =====================================================================================================================
// ② reviveWhitelist —— 「5 阿戈尔」的复活名额序
// ---------------------------------------------------------------------------------------------------------------------
// 官方（`data/bonds.json` egirShip.desc）：「<在场5名不同【阿戈尔】干员>**前3名**【阿戈尔】干员首次被击倒时立刻复活」。
// 基座 `installEgir` 里 `st.knocked` 是 Set、`st.revives` 计数，**都按死亡顺序填**
//   ⇒ 实际语义是「最先被击倒的 3 个拿名额」，与「前3名」的**部署顺序**读法不同。
//
// ★ 用户 2026-10-07 明确：「复活顺序是从左到右、从上到下」= **列主序**（不是引擎 `deploySeq` 的行主序）。
//   本 Mod 在 `battleStart`（priority 100，早于一切死亡）冻结一份白名单 =
//   **官方顺序最靠前的 `max_free_respawn_cnt` 名成员**，默认口径 `reviveOrder:'board'` 与基座 devour 逐字一致：
//       boardCol(a) - boardCol(b) || b.tileR - a.tileR || a.id - b.id      // 左→右，同列内 上→下
//   （`reviveOrder:'deploy'` 可切回引擎 `deploySeq` 的行主序，仅供对照。）
//   然后把 `battle.redeploy` 包一层：基座的 5 阿戈尔复活钩子（`death` priority 11）为非白名单成员调用
//   `redeploy(u, {free:true})` 时返回 `false` ⇒ 基座 `if (!battle.redeploy(...)) return;` **不消耗名额**、
//   该成员正常倒地并进入再部署计时。
//
//   ★ 拦截是**一次性**的：标志位由 priority 12 的 `death` 钩子设下、priority −1e6 的钩子清掉，
//     中间只覆盖「这一次死亡事件」的其余钩子 ⇒ **不会误伤** 不屈（indomShip, priority 10）等其它免费再部署
//     （归溟幽灵鲨同时持有【阿戈尔】【不屈】，这条很关键）。
//   ★ 强制退场（reason `'forcedExit'`）**不占名额、也不复活** —— 基座钩子本就只认 `reason === 'killed'`，
//     与 `docs/DESIGN.md` §19.3「深海 / 不屈 的复活在**自己阶段**就已经结算过」一致。
//
// =====================================================================================================================
// ③ 归溟幽灵鲨在替身阶段被击倒（用户报告的现象：「直接再部署、不会被击倒并进入再部署计时」）
// ---------------------------------------------------------------------------------------------------------------------
// 实测（探针 P1）：5 阿戈尔在场时，她在**替身**阶段吃到致命伤 ⇒ `alive=true`、`removeReason='killed'`、
// `deploy` 事件在 0.05 s 后、`revive` fx ×1、`isDown=false`：**击倒判定成立，但被 5 阿戈尔立刻复活，不进再部署计时**。
// 对照（3 阿戈尔，无复活档位）：`alive=false`、`isDown=true`，正常倒地。
// ⇒ 现象 ≠ 傀儡师自身的 bug（傀儡师行为由 `feedback2-doll.test.js` 覆盖，正常），而是 **② 的直接后果**：
//   她按死亡顺序「第一个倒」，于是抢到了本不该属于她的名额。② 改完后她（按官方列主序通常排在第 4 位之后）
//   **不再拿名额**，从而正常倒地并进入再部署计时 —— 与用户期望一致。
//
// ---------------------------------------------------------------------------------------------------------------------
// 已知边界（有意，不是 bug）
// ---------------------------------------------------------------------------------------------------------------------
// · 放宽的链路判据只对「本局内曾经部署过、现在不在场上」的成员生效；从未上过场的成员（`deploySeq === 0`）不参与，
//   避免凭空造出攻击力加成。
// · (a)/(b) 两层都只在「有【阿戈尔】成员不在场上」时才可能改变行为：常规战斗（全员在场）里 (a) 没有待强制退场者、
//   (b) 差额为 0 ⇒ **零副作用**。
// · 依赖基座仍在用 `bond:egir:devour` 这个 buff key。基座改 key ⇒ 本修复静默失效（不报错、不误伤）。

/** 各段开关（默认全开；关掉任一项都退回基座行为）。 */
const OPTIONS = {
  /** (a) 协防开局把「强制退场」推迟到吞噬结算之后 ⇒ 部署 → 吞噬 → 击倒。 */
  deferForcedExit: true,
  /** (b) 兜底：基座 devour 之后按「允许链路成员倒地」重算链、补差额、补漏掉的【吞噬】伤害。 */
  chainThroughDown: true,
  /** ② 冻结复活白名单。 */
  reviveWhitelist: true,
  /** ② 名额取序口径：'board' = 官方「从左到右、从上到下」（列主序，默认）；'deploy' = 引擎 deploySeq（行主序）。 */
  reviveOrder: 'board',
};

/** 基座 devour 发的 buff key（用来读「已经发了多少」，以及往哪个 key 上补差额）。 */
const DEVOUR_KEY = 'bond:egir:devour';
const DEVOUR_FIX_KEY = 'bond:egir:devour:fix';
const BOND = 'egirShip';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));
const onField = (u) => !!u && u.alive && u.deployed && !u.removed;
/** 本局内曾经部署过、现在不在场上（被击倒 / 强制退场 / 正在再部署计时）的干员。 */
const isDown = (u) => !!u && u.kind === 'op' && !u.removed && u.deploySeq > 0 && !u.alive;
/** 镜像玩家的「左」在场上是最右 ⇒ 与基座 devour 同款。 */
const boardCol = (u) => (u && u.player && u.player.mirror ? -u.tileC : u.tileC);
/** ★ 官方「从左到右、从上到下」（列主序；row 0 是最下面一行，所以「上」= tileR 更大）。 */
const officialOrder = (a, b) => (boardCol(a) - boardCol(b)) || (b.tileR - a.tileR) || (a.id - b.id);

/** 宿主句柄（support / damage / constants），setup 时注入；装载器只调一次 setup。 */
let S = null;
let D = null;
let C = null;

export default function setup(api) {
  S = api.support;
  D = api.damage;
  C = api.constants;
  if (!S || typeof S.bondMembers !== 'function' || typeof S.passiveBuff !== 'function') return;
  if (!D || typeof D.mitigate !== 'function') return;
  const FORCED_EXIT = (C && C.FORCED_EXIT) || 'forcedExit';

  api.addInstall((battle) => {
    if (!battle || !Array.isArray(battle.players) || typeof battle.on !== 'function') return;
    if (typeof battle.retreat !== 'function' || typeof battle.loseHp !== 'function') return;
    const bb = api.data?.()?.bonds?.[BOND]?.bb ?? {};
    for (const p of battle.players) {
      const pid = p && p.playerId;
      if (pid == null || !p.bonds || typeof p.bonds !== 'object') continue;
      let members;
      try { members = S.bondActive(battle, pid, BOND) ? S.bondMembers(battle, pid, BOND) : null; } catch { members = null; }
      if (!members || !members.length) continue;
      if (OPTIONS.reviveWhitelist) installReviveWhitelist(battle, bb, members);
      if (OPTIONS.deferForcedExit) installForcedExitOrder(battle, members, FORCED_EXIT);
      if (OPTIONS.chainThroughDown) installChainThroughDown(battle, pid, bb, members);
    }
  });
}

// =====================================================================================================================
// (a)  协防开局时序：部署 → 吞噬 → 击倒
// =====================================================================================================================

/**
 * 把 `retreat(unit, { reason: FORCED_EXIT })` 推迟到**吞噬结算完之后**。
 *
 * `Battle.start()` 的顺序是 [部署 → 强制退场 → emit('battleStart') → 重读再部署计时]，
 * 而基座的 devour 挂在 `battleStart` 上 ⇒ 它看到的是「已经退场」的棋盘。推迟之后：
 *
 *   部署（全员在场） → emit(battleStart) → devour 跑满链 + 5000 物理流失 + 【吞噬】击倒
 *                    → priority −9e8 真正执行退场 → start() 末尾重读再部署计时
 *
 * ★ 强制退场「不是新的击倒」（DESIGN §19.3）：所以打在待退场者身上的【吞噬】伤害被吞掉，
 *   否则它会被判成 `reason:'killed'` 而多算一次 `deaths`。
 * ★ 退场会在 `_remove` 里清掉非 persist 的 buff；`bond:egir:devour` 是 persist 的 ⇒ 会残留。
 *   待退场者本来不该拿到它（基座里它已被 filter 掉），所以这里显式剔除，保持与基座逐值一致。
 */
function installForcedExitOrder(battle, members, FORCED_EXIT) {
  const memberSet = new Set(members);
  /** 被推迟的退场请求。 */
  const pending = [];
  let deferring = true;

  const origRetreat = battle.retreat.bind(battle);
  battle.retreat = (u, o) => {
    const reason = (o && o.reason) || 'retreat';
    if (deferring && reason === FORCED_EXIT && memberSet.has(u)) { pending.push(u); return; }
    return origRetreat(u, o);
  };

  // 「待强制退场者」= 已经「原本击倒」的干员，所以按基座自己的两条规则把它判成「不在场」：
  //   ① 它不该被【吞噬】二次击倒（基座：pass 中被击倒的目标不再结算剩余标记）；
  //   ② 它**作为标记者**发出的【吞噬】也要取消（基座：标记者不在场 ⇒ 不再产生标记，`if (knocked(t) || !m.alive) continue;`）。
  //   两者合起来，协防的吞噬结果与「全员都在场」的对照**逐值相同** —— 这就是用户说的「无视链路上干员的击倒情况」。
  //   注：标记者自己因此多拿的那份 atkFlat 不可观测 —— 它随后就被退场，且退场前我们会清掉它的 devour buff。
  const origLoseHp = battle.loseHp.bind(battle);
  battle.loseHp = (t, amount, o) => {
    if (deferring && pending.length) {
      const tags = (o && o.tags) || null;
      if (Array.isArray(tags) && tags.includes(DEVOUR_KEY)) {
        const src = (o && o.source) || null;
        if (pending.includes(t) || (src && pending.includes(src))) return 0;
      }
    }
    return origLoseHp(t, amount, o);
  };

  // ★「击倒」：吞噬（priority 0）跑完之后才真正退场。priority 极低 ⇒ 排在所有 battleStart 钩子之后。
  battle.on('battleStart', () => {
    deferring = false;
    if (!pending.length) return;
    const list = pending.splice(0);
    for (const u of list) {
      if (Array.isArray(u.buffs)) u.buffs = u.buffs.filter((b) => !b || (b.key !== DEVOUR_KEY && b.key !== DEVOUR_FIX_KEY));
      u.hp = 0;
      try { origRetreat(u, { reason: FORCED_EXIT }); } catch { /* 静默：退场失败不该崩一局 */ }
    }
  }, { priority: -9e8 });
}

// =====================================================================================================================
// ②③  复活名额：按官方「从左到右、从上到下」冻结前 N 名
// =====================================================================================================================

function installReviveWhitelist(battle, bb, members) {
  const max = Math.max(0, Math.floor(num(bb.max_free_respawn_cnt, 0)));
  if (!(max > 0)) return;
  const memberSet = new Set(members);
  /** 允许「立刻复活」的成员（开局冻结）。 */
  const allowed = new Set();

  const orderOf = (list) => {
    if (OPTIONS.reviveOrder === 'board') return list.slice().sort(officialOrder);
    // 引擎 `deploySeq`（Battle.start：行主序，上行先，每行内左→右；镜像玩家左→右反向）—— 仅供对照
    return list.slice().sort((a, b) => (a.deploySeq - b.deploySeq) || (a.id - b.id));
  };

  // priority 100：早于基座的 devour（0）与死亡钩子（11），保证白名单在任何一次死亡之前就绪
  battle.on('battleStart', () => {
    allowed.clear();
    for (const u of orderOf(members).slice(0, max)) allowed.add(u);
  }, { priority: 100 });

  // 只拦「这一次死亡事件」里、基座 5 阿戈尔钩子随后发出的那一次免费再部署
  battle.on('death', (c) => {
    const u = c.unit;
    if (!u || c.reason !== 'killed' || !memberSet.has(u)) return;
    if (!allowed.has(u)) u.__egirBlockRevive = true;
  }, { priority: 12 });
  battle.on('death', (c) => { if (c.unit) delete c.unit.__egirBlockRevive; }, { priority: -1e6 });

  const origRedeploy = battle.redeploy.bind(battle);
  battle.redeploy = (u, o) => {
    if (u && u.__egirBlockRevive) { delete u.__egirBlockRevive; return false; }
    return origRedeploy(u, o);
  };
}

// =====================================================================================================================
// (b)  兜底：允许链路成员倒地地重算吞噬链，并补齐基座漏掉的攻击力 / 阻挡数 / 【吞噬】伤害
// =====================================================================================================================

function installChainThroughDown(battle, pid, bb, members) {
  // 记录基座**实际结算过**【吞噬】伤害的标记（(标记者, 目标) 对），用来算「它漏了哪些」
  const done = new Set();
  const mark = (m, t) => `${m && m.id}|${t && t.id}`;
  let watching = true;
  const origLoseHp = battle.loseHp.bind(battle);
  battle.loseHp = (t, amount, o) => {
    if (watching && t && o && o.source && Array.isArray(o.tags) && o.tags.includes(DEVOUR_KEY)) done.add(mark(o.source, t));
    return origLoseHp(t, amount, o);
  };

  battle.on('battleStart', () => {
    watching = false;
    // 全都在场 ⇒ 基座的链本来完整，什么都不用做（常规战斗因此零副作用）
    if (members.every(onField)) return;
    try { topUpDevour(battle, pid, bb, members, done); } catch { /* 静默：修复失败不该崩一局 */ }
  }, { priority: -50 });
}

/** 按「允许链路成员倒地」重算吞噬链：补攻击力 / 阻挡数的差额，并补基座漏掉的【吞噬】伤害。 */
function topUpDevour(battle, pid, bb, members, done) {
  const memberSet = new Set(members);
  // 标记者仍是「在场成员」（与基座 filter(S.onField) 一致）—— 落后者不该因为链被修好就拿到常驻加成
  const order = members.filter(onField).sort(officialOrder);

  // 基座用 S.allyAt：它要求「已部署」，所以查不到 FORCED_EXIT 的倒地干员。这里换成自己找。
  const opAtTile = (r, c) => {
    for (const u of battle.allyUnits) {
      if (u.ownerId !== pid || u.kind !== 'op' || u.tileR !== r || u.tileC !== c) continue;
      if (onField(u) || isDown(u)) return u;
    }
    return null;
  };

  const marks = [];   // [标记者, 目标]
  for (const m of order) {
    const mine = [];
    const seen = new Set([m]);
    const queue = [m];
    for (let guard = 0; queue.length && guard < 64; guard++) {
      const x = queue.shift();
      const [r, c] = S.frontTile(x);
      const t = opAtTile(r, c);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      mine.push(t);
      // 只有【阿戈尔】成员会把链继续传下去（与基座一致）
      if (memberSet.has(t)) queue.push(t);
    }
    if (!mine.length) continue;

    // —— 攻击力 / 阻挡数：只补差额
    let atk = 0, block = 0;
    for (const t of mine) { atk += num(t.base && t.base.atk, 0); block += num(t.base && t.base.blockCnt, 0); }
    const cur = typeof m.findBuff === 'function' ? m.findBuff(DEVOUR_KEY) : null;
    const dAtk = atk - num(cur && cur.mods && cur.mods.atkFlat, 0);
    const dBlock = block - num(cur && cur.mods && cur.mods.blockCnt, 0);
    if (dAtk > 1e-9 || dBlock > 1e-9) {
      const mods = {};
      if (dAtk > 1e-9) mods.atkFlat = dAtk;
      if (dBlock > 1e-9) mods.blockCnt = dBlock;
      S.passiveBuff(battle, m, DEVOUR_FIX_KEY, mods);
    }
    for (const t of mine) marks.push([m, t]);
  }

  // —— 【吞噬】的物理流失（`bb.damage_value`，实测 5000，走 `loseHp` = true 伤害不吃防御）：
  //    基座因为断链漏掉的那些，补给**仍在场上**的目标。
  //    （已经倒地 / 待强制退场的不补：它这一次的击倒已经判过了，二次击倒会凭空多算一次 deaths。）
  const amount = num(bb && bb.damage_value, 0);
  if (!(amount > 0)) return;
  for (const [m, t] of marks) {
    if (!t || !onField(t) || !m || !m.alive) continue;
    if (done.has(`${m.id}|${t.id}`)) continue;
    done.add(`${m.id}|${t.id}`);
    S.fxOn(battle, 'devour', t, 'bond:egirShip', 'devour', { from: m.id });
    battle.loseHp(t, D.mitigate(amount, 'phys', t.s), { source: m, tags: [DEVOUR_KEY] });
  }
}
