// mods/cyanfish.fix-operator/content/index.js — **干员侧**修复合并 Mod（L3）。
//
// 由 cyanfish.fix-thorn2-stack（v1.1.0）与 cyanfish.fix-egir-bond（v1.2.0）合并而成。
// 契约见 `卫戍协议-Mod开发规范.md` §5：默认导出 `(api) => void`，★ 不 import 任何引擎路径，一切经 hostApi 拿。
//
// ★★ **不改基座一行代码**：全部靠 `addInstall` 在 battle 实例上挂钩子 + 包一层实例方法。
// ★★ 「装上也绝不与官方打架」：**上游已修的项默认 enabled:false**，此时该修复**一个钩子都不注册**
//    （`installXxx` 第一行的 `if (!FIX.enabled) return;`）⇒ 零生效代码、零副作用。
//
// =====================================================================================================================
// FIXES 表（唯一的「修复台账」——基底版本更新时照这张表排查「官方是否已经修了」）
// =====================================================================================================================
//
//  id             | 修什么                                            | 依据                | 基于基座 | 上游是否已修 | 默认
//  ---------------|---------------------------------------------------|---------------------|---------|-------------|-----
//  thorn2-stack   | 引星棘刺一技能加防御：多个炼金单元重叠时应叠加        | 清单v1.0 第④条       | 0.1.2   | **已修(0.2.2)** | 否
//  egir-bond      | 阿戈尔盟约：协防吞噬链断链 / 前3名复活名额 / 归溟幽灵鲨 | 清单v1.0 第②条       | 0.1.2   | 已修(0.1.3)  | 否
//  fartooth-dollswap | 远牙给最右干员的 <部署时> 特质：傀儡师换体也算一次部署 | 服主口径(2026-10-09) | 0.2.1 | **已修(0.2.3)** | 否
//
// ★★ `fartooth-dollswap` **已停用、并且它的基座接缝也已撤除**（工序 54，2026-10-10）：
//   ① 上游 **0.2.3** 自己在**同一个安装器函数**（`server/sim/content/garrisons/battle.js` 的
//      `act2autochess_gar_event_onstart`）里实现了**同一条**（GitHub #415 / PR #429，附 7 条回归用例
//      `test/content/fartooth-doll-swap.test.js`）：按 `gid === 'garrison_108_a' || 'garrison_108_b'` 过滤后
//      `battle.on('dollSwap', …) → fireGain(battle, it)`，方向两个都算、共用原上限。
//   ② 因此我们原来那条**数据接缝**（基座读特质自己的 `bb.doll_swap_deploy` + 本 Mod 用 `data/garrisons.json`
//      的 `merge` 打开它）**在同一基座上会与上游硬编码的那条同时生效 ⇒ 换体 `fireGain` 两次 ⇒ 远牙叠层翻倍**。
//      ⇒ 本项停用（`enabled: false`、零钩子），`data/garrisons.json` **整体删除**，基座
//      `server/sim/content/garrisons/battle.js` **撤掉那段接缝**（已回到与 `<官方源码参照>/v0.2.2` 对应文件
//      **逐字节相同**，sha256 `578f1e4a…7231`，该文件退出我们的覆盖层）。取证：
//      `<开发期报告>/53-upstream-023-recon.md` §5.1、`53h-garrisons.diff`、`54-stage0-dollswap.md`。
//   ③ 本项**在 0.2.2 基座上即使手动打开也无效**（接缝已不存在，安装器不读这枚旗标）；0.2.3 基座上由上游内建。
//      `installFartoothDollSwap` 与 `installThorn2Stack` 同形状地保留下来（按「上游已修的项默认不生效」的纪律，
//      只有自检的提示文案改成了「接缝已撤除」），它只是一条死路径：`enabled: false` ⇒ 第一行 `return`，
//      一个钩子都不注册、一行生效代码都不执行。
//
// 「上游已修」那条**逐行取证**（0.2.1 施工树）：
//   · `server/sim/content/bonds/core.js:366-369 egirDownAtStart`：把「联防开局即被强制退场（carry.down）」的干员
//     判成「仍然站在自己的部署位上」，`:409 const downAtStart = (u) => egirDownAtStart(battle, u);`
//     `:410 const order = members.filter((u) => S.onField(u) || downAtStart(u)).sort(egirOrder);`
//     `:413-419 opAt` 用 `battle.downOn(r, c)` 把倒地者也算作「身前一格」的干员 —— 即：**吞噬链不再被击倒者截断**。
//     `:408` 注释逐字写着「until 0.1.2 the forced exit came first and the chain broke」。
//   · `:503-507`：复活名额改为「开局按位置取前 N 名」（`egirReviveScan`，注释「until 0.1.3 the slots were fixed at
//     battle start for the first 3 members by position」）—— 与用户口径一致。
//
// 「0.2.2 已修（thorn2-stack）」那条**逐行取证**（`<官方源码参照>/v0.2.2/extract/Stronghold-Protocol/`）：
//   · `server/sim/content/kits/ops/chess_char_5_15-thorn2.js:70-73`（0.2.2）：
//         // one DEF buff per alchemy unit, so two units on one ally add up (+60 +60; PRTS 度算浪波 备注 「效果均可叠加」,
//         // GitHub #388 — one shared key let the last unit's buff replace the other's)
//         z.defKey ??= `thorn2:bastion:${unit.id}:${unit.mem.bastionSeq = (unit.mem.bastionSeq ?? 0) + 1}`;
//         for (const a of allies) battle.addBuff(a, { key: z.defKey, duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
//     ⇒ 每个**炼金单元实例**（逐个 zone，`z.defKey` 惰性固化）拿到按「干员 id + 该干员第几个单元」唯一化的 buff key，
//     同名替换不再发生在两个单元之间 ⇒ 两个单元罩同一名干员时 +60 **再** +60（精锐 +75），
//     同一名引星棘刺前后两次释放、两个单元重叠的那几秒也叠加。**与我们这条修复的语义完全相同**。
//   · `CHANGELOG.md` 0.2.2 段：「引星棘刺一技能「度算浪波」的防御力加成可以叠加了：两个炼金单元罩住同一名干员时
//     防御力 +60 再 +60（精锐 +75），此前只算一个（治疗本来就会叠加）；同一名引星棘刺前后两次释放、两个炼金单元
//     重叠的那几秒也一样叠加（PRTS 备注：效果均可叠加；**GitHub #388**，感谢 @ChengCC0101）」。
//   · `docs/history/0.2.2.md` §27.31「引星棘刺 S1 度算浪波: alchemy units add their DEF (GitHub #388, reported by
//     @ChengCC0101)」：**Cause**「every unit's DEF buff used one key ('thorn2:bastion'); addBuff replaces a same-key
//     buff.」，**Golden** 记录 roster-033 / roster-034 基准随之变化。
//   ⇒ 结论：上游用的是「按（干员, 单元序号）唯一化 buff key」，与本项「按覆盖的 zone 个数把 defFlat 合并成一份」是
//     两条不同的实现路径，但**外部可观测结果一致**（叠加后的防御力）。按纪律「上游已修的项默认 enabled:false」，
//     本项自 0.2.2 起**默认停用**（零钩子、零副作用）。回滚启用前的检查清单见 `README.md` §2.4。
//
// 「截至 0.2.1 未修」那条**逐行取证**（留给回滚与历史对照）：
//   · `server/sim/content/kits/ops/chess_char_5_15-thorn2.js:63-65`：
//         const inZone = (a) => Math.abs(a.tileR - z.r) <= 1 && Math.abs(a.tileC - z.c) <= 1;
//         const allies = battle.alliesFor(unit).filter(inZone);
//         for (const a of allies) battle.addBuff(a, { key: 'thorn2:bastion', duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
//     `key` 是**常量**；`server/sim/battle/status.js:19,42-46` 的同名 buff 默认互replace（「同名替换」）
//     ⇒ 两个炼金单元范围重叠时只生效一份 +60（应为 +120）。三技能（`thorn2:sea`，官方写明「不叠加」）不受影响；
//     回血本来就是按 zone 逐个 `battle.heal`（`thorn2.js:66-70`），**本项只修防御力**。
//     ★ 上面这三行是 0.2.1 的坐标；0.2.2 起同一段被重写成 `:68-73`（多了 `z.defKey` 一行），行号不再对应。

