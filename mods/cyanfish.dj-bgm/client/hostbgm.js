// mods/cyanfish.dj-bgm/client/hostbgm.js — 把**宿主自己的那一路 BGM** 压掉 / 还原（选了我们那首时）。
//
// ★★ 为什么需要它：宿主 public/js/audio.js 的 AudioManager 会用 Web Audio 播它自己的 BGM
//   （`playBgm(key)` → `bgmGain`，audio.js:605 的 `bgm ** 2 * 0.55`）。我们另外用一个 <audio> 元素放
//   自己那首 ⇒ 不压宿主那一路就是**两首曲子同时响**。所以选中曲目时必须把宿主那一路压到 0。
//
// ★ 用宿主**现成的公开方法**，不猴补丁（这是本 Mod 最重要的实现约束）：
//   `AudioManager.setVolumes({...})` 是 audio.js:584-597 的公开方法（有 JSDoc），而且**只合并给定的键**：
//     n(v?.bgm, this.volumes.bgm) …  ⇒  只传 { bgm: 0 } 时 sfx / voice / muted 一个都不动。
//   为什么不动 muted：那是玩家的「静音」档，属于官方设置；我们只借 bgm 这一个键，
//   玩家静音时靠 <audio>.muted 自己静音（见 player.js），**绝不**替玩家改 muted。
//   ★ 由此得到「与 cyanfish.skinvoice 互不干扰」：它压的是 voice（hostvoice.js），我们压的是 bgm，
//     两个键在同一次 setVolumes 里合并、各写各的，谁也不覆盖谁（真机证据见报告第 ④ 节）。
//
// ★ 怎么拿到那个单例：动态 `import('/js/audio.js')`。宿主 main.js:47 也是 import 这个 URL，
//   ES 模块按 URL 去重 ⇒ 拿到的是**同一个** AudioManager 实例（不会 new 出第二个）。
//   拿不到（静态托管 / 老服务器 / 模块改名）⇒ `hasAudio` 为 false，调用方要**静默降级**：
//   既不压宿主、也不放我们那首（宁可不出声，也不要两首 BGM 一起响）。
//
// ★★ 「后写覆盖」的时序（与 skinvoice 的 hostvoice.js 同一套推理，同样是本 Mod 能成立的前提）：
//   宿主 `public/js/ui/settings.js:27-30` 每次设置变化都会 `audio.setVolumes(s)` —— 把 bgm **写回滑杆值**。
//   所以玩家在覆盖档下动任何设置，都会把我们写进去的 `bgm: 0` 冲掉。
//   ⇒ 调用方（index.js）必须订阅 settingsStore，并且**注册在宿主那个订阅者之后**：
//     store.js:38-42 的订阅者是按注册顺序**同步**回调的，宿主那个订阅者在 `ui/settings.js` 模块求值时
//     就注册了（main.js:48 的 import 早于 main.js:376 的 loadClientMods），我们的晚于它
//     ⇒ 同一次通知里我们**后**写，稳赢。
//   ★ 本模块**自己不订阅**：订阅是调用方的事（一个订阅者、一条同步函数，时序只有一个去处，好验）。

/** 宿主设置在 localStorage 的键（`ui/settings.js:21` 的 `loadPref('settings')` ⇒ `sp.pref.settings`）。 */
export const HOST_SETTINGS_KEY = 'sp.pref.settings';
/** 宿主默认 BGM 音量（`ui/gameLogic/settings.js:10` DEFAULT_SETTINGS.bgm）—— 只在读不到任何来源时兜底。 */
export const HOST_DEFAULT_BGM = 0.6;

/**
 * @param {{ log?:object, load?:(url:string)=>Promise<any> }} [deps]
 *   `load` 可注入（单测 / 仿真用假宿主模块）；默认动态 import。
 * @returns {{ boot:()=>Promise<any>, setMuted:(want:boolean)=>boolean, restore:()=>boolean,
 *   dispose:()=>void, baseBgm:()=>number, state:()=>object }}
 */
