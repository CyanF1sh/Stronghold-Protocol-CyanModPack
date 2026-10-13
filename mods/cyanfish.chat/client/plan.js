// mods/cyanfish.chat/client/plan.js — 「对局内聊天」的**纯逻辑**（无 DOM、无 hostApi），可离线逐条断言。
//
// 与 `cyanfish.banner/client/plan.js` 同一条路子：判定逻辑一旦混进组件里，就只能靠浏览器 E2E 才验得了。
// 这里把六件事拆成纯函数：
//   1. readChatCfg(config)   把合并后 /data/config.json 的 `chat` 段洗成可信配置；
//   2. sanitizeText(v)       与服务端**同一套**文本归一化（控制字符 → 空格、零宽/双向控制字符 → 删除、
//                            空白折叠、两端去空白、空 ⇒ null）—— ★ 客户端这一份只是**体验**
//                            （别让用户敲了半天才发现会被拒），**权威仍是服务端**（server/match/chat.js）；
//   3. nameOf(state, id)     聊天行上显示谁说的 —— 名字的真值来源只有宿主已有的两三处
//                            （`room.state.spectators` / `m.public.players` / `me`），**不在帧里**；
//   4. canSend(state)        「我这会儿能不能发」——与服务端 `chatSenderAllowed()` 同口径；
//   5. 设置项归一化：readPrefs / clampSpeed / clampFont / speedToMs（把"弹幕速度"这一档变成真实时长）；
//   6. 队列与通道判据：enqueue / laneBusy / speedToMs —— 见各自注释。
//
// ★★ 唯一的硬要求：**绝不抛**。数据写坏、字段类型不对、store 还没有内容，都必须退化成「这一条不显示 /
//    输入框置灰」，而不是把宿主的对局画面带崩（规范 §1.3 约束 2 / §6.6）。
//
// ★★ 「绝不把聊天当 HTML」：本文件只产出**字符串**；渲染层（client/ui.js）把它放进 Preact 的
//    文本子节点（`html\`<span>${text}</span>\``）⇒ 浏览器按纯文本处理，**没有**任何 innerHTML 路径。

/** 弹幕在屏上的**基准**时长（毫秒）。= 设置里"标准"那一档（`speed = 1`）。 */
export const TRAVEL_BASE_MS = 9000;
/** 通道被占（有别人在等）时缩短的比例 —— 让队列吞吐追上服务端允许的流入。 */
export const TRAVEL_BUSY_MUL = 0.7;
/** 系统开了「减少动态效果」时不位移，改为原地静态短显。 */
export const TRAVEL_REDUCED_MS = 7000;
/** 弹幕层同时最多排几条（超出丢**最旧**的：聊天是瞬时的，晚到的比丢掉更让人困惑）。 */
export const QUEUE_MAX = 6;
/** 聊天记录在面板里最多保留几条（只在**本机内存**里，不发回服务器；重连不补收）。 */
export const FEED_MAX = 80;
/**
 * 键盘用户暂停/恢复滚动内容的开关。★ 与 `cyanfish.banner` **同一个键**（`p`）—— 有意为之：
 * 「把屏上滚动的东西停下来」在用户心里是**一件事**，两个 Mod 各管各的层，按一次 p 两层都停。
 */
export const HOLD_KEY = 'p';

// ---------------------------------------------------------------------------------------------------
// 设置项（本机偏好：`sp.pref.chat`；服务端那份 `config.chat` 管的是**规则**，两者互不覆盖）
// ---------------------------------------------------------------------------------------------------

/** 速度档的可写区间（1 = 标准）。设置页的分段控件就取这三档。 */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
/** 字号档（面板正文字号 = 基准 × 本值）。 */
export const FONT_MIN = 0.8;
export const FONT_MAX = 1.6;

/** 出厂偏好：**弹幕开、速度标准、字号标准、`Enter` 打开聊天** —— 与"没装这个设置项"的最小惊讶一致（面板本身照常）。 */
export const PREF_DEFAULTS = Object.freeze({
  danmaku: true,
  speed: 1,
  font: 1,
  open: true,
  openKey: 'Enter',
});