/** ★ 每项修复的台账：`enabled` 是唯一开关；`since` = 该 bug 所在的基座版本；`upstreamFixedIn` = 上游哪个版本已修（null = 截至该基座未修）。 */
const FIXES = [
  {
    id: 'thorn2-stack',
    what: '干员「引星棘刺」一技能（度算浪波）的防御力加成：多个炼金单元范围重叠时应叠加（回血本来就叠加，不动）',
    basis: '《网页端bug清单v1.0》第④条；data/chess.json 该技能文案「使落点和周围8格的友方单位防御力+60，每秒回复相当于攻击力11%的生命值」——无「不叠加」字样（三技能才写「（不叠加）」）',
    since: '0.1.2',
    upstreamFixedIn: '0.2.2（GitHub #388，报告者 @ChengCC0101）—— 上游把固定 key `thorn2:bastion` 改成按（干员, 该干员第几个炼金单元）唯一的 `thorn2:bastion:${unit.id}:${bastionSeq++}`，' +
      '两个单元罩同一名干员时 +60 再 +60（精锐 +75）。依据：CHANGELOG 0.2.2 段第 54 条 + `docs/history/0.2.2.md` §27.31 + ' +
      '`server/sim/content/kits/ops/chess_char_5_15-thorn2.js`（0.2.2）`:70-73`。',
    defaultEnabled: false,
    enabled: false,
    why: '0.2.2 上游已按官方（PRTS 备注「效果均可叠加」）修好同一条，且外部可观测结果一致 ⇒ 按纪律默认停用（零钩子）。' +
      '★ 0.2.2 基座用的是逐单元唯一 key，本项拦的是固定 key `thorn2:bastion` ⇒ 在 0.2.2 上启用会**双重计入**' +
      '（基座 n 份 +60 与本项的合并 +60n 相加 = +120n）⇒ **回滚启用前必须先读 README §2.4 的检查清单**。',
  },
  {
    id: 'egir-bond',
    what: '【阿戈尔】盟约四件事：①协防开局吞噬链被「上一阶段被击倒」的中间干员截断 ②「待强制退场者」仍算标记者 ③<在场5名【阿戈尔】>的「前3名」复活名额口径 ④归溟幽灵鲨替身阶段被击倒时不该占名额',
    basis: '《网页端bug清单v1.0》第②条；data/bonds.json egirShip.desc「<在场5名不同【阿戈尔】干员>前3名【阿戈尔】干员首次被击倒时立刻复活」',
    since: '0.1.2',
    upstreamFixedIn: '0.1.3（bonds/core.js devour 的 downAtStart/opAt + 复活名额按位置）',
    defaultEnabled: false,
    enabled: false,
    why: '0.2.1 基座已按官方重写；且本实现源自 0.1.2，直接启用会 ATK 双计（读旧字段 atkFlat）并与基座复活扫描口径相反。默认不注册钩子 ⇒ 装上也不与官方打架。',
  },
  {
    id: 'fartooth-dollswap',
    what: '远牙（garrison_148_a/b）授予「同一行最右边一名干员」的特质 garrison_108_a/b（`<部署时>使已激活的【卡西米尔】【精准】层数+4/+8，每场作战至多24/48层`）：傀儡师本体↔替身切换（`dollSwap`）也应算作该干员的一次「部署时」',
    basis: '服主口径 2026-10-09（「傀儡师换体应当触发远牙的叠层」，且只对远牙这一个干员做单独适配）+ data/chess.json 傀儡师特性原文「受到致命伤时不撤退，切换成<替身>作战（替身阻挡数为0），持续20秒后自身再次替换<替身>」+ 远牙 garrison 的 effectKey `act2autochess_gar_event_onstart`（= 基座 `battle.on(\'deploy\')` 那条）',
    since: '0.2.1',
    upstreamFixedIn: '0.2.3（GitHub #415 / PR #429）—— 上游在**同一个安装器函数** `server/sim/content/garrisons/battle.js` 的 '
      + '`act2autochess_gar_event_onstart` 里按 `gid === \'garrison_108_a\' || it.gid === \'garrison_108_b\'`（**同一对 garrison**）'
      + '新增 `battle.on(\'dollSwap\', …) → fireGain(battle, it)`（两个方向都算、沿用原 `fireGain` 数值与每场上限），'
      + '并附 7 条回归用例 `test/content/fartooth-doll-swap.test.js`；`docs/history/0.2.3.md` §28.5。'
      + '取证：<开发期报告>/53-upstream-023-recon.md §5.1 + 53h-garrisons.diff。'
      + '★ 同一基座上两边并存 ⇒ 换体 `fireGain` 两次（远牙叠层翻倍）⇒ 本项停用，且其基座接缝与 data/ 补丁一并撤除（工序 54）。',
    defaultEnabled: false,
    enabled: false,
    // ★ 原来的开关是数据（data/garrisons.json 的接缝旗标 bb.doll_swap_deploy）；该接缝与那份数据补丁已在工序 54 撤除。
    axis: 'L2（已撤除）',
    why: '上游 0.2.3 已在同一函数、同一对 garrison、同一个 `dollSwap → fireGain` 上实现了同一条 ⇒ 按纪律「上游已修的项默认不生效」，'
      + '本项 `enabled: false`（零钩子）。★ 与 `thorn2-stack` 不同的是：本项的基座接缝**已经整体撤除**'
      + '（`server/sim/content/garrisons/battle.js` 回到与 <官方源码参照>/v0.2.2 逐字节相同），`data/garrisons.json` 已删除 '
      + '⇒ **在 0.2.2 基座上即使手动改成 true 也不会生效**（安装器不再读 `bb.doll_swap_deploy`）；0.2.3 基座上由上游内建。',
  },
];
const FIX_OF = Object.fromEntries(FIXES.map((f) => [f.id, f]));

