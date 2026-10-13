// mods/cyanfish.dj-bgm/client/section.js — 本 Mod 在「模组设置」（cyanfish.mod-settings）里注册的那一栏：
// 「背景音乐」。
//
// ★★ 为什么这里**没有音量滑杆**（服主口径，也是本 Mod 最容易被"顺手做多"的地方）：
//   「背景音乐音量设置在原本的官方设置中已有不必重复制作控件」。所以音量只有一个来源：
//   官方设置里那条 BGM 滑杆（`ui/settings.js` 的 settingsStore.bgm）。本栏位只负责"选哪首 / 开不开"，
//   选中的结果由 index.js 同步给 hostbgm.js（压宿主）与 player.js（放我们那首 + 音量跟随滑杆）。
//
// ★ 曲目**一个都不硬编码**：全部来自清单（client/bgm.json → manifest.js 的 tracks[]）。
//   下拉的第一项永远是「跟随官方 BGM」（值 = 空串）= 关掉覆盖、把宿主 BGM 原样还回来。
//   加一首歌只要往 assets/bgm/ 丢文件 + 在 bgm.json 里登记一条 ⇒ 这里自动多一项（见 README）。
//
// ★ props 契约：mod-settings 把它当零参组件渲染（`<${Body} key=${active} />`），
//   所以依赖全部由 index.js 在注册时**闭包**带进来（api / cfg / tracks / version）。
// ★ 订阅用的是本 Mod 自己的 cfg（不是宿主的设置）：玩家在别处改了它，这一栏也同步。
//
// ============================ ★★ 工序 43（批次 4，「待更新⑦」）：按 §4.12 重新排版 ============================
// 改前：三行控件 + 一行 `.sp-djb__src` 出处小字 + 一行 `.sp-djb__ver` 版本行（版本行里顺手塞了一句
//   「音量沿用官方设置里的 BGM 滑杆（静音档同样生效）」的**说明**）。问题不在长度，在**归类**：
//   · 唯一一处需要解释的事情（"为什么没有音量滑杆"）被写成了行尾小字，而不是小圈；
//   · 「音量」这条信息同时出现在页脚与说明里，读者要自己拼。
// 改后（本版）：
//   · **分组小标题**「音乐」；两行控件（音乐覆盖 / 曲目）保持一行一个；
//   · 两个「？」小圈：「音乐覆盖」讲这个开关对玩家意味着什么，「曲目」讲下拉第一项的语义、
//     音量从哪来、怎么再加一首、怎么还原（≤ 160 全角字、一句一义、**零实现细节**）；
//   · 出处读数（`.sp-djb__src`，带 `data-sp-djb-src`）与版本行**照旧**（它们是**状态读数**，
//     会随选中的曲目变，规范 §4.12.2 允许保留）；
//   · 页脚只留版本自证，不再重复音量那句说明（它已经在「曲目」的小圈里）。

import { installStyle } from './style.js';

/** 「跟随官方」那一项的值（= 不覆盖）。 */
export const FOLLOW_OFFICIAL = '';

/**
 * 长说明（**唯一来源**）。规范 §4.12.2：≤ 160 全角字、一句一义、不写实现细节、只讲玩家会看到什么。
 */
export const HINTS = Object.freeze({
  on: '打开后游戏自己的背景音乐会被静音，改放你在下面选的那首并循环播放；关闭就原样还回官方 BGM。'
    + '音量不在这里调 —— 它实时跟着官方设置里那条「背景音乐」滑杆走，官方那条静音档同样生效。',
  track: '第一项「跟随官方 BGM」= 关掉覆盖、把游戏自己的背景音乐原样还回来；选中一首会顺手打开上面的开关。'
    + '再加一首曲目只需往本 Mod 的 assets/bgm/ 放音频并在清单里登记一条，重载后这里就会多一项。'
    + '切回「跟随官方」、关掉开关或停用本 Mod，都会把官方 BGM 原样还回来。',
});

