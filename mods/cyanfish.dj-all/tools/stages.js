// mods/cyanfish.dj-all/tools/stages.js — **预览舞台**：给 `catalog.html` 用的元素还原片段。
//
// ★★ 这不是运行时文件：只有作者工具 `tools/build-catalog.mjs` 读它（生成静态的 catalog.html）。
//    它**不随包分发**（打包白名单里没有 tools/），也不会被浏览器加载。
//
// ============================ 怎么用 ============================
// 元素表（`client/elements.js`）里每条记录都有一个 `stage`（用哪块舞台）与 `pick`（舞台里定位/高亮的局部选择器）。
// 目录页把舞台整块渲染出来，量出 `pick` 那个元素的边框盒，把预览裁到它附近 —— 这样**不需要**给每个元素
// 手写坐标，元素改位置预览也不会错。
//
// ============================ 三条纪律 ============================
//  ① **类名与结构照抄源码**（出处逐块写在下面）；没有官方美术时会走各组件自己的兜底（图标 / 首字），
//     所以缩略图上看到的"缺图"是**本机没有 public/assets** 导致的，不是结构错。
//  ② **尺寸一律 rem**（与游戏一致）：目录页把根字号固定为 100px（= 桌面 1920 时 1rem 的真实值），
//     于是"1rem = 100px"这条换算在预览里逐值成立。
//  ③ 舞台**不改**元素的类名与层级 —— 预览看到的 DOM 就是游戏里的 DOM（含共用的祖先 `.screen.gm` /
//     `.gm__hud`，否则作用域样式不生效）。
//
// ★ 已知近似（如实登记，见 README「预览的近似之处」）：
//   · 七段数字（倒计时 / 资源）用同尺寸的等宽数字代替真实 `.seg` 的多边形拼接；
//   · 图标用内联 SVG 代替官方 sprite（本机没有 `public/assets`）；
//   · 依赖运行时数据的元素（干员立绘 / 敌方头像 / 盟约图标）用兜底字形；
//   · 靠 JS 逐实例生成 keyframes 的元素（聊天弹幕 / 横幅）在预览里**停在起点**（目录页单独给了静止态样式）。

/** 内联图标（照 components.js 的 Icon 形态：`<svg class="icon" viewBox="0 0 24 24">`）。 */
export const ICONS = {
  search: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gear: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  book: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h5.5a2.5 2.5 0 0 1 2.5 2.5V19a2.5 2.5 0 0 0-2.5-2.5H4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M20 5.5h-5.5A2.5 2.5 0 0 0 12 8v11a2.5 2.5 0 0 1 2.5-2.5H20z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  exit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 12H9M17.5 8.5 21 12l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fs: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5V4h5.5M20 9.5V4h-5.5M4 14.5V20h5.5M20 14.5V20h-5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chat: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  emote: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5 17.5 10.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  snow: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4.2 7.5 19.8 16.5M4.2 16.5 19.8 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M20 3.5V8h-4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  eye: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  user: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  bolt: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5.5 13.5H11L10 22l7.5-11.5H12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5.4l3.6 2.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  music: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.8" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.8" cy="16" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};

const MICRO = (s) => '<span class="micro">' + s + '</span>';

// ==================================================================================================
// ② 顶栏（public/js/ui/hud.js TopBar :384-425；子件在 components.js / gameComponents.js）
// ==================================================================================================
const STAGE_TOP = [
  '<header class="gtop">',
  '  <div class="gtop__left">',
  '    <button type="button" class="btn btn--danger btn--lg btn--square gtop__exit tapx" aria-label="离开" title="离开 / 暂离">' + ICONS.exit + '</button>',
  '    <div class="gtop__meta">',
  '      <div class="gtop__net">',
  '        <span class="ping ping--low" title="当前延迟 28ms"><span class="ping__icon">▮</span><span class="ping__value">28</span><span class="ping__unit">ms</span></span>',
  '        <button type="button" class="specpill is-me"><span class="spec__ico">' + ICONS.eye + '</span><b class="specpill__num num">2</b></button>',
  '      </div>',
  '      <span class="dtag dtag--sm" style="--d-color:var(--amber)"><span class="dtag__icon">◆</span><span class="dtag__name">困难</span></span>',
  '    </div>',
  '  </div>',
  '  <div class="gtop__center brackets">',
  '    <button type="button" class="gtop__iconbtn tapx" aria-label="本局信息">' + ICONS.search + '</button>',
  '    <div class="roundbox"><span class="roundbox__label">回合</span><b class="roundbox__num num">3</b></div>',
  '    <div class="capsule capsule--combat"><span class="capsule__icon">' + ICONS.bolt + '</span><span class="capsule__label">作战</span><span class="capsule__tag">联防</span></div>',
  '    <span class="lp lp--lg is-pending" title="目标生命值"><span class="lp__icon">◈</span><b class="num lp__val">7</b><span class="lp__pend num">−2</span></span>',
  '    <span class="misstag has-art" title="本回合漏怪"><span class="misstag__icon">☠×</span><b class="misstag__n num">2</b></span>',
  '    <div class="dpbox" title="部署费用（再部署消耗）"><span class="dpbox__icon">◆</span><b class="num">12</b>' + MICRO('COST') + '</div>',
  '    <button type="button" class="enemybtn tapx is-wide" aria-label="敌方情报">' + ICONS.search + '<span class="enemybtn__chev">▶▶</span></button>',
  '  </div>',
  '  <div class="gtop__right">',
  '    <div class="gtop__clock">',
  '      <div class="countdown countdown--md" role="timer" aria-label="剩余24秒"><div class="countdown__main"><b class="num">00:24</b></div><div class="countdown__gauge" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i><i></i><i></i></div></div>',
  '      <button type="button" class="pausebtn tapx" aria-label="暂停"><svg class="pausebtn__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zm7.5 0H18v16h-4.5z"/></svg></button>',
  '    </div>',
  '    <div class="otwarn otwarn--drain" data-state="drain" role="alert"><span class="otwarn__blood"><span class="otwarn__icon">◈</span></span><span class="otwarn__tag">DOT</span><span class="otwarn__txt">超时 · 生命值 <b class="num">−2</b>/秒</span><span class="otwarn__lost">已流失 <b class="num">4</b></span></div>',
  '    <div class="readywrap">',
  '      <button type="button" class="readybtn tapx" aria-pressed="false"><span class="readybtn__box"></span><span class="readybtn__label">准备就绪</span><kbd class="readybtn__key">空格</kbd></button>',
  '      <span class="readywrap__why" role="status"><span>临时整备区 <b class="num">1</b> 个单位待处理</span></span>',
  '      <span class="readywrap__count">已就绪 <b class="num">2</b>/<span class="num">3</span></span>',
  '    </div>',
  '  </div>',
  '</header>',
].join('\n');

