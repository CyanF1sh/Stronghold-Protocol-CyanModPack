// server/mods/loader.js — Mod 加载器：扫描 mods/ → 严格校验 → 拓扑排序 → 合并进 data/*.json。
// (i18n-ignore-file: Mod 平台（加载器 / 打包 / 管理 API），不是游戏界面文案 — docs/I18N.md)
//
// 设计要点（与 docs 里的兼容性结论对齐）：
//   · Mod 是**独立目录**，绝不原地改 data/（那是 build-data.mjs 的生成产物，重跑会被覆盖）。
//   · 合并发生在 server/data.js 的 deepFreeze **之前**，所以引擎拿到的仍是不可变单例。
//   · 合并结果同时被服务端与客户端消费：server/index.js 会把**打过补丁的数据文件**改写成
//     合并后的 JSON 直接下发，客户端零改动即自动吃到 Mod（DESIGN §14 客户端本地战斗 → 两端必须一致）。
//   · 全程**容错**：单个 Mod 出错只标记该 Mod 失败并跳过，不拖垮服务器（沿用 content/index.js 的 safeImport 思路）。
//   · ★ 工序 88：跨 Mod 的「抢同一路径」判定按**值**分档 —— 第二个 Mod 把同一条路径写成**逐字节相同**的值
//     不算冲突（聚合一条 warning），只有「写不同值」才整份回滚（必须拆键）。于是两条都可以各自单独启用、
//     各自声明同一条数据的 Mod（`add` 同一条记录）谁先谁后结果都一样。
//
// 目录结构：
//   <modsDir>/<mod-id>/
//     ├─ mod.json          清单（可分发）
//     ├─ data/<target>.json  补丁（target 必须是 data/ 下已有的文件名主干）
//     ├─ assets/**         自带美术（/assets/** 未命中时的兜底搜索根）
//     ├─ content/index.js  可选：L3 **战斗行为**模块（默认导出 (api) => void；由 server/mods/content.js 装载）
//     └─ client/index.js   可选：**浏览器界面**扩展（默认导出 setup(hostApi)；由 public/js/ui/extensions.js 装载）
//
// 启停状态存在 <modsDir>/.state.json（**本机状态**，不随 Mod 分发）：
//   { "version": 1, "disabled": ["id", …], "order": ["id", …] }
// 未列入 disabled 的 Mod 默认**启用** → 丢进目录即可用（即插即用）。

import fs from 'node:fs';
import path from 'node:path';
import { applyOps, clone, parsePath, resolvePath } from './patch.js';

/** Mod 平台 API 版本：补丁语法 / manifest 字段集变更时递增。 */
export const MOD_API_VERSION = 1;
/** 清单文件名。 */
export const MANIFEST_FILE = 'mod.json';
/** 状态文件名（本机，不随 Mod 分发）。 */
export const STATE_FILE = '.state.json';
/** 补丁目录名。 */
export const DATA_SUBDIR = 'data';
/** L3 行为模块目录名。 */
export const CONTENT_SUBDIR = 'content';
/** L3 行为模块入口文件名（<id>/content/index.js）——由 server/mods/content.js 装载，见那里的说明。 */
export const CONTENT_ENTRY = 'index.js';
/**
 * Mod 自带美术目录名（<id>/assets/**）。
 * 服务端把启用 Mod 的 assets/ 当作 `/assets/**` 未命中时的兜底搜索根（server/index.js），
 * 所以这些文件**必须随 .spmod 一起打包与安装**（tools/mod.mjs 的白名单）。
 */
export const ASSETS_SUBDIR = 'assets';
/**
 * 客户端界面扩展目录名（<id>/client/）。
 *
 * 与 `content/` 的区别（**两条通道，别混**）：
 *   · `content/index.js` = **战斗行为**代码。两端各装一份进模拟器（服务器 + 浏览器），因为战斗在客户端
 *     本地跑、服务端会验算（DESIGN §14）——数值/行为必须两端一致。
 *   · `client/index.js` = **浏览器界面**代码。只在玩家浏览器里跑，往宿主界面的插槽里挂 UI
 *     （例如「干员调配」右上角的一个按钮）。服务端不加载它，也不该有它的任何副作用。
 * 入口固定 `client/index.js`，默认导出 `setup(hostApi)`（也可以导出具名 `setup`）；
 * 由 public/js/ui/extensions.js 的 loadClientMods() 在页面启动时动态 import。
 */
