// mods/cyanfish.debug-console/client/state.js — 调试控制台的**读取层与发送层**（纯函数，零宿主依赖）。
//
// 为什么单独一个文件：面板（panel.js）与入口（index.js）都要问同样几个问题 —— 「现在是不是单人 / 全 AI 对局」、
// 「这一局允许哪几个动作、上限多少」、「本波敌人是什么」、「我手上/棋盘上有哪些单位」—— 答案只能有**一份**
// （docs/MODS.md §4.6 纪律 1：不要另造第二份真相）。数据目录（干员 / 装备 / 敌人 / 盟约 / 悬赏卡）一律读宿主的
// `api.data`（=/data/*.json 的同一个 loader），**不在 Mod 里硬编码任何一份清单**（§4.12.2 四）。
//
// ★ 闸门口径与服务端逐字相同：`server/match/debug.js debugAllowed()` 看的是 `Match.loneHuman`
//   （`server/match/Match.js`「开局恰好 1 个真人座位」），客户端这一侧就看 `m.public.players` 里
//   `!p.isBot` 的个数是不是 1（观战者不进 players，见 `server/match/match/views.js`）。
//   **它不是权限**：真正的闸门在服务端，客户端这份只为了让「按钮在但点了被拒」这件事不发生。
// ★ 动作白名单与上限同样读**合并后的** `/data/config.json` 的 `debug` 段（hostApi.data.get('config')，正式契约）。
//
// ★★ 工序 115 追加的三条接缝（服务端见 docs/MODS.md §4.11 与 server/match/match/intents.js）：
//   `setEnemyAttr`（按属性整波倍率，`m.public.debugScale` 是它的只读读数）· `setLayers`（盟约层数绝对设置）
//   · `setWaveList`（整波敌人清单，走 `g.debug.list`）。

export const MOD_ID = 'cyanfish.debug-console';

/**
 * `config.debug` 缺失时的兜底（与服务端 `server/match/debug.js DEBUG_LIMITS` **同量级**，只是显示用）。
 * ★ 1.4.1：`maxCount` 从 20 改成 **200** —— 服务端的天花板也是 200（工序 115 修的那个"数据写 30 被静默夹成 20、
 *   面板显示 30 / 服务端按 20 算"的坑）。两边同量级是这条兜底的契约：**哪一端的兜底都不许低于另一端会接受的值**。
 */
export const FALLBACK = Object.freeze({ maxRound: 100, maxFunds: 1e6, maxLp: 999, maxLayers: 999, maxCount: 200 });

/** 面板的分类（类《杀戮尖塔》的控制台分栏）：id → 短标题（≤ 4 个全角字）。 */
export const TABS = Object.freeze([
  { id: 'state', label: '状态' },
  { id: 'basic', label: '基础' },
  { id: 'chess', label: '干员' },
  { id: 'item', label: '装备' },
  { id: 'wave', label: '敌人' },
  { id: 'scale', label: '强度' },
  { id: 'bond', label: '盟约' },
  { id: 'choice', label: '悬赏' },
]);

/**
 * 「强度」页的六个属性：`id` = `g.debug.id`（`setEnemyAttr` 的属性名）· `key` = `m.public.debugScale` 上的键
 * · `round` = 官方回合表本来就调它（`config.modes[*].enemyScale` 的 hp / atk / speed）。
 * ★ 面板**不自己算**任何倍率：显示值一律取服务端 `debugScale`（唯一真相）。
 */
export const ATTRS = Object.freeze([
  { id: 'atk', key: 'atkMul', label: '攻击', round: true },
  { id: 'hp', key: 'hpMul', label: '生命', round: true },
  { id: 'def', key: 'defMul', label: '防御', round: false },
  { id: 'res', key: 'resMul', label: '抗性', round: false },
  { id: 'speed', key: 'speedMul', label: '移速', round: true },
  { id: 'aspd', key: 'aspdMul', label: '攻速', round: false },
]);

/** 「敌人」页的类别筛选项（`test` 收到一条件敌人记录；`悬赏` 由 `bountyEnemyKeys` 判）。 */
export const ENEMY_CATS = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'special', label: '特异', test: (e) => e.acType === 'SPECIAL' },
  { id: 'invisible', label: '隐匿', test: (e) => e.acType === 'INVISIBLE' },
  { id: 'bounty', label: '悬赏', bounty: true },
  { id: 'elite', label: '精英', test: (e) => e.rank === 'ELITE' },
  { id: 'boss', label: '领袖', test: (e) => e.rank === 'BOSS' },
]);

