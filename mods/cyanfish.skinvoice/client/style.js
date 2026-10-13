// mods/cyanfish.skinvoice/client/style.js — 本 Mod 自带的样式，注入 <head>，卸载即消失。
//
// ★ 只做两件事：
//   ① 顶栏三件（皮肤下拉 / 语音下拉 / 齿轮）的**宽度收敛** —— 下拉栏要能塞进顶栏，
//      还得在手机网页端不溢出；
//   ② 设置弹窗里"宿主没提供"的几处小部件（试听按钮、操作行、块容器）；
//   ③ ★ 0.10.0：**自选编队页每个槽位**的皮肤控件（`.sp-sv__diy*`，见下）。
//   其余一律**复用宿主已有的 class**（.set-list / .set-row / .set-seg / .set-toggle / .set-range /
//   .set-hint / .tabs / .modal / .btn），这是 Mod 规范 §6.4-3 允许且推荐的做法
//   ——「需要样式就用宿主已有的 class」。
//
// ★ 只复用宿主的 CSS 变量（主题自适应，不写死深浅色），不往仓库的 css/ 里加文件。
//   尺寸口径跟宿主一致：rem 基准 + max(…, px) 兜底（宿主 css 用同一套写法应对手机网页端）。

const STYLE_ID = 'sp-mod-cyanfish.skinvoice-style';

/** 宿主 .lo-select 用过的下拉箭头（同一张 data-URI，观感一致）。 */
const CARET = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'><path fill=\'%234ed8af\' d=\'M7 9l5 6 5-6z\'/></svg>';

