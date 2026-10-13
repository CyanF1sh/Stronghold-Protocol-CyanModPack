// server/mods/patch.js — Mod 补丁引擎（纯函数，无 IO）。
// (i18n-ignore-file: Mod 平台（加载器 / 打包 / 管理 API），不是游戏界面文案 — docs/I18N.md)
//
// 一个补丁文件的作用对象是 data/<target>.json 的**根对象**，形如：
//
//   { "ops": [
//       { "op": "add",     "path": "cyanfish_op_a",            "value": { … } },
//       { "op": "replace", "path": "chess_char_1_01_a.stats.atk", "value": 500 },
//       { "op": "remove",  "path": "enemy_1005_yokai" },
//       { "op": "merge",   "path": "economy",                  "value": { "incomeCap": 15 } }
//   ] }
//
// 七种 op 的语义（刻意做「严格」：add/clone 要求不存在、replace/remove/merge/deepMerge/append 要求存在，
// 防止手滑写错路径却静默成功）：
//   add       目标键必须**不存在** → 新建
//             ★ 唯一的**幂等**豁免（工序 88）：目标已存在、且与本次要写的 value **逐字节相同**时，
//               不报错、照常记入 applied（= 一次「同值重写」，结果与先写成功完全一样）。
//               判据刻意取「逐字节相同」而不是「深相等」：只放过真正的重复声明。
//               它算不算「两条 Mod 抢同一路径」由 loader.js 的冲突判定收口（同值 ⇒ 只提示、不算冲突），
//               于是「两条可以各自单独启用的 Mod 都声明同一条数据」谁先谁后都成立 —— 见 docs/MODS.md §3.6。
//   clone     在 from 处取一份记录，深克隆后用 value 深合并覆盖，再作为**新键**写进 path）
//             —— 这是「新增干员」最实用的写法：照抄一个现有干员再改，避免手写上百个字段
//             ★ 与 add 同一条幂等豁免（比较的是 clone **算出来的结果**）
//   replace   目标键必须**存在**   → 覆盖
//   remove    目标键必须**存在**   → 删除
//   merge     目标必须是对象       → 浅合并（只覆盖给出的字段，其余保留）
//   deepMerge 目标必须是对象       → 深合并（递归进对象；**数组整体替换**，不做拼接）
//   append    目标必须是**数组**   → 在末尾追加（value 可以是单个元素或数组；已存在的元素跳过 ⇒ 幂等）
//             —— 用于把新干员挂到 bonds.<id>.members / .visibleMembers 这类「成员表」上，
//                免得 mod 里复制一份全量数组（那样基座数据一变，mod 就会悄悄丢成员）
//
// 例（照抄「隐现」做一个新干员，并把他挂进【拉特兰】的成员表）：
//   { "op": "clone", "from": "chess_char_1_01_a", "path": "cyanfish_demo_a",
//     "value": { "chessId": "cyanfish_demo_a", "name": "示例干员", "stats": { "atk": 999 } } },
//   { "op": "append", "path": "lateranoShip.members", "value": "cyanfish_demo_a" }
//
// path 语法：用 `.` 分隔；键里若真有 `.` 用 `\.` 转义。容器是数组时，该段必须是整数下标。
// 例：`modes.mode_multi_hard.rounds.3.template`
//
// ★ 分段**只能**用 `.`：`/` 不是分隔符，它是**普通字符**（`a/b` 就是「一个键名叫 a/b」）。
//   引擎允许任意键名，所以这不算错误；但几乎每一次出现 `/` 都是「作者以为它是分隔符」——
//   典型现象是「Mod 装上了、ops 数也对、anyErrors=false，功能却整条没生效」
//   （2026-10-08 实测：`diy.slots/<id>` 静默写出了一个名叫 `slots/<id>` 的键，`diy.slots` 里什么都没多）。
//   所以 applyOps 会为这种段**产出一条 warning**（`pathWarnings`），语义**一点不改**。

/** 解析点分路径。@param {string} p @returns {string[]} */
export function parsePath(p) {
  if (typeof p !== 'string' || p.length === 0) throw new Error('path 必须是非空字符串');
  const out = [];
  let cur = '';
  let esc = false;
  for (const ch of p) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '.') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (esc) throw new Error(`path 以转义符结尾: ${p}`);
  out.push(cur);
  if (out.some((s) => s === '')) throw new Error(`path 存在空段（多余的点？）: ${p}`);
  return out;
}

/**
 * path 的**疑点**（只看写法，不看数据；一律是 warning，绝不改变语义）。
 *
 * 判据只有一条：**某个解析出来的段里含 `/`**。`/` 是普通字符而不是分隔符，所以这几乎必然是
 * 「想写 `a.b.c` 却写成了 `a.b/c`」；本 DSL 用 `.` 分段，键里真有 `.` 用 `\.` 转义。
 * （数组下标段、以及任意不含 `/` 的键名，一律不产 warning ⇒ 既有合法补丁一条都不多。）
 *
 * @param {string} p 原始 path（或 clone 的 from）
 * @param {{ label?: string }} [opts] label 用于说明这是 path 还是 from
 * @returns {string[]}
 */