// ---------------------------------------------------------------------------------------------------------------------
// 各项修复用到的常量
// ---------------------------------------------------------------------------------------------------------------------

/** 引星棘刺的普通形态 id（金色形态 `_b` 的 baseId 也是它）。 */
const THORN = 'chess_char_5_15_a';
/** 基座一技能 guard 区用的固定 buff key —— 本项拦截并接管的对象。 */
const THORN_BASE_KEY = 'thorn2:bastion';
/** 本 Mod 自己发的 key（与基座不同名 ⇒ 不会被基座的下一次刷新顶掉）。 */
const THORN_FIX_KEY = 'thorn2:bastion:stack';
/** 与基座 `kits/ops/chess_char_5_15-thorn2.js` 的 AURA_IV / AURA_DUR 保持一致（0.25 s 刷、0.5 s 寿命）。 */
const THORN_AURA_IV = 0.25;
const THORN_AURA_DUR = 0.5;

/** 阿戈尔（egir-bond）各项的开关，与退役的 cyanfish.fix-egir-bond@1.2.0 逐字一致。 */
const EGIR_OPTIONS = {
  /** (a) 协防开局把「强制退场」推迟到吞噬结算之后 ⇒ 部署 → 吞噬 → 击倒。 */
  deferForcedExit: true,
  /** (b) 兜底：基座 devour 之后按「允许链路成员倒地」重算链、补差额、补漏掉的【吞噬】伤害。 */
  chainThroughDown: true,
  /** ③ 冻结复活白名单。 */
  reviveWhitelist: true,
  /** ③ 名额取序口径：'board' = 官方「从左到右、从上到下」（列主序，默认）；'deploy' = 引擎 deploySeq（行主序）。 */
  reviveOrder: 'board',
};
/** 基座 devour 发的 buff key（用来读「已经发了多少」，以及往哪个 key 上补差额）。 */
const EGIR_DEVOUR_KEY = 'bond:egir:devour';
const EGIR_DEVOUR_FIX_KEY = 'bond:egir:devour:fix';
const EGIR_BOND = 'egirShip';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));
const baseIdOf = (u) => String((u && u.def && (u.def.baseId ?? u.def.chessId ?? u.def.id)) ?? u?.defId ?? '').replace(/_b$/, '_a');

