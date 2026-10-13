// test/render/skinvoice-random.test.js — 更新②「为所有干员使用随机皮肤」的**逻辑层**回归（无 DOM、无浏览器）。
//
// 覆盖服主需求里最容易被改坏的三条：
//   1. 随机范围**只在该干员已有的时装里抽**（`table.operators[charId].skins`），
//      没有时装可选的干员（实测 112 名里 5 名）**跳过且不报错**；
//   2. 结果写进**现有存储**（`sp.pref.skinvoice` 的 `skins` 映射）⇒ 按玩家、按干员保存的格式不变，
//      `randomKeys` 是新增的向后兼容字段（老配置读进来 = 空数组）；
//   3. 随机之后「皮肤 ↔ 战斗小人」的绑定还在：`applyRecord` 仍然把 spine 一起写进 manifest，
//      且 `restore()` 能精确还原随机前的选择。
//
// ★ 依赖注入：`createSkinApplier({ random })` 与 `createConfig({ read, write })` 都是可注入的
//   （见 client/skins.js / client/config.js 的 JSDoc），所以本测试**不碰 localStorage、不做随机**。
//   ★ 为什么断言随机覆盖面用"步进随机源"而不是统计：整百次抽样的断言在 CI 上偶发（概率 0），
//     而"把 [0,1) 切成 n 份取每份代表"能**确定性地**证明每种时装都被抽得到。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSkinApplier } from '../../mods/cyanfish.skinvoice/client/skins.js';
import { createConfig, sanitize } from '../../mods/cyanfish.skinvoice/client/config.js';

/** 一条能通过 `applyRecord` 的时装记录（spine 三段齐全 + anims，见 skins.js 的 spineSide）。 */
const skin = (id, withSpine = true) => ({
  id,
  name: id,
  avatar: `https://up.example/${id}.png`,
  portrait: `https://up.example/${id}_p.png`,
  battle: withSpine
    ? { hasSpine: true, skel: `/mods/x/assets/${id}.skel`, atlas: `/mods/x/assets/${id}.atlas`, textures: [`/mods/x/assets/${id}.png`], anims: { idle: 'Idle' } }
    : { hasSpine: false },
});

/** 一张最小数据表：3 套（A）*立绘+小人* / 1 套（B）*只有立绘* / 没有 skins 字段（C）/ 空数组（D）。 */
const TABLE = {
  operators: {
    char_A: { skins: [skin('A1'), skin('A2'), skin('A3')], voices: [] },
    char_B: { skins: [skin('B1', false)], voices: [] }, // hasSpine=false ⇒ 素材没到位，小人保持官方默认
    char_C: { voices: [] },              // 连 skins 字段都没有（老表 / 半成品包）
    char_D: { skins: [], voices: [] },   // 空数组
  },
};

/** manifest：只放 A/B，且原值是官方默认（用于断言"改过 / 还原"）。 */
const MANIFEST = {
  chars: {
    char_A: { avatar: '/a/A.png', avatarE2: '/a/A2.png', portrait: '/p/A.png', portraitE2: '/p/A2.png', spine: { front: { skel: '/official/A.skel', atlas: '/official/A.atlas', textures: [], anims: { idle: 'Idle' } } } },
    char_B: { avatar: '/a/B.png', portrait: '/p/B.png' },
  },
};

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * 一套被测装置：内存存储 + 可编程随机源 + 记录重渲染次数的假 hostApi。
 * @param {number[]} rolls 依次返回的随机数（[0,1)）；用完后循环
 */
function makeHarness(rolls = [0]) {
  /** @type {Map<string,string>} 假的 localStorage */
  const disk = new Map();
  const store = { sel: null, open: false, set(patch) { this.sel = patch.sel ?? this.sel; renders++; } };
  store.get = () => store;
  let renders = 0;
  let i = 0;
  const random = () => rolls[Math.min(rolls.length - 1, i++) % rolls.length];
  const cfg = createConfig({
    read: (k, d) => (disk.has(k) ? JSON.parse(disk.get(k)) : d),
    write: (k, v) => { disk.set(k, JSON.stringify(v)); },
    log: noopLog,
  });
  const api = {
    data: { load: async () => MANIFEST, lookup: () => null },
    loadout: { store },
  };
  const skins = createSkinApplier({ api, cfg, table: TABLE, log: noopLog, random });
  return { disk, cfg, skins, store, random, renders: () => renders, rollsLeft: () => i };
}

