// test/match/chat.test.js — 「对局内聊天」（`cyanfish.chat`，docs/MODS.md §4.20）的服务端闸门。
//
// 这里盯的是**服务端强制**那几条（客户端那一份只是体验）：谁能发 / 长度 / 频率 / 空白 / 屏蔽 / 关开关，
// 以及最重要的一条 —— **没装 Mod（数据里没有 config.chat）⇒ 一律被拒**（"默认等于上游"）。
//
// 纯函数（server/match/chat.js）与真 Match 两条路都测：前者逐值、后者走 `m.handle()` 的完整闸门链。
//
// ★ 本文件取代 `test/match/danmaku.test.js`（工序 90 的「观战者实时弹幕」）：那一个 Mod 从未上线过
//   任何实例、其内容已整体并入 `cyanfish.chat`，接缝随之改名 `config.danmaku` → `config.chat`，
//   发送权限从「只有观战者」放宽为「**对局里的真人**」（服主 2026-10-12 口径）。
//   ★ **保留没变的那一半**：整条缝的默认仍是**关闭**、协议层上限仍是 `DANMAKU_MAX_LEN`、
//   线格式消息名仍是 `g.danmaku` / `m.danmaku`（它们是协议常量，改名要动 shared/protocol.js 与所有客户端）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateC2S, DANMAKU_MAX_LEN } from '../../shared/protocol.js';
import { ERR } from '../../shared/constants.js';
import {
  CHAT_DEFAULTS, CHAT_FALLBACK, CHAT_LIMITS, chatBlocked, chatLength,
  chatSenderAllowed, pruneWindow, readChat, sanitizeChatText, windowCount,
} from '../../server/match/chat.js';
// ★ 聊天记录的两条并入规则（纯函数）—— 它们各自对应一个**真机踩到过**的重复消息 bug，见 §「真机取证」。
import { reconcileIncoming, dropPending } from '../../mods/cyanfish.chat/client/plan.js';
// ★ 样式表的 CSS 文本（红线静态门要用它）
import { STYLE_TEXT, STYLE_ELEMENT_ID } from '../../mods/cyanfish.chat/client/style.js';
import { DATA, makeMatch } from './harness.js';
// ★ 渲染侧的**纯逻辑**也在这里断言（它是同一个 Mod 的另一半）：`mods/<id>/client/*.js` 的纯模块被测试
//   直接导入在本库有先例（test/render/skinvoice-*.test.js 就是这么用的）。仲裁器是**纯函数**，不需要浏览器。
import {
  BANNER_PERIOD_MS, FEED_MAX, TRAVEL_BASE_MS, appendFeed, canSend, canStartPass, clampFont, clampMaxLen,
  clampSpeed, enqueue, inputMaxLength, laneBusy, laneObserve, nameOf, newLaneArbiter, readChatCfg,
  readPrefs, requeue, sanitizeText, speedToMs,
} from '../../mods/cyanfish.chat/client/plan.js';

/** 一份"装了这个 Mod"的数据：与 mods/cyanfish.chat/data/config.json 的出厂值同形。 */
const FACTORY = Object.freeze({
  enabled: true, maxLen: 60, cooldownMs: 2000, burst: 5, burstWindowMs: 20000,
  roomBurst: 12, roomWindowMs: 30000, denyRooms: [], blockWords: [],
});
const withChat = (cfg) => ({ ...DATA, config: { ...(DATA.config ?? {}), chat: cfg } });

/** 一局带一名观战席（`S`）的对局；`data` 缺省 = **基座数据**（没有 config.chat）。 */
const match = (data, extra = {}) => makeMatch({ mode: 'coop', humans: 2, seed: 4242, fake: true, data, spectators: ['S'], ...extra }).start();

const send = (m, playerId, text) => m.handle(playerId, { t: 'g.danmaku', text });

// ---------------------------------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------------------------------

test('config.chat: 缺省 / 写坏 ⇒ 关闭；enabled 必须是字面 true', () => {
  assert.deepEqual(readChat(null), CHAT_DEFAULTS);
  assert.deepEqual(readChat({}), CHAT_DEFAULTS);
  assert.deepEqual(readChat({ chat: {} }), CHAT_DEFAULTS);
  assert.deepEqual(readChat({ chat: { enabled: 'true' } }), CHAT_DEFAULTS, '字符串 "true" 不算');
  assert.deepEqual(readChat({ chat: { enabled: 1 } }), CHAT_DEFAULTS, '数字 1 不算');
  assert.equal(CHAT_DEFAULTS.enabled, false, '基座默认 = 关闭（没装 Mod 的服务器没有任何能力）');
  assert.equal(readChat({ chat: { enabled: true } }).enabled, true);
});

test('config.chat: 数字越界夹取，写坏退回兜底档（安全的那一档，不是"没有限制"）', () => {
  const d = readChat({ chat: { enabled: true, maxLen: 1e9, cooldownMs: 0, burst: -5, burstWindowMs: 2 ** 40 } });
  assert.equal(d.maxLen, CHAT_LIMITS.maxLen, 'maxLen 夹到结构上限');
  assert.equal(d.cooldownMs, CHAT_LIMITS.minCooldownMs, 'cooldownMs 夹到下限');
  assert.equal(d.burst, CHAT_LIMITS.minBurst, 'burst 夹到下限');
  assert.equal(d.burstWindowMs, CHAT_LIMITS.maxBurstWindowMs);
  const bad = readChat({ chat: { enabled: true, maxLen: 'x', cooldownMs: null, burst: {}, roomBurst: [] } });
  assert.equal(bad.maxLen, CHAT_FALLBACK.maxLen);
  assert.equal(bad.cooldownMs, CHAT_FALLBACK.cooldownMs);
  assert.equal(bad.burst, CHAT_FALLBACK.burst);
  assert.equal(bad.roomBurst, CHAT_FALLBACK.roomBurst);
  assert.deepEqual(readChat({ chat: { enabled: true, denyRooms: ['AB12', 7, '', 'CD34'] } }).denyRooms, ['AB12', 'CD34']);
  assert.deepEqual(readChat({ chat: { enabled: true, blockWords: [] } }).blockWords, null, '空表 ⇒ null = 不过滤');
});

