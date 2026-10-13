// test/content/audit-indom-deploy-triggers.test.js — 机制审查（2026-…）: 「击倒」与「部署」两族触发点的判定
// 固定在真 sim 上（真 chess / 真 kit / data/*.json），把这轮审查的结论钉成回归用例：
//
//   ① 不屈 tier 2「地面干员被击倒时使场上所有干员技力+5」的判据是 `death` 事件的 `reason === 'killed'`
//      （content/bonds/addon/battle.js:493；外层的 INDOM_EXITS = { killed, retreat, merchant } :485）。
//      突袭(raidShip)「保留技力立即再部署」在引擎里是 `retreat { reason: 'raid' }` + 免费再部署
//      （:385-390 raidRedeploy）——它是「移动/再部署」，**不是**被击倒，因此不触发这条 +5 SP。
//      官方口径（PRTS 卫戍协议：盟约 下半/PRTS盟约记录，不屈）：修正(原因 6) 只把**第一行**的「被击倒」改成
//      「被击倒、撤退、切换<替身>与<本体>」；3 人效果那一行原文未改，仍是「地面干员被击倒时」。
//      阿戈尔 / M3茧甲 / 埃芒加德「立刻复活」的备注又写明「受益者因**移动**之外的原因退场时…」
//      ——即本模式的「移动」不算退场，也不是被击倒。
//   ② 远牙 garrison_148_a 授予的 <部署时> 特质（garrison_108_a，effectKey act2autochess_gar_event_onstart ⇒
//      `deploy` 钩子，content/garrisons/battle.js:313-319）不会在傀儡师本体↔替身切换时叠层：换体只 emit
//      `dollSwap`（professions.js:205-289），没有 deploy。官方文本只在该算的地方写明换体
//      （归溟幽灵鲨 garrison_40「被击倒或替身与本体进行切换时」、不屈的修正），而傀儡师特性本身写的是
//      「受到致命伤时**不撤退**，切换成<替身>作战」。
//
// 这些用例记录的是「当前实现 = 官方口径」的结论：它们**不是**为迎合某个改动而写，改动若破坏它们就有依据要复核。
//
// ★ 2026-10-09 接缝：① 现在是**可数据的**（server/sim/mechanics.js，值来自 `data/backups.json` 的
//   `mechanics`），默认（缺省）= 上游，所以上面的用例逐字未改、仍然全绿：
//     · `mechanics.indomRaidSp` = true ⇒ 不屈 tier 2 的 +5 技力**也吃突袭飞走**（只补技力、**不**参与 tier 1 的 roll）
//       —— 服主口径 2026-10-09「突袭飞走触发全队 +5 技力是原版正常逻辑」；Mod `cyanfish.fix-mechanism` 打开它。
//   ★★ 而 ② 那条接缝（`garrison_108_a/b.bb.doll_swap_deploy` = 1 ⇒ 那两条特质实例在傀儡师换体时也按「部署时」
//   结算，由 Mod `cyanfish.fix-operator` 的 `fartooth-dollswap` 打开）**已在工序 54 撤除**（2026-10-10）：
//   上游 **0.2.3** 自己在**同一个安装器函数**（`server/sim/content/garrisons/battle.js` 的
//   `act2autochess_gar_event_onstart`）里按**同一对** `garrison_108_a/b`、用**同一个**
//   `battle.on('dollSwap', …) → fireGain` 内建了同一条（GitHub #415 / PR #429，附 7 条回归用例
//   `test/content/fartooth-doll-swap.test.js`）；两边并存会让换体 `fireGain` **两次**（远牙叠层翻倍）。
//   ⇒ 停用该项、删除 `mods/cyanfish.fix-operator/data/garrisons.json`，并把基座
//   `server/sim/content/garrisons/battle.js` 恢复成与 `<官方源码参照>/v0.2.2` **逐字节相同**
//   （sha256 `578f1e4ad21c24e8cb1f4727a12bdc37a1d745dc888727dbd1e616788fcb7231`）。
//   ⇒ 本文件下半部分那条「【接缝开】」用例已改写成**护栏用例**：把旗标写回数据也**不再生效**
//   （0.2.2 基座上本就没有「换体也算一次部署」这条能力；它由上游 0.2.3 内建）。取证：
//   `<开发期报告>/54-stage0-dollswap.md`、`53-upstream-023-recon.md` §5.1、`53h-garrisons.diff`。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { setGameData, gameData } from '../../server/sim/content/support/index.js';

