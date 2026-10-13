// server/match/coop.js — 「多人房间」的规则接缝（座位数超过官方 4 人时才用得上）。
//
// ★ 基座只认官方 4 人：**本文件里没有 6 人、没有任何倍率数字**。默认情况下每个因子恒等于 1、
//   房间容量就是 4 —— 也就是说，没有 Mod 的服务器与官方逐值相同（test/match/coop.test.js 有全定义域证明）。
//
// 想容纳更多人、并让牌库 / 领袖血池 / ban / 机变卡数跟着适配，由 **Mod 在 `data/config.json` 里加一段 `coop`** 提供：
//
//   { "op": "add", "path": "coop", "value": {
//       "maxSeats": 6,
//       "aiCap": 6,
//       "poolCopyMul": { "5": 1.25, "6": 1.5, "default": 1 },
//       "itemPoolMul": { "5": 1.25, "6": 1.5, "default": 1 },
//       "bossPoolMul": { "5": 1.5,  "6": 1.5, "default": 1 },
//       "bans":        { "5": { "core": 2, "addon": 3 },
//                        "6": { "core": 2, "addon": 3 },
//                        "default": null },
//       "draftCards":  { "5": 7, "6": 8, "7": 9, "default": null }
//   } }
//
// 四张表的键都是「计数」，但**查表用的那个计数有两类**：
//   * `poolCopyMul` / `itemPoolMul` / `bans` / `draftCards` 按**入座人数**（`Match.seatCount` = 开局时的座位数）—— 牌库、
//     **装备共享库存**、ban、机变都是开局就定格的东西（机变是**开局就在跑**的一轮，那时的人数就是座位数）。
//   * ★ `aiCap`（工序 105）是一个**标量**（不是表）：房主每按一次「添加 AI 队友」（`room.addBot`）就现读一次，
//     判据是**本房间当前已有的 AI 数**。它不进 `Match`、不随开局定格，只由 `Lobby.addBot` 一处强制。
//   * ★ `bossPoolMul` 按 **boss 回合开始时的实际存活人数**（2026-10-07 服主勘误）。
//
// ★ `itemPoolMul`（工序 101，2026-10-11）＝ **装备共享库存**（`gd.itemPoolCopies` / `SharedItemPool`）的第二层倍率。
//   官方 0.2.4 的装备库存**完全不随人数放大**（单人房 / 4 人房 / 6 人房的总份数一模一样，而干员牌库在同盟里是 2 倍）
//   ⇒ 4 人以上人均被稀释。服主口径：「可以仅大于 4 人时按照我们的扩充逻辑，将均值平衡至官方的 4 人池水平」
//   ⇒ N>4 时总库存 × N/4（人均 = 官方 4 人房人均），N≤4 时 ×1（逐值等于官方）。
//   与 `poolCopyMul` **同一套路数**：查表（数据里不写公式）、键 = 入座人数、`default: 1`、只在读点乘一次、
//   取整沿用同一个约定（`Math.round`，见 `GameData.itemPoolCopies`）。两个倍率**互不冲突、可叠加**
//   （一个管干员牌库、一个管装备库存，是两份独立的库存）。
//
// ★ 关于 `bossPoolMul` 的勘误（务必别改回去）：它**不是**按入座人数查表。正确口径 = **boss 回合时实际存活几人，
//   每人算 1 份**（1 份 = 官方单人份 = `bossHpScale.solo` 的 0.25，"one player of four"）⇒ 值 = 存活数 / 4，
//   **满编以上不封顶**。例如 6 人房只剩 3 个人活到 boss 回合 ⇒ 0.75 倍（不是按 6 座给的 1.5 倍）。
//   旧实现是一张按入座人数、值 =「战场数 ÷ 2」的表 —— 已废弃：它让"淘汰了也没关系"成立，与官方社区观察
//   （巴哈姆特 12294「聯機隊友(撤退/死掉)變少，最後boss血條也會變少」）和服主要的效果都相反。
//   官方 `bossHpScale.aliveScaling: true` 本可以做这件事，但它的 `min(alive, aliveFull = 4)` 在 4 人处封顶
//   ⇒ 超过 4 人的房间用不了；所以由本表接管，并且**直接替换** share（不叠乘），避免双重缩放。
//
// 战场数由**存活数**决定（finalAssault.pairPlayers），这与上面的倍率是两件事，不要混。
// `default` 是兜底（没列到的计数走它）；表本身缺失 ⇒ 因子 1 / ban 用模式自带值 / 卡数用官方口径。
//
// 为什么查表而不是公式：数据里不引入表达式求值（安全、可审计），且"哪个人数对应哪个倍率"一目了然；
// 将来要更多人数，加一行即可。
//
// ★ `maxSeats` 的两个用途（2026-10-07 起）：① 新房间的**默认**座位容量（语义未变）；② 它一旦被抬过官方 4，
//   房主就能在房内用 `room.setSeats` 把**这一个房间**的容量在 `1 .. SEAT_CEILING` 内自由调整。没有 Mod 时
//   `maxSeats` = 4 ⇒ 可调范围退化成 `[4,4]`（房主改不动）、协议边界也停在 4 ⇒ **基座与官方逐值相同**。
//
// ★ `aiCap`（第八个键，工序 105，2026-10-11）= **单个房间允许的 AI 队友数上限**（服主口径：AI 在服务端跑、压力大）。
//   · 它是**标量**、不是表：房主每按一次 `room.addBot`，`Lobby.addBot` 用「本房间当前 AI 数 >= aiCap」判断并**拒绝**
//     （错误码 `ERR.AI_LIMIT`，带 `detail`）。**唯一的 AI 入口就是这一个**（`server/lobby.js addBot`；`Match` 建局
//     只收 `seats`、从不造 AI，`finalAssault.pairPlayers` 只重排既有玩家）⇒ 一处强制即全覆盖。
//   · **不写这个键 ⇒ `aiCap = maxSeats`**（等价于「只受房间容量限制」= 改造前的行为）。
//     于是**不装 Mod（`coop` 段整个缺失 ⇒ `maxSeats = 4`）时 `aiCap = 4`**，而官方的 4 座房本来就最多 4 个 AI
//     ⇒ **上限恒不可达，基座与官方逐值相同**（连错误码都不可能发出）。
//   · 值必须是与 `maxSeats` 同域的正整数（1..SEAT_CEILING）；0 / 负数 / 小数 / 字符串 / 越界一律**回落到
//     `maxSeats`**（不是回落到 4、也不夹到 1 —— 与 `maxSeats` 的「非法回官方」同一套规矩，见 §4.2 铁律 2）。
//   · 用户可见的拒绝文案 = `ERR.AI_LIMIT` 的 `ERR_TEXT`（`shared/constants.js`），**不带数字**；精确到
//     「几个 / 上限几个」的说明走同帧的 `detail`（开发者信息，`server/net.js errorMsg` 截到 120 字）。
//   · 与座位容量的关系：`aiCap` 永远不可能让房间装下超过 `maxSeats` 个座（座位数才是硬上限）；
//     `aiCap > maxSeats` 时多余的额度只是不可达（真值见 `Lobby.addBot` 里的 `Math.min`）。
//
// ★ `draftCards`（第四张表，2026-10-07 加）：机变（悬赏决策 / 道具补给 / 机密商店 / 战术决策）某一轮**发几张卡**。
//   官方 4 人是 6 张（`choices.format.multi.cards`，也写死在 `schedule[*].rounds[*].cards`），solo 3 张。
//   人多以后"每人仍要拿走一张"，6 张会不够分 ⇒ 这张表按入座人数给出**总数**（不是增量）。
//   命中 ⇒ 覆盖官方口径（也覆盖 schedule 里写的值）；没命中 / 表缺失 ⇒ 官方原值（≤4 人因此逐值不变）。
//   各家族各自尽力填满这个数：悬赏/战术/补给天然可填满，机密商店按官方槽位循环补齐（见 choices.js）。

