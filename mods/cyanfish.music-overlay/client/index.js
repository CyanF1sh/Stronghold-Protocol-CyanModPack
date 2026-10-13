// mods/cyanfish.music-overlay/client/index.js —— 「音效替换」的界面侧（L4 轴）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → GET /mods → import(本文件) → setup(hostApi) → 返回的 dispose 由宿主保管。
//
// 干四件事：
//   ① 读游戏自己的素材清单（`data/assets.json` 的 audio 块）→ 枚举出「除干员语音外的全部可替换音频」（catalog.js）；
//   ② 读本机配置（总开关 + 哪些条目被替换）与玩家上传的音频（IndexedDB）（store.js）；
//   ③ **一处同步**（rebuild）：按配置 + 已上传文件重建「URL → 玩家音频」的替换表，交给 bridge.js；
//   ④ 往「模组设置」交一栏「音效替换」（section.js）。
//
// ★★ 四条实现纪律（与 cyanfish.demo / cyanfish.dj-bgm 同款，都踩得到）：
//   1. **setup 必须立刻返回、不能 await**：宿主是 `for(…){ await setup(…) }` 顺序装载的，在这里 await 会把
//      排在后面的 Mod 全卡住 ⇒ 真流程挂 `void run(api).catch(…)`。
//   2. **返回值只能是同步的 dispose 函数**（不是 Promise）：宿主靠它把我们注册的栏位、包装的音频漏斗、
//      订阅与试听元素**全部**收干净。
//   3. **拿不到清单 / 没有可替换项 / 拿不到音频单例 ⇒ 零痕迹**：不注册栏位、不包装宿主、不注入样式、不出声。
//   4. **绝不抛**：所有路径 try/catch，失败只留一条 warn（规范 §1.3）。
//
// ★ 唯一的非正式依赖 = `/js/audio.js` 的 audio 单例（与 dj-bgm / skinvoice 同一条路）。
//   本 Mod 在它的私有方法 `_buffer` 上做**运行时包装**（不改宿主源码、可完全还原）—— 见 bridge.js 文件头。

import { buildCatalog } from './catalog.js';
import { createConfig, createClipStore } from './store.js';
import { createAudioBridge } from './bridge.js';
import { createPreview } from './preview.js';
import { MusicOverlaySection, SECTION_ID, SECTION_ORDER } from './section.js';
import { settingsRegistry } from './registry.js';

const MOD_ID = 'cyanfish.music-overlay';
/** 真机 / Console 自查用的全局句柄（dispose 时删掉，不留痕迹）。 */
export const DEBUG_KEY = '__SP_MUSICOVERLAY__';

/** 当前这一"代"的运行时（run() 异步填进来；setup 早就返回了）。 */
let live = null;
/** 自增代数：run() 还没跑完就被 dispose 时靠它判断"别发布了"。 */
let generation = 0;

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / data / log / mod …）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 2）
 */
