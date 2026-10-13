// server/match/match/combat.js — Match methods: the battles of a normal round — Battle construction (newBattle, the
// spawn list sanitised, a player's normal field after the onBattleStart handlers), the COMBAT phase in both modes
// (server-run streaming, client-side combat), the per-field results and the sim-error log, then 联防 or SETTLE.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, GEO } from '../../../shared/constants.js';
import { deriveSeed } from '../../sim/rng.js';
import { withBounties, scaleFor, roundMods, classOf, gateOf, isFlyKey, routeByMotion } from '../waves.js';
import { planUnite } from '../unite.js';
import { FieldRunner, DeadBattle } from '../fields.js';
import { DELAYS } from './common.js';

export class MatchCombat {
  /** Construct a battle; a constructor failure yields a finished stand-in (clean result) and is logged. */
  newBattle(opts) {
    const full = { data: this.ds, content: this.battleContent, logger: this.log, ...opts };
    try {
      return new this.BattleClass(full);
    } catch (e) {
      this.reportError(`battle ${opts.fieldId} construct`, e);
      return new DeadBattle(full, 'forced');
    }
  }

  /**
   * Spawn list of a field after the onBattleStart handlers (which may edit `ev.spawns`): malformed entries are dropped
   * and a kill bounty is copied into `mods.bountyCoins`, so a leaked bounty enemy keeps paying its killer in 联防.
   */
  _sanitizeSpawns(list, ownerPlayerId = null) {
    const out = [];
    for (const s of Array.isArray(list) ? list : []) {
      if (!s || typeof s !== 'object' || typeof s.enemyKey !== 'string' || !this.gd.enemy(s.enemyKey)) continue;
      const spec = { ...s, mods: s.mods && typeof s.mods === 'object' ? { ...s.mods } : {} };
      if (ownerPlayerId && spec.ownerPlayerId == null) spec.ownerPlayerId = ownerPlayerId;
      const coins = spec.bounty && typeof spec.bounty === 'object' ? Math.trunc(Number(spec.bounty.coins) || 0) : 0;
      if (coins > 0 && spec.mods.bountyId == null && spec.mods.bountyCoins == null) spec.mods.bountyCoins = coins;
      out.push(spec);
    }
    return out;
  }

  _normalBattle(ps) { return this.newBattle(this._normalOpts(ps)); }

  /**
   * ★ 工序 87 调试接缝（`config.debug` / `g.debug` 的 `setWave`）：把**本波**的敌人整波换成 `count` 个 `enemyKey`。
   *
   * 为什么落在这里：`_normalOpts`（下面几行）是**唯一**读 `this.wave` 组 spec 的地方（`clientCombat.buildBattleSpec`
   * 也走它）⇒ 改 `this.wave.spawns` 就是"改本波敌人"，两端天然一致（客户端收到的就是新 spec）。★ 这**不是**新造的
   * 生成器：规格与 `waves.js` 的 `templateSpawns` 同形（`enemyKey / routeIndex / count / interval / mods / preview`），
   * 倍率直接取官方 `scaleFor` + `roundMods`（所以 `setEnemyScale` 的覆盖也照常生效）。
   *
   * 两个刻意的取舍：
   *   * **不带 `actionIndex` / `tag`** ⇒ `withBounties` 不会把它当宿主动作重排，`previewOf` 按"普通波次敌人"显示
   *     （不是悬赏兵）；本局的悬赏兵照旧由 `withBounties` 追加在后面。
   *   * 它**只改这一局、这一波**：下一回合 `startRound` 会整波重建（`phases.js`）⇒ 覆盖自动失效，不需要"撤销"。
   *
   * 只在调试动作里被调用；`config.debug` 缺省 / 非单人 / 动作不在白名单时**永远走不到这里**。
   * @param {string} enemyKey 本局数据里存在的敌人 key
   * @param {number} count 1..maxCount（调用点已夹）
   * @returns {boolean} 是否真的换了（false = 这一局没有可改的普通波次）
   */
  debugSetWaveSpawns(enemyKey, count) {
    if (!this.gd.enemy(enemyKey)) return false;
    return this.debugSetWaveList([{ enemyKey, count }]);
  }

