// mods/cyanfish.loadout-io/client/format.js — 干员调配配置文件的**纯逻辑**（零依赖、不碰 DOM、不 import 游戏模块）。
//
// 为什么单独拆出来：导入/导出的全部风险都在判定规则上（什么算合法条目、哪条必须丢弃、为什么丢），
// 而它与界面无关。做成纯函数 ⇒ 可以在 Node 里直接跑断言（<开发期脚本>/verify_loadout_io.mjs）。
// client/index.js 只负责把它接到界面上。
//
// ★ 与游戏共享的口径（shared/protocol.js 的 isId / LOADOUT_LIMITS）在这里**故意复制**：
//   Mod 目录可能在游戏仓库之外（测试实例：本地部署目录/mod/mods），两端相对根也不一致，
//   跨目录 import 游戏内部模块会碎。真正的合法性判定仍然交给宿主（api.loadout.sanitize），
//   这里的常量只用于「一眼看出这不是配置」的粗筛。搬动口径时两边都要改。

/** 文件标识：只有认得出这个才当成「本 Mod 导出的完整文件」。 */
export const FORMAT = 'stronghold-protocol-loadout';
export const VERSION = 1;
/** 与 shared/protocol.js 的 LOADOUT_LIMITS 同口径。 */
export const LIMITS = Object.freeze({ entries: 160, skillIndex: 9 });
/** 与 shared/protocol.js 的 isId 同口径。 */
export const ID_RE = /^[A-Za-z0-9_\-.:]{1,64}$/;
/**
 * 「这看起来是一个干员 id」——比 ID_RE 更严一级：本作**所有**干员 id 都是 `<前缀>_<名>` 形状
 * （`char_002_amiya` / `cyanfish_makoto_a`；实测 data/chess.json 266 条全部含下划线）。
 * 只用在一个地方：把一个**没有 entries 字段**的裸 JSON 对象认成配置文件时，需要排除掉
 * `{"foo":{…}}` 这类碰巧「键是字符串、值是对象」的普通 JSON。
 */
const looksLikeChessId = (k) => ID_RE.test(k) && k.includes('_');
/** 读取文件时的条目数硬上限（防一个坏文件把浏览器拖死；超了直接判为「认不出」）。 */
const MAX_READ = 5000;
const tooMany = (n) => ({ error: `文件里的条目太多（${n} 条，上限 ${MAX_READ} 条），不像是干员调配配置` });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

/**
 * 从一条记录里取出「技能 / 模组」两个字段，非法值直接丢。
 * @param {any} e
 * @returns {{ skill?: number, module?: string } | null} null = 这条记录没有任何可用字段
 */
export function readChoice(e) {
  if (!isObj(e)) return null;
  const out = {};
  if (isInt(e.skill) && e.skill >= 0 && e.skill <= LIMITS.skillIndex) out.skill = e.skill;
  if (typeof e.module === 'string' && ID_RE.test(e.module)) out.module = e.module;
  return Object.keys(out).length ? out : null;
}

/**
 * 归一化任意输入 → `{ entries, meta }`，认不出就 `{ error }`。
 *
 * 接受三种形状（都对玩家友好，别人手搓的配置也能用）：
 *   1) 本 Mod 导出的完整文件 `{ format, version, exportedAt, game, mods, names, entries }`
 *   2) 游戏自己 localStorage 里的 `{ v: 1, entries }`
 *   3) 裸的 entries 映射 `{ "chess_char_1_01_a": { "skill": 1 } }`
 *
 * @param {string|any} raw 文件文本或已解析的对象
 * @returns {{ entries: Record<string, any>, meta: object } | { error: string }}
 */
export function normalizeInput(raw) {
  let src = raw;
  if (typeof raw === 'string') {
    try { src = JSON.parse(raw); } catch (e) { return { error: `不是合法的 JSON（${e && e.message ? e.message : e}）` }; }
  }
  if (!isObj(src)) return { error: '顶层不是 JSON 对象' };
  const meta = {
    format: typeof src.format === 'string' ? src.format : null,
    version: src.version ?? src.v ?? null,
    exportedAt: typeof src.exportedAt === 'string' ? src.exportedAt : null,
    game: isObj(src.game) ? src.game : null,
    mods: Array.isArray(src.mods) ? src.mods.filter(isObj) : [],
    names: isObj(src.names) ? src.names : {},
  };
  const keys = Object.keys(src);
  if (isObj(src.entries)) {
    const n = Object.keys(src.entries).length;
    return n > MAX_READ ? tooMany(n) : { entries: src.entries, meta };
  }
  if (keys.length === 0) return { entries: {}, meta };
  if (keys.length > MAX_READ) return tooMany(keys.length);
  // 裸映射：每个值都是对象，且至少有一个键长得像干员 id（`{ foo: { skill: 1 } }` 这种普通 JSON ⇒ 认不出）
  if (keys.every((k) => isObj(src[k])) && keys.some(looksLikeChessId)) return { entries: src, meta };
  return { error: '认不出这是干员调配配置文件（既没有 entries 字段，也不像「干员 id → 技能/模组」的映射）' };
}

