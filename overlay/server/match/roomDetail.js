// server/match/roomDetail.js — 管理员只读的「房间 / 在线人数」明细快照（工序 69）。
// (i18n-ignore-file: 管理端运营快照（服主看的读数），不是任何游戏界面文案 — docs/I18N.md / docs/MODS.md §4.12.3)
//
// 为什么要有它（服主口径）：服主要能回答「**什么时候好推横幅公告、什么时候好推更新**」——
// 那需要**每个房间**的创建时间、是否已开局、对局开始时间、回合与阶段、座位 / 真人 / AI / 观战，
// 以及每个人的在座状态；`/healthz` 只有 `rooms/matches/humans/bots/spectators` 五个计数，回答不了。
// 这些字段只存在于**运行中的** Room / Match 实例上（`server/lobby.js`）⇒ 本模块把它们读成一份快照。
//
// 四条硬约束：
//   1. **单一真相**：只读 `lobby.rooms` 里的真对象；汇总直接取 `lobby.stats()`（⇒ 与 `/healthz` 逐值相同），
//      每个房间的那几个计数是同一个判据的逐房间拆解。**绝不另存一份、绝不另算一份**。
//   2. **拿不到就写 null**（或整段 `null`）—— 面板显示「不可得」，绝不拿默认值冒充真值（§4.12.2 四）。
//   3. **绝不抛**：这是给管理页轮询的只读快照，任何一个半死的对局都不许把整份响应打成 500
//      （逐房间 try/catch：坏掉的那个房间降级成 `{ code, error }`，其余照常）。
//   4. **不新增敏感面**：没有绝对路径、没有令牌、没有 IP / 来源地址。玩家 ID 与昵称是本接口**唯一**的
//      敏感内容 ⇒ 它只能挂在 `server/admin.js` 的 `/admin/api/*` 后面（需 `SP_ADMIN_TOKEN`）。
//
// 与 playerId 有关的取舍：**服务端回真实 id**（服主要拿它去核对是谁），脱敏只发生在**报告 / 截图**那一侧。

import { PHASE_NAMES } from '../../shared/constants.js';

/** 数字或 null（绝不用 0 冒充"取不到"）。 */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** 非空字符串或 null。 */
const str = (v) => (typeof v === 'string' && v ? v : null);
/** 两个时间戳之间的秒数（取不到任一端 ⇒ null）。 */
const secBetween = (from, nowMs) => (from == null ? null : Math.max(0, Math.round((nowMs - from) / 1000)));

/**
 * 一个座位 / 一个玩家的一行。
 * @param {any} s 座位对象（Room.seats[i] 或 Match.players 的 PlayerState）
 * @param {number} fallbackSeat
 */
function personRow(s, fallbackSeat) {
  return {
    seat: Number.isInteger(s.seat) ? s.seat : fallbackSeat,
    playerId: str(s.playerId),
    name: str(s.name),
    isBot: s.isBot === true,
    // 「在座」的判据与 lobby.stats() 同一条：`connected && !left`（`left` = 已离场，座位等本条对局结束才释放）
    connected: s.connected === true && s.left !== true,
    left: s.left === true,
    // 只有 PlayerState 有 `alive`（房间等待室里的座位对象没有 ⇒ null，不编）
    alive: typeof s.alive === 'boolean' ? s.alive : null,
    // 只有房间等待室里的座位对象有 `ready`（对局里的 PlayerState 没有 ⇒ null）
    ready: typeof s.ready === 'boolean' ? s.ready : null,
  };
}

/**
 * 一个正在跑的对局的明细。`m` 是 Match 实例（server/match/Match.js）。
 * ★ 只读已知的公开字段；每个字段各自判存在，缺了就是 null。
 */
