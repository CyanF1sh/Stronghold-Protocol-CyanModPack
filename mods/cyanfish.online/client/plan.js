// mods/cyanfish.online/client/plan.js — 「首页在线人数」的**纯逻辑**（无 DOM、无 hostApi），可离线逐条断言。
//
// 三件事：
//   1. parseConfig(config) 把合并后 /data/config.json 的 `online` 段洗成可信配置；
//   2. readHealth(json)    把宿主**已有的** GET /healthz 洗成一小组数字（不认识的形状 ⇒ null ⇒ 不显示）；
//   3. chipSegments(stats) 把数字变成要画的那几个「标签 + 数值」段（+ 悬浮说明的整句）。
//
// ★★ 唯一的硬要求：**绝不抛**，且**绝不猜**。字段缺失 / 类型不对 ⇒ 那个数字显示成 `—`（或者整枚胶囊
//    不渲染），绝不拿一个默认值冒充真值（服主口径「待修复⑨」：不许有过时信息）。

/** 轮询间隔（秒）的默认值与夹取区间。★ 下限 5 秒：再密就是拿服务器换毫无意义的实时性。 */
export const POLL_DEFAULT = 20;
export const POLL_MIN = 5;
export const POLL_MAX = 300;

/** 连续失败多少个周期后把读数标成「可能过时」（变暗，但不消失 —— 消失会让玩家以为服务器挂了）。 */
export const STALE_AFTER_FAILS = 3;

/** /healthz 的地址（宿主自带的只读状态接口；本 Mod 不新增、也不改写任何端点）。 */
export const HEALTH_URL = '/healthz';

function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** 轮询间隔：非法 / 缺省 ⇒ 默认值；只做范围夹取（绝不把 0 夹成"很密"）。 */
export function clampPollSec(v) {
  if (!Number.isFinite(v)) return POLL_DEFAULT;
  const n = Math.round(v);
  if (n < POLL_MIN) return POLL_MIN;
  return n > POLL_MAX ? POLL_MAX : n;
}

/**
 * 读「数据补丁」那一路：合并后 config 的 `online` 段。
 * 段缺失 / 不是对象 ⇒ `enabled: false`（等于没装这个 Mod，页面零痕迹）。
 * @param {any} config 合并后的 /data/config.json
 * @returns {{enabled:boolean,pollSec:number,showMatches:boolean,label:string}}
 */
export function parseConfig(config) {
  const off = { enabled: false, pollSec: POLL_DEFAULT, showMatches: true, label: '' };
  if (!config || typeof config !== 'object' || Array.isArray(config)) return off;
  const sec = config.online;
  if (!sec || typeof sec !== 'object' || Array.isArray(sec)) return off;
  return {
    // 只有**显式** false 才关；写坏了按开处理（与「非法值回官方口径」同一条口径：装上就工作，
    // 而读不到数据时本来也什么都不显示）。
    enabled: sec.enabled !== false,
    pollSec: clampPollSec(sec.pollSec),
    showMatches: sec.showMatches !== false,
    label: text(sec.label),
  };
}

/** 非负整数，否则 null（绝不用 0 冒充"取不到"）。 */
function count(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/**
 * 把 GET /healthz 的 JSON 洗成一组数字。
 * ★ 判据是 **`rooms` 存在且是数字** —— 那是这个接口的稳定字段，也是我们最核心的一个读数。
 *   连它都没有 ⇒ 这不是我们认识的 /healthz（老服务端 / 反代改了响应）⇒ 返回 null ⇒ 整枚胶囊不渲染。
 * @param {any} json
 * @returns {{sessions:number|null,sockets:number|null,rooms:number,matches:number|null,humans:number|null,
 *            bots:number|null,spectators:number|null,maxSeats:number|null,uptimeSec:number|null}|null}
 */
export function readHealth(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const rooms = count(json.rooms);
  if (rooms === null) return null;
  return {
    sessions: count(json.sessions),
    sockets: count(json.sockets),
    rooms,
    matches: count(json.matches),
    humans: count(json.humans),
    bots: count(json.bots),
    spectators: count(json.spectators),
    maxSeats: count(json.maxSeats),
    uptimeSec: count(json.uptimeSec),
  };
}

/** 「在线」用哪个数：优先**已握手会话数**（`sessions`），取不到才退到 WebSocket 连接数。都没有 ⇒ null。 */
export function onlineCount(stats) {
  if (!stats) return null;
  return stats.sessions != null ? stats.sessions : stats.sockets;
}

/** 数字 → 显示串：`null` 一律显示成 `—`（宁可不显示也不显示错的）。 */
export function num(v) {
  return v == null ? '—' : String(v);
}

/**
 * 要画的那几段（`{ key, label, value }`）。空数组 ⇒ 整枚胶囊不渲染。
 * 顺序固定：在线 → 房间 →（对局）。★ 「房间」用官方界面里的词：同盟就是房间（管理页的运行状态里也叫「房间」）。
 * @param {object|null} stats readHealth 的结果
 * @param {{showMatches?:boolean}} [opts]
 */
export function chipSegments(stats, opts) {
  if (!stats) return [];
  const showMatches = !opts || opts.showMatches !== false;
  const out = [];
  const online = onlineCount(stats);
  if (online != null) out.push({ key: 'online', label: '在线', value: String(online) });
  out.push({ key: 'rooms', label: '房间', value: String(stats.rooms) });
  if (showMatches && stats.matches) out.push({ key: 'matches', label: '对局', value: String(stats.matches) });
  return out;
}

/** 段数组 → 一行纯文本（测试与原生 title 都用它，保证"画出来的"和"说出来的"是同一份）。 */
export function chipText(segments) {
  return (Array.isArray(segments) ? segments : []).map((s) => `${s.label} ${s.value}`).join(' · ');
}

/**
 * 悬浮说明（原生 `title`，多行）。★ 用**同一个** stats 算出来 ⇒ 拆解与胶囊上的数字永不打架。
 * 每一行都带来源，方便服主对着 /healthz 核。
 * @param {object|null} stats
 */
export function tipText(stats) {
  if (!stats) return '';
  const lines = [
    `已连接 WebSocket ${num(stats.sockets)} · 已握手会话 ${num(stats.sessions)}`,
    `座位上的真人 ${num(stats.humans)} · AI 队友 ${num(stats.bots)} · 观战 ${num(stats.spectators)}`,
    `房间（同盟）${num(stats.rooms)} · 进行中的对局 ${num(stats.matches)}`,
    `单房间人数上限 ${num(stats.maxSeats)} · 服务器已运行 ${uptimePhrase(stats.uptimeSec)}`,
    '数据来自服务器 /healthz（本服真值），每 20 秒刷新一次',
  ];
  return lines.join('\n');
}

/** 运行时长 → 人话（取不到就说"未知"，不编）。 */
export function uptimePhrase(sec) {
  if (sec == null) return '未知';
  const s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} 天 ${h} 小时`;
  if (h) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}