// ==================================================================================================
// ③ 盟约带（public/js/screens/game.js :1464-1479 + public/js/ui/bondStrip.js）
// ==================================================================================================
const STAGE_BONDS = [
  '<div class="gm__bonds">',
  '  <button type="button" class="bonds-toggle" aria-expanded="true" aria-label="收起盟约" title="收起盟约"><span class="icon">◀</span></button>',
  '  <div id="match-bond-strip" class="gm__bond-list">',
  '    <div class="bstrip" role="list" aria-label="盟约">',
  '      <div role="listitem" data-bond="bond_a" class="bslot is-active" title="先锋盟约"><span class="bglyph"><span class="bglyph__txt">先</span></span><span class="bslot__count num">2</span></div>',
  '      <div role="listitem" data-bond="bond_b" class="bslot" title="术师盟约"><span class="bglyph"><span class="bglyph__txt">术</span></span><span class="bslot__count num">1</span></div>',
  '      <div role="listitem" data-bond="bond_c" class="bslot" title="狙击盟约"><span class="bglyph"><span class="bglyph__txt">狙</span></span><span class="bslot__count num">3</span></div>',
  '      <div role="listitem" data-bond="bond_d" class="bslot" title="重装盟约"><span class="bglyph"><span class="bglyph__txt">重</span></span><span class="bslot__count num is-max">4</span></div>',
  '      <span class="bstrip__more num">+3</span>',
  '    </div>',
  '  </div>',
  '</div>',
].join('\n');

// ==================================================================================================
// ④ 左侧队伍列（public/js/ui/teamPanel.js :275-320 + gameComponents.js PlayerAvatar）
// ==================================================================================================
const STAGE_TEAM = [
  '<aside class="team" aria-label="同盟成员">',
  '  <div class="team__row is-self" tabindex="0">',
  '    <span class="pavatar pavatar--md is-self" style="--seat-hue:150"><span class="pavatar__img"><span class="pavatar__glyph">博</span></span></span>',
  '    <span class="team__frame" aria-hidden="true"></span>',
  '    <span class="team__you"><span class="icon">' + ICONS.user + '</span></span>',
  '    <span class="team__info"><span class="team__name">博士(你)</span>',
  '      <span class="team__line">生命 <b class="num">7</b> · 漏怪 <b class="num">2</b><span class="team__status is-ok"><span class="icon">●</span></span></span></span>',
  '  </div>',
  '  <div class="team__row is-team is-watched" tabindex="0">',
  '    <span class="pavatar pavatar--md is-team" style="--seat-hue:40"><span class="pavatar__img"><span class="pavatar__glyph">凯</span></span></span>',
  '    <span class="team__frame team__frame--plain" aria-hidden="true"></span>',
  '    <span class="team__info"><span class="team__name">凯尔希</span>',
  '      <span class="team__line">生命 <b class="num">9</b> · 漏怪 <b class="num">0</b><span class="team__status is-warn"><span class="icon">!' + '</span></span></span></span>',
  '    <span class="team__eye" title="正在查看"><span class="icon">' + ICONS.eye + '</span></span>',
  '    <button type="button" class="btn btn--secondary btn--sm team__back"><span class="btn__label">返回自己</span></button>',
  '    <span class="team__bubble" role="img" aria-label="发送表情"><span class="bubble__glyph">(๑•̀ㅂ•́)</span></span>',
  '  </div>',
  '  <div class="team__row is-dead" tabindex="0">',
  '    <span class="pavatar pavatar--md is-dead" style="--seat-hue:300"><span class="pavatar__img"><span class="pavatar__glyph">C</span></span><span class="pavatar__x" aria-label="已淘汰"><span class="icon">' + ICONS.close + '</span></span></span>',
  '    <span class="team__info"><span class="team__name">Cyan</span><span class="team__line">已淘汰</span></span>',
  '  </div>',
  '  <div class="team__row" tabindex="0">',
  '    <span class="pavatar pavatar--md is-bot" style="--seat-hue:210"><span class="pavatar__img"><span class="pavatar__bot">' + ICONS.user + '</span></span></span>',
  '    <span class="team__ai">AI</span>',
  '    <span class="team__info"><span class="team__name">AI 托管</span><span class="team__line">生命 <b class="num">10</b></span></span>',
  '  </div>',
  '</aside>',
].join('\n');

// ==================================================================================================
// ⑤ 右侧效果列（public/js/ui/effectsList.js :50-60）
// ==================================================================================================
const STAGE_EFFECTS = [
  '<div class="gm__effects">',
  '  <div class="effects" aria-label="生效中的效果">',
  MICRO('EFFECTS'),
  '    <span class="effect effect--band" tabindex="0"><span class="icon">' + ICONS.bolt + '</span><b class="effect__n num">2</b></span>',
  '    <span class="effect effect--team" tabindex="0"><span class="icon">◈</span><b class="effect__n num">1</b></span>',
  '    <span class="effect effect--x" tabindex="0"><span class="icon">✦</span></span>',
  '    <span class="effect effect--x" tabindex="0"><span class="icon">◍</span><b class="effect__n num">5</b></span>',
  '  </div>',
  '</div>',
].join('\n');