/**
 * 「打开聊天键」的可选项（**第一项 = 出厂档**）。`v` 就是 `KeyboardEvent.key` 的比对值，
 * `''` = 禁用（只用鼠标点开）。★ 只收**白名单**：写坏 / 手改 localStorage 一律回落 `Enter`。
 * ★ 用 `e.key` 而不是 `e.keyCode`：`key` 不受键盘布局 / 大小写影响（`T` 与 `t` 都命中，无需 `toLowerCase`）。
 */
export const OPEN_KEY_CHOICES = Object.freeze([
  { v: 'Enter', label: '回车' },
  { v: 't', label: 'T' },
  { v: '/', label: '/' },
  { v: '', label: '禁用' },
]);

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clampNum = (v, lo, hi, dflt) => {
  const n = finite(v);
  return n == null ? dflt : Math.min(hi, Math.max(lo, n));
};

/** 速度夹取（写坏 ⇒ 标准档）。 */
export const clampSpeed = (v) => clampNum(v, SPEED_MIN, SPEED_MAX, PREF_DEFAULTS.speed);
/** 字号夹取（写坏 ⇒ 标准档）。 */
export const clampFont = (v) => clampNum(v, FONT_MIN, FONT_MAX, PREF_DEFAULTS.font);
/** 「打开聊天键」洗值（不在白名单 ⇒ 回落 `Enter`）。 */
export const clampOpenKey = (v) => (OPEN_KEY_CHOICES.some((c) => c.v === v) ? v : PREF_DEFAULTS.openKey);

/**
 * 洗一份本机偏好（缺字段 / 写坏 ⇒ 出厂档；**绝不抛**）。
 * @param {any} raw `loadPref('chat', …)` 的返回值
 * @returns {{ danmaku: boolean, speed: number, font: number, open: boolean, openKey: string }}
 */
export function readPrefs(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    danmaku: typeof o.danmaku === 'boolean' ? o.danmaku : PREF_DEFAULTS.danmaku,
    speed: clampSpeed(o.speed),
    font: clampFont(o.font),
    open: typeof o.open === 'boolean' ? o.open : PREF_DEFAULTS.open,
    openKey: clampOpenKey(o.openKey),
  };
}

/**
 * 「弹幕速度」→ 弹幕在屏上的**时长**（毫秒）。★ 时长越短 = 飘得越快，所以是**除**。
 *
 * ★ 为什么用"时长"而不是"速度"直接驱动 CSS：正文宽度是变的（一条 60 字的和一条 2 字的），
 *   固定速度会让短句一闪而过。固定时长 ⇒ 每一条都在屏上待同样久，速度档的表达是
 *   "同一段时间里看完 vs 慢慢看"，与用户调这个旋钮时的直觉一致。
 * ★ 值域就是 `clampSpeed` 的值域 ⇒ 不需要额外的上下限夹取（曾经的 FASTEST/SLOWEST 常量是死代码）。
 *   三档的实际时长：慢（0.7）≈ 12.9 秒 · 标准（1）= 9 秒 · 快（1.5）= 6 秒。
 * @param {number} speed 1 = 标准
 * @param {number} [busyMul] 通道还有人在等时的额外比例（1 = 不等）
 * @returns {number} 毫秒
 */
export function speedToMs(speed, busyMul = 1) {
  const s = clampSpeed(speed);
  const mul = finite(busyMul) && busyMul > 0 ? busyMul : 1;
  return Math.round((TRAVEL_BASE_MS / s) * mul);
}

// ---------------------------------------------------------------------------------------------------
// 服务端配置的客户端镜像
// ---------------------------------------------------------------------------------------------------

/** 兜底上限（数据缺失时只用于**输入框的 maxLength**；服务端仍会再判一次）。 */
export const FALLBACK_MAX_LEN = 60;
export const MAX_LEN_CEIL = 120;
export const MIN_LEN_FLOOR = 4;