export function pathWarnings(p, { label = 'path' } = {}) {
  if (typeof p !== 'string' || p.length === 0) return [];
  let segs;
  try { segs = parsePath(p); } catch { return []; } // 解析不开的由 applyOps 报 error，这里不重复
  const bad = segs.filter((s) => s.includes('/'));
  if (!bad.length) return [];
  const suggestion = p.replace(/\//g, '.');
  return [
    `${label} "${p}" 的段 ${bad.map((s) => `"${s}"`).join('、')} 里含 "/" —— 本 DSL 只用 "." 分段，` +
    `"/" 是普通字符（会被当成键名的一部分）。你是不是想写 "${suggestion}"？` +
    `（键里真有 "." 请用 "\\." 转义）`,
  ];
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isContainer = (v) => v !== null && typeof v === 'object';
const OPS = new Set(['add', 'clone', 'replace', 'remove', 'merge', 'deepMerge', 'append']);
/** append 用的元素指纹（数据全是 JSON，stringify 足够且对重复检测很直观）。 */
const fingerprint = (v) => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
/**
 * `add` / `clone` 的**幂等**判据（工序 88）：两个值 JSON 序列化后逐字节相同。
 * 刻意不用深相等（键序不同也算不同）：只放过「一模一样的重复声明」这一种情况。
 * 任一为 undefined ⇒ 判否（API 允许调用方传 `value: undefined`，那不该被当成「与已有值相同」）。
 */
const sameJson = (a, b) => a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b);

/** 在容器里取/判一个段。@returns {{ok:boolean, has:boolean, value:any, why?:string}} */
function slot(container, seg) {
  if (Array.isArray(container)) {
    if (!/^\d+$/.test(seg)) return { ok: false, has: false, value: undefined, why: `容器是数组，段 "${seg}" 不是下标` };
    const i = Number(seg);
    return { ok: true, has: i < container.length, value: container[i] };
  }
  if (isObj(container)) return { ok: true, has: Object.hasOwn(container, seg), value: container[seg] };
  return { ok: false, has: false, value: undefined, why: '容器不是对象/数组' };
}

const describe = (v) => (v === undefined ? 'undefined' : Array.isArray(v) ? `array(${v.length})` : isObj(v) ? 'object' : `${typeof v}(${String(v).slice(0, 40)})`);

/** 深合并：递归进对象；标量与数组整体替换。@returns 修改后的 dst */
function deepMergeInto(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (isObj(v) && isObj(dst[k])) deepMergeInto(dst[k], v);
    else dst[k] = v;
  }
  return dst;
}

/** 按点分路径取一个值。@returns {{ok:boolean, has:boolean, value:any, why?:string}} */
export function resolvePath(root, segs) {
  let cur = root;
  for (let i = 0; i < segs.length; i++) {
    const s = slot(cur, segs[i]);
    if (!s.ok) return { ok: false, has: false, value: undefined, why: `段 "${segs[i]}" 无效（${s.why}）` };
    if (!s.has) return { ok: false, has: false, value: undefined, why: `键 "${segs.slice(0, i + 1).join('.')}" 不存在` };
    cur = s.value;
  }
  return { ok: true, has: true, value: cur };
}

/**
 * 把一组 ops 作用到 root 上（**原地修改** root；调用方负责先做工作副本）。
 * 一旦某个 op 失败，整个补丁**不再继续**（原子性：宁可整包拒绝，也不要半个补丁写进去）。
 *
 * @param {any} root 目标文件的根对象
 * @param {Array<{op:string, path:string, value?:any}>} ops
 * @param {{ where?: string }} [opts] where 用于错误信息定位（如 "mod 名/文件"）
 * @returns {{ ok: boolean, errors: string[], warnings: string[], applied: Array<{op:string, path:string}> }}
 *   warnings = path 的疑点（**只提示写法、不改语义**：见 pathWarnings。段里含 "/" 几乎必然是分段写错了）
 */