/**
 * ？小圈 —— ★ 规范形状（`docs/MODS.md` §4.12.2 二）。
 * ★★ 工序 52：**去掉原生 `title`** —— 它与自有气泡（`style.js` 的 `.sp-djb__info::after{content:attr(data-tip)}`）
 *   同时存在时，浏览器悬停会弹出**原生气泡（白底黑字）**、与本 Mod 的面板**两套重合**。
 *   提示只留自有气泡那一套；无障碍靠 `aria-label`（屏幕阅读器）+ `tabindex="0"` 的 `:focus`（键盘 Tab / 触屏点一下）。
 */
function HintDot({ html, text }) {
  return html`<span class="sp-djb__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/**
 * 「背景音乐」栏位。
 * @param {{ api:any, cfg:any, tracks:Array<object>, version?:string }} props
 */
export function BgmSection({ api, cfg, tracks, version }) {
  const { html, hooks: { useState, useEffect } } = api.ui;
  const [, force] = useState(0);
  const repaint = () => force((n) => n + 1);

  // 打开这一栏才注入样式（本 Mod 的"零痕迹"口径：不打开就一个 <style> 都不加）。
  useEffect(() => { installStyle(); }, []);
  // cfg 变了就重画（开关 / 曲目）。订阅在卸载时退掉。
  useEffect(() => {
    try { const off = cfg.subscribe(() => repaint()); return () => { try { off?.(); } catch { /* ignore */ } }; } catch { return undefined; }
  }, []);

  const list = Array.isArray(tracks) ? tracks : [];
  if (!list.length) {
    return html`<div class="sp-djb"><p class="sp-djb__empty">没有可用曲目（client/bgm.json 的 tracks 为空）。</p></div>`;
  }

  const c = cfg.get();
  const cur = list.find((t) => t.id === c.track) || null;

  /** 选曲：选到一首真曲子时**顺手把开关打开**（玩家的意图显然是"我要听这首"）。 */
  const pick = (id) => {
    const next = String(id || '');
    cfg.set(next ? { track: next, on: true } : { track: FOLLOW_OFFICIAL });
  };

  const srcLine = cur
    ? `当前：${cur.title}${cur.artist ? ' · ' + cur.artist : ''}${cur.source ? '　|　' + cur.source : ''}`
    : '当前：跟随官方 BGM（宿主原样播放，本 Mod 不出声）';

  return html`<div class="sp-djb" data-sp-djb-section="1">
    <div class="sp-djb__group" data-sp-djb-group="音乐">
      <span class="sp-djb__groupname">音乐</span>
      <div class="set-row">
        <span class="set-row__label">音乐覆盖${true ? html`<${HintDot} html=${html} text=${HINTS.on} />` : null}</span>
        <button type="button" class=${`set-toggle${c.on ? ' is-on' : ''}`} role="switch"
          aria-checked=${c.on ? 'true' : 'false'} data-sp-djb-switch=${c.on ? 'on' : 'off'}
          onClick=${() => cfg.set({ on: !c.on })}><i></i><span>${c.on ? '开启' : '关闭'}</span></button>
      </div>
      <div class="set-row">
        <span class="set-row__label">曲目${true ? html`<${HintDot} html=${html} text=${HINTS.track} />` : null}</span>
        <div class=${`sp-djb__ctl${c.on ? '' : ' sp-djb__ctl--off'}`}>
          <select class="sp-djb__sel" aria-label="背景音乐曲目" data-sp-djb-select=${c.track}
            value=${c.track} onChange=${(e) => pick(e.currentTarget.value)}>
            <option value=${FOLLOW_OFFICIAL} selected=${c.track === FOLLOW_OFFICIAL}>跟随官方 BGM</option>
            ${list.map((t) => html`<option key=${t.id} value=${t.id} selected=${c.track === t.id}>
              ${t.artist ? `${t.title} · ${t.artist}` : t.title}
            </option>`)}
          </select>
        </div>
      </div>
    </div>
    <p class="sp-djb__src" data-sp-djb-src=${cur ? cur.id : 'official'}>${srcLine}</p>
    <p class="sp-djb__ver" data-sp-djb-version=${version ? String(version) : ''}>背景音乐覆盖 Mod · v${version || '?'}</p>
  </div>`;
}