// =====================================================================================================================
// ① thorn2-stack —— 引星棘刺一技能的防御力可叠加（**0.2.2 起上游已修 ⇒ 默认停用**；启用前先读 README §2.4）
// =====================================================================================================================
//
// 手段（零基座改动，见 `卫戍协议-Mod开发规范.md` §5.8 手法 A）：
//   1. 包一层 `battle.addBuff`：凡是 `key === 'thorn2:bastion'`（基座的固定 key）**吞掉不应用**，
//      只把 `mods.defFlat` 记下来当作「单个炼金单元的加成值」。
//   2. 自己每 0.25 s（与基座同节奏、同 0.5 s 寿命）扫一遍引星棘刺的存活 guard 区，
//      对每个友方算出**覆盖它的 zone 个数 n**，用独立 key（`thorn2:bastion:stack`）发
//      **一份合并后的** `defFlat = 单份 × n` ⇒ 天然叠加。
//   3. 覆盖判据与基座逐字一致：`|Δrow| <= 1 && |Δcol| <= 1`（落点 + 周围 8 格）。
//
// 场上没有引星棘刺、或她的一技能炼金单元没投出 ⇒ `seen` 恒 false ⇒ 一个 buff 都不发，与改动前逐值相同。

function installThorn2Stack(battle) {
  if (!FIX_OF['thorn2-stack'].enabled) return;
  if (!battle || typeof battle.addBuff !== 'function' || typeof battle.every !== 'function') return;
  const orig = battle.addBuff.bind(battle);

  /** 单个炼金单元的防御力加成（从基座被吞掉的那次 addBuff 里读，不依赖任何数据键）。 */
  let perZone = 0;
  /** 基座是否真的发过这个 buff（= 场上确实有引星棘刺的一技能炼金单元）。 */
  let seen = false;

  battle.addBuff = (unit, buff, ...rest) => {
    if (buff && buff.key === THORN_BASE_KEY) {
      const v = num(buff.mods && buff.mods.defFlat, 0);
      if (v > 0) perZone = v;
      seen = true;
      return undefined;               // 吞掉：由下面的循环按覆盖数重发
    }
    return orig(unit, buff, ...rest);
  };

  battle.every(THORN_AURA_IV, () => {
    if (!seen || !(perZone > 0)) return;
    for (const t of battle.allyUnits) {
      if (baseIdOf(t) !== THORN) continue;
      const zones = (t.mem && t.mem.zones ? t.mem.zones : []).filter((z) => z && z.type === 'guard');
      if (!zones.length) continue;
      for (const a of battle.alliesFor(t)) {
        let n = 0;
        for (const z of zones) if (Math.abs(a.tileR - z.r) <= 1 && Math.abs(a.tileC - z.c) <= 1) n++;
        if (n > 0) orig(a, { key: THORN_FIX_KEY, duration: THORN_AURA_DUR, mods: { defFlat: perZone * n } });
      }
    }
  });
}

