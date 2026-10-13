// test/mods/fix-enemy-gun-aspd.test.js — `cyanfish.fix-enemy` 的「假想敌：铳 攻速下限写法 + 首击即 ≥1 层」一项（工序 98）。
//
// 走平台真实路径：`server/sim/content/index.js` 的 `registerModContent`（与 server/mods/content.js 同一个注册层），
// 再把该 Mod 的 `content/index.js` 装进一个 flat boss 战场。验收口径（服主裁定，工序 98）：
//   · 出场那一帧仍是 0 层 ⇒ 22.5 s 的**显示值**逐值不变（详情卡的红 +18.00 是判断流程的正常呈现，显示层不动）；
//   · **任何一次实际攻击**的间隔 ≤ 5.625 s：第一次攻击前已生效 ≥1 层、切换目标后的第一次同样；
//   · 管 / 弦（同 aspd=0、无加攻速天赋）与其余敌人**逐值不变**（本项只管辖 enemy_9017_achunt(_2)）；
//   · 不装 / 未注册本 Mod ⇒ 逐值等于上游（这里用 clearModContent 复现上游那两处写法）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerModContent, clearModContent } from '../../server/sim/content/index.js';
import { makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MOD_ID = 'cyanfish.fix-enemy';
const MOD_URL = pathToFileURL(path.join(ROOT, 'mods', MOD_ID, 'content', 'index.js')).href;
const QUIET = { log() {}, info() {}, warn() {}, error() {} };

/** 一个打不死的靶子干员（只为让铳反复打同一个目标）。 */
function tankRec(id, def) {
  return {
    chessId: id, baseId: id, isGolden: false, tier: 1, name: id, charId: id,
    profession: 'TANK', subProfessionId: null, position: 'MELEE', bonds: [],
    stats: { maxHp: 1e9, atk: 1, def, res: 0, cost: 1, blockCnt: 3, bat: 1, aspd: 100, respawnTime: 999, spRecovery: 1, hpRecoveryPerSec: 1e6, moveSpeed: 0, tauntLevel: 0, massLevel: 0 },
    rangeGrid: [[0, 0]], dmgType: 'phys', attackKind: null, projectile: null, canHitFly: null, targetPriority: null,
    trait: { desc: '', bb: {} }, talents: [], tokens: [], immunities: {}, skill: null,
  };
}

/** flat boss 战场：`key` 出场在路线 0 的起点，靶子摆在它的攻击范围内（探针 98 用同一套摆位）。 */
function scene(key, { units } = {}) {
  const defs = { chess: { t_tank: tankRec('t_tank', 100), t_tank2: tankRec('t_tank2', 500) } };
  const h = makeBattle({
    kind: 'boss', seed: 1, autoFinish: false, timeLimit: 300, defs,
    units: units || [{ chessId: 't_tank', row: 2, col: 8 }],
    enemies: [{ key, time: 0, route: 0 }],
  });
  h.step(1);
  const e = h.enemy(key);
  // 探针干预：铳本来会走开（走出射程就换目标、层数清零），钉住它才能观察同一目标的斜坡
  h.b.addBuff(e, { key: 'probe:noMove', persist: true, flags: { noMove: true, bind: true }, mods: { moveMul: 0 } });
  return [h, e];
}

/** 铳天赋的每层加值（与基座 `kitGun` 读同一个黑板 `e.mem.ab.t`）。 */
const gunStep = (e) => Number((e.mem.ab && e.mem.ab.t)['2.attack_speed']);

after(() => clearModContent());

test('装上本项：出场仍是 0 层 22.5 s（显示值），但第一发之后每一次攻击间隔都 ≤ 5.625 s', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const [h, e] = scene('enemy_9017_achunt');
  assert.equal(e.s.aspd, 20, '出场：数据 aspd 0 ⇒ 下限 20');
  assert.equal(e.s.interval, 22.5, '出场：22.5 s 是 0 层的显示值');
  assert.equal(e.hp, e.s.maxHp);

  // 第一发：引擎给每只敌人 atkCd 0（battle/spawns.js:137），所以它由抬手决定，而不是由 22.5 s 决定
  h.runUntil(() => e.stats.attacks >= 1, 10);
  assert.equal(e.stats.attacks, 1);
  assert.equal(e.s.aspd, gunStep(e), '命中即 ≥1 层：aspd = 1 × 80');
  assert.equal(e.s.interval, 5.625, '第一发之后的间隔 = 5.625 s');

  h.runUntil(() => e.stats.attacks >= 3, 30);
  assert.equal(e.s.aspd, 3 * gunStep(e), '3 发后 = 3 层（上游是 2 层）');
  assert.equal(e.s.interval, 1.875);

  h.runUntil(() => e.stats.attacks >= 6, 30);
  assert.equal(e.s.aspd, 5 * gunStep(e), '上限 5 层');
  assert.equal(e.s.interval, 1.125);
});

