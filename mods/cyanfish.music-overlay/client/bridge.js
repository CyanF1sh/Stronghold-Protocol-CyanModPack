// mods/cyanfish.music-overlay/client/bridge.js —— 宿主 audio 单例的桥：**在这一个点上**做逐条音频替换。
//
// ★★ 为什么是这个私有方法：宿主 public/js/audio.js 的 AudioManager 是**单例**，它所有发声路径都先走
//   同一个私有漏斗 `_buffer(url)`（fetch → decodeAudioData → LRU 缓存）：
//     _startBgm（背景音乐）· _play（界面 / 战斗音效）· _playLanding（整备落子）· _playBondCue · _playVoice（干员语音）
//   ⇒ 在 `_buffer` 上把「某个 URL」换成「玩家上传的音频解码出的 AudioBuffer」，**宿主自己的调度全部保留**
//     （限流器 / 语音门 / 循环 / 淡入淡出 / 同一文件最多 2 个副本 …一个都没改）——我们换的是**字节**，不是**时机**。
//
// ★ 这是本 Mod **唯一**碰宿主私有成员的地方。它是**运行时包装**（不是改宿主源码）：
//   在单例实例上写一个同名自有属性盖住原型方法；`dispose()` 用 `delete` 摘掉，露出原型上的原方法。
//   宿主改私有方法名即失效 ⇒ 已在报告里提「接缝变更申报」（请主平台给一条正式接缝）。
//
// ★★ 长音效与短音效在这里的分叉（唯一一处）：
//   · 短音效（技能 / 被击倒 / 界面…）：把该 URL 的缓冲换成玩家的音频，其余交给宿主 —— 一次性触发，照旧。
//   · 长音效（背景音乐）：替换它的**循环段**；若该曲目有官方前奏，则**让前奏 URL 解析成 null**
//     （宿主 `_startBgm` 里是 `if (intro) {…}`，拿到 null 就跳过前奏）⇒ 既不会「官方前奏 + 你的曲子」拼一起，
//     也不用去合成静音 —— 直接从 t0 起播并循环。
//
// ★ 降级：拿不到 audio 单例 / 单例没有 `_buffer` ⇒ hasAudio=false，install() 返回 false。
//   调用方据此**不注册替换**（宁可什么都不做，也不做半套）。

/** 宿主音频模块 URL（与 `main.js:47` 同一 URL ⇒ ES 模块按 URL 去重，拿到的就是**同一个**单例）。 */
export const AUDIO_URL = '/js/audio.js';

/**
 * @param {{ log?:object, load?:(url:string)=>Promise<any> }} [deps]
 *   `load` 可注入（单测 / 仿真用假宿主模块）；默认动态 import。
 * @returns {{ boot:Function, install:Function, setMap:Function, dispose:Function, state:Function }}
 */