const MLYNAR = 'chess_char_5_19_a';   // 玛恩纳 char_4064_mlynar 解放者 卡西米尔
const BLEMSH = 'chess_char_3_12_a';   // 瑕光 char_423_blemsh 守护者 卡西米尔/突袭（spType 受伤回技力）
const CUORA = 'chess_char_3_16_a';    // 蛇屠箱 坚守/不屈
const GRAVEL = 'chess_char_2_12_a';   // 砾 卡西米尔/不屈
const LISKARM = 'chess_char_1_20_a';  // 雷蛇 不屈
const GHOST2 = 'chess_char_5_13_a';   // 归溟幽灵鲨 傀儡师 阿戈尔/不屈（garrison_40_a）
const FARTOOTH = 'chess_char_4_20_a'; // 远牙 卡西米尔/精准（garrison_148_a）
const SNOWHUNT = 'chess_char_3_11_a'; // 雪猎 精准（precision 计数 2）
const ITEM_MORPH = 'chess_item_6_09_e_a';   // 变形同构体 canGiveBond
const ITEM_GRENADE = 'chess_item_3_11_e_a'; // 突袭手雷 giveBondId raidShip
const ITEM_M3 = 'chess_item_4_12_e_a';      // M3茧甲 立刻复活

const bondOn = (count, layers = 0, tier = null, thresholds = [2, 3]) => ({ count, active: count >= 1, tier: tier ?? thresholds.filter((t) => count >= t).length, layers });
const zeroRoute = (r, c) => ({ motion: 'WALK', start: [r, c], end: [r, c], checkpoints: [] });
const dummy = (o = {}) => enemyRec({ key: 'e_dummy', hp: 1e9, atk: 0, speed: 0, ...o });
const bondSpGains = (h) => h.hooksOf('spGain').filter((c) => c.reason === 'bond' && c.amount === 5);
const indomRolls = (h) => h.eventsOf('fx').filter((e) => e[1] === 'revive' && e[4]?.src === 'bond:indomShip');
const layersOf = (h, id, pid = 'p1') => h.b.getPlayer(pid).bonds[id].layers;
/** 技能就绪 = charges ≥ 1（skills.js:183），只能通过 gainSp 进入就绪。 */
const makeReady = (u) => u.skill.gainSp(u.skill.spCost - u.skill.sp, 'test');

/**
 * 打开 sim 侧的规则接缝（`data/backups.json` 的 `mechanics`；读法与 `bondRecord` 同源），跑完恢复。
 * @param {(data: any) => any} fn 收到这一轮的数据对象（`gameData()` 就是它）
 */
function withMechanics(patch, fn) {
  const base = gameData();
  const data = patch ? { ...base, backups: { ...(base.backups || {}), mechanics: { ...(base.backups?.mechanics || {}), ...patch } } } : base;
  setGameData(data);
  try { return fn(data); } finally { setGameData(base); }
}

/**
 * 把远牙授予的那两条特质的换体旗标 `bb.doll_swap_deploy` 写回 / 拿掉。
 * ★ 工序 54 起这只是个**护栏**：基座 `server/sim/content/garrisons/battle.js` 的安装器**已不再读这枚旗标**
 * （接缝已撤除、该文件回到与 `<官方源码参照>/v0.2.2` 逐字节相同）⇒ 写与不写**逐值相同**。
 * 历史上它是 Mod `cyanfish.fix-operator` 的 `fartooth-dollswap` 用 `data/garrisons.json` 打开的那条数据缝。
 */
function withDollSwapSeam(on, fn) {
  const base = gameData();
  const arm = (id) => {
    const r = base.garrisons[id];
    const bb = { ...(r.bb || {}) };
    if (on) bb.doll_swap_deploy = 1; else delete bb.doll_swap_deploy;
    return { ...r, bb };
  };
  const data = on ? { ...base, garrisons: { ...base.garrisons, garrison_108_a: arm('garrison_108_a'), garrison_108_b: arm('garrison_108_b') } } : base;
  setGameData(data);
  try { return fn(data); } finally { setGameData(base); }
}

