// mods/cyanfish.dj-models/client/section.js — 本 Mod 在「模组设置」（`cyanfish.mod-settings`）里注册的那一栏：
// 「🎉 DJ 整活」。
//
// ★★ 三根纪律：
//   1. **零参渲染**：`registry.js` 的契约是 `render` 被设置 Mod 当组件渲染（只给 key、不给 props），
//      所以依赖（api / store / engine / dom）都在 `index.js` 的闭包里绑好再传进来。
//   2. **只复用宿主已有的表单 class**（.set-list / .set-row / .set-row__label / .set-row__val / .set-range /
//      .set-toggle / .set-seg，public/css/screens/game.css:606-628），面板样式走**本 Mod 自己的** .sp-djb*
//      （见 style.js：分组小标题 / ？小圈 / 状态读数三样，选择器全部带前缀）——
//      「DOM 整活分组」那个 <style> 是**效果**要用的，不是这一栏的样式。
//   3. **说明一律收进「？」小圈**（规范 docs/MODS.md §4.12.2）：行里只有短标签 + 控件 + 数值；
//      长段落**不许**平铺在设置行里。
//
// ============================ ★★ 工序 43（批次 4，「待更新⑦」）：这一栏重新排版 ============================
// 服主原话（验收口径）：「测试服的 DJ 干员 mod 在 mod-setting 中注册的内容无效信息过多，需要重新规划排版。
// 且其在 mod console 中的描述页过多，统一成「简要功能说明 + 展开详情 + 版本日志」。
// **不要将每次给 ai 反馈的问题都全盘写上去**，只留对于管理员和玩家有效的信息
// （例如**具体代码层实现不必全盘写进详情中**，仅在必须的地方说明即可）。」
//
// 改前（v1.6.0）这一栏长什么样（真机实测，见报告 43 的改前截图）：
//   · 顶部一整段 `.set-row` 口径句（CHEER，含 ★ v1.5.1 / ★ v1.5.0 / ★ v1.4.0 三段版本流水）；
//   · 每个控件下面挂一段 `hintUnder` 小字（10 处），里面写着 `cos θ` / `setDir('UP')` / `assets.hasBack(id)` /
//     `MutationObserver` 这类**代码层实现**，以及「服主测试服实测」这种反馈流水；
//   · 7 个「节标题」长段落（分组 / 旋转参数 / 转身换面 / 混乱模式 / DOM 界面 / 性能预算 / 页脚），
//     每段 40~300 字，全部平铺；
//   · 8 行状态回显（当前状态 / 生效参数 / 分组计数 / 标记类别 / 混乱状态 / 转身换面 / DOM 界面 / 恢复默认）。
//   ⇒ 一屏里 长段落 : 控件 ≈ 3 : 1，观感就是「一堵文字墙」。
//
// 改后（本版）：
//   · **短标签**：全部 ≤ 8 个全角字，一行一个控件（标签 / 控件 / 数值三列，与宿主设置行逐值对齐）；
//   · **长说明进「？」小圈**：`HintDot` 挂在**短标签最右**（规范形状：`<span class="sp-djb__info" role="img"
//     tabindex="0" aria-label data-tip>?</span>`，★ 工序 52 起**没有**原生 `title` —— 两套提示框会重合），
//     悬浮 / 触屏点一下才出；文案 ≤ 160 全角字、
//     一句一档、**只讲"玩家会看到什么"**（实现细节一律清掉）；
//   · **状态读数**：从 8 行收到 **3 行**（运行状态 / 生效参数 / 界面状态），只留管理员排障真正要用的
//     几个数（挂没挂上帧回调、本帧写了几个、耗时、三档当前是哪个、标记了几个元素）；每行都带 `data-dj-ro`
//     便于取证。「分组计数 / 标记类别 / 混乱状态 / 转身换面」这类**只在排查时才看**的细分数字**已删**
//     —— 需要时走 dev 句柄 `__SP_DJ__.stats() / .domStats() / .fb()`（写在这三行的 ？小圈里）；
//   · **分组小标题**用 `cyanfish.skinvoice` 那一套（`.sp-djb__group` + `.sp-djb__groupname`），
//     不再用自造的内联 `grid-column:1 / -1` 长段落；
//   · **页脚**只留一行版本自证（版本号 + 默认关 + 位置），不再重复口径句。
//
// ★ 控件与判据**一个字节都没改**：4 个旋转参数（两个周期仍是整数帧输入框）、两种旋转模式、
//   9 个分组开关、混乱模式 4 项、界面三档、转身换面开关 + 换面死区、保护设置入口、每帧预算、恢复默认。
//   `PREF_V = 7`、默认值、范围、清洗全部照旧（config.js 未改）。
//
// ★ 为什么第 2 条纪律里「注入 <style>」这次可以了：这一栏从 v1.3.0 起刻意不注入样式；但规范 §4.12 的
//   「？」小圈**必须**有 CSS（`::after { content: attr(data-tip) }`）。★ 工序 52 更正：0.2.2 起 `ui` 句柄
//   **已经**有 `ui.Tooltip`（§6.2，工序 46），本栏暂时仍自备一份 —— 因为这一栏在「独立 Preact 根弹窗」里
//   也会被渲染，宿主 `.tooltip` 画不到那种弹窗之上（层叠限制见 `docs/MODS.md` §4.12.2 二）。做法与既有的两个 Mod 完全一致：
//   样式文件只写带前缀的类名、幂等注入（`installStyle()`），**不碰宿主任何 class 与 CSS**。

