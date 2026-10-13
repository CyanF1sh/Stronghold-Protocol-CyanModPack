// server/mods/client.js — Mod 的「客户端界面扩展」通道（<modsDir>/<id>/client/index.js）。
// (i18n-ignore-file: Mod 平台（加载器 / 打包 / 管理 API），不是游戏界面文案 — docs/I18N.md)
//
// 这是 Loader 的第四条落地轴（前三条：data/ 补丁 = L1/L2、content/ = L3 战斗行为、assets/ = 自带美术）：
//
//   content/  → 两端各装一份（服务器 Node + 玩家浏览器），因为它改的是**战斗行为**，必须一致；
//   client/   → **只在玩家浏览器里跑**。它改的是**界面**（往宿主界面的插槽里挂 UI），
//               服务端不加载、也不该有任何副作用 —— 否则同一份代码会在服务器上做出莫名其妙的事。
//
// 装载方：public/js/ui/extensions.js 的 loadClientMods()
//   1. GET /mods（server/index.js 下发）→ 每个启用 Mod 的 `client` 字段 = 本文件算出的 URL；
//   2. 浏览器 `import(url)` → 取默认导出（或具名 setup）→ `setup(hostApi)`；
//   3. 模块用 hostApi.slots.register('loadout.topbar', Component) 把界面挂到插槽上。
//
// 这个文件只有一件事：把 URL 拼法**收在一处**（和 contentUrlOf 对称），免得宿主与 Mod 各写一份。
//
// 容错：缺文件 / 坏模块 / setup 抛错都只影响该 Mod（extensions.js 逐 Mod try/catch），绝不拖垮页面
// （与 content/ 通道同一套原则）。

import { CLIENT_SUBDIR, CLIENT_ENTRY } from './loader.js';

/**
 * 浏览器端的界面扩展入口 URL（GET /mods 下发；server/index.js 的 /mods/ 静态挂载负责回源）。
 * @param {string} id Mod id
 * @returns {string} 形如 /mods/<id>/client/index.js
 */
export function clientUrlOf(id) {
  return `/mods/${encodeURIComponent(String(id))}/${CLIENT_SUBDIR}/${CLIENT_ENTRY}`;
}
