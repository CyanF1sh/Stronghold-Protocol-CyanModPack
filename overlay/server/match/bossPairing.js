// server/match/bossPairing.js — 「最终攻势（boss 回合）的队友怎么配」这条接缝。
//
// ★ 基座只认官方口径：**按座位两两配对**（`finalAssault.pairPlayers`：存活玩家按 seat 升序，
//   (1,2) (3,4) …，组内第一人是战场的 LEFT、第二人是镜像的 RIGHT）。本文件里**没有 'random' 之外的
//   任何策略、没有任何人数**；没有 Mod 数据时 `bossPairingFor()` 恒返回 `null` ⇒ 调用点走官方路径，
//   与官方**逐值相同**（test/match/boss-pairing.test.js 有全定义域证明）。
//
// 想让队友每局随机挑，由 **Mod 在 `data/config.json` 里加一段 `bossPairing`** 提供：
//
//   { "op": "add", "path": "bossPairing", "value": { "default": "random" } }
//
// ★ 为什么是**独立的顶层键**而不是塞进 `config.coop`：平台的补丁语言里 `add` **要求目标不存在**
//   （server/mods/patch.js:174），而 `cyanfish.max-seats` 已经用 `add coop` 占住了 `coop` 这个键 ——
//   第二个 Mod 再 `add coop`（或 `add coop.bossPairing`）会在**没装 max-seats 时**因"中间键不存在"而整包失败。
//   两个可以各自开关的 Mod 不能共用同一把 `add` ⇒ 本接缝自成一个顶层键（与 `coop` / `debug` / `announce` 同一种做法）。
//
// 口径（**与 `config.coop` 的表同一套规矩**，见 docs/MODS.md §4.2 / §4.4）：
//   · 表的键是**计数**、值是**策略名**；本接缝只认一个策略 `"random"`。
//   · 查表用的计数 = **boss 回合开始时的实际存活人数**（`Match.startFinalAssault` 的 `alive.length`；
//     与配对本身同一个集合 —— 配对就是在这个集合上做的）。
//   · 命中 `"random"` ⇒ 随机挑队友；**没命中 / 表缺失 / 值非法（包括写成 `"seat"`）⇒ `null` = 官方按座位配对**。
//     （非法值一律回官方，绝不抛、绝不自造第三种策略 —— §4.2 铁律 2。）
//   · 只有计数能命中、`default` 兜底；表外计数（例如 13）走 `default`。
//   · **随机不消耗本局任何既有随机流**：调用点用 `deriveSeed(matchSeed, 'bossPair:<round>')` 派生一条
//     独立的小流（`finalAssault.bossPairGroups`）⇒ 打开本接缝时，波次 / 商店 / 机变 / 机器人**逐值不动**，
//     只有"谁和谁一组"变。关掉它时更是连这一条派生流都不创建。
//
// ★ 随机化的确切语义（**队友随机、组内左右不变**）：把存活玩家列表洗一遍，再按洗后的次序两两成组，
//   然后**每组内部按 seat 升序** —— 于是"谁和谁一队"每局会变，但"组内谁是 LEFT"仍由座位决定
//   （官方同一组里座位靠前的那位守左半边）。2 人房的"队友"本来就无从选择 ⇒ 洗牌只会把左右对调，
//   这一条（组内按 seat 排序）保证它**连左右都不变**。

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const key = (n) => String(Math.max(0, Math.floor(Number(n)) || 0));

/** 官方取值的形状：没有表 ⇒ 不接管。 */
export const BOSS_PAIRING_DEFAULTS = Object.freeze({ pairing: null });

/**
 * 归一化一段合并后的 `config.bossPairing`（缺失 / 类型写错一律回到官方口径，绝不抛）。
 * @param {any} config 合并后的 config.json
 * @returns {{ pairing: any }} `pairing` = 那张计数表（对象）或 `null`
 */
export function readBossPairing(config) {
  const c = config && isObj(config.bossPairing) ? config.bossPairing : null;
  if (!c) return BOSS_PAIRING_DEFAULTS;
  return { pairing: c };
}

/**
 * 这一局该用哪种配对策略。
 * @param {number} aliveCount boss 回合开始时的**实际存活人数**
 * @param {{ pairing: any }} bp `readBossPairing` 的结果（`GameData.bossPairing`）
 * @returns {'random' | null} `'random'` = 随机挑队友；`null` = 官方按座位配对（不接管）
 */
export function bossPairingFor(aliveCount, bp) {
  const spec = bp && bp.pairing;
  if (!isObj(spec)) return null;
  const v = Object.hasOwn(spec, key(aliveCount)) ? spec[key(aliveCount)] : spec.default;
  return v === 'random' ? 'random' : null;
}
