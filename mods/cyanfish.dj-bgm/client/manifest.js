// mods/cyanfish.dj-bgm/client/manifest.js — 读并**洗干净**本 Mod 的音乐清单（client/bgm.json）。
//
// ★ 为什么清单是「一个文件 + 一条登记」而不是把歌名写死在代码/界面里：
//   服主口径是「可以替换为**其他可选音乐**」。所以曲目表必须是**数据**：往 assets/bgm/ 丢一个文件、
//   在 bgm.json 的 tracks[] 里加一条，界面（section.js）就自动多一个选项 —— 加一首歌不用碰任何 js。
//   UI 里**一个歌名都不硬编码**（连内置那首也不写死：它只是 tracks[0] / default 指向的那条）。
//
// ★ 为什么清单放 client/ 而不是 data/：data/*.json 是**对宿主 data/*.json 的补丁**（{ops:[…]}，
//   server/mods/loader.js 会把它合并进宿主数据）。一份"本 Mod 自己的曲目表"跟宿主数据无关，
//   塞进 data/ 只会污染 /data/config.json（还会被当成 L2 数据补丁参与校验）。client/ 下的文件由
//   宿主的 /mods/ 静态挂载原样下发（server/http/static.js:103），是这份清单最自然的位置。
//
// ★ 路径怎么变成 URL：`file` 写的是**相对站点根的路径**（`assets/bgm/xxx.m4a`）。宿主的
//   server/http/static.js:200 有一条 `/assets/**` 兜底：public/assets 里没有就依次找各启用 Mod 的
//   assets/ ⇒ 这个文件以 `/assets/bgm/xxx.m4a` 被取到。所以 URL = '/' + file。
//
// ★ 容错（规范 §1.3）：任何一条曲目写坏都只**跳过那一条**并留一条 warn，绝不抛、绝不让整张表失效。

/** 清单 URL：与本模块同目录（`/mods/<id>/client/bgm.json`）。 */
export const MANIFEST_URL = new URL('./bgm.json', import.meta.url).href;

/** 允许的音频扩展名（扩展名同时决定宿主给的 Content-Type，见 server/http/files.js:16 的 MIME 表）。 */
export const AUDIO_EXT = Object.freeze(['.m4a', '.mp3', '.ogg', '.oga', '.opus', '.wav', '.aac', '.mp4', '.webm']);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * 一个 `file` 值是不是安全可用的站内相对路径。
 * 拒绝：绝对路径 / 反斜杠 / 盘符 / `..` / 空段 / 不在白名单里的扩展名。
 * ★ 为什么连扩展名都要卡：扩展名不对 ⇒ 宿主给 `application/octet-stream`，浏览器**不认**成音频，
 *   `<audio>` 只会静默失败（没有报错、也没有声音）——那是最难查的一类坑，必须在清单层挡掉。
 * @param {unknown} v
 * @returns {boolean}
 */
export function isSafeAudioPath(v) {
  if (!isStr(v)) return false;
  const s = v.trim().replace(/^\.\//, '');
  if (s.startsWith('/') || s.includes('\\') || s.includes(':')) return false;
  const segs = s.split('/');
  if (!segs.length || segs.some((x) => !x || x === '.' || x === '..' || x.startsWith('.'))) return false;
  const dot = s.lastIndexOf('.');
  if (dot < 0) return false;
  return AUDIO_EXT.includes(s.slice(dot).toLowerCase());
}

/**
 * 把任意输入洗成一张可用的曲目表。**不抛**：坏条目计数返回。
 * @param {unknown} raw
 * @returns {{ version:number, defaultId:string, tracks:Array<{id:string,title:string,artist:string,file:string,url:string,durationSec:number|null,bytes:number|null,source:string}>, dropped:number }}
 */
export function sanitizeManifest(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(o.tracks) ? o.tracks : [];
  const tracks = [];
  const seen = new Set();
  let dropped = 0;
  for (const it of list) {
    const t = it && typeof it === 'object' ? it : null;
    const id = t && isStr(t.id) ? t.id.trim() : '';
    if (!t || !id || seen.has(id) || !isSafeAudioPath(t.file)) { dropped++; continue; }
    seen.add(id);
    const file = String(t.file).trim().replace(/^\.\//, '');
    tracks.push({
      id,
      title: isStr(t.title) ? String(t.title).trim() : id,
      artist: isStr(t.artist) ? String(t.artist).trim() : '',
      file,
      url: '/' + file,
      durationSec: Number.isFinite(Number(t.durationSec)) ? Math.round(Number(t.durationSec)) : null,
      bytes: Number.isFinite(Number(t.bytes)) ? Math.round(Number(t.bytes)) : null,
      source: isStr(t.source) ? String(t.source).trim() : '',
    });
  }
  const wantDefault = isStr(o.default) ? String(o.default).trim() : '';
  const defaultId = tracks.some((t) => t.id === wantDefault) ? wantDefault : (tracks[0]?.id ?? '');
  return { version: 1, defaultId, tracks, dropped };
}

/**
 * 拉并洗清单。拿不到 / 坏 JSON ⇒ 返回一张空表（调用方据此"零痕迹"退出），**不抛**。
 * @param {{ url?:string, fetchFn?:Function, log?:object }} [deps]
 */
export async function loadManifest({ url = MANIFEST_URL, fetchFn = null, log = console } = {}) {
  const doFetch = fetchFn || ((...a) => globalThis.fetch(...a));
  try {
    const res = await doFetch(url, { cache: 'no-cache' });
    if (!res || !res.ok) {
      log?.warn?.(`[dj-bgm] 音乐清单取不到（HTTP ${res?.status ?? '?'}）：${url}`);
      return sanitizeManifest(null);
    }
    const json = await res.json();
    const m = sanitizeManifest(json);
    if (m.dropped) log?.warn?.(`[dj-bgm] 音乐清单里有 ${m.dropped} 条不合法，已跳过`);
    if (!m.tracks.length) log?.warn?.('[dj-bgm] 音乐清单里没有可用曲目 ⇒ 本 Mod 不出声、也不压宿主 BGM');
    return m;
  } catch (e) {
    log?.warn?.('[dj-bgm] 音乐清单读取失败（忽略）', e?.message || e);
    return sanitizeManifest(null);
  }
}
