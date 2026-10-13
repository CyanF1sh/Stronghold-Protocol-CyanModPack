// test/mods/lobby-kitted.test.js — the DIY gate's seam: the operators a 自选 slot may field are
// KITTED_CHARS (the base registry, server/sim/content/kits/index.js) **plus the kits the installed Mods
// registered** (server/sim/content/index.js MOD_KITS), see docs/MODS.md §4.15 (工序 63 + 工序 84).
//
// 全仓一共**三处**读这个集合，三个都必须接（少一个就会出现「选择器列得出来、服务端也收得下，但一开局就被丢掉」）：
//   ① server/lobby.js room.diy（保存自选编队）的 checkDiyPicks
//   ② server/lobby.js welcomeInfo() 的 welcome.diyKitted（客户端选择器拿它列候选）
//   ③ server/match/player/diy.js setDiy() 的默认门（由 PlayerState 开局重建 picks 时走到）
// ① ② 共用一个 kittedChars()；③ 因为 lobby.js ⇄ match/* 的 import 会成环，保留了**同一行推导**
// （server/match/player/diy.js 的 kittedChars()）。本文件断言两者**逐值相等**（防漂移）以及
// **不装带 kit 的 Mod 时逐值等于 KITTED_CHARS**（与上游 0.2.3 相同）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { kittedChars as lobbyKitted } from '../../server/lobby.js';
import { kittedChars as diyKitted, PlayerDiy } from '../../server/match/player/diy.js';
import { clearModContent, modContentInfo, registerModContent } from '../../server/sim/content/index.js';
import { checkDiyPicks } from '../../shared/protocol.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { DATA } from '../match/harness.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };

/** Install one fake L3 mod that registers a kit for `charId`; returns the id it reported as installed. */
async function installKit(charId, kit) {
  const src = 'export default (api) => { api.addKit(' + JSON.stringify(charId) + ', globalThis.__TEST_KIT__); };';
  return registerModContent([{ id: 'test.fixture', specifier: 'data:text/javascript,' + encodeURIComponent(src) }], { log: quiet });
}

test.afterEach(() => { clearModContent(); delete globalThis.__TEST_KIT__; });

test('no Mod with a kit: all three gates are per-value KITTED_CHARS (upstream 0.2.3 identical)', () => {
  assert.deepEqual(modContentInfo().kits, [], 'no L3 mod is registered in this process');
  // 基座在前、Mod 在后 —— 顺序与内容都等同 KITTED_CHARS
  assert.deepEqual(lobbyKitted(), [...KITTED_CHARS]);
  assert.deepEqual(diyKitted(), [...KITTED_CHARS]);
  assert.deepEqual(diyKitted(), lobbyKitted());
});

test('one Mod kit widens all three gates by exactly that key, and the two definitions stay per-value equal', async () => {
  const before = [...KITTED_CHARS];
  globalThis.__TEST_KIT__ = () => ({});
  const installed = await installKit('char_test_modkit', globalThis.__TEST_KIT__);
  assert.deepEqual(installed, ['test.fixture']);
  assert.deepEqual(modContentInfo().kits, ['char_test_modkit']);

  for (const [name, fn] of [['lobby', lobbyKitted], ['player/diy', diyKitted]]) {
    const set = fn();
    assert.deepEqual(set.slice(0, before.length), before, `${name}: 基座在前`);
    assert.deepEqual(set.slice(before.length), ['char_test_modkit'], `${name}: Mod kit 在后`);
    assert.ok(set.includes('char_test_modkit'), `${name}: 该干员进闸门`);
  }
  assert.deepEqual(diyKitted(), lobbyKitted(), '两处定义逐值相等（防漂移）');

  // 没有重名 ⇒ 集合大小只 +1（一个 key 被两个 Mod 抢会在 registerModContent 阶段整体回滚）
  assert.equal(new Set(diyKitted()).size, diyKitted().length);
});

test('a failing Mod rolls back: the gates go back to exactly KITTED_CHARS', async () => {
  globalThis.__TEST_KIT__ = () => ({});
  await installKit('char_test_modkit', globalThis.__TEST_KIT__);
  assert.equal(diyKitted().length, KITTED_CHARS.length + 1);
  clearModContent();
  assert.deepEqual(diyKitted(), [...KITTED_CHARS]);
  assert.deepEqual(lobbyKitted(), [...KITTED_CHARS]);
});