test('sanitizeChatText: 控制字符 → 空格、零宽/双向字符 → 删除、空白折叠、空 ⇒ null', () => {
  assert.equal(sanitizeChatText('hello'), 'hello');
  assert.equal(sanitizeChatText('  hello  '), 'hello');
  assert.equal(sanitizeChatText('a\nb'), 'a b', '换行变成空格，不是被删掉（否则会悄悄改词）');
  assert.equal(sanitizeChatText('a\r\n\tb'), 'a b');
  assert.equal(sanitizeChatText('a\u0000b'), 'a b');
  assert.equal(sanitizeChatText('a\u200Bb'), 'ab', '零宽空格直接删除');
  assert.equal(sanitizeChatText('a\u202Eb'), 'ab', '双向控制字符直接删除');
  assert.equal(sanitizeChatText('a\u200Db'), 'a\u200Db', '★ ZWJ 保留（emoji 组合序列）');
  assert.equal(sanitizeChatText('a   b'), 'a b');
  assert.equal(sanitizeChatText('   '), null);
  assert.equal(sanitizeChatText('\n\r\t'), null);
  assert.equal(sanitizeChatText(''), null);
  assert.equal(sanitizeChatText(null), null);
  assert.equal(sanitizeChatText(42), null);
  assert.equal(sanitizeChatText('<script>alert(1)</script>'), '<script>alert(1)</script>',
    '★ 不转义、不剥离：它只是一串**字符**（渲染层把它放进文本节点，浏览器按纯文本处理）');
});

test('chatLength 按码位（一个 emoji 算 1）；chatBlocked / windowCount / pruneWindow', () => {
  assert.equal(chatLength('abc'), 3);
  assert.equal(chatLength('🙂'), 1, '码位，不是 UTF-16 单元');
  assert.equal(chatLength(''), 0);
  assert.equal(chatLength(null), 0);
  assert.equal(chatBlocked('一起来玩', ['广告']), null);
  assert.equal(chatBlocked('这是广告', ['广告']), '广告');
  assert.equal(chatBlocked('ABC', ['abc']), 'abc', '大小写不敏感');
  assert.equal(chatBlocked('随便', null), null, '词表为 null ⇒ 不过滤');
  assert.equal(chatBlocked('随便', []), null);
  assert.equal(windowCount([], 1000, 5000), 0);
  assert.equal(windowCount([100, 200, 300], 1000, 500), 0, '全都出了窗口');
  assert.equal(windowCount([100, 900, 950], 1000, 5000), 3);
  assert.deepEqual(pruneWindow([100, 900, 950], 1000, 500), [900, 950]);
  assert.deepEqual(pruneWindow([100, 900, 950], 1000, 5000), [100, 900, 950], '窗口够大 ⇒ 一条都不裁');
  assert.deepEqual(pruneWindow([], 1000, 5000), []);
});

test('★★ chatSenderAllowed: 对局里的**真人**都能发（在座含房主 / 已被淘汰 / 观战席）；AI 与已离开不能', () => {
  assert.equal(chatSenderAllowed({ playerId: 'p0', alive: true, isBot: false, left: false }), true, '在座（含房主）');
  assert.equal(chatSenderAllowed({ playerId: 'p1', alive: false, isBot: false, left: false }), true, '已被淘汰、人还在局里');
  assert.equal(chatSenderAllowed({ playerId: 'S', spectator: true, isBot: false, left: false }), true, '观战席');
  assert.equal(chatSenderAllowed({ playerId: 'b1', isBot: true }), false, 'AI 永远不发');
  assert.equal(chatSenderAllowed({ playerId: 'p2', isBot: false, left: true }), false, '已经离开的人不发');
  assert.equal(chatSenderAllowed({ isBot: false, left: false }), false, '没有 playerId ⇒ 不属于这局');
  assert.equal(chatSenderAllowed({ playerId: '', isBot: false, left: false }), false, '空 playerId 同样拒');
  assert.equal(chatSenderAllowed(null), false);
});

// ---------------------------------------------------------------------------------------------------
// 协议层（结构上限；线格式消息名从工序 90 沿用）
// ---------------------------------------------------------------------------------------------------

test('g.danmaku 的协议层：只认非空字符串，且不超结构上限 DANMAKU_MAX_LEN', () => {
  assert.equal(DANMAKU_MAX_LEN, 120);
  assert.equal(validateC2S({ t: 'g.danmaku', text: 'a' }), null);
  assert.equal(validateC2S({ t: 'g.danmaku', text: 'a'.repeat(DANMAKU_MAX_LEN) }), null);
  assert.equal(validateC2S({ t: 'g.danmaku', text: 'a'.repeat(DANMAKU_MAX_LEN + 1) }), 'bad field text');
  assert.equal(validateC2S({ t: 'g.danmaku', text: '' }), 'bad field text');
  assert.equal(validateC2S({ t: 'g.danmaku' }), 'bad field text');
  assert.equal(validateC2S({ t: 'g.danmaku', text: 42 }), 'bad field text');
});

// ---------------------------------------------------------------------------------------------------
// ★★ 默认等于上游：没有 config.chat ⇒ 一律被拒
// ---------------------------------------------------------------------------------------------------

test('★★ 基座数据（没有 config.chat）⇒ 谁发都被拒：一条都发不出去', () => {
  const h = match(DATA);
  const before = h.bc.length;
  // ★ 三路人马**都**发不出去：观战席、在座玩家、已被淘汰的玩家。
  for (const pid of ['S', 'p_0', 'p_1']) {
    const res = send(h.m, pid, '基座下这条不该发出去');
    assert.equal(res.error, ERR.WRONG_PHASE, pid);
    assert.match(String(res.detail), /chat: config\.chat\.enabled is not true/);
  }
  assert.equal(h.bc.length, before, '一个 m.danmaku 帧都没有');
  assert.equal(h.bc.filter((x) => x.t === 'm.danmaku').length, 0);
  h.m.dispose();
});

test('config.chat.enabled=false（管理员全局关闭）⇒ 与基座逐值相同', () => {
  const h = match(withChat({ ...FACTORY, enabled: false }));
  const res = send(h.m, 'p_0', '关掉之后不该发出去');
  assert.equal(res.error, ERR.WRONG_PHASE);
  assert.equal(h.bc.filter((x) => x.t === 'm.danmaku').length, 0);
  h.m.dispose();
});

// ---------------------------------------------------------------------------------------------------
// 谁能发
// ---------------------------------------------------------------------------------------------------

test('★★ 全房双向：在座玩家（含房主）、已被淘汰的玩家、观战席都能发，且都广播给全场', () => {
  const h = match(withChat(FACTORY));
  // 在座玩家（p_0 = 房主座位）
  assert.deepEqual(send(h.m, 'p_0', '各位，这波稳了'), { ok: true });
  h.sched.advance(2100);
  // 已被淘汰、仍在局里
  const ps = h.m.players.get('p_1');
  ps.alive = false; // 测试用的最小探针：只翻这一个字段，不走整套淘汰流程（那是 settle 的测试范围）
  assert.deepEqual(send(h.m, 'p_1', '我先看着你们打'), { ok: true });
  h.sched.advance(2100);
  // 观战席
  assert.deepEqual(send(h.m, 'S', '观战的也能说话'), { ok: true });

  const frames = h.bc.filter((x) => x.t === 'm.danmaku');
  assert.equal(frames.length, 3, '三条都被广播（只广播一次/条，不重复）');
  // ★ 帧里只有 playerId + text：名字由客户端从 room.state.spectators / m.public.players 解析
  //   （观战席的 stand-in 是 Object.freeze 的、没有 name，见 server/match/chat.js 的注释）。
  assert.deepEqual(Object.keys(frames[0]).sort(), ['playerId', 't', 'text']);
  assert.deepEqual(frames.map((f) => f.playerId), ['p_0', 'p_1', 'S']);
  assert.equal(frames[0].text, '各位，这波稳了');
  h.m.dispose();
});

