// server/match/debug.js — 「控制台调试」的规则接缝（测试服专用的局内调试动作）。
// (i18n-ignore-file: 本文件只有开发者注释，没有任何界面文案)
//
// ★ 基座默认 = **关闭**：`DEBUG_DEFAULTS.enabled === false`、`actions === null`。默认情况下这条缝**没有任何能力** ——
//   没有 Mod 的服务器与官方逐值相同，`g.debug` 一律被拒（见 server/match/match/intents.js 的双重闸门）。
//
// 想开一个**只在单人 / 全 AI 房生效**的调试面板，由 Mod 在 `data/config.json` 里加一段 `debug` 提供：
//
//   { "op": "add", "path": "debug", "value": {
//       "enabled": true,
//       "actions": ["setRound", "setFunds", "grantChess", "…"],
//       "maxRound": 15,
//       "maxFunds": 999,
//       "maxLp": 99,
//       "maxLayers": 99,
//       "maxCount": 10,
//       "enemyScaleOverride": { "*": { "hpMul": 2 }, "9": { "hpMul": 3, "atkMul": 2 } }
//   } }
//
// 各键的口径：
//   * `enabled`：总开关。**必须显式写 `true`**才开；缺省 / 非布尔 ⇒ 关闭（返回冻结的 `DEBUG_DEFAULTS`）。
//   * `actions`：允许的动作名白名单。**故意采用白名单而不是黑名单** —— 数据写错 / 上游新增动作时只会「少开一个」，
//     不会「多开一个」。缺省 / 非数组 / 空数组 ⇒ `null`（一个动作都不许，但仍然 `enabled`）。
//   * `maxRound` / `maxFunds` / `maxLp` / `maxLayers` / `maxCount`：各动作的**取值范围**（防呆，不是游戏规则）。
//     缺省 / 非法 ⇒ 走 `LIMITS` 的兜底值。
//   * `enemyScaleOverride`（★ 工序 87 新增的**数据接缝本体**）：按回合的敌人属性加成覆盖，键是回合号字符串，
//     `"*"` = 所有回合；值是 `{ hpMul, atkMul, speedMul }` 的**倍率**（与官方 `config.modes[*].enemyScale` 同义，
//     不是"加多少"）。缺省 ⇒ **无覆盖** ⇒ `GameData.enemyScale(r)` 逐值等于上游 `baseEnemyScale(r)`（★ 默认路径
//     直接返回 `baseEnemyScale(r)` 算出来的那个值本身，不做乘法、不加键，见 gamedata.js）。表里写坏一个键只丢那一项，
//     不影响其它回合。
//
// ★ 闸门在**调用点**、不在本文件：本文件只回答「开没开 / 允许哪些动作 / 取值范围多大 / 有没有数据层覆盖」这一组
//   **纯数据**问题；「是不是单人房」是**对局状态**问题，由 `debugAllowed(match)` 回答（`Match.loneHuman`，见
//   server/match/Match.js）。两个条件都成立才放行 —— 这是 docs/MODS.md §4.4 施工清单第 3 条「只调读取器，
//   不要在调用点自己判非法值」的落地：非法**数据**由本文件归一化掉，非法**局面**由调用点判。
//
// ★★ 工序 115 追加的三个动作（都在 `server/match/match/intents.js` 的 `debugIntent` 里落地，白名单照旧是**数据**）：
//   | 动作 | 参数 | 落点 |
//   |---|---|---|
//   | `setEnemyAttr`  | `id` = `DEBUG_ATTRS` 的键，`value` = 千分比（0 = 还原这一项） | 每局 `GameData.debugAttrMul`（**绝对**倍率） |
//   | `setLayers`     | `id` = 盟约 id，`value` = 层数（0 = 归零）                | `ps.setLayers(...)`（`player/economy.js`，唯一写 `ps.layers` 的地方） |
//   | `setWaveList`   | `list` = `"<enemyKey>:<count>"` 数组                    | `Match.debugSetWaveList`（`match/combat.js`，改 `this.wave.spawns`） |
//   本文件只提供它们的**纯数据**帮手：`DEBUG_ATTRS` / `DEBUG_ATTR_PERMILLE` / `debugAttrEntry` / `debugWaveList`。