export const CSS = `
/* ---- 顶栏三件 ───────────────────────────────────────────────────────────────────────────────── */
/* ★★ 0.18.0：入口挂在顶栏**左簇**（插槽 loadout.topbarLeft，紧随官方「返回」）。三条硬约束照旧，
   只是"哪一边会溢出"换了方向：左簇是 justify-self:start ⇒ 内容超过列宽就**向右**压中间那列标题。
   maxWidth = 本簇余量 这条硬保证仍然成立（见 index.js 的 useTopbarFit → budgetOf）。
   ★★ 三条硬约束，都是实测出来的（数字见 index.js 的 MIN_BUDGET 上方那张表）：
   ① 不能 flex-wrap:wrap —— 宿主 .lo-top 是「三列 grid + 固定高 max(1rem,48px)」（loadout.css:38-43），
      一 wrap 就变 2 行 62px 高、**竖着溢出**顶栏（实测 860x414：svH=62 > topH=48）。
   ② 整簇必须有 max-width —— 宿主是 minmax(max-content,1fr) 列，内容超列宽就溢出压中间那列标题
      （CSS grid 不裁）。实测 1024x600：右簇自然宽 643 / 列宽 439 ⇒ 皮肤下拉整个压在「干员调配」上
      （截图可见）。所以 JS 每帧把实测余量写成 inline maxWidth（见 useTopbarFit），
      下面的 13.6vw 只是"JS 还没量完的那一帧"的兜底。
   ③ ★★ **每个子项都必须能被压窄**，而且下限要是**写死的 px/rem**，不能靠 min-width:auto。
      踩过的坑：.sp-sv__sel 留 min-width:auto 时，它的 min-content 会被里面 <select> 的**最宽选项**
      顶到一两百像素（原生 select 不换行、不省略）⇒ flex 收缩被这个"自动下限"卡住，
      实测 667x375：预算 106，子项实占 151 ⇒ 溢出 45px 把**齿轮整个推到「全部恢复默认」底下**（截图可见）。
      所以：label 用 calc() 明确写出自己的下限；里面 select 用 min-width:0 跟着 label 走。
      改这里的 min-width 就必须回头改 index.js 的 LEFT_TIER_BY_BUDGET（那边按 70px 可用宽反推阈值）。 */
.sp-sv__top{display:flex;flex-wrap:nowrap;align-items:center;gap:max(.06rem,5px);
  min-width:0;max-width:13.6vw}
/* ★ 0.18.0：左簇里我们是**紧跟「返回」按钮**的那一件；样式与右簇时代逐条相同，
   只是把"向右溢出会盖住别人"这件事交给上面的 max-width 兜底（不再有 justify-self:end 向左躲的余地）。 */
.sp-sv__top--left{flex:0 1 auto}

/* 下拉栏：借 .lo-select 的观感。
   · flex:1 1 auto ⇒ 皮肤下拉**吃掉**余量（不写 grow 的话它只按内容宽，顶栏右侧会空一大块）；
   · min-width 用 calc 把「内边距 + 图标 + 间隙 + select 下限」算出来，正好等于它的 min-content；
   ⚠ 本文件整体是 JS 模板字符串 ⇒ 注释里**不能出现反引号**，否则模板提前结束、整个 Mod 静默不装。 */
.sp-sv__sel{display:inline-flex;flex:1 1 auto;align-items:center;gap:max(.04rem,4px);height:max(.36rem,28px);
  min-width:calc(max(.06rem,5px) + max(.16rem,13px) + max(.04rem,4px) + max(.3rem,26px));
  padding-left:max(.06rem,5px);border:1px solid var(--line);background:rgba(0,0,0,.35)}
.sp-sv__sel:focus-within{border-color:var(--mint-700)}
.sp-sv__sel .sp-sv__svg{flex:0 0 auto;width:max(.16rem,13px);height:max(.16rem,13px);color:var(--mint-500)}
.sp-sv__sel select{flex:1 1 auto;height:100%;min-width:0;max-width:100%;width:auto;
  padding:0 max(.24rem,22px) 0 max(.06rem,5px);border:0;outline:none;cursor:pointer;
  font:inherit;font-size:max(.15rem,11px);color:var(--text-hi);text-overflow:ellipsis;
  background:transparent url("${CARET}") no-repeat right .04rem center / .2rem .2rem;
  -webkit-appearance:none;appearance:none}
.sp-sv__sel select option,.sp-sv__sel select optgroup{background:var(--bg-2);color:var(--text-hi)}
/* 顶栏里的语音下拉是单字标签（中 / 日 / 关）⇒ **不参与伸缩**（flex:0 0 auto），
   宽度就是内容宽（~58px），把余量全部让给皮肤下拉；下限同样用 calc 写死。 */
.sp-sv__sel--mini{flex:0 0 auto;
  min-width:calc(max(.06rem,5px) + max(.16rem,13px) + max(.04rem,4px) + max(.26rem,22px))}
.sp-sv__sel--mini select{min-width:max(.26rem,22px);max-width:max(.9rem,46px);padding-right:max(.2rem,18px)}
/* gear 档把下拉藏掉（档位由 index.js 的 TIER_BY_BUDGET 实测决定）。
   ★ 档位的**唯一来源**在 JS 里，CSS 只按 data 属性执行，不再抄一遍断点 ——
     否则两边迟早不一致（"看着像只放了齿轮，宽度却按三件算"）。 */
.sp-sv__top[data-sp-sv-tier="gear"] .sp-sv__sel{display:none}

/* ---- 仅图标档（icon；窄屏 / 手机横屏） ---------------------------------------------------------
   ★★ 用户口径（2026-10-08）：「手机网页端未出现皮肤/语言切换按键，但 mod 设置按键正常出现。
     手机网页端画面紧张不好显示的话**可以仅显示图标，点击时在图标左下展开列表**」。
   ★ 0.18.0：只剩 icon 一档 —— 右簇时代的 mini 随右簇口径一起退场（22px 图标本身就是
     「看得见、点得到」的完整入口：点击展开同一个皮肤列表浮层，所以不再算降级）。
   ★ 尺寸口径：宽 max(.22rem,22px) 就是 LEFT_TIER_BY_BUDGET 里 need.icon 的来源，
     改这里必须回头改 index.js 的 LEFT_TIER_BY_BUDGET（那边用同一组数字）。 */
.sp-sv__icons{display:flex;align-items:center;gap:max(.04rem,4px);min-width:0}
.sp-sv__iconwrap{position:relative;display:inline-flex;flex:0 0 auto}
.sp-sv__iconbtn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;cursor:pointer;
  width:max(.22rem,22px);height:max(.36rem,28px);padding:0;
  border:1px solid var(--line);background:rgba(0,0,0,.35);color:var(--mint-500)}
.sp-sv__iconbtn:hover{border-color:var(--mint-800);color:var(--mint-400)}
.sp-sv__iconbtn[aria-expanded="true"]{border-color:var(--mint-700);background:rgba(0,0,0,.62);color:var(--mint-400)}
.sp-sv__iconbtn .sp-sv__svg{width:max(.16rem,13px);height:max(.16rem,13px)}
/* ★★ 0.18.0：micro 档（最后一档，只在 375px 竖屏这种"宿主左列只剩几十像素"时出现）。
   宿主左列 = max-content + 官方「返回」，实测 375px 视口只剩 37px；一个 14px 的图标还能塞进去，
   22px 就塞不下了（会被压成 0）。所以它是"宁可小一点也要留一个入口"的兜底 ——
   ★ 尺寸口径与 index.js 的 LEFT_TIER_BY_BUDGET 的 micro 项**必须一致**（14px）。 */
.sp-sv__icons--micro .sp-sv__iconbtn--micro{width:max(.14rem,14px);height:max(.24rem,20px);border-color:var(--line-2)}
.sp-sv__icons--micro .sp-sv__iconbtn--micro .sp-sv__svg{width:max(.12rem,11px);height:max(.12rem,11px)}
/* 浮层：贴在图标**下方**。
   ★ 默认（align='right'，右簇时代）= 右对齐 ⇒ 向左 + 向下展开（= 用户说的"图标左下"）。
     右对齐是关键：右簇就在屏幕右缘，若改成 left:0 会**整块伸出屏幕外**点不到。
   ★★ 0.18.0：入口搬到顶栏**左簇**之后方向必须反过来 —— 左簇贴着屏幕**左**缘，
     继续右对齐（right:0）会让整块伸到屏幕外 ⇒ .sp-sv__iconwrap--left .sp-sv__pop{left:0;right:auto}
     （向右展开，最大宽度由 max-width:min(74vw,…) 兜住，不会横向溢出视口）。
   ★ z-index:30 —— .lo-top 是 .lo 的 static 流子项、自身不建层叠上下文，所以这个值直接与
     .lo-body（z-index:auto）比大小 ⇒ 浮层画在列表之上；不写就会被后出现的 .lo-body 盖住。 */
.sp-sv__pop{position:absolute;top:calc(100% + max(.05rem,4px));right:0;z-index:30;
  display:flex;flex-direction:column;overflow-y:auto;padding:max(.03rem,2px);
  min-width:max(2.6rem,150px);max-width:min(74vw,5.4rem);max-height:min(58vh,4.2rem);
  border:1px solid var(--line-2);background:var(--bg-2);box-shadow:0 8px 22px rgba(0,0,0,.5)}
.sp-sv__iconwrap--left .sp-sv__pop{left:0;right:auto}
.sp-sv__pophead{padding:max(.06rem,5px) max(.08rem,6px);font-size:max(.12rem,10px);letter-spacing:.06em;
  color:var(--text-dim);border-bottom:1px solid var(--line)}
.sp-sv__popsep{flex:0 0 auto;height:1px;margin:max(.04rem,3px) 0;background:var(--line)}
/* 列表行：整行可点（触屏目标 ≥ 28px 高）。左侧小方块只做"当前项"指示，不用 :has()。 */
.sp-sv__item{display:flex;align-items:center;gap:max(.06rem,5px);width:100%;text-align:left;cursor:pointer;
  padding:max(.09rem,8px) max(.1rem,8px);border:0;background:transparent;font:inherit;
  font-size:max(.15rem,12px);color:var(--text-md)}
.sp-sv__item::before{content:'';flex:0 0 auto;width:max(.08rem,6px);height:max(.08rem,6px);
  border:1px solid var(--line-3);background:transparent}
.sp-sv__item:hover{background:rgba(255,255,255,.06);color:var(--text-hi)}
.sp-sv__item.is-on{color:var(--mint-400)}
.sp-sv__item.is-on::before{background:var(--mint-500);border-color:var(--mint-400)}

/* 齿轮：观感 = 游戏内设置按钮（btn secondary/sm）；不许被压缩（否则图标变形）。
   ★ 只有图标、没有「设置」二字：① 用户原始要求就是"仅图标，保证手机网页端不出框"；
     ② 实测「设置」二字要 47~55px，顶栏余量只有 ~2.2rem，留着它等于把一个下拉挤成一条缝。
        说明交给 title / aria-label。 */
.sp-sv__gear{display:inline-flex;align-items:center;flex:0 0 auto}
.sp-sv__gear .sp-sv__svg{width:max(.16rem,13px);height:max(.16rem,13px);color:var(--mint-500)}
/* 拿不到 vendor preact 时的降级提示（不是按钮，只是说明） */
.sp-sv__topwarn{display:inline-flex;align-items:center;gap:max(.06rem,5px);font-size:max(.14rem,10px);color:var(--amber)}
.sp-sv__topwarn .sp-sv__svg{width:max(.18rem,12px);height:max(.18rem,12px)}

/* ---- 「模组设置」里本 Mod 那一栏（section.js） ─────────────────────────────────────────────── */
/* 一个栏位的多行：宿主 .set-list 是 flex+gap，这里给"栏位/分组"一个等价容器
   （栏位是被「模组设置」渲染进 .set-list 的，所以分组之间要自己排距离）。 */
.sp-sv__section{display:flex;flex-direction:column;gap:.2rem}
.sp-sv__group{display:flex;flex-direction:column;gap:.16rem}
/* 分组小标题：中文，不用英文 eyebrow（用户口径：英文副标题一律清掉） */
.sp-sv__groupname{font-size:.13rem;letter-spacing:.14em;color:var(--text-dim);
  padding-bottom:.06rem;border-bottom:1px solid var(--line)}
/* 最底部的素材来源小字（用户口径：单独放在最底部） */
.sp-sv__src{margin:0;font-size:.12rem;line-height:1.7;color:var(--text-dim)}
/* 版本自证行（v0.7.1 新增）：栏位最底部一行 vX.Y.Z，玩家肉眼即可判断浏览器加载的是哪一版。
   ★ 观感：右对齐、比素材来源再暗一档、等宽数字，不抢视线（用户口径：不要多余装饰）。 */
.sp-sv__ver{margin:.02rem 0 0;font-size:max(.11rem,9px);line-height:1.6;color:var(--text-dim);
  opacity:.75;text-align:right;font-variant-numeric:tabular-nums}

/* 信息小圈（每局开始时随机 / 素材上游 / 配置备份）—— 只有这三项有；其余小字一律删掉了。
   ★★ 这一份是「？小圈」的**规范实现 CSS**（规范条文 docs/MODS.md 的 4.12 节）：短标签 + 「?」小圈 +
   纯 CSS 弹出（::after + data-tip，不用原生 title 撑场：触屏没有 hover 也没有显示时机，
   所以 tabindex + :focus 让"点一下"也出）。**换实现 / 抄到别的 Mod 时保持一致**：
     · 圆形 .17rem、1px 描边 var(--line-3)、border-radius:50%、cursor:help；
     · hover / :focus 才高亮，用薄荷色 token（--mint-500 描边 / --mint-400 文字）；
     · 弹出面板贴宿主 .tooltip 的观感：--bg-2 底 + --line-2 描边 + 2px 圆角 + 深阴影，宽 3.1rem、可换行。
   ★ 本文件整体是 JS 模板字符串 —— 注释里不能出现反引号。 */
.sp-sv__info{position:relative;display:inline-flex;align-items:center;justify-content:center;
  flex:0 0 auto;width:.17rem;height:.17rem;margin-left:.07rem;border:1px solid var(--line-3);border-radius:50%;
  color:var(--text-lo);font-size:.115rem;line-height:1;cursor:help;outline:none;
  transition:color .12s var(--ease-out),border-color .12s var(--ease-out)}
.sp-sv__info:hover,.sp-sv__info:focus{border-color:var(--mint-500);color:var(--mint-400)}
.sp-sv__info::after{content:attr(data-tip);position:absolute;left:50%;bottom:165%;transform:translateX(-50%);
  width:3.1rem;padding:.09rem .11rem;border:1px solid var(--line-2);border-radius:2px;background:var(--bg-2);
  color:var(--text-md);font-size:.125rem;line-height:1.6;letter-spacing:.01em;text-align:left;white-space:normal;
  box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:0;visibility:hidden;pointer-events:none;z-index:9;
  transition:opacity .12s var(--ease-out)}
.sp-sv__info:hover::after,.sp-sv__info:focus::after{opacity:1;visibility:visible}

/* ---- 兜底外壳（没装 cyanfish.mod-settings 时用同一份栏位渲染的最小弹窗） ───────────────────── */
.sp-sv__blk{display:flex;flex-direction:column;gap:.16rem}
.sp-sv__setlist{padding-top:.06rem}
/* 导入 / 导出：.set-row 的第 2~4 列 */
.sp-sv__listen{grid-column:2 / 4;justify-self:start;display:flex;flex-wrap:wrap;align-items:center;gap:max(.08rem,6px)}
.sp-sv__file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}

/* ---- ★★ 更新②「随机皮肤」那一组（section.js 的 SetRow） ────────────────────────────────────────
   ★ 为什么不去动宿主 CSS：宿主 .set-row 是三列 grid（3.3rem 标签 / 1fr / auto），我们把子项整体
     放进第 2 列 ⇒ 按钮的左边线与本栏其它控件（.set-toggle / .set-seg 都是 grid-column:2/4）对齐。
   ★ 允许换行：官方设置弹窗只有 7.4rem 宽（内嵌进它时内容列约 6.8rem），
     「立即为所有干员随机皮肤」+「撤销」在窄屏上一行放不下 —— 换行，不要裁掉（同 .sp-ms__pane 的态度）。 */
.sp-sv__setrow{align-items:center}
.sp-sv__setctl{grid-column:2 / 4;justify-self:start;display:flex;flex-wrap:wrap;align-items:center;gap:max(.08rem,6px);min-width:0}
.sp-sv__sethint{color:var(--text-dim);font-size:max(.13rem,10px);line-height:1.6;white-space:normal}
/* 这一组底部的口径说明（随机范围）。★ 用 <p> 而不是塞进 .set-row__label：
   宿主的标签是 nowrap，长句会横着溢出去把弹窗撑破。 */
.sp-sv__hint{margin:0;color:var(--text-dim);font-size:max(.13rem,10px);line-height:1.7;white-space:normal}

/* ---- ★ 0.10.0：自选编队（screens/diy.js）**每个槽位**的皮肤选择（client/diy.js） ─────────────────────
   落点 = 宿主每个**已填充**槽位操作区 .diy-slot__acts（宽屏是竖排一列、<=760px 由宿主折成右对齐的一行），
   位置在官方「更换 / 清空」**之后**（宿主决定，我们只管自己这块长什么样）。
   ★ 为什么要写死宽度：宿主 .diy-slot 是三列 grid（auto / minmax(0,1fr) / auto，loadout.css:401），
     操作列宽 = **最宽子项**。控件不加约束的话，长时装名会把正文列挤没（原生 select 的 min-content
     就是它最宽的那个选项）。所以给一个 rem 口径的固定宽 + 与宿主 btn--sm 同高的外形，
     让官方两个按钮那一列的宽度变化尽量小、四个槽位看起来一样宽。
   ★ 外形沿用本 Mod 顶栏那套 .sp-sv__sel（它本身就是照宿主 .lo-select 画的，见 style.js 顶部）。
   ★ 本文件整体是 JS 模板字符串 —— 注释里不能出现反引号。 */
.sp-sv__diy{display:flex;flex-direction:column;gap:max(.03rem,2px);min-width:0;
  width:max(1.4rem,90px);max-width:max(1.4rem,90px)}
.sp-sv__diysel{display:inline-flex;align-items:center;gap:max(.04rem,4px);min-width:0;
  height:max(.32rem,26px);padding-left:max(.06rem,5px);
  border:1px solid var(--line);background:rgba(0,0,0,.35)}
.sp-sv__diysel:focus-within{border-color:var(--mint-700)}
.sp-sv__diysel.is-off{border-style:dashed;opacity:.7}
.sp-sv__diysel .sp-sv__svg{flex:0 0 auto;width:max(.16rem,13px);height:max(.16rem,13px);color:var(--mint-500)}
.sp-sv__diysel.is-off .sp-sv__svg{color:var(--text-lo)}
.sp-sv__diysel select{flex:1 1 auto;height:100%;min-width:0;width:100%;
  padding:0 max(.2rem,18px) 0 max(.05rem,4px);border:0;outline:none;cursor:pointer;
  font:inherit;font-size:max(.13rem,10px);color:var(--text-hi);text-overflow:ellipsis;
  background:transparent url("${CARET}") no-repeat right .04rem center / .18rem .18rem;
  -webkit-appearance:none;appearance:none}
.sp-sv__diysel select option{background:var(--bg-2);color:var(--text-hi)}
.sp-sv__diysel select:disabled{cursor:default;color:var(--text-lo);background-image:none;padding-right:max(.05rem,4px)}
/* 「当前：这套皮肤名」那一行 —— 目标就是"玩家一眼看到这名干员现在配的是哪套"。 */
.sp-sv__diyname{font-size:max(.11rem,8px);line-height:1.5;color:var(--text-lo);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-sv__diy.is-on .sp-sv__diyname{color:var(--mint-400)}

/* ---- ★★ 0.15.0（工序 48）：该干员**行内那一格** / **详情面板**里的控件 -------------------------------
   两个位置共用同一个组件（controls.js 的 SkinVoiceControls）⇒ 这里也共用一套样式，只有一处尺寸差异
   （详情面板那一条用宿主自己的 .sp-coarse 触屏口径放大，因为详情面板的宽度富余）。
   ★★ 0.17.0：原来的"两个控件"（皮肤 + 单干员语音）此后**只有皮肤一件**（语种轴删净，见 controls.js
      文件头）；因此下面（2）里"两件控件各自的 min-content 必须被尊重"的那条判据如今只剩一件 ——
      宿主 loadout.css 的 minmax(max-content, var(--arow)) **一字未改**（本工序不动宿主 CSS）。
   ★ 顶层类名由宿主 CSS 认：.lo-arow 是条件式第 5 列的唯一开关（loadout.css 那一节），
     它的 display:flex 也由宿主给；这里只负责"控件在这一格里怎么收缩"。
   ★★ 收缩是硬约束：.lo-card 的第 5 轨是 minmax(max-content, 11rem)，原生 select 的
     min-content 等于**最宽那个选项**（时装名可以很长）⇒ 任何一个子项留 min-width:auto 都会把
     整个 .lo-list 顶出横向滚动条。所以下面每一层都显式写 min-width:0 + overflow:hidden。

   ★★ 工序 51（服主反馈 ①）—— **逐值复刻宿主的「潜能 / 练度」那一套**，并**取消两个小图标**：
     (1) 图标没了：.sp-sv__lo .sp-sv__svg 的尺寸/配色规则整条删除，controls.js 也不再渲染图标节点。
         理由：服主口径「该栏显示的下拉框应该取消两个小图标（不在这里做收成小图的展示，宽度不足时有顶部兜底）」。
     (2) rest 态与左侧 .lo .lo-cult .lo-select（loadout.css:245-247）**逐项相同**。我们不是
         .lo-cult 的子节点 ⇒ 那条规则命中不到我们，所以在这里按它的 **6 个属性值逐条抄**：
           · height        : .32rem / 22px   （原来是 max(.32rem,22px)，但少了这一条就落回基类 .4rem/24px）
           · padding-left  : 0               （原来是 max(.05rem,4px)）
           · border-color  : transparent     （原来是 var(--line) ⇒ 看着像"未修改的 UI 样式"）
           · background    : rgba(255,255,255,.03)（原来是 rgba(0,0,0,.35)）
           · select padding: 0 max(.2rem,14px) 0 max(.06rem,4px)（原来是 …16px…3px）
           · select font   : max(.14rem,10px)（原来是 max(.13rem,10px)）
         其余本来就一致：display/align-items/box-sizing/border-width/圆角(0)/箭头图与位置/cursor。
         ★ 判据（真机 computed style 对照表）见 内部工序记录 §①。
     (3) **焦点绿框**：绿框就是这一层 label 的 1px 描边（宿主 .lo-select:focus-within{border-color:var(--mint-700)}
         的同一条口径）。它天然包住**整个** label（含文字前的空白），所以"框比控件小"只会来自
         "控件本身被内层元素撑出了 label"——取消图标 + 各层 min-width:0/overflow:hidden 就是这件事的保证。
         ★★ 顺序是硬约束：:focus-within 那条必须写在**基类之后**（同特异度、后者胜；写反了 hover
         时基类的透明描边会盖掉绿框）。.is-on（玩家明确钉了一档 = 那个视觉语言的"已改"态，
         与官方 .lo-cult .lo-select.is-off 同一套 mint 高亮）因此排在 focus 之前。 */
.sp-sv__controls{min-width:0;max-width:100%}
/* ★★ 这里**故意不写 display** —— 见下面这条实测踩坑记录（写 display:flex 会让窄屏降级彻底失效）：
   本 Mod 的 <style> 是**运行时 append 到 <head> 末尾**的（installStyle），而宿主的 loadout.css 是
   静态 <link> ⇒ **同特异度下我们的规则赢**。.lo-arow 的 display 是宿主"宽屏 flex / 窄屏 none"
   的唯一开关，我们只要写一句 display:flex，窄屏那条 @media(max-width:1599.98px){display:none}
   就永远不生效 ⇒ 控件在窄屏**同时**出现在行内与详情面板，行高从 50px 涨到 80px。
   实测（48b-diag-media.mjs）：写 display:flex 时 1440px 的 .lo-arow 仍是 flex、行高 80；
   去掉之后 1440px 变成 none、行高回到官方的 50px。 */
.sp-sv__detailrow .sp-sv__controls{display:flex;align-items:center;gap:max(.04rem,4px);min-width:0;width:100%}
/* ★★ 0.17.0：行里那一格此后**只有皮肤一件**（"单干员语种"那条轴整体删除，见 controls.js 文件头）
   ⇒ 原先"皮肤吃余量、语音只占自己那点内容宽"的主次成了一条：
   flex:1 1 0% 留着**不会**让控件变宽 —— 宿主那一轨是 minmax(max-content, 11rem)，
   max-content 就是这件控件的 min-content（原生 select 最宽那个选项）⇒ 这一格只可能被压小、
   不可能被撑大（实测对照见 内部工序记录）。
   ★ 与官方 .lo-cult 同一条做法（潜能固定宽、练度吃余量）；这里控件是那一个。 */
.sp-sv__lo{display:inline-flex;flex:1 1 0%;align-items:center;
  min-width:0;height:max(.32rem,22px);padding-left:0;
  border:1px solid transparent;background:rgba(255,255,255,.03)}
/* 这一名干员**没有可选时装** ⇒ 虚线框 + 压暗，与自选编队页的 .sp-sv__diysel.is-off 同一口径。
   ★ 0.17.0：此后 is-off 是这个下拉**唯一**的禁用态来源（原先还特别说明"语音那件没有禁用态"，
     那一件已随语种轴删除）。 */
.sp-sv__lo.is-off{border-style:dashed;opacity:.7}
.sp-sv__lo.is-off select:disabled{cursor:default;color:var(--text-lo);background-image:none;padding-right:max(.04rem,3px)}
/* 玩家给这一名干员**明确钉了**一档（不是默认值）⇒ 走官方 .lo-cult .lo-select.is-off 那套
   mint 高亮（同一个视觉语言："这一项**不是**默认值"）。 */
.sp-sv__lo.is-on{border-color:var(--mint-700);background:rgba(78,216,175,.08)}
.sp-sv__lo.is-on select{color:var(--mint-400);font-weight:700}
/* ★★ 焦点绿框：必须排在基类与 .is-off 之后（border-color 同特异度 ⇒ 后者胜；
   写反了的话，没有时装的虚线态会把自己的透明描边盖在绿框上）。
   1px 描边画在 label 的**边框盒**上 ⇒ 天然包住整控件（含此前的图标区）。

   ★★ 颜色为什么取 var(--mint-700)（真机实测后定的，不是随手选）：
     宿主自己在这一行有**两套焦点色** ——
       · 基类 .lo-select:focus-within{border-color:var(--mint-700)}（绿，筛选器那种用法）；
       · 潜能 / 练度专属 .lo .lo-cult .lo-select:hover, …:focus-within{border-color:var(--line-3)}（灰 #58675f）。
     服主口径写的是「点击时的**绿色**外框效果」（绿框就是判据）⇒ 我们跟**绿**那一套走。
     实测（内部验收数据，真鼠标逐个点四件控件、两轮）：
       皮肤 / 语音 = rgb(42,158,127) = mint-700；左侧潜能 / 练度 = rgb(88,103,95) = line-3。
     **这是有意的差异**：绿框在暗底上明显得多；而"未修改（rest）态"两边仍是**逐值相同**
     —— 那才是服主指出的问题（"未修改时的 UI 样式"）。
     ★ 想改成"连焦点都与左侧一样"只需把这一行换成 var(--line-3)（一个 token 的事）。 */
.sp-sv__lo:hover,.sp-sv__lo:focus-within{border-color:var(--mint-700)}
.sp-sv__lo select{flex:1 1 0%;height:100%;min-width:0;max-width:100%;width:auto;
  padding:0 max(.2rem,14px) 0 max(.06rem,4px);border:0;outline:none;cursor:pointer;
  font:inherit;font-size:max(.14rem,10px);color:var(--text-lo);text-overflow:ellipsis;
  background:transparent url("${CARET}") no-repeat right .04rem center / .2rem .2rem;
  -webkit-appearance:none;appearance:none}
.sp-sv__lo select option{background:var(--bg-2);color:var(--text-hi)}
/* 详情面板那一**旧**落点（老宿主：官方「潜能与练度」那一段之后）：
   照官方 .lo-sec--cult 那一区的观感画一块自己的小节 —— 同一套变量、同一套边框口径，
   不抄官方任何一行选择器（官方那一块只服务它自己的内容）。
   ★ 0.19.0：现行落点是 .sp-sv__vrow（上面那一节，官方语音的下一行）；这一条**只服务没有
     loadout.detailVoice 的老宿主**（本树 0.2.3 不会命中）。 */
.sp-sv__detailrow{display:flex;align-items:center;gap:.06rem;margin-bottom:.14rem;
  padding:.08rem .1rem .1rem;background:rgba(0,0,0,.22);border:1px solid var(--line);border-left:3px solid var(--mint-500)}
.sp-sv__detailrow .sp-sv__lo{flex:1 1 0%}
/* ★★ 0.19.0（工序 72）：**详情面板里那一行**（官方「此干员语音」的下一行，client/controls.js 的 SkinDetailRow）。
   落点 = .lo-detail__body 里 <OperatorVoice>（官方 .lo-voice）**之后**那一行（宿主插槽 loadout.detailVoice）。
   ★★ 观感口径 = **与官方那一行同一行体系** —— 下面每一条都是从官方规则上**逐值抄**下来的，不另立尺寸：
     · 外层行     = .lo-voice（loadout.css:678，display:flex / flex-wrap:wrap / align-items:center /
                    gap:.12rem / padding:.14rem 0 / font-size:calc(.18 * var(--t))）—— 逐值相同；
     · 控件外壳   = .lo-select（loadout.css:119，height:max(.4rem,24px) / padding-left:.1rem /
                    1px solid var(--line) / rgba(0,0,0,.35)）+ .lo-voice .lo-select（loadout.css:680，
                    min-width:1.6rem / max-width:100%）；
     · 里面 select = .lo-select select（loadout.css:121-126，height:100% / min-width:1.6rem /
                    padding:0 max(.26rem,26px) 0 max(.06rem,6px) / font-size:max(.15rem,11px) / color:var(--text-hi)）。
   ★ 为什么是"抄值"而不是直接借 .lo-select 那个类名：.sp-sv__lo 的基类（行内那一格的逐值复刻，见上）
     与 .lo-select 的 rest 态**故意不同**（那一格要跟「潜能 / 练度」一样），两个位置共用一套 class
     只会让"哪一处是谁的值"变成隐式依赖 ⇒ 详情面板这一支用 .sp-sv__lo--detail 这个**已经存在**的开关类
     （controls.js 一直会给 variant='detail' 加它，此前没有任何 CSS 规则用它）。
   ★ flex 口径：flex:0 1 auto（不是行内那一格的 1 1 0%）—— 官方那颗语音下拉是**内容宽**（下限 1.6rem），
     详情面板宽度富余，把 select 拉满 662px 只会与上一行的语音下拉不成一体。
   ⚠ 本文件整体是 JS 模板字符串 ⇒ 注释里**不能出现反引号**（上面这类类名一律裸写）。 */
.sp-sv__vrow{display:flex;flex-wrap:wrap;align-items:center;gap:.12rem;padding:.14rem 0;
  font-size:calc(.18 * var(--t))}
.sp-sv__vrow__k{flex:0 0 auto}
.sp-sv__vrow .sp-sv__lo--detail{flex:0 1 auto;min-width:1.6rem;max-width:100%;
  height:max(.4rem,24px);padding-left:.1rem;border-color:var(--line);background:rgba(0,0,0,.35)}
.sp-sv__vrow .sp-sv__lo--detail select{padding:0 .26rem 0 .06rem;
  font-size:max(.15rem,11px);color:var(--text-hi)}
/* 触屏（粗指针）档：官方 .sp-coarse .lo-select{min-height:30px}（loadout.css:652）的同一条口径。
   ★ 特异度必须写够（0,3,0）才盖得住上面那条 —— 宿主写的是 2 个类 + 1 个 tag。 */
.sp-coarse .sp-sv__vrow .sp-sv__lo--detail{min-height:30px}
/* ★★ 0.17.0：这里原来还有一条只作用于详情面板的语音下拉规则（让那件控件也吃满宽度）。
   语音那一件已整条删除 ⇒ 那条规则一并删除；详情面板里此后只有皮肤这一条。 */
/* 触屏（粗指针）档：与宿主 .sp-coarse .lo .lo-cult .lo-select{height:max(.32rem,28px)} 逐值相同。
   ★ 特异度必须写够（0,3,1）才盖得住上面那条基类 —— 宿主写的是 3 个类 + 1 个 tag。 */
.sp-coarse .lo-arow .sp-sv__lo{height:max(.32rem,28px)}

/* ---- 浮动入口（★ 更新① 之后**只剩干员调配界面那一个**）───────────────────────────────────────
   ★ 这里原来还有"战斗中右下角 floating 入口"的说明：更新①（2026-10-08 服主口径「mod-setting 应与官方
     游戏内设置（左下角）使用同一入口，而非右下角入口」）之后，**战斗内不再挂浮动入口**
     （index.js 的 mountFab 只保留 --loadout 那条），战斗内改走「左下角官方设置齿轮 → 模组设置」。
     基础 .sp-sv__fab 样式留着给 --loadout 复用（同一个按钮外观）。 */
.sp-sv__fab{position:fixed;right:max(.18rem,10px);bottom:max(.18rem,10px);z-index:60;display:flex;align-items:center;gap:max(.06rem,4px);
  padding:max(.07rem,5px) max(.12rem,9px);border:1px solid var(--line-2);background:var(--bg-1);color:var(--text-md);
  box-shadow:0 2px 10px rgba(0,0,0,.28);cursor:pointer;font:inherit;font-size:max(.15rem,11px)}
.sp-sv__fab:hover{border-color:var(--mint-800);color:var(--text-hi)}
.sp-sv__fab .sp-sv__svg{width:max(.2rem,14px);height:max(.2rem,14px);color:var(--mint-500)}
@media (max-width:900px){.sp-sv__fab span{display:none}}
/* ---- ★ v0.9.1：干员调配界面的浮动入口（顶栏右簇放不下皮肤下拉时的完整入口） ──────────────────
   宿主 0.2.1 自己往顶栏右簇塞了「已调整 N/112 / 导出 / 导入 / 全部恢复默认」，右簇余量实测只剩 44px
   ⇒ 皮肤下拉被挤掉。这里放在顶栏左侧的空区（.lo-top__left 里只有「返回」），
   左边界取「返回」按钮的右缘（≈5.6rem）再留一点，纵向与顶栏居中对齐。
   z-index 70：只与宿主的顶栏/覆盖层比大小（原来是"比战斗内浮动入口的 60 高一档"，
   更新① 删掉战斗内入口后这个数就只是"稳压顶栏"的意思，数值不动、观感不变）。
   ★ 注意：本文件整段 CSS 在一个模板字面量里 —— 注释里**不能出现反引号**，否则字符串会被截断。 */
.sp-sv__fab--loadout{top:max(.16rem,10px);left:max(5.8rem,150px);right:auto;bottom:auto;z-index:70}
@media (max-width:900px){.sp-sv__fab--loadout{left:max(4.6rem,110px)}}
`;

/** 注入样式（幂等）。 */
export function installStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
