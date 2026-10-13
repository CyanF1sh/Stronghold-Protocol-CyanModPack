// mods/cyanfish.skinvoice/client/i18n.js — 本 Mod 的界面文案翻译器。
//
// ★★ 为什么要单独一个小文件（而不是各文件直接 import 宿主模块）：
//   0.2.x 的门禁口径是**所有界面文案走 t()**（msgid = 中文原文，见 shared/i18n.js / docs/I18N.md）。
//   宿主把 `shared/` 挂在站点根 `/shared/`（server/http/static.js 的 mounts），所以 Mod 能
//   `import('/shared/i18n.js')` —— 与宿主解析到**同一个模块 URL** ⇒ 同一份语言状态与目录，
//   换语言时宿主重渲染，本 Mod 下次渲染自然也是新语言（`t()` 每次都查当前语言）。
//
// ★ 为什么是"工厂 + 异步取一次"而不是顶层 `import`：
//   1. 本 Mod 的全部依赖面都是「拿不到就降级，绝不报错」（见 index.js 文件头第 2~7 条）。
//      顶层 import 一个拿不到的 URL 会让**整个 Mod 装载失败**（extensions.js 会跳过它），
//      代价太大；动态 import 失败只是"文案退回中文原文"，那本来就是 msgid，玩家看到的东西没错。
//   2. 静态托管 / 老宿主 / 离线时 `/shared/i18n.js` 可能 404 —— 兜底 `t(msgid) === msgid` 完全可用。
//
// ★ 用法（各 UI 文件）：
//     import { makeT } from './i18n.js';
//     const t = makeT(log);          // 立即可以调；真正的宿主 t 一到就自动接管
//     html`<span>${t('皮肤与语音')}</span>`
//   `t(msgid, params)` 的签名与宿主完全一致（见 shared/i18n.js 的 t）。

/**
 * 取一个 t()。返回的函数**任何时候都能调**，拿不到宿主 i18n 时就是恒等函数（返回 msgid 本身）。
 * @param {object} [log] 宿主注入的 logger（api.log）；只用来打一行降级说明
 * @returns {(msgid: string, params?: any) => string}
 */
export function makeT(log = console) {
  /** @type {((msgid: string, params?: any) => string) | null} */
  let real = null;
  try {
    const p = import('/shared/i18n.js');
    if (p && typeof p.then === 'function') {
      p.then((m) => { if (typeof m?.t === 'function') real = m.t; })
        .catch(() => { log?.warn?.('[cyanfish.skinvoice] 拿不到 /shared/i18n.js：界面文案退回中文原文（msgid）'); });
    }
  } catch { /* 极端环境（无 import 能力）：保持恒等 */ }
  return (msgid, params) => {
    if (real) { try { return real(msgid, params); } catch { /* 翻译异常不该让界面崩 */ } }
    return String(msgid);
  };
}