import { DEBUG_WAVE_MAX } from '../../shared/constants.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** `enemyScaleOverride` 认的倍率键（与 `waves.js roundMods` 的三个键同名）。 */
export const SCALE_MUL_KEYS = Object.freeze(['hpMul', 'atkMul', 'speedMul']);

/**
 * ★ 工序 115：`setEnemyAttr` 认的**属性名**（`g.debug.id`），与 `server/sim/battle/spawns.js` 的 spawn mods 一一对应。
 * 键是**面板上与读者见面的一栏**，值是它落在 spawn mods 上的那个键 —— 两者同名，只在这里集中一次，别在别处再抄一份。
 */
export const DEBUG_ATTRS = Object.freeze({
  hp: 'hpMul', atk: 'atkMul', def: 'defMul', res: 'resMul', speed: 'speedMul', aspd: 'aspdMul',
});

/**
 * ★ 工序 115：`setEnemyAttr` 的**线格式单位** —— 千分比（‰）。`2000` = ×2。
 * 用整数走线（`g.debug.value` 只收整数）⇒ 不需要改协议；下界 10（×0.01）与 `baseEnemyScale` 的夹取同量级。
 */
export const DEBUG_ATTR_PERMILLE = Object.freeze({ min: 10, max: 100000 });

/**
 * 取值范围 / 白名单长度的防呆兜底（数据写了非法值就回这里，不是游戏规则）。
 *
 * ★★ **这些值是「天花板」**：`readDebug` 用 `posIntOrNull(数据, 天花板) = Math.min(数据, 天花板)` 归一化
 *   ⇒ **天花板必须高于数据里写的值**，否则数据会被**静默夹掉**。工序 115 踩过一次：数据 `maxCount: 30`
 *   被当时的天花板 20 夹成 20 —— 面板显示 30、服务端按 20 算，输 30 会被悄悄改成 20（用户看到的
 *   "敌人数量上限 20" 就是它，而它**不是**官方限制，是我们自己的防呆）。
 *   ⇒ 数据与天花板的对应关系由 `test/match/debug-seam.test.js` 里那条 **"数据 ≤ 天花板且逐值生效"** 的单测钉住。
 */
export const DEBUG_LIMITS = Object.freeze({
  /** `maxRound` 的兜底上限：官方 `lastRound` 是 15，这里只防「数据写错把回合数设到天上」。 */
  maxRound: 100,
  /** `maxFunds` 的兜底上限。 */
  maxFunds: 1e6,
  /** `maxLp` 的兜底上限（目标生命 LP 的守卫上限）。 */
  maxLp: 999,
  /** `maxLayers` 的兜底上限（单次加层数 / 绝对设置层数；真正的天花板是 BOND_LAYER_CAP = 999，由 addLayers 自己夹）。 */
  maxLayers: 999,
  /**
   * `maxCount` 的兜底上限（一次发几个干员 / 几件装备 / 单条敌人几个人数）。
   * ★ 工序 115（1.4.1）：**20 → 200** —— 本 Mod 的数据把它写成 30（敌人页要能加到两位数），
   *   而旧天花板 20 会把 30 **静默夹掉**。200 与 `maxRound: 100`（数据 15）同一种量级：留足余量、只防"数据写坏"。
   */
  maxCount: 200,
  /** `setWaveList` 的整波敌人清单**条数**上限（线格式那一份在 `shared/constants.js DEBUG_WAVE_MAX`，这里是同一口径）。 */
  waveList: DEBUG_WAVE_MAX,
  /** `actions` 的表长上限（防呆）。 */
  actions: 64,
});

/** 官方（= 没装 Mod 的基座）取值：**关闭**，一个动作都不许，**没有任何数据层覆盖**。 */
export const DEBUG_DEFAULTS = Object.freeze({
  enabled: false,
  actions: null,
  maxRound: null,
  maxFunds: null,
  maxLp: null,
  maxLayers: null,
  maxCount: null,
  enemyScaleOverride: null,
});

const posIntOrNull = (v, cap) => (Number.isInteger(v) && v >= 1 ? Math.min(v, cap) : null);
const nonNegIntOrNull = (v, cap) => (Number.isInteger(v) && v >= 0 ? Math.min(v, cap) : null);

