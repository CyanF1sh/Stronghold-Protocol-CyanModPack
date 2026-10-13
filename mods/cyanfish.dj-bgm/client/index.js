// mods/cyanfish.dj-bgm/client/index.js — 「背景音乐覆盖（DJ 版）」的界面侧（L4）。
//
// 装载方是 public/js/ui/extensions.js 的 loadClientMods()：
//   页面启动 → GET /mods → import(本文件) → setup(hostApi)
//
// 干三件事：
//   ① 读清单（client/bgm.json）与本机选择（sp.pref.djbgm）；
//   ② **一处同步**（sync）：按"开关 + 选中曲目"决定
//        · hostbgm.js —— 选中曲子时把宿主 BGM 声道压到 0，否则还原成玩家滑杆值；
//        · player.js  —— 放我们那首（循环）/ 停掉，并把音量与静音档对齐官方设置；
//   ③ 往「模组设置」交一栏「背景音乐」（开关 + 曲目下拉；**没有音量控件**，见 section.js 文件头）。
//
// ★★ 只有一个订阅者、一条同步函数（这是本 Mod 最关键的时序设计）：
//   宿主 `ui/settings.js:27-30` 每次设置变化都会 `audio.setVolumes(s)`，把 bgm **写回滑杆值** ——
//   会把我们写进去的 `bgm: 0` 冲掉。所以我们必须订阅 settingsStore，并且**注册在宿主那个订阅者之后**
//   （store.js:38-42 按注册顺序同步回调；宿主那个在 ui/settings.js 模块求值时就注册了 —— main.js:48 的
//   import 早于 main.js:376 的 loadClientMods ⇒ 我们永远晚于它，同一次通知里我们**后写**，稳赢）。
//   ★ 把"压宿主 + 调音量 + 放/停"收在**同一条** sync 里，是因为它们必须一起变：
//     先压住宿主再放我们那首（否则会有一瞬间两首一起响）；切回官方档则先停我们的、再还原宿主。
//
// ★★ 四条实现纪律（与 cyanfish.announce 同款，都踩得到）：
//   1. setup 必须立刻返回、不能 await：extensions.js 是 `for(...){ await setup(...) }` 顺序装载的，
//      在这里 await 会把排在后面的 Mod 全卡住。
//   2. 返回值只能是"同步的"（一个 dispose 函数，不是 Promise）：宿主 `unloadClientMods()` 要靠它把我们
//      的订阅、栏位、<audio> 元素、以及对宿主 BGM 的压制**全部**收干净。
//   3. 拿不到清单 / 清单为空 ⇒ **零痕迹**：不注册栏位、不注入样式、不压宿主、不出声。
//   4. 绝不抛：所有路径 try/catch，失败只留一条 warn（规范 §1.3 约束 2 / §6.6）。
//
// ★ 拿不到 /js/audio.js ⇒ **静默降级**（本 Mod 的选择，写清楚）：不压宿主、也**不放我们那首**。
//   理由：压不住宿主就一定会**双播**（我们那首 + 官方那首同时响），那比"什么都不做"糟糕得多；
//   "什么都不做"= 官方 BGM 原样播，与没装本 Mod 完全一致，是唯一体面的降级。

import { loadManifest } from './manifest.js';
import { createConfig } from './config.js';
import { createHostBgmGate } from './hostbgm.js';
import { createPlayer } from './player.js';
import { BgmSection, FOLLOW_OFFICIAL } from './section.js';
import { settingsRegistry } from './registry.js';

const MOD_ID = 'cyanfish.dj-bgm';
/** 注册进「模组设置」的栏位 id。 */
const SECTION_KEY = 'dj-bgm';
/** 栏位排序：皮肤与语音 20、公告 60 —— 本栏位紧跟在皮肤语音之后。 */
const SECTION_ORDER = 30;
/** 拿不到 settingsStore 时的兜底轮询间隔（ms）：只在这条降级路径上开，正常路径一个定时器都没有。 */
const FALLBACK_POLL_MS = 1000;
/** 真机 / Console 自查用的全局句柄（dispose 时删掉，不留痕迹）。 */
export const DEBUG_KEY = '__SP_DJBGM__';

/** 当前这一"代"的运行时（run() 异步填进来；setup 早就返回了）。 */
let live = null;
/** 自增代数：run() 还没跑完就被 dispose 时靠它判断"别发布了"。 */
let generation = 0;

