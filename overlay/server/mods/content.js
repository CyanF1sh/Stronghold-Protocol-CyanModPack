// server/mods/content.js — Mod 的 L3 行为代码（<modsDir>/<id>/content/）加载器（Node 侧）。
// (i18n-ignore-file: Mod 平台（加载器 / 打包 / 管理 API），不是游戏界面文案 — docs/I18N.md)
//
// 数据补丁（data/*.json）走 loader.js；**行为代码**走这里。两者互不依赖：
//   · 只带 data/ 的 Mod 照常工作（L1/L2）；
//   · 带 content/ 的 Mod 在这里被装进 server/sim/content/index.js 的 Mod 注册层（L3）。
//
// ★ 为什么 specifier 要在这里算出来：Mod 目录可能在游戏仓库**之外**（测试实例：本地部署目录/mod/mods，
//   应用在 本地部署目录/mod/app），所以 Mod 内容模块无法用相对路径 import 引擎（`../../data.js` 之类），
//   它的相对根两端也不一致。⇒ 由宿主机给出**绝对 file: URL**，并且引擎侧只通过宿主句柄把模块交出去
//   （见 server/sim/content/index.js 的 modHostApi）。浏览器端同一份内容用 /mods/<id>/content/index.js。
//
// 浏览器对应物：server/index.js 的 GET /mods 会把每个 Mod 的 content 字段下发（内容 URL），
// public/js/battle/runner.js 的 loadBrowserSim 拿到后调用同一个 registerModContent。
//
// 容错：缺文件/坏模块/安装抛错都只影响该 Mod（registerModContent 逐 Mod 原子回滚），绝不拖垮服务器。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanMods, CONTENT_SUBDIR, CONTENT_ENTRY, MOD_API_VERSION } from './loader.js';

/**
 * L3 注册层（`server/sim/content/index.js` 的 `registerModContent`）的**可选绑定**。
 *
 * ★ 迁移到 0.2.1 时，`server/sim/content/index.js` 的 Mod 注册层与平台侧（本文件）是分头施工的：该导出**尚未
 *   落地**时，一句静态 `import { registerModContent } from '../sim/content/index.js'` 会让**整个服务器起不来**
 *   （ESM 缺导出 = 模块实例化期 SyntaxError），而数据补丁（L1/L2）、client/ 界面扩展与自带美术明明都还能用。
 *   所以这里改成动态 import + 一次性探测：拿到了就正常装载；没拿到就**明确告警**并让 content/ 通道空转。
 *   ⇒ 注册层一落地（同一个导出名），本文件无需再改一行，content/ 自动开始生效。
 * @param {{ warn?: Function, info?: Function }} log
 * @returns {Promise<Function|null>} registerModContent 或 null
 */
let registerFn = null;
let registerChecked = false;
async function loadRegisterModContent(log) {
  if (registerChecked) return registerFn;
  registerChecked = true;
  try {
    const mod = await import('../sim/content/index.js');
    registerFn = typeof mod.registerModContent === 'function' ? mod.registerModContent : null;
  } catch (e) {
    registerFn = null;
    log.warn?.(`[mods] 无法加载 L3 注册层（server/sim/content/index.js）: ${e?.message ?? e}`);
  }
  if (!registerFn) {
    log.warn?.('[mods] server/sim/content/index.js 未导出 registerModContent：content/ 行为模块本次未装载（数据补丁、client/ 界面扩展与 assets/ 美术不受影响）');
  }
  return registerFn;
}

/** 浏览器端的内容 URL（GET /mods 下发；server/index.js 的 /mods/ 挂载负责回源）。 */
export function contentUrlOf(id) {
  return `/mods/${encodeURIComponent(String(id))}/${CONTENT_SUBDIR}/${CONTENT_ENTRY}`;
}

/**
 * 列出**启用且通过清单校验**、且真的带 content/index.js 的 Mod。
 * 与 resolveMods 的启用判定保持一致（.state.json 的 disabled / order）。
 *
 * @param {string|null|undefined} modsDir
 * @param {{ log?: object }} [opts]
 * @returns {Array<{ id: string, file: string, specifier: string }>}
 */
export function resolveModContent(modsDir, { log = console } = {}) {
  const out = [];
  if (!modsDir) return out;                      // 无 Mod 仓库 ⇒ 纯原版，零开销
  let entries = [];
  try { entries = scanMods(modsDir, { log }); } catch (e) { log.warn?.(`[mods] 扫描内容目录失败: ${e?.message ?? e}`); return out; }
  for (const e of entries) {
    if (!e.enabled) continue;
    if (e.errors?.length || e.manifestErrors?.length) continue;   // 与数据补丁同一套门禁
    const file = path.join(e.dir, CONTENT_SUBDIR, CONTENT_ENTRY);
    let st = null;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    // ★ 缓存击穿：Node 的 ESM 注册表按 **URL** 缓存模块。若 specifier 恒定，Mod 作者改了 content/index.js
    //   再走管理页「重载」，import 会命中旧模块 ⇒ 跑的还是旧代码（静默失效，最难查）。
    //   挂一个 mtime 查询串：文件没动 ⇒ URL 不变 ⇒ 命中缓存（快，install(api) 仍会重新执行并重新注册）；
    //   文件改了 ⇒ URL 变 ⇒ 重新求值。
    out.push({ id: e.id, file, specifier: `${pathToFileURL(file).href}?mtime=${Math.round(st.mtimeMs)}` });
  }
  return out;
}

/**
 * 把启用 Mod 的 L3 内容装进引擎（startServer 在 listen 之前 await 一次）。**绝不抛**。
 * @param {string|null|undefined} modsDir
 * @param {{ log?: object }} [opts]
 * @returns {Promise<Array<{ id: string, file: string, specifier: string }>>} 已安装的内容条目
 */
export async function applyModContent(modsDir, { log = console } = {}) {
  const entries = resolveModContent(modsDir, { log });
  const registerModContent = await loadRegisterModContent(log);
  if (!registerModContent) return entries;                                          // 注册层未落地 ⇒ 空转（已告警）
  if (!entries.length) { await registerModContent([], { log }); return entries; }   // 明确清空（无 Mod 时零残留）
  log.info?.(`[mods] L3 内容模块 ${entries.length} 个: ${entries.map((e) => e.id).join(', ')}`);
  await registerModContent(entries, { log });
  return entries;
}

/** 平台 API 版本（供 /mods 诊断）。 */
export { MOD_API_VERSION };
