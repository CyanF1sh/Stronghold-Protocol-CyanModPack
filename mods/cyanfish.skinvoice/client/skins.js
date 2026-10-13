// mods/cyanfish.skinvoice/client/skins.js — 把"我选的皮肤"应用到**内存里的材质清单**，并触发重渲染。
//
// ★ 为什么改内存而不是改 data/assets.json 补丁：
//   L1 补丁（data/<target>.json）是**全局**的 —— 装到服务器上，所有玩家看到同一套。
//   而需求是「按玩家切换，我换不影响你」，所以必须走**运行时**：
//     ① public/js/data.js 的 `get()` 返回的是**未冻结的原始 JSON**（data.js 全文件无 freeze）⇒ 可写；
//     ② 宿主渲染时每次都从这份 manifest 现取 URL（assets.js 的 avatarUrl / chessPortraitUrl）
//        ⇒ 改完再让界面重渲染一次，立绘与头像就变了。
//
// ★ 重渲染怎么触发：loadout 屏订阅的是 loadoutStore；store.js 的 set() 每次生成**新对象**
//   ⇒ Object.is 必然不等 ⇒ 订阅者重渲染。所以 `set({ sel: 当前值 })` 就够了，
//   不需要碰宿主任何代码（和 loadout-io 用 setEntries 触发重渲染是同一手法）。
//
// ★ 覆盖范围：只改 chars[baseCharId] 的 4 个指针即可。assets.js / ui/assetUrls.js 对
//   `…_1`（精英0）、`…_2`（精英2）都会回落到 chars[baseCharId] 的 portrait / portraitE2，
//   所以改一处同时覆盖普通形态与金色形态。
//
// ★ 战斗小人（spine）：**随外部选择的时装切换**，但素材必须落在服务器上。
//   assets.js:201 的 validSpine 要求 skel 是 `/` 开头的同源路径 ⇒ 浏览器直连上游会被判非法
//   ⇒ 只能把整包 spine 落到本 Mod 的 <mod>/assets/ 下（`/assets/**` 会把 Mod 的 assets/ 当回退根，
//      已由 cyanfish.archetto-skin 实证）。
//   ★★ 另一个必须记住的点：validSpine **还要求 isObj(sp.anims)**（`assets.js:201`）。
//      `anims` 是从 .skel **解析出来的角色映射**（idle/deploy/attack/skill…），不是现成字段 ——
//      所以由 `tools/fetch-assets.mjs` 在下载后解析并写回数据表。
//      素材没装（hasSpine=false）或没解析出 anims ⇒ 这里不碰 spine，战斗里保持官方默认小人（优雅降级）。

import { preferred } from './mirrors.js';

/** 一条 JSON 里读出的皮肤记录（gen_skinvoice_data.mjs 产出）。 */
const KEYS = ['avatar', 'avatarE2', 'portrait', 'portraitE2'];

/**
 * 从 battle 记录里拼一个合法的 spine 朝向对象。
 * ★ 字段命名：正面 = `skel/atlas/textures/anims/…`，背面 = `back` + 首字母大写（`backSkel/backAnims/…`）。
 * @param {any} b 表里的 battle 记录
 * @param {boolean} back true = 取背面那一组
 */
function spineSide(b, back) {
  const f = (name) => b[back ? `back${name[0].toUpperCase()}${name.slice(1)}` : name];
  const skel = f('skel'), atlas = f('atlas'), textures = f('textures'), anims = f('anims');
  // ★ 三缺一都不行：skel/atlas 是 URL，anims 是 validSpine 的硬门槛。
  if (typeof skel !== 'string' || !skel || typeof atlas !== 'string' || !atlas) return null;
  if (!anims || typeof anims !== 'object') return null;
  const side = { skel, atlas, textures: Array.isArray(textures) ? textures : [], pma: false, anims };
  // 解析附带的附加表原样带上：宿主渲染要用 hits/events 触发打击点，bounds 定包围盒。
  for (const k of ['animations', 'events', 'hits', 'bounds']) {
    const v = f(k);
    if (v) side[k] = v;
  }
  return side;
}

/**
 * @param {{ api: any, cfg: any, table: any, log?: object, random?: () => number }} deps
 *   api   = hostApi；cfg = createConfig()；table = client/skinvoice.json
 *   random ★ 只给测试注入（默认 Math.random）—— 随机行为要能被单测钉死
 */