  /**
   * ★★ 工序 115（`setWaveList`）：把**本波**敌人整波换成**清单里的每一条**（`{ enemyKey, count }`，调用点已归一化）。
   *
   * 与 `debugSetWaveSpawns`（工序 87 的单 key 版本）的关系：那个是这一条的 `[{ enemyKey, count }]` 特例，
   * 两者共用同一段落点逻辑（`this.wave.spawns` 是 `_normalOpts` / `clientCombat.buildBattleSpec` **唯一**读本波
   * 敌人的地方 ⇒ 改它就是"改本波敌人"，两端天然一致）。
   *
   * 清单为**空**是合法的：这一波没有敌人（调试时想直接跳过一波）。`wave.actions = []` 与单 key 版本一致 ——
   * 新 spawn 没有 `actionIndex`，留着旧动作表会让 `withBounties` 的 retime 找不到宿主。
   * @param {ReadonlyArray<{ enemyKey: string, count: number }>} entries
   * @returns {boolean} 是否真的换了（false = 这一局没有可改的普通波次）
   */
  debugSetWaveList(entries) {
    const wave = this.wave;
    if (!wave || !Array.isArray(wave.spawns)) return false;
    const scale = scaleFor(this.gd, this.round);
    const routes = Array.isArray(wave.routes) ? wave.routes : [];
    // 时间窗沿用本波第一条 spawn（"还是同一波"的观感）：窗口为 0 时按 0.5 游戏秒一个铺开，便于逐个观察。
    const first = wave.spawns.find((s) => s && typeof s.enemyKey === 'string') || null;
    const time = first ? Math.max(0, Number(first.time) || 0) : 0;
    const window = first ? Math.max(1, Math.trunc(Number(first.count) || 1)) * Math.max(0, Number(first.interval) || 0) : 0;
    const spawns = [];
    for (const it of Array.isArray(entries) ? entries : []) {
      if (!it || typeof it.enemyKey !== 'string') continue;
      const rec = this.gd.enemy(it.enemyKey);
      if (!rec) continue;
      const count = Math.max(1, Math.trunc(Number(it.count)) || 1);
      const fly = isFlyKey(this.gd, it.enemyKey);
      let routeIndex = routeByMotion(routes, fly);
      if (!(routeIndex >= 0 && routeIndex < routes.length)) routeIndex = 0;
      const route = routes[routeIndex] || null;
      const start = route && Array.isArray(route.start) ? route.start.slice(0, 2) : null;
      const step = count > 1 ? Math.max(window / count, 0.5) : 0;
      spawns.push({
        time,
        enemyKey: it.enemyKey,
        routeIndex,
        count,
        interval: count > 1 ? step : 0,
        mods: { ...roundMods(scale), slot: classOf(this.gd, it.enemyKey) },
        preview: { gate: gateOf(start, false), start, fly, elite: rec.rank === 'ELITE' || (!!rec.rank && rec.rank !== 'NORMAL'), boss: false },
      });
    }
    wave.spawns = spawns;
    wave.actions = [];
    return true;
  }

  /** Battle options of a player's normal field (after the onBattleStart handlers). */
  _normalOpts(ps) {
    const wave = this.wave;
    const input = ps.battleInput({ side: 'L', colOffset: 0 });
    // the client's list: bounty units inserted among their host action's own units, which are re-timed around them
    const spawns = withBounties(this.gd, this.round, wave, ps.bounties, ps.playerId).map((s) => ({ ...s, ownerPlayerId: ps.playerId }));
    const ev = { input, kind: 'normal', round: this.round, spawns };
    this.dispatch(ps, 'onBattleStart', ev);
    return {
      seed: deriveSeed(this.seed, `n:${this.round}:${ps.seat}`),
      kind: 'normal',
      modeId: this.modeId,
      round: this.round,
      stageId: this.stageId,
      rect: { ...GEO.NORMAL_RECT },
      timeLimit: wave.timeLimit,
      players: [ev.input && typeof ev.input === 'object' ? ev.input : input],
      spawns: this._sanitizeSpawns(Array.isArray(ev.spawns) ? ev.spawns : spawns, ps.playerId),
      routes: wave.routes,
      sharedBoss: null,
      flags: { layerGainsEnabled: true, ...this.gd.dp },
      fieldId: `n:${ps.playerId}`,
      enemyOverrides: wave.overrides,
      waveId: wave.templateId,
    };
  }