/** 服主场景：玛恩纳(带变形同构体+突袭手雷 ⇒ 突袭成员) + 瑕光 = 2 名突袭；蛇屠箱/砾/雷蛇 = 3 名不同不屈。 */
function raidScene() {
  const h = makeBattle({
    defs: { enemies: { e_dummy: dummy() } },
    units: [
      { chessId: MLYNAR, row: 11, col: 4, items: [ITEM_MORPH, ITEM_GRENADE] },
      { chessId: BLEMSH, row: 12, col: 5 },
      { chessId: CUORA, row: 12, col: 2 },
      { chessId: GRAVEL, row: 11, col: 2 },
      { chessId: LISKARM, row: 10, col: 2 },
    ],
    bonds: { raidShip: bondOn(2, 10, 1, [2]), indomShip: bondOn(3, 300, 2, [2, 3]) },
    routes: [zeroRoute(9, 10), zeroRoute(12, 10)],
    enemies: [{ key: 'e_dummy', time: 0, route: 0 }, { key: 'e_dummy', time: 0, route: 1 }],
    autoFinish: false, timeLimit: 40, captureNoisy: true, hooks: ['deploy', 'death', 'spGain', 'layerGain'],
  });
  h.step();
  return h;
}

// ---------------------------------------------------------------------------------------------------------------------
// ① 不屈 tier 2 的 +5 SP

test('不屈 3 人 +5 SP 只认「被击倒」: 突袭飞走（reason raid）不触发（服主场景，真 chess）', () => {
  const h = raidScene();
  const mly = h.unit(MLYNAR), blm = h.unit(BLEMSH), obs = h.unit(CUORA);
  // 转职成立：玛恩纳的 chess 数据里没有【突袭】，靠变形同构体+突袭手雷拿到 ⇒ 否则下面不会起飞
  assert.ok(!mly.def.bonds.includes('raidShip') && mly.items.includes(ITEM_GRENADE), '玛恩纳靠装备转职突袭');
  makeReady(mly); makeReady(blm);
  const home = { m: [mly.tileR, mly.tileC], b: [blm.tileR, blm.tileC] };
  const jumped = h.runUntil(() => h.hooksOf('deploy').filter((c) => (c.unit === mly || c.unit === blm) && !c.initial).length >= 2, 5);
  assert.ok(jumped, '开场「技能就绪」⇒ 两名突袭干员立刻飞走');
  assert.notDeepEqual([mly.tileR, mly.tileC], home.m);
  assert.notDeepEqual([blm.tileR, blm.tileC], home.b);
  assert.deepEqual(h.hooksOf('death').map((c) => c.reason), ['raid', 'raid'], '突袭再部署 = reason \'raid\' 的退场，不是被击倒');
  for (const c of h.hooksOf('death')) assert.equal(h.b.isDown(c.unit), false, '突袭撤退不留倒地干员');
  assert.equal(bondSpGains(h).length, 0, '不屈 3 人的 +5 SP 不因突袭移动触发');
  assert.equal(indomRolls(h).length, 0, '不屈的立刻重新部署也不在突袭撤退上 roll（它已免费再部署）');
  // 对照：真·被击倒 ⇒ 场上每个有技能的干员 +5 SP（这条本身是好的）
  const spBefore = obs.skill.sp;
  h.b.dealDamage(null, mly, { amount: 1e9, type: 'true' });
  h.step();
  const gains = bondSpGains(h);
  assert.ok(gains.length >= 2, `被击倒给场上所有干员 +5 SP（实测 ${gains.length} 名）`);
  assert.ok(obs.skill.sp > spBefore, '观察者也吃到');
  assert.equal(h.hooksOf('death').filter((c) => c.reason === 'killed').length, 1);
  checkInvariants(h.b);
});

