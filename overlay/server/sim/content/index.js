// server/sim/content/index.js — installs all content into a Battle (DESIGN §7).
//
// installContent(battle, { mode }) — applies the per-battle loadout data view (simdata withUnitLoadouts; DESIGN §16),
//   then mode 'full' (default): hand-authored kits (kits/index.js: one file per kit in kits/ops/) with generic
//   fallback + every domain module's install(battle); 'generic': generic kits only, no domain modules;
//   'none': no kits (units never cast skills) and no modules. Every module install runs inside try/catch:
//   a faulty content module is logged and skipped, never crashing the battle.
// setupUnitKit(battle, unit, mode) — resolves a unit's Kit: kits[baseChessId]?.(bb, chess, def) ?? generic.
//   Battle opts.kits ({ [baseChessId]: kitFn }) take precedence (tests / sandboxes).
//   补位 stand-ins (isStandInDef: the def of simdata getStandIn — the chess's ids, another character's body): the kit is
//   kits[def.charId] (the stand-in's own, kits/ops/standin-<codename>.js), never the chess id's — that is the replaced
//   operator's kit; without one, the generic kit plus the talents it can apply exactly (generic.js genericTalents).
//   A stand-in has no default skill: its kit authors every skill it supports in `skills` (selectSkillSpec).
//   自选 pieces (isDiyDef: the def of simdata getDiy — a DIY slot's ids, the picked operator's body) take their kit the
//   same way: kits[def.charId] (an owned 6★'s kits/ops/op-<codename>.js, a prototype's standin-<codename>.js), else the
//   generic kit plus genericTalents; no default skill either (the pick chooses any of the three).
//   Operator loadouts (DESIGN §16): the def is resolved for the unit's selected skill / module (simdata getChess), so
//   the kit receives `chess.skill` = the SELECTED skill record and `bb` = its blackboard (talents / trait / module of
//   the selected module). Kit contract (backward compatible): `{ skill?, skills?: { [skillId]: SkillSpec }, talents,
//   trait, install? }` — the skill spec is `skills[selectedSkillId]` when the kit authors it, else `skill` only when
//   the selected skill is the chess's default one, else the GENERIC spec of the selected skill (its generic install,
//   e.g. counter damage, is chained after the kit's). Talents / trait / install of the kit always apply.
//   syncUnitLoadout (called first, before the battle starts): a unit whose def lacks the loadout of its own input entry
//   (id-only data lookups in a multi-player field; an entry without loadout fields = the default) is given its own
//   def; summon pieces follow their owner (an inline `def` of a token entry is kept). Summons spawned AFTER the start
//   are resolved by Battle (getToken(id, owner.defId, owner.def.loadout)), not here.
// registerAllMeta(registry) — calls each domain module's registerMeta(registry) (prep side, server boot).
//
// Mod 内容（L3, MOD SYSTEM）：registerModContent([{ id, specifier }]) 由宿主机在开战前调用一次（服务端
// server/mods/content.js 在 listen 之前；浏览器 public/js/battle/runner.js 的 loadBrowserSim 在 fetch('/mods') 之后），
// 把每个 Mod 的 content/index.js 装载进来。Mod 侧拿到的宿主句柄见 modHostApi（引擎模块 + addKit/addInstall/addMeta）。
// 未注册 Mod ⇒ MOD_KITS 空、MOD_INSTALLS 空 ⇒ 行为与没有这一层完全一致。

import { genericKit, genericTalents } from './generic.js';
import { withUnitLoadouts } from '../simdata.js';
import { isPotential } from '../../../shared/potential.js';
// Mod 内容（L3）的宿主句柄：Mod 的 content/index.js **不 import 任何引擎路径**（它的目录在仓库之外，
// 相对路径不可达，且两端（Node / 浏览器）根的映射不同），全部由这里交过去。见文件末尾 registerModContent。
// ★ `api.data` 用 server/data.js 的 getData（与 0.1.2 逐字一致）：它返回的正是在用的合并数据单例，管理页热重载
//   后 Mod 立刻看到新数据；`SUPPORT.gameData()` 有模块级缓存，只有 setGameData(null) 才失效（reloadMods 不调它）
//   ⇒ 热重载后 Mod 会读到旧数据。浏览器端 `../../data.js` 由 server/http/static.js:40-46 映射成 /data.js 垫片
//   （getSimData 注入），两端同形。★ 绝不 import ../nodeData.js（Node 专属，静态托管把它排除了）。
import * as SUPPORT from './support/index.js';
import * as TARGETING from '../targeting.js';
import * as DIRECTIONS from '../dir.js';
import * as BODY from '../body.js';
import * as DAMAGE from '../damage.js';
import * as CONSTANTS from '../constants.js';
import { sin, hypot } from '../detmath.js';
import { getData } from '../../data.js';