/** 丢弃原因 → 给玩家看的一句话。 */
export const REASON_TEXT = Object.freeze({
  missing: '本服务器没有这名干员（多半来自未安装的 Mod）',
  disabled: '所属 Mod 未启用或有问题',
  notslot: '不是可调配的干员档位（精锐档 / 隐藏干员）',
  invalid: '技能 / 模组与当前版本不符',
  format: '字段格式不合法',
  limit: '超出配置条目上限',
});

/**
 * 导入方案：逐条判定「收下 / 部分收下 / 无需导入 / 丢弃」，并说明为什么。
 *
 * 判定顺序（先便宜后昂贵，且**权威判定始终交给宿主**的 sanitize）：
 *   0. 条目上限 / id 形状 —— 明显不是配置的，不必查数据；
 *   1. 结构粗筛（readChoice）—— 字段类型/范围明显不对的，不必查数据；
 *   2. 干员是否存在（getChess）—— 不存在 ⇒ 本服没有（多半来自未安装的 Mod）；存在但被某个
 *      **未启用**的 Mod 声明过 ⇒ 说得更准确：「所属 Mod 未启用」；
 *   3. 是不是可调配槽位（isSlot）—— 精锐档 / 隐藏干员不算；
 *   4. 与默认相同（options）—— 没有任何信息量，单独归到 skipped，别吓唬玩家说「非法」；
 *   5. 清洗（sanitize）—— **由宿主决定**：仍然合法的字段保留下来（例如文件里的模组本服没有，
 *      但技能合法 ⇒ 只导入技能，计入 adjusted），一个字段都不合法才算 invalid。
 *
 * ★ options 只用于「第 4 步的措辞」与「第 5 步的解释」，绝不代替 sanitize 做决定：
 *   两边口径万一不一致，以宿主为准，界面仍然如实报告（adjusted / dropped），不会悄悄吞掉差异。
 *
 * @param {{
 *   entries: Record<string, any>,            // normalizeInput 的结果（原始值）
 *   getChess: (id: string) => any,           // 宿主数据查干员（api.data.lookup）
 *   isSlot: (rec: any) => boolean,           // 宿主判定「这能不能作为调配槽位」（api.loadout.isSlot）
 *   sanitize: (entries: any, getChess: any) => any,   // 宿主清洗（api.loadout.sanitize）
 *   options?: (rec: any, golden: any) => any,         // 宿主选项表（api.loadout.model.chessOptions）
 *   mods?: any[],                            // GET /mods 的 mods[]（用 chessIds 把干员归因到 Mod）
 *   names?: Record<string, string>,          // 文件自带的名字表（只为把提示写得更像人话）
 * }} input
 * @returns {{ entries: Record<string, any>, applied: string[],
 *            adjusted: Array<{id:string,name:string,asked:any,got:any}>,
 *            skipped: Array<{id:string,name:string}>,
 *            dropped: Array<{id:string,name:string,reason:string,mod:any}> }}
 */
