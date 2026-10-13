// mods/cyanfish.announce/client/plan.js — 公告的**纯逻辑**（无 DOM、无 hostApi），可离线逐条断言。
//
// 拆出来的理由与 cyanfish.loadout-io/client/format.js 完全一样：判定逻辑一旦混进组件里，
// 就只能靠浏览器 E2E 才验得了；纯函数可以用 Node 直接跑，把"写坏的数据会怎样"穷举一遍。
//
// 三件事：
//   1. parseAnnouncements(config)  把 /data/config.json 里的 announce 段洗成可信的公告数组。
//   2. readSeen / writeSeen        玩家「看过哪些」的读写（storage 注入 ⇒ 测试里给假的）。
//   3. pickUnread / markSeen       差集与记账。
//
// ★★ 唯一的硬要求：**绝不抛**。数据写坏、storage 抛错（隐私模式 / 配额满）都必须退化成
//    "没有公告" 或 "当作没看过"，而不是把宿主页面的启动流程带崩（规范 §1.3 约束 2）。

/** 已读集在玩家浏览器里的键。约定 `sp.pref.<短名>`（同 skinvoice 的 `sp.pref.skinvoice`）。 */
export const SEEN_KEY = 'sp.pref.announce';

/** 已读集最多记多少条 id（防 localStorage 无限膨胀）。超出时丢**最旧**的。 */
export const SEEN_MAX = 500;

/** 允许的 level；不认识的 level 一律当 info（只影响边框配色，不影响显示与否）。 */
export const LEVELS = Object.freeze(['info', 'warn', 'danger']);

/** 严格模式下的字符串字段：去空白后为空 ⇒ 当作没写。 */
function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/**
 * 把一条原始记录洗成可信的公告；不合法返回 null（调用方跳过它，不算全局失败）。
 * 必填只有 `id` 与 `body` —— 没有 id 就无法记「看过没有」，没有 body 就没什么可看的。
 * @param {any} raw
 * @returns {{ id: string, title: string, body: string, date: string, level: string } | null}
 */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = text(raw.id);
  if (!id) return null;
  const body = typeof raw.body === 'string' ? raw.body : '';
  if (!body.trim()) return null;
  return {
    id,
    title: text(raw.title),
    body,
    date: text(raw.date),
    level: LEVELS.includes(raw.level) ? raw.level : 'info',
  };
}

/**
 * 从合并后的 config 里取出公告数组。
 * `announce` 缺失 / 不是对象 / `items` 不是数组 ⇒ 空列表（等于没装这个 Mod）；
 * 单条坏掉 ⇒ 只丢那一条（`dropped` 计数），其余照常；同一个 id 重复 ⇒ 只认**第一条**。
 * @param {any} config 合并后的 /data/config.json
 * @returns {{ items: Array<object>, dropped: number }}
 */
export function parseAnnouncements(config) {
  const items = [];
  const droppedIds = [];
  const seen = new Set();
  let dropped = 0;
  const section = config && typeof config === 'object' && !Array.isArray(config) ? config.announce : null;
  const list = section && typeof section === 'object' && Array.isArray(section.items) ? section.items : [];
  for (const raw of list) {
    const it = normalizeItem(raw);
    if (!it) { dropped++; continue; }
    if (seen.has(it.id)) { dropped++; droppedIds.push(it.id); continue; }
    seen.add(it.id);
    items.push(it);
  }
  return { items, dropped, droppedIds };
}