// =====================================================================================================================
// ② egir-bond —— 【阿戈尔】盟约（上游已修 ⇒ 默认不生效）
// =====================================================================================================================
//
// ★ 本段自退役的 cyanfish.fix-egir-bond@1.2.0 **逐字移植**（只把 `setup(api)` 里的三行句柄赋值搬进
//   `installEgirBond(api, battle)`，并把 `bb` 的读取点原样放进函数体）。
// ★ port-03 复核结论（必须读）：该实现在 0.2.1 上**直接启用会出错**，两处必须改代码 ——
//     ① `topUpDevour` 读的是 0.1.2 的 `cur.mods.atkFlat`，0.2.1 改成了最终加算 `atkFinal`（core.js:441）
//        ⇒ 差额算成「整条链的基础攻击力之和」⇒ 在 fix key 上**又加一份**，ATK 双计；
//     ② 复活白名单的 `officialOrder`（列内 `b.row - a.row`）与基座 `egirReviveScan` 方向相反。
//   所以它默认 `enabled:false`（零生效代码）。**回滚启用前必须先按 README 的检查清单改代码。**
//
// 已知边界（有意，不是 bug）：放宽的链路判据只对「本局内曾经部署过、现在不在场上」的成员生效；
// 依赖基座仍在用 `bond:egir:devour` 这个 buff key（基座改 key ⇒ 本修复静默失效，不报错、不误伤）。

const egirOnField = (u) => !!u && u.alive && u.deployed && !u.removed;
/** 本局内曾经部署过、现在不在场上（被击倒 / 强制退场 / 正在再部署计时）的干员。 */
const egirIsDown = (u) => !!u && u.kind === 'op' && !u.removed && u.deploySeq > 0 && !u.alive;
/** 镜像玩家的「左」在场上是最右 ⇒ 与基座 devour 同款。 */
const egirBoardCol = (u) => (u && u.player && u.player.mirror ? -u.tileC : u.tileC);
/** ★ 官方「从左到右、从上到下」（列主序；row 0 是最下面一行，所以「上」= tileR 更大）。 */
const egirOfficialOrder = (a, b) => (egirBoardCol(a) - egirBoardCol(b)) || (b.tileR - a.tileR) || (a.id - b.id);

