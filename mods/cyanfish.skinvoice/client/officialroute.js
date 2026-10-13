// mods/cyanfish.skinvoice/client/officialroute.js — **把我们的语音整合进官方路线**（唯一一层：解析 / 供给）。
//
// ★★ 这一版（0.15.0，工序 48）的口径变化，逐条写在这里，因为它是本文件存在的全部理由：
//
//   服主原话：「**时装专属语音应保留**，但是其语音的**触发情况应整合进官方路线**。」
//   ⇒ 我们**不再自己播**：`new Audio()` 播放器、战斗事件流的触发时机、打断与归属判断、声道闸门
//     （`hostvoice.js`）、以及"把官方语音默认值写成 0"的 `officialvoice.js` **全部删除**。
//   ⇒ 我们只做一件事：**这套时装下、这个槽位该用哪份语音资源**。
//     播放时机 / 槽位 / 优先级 / 打断 / 音量 **100% 由官方 `public/js/audio.js` 负责**。
//
// ★ 为什么是"运行时改写官方表条目"而不是 L2 静态数据补丁（服主第一选择，实测**做不到**）：
//   官方解析链是 `audio.voice(charId, slot)` → `voiceLine(this.getManifest()?.audio, charId, slot, this.voiceLang)`
//   （`public/js/audio.js:905-921`，`voiceLine` 在同文件 :309）——
//   它解析的是 **`data/assets.json` 的 `audio.voice` / `audio.voiceJp`**（形如
//   `/assets/audio/voice/cn/<charId>/cn_0NN.mp3`，191 名干员 × 12 槽位；键就是 charId）。
//   实测（`node -e` 数过）：这张表**按 charId 索引，全文件 `skin` / `outfit` / `wordKey` 出现 0 次**
//   ⇒ 结构上**无法表达「哪套时装用哪套语音」**。
//   而"当前选的是哪套时装"是**玩家本机运行时的选择**（`sp.pref.skinvoice` 的 `skins`，只读本地
//   localStorage、按玩家各自不同）⇒ 数据补丁只能做**全局改**，做不了"当且仅当装了这套时装才换"。
//   ★ 所以取的是同一件事的运行时形态：改的仍然是**那一张表**（`data.get('assets')` 返回的那个对象，
//     `public/js/main.js:361` 就是 `installAudio({ getManifest: () => data.get('assets') })`），
//     只是改在内存里 ⇒ 与"宿主自己按官方表播"完全同构。**证据**：`data.js` 全程没有 `Object.freeze`
//     （文件里只有 `DATA_FILES` / `RETRY_DELAYS_MS` 两个常量被 freeze），`audio.voice()` 每次调用都
//     现取 `this.getManifest()`，**没有第二处缓存**；解码缓存（`audio._buffer`）按 URL 索引 ⇒ 换 URL 天然取新文件。
//
// ★★ 两件事，都只碰"该用哪份资源"这一层：
//   ★★ **0.17.0（阶段 0 · 第二半）这里只剩一件了**：原先还有 B) **单干员语音语种**
//      （官方只有全干员一档 `语音语言`，我们用一个极薄的解析层代理补"按干员"）。**那一整条轴已删除** ——
//      上游 0.2.3 原生实现了逐干员语音语言（`public/js/voicePrefs.js` 的 `VOICE_LANGS` / `voiceLangFor`
//      + `public/js/ui/operatorVoice.js`，存 `sp.pref.settings.voiceOverrides`），与本 Mod 那一档**逐点等价**；
//      两份并存时官方那份在 `voice()` **内层**读 `voiceOverrides`、我们的代理在**外层**临时改 `voiceLang`
//      ⇒ 10 格真值表里有 2 格我们的设置被**静默吃掉**（上游调研 `内部工序记录` §3.4）。
//      ⇒ 整条轴删除（`VOICE_MODES` / `voiceLangFor` / `installProxy` / `removeProxy` / `cfg.voices` /
//      `setVoice` / `VoiceControlView` / 该轴 UI 与 i18n 键），能力交回官方。
//   A) **时装专属语音**（18 套，`client/voice-extras.json`）：玩家选了带专属语音的时装 ⇒ 把这 12 个槽位在
//      官方表里的条目**指向自取装到服务器上的素材** `/assets/voice-skin/**`（宿主 `/assets/**` 会回落到各 Mod 的
//      `assets/`，与皮肤小人同一条路）。时装**没有**那条槽位 ⇒ **保留官方值**（逐槽位回落，绝不哑）。
//      ★ 官方没有覆盖这一维（`voiceLine(audio,charId,slot,lang)` 签名里没有 skin；`data/assets.json`
//        全文 `skin`/`outfit`/`dress` 各 0 次；`voicePrefs.js` 只认 charId；`operatorVoice.js` 无皮肤控件）
//        ⇒ **必须保留**，这也是本文件继续存在的唯一理由。
//
// ★★ 还原（两条，都必须逐字节）：
//   1. 换时装 / 清掉配置 / 停用 Mod ⇒ `restore()` 把 `audio.voice` 与 `audio.voiceJp` 的记录**按快照重建**
//      （含键的顺序：先 `delete` 全部键再按快照写回，所以反复切来切去也不会漂移）；
//   2. `dispose()` = restore + 清掉所有缓存（含 `manifestP`，免得下一次装载拿着旧 promise）。
//   ★ 0.17.0 起没有了"猴补丁代理"这一条：本文件**不再碰任何官方实例属性**（只读 `getManifest()`）。
//
// ★ 拿不到官方表 / 官方 audio 单例 ⇒ **安静降级**：一条都不改，官方照它自己的表播（= 不装本 Mod 的行为）。

