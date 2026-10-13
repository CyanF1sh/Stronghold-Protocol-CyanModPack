// mods/cyanfish.dj-bgm/client/player.js — 本 Mod **自己的**那一路播放器（一个 HTMLAudioElement）。
//
// ★★ 为什么用 <audio> 而不是塞进宿主的 Web Audio 图：
//   ① 宿主的 Web Audio 是"宿主自己的 BGM"那条链路（`playBgm(key)` 只认 data/assets.json 里的 key），
//      要让它放我们的文件就得改宿主的 BGM 清单/播放代码 —— 那正是本 Mod **不做**的事；
//   ② 我们的音频是**运行时才由服主/玩家提供**的任意文件（4.4 MB 的 m4a），用 <audio> 是最省事、
//      最不容易出错的一条路：浏览器自己解码、自己缓冲、自己处理 Range 请求（宿主 server/http/files.js:6
//      明确支持单段 Range，就是给 <audio> 用的）。
//
// ★★ 音量为什么没有自己的滑杆：服主口径「音量复用官方设置」。所以 volume **直接来自官方设置里的 bgm 值**
//   （`ui/settings.js` 的 settingsStore → `Slider` 的 onInput → `updateSettings({bgm})`），
//   由 index.js 每次同步时喂进来（`follow({ volume, muted })`）。玩家拖官方滑杆 ⇒ 我们的音量当帧跟着变。
//   ★ 一个诚实的差别写在这里：宿主是把 bgm 送进 Web Audio 的 `bgmGain`（增益 = `bgm² × 0.55`，audio.js:605），
//     而 `<audio>.volume` 是**线性**的。本 Mod 有意**不**去复刻那条感知曲线：
//     ① 服主的口径是"把官方设置里的 BGM 音量套到我们元素上"，线性最直白、可验证（volume === 滑杆值）；
//     ② 复刻曲线会把我们的最大音量锁在 0.55，反而比官方那首小。要改只改下面 applyVolume() 一处。
//
// ★★ 「静音」档（`volumes.muted`）怎么尊重：用 `el.muted = muted`，而**不是**把 volume 写成 0。
//   这样滑杆值原样留在 el.volume 上（可被断言、取消静音立刻恢复），也不会去碰宿主那个 muted 键。
//
// ★ 自动播放：`play()` 在没有用户手势时会被浏览器拒绝（NotAllowedError）。这不是错误，是正常现象
//   （宿主自己的 Web Audio 也靠 `_unlock` 等第一次手势，audio.js:495）。所以这里：拒绝就**挂一次性手势
//   监听**（pointerdown / keydown / touchend，capture）等第一次点击再放 —— 与宿主同一套思路，绝不弹窗、
//   绝不报错。无头浏览器里没有声音输出，但元素状态（src/currentSrc/paused/currentTime）照样是对的。
//
// ★ 元素是**挂到 document.body 上的**（`hidden`，不占布局）：① 便于真机在 DOM 里断言它真的存在、
//   `currentSrc` 真的指向我们打包的文件；② dispose 时能干净地摘掉（不留孤儿节点）。

/** 元素 id（自检 / 真机断言用）。 */
export const AUDIO_EL_ID = 'sp-djb-audio';

const clamp01 = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : d);

/**
 * @param {{ doc?:Document, win?:Window, log?:object }} [deps]
 * @returns {{ follow:(s:{volume?:number,muted?:boolean})=>void, play:(url:string|null)=>void,
 *   pause:()=>void, stop:()=>void, dispose:()=>void, element:()=>HTMLAudioElement|null, state:()=>object }}
 */