// ==================================================================================================
// ⑥ 调度中心（public/js/ui/shopBar.js :344-390；卡片 :100-205、奖励 :267-285）
// ==================================================================================================
const SCARD = (tier, name, price, bonds, pips, on) => [
  '<button type="button" class="scard scard--t' + tier + (on ? ' is-armed' : '') + '">',
  '  <span class="scard__art"><span class="scard__standin">立绘</span></span>',
  '  <span class="scard__water" aria-hidden="true"></span>',
  '  <span class="scard__top"><span class="scard__name">' + name + '</span><span class="scard__class">近卫</span></span>',
  '  <span class="scard__bonds">' + bonds.split('|').map((b) => '<span class="scard__bond"><span class="bglyph"><span class="bglyph__txt">' + b[0] + '</span></span><span>' + b + '</span></span>').join('') + '</span>',
  '  <span class="scard__pips" title="已拥有 1/3">' + Array.from({ length: 3 }, (_, i) => '<i class="' + (i < pips ? 'on' : '') + '"></i>').join('') + '</span>',
  '  <span class="scard__free">FREE</span>',
  '  <span class="scard__price">' + price + '</span>',
  '  <span class="scard__ice" aria-hidden="true"><span class="icon">' + ICONS.snow + '</span></span>',
  '</button>',
].join('');

const STAGE_SHOP = [
  '<section class="shopbar" aria-label="调度中心">',
  '  <div class="shopbar__row">',
  '    <div class="shopbar__tools">',
  '      <button type="button" class="toolbtn toolbtn--ice"><span class="toolbtn__img">' + ICONS.snow + '</span><span class="toolbtn__free">免费 ×1</span></button>',
  '      <button type="button" class="toolbtn"><span class="toolbtn__img">' + ICONS.refresh + '</span><span class="hex hex--gold hex--sm">1</span></button>',
  '    </div>',
  '    <div class="shopbar__cards">',
  SCARD(6, '银灰', 3, '先锋|近卫', 1, false),
  SCARD(5, '能天使', 2, '狙击', 2, false),
  SCARD(4, '桃金娘', 1, '辅助', 0, false),
  SCARD(3, '玫兰莎', 0, '近卫', 3, false),
  SCARD(3, '芙蓉', 1, '医疗', 0, false),
  '    </div>',
  '    <div class="shopbar__remain"><b class="num t-orange">3</b><span>可放置</span></div>',
  '    <button type="button" class="lvcard"><span class="lvcard__label">调度中心等级</span><b class="lvcard__num num">4</b><span class="lvcard__price">2</span></button>',
  '    <span class="funds"><span class="funds__coin">◉</span><b class="funds__num num">14</b><span class="funds__label">资金</span></span>',
  '  </div>',
  '</section>',
].join('\n');

// ==================================================================================================
// ⑦ 左下角功能键（public/js/screens/game.js :1514-1520 + public/js/ui/emotes.js :310-333）
// ==================================================================================================
const STAGE_CORNER = [
  '<div class="gm__corner">',
  '  <div class="ewheel">',
  '    <button type="button" class="ewheel__btn" aria-expanded="true"><span class="icon">' + ICONS.emote + '</span><span class="ewheel__label">交流</span></button>',
  '    <div class="ewheel__panel" role="dialog" aria-label="交流">',
  '      <div class="ewheel__page">',
  '        <button type="button" class="ewheel__item" data-emote="e_hi" aria-label="打招呼"><span class="eart eart--glyph">' + ICONS.emote + '</span></button>',
  '        <button type="button" class="ewheel__item" data-emote="e_ok" aria-label="没问题"><span class="eart eart--glyph">✓</span></button>',
  '        <button type="button" class="ewheel__item" data-emote="e_sad" aria-label="抱歉"><span class="eart eart--glyph">…</span></button>',
  '        <button type="button" class="ewheel__item" data-emote="e_go" aria-label="出发"><span class="eart eart--glyph">→</span></button>',
  '        <button type="button" class="ewheel__item" data-emote="e_help" aria-label="救命"><span class="eart eart--glyph">!!</span></button>',
  '        <button type="button" class="ewheel__item" data-emote="e_gg" aria-label="打得好"><span class="eart eart--glyph">★</span></button>',
  '      </div>',
  '      <div class="ewheel__dots" role="tablist">',
  '        <button type="button" role="tab" class="ewheel__dot is-on" aria-label="第 1 页"></button>',
  '        <button type="button" role="tab" class="ewheel__dot" aria-label="第 2 页"></button>',
  '      </div>',
  '    </div>',
  '  </div>',
  '  <button type="button" class="gm__gear" aria-label="设置" title="设置">' + ICONS.gear + '</button>',
  '  <button type="button" class="gm__gear gm__guide" aria-label="玩法说明" title="玩法说明">' + ICONS.book + '</button>',
  '  <button type="button" class="gm__gear gm__fs fsbtn" aria-label="全屏" title="全屏">' + ICONS.fs + '</button>',
  '</div>',
  '<div class="corner-tail">（Mod 追加键：cyanfish.debug-console 的调试控制台）</div>',
].join('\n');