/** 「敌人」页的状态筛选项（`added` = 这个敌人现在就在本波里）。 */
export const ENEMY_STATES = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'added', label: '已添加' },
  { id: 'empty', label: '未添加' },
]);

/** 悬赏 / 战术卡的分类短名（`kind` → 一行上的小字）。 */
export const CHOICE_FAMILY = Object.freeze({ ally: '我方效果', enemyDebuff: '敌方减益', terrain: '地图' });

/** 应用 store（宿主在 main.js 挂 `globalThis.__SP__ = { store, net, data, version }`；拿不到 ⇒ null，安静降级）。 */
export function appStore() {
  try { return globalThis.__SP__?.store ?? null; } catch { return null; }
}

/**
 * 发一条 `g.debug`（没有 net / 没有会话 ⇒ 返回 null，调用点沉默，不抛）。
 * `value`（整数）· `id`（字符串）· `list`（整波敌人清单）按动作需要给 —— 协议层三个都是可选的
 * （shared/protocol.js 的 `$optional: ['value', 'id', 'list']`）。★ `list` 传**空数组**是有意义的
 * （`setWaveList` 的空清单 = 这一波没有敌人），所以判据是"是不是数组"，不是"长不长"。
 */
export function sendDebug(action, value, id, list) {
  try {
    const net = globalThis.__SP__?.net;
    if (!net || typeof net.request !== 'function') return null;
    const msg = { action };
    if (Number.isInteger(value)) msg.value = value;
    if (typeof id === 'string' && id) msg.id = id;
    if (Array.isArray(list)) msg.list = list;
    return net.request('g.debug', msg);
  } catch {
    return null;
  }
}

/** 只保留十进制数字（输入框的 transform：e / + / - / 空格都进不到 value）。 */
export const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '').slice(0, 7);

/** 只保留十进制数字与**一个小数点**（「强度」页的倍率输入框）。 */
export const decimal = (v) => {
  const s = String(v ?? '').replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  return (i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '')).slice(0, 8);
};

/** 去掉干员 / 装备 id 末尾的 `_a` / `_b`（面板上那一行的 id 前缀）。 */
export const idPrefix = (id) => String(id ?? '').replace(/_[ab]$/, '');

/** 「1.300」这种读数：最多 3 位小数，末尾的 0 去掉。 */
export const mulText = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return String(Number(v.toFixed(3)));
};

const intOr = (v, dflt) => (Number.isInteger(v) && v >= 0 ? v : dflt);

/**
 * 一局的敌人预览（`m.private.nextEnemies`，server/match/waves.js previewOf）按 enemyKey 归并。
 * ★ `normal` / `bounty` 分开记：`normal` 是控制台能改的**本波**（`wave.spawns`），`bounty` 是官方悬赏兵
 * （`bountySpawns` 追加，控制台不改它）。面板改数量时改的是 `normal`。
 */
export function currentWave(priv) {
  const out = [];
  const idx = new Map();
  for (const e of Array.isArray(priv?.nextEnemies) ? priv.nextEnemies : []) {
    if (!e || typeof e.enemyKey !== 'string') continue;
    const n = Math.max(1, intOr(e.count, 1));
    const bounty = e.source === 'bounty' ? n : 0;
    const hit = idx.get(e.enemyKey);
    if (hit) { hit.count += n; hit.bounty += bounty; hit.normal += n - bounty; continue; }
    const rec = { enemyKey: e.enemyKey, count: n, normal: n - bounty, bounty };
    idx.set(e.enemyKey, rec);
    out.push(rec);
  }
  return out;
}