import { MAX_DRAFT_CARDS, MAX_SEATS } from '../../shared/constants.js';

/** 座位数防呆上限：只防「数据写错把服务器拖垮」，不是游戏规则。 */
export const SEAT_CEILING = 12;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const intOr = (v, d) => (Number.isInteger(v) ? v : d);
const key = (n) => String(Math.max(0, Math.floor(Number(n)) || 0));

/** 官方 4 人时的取值：全是「不缩放、不开」。 */
export const COOP_DEFAULTS = Object.freeze({
  maxSeats: 4,
  /** 房主在房内可调的座位**上限**；没装 Mod（数据没抬高 `maxSeats`）时恒 = 官方 4 ⇒ 房主改不动容量。 */
  seatCeiling: MAX_SEATS,
  /**
   * ★ 单房 AI 队友数上限（工序 105）。`null` = 数据没写这个键 ⇒ **按 `maxSeats` 兜**（= 只受房间容量限制，
   * 也就是改造前的行为；不装 Mod 时 = 官方 4，而 4 座房最多 4 个 AI ⇒ 上限不可达）。
   */
  aiCap: null,
  poolCopyMul: null,
  itemPoolMul: null,
  bossPoolMul: null,
  bans: null,
  draftCards: null,
});

/**
 * 归一化一段合并后的 `config.coop`（缺失 / 类型写错 / 越界都回到官方值，绝不抛）。
 * @param {any} config 合并后的 config.json
 * @returns {{ maxSeats: number, seatCeiling: number, aiCap: number, poolCopyMul: any, itemPoolMul: any, bossPoolMul: any, bans: any, draftCards: any }}
 */