// Content files are loaded with guarded dynamic imports: a module that fails to load (syntax error, throwing
// top-level code, missing file) is logged and replaced by an empty module instead of breaking the server.
async function safeImport(path) {
  try {
    return await import(path);
  } catch (e) {
    console.error(`[content] failed to load ${path}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    return {};
  }
}

const KIT_REGISTRY = await safeImport('./kits/index.js');
const DOMAIN_NAMES = ['tokens', 'devices', 'enemies', 'bosses', 'bonds', 'garrisons', 'items', 'bands', 'choices'];
const DOMAINS = await Promise.all(DOMAIN_NAMES.map((n) => safeImport(`./${n}.js`)));
const tokens = DOMAINS[0];

/**
 * Merged kit registry: baseChessId → (bb, chess, def) => Kit, then the 补位 stand-in kits: stand-in charId → builder
 * (kits/index.js; each kit file is loaded guarded too)
 */
export const KITS = KIT_REGISTRY.KITS ?? Object.freeze({});

/** Domain modules in install order: tokens, devices, enemies, bosses, bonds, garrisons, items, bands, choices. */
export const MODULES = Object.freeze(DOMAIN_NAMES.map((n, i) => [n, DOMAINS[i]]));

// =====================================================================================================================
// Mod 内容（L3 行为代码）—— 由**宿主机**在开战前注册
//
// 设计（对应 MOD SYSTEM 的 L3 层）：
//   · Mod 是 <modsDir>/<id>/content/index.js（默认导出 `(api) => void`，`api` = 宿主句柄，见 modHostApi）。
//   · 加载顺序：服务端 server/mods/content.js 在 listen 之前 await registerModContent(...)；
//     浏览器在 public/js/battle/runner.js 的 loadBrowserSim 里 fetch('/mods') 后调用同一个函数。
//     ★ 两端必须加载**同一份** Mod 内容：客户端本地跑战斗（DESIGN §14），少一边就会让结果分裂。
//   · 路径：模组目录可以放在游戏仓库之外（测试实例就是 本地部署目录/mod/mods），所以 specifier 由宿主机给出——
//     服务端用 pathToFileURL() 的绝对 file: URL，浏览器用 /mods/<id>/content/index.js（server/index.js 新增的挂载）。
//   · 未注册任何 Mod 时 MOD_KITS 为空、MOD_INSTALLS/MOD_METAS 为空数组 ⇒ 与改动前的行为**完全一致**。
//   · 单个 Mod 安装抛错 ⇒ 只回滚**该 Mod** 注册的东西（沿用 loader.js 的逐 Mod 原子性），其余照常。
//   · ★ 0.2.x 起解析入口是公开的 kitOf(def, reg)（不是 0.1.2 里 setupUnitKit 的内联 pick() 闭包）：
//     补位 / 自选 def 只按 charId 命中，且命中后不再过 fallbackKit 的 genericTalents 合并。

/** Mod 的 kit 注册表：baseChessId → (bb, chess, def) => Kit。无 Mod 时为空对象。 */
const MOD_KITS = Object.create(null);
/** Mod 的每局 install 钩子（基座 domain modules 之后运行）：[{ id, fn }]。无 Mod 时为空。 */
const MOD_INSTALLS = [];
/** Mod 的预置侧 registerMeta 钩子：[{ id, fn }]。无 Mod 时为空。 */
const MOD_METAS = [];
/** 已成功安装的 Mod id（诊断 / GET /mods）。 */
let MOD_IDS = [];

/** 清空全部 Mod 内容（重新注册 / 测试）。 */
export function clearModContent() {
  for (const k of Object.keys(MOD_KITS)) delete MOD_KITS[k];
  MOD_INSTALLS.length = 0;
  MOD_METAS.length = 0;
  MOD_IDS = [];
}

/** 当前已安装的 Mod 内容快照（只读诊断）。 */
export const modContentInfo = () => Object.freeze({ mods: [...MOD_IDS], kits: Object.keys(MOD_KITS), installs: MOD_INSTALLS.length, metas: MOD_METAS.length });

/**
 * 交给 Mod 内容的宿主句柄。Mod 只依赖这个对象，不 import 任何引擎路径。
 * @param {string} id Mod id
 * @param {object} log 宿主日志
 */
function modHostApi(id, log) {
  const kits = [];
  const installs = [];
  const metas = [];
  return {
    apiVersion: 1,
    id,
    log,
    /** 合并后的游戏数据（server/data.js 的单例 / 浏览器的 setSimData 注入）。Mod 不得改写它。 */
    data: getData,
    /** 引擎模块句柄（与基座同一个模块实例）。 */
    support: SUPPORT, targeting: TARGETING, dir: DIRECTIONS, body: BODY, damage: DAMAGE, constants: CONSTANTS,
    /** 确定性数学（`server/sim/detmath.js`）：**只给 `sin` 与 `hypot`**（工序 63 的自选干员「丰川祥子」的音符
     *  「扩张正弦」弹道需要它们：`sin` 走侧向摆动、`hypot` 归一化归航方向；Mod 的 content 模块不能 import 引擎路径）。
     *  ★ 这是**纯加法**：不装 / 没有任何 Mod 用它时引擎行为逐值等于上游（两个都是引擎自己用的同一个函数引用）；
     *  `docs/MODS.md` §4.16 有登记与等价性证据。 */
    detmath: Object.freeze({ sin, hypot }),
    /** 注册一个干员 kit；同一 baseChessId 被两个 Mod 抢 ⇒ 后者失败（该 Mod 整体回滚）。 */
    addKit(baseChessId, fn) {
      if (typeof baseChessId !== 'string' || !baseChessId) throw new Error('addKit: baseChessId 必须是非空字符串');
      if (typeof fn !== 'function') throw new Error(`addKit(${baseChessId}): 必须是函数`);
      if (MOD_KITS[baseChessId]) throw new Error(`addKit: ${baseChessId} 已被 "${MOD_KITS[baseChessId].__modId}" 注册`);
      Object.defineProperty(fn, '__modId', { value: id, enumerable: false, configurable: true });
      MOD_KITS[baseChessId] = fn;
      kits.push(baseChessId);
    },
    /** 注册一个每局钩子 (battle) => void（基座 domain modules 之后、extra 之前运行）。 */
    addInstall(fn) {
      if (typeof fn !== 'function') throw new Error('addInstall: 必须是函数');
      const entry = { id, fn };
      MOD_INSTALLS.push(entry);
      installs.push(entry);
    },
    /** 注册一个预置侧 registerMeta（服务端启动时调用一次）。 */
    addMeta(fn) { if (typeof fn !== 'function') throw new Error('addMeta: 必须是函数'); const entry = { id, fn }; MOD_METAS.push(entry); metas.push(entry); },
    /** 撤销本 Mod 已注册的内容（安装抛错时用）。 */
    _undo() {
      for (const k of kits) if (MOD_KITS[k]?.__modId === id) delete MOD_KITS[k];
      for (const e of installs) { const i = MOD_INSTALLS.indexOf(e); if (i >= 0) MOD_INSTALLS.splice(i, 1); }
      for (const e of metas) { const i = MOD_METAS.indexOf(e); if (i >= 0) MOD_METAS.splice(i, 1); }
    },
  };
}

/**
 * 注册 Mod 内容（宿主调用一次，开战之前）。**绝不抛**：坏 Mod 只记日志并跳过。
 * @param {Array<{ id: string, specifier: string }>} entries specifier 由宿主机给出（Node: file: URL；浏览器: /mods/…）
 * @param {{ log?: object }} [opts]
 * @returns {Promise<string[]>} 成功安装的 Mod id
 */
export async function registerModContent(entries, { log = console } = {}) {
  clearModContent();
  for (const e of Array.isArray(entries) ? entries : []) {
    const id = String(e && e.id != null ? e.id : '?');
    const spec = e && e.specifier;
    if (typeof spec !== 'string' || spec === '') continue;
    let mod;
    try { mod = await import(spec); }
    catch (err) { log.error?.(`[mods] 内容模块加载失败（${id}）: ${err && err.message ? err.message : err}`); continue; }
    const installer = typeof mod?.default === 'function' ? mod.default
      : (typeof mod?.install === 'function' ? mod.install : null);
    if (!installer) { log.warn?.(`[mods] 内容模块没有默认导出安装函数（${id}）`); continue; }
    const api = modHostApi(id, log);
    try {
      const r = installer(api);
      if (r && typeof r.then === 'function') await r;   // 允许异步安装（例如自行 fetch 资源）
      MOD_IDS.push(id);
    } catch (err) {
      api._undo();
      log.error?.(`[mods] 内容安装失败，已整体回滚该 Mod（${id}）: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`);
    }
  }
  if (MOD_IDS.length) log.info?.(`[mods] L3 内容已加载: ${MOD_IDS.join(', ')}（kit ${Object.keys(MOD_KITS).length} 个，每局钩子 ${MOD_INSTALLS.length} 个）`);
  return [...MOD_IDS];
}

/**
 * Whether `def` is a 补位 stand-in: a chess fielded with another character's body (simdata getStandIn — `standInFor` =
 * the replaced operator's charId, `charId` = the stand-in's, which differ).
 */
export function isStandInDef(def) {
  return !!(def && def.standInFor && def.charId && def.charId !== def.standInFor);
}

/**
 * Whether `def` is a 自选 piece: a DIY slot fielded with a picked operator's body (simdata getDiy — `diyFor` = the slot's
 * base id, `charId` = the operator's).
 */
export function isDiyDef(def) {
  return !!(def && def.diyFor && def.charId);
}

/** A def whose body is another character than its chess id names (补位 stand-in, 自选 piece): its kit is keyed by charId. */
const isOtherBody = (def) => isStandInDef(def) || isDiyDef(def);

/**
 * The kit builder of an operator def in `reg` ({ [key]: (bb, chess, def) => Kit }), or undefined. A stand-in's and a
 * 自选 piece's kit is keyed by its charId (`char_609_acguad`, `char_112_siege`) and by nothing else: the chess id it keeps
 * names the replaced operator's kit (a DIY slot has none). Any other def: baseId (`…_a`, data/SIM.md), the exact id, or
 * the suffix-less id of DESIGN §5.6's example.
 */
export function kitOf(def, reg) {
  if (!def || !reg) return undefined;
  if (isOtherBody(def)) return Object.prototype.hasOwnProperty.call(reg, def.charId) ? reg[def.charId] : undefined;
  const bare = String(def.baseId ?? def.id ?? '').replace(/_[ab]$/, '');
  return reg[def.baseId] ?? reg[def.id] ?? reg[bare];
}

/** The generic kit of an operator def; a stand-in's / 自选 piece's also carries the talents generic.js can apply exactly. */
function fallbackKit(bb, raw, def) {
  const k = genericKit(bb, raw, def);
  if (!isOtherBody(def)) return k;
  const talents = genericTalents(def);
  return talents.length ? { ...k, talents: [...(k.talents ?? []), ...talents] } : k;
}

/** Resolve the Kit of an ally unit. Never throws (falls back to the generic kit). */
export function setupUnitKit(battle, unit, mode = 'full') {
  try { syncUnitLoadout(battle, unit); } catch (e) { battle._handlerError?.('loadout', unit, e); }
  if (mode === 'none') return {};
  const def = unit.def || {};
  const raw = def.raw ?? def;
  const bb = def.skill?.bb ?? {};
  if (unit.kind === 'token') {
    const tk = mode === 'full' ? (tokens.kits?.[def.id] ?? tokens.default?.[def.id]) : null;
    if (typeof tk === 'function') {
      try { const k = tk(bb, raw, def); if (k) return k; } catch (e) { battle._handlerError(`tokenKit:${def.id}`, unit, e); }
    }
    return def.skill ? genericKit(bb, raw, def) : {};
  }
  if (unit.kind !== 'op') return {};
  const injected = battle.opts && battle.opts.kits;
  if (mode === 'full' || injected) {
    // ★ 必须走公开的 kitOf()：它内含「其他身体（补位 / 自选）只按 charId 命中」的分支。
    //   手搓 reg[def.baseId] ?? reg[def.id] ?? reg[bare] 会绕过该分支，让 Mod 的 kit 在补位 / 自选场景下与基座分叉。
    // 优先级：battle.opts.kits（测试 / 沙箱）> Mod 注册的 kit（L3）> 基座手写 kit
    const f = kitOf(def, injected) ?? kitOf(def, MOD_KITS) ?? (mode === 'full' ? kitOf(def, KITS) : undefined);
    if (typeof f === 'function') {
      try {
        const k = f(bb, raw, def);
        if (k) return selectSkillSpec(k, bb, raw, def);
      } catch (e) {
        battle._handlerError(`kit:${isOtherBody(def) ? def.charId : def.baseId}`, unit, e);
      }
    }
  }
  return fallbackKit(bb, raw, def);
}

/** A unit's own PlayerBattleInput entry (operators: kind ≠ 'token'; tokens: kind 'token'), or null. */
function inputEntry(unit) {
  const list = unit && unit.player && unit.player.input && Array.isArray(unit.player.input.units) ? unit.player.input.units : null;
  if (!list || unit.uid == null) return null;
  const tok = unit.kind === 'token';
  return list.find((v) => v && v.uid === unit.uid && (v.kind === 'token') === tok) ?? null;
}

/**
 * The loadout `{ skillIndex, moduleId }` a unit's PlayerBattleInput entry gives; an entry without loadout fields means
 * the DEFAULT loadout (`{}`), never "whatever the data view maps this chess id to" (another player's choice in a
 * multi-player field). `standIn: true` rides along (补位: the stand-in def whatever the skill / module fields say), as
 * do `diy` (自选: the pick of a DIY slot's piece) and `potential` (0.2.2: 1–6, never a stand-in's). Null when the unit
 * has no input entry.
 */
function inputLoadout(unit) {
  const x = inputEntry(unit);
  if (!x) return null;
  const extra = {
    ...(x.standIn === true ? { standIn: true } : null),
    ...(x.diy && typeof x.diy === 'object' ? { diy: x.diy } : null),
    ...(x.standIn !== true && isPotential(x.potential) ? { potential: x.potential } : null),
  };
  if (x.skillIndex == null && x.moduleId == null) return extra;
  return { skillIndex: x.skillIndex ?? null, moduleId: x.moduleId ?? null, ...extra };
}

/** Put a def on a not-yet-deployed ally (the fields Battle._makeAlly takes from the def). */
function swapDef(unit, def) {
  const st = def.stats;
  unit.def = def;
  unit.defId = def.id;
  unit.name = def.name;
  unit.rangeGrid = def.rangeGrid;
  Object.assign(unit.base, {
    maxHp: st.maxHp, atk: st.atk, def: st.def, res: st.res, aspd: st.aspd, bat: st.bat, blockCnt: st.blockCnt,
    spRecovery: st.spRecovery, tauntLevel: st.tauntLevel, massLevel: st.massLevel, hpRecoveryPerSec: st.hpRecoveryPerSec,
    cost: st.cost, respawnTime: st.respawnTime,
  });
  unit.markDirty?.();
  unit.hp = unit.s ? unit.s.maxHp : st.maxHp;
}

/**
 * Loadout exactness (DESIGN §16) before the battle starts: an operator whose def does not carry the loadout of its own
 * PlayerBattleInput entry (the per-battle data view resolves id-only lookups per chess id — two players of one field
 * may give the same chess different loadouts) gets the def of its own loadout — an entry without loadout fields means
 * the default — and a summon piece follows its owner's (unless its entry carries an inline `def`). A no-op when the def
 * already matches (Battle passing the unit's loadout to getChess / getToken).
 */
export function syncUnitLoadout(battle, unit) {
  if (!battle || battle.started || !unit || unit.deployed || !unit.def || !battle.data) return;
  if (unit.kind === 'op') {
    const lo = inputLoadout(unit);
    if (!lo || typeof battle.data.getChess !== 'function') return;
    // an entry without loadout fields only needs a look when the def carries a non-default loadout
    if (!Object.keys(lo).length && !(unit.def.loadout && unit.def.loadout.isDefault === false)) return;
    const want = battle.data.getChess(unit.def.id, lo);
    if (want && want !== unit.def && want.id === unit.def.id) swapDef(unit, want);
  } else if (unit.kind === 'token' && unit.ownerUnit && unit.ownerUnit.kind === 'op' && typeof battle.data.getToken === 'function') {
    // an explicit inline def of the input entry (Battle `_tokenDef(id, owner, inp.def)`) is never replaced
    if (inputEntry(unit)?.def) return;
    const owner = unit.ownerUnit;
    syncUnitLoadout(battle, owner);
    if (!owner.def || !owner.def.loadout) return;
    const want = battle.data.getToken(unit.def.id, owner.def.id, owner.def.loadout);
    if (want && want !== unit.def && want.id === unit.def.id) swapDef(unit, want);
  }
}

/** Id of the selected skill of an operator def (null without a skill). */
const selectedSkillId = (def) => def?.skill?.id ?? def?.raw?.skill?.skillId ?? null;

/**
 * True when the def's selected skill is the chess's default skill (no loadout info ⇒ default). Never for a stand-in:
 * the skill it fields is the one its chess names (S2 on one chess, S3 on another), so its kit authors each in `skills`;
 * nor for a 自选 piece (the pick chooses any of its skills).
 */
const skillIsDefault = (def) => !isOtherBody(def) && (!def?.loadout || def.loadout.skillIsDefault !== false);

/**
 * The kit with the skill spec of the SELECTED skill (see header): `kit.skills[id]` → `kit.skill` (default skill only;
 * never for a stand-in) → the generic spec. Returns the kit itself when nothing changes; `kit.skillSource` tells which
 * one was used ('skills' | 'kit' | 'generic').
 * @param {object} kit hand-authored kit
 */
export function selectSkillSpec(kit, bb, raw, def) {
  const id = selectedSkillId(def);
  const map = kit && kit.skills && typeof kit.skills === 'object' ? kit.skills : null;
  if (id && map && Object.prototype.hasOwnProperty.call(map, id)) return { ...kit, skill: map[id] ?? null, skillSource: 'skills' };
  if (skillIsDefault(def)) return kit;
  const g = genericKit(bb, raw, def);
  const own = typeof kit.install === 'function' ? kit.install : null;
  const gen = typeof g.install === 'function' ? g.install : null;
  const out = { ...kit, skill: g.skill ?? null, skillSource: 'generic' };
  if (own && gen) out.install = (battle, unit) => { own(battle, unit); gen(battle, unit); };
  else if (gen) out.install = gen;
  return out;
}

/**
 * Whether the kit of `def` has a hand-authored spec for its selected skill (tools/kit-coverage.mjs, tests): `skills`
 * entry, or the kit's `skill` for the default skill when the kit is not the generic fallback. Never throws.
 * @returns {'skills'|'kit'|'generic'|'none'} where the spec comes from ('none' = no kit function at all)
 */
export function skillSpecSource(def, kits = KITS) {
  const f = kitOf(def, kits);
  if (typeof f !== 'function') return 'none';
  let k = null;
  try { k = f(def.skill?.bb ?? {}, def.raw ?? def, def); } catch { return 'generic'; }
  if (!k || k.generic) return 'generic';
  const id = selectedSkillId(def);
  if (id && k.skills && Object.prototype.hasOwnProperty.call(k.skills, id)) return 'skills';
  return skillIsDefault(def) && k.skill !== undefined ? 'kit' : 'generic';
}

/**
 * Install kits for every ally unit and (mode 'full') every domain module. First, a Battle constructed without the spec
 * path (server-run fields, bot rehearsals, tests) gets the same per-battle loadout data view createBattleFromSpec uses
 * (simdata withUnitLoadouts over its players' inputs), so summons spawned during the battle (`getToken(id, owner)`)
 * and every other id-only lookup resolve the owner's selected skill / module there too (DESIGN §16).
 */
export function installContent(battle, { mode = 'full', extra = null } = {}) {
  try {
    const view = withUnitLoadouts(battle.data, (battle.players || []).map((p) => p && p.input));
    if (view && view !== battle.data) battle.data = view;
  } catch (e) { battle._handlerError?.('loadoutView', null, e); }
  for (const u of battle.allyUnits) {
    if (u.kit) continue;
    try { battle._setupUnit(u); } catch (e) { battle._handlerError('setupUnit', u, e); }
  }
  if (mode === 'full') {
    for (const [name, mod] of MODULES) {
      if (typeof mod.install !== 'function') continue;
      try { mod.install(battle); } catch (e) { battle._handlerError(`content:${name}`, null, e); }
    }
    // Mod 的每局钩子（L3）：基座 domain modules 之后，仍然逐个隔离
    for (const { id, fn } of MOD_INSTALLS) {
      try { fn(battle); } catch (e) { battle._handlerError(`modContent:${id}`, null, e); }
    }
  }
  for (const m of extra || []) {
    try { (typeof m === 'function' ? m : m.install)?.(battle); } catch (e) { battle._handlerError('content:extra', null, e); }
  }
}

/** Prep-side registration of every domain module (server boot). */
export function registerAllMeta(registry) {
  for (const [name, mod] of MODULES) {
    if (typeof mod.registerMeta !== 'function') continue;
    try { mod.registerMeta(registry); } catch (e) { console.error(`[content] ${name}.registerMeta failed:`, e); }
  }
  // Mod 的预置侧钩子（L3）：只在服务端跑一次
  for (const { id, fn } of MOD_METAS) {
    try { fn(registry); } catch (e) { console.error(`[content] mod ${id}.registerMeta failed:`, e); }
  }
}
