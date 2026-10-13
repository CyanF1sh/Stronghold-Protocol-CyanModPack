// server/data.js — loads the generated game data (data/*.json, produced by tools/build-data.mjs) once.
//
// Every `*.json` file in the data directory becomes a top-level key named after its basename
// (config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves, stages,
// bosses, tokens, assets, backups, …). The result is deep-frozen so no module can mutate shared data by accident.
// Missing or unparsable files are tolerated with a warning (data is generated in parallel with the
// server); consumers must cope with an absent key.
//
// Mod 层（MOD SYSTEM）：当 SP_MODS（或 getData({modsDir})）指向一个 Mod 仓库时，data/*.json 会在
// deepFreeze **之前**被 server/mods/loader.js 合并一层补丁。未设置 SP_MODS 时行为与原版完全一致。
// 合并后的数据单例被服务端与客户端同时消费（server/http/static.js 会把打过补丁的数据文件改写下发）。
//
// Index getters (DESIGN §2; same names as public/js/data.js): getChess, getBond, getGarrison, getItem, getBand,
// getEffect, getEnemy, getWave, getStage, getBoss, getToken, getConfig, getMode. The id-keyed files are already
// `{ [id]: record }` maps (docs/DATA.md), so a getter is an OWN-property lookup: ids that come from client
// intents (e.g. `g.band {bandId: "constructor"}`) can never resolve to inherited Object.prototype members.
// Every getter returns null for unknown ids / missing files and takes an optional data object (default:
// the process-wide getData() singleton).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMods } from './mods/loader.js';
import { APP_VERSION } from '../shared/constants.js';

/** Repository root (…/Stronghold-Protocol). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Default data directory. */
export const DATA_DIR = path.join(ROOT, 'data');

/** Files the game expects (a warning lists the missing ones). */
export const DATA_FILES = Object.freeze([
  'config', 'chess', 'bonds', 'garrisons', 'items', 'bands', 'effects', 'choices',
  'enemies', 'factions', 'waves', 'stages', 'bosses', 'tokens', 'assets', 'backups',
]);

/**
 * Recursively freeze an object graph (iterative; safe for deep JSON). Returns the same object.
 * @template T
 * @param {T} root
 * @returns {Readonly<T>}
 */
export function deepFreeze(root) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const o = stack.pop();
    if (o === null || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    for (const v of Object.values(o)) if (v !== null && typeof v === 'object') stack.push(v);
    Object.freeze(o);
  }
  return root;
}

/**
 * Read every `*.json` in `dir` into `{ [basename]: parsed }` (NOT frozen — the caller freezes after the Mod layer ran).
 * Never throws: an unreadable directory yields `{}`; bad files are skipped with an error log.
 * @param {string} [dir] data directory (default ROOT/data)
 * @param {{ log?: { warn: Function, error: Function, info?: Function }, expected?: readonly string[] }} [opts]
 * @returns {Record<string, any>}
 */
function readDataFiles(dir = DATA_DIR, { log = console, expected = DATA_FILES } = {}) {
  /** @type {Record<string, any>} */
  const out = {};
  let names = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .map((d) => d.name)
      .sort();
  } catch (e) {
    log.warn(`[data] cannot read ${dir}: ${e.code || e.message} — running without game data`);
  }
  for (const file of names) {
    const key = file.slice(0, -'.json'.length);
    try {
      out[key] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (e) {
      log.error(`[data] skipping ${file}: ${e.message}`);
    }
  }
  const missing = expected.filter((k) => !(k in out));
  if (missing.length) log.warn(`[data] missing data files: ${missing.map((k) => k + '.json').join(', ')}`);
  return out;
}