export function createPlayer({ doc = globalThis.document, win = globalThis.window, log = console } = {}) {
  let el = null;
  let curUrl = null;
  let armed = false;

  const warn = (msg, e) => { try { log.warn?.(`[dj-bgm] ${msg}`, e?.message || e || ''); } catch { /* ignore */ } };

  /** 惰性创建元素（第一次真的要放东西时才建 —— "没选曲目"时页面上零痕迹）。 */
  function ensure() {
    if (el) return el;
    try {
      el = doc.createElement('audio');
      el.id = AUDIO_EL_ID;
      el.setAttribute('data-sp-dj-bgm', '1');
      el.hidden = true;                 // 不占布局；<audio> 隐藏了照样播
      el.preload = 'auto';
      el.loop = true;                   // ★ 循环：BGM 的语义就是循环
      el.volume = 1;
      el.setAttribute('playsinline', '');
      el.setAttribute('aria-hidden', 'true');
      (doc.body || doc.documentElement).appendChild(el);
    } catch (e) {
      warn('无法创建 <audio> 元素（页面不出声）', e);
      el = null;
    }
    return el;
  }

  /** 音量 / 静音对齐（幂等；跟官方设置走，见文件头）。 */
  function follow(s) {
    if (!el) return;
    try {
      if (s && s.volume !== undefined) el.volume = clamp01(s.volume, el.volume);
      if (s && s.muted !== undefined) el.muted = !!s.muted;
    } catch { /* ignore */ }
  }

  /** 挂一次性手势监听：第一次用户交互时再试一次 play()（自动播放被拒的兜底）。 */
  function armGesture() {
    if (armed || !win?.addEventListener) return;
    armed = true;
    const events = ['pointerdown', 'keydown', 'touchend'];
    const on = () => {
      for (const ev of events) { try { win.removeEventListener(ev, on, { capture: true }); } catch { /* ignore */ } }
      armed = false;
      if (curUrl && el) tryPlay();
    };
    for (const ev of events) { try { win.addEventListener(ev, on, { capture: true, passive: true }); } catch { /* ignore */ } }
  }

  function tryPlay() {
    try {
      const p = el?.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => armGesture());
    } catch { armGesture(); }
  }

  /**
   * 播放某个 URL（`null` = 停）。
   * ★ 同一条 URL 重复调用是**空操作**（不重设 src、不打断当前的播放位置）—— 同步函数每帧都会调它。
   */
  function play(url) {
    if (!url) { stop(); return; }
    const node = ensure();
    if (!node) return;
    if (curUrl !== url) {
      curUrl = url;
      try {
        node.setAttribute('src', url);
        node.load();                    // 立刻开始资源选择：currentSrc 随之确定
      } catch (e) { warn('设置音频地址失败', e); }
    }
    tryPlay();
  }

  /** 暂停（保留 src 与播放位置）。 */
  function pause() { try { el?.pause?.(); } catch { /* ignore */ } }

  /** 停并**断开**：清掉 src 与缓冲（真机断言"我们的元素停止了"看的就是这一步）。 */
  function stop() {
    curUrl = null;
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();                        // networkState → NETWORK_EMPTY，currentSrc 清空
    } catch { /* ignore */ }
  }

  /** 卸载：停 + 从 DOM 摘掉。 */
  function dispose() {
    stop();
    try { el?.remove?.(); } catch { /* ignore */ }
    el = null;
  }

  return {
    follow, play, pause, stop, dispose,
    element: () => el,
    // 内省（单测 / 仿真 / 真机断言）
    state: () => ({
      hasEl: !!el,
      inDom: !!(el && el.isConnected),
      src: el?.getAttribute?.('src') ?? null,
      currentSrc: el?.currentSrc || null,
      paused: el ? el.paused : null,
      loop: el ? el.loop : null,
      volume: el ? el.volume : null,
      muted: el ? el.muted : null,
      currentTime: el ? el.currentTime : null,
      duration: el && Number.isFinite(el.duration) ? el.duration : null,
      readyState: el ? el.readyState : null,
      networkState: el ? el.networkState : null,
      error: el?.error ? { code: el.error.code, message: el.error.message } : null,
    }),
  };
}
