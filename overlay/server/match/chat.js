// server/match/chat.js — 对局内聊天 / 弹幕的规则接缝（`cyanfish.chat`）。
// (i18n-ignore-file: 本文件只有开发者注释，没有任何界面文案)
//
// ★★ 基座默认 = **关闭**：`CHAT_DEFAULTS.enabled === false`。默认情况下这条缝**没有任何能力** ——
//    没装 Mod 的服务器与官方逐值相同（`g.danmaku` 一律被拒，见 server/match/match/intents.js 的 `chat()`）。
//
// 想让对局里的人能聊天，由 Mod 在 `data/config.json` 里加一段 `chat` 提供：
//
//   { "op": "add", "path": "chat", "value": {
//       "enabled": true,
//       "maxLen": 60,
//       "cooldownMs": 2000,
//       "burst": 5,
//       "burstWindowMs": 20000,
//       "roomBurst": 12,
//       "roomWindowMs": 30000,
//       "denyRooms": [],
//       "blockWords": []
//   } }
//
// 各键的口径（★ 全部由**服务端**强制；客户端的长度上限 / 计数只是体验）：
//   * `enabled`：总开关（**管理员口径的"全局关闭"**）。**必须显式写 `true`** 才开；缺省 / 非布尔 ⇒ 关闭。
//     关掉它（或卸载本 Mod）⇒ `g.danmaku` 一律被拒、客户端不注册任何节点、DOM 与上游逐字节相同。
//   * `maxLen`：单条正文的**码位**数上限（不是 UTF-16 单元数 —— 一个 emoji 算 1）。
//     夹到 [`CHAT_LIMITS.maxLenMin`, `CHAT_LIMITS.maxLen`]。★ 协议层另有一条**结构上限**
//     （`shared/protocol.js` 的 `DANMAKU_MAX_LEN` = 120 个 UTF-16 单元）：先过结构、再过语义。
//   * `cooldownMs`：同一名发送者两条之间的最小间隔（毫秒）。夹到 [`minCooldownMs`, `maxCooldownMs`]。
//   * `burst` + `burstWindowMs`：同一名发送者的**滑动窗口突发上限**（窗口内最多 `burst` 条）。
//   * `roomBurst` + `roomWindowMs`：**整间房**的滑动窗口上限（所有人合起来）——
//     它是"两个人一起刷"时的第二道闸，也把客户端的排队压力封了顶。
//   * `denyRooms`：**按房间关闭**：房间码字符串，命中即整间拒绝。
//   * `blockWords`：**关键词屏蔽**（默认 `[]` = 不过滤）。命中的正文**整条拒绝**（不静默替换字符 ——
//     静默改写会让服主以为自己看错了）。
//
// ★★ 谁能发（本接缝的口径）：**对局里的真人** —— 在座玩家（含房主）、已被淘汰但仍在局的玩家、
//    以及观战席。`chatSenderAllowed(ps)` 只排掉三类：AI（`isBot`）、已经离开的人（`left`）、
//    以及不属于这局的人（没有 `playerId`）。**这不改官方任何行为**：整条缝在缺配置时是关的，
//    官方（不装 Mod）连这条路都没有。
//
// ★★ 为什么"默认等于上游"是**结构性**的：本文件只做**纯数据**归一化。`enabled !== true` ⇒ 返回冻结的
//    `CHAT_DEFAULTS`（`enabled: false`）⇒ 调用点在**读到配置之后就返回**，一条消息都发不出去。
//    没有任何一条路径会在缺配置时给出发送能力（fail-closed）。
//
// ★★ 不做持久化：本文件与调用点都**不写盘、不进存档、不进 m.public / m.result**。
//    聊天是**瞬时**的（广播一次就结束）；断线重连的人不会补收、中途进来的人也不会看到历史。

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 归一化的**防呆**上下界（数据写错就夹回这里；这不是游戏规则，也不改变任何官方数值）。 */
export const CHAT_LIMITS = Object.freeze({
  /** `maxLen` 的上界：与协议层的结构上限 `DANMAKU_MAX_LEN` **同值**（语义上限不许超过结构上限）。 */
  maxLen: 120,
  /** `maxLen` 的下界：再短就不是一句话了（数据写 0 / 负数 ⇒ 夹到这里，而不是"全部拒绝"）。 */
  maxLenMin: 4,
  /** 同一发送者两条之间的最小间隔（毫秒）的下界：再小就等于没有限制。 */
  minCooldownMs: 300,
  maxCooldownMs: 60000,
  minBurst: 1,
  maxBurst: 20,
  minBurstWindowMs: 1000,
  maxBurstWindowMs: 300000,
  minRoomBurst: 1,
  maxRoomBurst: 200,
  minRoomWindowMs: 1000,
  maxRoomWindowMs: 300000,
  /** `denyRooms` / `blockWords` 的表长上限（防呆）。 */
  denyRooms: 64,
  blockWords: 64,
  /** 单条屏蔽词的长度上限（防呆）。 */
  blockWordLen: 32,
});

