// mods/cyanfish.music-overlay/client/store.js —— 两个存储：
//   ① 本机配置（localStorage `sp.pref.musicoverlay`）：总开关 + 哪些条目被替换过；
//   ② 玩家上传的音频（IndexedDB `sp.music-overlay` / `clips`）：键 = 目标音频 URL，值 = { id, blob, name, type, size, at }。
//
// ★★ 为什么音频放 IndexedDB 而不是 localStorage：localStorage 只存字符串、且有 ~5 MB 上限 ——
//   一首歌就爆了。IndexedDB 能直接存 Blob、容量按配额来（浏览器给的几十 MB~几 GB）。
// ★ 为什么配置放 localStorage 而音频放 IndexedDB：配置要**同步读**（首帧就要知道开关与替换表），
//   IndexedDB 天生异步。两者用同一个键（音频 URL）对齐：**配置说「这条被替换」，IndexedDB 里就该有那个 Blob**。
// ★★ 一致性口径：**以 IndexedDB 里有没有 Blob 为准**。配置里残留一条、但 Blob 丢了（换设备 / 清了数据）⇒
//   这条当「没替换」处理并在界面上显示为未替换（不报错、不占位）。见 index.js 的 buildMap()。
//
// ★ 零抛：IndexedDB 打不开（隐私模式 / 老浏览器 / 静态托管）⇒ 降级为「本页内存态」，刷新即失效，
//   只在控制台留一条 warn（规范 §1.3）。功能不因此崩掉。

// —— 本机配置（localStorage） ------------------------------------------------------------------------

/** 配置键（沿用宿主 `sp.pref.` 前缀惯例；不 import 宿主模块）。 */
export const CONFIG_KEY = 'sp.pref.musicoverlay';
const CONFIG_VERSION = 1;

/**
 * 把任意输入洗成合法配置。**不抛**。
 * @param {unknown} raw
 * @returns {{ version:number, on:boolean, targets:Record<string, true> }}
 */
export function sanitizeConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const src = o.targets && typeof o.targets === 'object' ? o.targets : {};
  const targets = {};
  for (const k of Object.keys(src)) if (src[k] === true && typeof k === 'string' && k) targets[k] = true;
  return { version: CONFIG_VERSION, on: o.on !== false, targets };
}

/**
 * 建立配置对象。`read` / `write` 可注入（测试用）；默认读写 localStorage。
 * 每次 set 都写盘并**立刻**通知订阅者 ⇒ 设置页里一改，替换层当帧就跟上。
 * @param {{ read?:Function, write?:Function, log?:object }} [deps]
 */
export function createConfig({ read, write, log = console } = {}) {
  const doRead = read || ((k, d) => {
    try { const s = globalThis.localStorage?.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; }
  });
  const doWrite = write || ((k, v) => {
    try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式：内存态照用 */ }
  });

  let state = sanitizeConfig(doRead(CONFIG_KEY, null));
  const subs = new Set();
  const emit = (prev) => { for (const fn of [...subs]) { try { fn(state, prev); } catch (e) { log?.warn?.('[music-overlay] 配置订阅回调出错', e); } } };

  return {
    /** localStorage 键名（自检 / 报告里要对得上）。 */
    KEY: CONFIG_KEY,
    /** @returns {{ version:number, on:boolean, targets:Record<string, true> }} */
    get: () => state,
    /** 合一个补丁（先洗）。 */
    set(patch) {
      const prev = state;
      state = sanitizeConfig({ ...state, ...(patch || {}) });
      doWrite(CONFIG_KEY, state);
      emit(prev);
      return state;
    },
    /** 标注「这一条已被替换 / 已还原」。 */
    setTarget(id, want) {
      const prev = state;
      const targets = { ...state.targets };
      if (want) targets[String(id)] = true; else delete targets[String(id)];
      state = sanitizeConfig({ ...state, targets });
      doWrite(CONFIG_KEY, state);
      emit(prev);
      return state;
    },
    /** 把所有条目标为未替换（音频 Blob 不动 —— 还原成官方音但不删玩家的文件）。 */
    clearTargets() {
      const prev = state;
      state = sanitizeConfig({ ...state, targets: {} });
      doWrite(CONFIG_KEY, state);
      emit(prev);
      return state;
    },
    subscribe(fn) { if (typeof fn === 'function') subs.add(fn); return () => subs.delete(fn); },
    /** 内省（真机在 Console 里自查）。 */
    state: () => ({ on: state.on, replaced: Object.keys(state.targets).length }),
  };
}

// —— 上传的音频（IndexedDB） ------------------------------------------------------------------------

/** IndexedDB 数据库 / 对象仓库名。 */
export const DB_NAME = 'sp.music-overlay';
export const DB_STORE = 'clips';
const DB_VERSION = 1;

