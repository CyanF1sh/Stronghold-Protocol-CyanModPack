// test/mods/fix-mechanism-leader-erosion.test.js — `cyanfish.fix-mechanism` 的 `leader-erosion` 项（工序 host-006）。
//
// 服主裁定（有意偏离官方贴士）：「领袖能吃别的损伤凭什么侵蚀损伤不吃。」
// 走平台真实路径：`server/sim/content/index.js` 的 `registerModContent`（与 server/mods/content.js 同一个注册层，
// 浏览器走同一个函数），再把该 Mod 的 `content/index.js` 装进 flat boss 战场。验收口径：
//   · 不装 / 未注册本 Mod ⇒ 领袖侵蚀逐值等于上游（0 计量 / 0 爆发 / 血池不掉 / 克莱门莎三技能不掉弹药）；
//   · 装上本项 ⇒ 领袖侵蚀计量爬升到上限 2000 ⇒ 爆发（永久 DEF -120 + 5000 元素伤害进共享血池）⇒
//     克莱门莎三技能打【可轰炸标记】并在下一次 onTick 掉一发弹药、舰船轰炸命中领袖；
//   · **只动侵蚀**：同一领袖的灼燃 / 神经 / 凋亡 / 坏死 与所有非领袖敌人的侵蚀逐值不变；
//   · `installLeaderErosion(battle, false)` 逐值等于上游（"关掉这一项 = 与官方逐值相同"可被直接断言）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerModContent, clearModContent } from '../../server/sim/content/index.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { ELEMENT } from '../../server/sim/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MOD_ID = 'cyanfish.fix-mechanism';
const MOD_URL = pathToFileURL(path.join(ROOT, 'mods', MOD_ID, 'content', 'index.js')).href;
const QUIET = { log() {}, info() {}, warn() {}, error() {} };
const C = 'char_4231_clemnt';
const LEADER = 'enemy_9021_acduml';
/** 敌方侧侵蚀爆发（constants.js `ELEMENT.erosion.enemy`）：永久 DEF -120 + 5000 元素伤害进共享血池。 */
const { defDown: DEF_DOWN, elemDamage: BURST_HIT } = ELEMENT.erosion.enemy;

const enemy = (key, opts = {}) => enemyRec({ key, hp: 1e8, atk: 0, speed: 0, def: 300, ...opts });
const DEFS = { enemies: { dummy: enemy('dummy'), lead: enemy('lead') } };
const pool = (hp) => ({ hp, maxHp: hp, damage(pid, a) { this.hp = Math.max(0, this.hp - a); } });

after(() => clearModContent());

/** flat boss 战场 + 一只领袖（`tag: 'boss'` ⇒ `isBoss`）。 */
function scene({ key = 'dummy', units = null, tag = 'boss', def = 300, timeLimit = 180 } = {}) {
  const h = makeBattle({ kind: 'boss', seed: 23, autoFinish: false, timeLimit, defs: DEFS,
    sharedBoss: pool(1e6), hooks: ['elementBurst', 'ammoUsed', 'damaged'], captureNoisy: true, units: units ?? undefined });
  h.step();
  const e = h.spawn(key, { pos: [3, 10], tag, def });
  h.step();
  return [h, e];
}

/** 克莱门莎三技能（本模式生产路径：自选位 6 阶 + 三技能）：返回 [h, 她]。 */
function clemScene() {
  const [h, e] = scene({ key: 'lead', units: [{ uid: 1, diy: { slot: 6, charId: C, skillIndex: 2 }, elite: true, potential: 6, row: 3, col: 3, dir: 'RIGHT' }] });
  const u = h.unit(1);
  u.skill.gainSp(999, 'init');
  assert.equal(u.skill.activate('test'), true);
  return [h, u, e];
}

const erode = (h, e, amount) => { const r = h.b.dealDamage(null, e, { type: 'element', element: 'erosion', amount }); h.step(2); return r; };
const burstsOn = (h, e) => h.hooksOf('elementBurst').filter((c) => c.target === e).length;

test('不装本 Mod：领袖侵蚀 = 上游（0 计量 / 0 爆发 / 不爆发的四种元素照常）', () => {
  clearModContent();
  const [h, e] = scene({ key: LEADER });
  assert.equal(e.isBoss, true);
  assert.equal(erode(h, e, 5000), 0, '侵蚀被基座那条 elementHit 免疫钩子取消');
  assert.equal(e.elem.erosion, 0);
  assert.equal(burstsOn(h, e), 0);
  assert.equal(h.b.sharedBoss.hp, 1e6, '血池不掉');
  assert.equal(h.b.dealDamage(null, e, { type: 'element', element: 'burn', amount: 100 }) > 0, true, '灼燃照常');
  assert.equal(h.b.errors.length, 0);
});

test('装上本项：领袖侵蚀计量爬升 ⇒ 上限 2000 爆发（永久 DEF -120 + 5000 元素伤害进血池）', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const [h, e] = scene({ key: LEADER });
  assert.equal(e.gaugeMax, 2000, '领袖的计量上限仍是 2000（本项不动上限）');
  assert.equal(e.s.def, 700, 'enemy_9021_acduml 的基础 DEF');
  assert.equal(erode(h, e, 1000), 1000, '第 1 发：计量 1000');
  assert.equal(e.elem.erosion, 1000);
  assert.equal(burstsOn(h, e), 0);
  assert.equal(erode(h, e, 1000), 1000, '第 2 发：计量到上限 2000 ⇒ 爆发');
  assert.equal(burstsOn(h, e), 1);
  assert.equal(e.findBuff('erosionDown')?.stacks, 1, '爆发给了永久 erosionDown');
  assert.equal(e.s.def, 700 - DEF_DOWN, 'DEF 永久 -120');
  assert.equal(1e6 - h.b.sharedBoss.hp, BURST_HIT, '爆发的 5000 元素伤害落进共享血池');
  assert.equal(h.b.errors.length, 0);
});