export function planImport({ entries, getChess, isSlot, sanitize, options, mods = [], names = {} }) {
  const owner = ownerMap(mods);
  const nameOf = (id) => (typeof names[id] === 'string' && names[id]) || getChess?.(id)?.name || id;
  const out = {};
  const applied = [];
  const adjusted = [];
  const skipped = [];
  const dropped = [];
  const drop = (id, name, reason, mod = null) => dropped.push({ id, name, reason, mod });

  let seen = 0;
  for (const [id, raw] of Object.entries(entries || {})) {
    const name = nameOf(id);
    // ① 条目上限：按**文件里的条数**算，超出的一条都不处理（前 N 条优先，行为可预测、不吃 CPU）
    if (seen++ >= LIMITS.entries) { drop(id, name, 'limit'); continue; }
    // ② id 形状（与 shared/protocol.js 的 isId 同口径）—— 不合法就不必查数据，直接判格式错
    if (!ID_RE.test(id)) { drop(id, name, 'format'); continue; }
    const asked = readChoice(raw);
    if (!asked) { drop(id, name, 'format'); continue; }

    const rec = getChess ? getChess(id) : null;
    if (!rec) {
      const m = owner.get(id) || null;
      const usable = m && m.enabled === true && m.skipped !== true;
      drop(id, name, m && !usable ? 'disabled' : 'missing', usable ? null : m);
      continue;
    }
    if (isSlot && !isSlot(rec)) { drop(id, name, 'notslot'); continue; }

    const golden = rec.goldenId && getChess ? getChess(rec.goldenId) || null : null;
    const opt = options ? options(rec, golden) : null;
    const skillAsked = asked.skill !== undefined;
    const moduleAsked = asked.module !== undefined;
    // 值本身是否在选项里（不在 ⇒ 既不是「默认」也不是「合法」，交给 sanitize 去判）
    const skillInOpts = !skillAsked || !opt || opt.skills.includes(asked.skill);
    const moduleInOpts = !moduleAsked ? true : (!!golden && (!opt || opt.modules.includes(asked.module)));
    // 与默认配置相同 ⇒ 没有任何要导入的内容（不是错误，也不是「非法」）
    const skillIsDefault = !skillAsked || !opt || (skillInOpts && asked.skill === opt.defaultSkill);
    const moduleIsDefault = !moduleAsked || (!!golden && !!opt && moduleInOpts && asked.module === opt.defaultModule);
    if (skillIsDefault && moduleIsDefault && skillInOpts && moduleInOpts) { skipped.push({ id, name }); continue; }

    const got = (sanitize ? sanitize({ [id]: asked }, getChess) : { [id]: asked })?.[id];
    if (!got || !Object.keys(got).length) { drop(id, name, 'invalid'); continue; }
    out[id] = got;
    applied.push(id);
    if (got.skill !== asked.skill || got.module !== asked.module) adjusted.push({ id, name, asked, got });
  }
  return { entries: out, applied, adjusted, skipped, dropped };
}

/** chessId → 载入中的 Mod 记录（第一个声明它的 Mod 说话）。 */
function ownerMap(mods) {
  const m = new Map();
  for (const mod of Array.isArray(mods) ? mods : []) {
    if (!isObj(mod) || !Array.isArray(mod.chessIds)) continue;
    for (const cid of mod.chessIds) if (typeof cid === 'string' && cid && !m.has(cid)) m.set(cid, mod);
  }
  return m;
}

/** 丢弃清单 → 一句话（给 toast 用）。 */
export function describeDrops(dropped) {
  if (!dropped || !dropped.length) return '';
  const head = dropped.slice(0, 5).map((d) => d.name || d.id).join('、');
  return dropped.length > 5 ? `${head} 等 ${dropped.length} 名` : head;
}

/**
 * 构造导出载荷。只写「与默认不同」的条目（store 里本来就是这么存的），并带上名字表与当时的 Mod 清单 ——
 * 名字表是为了导入方在提示里能说人话（「结城理」而不是 `cyanfish_makoto_a`）。
 *
 * @param {{ entries: Record<string, any>, getChess?: (id: string) => any, mods?: any[],
 *           game?: object, now?: () => Date }} input
 */
export function buildExport({ entries, getChess, mods = [], game = null, now = () => new Date() }) {
  const clean = {};
  const names = {};
  for (const [id, raw] of Object.entries(entries || {})) {
    if (!ID_RE.test(id)) continue;
    const c = readChoice(raw);
    if (!c) continue;
    clean[id] = c;
    const n = getChess?.(id)?.name;
    if (n) names[id] = n;
  }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: now().toISOString(),
    game: game || null,
    mods: (Array.isArray(mods) ? mods : [])
      .filter((m) => isObj(m) && m.enabled === true && m.skipped !== true)
      .map((m) => ({ id: m.id, name: m.name ?? null, version: m.version ?? null })),
    names,
    entries: clean,
  };
}

/** 导入合并：同名干员以文件为准（其余保留）。 */
export const mergeEntries = (current, imported) => ({ ...(current || {}), ...(imported || {}) });

/** 下载文件名（本地时间，便于区分）。 */
export function exportFilename(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `卫戍协议-干员调配-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