export const CLIENT_SUBDIR = 'client';
/** 客户端界面扩展入口文件名（<id>/client/index.js）。 */
export const CLIENT_ENTRY = 'index.js';

// ---------------------------------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------------------------------

/** 读取启停状态。文件缺失/损坏 → 返回空状态（全部默认启用），绝不抛。 */
export function readState(modsDir) {
  const empty = { version: 1, disabled: [], order: [] };
  try {
    const p = path.join(modsDir, STATE_FILE);
    if (!fs.existsSync(p)) return empty;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      version: 1,
      disabled: Array.isArray(j.disabled) ? j.disabled.filter((s) => typeof s === 'string') : [],
      order: Array.isArray(j.order) ? j.order.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return empty;
  }
}

/** 写启停状态（原子写：临时文件 + rename）。 */
export function writeState(modsDir, state) {
  fs.mkdirSync(modsDir, { recursive: true });
  const clean = {
    version: 1,
    disabled: [...new Set((state.disabled || []).filter((s) => typeof s === 'string'))].sort(),
    order: (state.order || []).filter((s) => typeof s === 'string'),
  };
  const target = path.join(modsDir, STATE_FILE);
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2) + '\n');
  fs.renameSync(tmp, target);
  return clean;
}

// ---------------------------------------------------------------------------------------------------
// 扫描 & 清单校验
// ---------------------------------------------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
/**
 * Mod 目录内的相对路径**一律用 `/`**。
 * ★ 不用 path.join：那在 Windows 上给出的是 `client\index.js` —— 这个值会出现在 GET /mods 的快照、诊断日志
 *   与「入口存在性」的判断里，平台无关才不会有「本地过、服务器上判空」的玄学。真正读文件时
 *   path.join(dir, rel) 在 Windows 上照样认 `/`。
 */
const relPath = (...parts) => parts.join('/');

/** 校验清单。@returns {{errors:string[], warnings:string[]}} */
export function validateManifest(m, dirName) {
  const errors = [];
  const warnings = [];
  if (!isObj(m)) return { errors: ['mod.json 不是对象'], warnings };
  for (const k of ['id', 'name', 'version', 'apiVersion', 'gameVersion']) {
    if (m[k] === undefined || m[k] === null || m[k] === '') errors.push(`缺少必填字段 ${k}`);
  }
  if (typeof m.id === 'string' && !/^[a-z0-9][a-z0-9._-]*$/.test(m.id)) {
    errors.push(`id "${m.id}" 只允许小写字母/数字/._-，且以字母或数字开头`);
  }
  if (typeof m.id === 'string' && dirName && m.id !== dirName) {
    errors.push(`id "${m.id}" 与目录名 "${dirName}" 不一致（便于管理，二者必须相同）`);
  }
  if (typeof m.version === 'string' && !SEMVER.test(m.version)) errors.push(`version "${m.version}" 不是 x.y.z 形式`);
  if (m.apiVersion !== undefined && m.apiVersion !== MOD_API_VERSION) {
    errors.push(`apiVersion=${m.apiVersion}，本平台只支持 ${MOD_API_VERSION}`);
  }
  if (m.loadAfter !== undefined && !Array.isArray(m.loadAfter)) errors.push('loadAfter 必须是字符串数组');
  if (Array.isArray(m.loadAfter) && m.loadAfter.some((s) => typeof s !== 'string')) errors.push('loadAfter 只能含字符串');
  if (m.summary !== undefined && typeof m.summary !== 'string') errors.push('summary 必须是字符串（一句话的核心简介）');
  if (m.author === undefined) warnings.push('建议填写 author');
  if (m.description === undefined) warnings.push('建议填写 description');
  // ★ summary 缺失**不算警告**：管理页会自动退化成「description 的第一句」，列表观感依然整洁。
  //   但如果写了 description 又没写 summary，作者就放弃了对「列表里显示哪一句」的控制权 —— 提醒一句。
  if (m.summary === undefined && typeof m.description === 'string' && m.description.trim()) {
    warnings.push('建议填写 summary：管理页列表默认只显示 summary，description 收进「详情」（缺省时取 description 的第一句）');
  }
  return { errors, warnings };
}

