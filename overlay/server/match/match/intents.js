// server/match/match/intents.js — Match methods: the g.* / b.* intent router (_handle: the prep intents go to
// PlayerState, the drafts, watching, the pause and the battle reports to the match), emotes, AI 托管 (setAutoplay,
// kickBot) and g.unitStats (the stats the board's units start their next battle with: a preview battle, started, read
// and dropped).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { unitStatsEntry } from '../../../shared/protocol.js';
import { PHASE, ERR, EMOTES, EMOTE_COOLDOWN_MS, GEO, BOND_LAYER_CAP } from '../../../shared/constants.js';
import { deriveSeed } from '../../sim/rng.js';
import {
  DEBUG_ATTRS, DEBUG_ATTR_PERMILLE, DEBUG_LIMITS, debugActionAllowed, debugAllowed, debugAttrEntry, debugWaveList, readDebug,
} from '../debug.js';
import { chatBlocked, chatLength, chatSenderAllowed, pruneWindow, readChat, sanitizeChatText } from '../chat.js';
import { applyCard, bountyCard, tacticCard } from '../choices.js';
import { buildNormalWave } from '../waves.js';
import { OK, fail } from './common.js';
import { onHumanEmote } from '../botEmotes.js';

export class MatchIntents {
  _handle(ps, msg) {
    switch (msg.t) {
      case 'g.infoReady':
        if (this.phase !== PHASE.INFO_CHECK) return fail(ERR.WRONG_PHASE);
        if (this.setupVote) return fail(ERR.WRONG_PHASE, 'setup reroll vote in progress');
        if ((msg.setupRevision ?? 0) !== this.setupRevision) return fail(ERR.BAD_TARGET, 'setup changed; confirm the current revision');
        if (!ps.infoReady) { ps.infoReady = true; this.markPublic(); this.maybeEndInfo(); }
        return OK;
      case 'g.rerollVote': return this.voteSetupReroll(ps, msg.voteId, msg.agree);
      case 'g.band': return this.pickBand(ps, msg.bandId);
      case 'g.bandSkip': return this.skipBand(ps);
      // the strategy highlighted in the draft screen (what a timed-out turn takes, timeoutBand)
      case 'g.bandFocus': return this.bandFocus(ps, msg.bandId ?? null);
      case 'g.buy': return ps.buy(msg.slot);
      case 'g.refresh': return ps.refresh();
      case 'g.freeze': return ps.freeze();
      case 'g.levelUp': return ps.levelUp();
      case 'g.sell': return ps.sell(msg.uid);
      // dir: the deploy wheel's facing (DESIGN §3; absent ⇒ PlayerState reads to.dir, then RIGHT)
      case 'g.move': return ps.move(msg.uid, msg.to, msg.dir);
      case 'g.equip': return ps.equip(msg.itemUid, msg.targetUid, msg.replaceUid ?? null);
      case 'g.art': return ps.useArt(msg.itemUid, msg.row, msg.col, msg.dir);
      case 'g.destroy': return ps.destroy(msg.uid);
      case 'g.reward': return ps.pickReward(msg.idx);
      case 'g.choice': return msg.choiceId !== undefined
        ? this.pickPersonalChoice(ps, msg.idx, msg.choiceId)
        : this.pickCard(ps, msg.idx);
      case 'g.ready': return ps.setReady(!!msg.ready);
      case 'g.emote': return this.emote(ps, msg.id);
      // 对局内聊天 / 弹幕（`cyanfish.chat`，docs/MODS.md §4.20）：这局里的真人都能发，默认关闭。
      case 'g.danmaku': return this.chat(ps, msg.text);
      // playerId: the player tapped (a shared field names two) — the watch preference (item 56)
      case 'g.watch': return this.watch(ps, msg.fieldId, msg.playerId ?? null);
      case 'g.autoplay': return this.setAutoplay(ps, !!msg.on);
      case 'g.pause': return this.setPause(ps, !!msg.on);
      // the stats the board's units start their next battle with (the detail card in prep, user playtest #4 item 7)
      case 'g.unitStats': return this.unitStats(ps, msg.seq ?? null);
      case 'g.debug': return this.debugIntent(ps, msg.action, msg.value, msg.id, msg.list);
      case 'g.leave': this.onLeave(ps.playerId); return OK;
      case 'b.progress': return this._onProgress(ps, msg);
      case 'b.result': return this._onResult(ps, msg);
      default: return fail(ERR.BAD_MSG);
    }
  }

  emote(ps, id) {
    if (!EMOTES.includes(id)) return fail(ERR.BAD_MSG, 'unknown emote');
    const now = this.sched.now();
    if (now - ps.lastEmoteAt < EMOTE_COOLDOWN_MS) return fail(ERR.RATE);
    ps.lastEmoteAt = now;
    this.broadcast({ t: 'm.emote', playerId: ps.playerId, id });
    // an AI teammate can react to a human's emote (enabled by default: server/match/botEmotes.js, SP_BOT_EMOTES=0 silences it)
    onHumanEmote(this, ps.playerId, id);
    return OK;
  }