function matchRow(m, nowMs) {
  const players = [];
  const seen = new Set();
  const push = (ps, i) => {
    const id = str(ps && ps.playerId);
    if (!id || seen.has(id)) return;
    seen.add(id);
    players.push(personRow(ps, i));
  };
  // `m.order` 是按座位排好的 PlayerState 数组（Match 的构造里定的）；取不到就退回 players 的插入序。
  const ordered = Array.isArray(m.order) && m.order.length ? m.order : [...(m.players?.values?.() ?? [])];
  ordered.forEach((ps, i) => push(ps, i));

  const spectators = [];
  for (const sp of m.spectators?.values?.() ?? []) {
    spectators.push({
      playerId: str(sp.playerId),
      connected: sp.connected === true,
      left: sp.left === true,
      alive: typeof sp.alive === 'boolean' ? sp.alive : null,
    });
  }

  const phase = str(m.phase);
  const startedAt = num(m.startedAt);
  return {
    matchNo: num(m.opts?.matchNo),
    mode: str(m.mode),
    difficulty: str(m.difficulty),
    isSolo: m.isSolo === true,
    seed: num(m.seed),
    stageId: str(m.stageId),
    startedAt,
    elapsedSec: secBetween(startedAt, nowMs),
    round: num(m.round),
    phase,
    /** 阶段的中文名（`shared/constants.js PHASE_NAMES` —— 单一真相，界面不自己维护一份映射）。 */
    phaseName: phase ? (PHASE_NAMES[phase] ?? null) : null,
    /** 当前阶段的截止时刻（ms epoch）；0 / 缺失 ⇒ null（无倒计时的阶段，例如单人无时限）。 */
    deadline: num(m.deadline) || null,
    /** 单人对局的暂停开关（`server/match/match/pause.js`）；非单人恒为 false。 */
    paused: m.paused === true,
    ended: m.ended === true,
    /** 开局**定格**的座位数（`Match.seatCount`，观战者不计入）。 */
    seatCount: num(m.seatCount),
    players,
    spectators,
  };
}

/** 一个房间的明细。`room` 是 Room 实例（server/lobby.js）。 */
function roomRow(room, nowMs) {
  const seats = Array.isArray(room.seats) ? room.seats : [];
  const occupied = [];
  let humans = 0;
  let bots = 0;
  seats.forEach((s, i) => {
    if (!s) return;
    occupied.push(personRow(s, i));
    if (s.left === true) return;
    if (s.isBot === true) bots += 1;
    else humans += 1;
  });
  const spectators = (Array.isArray(room.spectators) ? room.spectators : []).map((sp) => ({
    playerId: str(sp.playerId),
    name: str(sp.name),
    connected: sp.connected === true,
  }));
  const createdAt = num(room.createdAt);
  const match = room.match ? matchRow(room.match, nowMs) : null;
  return {
    /** 房间 id / 名称：官方界面里的「房间」就是这枚 4 位房号（见 cyanfish.online 的口径）。 */
    code: str(room.code),
    mode: str(room.mode),
    difficulty: str(room.difficulty),
    hostId: str(room.hostId),
    createdAt,
    ageSec: secBetween(createdAt, nowMs),
    capacity: num(room.maxSeats),
    seatRange: { min: num(room.seatMin), max: num(room.seatMax) },
    /** 座位 / 真人 / AI / 空位：与 lobby.stats() 的「非 bot 且未离场」同一条判据的逐房间拆解。 */
    seats: { capacity: num(room.maxSeats), occupied: occupied.length, humans, bots, empty: Math.max(0, seats.length - occupied.length) },
    /** 是否已开局（`room.match` 非空即对局进行中）。 */
    inMatch: match !== null,
    /** 本房间累计开过几局（Match 结束也保留 ⇒ 面板能看出"刚打完"）。 */
    matchCount: num(room.matchCount) ?? 0,
    attending: occupied,
    spectators,
    match,
  };
}