/**
 * 归一化一条倍率项（`{ hpMul?, atkMul?, speedMul? }`）。非法 / 缺失项**直接丢掉**（该项按 1 算），
 * 一项都不剩 ⇒ `null`（= 这一档没有覆盖）。hMul / speedMul 有下界 0.01、atkMul 有下界 0 —— 与
 * `gamedata.baseEnemyScale` 的夹取口径一致（乘上去仍然是非负的）。
 * @param {any} v
 * @returns {Readonly<{hpMul?: number, atkMul?: number, speedMul?: number}>|null}
 */
function readScaleEntry(v) {
  if (!isObj(v)) return null;
  const out = {};
  for (const k of SCALE_MUL_KEYS) {
    const n = v[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) continue;
    out[k] = k === 'atkMul' ? n : Math.max(0.01, n);
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * 归一化 `config.debug.enemyScaleOverride`：键只认 `"*"` 与 1~3 位十进制回合号。
 * @param {any} raw
 * @returns {Readonly<Record<string, object>>|null}
 */
function readScaleOverride(raw) {
  if (!isObj(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k !== '*' && !/^[0-9]{1,3}$/.test(k)) continue;
    const e = readScaleEntry(v);
    if (e) out[k] = e;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * 归一化一段合并后的 `config.debug`（缺失 / 类型写错 / 越界都回到"关闭"，绝不抛）。
 * @param {any} config 合并后的 config.json
 * @returns {{ enabled: boolean, actions: string[] | null, maxRound: number | null, maxFunds: number | null,
 *   maxLp: number | null, maxLayers: number | null, maxCount: number | null,
 *   enemyScaleOverride: Readonly<Record<string, object>> | null }}
 */
export function readDebug(config) {
  const c = isObj(config?.debug) ? config.debug : null;
  // ★ `enabled !== true` 一律关闭 —— 字符串 "true" / 1 / 缺省都不算数（绝不把一台正式服的服务器悄悄打开）。
  if (!c || c.enabled !== true) return DEBUG_DEFAULTS;
  const raw = Array.isArray(c.actions) ? c.actions : null;
  const list = raw ? raw.filter(isNonEmptyStr) : [];
  // 过滤后为空 ⇒ `null`（开了总开关但一个动作都没给），与"表缺失"同义。
  const actions = list.length ? Object.freeze(list.slice(0, DEBUG_LIMITS.actions)) : null;
  // 只有"≥1 的整数"才算数；非法 ⇒ `null` ⇒ 调用点用 DEBUG_LIMITS 的兜底值。
  const maxRound = posIntOrNull(c.maxRound, DEBUG_LIMITS.maxRound);
  const maxFunds = nonNegIntOrNull(c.maxFunds, DEBUG_LIMITS.maxFunds);
  const maxLp = posIntOrNull(c.maxLp, DEBUG_LIMITS.maxLp);
  const maxLayers = posIntOrNull(c.maxLayers, DEBUG_LIMITS.maxLayers);
  const maxCount = posIntOrNull(c.maxCount, DEBUG_LIMITS.maxCount);
  const enemyScaleOverride = readScaleOverride(c.enemyScaleOverride);
  return { enabled: true, actions, maxRound, maxFunds, maxLp, maxLayers, maxCount, enemyScaleOverride };
}

/** 这个动作名在不在白名单里（`actions` 为 `null` ⇒ 一律不在）。 */
export function debugActionAllowed(debug, action) {
  return !!debug && debug.actions !== null && debug.actions.includes(action);
}

/**
 * 「仅单人 / 全 AI 生效」的**唯一判据**：`Match.loneHuman`。
 *
 * ★ 语义（server/match/Match.js:321-327，开局时按 `this.order` 定格）：**开局时恰好 1 个真人座位**。
 *   它**同时**覆盖两件事：① 独立模拟（solo 房，恰 1 真人 0 AI）；② 同盟房**只有 1 名真人 + AI 队友**。
 *   ⇒ 它与客户端的 `m.public.players.filter(p => !p.isBot).length === 1` **同口径**（观战者不进 `players`）。
 * ★ `isBot` 不因"真人掉线被 AI 托管"改变（那是 `ps.autoplay`）⇒ 掉线托管不会把闸门关掉。
 * @param {any} match
 * @returns {boolean}
 */
export function debugAllowed(match) {
  return match?.loneHuman === true;
}

/**
 * 第 `round` 回合的**数据层敌人属性加成覆盖**：先按 `"*"`，再叠加该回合自己的那一档（逐项相乘）。
 *
 * ★ 这个函数是**纯读**：`override` 为 `null`（默认）⇒ 返回 `null` ⇒ 调用点（gamedata.js）
 *   直接把上游 `baseEnemyScale(r)` 原样返回（**不做任何乘法、不加任何键** ⇒ "默认等于上游"是结构性的）。
 * @param {Readonly<Record<string, object>>|null} override `readDebug(...).enemyScaleOverride`
 * @param {number} round
 * @returns {Readonly<{hpMul?: number, atkMul?: number, speedMul?: number}>|null}
 */
export function debugEnemyScale(override, round) {
  if (!override) return null;
  const one = override[String(round)] || null;
  const all = override['*'] || null;
  if (!all) return one;
  if (!one) return all;
  const out = { ...all };
  for (const k of Object.keys(one)) out[k] = (out[k] ?? 1) * one[k];
  return Object.freeze(out);
}

// ---- ★ 工序 115：三条新调试动作的**纯数据层**入口（归一化，绝不抛；取值范围由调用点再夹一次）------------------

/**
 * `setEnemyAttr` 的一格：属性名 + 千分比 → `{ key, mul }`；属性名不认识 / 千分比越界 ⇒ `null`。
 * ★ `permille === 0` 不是一个倍率，而是**还原这一项**这个语义 ⇒ 返回 `{ key, mul: null }`（调用点按 `mul === null` 删键）。
 * ★ **不做夹取**：越界一律 `null`（调用点回 `BAD_TARGET`）—— 与 §4.5 的反例「非法值夹到最近合法值」相反，
 *   调试动作宁可明确拒绝，也不静默换一个数换出"看起来生效了"的假象。
 * @param {any} attr `g.debug.id`（`DEBUG_ATTRS` 的键）
 * @param {any} permille `g.debug.value`（0 = 还原；否则 `DEBUG_ATTR_PERMILLE` 之内）
 * @returns {Readonly<{ key: string, mul: number|null }>|null}
 */
export function debugAttrEntry(attr, permille) {
  if (typeof attr !== 'string' || !Object.hasOwn(DEBUG_ATTRS, attr)) return null;
  if (!Number.isInteger(permille) || permille < 0) return null;
  if (permille !== 0 && (permille < DEBUG_ATTR_PERMILLE.min || permille > DEBUG_ATTR_PERMILLE.max)) return null;
  return Object.freeze({ key: DEBUG_ATTRS[attr], mul: permille === 0 ? null : permille / 1000 });
}

/**
 * `setWaveList` 的清单归一化：`["<enemyKey>:<count>", …]` → `[{ enemyKey, count }]`（**按 key 合并**、保持首次出现
 * 的顺序、`count` 夹到 `1..maxCount`、`0` 的那些条目**不进结果** = 这一条不在波里）。写坏的条目只丢它自己。
 *
 * ★ 这里是**纯数据**：敌人 key 存不存在由调用点（`this.gd.enemy(key)`）判，不在这里查数据。
 * @param {any} list `g.debug.list`
 * @param {number} maxCount 单条敌人数的上限（`config.debug.maxCount` 或 `DEBUG_LIMITS.maxCount`）
 * @returns {ReadonlyArray<{ enemyKey: string, count: number }>}
 */
export function debugWaveList(list, maxCount) {
  if (!Array.isArray(list)) return Object.freeze([]);
  const cap = Number.isInteger(maxCount) && maxCount >= 1 ? maxCount : DEBUG_LIMITS.maxCount;
  const order = [];
  const byKey = new Map();
  for (const raw of list.slice(0, DEBUG_LIMITS.waveList)) {
    if (typeof raw !== 'string') continue;
    const at = raw.lastIndexOf(':');
    if (at <= 0) continue;
    const enemyKey = raw.slice(0, at);
    const n = Number(raw.slice(at + 1));
    if (!enemyKey || enemyKey.length > 64 || !Number.isInteger(n) || n < 0) continue;
    const prev = byKey.get(enemyKey);
    const total = (prev ?? 0) + Math.min(n, cap);
    if (!byKey.has(enemyKey)) order.push(enemyKey);
    byKey.set(enemyKey, total);
  }
  const out = [];
  for (const k of order) {
    const n = Math.min(byKey.get(k), cap);
    if (n > 0) out.push(Object.freeze({ enemyKey: k, count: n }));
  }
  return Object.freeze(out);
}