/**
 * Mod 入口。由 ui/extensions.js 调用一次。
 * @param {object} api 宿主 API（ui / slots / log / mod …）
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
  const manifest = await loadManifest({ log });
  if (gen !== generation) return;                                  // 期间被卸载了
  if (!manifest.tracks.length) {                                   // 没曲目 ⇒ 零痕迹（纪律 3）
    log.info?.(`[${MOD_ID}] 清单里没有可用曲目 ⇒ 不注册设置栏位、不碰宿主 BGM`);
    return;
  }

  const validIds = new Set(manifest.tracks.map((t) => t.id));
  const cfg = createConfig({ log, validIds, defaultId: manifest.defaultId });
  const gate = createHostBgmGate({ log });
  const player = createPlayer({ log });

  // 宿主设置 store（音量 / 静音档的唯一来源）。★ 先拿到它再第一次 sync，免得第一次同步读到空值。
  let store = null;
  try {
    const s = await import(/* @vite-ignore */ '/js/ui/settings.js');
    store = s?.settingsStore || null;
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 拿不到 /js/ui/settings.js 的 settingsStore ⇒ 音量改从 localStorage 现读`, e?.message || e);
  }
  // 等宿主 audio 单例就位再第一次同步：让"压宿主"与"放我们那首"落在同一次里（见文件头）。
  await gate.boot();
  if (gen !== generation) { gate.dispose(); player.dispose(); return; }

  let disposed = false;
  const offs = [];
  let timer = null;
  let disposeSection = null;

  /** 收尾：停我们的、还原宿主、退订、清定时器、摘栏位。**幂等**（跑一半被卸载也能安全调到）。 */
  function teardown() {
    if (disposed) return;
    disposed = true;
    for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
    if (timer != null) { try { globalThis.clearInterval?.(timer); } catch { /* ignore */ } timer = null; }
    try { player.dispose(); } catch { /* ignore */ }
    try { gate.dispose(); } catch { /* ignore */ }                // ★ 不留下"宿主被静音"的状态
    try { disposeSection?.(); } catch { /* ignore */ }
    disposeSection = null;
  }

  /** 官方设置里的音量与静音档（store → localStorage → 宿主默认值）。 */
  function readSettings() {
    let volume = null;
    let muted = null;
    try {
      const s = store?.get?.();
      if (s && Number.isFinite(s.bgm)) volume = Math.max(0, Math.min(1, s.bgm));
      if (s && typeof s.muted === 'boolean') muted = s.muted;
    } catch { /* ignore */ }
    if (volume === null) volume = gate.baseBgm();                  // 没有 store 时 gate 自己会退到 localStorage
    if (muted === null) muted = readLocalMuted();
    return { volume, muted };
  }

  /**
   * ★★ 唯一的那条同步：宿主 BGM 声道 / 我们的播放状态 ⊆ (本 Mod 选择 + 官方设置)。
   * 幂等 —— 状态没变时 hostbgm.js / player.js 内部都不会碰宿主或 DOM。
   */
  function sync() {
    if (disposed) return;
    let c = { on: true, track: '' };
    try { c = cfg.get() || c; } catch { /* ignore */ }
    const track = c.on === true && c.track && c.track !== FOLLOW_OFFICIAL
      ? (manifest.tracks.find((t) => t.id === c.track) || null)
      : null;

    // ① 压住宿主 BGM 才放我们那首（拿不到 audio 单例 ⇒ setMuted 恒 false ⇒ 走 else，静默降级不出声）
    if (track && gate.setMuted(true)) player.play(track.url);
    else { player.stop(); gate.setMuted(false); }

    // ② 音量 / 静音档永远对齐官方设置（放最后：player.play() 可能刚创建出元素）
    const s = readSettings();
    player.follow({ volume: s.volume, muted: s.muted });
  }

  // ---- 订阅（宿主那个订阅者早已注册 ⇒ 我们在同一次通知里后写，稳赢） ----------------------------
  try {
    if (store?.subscribe) offs.push(store.subscribe(() => sync()));
  } catch (e) { log.warn?.(`[${MOD_ID}] 订阅宿主设置失败（忽略）`, e?.message || e); }
  if (gen !== generation) { teardown(); return; }
  offs.push(cfg.subscribe(() => sync()));

  // 拿不到 settingsStore 的兜底：1s 轮询一次，让滑杆变化最多晚 1s 跟上（正常路径不跑）
  if (!store) {
    try { timer = globalThis.setInterval?.(() => sync(), FALLBACK_POLL_MS) ?? null; } catch { timer = null; }
  }

  // ---- 交一栏「背景音乐」给「模组设置」 -----------------------------------------------------------
  try {
    const reg = settingsRegistry();
    if (reg && typeof reg.register === 'function') {
      disposeSection = reg.register({
        id: SECTION_KEY,
        title: '背景音乐',
        order: SECTION_ORDER,
        // ★ 不传 micro：栏位列表里只留中文名（用户口径：英文 eyebrow 一律清掉）
        render: () => api.ui.html`<${BgmSection} api=${api} cfg=${cfg} tracks=${manifest.tracks} version=${api?.mod?.version} />`,
      });
      log.info?.(`[${MOD_ID}] 已在「模组设置」注册「背景音乐」栏位（${manifest.tracks.length} 首可选）`);
    }
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 注册设置栏位失败（忽略；覆盖逻辑照常）`, e?.message || e);
  }

  // ---- 第一次同步 + 发布 -------------------------------------------------------------------------
  sync();
  live = { cfg, gate, player, manifest, sync, teardown, dispose: () => { generation++; teardown(); } };
  globalThis[DEBUG_KEY] = {
    modId: MOD_ID,
    version: api?.mod?.version ?? null,
    config: cfg,
    manifest,
    sync,
    state: () => ({
      config: cfg.get(),
      trackUrl: currentTrackUrl(),
      gate: gate.state(),
      player: player.state(),
    }),
  };
  log.info?.(`[${MOD_ID}] 就绪（${manifest.tracks.length} 首可选；宿主 audio 单例 `
    + `${gate.state().hasAudio ? '可用' : '不可用 ⇒ 静默降级：不出声也不压宿主'}）`);

  /** 当前真正在放的那条 URL（没有则 null）——给内省句柄用。 */
  function currentTrackUrl() {
    try {
      const c = cfg.get();
      if (!c?.on || !c.track) return null;
      return manifest.tracks.find((t) => t.id === c.track)?.url ?? null;
    } catch { return null; }
  }
}

/** 宿主「静音」档的 localStorage 兜底（`sp.pref.settings`.muted）—— 只在拿不到 settingsStore 时用。 */
function readLocalMuted() {
  try {
    const raw = globalThis.localStorage?.getItem('sp.pref.settings');
    const v = raw ? JSON.parse(raw)?.muted : null;
    if (typeof v === 'boolean') return v;
  } catch { /* ignore */ }
  return false;
}