/** 正文按行拆（`\r\n` → `\n`；丢掉空行），给渲染层逐段成 <p>。 */
export function splitBody(body) {
  if (typeof body !== 'string') return [];
  return body.replace(/\r\n?/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
}

// ---- ★★ 「实时值占位符」：公告正文里**不许**把可配置的数值写死 -----------------------------------------
//
// 服主口径（issue 清单 v1.3「待修复⑨」）：控制台 / 页面上**不许**出现过时信息，例如「默认 6 人」——
// 而座位上限是**可配置的**（`config.coop.maxSeats` 接缝 + `cyanfish.max-seats` Mod 改的就是它）。
// ⇒ 公告正文里凡是要引用这类数值，写**占位符**，值在渲染时从**合并后的数据**取（宿主已有的真值来源，
//    本 Mod 不另造一份真相、也不缓存）：
//      `{seats}`   = `config.coop.maxSeats`（新房间的座位容量）
//      `{ceiling}` = `readCoop` 同一口径推出来的「房主在房内可调到的上限」
//    数据缺失 / 非法 ⇒ 整句退化成不带数字的中性话（见 `seatPhrase`），绝不显示一个猜的数。
//
// ★★ 为什么取 `{ceiling}` 要用「与宿主同一口径」的两条判据，而不是把它也读成数据键：
//   基座把「座位上限」定义成**规范化后的函数**（server/match/coop.js `readCoop`）：
//      maxSeats  = min(数据里的 maxSeats, 防呆上限 12)，非法回官方 4；
//      seatCeiling = maxSeats > 官方 4 ? 防呆上限 12 : 官方 4。
//   数据里**没有** `seatCeiling` 这个键（它就是被规范化出来的），所以这里只能按同一口径**重推**，
//   而两条判据里的两个常量（官方 4 / 防呆 12）本来就是**平台规则**（`shared/constants.js MAX_SEATS`
//   与 `server/match/coop.js SEAT_CEILING`），不是本 Mod 的自由参数。
//   ★ 这里**不**读官方值那一条：数据只写了 1~4 时宿主给的座位上限仍是官方 4 —— 那句话对玩家仍然成立。

/** 官方座位容量（`shared/constants.js MAX_SEATS`）。 */
export const OFFICIAL_SEATS = 4;
/** 座位数的防呆上限（`server/match/coop.js SEAT_CEILING`）。 */
export const SEAT_CEILING = 12;

/**
 * 从**合并后的数据**推出「新房间的座位容量」与「房主在房内可调到的上限」。
 * ★ 口径与宿主 `server/match/coop.js` 的 `readCoop` 一致：`config` 取到了（是对象）就一定有答案 ——
 *   没有 `coop` 段 / `coop` 不是对象 / `maxSeats` 非法 ⇒ 都回官方值（`readCoop` 就是这么做的）。
 *   只有**根本没取到数据**（`config` 为 null / undefined / 不是对象）才返回 null，
 *   让调用方走「不带数字的中性话」。
 * @param {any} config 合并后的 /data/config.json（可能为 null = 没取到数据）
 * @returns {{ seats: number, ceiling: number, official: boolean } | null}
 */
export function readSeatInfo(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const c = config.coop && typeof config.coop === 'object' && !Array.isArray(config.coop) ? config.coop : null;
  const raw = c ? c.maxSeats : undefined;
  // 与 readCoop 同口径：只有「≥1 的整数」才算数，其余一律回官方值（绝不把 0 夹成 1）。
  const want = Number.isInteger(raw) ? raw : OFFICIAL_SEATS;
  const seats = want >= 1 ? Math.min(want, SEAT_CEILING) : OFFICIAL_SEATS;
  return { seats, ceiling: seats > OFFICIAL_SEATS ? SEAT_CEILING : OFFICIAL_SEATS, official: seats <= OFFICIAL_SEATS };
}

/**
 * 「默认几人 / 房主能调到几人」那一句的**占位符值**。
 * 数据没取到 ⇒ 给中性话（不提任何数字）；官方配置 ⇒ 明说官方 4 且改不动。
 * @param {any} config 合并后的 /data/config.json
 * @returns {{ seats: string, ceiling: string }}
 */
export function seatPhrase(config) {
  const info = readSeatInfo(config);
  if (!info) return { seats: '由服务器设定', ceiling: '房主可在房间内调整本房间人数' };
  if (info.official) return { seats: `官方 ${info.seats} 人`, ceiling: '房主改不动人数' };
  return { seats: `默认 ${info.seats} 人`, ceiling: `房主可在房间内把本房间调到最多 ${info.ceiling} 人` };
}

/**
 * 把 `{name}` 占位符替换成渲染时求到的值。**只替换提供的键**，没给的一律保持原样
 * （缺一个参数最坏后果是"这句话里留着一个花括号"，而不是变成 `undefined`）。
 * ★ 为什么值用函数注入而不是在函数里查数据：值只在**渲染那一刻**有效
 *   （数据是异步到的，公告在装载时就解析好了）—— 见 `seatPhrase` 的调用点 `client/index.js`。
 * @param {string} body
 * @param {Record<string, string|number>} [values]
 */
export function fillParams(body, values) {
  if (typeof body !== 'string' || !body) return typeof body === 'string' ? body : '';
  const map = values && typeof values === 'object' ? values : {};
  return body.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name) =>
    (Object.hasOwn(map, name) && map[name] != null ? String(map[name]) : whole));
}

/**
 * 读已读集。任何异常（键不存在 / 坏 JSON / 不是数组 / storage 抛错）都退化成 `[]`
 * —— 最坏后果是「公告重新弹一次」，而不是页面崩。
 * @param {{ getItem?: Function } | null | undefined} storage
 * @returns {string[]}
 */
export function readSeen(storage) {
  try {
    const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(SEEN_KEY) : null;
    if (typeof raw !== 'string' || !raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => typeof x === 'string' && x);
  } catch {
    return [];
  }
}

/**
 * 写已读集（去重 + 只留最近 SEEN_MAX 条）。写不进去只返回 false，不抛
 * （隐私模式 / Safari 无痕里 localStorage 会直接抛，那种情况下公告就跟没装一样）。
 * @returns {boolean} 是否真的写成功
 */
export function writeSeen(storage, ids) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const uniq = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && x))];
    storage.setItem(SEEN_KEY, JSON.stringify(uniq.slice(-SEEN_MAX)));
    return true;
  } catch {
    return false;
  }
}

/**
 * 未读 = 配置里有、已读集里没有。
 * @param {Array<{id:string}>} items
 * @param {string[]} seenIds
 * @returns {Array<object>}
 */
export function pickUnread(items, seenIds) {
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  return (Array.isArray(items) ? items : []).filter((it) => it && !seen.has(it.id));
}

/**
 * 把这些公告记进已读集（读 → 并 → 写）。
 * ★ 只并**追加**，不清理已消失的 id —— 服主删掉再把它加回来（id 没变）时玩家不会重看，
 *   这与「按 id 记、改文案不重弹」是同一口径。
 * @returns {string[]} 记账后的完整已读集
 */
export function markSeen(storage, items) {
  const cur = readSeen(storage);
  const next = [...new Set([...cur, ...(Array.isArray(items) ? items : []).map((it) => it?.id).filter((x) => typeof x === 'string' && x)])];
  writeSeen(storage, next);
  return next;
}

/**
 * 拿一个可用的 localStorage（探测一次写入，隐私模式 / 无 storage 环境返回 null）。
 * 与 public/js/net.js 的 safeStorage 同款做法，但这里不让整个 Mod 依赖宿主内部模块。
 * @param {string} [kind] 'localStorage' | 'sessionStorage'
 */
export function defaultStorage(kind = 'localStorage') {
  try {
    const s = globalThis?.[kind];
    if (!s) return null;
    const probe = '__sp_announce_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