export function readCoop(config) {
  const c = isObj(config?.coop) ? config.coop : null;
  if (!c) {
    // ★ 缺 `coop` 段（= 不装 Mod 的基座）⇒ 返回**归一化后的形状**：逐键等于 `COOP_DEFAULTS`，但 `aiCap`
    //   落成 `maxSeats`（= 官方 4）。返回 `COOP_DEFAULTS` 本身会让"没有表"的路径拿到 `aiCap: null` 这个哨兵
    //   ⇒ 与「写了 coop 段但没写 aiCap」两条路径形状不一致，调用点（Lobby / index.js）就得各自兜一次。
    //   只在此处兜一次，`COOP_DEFAULTS.aiCap = null` 仍然只是"数据里没写"的标记。
    return { ...COOP_DEFAULTS, aiCap: COOP_DEFAULTS.maxSeats };
  }
  // 只有"≥1 的整数"才算数：0 / 负数 / 小数 / 字符串一律退回官方值。
  // （不能把 0 夹成 1 —— 那会把一台写错数据的服务器悄悄变成单人房，比退回官方更糟。）
  const want = intOr(c.maxSeats, COOP_DEFAULTS.maxSeats);
  const maxSeats = want >= 1 ? Math.min(want, SEAT_CEILING) : COOP_DEFAULTS.maxSeats;
  // ★ 单房 AI 上限（第八个键）：与 maxSeats 同域的正整数才算数；非法 / 缺键 ⇒ 回落到 maxSeats。
  //   注意「缺键 ⇒ maxSeats」是本工序的**等价性基石**：官方 4 座房永远够不到 4 个 AI 以外的数。
  const capWant = intOr(c.aiCap, null);
  const aiCap = capWant != null && capWant >= 1 ? Math.min(capWant, SEAT_CEILING) : maxSeats;
  return {
    maxSeats,
    // ★ 房主在房内可调的座位上限（room.setSeats）。**数据没把 maxSeats 抬过官方 4 时恒 = 4** ⇒
    //   不装 Mod 的服务器上房主改不动容量，基座行为与官方逐值相同；抬高了才放开到防呆上限 SEAT_CEILING。
    //   （座位**下限**同理：上限被抬高时放开到 1，否则恒 = 官方 4 —— 见 server/lobby.js 的 Room.seatMin。）
    seatCeiling: maxSeats > MAX_SEATS ? SEAT_CEILING : MAX_SEATS,
    aiCap,
    poolCopyMul: isObj(c.poolCopyMul) ? c.poolCopyMul : null,
    itemPoolMul: isObj(c.itemPoolMul) ? c.itemPoolMul : null,
    bossPoolMul: isObj(c.bossPoolMul) ? c.bossPoolMul : null,
    bans: isObj(c.bans) ? c.bans : null,
    draftCards: isObj(c.draftCards) ? c.draftCards : null,
  };
}