/**
 * Read `dir` and (optionally) merge the Mod layers, returning the frozen data **plus** the mod report and the set of
 * data-file basenames that a Mod actually patched (server/http/static.js rewrites those responses).
 *
 * ★ 合并**必须**发生在 deepFreeze 之前：resolveMods 会把 base 深拷贝一份（server/mods/patch.js clone），
 *   冻结过的对象照样能拷；但顺序反过来就等于「先冻住官方数据、再往里写补丁」，语义上更容易被后人改坏。
 *
 * @param {string} [dir] data directory (default ROOT/data)
 * @param {{ log?: object, expected?: readonly string[], modsDir?: string|null, strictMods?: boolean,
 *           appVersion?: string|null }} [opts]
 *        modsDir: Mod 仓库目录；null/undefined → 纯原版（不做任何 Mod 处理）
 *        strictMods: true 时任一 Mod 校验失败即整体拒绝（保持原版数据）
 * @returns {{ data: Readonly<Record<string, any>>, report: any|null, patched: Set<string>, ok: boolean }}
 */
export function loadDataMerged(dir = DATA_DIR, { log = console, expected = DATA_FILES, modsDir = null, strictMods = false, appVersion = APP_VERSION } = {}) {
  const base = readDataFiles(dir, { log, expected });
  if (!modsDir) return { data: deepFreeze(base), report: null, patched: new Set(), ok: true };
  const res = resolveMods(base, modsDir, { log, appVersion, strict: strictMods });
  return { data: deepFreeze(res.data), report: res.report, patched: res.patched, ok: res.ok };
}

/**
 * Read every `*.json` in `dir` into `{ [basename]: parsed }`, deep-frozen (mods merged when `modsDir` is set).
 * Never throws: an unreadable directory yields `{}`; bad files are skipped with an error log.
 * @param {string} [dir] data directory (default ROOT/data)
 * @param {{ log?: { warn: Function, error: Function, info?: Function }, expected?: readonly string[],
 *           modsDir?: string|null, strictMods?: boolean }} [opts]
 * @returns {Readonly<Record<string, any>>}
 */
export function loadData(dir = DATA_DIR, opts = {}) {
  return loadDataMerged(dir, opts).data;
}

/** @type {Readonly<Record<string, any>> | null} */
let singleton = null;
/** 最近一次加载的 Mod 报告（无 Mod 时为 null）。 */
let modReport = null;
/** 被 Mod 打过补丁的数据文件名主干集合（无 Mod 时为空集）。 */
let patchedFiles = new Set();
/** 单例是**按哪个 modsDir** 建立的 —— 用于识别「先用无 Mod 加载、再要求带 Mod」。 */
let loadedWith = { modsDir: undefined };

/**
 * Process-wide data singleton; loads on first call (later calls ignore the options).
 *
 * Mods are applied on that first load: `modsDir` option, else the `SP_MODS` env var (empty ⇒ 原版).
 * `SP_MODS_STRICT=1` ⇒ 任一 Mod 校验失败时整体拒绝（保持原版数据）。
 *
 * ★ 注意：server/lobby.js 的依赖链会在 **import 阶段**就调用一次 getData()（此时还没有 modsDir）。
 * 因此这里**不能**「谁先调用谁定终身」——当调用方显式给出的 modsDir 与已加载的不一致时，丢弃单例重新加载。
 * 生产环境下两者都解析自 SP_MODS，值相同 ⇒ 不会重复加载。
 *
 * @param {{ dir?: string, log?: object, modsDir?: string|null, strictMods?: boolean }} [opts]
 * @returns {Readonly<Record<string, any>>}
 */
export function getData({ dir = DATA_DIR, log = console, modsDir, strictMods } = {}) {
  const md = modsDir !== undefined ? modsDir : (process.env.SP_MODS && process.env.SP_MODS !== '' ? process.env.SP_MODS : null);
  const strict = strictMods !== undefined ? strictMods
    : (process.env.SP_MODS_STRICT === '1' || process.env.SP_MODS_STRICT === 'true');
  // 调用方显式要求了不同的 Mod 配置 ⇒ 旧单例作废（否则「先被谁加载」就决定了 Mod 生不生效）
  if (singleton && md !== loadedWith.modsDir) {
    singleton = null;
    modReport = null;
    patchedFiles = new Set();
  }
  if (!singleton) {
    const r = loadDataMerged(dir, { log, modsDir: md, strictMods: strict });
    singleton = r.data;
    modReport = r.report;
    patchedFiles = r.patched;
    loadedWith = { modsDir: md };
  }
  return singleton;
}