  /**
   * `g.danmaku { text }` — 对局内聊天 / 弹幕（`cyanfish.chat`，docs/MODS.md §4.20）。
   *
   * ★★ **默认（没装 Mod）一律被拒**，而且是**结构性**的：`readChat(this.gd.config)` 在
   *   `config.chat` 缺失 / `enabled !== true` 时返回冻结的 `CHAT_DEFAULTS`（`enabled: false`）
   *   ⇒ 第一条闸门就 `return`。基座没有任何一条路径能在缺配置时给出这条能力。
   *
   * 七道闸门（顺序有意：先"这台服开没开"、再"这间房开没开"、再"你是谁"、最后才是内容与频率）：
   *   ① `config.chat.enabled === true` —— **管理员口径的"全局关闭"**（关掉它 / 卸载本 Mod 即整条缝关闭）。
   *   ② `denyRooms` 命中本房间码 —— 管理员口径的"按房间关闭"。
   *   ③ `chatSenderAllowed(ps)` —— **这局里的真人**（在座玩家含房主 / 已被淘汰仍在局的 / 观战席）；
   *      AI 与已经离开的人一律 `WRONG_PHASE`，口径写在 server/match/chat.js 的注释里。
   *   ④ 正文 `sanitizeChatText`：控制字符 → 空格、零宽/双向控制字符 → 删除、空白折叠、两端去空白；
   *      空 / 纯空白 ⇒ `BAD_MSG`（**绝不发一条空消息**）。
   *   ⑤ `chatLength(body) <= ch.maxLen`（**码位**数）⇒ 超长 `BAD_MSG`。★ 服务端强制；客户端的
   *      `maxLength` 只是体验（协议层另有一条更宽的结构上限 `DANMAKU_MAX_LEN`）。
   *   ⑥ `chatBlocked(body, ch.blockWords)` ⇒ `BAD_MSG`。词表默认空 ⇒ 这一条永远过（"先不做内容审查"
   *      不等于"做不到"：管理员往数据里加词即生效，不需要改代码、不需要新协议）。
   *   ⑦ 频率：同一发送者的滑动窗口（`cooldownMs` + `burst`/`burstWindowMs`）与**整间房**的滑动窗口
   *      （`roomBurst`/`roomWindowMs`）⇒ `RATE`。★ 只有**接受**的那一条才记时间戳。
   *
   * ★ 为什么不落盘：聊天是**瞬时**的。本方法只 `this.broadcast` 一次 —— 不写任何文件、不进存档、
   *   不进 `m.public` / `m.result`、不参与重连重放（`ctx.lastPublic` / `ctx.results` 都不碰它）。
   * ★ 为什么把名字放进帧里是错的：观战席的 stand-in（watch.js 的 `_spectator()`）是 `Object.freeze` 的、
   *   **没有 `name` 字段**；而客户端本来就有权威来源（`room.state.spectators` / `m.public.players`）
   *   ⇒ 帧里只带 `playerId`（§4.6 纪律 1：不要为同一个事实造第二份真相）。
   *
   * ★ 线格式消息名仍是 `g.danmaku` / `m.danmaku`：它们是**协议常量**，改名会同时动
   *   `shared/protocol.js` 的 C2S/S2C 表与所有客户端 —— 收益只是好看，不值得（登记在 §4.20）。
   *
   * @param {any} ps 发起这条消息的 PlayerState 或观战席 stand-in
   * @param {any} text 协议层已做过结构校验的正文（`g.danmaku.text`）
   * @returns {{ ok: true } | { error: string, detail?: string }}
   */
  chat(ps, text) {
    const ch = readChat(this.gd.config);
    if (!ch.enabled) return fail(ERR.WRONG_PHASE, 'chat: config.chat.enabled is not true');
    if (Array.isArray(ch.denyRooms) && ch.denyRooms.includes(this.roomCode)) return fail(ERR.WRONG_PHASE, 'chat: disabled for this room');
    if (!chatSenderAllowed(ps)) return fail(ERR.WRONG_PHASE, 'chat: human players in this match only');
    const body = sanitizeChatText(text);
    if (!body) return fail(ERR.BAD_MSG, 'chat: empty');
    const len = chatLength(body);
    if (len > ch.maxLen) return fail(ERR.BAD_MSG, `chat: too long (${len} > ${ch.maxLen} chars)`);
    if (chatBlocked(body, ch.blockWords)) return fail(ERR.BAD_MSG, 'chat: blocked by the keyword filter');
    const now = this.sched.now();
    // 两张滑动窗口表都**懒建**在 Match 实例上：不去改 Match.js 的字段表，也不给观战席那条冻结的
    // stand-in 挂属性（它是 Object.freeze 的，挂不上）。表最多长到「座位数 + 观战席数」，一局的生命周期。
    if (!this._chatRate) this._chatRate = new Map();
    if (!this._chatRoom) this._chatRoom = [];
    const mine = pruneWindow(this._chatRate.get(ps.playerId) || [], now, ch.burstWindowMs);
    this._chatRate.set(ps.playerId, mine);
    if (mine.length && now - mine[mine.length - 1] < ch.cooldownMs) {
      return fail(ERR.RATE, `chat: at least ${ch.cooldownMs} ms between two messages`);
    }
    if (mine.length >= ch.burst) return fail(ERR.RATE, `chat: at most ${ch.burst} per ${ch.burstWindowMs} ms`);
    const room = pruneWindow(this._chatRoom, now, ch.roomWindowMs);
    if (room.length >= ch.roomBurst) return fail(ERR.RATE, `chat: room at most ${ch.roomBurst} per ${ch.roomWindowMs} ms`);
    mine.push(now);
    room.push(now);
    // 广播给该对局的**所有**客户端：在座玩家 + 观战席（含发送者自己）。
    this.broadcast({ t: 'm.danmaku', playerId: ps.playerId, text: body });
    return OK;
  }

  setAutoplay(ps, on) {
    if (ps.autoplay === on) return OK;
    ps.autoplay = on;
    this.markPublic();
    if (on) this.kickBot(ps);
    return OK;
  }