// ==================================================================================================
// ⑧ 提示与状态（ticker.js :156 · toasts.js :130 · game.js :1487-1510 · components.js PhaseBanner/ResultDialog）
// ==================================================================================================
const STAGE_HINT = [
  '<div class="ticker" role="status" aria-live="polite"><div class="ticker__line"><span class="ticker__icon">⚑</span><span>第 3 回合开始 · 敌方本波来袭</span></div></div>',
  '<div class="gm__watching" role="status"><span class="icon">' + ICONS.eye + '</span><span>正在查看 <b>凯尔希</b> 的阵地（只读）</span><button type="button" class="btn btn--primary btn--sm"><span class="btn__label">返回自己</span></button></div>',
  '<div class="gm__dead" role="status"><span class="icon">' + ICONS.close + '</span>你已被淘汰 · 可继续观战队友</div>',
  '<div class="tooltip is-shown tooltip--bottom" data-dja-shift="d" role="tooltip">预览用的 tooltip（真实运行时按需要出现）</div>',
  '<div class="pbanner" data-dja-shift="a" role="status"><span class="pbanner__title">作战阶段</span><span class="pbanner__sub">第三回合</span></div>',
  '<div class="rdialog" data-dja-shift="b" role="status"><span class="rdialog__title">作战胜利</span><span class="rdialog__sub">本波敌人已清空</span></div>',
  '<div class="toast-host" role="status" aria-live="polite">',
  '  <div class="toast toast--warn"><svg class="toast__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z"/></svg><span class="toast__text">无法部署在该位置</span><span class="toast__count">×2</span></div>',
  '  <div class="toast toast--error"><svg class="toast__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 13.6L15.6 17 12 13.4 8.4 17 7 15.6 10.6 12 7 8.4 8.4 7 12 10.6 15.6 7 17 8.4 13.4 12 17 15.6Z"/></svg><span class="toast__text">资金不足</span></div>',
  '</div>',
].join('\n');

// ==================================================================================================
// ⑨ 战斗覆盖层（public/js/ui/combatHud.js :23-92 · matchChrome.js :111-117 · underframe.js :158-176）
// ==================================================================================================
const STAGE_COMBAT = [
  '<div class="chud">',
  '  <div class="chud__progress" role="list" aria-label="队友作战进度">',
  '    <span role="listitem" class="chud__prog is-done"><span class="chud__prog__ok" aria-label="作战结束">✓</span></span>',
  '    <span role="listitem" class="chud__prog"><span class="num">3/8</span></span>',
  '    <span role="listitem" class="chud__prog"><span class="num">•••</span></span>',
  '  </div>',
  '  <div class="chud__bottom">',
  '    <div class="chud__msg chud__msg--dead" role="status"><span class="icon">' + ICONS.close + '</span><span>你已被淘汰，可点击左侧成员头像前往查看</span></div>',
  '    <div class="vswitch chud__layers"><button type="button" class="vswitch__arrow" aria-label="左侧战场">◀</button><span class="vswitch__label">第 1 层 / 第 2 层</span><button type="button" class="vswitch__arrow" aria-label="右侧战场">▶</button></div>',
  '  </div>',
  '</div>',
  '<div class="awayov" data-dja-shift="a" role="dialog" aria-label="AI 托管中"><div class="awayov__box brackets"><span class="awayov__icon">' + ICONS.user + '</span><p>AI 正在代为操作你的席位</p><p class="t-lo">暂时离开，随时可以返回</p></div></div>',
  '<div class="tempnote" aria-hidden="false"><svg class="tempnote__frame" aria-hidden="true"><polygon points="0,10 10,0 200,0 210,10 210,40 200,50 10,50 0,40" /></svg><div class="tempnote__label is-top" role="status"><b class="tempnote__title"><span class="icon">!</span>临时整备区 <span class="num">2</span> 个单位待处理</b><span class="tempnote__rule">放入整备区或战场后才能准备就绪</span></div></div>',
].join('\n');

// ==================================================================================================
// ⑩ 部署交互（public/js/ui/underframe.js :90-115 · facingWheel.js :269-290）
// ==================================================================================================
const STAGE_DEPLOY = [
  '<div class="uframe" role="group" style="left:3.2rem;top:2.6rem;width:2rem;height:2rem">',
  '  <svg class="uframe__dia" viewBox="-110 -110 220 220" aria-hidden="true">',
  '    <path class="uframe__outer" d="M0 -100 L100 0 L0 100 L-100 0 Z" />',
  '    <path class="uframe__corner" d="M-100 0 L-86 -14 M-100 0 L-86 14 M100 0 L86 -14 M100 0 L86 14 M0 -100 L-14 -86 M0 -100 L14 -86 M0 100 L-14 86 M0 100 L14 86" />',
  '  </svg>',
  '  <button type="button" class="uframe__btn uframe__btn--retreat"><span class="icon">' + ICONS.exit + '</span><span class="uframe__label">撤退[E]</span></button>',
  '  <button type="button" class="uframe__btn uframe__btn--sell"><span class="icon">◉</span><span class="uframe__label">出售[Q]</span><span class="uframe__price hex hex--gold hex--sm">+2</span></button>',
  '  <button type="button" class="uframe__btn uframe__btn--destroy"><span class="icon">' + ICONS.close + '</span><span class="uframe__label">销毁</span></button>',
  '</div>',
  '<div class="fwheel" role="dialog" aria-label="选择「银灰」的朝向" tabindex="-1">',
  '  <div class="fwheel__dia" style="left:3.2rem;top:2.6rem;width:2.6rem;height:2.6rem">',
  '    <svg class="fwheel__svg" viewBox="-110 -110 220 220" aria-hidden="true"><path class="fwheel__outer" d="M0 -100 L100 0 L0 100 L-100 0 Z" /><g class="fwheel__chev is-on" transform="translate(0 -80) rotate(0)"><path d="M0 -7 7 5h-14z" /></g><g class="fwheel__chev" transform="translate(80 0) rotate(90)"><path d="M0 -7 7 5h-14z" /></g><g class="fwheel__chev" transform="translate(0 80) rotate(180)"><path d="M0 -7 7 5h-14z" /></g><g class="fwheel__chev" transform="translate(-80 0) rotate(-90)"><path d="M0 -7 7 5h-14z" /></g></svg>',
  '    <span class="fwheel__x fwheel__x--txt">✕</span>',
  '  </div>',
  '  <span class="fwheel__tip" role="status">拖回中心区域取消</span>',
  '</div>',
].join('\n');