describe('更新② 随机皮肤：randomizeAll()', () => {
  test('只在"该干员已有的时装"里抽；空的/没有 skins 的跳过且不报错', async () => {
    const h = makeHarness([0]);
    const r = await h.skins.randomizeAll();
    assert.equal(r.n, 2, 'char_A + char_B 参与（char_C 没有 skins 字段、char_D 是空数组）');
    assert.equal(r.skipped, 2, '两种"没有可选时装"都被跳过，且没有抛错');
    assert.deepEqual(Object.keys(h.cfg.get().skins).sort(), ['char_A', 'char_B']);
    assert.deepEqual(h.cfg.get().randomKeys.sort(), ['char_A', 'char_B']);
    for (const [charId, skinId] of Object.entries(h.cfg.get().skins)) {
      const ids = TABLE.operators[charId].skins.map((s) => s.id);
      assert.ok(ids.includes(skinId), `${charId} 抽到的 ${skinId} 必须在它自己的时装里（${ids.join('/')}）`);
    }
  });

  test('每种时装都有机会被抽到（确定性：把 [0,1) 切成 n 份）', async () => {
    const seen = new Set();
    for (let k = 0; k < 3; k++) {
      const h = makeHarness([k / 3 + 0.01]);
      await h.skins.randomizeAll();
      seen.add(h.cfg.get().skins.char_A);
    }
    assert.deepEqual([...seen].sort(), ['A1', 'A2', 'A3'], '三套都出现在结果里（没有"永远抽同一套"的偏斜）');
  });

  test('写进现有存储形状：skins 仍是 { charId: skinId }，randomKeys 是新增字段', async () => {
    const h = makeHarness([0.5]);
    await h.skins.randomizeAll();
    const raw = JSON.parse(h.disk.get('sp.pref.skinvoice'));
    assert.equal(raw.version, 1, '版本号不变（没有破坏性改动）');
    assert.equal(typeof raw.skins, 'object');
    assert.equal(raw.skins.char_A, 'A2');
    assert.deepEqual(raw.randomKeys, ['char_A', 'char_B']);
    // 导出对象形状：老客户端读到 randomKeys 只会忽略它
    const exported = h.cfg.export();
    assert.equal(exported.version, 1);
    assert.deepEqual(Object.keys(exported.skins).sort(), ['char_A', 'char_B']);
  });

  test('立即生效：manifest 里立绘 / 头像 / 战斗小人一起换（绑定不破）', async () => {
    const h = makeHarness([0]);
    await h.skins.randomizeAll();
    const rec = MANIFEST.chars.char_A;
    assert.match(rec.portrait, /A1_p\.png$/, '立绘换成抽到的那套');
    assert.match(rec.avatar, /A1\.png$/);
    assert.match(rec.spine.front.skel, /A1\.skel$/, '★ 战斗小人跟着同一条选择走（皮肤与小人不许拆开）');
    assert.equal(rec.spine.front.anims.idle, 'Idle', 'anims 原样带上（宿主 validSpine 的硬门槛）');
    // ★ 优雅降级：抽到的那套没有战斗小人素材（hasSpine=false）时，立绘照样换、spine 保持官方默认
    const b = MANIFEST.chars.char_B;
    assert.match(b.portrait, /B1_p\.png$/, '只有立绘的时装：立绘也换');
    assert.equal(b.spine, undefined, '素材没到位 ⇒ 不写 spine，战斗里保持官方默认小人');
  });

  test('幂等性的一半：结果与随机前相同时 changed 记 0（界面据此说"这次没变"）', async () => {
    const h = makeHarness([0]);
    await h.skins.randomizeAll();
    assert.equal(h.cfg.get().skins.char_B, 'B1', '只有一套 ⇒ 必然抽到它自己');
    const again = await h.skins.randomizeAll();
    assert.equal(again.n, 2);
    assert.equal(again.changed, 0, '两名的结果都没变');
  });

  test('restore()：只还原被随机过的干员，其余选择保持不动', async () => {
    const h = makeHarness([0]);
    // 玩家先手动选了两名（一名会被随机覆盖、一名不在参与名单里）
    h.cfg.set({ skins: { char_A: 'A3', char_X: 'X9' } });
    const r = await h.skins.randomizeAll();
    assert.equal(h.cfg.get().skins.char_A, 'A1');
    assert.equal(h.cfg.get().skins.char_X, 'X9', '随机不碰没参与抽签的干员');
    await h.skins.restore(r.before);
    assert.equal(h.cfg.get().skins.char_A, 'A3', '★ 还原成随机之前的手动选择');
    assert.equal(h.cfg.get().skins.char_X, 'X9');
    assert.equal(h.cfg.get().skins.char_B, undefined, '随机前 B 没有选择 ⇒ 还原成"官方默认"（删键）');
    assert.deepEqual(h.cfg.get().randomKeys, [], '还原后不再标记为随机');
  });

  test('clear() 同时清掉随机标记（恢复默认的语义要干净）', async () => {
    const h = makeHarness([0]);
    await h.skins.randomizeAll();
    await h.skins.clear();
    assert.deepEqual(h.cfg.get().skins, {});
    assert.deepEqual(h.cfg.get().randomKeys, []);
  });

  test('随机后界面会重渲染（store.set 生成新对象 ⇒ 订阅者必然重渲染）', async () => {
    const h = makeHarness([0]);
    const before = h.renders();
    await h.skins.randomizeAll();
    assert.ok(h.renders() > before, 'rerender() 被调用过，否则界面还指着旧图');
  });
});