/**
 * 打开了总开关、但某个数字**写坏 / 缺省**时用的兜底档（★ 是"安全的那一档"，不是"没有限制"）。
 * 与 `mods/cyanfish.chat/data/config.json` 出厂值**同值** —— 换一处必须换两处，测试会盯住。
 */
export const CHAT_FALLBACK = Object.freeze({
  maxLen: 60,
  cooldownMs: 2000,
  burst: 5,
  burstWindowMs: 20000,
  roomBurst: 12,
  roomWindowMs: 30000,
});

/** 官方（= 没装 Mod 的基座）取值：**关闭**，没有任何能力。 */
export const CHAT_DEFAULTS = Object.freeze({
  enabled: false,
  maxLen: null,
  cooldownMs: null,
  burst: null,
  burstWindowMs: null,
  roomBurst: null,
  roomWindowMs: null,
  denyRooms: null,
  blockWords: null,
});

/**
 * 允许发送的**唯一判据**：这局里的**真人**。
 *
 * ★ 为什么把在座玩家也放进来（本接缝的口径，与上一版"只有观战者能发"的弹幕接缝**有意不同**）：
 *   服主这次要的是「**全房玩家双向聊天**」—— 一个聊天频道如果只让看客说话、把正在打的人排除在外，
 *   它是"弹幕"而不是"聊天"。在座玩家已有的官方表情（`g.emote`）是**另一件事**（短、无正文、有官方
 *   轮盘约束），不构成重复。
 * ★ 仍然排掉 AI：机器人没有"想说话"这回事，放它进来只会造垃圾消息（而且 `g.*` 里 AI 从不发消息）。
 * ★ 仍然要求 `playerId`：不属于这局的人（没有座位也没有观战席）不该能往这局的频道里写。
 * ★ 客户端那一条同口径的副本在 `mods/cyanfish.chat/client/plan.js` 的 `canSend()`，**只用于体验**
 *   （决定输入框可不可用）；权限的权威永远是这里。
 * @param {any} ps 发起这条消息的 PlayerState（或观战席的 stand-in）
 * @returns {boolean}
 */
export function chatSenderAllowed(ps) {
  if (!ps || ps.isBot || ps.left) return false;
  return typeof ps.playerId === 'string' && ps.playerId.length > 0;
}

/**
 * 把一条原始正文洗成**可以广播的纯文本**；空 / 全是空白 / 全是控制字符 ⇒ `null`。
 *
 * ★★ 这是本接缝的**唯一**一处文本处理，也是"绝不把聊天当 HTML"的第一步：
 *   客户端只把结果塞进 `textContent` 语义的文本节点（Preact 的 `${'…'}`），**任何**路径都不经过
 *   `innerHTML` / `dangerouslySetInnerHTML`。所以即使正文里有 `<script>` / `<img onerror=…>`，
 *   它也只是**字面的字符**。
 *
 * 处理顺序（每一条都有理由）：
 *   ① `Cc`（C0/C1 控制字符）与 DEL 一律换成**空格** —— 换行 / 回车 / 制表符不能把一条消息变成多行，
 *      也不能在 DOM 里制造"看起来是两条"的假象。**先换空格再折叠**，是为了让 `a\nb` 变成 `a b`
 *      而不是 `ab`（后者会悄悄改词）。
 *   ② 零宽与双向控制字符（U+200B–U+200F / U+202A–U+202E / U+2066–U+2069 / U+FEFF）**直接删除** ——
 *      它们是"看不见的字符"，既能用来伪造长度，也能用来把一行字倒着显示。★ 保留 ZWJ（U+200D）：
 *      它是 emoji 组合序列的一部分（家庭 / 职业类 emoji），删掉会把一个 emoji 拆成好几个。
 *   ③ 连续空白折叠成一个空格 + 两端去空白。
 *   ④ 结果为空 ⇒ `null`（**纯空白一律拒绝**，而不是发一条空消息）。
 * @param {any} v
 * @returns {string|null}
 */
