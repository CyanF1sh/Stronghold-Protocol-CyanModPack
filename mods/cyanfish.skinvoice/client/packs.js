// mods/cyanfish.skinvoice/client/packs.js — **跨 Mod 的皮肤/语音包**：发现 + 合并。
//
// ★ 为什么需要它（用户 2026-10-08 口径）：
//   「顺手把结城理mod的皮肤和语音补上，**放在结城理的干员包中**，注意当未加载 skinvoice mod 时
//     应**静默丢弃**对应皮肤语音内容。」
//   ⇒ 内容归**贡献方**（`cyanfish.makoto`），消费方（本 Mod）在运行时去发现它。
//     这样"结城理"这个干员的皮肤/语音跟着**干员包**走：换一个干员包就带一份它自己的内容，
//     不必改本 Mod 那份 807 KB 的 `skinvoice.json`。
//
// ★ 约定（本 Mod 单方面定义的**纯数据**通道，不改基座）：
//
//     <任意 Mod>/skinvoice-pack.json
//
//   · 纯数据：**不含任何代码**。没装本 Mod 时，这个文件**一次请求都不会发生**
//     ——这就是"静默丢弃"最干净的形式（不是"加载了再忽略"，而是根本没有执行面）。
//   · 发现方式：读 `GET /mods` 那份快照（hostApi.snapshot / hostApi.getMods()），
//     对**除自己以外**的每个「已启用且未跳过」的 Mod，试取 `/mods/<id>/skinvoice-pack.json`；
//     404 / 非 JSON / 结构不合法 ⇒ **静默跳过**，绝不影响页面（和 extensions.js 对坏 Mod 的态度一致）。
//   · ★★ **必须自己按 enabled/skipped 过滤**：`/mods/` 是**整目录**静态挂载的，
//     停用的 Mod 的文件**照样取得到**；但它的 `/assets/` 已经从回退根里摘掉了
//     （`server/index.js` 的 `modAssetDirsOf` 只收 `enabled && !skipped`）⇒
//     不过滤就会拿到一堆指向 404 的指针，界面上是一排破图。
//
// ★ 包的结构（与 `client/skinvoice.json` 的 `operators[charId]` **同构**，这样合并逻辑可以极薄）：
//
//     { "packVersion": 1,
//       "modId": "cyanfish.makoto",
//       "operators": {
//         "<charId>": {
//           "skins": [ { id, name, group, sort, hasDyn, portrait, avatar, battle: {…} } ],
//           "voices": { "CN": { "pick": […], "deploy": […], "battle": […] }, "JP": {…} }
//         } } }
//
//   `battle` 的形状与 `gen_skinvoice_data.mjs` / `install_skinvoice_spine.mjs` 产出的完全一致
//   （正面 `skel/atlas/textures/anims/animations/events/hits/bounds`，背面 `back*` 首字母大写），
//   所以 `skins.js` 的 `spineSide()` 一行都不用改。

/** 约定的包文件名（放在 Mod 的**包根**，与 data/ content/ client/ assets/ 并列）。 */
export const PACK_FILE = 'skinvoice-pack.json';

/** 本 Mod 认的语音槽位（与 client/skinvoice.json 的 `slots` 一致）。 */
export const VOICE_SLOTS = Object.freeze(['pick', 'deploy', 'battle']);

/** 某个 Mod 的包地址。 */
export const packUrlOf = (modId) => `/mods/${encodeURIComponent(String(modId))}/${PACK_FILE}`;

const isStr = (v) => typeof v === 'string' && v.length > 0;

/**
 * 一条皮肤记录是否可用。
 * ★ 判据取"渲染必需的最小集"：`id`（去重与选中都用它）、`name`（下拉标签）、`portrait`（立绘）。
 *   `avatar` 缺了不致命（宿主头像会回落到立绘路径的语义由 assetUrls 管），所以只要有一个图就行。
 */
function skinOk(s) {
  if (!s || typeof s !== 'object') return false;
  if (!isStr(s.id) || !isStr(s.name)) return false;
  return isStr(s.portrait) || isStr(s.avatar);
}

/**
 * 一条战斗小人记录是否可用。
 * ★ `skins.js:spineSide()` 自己会校验 `skel/atlas/anims` 三件套并返回 null（优雅降级），
 *   但**这里必须先把明显残缺的 `battle` 摘掉**：否则 `hasSpine:true` 会让设置页的
 *   "已装 N/N 套"虚高一头，玩家选了却发现小人没换。宁可当"这套没有小人"。
 * ★ 只校验正面：背面是**可选**的（宿主 `assets.js:151` 天生回退正面，v0.4.0 已实证 3 套没有背面）。
 */
function battleOk(b) {
  if (!b || typeof b !== 'object') return false;
  if (b.hasSpine !== true) return false;
  if (!isStr(b.skel) || !isStr(b.atlas)) return false;
  return !!b.anims && typeof b.anims === 'object';
}

/** 稳定排序：先按官方分组序号，再按名字（与 gen_skinvoice_data.mjs 的口径一致）。 */
const bySort = (a, b) => (a.sort ?? 999) - (b.sort ?? 999) || String(a.name).localeCompare(String(b.name), 'zh');

/**
 * 把一个包并进内置数据表（**原地修改** `table.operators`）。
 *
 * ★ 合并口径（三条，都是防"第三方包把官方数据弄坏"）：
 *   1. **同 id 不覆盖**：皮肤按 `id` 去重，已存在的一律保留原样（官方/先来的赢）。
 *   2. **语音按 URL 并集**：同一 语种/槽位 下把新 URL 追加上去、按 URL 去重（多个包可以给同一干员补语音）。
 *   3. **只加不改**：从不删除、从不改写已有的皮肤/语音；`table` 里没这个干员就新建一条。
 *
 * @param {any} table client/skinvoice.json 解析出来的对象（`operators` 会被原地补全）
 * @param {any} pack  包内容
 * @param {{ from?: string|null }} [opts] from = 贡献方 modId（只用于回报与日志）
 * @returns {{ from:string|null, operators:number, skins:number, voicelines:number, dropped:number }}
 */