export function createAudioBridge({ log = console, load = null } = {}) {
  const doLoad = load || ((u) => import(/* @vite-ignore */ u));
  let audio = null;
  let orig = null;
  let installed = false;
  let booted = false;
  /** url → { blob, buffer?, promise? } | { mute: true }。替换层每次配置变化**重建**它。 */
  let map = new Map();

  const warn = (m, e) => { try { log?.warn?.('[music-overlay] ' + m, e?.message || e || ''); } catch { /* ignore */ } };

  /** 装上去的那个 `_buffer`。 */
  function patched(url) {
    try {
      if (typeof url !== 'string' || !url) return orig(url);
      const rec = map.get(url);
      if (!rec) return orig(url);                                   // 没命中 ⇒ 原样交还宿主
      if (rec.mute) return Promise.resolve(null);                   // 前奏：喂 null ⇒ 宿主跳过
      if (rec.buffer) return Promise.resolve(rec.buffer);           // 已解码
      if (rec.promise) return rec.promise;                          // 正在解码
      return decodeInto(rec, url) || orig(url);                     // 还没有 AudioContext ⇒ 先用官方原声
    } catch (e) { warn('替换音频出错（退回官方原声）', e); return orig(url); }
  }

  /**
   * 把玩家上传的 Blob 解码成宿主 AudioContext 里的 AudioBuffer（一次，缓存进 rec）。失败退回官方原声。
   * @returns {Promise<any>|null} null = 现在还不能解码（AudioContext 还没建，首次用户手势之前）
   */
  function decodeInto(rec, url) {
    const ctx = audio && audio.ctx;
    if (!ctx || typeof ctx.decodeAudioData !== 'function') return null;
    rec.promise = (async () => {
      try {
        const ab = await rec.blob.arrayBuffer();
        const buf = await new Promise((resolve) => {
          try {
            const r = ctx.decodeAudioData(ab, resolve, () => resolve(null));
            if (r && typeof r.then === 'function') r.then(resolve, () => resolve(null));
          } catch { resolve(null); }
        });
        rec.promise = null;
        if (buf) { rec.buffer = buf; return buf; }
        warn('这个音频文件解不开，已退回官方原声：' + url);
        return orig(url);
      } catch (e) {
        rec.promise = null;
        warn('解码上传音频出错（退回官方原声）', e);
        return orig(url);
      }
    })();
    return rec.promise;
  }

  /** 载入宿主 audio 单例（只跑一次；失败也不抛）。 */
  async function boot() {
    if (booted) return state();
    booted = true;
    try {
      const m = await doLoad(AUDIO_URL);
      const a = m && m.audio;
      audio = a && typeof a._buffer === 'function' ? a : null;
      if (!audio) warn('宿主 /js/audio.js 没有导出可用的 audio 单例 ⇒ 本 Mod 无法替换音效');
    } catch (e) {
      audio = null;
      warn('拿不到宿主 /js/audio.js ⇒ 本 Mod 无法替换音效', e);
    }
    return state();
  }

  /** 把 `patched` 装到单例上（幂等）。返回是否已装好。 */
  function install() {
    if (installed) return true;
    if (!audio || typeof audio._buffer !== 'function') return false;
    try {
      orig = audio._buffer.bind(audio);
      audio._buffer = patched;
      installed = true;
      return true;
    } catch (e) { warn('包装宿主音频漏斗失败', e); installed = false; return false; }
  }

  /**
   * 换一张替换表（调用方每次配置 / 音频变化后重建）。**保留** blob 未变的记录 ⇒ 已解码的缓冲不白扔。
   * @param {Map<string, any>} next url → { blob } | { mute:true }
   */
  function setMap(next) {
    const prev = map;
    const out = new Map();
    if (next && typeof next.forEach === 'function') {
      next.forEach((rec, url) => {
        const old = prev.get(url);
        const reuse = old && rec && old.mute === rec.mute && !old.mute && old.blob === rec.blob;
        out.set(url, reuse ? old : rec);
      });
    }
    map = out;
  }

  /** 完全还原（不留下包装）。调用方卸载时用。 */
  function dispose() {
    if (installed && audio) {
      try {
        if (audio._buffer === patched) delete audio._buffer;   // 摘掉自有属性 ⇒ 露出原型原方法
        else if (orig) audio._buffer = orig;                   // 别人在我们之后也包了 ⇒ 只把自己的那层替回来
      } catch { /* ignore */ }
    }
    installed = false;
    map = new Map();
    audio = null;
    orig = null;
    booted = false;
  }

  /** 内省（真机在 Console 里自查）。 */
  function state() {
    let muted = 0;
    try { map.forEach((rec) => { if (rec && rec.mute) muted += 1; }); } catch { /* ignore */ }
    return {
      hasAudio: !!audio,
      hasContext: !!(audio && audio.ctx),
      installed,
      mapped: map.size,          // 替代表里的 URL 总数（替换项 + 被跳过前奏项）
      muted,                     // 其中「解析成 null」（背景音乐前奏）的条数
      hostBgmVolume: audio?.volumes?.bgm ?? null,
    };
  }

  return { boot, install, setMap, dispose, state };
}