/** 面板要的那几个字段（store 快照 + 合并后的配置 → 一个纯对象）。 */
export function readView(api) {
  const store = appStore();
  const s = store && typeof store.get === 'function' ? store.get() : null;
  const pub = s?.match?.public ?? null;
  const priv = s?.match?.private ?? null;
  const players = Array.isArray(pub?.players) ? pub.players : [];
  const me = s?.me?.playerId ?? null;
  const mine = players.find((p) => p && p.playerId === me) ?? null;
  const cfg = typeof api?.data?.get === 'function' ? api.data.get('config') : null;
  const d = cfg && typeof cfg === 'object' && cfg.debug && typeof cfg.debug === 'object' ? cfg.debug : null;
  const humans = players.filter((p) => p && !p.isBot).length;
  const hand = [];
  for (const p of Array.isArray(priv?.hand) ? priv.hand : []) if (p) hand.push(p);
  const temp = [];
  for (const p of Array.isArray(priv?.temp) ? priv.temp : []) if (p) temp.push(p);
  const board = [];
  for (const p of Array.isArray(priv?.board) ? priv.board : []) if (p) board.push(p);
  // 场上已经吃过哪些"悬赏 / 战术决策"卡：引擎给它们的 EffectRef id 是 `choice:<effectId>#<n>`（见
  // server/sim/content/choices.js refIdFor 与 server/match/choices.js addRef）⇒ 从这里就能反查卡 id。
  const applied = [];
  for (const e of Array.isArray(priv?.effects) ? priv.effects : []) {
    const id = e && typeof e.id === 'string' ? e.id : '';
    if (!id.startsWith('choice:')) continue;
    applied.push({ refId: id, effectId: id.slice(7).split('#')[0], name: e.name || id });
  }
  // ★ 「策略初始值」（基础页生命值的中间那一档）：= 本局策略（bandId）的 target 生命；读的是同一份数据
  //   （bands.json 的 totalHp），缺省回 config.economy.defaultStartLp —— 与服务端 `GameData.startLp` 同口径。
  const bandId = typeof priv?.bandId === 'string' ? priv.bandId : null;
  const band = bandId && typeof api?.data?.lookup === 'function' ? api.data.lookup('bands', bandId) : null;
  const eco = cfg && typeof cfg === 'object' && cfg.economy && typeof cfg.economy === 'object' ? cfg.economy : null;
  const startLp = Number.isInteger(band?.totalHp) && band.totalHp > 0 ? band.totalHp : intOr(eco?.defaultStartLp, 28);
  const ds = pub?.debugScale && typeof pub.debugScale === 'object' ? pub.debugScale : null;
  return {
    ready: !!pub,
    phase: pub?.phase ?? null,
    round: Number.isInteger(pub?.round) ? pub.round : 0,
    bossRound: Number.isInteger(pub?.bossRound) ? pub.bossRound : null,
    hiddenRound: Number.isInteger(pub?.hiddenRound) ? pub.hiddenRound : null,
    stageId: typeof pub?.stageId === 'string' ? pub.stageId : null,
    funds: Number.isInteger(priv?.funds) ? priv.funds : 0,
    lp: Number.isInteger(mine?.lp) ? mine.lp : null,
    bandId,
    startLp,
    humans,
    // ★ 仅单人 / 全 AI：与服务端 Match.loneHuman 同口径（开局恰好 1 个真人座位）。
    // ★★ 工序 112 加固（观战席）：`humans` 是**对局级**计数（`pub.players`），而**观战席不在 `players` 里**
    //   ⇒「观战一场单人对局」时它同样是 1，光看它会让**观战者**也渲染出入口（服务端那边观战席一律
    //   `ERR.SPECTATOR`，即"能渲染但用不了" = 泄漏）。⇒ 再要求**本会话本人在座**（`mine` 非空：
    //   观战者的 playerId 不在 `pub.players` 里，见 public/js/main.js 的 isSpectating）。
    loneHuman: pub ? humans === 1 && !!mine : false,
    // ★ 服务端的总开关（config.debug.enabled）：与"这局行不行"是两件事，分开显示
    enabled: d?.enabled === true,
    actions: Array.isArray(d?.actions) ? d.actions : [],
    caps: {
      round: intOr(d?.maxRound, FALLBACK.maxRound),
      funds: intOr(d?.maxFunds, FALLBACK.maxFunds),
      lp: intOr(d?.maxLp, FALLBACK.maxLp),
      layers: intOr(d?.maxLayers, FALLBACK.maxLayers),
      count: intOr(d?.maxCount, FALLBACK.maxCount),
    },
    // ★ 工序 115：本回合敌人**实际**加成倍率（服务端 m.public.debugScale，只在 config.debug.enabled 时有）
    debugScale: ds,
    wave: currentWave(priv),
    hand, temp, board,
    items: [...hand, ...temp].filter((p) => p.kind === 'item'),
    bonds: (Array.isArray(priv?.bonds) ? priv.bonds : []).filter((b) => b && typeof b.bondId === 'string'),
    applied,
  };
}

/**
 * 两次 `readView` 的**渲染指纹**：面板真正会画出来的那些字段。用于订阅回调里跳过"什么都没变"的通知
 * —— 宿主每 ~100ms 推一次 `m.public`，不跳的话面板每秒重画十次（滚动位置与输入焦点就靠这个 + 稳定 DOM 保住）。
 */
export function viewSig(v) {
  try {
    return JSON.stringify([v.phase, v.round, v.bossRound, v.hiddenRound, v.stageId, v.funds, v.lp, v.bandId, v.startLp,
      v.loneHuman, v.enabled, v.actions, v.caps, v.debugScale, v.wave, v.applied,
      v.bonds, v.hand.length, v.temp.length, v.board.length, v.items.length]);
  } catch { return ''; }
}

