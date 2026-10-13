// mods/cyanfish.dj-all/client/panels.js — 视图描述层（纯函数，零 DOM、零 Preact）。
//
// 它把「配置 + 层级树 + 当前选中项」算成面板要显示的样子：
//   · `annotate(tree, cfg, selectedId)` → 目录里每一行要显示什么（档位点、⚠ 标记、选中态、计数）
//   · `headModel(cfg, id)`               → 顶部配置区要显示什么（三档、五个参数、禁用态、为空、警示）
//
// ★★ 为什么单独一层：真机上的面板由 `section.js` 用 htm+Preact 渲染，而独立预览页用一个
//    纯 DOM 渲染器 —— 两个渲染器都读同一份这里算出来的描述。⇒ "哪些行、什么控件、什么值、
//    可不可改、什么文案"全部由本文件保证一致，视觉由同一份 CSS 保证。改口径只改这里。
//
// ★ 本文件不 import 任何宿主模块，也不碰 DOM ⇒ 单测可以直接喂配置进来复算。

import { MODE_LABEL, MODE_HINT, PARAMS, RND_KEYS, RND_MAX_PCT, modeOf, valuesOf,
  cleanRnd, cleanFab } from './config.js';
import { subgroupName } from './elements.js';

/** 帧 → 「N 帧 ≈ X.XXX s/圈」文案（"精确到帧"在界面上的呈现）。 */
export function framesText(frames, suffix) {
  const f = Math.max(1, Math.round(Number(frames) || 0));
  return f + ' 帧 ≈ ' + (f / 60).toFixed(3) + ' s' + (suffix || '');
}

/** 一个参数的显示值（`text` 给控件右侧的读数）。★ 「关」档由调用方置空，不在这里判。 */
export function paramText(param, value) {
  if (param.kind === 'seg') return (param.optionLabels && param.optionLabels[value]) || String(value);
  if (param.kind === 'frames') return framesText(value, param.suffix);
  if (param.key === 'squashMinPct') return Math.round(value) + '% 高度';
  if (param.key === 'widthMaxPct') return Math.round(value) + '% 宽度';
  return String(value);
}

/**
 * ★★ 面板要显示的全部文案（玩家口径：只讲"他会看到什么 / 怎么撤回"，不写实现细节）。
 * 规范：`MOD-SESSION-STANDARD.md §7`（长说明收进「？」小圈，≤ 160 全角字，一句一档）。
 */