/**
 * 扫描 modsDir 下所有 Mod 目录（不含点开头的隐藏项）。
 * @returns {Array<{id:string, dir:string, manifest:any|null, manifestErrors:string[], manifestWarnings:string[],
 *                  enabled:boolean, patchFiles:Array<{target:string, rel:string}>, errors:string[], warnings:string[]}>}
 */
export function scanMods(modsDir, { log = console } = {}) {
  const state = readState(modsDir);
  const disabled = new Set(state.disabled);
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(modsDir, { withFileTypes: true })
      // `.` = 本机状态/导出/上传缓存；`_` = 平台自己的回收站（mod.mjs uninstall → mods/_removed/）。
      // 两者都不是 Mod，必须排除 —— 否则卸载掉的 Mod 会被当成「缺少 mod.json 的坏 Mod」反复告警。
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
      .map((d) => d.name).sort();
  } catch (e) {
    log.warn?.(`[mods] 无法读取 ${modsDir}: ${e.code || e.message}`);
    return out;
  }
  for (const id of names) {
    const dir = path.join(modsDir, id);
    const entry = {
      id, dir, manifest: null, manifestErrors: [], manifestWarnings: [],
      enabled: !disabled.has(id), patchFiles: [], contentFile: null, clientFile: null, errors: [], warnings: [],
    };
    const mp = path.join(dir, MANIFEST_FILE);
    if (!fs.existsSync(mp)) {
      entry.errors.push(`缺少 ${MANIFEST_FILE}`);
      out.push(entry);
      continue;
    }
    try {
      entry.manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
    } catch (e) {
      entry.errors.push(`${MANIFEST_FILE} 解析失败: ${e.message}`);
      out.push(entry);
      continue;
    }
    const v = validateManifest(entry.manifest, id);
    entry.manifestErrors = v.errors;
    entry.manifestWarnings = v.warnings;
    // 补丁文件
    const ddir = path.join(dir, DATA_SUBDIR);
    if (fs.existsSync(ddir)) {
      for (const f of fs.readdirSync(ddir).sort()) {
        if (!f.toLowerCase().endsWith('.json')) continue;
        entry.patchFiles.push({ target: f.slice(0, -'.json'.length), rel: relPath(DATA_SUBDIR, f) });
      }
    }
    // L3 行为代码：这里只登记存在性（/mods 诊断 + server/mods/content.js 用它判断要不要装载）
    const contentRel = relPath(CONTENT_SUBDIR, CONTENT_ENTRY);
    if (fs.existsSync(path.join(dir, contentRel))) entry.contentFile = contentRel;
    // 客户端界面扩展：同样只登记存在性（GET /mods 下发 URL，浏览器端自己 import）
    const clientRel = relPath(CLIENT_SUBDIR, CLIENT_ENTRY);
    if (fs.existsSync(path.join(dir, clientRel))) entry.clientFile = clientRel;
    if (!entry.patchFiles.length && !entry.contentFile && !entry.clientFile) {
      entry.warnings.push('既没有 data/ 补丁、content/ 行为模块，也没有 client/ 界面扩展（空 Mod？）');
    }
    out.push(entry);
  }
  return out;
}