  /**
   * `g.debug { action, value?, id? }` — 控制台调试（**测试服专用**；数据接缝 `config.debug`，见 server/match/debug.js）。
   *
   * 动作全集（★ 全部是"可回滚的接缝"：每个动作只调**引擎已有的那条落地路径**，不新写规则）：
   *   | 动作 | 参数 | 落地路径（`文件:行`） |
   *   |---|---|---|
   *   | `setRound`      | `value` = 回合号 | `Match.startRound(n)`（`phases.js:255`，重建本波敌人 + 每人 onRoundStart + recompute） |
   *   | `setFunds`      | `value` = 资金   | `ps.addFunds(n - ps.funds)`（`player/economy.js:12`）+ `recompute()` |
   *   | `setLp`         | `value` = 目标生命 | 服务端权威字段 `ps.lp` + `dirty()` + `recompute()`（淘汰判定仍归 `match/settle.js:76-83`） |
   *   | `addLayers`     | `id` = 盟约 id，`value` = 层数 | `ps.addLayers(...)`（`player/economy.js:42`，自己夹 BOND_LAYER_CAP + recompute + dispatch('onLayers')） |
   *   | `grantChess`    | `id` = 干员 id，`value` = 个数 | `ps.acquireChess(id)`（`player/acquire.js:39`）★ 它内部走 `poolOf(base).take` ⇒ 池账本守恒 |
   *   | `grantItem`     | `id` = 装备 id，`value` = 个数 | `ps.acquireItem(id)`（`player/acquire.js:285`） |
   *   | `equipItem`     | `id` = 装备 id，`value` = 目标干员 uid | `ps.acquireItem`（缺则先发一件）+ `ps.equip(...)`（`player/items.js:21`，含 `_gate` / 合并 / 替换） |
   *   | `setWave`       | `id` = 敌人 key，`value` = 个数 | `Match.debugSetWaveSpawns`（`match/combat.js`，改 `this.wave.spawns` ⇒ `_normalOpts` 组的 spec 就是它） |
   *   | `setEnemyScale` | `value` = 百分比（100 = ×1） | 每局 `GameData.debugScaleMul`（`gamedata.js` 的 `enemyScale(r)` 唯一读它）+ 重建本波 |
   *   | `rebuildWave`   | 无 | 官方 `buildNormalWave` / `_planBossWaves`（`waves.js:367` / `phases.js:295`）—— `setWave` / `setEnemyScale` 的"撤销" |
   *   | `applyChoice`   | `id` = 悬赏/战术卡 id | `applyCard(m, ps, card)`（`choices.js:446`）—— **与"玩家在悬赏回合选了那张卡"逐字同一条路** |
   *   | `clearChoice`   | `id` = 卡 id（缺省 = 清掉全部调试卡） | 摘掉该卡的常驻 EffectRef（= `effectsMeta.ctx.removeEffect` 的实现）与悬赏条目 + `recompute()` |
   *
   * ★★ 工序 115 追加的三个动作（同一条闸门、同一套落点纪律 —— 每个都只调**引擎已有的那条**落地路径）：
   *   | 动作 | 参数 | 落地路径 |
   *   |---|---|---|
   *   | `setEnemyAttr` | `id` = `hp/atk/def/res/speed/aspd`，`value` = 千分比（`0` = 还原这一项） | 每局 `GameData.debugAttrMul`（`gamedata.js`，`enemyScale(r)` 唯一读它的地方）+ 重建本波 |
   *   | `setLayers`    | `id` = 盟约 id，`value` = 目标层数（`0` = 归零） | `ps.setLayers(...)`（`player/economy.js`，与 `addLayers` 同一组副作用：夹 `BOND_LAYER_CAP` + `recompute` + `dispatch('onLayers')`） |
   *   | `setWaveList`  | `list` = `["<enemyKey>:<count>", …]` | `Match.debugSetWaveList`（`match/combat.js`，与工序 87 的 `setWave` 同一段落点逻辑） |
   *   ★ 为什么 `setLayers` 需要一条新的引擎入口：官方只有 `addLayers`（只增不减、夹在 `BOND_LAYER_CAP`）⇒
   *     "归零 / 减层"在引擎里**没有**任何落地路径（docs/MODS.md §4.11 的「明确不做」原本登记着这一条）。
   *     `ps.setLayers` 把同一组副作用（recompute + onLayers）用在"设成给定值"上，**不绕过账本**，也不直接写 `ps.bonds`。
   *
   * ★★ **双重闸门**（顺序有意：先说"这局不行"、再说"这台服不行"）：
   *   ① `debugAllowed(this)` = `Match.loneHuman` —— **仅单人 / 全 AI**（solo 房，或同盟房只有 1 名真人 + AI 队友）。
   *      不满足 ⇒ `ERR.WRONG_PHASE`（先例：`g.pause`，shared/protocol.js 的 "solo matches only, co-op ⇒ WRONG_PHASE"）。
   *   ② `readDebug(this.gd.config).enabled` —— 数据里**显式**写了 `debug.enabled === true` 才开。
   *      **没装 Mod ⇒ 缺省 false ⇒ 本条消息一律 fail** —— 基座与官方逐值相同。
   *   两个都过之后才看 ③ 动作名在 `actions` 白名单里、④ 每个动作自己的参数（协议层只做结构校验）。
   *
   * ★ 为什么每个动作都**不改**引擎之外的任何东西：全部落在官方方法上（见上表）。**绝不**直接赋值
   *   `this.round` / `ps.funds` / `ps.layers`（那会留下未刷新的商店价格、详情卡、盟约效果与未重建的波次 ——
   *   见 39 号报告 §8 第 6/7 条）。唯一的"直接赋值"是 `ps.lp`（引擎里**没有**任何 setLp 入口）与
   *   `GameData.debugScaleMul`（本局私有的调试格），两者都写明在注释里。
   *
   * ★ `setRound` / `setEnemyScale` / `setWave` / `rebuildWave` **只在 PREP / ROUND_START 允许**：39 号报告 §8 第 6 条
   *   点明在 COMBAT / FINAL_ASSAULT 中途强调 `startRound` **可能**留下未取消的 field timer
   *   （`_stopClientCombat` / `_clearFieldTimers` 不会被它自动调用）。MVP 起就选择保守：不冒这个风险。
   *
   * @param {any} ps 发起这条消息的 PlayerState
   * @param {any} action 动作名（未知 ⇒ WRONG_PHASE + detail）
   * @param {any} value 动作参数（整数；要/不要由动作自己判）
   * @param {any} id 动作参数（字符串标识：干员 / 装备 / 盟约 / 敌人 / 卡 id）
   * @param {any} list `setWaveList` 的整波敌人清单（`g.debug.list`；其余动作不带）
   */
  debugIntent(ps, action, value, id, list) {
    if (!debugAllowed(this)) return fail(ERR.WRONG_PHASE, 'debug: not a lone-human match');
    const debug = readDebug(this.gd.config);
    if (!debug.enabled) return fail(ERR.WRONG_PHASE, 'debug: config.debug.enabled is not true');
    if (!debugActionAllowed(debug, action)) return fail(ERR.WRONG_PHASE, `debug: action not allowed: ${String(action)}`);
    switch (action) {
      case 'setRound': return this._debugSetRound(value);
      case 'setFunds': return this._debugSetFunds(ps, value);
      case 'setLp': return this._debugSetLp(ps, value);
      case 'addLayers': return this._debugAddLayers(ps, id, value);
      case 'setLayers': return this._debugSetLayers(ps, id, value);
      case 'grantChess': return this._debugGrant(ps, id, value, 'chess');
      case 'grantItem': return this._debugGrant(ps, id, value, 'item');
      case 'equipItem': return this._debugEquip(ps, id, value);
      case 'setWave': return this._debugSetWave(id, value);
      case 'setWaveList': return this._debugSetWaveList(list);
      case 'setEnemyScale': return this._debugSetEnemyScale(value);
      case 'setEnemyAttr': return this._debugSetEnemyAttr(id, value);
      case 'rebuildWave': return this._debugRebuildWave();
      case 'applyChoice': return this._debugApplyChoice(ps, id);
      case 'clearChoice': return this._debugClearChoice(id);
      default: return fail(ERR.WRONG_PHASE, `debug: action not implemented: ${String(action)}`);
    }
  }