import { DOM_MAX_DEG, ROT_KEYS, DOM_MODES, DOM_MODE_LABELS, FPS } from './config.js';
import { installStyle } from './style.js';

/**
 * 跨满三列的一行（**只给状态读数**用，见 §4.12.2 的「状态读数」例外）。
 * ★ nowrap 由 `.sp-djb__ro` 自己给（长读数在窄屏换行比被裁掉好）。
 */
const RO = { 'data-dj-ro': '' };

/** 帧 → 「N 帧 ≈ X.XXX s」文案（"精确到帧"在 UI 上的呈现）。★ 数值列里必须**单行**。 */
export function framesText(frames, per) {
  const f = Math.max(1, Math.round(Number(frames) || 0));
  return f + ' 帧 ≈ ' + (f / FPS).toFixed(3) + ' s' + (per || '');
}

/** 滑块的数值格式。★ 数值列是宿主 `.set-row` 的窄列 ⇒ 只回显"本体"，但要保证单行。 */
const fmt = {
  spinPeriod: (v) => framesText(v, '/圈'),
  squashPeriod: (v) => framesText(v, '/次'),
  squashMinPct: (v) => Math.round(v) + '% 高度',
  widthMaxPct: (v) => Math.round(v) + '% 宽度',
  budget: (v) => String(Math.round(v)) + ' 个/帧',
  domMode: (v) => DOM_MODE_LABELS[v] || DOM_MODE_LABELS.on,
  fbDead: (v) => {
    const d = Math.min(1, Math.max(0, Number(v) || 0));
    return '±' + (Math.asin(d) * 180 / Math.PI).toFixed(1) + '°';
  },
  chaosPhi: (v) => Math.round(v * 100) + '% 周期',
  chaosAmp: (v) => '±' + Math.round(v * 100) + '%',
  chaosWanderHz: (v) => v.toFixed(2) + ' Hz',
};

/**
 * ★★ 全部长说明（**唯一来源**）。规范 §4.12.2：
 *   · ≤ 160 个全角字；一句一档 / 一句一义；档位顺序与控件顺序一致；
 *   · 用玩家的话，**不写实现细节**（不提变量名 / 函数名 / 定时器 / 文件路径 / 代码行号）；
 *   · 只讲「这个开关对他意味着什么」+「他会看到什么」。版本沿革与实现细节一律进 CHANGELOG.md 与 README.md。
 */