// ==================================================================================================
// ⑪ 机变 / 教鞭选择（public/js/ui/choiceOverlay.js :211-285）
// ==================================================================================================
const SPCARD = (kind, name, tier) => [
  '<button type="button" class="spcard spcard--' + kind + ' is-pickable">',
  '  <span class="spcard__glow" aria-hidden="true"></span>',
  '  <span class="spcard__head"><span class="spcard__icon"><span class="icon">' + (kind === 'bounty' ? '◎' : ICONS.bolt) + '</span></span>',
  '    <span class="spcard__title"><span class="spcard__name">' + name + '</span><span class="spcard__tier num">' + tier + ' 阶</span></span></span>',
  '  <span class="spcard__desc">选择后立即生效：本回合内全队获得对应加成。</span>',
  '</button>',
].join('');

const STAGE_CHOICE = [
  '<div class="spov" role="dialog" aria-label="机变阶段">',
  '  <div class="spov__veil" aria-hidden="true"></div>',
  '  <div class="spov__inner">',
  '    <div class="spov__head">',
  '      <div class="spov__titles"><span class="spov__title">机变阶段</span><span class="spov__sub">从候选卡中选择一项</span></div>',
  '      <span class="spov__turntxt is-mine">当前轮到你决策</span>',
  '      <span class="countdown countdown--sm" role="timer"><span class="countdown__main"><b class="num">00:18</b></span></span>',
  '    </div>',
  '    <div class="spov__order" aria-label="决策顺序">',
  '      <span class="spov__wname">决策顺序</span>',
  '      <div class="spov__who is-cur is-self"><span class="pavatar pavatar--sm"><span class="pavatar__img"><span class="pavatar__glyph">博</span></span></span><span class="spov__wname">博士</span><span class="spov__wstate"><span class="icon">◌</span></span></div>',
  '      <div class="spov__who is-done"><span class="pavatar pavatar--sm"><span class="pavatar__img"><span class="pavatar__glyph">凯</span></span></span><span class="spov__wname">凯尔希</span><span class="spov__wstate"><span class="icon">' + ICONS.check + '</span></span></div>',
  '    </div>',
  '    <div class="spov__grid spov__grid--paged">',
  SPCARD('bounty', '赏金任务', 4),
  SPCARD('bounty', '紧急补给', 3),
  SPCARD('bounty', '战术特训', 5),
  '    </div>',
  '    <div class="spov__pager" aria-label="页码"><span class="spov__pgcount">1 / 2</span><button type="button" class="spov__pgdot is-cur"></button><button type="button" class="spov__pgdot"></button></div>',
  '  </div>',
  '</div>',
].join('\n');

// ==================================================================================================
// ⑫ 详情窗格（detailPanel.js :831 的 .dpanel · bondStrip.js :136 的 .bpop · enemyDrawer.js :103 的 .edrawer）
//     ★ 三块各自一个舞台：它们在游戏里**同一时刻只开一块**（而且互不重叠地贴不同的边），
//       挤在同一块舞台里会互相盖住 ⇒ 拆开，预览才看得清。
// ==================================================================================================
const STAGE_DETAIL = [
  '<aside class="dpanel brackets dpanel--chess" data-side="left" role="dialog" aria-label="干员详情">',
  '  <button type="button" class="dpanel__close" aria-label="关闭">' + ICONS.close + '</button>',
  '  <div class="dpanel__scroll">',
  '    <header class="dhead"><span class="dhead__art dhead__art--t6"><span class="dhead__for">立绘</span></span>',
  '      <span class="dhead__info"><span class="dhead__name">银灰</span><span class="dhead__en">SILVERASH</span>',
  '        <span class="dhead__chips"><span class="dhead__prof">近卫</span><span class="dhead__pos">近战</span></span></span></header>',
  '    <section class="dsec"><h4 class="dsec__title">属性</h4><div class="dstats">',
  '      <div class="dstat"><span class="dstat__k">攻击</span><span class="dstat__v num">720</span></div>',
  '      <div class="dstat"><span class="dstat__k">防御</span><span class="dstat__v num">410</span></div>',
  '    </div></section>',
  '    <section class="dsec"><h4 class="dsec__title">盟约</h4><div class="dbonds"><span class="dbond is-active"><span class="dbond__icon">先</span><span class="dbond__count num">2</span></span></div></section>',
  '  </div>',
  '</aside>',
].join('\n');

const STAGE_BPOP = [
  '<div class="bpop brackets bpop--beside" data-place="beside" role="dialog" aria-label="盟约详情">',
  '  <header class="bpop__head"><span class="bpop__name">先锋盟约</span><span class="bpop__tier">T2</span><button type="button" class="bpop__close" aria-label="关闭">' + ICONS.close + '</button></header>',
  '  <p class="bpop__desc">部署先锋干员时额外获得部署费用。</p>',
  '  <div class="bpop__tiers"><span class="bpop__tier is-on"><b class="num">1</b><small>名及以下</small></span><span class="bpop__tier is-on"><b class="num">2</b><small>名及以下</small></span><span class="bpop__tier"><b class="num">4</b><small>名及以下</small></span></div>',
  '  <div class="bpop__members">',
  '    <button type="button" class="bpop__member is-on"><span class="uthumb uthumb--chess uthumb--md"><span class="uthumb__art">推</span></span><span class="bpop__mname">推进之王</span></button>',
  '    <button type="button" class="bpop__member is-owned"><span class="uthumb uthumb--chess uthumb--md"><span class="uthumb__art">嵯</span></span><span class="bpop__mname">嵯峨</span></button>',
  '    <button type="button" class="bpop__member is-banned"><span class="uthumb uthumb--chess uthumb--md"><span class="uthumb__art">凛</span></span><span class="bpop__mname">凛冬</span><span class="bpop__ban">' + ICONS.close + '</span></button>',
  '  </div>',
  '</div>',
].join('\n');