  /** `setRound(n)`：跳到第 n 回合并重建这一波的敌人（PREP / ROUND_START only）。 */
  _debugSetRound(n) {
    if (!this._debugPrepPhase('setRound')) return fail(ERR.WRONG_PHASE, 'debug: setRound needs PREP / ROUND_START');
    const max = readDebug(this.gd.config).maxRound ?? DEBUG_LIMITS.maxRound;
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    if (n < 1 || n > max) return fail(ERR.BAD_TARGET, `debug: round out of range 1..${max}`);
    // ★ 先过闸门再动状态：`startRound` 会重建 wave、清 fields/watchers/unitePlan、跑每人的 onRoundStart 与 recompute。
    this.startRound(n);
    return OK;
  }

  /** `setFunds(n)`：把本人资金设为恰好 n（走官方经济系统，绕开会提前返回的 `n === 0` 分支）。 */
  _debugSetFunds(ps, n) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    const max = readDebug(this.gd.config).maxFunds ?? DEBUG_LIMITS.maxFunds;
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    if (n < 0 || n > max) return fail(ERR.BAD_TARGET, `debug: funds out of range 0..${max}`);
    const delta = n - ps.funds;
    if (delta !== 0) ps.addFunds(delta, { reason: 'debug' });
    // addFunds 对 n === 0 **原样返回**（`if (!Number.isFinite(n) || n === 0) return 0`）⇒ 归零要自己落一下，
    // 否则"把资金设成 0"会静默失效（资金只能加到 0 以上、减到 0 只能靠这条分支）。
    if (ps.funds !== n) { ps.funds = n; ps.dirty(); }
    ps.recompute();
    return OK;
  }

  /**
   * `setLp(n)`：把本人的**目标生命**（服务端权威 `ps.lp`，`PlayerState.js:152`）设为 n。
   *
   * ★ 引擎里没有任何 setLp 入口 ⇒ 这里直接落字段 + `dirty()` + `recompute()`（`recompute` 会按新 LP 重算
   *   deployCap 等派生量）。**淘汰判定仍然只归 `match/settle.js`**：把 LP 设成 1 之后照样要等漏怪结算才会淘汰。
   * ★ 上界 1 是**不变量**要求，不是保守：`server/match/invariants.js:61` 明写"活着的玩家 `lp <= 0`"是违规
   *   （`alive with lp`）⇒ 想淘汰只能让敌人漏进来，控制台不给 0。
   * ★ 干员血量（对局内单位血）**不在这一条**：那是客户端权威（39 号报告 §1 第 5/5b 项），服务端改不动。
   */
  _debugSetLp(ps, n) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    const max = readDebug(this.gd.config).maxLp ?? DEBUG_LIMITS.maxLp;
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    if (n < 1 || n > max) return fail(ERR.BAD_TARGET, `debug: lp out of range 1..${max}`);
    ps.lp = n;
    ps.dirty();
    ps.recompute();
    return OK;
  }

  /**
   * `addLayers(bondId, n)`：给本人某条盟约**加 n 层**。
   * ★★ **只走官方 `PlayerState.addLayers`**（`player/economy.js:42-52`）：它自己夹 `BOND_LAYER_CAP`、
   *   自己 `recompute()`、自己 `dispatch('onLayers')` —— 详情卡 / 盟约效果 / 不变量（`invariants.js:160-163`
   *   要求 `ps.bonds` 等于新算的 `computeBonds`）因此全部同步。**绝不**直接写 `ps.layers`。
   * ★ `requireActive: false` 与官方"盟誓"卡（`choices.js:489`）同口径：**无需激活**也能加层；加完若该盟约的
   *   人数/激活条件成立，`recompute()` 会把它点亮。
   * ★ 引擎**没有**任何"减层"入口（`layerGainRoom` 只夹增益、战斗内的 gains 也只有加）⇒ 本动作只做加，
   *   见 `docs/MODS.md` §4.11 与报告 87 的"未做"一节。
   */
  _debugAddLayers(ps, bondId, n) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    if (typeof bondId !== 'string' || !bondId || !this.gd.bond(bondId)) return fail(ERR.BAD_TARGET, `debug: unknown bond ${String(bondId)}`);
    const max = readDebug(this.gd.config).maxLayers ?? DEBUG_LIMITS.maxLayers;
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    if (n < 1 || n > max) return fail(ERR.BAD_TARGET, `debug: layers out of range 1..${max}`);
    const added = ps.addLayers(bondId, n, { requireActive: false, reason: 'debug' });
    return added > 0 ? OK : fail(ERR.BAD_TARGET, `debug: ${bondId} is at the layer cap`);
  }

  /**
   * `grantChess(chessId, count?)` / `grantItem(itemId, count?)`：直发指定干员 / 装备到本人手上。
   * ★★ 干员走官方 **`ps.acquireChess`**（`player/acquire.js:39-65`）⇒ 它内部
   *   `this.poolOf(base).take(base, need)`（共享池或自选股）⇒ **池账本守恒**（`test/match/fuzz.test.js` +
   *   `invariants.js:197-202` 的 `left + Σ held == cap` 不会被打破）；手牌满 / 该合并时它也照官方的合并与溢出规则走。
   * ★ 装备走官方 **`ps.acquireItem`**（`player/acquire.js:285-302`）⇒ 两件同名装备照样自动合成精锐装备。
   * @param {'chess'|'item'} kind
   */
  _debugGrant(ps, id, count, kind) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    const n = count == null ? 1 : count;
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    const max = readDebug(this.gd.config).maxCount ?? DEBUG_LIMITS.maxCount;
    if (n < 1 || n > max) return fail(ERR.BAD_TARGET, `debug: count out of range 1..${max}`);
    if (typeof id !== 'string' || !id) return fail(ERR.BAD_TARGET, `debug: unknown ${kind} ${String(id)}`);
    const rec = kind === 'chess' ? ps.gd.chess(id) : ps.gd.item(id);
    // 自选槽（isDiy）没填干员时没有 body：官方也拒绝（acquireChess 的第一行）
    if (!rec || (kind === 'chess' && rec.isDiy && !rec.diyFor)) return fail(ERR.BAD_TARGET, `debug: unknown ${kind} ${id}`);
    let got = 0;
    for (let i = 0; i < n; i++) {
      const piece = kind === 'chess' ? ps.acquireChess(id, { source: 'debug' }) : ps.acquireItem(id, { source: 'debug' });
      if (!piece) break;
      got++;
    }
    ps.recompute();
    if (!got) return fail(ERR.HAND_FULL, kind === 'chess' ? 'debug: no room for the operator' : 'debug: no room for the item');
    return OK;
  }

  /**
   * `equipItem(itemId, targetUid)`：让**指定的那个单位**带上**指定的装备** —— 手上已有同名装备就用它，
   * 没有就先按官方路径发一件（`acquireItem`），然后走官方 **`ps.equip`**（`player/items.js:21-73`）。
   * ★ 走官方 `equip` 意味着：`_gate()`（存活 / PREP / 未准备）、消耗型装备的结算、满槽替换、同名合成、
   *   `dispatchItem('onEquip')` 全部照官方语义 —— 一处都不绕。
   * ★ 目标用 **uid**（`g.equip` 本来就按 uid 认人），面板从 `m.private.hand/board/temp` 里列出来给服主选。
   */
  _debugEquip(ps, itemId, targetUid) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    if (!Number.isInteger(targetUid)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    const rec = typeof itemId === 'string' && itemId ? ps.gd.item(itemId) : null;
    if (!rec) return fail(ERR.BAD_TARGET, `debug: unknown item ${String(itemId)}`);
    if (rec.itemType !== 'EQUIP') return fail(ERR.BAD_TARGET, `debug: ${itemId} is not equipment`);
    const tloc = ps.find(targetUid);
    if (!tloc || tloc.piece.kind !== 'chess') return fail(ERR.BAD_TARGET, `debug: unknown chess uid ${targetUid}`);
    let slot = [...ps.hand, ...ps.temp].find((p) => p && p.kind === 'item' && p.id === itemId) || null;
    if (!slot) {
      slot = ps.acquireItem(itemId, { source: 'debug' });
      if (!slot) return fail(ERR.HAND_FULL, 'debug: no room for the item');
    }
    return ps.equip(slot.uid, targetUid, null);
  }

  /**
   * `setWave(enemyKey, count?)`：把**本波**敌人整波换成 count 个 enemyKey（PREP / ROUND_START only）。
   * 落地在 `Match.debugSetWaveSpawns`（`match/combat.js`），改的是 `this.wave.spawns` —— `_normalOpts` 组 spec 的
   * 同一个对象。★ 只在**普通回合**可用（boss / 隐秘核心的波次来自 `_planBossWaves`，另有一套结构）。
   * ★ 下一回合 `startRound` 会整波重建 ⇒ 覆盖**自动失效**，不需要手动撤销（要立刻还原用 `rebuildWave`）。
   */
  _debugSetWave(enemyKey, count) {
    if (!this._debugPrepPhase('setWave')) return fail(ERR.WRONG_PHASE, 'debug: setWave needs PREP / ROUND_START');
    if (typeof enemyKey !== 'string' || !enemyKey || !this.gd.enemy(enemyKey)) return fail(ERR.BAD_TARGET, `debug: unknown enemy ${String(enemyKey)}`);
    const n = count == null ? 1 : count;
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    const max = readDebug(this.gd.config).maxCount ?? DEBUG_LIMITS.maxCount;
    if (n < 1 || n > max) return fail(ERR.BAD_TARGET, `debug: count out of range 1..${max}`);
    if (!this.wave) return fail(ERR.WRONG_PHASE, 'debug: this round has no normal wave');
    if (!this.debugSetWaveSpawns(enemyKey, n)) return fail(ERR.WRONG_PHASE, 'debug: setWave needs a normal round');
    this._debugMarkWave();
    return OK;
  }

  /**
   * ★★ 工序 115：`setLayers(bondId, n)` —— 把某条盟约的层数**设为恰好 `n`**（`0` = 归零，`BOND_LAYER_CAP` = 满）。
   *
   * ★ 与 `addLayers` 的差别只在"加"与"设"：`addLayers` 是官方唯一入口（只增、夹 cap），而调试面板需要
   *   "归零 / 减层 / 一键满"。这里走 `ps.setLayers`（`player/economy.js`）—— 它复刻 `addLayers` 的
   *   **全部副作用**（夹 `BOND_LAYER_CAP` + `recompute()` + `dispatch('onLayers')`），因此 `ps.bonds`、
   *   详情卡、盟约效果与 `invariants.js`（`0 ≤ layers ≤ cap` 且 `ps.bonds` 等于重算值）同时成立。
   *   **绝不**直接写 `ps.layers` / `ps.bonds`（旧口径里这一条是"明确不做"，工序 115 由服主点名开闸）。
   * ★ 层数 0 是**合法**值（本来就只有 `addLayers` 到不了 0）；`value` 缺省 ⇒ 报 BAD_MSG。
   * ★ 本动作**不需要** PREP 阶段：它与 `addLayers` 同级（改的是本人备战期数据，不重建波次）。
   */
  _debugSetLayers(ps, bondId, n) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    if (typeof bondId !== 'string' || !bondId || !this.gd.bond(bondId)) return fail(ERR.BAD_TARGET, `debug: unknown bond ${String(bondId)}`);
    if (!Number.isInteger(n)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    // 上界 = 官方层数天花板与数据防呆上限的**较小者**（`config.debug.maxLayers`，缺省走 DEBUG_LIMITS）——
    // 调试面板的「MAX」按钮送的就是这个上界（本 Mod 的数据把它设成 BOND_LAYER_CAP，所以 MAX 真的是满）。
    const cap = Math.min(BOND_LAYER_CAP, readDebug(this.gd.config).maxLayers ?? DEBUG_LIMITS.maxLayers);
    if (n < 0 || n > cap) return fail(ERR.BAD_TARGET, `debug: layers out of range 0..${cap}`);
    if (!ps.setLayers(bondId, n)) return fail(ERR.BAD_TARGET, `debug: cannot set layers of ${bondId}`);
    return OK;
  }

  /**
   * ★★ 工序 115：`setEnemyAttr(attr, permille)` —— 按属性设**本波所有敌人**的绝对加成倍率。
   *
   * 落点是每局 `GameData.debugAttrMul`（`gamedata.js`，由官方唯一的 `enemyScale(r)` 读，然后经
   * `waves.roundMods` 进 spawn mods）。`attr` 取 `hp / atk / def / res / speed / aspd`（`debug.js` 的
   * `DEBUG_ATTRS`），`permille` = 千分比（`2000` = ×2，范围见 `DEBUG_ATTR_PERMILLE`）。
   *   * `permille === 0` ⇒ **还原**这一项（删掉它 ⇒ 该属性回到本回合官方值）；
   *   * 六项都还原 ⇒ 整格设回 `null` ⇒ `enemyScale` 又走"直接 return base"的上游路径。
   * ★ 与 `setEnemyScale`（整波一个总倍率、相对乘）的区别：这里是**绝对**的 —— 面板上显示什么，敌人就吃那个数。
   * ★ 逐项改动**只作用于这一局、这一波**（下一回合 `startRound` 整波重建会用新的加成算，覆盖本身仍在）。
   * ★ 与 `setEnemyScale` 一样只在 PREP / ROUND_START 允许：它要重建本波才立刻可见，而重建有阶段约束。
   */
  _debugSetEnemyAttr(attr, permille) {
    if (!this._debugPrepPhase('setEnemyAttr')) return fail(ERR.WRONG_PHASE, 'debug: setEnemyAttr needs PREP / ROUND_START');
    if (typeof attr !== 'string' || !Object.hasOwn(DEBUG_ATTRS, attr)) return fail(ERR.BAD_TARGET, `debug: unknown enemy attribute ${String(attr)}`);
    if (!Number.isInteger(permille) || permille < 0) return fail(ERR.BAD_MSG, 'debug: value must be a non-negative integer');
    const entry = debugAttrEntry(attr, permille);
    // ★ 不夹取越界值：明确拒（0 与 DEBUG_ATTR_PERMILLE 之内才算数）
    if (!entry) return fail(ERR.BAD_TARGET, `debug: attribute permille out of range 0 or ${DEBUG_ATTR_PERMILLE.min}..${DEBUG_ATTR_PERMILLE.max}`);
    const next = { ...(this.gd.debugAttrMul || {}) };
    if (entry.mul === null) delete next[entry.key];
    else next[entry.key] = entry.mul;
    this.gd.debugAttrMul = Object.keys(next).length ? Object.freeze(next) : null;
    return this._debugRebuildWave();
  }

  /**
   * ★★ 工序 115：`setWaveList(list)` —— 把**本波**敌人整波换成清单里的每一条（同波可以有多种敌人）。
   *
   * `list`（`g.debug.list`）是 `["<enemyKey>:<count>", …]`，已在协议层过结构校验，这里再用
   * `debugWaveList` 归一化（按 key 合并、count 夹到 `1..maxCount`、`0` 的条目丢掉）。落点是
   * `Match.debugSetWaveList`（`match/combat.js`）—— 与工序 87 的 `setWave` 同一段落点逻辑。
   * ★ 空清单 = 这一波没有敌人（合法的调试局面）；敌人 key 不存在 ⇒ BAD_TARGET（不做部分应用，避免"改了一半"）。
   * ★ 与 `setWave` / `setEnemyScale` 同样只在 PREP / ROUND_START 允许。
   */
  _debugSetWaveList(list) {
    if (!this._debugPrepPhase('setWaveList')) return fail(ERR.WRONG_PHASE, 'debug: setWaveList needs PREP / ROUND_START');
    if (!Array.isArray(list)) return fail(ERR.BAD_MSG, 'debug: setWaveList needs a list');
    const max = readDebug(this.gd.config).maxCount ?? DEBUG_LIMITS.maxCount;
    const want = debugWaveList(list, max);
    for (const it of want) {
      if (!this.gd.enemy(it.enemyKey)) return fail(ERR.BAD_TARGET, `debug: unknown enemy ${it.enemyKey}`);
    }
    if (list.length > DEBUG_LIMITS.waveList) return fail(ERR.BAD_TARGET, `debug: wave list longer than ${DEBUG_LIMITS.waveList}`);
    if (!this.wave) return fail(ERR.WRONG_PHASE, 'debug: this round has no normal wave');
    if (!this.debugSetWaveList(want)) return fail(ERR.WRONG_PHASE, 'debug: setWaveList needs a normal round');
    this._debugMarkWave();
    return OK;
  }

  /**
   * `setEnemyScale(percent)`：把**本局**敌人属性加成乘上 `percent / 100`（`100` = 撤销覆盖、回到上游）。
   * ★ 落点是**每局一个** `GameData` 实例上的 `debugScaleMul`（`gamedata.js`），由官方唯一读它的
   *   `enemyScale(r)` 生效 —— 数据层的 `config.debug.enemyScaleOverride` 是同一处的另一档（两者相乘）。
   * ★ 波浪里的加成是在 `startRound` 烘进 `mods` 的 ⇒ 设完必须**重建本波**才立刻可见（否则要等下一回合）。
   *   `percent === 100` 时把这一格**设回 `null`**，于是 `enemyScale` 走的又是"直接 return base"的上游路径。
   */
  _debugSetEnemyScale(percent) {
    if (!this._debugPrepPhase('setEnemyScale')) return fail(ERR.WRONG_PHASE, 'debug: setEnemyScale needs PREP / ROUND_START');
    if (!Number.isInteger(percent)) return fail(ERR.BAD_MSG, 'debug: value must be an integer');
    if (percent < 1 || percent > 1000) return fail(ERR.BAD_TARGET, 'debug: scale percent out of range 1..1000');
    this.gd.debugScaleMul = percent === 100 ? null : percent / 100;
    return this._debugRebuildWave();
  }

  /**
   * `rebuildWave()`：按当前的敌人加成**重新生成这一波**（官方 `buildNormalWave` / `_planBossWaves`）。
   * 这就是 `setWave` 的"撤销" —— 官方波次组成会回来（同一回合 + 同一份 schedule ⇒ 组成与原波一致，
   * 见 `waves.js roundPick` 走 `picks[round]`、`templateSpawns` 不抽随机）。
   */
  _debugRebuildWave() {
    if (!this._debugPrepPhase('rebuildWave')) return fail(ERR.WRONG_PHASE, 'debug: rebuildWave needs PREP / ROUND_START');
    const r = this.round;
    if (r === this.gd.bossRound || r === this.gd.hiddenRound) this._planBossWaves();
    else this.wave = buildNormalWave(this.gd, this.rngWaves, this.factions, r);
    this._debugMarkWave();
    return OK;
  }

  /** 当前的阶段能不能动"这一波"（PREP / ROUND_START）。 */
  _debugPrepPhase(label) {
    void label;
    return this.phase === PHASE.PREP || this.phase === PHASE.ROUND_START;
  }

  /** 改完这一波之后把两路视图标脏（`m.private.nextEnemies` 是每人一份的 PREP 预览）。 */
  _debugMarkWave() {
    this.markPublic();
    for (const ps of this.order) this.markPrivate(ps);
  }

  /**
   * `applyChoice(cardId)`：把一张**悬赏 / 战术决策**卡的效果发给本人（`team: true` 的卡按官方语义同时发给所有
   * 存活的队友 —— "若存在其他队友则他们也获得"）。
   *
   * ★★ **就是"玩家在悬赏回合选了那张卡"那条路**：`choices.js applyCard(m, ps, card)`（`:446`）——
   *   先跑注册的 `choice:<id>` content handler（`server/sim/content/choices.js` 的 `TACTIC` / `BOUNTY`），
   *   没注册才退到家族默认（`applyDefault`）。**没有一行**是这里新写的 buff 逻辑。
   * ★ 卡对象按官方构造器拼：战术卡 = `choices.js tacticCard(c)`（`:381`），悬赏卡 = `bountyCard(gd, c)`（`:217`）。
   * ★ 作用域照官方：战术卡的 `team` 来自**数据**（`choices.json cards.tactic[].team`），由 `applyCard` 决定发
   *   给谁；悬赏卡只落在发起人自己身上（`addBounty`）。两者都不扩大、不缩小。
   * ★ 可撤销性见 `clearChoice`：**常驻效果**（EffectRef / 悬赏条目）可摘；**立即结算**的部分（发装备 / 加层 /
   *   加钱 / 免费刷新 / 发干员 / 改布防设备）在官方语义里就是一次性的，本动作**不假装**能回滚它们。
   */
  _debugApplyChoice(ps, cardId) {
    if (!ps.alive) return fail(ERR.ELIMINATED, 'debug: player eliminated');
    if (typeof cardId !== 'string' || !cardId) return fail(ERR.BAD_TARGET, 'debug: applyChoice needs a card id');
    const card = debugChoiceCard(this.gd, cardId);
    if (!card) return fail(ERR.BAD_TARGET, `debug: unknown choice card ${cardId}`);
    applyCard(this, ps, card);
    return OK;
  }

  /**
   * `clearChoice(cardId?)`：撤销 `applyChoice` 施加的**常驻**部分（给的那张卡；缺省 = 本局所有调试卡）。
   *
   * 摘两样东西（都在**所有玩家**身上找，因为 `team` 卡会发给队友）：
   *   ① `ps.effects` 里 `data.effectId === cardId` 的常驻 EffectRef —— 与引擎自己的
   *      `effectsMeta.ctx.removeEffect(id)` 是同一件事（`ps.effects.splice`），战斗输入
   *      （`player/round.js:142` 的 `playerEffects`）下一场就不带它了；
   *   ② `ps.bounties` 里同 `effectId` 的悬赏条目（敌人不再来了）。
   * 另外把该 ref 带进来的**布防设备别名**（地形卡）从 `ps.deviceOverrides` 里删掉 —— 别名键的判据用引擎自己的
   * 约定（`choices.js:524`：别名含 `#`）。删掉 = 回到"没有覆盖"的官方默认。
   * @param {string|undefined} cardId
   */
  _debugClearChoice(cardId) {
    const want = typeof cardId === 'string' && cardId ? cardId : null;
    if (cardId != null && want == null) return fail(ERR.BAD_TARGET, 'debug: clearChoice id must be a non-empty string');
    let removed = 0;
    for (const p of this.players.values()) {
      const keep = [];
      let hitEffects = false;
      for (const e of p.effects || []) {
        if (isDebugChoiceRef(this.gd, e, want)) {
          hitEffects = true;
          removed++;
          for (const key of Object.keys(e.params || {})) {
            if (key.includes('#')) { delete p.deviceOverrides[key]; p.invalidateDeployMap(); }
          }
          continue;
        }
        keep.push(e);
      }
      if (hitEffects) { p.effects = keep; p.dirty(); }
      const b0 = p.bounties.length;
      if (b0) {
        p.bounties = p.bounties.filter((b) => !(b && b.card && (want ? b.card.effectId === want : typeof b.card.effectId === 'string')));
        if (p.bounties.length !== b0) { removed += b0 - p.bounties.length; p.dirty(); }
      }
      if (hitEffects || p.bounties.length !== b0) p.recompute();
    }
    if (!removed) return fail(ERR.BAD_TARGET, want ? `debug: nothing to clear for ${want}` : 'debug: nothing to clear');
    return OK;
  }

  /** Let the bot act for a (newly) bot-controlled seat in the current phase. */
  kickBot(ps) {
    if (!ps.botControlled || this.ended) return;
    if (this.phase === PHASE.INFO_CHECK && !ps.infoReady) { ps.infoReady = true; this.markPublic(); this.maybeEndInfo(); }
    else if (this.phase === PHASE.BAND_DRAFT && this.draftTurn() === ps.playerId) this.scheduleBandBot();
    else if (this.phase === PHASE.SP_DRAFT && this.spTurn() === ps.playerId) this.scheduleSpBot();
    else if (this.phase === PHASE.PREP && ps.alive && !ps.ready) this.scheduleBotPrep(ps, 0);
  }

  /**
   * g.unitStats { seq? } (user playtest #4 item 7: the detail card showed fixed record stats): the stats every unit of
   * the player's board will fight with at the start of its next battle — equipment, bonds and their layers, 特质, the
   * band and 机变 effects — computed exactly by the shared sim. The player's battle input after the onBattleStart meta
   * handlers (`ev.preview: true`, no enemies — those handlers must not change the match for a preview) builds a Battle
   * of the battle's options that is started (initial deployment + battleStart hooks), read and dropped: it is never
   * stepped: deployment skills contribute their initial stats but their timers do not advance. No SP / skill timer is
   * sent, and the real battle gets fresh units. Pushed to the player as `m.unitStats { seq, round, units }`
   * (units: shared/protocol.js unitStatsEntry, board operators and summons by uid); cached per input (a build costs
   * ≈ 0.3–0.7 ms). Prep phases only (ROUND_START, 机变, PREP); a battle's live stats come from the browser's own sim.
   * @param {PlayerState} ps @param {number|null} seq echoed (the client keeps the newest answer)
   */
  unitStats(ps, seq = null) {
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (this.phase !== PHASE.ROUND_START && this.phase !== PHASE.SP_DRAFT && this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    const units = this._unitStatsOf(ps);
    this.sendTo(ps.playerId, { t: 'm.unitStats', seq: Number.isInteger(seq) ? seq : null, round: this.round, units });
    return OK;
  }

  /** The start-of-battle stats of a player's board units (see unitStats); [] when the preview battle cannot be built. */
  _unitStatsOf(ps) {
    const input = ps.battleInput({ side: 'L', colOffset: 0 });
    const ev = { input, kind: 'normal', round: this.round, preview: true };
    this.dispatch(ps, 'onBattleStart', ev);
    const players = [ev.input && typeof ev.input === 'object' ? ev.input : input];
    let key = null;
    try { key = JSON.stringify([this.round, this.stageId, this.battleContent, players]); } catch { key = null; }
    if (!this._unitStatsCache) this._unitStatsCache = new WeakMap(); // PlayerState → { key, units } (the last preview)
    const cached = this._unitStatsCache.get(ps);
    if (key && cached && cached.key === key) return cached.units;
    const units = [];
    // the flags of the battle it previews: a normal round gains IN_BATTLE layers from its start (a <战斗开始时> layer gain
    // raises bond stats at t = 0 there too); the Final Assault / Hidden Core fight without (previewed as a normal field)
    const bossRound = this.round === this.gd.bossRound || this.round === this.gd.hiddenRound;
    const b = this.newBattle({
      seed: deriveSeed(this.seed, `preview:${this.round}:${ps.seat}`), kind: 'normal', modeId: this.modeId, round: this.round,
      stageId: this.stageId, rect: { ...GEO.NORMAL_RECT }, timeLimit: 60, players, spawns: [], routes: this.wave ? this.wave.routes : [],
      sharedBoss: null, flags: { layerGainsEnabled: !bossRound, ...this.gd.dp }, fieldId: `n:${ps.playerId}`, recordEvents: false,
    });
    try {
      if (typeof b.start === 'function') b.start();
      for (const u of Array.isArray(b.allyUnits) ? b.allyUnits : []) {
        if (u && Number.isInteger(u.uid) && (u.kind === 'op' || u.kind === 'token')) units.push(unitStatsEntry(u, u.s));
      }
    } catch (e) { this.reportError('unitStats', e); }
    this._unitStatsCache.set(ps, { key, units });
    return units;
  }
}