export const HINTS = Object.freeze({
  on: '关掉时一个像素都不动，之前转过的东西全部回到原位。'
    + '打开后下面 9 个分组各自生效 —— 只想让干员动就把别的分组关掉。'
    + '默认关：它会把整个战场的外观改掉，开着会让不知情的玩家以为游戏坏了。',
  group: '每个分组只关自己那一类，互不影响；总开关关掉时全部不动。',
  spinPeriod: '单位转一整圈要多少帧（60 帧 = 1 秒），可以直接键入 6~600 的整数。'
    + '右侧立刻给出秒数换算，想对齐音乐节奏就按秒数微调帧数。'
    + '伤害数字这一组不受本项之外的影响：它恒为平面内旋转、转完整一圈，不会被压扁。',
  squashPeriod: '一次「压下去再弹回来」要多少帧，与旋转各走各的、互不干涉。'
    + '压得越慢弹簧感越强，压得越快越像抖动。',
  squashMinPct: '压到最低时还剩多少高度：25% 是几乎压成一条线，75% 是只轻轻压一下。',
  widthMaxPct: '压到最低时的水平宽度：100% 是宽度不变，150% 是压扁的同时向两侧摊开到 1.5 倍。',
  spinMode: '绕竖直轴：横向按转到侧面的程度压窄，转到侧面时压成一条线 —— 这是平面图片表现「转过去」的方式。'
    + '平面内旋转：像指针一样在屏幕平面里转整圈。两种模式共用上面那四个参数，都不含倾斜与透视。'
    + '伤害数字恒为平面内旋转：文字被横向压扁到只剩两三像素会看不清笔画。',
  fbSwap: '绕竖直轴转到侧面（已经看不出宽度）那一刻，把模型从正面换成背面，过了半圈再换回来 —— '
    + '从「原地压扁」变成「真的转过身去」。只对有背面模型的单位生效；'
    + '倒地、死亡、淡出、晕眩、冻结、沉睡、替身与备战盘期间一律不碰模型，那几种状态下让游戏自己决定用哪套模型。'
    + '只换模型，不动朝向指示与阻挡标记。',
  fbDead: '防止在侧面附近来回抖动的迟滞门限：转到中间那段时保持上一次的正背面判定。'
    + '0 是按符号立刻换（最灵敏），0.3 是离侧面很远才换（最保守，约离过零点 ±17.5°）。',
  chaos: '每个目标各自错开一个固定的时间偏移、幅度在设定值附近缓慢游走。'
    + '周期与设定值严格相同 —— 只随机相位与幅度，不随机频率，所以整体节奏仍然是你要的那个。',
  chaosPhi: '每个目标最多错开多少个周期的时间偏移，50% 就是最多错开半个周期。',
  chaosAmp: '幅度围绕设定值活动的最大偏离比例，压缩强度与横向宽度同步偏离。',
  chaosWanderHz: '幅度游走的快慢：值越小越慢（几秒才走完一轮，不会闪）。',
  domMode: '开启：与其它元素一样压缩 + 水平旋转，并参与混乱模式。'
    + '同步：只竖向压缩、完全不旋转，而且所有界面元素相位完全相同。'
    + '关闭：既不压缩也不旋转。'
    + '这三档是「怎么加」，上面的分组开关是「要不要加」；三档都实时切换，关掉时页面零残留。'
    + '界面效果只在战斗中生效，且以最小的那个单位绕自身中心转（容器不转，父子不会叠加）。',
  guardSettings: '默认关：战斗界面一视同仁地转，左下角「设置」按钮也转。'
    + '打开后设置按钮与模组设置面板完全不参与旋转（多一道保险）。'
    + '不管这里怎么选，旋转角都硬上限在 ' + DOM_MAX_DEG + ' 度以内 —— 最窄时仍有原来一半宽，任何时刻都点得到设置。',
  budget: '每帧最多处理多少个目标，先到先得：单位与血条优先，特效吃剩下的，超出的当帧不动。'
    + '粒子多的时候调小它可以稳住帧率。',
  reset: '恢复默认：总开关与混乱模式默认关，分组里只有「战斗中的网页界面」默认关，'
    + '旋转 67 帧 / 压缩 38 帧 / 高度 60% / 宽度 110%，转身换面默认开、死区 0.04，界面默认「开启」、保护设置入口默认关。',
  readout: '这三行是**排查用的实时读数**，不写进存档。需要更细的逐分组数字时，'
    + '在浏览器控制台调 __SP_DJ__.stats() / .domStats() / .fb()（只读，不改变任何设置）。',
});

