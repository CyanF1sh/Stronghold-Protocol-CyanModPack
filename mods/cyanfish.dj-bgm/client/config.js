// mods/cyanfish.dj-bgm/client/config.js — 每位玩家自己的「背景音乐」选择（开关 + 曲目 id）。
//
// ★ 作用域：**本机（本浏览器）**，和皮肤语音（sp.pref.skinvoice）、公告已读（sp.pref.announce）同一层：
//   存在 localStorage，不发服务器、不影响别人。存储键 `sp.pref.djbgm`
//   （与宿主 settings = sp.pref.settings、loadout = sp.pref.loadout 并列；`public/js/store.js:169` 的
//    loadPref/savePref 只是给键名加 `sp.pref.` 前缀，这里为了不 import 宿主模块而直接写全名）。
//
// 配置形状（version 1）：
//   {
//     version: 1,
//     on: true,        // 「音乐覆盖」总开关；false = 完全不碰宿主（= 本 Mod 不存在）
//     track: 'xxx',    // 选中的曲目 id；**空字符串 = 跟随官方 BGM**（还原宿主）
//   }
//
// ★★ 为什么「跟随官方」用 `track: ''` 而不是"关掉开关"：这是两个不同的语义。
//   `on:false` = 这个玩家不想用本 Mod；`track:''` = 用本 Mod，但这一档就是要听官方原曲。
//   两者对"宿主 BGM"的**结果**一样（都还原），但分开之后，玩家在开与关之间来回切时**记得住**上次选的是哪首。
//
// ★ 兼容与自愈：track 指向的 id 不在当前清单里（服主删了那首歌 / 换了清单 / 手改过 localStorage）
//   ⇒ 退成 `''`（跟随官方），**不会**停留在一个播不出来的 id 上。

const KEY = 'sp.pref.djbgm';
const VERSION = 1;

/**
 * 把任意输入洗成一个合法配置。**不抛**。
 * @param {unknown} raw
 * @param {{ validIds?: Set<string>, defaultId?: string }} [ctx]
 *   validIds  = 当前清单里的曲目 id 集合（用来判定 track 是否还可用）
 *   defaultId = 本机**从未存过**配置时的默认曲目（= 清单里的内置那首）；存过就完全听玩家的。
 */
export function sanitizeConfig(raw, { validIds = new Set(), defaultId = '' } = {}) {
  const o = raw && typeof raw === 'object' ? raw : {};
  let track;
  if (o.track === undefined || o.track === null) {
    // ★ 没存过（或老版本没有这个键）⇒ 默认选中内置那首；★ 显式存了空串则**保留**「跟随官方」
    track = validIds.has(defaultId) ? defaultId : '';
  } else if (typeof o.track === 'string') {
    const t = o.track.trim();
    track = t === '' || validIds.has(t) ? t : '';
  } else {
    track = '';
  }
  return { version: VERSION, on: o.on !== false, track };
}

/**
 * 建立配置对象。`read` / `write` 可注入（测试用）；默认读写 localStorage。
 * 每次 set 都写盘并**立刻**通知订阅者 ⇒ 设置栏位里一改，播放器当帧就跟着变。
 * @param {{ read?:Function, write?:Function, log?:object, validIds?:Set<string>, defaultId?:string }} [deps]
 */
export function createConfig({ read, write, log = console, validIds = new Set(), defaultId = '' } = {}) {
  const doRead = read || ((k, d) => {
    try { const s = globalThis.localStorage?.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; }
  });
  const doWrite = write || ((k, v) => {
    try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式：内存态照用 */ }
  });

  const ctx = { validIds, defaultId };
  let state = sanitizeConfig(doRead(KEY, null), ctx);
  const subs = new Set();

  return {
    /** localStorage 键名（自检 / 报告里要对得上）。 */
    KEY,
    /** @returns {{ version:number, on:boolean, track:string }} */
    get: () => state,
    /** 合一个补丁（先洗）。回调签名 (next, prev)。 */
    set(patch) {
      const prev = state;
      state = sanitizeConfig({ ...state, ...(patch || {}) }, ctx);
      doWrite(KEY, state);
      for (const fn of [...subs]) { try { fn(state, prev); } catch (e) { log?.warn?.('[dj-bgm] 订阅回调出错', e); } }
      return state;
    },
    /** 清单变了之后重洗一次（例如服主热重载换了曲目表）。 */
    refresh(nextCtx) {
      Object.assign(ctx, nextCtx || {});
      const prev = state;
      state = sanitizeConfig(state, ctx);
      if (state.track !== prev.track) doWrite(KEY, state);
      for (const fn of [...subs]) { try { fn(state, prev); } catch { /* ignore */ } }
      return state;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
