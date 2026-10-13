// mods/cyanfish.banner/client/plan.js — 横幅的**纯逻辑**（无 DOM、无 hostApi），可离线逐条断言。
//
// 与 cyanfish.announce/client/plan.js 同一条路子：判定逻辑一旦混进组件里，就只能靠浏览器 E2E 才验得了。
// 这里把四件事拆成纯函数：
//   1. parseConfig(config)  把合并后 /data/config.json 的 `banner` 段洗成可信配置 + 条目；
//   2. parseLive(doc)       把 /mods/<id>/live.json（管理页发布的实时文档）洗成同一形状的条目；
//   3. mergeItems(a, b)     两路数据合并（同 id 时 b 赢）—— 实时发布优先于数据补丁里的常驻条目；
//   4. isActive / pickActive 按**展示时间窗**筛，并按条数上限截断。
//
// ★★ 唯一的硬要求：**绝不抛**。数据写坏、字段类型不对、时间不成对，都必须退化成「这一条不显示」，
//    而不是把宿主首页带崩（规范 §1.3 约束 2 / §6.6）。
//
// ★★ 1.1.0（工序 75）：**「持续时间」是主模型，「结束时刻」只作为老数据的兼容读取**。
//    服主口径：「横幅公告不应使用『结束时间』而是使用『持续时间』，因为临时的提醒内容一般不会持续太久。」
//    病因（测试服真机取证，`<开发期报告>/75-banner-duration.md` B 节）：`datetime-local` 选择器
//    一打开就带「现在」的日期时间 ⇒ 服主那条公告的 `to`（结束时间）= 发布的那一分钟，**落盘即过期**，
//    客户端一条都不渲染。绝对时刻这个模型有太多「一次点错就永久静默」的机会。
//    ⇒ 条目现在写 `{ from, mins }`：`from` = 开始时刻（毫秒；发布时若没填开始就是"发布那一刻"），
//      `mins` = 持续多少分钟；显示判断是 **now < from + mins * 60000**（闭区间，与旧口径逐值一致）。
//    ⇒ **老数据不变坏**：`mins` 缺失时**原样**按旧的 `to`（绝对结束时刻）判断；两条路都在 `itemWindow()` 里。
//      反向也安全：1.1.0 的管理页在写 `mins` 的同时**镜像**一份 `to = from + mins*60000`
//      ⇒ 还没升级到 1.1.0 的旧客户端（例如尚未重推的测试服）照样按同一个截止时刻到点消失。
//      ★ `mins` 一旦存在，**它赢**：`to` 只是给老客户端的镜像，改 `mins` 不用管 `to`。

/** 允许的级别；不认识的 level 一律当 info（只影响配色，不影响显示与否）。 */
export const LEVELS = Object.freeze(['info', 'warn', 'danger']);

/** 轮询间隔（秒）的默认值与夹取区间。★ 下限 5 秒：再密就是拿服务器换毫无意义的实时性。 */
export const POLL_DEFAULT = 20;
export const POLL_MIN = 5;
export const POLL_MAX = 300;

/** 同屏最多显示几条（上限，不是默认值）。 */
export const MAX_ITEMS_CEIL = 5;
export const MAX_ITEMS_DEFAULT = 3;

/** 单条正文的长度上限（横幅是一条单行带，太长只能省略号截断）。 */
export const MAX_TEXT = 200;

/**
 * 「持续时长」的上限（分钟）= 30 天，下限 = 1 分钟。
 * ★ 为什么有上限：这是「临时提醒」的字段（服主口径），一个手滑多打几位数字不该变成一条永不消失的横幅。
 *   越界**夹取**（不丢字段）—— 夹取后写回文档的就是那个夹取过的值，面板上看得见，不留暗坑。
 */
export const MINS_MIN = 1;
export const MINS_MAX = 30 * 24 * 60;

/**
 * 时间字段：接受毫秒数（管理页写的就是它），也接受可解析的日期字符串（手写数据补丁时方便）。
 * 其它一律 null = 「不限」—— 绝不猜一个时间。
 * @param {any} v
 * @returns {number|null}
 */
export function readTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v.trim());
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** 只放行 http/https（javascript: / data: 一律丢掉；渲染层还会再走一次 textContent）。 */
export function safeHref(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

/**
 * 「持续多少分钟」：接受数字，也接受纯数字字符串（手写数据补丁时方便）。
 * ★ 只收**正数**；0 / 负数 / NaN / Infinity / 看不懂的东西一律 null = 「这一端不限（不过期）」，
 *   绝不当成"立刻过期"（静默吞掉是最难查的一种坏）。
 * 越界夹到 [MINS_MIN, MINS_MAX]，并四舍五入到整分钟。
 * @param {any} v
 * @returns {number|null}
 */
export function readMins(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN);
  if (!Number.isFinite(n)) return null;
  const m = Math.round(n);
  if (m < MINS_MIN) return null;
  return m > MINS_MAX ? MINS_MAX : m;
}