/**
 * ？小圈 —— ★ 规范形状（`docs/MODS.md` §4.12.2 二）。
 * ★★ 工序 52：**去掉原生 `title`** —— 它与自有气泡（`style.js` 的 `.sp-djb__info::after{content:attr(data-tip)}`）
 *   同时存在时，浏览器悬停会弹出**原生气泡（白底黑字）**、与本 Mod 的面板**两套重合**（真机实测 20 处）。
 *   提示只留自有气泡那一套；无障碍靠 `aria-label`（屏幕阅读器）+ `tabindex="0"` 的 `:focus`（键盘 Tab / 触屏点一下）。
 */
export function HintDot({ html, text }) {
  return html`<span class="sp-djb__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/** 分组小标题（中文，不用英文 eyebrow）—— 与 cyanfish.skinvoice 的 `.sp-sv__groupname` 同一套观感。 */
function Group({ html, label, children }) {
  return html`<div class="sp-djb__group" data-dj-group=${label}>
    <span class="sp-djb__groupname">${label}</span>${children}</div>`;
}

/** 一行滑块（结构照抄宿主 ui/settings.js 的 Slider；skinvoice 的 section.js 同款）。 */
function Slider({ html, icon, label, k, cfg, rng, onInput, tip }) {
  const [min, max, step] = rng[k];
  const value = cfg[k];
  const pct = Math.round(((value - min) / Math.max(1e-6, max - min)) * 100);
  return html`<label class="set-row" data-dj-key=${k}>
    <span class="set-row__label">${label}${tip ? html`<${HintDot} html=${html} text=${tip} />` : null}</span>
    <input class="set-range" type="range" min=${min} max=${max} step=${step} value=${value}
      style=${`--pct:${pct}%`} onInput=${(e) => onInput(k, Number(e.currentTarget.value))} />
    <span class="set-row__val num">${(fmt[k] || String)(value)}</span>
  </label>`;
}

/**
 * **整数帧输入框**（v1.4.0 起，取代两个周期参数原来的滑块）。
 *   · `type="number" min max step` + 我们自己的清洗 ⇒ 键入 127 生效的就是 **127 帧**；
 *   · `input` 事件里立刻清洗并应用合法值（9999 / 1 会被夹到 600 / 6）；非法或空**不写仓库**；
 *   · 用户正在输入时**不回写他的文本**（只有 Enter / blur 才纠偏文本）⇒ 不会出现"刚敲 6 就被改写"；
 *   · `↑/↓` 增减 1 帧（原生步进会与我们叠加成 2 帧，所以 preventDefault 自己算）、`Enter` 提交、`Tab` 不拦。
 *   · 数值列紧邻显示「N 帧 ≈ X.XXX s/圈」且**不换行**（宿主 `.set-row__val` 自带 `width:.5rem`，
 *     我们这个 span 加内联 nowrap + width:auto 才不会被折行）。
 */
function NumberField({ html, label, k, cfg, rng, onInput, tip }) {
  const [min, max, step] = rng[k];
  const value = cfg[k];
  return html`<label class="set-row" data-dj-key=${k}>
    <span class="set-row__label">${label}${tip ? html`<${HintDot} html=${html} text=${tip} />` : null}</span>
    <span class="sp-djb__numwrap">
      <input class="set-num" type="number" inputmode="numeric" min=${min} max=${max} step=${step}
        value=${value} aria-label=${label + '（整数帧）'} style=${NUM}
        onInput=${(e) => {
          const el = e.currentTarget;
          const v = cleanFrames(el.value, min, max);
          if (v == null) return;                        // ★ 半截 / 非法输入 ⇒ 一个字节都不写
          if (v !== Number(cfg[k])) onInput(k, v);       // ★ 即时生效（不必失焦）
        }}
        onKeyDown=${(e) => {
          const el = e.currentTarget;
          if (e.key === 'Enter') {
            const v = cleanFrames(el.value, min, max);
            const fin = v == null ? Number(cfg[k]) : v;
            if (v != null && v !== Number(cfg[k])) onInput(k, v);
            el.value = String(fin);                      // 提交：清掉 "006" / "127abc" 这类残留文本
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();                          // ★ 否则原生步进会再跑一次，一次方向键跳 2 帧
            const cur = cleanFrames(el.value, min, max);
            const base = cur == null ? Number(cfg[k]) : cur;
            const fin = cleanFrames(String(base + (e.key === 'ArrowUp' ? step : -step)), min, max);
            if (fin != null && fin !== Number(cfg[k])) onInput(k, fin);
            el.value = String(fin == null ? base : fin);
            return;
          }
          // ★ `Tab` / `Shift+Tab` 一律不拦（焦点照常走）；其余键也一律放行
        }}
        onBlur=${(e) => {
          const el = e.currentTarget;
          const v = cleanFrames(el.value, min, max);
          if (v != null && v !== Number(cfg[k])) onInput(k, v);
          if (el.value !== String(cfg[k])) el.value = String(cfg[k]);   // 离开时纠偏
        }}
        onFocus=${(e) => { try { e.currentTarget.select(); } catch { /* ignore */ } }} />
      <span class="sp-djb__unit">帧</span>
    </span>
    <span class="set-row__val num" style=${VAL}>${(fmt[k] || String)(value)}</span>
  </label>`;
}

/** 一个开关。★ 可见文字只有「开启 / 关闭」，开关的选项名在左边的短标签里（规范 §4.12.1）。 */
function Toggle({ html, label, k, on, onClick, tip }) {
  return html`<div class="set-row" data-dj-key=${k}>
    <span class="set-row__label">${label}${tip ? html`<${HintDot} html=${html} text=${tip} />` : null}</span>
    <button type="button" class=${`set-toggle${on ? ' is-on' : ''}`} role="switch" aria-checked=${on ? 'true' : 'false'}
      onClick=${onClick}><i></i><span>${on ? '开启' : '关闭'}</span></button>
  </div>`;
}

/** 一行分段控件（2~4 档；每档 ≤ 2 个全角字，否则宿主 `.set-seg` 按钮内会换行被裁）。 */
function Seg({ html, label, k, items, value, onChange, tip, title }) {
  return html`<div class="set-row" data-dj-key=${k}>
    <span class="set-row__label">${label}${tip ? html`<${HintDot} html=${html} text=${tip} />` : null}</span>
    <div class="set-seg" role="radiogroup" title=${title || ''}>
      ${items.map(([id, l, attr]) => html`<button key=${id} type="button" role="radio" ...${attr || {}}
        aria-checked=${value === id ? 'true' : 'false'} class=${value === id ? 'is-on' : ''}
        onClick=${() => onChange(id)}>${l}</button>`)}
    </div>
  </div>`;
}

/** 一行只读状态读数（值跨第 2~3 列；容器带 `data-dj-ro` 便于取证）。 */
function Readout({ html, label, tip, children }) {
  return html`<div class="set-row" ...${RO}>
    <span class="set-row__label">${label}${tip ? html`<${HintDot} html=${html} text=${tip} />` : null}</span>
    <span class="sp-djb__ro">${children}</span>
  </div>`;
}

/**
 * 清洗一个"帧数"输入。
 *   合法有限数 ⇒ `Math.round` + 夹到 [lo, hi]；**空串 / 非数字 / 半截输入 ⇒ null**（= 别写仓库）。
 * @param {any} raw 输入框的字符串（或数字）
 * @param {number} lo
 * @param {number} hi
 * @returns {number|null}
 */
export function cleanFrames(raw, lo, hi) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;                                  // 空 / 只有空格 ⇒ 保留原值
  const v = Number(s);
  if (!Number.isFinite(v)) return null;                 // 'abc' / '-' / '1e' ⇒ 保留原值
  const n = Math.round(v);
  return n < lo ? lo : n > hi ? hi : n;
}

/** ★★ v1.4.0 ③：**数值列（第三列）不换行**（宿主 `.set-row__val` 自带 `width:.5rem`，内容一长就折行）。 */
const VAL = 'white-space:nowrap;width:auto;text-align:right';
/** 键入框的样式（走内联；颜色 / 描边全部沿用宿主的 CSS 变量 ⇒ 观感就是"游戏自己的控件"）。 */
const NUM = 'width:100%;max-width:2.4rem;height:.38rem;box-sizing:border-box;text-align:right;'
  + 'background:#0a0d0c;border:1px solid var(--line-2);color:var(--mint-400);'
  + 'font-size:.2rem;font-variant-numeric:tabular-nums;padding:0 .1rem;outline:none';

/** 旋转模式的中文名（两种模式共用 4 个参数）。 */
const modeLabel = (m) => (m === 'flat' ? '平面内' : '绕竖直轴');

/**
 * 本 Mod 在「模组设置」里的那一栏。
 * ★ 零参渲染 —— 依赖在 `index.js` 的闭包里（registry.js 契约）。
 * @param {{ api:any, store:any, rng:any, spinModes:Array<string>, groups:Array<any>, version?:string,
 *           onStatus?:Function, onDomStatus?:Function }} props
 */
export function DjModelsSection({ api, store, rng, spinModes, groups, version, onStatus, onDomStatus }) {
  const { html, Button, hooks: { useState, useEffect } } = api.ui;
  const [cfg, setCfg] = useState(() => store.get());
  const [, force] = useState(0);

  // 面板样式（分组小标题 / ？小圈 / 状态读数）—— 幂等注入，打开这一栏才注入。
  useEffect(() => { installStyle(); }, []);
  // 外部改了参数（`__SP_DJ__.set()` / 另一个标签页）也要跟着刷新
  useEffect(() => store.subscribe(setCfg), [store]);
  // 状态读数是要动的数字：这一栏开着的时候每 500 ms 重画一次（关掉栏位就自动停）
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const set = (k, v) => { setCfg(store.set({ [k]: v })); };
  const allGroups = Array.isArray(groups) ? groups : [];
  const st = typeof onStatus === 'function' ? onStatus() : null;
  const ds = typeof onDomStatus === 'function' ? onDomStatus() : null;
  const domMode = DOM_MODES.includes(cfg.domMode) ? cfg.domMode : 'on';
  const domModeLabel = DOM_MODE_LABELS[domMode] || domMode;

  // ---- 三行状态读数（只留管理员排障要用的数；细分数字走 __SP_DJ__ 句柄）--------------------------------
  const hookText = st
    ? (st.hook === 'app' ? '已挂帧回调' : st.hook === 'raf' ? '自备帧回调' : '未挂帧回调')
    : '—';
  const runText = st
    ? hookText + ' · 本帧写 ' + st.writesFrame + ' 个 · 预算 ' + st.budget
      + (st.budgetHit ? '（' + st.budgetHit + ' 组被跳过）' : '')
      + ' · 本帧 ' + st.costMs.toFixed(2) + ' ms'
      + (st.pending ? ' · 待加载 ' + st.pending : '')
    : '—';
  const paramText = st
    ? st.spinPeriod + ' 帧 ≈ ' + (st.spinPeriod / FPS).toFixed(3) + ' s/圈 · '
      + st.squashPeriod + ' 帧 ≈ ' + (st.squashPeriod / FPS).toFixed(3) + ' s/次 · '
      + '高度 ' + Math.round(st.squashMinPct) + '% · 宽度 ' + Math.round(st.widthMaxPct) + '% · '
      + (cfg.spinMode === 'flat' ? '平面内' : '绕竖直轴')
      + (cfg.fbSwap ? ' · 换面开（死区 ±' + (Math.asin(Math.min(1, Math.max(0, cfg.fbDead || 0))) * 180 / Math.PI).toFixed(1) + '°，本帧换 ' + (st.fb ? st.fbSwaps : 0) + ' 次）' : ' · 换面关')
      + (cfg.chaos ? ' · 混乱开（' + (st.chaosTargets || 0) + ' 个目标各自错相）' : '')
    : '—';
  const domText = ds
    ? (ds.reduced ? '系统要求减少动态效果 ⇒ 自动停用'
      : (domMode === 'off' ? '关闭 ⇒ 不给界面加任何效果（不注入样式、零标记）'
        : (!ds.inMatch && !ds.active ? '当前不在战斗中 ⇒ 不注入样式、一个元素都不转'
          : (ds.active ? domModeLabel + ' · 标记 ' + ds.marked + ' 个元素'
            + (ds.domMode === 'sync' ? ' · 全体同相' : ds.domMode === 'on' ? ' · ±' + Math.round(ds.deg) + '°' : '')
            + (ds.guard ? ' · 兜底开（设置入口不转）' : '')
            : '未启用'))))
    : '—';

  return html`<div class="set-list" data-dj-section="1">
    <${Group} html=${html} label="效果">
      <${Toggle} html=${html} label="总开关" k="on" on=${cfg.on} onClick=${() => set('on', !cfg.on)} tip=${HINTS.on} />
      <div class="set-row">
        <span class="set-row__label">分组${true ? html`<${HintDot} html=${html} text=${HINTS.group} />` : null}</span>
        <span class="sp-djb__grid">
          ${allGroups.map((g) => html`<button key=${g.id} type="button" role="switch" data-dj-g=${g.id}
            aria-checked=${cfg[g.key] ? 'true' : 'false'}
            class=${`sp-djb__chip${cfg[g.key] ? ' is-on' : ''}`}
            title=${g.hint || ''} onClick=${() => set(g.key, !cfg[g.key])}>${g.label}</button>`)}
        </span>
      </div>
    <//>

    <${Group} html=${html} label="旋转">
      <${NumberField} html=${html} label="水平旋转速度" k="spinPeriod" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.spinPeriod} />
      <${NumberField} html=${html} label="压缩周期" k="squashPeriod" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.squashPeriod} />
      <${Slider} html=${html} label="压缩强度" k="squashMinPct" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.squashMinPct} />
      <${Slider} html=${html} label="横向补偿" k="widthMaxPct" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.widthMaxPct} />
      <${Seg} html=${html} label="旋转模式" k="spinMode" tip=${HINTS.spinMode} value=${cfg.spinMode}
        items=${spinModes.map((m) => [m, modeLabel(m)])} onChange=${(m) => set('spinMode', m)} />
    <//>

    <${Group} html=${html} label="转身换面">
      <${Toggle} html=${html} label="转身换面" k="fbSwap" on=${cfg.fbSwap} onClick=${() => set('fbSwap', !cfg.fbSwap)} tip=${HINTS.fbSwap} />
      <${Slider} html=${html} label="换面死区" k="fbDead" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.fbDead} />
    <//>

    <${Group} html=${html} label="混乱模式">
      <${Toggle} html=${html} label="混乱模式" k="chaos" on=${cfg.chaos} onClick=${() => set('chaos', !cfg.chaos)} tip=${HINTS.chaos} />
      <${Slider} html=${html} label="混乱强度" k="chaosPhi" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.chaosPhi} />
      <${Slider} html=${html} label="幅度波动" k="chaosAmp" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.chaosAmp} />
      <${Slider} html=${html} label="波动快慢" k="chaosWanderHz" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.chaosWanderHz} />
    <//>

    <${Group} html=${html} label="战斗中的网页界面">
      <${Seg} html=${html} label="界面" k="domMode" tip=${HINTS.domMode} value=${domMode}
        items=${DOM_MODES.map((m) => [m, DOM_MODE_LABELS[m], { 'data-dj-mode': m }])}
        title="开启 = 压缩 + 水平旋转 + 参与混乱；同步 = 只竖向压缩、不旋转、全体同相；关闭 = 既不压缩也不旋转"
        onChange=${(m) => set('domMode', m)} />
      <${Toggle} html=${html} label="保护设置入口" k="guardSettings" on=${cfg.guardSettings}
        onClick=${() => set('guardSettings', !cfg.guardSettings)} tip=${HINTS.guardSettings} />
    <//>

    <${Group} html=${html} label="性能">
      <${Slider} html=${html} label="每帧写入" k="budget" cfg=${cfg} rng=${rng} onInput=${set} tip=${HINTS.budget} />
    <//>

    <${Group} html=${html} label="当前状态">
      <${Readout} html=${html} label="运行读数" tip=${HINTS.readout}>${runText}<//>
      <${Readout} html=${html} label="生效参数" tip=${HINTS.readout}>${paramText}<//>
      <${Readout} html=${html} label="界面读数" tip=${HINTS.readout}>${domText}<//>
    <//>

    <div class="set-row">
      <span class="set-row__label">恢复默认${true ? html`<${HintDot} html=${html} text=${HINTS.reset} />` : null}</span>
      <div class="sp-djb__act">
        <${Button} variant="secondary" size="sm" onClick=${() => setCfg(store.reset())}>恢复默认<//>
      </div>
    </div>

    <p class="sp-djb__ver">DJ 干员 Mod · v${version || '?'} · 纯视觉 · 默认关 · 面板在「模组设置 → 🎉 DJ 整活」</p>
  </div>`;
}