  startCombat() {
    if (this.clientCombat) { this._startCombatClient(); return; }
    this.phase = PHASE.COMBAT;
    const alive = this.alivePlayers();
    this.lastResults = new Map();
    this.fields = alive.map((ps) => ({ fieldId: `n:${ps.playerId}`, kind: 'normal', players: [ps.playerId], battle: this._normalBattle(ps), live: true }));
    const limit = this.wave ? this.wave.timeLimit : 60;
    this.deadline = this.sched.instant ? 0 : this.sched.now() + Math.round((limit / this.gameSpeed) * 1000);
    this._defaultWatch();
    this.markPublic();
    this.runner = new FieldRunner(this, this.fields, { onDone: (runner) => this.combatDone(runner) });
    this.runner.start();
  }

  _startCombatClient() {
    this.phase = PHASE.COMBAT;
    const alive = this.alivePlayers();
    this.lastResults = new Map();
    this.watchers.clear();
    const fields = alive.map((ps) => this._ccField({ fieldId: `n:${ps.playerId}`, kind: 'normal', players: [ps.playerId], opts: this._normalOpts(ps) }));
    const limit = this.wave ? this.wave.timeLimit : 60;
    this.deadline = this.sched.instant ? 0 : this.sched.now() + Math.round((limit / this.gameSpeed) * 1000);
    this._launch(fields);
    // every fighting human runs its own field; eliminated humans (and spectator seats) keep watching (research 09 §3.1
    // "Keep-watching auto-observes the first available field", switching freely with 前往查看): a replica of the field
    // of the player they follow — the one they last watched, else the first player still in (item 56) — else the first
    for (const f of fields) for (const pid of f.players) {
      const ps = this.players.get(pid);
      if (!ps || ps.isBot || ps.left) continue;
      this.watchers.set(pid, f.fieldId);
      this._sendStart(pid, f);
    }
    const first = fields.find((f) => f.mode === 'client') || fields[0] || null;
    if (first) {
      for (const ps of this._viewers()) {
        if (ps.alive || this.watchers.has(ps.playerId)) continue;
        const f = this._watchTargetField(ps, fields) || first;
        this.watchers.set(ps.playerId, f.fieldId);
        this._sendStart(ps.playerId, f, { watch: true });
      }
    }
    this.markPublic();
  }

  /** Aggregate a finished field's content/engine errors (battle.errors: unique records) for diagnostics. */
  _collectSimErrors(f, res) {
    this.simErrors += Number(res && res.errors) || 0;
    const list = f && f.battle && Array.isArray(f.battle.errors) ? f.battle.errors : [];
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const key = `${e.label}|${e.who || ''}|${e.message}`;
      let rec = this.simErrorLog.get(key);
      if (!rec) {
        if (this.simErrorLog.size >= 500) continue;
        rec = { label: String(e.label), who: String(e.who || ''), message: String(e.message), stack: e.stack ? String(e.stack) : null, battles: 0, count: 0 };
        this.simErrorLog.set(key, rec);
      }
      rec.battles++;
      rec.count++;
    }
  }

  combatDone(runner) { this._finishCombat((f) => runner.resultOf(f)); }

  /** Every normal field has its result: record them, then 联防 or SETTLE. */
  _finishCombat(resultOf) {
    if (this.phase !== PHASE.COMBAT) return;
    this._stopClientCombat();
    for (const f of this.fields) {
      const res = resultOf(f);
      this._collectSimErrors(f, res);
      for (const pid of f.players) {
        const pp = res.perPlayer && res.perPlayer[pid];
        this.lastResults.set(pid, pp || { killed: 0, total: 0, leaked: [], perfect: true, layerGains: {}, coins: 0, damageDealt: 0, unitsEnd: [], unitStats: [] });
        // the views show the layers the battle reached until settle() makes them persistent (DESIGN §20.15)
        const ps = this.players.get(pid);
        const gains = pp && pp.layerGains && typeof pp.layerGains === 'object' ? pp.layerGains : null;
        if (ps && gains && Object.keys(gains).length) { ps.pendingLayerGains = { ...gains }; ps.dirty(); }
      }
    }
    for (const f of this.fields) f.live = false;
    this.deadline = 0;
    this.markPublic();
    this.later(this.scaled(DELAYS.COMBAT_END), () => this._afterCombat());
  }

  /**
   * After the COMBAT_END pause: 联防 or SETTLE. The plan is made now, from the players still in — a player who quit
   * during the last field or the pause (中途退出 = eliminated, board cleared) is neither a helper nor a leaker whose
   * enemies re-enter.
   */
  _afterCombat() {
    if (this.phase !== PHASE.COMBAT) return;
    const plan = planUnite(this, this.lastResults);
    if (plan) this.startUnite(plan);
    else this.settle(null, null);
  }
}