test('AI 不发（服务端第一步就拒它；`g.*` 里 AI 本来也不发消息）', () => {
  const h = match(withChat(FACTORY), { bots: 1 });
  // ★ 实际拦下它的是**第一道**（`Match.handle` 只认 players / spectators 两张表，AI 座位在后者之外
  //   ⇒ NOT_IN_ROOM），而 `chatSenderAllowed` 的 `isBot` 是**第二道**（给直接调意图层的路径兜底）。
  //   两道都测：先说清"能走到哪"，再单独断言第二道的判据。
  const r = send(h.m, 'ai_0', 'AI 不该说话');
  assert.equal(r.error, ERR.NOT_IN_ROOM, '第一道：AI 不在 players/spectators 里');
  assert.equal(chatSenderAllowed({ playerId: 'ai_0', isBot: true }), false, '第二道：isBot 一律拒（防直调）');
  assert.equal(h.bc.filter((x) => x.t === 'm.danmaku').length, 0);
  // ★ 同一局里的人在座玩家照常能发（证明拒的是"AI"这一条，不是整局被关掉）
  assert.deepEqual(send(h.m, 'p_0', '真人照常'), { ok: true });
  h.m.dispose();
});

// ---------------------------------------------------------------------------------------------------
// 内容闸门：空 / 长度 / 屏蔽
// ---------------------------------------------------------------------------------------------------

test('空 / 纯空白 / 只有控制字符 ⇒ 被拒（不发空消息）', () => {
  const h = match(withChat(FACTORY));
  for (const bad of ['   ', '\n', '\r\n\t', '\u200B', '\u202E']) {
    const r = send(h.m, 'p_0', bad);
    assert.equal(r.error, ERR.BAD_MSG, JSON.stringify(bad));
    assert.match(String(r.detail), /chat: empty/);
  }
  // ★ 空白之间夹着内容是**合法**的：归一化之后照发（只是被折叠成一个空格）
  assert.deepEqual(send(h.m, 'p_0', '  a \n b  '), { ok: true });
  assert.equal(h.bc.filter((x) => x.t === 'm.danmaku').pop().text, 'a b');
  h.m.dispose();
});

test('长度上限由**服务端**强制（按码位；超一个字符就拒）', () => {
  const h = match(withChat({ ...FACTORY, maxLen: 10, cooldownMs: 300, burst: 20, burstWindowMs: 1000 }));
  // 'a'.repeat(10) 是 10 个码位 ⇒ 过；10 个 emoji 也是 10 个码位 ⇒ 过（一个 emoji 算 1）
  assert.deepEqual(send(h.m, 'p_0', 'a'.repeat(10)), { ok: true });
  h.sched.advance(400);   // 避开 cooldownMs，只考长度这一条
  assert.deepEqual(send(h.m, 'p_0', '🙂'.repeat(10)), { ok: true });
  const tooLong = send(h.m, 'p_0', 'a'.repeat(11));
  assert.equal(tooLong.error, ERR.BAD_MSG);
  assert.match(String(tooLong.detail), /chat: too long \(11 > 10 chars\)/);
  const emojiTooLong = send(h.m, 'p_0', '🙂'.repeat(11));
  assert.equal(emojiTooLong.error, ERR.BAD_MSG, '11 个 emoji = 11 个码位');
  assert.equal(h.bc.filter((x) => x.t === 'm.danmaku').length, 2, '被拒的两条没有广播');
  h.m.dispose();
});

test('关键词屏蔽（blockWords）：默认空表不过滤；填了词就整条拒绝', () => {
  const off = match(withChat(FACTORY));
  assert.deepEqual(send(off.m, 'p_0', '这是广告'), { ok: true }, '词表为空 ⇒ 不过滤');
  off.m.dispose();
  const on = match(withChat({ ...FACTORY, blockWords: ['广告', '加群'] }));
  const r = send(on.m, 'p_0', '来看广告啊');
  assert.equal(r.error, ERR.BAD_MSG);
  assert.match(String(r.detail), /keyword filter/);
  assert.ok(!String(r.detail).includes('广告'), '★ 拒绝原因里不回显命中了哪个词（那等于告诉对方怎么绕过）');
  assert.equal(on.bc.filter((x) => x.t === 'm.danmaku').length, 0);
  assert.deepEqual(send(on.m, 'p_0', '正常聊天'), { ok: true });
  on.m.dispose();
});

test('按房间关闭（denyRooms）：命中本房间码 ⇒ 整间拒绝', () => {
  const h = match(withChat({ ...FACTORY, denyRooms: ['TEST'] }));
  const r = send(h.m, 'p_0', '这间房被关了');
  assert.equal(r.error, ERR.WRONG_PHASE);
  assert.match(String(r.detail), /disabled for this room/);
  h.m.dispose();
  const other = makeMatch({ mode: 'coop', humans: 2, seed: 4242, fake: true, data: withChat({ ...FACTORY, denyRooms: ['ZZZZ'] }), spectators: ['S'] }).start().m;
  assert.deepEqual(other.handle('p_0', { t: 'g.danmaku', text: '别的房号不受影响' }), { ok: true });
  other.dispose();
});

// ---------------------------------------------------------------------------------------------------
// 频率
// ---------------------------------------------------------------------------------------------------

test('频率：同一人两条之间至少 cooldownMs；只有**接受**的那一条才记时间', () => {
  const h = match(withChat({ ...FACTORY, cooldownMs: 2000, burst: 5, burstWindowMs: 20000, roomBurst: 99, roomWindowMs: 30000 }));
  assert.deepEqual(send(h.m, 'p_0', '第一条'), { ok: true });
  const second = send(h.m, 'p_0', '立刻第二条');
  assert.equal(second.error, ERR.RATE);
  assert.match(String(second.detail), /at least 2000 ms/);
  h.sched.advance(1999);
  assert.equal(send(h.m, 'p_0', '还差 1 毫秒').error, ERR.RATE);
  h.sched.advance(1);
  assert.deepEqual(send(h.m, 'p_0', '到点了'), { ok: true });
  assert.equal(h.bc.filter((x) => x.t === 'm.danmaku').length, 2, '被拒的那两条没有记时间、也没有广播');
  h.m.dispose();
});