const STAGE_EDRAWER = [
  '<div class="edrawer brackets" role="dialog" aria-label="敌方情报">',
  '  <header class="edrawer__top"><span class="edrawer__sum">第 3 回合 · 即将迎击 <b class="num">6</b> 名敌人</span><button type="button" class="edrawer__close" aria-label="关闭">' + ICONS.close + '</button></header>',
  '  <div class="edrawer__body"><div class="elist">',
  '    <button type="button" class="erow erow--normal"><span class="uthumb uthumb--enemy uthumb--md"><span class="uthumb__art">兵</span></span><span class="erow__text"><span class="erow__name">源石虫</span><span class="erow__tags"><span class="etag etag--faction">感染者</span></span></span><span class="erow__count num">×4</span></button>',
  '    <button type="button" class="erow erow--elite"><span class="uthumb uthumb--enemy uthumb--md"><span class="uthumb__art">盾</span></span><span class="erow__text"><span class="erow__name">重装防御者</span><span class="erow__tags"><span class="etag etag--elite">精英</span><span class="etag etag--fly">空中</span></span></span><span class="erow__count num">×2</span></button>',
  '    <button type="button" class="erow erow--boss"><span class="uthumb uthumb--enemy uthumb--md"><span class="uthumb__art">领</span></span><span class="erow__text"><span class="erow__name">领袖单位</span><span class="erow__tags"><span class="etag etag--boss">BOSS</span></span></span><span class="erow__count num">×1</span></button>',
  '  </div></div>',
  '  <div class="ibonds"><span class="ibond is-off" title="阿戈尔（本局禁用）"><span class="bglyph"><span class="bglyph__txt">阿</span></span><span class="ibond__ban num">' + ICONS.user + '3</span></span><span class="ibond"><span class="bglyph"><span class="bglyph__txt">先</span></span></span><span class="ibond"><span class="bglyph"><span class="bglyph__txt">术</span></span></span></div>',
  '</div>',
].join('\n');

// ==================================================================================================
// ⑬ 弹窗（components.js Modal :456-468 · settings.js :248-290 · matchChrome.js :94-104）
// ==================================================================================================
const STAGE_MODAL = [
  '<div class="modal" role="presentation">',
  '  <div class="modal__box brackets modal__box--mint" role="dialog" aria-modal="true" tabindex="-1" style="width:7.4rem">',
  '    <div class="modal__stripe" aria-hidden="true"></div>',
  '    <header class="modal__head"><span class="micro">SETTINGS</span><h2 class="modal__title">设置</h2></header>',
  '    <div class="modal__body">',
  '      <div class="set-list">',
  '        <label class="set-row"><span class="set-row__label">音量</span><input class="set-range" type="range" min="0" max="100" value="70" style="--pct:70%" /><span class="set-row__val num">70</span></label>',
  '        <div class="set-row"><span class="set-row__label">文字大小</span><div class="set-seg" role="radiogroup"><button type="button" role="radio" class="is-on" aria-checked="true">标准</button><button type="button" role="radio" aria-checked="false">大</button></div></div>',
  '        <div class="set-row"><span class="set-row__label">全屏</span><button type="button" class="set-toggle is-on" role="switch" aria-checked="true"><i></i><span>开启</span></button></div>',
  '      </div>',
  '      <div class="sp-ms__embed" data-sp-ms-embed="1">',
  '        <nav class="sp-ms__nav" aria-label="模组设置栏目">',
  '          <button type="button" class="sp-ms__tab is-on">🎉 DJ 整活</button>',
  '          <button type="button" class="sp-ms__tab">对局聊天</button>',
  '        </nav>',
  '        <div class="sp-ms__box sp-ms__box--embed"><div class="sp-ms__pane">',
  '          <div class="set-list"><div class="set-row"><span class="set-row__label">总开关</span><button type="button" class="set-toggle" role="switch" aria-checked="false"><i></i><span>关闭</span></button></div></div>',
  '        </div></div>',
  '      </div>',
  '    </div>',
    '    <footer class="modal__actions"><button type="button" class="btn btn--secondary btn--md"><span class="btn__label">玩法说明</span></button><button type="button" class="btn btn--primary btn--md"><span class="btn__label">完成</span></button></footer>',
  '  </div>',
  '</div>',
].join('\n');

// 「离开模拟」确认弹窗 —— ★ 单独一块舞台：它与设置弹窗都是**居中铺满**的整屏层，同屏必然互相盖住。
const STAGE_MODALX = [
  '<div class="modal" role="presentation"><div class="modal__box brackets modal__box--red" role="dialog" aria-modal="true" tabindex="-1" style="width:6.8rem">',
  '  <div class="modal__stripe" aria-hidden="true"></div>',
  '  <header class="modal__head"><span class="micro">LEAVE SIMULATION</span><h2 class="modal__title">离开模拟</h2></header>',
  '  <div class="modal__body"><div class="exitm"><p><b class="t-ice">暂离</b>：由 AI 托管你的席位（自动部署、准备与选择），随时可以返回。</p><p><b class="t-red">放弃模拟</b>：离开后无法返回本局，你的干员将回到共享卡池。</p></div></div>',
  '  <footer class="modal__actions"><button type="button" class="btn btn--secondary btn--md"><span class="btn__label">取消</span></button><button type="button" class="btn btn--danger btn--md"><span class="btn__label">确定离开</span></button></footer>',
  '</div></div>',
].join('\n');

// ==================================================================================================
// ⑭ 场内画布对象（PIXI）—— 这一层**不是 DOM**，本舞台只是"它在画面哪个位置、长什么样"的示意图。
//     用内联样式画（游戏不提供这些的 CSS），坐标按 19.2rem × 10.8rem 的战斗屏折算。
// ==================================================================================================
const PIXI = (k, label, x, y, w, h, html) => '<div class="dja-pixi" data-pixi="' + k + '" style="left:' + x + 'rem;top:' + y + 'rem;width:' + w + 'rem;height:' + h + 'rem">'
  + html + '<span class="dja-pixi__tag">' + label + '</span></div>';