/** 当前这一波（`normal` > 0 的那些）拼成 `setWaveList` 的清单：`["<enemyKey>:<count>", …]`。 */
export function waveListOf(counts) {
  const out = [];
  for (const [enemyKey, n] of counts) {
    const c = Math.max(0, Math.trunc(Number(n) || 0));
    if (c > 0) out.push(enemyKey + ':' + c);
  }
  return out;
}

/** 从 `view.wave` 取"控制台能改的那些数量"（`normal`）：Map<enemyKey, count>。 */
export function waveCountsOf(wave) {
  const m = new Map();
  for (const e of Array.isArray(wave) ? wave : []) {
    const n = Math.max(0, intOr(e.normal, 0));
    if (n > 0) m.set(e.enemyKey, n);
  }
  return m;
}

/** 悬赏 / 战术卡的**悬赏兵 key 集**（`choices.json` 的 `cards.bounty[].enemyKey` 与 `adds[].enemyKey`）。 */
export function bountyEnemyKeys(api) {
  const set = new Set();
  try {
    const ch = api?.data?.get?.('choices');
    for (const c of Array.isArray(ch?.cards?.bounty) ? ch.cards.bounty : []) {
      if (!c) continue;
      if (typeof c.enemyKey === 'string' && c.enemyKey) set.add(c.enemyKey);
      for (const a of Array.isArray(c.adds) ? c.adds : []) if (a && typeof a.enemyKey === 'string' && a.enemyKey) set.add(a.enemyKey);
    }
  } catch { /* 数据没就绪 ⇒ 空集（这一档筛不出东西，但不会抛） */ }
  return set;
}

/**
 * 「悬赏」页要列的那些卡。
 *
 * 口径（服主 2026-10-12 点名）：
 *   * **不列悬赏卡**（`cards.bounty`）—— 那 129 张**全部**是"为下场作战添加敌人"，加敌人改走「敌人」页；
 *   * **不列**只给资源 / 刷新次数 / 盟约层数 / 装备 / 干员的一次性我方 buff（`allybuff_select_1` / `2_*` / `3`
 *     / `4` / `5` / `6` / `7_*`）；
 *   * 只列**会给敌人或我方干员上常驻效果**的卡。
 *
 * ★ 判据取自**数据本身**（不是硬编码 id 清单）：`effects.json[effectId].buffs[]` 里存在一条**不是**
 *   `*_choice_*` 的条目 ⇒ 这张卡会落一条常驻效果（`env_gbuff_*` / `char_respawntime_mul` /
 *   `enemy_attribute_mul` …）。`*_choice_*` 那一族正是引擎的"立刻结算"机制（发装备 / 加层 / 加钱 / 免费刷新 /
 *   发干员）—— 与它同步的是 `clearChoice` 摘不掉它们的既有事实（docs/MODS.md §4.11）。
 * ★ 地图卡（`kind: 'terrain'`）**只在当前地图就是它改的那张时**才列（`stageId` 与 `m.public.stageId` 相等）。
 * @returns {Array<{ id: string, name: string, kind: string, family: string, team: boolean, desc: string }>}
 */
export function choiceCards(api, view) {
  const out = [];
  try {
    const ch = api?.data?.get?.('choices');
    for (const c of Array.isArray(ch?.cards?.tactic) ? ch.cards.tactic : []) {
      if (!c || typeof c.effectId !== 'string' || !c.effectId) continue;
      const kind = typeof c.kind === 'string' ? c.kind : '';
      if (kind === 'terrain') {
        if (typeof c.stageId === 'string' && c.stageId && c.stageId === view?.stageId) {
          out.push({ id: c.effectId, name: c.name || c.effectId, kind, family: CHOICE_FAMILY.terrain, team: false, desc: c.desc || '' });
        }
        continue;
      }
      const rec = typeof api?.data?.lookup === 'function' ? api.data.lookup('effects', c.effectId) : null;
      const buffs = Array.isArray(rec?.buffs) ? rec.buffs : [];
      const persistent = buffs.some((b) => b && typeof b.key === 'string' && b.key && !b.key.includes('_choice_'));
      if (!persistent) continue;
      out.push({
        id: c.effectId, name: c.name || c.effectId, kind, team: !!c.team, desc: c.desc || '',
        family: CHOICE_FAMILY[kind] || CHOICE_FAMILY.ally,
      });
    }
  } catch { /* 数据没就绪 ⇒ 空列表 */ }
  return out;
}