test('频率：突发上限（burst / burstWindowMs）与**整间房**的上限（roomBurst / roomWindowMs）', () => {
  const h = match(withChat({ ...FACTORY, cooldownMs: 1000, burst: 3, burstWindowMs: 10000, roomBurst: 99, roomWindowMs: 30000 }));
  for (let i = 0; i < 3; i++) { assert.deepEqual(send(h.m, 'p_0', '第 ' + String(i) + ' 条'), { ok: true }); h.sched.advance(1000); }
  const fourth = send(h.m, 'p_0', '第四条');
  assert.equal(fourth.error, ERR.RATE);
  assert.match(String(fourth.detail), /at most 3 per 10000 ms/);
  h.sched.advance(10000);   // 第一个窗口整段出窗
  assert.deepEqual(send(h.m, 'p_0', '窗口过了'), { ok: true });
  h.m.dispose();

  // 整间房：在座 + 观战席合起来封顶（★ 每次之间推进 400ms 以避开 per-sender 的 cooldownMs，
  //   这样被拒的原因一定是**整间房**那一条）
  const room = makeMatch({
    mode: 'coop', humans: 2, seed: 4242, fake: true, spectators: ['S1'],
    data: withChat({ ...FACTORY, cooldownMs: 300, burst: 20, burstWindowMs: 1000, roomBurst: 2, roomWindowMs: 30000 }),
  }).start();
  assert.deepEqual(room.m.handle('p_0', { t: 'g.danmaku', text: 'p0-a' }), { ok: true });
  room.sched.advance(400);
  assert.deepEqual(room.m.handle('S1', { t: 'g.danmaku', text: 's1-a' }), { ok: true });
  room.sched.advance(400);
  const third = room.m.handle('p_1', { t: 'g.danmaku', text: 'p1-a' });
  assert.equal(third.error, ERR.RATE);
  assert.match(String(third.detail), /room at most 2 per 30000 ms/);
  room.m.dispose();
});

// ---------------------------------------------------------------------------------------------------
// 瞬时性：不进 m.public / m.result / 不落盘
// ---------------------------------------------------------------------------------------------------

test('聊天是瞬时的：不进 m.public，也不进任何快照 / 结果', () => {
  const h = match(withChat(FACTORY));
  const beforePub = h.bc.filter((x) => x.t === 'm.public').length;
  assert.deepEqual(send(h.m, 'p_0', '这条不该出现在公开状态里'), { ok: true });
  const json = JSON.stringify(h.m.publicView());
  assert.ok(!json.includes('这条不该出现在公开状态里'), 'm.public 里没有聊天正文');
  assert.equal(h.bc.filter((x) => x.t === 'm.public').length, beforePub, '发一条消息不触发 m.public 重发');
  assert.equal(h.m.publicView().chat, undefined, '公开视图里没有 chat 这个字段');
  assert.equal(h.m.publicView().danmaku, undefined, '也没有 danmaku 这个字段（线格式名沿用，但状态里不出现）');
  h.m.dispose();
});

// ---------------------------------------------------------------------------------------------------
// 渲染侧：纯逻辑（设置项 / 通道仲裁 / 消息流）
// ---------------------------------------------------------------------------------------------------

test('客户端文本归一化与服务端逐字同口径（它只是体验，但两份不许漂）', () => {
  for (const v of ['a\nb', '  a   b  ', 'a\u200Bb', 'a\u0000b', 'a\u202Eb']) {
    const c = sanitizeText(v, 60);
    // 服务端那一份（不带长度上限的行为）：把上限放到结构上限，两者应当给出同一串
    const s = sanitizeChatText(v);
    assert.equal(c.text, s, JSON.stringify(v));
  }
  assert.equal(sanitizeText('a\u200Db', 60).text, 'a\u200Db', 'ZWJ 两份都保留');
  assert.equal(sanitizeText('   ', 60).ok, false);
  assert.equal(sanitizeText('a'.repeat(61), 60).ok, false);
  assert.equal(sanitizeText('a'.repeat(60), 60).ok, true);
  assert.equal(sanitizeText('🙂'.repeat(60), 60).ok, true, '码位口径：60 个 emoji 合法');
});

test('客户端长度档与服务端同口径（夹取 / 输入框 maxLength）', () => {
  assert.equal(clampMaxLen(60), 60);
  assert.equal(clampMaxLen(1e9), 120, '夹到结构上限');
  assert.equal(clampMaxLen(0), 4, '夹到下限（不是 0 ⇒ 不会"一条都发不出"）');
  assert.equal(clampMaxLen('x'), 60, '写坏 ⇒ 兜底档');
  assert.equal(inputMaxLength(60), 120, 'UTF-16 单元数：按 2 倍给，真正的判据是 sanitizeText');
});

test('★★ 本机偏好（sp.pref.chat）：出厂档 / 夹取 / 写坏回落；只影响"怎么看"，不动服务端规则', () => {
  assert.deepEqual(readPrefs(null), { danmaku: true, speed: 1, font: 1, open: true });
  assert.deepEqual(readPrefs({}), { danmaku: true, speed: 1, font: 1, open: true });
  assert.deepEqual(readPrefs({ danmaku: false, speed: 1.5, font: 1.25, open: false }),
    { danmaku: false, speed: 1.5, font: 1.25, open: false });
  assert.equal(readPrefs({ speed: 99 }).speed, 2, '速度夹到上限');
  assert.equal(readPrefs({ speed: 0 }).speed, 0.5, '速度夹到下限');
  assert.equal(readPrefs({ speed: 'fast' }).speed, 1, '写坏 ⇒ 标准档');
  assert.equal(readPrefs({ font: 99 }).font, 1.6, '字号夹到上限');
  assert.equal(readPrefs({ font: -3 }).font, 0.8, '字号夹到下限');
  assert.equal(readPrefs({ danmaku: 'on' }).danmaku, true, '非布尔 ⇒ 出厂档');
  assert.equal(clampSpeed(NaN), 1);
  assert.equal(clampFont(Infinity), 1);
});

test('★ 弹幕速度 → 真实时长：越快越短、单调、写坏回落、排队时缩短', () => {
  assert.equal(speedToMs(1), TRAVEL_BASE_MS, '标准档 = 基准时长（9 秒）');
  assert.ok(speedToMs(2) < speedToMs(1), '更快 ⇒ 在屏时间更短');
  assert.ok(speedToMs(0.5) > speedToMs(1), '更慢 ⇒ 在屏时间更长');
  // ★ 值域由 `clampSpeed` 定（0.5 ~ 2）⇒ 极端入参夹到两端，而不是被另一个上下限再夹一次
  assert.equal(speedToMs(1e9), speedToMs(2), '超大入参 ⇒ 夹到最快档');
  assert.equal(speedToMs(-1e9), speedToMs(0.5), '超小入参 ⇒ 夹到最慢档');
  assert.equal(speedToMs('fast'), TRAVEL_BASE_MS, '写坏 ⇒ 标准档');
  assert.ok(speedToMs(1, 0.7) < speedToMs(1), '通道还有人等 ⇒ 缩短（吞吐追上流入）');
  assert.equal(speedToMs(1, 0), speedToMs(1), '非法 busyMul ⇒ 当作不等');
  // 设置页那三档必须给出**三个互不相同**的时长（否则那些按钮是无效控件）
  assert.deepEqual([0.7, 1, 1.5].map((v) => speedToMs(v)), [12857, 9000, 6000]);
  // 单调性（整段扫一遍，防止哪天改成非单调的分段函数）
  let prev = Infinity;
  for (let s = 0.5; s <= 2.0001; s += 0.1) {
    const ms = speedToMs(s);
    assert.ok(ms <= prev, '速度递增 ⇒ 时长不增（s=' + s.toFixed(1) + '）');
    prev = ms;
  }
});