test('不屈 3 人 +5 SP: 差 5 点满条的突袭干员飞走后仍不满条（保技力 ≠ 被击倒）', () => {
  const rid = 't_raid';
  const ind = (id) => chessRec({ id, profession: 'WARRIOR', bonds: ['indomShip'], skill: null, stats: { atk: 100, maxHp: 3000, def: 0, respawnTime: 70 } });
  const h = makeBattle({
    defs: {
      chess: {
        // 受伤回技力 ⇒ 没有自然回技力，「差 5 点」会一直保持差 5 点
        [rid]: chessRec({ id: rid, profession: 'WARRIOR', bonds: ['raidShip'], stats: { atk: 100, maxHp: 3000, respawnTime: 70 }, skill: { duration: 5, spCost: 50, initSp: 45, spType: 'INCREASE_WHEN_TAKEN_DAMAGE' } }),
        i_a: ind('i_a'), i_b: ind('i_b'), i_c: ind('i_c'),
      },
      enemies: { e_dummy: dummy() },
    },
    units: [{ chessId: rid, row: 11, col: 4 }, { chessId: 'i_a', row: 12, col: 2 }, { chessId: 'i_b', row: 12, col: 4 }, { chessId: 'i_c', row: 12, col: 6 }],
    bonds: { raidShip: bondOn(2, 10, 1, [2]), indomShip: bondOn(3, 300, 2, [2, 3]) },
    routes: [zeroRoute(9, 10)],
    enemies: [{ key: 'e_dummy', time: 0, route: 0 }],
    autoFinish: false, timeLimit: 30, captureNoisy: true, hooks: ['deploy', 'death', 'spGain'],
  });
  h.step();
  const u = h.unit(rid);
  assert.equal(u.skill.sp, 45, '差 5 点满条');
  assert.equal(u.skill.ready, false);
  const ok = h.runUntil(() => h.hooksOf('deploy').some((c) => c.unit === u && !c.initial), 15);
  assert.ok(ok, '10 秒未攻击 ⇒ 触发突袭飞走（若这条 3 人效果对移动生效，这里会满条开技能）');
  assert.ok(u.alive && u.deployed, '落地在场上');
  assert.equal(u.skill.sp, 45, '飞走前后技力不变（保留技力），没有得到 +5');
  assert.equal(u.skill.ready, false, '技能条没有被补满');
  assert.equal(bondSpGains(h).length, 0);
  assert.ok(h.hooksOf('death').every((c) => c.reason === 'raid'));
  checkInvariants(h.b);
});

test('不屈的触发面: killed/retreat/merchant 会 roll；raid 与联防 forcedExit 不 roll；+5 SP 只随 killed', () => {
  // 有技能才会吃到「场上所有干员技力+5」（content/bonds/addon/battle.js:495 只对有 skill 的干员 gainSp）
  const ind = (id) => chessRec({ id, profession: 'WARRIOR', bonds: ['indomShip'], stats: { atk: 100, maxHp: 3000, def: 0, respawnTime: 70 }, skill: { duration: 5, spCost: 30, initSp: 0, spType: 'INCREASE_WITH_TIME' } });
  const mk = (kind) => makeBattle({
    kind,
    defs: { chess: { i_a: ind('i_a'), i_b: ind('i_b'), i_c: ind('i_c') }, enemies: { e_dummy: dummy() } },
    units: [{ chessId: 'i_a', row: 12, col: 2 }, { chessId: 'i_b', row: 12, col: 4 }, { chessId: 'i_c', row: 12, col: 6 }],
    bonds: { indomShip: bondOn(3, 300, 2, [2, 3]) },
    autoFinish: false, timeLimit: 30, captureNoisy: true, hooks: ['deploy', 'death', 'spGain'],
  });
  const run = (kind, act) => { const h = mk(kind); h.step(); act(h, h.unit('i_b')); h.step(); return h; };
  const roll = run('normal', (h, u) => h.b.retreat(u, { reason: 'retreat' }));
  assert.equal(indomRolls(roll).length, 1, 'p=1 的撤退 roll 并立刻免费再部署');
  assert.equal(bondSpGains(roll).length, 0, '撤退不给 +5 SP');
  assert.equal(indomRolls(run('normal', (h, u) => h.b.retreat(u, { reason: 'merchant' }))).length, 1, '行商撤退 roll');
  const raid = run('normal', (h, u) => { h.b.retreat(u, { reason: 'raid' }); h.b.redeploy(u, { free: true, keepSp: true }); });
  assert.equal(indomRolls(raid).length, 0, '突袭撤退不 roll');
  assert.equal(bondSpGains(raid).length, 0);
  const forced = run('unite', (h, u) => { h.b.retreat(u, { reason: 'forcedExit' }); });
  assert.equal(indomRolls(forced).length, 0, '联防 forcedExit 不 roll（FORCED_EXIT 不在 INDOM_EXITS）');
  assert.equal(bondSpGains(forced).length, 0);
  assert.ok(forced.b.isDown(forced.unit('i_b')), '强制退场留在原地待再部署');
  const killed = run('normal', (h, u) => h.b.dealDamage(null, u, { amount: 1e9, type: 'true' }));
  assert.equal(indomRolls(killed).length, 1, '被击倒 roll');
  assert.ok(bondSpGains(killed).length >= 2, '被击倒给场上所有干员 +5 SP');
  // M3茧甲 立刻复活：被击倒仍然成立（复活不吞掉 +5 SP）
  const m3 = makeBattle({
    defs: { chess: { i_a: ind('i_a'), i_b: ind('i_b'), i_c: ind('i_c') }, enemies: { e_dummy: dummy() } },
    units: [{ chessId: 'i_a', row: 12, col: 2 }, { chessId: 'i_b', row: 12, col: 4, items: [ITEM_M3] }, { chessId: 'i_c', row: 12, col: 6 }],
    bonds: { indomShip: bondOn(3, 300, 2, [2, 3]) }, autoFinish: false, timeLimit: 30, captureNoisy: true, hooks: ['deploy', 'death', 'spGain'],
  });
  m3.step();
  const b = m3.unit('i_b');
  m3.b.dealDamage(null, b, { amount: 1e9, type: 'true' });
  m3.step();
  assert.ok(b.alive, 'M3茧甲立刻复活');
  assert.ok(bondSpGains(m3).length >= 2, '被击倒时的 +5 SP 照常');
  checkInvariants(killed.b); checkInvariants(m3.b);
});