/** 最近一次加载的 Mod 报告（{ mods, patched, errors, warnings, ok, … }；无 Mod 时 null）。 */
export function getModReport() { return modReport; }

/** 被 Mod 打过补丁的数据文件名主干集合（如 Set{ 'chess' }）；无 Mod 时为空集。 */
export function getPatchedDataFiles() { return patchedFiles; }

/** Drop the singleton so the next getData() reloads (tests / hot reload). */
export function resetData() { singleton = null; modReport = null; patchedFiles = new Set(); loadedWith = { modsDir: undefined }; }

// ---------------------------------------------------------------------------------------------------
// Index getters
// ---------------------------------------------------------------------------------------------------

/** Data files that are `{ [id]: record }` maps, with the getter name exported for each. */
export const INDEXED_FILES = Object.freeze({
  chess: 'getChess', bonds: 'getBond', garrisons: 'getGarrison', items: 'getItem', bands: 'getBand',
  effects: 'getEffect', enemies: 'getEnemy', waves: 'getWave', stages: 'getStage', bosses: 'getBoss', tokens: 'getToken',
});

/** Own-property record lookup in a plain-object map; null for anything else. */
function ownRecord(map, id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!map || typeof map !== 'object' || Array.isArray(map) || !Object.hasOwn(map, id)) return null;
  const rec = map[id];
  return rec !== null && typeof rec === 'object' ? rec : null;
}

/**
 * Record by id from an id-keyed data file (own properties only; never throws).
 * @param {string} file data file basename, e.g. 'chess'
 * @param {unknown} id record id
 * @param {Readonly<Record<string, any>>} [data] data object (default: getData())
 * @returns {any | null}
 */
export function lookup(file, id, data = getData()) {
  if (!data || typeof data !== 'object' || typeof file !== 'string' || !Object.hasOwn(data, file)) return null;
  return ownRecord(data[file], id);
}

/** @param {unknown} id chess id (normal `_a` or elite `_b`) @param {object} [data] */
export const getChess = (id, data) => lookup('chess', id, data);
/** @param {unknown} id bond id, e.g. 'yanShip' @param {object} [data] */
export const getBond = (id, data) => lookup('bonds', id, data);
/** @param {unknown} id garrison (特质) id @param {object} [data] */
export const getGarrison = (id, data) => lookup('garrisons', id, data);
/** @param {unknown} id item chess id @param {object} [data] */
export const getItem = (id, data) => lookup('items', id, data);
/** @param {unknown} id band (strategy) id @param {object} [data] */
export const getBand = (id, data) => lookup('bands', id, data);
/** @param {unknown} id effect id @param {object} [data] */
export const getEffect = (id, data) => lookup('effects', id, data);
/** @param {unknown} key enemy key @param {object} [data] */
export const getEnemy = (key, data) => lookup('enemies', key, data);
/** @param {unknown} id wave template id @param {object} [data] */
export const getWave = (id, data) => lookup('waves', id, data);
/** @param {unknown} id stage id @param {object} [data] */
export const getStage = (id, data) => lookup('stages', id, data);
/** @param {unknown} id boss id @param {object} [data] */
export const getBoss = (id, data) => lookup('bosses', id, data);
/** @param {unknown} id token id @param {object} [data] */
export const getToken = (id, data) => lookup('tokens', id, data);

/**
 * data/config.json, or null when missing.
 * @param {Readonly<Record<string, any>>} [data]
 * @returns {any | null}
 */
export function getConfig(data = getData()) {
  const cfg = data && typeof data === 'object' && Object.hasOwn(data, 'config') ? data.config : null;
  return cfg !== null && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : null;
}

/**
 * Mode record `config.modes[modeId]` (e.g. 'mode_multi_hard'), or null.
 * @param {unknown} modeId
 * @param {Readonly<Record<string, any>>} [data]
 * @returns {any | null}
 */
export function getMode(modeId, data = getData()) {
  const cfg = getConfig(data);
  return cfg ? ownRecord(cfg.modes, modeId) : null;
}