export default function setup(api) {
  const gen = ++generation;
  try {
    void run(api, gen).catch((e) => api?.log?.warn?.(`[${MOD_ID}] 装载失败（忽略）`, e?.message || e));
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 初始化失败（忽略）`, e?.message || e);
  }
  return () => {
    generation++;                       // 让还在飞的 run() 作废
    try { live?.dispose(); } catch (e) { api?.log?.warn?.(`[${MOD_ID}] 卸载出错（忽略）`, e?.message || e); }
    live = null;
    try { delete globalThis[DEBUG_KEY]; } catch { /* ignore */ }
  };
}

/**
 * 真正的流程（不阻塞宿主）。任何一步失败都只留一条 warn，绝不抛。
 * @param {object} api
 * @param {number} gen
 */
async function run(api, gen) {
  const log = api?.log || console;

  const manifest = await loadAssets(api);
  if (gen !== generation) return;
  const charNames = buildCharNames(await loadChess(api));
  if (gen !== generation) return;

  const catalog = buildCatalog(manifest, { charNames });
  if (!catalog.entries.length) {                                   // 纪律 3：没得换 ⇒ 零痕迹
    log.info?.(`[${MOD_ID}] 素材清单里没有可替换的音频 ⇒ 不注册设置栏位、不碰宿主音频`);
    return;
  }

  const cfg = createConfig({ log });
  const clips = createClipStore({ log });
  const bridge = createAudioBridge({ log });
  const preview = createPreview({ log });

  const loaded = await clips.load();                               // 读回玩家已上传的音频
  if (gen !== generation) { clips.dispose(); preview.dispose(); return; }
  const audioState = await bridge.boot();                          // 拿宿主 audio 单例
  if (gen !== generation) { clips.dispose(); preview.dispose(); bridge.dispose(); return; }
  const installed = bridge.install();                             // 装上替换漏斗
  if (!installed) {                                               // 拿不到音频通道 ⇒ 零痕迹（不摆无效界面）
    log.warn?.(`[${MOD_ID}] 拿不到宿主音频通道 ⇒ 本 Mod 不生效（不会双播、也不出声）`);
    clips.dispose(); preview.dispose(); bridge.dispose();
    return;
  }

  let disposed = false;
  const offs = [];
  let disposeSection = null;

  /** 收尾：退订、还原音频漏斗、停试听、关数据库、摘栏位。**幂等**。 */
  function teardown() {
    if (disposed) return;
    disposed = true;
    for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
    try { disposeSection?.(); } catch { /* ignore */ }            // ★ 先摘界面，免得它读到已废的 store
    disposeSection = null;
    try { bridge.dispose(); } catch { /* ignore */ }              // ★ 摘掉 `_buffer` 包装，不留半套替换
    try { preview.dispose(); } catch { /* ignore */ }
    try { clips.dispose(); } catch { /* ignore */ }
  }

  /**
   * ★★ 唯一的那条同步：替换表 ⊆ (本机配置 + IndexedDB 里确实存在的音频)。
   * 幂等 —— 表没变时 bridge.setMap 内部会保留已解码的缓冲，不会重复解码。
   */
  function rebuild() {
    if (disposed) return;
    const map = new Map();
    try {
      const c = cfg.get();
      const targets = c.targets || {};
      if (c.on === true) {
        for (const e of catalog.entries) {
          if (targets[e.id] !== true) continue;
          const rec = clips.get(e.id);
          if (!rec || !rec.blob) continue;                        // Blob 丢了 ⇒ 当没替换（store.js 的一致性口径）
          map.set(e.url, { blob: rec.blob });
          // ★ 长音效（背景音乐）：连它的官方前奏一起跳过，免得「官方前奏 + 你的曲子」拼在一起
          if (e.kind === 'long' && e.introUrl) map.set(e.introUrl, { mute: true });
        }
      }
    } catch (e) { log.warn?.(`[${MOD_ID}] 重建替换表出错（忽略）`, e?.message || e); }
    bridge.setMap(map);
  }

  // ---- 订阅（配置 / 上传文件一变就重建替换表） ------------------------------------------------------
  try { offs.push(cfg.subscribe(() => rebuild())); } catch (e) { log.warn?.(`[${MOD_ID}] 订阅配置失败（忽略）`, e?.message || e); }
  try { offs.push(clips.subscribe(() => rebuild())); } catch (e) { log.warn?.(`[${MOD_ID}] 订阅音频仓库失败（忽略）`, e?.message || e); }
  if (gen !== generation) { teardown(); return; }

  // ---- 交一栏「音效替换」给「模组设置」 ------------------------------------------------------------
  try {
    const reg = settingsRegistry();
    if (reg && typeof reg.register === 'function') {
      disposeSection = reg.register({
        id: SECTION_ID,
        title: '音效替换',
        order: SECTION_ORDER,
        // ★ 不传 micro：栏位列表里只留中文名（英文 eyebrow 一律清掉）
        render: () => api.ui.html`<${MusicOverlaySection} api=${api} cfg=${cfg} clips=${clips} catalog=${catalog} preview=${preview} version=${api?.mod?.version} audioOk=${true} />`,
      });
      log.info?.(`[${MOD_ID}] 已在「模组设置」注册「音效替换」栏位（${catalog.counts.total} 条可选）`);
    }
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 注册设置栏位失败（忽略）`, e?.message || e);
  }

  // ---- 第一次同步 + 发布 -------------------------------------------------------------------------
  rebuild();
  live = { cfg, clips, bridge, preview, catalog, rebuild, teardown, dispose: () => { generation++; teardown(); } };
  globalThis[DEBUG_KEY] = {
    modId: MOD_ID,
    version: api?.mod?.version ?? null,
    catalog,
    counts: catalog.counts,
    cfg, clips, bridge,
    rebuild,
    state: () => ({
      config: cfg.state(),
      clips: clips.size(),
      persisted: clips.persisted(),
      audio: bridge.state(),
      loaded,
    }),
  };
  log.info?.(`[${MOD_ID}] 就绪（可替换 ${catalog.counts.total} 条 · 已上传 ${clips.size()} · 音频通道 `
    + `${audioState.hasAudio ? '可用' : '不可用'}）`);
}

/** 读游戏素材清单（`data/assets.json`）：优先用宿主的 data store，拿不到就直接取文件。 */
async function loadAssets(api) {
  try {
    const m = api?.data?.get?.('assets');
    if (m && typeof m === 'object' && m.audio) return m;
  } catch { /* fallthrough */ }
  try {
    const res = await globalThis.fetch?.('/data/assets.json', { cache: 'no-cache' });
    if (res && res.ok) return await res.json();
  } catch { /* ignore */ }
  return null;
}

/** 读干员表（`data/chess.json`）—— 用来把 charId 换成中文显示名。拿不到就返回 null（退回用 id）。 */
async function loadChess(api) {
  try {
    const c = api?.data?.get?.('chess');
    if (c) return c;
  } catch { /* fallthrough */ }
  try {
    const res = await globalThis.fetch?.('/data/chess.json', { cache: 'no-cache' });
    if (res && res.ok) return await res.json();
  } catch { /* ignore */ }
  return null;
}

/**
 * 从 chess.json 建 `charId → 干员显示名`（同名取第一条）。
 * @param {any} chess 对象或数组
 * @returns {Map<string,string>}
 */
function buildCharNames(chess) {
  const map = new Map();
  try {
    const rows = Array.isArray(chess) ? chess : (chess && typeof chess === 'object' ? Object.values(chess) : []);
    for (const rec of rows) {
      if (!rec || typeof rec !== 'object') continue;
      const id = rec.charId;
      const nm = rec.name;
      if (typeof id === 'string' && id && typeof nm === 'string' && nm && !map.has(id)) map.set(id, nm);
    }
  } catch { /* ignore */ }
  return map;
}