export function sanitizeChatText(v) {
  if (typeof v !== 'string' || !v) return null;
  const flattened = v.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
  const stripped = flattened.replace(/[\u200B\u200C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  return collapsed ? collapsed : null;
}

/** 一段文本的**码位**数（一个 emoji = 1，与 `maxLen` 的口径一致）。 */
export function chatLength(text) {
  return typeof text === 'string' ? [...text].length : 0;
}

/**
 * 命中任意一个屏蔽词 ⇒ 返回那个词（调用点只回一个"被拒"，**不回显**是哪个词：回显等于告诉对方
 * 怎么绕过）。词表为空 / 非法 ⇒ 永远 `null`（= 不过滤，这是默认）。
 * @param {string} text 已 sanitize 的正文
 * @param {string[]|null} words
 * @returns {string|null}
 */
export function chatBlocked(text, words) {
  if (typeof text !== 'string' || !Array.isArray(words) || !words.length) return null;
  const low = text.toLowerCase();
  for (const w of words) {
    if (typeof w === 'string' && w && low.includes(w.toLowerCase())) return w;
  }
  return null;
}

const intIn = (v, lo, hi) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : null);
const strList = (v, maxItems, maxLen) => {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const one of v) {
    if (typeof one !== 'string') continue;
    const s = one.trim();
    if (!s || s.length > maxLen) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out.length ? Object.freeze(out) : null;
};

/**
 * 归一化一段合并后的 `config.chat`（缺失 / 类型写错 / 越界都回到"关闭"，绝不抛）。
 * @param {any} config 合并后的 config.json（`this.gd.config`）
 * @returns {{ enabled: boolean, maxLen: number|null, cooldownMs: number|null, burst: number|null,
 *   burstWindowMs: number|null, roomBurst: number|null, roomWindowMs: number|null,
 *   denyRooms: readonly string[]|null, blockWords: readonly string[]|null }}
 */
export function readChat(config) {
  const c = isObj(config?.chat) ? config.chat : null;
  // ★ `enabled !== true` 一律关闭 —— 字符串 "true" / 1 / 缺省都不算数（绝不把一台正式服的服务器悄悄打开）。
  if (!c || c.enabled !== true) return CHAT_DEFAULTS;
  const L = CHAT_LIMITS;
  const F = CHAT_FALLBACK;
  return {
    enabled: true,
    // 非法 ⇒ 兜底档（不是 null）：开了总开关却写坏一个数字，退回的是**安全的那一档**，不是"没有限制"。
    maxLen: intIn(c.maxLen, L.maxLenMin, L.maxLen) ?? F.maxLen,
    cooldownMs: intIn(c.cooldownMs, L.minCooldownMs, L.maxCooldownMs) ?? F.cooldownMs,
    burst: intIn(c.burst, L.minBurst, L.maxBurst) ?? F.burst,
    burstWindowMs: intIn(c.burstWindowMs, L.minBurstWindowMs, L.maxBurstWindowMs) ?? F.burstWindowMs,
    roomBurst: intIn(c.roomBurst, L.minRoomBurst, L.maxRoomBurst) ?? F.roomBurst,
    roomWindowMs: intIn(c.roomWindowMs, L.minRoomWindowMs, L.maxRoomWindowMs) ?? F.roomWindowMs,
    denyRooms: strList(c.denyRooms, L.denyRooms, 16),
    blockWords: strList(c.blockWords, L.blockWords, L.blockWordLen),
  };
}

/**
 * 滑动窗口计数：把 `times` 里落在 `[now - windowMs, now]` 之外的时间戳丢掉，返回还剩几条。
 * ★ 纯函数（不改 `times`）：调用点自己决定要不要 `push` —— 只有**接受**的那一条才记时间。
 * @param {number[]} times
 * @param {number} now
 * @param {number} windowMs
 * @returns {number}
 */
export function windowCount(times, now, windowMs) {
  if (!Array.isArray(times) || !times.length) return 0;
  let n = 0;
  for (const t of times) if (Number.isFinite(t) && now - t < windowMs) n++;
  return n;
}

/** 就地裁到窗口内（顺手给 Map 里的数组做 GC；返回同一个数组，便于调用点继续 push）。 */
export function pruneWindow(times, now, windowMs) {
  if (!Array.isArray(times) || !times.length) return times || [];
  let i = 0;
  while (i < times.length && now - times[i] >= windowMs) i++;
  if (i > 0) times.splice(0, i);
  return times;
}