/** 32 位 FNV-1a：给没写 id 的条目一个**确定性**的 id（同文本 ⇒ 同 id ⇒ 可去重、可覆盖）。 */
export function hashId(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/**
 * 把一条原始记录洗成可信的横幅；不合法返回 null（调用方跳过它，不算全局失败）。
 * 必填只有正文 —— 没有正文就没什么可展示的。
 *
 * 时间窗有**两种写法**（`itemWindow()` 决定用哪一种）：
 *   · 新：`from` + `mins`（开始时刻 + 持续多少分钟）—— 1.1.0 起管理页写的就是这一对；
 *   · 旧：`from` / `to`（开始时刻 / 结束时刻）—— 老数据照旧读，一个字节都不用改。
 * @param {any} raw
 * @returns {{id:string,text:string,level:string,from:number|null,to:number|null,mins:number|null,href:string|null}|null}
 */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = text(raw.text);
  if (!body) return null;
  const from = readTime(raw.from);
  const to = readTime(raw.to);
  const mins = readMins(raw.mins);
  // ★ 只有走**旧口径**（没有 mins）时才需要这条救火：时间段写反了（结束早于开始）⇒ 当作没写时间，
  //   而不是让这条**永远不出现**（静默吞掉更难查）。有 mins 时截止时刻由 from + mins 算，to 只是镜像。
  const bad = mins === null && from !== null && to !== null && to <= from;
  return {
    id: text(raw.id) || `auto-${hashId(body)}`,
    text: body.length > MAX_TEXT ? body.slice(0, MAX_TEXT) : body,
    level: LEVELS.includes(raw.level) ? raw.level : 'info',
    from: bad ? null : from,
    to: bad ? null : to,
    mins,
    href: safeHref(raw.href),
  };
}

/** 把一组原始条目洗成数组（坏的单条丢掉，`dropped` 计数）。 */
export function normalizeList(raw) {
  const items = [];
  let dropped = 0;
  for (const one of Array.isArray(raw) ? raw : []) {
    const it = normalizeItem(one);
    if (!it) { dropped++; continue; }
    items.push(it);
  }
  return { items, dropped };
}

/** 轮询间隔：非法 / 缺省 ⇒ 默认值；只做范围夹取（绝不把 0 夹成 5 之外的语义）。 */
export function clampPollSec(v) {
  if (!Number.isFinite(v)) return POLL_DEFAULT;
  const n = Math.round(v);
  if (n < POLL_MIN) return POLL_MIN;
  return n > POLL_MAX ? POLL_MAX : n;
}

/** 同屏条数上限：非法 / 缺省 ⇒ 默认值；范围夹取到 [1, MAX_ITEMS_CEIL]。 */
export function clampMaxItems(v) {
  if (!Number.isFinite(v)) return MAX_ITEMS_DEFAULT;
  const n = Math.round(v);
  if (n < 1) return 1;
  return n > MAX_ITEMS_CEIL ? MAX_ITEMS_CEIL : n;
}

/**
 * 读「数据补丁」那一路：合并后 config 的 `banner` 段。
 * 段缺失 / 不是对象 ⇒ `enabled: false`（等于没装这个 Mod，页面零痕迹）；
 * 单条坏掉 ⇒ 只丢那一条。
 * @param {any} config 合并后的 /data/config.json
 * @returns {{enabled:boolean,pollSec:number,maxItems:number,items:Array<object>,dropped:number}}
 */
export function parseConfig(config) {
  const off = { enabled: false, pollSec: POLL_DEFAULT, maxItems: MAX_ITEMS_DEFAULT, items: [], dropped: 0 };
  if (!config || typeof config !== 'object' || Array.isArray(config)) return off;
  const sec = config.banner;
  if (!sec || typeof sec !== 'object' || Array.isArray(sec)) return off;
  const { items, dropped } = normalizeList(sec.items);
  return {
    // 只有**显式** false 才关；写坏了（字符串 / 数字）按开处理 —— 与「非法值回官方口径」同一条口径：
    // 这里的「官方口径」就是「装上就工作」，而内容为空时本来也不显示任何东西。
    enabled: sec.enabled !== false,
    pollSec: clampPollSec(sec.pollSec),
    maxItems: clampMaxItems(sec.maxItems),
    items,
    dropped,
  };
}