test('装上本项：计量上限仍是 2000，爆发冷却锁住后续侵蚀（第三发返回 0、不掉血池）', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const [h, e] = scene({});
  assert.equal(erode(h, e, 3000), 3000, '返回值是这一发填进去的量（3000）');
  assert.equal(e.elem.erosion, 2000, '计量本身仍被上限 2000 夹住');
  assert.equal(burstsOn(h, e), 1);
  const pool0 = h.b.sharedBoss.hp;
  assert.equal(erode(h, e, 1000), 0, '爆发冷却期间不再进计量');
  assert.equal(h.b.sharedBoss.hp, pool0, '冷却期间不再爆发');
  assert.equal(burstsOn(h, e), 1);
  assert.equal(h.b.errors.length, 0);
});

test('装上本项后克莱门莎三技能：领袖侵蚀爆发 ⇒ 掉 1 发弹药 + 三次舰船轰炸命中领袖', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const [h, u, e] = clemScene();
  assert.equal(u.skill.id, 'skchr_clemnt_3');
  assert.equal(u.skill.ammoLeft, 10);
  assert.equal(erode(h, e, 1999), 1999, '差 1 点：不爆发');
  assert.equal(u.skill.ammoLeft, 10, '没爆发 ⇒ 不掉弹药');
  assert.equal(u.skill.ammoLeft, 10);
  assert.equal(erode(h, e, 10), 10, '补满 2000 ⇒ 领袖侵蚀爆发');
  assert.equal(burstsOn(h, e), 1);
  assert.equal(u.skill.ammoLeft, 9, '爆发 ⇒ 打【可轰炸标记】⇒ 下一次 onTick 消耗 1 发弹药');
  h.run(8);
  const bombs = h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('clemnt:bomb'));
  assert.equal(bombs.filter((c) => c.type === 'phys').length, 3, '三次舰船轰炸（物理）命中领袖');
  assert.equal(bombs.filter((c) => c.type === 'elemental').length, 3, '每次轰炸各带一发元素伤害（侵蚀）');
  assert.equal(h.b.errors.length, 0);
});

test('不装本 Mod：同一场景领袖不掉弹药（上游 = 官方贴士）', () => {
  clearModContent();
  const [h, u, e] = clemScene();
  assert.equal(erode(h, e, 5000), 0);
  assert.equal(burstsOn(h, e), 0);
  h.run(8);
  assert.equal(u.skill.ammoLeft, 10, '官方口径：只有领袖时三技能一发不掉');
  assert.equal(h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('clemnt:bomb')).length, 0);
  assert.equal(h.b.errors.length, 0);
});

test('只动侵蚀：同一领袖的灼燃 / 神经 / 凋亡 / 坏死逐值不变', async () => {
  const read = () => {
    const [h, e] = scene({ key: LEADER });
    const out = {};
    for (const el of ['burn', 'neural', 'apoptosis', 'necrosis']) {
      out[el] = [h.b.dealDamage(null, e, { type: 'element', element: el, amount: 100 }), e.elem[el]];
    }
    out.erosion = [h.b.dealDamage(null, e, { type: 'element', element: 'erosion', amount: 100 }), e.elem.erosion];
    return out;
  };
  clearModContent();
  const off = read();
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const on = read();
  for (const el of ['burn', 'neural', 'apoptosis', 'necrosis']) {
    assert.deepEqual(on[el], off[el], `${el} 逐值不变（100 / 计量 100）`);
  }
  assert.deepEqual(off.erosion, [0, 0], 'OFF：领袖侵蚀 0');
  assert.deepEqual(on.erosion, [100, 100], 'ON：领袖侵蚀 100');
});

test('只动领袖：普通敌人的侵蚀逐值不变（同一场景两只同形敌人，一只 tag:boss）', async () => {
  await registerModContent([{ id: MOD_ID, specifier: MOD_URL }], { log: QUIET });
  const [h, e] = scene({ key: LEADER });
  const plain = h.spawn(LEADER, { pos: [3, 8] });
  h.step();
  assert.equal(plain.isBoss, false);
  assert.equal(erode(h, e, 1000), 1000, '领袖现在吃');
  assert.equal(erode(h, plain, 1000), 1000, '普通敌人照常吃（上游本来也吃）');
  assert.equal(e.elem.erosion, 1000);
  assert.equal(plain.elem.erosion, 1000);
  assert.equal(h.b.errors.length, 0);
});

test('关掉这一项（installLeaderErosion(battle, false)）⇒ 逐值等于上游', async () => {
  clearModContent();                                   // 不要被上面几个用例注册的每局钩子帮了忙
  const mod = await import(MOD_URL);
  const [h, e] = scene({ key: LEADER });
  assert.equal(mod.installLeaderErosion(h.b, false), false, '不生效、也不挂任何东西');
  assert.equal(erode(h, e, 5000), 0);
  assert.equal(e.elem.erosion, 0);
  assert.equal(burstsOn(h, e), 0);
  clearModContent();
});

test('幂等：同一个 battle 上重复安装只包一层；台账计数只加一次', async () => {
  clearModContent();
  const mod = await import(MOD_URL);
  const [h] = scene({ key: LEADER });
  mod.resetLeaderErosionState();
  assert.equal(mod.installLeaderErosion(h.b), true);
  assert.equal(mod.installLeaderErosion(h.b), false, '第二次是 no-op');
  assert.equal(mod.LEADER_EROSION_STATE.installed, 1);
  clearModContent();
});