describe('更新② 配置：向后兼容', () => {
  // ★★ 0.15.0（工序 48）**口径变更在本文件里的落地**（只改这一处断言，理由是"口径变了没跟"，不是产品回归）：
  //   `config.js` 删掉了 `lang` / `voiceOn` / `throttle`（播放间隔 / 声道模式 / 同时播放上限 / 音量）/
  //   `officialVoice` / `inBattle` 这些键 —— 依据是已批准的两条口径：
  //     ① 「移除我们干员语音相关的整体功能，转用官方的干员语音」+「设置页面的语音相关设置也应取消」；
  //     ② 「本 Mod **不应更改任何官方默认设置**」（原 `officialVoice` 那一档就是把官方音量写成 0 的）。
  //   那些键的**读者**（自己那套播放器 `voice.js` / 声道闸门 `hostvoice.js` / 写官方设置的 `officialvoice.js`）
  //   也整文件删除 ⇒ 留着它们就是"点了没反应的假开关"（与已批准口径直接打架）。
  //   ⇒ 所以这里把旧断言 `assert.equal(s.lang, 'JP', '其余字段一个都不动')` 换成**正向断言**：
  //     旧键**一个都不许复活**，而玩家真正在意的两个字段（皮肤选择 / 素材线路）**逐值保住**。
  test('老配置（没有 randomEachMatch / randomKeys）读进来 = 关 + 空数组', () => {
    const s = sanitize({ version: 1, lang: 'JP', voiceOn: true, skins: { char_A: 'A2' }, mirror: 'raw' });
    assert.equal(s.randomEachMatch, false);
    assert.deepEqual(s.randomKeys, []);
    assert.deepEqual(s.skins, { char_A: 'A2' }, '★ 玩家的皮肤选择逐值保住（老配置向前自愈，不是整份丢掉）');
    assert.equal(s.mirror, 'raw', '★ 素材线路也逐值保住');
    for (const dead of ['lang', 'voiceOn', 'throttle', 'officialVoice', 'inBattle']) {
      assert.ok(!(dead in s), `★ 已退场的键 ${dead} 不许复活（0.15.0 口径：不再自己播语音、不改官方设置）`);
    }
    // ★★ 0.17.0（阶段 0 · 第二半）改断言（原：`assert.deepEqual(s.voices, {}, '老配置没有 voices ⇒ 空表…')`）：
    //   `voices`（单干员语音语种）这一整条轴**连同它的配置键一起删除** —— 上游 0.2.3 原生实现了同一个
    //   能力（`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`，存 `sp.pref.settings.voiceOverrides`），
    //   两份并存时官方在内层读 `voiceOverrides`、我们那条在外层改 `voiceLang` ⇒ 10 格真值表里有 2 格
    //   我们的设置被静默吃掉（`<开发期报告>/53-upstream-023-recon.md` §3.4）。
    //   ⇒ 判据从"归一成空表"改成"**这个键彻底不存在**"（写法变了、判据更严：原来还允许键存在）。
    assert.ok(!('voices' in s), '★★ voices 键已退场（语种轴删除；老配置里带着它也被静默丢弃，不复活）');
    assert.ok(!('voices' in sanitize({ voices: { char_A: 'CN', char_B: 'JP' } })),
      '★★ 就算老配置里写的是 CN/JP 这种"合法"档位，也不再被读出来（等价于全部跟随官方全局语种）');
  });

  test('脏输入自愈：randomKeys 里已不在 skins 的 id 被丢掉、非字符串被丢掉', () => {
    const s = sanitize({ skins: { char_A: 'A1' }, randomKeys: ['char_A', 'char_GONE', 7, '', null] });
    assert.deepEqual(s.randomKeys, ['char_A']);
    assert.deepEqual(sanitize({ randomKeys: 'not-an-array' }).randomKeys, []);
    assert.equal(sanitize({ randomEachMatch: 'yes' }).randomEachMatch, false, '只认布尔 true');
    assert.equal(sanitize({ randomEachMatch: true }).randomEachMatch, true);
  });

  test('导入 / 导出往返不丢字段', () => {
    const cfg = createConfig({ read: () => null, write: () => {}, log: noopLog });
    cfg.import({ version: 1, skins: { char_A: 'A1' }, randomEachMatch: true, randomKeys: ['char_A'] });
    const out = cfg.export();
    assert.equal(out.randomEachMatch, true);
    assert.deepEqual(out.randomKeys, ['char_A']);
    assert.deepEqual(out.skins, { char_A: 'A1' });
    assert.equal(cfg.get().version, 1);
  });
});
