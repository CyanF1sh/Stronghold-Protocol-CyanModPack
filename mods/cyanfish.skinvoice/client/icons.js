// mods/cyanfish.skinvoice/client/icons.js — 本 Mod 自绘的图标。
//
// ★ 为什么不用宿主的 <Icon name="…">：ui/components.js 的 ICONS 是一张**闭表**（没有麦克风、
//   没有衣服），Mod 也无法往里面注册名字。但 hostApi.ui.html 是宿主自己的 htm.bind(h)，
//   所以 Mod 可以直接产出任意 vnode —— 包括自绘的 <svg>。于是图标自包含在这里，
//   不依赖宿主改任何代码。
//
// 风格对齐宿主：24×24 视口、currentColor 填充（跟着 .icon / 按钮的文字色走）。

/** @type {Record<string, {d: string, eo?: boolean}>} */
export const GLYPHS = {
  // 麦克风：胶囊 + 弧形支架 + 底座
  mic: {
    d: 'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0V5a1 1 0 0 0-1-1z'
      + 'M11 16.9V19H8v2h8v-2h-3v-2.1A7 7 0 0 0 19 10h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9z',
  },
  // 衣服：T 恤轮廓
  shirt: {
    d: 'M9 3 3.6 5.7l2.1 4.6 1.8-.8V21h9V9.5l1.8.8 2.1-4.6L15 3l-3 2z',
  },
  // 齿轮（语音节流参数页）
  gear: {
    d: 'M11 1h2l.5 2.6 1.7.7 2.2-1.5 1.4 1.4-1.5 2.2.7 1.7L23 11v2l-2.6.5-.7 1.7 1.5 2.2-1.4 1.4-2.2-1.5-1.7.7L13 23h-2l-.5-2.6-1.7-.7-2.2 1.5-1.4-1.4 1.5-2.2-.7-1.7L1 13v-2l2.6-.5.7-1.7L2.8 6.6l1.4-1.4 2.2 1.5 1.7-.7z'
      + 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zm0 2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
    eo: true,
  },
  // 声音开关（喇叭）
  speaker: {
    d: 'M4 9h3l5-4v14l-5-4H4zm11.5-.9a6 6 0 0 1 0 7.8l-1.4-1.4a4 4 0 0 0 0-5zm2.6-2.6a9.5 9.5 0 0 1 0 13l-1.4-1.4a7.5 7.5 0 0 0 0-10.2z',
    eo: true,
  },
  // 静音（喇叭打叉）
  speakerOff: {
    d: 'M4 9h3l5-4v14l-5-4H4zm10.6.4 1.4 1.4-2.1 2.2 2.1 2.2-1.4 1.4-2.2-2.1-2.2 2.1-1.4-1.4 2.1-2.2-2.1-2.2 1.4-1.4 2.2 2.1z',
    eo: true,
  },
  // 调色板（皮肤）
  palette: {
    d: 'M12 2a10 10 0 0 1 0 20c-1.1 0-2-.9-2-2 0-.5.2-1 .5-1.3.3-.4.5-.8.5-1.2 0-1.1-.9-2-2-2H7a5 5 0 0 1-5-5c0-4.7 4.5-8.5 10-8.5zm-3.5 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    eo: true,
  },
  // 地球 / 线路（素材上游）
  globe: {
    d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c1.3 0 2.6 2.5 2.9 6H9.1C9.4 6.5 10.7 4 12 4zM4.3 9h3.4a17 17 0 0 0 0 6H4.3a8 8 0 0 1 0-6zm5.6 0h4.2a17 17 0 0 1 0 6H9.9a17 17 0 0 1 0-6zm7.4 0h3.4a8 8 0 0 1 0 6h-3.4a17 17 0 0 0 0-6zM12 20c-1.3 0-2.6-2.5-2.9-6h5.8c-.3 3.5-1.6 6-2.9 6z',
    eo: true,
  },
};

/**
 * 自绘 SVG 图标。
 * @param {{ html: Function }} h hostApi.ui.html
 * @param {string} name GLYPHS 里的名字
 * @param {{ size?: string, class?: string }} [opts]
 */
export function iconVNode(html, name, { size = '1em', class: cls = '' } = {}) {
  const g = GLYPHS[name];
  if (!g) return null;
  return html`<svg class=${`icon sp-sv__svg ${cls}`.trim()} viewBox="0 0 24 24"
    width=${size} height=${size} aria-hidden="true" focusable="false">
    <path d=${g.d} fill-rule=${g.eo ? 'evenodd' : undefined} /></svg>`;
}