export function createHostBgmGate({ log = console, load = null } = {}) {
  const doLoad = load || ((u) => import(/* @vite-ignore */ u));
  let audio = null;
  let settingsStore = null;
  let booting = null;
  let bootFailed = false;
  /** 我们现在是不是正压着宿主的 BGM 声道。 */
  let muted = false;
  /** 压之前那个音量（还原兜底；正常情况下从 settingsStore / localStorage 现读）。 */
  let saved = null;

  const warn = (msg, e) => { try { log.warn?.(`[dj-bgm] ${msg}`, e?.message || e || ''); } catch { /* ignore */ } };

  /** 宿主此刻"应该"的 BGM 音量（设置store → localStorage → 压制前保存值 → 宿主默认值）。 */
  function baseBgm() {
    try {
      const v = settingsStore?.get?.()?.bgm;
      if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
    } catch { /* ignore */ }
    try {
      const raw = globalThis.localStorage?.getItem(HOST_SETTINGS_KEY);
      const v = raw ? JSON.parse(raw)?.bgm : null;
      if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
    } catch { /* ignore */ }
    if (Number.isFinite(saved)) return saved;
    return HOST_DEFAULT_BGM;
  }

  /** 载入宿主的 audio 单例与 settingsStore（只跑一次；失败也不抛）。 */
  function boot() {
    if (booting) return booting;
    booting = (async () => {
      try {
        const m = await doLoad('/js/audio.js');
        audio = m?.audio && typeof m.audio.setVolumes === 'function' ? m.audio : null;
        if (!audio) warn('宿主 /js/audio.js 没有导出可用的 audio 单例 ⇒ 不压宿主 BGM，也不放我们那首（避免双播）');
      } catch (e) {
        warn('拿不到宿主 /js/audio.js ⇒ 不压宿主 BGM，也不放我们那首（避免双播）', e);
      }
      try {
        const s = await doLoad('/js/ui/settings.js');
        settingsStore = s?.settingsStore || null;
      } catch { /* 只用 localStorage 兜底 */ }
      if (!settingsStore) warn('拿不到 /js/ui/settings.js 的 settingsStore ⇒ 音量只能从 localStorage 现读（滑杆不再实时跟随）');
      return { hasAudio: !!audio, hasSettings: !!settingsStore };
    })();
    return booting;
  }

  /**
   * 把宿主 BGM 声道对齐到「要不要压」。**幂等**：状态没变就一次都不碰宿主。
   * @param {boolean} want true = 压到 0（我们自己在放）；false = 还原成玩家滑杆值
   * @returns {boolean} 现在是不是"正压着"
   */
  function setMuted(want) {
    if (!audio) {
      if (bootFailed) return false;
      void boot().then((r) => { if (r?.hasAudio) setMuted(want); else bootFailed = true; });
      return false;
    }
    if (want) {
      if (!muted) saved = baseBgm();
      muted = true;
      // setVolumes 只合并给定的键（audio.js:588-597）⇒ sfx/voice/muted 原样不动
      try { audio.setVolumes({ bgm: 0 }); } catch (e) { warn('压制宿主 BGM 失败', e); }
      return true;
    }
    if (muted) {
      muted = false;
      try { audio.setVolumes({ bgm: baseBgm() }); } catch (e) { warn('还原宿主 BGM 失败', e); }
    }
    return false;
  }

  /** 无条件还原一次（幂等；没在压时是彻底的空操作）。dispose 用它。 */
  function restore() { return setMuted(false); }

  /** 卸载：还原宿主音量 —— 不留「Mod 走了但宿主被静音」的状态。 */
  function dispose() {
    if (muted) {
      muted = false;
      try { audio?.setVolumes?.({ bgm: baseBgm() }); } catch { /* ignore */ }
    }
    bootFailed = true;                    // 之后即使 boot 迟到也不再写宿主
  }

  return {
    boot, setMuted, restore, dispose, baseBgm,
    // 内省（单测 / 仿真 / 真机在 Console 里自查）
    state: () => ({
      muted, saved,
      hostBgm: audio?.volumes?.bgm ?? null,
      hostMuted: audio?.volumes?.muted ?? null,
      hostVoice: audio?.volumes?.voice ?? null,
      hasAudio: !!audio, hasSettings: !!settingsStore,
    }),
  };
}