export const TEXTS = Object.freeze({
  title: 'DJ 整活（逐元素）',
  intro: '把战斗界面里的元素按目录层级一个个打开「转起来」。默认全部关闭 —— 一个像素都不动。',
  emptyTitle: '还没有选中元素',
  emptyHint: '在上面那棵树里点一个元素（或一整组）—— 这里的三个选项就是给它用的。分组也可以选：'
    + '选一整组 = 这一组里的元素一起用同一个档位。',
  modeLabel: '这个元素的档位',
  modeHint: {
    off: '关：这个元素不参与效果；下面的数值不可改、也不显示。',
    global: '全局：用全局那一份数值；在这里改任何一个参数，等于改了全局数值，所有选「全局」的元素一起变。',
    own: '独立：用这个元素自己的一份数值（初值就是当前的全局数值）；在这里改只影响它自己。',
  },
  paramDisabled: '（档位是「关」，数值留空、也不可改）',
  globalNote: '你现在改的是全局数值：所有档位为「全局」的元素会立刻跟着变。',
  ownNote: '你现在改的是这个元素自己的数值，不影响别的元素与全局。',
  dangerTitle: '⚠ 危险元素',
  dangerText: '这是设置入口（或包含设置入口的那一整块）：让它转动可能让你点不到设置、改不回来。'
    + '真要开的话，建议把「水平旋转速度」调慢、把「压缩强度」调大（压得轻一点）。',
  dangerConfirmTitle: '确定要给「{name}」开启效果吗？',
  dangerConfirmText: '它是设置入口（或包含设置入口的整体）。转起来之后如果点不到设置，'
    + '可以在浏览器控制台执行 __SP_DJALL__.reset() 一键关掉全部效果。确定要开吗？',
  dangerConfirmOk: '仍然开启',
  dangerConfirmCancel: '取消',
  // ---- ④ 随机偏移 ----
  rndGroup: '随机偏移',
  rndHint: '给每个元素的「压缩强度 / 横向补偿」各自叠一个固定的随机量，让整个画面看起来错落一些。'
    + '两个周期不参与 —— 周期是你用来对齐音乐的量，随机化没有意义。',
  rndOn: '开启随机偏移',
  rndRange: '偏移幅度',
  rndNote: '幅度是相对值：15% 表示这个参数最多上下浮动 15%。每个元素的偏移由元素本身决定（算出来就不会变），'
    + '所以重开面板 / 刷新页面都不会跳；只有改这里的范围才会整体重算。',
  // ---- ② 局内入口 ----
  fabGroup: '局内',
  fabHint: '战斗里那颗图标键：拖动它就能改位置；点一下会打开这个 Mod 的半透明浮窗，方便一边调一边看战场。',
  fabOn: '显示局内入口',
  fabPos: '入口位置',
  fabReset: '回到默认位置',
  fabAlpha: '浮窗不透明度',
  hlOn: '选中元素时在画面上标黄框',
  hlHint: '在目录里点一个元素，画面上它所在的位置会套一个黄色外框，方便确认自己配的是哪一个。'
    + '画布里的单位 / 血条 / 特效没有 DOM 位置，标不出框（会用一行字告诉你）。',
  hlNoMatch: '现在不在对局里 —— 位置高亮要进对局才看得到。',
  hlPixi: '这一选里包含画布对象（单位 / 血条 / 特效…），它们没有 DOM 位置，标不出外框。',
  hlOff: '位置高亮已关闭（在「局内」那一栏里打开）。',
  resetLabel: '全部恢复默认',
  resetHint: '把每个元素都变回「关」、全局数值回出厂值（所有东西立刻回到原位）。',
  footer: '档位：关 / 全局 / 独立 · 改完立刻生效 · 关掉的元素零残留',
});

/**
 * 目录树里每一行要显示的内容（不做 DOM，只给数据）。
 * @param {Array<any>} tree `buildTree()` 的产物
 * @param {any} cfg 配置
 * @param {string|null} selectedId 当前选中的节点 id
 * @param {Set<string>} [expanded] 展开的节点 id 集合（生成 `open` 标记）
 */
export function annotate(tree, cfg, selectedId, expanded) {
  const walk = (ns) => ns.map((n) => {
    const mode = modeOf(cfg, n.id);
    const isLeaf = n.kind === 'leaf';
    const row = {
      id: n.id,
      kind: n.kind,
      name: isLeaf ? n.name : (n.kind === 'layer' ? n.name : (subgroupName(n.layer, n.path) || n.name)),
      sub: isLeaf ? n.el.id : '',
      count: n.memberIds ? n.memberIds.length : 1,
      mode,
      modeLabel: MODE_LABEL[mode],
      on: mode !== 'off',
      danger: n.danger === true,
      unavailable: isLeaf ? (n.el.unavailable || '') : '',
      selected: n.id === selectedId,
      open: expanded ? expanded.has(n.id) : (n.kind === 'layer' || n.kind === 'group' ? true : false),
      children: n.children ? walk(n.children) : null,
    };
    return row;
  });
  return walk(tree || []);
}

/**
 * ★★ 顶部配置区要显示的内容。
 * @param {any} cfg
 * @param {string|null} id 当前选中的节点 id（`null` = 没选）
 * @param {Array<any>} tree
 * @returns {{ empty:boolean, id?:string, name?:string, pathLabel?:string, danger?:boolean, mode?:string,
 *            modes?:Array<{id:string,label:string,on:boolean}>, params?:Array<any>, note?:string, dangerText?:string,
 *            global?:any, own?:any }}
 */