/**
 * 服务端长度的**客户端镜像**：码位数（一个 emoji 算 1），越界夹取。
 * ★ 与服务端 `CHAT_LIMITS.maxLen/maxLenMin` 同口径；这一份只喂给输入框。
 * @param {any} v
 * @returns {number}
 */
export function clampMaxLen(v) {
  const n = Number.isInteger(v) ? v : FALLBACK_MAX_LEN;
  if (n < MIN_LEN_FLOOR) return MIN_LEN_FLOOR;
  return n > MAX_LEN_CEIL ? MAX_LEN_CEIL : n;
}

/**
 * 读合并后 config 的 `chat` 段。段缺失 / 没开 ⇒ `enabled: false`（= 没装这个 Mod，两处插槽都不注册）。
 * @param {any} config 合并后的 /data/config.json
 * @returns {{enabled:boolean, maxLen:number, denyRooms:string[]}}
 */
export function readChatCfg(config) {
  const off = { enabled: false, maxLen: FALLBACK_MAX_LEN, denyRooms: [] };
  if (!config || typeof config !== 'object' || Array.isArray(config)) return off;
  const sec = config.chat;
  if (!sec || typeof sec !== 'object' || Array.isArray(sec)) return off;
  return {
    // ★ 只有**显式** true 才开（与服务端 `readChat` 逐字同口径）—— 写坏了按"关"处理，
    //   因为"关"是安全的那一侧（一个写坏的字段不该把一台正式服的通道打开）。
    enabled: sec.enabled === true,
    maxLen: clampMaxLen(sec.maxLen),
    denyRooms: Array.isArray(sec.denyRooms) ? sec.denyRooms.filter((x) => typeof x === 'string' && x) : [],
  };
}

/**
 * 一条正文能不能发（客户端的**体验**判据；服务端那一份才是权威）。
 * @param {any} v
 * @param {number} maxLen
 * @returns {{ ok: boolean, text: string, len: number }}
 */