/**
 * 读出一个 Mod **声明**要新建的干员 id（只看 data/chess.json 里 `add` / `clone` 的顶层键）。
 *
 * ★ 与「是否启用」「补丁能否应用」**无关**：它只服务于**提示**。客户端导入别人分享的干员调配配置时，
 *   靠它把「本服没有这名干员」细化成「来自 Mod X（未安装 / 已停用 / 有问题）」。
 *   停用的 Mod 一样要登记 —— 玩家最常见的困惑就是「我装了这个包但忘了启用」。
 *   读不动 / JSON 坏了就返回 []（这只是提示信息，绝不能因此让加载器报错）。
 *
 * @param {{dir:string, patchFiles:Array<{target:string, rel:string}>}} entry scanMods 的条目
 * @returns {string[]}
 */
export function declaredChessIds(entry) {
  const out = new Set();
  for (const pf of entry?.patchFiles || []) {
    if (pf.target !== 'chess') continue;
    try {
      const patch = JSON.parse(fs.readFileSync(path.join(entry.dir, pf.rel), 'utf8'));
      for (const op of Array.isArray(patch?.ops) ? patch.ops : []) {
        if (!isObj(op) || (op.op !== 'add' && op.op !== 'clone')) continue;
        const cid = String(op.path ?? '').split('.')[0];
        if (cid) out.add(cid);
      }
    } catch { /* 只是提示信息，坏了就算了 */ }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------------------------------
// 排序
// ---------------------------------------------------------------------------------------------------

/**
 * 按 loadAfter 拓扑排序 + state.order 微调。返回排序后的 id 列表；有环/缺依赖时把问题写进 problems。
 * @returns {{order:string[], problems:string[]}}
 */
export function sortMods(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const problems = [];
  const deps = new Map();
  for (const e of entries) {
    const after = Array.isArray(e.manifest?.loadAfter) ? e.manifest.loadAfter : [];
    for (const d of after) {
      if (!byId.has(d)) problems.push(`${e.id}: loadAfter 指向不存在的 Mod "${d}"`);
    }
    deps.set(e.id, after.filter((d) => byId.has(d)));
  }
  const done = [];
  const seen = new Set();
  const stack = new Set();
  let cycle = false;
  const visit = (id) => {
    if (seen.has(id)) return;
    if (stack.has(id)) { cycle = true; problems.push(`依赖成环: ${[...stack, id].join(' → ')}`); return; }
    stack.add(id);
    for (const d of deps.get(id) || []) visit(d);
    stack.delete(id);
    seen.add(id);
    done.push(id);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  if (cycle) return { order: [...byId.keys()].sort(), problems };
  return { order: done, problems };
}

// ---------------------------------------------------------------------------------------------------
// 干员记录校验
// ---------------------------------------------------------------------------------------------------

const PROFESSIONS = new Set(['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL']);

/** 收集记录里所有形如 xxxTokenKey / overrideTokenKey 的非空字符串引用。 */
function tokenRefs(rec, out = []) {
  const walk = (v, key) => {
    if (Array.isArray(v)) { for (const x of v) walk(x, key); return; }
    if (!isObj(v)) {
      if (typeof v === 'string' && v && /tokenKey$/.test(key || '')) out.push(v);
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(rec, '');
  return out;
}

/**
 * 校验一条 chess 记录（新增/替换都要过）。merged = 合并后的整体数据（用于引用完整性）。
 *
 * ★ **自选位（`diy.slots` 那条链上的 `isDiy` 记录）另有一套口径**：官方那 4 个自选位（8 条记录）自己就是
 * `profession: null` + `stats: null` + `isDiy: true` —— 它们的职业、属性、技能全部来自**被选中的干员**
 * （`shared/diy.js diyRecordOf` 在运行期用 `composeUnitRecord` 拼出来），所以这三条检查对它们必然全中。
 * 「记录 → 是不是自选位」的判据取 `diy.slots`（与官方 `chess_char_5_diy1_a` 同一条数据链），**不按 id 形状认**，
 * 也**不按 `isDiy` 自证**：`isDiy: true` 但不属于任何自选位 = 错误（正是原来那句话要防的：会被 `visibleChess` /
 * `checkNotOwned` / `loadoutRecord` 静默踢出商店的「半成品记录」），而 `diy.slots` 里的记录没有 `isDiy: true` 也 = 错误
 * （`diyRecordOf` 唯一的守卫就是它，写好才生效）。**非自选位记录的校验与改动前逐字相同。**
 * @returns {{errors:string[], warnings:string[]}}
 */
export function validateChessRecord(id, rec, merged) {
  const errors = [];
  const warnings = [];
  if (!isObj(rec)) return { errors: [`${id}: 记录必须是对象`], warnings };
  const diySlots = isObj(merged?.backups?.diy?.slots) ? merged.backups.diy.slots : null;
  // 自选位的一对记录：`_a`（baseId = 自身）就是 slots 的键；`_b`（金色）的 baseId 指向它（官方、以及 diy.slots 的约定都如此）
  const base = typeof rec.baseId === 'string' ? rec.baseId : null;
  const isDiySlot = isObj(diySlots?.[id]) || (rec.isGolden === true && base !== null && isObj(diySlots?.[base]));
  if (rec.chessId !== id) errors.push(`${id}: chessId 字段(${rec.chessId}) 必须与键名一致`);
  if (typeof rec.name !== 'string' || !rec.name) errors.push(`${id}: 缺少 name`);
  if (!Number.isInteger(rec.tier) || rec.tier < 1 || rec.tier > 6) errors.push(`${id}: tier 必须是 1..6 的整数（当前 ${rec.tier}）`);
  if (isDiySlot) {
    // 自选位：职业 / 属性 / 技能由被选中的干员在运行期提供（official 记录即如此）
    if (rec.isDiy !== true) errors.push(`${id}: 是 backups.json diy.slots 里的自选位，必须写 "isDiy": true（否则 shared/diy.js diyRecordOf 不会把它当自选位拼装）`);
  } else {
    if (typeof rec.profession !== 'string' || !PROFESSIONS.has(rec.profession)) {
      errors.push(`${id}: profession "${rec.profession}" 无效（应为 ${[...PROFESSIONS].join('/')}）`);
    }
    if (!isObj(rec.stats)) errors.push(`${id}: 缺少 stats 对象`);
    if (rec.isDiy === true) errors.push(`${id}: isDiy=true 会被引擎排除出商店（gamedata.visibleChess / protocol 都过滤 isDiy），请改为 false；若它确实是自选位，请在 data/backups.json 的 diy.slots 里登记同一个 id（docs/MODS.md §4.9）`);
  }
  if (rec.visible === false) warnings.push(`${id}: visible=false → 不会出现在商店`);
  else if (rec.visible === undefined) warnings.push(`${id}: 未写 visible，建议显式 "visible": true`);
  if (rec.isHidden === true) warnings.push(`${id}: isHidden=true → 不会出现在商店`);

  // identifier 撞号：当前引擎**没有**把 chess.identifier 当唯一键用（只有 bonds.identifier 参与排序），
  // 所以不判错误；但这是 clone 之后忘记改 identifier 的典型手滑，且未来若被用作键就会出事。
  if (rec.identifier !== undefined && rec.identifier !== null && merged?.chess) {
    for (const [other, orec] of Object.entries(merged.chess)) {
      if (other === id || !orec || typeof orec !== 'object') continue;
      if (orec.identifier === rec.identifier) {
        warnings.push(`${id}: identifier=${rec.identifier} 与 "${other}" 重复（引擎暂不把它当唯一键，但建议换一个未被占用的号）`);
        break;
      }
    }
  }

  const golden = rec.isGolden === true;
  if (golden) {
    if (typeof rec.baseId !== 'string' || !rec.baseId || rec.baseId === id) {
      errors.push(`${id}: 金色形态的 baseId 必须指向普通形态的 id`);
    } else if (!merged?.chess?.[rec.baseId]) {
      errors.push(`${id}: baseId "${rec.baseId}" 在 chess 里不存在`);
    }
    if (rec.upgradeChessId != null) warnings.push(`${id}: 金色形态的 upgradeChessId 建议为 null`);
  } else {
    if (rec.baseId !== id) errors.push(`${id}: 普通形态的 baseId 必须等于自身 id（当前 ${rec.baseId}）`);
    if (!rec.goldenId) warnings.push(`${id}: 没有 goldenId → 无法三合一精英化（需要一个 isGolden 形态）`);
    else if (rec.goldenId !== id && !merged?.chess?.[rec.goldenId]) {
      errors.push(`${id}: goldenId "${rec.goldenId}" 在 chess 里不存在（精英形态也要一起新增）`);
    } else if (merged?.chess?.[rec.goldenId] && merged.chess[rec.goldenId].isGolden !== true) {
      errors.push(`${id}: goldenId "${rec.goldenId}" 指向的记录 isGolden 不是 true`);
    }
  }
  for (const b of Array.isArray(rec.bonds) ? rec.bonds : []) {
    if (!merged?.bonds?.[b]) errors.push(`${id}: bonds 引用了不存在的盟约 "${b}"`);
  }
  for (const g of Array.isArray(rec.garrisonIds) ? rec.garrisonIds : []) {
    if (!merged?.garrisons?.[g]) errors.push(`${id}: garrisonIds 引用了不存在的特质 "${g}"`);
  }
  for (const t of tokenRefs(rec)) {
    if (!merged?.tokens?.[t]) errors.push(`${id}: 引用了不存在的召唤物 token "${t}"`);
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------------------------------

/**
 * `path` 处的值在「本 Mod 动手前」的快照 `before` 与现在的 `after` 里是否**逐字节相同**。
 *
 * 用于跨 Mod 冲突判定（工序 88）：同一条路径被第二个 Mod 重写成**同一个值**时不算冲突。
 * 任一侧取不到这个键（新增 / 删除 / 路径本身没了）⇒ 一律算「变了」（保守：宁可报冲突，也不放过真抢路径）。
 *
 * @param {any} before 本 Mod 动手**前**的目标文件快照（backup.get(target)）
 * @param {any} after  现在的目标文件对象（working[target]）
 * @param {string} p   补丁里的 path 原文
 * @returns {boolean}
 */
function unchangedAt(before, after, p) {
  let segs;
  try { segs = parsePath(p); } catch { return false; }
  const b = resolvePath(before, segs);
  const a = resolvePath(after, segs);
  if (!b.ok || !a.ok) return false;
  return JSON.stringify(b.value) === JSON.stringify(a.value);
}

/**
 * 把 modsDir 下的启用 Mod 合并进 baseData 的副本。
 *
 * @param {Record<string, any>} baseData 原始 data/*.json（loadData 的结果，未 freeze）
 * @param {string} modsDir
 * @param {{ log?: object, appVersion?: string, strict?: boolean }} [opts]
 *        strict=true 时，任一 Mod 校验失败 → 整体失败（返回 ok:false 且不产出合并数据）。
 * @returns {{ data: Record<string, any>, report: any, patched: Set<string>, ok: boolean }}
 */
export function resolveMods(baseData, modsDir, { log = console, appVersion = null, strict = false } = {}) {
  const started = Date.now();
  const report = {
    apiVersion: MOD_API_VERSION,
    modsDir,
    appVersion,
    ok: true,
    mods: [],
    patched: [],
    errors: [],
    warnings: [],
    ms: 0,
  };
  const working = {};
  for (const [k, v] of Object.entries(baseData)) working[k] = clone(v);

  const entries = scanMods(modsDir, { log });
  const { order, problems } = sortMods(entries);
  for (const p of problems) report.errors.push(p);

  const byId = new Map(entries.map((e) => [e.id, e]));
  // 本机 order 偏好：state.order 里靠前的先应用（用于消解无 loadAfter 时的歧义）
  const pref = readState(modsDir).order;
  const rank = (id) => { const i = pref.indexOf(id); return i === -1 ? 9999 : i; };
  const ordered = order.slice().sort((a, b) => (rank(a) - rank(b)) || (a < b ? -1 : 1));

  const touchPath = new Map(); // "target::path" -> modId（跨 Mod 冲突检测）
  const patched = new Set();

  for (const id of ordered) {
    const e = byId.get(id);
    const row = {
      id, name: e.manifest?.name ?? null, version: e.manifest?.version ?? null,
      author: e.manifest?.author ?? null, apiVersion: e.manifest?.apiVersion ?? null,
      gameVersion: e.manifest?.gameVersion ?? null,
      // ★ 列表只显示这一行；完整说明在 description（管理页收进「详情」）。缺省由展示层退化成第一句。
      summary: e.manifest?.summary ?? null, description: e.manifest?.description ?? null,
      enabled: e.enabled, order: ordered.indexOf(id),
      files: [], ops: 0, content: e.contentFile ?? null, client: e.clientFile ?? null,
      // 本 Mod **新建**的干员 id（add/clone 出来的）。供客户端判断「这条配置来自哪个 Mod」——
      // 干员调配的导入功能靠它把「本服没有的干员」说成「Mod X 未安装 / 已停用」，而不是一句「未知干员」。
      // 先取「声明值」（停用的 Mod 也能被点名），下面应用成功后换成**实际生效值**。
      chessIds: declaredChessIds(e),
      errors: [...e.errors, ...e.manifestErrors], warnings: [...e.warnings, ...e.manifestWarnings],
    };
    report.mods.push(row);
    if (!e.enabled) continue;
    if (row.errors.length) { row.skipped = true; continue; }

    // gameVersion 严格校验
    if (appVersion && e.manifest?.gameVersion && e.manifest.gameVersion !== appVersion) {
      row.errors.push(`gameVersion=${e.manifest.gameVersion} 与当前游戏版本 ${appVersion} 不一致`);
      row.skipped = true;
      continue;
    }

    let modFailed = false;
    /** 本 Mod 触碰过的目标文件快照 —— 失败时整体回滚，避免「半个补丁」写进去。 */
    const backup = new Map();
    const myTouches = [];
    /** 本 Mod 新建的干员 id（只有 add/clone 才算「贡献了新干员」；replace/merge 改的是既有干员）。 */
    const myChess = new Set();
    /** ★ 工序 88：与别的 Mod 写了同一路径、但**值逐字节相同**的记录（otherModId → Set(path)）。收尾聚合成一条 warning。 */
    const dupWith = new Map();
    for (const pf of e.patchFiles) {
      const target = pf.target;
      if (!Object.hasOwn(working, target)) {
        row.errors.push(`data/${pf.target}.json 的目标文件在 data/ 里不存在（可用：${Object.keys(working).sort().join(', ')}）`);
        modFailed = true;
        continue;
      }
      let patch;
      try {
        patch = JSON.parse(fs.readFileSync(path.join(e.dir, pf.rel), 'utf8'));
      } catch (err) {
        row.errors.push(`${pf.rel}: JSON 解析失败 ${err.message}`);
        modFailed = true;
        continue;
      }
      const ops = isObj(patch) && Array.isArray(patch.ops) ? patch.ops : null;
      if (!ops) { row.errors.push(`${pf.rel}: 顶层必须是 { "ops": [ … ] }`); modFailed = true; continue; }

      if (!backup.has(target)) backup.set(target, clone(working[target]));
      const res = applyOps(working[target], ops, { where: `${id}/${pf.rel}` });
      if (!res.ok) {
        row.errors.push(...res.errors);
        modFailed = true;
        continue;
      }
      // path 疑点（如段里含 "/"）：只提示，不影响 ok / applied（见 patch.js pathWarnings）
      if (res.warnings?.length) row.warnings.push(...res.warnings);
      // 冲突检测（与其它 Mod 抢同一路径）
      const conflicts = [];
      for (const a of res.applied) {
        const key = `${target}::${a.path}`;
        const other = touchPath.get(key);
        if (other && other !== id) {
          // ★★ 工序 88：同一条路径被第二个 Mod 写成**逐字节相同的值** ⇒ 不是冲突（谁先谁后结果一样），
          //    只登记下来、收尾聚合成一条提示。只有「写不同值」才算抢路径、才整份回滚（docs/MODS.md §3.6）。
          if (unchangedAt(backup.get(target), working[target], a.path)) {
            if (!dupWith.has(other)) dupWith.set(other, new Set());
            dupWith.get(other).add(a.path);
          } else {
            conflicts.push(`${a.path} 已被 "${other}" 改过`);
          }
        } else {
          touchPath.set(key, id);
        }
        myTouches.push(key);
        if (target === 'chess' && (a.op === 'add' || a.op === 'clone')) {
          const cid = String(a.path).split('.')[0];
          if (cid) myChess.add(cid);
        }
      }
      if (conflicts.length) {
        row.errors.push(...conflicts.map((c) => `与其它 Mod 冲突: ${c}`));
        modFailed = true;
      }
      row.files.push({ target, ops: res.applied.length });
      row.ops += res.applied.length;
      patched.add(target);
    }
    if (modFailed) {
      // ★ 原子性回滚：恢复快照 + 撤销本 Mod 的路径占用记录
      for (const [t, snap] of backup) working[t] = snap;
      for (const key of myTouches) if (touchPath.get(key) === id) touchPath.delete(key);
      for (const f of row.files) { /* 保留文件统计仅作展示 */ }
      row.files = [];
      row.ops = 0;
      // 回滚后本 Mod 没往数据里写进任何东西，但**声明值保留**：它确实是这些干员的来源，
      // 客户端提示里说出包名（「所属 Mod 未启用或有问题」）远比「未知干员」有用。
      row.skipped = true;
    } else {
      row.chessIds = [...myChess].sort();
      // ★ 工序 88：与别的 Mod 重复声明**同值**路径不是冲突，但要让人看得见 —— 按对方 Mod 聚合成一条提示。
      for (const [other, paths] of [...dupWith].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        const list = [...paths].sort();
        row.warnings.push(`与 "${other}" 重复写入 ${list.length} 条相同路径（值逐字节相同 ⇒ 按幂等处理，不算冲突）: `
          + list.slice(0, 6).join(', ') + (list.length > 6 ? ` …（共 ${list.length} 条）` : ''));
      }
    }
  }

  // ---- 记录级校验（对「被 Mod 触碰过的」干员做严格检查）
  const touchedChess = new Set();
  for (const [key] of touchPath) {
    const [target, p] = key.split('::');
    if (target === 'chess') touchedChess.add(p.split('.')[0]);
  }
  for (const cid of [...touchedChess].sort()) {
    const rec = working.chess?.[cid];
    if (rec === undefined) continue; // 被 remove 掉的
    const v = validateChessRecord(cid, rec, working);
    if (v.errors.length || v.warnings.length) {
      const owner = touchPath.get(`chess::${cid}`) || '(?)';
      const row = report.mods.find((m) => m.id === owner) || null;
      if (row) {
        row.errors.push(...v.errors);
        row.warnings.push(...v.warnings);
      }
      report.errors.push(...v.errors);
      report.warnings.push(...v.warnings);
    }
  }

  report.patched = [...patched].sort();
  const anyModError = report.mods.some((m) => m.enabled && m.errors.length);
  report.ok = report.errors.length === 0 && !anyModError;
  report.ms = Date.now() - started;

  if (report.mods.some((m) => m.enabled)) {
    log.info?.(`[mods] ${report.mods.filter((m) => m.enabled).length} 个 Mod 启用，补丁 ${report.patched.join(', ') || '(无)'}，${report.ms}ms`);
  }
  for (const m of report.mods) {
    if (m.errors.length) log.error?.(`[mods] ${m.id}: ${m.errors.length} 个错误 — ${m.errors[0]}`);
    for (const w of m.warnings) log.warn?.(`[mods] ${m.id}: ${w}`);
  }

  if (strict && !report.ok) {
    log.error?.('[mods] 严格模式：校验未通过，拒绝应用任何 Mod（保持原版数据）');
    const clean = {};
    for (const [k, v] of Object.entries(baseData)) clean[k] = clone(v);
    return { data: clean, report, patched: new Set(), ok: false };
  }
  return { data: working, report, patched, ok: report.ok };
}