// ---------------------------------------------------------------------------------------------------------------------
// ② 远牙 <部署时> 特质 × 傀儡师换体

/** 远牙(行10最左) + 砾 + 归溟幽灵鲨(行10最右 = <部署时> 特质受益者)；卡西米尔 3 名 / 精准 2 名 / 不屈 3 名真激活。 */
function dollScene() {
  const h = makeBattle({
    units: [
      { chessId: FARTOOTH, row: 10, col: 3 },
      { chessId: GRAVEL, row: 10, col: 5 },
      { chessId: GHOST2, row: 10, col: 8 },
      { chessId: MLYNAR, row: 11, col: 4 },
      { chessId: SNOWHUNT, row: 11, col: 6 },
      { chessId: LISKARM, row: 12, col: 4 },
    ],
    bonds: {
      kazimierzShip: bondOn(3, 20, 1, [3, 6]), preciShip: bondOn(2, 20, 1, [2, 3]),
      indomShip: bondOn(3, 300, 2, [2, 3]),
    },
    defs: { enemies: { e_dummy: dummy() } },
    routes: [zeroRoute(9, 10)],
    enemies: [{ key: 'e_dummy', time: 0, route: 0 }],
    autoFinish: false, timeLimit: 90, captureNoisy: true, hooks: ['deploy', 'death', 'dollSwap', 'layerGain', 'spGain'],
  });
  h.step();
  return h;
}