test('★ 设置页那一栏的三个键：都是真实生效的键，且写坏都回落到出厂档', () => {
  // 「对局内弹幕」开 / 关 ⇒ 只影响弹幕层（面板照常）—— 早退判据在 danmaku.js 的 `prefs.danmaku`，
  //   这里断言"键存在且是布尔"（真正的可观察差别在真机取证里）。
  assert.equal(typeof readPrefs(null).danmaku, 'boolean');
  // 「聊天字号」三档 0.9 / 1 / 1.25 都能过夹取（改了它 ⇒ 面板正文字号跟着变，见 style.js 的 --sp-chat-fs）
  for (const v of [0.9, 1, 1.25]) assert.equal(clampFont(v), v);
  // 三个键都是**可撤回**的：全部写成非法值 ⇒ 一起回到出厂档
  assert.deepEqual(readPrefs({ danmaku: 'x', speed: 'x', font: 'x' }),
    { danmaku: true, speed: 1, font: 1, open: true });
});

test('通道占用判据：只看与视口横向的**几何**交集（不是"节点在不在"）', () => {
  assert.equal(laneBusy(null, 1440), false);
  assert.equal(laneBusy({ left: 1440, right: 1900 }, 1440), false, '还在右边屏外');
  assert.equal(laneBusy({ left: 100, right: 500 }, 1440), true, '在屏上');
  assert.equal(laneBusy({ left: -900, right: -20 }, 1440), false, '已经飘出左边（动画终态就停在这里）');
  assert.equal(laneBusy({ left: -100, right: 10 }, 1440), true, '还有 10px 露在屏上');
});

test('★★ 仲裁器：没有生产者 ⇒ 立刻放行；有生产者 ⇒ 只在"横幅离屏且本轮能在下次起飞前跑完"时放行', () => {
  const T0 = 100000;
  const FLIGHT = 9000;
  const PERIOD = BANNER_PERIOD_MS;
  // 真机的节拍是 120ms；测试里用 500ms（同量级，且**必须比 LANE_STALE_MS 密** —— 否则会被判成观测中断）
  const STEP = 500;
  /** 模拟一台周期性的横幅：第 k 轮的飘过区间是 [T0 + k*PERIOD, T0 + k*PERIOD + FLIGHT)。 */
  const bannerOn = (t) => (t - T0) - Math.floor((t - T0) / PERIOD) * PERIOD < FLIGHT;
  const observe = (arb, from, to, rootPresent = true) => {
    let a = arb;
    for (let t = from; t <= to; t += STEP) a = laneObserve(a, { now: t, rootPresent, busy: rootPresent && bannerOn(t) });
    return a;
  };

  // ① 没有第二个生产者（`.sp-bn--game` 不在）⇒ 永远放行（"只装本 Mod"的路径，零延迟）
  let arb = observe(newLaneArbiter(T0), T0, T0 + 60000, false);
  assert.equal(arb.rootPresent, false);
  assert.equal(canStartPass(arb, T0 + 60001, TRAVEL_BASE_MS), true);

  // ② 生产者出现：从 T0 起就有公告在飘 ⇒ 观测到起飞时刻与离屏时刻
  arb = observe(arb, T0, T0 + 12000);
  assert.equal(arb.lastFlightStart, T0, '起飞时刻 = 第一次看到它在屏上的那一刻');
  assert.equal(arb.lastFlightEnd, T0 + FLIGHT, '离屏时刻 = 第一次看到它不在屏上的那一刻');
  // ★ 判据的读法：先 `laneObserve`（把 `on` 刷成最新），再用**同一个 now** 问 `canStartPass`
  //   —— 渲染层的节拍就是这么用的（client/danmaku.js 的 `beat()`）。
  const onArb = observe(newLaneArbiter(T0), T0, T0 + 5000);
  assert.equal(onArb.on, true);
  assert.equal(canStartPass(onArb, T0 + 5000, TRAVEL_BASE_MS), false, '横幅正在屏上 ⇒ 不放行');
  assert.equal(canStartPass(arb, T0 + FLIGHT, TRAVEL_BASE_MS), true, '刚离屏 ⇒ 立刻放行');
  assert.equal(canStartPass(arb, T0 + 44000, TRAVEL_BASE_MS), true, '窗口末尾（44000+9000+1000 = 54000）仍然放行');
  assert.equal(canStartPass(arb, T0 + 44001, TRAVEL_BASE_MS), false,
    '★ 再往后 1ms 就不放行了：那会正好压在横幅下一次起飞的那一刻');

  // ③ 再观测一整轮：实测出周期 = 54000ms（与 cyanfish.banner 1.2.0 的 9s + 45s 一致）
  arb = observe(arb, T0 + 12000, T0 + PERIOD + FLIGHT + 2000);
  assert.equal(arb.periodMeasured, PERIOD, '实测周期 = 54000ms');
  assert.equal(arb.lastFlightStart, T0 + PERIOD, '第二轮的起飞时刻');
  assert.equal(canStartPass(arb, T0 + PERIOD + FLIGHT, TRAVEL_BASE_MS), true, '第二轮的窗口同样开放');
  assert.equal(canStartPass(arb, T0 + PERIOD + 44001, TRAVEL_BASE_MS), false);

  // ④ 对方把周期改长（例如以后把「每 45 秒」调大）⇒ **以实测为准**，窗口跟着变宽而不是误判
  const longer = { ...arb, periodMeasured: PERIOD * 2 };
  assert.equal(canStartPass(longer, T0 + PERIOD + PERIOD, TRAVEL_BASE_MS), true, '周期变长 ⇒ 窗口变宽');
  assert.equal(canStartPass(longer, T0 + PERIOD + PERIOD * 2 - 9000, TRAVEL_BASE_MS), false,
    '新周期的末尾同样封口（3×PERIOD − 9s 起就不放行）');

  // ⑤ ★ 用户的「弹幕速度」设置**直接参与**那条窗口判据（这是本 Mod 相对工序 90 的新增性质）。
  //   第二轮窗口的封口线 = lastFlightStart + PERIOD − dur − 1000（实测：慢 40143 / 标准 44000 / 快 47000，
  //   都相对 T0+PERIOD）。⇒ 同**一个**时刻，三档给出**三种**结论 —— 快档可用的窗口最长。
  const SLOW = speedToMs(0.7);    // 12857ms（设置页「慢」）
  const FAST = speedToMs(1.5);    // 6000ms（设置页「快」）
  const AT = T0 + PERIOD + 45000; // 落在标准档与快档的封口线之间
  assert.equal(canStartPass(arb, AT, SLOW), false, '慢档：早已封口');
  assert.equal(canStartPass(arb, AT, TRAVEL_BASE_MS), false, '标准档：也已封口（封口线 44000）');
  assert.equal(canStartPass(arb, AT, FAST), true, '★ 快档：同一个时刻仍然放得下（封口线 47000）');
  assert.equal(canStartPass(arb, T0 + PERIOD + 44000, TRAVEL_BASE_MS), true, '标准档在封口线那一刻正好放得下');
  assert.equal(canStartPass(arb, T0 + PERIOD + 44001, TRAVEL_BASE_MS), false, '标准档再往后 1ms 就不行了');
  assert.equal(canStartPass(arb, T0 + PERIOD + 47000, FAST), true, '快档在它自己的封口线那一刻正好放得下');
  assert.equal(canStartPass(arb, T0 + PERIOD + 47001, FAST), false, '快档再往后 1ms 也不行了');
});