/**
 * 读「实时文档」那一路：/mods/<id>/live.json（管理页写的）。
 * 坏 JSON / 形状不对 ⇒ `ok: false`（调用方保留上一份：一次网络抖动不该把横幅清空）。
 * @param {any} doc
 * @returns {{ok:boolean,items:Array<object>,dropped:number}}
 */
export function parseLive(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.items)) {
    return { ok: false, items: [], dropped: 0 };
  }
  const { items, dropped } = normalizeList(doc.items);
  return { ok: true, items, dropped };
}

/**
 * 合并两路：`live` 里同 id 的条目**覆盖** `base` 里的那条（保留 base 的位置），live 独有的追加在后面。
 * ⇒ 数据补丁可以放常驻条目、管理页可以就地改其中一条而不动其余。
 * @param {Array<object>} base
 * @param {Array<object>} live
 * @returns {Array<object>}
 */
export function mergeItems(base, live) {
  const b = Array.isArray(base) ? base.filter(Boolean) : [];
  const l = Array.isArray(live) ? live.filter(Boolean) : [];
  if (!l.length) return b.slice();
  const byId = new Map(l.map((it) => [it.id, it]));
  const out = [];
  const used = new Set();
  for (const it of b) {
    const over = byId.get(it.id);
    if (over) { out.push(over); used.add(it.id); } else out.push(it);
  }
  for (const it of l) if (!used.has(it.id)) out.push(it);
  return out;
}

/**
 * 一条横幅**实际的**展示时间窗（毫秒；`null` = 那一端不限）。
 *
 * ★ 这是"持续时间"与"结束时刻"两种写法的唯一汇合点（也是本版唯一的语义新增）：
 *   · `mins` 有值**且** `from` 有值 ⇒ `to = from + mins * 60000`（★ 服主口径：临时提醒按"持续多久"想）；
 *     同 id 的旧镜像 `to` 此时**被忽略** —— `mins` 是唯一真相，改时长不用去改 `to`。
 *   · 否则 ⇒ 原样用旧的 `from` / `to`（**老数据一个字节都不用改**，行为与 1.0.0 逐值相同）。
 *   · `mins` 有值但 `from` 缺失（手写数据补丁时的半截数据）⇒ **回落到旧口径**（= 不过期），
 *     而不是"从现在起算"：客户端没有可信的"发布时刻"，猜一个就是猜（§4.14 纪律 2：宁可不过期，不可静默消失）。
 *
 * @param {{from?:number|null,to?:number|null,mins?:number|null}} item
 * @returns {{from:number|null,to:number|null,basis:'duration'|'absolute'}}
 */
export function itemWindow(item) {
  const from = item && Number.isFinite(item.from) ? item.from : null;
  const mins = item ? readMins(item.mins) : null;
  if (from !== null && mins !== null) {
    return { from, to: from + mins * 60000, basis: 'duration' };
  }
  const to = item && Number.isFinite(item.to) ? item.to : null;
  return { from, to, basis: 'absolute' };
}

/**
 * 这一条此刻该不该显示（展示时间窗，两端都是**闭**区间 —— 与 1.0.0 的口径逐值一致）。
 * `from` / `to` 缺失 = 那一端不限；`now` 由调用方给（渲染时取一次，便于测试塞固定值）。
 * @param {{from?:number|null,to?:number|null,mins?:number|null}} item
 * @param {number} now
 */
export function isActive(item, now) {
  if (!item) return false;
  const t = Number.isFinite(now) ? now : Date.now();
  const { from, to } = itemWindow(item);
  if (from != null && t < from) return false;
  if (to != null && t > to) return false;
  return true;
}

/**
 * 当前该显示的条目（按顺序取前 `maxItems` 条）。
 * @param {Array<object>} items
 * @param {number} now
 * @param {number} maxItems
 */
export function pickActive(items, now, maxItems) {
  const cap = clampMaxItems(Number.isFinite(maxItems) ? maxItems : MAX_ITEMS_DEFAULT);
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!isActive(it, now)) continue;
    out.push(it);
    if (out.length >= cap) break;
  }
  return out;
}

/** 本 Mod 的实时文档地址（走宿主**已有**的 `/mods/` 静态挂载，不需要任何新端点）。 */
export function liveUrl(modId) {
  const id = text(modId);
  return id ? `/mods/${encodeURIComponent(id)}/live.json` : null;
}