/** 官方运行时语音表的两个语种分支，对应官方设置「语音语言」的两档（`ui/gameLogic/settings.js` 的 `VOICE_LANGS`）。 */
export const HOST_BANK_KEY = Object.freeze({ CN: 'voice', JP: 'voiceJp' });

/**
 * ★★ 官方基座那 **12 个战斗槽位**的权威名单（= `data/assets.json` → `audio.voice[charId]` 的键）。
 *   与上游 `tools/assets/audio.mjs` 的 `VOICE_BATTLE_SLOTS` 逐字相同；`client/voice-extras.json` 也按它索引。
 */
export const SKIN_SLOTS = Object.freeze(['start', 'faceEnemy', 'select', 'place',
  'skill1', 'skill2', 'skill3', 'skill4', 'resultFour', 'resultThree', 'resultTwo', 'resultLose']);

/** `client/voice-extras.json` 的默认地址。 */
export const EXTRAS_URL = '/mods/cyanfish.skinvoice/client/voice-extras.json';

/**
 * 建立「官方路线供给层」。
 *
 * ★★ 0.17.0：这里**只有时装专属语音**那条轴了。上游 0.2.3 原生提供逐干员语音语言
 *    （`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`）⇒ 我们那条"单干员语种"轴整条删除，
 *    本模块**不再读写任何官方实例属性 / 官方设置**（只读 `getManifest()` 拿那张语音表）。
 *
 * @param {{ cfg:any, log?:object, extrasUrl?:string, fetchFn?:Function, hostAudio?:any,
 *           getManifest?:Function, manifestGetter?:Function }} deps
 *   `cfg` 本 Mod 的配置（**只读**：`skins`）。
 *   `hostAudio` 官方 audio 单例（`/js/audio.js` 的 `audio`）；不给就自己 import —— 只为 `state()` 里
 *     "官方那一路在不在、当前全局语种是什么"这两条**只读内省**而留（拿不到不影响时装语音）。
 *   `getManifest` 注入官方材质清单（单测用）；否则依次问 `hostAudio.getManifest()` → `/js/data.js` 的
 *     `data.get('assets')`。★ 一路都拿不到 ⇒ 降级（不改表）。
 * @returns {{
 *   boot: () => Promise<any>, sync: () => number, restore: () => number, dispose: () => void,
 *   state: () => object, _bagOf: (charId:string, lang:string) => any, _counters: () => object,
 * }}
 */