test('仲裁器：观测中断（页签被冻结 / 系统挂起）⇒ 相位作废，重新学（保守，绝不放行一个没把握的窗口）', () => {
  const T0 = 500000;
  const STEP = 500;
  let arb = newLaneArbiter(T0);
  for (let t = T0; t <= T0 + 10000; t += STEP) arb = laneObserve(arb, { now: t, rootPresent: true, busy: t <= T0 + 9000 });
  assert.equal(canStartPass(arb, T0 + 9000, TRAVEL_BASE_MS), true);
  // 隔了 10 分钟才来下一次采样（页签被冻结）⇒ 相位作废 ⇒ 不能放行（这一轮可能正好撞上横幅）
  arb = laneObserve(arb, { now: T0 + 600000, rootPresent: true, busy: false });
  assert.equal(arb.lastFlightStart, null);
  assert.equal(arb.lastFlightEnd, null);
  assert.equal(canStartPass(arb, T0 + 600001, TRAVEL_BASE_MS), false, '相位未知 ⇒ 等下一次起飞结束');
  // 连续观测超过 2 个周期都没见过起飞（那个根节点其实没在生产）⇒ 兜底放行，避免永远卡住
  assert.equal(canStartPass(arb, T0 + 600000 + BANNER_PERIOD_MS * 2, TRAVEL_BASE_MS), true);
  // 但"连续观测"必须真的连续：中间再断一次就重新计时
  let a2 = arb;
  for (let t = T0 + 600000; t <= T0 + 600000 + 20000; t += STEP) a2 = laneObserve(a2, { now: t, rootPresent: true, busy: false });
  a2 = laneObserve(a2, { now: T0 + 900000, rootPresent: true, busy: false });
  assert.equal(canStartPass(a2, T0 + 900000 + BANNER_PERIOD_MS * 2 - 1000, TRAVEL_BASE_MS), false);
  assert.equal(canStartPass(a2, T0 + 900000 + BANNER_PERIOD_MS * 2, TRAVEL_BASE_MS), true);
});

test('队列：入队丢最旧、抢占放回队首（抢占时丢的是最新那一条，被撤下来的不丢）', () => {
  let q = [];
  for (let i = 1; i <= 6; i++) q = enqueue(q, { seq: i }, 4);
  assert.deepEqual(q.map((x) => x.seq), [3, 4, 5, 6], '超出上限丢最旧的');
  q = requeue(q, { seq: 99 }, 4);
  assert.deepEqual(q.map((x) => x.seq), [99, 3, 4, 5], '★ 抢占：被撤下来的回到队首，丢的是最新那一条');
  assert.deepEqual(requeue([], null, 4), []);
});

test('聊天记录：只留最近 FEED_MAX 条，丢的是最旧的', () => {
  let feed = [];
  for (let i = 1; i <= FEED_MAX + 5; i++) feed = appendFeed(feed, { seq: i }, FEED_MAX);
  assert.equal(feed.length, FEED_MAX);
  assert.equal(feed[0].seq, 6, '最旧的 5 条被丢掉');
  assert.equal(feed[feed.length - 1].seq, FEED_MAX + 5);
  assert.deepEqual(appendFeed([], null, 10), [], '坏条目直接忽略');
});

test('客户端「我能不能发」与服务端 chatSenderAllowed 同口径（对局里的真人都能发）', () => {
  const pub = { players: [{ playerId: 'p0', name: 'P0', alive: true }, { playerId: 'p1', name: 'P1', alive: false }] };
  const base = { me: { playerId: 'p0', name: 'P0' }, room: { spectators: [{ playerId: 's1', name: 'S1' }] }, match: { public: pub } };
  assert.deepEqual(canSend(base), { can: true, why: 'seated' }, '在座且存活（含房主）能发');
  assert.deepEqual(canSend({ ...base, me: { playerId: 'p1', name: 'P1' } }), { can: true, why: 'eliminated' }, '已被淘汰仍在局里');
  assert.deepEqual(canSend({ ...base, me: { playerId: 's1', name: 'S1' } }), { can: true, why: 'spectator' }, '观战席');
  assert.deepEqual(canSend({ ...base, match: { public: null } }), { can: false, why: '' }, '还没进对局 ⇒ 不发');
  assert.deepEqual(canSend({ me: { playerId: 'x' }, room: { spectators: [] }, match: { public: pub } }), { can: false, why: '' },
    '不在这局的名册里（刚进来还没定位）⇒ 不发（fail-closed）');
  assert.deepEqual(canSend(null), { can: false, why: '' });
});

test('名字解析：只认宿主已有的那几处真值；查不到 ⇒ 空串（绝不显示一个猜的名字）', () => {
  const pub = { players: [{ playerId: 'p0', name: '甲' }, { playerId: 'p1', name: '  乙  ' }] };
  const state = { me: { playerId: 'p0', name: '我' }, room: { spectators: [{ playerId: 's1', name: '丙' }] }, match: { public: pub } };
  assert.equal(nameOf(state, 'p0'), '我', '自己走 me');
  assert.equal(nameOf(state, 'p1'), '乙', '玩家走 m.public.players（两端去空白）');
  assert.equal(nameOf(state, 's1'), '丙', '观战席走 room.state.spectators');
  assert.equal(nameOf(state, 'nope'), '', '查不到 ⇒ 空串');
  assert.equal(nameOf(null, 'p0'), '');
  assert.equal(nameOf(state, ''), '');
});

