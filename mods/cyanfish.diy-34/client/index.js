// mods/cyanfish.diy-34/client/index.js —— L4 客户端界面扩展的入口（宿主 public/js/ui/extensions.js 装载）。
//
// 本 Mod 到 v1.3.0 为止是**纯数据**（5 条 L2 补丁）；v1.3.1 起多了这一条客户端通道，**只为一件小事**：
// 把「III阶」小圈（V3「深渊低语」）的**气泡材质与呼吸动效**注入页面（见 ./style.js 的说明）。
//   · 文案与常态配色走**数据**（data/backups.json 的 diy.slots[].voidedNote，基座 §4.9 的缝）；
//   · 这里只做内联样式表达不了的那部分（伪元素材质 / hover 态 / 关键帧 / 动效降级）。
//
// 宿主契约：默认导出（或具名 setup）被调用一次，参数是 hostApi（ui / slots / t …）。
// ★ 本模块**不注册任何插槽**（不需要宿主给位置，只是加一份样式）⇒ 对宿主界面零结构改动。
// ★ 失败隔离：宿主逐 Mod try/catch；这里也不抛错（document 不存在时静默跳过）。
// ★ 幂等：宿主可能重复调用（重载 / HMR）⇒ installTierNoteStyle() 自己保证只注入一次。

import { installTierNoteStyle } from './style.js';

/** 装机入口（宿主调用）。@param {any} _host */
export default function setup(_host) {
  installTierNoteStyle();
}

export { setup };