/**
 * 一张**官方形状**的悬赏 / 战术决策卡（`choices.js` 的 `tacticCard` / `bountyCard` 逐字调用）。
 * 只认本局数据里真有的卡 ⇒ 控制台不可能造出一张官方没有的卡。
 * @param {any} gd @param {string} id 卡的 `effectId`
 * @returns {object|null}
 */
function debugChoiceCard(gd, id) {
  const cards = gd && gd.choices && gd.choices.cards ? gd.choices.cards : {};
  const tactic = Array.isArray(cards.tactic) ? cards.tactic.find((c) => c && c.effectId === id) : null;
  if (tactic) return tacticCard(tactic);
  const bounty = Array.isArray(cards.bounty) ? cards.bounty.find((c) => c && c.effectId === id) : null;
  if (bounty && gd.enemy(bounty.enemyKey)) return bountyCard(gd, bounty);
  return null;
}

/**
 * 这条 EffectRef 是不是"由调试控制台施加的悬赏/战术卡"留下的。
 * 判据是引擎自己的标记：`choices.js addRef`（`:538-543`）与 `content/choices.js applyTactic`（`:277`）都会写
 * `data.effectId`；缺省（`want === null`）还要它确实是本局数据里的一张卡，免得误摘别的系统的 ref。
 * @param {any} gd @param {any} e @param {string|null} want
 */
function isDebugChoiceRef(gd, e, want) {
  const eid = e && e.data && typeof e.data.effectId === 'string' ? e.data.effectId : null;
  if (!eid) return false;
  if (want) return eid === want;
  return !!debugChoiceCard(gd, eid);
}