test('客户端配置镜像 readChatCfg：只有显式 true 才开；长度夹取；denyRooms 只留非空字符串', () => {
  assert.deepEqual(readChatCfg(null), { enabled: false, maxLen: 60, denyRooms: [] });
  assert.deepEqual(readChatCfg({ chat: { enabled: 'true' } }), { enabled: false, maxLen: 60, denyRooms: [] });
  const on = readChatCfg({ chat: { enabled: true, maxLen: 1e9, denyRooms: ['AB12', 7, '', 'CD34'] } });
  assert.equal(on.enabled, true);
  assert.equal(on.maxLen, 120);
  assert.deepEqual(on.denyRooms, ['AB12', 'CD34']);
});


// ---------------------------------------------------------------------------------------------------
// ★★ 聊天记录的两条并入规则（各自对应一个**真机踩到过**的"同一条消息出现两遍"bug）
// ---------------------------------------------------------------------------------------------------

test('★★ reconcileIncoming：服务端回包把本地乐观占位**换掉**（不是并列），且同文合法重发不被误删', () => {
  const TXT = '这是一条消息';
  const pending = { seq: -1, playerId: '', text: TXT, at: 1, pending: true };

  // ① 回包把我那条占位换掉 ⇒ 只剩一条（**这就是真机上出现两遍的那个 bug**）
  const one = reconcileIncoming([pending], { seq: 1, playerId: 'p_0', text: TXT, at: 2 });
  assert.equal(one.length, 1, '占位被替换，不是并列两行');
  assert.equal(one[0].seq, 1);
  assert.equal(one[0].pending, undefined, '正式记录没有 pending 标记');

  // ② ★ 占位的 playerId 为空（刚进对局 / 重连后 me 还没到）时**也必须**匹配得上 ——
  //    判据只用「pending + 正文」，不引入第二个可能为空的字段（第二版就是这么翻车的）。
  const withFrameId = reconcileIncoming([pending], { seq: 2, playerId: 'p_0', text: TXT, at: 3 });
  assert.equal(withFrameId.length, 1, '占位 playerId 为空串也要能匹配（不再比 playerId）');

  // ③ 没有占位时，纯入站一条 ⇒ 正常追加
  assert.equal(reconcileIncoming([], { seq: 3, playerId: 'p_9', text: '别人的话', at: 4 }).length, 1);

  // ④ ★ 同一个人连发两条一样的短句：第二条**没有**占位 ⇒ 不该被误删
  const first = { seq: 1, playerId: 'p_0', text: TXT, at: 5 };
  const twoSame = reconcileIncoming([first], { seq: 2, playerId: 'p_0', text: TXT, at: 6 });
  assert.equal(twoSame.length, 2, '同文重发是两条合法记录');

  // ⑤ 占位还没被确认时又收到一条**不同文**的 ⇒ 不误删占位
  const other = reconcileIncoming([pending], { seq: 7, playerId: 'p_1', text: '另一句', at: 7 });
  assert.equal(other.length, 2);
  assert.ok(other.some((m) => m.pending === true), '不同文的回包不动占位');

  // ⑥ 坏入参不抛
  assert.deepEqual(reconcileIncoming(null, null), []);
  assert.deepEqual(reconcileIncoming([pending], { seq: 8, text: 42 }).map((m) => m.pending), [true]);
});

test('★★ dropPending：按占位序号撤回（发送被拒 / 失败时），不误伤正式记录与别人的同文消息', () => {
  const list = [
    { seq: -1, playerId: '', text: 'A', pending: true },
    { seq: 5, playerId: 'p_0', text: 'A' },
    { seq: -2, playerId: '', text: 'B', pending: true },
  ];
  assert.deepEqual(dropPending(list, -2).map((m) => m.seq), [-1, 5], '只撤指定的那一条占位');
  assert.deepEqual(dropPending(list, 5).map((m) => m.seq), [-1, 5, -2], '正数序号（正式记录）不会被撤');
  assert.deepEqual(dropPending(list, 999).map((m) => m.seq), [-1, 5, -2], '找不到就原样返回');
  assert.deepEqual(dropPending(list, NaN).map((m) => m.seq), [-1, 5, -2], '非法序号不抛也不改');
  assert.deepEqual(dropPending(null, -1), []);
});

test('★★ state.js 收/发全链路（桩宿主）：发一条 → 回包后**只有一条**（真机 bug 的回归门）', async () => {
  const savedSp = globalThis.__SP__;
  const savedLs = globalThis.localStorage;
  const handlers = new Map();
  const frames = [];
  try {
    globalThis.__SP__ = {
      // ★ 刻意让 me 一开始**为空**：模拟"刚进对局 / 重连之后 me 还没到"，
      //   这正是第二版 reconcile 比 playerId 时永远匹配不上的那个真机场景。
      store: { get: () => ({ me: {}, room: {}, match: { public: { players: [] } } }) },
      net: {
        on(t, fn) { handlers.set(t, fn); return () => handlers.delete(t); },
        request(t, payload) { frames.push({ t, payload }); return Promise.resolve({}); },
      },
    };
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };

    const S = await import('../../mods/cyanfish.chat/client/state.js');
    S.clearFeed();
    S.startFeed();

    const TXT = '真机回归用的那句话';
    const sent = await S.sendChat(TXT, 60);
    assert.deepEqual(sent, { ok: true }, '客户端本地校验通过并且 net.request 成功');
    assert.deepEqual(frames, [{ t: 'g.danmaku', payload: { text: TXT } }], '出站走的是 g.danmaku');
    assert.equal(S.feedSnapshot().length, 1, '发送后先画一条乐观占位');
    assert.equal(S.feedSnapshot()[0].pending, true);

    // 服务端把它广播回来
    const onMsg = handlers.get('m.danmaku');
    assert.equal(typeof onMsg, 'function', '订阅到了 m.danmaku');
    onMsg({ playerId: 'p_0', text: TXT });

    const feed = S.feedSnapshot();
    assert.equal(feed.length, 1, '★★ 回包后**只有一条**（不是两条 —— 这就是真机上出现两遍的那个 bug）');
    assert.equal(feed[0].pending, undefined, '留下的是服务端确认过的那条');
    assert.equal(feed[0].playerId, 'p_0');

    // 别人的消息照常追加
    onMsg({ playerId: 'p_1', text: '别人说的话' });
    assert.equal(S.feedSnapshot().length, 2);

    // 发送被拒 ⇒ 占位撤回，不留假记录
    globalThis.__SP__.net.request = () => Promise.reject(Object.assign(new Error('rate'), { code: 'RATE' }));
    const before = S.feedSnapshot().length;
    const bad = await S.sendChat('会被拒的一条', 60);
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'RATE');
    assert.equal(S.feedSnapshot().length, before, '被拒之后不留占位（长度不变）');
  } finally {
    globalThis.__SP__ = savedSp;
    globalThis.localStorage = savedLs;
  }
});