/**
 * 把运行中的 Lobby 拍成一份只读明细快照。
 *
 * @param {any} lobby Lobby 实例（server/lobby.js）；非对象 / 结构不对 ⇒ 回一份空快照（绝不抛）
 * @param {number} [nowMs] 现在（ms epoch）；测试与嵌入调用可注入
 * @returns {{ ts:number, summary:object, rooms:Array<object> }}
 */
export function roomDetailSnapshot(lobby, nowMs = Date.now()) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const out = [];
  let list;
  try {
    list = lobby && typeof lobby.rooms?.values === 'function' ? [...lobby.rooms.values()] : [];
  } catch { list = []; }

  for (const room of list) {
    try {
      out.push(roomRow(room, now));
    } catch (e) {
      // 一个坏房间不许打掉整份快照：降级成一行"这个房间读不出来"，其余照常。
      out.push({ code: str(room?.code), error: String((e && e.message) || e) });
    }
  }
  // 房间码排序 ⇒ 面板每 15 秒轮询时行的位置不会跳（Map 的插入序在房间被回收后本来就会变）。
  out.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  // ★ 汇总**直接取 lobby.stats()**（/healthz 用的就是它）⇒ 两个接口的 rooms/matches/humans/bots/spectators
  //   永远逐值相同；本模块只**加**三个派生字段（safeToRestart / blockers / blockersText）。
  let base;
  try { base = typeof lobby?.stats === 'function' ? lobby.stats() : null; } catch { base = null; }
  const counts = base && typeof base === 'object'
    ? {
      rooms: num(base.rooms), matches: num(base.matches), humans: num(base.humans),
      bots: num(base.bots), spectators: num(base.spectators), maxSeats: num(base.maxSeats),
    }
    : {
      rooms: out.length,
      matches: out.filter((r) => r.inMatch === true).length,
      humans: out.reduce((n, r) => n + (num(r.seats?.humans) ?? 0), 0),
      bots: out.reduce((n, r) => n + (num(r.seats?.bots) ?? 0), 0),
      spectators: out.reduce((n, r) => n + (r.spectators?.length ?? 0), 0),
      maxSeats: null,
    };

  const blockers = [];
  const blockersText = [];
  /** 一条「挡着重启」的原因：代码（机器可读）+ 带数量的说法（面板直接显示）。0 / 拿不到 ⇒ 不进名单。 */
  const addBlocker = (key, n, one, many) => {
    if (!(n > 0)) return;
    blockers.push(key);
    blockersText.push(`${n} ${n === 1 ? one : many}`);
  };
  addBlocker('humans', counts.humans ?? 0, 'human', 'humans');
  addBlocker('matches', counts.matches ?? 0, 'match', 'matches');
  addBlocker('spectators', counts.spectators ?? 0, 'spectator', 'spectators');
  return {
    ts: now,
    summary: {
      ...counts,
      /**
       * ★ 服主要的那一个信号：「**0 真人 · 0 对局 · 0 观战**」⇒ 现在推重启公告 / 推更新最安全。
       * ★ 口径（工序 73 按服主裁定**收紧**）：原来观战者不算（"重启只让他们重连一次，不打断任何对局"），
       *   但服主是拿这个布尔决定「**能不能推更新 / 重启**」，而重启**同样会把观战者踢下线**
       *   ⇒ 改成保守口径：只要座位上有人、有对局在跑、或有人在看，就都不算安全。
       * ★ 判据只有一处：`blockers` 为空 ⇔ 可以推（三个计数各自 > 0 才进名单），不另写第二份布尔表达式。
       */
      safeToRestart: blockers.length === 0,
      /** 挡着 `safeToRestart` 的原因（**机器可读代码**）：`humans` / `matches` / `spectators`；空数组 = 可以推。 */
      blockers,
      /** 同一份原因的**带数量**说法（面板直接显示；老前端忽略它即可）：`"2 humans"` / `"1 match"` / `"3 spectators"`。 */
      blockersText,
    },
    rooms: out,
  };
}