export function mergePack(table, pack, { from = null } = {}) {
  const rep = { from, operators: 0, skins: 0, voicelines: 0, dropped: 0 };
  if (!table || typeof table !== 'object') return rep;
  if (!table.operators || typeof table.operators !== 'object') table.operators = {};
  const ops = pack && typeof pack === 'object' ? pack.operators : null;
  if (!ops || typeof ops !== 'object') return rep;

  for (const [charId, entry] of Object.entries(ops)) {
    if (!isStr(charId) || !entry || typeof entry !== 'object') continue;
    const dst = (table.operators[charId] && typeof table.operators[charId] === 'object')
      ? table.operators[charId]
      : (table.operators[charId] = {});
    let touched = false;

    // ---- 皮肤 ----
    if (Array.isArray(entry.skins)) {
      const have = new Set((Array.isArray(dst.skins) ? dst.skins : []).map((s) => s && s.id).filter(isStr));
      const add = [];
      for (const s of entry.skins) {
        if (!skinOk(s)) { rep.dropped++; continue; }
        if (have.has(s.id)) continue;           // 同 id 已存在 ⇒ 官方/先来的赢
        if (add.some((x) => x.id === s.id)) continue;
        const clean = { ...s };
        if (!battleOk(clean.battle)) delete clean.battle;   // 残缺的小人记录 ⇒ 当"这套没有小人"
        add.push(clean);
        have.add(s.id);
      }
      if (add.length) {
        dst.skins = [...(Array.isArray(dst.skins) ? dst.skins : []), ...add].sort(bySort);
        rep.skins += add.length;
        touched = true;
      }
    }

    // ---- 语音 ----
    if (entry.voices && typeof entry.voices === 'object') {
      for (const [lang, bySlot] of Object.entries(entry.voices)) {
        if (!isStr(lang) || !bySlot || typeof bySlot !== 'object') continue;
        for (const slot of VOICE_SLOTS) {
          const src = bySlot[slot];
          if (!Array.isArray(src)) continue;
          const urls = src.filter(isStr);
          if (!urls.length) continue;
          const cur = dst.voices && dst.voices[lang] && Array.isArray(dst.voices[lang][slot])
            ? dst.voices[lang][slot] : [];
          const have = new Set(cur);
          const add = urls.filter((u) => !have.has(u));
          if (!add.length) continue;
          if (!dst.voices) dst.voices = {};
          if (!dst.voices[lang]) dst.voices[lang] = {};
          dst.voices[lang][slot] = [...cur, ...add];
          rep.voicelines += add.length;
          touched = true;
        }
      }
    }

    if (touched) rep.operators++;
  }
  return rep;
}

/**
 * 发现并合并所有 Mod 提供的包。
 *
 * ★ 全程**不抛错**：任何一步失败都只是"这个 Mod 没包"。调用方拿到的报告只用于打一行日志。
 *
 * @param {{ api:any, selfId:string, log?:object, fetchFn?:Function }} deps
 * @returns {Promise<{ tried:number, loaded:string[], report:any[], failed:string[], operators:number, skins:number, voicelines:number }>}
 */
export async function discoverPacks({ api, selfId, log = console, fetchFn = null } = {}) {
  const out = { tried: 0, loaded: [], packs: [], failed: [] };

  const doFetch = fetchFn || ((...a) => globalThis.fetch(...a));

  // 拿 Mod 列表：优先用启动时那份快照（零额外请求），没有就现拉一次。
  let snap = (api && api.snapshot) || null;
  if (!snap && api && typeof api.getMods === 'function') {
    try { snap = await api.getMods(); } catch { snap = null; }
  }
  const list = Array.isArray(snap && snap.mods) ? snap.mods : [];
  if (!list.length) return out;                            // 静态托管 / 老服务器 ⇒ 没有包这回事

  for (const m of list) {
    if (!m || !isStr(m.id) || m.id === selfId) continue;
    // ★★ 见文件头：停用的 Mod 文件取得到、但素材不在回退根里 ⇒ 必须过滤
    if (m.enabled === false || m.skipped === true) continue;
    out.tried++;

    let pack = null;
    try {
      const res = await doFetch(packUrlOf(m.id), { cache: 'no-cache' });
      if (!res || !res.ok) continue;                          // 404 = 这个 Mod 没有包（正常）
      pack = await res.json();
    } catch { out.failed.push(m.id); continue; }              // 网络 / JSON 坏 ⇒ 静默跳过
    if (!pack || typeof pack !== 'object') continue;
    out.packs.push({ modId: m.id, pack });
    out.loaded.push(m.id);
  }
  return out;
}

/**
 * 发现 + 合并（两步合一，`index.js` 只调这个）。
 * @param {{ api:any, table:any, selfId:string, log?:object, fetchFn?:Function }} deps
 */
export async function applyPacks({ api, table, selfId, log = console, fetchFn = null } = {}) {
  const found = await discoverPacks({ api, selfId, log, fetchFn });
  const rep = { tried: found.tried, loaded: found.loaded, failed: found.failed, report: [], operators: 0, skins: 0, voicelines: 0 };
  for (const { modId, pack } of found.packs) {
    const r = mergePack(table, pack, { from: modId });
    rep.report.push(r);
    rep.operators += r.operators;
    rep.skins += r.skins;
    rep.voicelines += r.voicelines;
  }
  return rep;
}