export function createSkinApplier({ api, cfg, table, log = console, random }) {
  /** @type {any} 材质清单（public/js/data.js 的 'assets'） */
  let manifest = null;
  /** 原值快照：charId -> { avatar, avatarE2, portrait, portraitE2, spine }，用于"恢复默认"。 */
  const base = new Map();

  /**
   * ★ 战斗小人素材**可得性**（本仓不含素材，玩家可能没跑 `tools/fetch-assets.mjs` 自取）。
   *   同源绝对路径（`/assets/**`）才探；**fail-open**：只有明确 404 才判缺失 ——
   *   网络错误 / 探不动（单测里没有服务器、相对 URL 解析失败）一律当作**可用**，
   *   避免把"探不动"误判成"没素材"而白白降级。同一会话内每 URL 只探一次。
   */
  const spineOk = new Map();
  async function spineAvailable(url) {
    if (typeof fetch !== 'function' || !url || !url.startsWith('/')) return true;
    if (spineOk.has(url)) return spineOk.get(url);
    let ok = true;
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (r.status === 404) ok = false;
    } catch { ok = true; }
    spineOk.set(url, ok);
    return ok;
  }

  /** 该干员的可选时装（数据表里已按官方排序号排好）。 */
  const optionsOf = (charId) => table?.operators?.[charId]?.skins || [];

  /** 按 id 找一条皮肤；不在表里返回 null。 */
  function skinOf(charId, skinId) {
    if (!skinId) return null;
    return optionsOf(charId).find((s) => s.id === skinId) || null;
  }

  /** 拿到材质清单并做一次原值快照。 */
  async function ensure() {
    if (manifest) return manifest;
    const m = await api.data.load('assets');
    if (!m || !m.chars) return null;
    manifest = m;
    for (const [id, rec] of Object.entries(m.chars)) {
      if (!rec || typeof rec !== 'object') continue;
      base.set(id, { avatar: rec.avatar, avatarE2: rec.avatarE2, portrait: rec.portrait, portraitE2: rec.portraitE2, spine: rec.spine });
    }
    return manifest;
  }

  /** 把某干员的记录恢复成官方默认。 */
  function resetRecord(rec, id) {
    const b = base.get(id);
    if (!b) return;
    for (const k of KEYS) rec[k] = b[k];
    rec.spine = b.spine;
  }

  /** 把一条皮肤写进记录。 */
  function applyRecord(rec, skin) {
    // ★ 立绘/头像先过一遍上游回退链的首选（默认反代，实测中位 0.5s vs 直连 3.0s）。
    //   万一首选也失败，mirrors.js 的全局捕获监听会把宿主这个 <img> 推到下一环。
    const up = (u) => (u ? preferred(u, cfg.get().mirror) : u);
    // 立绘与头像：四条指针都指到同一张时装图（普通/精英、正/背都由 assetUrls 回落）
    rec.avatar = up(skin.avatar);
    rec.avatarE2 = up(skin.avatar);
    rec.portrait = up(skin.portrait);
    rec.portraitE2 = up(skin.portrait);
    // 战斗小人（spine）：**与立绘同一条选择驱动**，没有独立开关。
    // ★ 用户口径：「皮肤和小人必须绑定」。退化条件 = `battle.hasSpine` 为假，或**运行时探到素材不在**
    //   （本仓不含素材，玩家没自取）—— 两者都是**素材状态**、不是用户选项。
    const b = skin.battle;
    if (!b || !b.hasSpine) return;
    const front = spineSide(b, false);
    if (!front) return;
    const back = spineSide(b, true);
    rec.spine = back ? { front, back } : { front };
  }

  /** 把配置里的全部皮肤写进 manifest（幂等：先全部恢复默认，再应用选中的）。 */
  async function applyAll() {
    const m = await ensure();
    if (!m) return false;
    const picked = cfg.get().skins || {};
    // ★ 先并行探一遍：选中的皮肤里"战斗小人素材到底在不在"（本仓不含素材，见文件头）。
    const need = [];
    for (const [id, rec] of Object.entries(m.chars)) {
      if (!rec || typeof rec !== 'object') continue;
      const skin = skinOf(id, picked[id]);
      const b = skin && skin.battle;
      if (b && b.hasSpine && b.skel) need.push(b.skel);
    }
    if (need.length) await Promise.all([...new Set(need)].map(spineAvailable));
    // 再逐条应用：探到素材缺失的那套**只换立绘/头像**，小人保持官方默认（优雅降级）。
    let n = 0;
    for (const [id, rec] of Object.entries(m.chars)) {
      if (!rec || typeof rec !== 'object') continue;
      resetRecord(rec, id);
      let skin = skinOf(id, picked[id]);
      if (!skin) continue;
      const b = skin.battle;
      if (b && b.hasSpine && b.skel && spineOk.get(b.skel) === false) {
        skin = { ...skin, battle: { ...b, hasSpine: false } };
        log.info?.(`[skinvoice] 战斗小人素材缺失，${id} 仅换立绘/头像（跑 tools/fetch-assets.mjs 自取）`);
      }
      applyRecord(rec, skin);
      n++;
    }
    log.info?.(`[skinvoice] 已应用 ${n} 名干员的皮肤`);
    return n;
  }

  /** 让界面重渲染（store.set 生成新对象 ⇒ 订阅者必然重渲染）。 */
  function rerender() {
    try {
      const cur = api.loadout.store.get();
      api.loadout.store.set({ sel: cur.sel ?? null });
    } catch (e) { log.warn?.('[skinvoice] 触发重渲染失败', e); }
  }

  /** 默认随机源（可注入以便测试）。 */
  const rand = typeof random === 'function' ? random : Math.random;

  /** 该干员的可选时装数（0 = 没有时装，随机时要**跳过、不报错**）。 */
  const optionsCount = (charId) => optionsOf(charId).length;

  return {
    ensure,
    optionsOf,
    optionsCount,
    skinOf,
    /** 改一个干员的皮肤（skinId=null 表示恢复官方默认）→ 立即生效。 */
    async choose(charId, skinId) {
      const skins = { ...(cfg.get().skins || {}) };
      if (skinId) skins[charId] = skinId; else delete skins[charId];
      cfg.set({ skins });
      await applyAll();
      rerender();
      return skinOf(charId, skinId);
    },
    /** 清空全部皮肤选择。 */
    async clear() {
      cfg.set({ skins: {}, randomKeys: [] });
      await applyAll();
      rerender();
    },
    /**
     * ★★ 更新②（局外那一半 +「每局开始时随机」共用的实现）：
     *   **为每一个"有时装可选"的干员**在**它自己的时装表里**随机抽一套，写进现有存储并立即生效。
     *
     * ★ 随机范围就是 `table.operators[charId].skins`（本 Mod 那张表里该干员已有的时装），
     *   不是"所有时装"、也不是官方另一套：`skins` 为空 / 缺 `skins` 字段的干员**直接跳过，不报错**
     *   （实测 112 名里 5 名没有时装）。
     * ★ 只在**至少两套**里抽才有意义：只有一套时"随机"恒等于那一套，仍然写进去（结果一致，但语义没错），
     *   返回的 changed 会把它算作"未变化"，界面据此显示"这次抽到的和上次一样"。
     * ★ 不动 `randomEachMatch`（那是开关，不是随机结果）；只写 `skins` + `randomKeys`。
     * @returns {Promise<{ n: number, skipped: number, changed: number, before: Record<string,string> }>}
     *   n      参与随机的干员数（= 有时装的干员数）
     *   skipped 没有时装、被跳过的干员数
     *   changed 结果与随机前**不同**的干员数
     *   before  随机前的 skins 快照（界面用它做「撤销随机」，不落盘）
     */
    async randomizeAll() {
      const operators = table?.operators || {};
      const before = { ...(cfg.get().skins || {}) };
      const next = { ...before };
      const keys = [];
      let n = 0, skipped = 0, changed = 0;
      for (const [charId, op] of Object.entries(operators)) {
        const opts = Array.isArray(op?.skins) ? op.skins : [];
        if (!opts.length) { skipped++; continue; }        // 「空的跳过，不要报错」
        const pick = opts[Math.min(opts.length - 1, Math.max(0, Math.floor(rand() * opts.length)))];
        const id = pick?.id;
        if (typeof id !== 'string' || !id) { skipped++; continue; } // 表脏了也不崩：当作没有可选时装
        n++;
        keys.push(charId);
        next[charId] = id;
        if (before[charId] !== id) changed++;
      }
      cfg.set({ skins: next, randomKeys: keys });
      await applyAll();
      rerender();
      log.info?.(`[skinvoice] 已为 ${n} 名干员随机皮肤（另有 ${skipped} 名没有可选时装、已跳过；其中 ${changed} 名与随机前不同）`);
      return { n, skipped, changed, before };
    },
    /** ★ 更新②：把「立即随机」的结果恢复成随机之前的选择（只还原被随机过的干员）。 */
    async restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      const cur = { ...(cfg.get().skins || {}) };
      const keys = cfg.get().randomKeys || [];
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(snapshot, k)) cur[k] = snapshot[k];
        else delete cur[k];
      }
      cfg.set({ skins: cur, randomKeys: [] });
      await applyAll();
      rerender();
      log.info?.(`[skinvoice] 已撤销上一次随机（还原 ${keys.length} 名干员的皮肤选择）`);
    },
    /** 启动时套用一次（数据可能还没下好 ⇒ 由 index.js 在数据就绪后调用）。 */
    applyAll,
    /** 让界面重渲染一次（改完 manifest 后必须调，否则界面还是旧图）。 */
    rerender,
    /** 已选皮肤数。 */
    count() { return Object.keys(cfg.get().skins || {}).length; },
    /** 战斗小人素材覆盖情况（设置页用来显示"素材未安装 ⇒ 只换立绘/头像"）。 */
    battleCount() {
      let withSpine = 0, total = 0;
      for (const o of Object.values(table?.operators || {})) {
        for (const s of o.skins || []) { total++; if (s.battle && s.battle.hasSpine) withSpine++; }
      }
      return { withSpine, total };
    },
  };
}