export function createOfficialRoute({ cfg, log = console, extrasUrl = EXTRAS_URL, fetchFn = null, hostAudio = null,
  getManifest = null, manifestGetter = null } = {}) {
  const doFetch = fetchFn || ((...a) => globalThis.fetch(...a));

  // ---- 时装专属语音表（`client/voice-extras.json`）--------------------------------------------------
  let extras = null;
  let extrasP = null;
  const extrasReady = () => !!(extras && extras.skins && typeof extras.skins === 'object');

  function loadExtras() {
    if (extrasReady()) return Promise.resolve(extras);
    if (extrasP) return extrasP;
    extrasP = (async () => {
      try {
        // ★ `no-cache`（不是 `force-cache`）：`force-cache` = 用缓存且**不校验** ⇒ 这张表一旦被缓存就再也
        //   更新不了（0.11.1 踩过同一个坑）。这张表只有 ~50 KB，带 ETag 校验没变就是一次 304。
        const res = await doFetch(extrasUrl, { cache: 'no-cache' });
        if (res && res.ok) extras = await res.json();
        else log.warn?.(`[skinvoice] 时装专属语音表取不到（HTTP ${res?.status}）⇒ 时装语音不生效，官方语音照常`, extrasUrl);
      } catch (e) {
        log.warn?.('[skinvoice] 时装专属语音表载入失败 ⇒ 时装语音不生效，官方语音照常', e?.message || e);
      }
      return extras;
    })();
    return extrasP;
  }

  /** 当前玩家为这个干员选的时装 id（唯一真相 = 本 Mod 的配置；本模块**只读**它）。 */
  const skinIdOf = (charId) => {
    try { const s = cfg.get()?.skins; return (s && typeof s === 'object' ? s[charId] : null) || null; } catch { return null; }
  };

  /**
   * 该干员**当前时装**在指定语种下的专属语音包；没有 ⇒ null（调用方一律回落到官方值）。
   * @returns {Record<string, string[]>|null}
   */
  function bagOf(charId, lang) {
    if (!extrasReady()) return null;
    const id = skinIdOf(charId);
    if (!id) return null;
    const rec = extras.skins[id];
    const bag = rec && typeof rec === 'object' ? rec[lang || 'CN'] : null;
    return bag && typeof bag === 'object' ? bag : null;
  }

  // ---- 官方材质清单（`data/assets.json`）------------------------------------------------------------
  let manifest = null;
  let manifestP = null;
  function resolveManifest() {
    if (manifest) return Promise.resolve(manifest);
    if (manifestP) return manifestP;
    manifestP = (async () => {
      try {
        if (typeof getManifest === 'function') manifest = getManifest();
        if (!manifest && hostAudio && typeof hostAudio.getManifest === 'function') manifest = hostAudio.getManifest();
        if (!manifest && manifestGetter && typeof manifestGetter === 'function') manifest = manifestGetter();
        if (!manifest) {
          const d = await import(/* @vite-ignore */ '/js/data.js');
          manifest = d?.data?.get?.('assets') ?? null;
        }
      } catch { manifest = null; }
      // ★ 拿不到就**不要**把 promise 钉死：下一次 sync() 重新试（数据是异步到的）
      if (!manifest) manifestP = null;
      return manifest;
    })();
    return manifestP;
  }

  // ---- 官方 audio 单例（**只读内省**：`state().hasAudio` / `state().global`）----------------------------
  // ★★ 0.17.0：这里原来还有 `installProxy()` / `removeProxy()`（"单干员语种"猴补丁代理，会写
  //   `audio.voice` 与 `audio[ORIG_KEY]`）。那条轴整体删除后，本文件**不再碰官方实例的任何属性** ——
  //   保留这一个 getter 只为了让验收脚本 / Console 能读到"官方那一路在不在、当前全局语种是什么"。
  let audio = hostAudio;
  let audioP = null;
  function resolveAudio() {
    if (audio) return Promise.resolve(audio);
    if (audioP) return audioP;
    audioP = (async () => {
      try {
        const m = await import(/* @vite-ignore */ '/js/audio.js');
        audio = m?.audio ?? null;
      } catch { audio = null; }
      if (!audio) audioP = null;
      return audio;
    })();
    return audioP;
  }

  // ---- 官方表改写（时装专属语音）--------------------------------------------------------------------
  /**
   * charId → { CN?: {base, touched}, JP?: {...} }：我们**动手之前**那份记录的浅拷贝
   * （只整槽替换 / 删除，值都是数组引用再 slice，所以浅拷贝够用）。
   */
  const snap = new Map();
  /** 当前**真的**被我们改写过的 charId（`state()` 用它取证；不是判据）。 */
  let overlaid = new Set();

  /** 按快照把一个记录**逐键重建**（含键顺序）；返回是否动了它。 */
  function rebuild(rec, base) {
    let changed = false;
    for (const k of Object.keys(rec)) { if (!(k in base)) { delete rec[k]; changed = true; } }
    for (const [k, v] of Object.entries(base)) {
      if (rec[k] !== v) { rec[k] = v; changed = true; }
    }
    return changed;
  }

  /**
   * 把"当前选中的专属语音时装"写进官方运行时语音表。★ 幂等：每次都从快照**重建**再重放目标状态
   * （换时装 / 换语种 / 清配置 / 停用都走这里，反复切不会漂移）。
   *
   *   · 时装**有**这条槽位 ⇒ 指向自取装到服务器上的素材（`/assets/voice-skin/**`）
   *   · 时装**没有**这条槽位（或整体不适用：没选时装 / 那张时装没有专属语音）⇒ **保留官方值**（回落，不哑）
   *
   * ★ 两个语种分支**一起**写（`voice` 与 `voiceJp`）：官方全局档位可以在任意时刻切，两个分支都就位才不会
   *   出现"切到日文那一刻时装语音消失"。
   *
   * @returns {number} 生效的干员数（0 = 表已还原成官方状态）
   */
  function sync() {
    const banks = manifest?.audio;
    if (!banks || typeof banks !== 'object') { overlaid = new Set(); return 0; }
    let c = null;
    try { c = cfg.get(); } catch { return 0; }
    const skins = (c && typeof c.skins === 'object' && c.skins) || {};

    // 目标：charId → 该时装在 CN / JP 下的语音包（有专属语音才进这张表）
    const want = new Map();
    if (extrasReady()) {
      for (const charId of Object.keys(skins)) {
        if (!skinIdOf(charId)) continue;
        const cn = bagOf(charId, 'CN');
        const jp = bagOf(charId, 'JP');
        if (cn || jp) want.set(charId, { CN: cn, JP: jp });
      }
    }

    let n = 0;
    const next = new Set();
    // 目标 ∪ 需要收尾的（上标改过但这次不再改的）
    for (const charId of new Set([...want.keys(), ...snap.keys()])) {
      const bags = want.get(charId) || null;
      let touchedThis = false;
      for (const lang of Object.keys(HOST_BANK_KEY)) {
        const bank = banks[HOST_BANK_KEY[lang]];
        if (!bank || typeof bank !== 'object') continue;
        const rec = bank[charId];
        if (!rec || typeof rec !== 'object') continue;         // 官方表里没这个干员 ⇒ 不改（也不凭空造）
        // ★ 快照**无条件**拍（第一次碰到这个记录时）：留一份"官方原值"是还原的唯一依据；
        //   它同时是"每次从官方值重建"的起点 ⇒ 反复切时装/语种不会漂移。
        if (!snap.has(charId)) snap.set(charId, {});
        if (!snap.get(charId)[lang]) snap.get(charId)[lang] = { base: { ...rec } };
        const base = snap.get(charId)[lang].base;
        // 先按快照重建（幂等的关键：每次从官方值出发）
        rebuild(rec, base);
        const bag = bags ? bags[lang] : null;
        if (!bag) continue;                                    // 这次不改这个语种 ⇒ 停在官方值
        for (const slot of SKIN_SLOTS) {
          const arr = Array.isArray(bag[slot]) ? bag[slot].filter((u) => typeof u === 'string' && u) : null;
          if (!arr || !arr.length) continue;                   // 时装没这条 ⇒ 保留官方（回落，不哑）
          rec[slot] = arr.slice();
          touchedThis = true;
        }
      }
      if (touchedThis) { next.add(charId); n++; }
      // ★ 这次一条都没改 ⇒ 表已经（在 rebuild 里）还原了；**快照留着不动**：它是"官方原值"的唯一记录，
      //   删掉它并不会让内存更干净，反而让 dispose() 少一层兜底。
    }
    overlaid = next;
    return n;
  }

  /**
   * 把官方两个语音表**还原**成我们动手前的样子（逐键重建 ⇒ 含键顺序）。
   * @returns {number} 被还原的记录数
   */
  function restore() {
    let n = 0;
    const banks = manifest?.audio;
    if (banks && typeof banks === 'object') {
      for (const [charId, langs] of snap) {
        for (const [lang, snapRec] of Object.entries(langs)) {
          const bank = banks[HOST_BANK_KEY[lang]];
          const rec = bank && typeof bank === 'object' ? bank[charId] : null;
          if (!rec || typeof rec !== 'object') continue;
          if (rebuild(rec, snapRec.base)) n += 1;
        }
      }
    }
    snap.clear();
    overlaid = new Set();
    return n;
  }

  return {
    /** 取表 + 取官方单例（只读内省用）+ 写一次。可重复调用（幂等）。 */
    async boot() {
      await loadExtras();
      await resolveManifest();
      await resolveAudio();
      sync();
      return this.state();
    },
    sync, restore,
    dispose() {
      try { restore(); } catch { /* ignore */ }
      manifest = null;
      manifestP = null;
      extras = null;
      extrasP = null;
      snap.clear();
      overlaid = new Set();
    },
    /** 只读自省（验收脚本 / 控制台自查；不参与任何判断）。 */
    state() {
      let global = null;
      try { global = audio?.voiceLang ?? null; } catch { /* ignore */ }
      return {
        hasAudio: !!audio, hasManifest: !!manifest, extrasReady: extrasReady(),
        overlaid: [...overlaid], snapKeys: [...snap.keys()], global,
        banks: Object.keys(HOST_BANK_KEY),
      };
    },
    _bagOf: bagOf,
    _counters: () => ({ overlaid: overlaid.size }),
    _overlaid: () => [...overlaid],
    _snapKeys: () => [...snap.keys()],
  };
}