// The gate itself, with the real game data. ★ 口径说明：**基座数据里 `diy.ownedPool` 的 72 名全部都在
// KITTED_CHARS 里**（自选池只收有 kit 的干员），所以"在池里、却没有基座 kit"的干员在**纯基座数据**下不存在 ——
// 它只能由 Mod 的 L2 数据补进 `diy.ownedPool`（`cyanfish.collab-six` 正是这么做的）。
// ⇒ 单元测试用"把该干员**从基座门里摘掉**"来模拟"她的 kit 只来自 Mod"；
// 真正的端到端证明在 `<开发期报告>/84-live-probe.txt`（真机 4 名联动六星进池、`PlayerState.diy` 4 条、
// `_diyRecords=8`、diyStock 非空、7 个 spine 全部 acquire 成功、50 pass / 0 fail）。
const REAL = { skip: !hasGeneratedData() && 'the generated game data is not here' };

/** A real 自选-池 operator (the pool only holds kitted ones) plus the base gate with her taken out. */
function poolOperatorWithoutBaseKit() {
  const pool = DATA?.backups?.diy?.ownedPool;
  assert.ok(Array.isArray(pool) && pool.length, 'the generated data has a 自选 owned pool');
  const charId = pool.find((id) => KITTED_CHARS.includes(id));
  assert.ok(charId, 'the pool holds an operator with a base kit');
  return { charId, baseNoKit: KITTED_CHARS.filter((id) => id !== charId) };
}

test('a Mod-only kit widens the gate: the base gate drops the pick, the widened gate keeps it', REAL, async () => {
  const { charId, baseNoKit } = poolOperatorWithoutBaseKit();
  const picks = { chess_char_6_diy1_a: { charId, skillIndex: 0 } };

  const base = checkDiyPicks(picks, { data: DATA, kitted: baseNoKit });
  assert.equal(Object.keys(base.picks || {}).length, 0, '她不在 kit 名单里 ⇒ 基座门丢掉它');
  assert.equal(base.dropped, 1);

  globalThis.__TEST_KIT__ = () => ({});
  await installKit(charId, globalThis.__TEST_KIT__);
  const wide = checkDiyPicks(picks, { data: DATA, kitted: [...baseNoKit, ...modContentInfo().kits] });
  assert.equal(Object.keys(wide.picks || {}).length, 1, '把 Mod 给的 kit 加进来就留下它');
  assert.equal(wide.dropped, 0);
});

test('the third gate is honoured: setDiy drops on the narrowed gate, keeps on the widened one', REAL, async () => {
  const { charId, baseNoKit } = poolOperatorWithoutBaseKit();
  const picks = { chess_char_6_diy1_a: { charId, skillIndex: 0 } };
  const mk = () => Object.assign(Object.create(PlayerDiy.prototype), {
    isBot: false, playerId: 'p0', m: { gd: { raw: DATA }, log: quiet, roomCode: 'TEST' },
  });

  const a = mk();
  assert.equal(a.setDiy(picks, { kitted: baseNoKit }), true);
  assert.deepEqual(Object.keys(a.diy), [], '门窄 ⇒ 开局 this.diy = {}（工序 83 实测被丢 4/4 的机制）');

  const b = mk();
  assert.equal(b.setDiy(picks, { kitted: [...baseNoKit, charId] }), true);
  assert.deepEqual(Object.keys(b.diy), ['chess_char_6_diy1_a'], '门宽 ⇒ pick 活了下来');
  assert.equal(b._diyRecords.size, 2, '普通 + 精英两条记录');

  // 默认门（不传 opts）**不是**那个窄集合：同一份 picks 在默认门下留得下来
  const c = mk();
  assert.equal(c.setDiy(picks), true);
  assert.deepEqual(Object.keys(c.diy), ['chess_char_6_diy1_a'], '默认门比"把该干员摘掉"的窄门宽');
  assert.equal(c._diyRecords.size, 2);
});