/**
 * 该动作在不在白名单里。★ 口径与服务端**逐字相同**（`debugActionAllowed`）：
 * `actions` 缺失 / 空数组 ⇒ 服务端归一化成 `null` ⇒ **一个动作都不许**（fail-closed），
 * 所以这里也必须是"没在表里就不显示"，绝不能反过来说"表为空 = 全放行"。
 */
export const hasAction = (view, a) => Array.isArray(view.actions) && view.actions.includes(a);

/** 服务端总开关是否打开（`config.debug.enabled === true`）。 */
export const seamOn = (view) => view.enabled === true;

/** 夹回合法范围（服务端还会再夹一次；这里只是让按钮不会送出一个必被拒的值）。 */
export function clampNum(view, key, n, lo = 1) {
  const cap = view.caps[key] ?? 1;
  const v = Number.isInteger(n) ? n : lo;
  return Math.max(lo, Math.min(cap, v));
}

/** 阶段说明（哪一种阶段允许"改这一波"是服务端的规矩，这里只做提示）。 */
export const PHASE_HINT_EDIT = '当前阶段可以改本波敌人与敌方加成。';
export const PHASE_HINT_PLAYER = '当前阶段只能改本人数据（资金 / 生命 / 盟约 / 干员 / 装备）。';
export const phaseHint = (view) => (view.phase === 'PREP' || view.phase === 'ROUND_START' ? PHASE_HINT_EDIT : PHASE_HINT_PLAYER);

// ---- 文案（★ docs/MODS.md §4.12.2：短标签 ≤ 14 个全角字；长说明一律收进「？」小圈）--------------------

/** 「？」小圈的文案（一句一义，不写实现细节，≤ 160 个全角字）。 */
export const TIP = Object.freeze({
  round: '跳到指定回合，并按该回合重建本波的敌人与按回合的敌人属性加成。只在整备期与回合开始时可用，改完这一局的人都会重新变回"未准备"。',
  funds: '把本人资金设成这个数。同一次回合开始还会照常发放本回合收入，所以过一会儿数字可能比这里大一点。',
  lp: '目标生命值（漏一个敌人扣的那种）。只对本人生效；设成 1 之后还要等漏怪结算才会被淘汰。★ 对局内干员的血量不在这里 —— 那是客户端算的，服务端改不动。',
  layers: '直接改本人某条盟约的层数（无需该盟约已激活），加层和减层都可以。加完会立刻刷新盟约条与相关效果。',
  chess: '把指定干员直接发到本人手上，一次一个。走的是引擎的获得路径（含共享池份数、手牌满与自动合并规则），所以池子账本是平的。',
  item: '把指定装备直接发到本人整备区，一次一件。两件同名装备会按官方规则自动合成精锐。',
  wave: '本波敌人的组成：点一行选中它，再用上方的加减按钮或那一行右侧的数量改数量。数量改成 0 就是从这一波移除；「还原本波」回到官方波次。',
  attr: '整波敌人的属性倍率：一边显示本回合的实际倍率，一边可以直接改（改的是数值本身，不是再乘一层）。改动对本波所有敌人生效，「还原」回到本回合官方值。',
  attrRound: '这一项的官方值本来就会随回合变化，所以「还原」回到的是本回合官方给的那个数，不是 1。',
  attrFixed: '这一项的官方值不随回合变化（一直是 1），所以「还原」就是回到 1。',
  choice: '给本人（或全队）施加一张战术决策卡的常驻效果，用开关切换。地图卡只在你正打的那张图上出现。' +
    '★ 只列会给敌人或我方干员上效果的卡：发装备 / 加层 / 加钱 / 免费刷新 / 发干员那些一次性的不在这一页。',
});

/** 短标签 / 状态读数的文案。 */
export const TXT = Object.freeze({
  round: '回合',
  funds: '资金',
  lp: '生命值',
  normal: '普通',
  golden: '精锐',
  wave: '数量',
  rebuild: '还原本波',
  revoke: '撤销',
  clearAll: '清空全部 buff',
  search: '搜索',
  tier: '阶数',
  cat: '类别',
  state: '状态',
  pick: '已选',
  pickNone: '未选',
  reset: '还原',
  set: '设置',
  zero: '归零',
  max: 'MAX',
  switchOn: '已施加',
  switchOff: '未施加',
  hp: '（干员血量由客户端计算，控制台改不了）',
});

/** 一栏里最多画几行（其余靠筛选或搜索收窄；避免一次塞进几百个 DOM 节点）。 */
export const LIST_LIMIT = 40;