function installEgirBond(api, battle) {
  if (!FIX_OF['egir-bond'].enabled) return;   // ★ 上游已修 ⇒ 默认一个钩子都不注册
  const S = api.support;
  const D = api.damage;
  const C = api.constants;
  if (!S || typeof S.bondMembers !== 'function' || typeof S.passiveBuff !== 'function') return;
  if (!D || typeof D.mitigate !== 'function') return;
  if (!battle || !Array.isArray(battle.players) || typeof battle.on !== 'function') return;
  if (typeof battle.retreat !== 'function' || typeof battle.loseHp !== 'function') return;
  const FORCED_EXIT = (C && C.FORCED_EXIT) || 'forcedExit';
  const bb = api.data?.()?.bonds?.[EGIR_BOND]?.bb ?? {};

  for (const p of battle.players) {
    const pid = p && p.playerId;
    if (pid == null || !p.bonds || typeof p.bonds !== 'object') continue;
    let members;
    try { members = S.bondActive(battle, pid, EGIR_BOND) ? S.bondMembers(battle, pid, EGIR_BOND) : null; } catch { members = null; }
    if (!members || !members.length) continue;
    if (EGIR_OPTIONS.reviveWhitelist) egirInstallReviveWhitelist(battle, bb, members);
    if (EGIR_OPTIONS.deferForcedExit) egirInstallForcedExitOrder(battle, members, FORCED_EXIT);
    if (EGIR_OPTIONS.chainThroughDown) egirInstallChainThroughDown(S, D, battle, pid, bb, members);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// (a) 协防开局时序：部署 → 吞噬 → 击倒
// ---------------------------------------------------------------------------------------------------------------------

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
function egirInstallForcedExitOrder(battle, members, FORCED_EXIT) {
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
  //   ② 它**作为标记者**发出的【吞噬】也要取消（基座：标记者不在场 ⇒ 不再产生标记）。
  const origLoseHp = battle.loseHp.bind(battle);
  battle.loseHp = (t, amount, o) => {
    if (deferring && pending.length) {
      const tags = (o && o.tags) || null;
      if (Array.isArray(tags) && tags.includes(EGIR_DEVOUR_KEY)) {
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
      if (Array.isArray(u.buffs)) u.buffs = u.buffs.filter((b) => !b || (b.key !== EGIR_DEVOUR_KEY && b.key !== EGIR_DEVOUR_FIX_KEY));
      u.hp = 0;
      try { origRetreat(u, { reason: FORCED_EXIT }); } catch { /* 静默：退场失败不该崩一局 */ }
    }
  }, { priority: -9e8 });
}

// ---------------------------------------------------------------------------------------------------------------------
// ③④ 复活名额：按官方「从左到右、从上到下」冻结前 N 名
// ---------------------------------------------------------------------------------------------------------------------

function egirInstallReviveWhitelist(battle, bb, members) {
  const max = Math.max(0, Math.floor(num(bb.max_free_respawn_cnt, 0)));
  if (!(max > 0)) return;
  const memberSet = new Set(members);
  /** 允许「立刻复活」的成员（开局冻结）。 */
  const allowed = new Set();

  const orderOf = (list) => {
    if (EGIR_OPTIONS.reviveOrder === 'board') return list.slice().sort(egirOfficialOrder);
    // 引擎 `deploySeq`（Battle.start：列主序，左→右、每列内上→下；镜像玩家左→右反向）—— 仅供对照
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

// ---------------------------------------------------------------------------------------------------------------------
// (b) 兜底：允许链路成员倒地地重算吞噬链，并补齐基座漏掉的攻击力 / 阻挡数 / 【吞噬】伤害
// ---------------------------------------------------------------------------------------------------------------------

function egirInstallChainThroughDown(S, D, battle, pid, bb, members) {
  // 记录基座**实际结算过**【吞噬】伤害的标记（(标记者, 目标) 对），用来算「它漏了哪些」
  const done = new Set();
  const mark = (m, t) => `${m && m.id}|${t && t.id}`;
  let watching = true;
  const origLoseHp = battle.loseHp.bind(battle);
  battle.loseHp = (t, amount, o) => {
    if (watching && t && o && o.source && Array.isArray(o.tags) && o.tags.includes(EGIR_DEVOUR_KEY)) done.add(mark(o.source, t));
    return origLoseHp(t, amount, o);
  };

  battle.on('battleStart', () => {
    watching = false;
    // 全都在场 ⇒ 基座的链本来完整，什么都不用做（常规战斗因此零副作用）
    if (members.every(egirOnField)) return;
    try { egirTopUpDevour(S, D, battle, pid, bb, members, done); } catch { /* 静默：修复失败不该崩一局 */ }
  }, { priority: -50 });
}

/** 按「允许链路成员倒地」重算吞噬链：补攻击力 / 阻挡数的差额，并补基座漏掉的【吞噬】伤害。 */
function egirTopUpDevour(S, D, battle, pid, bb, members, done) {
  const memberSet = new Set(members);
  // 标记者仍是「在场成员」（与基座 filter(S.onField) 一致）—— 落后者不该因为链被修好就拿到常驻加成
  const order = members.filter(egirOnField).sort(egirOfficialOrder);

  // 基座用 S.allyAt：它要求「已部署」，所以查不到 FORCED_EXIT 的倒地干员。这里换成自己找。
  const opAtTile = (r, c) => {
    for (const u of battle.allyUnits) {
      if (u.ownerId !== pid || u.kind !== 'op' || u.tileR !== r || u.tileC !== c) continue;
      if (egirOnField(u) || egirIsDown(u)) return u;
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
    // ★★ 0.2.1 注意（port-03 复核）：基座 0.1.2 用 `atkFlat`，0.2.1 改成了最终加算 `atkFinal`
    //    （`content/bonds/core.js:441 if (atk > 0) mods.atkFinal = atk;`）。下面这行仍按 1.2.0 原样读
    //    `atkFlat` ⇒ 在 0.2.1 上差额会被算成「整条链的基础攻击力之和」而**再补一份**（ATK 双计）。
    //    ⇒ 这就是本项 `enabled` 默认 false 的原因之一；回滚启用前必须先把这两处改成 `atkFinal`。
    let atk = 0, block = 0;
    for (const t of mine) { atk += num(t.base && t.base.atk, 0); block += num(t.base && t.base.blockCnt, 0); }
    const cur = typeof m.findBuff === 'function' ? m.findBuff(EGIR_DEVOUR_KEY) : null;
    const dAtk = atk - num(cur && cur.mods && cur.mods.atkFlat, 0);
    const dBlock = block - num(cur && cur.mods && cur.mods.blockCnt, 0);
    if (dAtk > 1e-9 || dBlock > 1e-9) {
      const mods = {};
      if (dAtk > 1e-9) mods.atkFlat = dAtk;
      if (dBlock > 1e-9) mods.blockCnt = dBlock;
      S.passiveBuff(battle, m, EGIR_DEVOUR_FIX_KEY, mods);
    }
    for (const t of mine) marks.push([m, t]);
  }

  // —— 【吞噬】的物理流失（`bb.damage_value`，实测 5000，走 `loseHp` = true 伤害不吃防御）：
  //    基座因为断链漏掉的那些，补给**仍在场上**的目标。
  //    （已经倒地 / 待强制退场的不补：它这一次的击倒已经判过了，二次击倒会凭空多算一次 deaths。）
  const amount = num(bb && bb.damage_value, 0);
  if (!(amount > 0)) return;
  for (const [m, t] of marks) {
    if (!t || !egirOnField(t) || !m || !m.alive) continue;
    if (done.has(`${m.id}|${t.id}`)) continue;
    done.add(`${m.id}|${t.id}`);
    S.fxOn(battle, 'devour', t, 'bond:egirShip', 'devour', { from: m.id });
    battle.loseHp(t, D.mitigate(amount, 'phys', t.s), { source: m, tags: [EGIR_DEVOUR_KEY] });
  }
}

// =====================================================================================================================
// ③ fartooth-dollswap —— 傀儡师换体 × 远牙的 <部署时> 特质（**已停用；上游 0.2.3 内建，我们的接缝已撤除**）
// =====================================================================================================================
//
// 「原来修什么」（历史记录）：远牙（`garrison_148_a/b`，`effectKey: 'ADD_BOND'`）在战斗开始时把 `garrison_108_a/b`
// 授予**同一行最右边**一名干员。`garrison_108_a/b` 的 `effectKey` 是 `act2autochess_gar_event_onstart` ⇒ 基座只挂在
// `battle.on('deploy')` 上；而傀儡师（归溟幽灵鲨 `chess_char_5_13_a` / 风丸 `chess_char_2_11_a`）的「本体 ⇄ 替身」切换在
// `server/sim/professions.js` 的 `installDollkeeper` 里只 `emit('dollSwap')`、**不** emit `deploy` ⇒ 换体不叠层。
// 服主口径（2026-10-09）：换体**应当**触发远牙的这条叠层 ⇒ 曾由本项实现。
//
// ★★ 「现在为什么停用、为什么接缝也没了」（工序 54，2026-10-10）：
//   上游 **0.2.3** 在**同一个安装器函数** `server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart`
//   里按 `gid === 'garrison_108_a' || it.gid === 'garrison_108_b'`（**同一对 garrison**）新增了**同一个**
//   `battle.on('dollSwap', …) → fireGain(battle, it)`（GitHub #415 / PR #429；7 条回归用例
//   `test/content/fartooth-doll-swap.test.js`；`docs/history/0.2.3.md` §28.5）。
//   若我们那条数据接缝（基座读特质自己的 `bb.doll_swap_deploy`）还留着，**两边会同时 fireGain ⇒ 换体叠层翻倍**。
//   ⇒ 停用本项；`data/garrisons.json` 删除；基座 `server/sim/content/garrisons/battle.js` **撤掉那段接缝**
//   （已回到与 `<官方源码参照>/v0.2.2` 对应文件**逐字节相同**，sha256 `578f1e4a…7231` ⇒ 退出我们的覆盖层）。
//
// ★ 保留下来的历史注记（当年为什么不做成通用 `deploy` 事件）：基座 `deploy` 事件的产生点一个没动，别的 `<部署时>`
//   消费者看不到换体 —— 卡西米尔盟约的「每次有干员部署时+20%」计数、叙拉古、`迅捷作战粮` / `独行` /
//   `歌利亚头盔` / `突袭手雷` / `卡西米尔竞技旗` 的部署窗口、乌尔比安式 `deploy{move}` 过滤者，以及
//   `坚固维式重锤` 按 `deploymentOf` 计的「首次受致命伤不死」窗口（换体一个 20 秒周期发生两次，
//   通用 deploy 会把这些全部加倍）。副作用清单见 <开发期报告>/22-indom-trigger-matrix.md §2。
//
// 下面这个钩子**不产生任何效果**，历史上只做「接缝是否武装」的自检。它照「上游已修的项默认不生效」的纪律保留
// （与 `installThorn2Stack` 同形状；**只有自检的提示文案改成了「接缝已撤除」**，判定条件与代码路径逐字未动），
// 但已是一条**死路径**：`enabled: false` ⇒ 第一行 `return`，一个钩子都不注册。★ 万一有人把它改成 `true`：
// 接缝已撤除 ⇒ 自检会报「接缝已撤除」，而这正是现在**正确**的状态（0.2.3 基座上由上游内建、0.2.2 基座上本就没有这条能力）。

/** 远牙 garrison_148_a/b 真正授予受益者的两条特质（原来由 `data/garrisons.json` 打旗标；该补丁已在工序 54 删除）。 */
const FARTOOTH_DOLL_SWAP_GARRISONS = ['garrison_108_a', 'garrison_108_b'];

function installFartoothDollSwap(api, battle) {
  const fix = FIX_OF['fartooth-dollswap'];
  if (!fix.enabled) return;
  const S = api.support;
  if (!S || typeof S.garrisonRecord !== 'function' || typeof S.num !== 'function') return;
  if (!battle || typeof battle.on !== 'function') return;
  let warned = false;
  battle.on('battleStart', () => {
    if (warned) return;
    warned = true;
    try {
      const armed = FARTOOTH_DOLL_SWAP_GARRISONS.some((gid) => S.num(S.garrisonRecord(gid)?.bb?.doll_swap_deploy, 0) > 0);
      if (armed) return;
      api.log?.warn?.(`[${api.id}] fartooth-dollswap：基座接缝已撤除（bb.doll_swap_deploy 不再被任何基座代码读取；上游 0.2.3 已内建同一条）`
        + ' —— 本项在 0.2.2 基座上无法生效，请保持 enabled:false；0.2.3 基座上由上游内建。');
    } catch { /* 自检失败不该影响一局 */ }
  }, { priority: -100 });
}

// =====================================================================================================================
// 入口
// =====================================================================================================================

export default function setup(api) {
  api.addInstall((battle) => { try { installThorn2Stack(battle); } catch { /* 单项失败不影响其余 */ } });
  api.addInstall((battle) => { try { installEgirBond(api, battle); } catch { /* 同上 */ } });
  api.addInstall((battle) => { try { installFartoothDollSwap(api, battle); } catch { /* 同上 */ } });
}