export function applyOps(root, ops, { where = '' } = {}) {
  const tag = where ? `[${where}] ` : '';
  const errors = [];
  const warnings = [];
  const applied = [];
  if (!Array.isArray(ops)) return { ok: false, errors: [`${tag}ops 必须是数组`], warnings, applied };

  for (let n = 0; n < ops.length; n++) {
    const raw = ops[n];
    const at = `${tag}ops[${n}]`;
    if (!isObj(raw)) { errors.push(`${at}: 必须是对象`); break; }
    const { op, path: p } = raw;
    if (!OPS.has(op)) { errors.push(`${at}: 未知 op "${op}"（只允许 ${[...OPS].join('/')}）`); break; }
    let segs;
    try { segs = parsePath(p); } catch (e) { errors.push(`${at}: ${e.message}`); break; }
    // path 疑点（warning）：纯提示，绝不拦、绝不改语义
    warnings.push(...pathWarnings(p).map((w) => `${at}: ${w}`));
    if (typeof raw.from === 'string') warnings.push(...pathWarnings(raw.from, { label: 'from' }).map((w) => `${at}: ${w}`));
    const needsValue = op !== 'remove';
    if (needsValue && !Object.hasOwn(raw, 'value')) { errors.push(`${at}: op=${op} 必须带 value`); break; }
    if (op === 'clone' && (typeof raw.from !== 'string' || !raw.from)) { errors.push(`${at}: clone 必须带 from（要照抄的记录路径）`); break; }
    if ((op === 'merge' || op === 'deepMerge') && !isObj(raw.value)) { errors.push(`${at}: ${op} 的 value 必须是对象`); break; }
    if (op === 'clone' && !isObj(raw.value)) { errors.push(`${at}: clone 的 value 必须是对象（要覆盖的字段）`); break; }

    // 走到父容器
    let cur = root;
    let bad = null;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = slot(cur, segs[i]);
      if (!s.ok) { bad = `path 段 "${segs[i]}" 无效（${s.why}）`; break; }
      if (!s.has) { bad = `path 中间键 "${segs.slice(0, i + 1).join('.')}" 不存在`; break; }
      if (!isContainer(s.value)) { bad = `path 中间键 "${segs.slice(0, i + 1).join('.')}" 不是对象/数组（是 ${describe(s.value)}）`; break; }
      cur = s.value;
    }
    if (bad) { errors.push(`${at} (${p}): ${bad}`); break; }

    const last = segs[segs.length - 1];
    const s = slot(cur, last);
    if (!s.ok) { errors.push(`${at} (${p}): ${s.why}`); break; }

    const creates = op === 'add' || op === 'clone';
    // clone 的 from 必须在同一文件里解析得到。
    // ★ 工序 88：本块挪到 creates 判定**之前**，好让下面的「同值幂等」分支也能比较 clone **算出来的结果**
    //   （add 与 clone 共用同一条幂等规则）。代价：目标已存在且 from 也坏时，报错文案从「要求目标不存在」
    //   变成 from 那条 —— 两种都是 error、都整包回滚，只有文案不同。
    let src = null;
    if (op === 'clone') {
      let fromSegs;
      try { fromSegs = parsePath(raw.from); } catch (e) { errors.push(`${at}: from 非法 — ${e.message}`); break; }
      const r = resolvePath(root, fromSegs);
      if (!r.ok) { errors.push(`${at}: clone 的 from "${raw.from}" ${r.why || '不存在'}`); break; }
      if (!isObj(r.value)) { errors.push(`${at}: clone 的 from "${raw.from}" 不是对象（是 ${describe(r.value)}）`); break; }
      src = clone(r.value);
      deepMergeInto(src, raw.value);
    }
    if (creates && s.has) {
      // ★★ 幂等（工序 88）：目标已存在，但值与本次要写的一模一样 ⇒ 不报错，照常记入 applied（同值重写）。
      //    跨 Mod 的「算不算抢路径」由 loader.js 收口（同值 ⇒ 只聚合一条提示、不算冲突）。
      const want = op === 'clone' ? src : raw.value;
      if (!sameJson(s.value, want)) {
        errors.push(`${at} (${p}): ${op} 要求目标不存在，但 "${p}" 已存在（要覆盖请用 replace）`);
        break;
      }
    }
    if (!creates && !s.has) { errors.push(`${at} (${p}): ${op} 要求目标存在，但 "${p}" 不存在`); break; }
    if ((op === 'merge' || op === 'deepMerge') && !isObj(s.value)) { errors.push(`${at} (${p}): ${op} 的目标必须是对象（当前 ${describe(s.value)}）`); break; }
    if (op === 'append' && !Array.isArray(s.value)) { errors.push(`${at} (${p}): append 的目标必须是数组（当前 ${describe(s.value)}）`); break; }

    if (op === 'remove') {
      if (Array.isArray(cur)) cur.splice(Number(last), 1);
      else delete cur[last];
    } else if (op === 'merge') {
      for (const [k, v] of Object.entries(raw.value)) s.value[k] = v;
    } else if (op === 'deepMerge') {
      deepMergeInto(s.value, raw.value);
    } else if (op === 'append') {
      const items = Array.isArray(raw.value) ? raw.value : [raw.value];
      const seen = new Set(s.value.map(fingerprint));
      for (const item of items) {
        const fp = fingerprint(item);
        if (seen.has(fp)) continue; // 幂等：已经在数组里就跳过（mod 重复应用不会越加越多）
        seen.add(fp);
        s.value.push(item);
      }
    } else if (op === 'clone') {
      cur[last] = src;
    } else {
      cur[last] = raw.value;
    }
    applied.push({ op, path: p, ...(op === 'clone' ? { from: raw.from } : {}) });
  }
  return { ok: errors.length === 0, errors, warnings, applied };
}

/**
 * 深拷贝（结构化克隆语义；数据全是 JSON，用 JSON 往返最稳且够快）。
 * @template T @param {T} o @returns {T}
 */
export function clone(o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); }