/**
 * 建立音频仓库。`idb` 可注入（测试用）；默认用 `globalThis.indexedDB`。
 * @param {{ log?:object, idb?:any }} [deps]
 * @returns {{ load:Function, put:Function, remove:Function, get:Function, has:Function, ids:Function,
 *   size:Function, persisted:Function, subscribe:Function, clear:Function, dispose:Function }}
 */
export function createClipStore({ log = console, idb = null } = {}) {
  const factory = idb || globalThis.indexedDB || null;
  const mem = new Map();        // id → { id, blob, name, type, size, at }
  const subs = new Set();
  let db = null;
  let opening = null;
  let degraded = false;

  const warn = (m, e) => { try { log?.warn?.('[music-overlay] ' + m, e?.message || e || ''); } catch { /* ignore */ } };
  const emit = () => { for (const fn of [...subs]) { try { fn(); } catch { /* ignore */ } } };

  /** 打开数据库（只试一次；失败后永久降级为内存态）。 */
  function openDb() {
    if (opening) return opening;
    opening = new Promise((resolve) => {
      if (!factory || typeof factory.open !== 'function') {
        degraded = true; warn('浏览器没有 IndexedDB ⇒ 上传的音频只在本页内存里，刷新即失效');
        return resolve(null);
      }
      let req;
      try { req = factory.open(DB_NAME, DB_VERSION); } catch (e) { degraded = true; warn('打开 IndexedDB 失败（降级为内存态）', e); return resolve(null); }
      req.onupgradeneeded = () => { try { const d = req.result; if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'id' }); } catch (e) { warn('建对象仓库失败', e); } };
      req.onsuccess = () => { db = req.result || null; resolve(db); };
      req.onerror = () => { degraded = true; warn('打开 IndexedDB 失败（降级为内存态）', req.error); resolve(null); };
      req.onblocked = () => warn('IndexedDB 被其它标签页占用（继续尝试）');
    });
    return opening;
  }

  const onTx = (tx, resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  };

  /** 把整张表读进内存（启动时调一次）。 */
  async function load() {
    const d = await openDb();
    if (!d) return { total: mem.size, persisted: false };
    try {
      const rows = await new Promise((resolve, reject) => {
        const tx = d.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      mem.clear();
      for (const r of rows) if (r && typeof r.id === 'string' && r.blob) mem.set(r.id, r);
      emit();
      return { total: mem.size, persisted: true };
    } catch (e) {
      warn('读 IndexedDB 失败（降级为内存态）', e);
      return { total: mem.size, persisted: false };
    }
  }

  /** 存一条（内存先生效，再尽力落盘）。 */
  async function put(id, blob, meta = {}) {
    const row = {
      id: String(id), blob,
      name: String(meta.name || ''),
      type: String(meta.type || (blob && blob.type) || ''),
      size: Number((blob && blob.size) || 0),
      at: Date.now(),
    };
    mem.set(row.id, row);
    emit();
    const d = await openDb();
    if (!d) return { persisted: false };
    try {
      await new Promise((resolve, reject) => { const tx = d.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(row); onTx(tx, resolve, reject); });
      return { persisted: true };
    } catch (e) { warn('写 IndexedDB 失败（本页仍生效，刷新会丢）', e); return { persisted: false }; }
  }

  /** 删一条（内存 + 落盘）。 */
  async function remove(id) {
    const key = String(id);
    const had = mem.delete(key);
    if (had) emit();
    const d = await openDb();
    if (!d) return { persisted: false };
    try {
      await new Promise((resolve, reject) => { const tx = d.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).delete(key); onTx(tx, resolve, reject); });
      return { persisted: true };
    } catch (e) { warn('删 IndexedDB 失败', e); return { persisted: false }; }
  }

  /** 清空全部（内存 + 落盘）。 */
  async function clear() {
    mem.clear();
    emit();
    const d = await openDb();
    if (!d) return { persisted: false };
    try {
      await new Promise((resolve, reject) => { const tx = d.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).clear(); onTx(tx, resolve, reject); });
      return { persisted: true };
    } catch (e) { warn('清空 IndexedDB 失败', e); return { persisted: false }; }
  }

  return {
    load, put, remove, clear,
    get: (id) => mem.get(String(id)) || null,
    has: (id) => mem.has(String(id)),
    ids: () => [...mem.keys()],
    size: () => mem.size,
    persisted: () => !degraded,
    subscribe(fn) { if (typeof fn === 'function') subs.add(fn); return () => subs.delete(fn); },
    dispose() { subs.clear(); try { db?.close?.(); } catch { /* ignore */ } db = null; opening = null; },
  };
}