/** 在 `{ "<计数>": 值, "default": 值 }` 这类计数表里查 `n`；查不到或不是有限数就返回 `dflt`。 */
function tableGet(spec, n, dflt) {
  if (!isObj(spec)) return dflt;
  const k = key(n);
  const v = Object.hasOwn(spec, k) ? spec[k] : spec.default;
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** 共享干员池（牌库）每档份数的倍率，按**入座人数**。默认 1。 */
export function poolCopyMulFor(players, coop) {
  return tableGet(coop?.poolCopyMul, players, 1);
}

/**
 * 共享**装备库存**（`gd.itemPoolCopies` / `SharedItemPool`）每件份数的倍率，按**入座人数**（与 `poolCopyMul` 同口径、
 * 同取整约定）。默认 1 ⇒ **不装 Mod（或没列到的人数）与官方逐值相同**。
 *
 * 官方 0.2.4 的装备共享库存是与人数无关的一个固定份数表（`economy.itemPoolCopies` + 逐件 `…Overrides`）：单人房与
 * 4 人房拿到同样的总份数 ⇒ 4 人以上人均被稀释。本表把 >4 人的总库存按 `人数 ÷ 4` 放大，使**人均回到官方 4 人房水平**；
 * ≤4 人靠 `default: 1` 兜住（表里不写 1..4），因此逐值等于官方。
 * @param {number} players 入座人数（`Match.seatCount`）
 * @param {any} coop 合并后的 `config.coop`
 */
export function itemPoolMulFor(players, coop) {
  return tableGet(coop?.itemPoolMul, players, 1);
}

/**
 * 共享领袖血池的倍率，按 **boss 回合开始时的实际存活人数**（`Match._startBossRound` 里的 `alive.length`）。
 *
 * ★ **表缺失（基座默认）⇒ `null` =「不接管」** ⇒ 调用点走官方 `bossPoolShare`：血池 = `bloodPoint`，与存活人数无关
 *   （官方口径「敌方领袖的总生命值不变」）。
 * ★ 表里的键是**存活人数**、值 =「相对官方 4 人满编的倍数」：每人算 1 份，而 1 份 = 官方单人份
 *   （`bossHpScale.solo` = 0.25 = "one player of four"，`[ASSUMED]`）⇒ 4 人全活 = 1、6 人全活 = 1.5、
 *   6 人房只剩 3 人活着 = 0.75。**满编以上不封顶**（官方 `min(alive, aliveFull)` 只到 4，装了这个 Mod 的房间能到 12）。
 *   ★ 注意与 `poolCopyMul` 的区别：那张表按**入座人数**（开局定格），这张按**存活人数**（boss 回合开局那一下）。
 * ★ 非法值（0 / 负 / 小数 / 字符串 / 没列到且 `default` 不是正数）一律 ⇒ `null`（回官方），
 *   **绝不发出一个 0 倍血池**（那等于 boss 一出场就死）。
 * @param {number} aliveCount boss 回合开始时的存活人数
 * @param {any} coop 合并后的 `config.coop`
 * @returns {number | null} 倍率；`null` = 不接管，用官方口径
 */
export function bossPoolMulFor(aliveCount, coop) {
  const v = tableGet(coop?.bossPoolMul, aliveCount, null);
  return typeof v === 'number' && v > 0 ? v : null;
}

/**
 * 本局禁用的盟约数量 `{ core, addon }`（core = 阵营盟约，addon = 其余）。`null` ⇒ 用模式自带值。
 * @returns {{ core: number, addon: number } | null}
 */
export function coopBansFor(players, coop) {
  const spec = coop?.bans;
  if (!isObj(spec)) return null;
  const raw = Object.hasOwn(spec, key(players)) ? spec[key(players)] : spec.default;
  if (!isObj(raw)) return null;
  const core = intOr(raw.core, null);
  const addon = intOr(raw.addon, null);
  if (core == null || addon == null || core < 0 || addon < 0) return null;
  return { core, addon };
}

/**
 * 机变某一轮该发几张卡，按**入座人数**。`null` ⇒ 用官方口径（`schedule[*].rounds[*].cards`，缺省 6 / solo 3）。
 * `null` 的三种来源：没有 `draftCards` 表、这个计数没列到且 `default` 不是正整数、表里写了非法值（0 / 小数 / 字符串）。
 * 命中时夹进 `1..MAX_DRAFT_CARDS`（防呆，与 SEAT_CEILING 同性质）。
 * @returns {number | null}
 */
export function draftCardCountFor(players, coop) {
  const spec = coop?.draftCards;
  if (!isObj(spec)) return null;
  const v = Object.hasOwn(spec, key(players)) ? spec[key(players)] : spec.default;
  return Number.isInteger(v) && v > 0 ? Math.min(v, MAX_DRAFT_CARDS) : null;
}
