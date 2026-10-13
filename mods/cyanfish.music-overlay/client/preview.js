// mods/cyanfish.music-overlay/client/preview.js —— 「试听」：用一个**独立**的 <audio> 元素放上传的音频。
//
// ★ 为什么不走游戏自己的音频通道：
//   试听是**设置页里的自检动作**，不是游戏内容。走宿主通道意味着要先过 `_buffer` 的替换逻辑、又会受
//   官方的 SFX/BGM 滑杆与限流影响 —— 玩家"点了试听没声"就很难判断是文件坏还是音量低。独立元素最直白：
//   调子出来了 = 文件能被浏览器解码。
// ★ 代价（诚实登记）：试听音量**不受**官方设置滑杆控制（它是另一条通道）。见 README「已知边界」。
// ★ 只在设置页里用；`dispose()` 停掉并释放 ObjectURL，不留后台声音与内存。

/**
 * @param {{ log?:object }} [deps]
 * @returns {{ play:Function, stop:Function, playing:Function, dispose:Function }}
 */
export function createPreview({ log = console } = {}) {
  let el = null;
  let url = null;

  const warn = (m, e) => { try { log?.warn?.('[music-overlay] ' + m, e?.message || e || ''); } catch { /* ignore */ } };

  function revoke() {
    if (url) { try { globalThis.URL?.revokeObjectURL?.(url); } catch { /* ignore */ } url = null; }
  }

  /** 停掉当前试听（不强求元素存在）。 */
  function stop() {
    try { if (el) { el.pause?.(); el.currentTime = 0; } } catch { /* ignore */ }
  }

  /**
   * 试听一个音频 Blob（覆盖上一次）。
   * @param {Blob} blob
   * @returns {boolean} 是否已发起播放
   */
  function play(blob) {
    stop();
    revoke();
    if (!blob || typeof globalThis.Audio !== 'function' || !globalThis.URL?.createObjectURL) return false;
    try {
      url = globalThis.URL.createObjectURL(blob);
      el = new globalThis.Audio(url);
      el.volume = 1;
      const p = el.play?.();
      if (p && typeof p.then === 'function') p.then(undefined, (e) => warn('试听被浏览器拦下（通常需要先有一次页面交互）', e));
      return true;
    } catch (e) { warn('试听失败', e); return false; }
  }

  function dispose() { stop(); revoke(); el = null; }

  return { play, stop, dispose, playing: () => !!(el && el.paused === false) };
}