const STAGE_CANVAS = [
  '<div class="dja-field" aria-hidden="true">',
  '  <div class="dja-field__grid"></div>',
  PIXI('op', '干员（Spine）', 4.2, 4.6, 1.1, 2.0,
    '<span class="dja-op"></span>'),
  PIXI('hud', '场内血条（单位头顶）', 4.2, 4.1, 1.1, 0.5,
    '<span class="dja-bar"><i style="width:72%"></i></span><span class="dja-sp"><i style="width:40%"></i></span>'),
  PIXI('enemy', '敌方', 8.6, 6.2, 1.0, 1.8, '<span class="dja-enemy"></span>'),
  PIXI('token', '召唤物', 6.0, 7.4, 0.6, 0.9, '<span class="dja-token"></span>'),
  PIXI('device', '装置箱体 / 炮台', 11.4, 5.2, 1.0, 1.0, '<span class="dja-device"></span>'),
  PIXI('item', '装备 / 掉落物', 7.2, 8.4, 0.7, 0.7, '<span class="dja-item"></span>'),
  PIXI('num', '伤害数字', 5.4, 3.0, 0.9, 0.45, '<span class="dja-num">-428</span>'),
  PIXI('fx', '特效（粒子 / 弹道 / 环）', 9.8, 3.4, 1.6, 1.0, '<span class="dja-fx"></span>'),
  PIXI('range', '攻击范围高亮', 3.4, 7.0, 2.6, 2.6, '<span class="dja-range"></span>'),
  PIXI('beam', '光束（默认不做）', 12.4, 7.6, 1.2, 2.2, '<span class="dja-beam"></span>'),
  '</div>',
].join('\n');

// ==================================================================================================
// ⑮ Mod 新增（局内）：cyanfish.chat / cyanfish.banner / cyanfish.debug-console / cyanfish.mod-settings
//     类名与结构取自各自 client/**（出处：chat/panel.js :145-215、chat/danmaku.js :280-289、
//     banner/style.js 的 .sp-bn--game、debug-console/index.js :64-70 + panel.js、mod-settings/style.js）
// ==================================================================================================
const STAGE_MOD = [
  // ---- cyanfish.chat：右上角图标键（收起态） ----
  '<button type="button" class="sp-chat__tab" data-sp-chat-tab="1" data-sp-chat-unread="1" aria-label="对局聊天" aria-expanded="false">'
    + ICONS.chat + '<span class="sp-chat__dot" data-sp-chat-dot="1" aria-hidden="true"></span></button>',
  // ---- cyanfish.chat：展开的面板 ----
  '<div class="sp-chat__box" data-sp-chat-open="1" data-sp-chat-fs="1">',
  '  <div class="sp-chat__head"><span class="sp-chat__title">对局聊天</span>',
  '    <span class="sp-chat__acts"><button type="button" class="sp-chat__icon" aria-label="清空记录">' + ICONS.close + '</button>',
  '      <button type="button" class="sp-chat__icon" aria-label="收起聊天" aria-expanded="true">' + ICONS.exit + '</button></span></div>',
  '  <div class="sp-chat__feed" role="log" aria-live="polite">',
  '    <div class="sp-chat__msg is-sys"><span class="sp-chat__text">已加入对局聊天</span></div>',
  '    <div class="sp-chat__msg"><span class="sp-chat__who">凯尔希</span><span class="sp-chat__text">这边漏怪了，帮我补一下</span></div>',
  '    <div class="sp-chat__msg is-me"><span class="sp-chat__who is-me">我</span><span class="sp-chat__text">收到，我拉一下仇恨</span></div>',
  '  </div>',
  '  <div class="sp-chat__foot"><div class="sp-chat__inputrow">',
  '    <textarea class="sp-chat__field" data-sp-chat-input="1" rows="1" placeholder="说点什么…（回车发送）"></textarea>',
  '    <button type="button" class="btn btn--primary btn--sm sp-chat__send" disabled=""><span class="btn__label">发送</span></button>',
  '  </div><div class="sp-chat__meta"><span class="sp-chat__count num">0/60</span><span class="sp-chat__hint">回车发送 · 最多 60 字</span></div></div>',
  '</div>',
  // ---- cyanfish.chat：对局内弹幕（停在起点，目录页另有静止态样式） ----
  '<div class="sp-cm" role="status" aria-live="polite" data-sp-cm="1" data-sp-cm-speed="1" style="--sp-cm-fs:1">',
  '  <div class="sp-cm__row" data-sp-cm-row="1"><span class="sp-cm__badge" aria-hidden="true">[聊]</span><span class="sp-cm__who">凯尔希</span><span class="sp-cm__sep" aria-hidden="true">·</span><span class="sp-cm__text">这边漏怪了，帮我补一下</span></div>',
  '</div>',
  // ---- cyanfish.banner：对局内横幅 ----
  '<div class="sp-bn sp-bn--game"><div class="sp-bn__row"><span class="sp-bn__dot"></span><span class="sp-bn__text">服务器 22:00 重启，请提前结束战斗</span></div></div>',
  // ---- cyanfish.debug-console：左下角入口键 + 面板 ----
  '<button type="button" class="btn btn--secondary btn--md btn--square gm__gear sp-dc__gear" title="调试控制台（仅单人 / 全 AI 对局）" aria-label="调试控制台">' + ICONS.edit + '</button>',
  '<div class="sp-dc__pane brackets" role="dialog" aria-label="调试控制台">',
  '  <header class="sp-dc__topbar"><span class="sp-dc__label">调试控制台</span><button type="button" class="sp-dc__close" aria-label="关闭">' + ICONS.close + '</button></header>',
  '  <div class="sp-dc__tabs"><button type="button" class="sp-dc__tab is-on">状态</button><button type="button" class="sp-dc__tab">基础</button><button type="button" class="sp-dc__tab">干员</button></div>',
  '  <div class="sp-dc__body" data-dc-pane="state"><dl class="sp-dc__state">',
  '    <div class="sp-dc__stat"><dt>阶段</dt><dd data-dc="phase">PREP</dd></div>',
  '    <div class="sp-dc__stat"><dt>回合</dt><dd class="num" data-dc="round">3</dd></div>',
  '    <div class="sp-dc__stat"><dt>资金</dt><dd class="num" data-dc="funds">14</dd></div>',
  '  </dl><p class="sp-dc__read" data-dc="gate">闸门：单人 / 全 AI 对局 ✓ · 服务器开关 已开 ✓</p></div>',
  '</div>',
].join('\n');