// ---------------------------------------------------------------------------------------------------
// ★★ 红线静态门：CSS 模板字面量里**不许出现反引号**（本工序被它咬了 4 次，所以做成常设断言）
// ---------------------------------------------------------------------------------------------------
//
// 病因：`client/style.js` 的 CSS 是**模板字面量**，而模板字面量内部**不允许再出现反引号**
//   （规范 §2 红线）。在 CSS **注释**里顺手写 `--var` / `game.css:444` 这种"代码味"的引用时
//   极容易踩到：轻则 `node --check` 报语法错，重则**整个模块加载失败**（真机上表现为
//   "聊天面板整个不见了"，因为 index.js 的 import 直接抛）—— 排查方向会被误导到"面板没挂上"。
// ⇒ 把"导出的 CSS 文本里一个反引号都没有"变成一条**常设单测**，而不是靠每次记得跑 node --check。

test('★★ 红线：导出的 CSS 文本里不许有反引号（模板字面量内部不许再出现反引号）', () => {
  assert.equal(typeof STYLE_TEXT, 'string');
  assert.ok(STYLE_TEXT.length > 500, 'CSS 文本非空（拿到的是真的那份样式）');
  const ticks = (STYLE_TEXT.match(/`/g) || []).length;
  assert.equal(ticks, 0, '★ CSS 里出现 ' + String(ticks) + ' 个反引号 —— 会把模板字面量提前截断/解析失败');
  assert.equal(STYLE_ELEMENT_ID, 'sp-mod-cyanfish.chat-style');
});

test('★ 样式契约：!important 只用于压 pointer-events；有动效就有 prefers-reduced-motion 降级', () => {
  // R3：全仓唯一正当的 !important 用法
  const decls = [...STYLE_TEXT.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([a-z-]+)\s*:\s*([^;{}]*!important)/g)];
  const bad = decls.filter((m) => m[1] !== 'pointer-events');
  assert.equal(bad.length, 0, 'R3 违规：' + bad.map((m) => m[1]).join(' | '));
  // R10：有 @keyframes / animation 就必须有降级
  if (/@keyframes|animation/.test(STYLE_TEXT)) {
    assert.match(STYLE_TEXT, /@media \(prefers-reduced-motion: reduce\)/, 'R10：有动效必须有降级分支');
  }
  // R2：禁用 :has()
  assert.equal(/:has\(/.test(STYLE_TEXT), false, 'R2：不许用 :has()');
});

test('★ 形态契约：收起态是**右上角一枚方块图标键**（同 EFFECTS 单框大小）；未读是**红点**且**没有数字**', () => {
  // ① 收起态：贴**右**（服主口径：「收起时错误的挂靠在了屏幕**左侧**而非**右侧**」）
  const tab = STYLE_TEXT.split('.sp-chat__tab {')[1].split('}')[0];
  assert.match(tab, /right:\s*\.3rem/, '图标键与官方 .gm__effects 的 right 对齐（.3rem）⇒ 摆在那列正上方');
  assert.equal(/(^|[;{]\s*)left:\s*\./.test(tab), false, '★ 不许再用 left 挂靠（那版挂错了边）');
  // ② ★★ 大小与官方「生效效果」单框**相同**（game.css:449-450 的 .effect 是 .5rem × .5rem）
  assert.match(tab, /width:\s*\.5rem/, '宽 = .5rem（= 官方 .effect 的宽）');
  assert.match(tab, /height:\s*\.5rem/, '高 = .5rem（= 官方 .effect 的高）—— 不是上一版那种竖长条');
  assert.equal(/min-height:\s*1\.5rem/.test(tab), false, '★ 旧的 1.5rem 竖排长条已删除');
  // ③ 位置在 EFFECTS 那一列**上方**：图标键 + 它对下那一个框，正好落在 .gm__effects 的 top:2.4rem 之上
  const TOP_REM = 1.72;   // 与 style.js 的 top 同值；算式：2.4 − .5(自己) − .12(gap) − .06(视觉间隙)
  const m = tab.match(/top:\s*([\d.]+)rem/);
  assert.ok(m, 'top 是 rem 值');
  const top = Number(m[1]);
  assert.equal(top, TOP_REM, 'top = ' + String(TOP_REM) + 'rem（摆在 EFFECTS 列正上方）');
  assert.ok(top + 0.5 + 0.12 <= 2.4, '图标键底边 + 一个框 + 间隙 ≤ EFFECTS 顶部 2.4rem ⇒ 真的在它上方');
  // ④ **只有一个图标、没有文字**（服主口径：「只显示一个框 + 聊天 SVG 图标」）
  assert.equal(/sp-chat__tabicon/.test(STYLE_TEXT), false, '★ 旧的竖排文字类已删除（不再有文字标签）');
  assert.match(STYLE_TEXT, /\.sp-chat__tab svg\s*\{[^}]*width:\s*\.28rem/, '图标 .28rem（= 官方 .gm__gear .icon）');
  assert.match(STYLE_TEXT, /\.sp-chat__tab svg\s*\{[^}]*height:\s*\.28rem/, '图标高 .28rem');
  // ⑤ 展开态面板贴右，且**右边界让开官方 .gm__effects**（真机实测撞过：它占右缘 .3rem 起 61.8px）
  const box = STYLE_TEXT.split('.sp-chat__box {')[1].split('}')[0];
  assert.match(box, /right:\s*\.96rem/, '面板右缘 .96rem（让开官方生效效果列）');
  // ⑥ 未读提示只有一颗红点：**条数计数 / 数字渲染**的类已经不存在
  assert.match(STYLE_TEXT, /\.sp-chat__dot\s*\{/, '红点类存在');
  assert.equal(/sp-chat__tabcount/.test(STYLE_TEXT), false, '★ 旧的"数字徽标"类已删除（不再显示条数）');
  assert.match(STYLE_TEXT.split('.sp-chat__dot {')[1].split('}')[0], /border-radius:\s*50%/, '红点是圆的');
  assert.match(STYLE_TEXT.split('.sp-chat__dot {')[1].split('}')[0], /--red-premium/, '红点用宿主的 --red-premium');
});

test('★ 坑：给元素设了 display 又用 hidden 属性切换 ⇒ 必须显式写 [hidden]{display:none}', () => {
  // 病因：作者样式的 display 压过 UA 样式表的 [hidden]{display:none} ⇒ el.hidden = true 不生效，
  //   "收起的窄标签"会与"展开的面板"同时挂在屏上（预览页就是这么暴露出来的）。
  assert.match(STYLE_TEXT, /\.sp-chat__tab\[hidden\]/, '窄标签有 [hidden] 兜底');
  assert.match(STYLE_TEXT, /\.sp-chat__box\[hidden\]/, '面板有 [hidden] 兜底');
  assert.match(STYLE_TEXT, /\.sp-chat__dot\[hidden\]/, '红点有 [hidden] 兜底');
});