test('装上本项：切换目标后的第一次攻击之后仍是 ≥1 层（不掉回 22.5 s）', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const [h, e] = scene('enemy_9017_achunt', { units: [{ chessId: 't_tank', row: 2, col: 8 }, { chessId: 't_tank2', row: 2, col: 9 }] });
  assert.equal(e.s.aspd, 20);
  h.runUntil(() => e.stats.attacks >= 2, 30);   // 一直打最高防御的 t_tank2（def 500）
  assert.equal(e.s.aspd, 2 * gunStep(e));
  // 把 t_tank2 的防御压到 t_tank 之下 ⇒ 下一发必然换目标（kitGun 的 before 按防御最高挑）
  const b2 = h.unit('t_tank2');
  h.b.addBuff(b2, { key: 'probe:defdown', persist: true, mods: { defMul: 0.05 } });
  assert.ok(b2.s.def < h.unit('t_tank').s.def);
  assert.equal(h.unit('t_tank').stats.taken, 0, '换目标之前一发没打过它');
  h.runUntil(() => e.stats.attacks >= 3, 30);
  assert.equal(e.s.aspd, gunStep(e), '换目标后的第一次攻击 = 1 层');
  assert.equal(e.s.interval, 5.625, '不是 22.5 s');
  h.run(2);   // 它是远程：这一发的弹道落地要一点时间，落地后才算「打在 t_tank 上」
  assert.ok(h.unit('t_tank').stats.taken > 0, '第 3 发打在 t_tank 上（换目标了）');
});

test('不注册本 Mod ⇒ 逐值等于上游（第 1 层被吞：第 1 发之后仍是 22.5 s）', () => {
  clearModContent();
  const [h, e] = scene('enemy_9017_achunt');
  h.runUntil(() => e.stats.attacks >= 1, 10);
  assert.equal(e.s.aspd, 20, '上游：命中后的那一帧仍是 0 层');
  assert.equal(e.s.interval, 22.5);
  h.runUntil(() => e.stats.attacks >= 3, 120);
  assert.equal(e.s.aspd, 2 * gunStep(e), '上游：3 发后才 2 层');
});

test('管 / 弦（同 aspd=0、无加攻速天赋）不在本项管辖内，逐值不变', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  for (const [key, interval] of [['enemy_9021_acduml', 15], ['enemy_9021_acduml_2', 15], ['enemy_9022_acdumm', 25]]) {
    const [h, e] = scene(key);
    assert.equal(e.s.aspd, 20, `${key}: 下限 20`);
    assert.equal(e.s.interval, interval, `${key}: 出场间隔`);
    assert.equal(e.findBuff('boss:aspd').mods.aspd, -80, `${key}: 仍走上游那条 max(20, raw+extra) − base`);
    h.run(40);
    assert.equal(e.s.aspd, 20, `${key}: 40 s 后仍 20`);
    assert.equal(e.s.interval, interval, `${key}: 间隔不变`);
  }
});