// ==================================================================================================
// ⑯ 附：局外（标题 / 大厅 / 干员调配 / 结算）上的 Mod 元素 —— 只作"有据可查"，默认不在旋转范围
//     ★ 这一块**不套 `.screen.gm`**（wrap: 'plain'）：这些元素在游戏里就不在战斗屏里，各自带自己的样式；
//       套上战斗屏反而会让它们叠在一起、也看不出原本的样子。这里按"一格一件 + 标签"平铺。
// ==================================================================================================
const CELL = (label, inner) => '<div class="dja-outcell">' + inner + '<span class="dja-outlabel">' + label + '</span></div>';

const STAGE_OUTGAME = [
  CELL('cyanfish.online · 在线人数徽章',
    '<span class="sp-on"><span class="sp-on__seg"><span class="sp-on__k">在线</span><span class="sp-on__v">12</span></span><span class="sp-on__seg"><span class="sp-on__sep">·</span><span class="sp-on__k">对局</span><span class="sp-on__v">3</span></span></span>'),
  CELL('cyanfish.mod-settings · 模组设置入口键',
    '<button type="button" class="settings-btn sp-ms__gear">' + ICONS.gear + '<span>模组设置</span></button>'),
  CELL('cyanfish.skinvoice · 调配顶栏键',
    '<button type="button" class="btn btn--secondary btn--sm sp-sv__gear"><span class="sp-sv__svg">' + ICONS.music + '</span><span class="btn__label">皮肤与语音</span></button>'),
  CELL('cyanfish.skinvoice · 调配页浮键',
    '<button type="button" class="sp-sv__fab sp-sv__fab--loadout"><span class="sp-sv__svg">' + ICONS.gear + '</span><span>皮肤与语音</span></button>'),
  CELL('cyanfish.loadout-io · 导入导出键',
    '<button type="button" class="loio-btn btn btn--secondary btn--sm"><span class="btn__label">导入 / 导出</span></button>'),
  CELL('cyanfish.diy-34 · 自选编队规则提示',
    '<span data-sp-diy-note="1" class="diy-tier-note">3 阶自选位：本局只留一个</span>'),
  CELL('cyanfish.announce · 更新公告栏',
    '<div class="sp-an"><div class="sp-an__list"><div class="sp-an__item"><div class="sp-an__head"><span class="sp-an__title">0.2.5 更新</span><span class="sp-an__date">2026-10-13</span></div><div class="sp-an__body"><p class="sp-an__p">新增「实时横幅公告」与「对局内聊天」。</p></div></div></div><p class="sp-an__note">共 1 条新公告，关闭后不再自动弹出。</p></div>'),
  CELL('cyanfish.banner · 首页横幅',
    '<div class="sp-bn"><div class="sp-bn__row is-warn"><span class="sp-bn__dot"></span><span class="sp-bn__text">今晚 22:00 服务器维护，预计 10 分钟</span><span class="sp-bn__link">详情</span></div></div>'),
].join('\n');

// ==================================================================================================
// ① 战斗屏骨架：把上面几块拼进 `.screen.gm`（只有这一块用 `wrap: 'screen'`）
// ==================================================================================================
const STAGE_SHELL = [
  '<div class="gm__field"></div>',
  '<div class="gm__loading">' + MICRO('LOADING FIELD') + '</div>',
  '<div class="gm__vignette" aria-hidden="true"></div>',
  '<div class="gm__hud">',
  STAGE_TOP,
  STAGE_BONDS,
  STAGE_TEAM,
  STAGE_EFFECTS,
  STAGE_SHOP,
  STAGE_CORNER,
  '</div>',
].join('\n');

/**
 * 舞台表。`wrap` 决定每块舞台嵌在哪一层容器里（作用域样式需要）：
 *   'screen' = 直接放进 `.screen.gm`；'hud' = 放进 `.gm__hud`；'plain' = 只套一层中性容器（局外的 Mod 元素用）。
 */
export const STAGES = Object.freeze({
  shell: { wrap: 'screen', html: STAGE_SHELL },
  top: { wrap: 'hud', html: STAGE_TOP },
  bonds: { wrap: 'hud', html: STAGE_BONDS },
  team: { wrap: 'hud', html: STAGE_TEAM },
  effects: { wrap: 'hud', html: STAGE_EFFECTS },
  shop: { wrap: 'hud', html: STAGE_SHOP },
  corner: { wrap: 'hud', html: STAGE_CORNER },
  hint: { wrap: 'screen', html: STAGE_HINT },
  combat: { wrap: 'hud', html: STAGE_COMBAT },
  deploy: { wrap: 'hud', html: STAGE_DEPLOY },
  choice: { wrap: 'screen', html: STAGE_CHOICE },
  detail: { wrap: 'screen', html: STAGE_DETAIL },
  bpop: { wrap: 'screen', html: STAGE_BPOP },
  edrawer: { wrap: 'screen', html: STAGE_EDRAWER },
  modal: { wrap: 'screen', html: STAGE_MODAL },
  modaldanger: { wrap: 'screen', html: STAGE_MODALX },
  canvas: { wrap: 'hud', html: STAGE_CANVAS },
  mod: { wrap: 'hud', html: STAGE_MOD },
  outgame: { wrap: 'plain', html: STAGE_OUTGAME },
});
