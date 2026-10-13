// test/render/skinvoice-battlerandom.test.js — 更新②「每局开始时随机」的**触发点与幂等性**回归（无 DOM）。
//
// 服主需求里的硬要求是「**同一个触发点不要重复随机**，要幂等」。这条最容易在"store 每一帧都变"的战斗里
// 被改坏（回合推进、阶段切换、观战切人都会触发 store 订阅），所以这里把幂等性钉死在测试里：
//   · 进入 `game` → 恰好抽 1 次；
//   · 同一局内 store 连续变动 → 仍然是 1 次；
//   · 回到大厅再进一局 → 第 2 次；
//   · 开关关着 → 0 次（且"这一局的机会"被消费掉，开局后才打开开关也不会补抽）。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { attachBattleRandomizer } from '../../mods/cyanfish.skinvoice/client/battlerandom.js';

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** 一个最小的应用 store + selectRoute（真宿主里是 /js/store.js，这里的映射就是它的口径）。 */
function makeApp(route, seed = {}) {
  const subs = new Set();
  const state = { route, ...seed };
  return {
    state,
    get: () => state,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** 路由切换（同时通知订阅者，模拟宿主 store.set）。 */
    goto(next) { state.route = next; for (const fn of [...subs]) fn(state); },
    /** 同一局内的普通状态变动（路由不变）。 */
    touch(patch = {}) { Object.assign(state, patch); for (const fn of [...subs]) fn(state); },
  };
}
const selectRoute = (s) => s.route;
const microtasks = () => new Promise((r) => setImmediate(r));

/** 记录调用次数的随机函数。 */
function counter() {
  let n = 0;
  return { calls: () => n, fn: async () => { n++; return { n: 0 }; } };
}

/** 一个可写的假配置（只认 randomEachMatch，与真 config 的读取口径一致）。 */
const cfgOf = (randomEachMatch) => ({ get: () => ({ randomEachMatch }) });

describe('更新② 每局开始时随机：触发点与幂等', () => {
  test('进入 game 恰好抽一次；同一局内 store 反复变动不重复抽', async () => {
    const app = makeApp('lobby');
    const c = counter();
    const off = attachBattleRandomizer({ cfg: cfgOf(true), store: app, selectRoute, randomize: c.fn, log: noopLog });

    app.touch();                                   // 大厅里的普通变动：不该抽
    assert.equal(c.calls(), 0);
    app.goto('room');
    assert.equal(c.calls(), 0, '房间里还不算开局');
    app.goto('game');                              // ★ 开局
    await microtasks();
    assert.equal(c.calls(), 1, '进入战场 ⇒ 抽一次');
    for (let i = 0; i < 20; i++) app.touch({ phase: i });   // 回合推进 / 阶段切换 / 观战切人 ……
    await microtasks();
    assert.equal(c.calls(), 1, '★ 同一局里无论 store 变多少次都只有一次（幂等）');
    off();
  });

  test('回到大厅再开一局 ⇒ 第 2 次（"每局"的语义）', async () => {
    const app = makeApp('game');
    const c = counter();
    const off = attachBattleRandomizer({ cfg: cfgOf(true), store: app, selectRoute, randomize: c.fn, log: noopLog });

    await microtasks();
    assert.equal(c.calls(), 1, '装载时就在战斗中（刷新页面 / 重连）也算这一局的开始');
    app.goto('lobby');                             // 本局结束
    app.goto('room');
    app.goto('game');                              // 新的一局
    await microtasks();
    assert.equal(c.calls(), 2);
    app.touch({ phase: 'x' });
    await microtasks();
    assert.equal(c.calls(), 2, '新的一局里同样只有一次');
    off();
  });

  test('开关关着 ⇒ 一次都不抽；开局中途打开开关也不会补抽（机会已消费）', async () => {
    const app = makeApp('lobby');
    const c = counter();
    let on = false;
    const cfg = { get: () => ({ randomEachMatch: on }) };
    const off = attachBattleRandomizer({ cfg, store: app, selectRoute, randomize: c.fn, log: noopLog });

    app.goto('game');
    await microtasks();
    assert.equal(c.calls(), 0, '开关关着：进入战场不抽');
    on = true;                                     // 玩家在局内打开了开关
    app.touch({ phase: 1 });
    await microtasks();
    assert.equal(c.calls(), 0, '★ 同一局不补抽（下一次开局才生效）');
    app.goto('lobby'); app.goto('game');           // 下一局
    await microtasks();
    assert.equal(c.calls(), 1, '下一局开始按新开关抽一次');
    off();
  });

  test('卸载后不再抽（extensions.js 卸载本 Mod 时必须干净）', async () => {
    const app = makeApp('lobby');
    const c = counter();
    const off = attachBattleRandomizer({ cfg: cfgOf(true), store: app, selectRoute, randomize: c.fn, log: noopLog });
    off();
    app.goto('game');
    await microtasks();
    assert.equal(c.calls(), 0);
  });

  test('拿不到 __SP__.store / selectRoute ⇒ 静默降级，不抛错', async () => {
    const warns = [];
    const log = { ...noopLog, warn: (...a) => warns.push(a.join(' ')) };
    for (const deps of [{ store: null, selectRoute }, { store: makeApp('game'), selectRoute: null }, { store: null, selectRoute: null }]) {
      const off = attachBattleRandomizer({ cfg: cfgOf(true), randomize: async () => {}, log, ...deps });
      assert.equal(typeof off, 'function');
      off();
    }
    assert.equal(warns.length, 3, '每一种缺依赖都留一行 warn（可排查），但绝不抛错');
  });

  test('随机函数抛错 / 变慢都不影响订阅链（下一次开局照常抽）', async () => {
    const app = makeApp('lobby');
    let n = 0;
    const off = attachBattleRandomizer({
      cfg: cfgOf(true), store: app, selectRoute, log: noopLog,
      randomize: async () => { n++; if (n === 1) throw new Error('boom'); },
    });
    app.goto('game');
    await microtasks();
    assert.equal(n, 1, '第一次抛错被吞掉（只 warn）');
    app.goto('lobby'); app.goto('game');
    await microtasks();
    assert.equal(n, 2, '下一次开局照常触发');
    off();
  });
});