export function sanitizeText(v, maxLen = FALLBACK_MAX_LEN) {
  const cap = clampMaxLen(maxLen);
  if (typeof v !== 'string' || !v) return { ok: false, text: '', len: 0 };
  // ★ 与服务端 sanitizeChatText **逐步同序**：先控制字符→空格（`a\nb` → `a b`，不是 `ab`），
  //   再删零宽/双向控制字符（**保留 ZWJ**（U+200D）—— emoji 组合序列要用它），再折叠空白、去两端。
  const flattened = v.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
  const stripped = flattened.replace(/[\u200B\u200C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
  const text = stripped.replace(/\s+/g, ' ').trim();
  const len = [...text].length;
  if (!len) return { ok: false, text: '', len: 0 };
  if (len > cap) return { ok: false, text, len };
  return { ok: true, text, len };
}

/** 输入框里最多允许几个码位（`maxLength` 属性要的是 UTF-16 单元数，所以按 2 倍给，真正的判据是 sanitizeText）。 */
export const inputMaxLength = (maxLen) => clampMaxLen(maxLen) * 2;

/**
 * 这条消息是谁说的。★ 真值来源只有宿主**已有的**几处，**不在** `m.danmaku` 帧里
 * （观战席的 stand-in 是 Object.freeze 的、没有 name；再造一份就是第二份真相）：
 *   · 自己 → `me.name`
 *   · 观战席 → `room.state.spectators`（`{ playerId, name }`）
 *   · 玩家（在座 / 已被淘汰） → `m.public.players`（`{ playerId, name }`）
 * 查不到 ⇒ 返回空串（渲染层退化成不带名字的一句，绝不显示一个猜的名字）。
 * @param {any} state 宿主 store 的快照
 * @param {string} playerId
 * @returns {string}
 */
export function nameOf(state, playerId) {
  try {
    if (!playerId) return '';
    const c = (v) => (typeof v === 'string' ? v.trim() : '');
    const me = state?.me;
    if (me && me.playerId === playerId) {
      const own = c(me.name);
      if (own) return own;
    }
    const specs = Array.isArray(state?.room?.spectators) ? state.room.spectators : [];
    for (const s of specs) if (s && s.playerId === playerId) { const n = c(s.name); if (n) return n; }
    const players = Array.isArray(state?.match?.public?.players) ? state.match.public.players : [];
    for (const p of players) if (p && p.playerId === playerId) { const n = c(p.name); if (n) return n; }
    return '';
  } catch { return ''; }
}

/**
 * 我此刻能不能发 —— 与**服务端** `chatSenderAllowed()` 同口径，且**同样只用于体验**
 * （决定输入框可不可用；真正的权限在服务端）。
 *
 * 能不能发 = 我在这局里**是个真人**：① 在座（`m.public.players` 里有我）；② 已被淘汰但还在局里；
 * ③ 拿着房间的观战席。还没进对局（没有 `m.public`）⇒ `false`（根本没有"对局内聊天"这回事）。
 * @param {any} state 宿主 store 的快照
 * @returns {{ can: boolean, why: 'seated'|'spectator'|'eliminated'|'' }}
 */
export function canSend(state) {
  try {
    const me = state?.me?.playerId;
    if (!me) return { can: false, why: '' };
    const pub = state?.match?.public;
    const specs = Array.isArray(state?.room?.spectators) ? state.room.spectators : [];
    const isSpec = specs.some((s) => s && s.playerId === me);
    // ★ 还没进对局（没有 m.public）⇒ 没有"对局内聊天"这回事（观战席也是进了局才算）。
    if (!pub) return { can: false, why: '' };
    const players = Array.isArray(pub.players) ? pub.players : [];
    const mine = players.find((p) => p && p.playerId === me);
    if (mine && mine.alive === false) return { can: true, why: 'eliminated' };
    if (mine) return { can: true, why: 'seated' };
    if (isSpec) return { can: true, why: 'spectator' };
    // ★ 不在 players 里也不在 spectators 里（例如刚进来还没定位）⇒ 不发（fail-closed）
    return { can: false, why: '' };
  } catch { return { can: false, why: '' }; }
}

/**
 * 入队（返回**新数组**，不改原数组）：超出 `max` 时丢**最旧**的一条。
 * @param {Array<object>} queue
 * @param {object} item
 * @param {number} [max]
 * @returns {Array<object>}
 */
export function enqueue(queue, item, max = QUEUE_MAX) {
  const q = Array.isArray(queue) ? queue.slice() : [];
  if (!item || typeof item !== 'object') return q;
  q.push(item);
  const cap = Number.isInteger(max) && max >= 1 ? max : QUEUE_MAX;
  while (q.length > cap) q.shift();
  return q;
}

/**
 * 把一条记录追加进聊天记录（返回**新数组**，丢最旧的）。
 * @param {Array<object>} feed
 * @param {object} item
 * @param {number} [max]
 * @returns {Array<object>}
 */
export function appendFeed(feed, item, max = FEED_MAX) {
  const list = Array.isArray(feed) ? feed.slice() : [];
  if (!item || typeof item !== 'object') return list;
  list.push(item);
  const cap = Number.isInteger(max) && max >= 1 ? max : FEED_MAX;
  while (list.length > cap) list.shift();
  return list;
}

/**
 * 入站一条消息时，把它**并入**聊天记录（返回**新数组**）：
 *   ① 先撤掉本地那条**乐观占位**（`pending === true` 且**正文相同**）—— 它已经被服务端确认了；
 *   ② 再追加这条正式记录。
 *
 * ★★ 为什么必须做成**一个**函数（真机踩到的坑，别再拆开）：原先写的是
 *   `feed = dropPending(feed, text)` 然后 `pushFeed(item)` —— 而 `pushFeed` 内部是
 *   `feed = appendFeed(feed, item)`，它**返回**新数组却没把"已经 drop 过的那个数组"接住，
 *   于是赋值回的是**drop 之前**的那一份 ⇒ `pending` 那条复活、面板里同一条消息出现**两遍**
 *   （真机实测 `feedCount=2`，见报告「真机取证」一节）。**把两步合成一步**从结构上排除这个错误。
 *
 * ★★ 为什么**不**比 `playerId`（第二版踩到的坑）：本函数只在"**这条回包是我自己发的**"
 *   （`state.js` 里先判 `mine`）时被调用 —— 既然如此，"正文相同 + 那条是我放的占位（`pending`）"
 *   就已经唯一确定是哪一条了。而 `pushPending` 写下的 `playerId` 取自 `state.me.playerId`，
 *   它在**刚进对局 / 重连之后**可能还是空的（`myId()` 返回 `''`），与回包帧里的 `playerId`
 *   对不上 ⇒ 加了这一条比较反而**永远匹配不上**，重复照旧。
 *   ⇒ 判据只用「`pending` + 正文」，**不引入第二个可能为空的字段**。
 *
 * ★ 为什么用 `pending` 标记而不是按时间戳 / 按序号：**同一个人完全可能连发两条一样的短句**，
 *   按文字匹配会误删"第二条真的"。所以只撤**标记过的那一条**（我们自己放上去的占位）。
 * @param {Array<object>} feed
 * @param {object} item 正式记录（`{ seq, playerId, text, at }`）
 * @param {number} [max]
 * @returns {Array<object>}
 */
export function reconcileIncoming(feed, item, max = FEED_MAX) {
  const list = Array.isArray(feed) ? feed.slice() : [];
  if (!item || typeof item !== 'object' || typeof item.text !== 'string') return list;
  const at = list.findIndex((m) => m && m.pending === true && m.text === item.text);
  if (at >= 0) list.splice(at, 1);
  return appendFeed(list, item, max);
}

/**
 * 撤掉一条**乐观占位**（发送被服务端拒了 / 失败时）。返回新数组。
 * @param {Array<object>} feed
 * @param {number} seq 占位那条的序号（**负数**，与入站消息的正数序号永不相撞）
 * @param {number} [max]
 * @returns {Array<object>}
 */
export function dropPending(feed, seq, max = FEED_MAX) {
  const list = Array.isArray(feed) ? feed.slice() : [];
  if (!Number.isFinite(seq)) return list;
  const kept = list.filter((m) => !(m && m.pending === true && m.seq === seq));
  const cap = Number.isInteger(max) && max >= 1 ? max : FEED_MAX;
  return kept.length > cap ? kept.slice(kept.length - cap) : kept;
}

// ---------------------------------------------------------------------------------------------------
// 通道仲裁（与「实时横幅公告」共用 `game.banners` 那条通道）
// ---------------------------------------------------------------------------------------------------
//
// 对局内**没有第二条可用通道**（真机几何：官方顶栏 0 ~ 1.0rem、官方 `.ticker` 1.0 ~ 1.34rem、盟约带从
// 1.36rem 起），所以 `cyanfish.banner`（如果这个实例装了它）与我们的聊天弹幕**共用**这一条，
// 而**绝不允许**同时压在上面。仲裁沿用工序 90 立下的契约：
//
//   ① **相位观测**：本 Mod 每 `LANE_OBSERVE_MS` 采一次「横幅那一行此刻在不在屏上」（**几何**判据 ——
//      只看 `document.querySelector('.sp-bn--game')` 是**错的**：那个根节点在 45 秒空档里也挂着，
//      行只是被 `translateX(-100vw - 100%)` 挪到屏外）。
//   ② **起跑窗口**：只在「横幅已经离屏，且我们这一轮能在它下一次起飞前跑完」时起一轮。
//   ③ **抢占**：万一还是撞上了（管理员中途发布/覆盖公告 ⇒ 横幅的指纹一变就立刻重启一轮），
//      **横幅赢**：观测到横幅在屏而我们的行也还在 ⇒ **立刻撤掉我们的行**并把它放回队列最前面。
//
// ★ 这一条**只在 `cyanfish.banner` 真的装了的时候**才有意义：没装 ⇒ `bannerRootPresent() === false`
//   ⇒ 仲裁器恒返回可起跑。所以它对本 Mod 的独立运行零成本。
// ★★ 跨 Mod 读别人的类名 `.sp-bn--game .sp-bn__row` 是**登记过的契约**（docs/MODS.md §4.12.9.2
//   的分配表里写明 `.sp-bn--game .sp-bn__row` 是跨 Mod 契约）。

/** `cyanfish.banner` 1.2.0 的单次飘过时长（毫秒）。★ 只作为**预测**的起点；实测值更大时以实测为准。 */
export const BANNER_FLIGHT_MS = 9000;
/** `cyanfish.banner` 1.2.0 的两次飘过之间的间隔（毫秒）。 */
export const BANNER_REPEAT_MS = 45000;
/** 预测用的周期（飘过 + 间隔）。 */
export const BANNER_PERIOD_MS = BANNER_FLIGHT_MS + BANNER_REPEAT_MS;
/** 观测节拍（毫秒）：既是相位分辨率，也是**抢占的最长延迟**。★ 只在 `.sp-bn--game` 存在时才读几何。 */
export const LANE_OBSERVE_MS = 120;
/** 起跑窗口的安全边距（毫秒）：宁可晚一点，也不要正好压在横幅下一次起飞的瞬间。 */
export const LANE_MARGIN_MS = 1000;
/** 观测中断的判据（毫秒）：两次采样隔得比这还久（页签被冻结 / 系统挂起）⇒ 相位作废，重新学。 */
export const LANE_STALE_MS = 2000;
/** 实测周期的合理区间（毫秒）：超出这个范围的一次"起飞→起飞"不算周期（可能中间漏看了一轮）。 */
export const BANNER_PERIOD_MIN_MS = 5000;
export const BANNER_PERIOD_MAX_MS = 600000;

/**
 * 一个新的仲裁器状态。`mountAt` 只用于「连续观测多久了」那一条兜底。
 * @param {number} [now]
 */
export function newLaneArbiter(now = 0) {
  return {
    mountAt: now,
    lastSampleAt: null,
    continuousSince: now,
    /** 最近一次观测到 `.sp-bn--game` 这个根节点存在（= 横幅 Mod 已装载**且**有活跃公告）。 */
    rootPresent: false,
    /** 横幅那一行此刻是否在屏上（几何判据）。 */
    on: false,
    /** 最近一次观测到的**起飞**时刻（`on` 由假变真）与**离屏**时刻（由真变假）。 */
    lastFlightStart: null,
    lastFlightEnd: null,
    /** 实测周期（只留最近一次合理的观测）。 */
    periodMeasured: null,
  };
}

/**
 * 用一次采样推进仲裁器（**纯函数**：返回新对象，不改入参 —— 便于离线逐条断言）。
 * 观测中断（`now - lastSampleAt > LANE_STALE_MS`）⇒ 相位全部作废（`lastFlightStart/End/on` 清空、
 * `continuousSince` 重置），但 `periodMeasured` 留着（周期是对方的属性，不会因为页签被冻结而变）。
 * @param {object} arb `newLaneArbiter()` 的形状
 * @param {{ now:number, rootPresent:boolean, busy:boolean }} sample
 */
export function laneObserve(arb, { now, rootPresent, busy } = {}) {
  const prev = arb && typeof arb === 'object' ? arb : newLaneArbiter(now);
  const t = Number.isFinite(now) ? now : 0;
  const stale = prev.lastSampleAt != null && t - prev.lastSampleAt > LANE_STALE_MS;
  const base = stale
    ? { ...prev, on: false, lastFlightStart: null, lastFlightEnd: null, continuousSince: t }
    : { ...prev };
  const wasOn = stale ? false : prev.on === true;
  const present = rootPresent === true;
  const isOn = present && busy === true;
  let lastFlightStart = base.lastFlightStart;
  let lastFlightEnd = base.lastFlightEnd;
  let periodMeasured = base.periodMeasured;
  if (isOn && !wasOn) {
    // 一次起飞：顺手实测周期（与上一次起飞之差；不合理就丢掉，宁可继续用预测值）
    if (lastFlightStart != null) {
      const d = t - lastFlightStart;
      if (d >= BANNER_PERIOD_MIN_MS && d <= BANNER_PERIOD_MAX_MS) periodMeasured = d;
    }
    lastFlightStart = t;
  }
  if (!isOn && wasOn) lastFlightEnd = t;
  // 生产者消失（横幅没有活跃公告 / 被撤下）⇒ 相位作废；周期留着（那是对方的属性）。
  if (!present) { lastFlightStart = null; lastFlightEnd = null; }
  return {
    mountAt: base.mountAt,
    lastSampleAt: t,
    continuousSince: stale ? t : base.continuousSince,
    rootPresent: present,
    on: isOn,
    lastFlightStart,
    lastFlightEnd,
    periodMeasured,
  };
}

/**
 * 官方的横幅弹幕此刻**是不是正压在**那条通道上（几何判据）。
 * @param {{left:number,right:number}|null} rect 横幅行的 `getBoundingClientRect()`
 * @param {number} vw 视口宽度
 * @returns {boolean}
 */
export function laneBusy(rect, vw) {
  if (!rect) return false;
  const w = Number.isFinite(vw) && vw > 0 ? vw : 0;
  const left = Number.isFinite(rect.left) ? rect.left : 0;
  const right = Number.isFinite(rect.right) ? rect.right : 0;
  return right > 0 && left < w;
}

/**
 * 此刻能不能起一轮（**唯一**一处起跑判据）。
 *   · 没有第二个生产者（`.sp-bn--game` 不在）⇒ 放行（这是"只装本 Mod"的路径，零延迟）；
 *   · 横幅正在屏上 ⇒ 不放行；
 *   · 已经观测到过起飞 ⇒ 要求 `now + 本轮时长 + 边距 <= 上次起飞 + 周期`；
 *   · 还没观测到过起飞（刚挂载 / 刚被抢占过）⇒ 等（保守）。★ 唯一的例外：**连续**观测超过
 *     `2 × 周期` 都没见过那次起飞 ⇒ 那个根节点其实没有在生产（组件处于中间态）⇒ 放行。
 * @param {object} arb 仲裁器状态
 * @param {number} now
 * @param {number} [ourDuration] 这一轮要占多久（毫秒；★ 由**用户的「弹幕速度」设置**决定）
 * @returns {boolean}
 */
export function canStartPass(arb, now, ourDuration = TRAVEL_BASE_MS) {
  const a = arb && typeof arb === 'object' ? arb : null;
  if (!a || a.rootPresent !== true) return true;
  if (a.on === true) return false;
  const dur = Number.isFinite(ourDuration) && ourDuration > 0 ? ourDuration : TRAVEL_BASE_MS;
  const period = Math.max(BANNER_PERIOD_MS, Number.isFinite(a.periodMeasured) ? a.periodMeasured : 0);
  const t = Number.isFinite(now) ? now : 0;
  if (a.lastFlightStart != null) {
    return t + dur + LANE_MARGIN_MS <= a.lastFlightStart + period;
  }
  if (a.continuousSince != null && t - a.continuousSince >= period * 2) return true;
  return false;
}

/**
 * 抢占：把被撤下来的那一条放回队列**最前面**（不丢），超出上限就丢**最新**的那一端。
 * @param {Array<object>} queue
 * @param {object} item
 * @param {number} [max]
 * @returns {Array<object>}
 */
export function requeue(queue, item, max = QUEUE_MAX) {
  const cap = Number.isInteger(max) && max >= 1 ? max : QUEUE_MAX;
  const q = Array.isArray(queue) ? queue.slice() : [];
  if (!item || typeof item !== 'object') return q.slice(0, cap);
  q.unshift(item);
  return q.slice(0, cap);
}

/** 供断言用：本 Mod 的样式节点 id（与 client/style.js 同值）。 */
export const STYLE_ID = 'sp-mod-cyanfish.chat-style';