export function headModel(cfg, id, tree) {
  const modes = Object.keys(MODE_LABEL).map((m) => ({ id: m, label: MODE_LABEL[m], on: false }));
  if (!id) return { empty: true, modes };
  const node = findNode(tree, id);
  if (!node) return { empty: true, modes };
  const mode = modeOf(cfg, id);
  const off = mode === 'off';
  const vals = valuesOf(cfg, id);
  const pathLabel = pathOf(node);
  const params = PARAMS.map((p) => {
    const built = {
      key: p.key, label: p.label, kind: p.kind, unit: p.unit || '',
      hint: p.hint || '',
      disabled: off,                          // ★ 「关」档：不可输入/不可修改
      value: p.kind === 'seg' ? vals[p.key] : (off ? null : vals[p.key]),
      text: off ? '' : paramText(p, vals[p.key]),   // ★ 「关」档：显示为空
    };
    if (p.kind === 'seg') { built.options = p.options; built.optionLabels = p.optionLabels; }
    if (p.range) { built.min = p.range[0]; built.max = p.range[1]; built.step = p.range[2]; }
    return built;
  });
  for (const m of modes) m.on = m.id === mode;
  return {
    empty: false,
    id,
    kind: node.kind,
    name: nodeName(node),
    pathLabel,
    count: node.memberIds ? node.memberIds.length : 1,
    danger: node.danger === true,
    dangerText: node.danger === true ? TEXTS.dangerText : '',
    mode,
    modes,
    params,
    note: mode === 'global' ? TEXTS.globalNote : mode === 'own' ? TEXTS.ownNote : TEXTS.paramDisabled,
    modeHint: TEXTS.modeHint[mode],
    // 给"新切到独立档"用的：当前全局数值（面板据此解释"初值就是它"）
    global: cfg.glob,
  };
}

/** 一个节点在树里（深度优先找）。 */
export function findNode(tree, id) {
  for (const n of tree || []) {
    if (n.id === id) return n;
    if (n.children) { const r = findNode(n.children, id); if (r) return r; }
  }
  return null;
}

/** 节点显示名。 */
export function nodeName(n) {
  if (!n) return '';
  if (n.kind !== 'group') return n.name;
  return subgroupName(n.layer, n.path) || n.name;
}

/** 节点的层级路径（人类可读，面包屑用）。 */
export function pathOf(n) {
  if (!n) return '';
  if (n.kind === 'leaf') return n.layer + (n.path ? ' › ' + n.path : '');
  if (n.kind === 'group') return n.layer + ' › ' + (subgroupName(n.layer, n.path) || n.path);
  return n.name;
}

/**
 * ④ 随机偏移那一行的模型（「可展开」由渲染层用 `<details>` 做）。
 * @param {any} cfg
 */
export function rndModel(cfg) {
  const r = cleanRnd(cfg && cfg.rnd);
  const labels = [];
  for (const key of RND_KEYS) {
    const p = PARAMS.find((x) => x.key === key);
    if (p) labels.push(p.label);
  }
  return {
    on: r.on,
    loPct: r.loPct,
    hiPct: r.hiPct,
    min: 0,
    max: RND_MAX_PCT,
    keys: RND_KEYS.slice(),
    keyLabels: labels,
    /** 一行的读数（关着也要能看出"关着"）。 */
    text: r.on ? ('±' + r.loPct + '~' + r.hiPct + '%') : '关',
    rangeText: r.loPct + '% ~ ' + r.hiPct + '%',
    affects: labels.join(' / ') + '（周期不参与）',
  };
}

/**
 * ② 局内入口那一行的模型。
 * @param {any} cfg
 */
export function fabModel(cfg) {
  const f = cleanFab(cfg && cfg.fab);
  return {
    on: f.on,
    xPct: Math.round(f.x * 100),
    yPct: Math.round(f.y * 100),
    alpha: f.alpha,
    alphaPct: Math.round(f.alpha * 100),
    hl: f.hl !== false,
    posText: '横向 ' + Math.round(f.x * 100) + '% · 纵向 ' + Math.round(f.y * 100) + '%',
  };
}

/** 三档的语义说明（面板在档位旁显示）。 */
export function modeHint(mode) { return MODE_HINT[mode] || ''; }