test('远牙 <部署时> 特质: 傀儡师本体↔替身切换**也**叠层（上游 0.2.3 内建，走 dollSwap 而不是 deploy），真再部署 / 突袭落点 / 【移动】都算', () => {
  const h = dollScene();
  const ghost = h.unit(GHOST2);
  // 授予确认：远牙的 garrison_148_a 把 garrison_108_a 给了同一行最右边那名干员
  assert.ok(h.eventsOf('fx').some((e) => e[1] === 'garrisonGrant' && e[4]?.key === 'garrison_108_a'), '授予落在行 10 最右的 归溟幽灵鲨 身上');
  assert.deepEqual([layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], [25, 24], '初次部署就该 +4/+4（卡西米尔另有砾的 +1）');

  const dep0 = h.hooksOf('deploy').length;
  // 本体 → 替身
  h.b.dealDamage(null, ghost, { amount: 1e9, type: 'true' });
  h.step();
  assert.ok(ghost.alive && ghost.trait.doll && ghost.form === 'doll', '切换成<替身>（不是被击倒）');
  assert.equal(h.hooksOf('dollSwap').length, 1, '换体走 dollSwap 钩子');
  assert.equal(h.hooksOf('deploy').length, dep0, '换体不是通用部署：没有 deploy 事件');
  // ★★ 工序 56：上层基座换成 0.2.3 之后，**上游自己**在同一个安装器函数里把远牙那条挂到了 `dollSwap` 上
  //   （#415 / PR #429，回归用例见 `test/content/fartooth-doll-swap.test.js`）⇒ 换体现在**会** +4/+4。
  //   我们那条 `bb.doll_swap_deploy` 接缝已在工序 54 撤除，这里看到的是**上游内建行为**，不是我们的接缝。
  assert.deepEqual([layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], [29, 28], '0.2.3：换体也 +4/+4（上游内建，不是我们的接缝）');
  assert.ok(h.hooksOf('layerGain').some((c) => c.bondId === 'indomShip' && c.n === 5), '对照：归溟幽灵鲨 garrison_40「替身与本体切换时」照常给 不屈 +5');
  // 替身 → 本体
  h.runUntil(() => !ghost.trait.doll, 40);
  assert.equal(h.hooksOf('dollSwap').length, 2);
  assert.equal(h.hooksOf('deploy').length, dep0, '换回也不是通用部署');
  assert.deepEqual([layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], [33, 32], '换回再 +4/+4');

  // 对照 1：真·再部署
  h.b.retreat(ghost, { reason: 'retreat' });
  h.b.redeploy(ghost, { free: true });
  h.step();
  assert.equal(h.hooksOf('deploy').length, dep0 + 1);
  assert.deepEqual([layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], [37, 36], '真再部署 +4/+4');
  // 对照 2：突袭落点（引擎里的 raid 撤退 + 免费再部署）
  h.b.retreat(ghost, { reason: 'raid' });
  h.b.redeploy(ghost, { free: true, keepSp: true });
  h.step();
  assert.deepEqual([layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], [41, 40], '突袭落点算部署');
  // 对照 3：【移动】(PRTS 术语「移动」= 不退场，以当前血量在目标位置部署 ⇒ deploy 效果再次触发)
  assert.ok(h.b.moveRedeploy(ghost, ghost.tileR, ghost.tileC - 1));
  h.step();
  assert.deepEqual([layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], [45, 44], '【移动】算部署');
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------------
// ③ 接缝口径：`cyanfish.fix-mechanism` 打开的 `indomRaidSp` 仍然有效；
//    `bb.doll_swap_deploy`（工序 54 起）**已撤除** —— 写回数据也不再生效。

test('【接缝 indomRaidSp 开】不屈 3 人 +5 SP 也吃突袭飞走：只给自己人，且仍然不 roll', () => {
  withMechanics({ indomRaidSp: true }, () => {
    const h = raidScene();
    const mly = h.unit(MLYNAR), blm = h.unit(BLEMSH), obs = h.unit(CUORA);
    const spBefore = obs.skill.sp;
    makeReady(mly); makeReady(blm);
    const jumped = h.runUntil(() => h.hooksOf('deploy').filter((c) => (c.unit === mly || c.unit === blm) && !c.initial).length >= 2, 5);
    assert.ok(jumped, '两名突袭干员飞走');
    assert.deepEqual(h.hooksOf('death').map((c) => c.reason), ['raid', 'raid']);
    const gains = bondSpGains(h);
    assert.ok(gains.length >= 2, `突袭飞走补 +5 技力（实测 ${gains.length} 名）`);
    assert.ok(obs.skill.sp > spBefore, '站在场上的观察者也吃到');
    assert.ok(gains.every((c) => c.unit.ownerId === 'p1'), '只落在该盟约归属方的干员身上');
    assert.ok(!gains.some((c) => c.unit === mly || c.unit === blm), '飞走的那名干员自己不在场上，拿不到');
    assert.equal(indomRolls(h).length, 0, '★ 突袭**仍然不**参与 tier 1 的「立刻重新部署」roll（只补技力）');
    checkInvariants(h.b);
  });
});

test('【接缝 indomRaidSp 开】联防下只作用于盟约归属方（不算协防队友、不算对面）', () => {
  withMechanics({ indomRaidSp: true }, () => {
    const x = (id) => chessRec({ id, profession: 'WARRIOR', stats: { atk: 100, maxHp: 3000, def: 0, respawnTime: 70 }, skill: { duration: 5, spCost: 30, initSp: 0, spType: 'INCREASE_WITH_TIME' } });
    const h = makeBattle({
      kind: 'unite',
      defs: { chess: { x_p1: x('x_p1'), x_p2: x('x_p2') }, enemies: {} },
      players: [
        { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: { indomShip: bondOn(3, 300, 2, [2, 3]) }, bandId: null, playerEffects: [], units: [{ uid: 1, chessId: 'x_p1', row: 12, col: 2 }, { uid: 2, chessId: 'x_p1', row: 12, col: 4 }, { uid: 3, chessId: 'x_p1', row: 11, col: 4 }] },
        { playerId: 'p2', seat: 1, side: 'R', colOffset: 0, bonds: {}, bandId: null, playerEffects: [], units: [{ uid: 4, chessId: 'x_p2', row: 12, col: 6 }, { uid: 5, chessId: 'x_p2', row: 12, col: 8 }, { uid: 6, chessId: 'x_p2', row: 11, col: 6 }] },
      ],
      autoFinish: false, timeLimit: 30, captureNoisy: true, hooks: ['spGain'],
    });
    h.step();
    const ops = (pid) => h.b.allyUnits.filter((u) => u.ownerId === pid && u.kind === 'op');
    h.b.retreat(ops('p1')[1], { reason: 'raid' }); h.b.redeploy(ops('p1')[1], { free: true, keepSp: true });
    h.step();
    const mine = bondSpGains(h);
    assert.ok(mine.length > 0, 'p1 的干员飞走 ⇒ p1 的干员 +5');
    assert.ok(mine.every((c) => c.unit.ownerId === 'p1'), '只给盟约归属方，不给协防队友');
    h.b.retreat(ops('p2')[1], { reason: 'raid' }); h.b.redeploy(ops('p2')[1], { free: true, keepSp: true });
    h.step();
    assert.equal(bondSpGains(h).length, mine.length, 'p2 没有 不屈 ⇒ 对面飞走一个都不给');
    checkInvariants(h.b);
  });
});

test('【接缝 doll_swap_deploy 已撤除】远牙 <部署时> 特质：旗标写与不写逐值相同（能力由上游 0.2.3 内建，与我们无关）', () => {
  /** 跑一遍「本体 → 替身」，返回换体后的 [卡西米尔层数, 精准层数] 与 deploy 事件增量。 */
  const swapOnce = () => {
    const h = dollScene();
    const ghost = h.unit(GHOST2);
    const dep0 = h.hooksOf('deploy').length;
    h.b.dealDamage(null, ghost, { amount: 1e9, type: 'true' });
    h.step();
    assert.ok(ghost.alive && ghost.trait.doll, '切换成<替身>（不是被击倒）');
    assert.equal(h.hooksOf('dollSwap').length, 1, '换体走 dollSwap 钩子');
    checkInvariants(h.b);
    return { layers: [layersOf(h, 'kazimierzShip'), layersOf(h, 'preciShip')], dDep: h.hooksOf('deploy').length - dep0 };
  };

  // 不写旗标（= 现在基座唯一可能的状态）
  const off = withDollSwapSeam(false, swapOnce);
  assert.deepEqual(off.layers, [29, 28], '0.2.3：换体 +4/+4');
  assert.equal(off.dDep, 0, '换体不发通用 deploy 事件');

  // ★ 工序 54 撤除接缝 / 工序 56 升到 0.2.3：把旗标写回数据（模拟旧的 `data/garrisons.json` 补丁）也**逐值相同**
  //   —— 基座安装器早就不再读它。这里看到的 +4/+4 由**上游 0.2.3 内建**提供
  //   （GitHub #415 / PR #429：同一个安装器函数、同一对 garrison_108_a/b、同一个 `dollSwap → fireGain`；
  //   上游自己的回归用例 `test/content/fartooth-doll-swap.test.js` 钉着这条）。
  const on = withDollSwapSeam(true, swapOnce);
  assert.deepEqual(on.layers, off.layers, '★ 旗标已无效：写与不写旗标逐值相同（接缝已从基座撤除）');
  assert.equal(on.dDep, off.dDep, '★ 写旗标也不会让换体变成通用部署');
  assert.deepEqual(on.layers, [29, 28], '0.2.3 的 +4/+4 来自上游内建，旗标不参与；我们的接缝确实已不存在');
});
