// mods/cyanfish.dj-all/client/elements.js — **元素目录**：局内所有可见元素的唯一权威清单。
//
// ============================ 这份文件是什么 ============================
// 它是本 Mod 的「元素表」：一条记录 = 一个可以**单独**配置旋转 / 压缩的元素。
// 三处消费者，读的都是这一份：
//   ① `client/index.js`（运行时）：按 id 做现场探针（这个元素此刻在不在页面上、有几个）；
//   ② `tools/build-catalog.mjs`（作者工具）：生成 `ELEMENTS.md`（人读的层级清单）与
//      `catalog.html`（逐元素预览页）；
//   ③ **后续的旋转控制页**：以同一套 id 存/读每元素参数（`sp.pref.djAll` 里按 id 存一格）。
//
// ============================ 一条记录有哪些字段 ============================
//   id     —— **稳定 id**（唯一键）。约定 = `<层>.<短名>`，全小写、点分层；★ 一旦发布不许改
//             （它是玩家存档里那一格的名字，改了等于把别人的设置丢掉）。
//   name   —— 中文名（面板上显示的那一行）。
//   layer  —— 层 id（见 LAYERS）；决定它在目录 / 控制页里的分组。
//   sel    —— **CSS 选择器**（相对战斗屏根 `#app .screen.gm`；`global:true` 的除外，见下）。
//   global —— true = 它**不在**战斗屏子树里（宿主挂在 app 根上，例如顶部 toast）⇒ 靠"现在在不在战斗中"做运行时门控。
//   src    —— 来源：`'vanilla'`（原版）或 Mod id（`'cyanfish.chat'` …）。
//   count  —— 一屏上的**典型数量**（引擎的"这类元素有几个独立目标"）：1 = 单件；'n' = 一屏多个各自独立。
//   rot    —— 可旋转性判定：
//              'ok'   = 与其它元素一视同仁（绕竖直轴 / 平面内都行）
//              'flat' = **只宜平面内旋转**（被横向压扁会破坏可读性，例如文字 / 细长条）
//              'no'   = **不该转**（详情窗格 / 弹窗 / 输入框这类"要读要点的功能面"，本 Mod 的默认名单）
//              'pixi' = 不是 DOM，是画布里的 PIXI 对象（由引擎按分组改容器 transform，不走 CSS）
//   note   —— 一句话备注（为什么这么判定 / 有什么坑）。
//   stage  —— ★ 只给**预览页**用：在 `tools/stages.js` 里用哪一块舞台来还原它（不在运行时读）。
//   pick   —— ★ 只给预览页用：舞台内部用来定位/高亮的局部选择器（缺省 = `sel`）。
//   pad    —— ★ 只给预览页用：高亮框向外扩多少 rem（缺省 0.06）。
//
// ============================ 口径来源 ============================
// 选择器与结构**不是猜的**，逐条来自主力树 0.2.5 的源码：
//   public/js/screens/game.js（战斗屏骨架，:1444-1568）· public/js/ui/hud.js（顶栏 TopBar :384-425）
//   public/js/ui/shopBar.js · public/js/ui/teamPanel.js · public/js/ui/effectsList.js · public/js/ui/emotes.js
//   public/js/ui/bondStrip.js · public/js/ui/ticker.js · public/js/ui/toasts.js · public/js/ui/combatHud.js
//   public/js/ui/underframe.js · public/js/ui/facingWheel.js · public/js/ui/choiceOverlay.js
//   public/js/ui/detailPanel.js · public/js/ui/enemyDrawer.js · public/js/ui/matchChrome.js · public/js/ui/settings.js
//   public/js/ui/extensions.js（UI_SLOTS）· public/js/render/**（PIXI 侧的抓手，沿用 dj-models 的逐字段结论）
//   mods/cyanfish.{chat,banner,debug-console,mod-settings,online,announce,loadout-io,skinvoice,diy-34}/client/**
// 逐元素的出处与坑写在 ELEMENTS.md 的「取证」列（由本文件生成）。
// ★ 修正清单（哪里与本文件不一致时，以**源码**为准，然后回来改这里）：见 README.md 末节。

/** 层定义（目录 / 控制页的分组；顺序 = 页面顺序）。 */
export const LAYERS = Object.freeze([
  { id: 'shell', name: '① 战斗屏骨架', desc: '战斗屏根与两层容器（画布层 / HUD 层）' },
  { id: 'top', name: '② 顶栏', desc: '回合 / 阶段 / 生命 / 延迟 / 准备 / 倒计时 / 暂停' },
  { id: 'bonds', name: '③ 盟约带', desc: '左上角的盟约图标条与折叠键' },
  { id: 'team', name: '④ 左侧队伍列', desc: '队友头像 / 状态 / 表情气泡' },
  { id: 'effects', name: '⑤ 右侧效果列', desc: '当前生效的 effect 图标' },
  { id: 'shop', name: '⑥ 调度中心（底部）', desc: '干员卡 / 升级卡 / 资金 / 冻结刷新 / 奖励卡' },
  { id: 'corner', name: '⑦ 左下角功能键', desc: '表情 / 设置 / 玩法说明 / 全屏（+ Mod 追加键）' },
  { id: 'hint', name: '⑧ 提示与状态', desc: '滚动提示 / 顶部 toast / 观战提示 / 淘汰提示' },
  { id: 'combat', name: '⑨ 战斗覆盖层', desc: '作战进度 / 等待 / 战场切换 / AI 托管 / 临时整备区' },
  { id: 'deploy', name: '⑩ 部署交互', desc: '部署底框（撤退 / 出售 / 销毁）与朝向轮' },
  { id: 'choice', name: '⑪ 机变 / 教鞭选择', desc: '全屏选择覆盖层与卡片' },
  { id: 'detail', name: '⑫ 详情窗格', desc: '干员 / 敌方 / 地块 / 盟约详情（**默认不转**）' },
  { id: 'modal', name: '⑬ 弹窗', desc: '设置 / 离开 / 玩法说明' },
  { id: 'canvas', name: '⑭ 场内画布对象（PIXI）', desc: '不是 DOM：单位 / 血条 / 伤害数字 / 特效' },
  { id: 'mod', name: '⑮ Mod 新增（局内）', desc: 'cyanfish.chat / banner / debug-console / mod-settings' },
  { id: 'outgame', name: '⑯ 附：局外（非战斗屏）', desc: '标题 / 大厅 / 干员调配 / 结算上的 Mod 元素（默认不在旋转范围）' },
]);

/**
 * ★★ 元素清单。**这是本 Mod 的单一真相**。
 * ★ 排序无关（运行时按 id 索引、按 layer 分组）；书写顺序按层级，方便人读 diff。
 * ★ `no`（不该转）的那一批是**默认名单**，不是硬禁：控制页会给每个元素一个开关，
 *   但默认值取这里的判定 —— 「详情窗格 / 弹窗 / 输入框不该转」是 dj-models 从 v1.3.0 起就立的规矩。
 */
export const ELEMENTS = Object.freeze([
  // ============================ ① 战斗屏骨架 ============================
  { id: 'shell.screen', name: '战斗屏根', layer: 'shell', path: '', sel: '#app .screen.gm', src: 'vanilla', danger: true, count: 1, rot: 'no',
    note: '整个战斗屏的容器；它是所有其它元素的父节点，转它等于转全屏（本 Mod 不提供）。',
    stage: 'shell', pick: '.screen.gm' },
  { id: 'shell.field', name: '战场画布层', layer: 'shell', path: '', sel: '.gm__field', src: 'vanilla', count: 1, rot: 'no',
    note: 'PIXI 画布挂在这个 div 里（render/app.js）；CSS 转它只会让画布整体倾斜，不能旋转画布里的对象。',
    stage: 'shell', pick: '.gm__field' },
  { id: 'shell.vignette', name: '战场暗角', layer: 'shell', path: '', sel: '.gm__vignette', src: 'vanilla', count: 1, rot: 'no',
    note: '纯装饰的径向渐变遮罩，`aria-hidden`；转它没有观感意义。', stage: 'shell', pick: '.gm__vignette' },
  { id: 'shell.loading', name: '战场加载层', layer: 'shell', path: '', sel: '.gm__loading', src: 'vanilla', count: 1, rot: 'no',
    note: '只在 viewKind === loading 时存在（转场那几帧）。', stage: 'shell', pick: '.gm__loading' },
  { id: 'shell.hud', name: 'HUD 层（所有 DOM UI 的父容器）', layer: 'shell', path: '', sel: '.gm__hud', src: 'vanilla', danger: true, count: 1, rot: 'no',
    note: '顶栏 / 盟约 / 队伍 / 效果 / 商店 / 左下角 / 提示全在它里面（public/js/screens/game.js:1453）；转它 = 转所有 UI。',
    stage: 'shell', pick: '.gm__hud' },

  // ============================ ② 顶栏 ============================
  { id: 'top.bar', name: '顶栏整条', layer: 'top', path: '', sel: '.gtop', src: 'vanilla', count: 1, rot: 'ok',
    note: '三段式 header（左 / 中 / 右）。', stage: 'top', pick: '.gtop' },
  { id: 'top.left', name: '顶栏左区', layer: 'top', path: 'left', sel: '.gtop__left', src: 'vanilla', count: 1, rot: 'ok',
    note: '退出键 + 延迟/观战席 + 难度标识。', stage: 'top', pick: '.gtop__left' },
  { id: 'top.exit', name: '离开 / 暂离按键', layer: 'top', path: 'left', sel: '.gtop__left .gtop__exit', src: 'vanilla', danger: true, count: 1, rot: 'ok',
    note: '官方 Button（danger/lg/square）挂的类；是一个要点的功能键 ⇒ 与 DOM 组同一套角度上限。',
    stage: 'top', pick: '.gtop__exit' },
  { id: 'top.ping', name: '延迟显示', layer: 'top', path: 'left', sel: '.gtop__left .ping', src: 'vanilla', count: 1, rot: 'ok',
    note: '图标 + 数字 + 单位，四档着色（low/medium/high/off）。', stage: 'top', pick: '.ping' },
  { id: 'top.specpill', name: '观战席胶囊', layer: 'top', path: 'left', sel: '.specpill', src: 'vanilla', count: 1, rot: 'ok',
    note: '只在房间有观战席时出现；点开是观战席弹窗。', stage: 'top', pick: '.specpill' },
  { id: 'top.dtag', name: '难度标识', layer: 'top', path: 'left', sel: '.gtop__meta .dtag', src: 'vanilla', count: 1, rot: 'ok',
    note: '图标 + 难度名；颜色由 `--d-color` 决定。', stage: 'top', pick: '.dtag' },
  { id: 'top.center', name: '顶栏中区', layer: 'top', path: 'center', sel: '.gtop__center', src: 'vanilla', count: 1, rot: 'ok',
    note: '回合框 / 阶段胶囊 / 生命塔 / 漏怪 / 费用 / 两个 🔍 键。', stage: 'top', pick: '.gtop__center' },
  { id: 'top.iconbtn', name: '🔍 本局信息键', layer: 'top', path: 'center', sel: '.gtop__center .gtop__iconbtn', src: 'vanilla', count: 1, rot: 'ok',
    note: '有官方 sprite 时是整张图（`has-sprite`），没有时是图标 + 箭头兜底。', stage: 'top', pick: '.gtop__iconbtn' },
  { id: 'top.roundbox', name: '回合框', layer: 'top', path: 'center', sel: '.roundbox', src: 'vanilla', count: 1, rot: 'ok',
    note: '「回合」标签 + 数字；隐藏回合显示 `??`。', stage: 'top', pick: '.roundbox' },
  { id: 'top.capsule', name: '阶段胶囊', layer: 'top', path: 'center', sel: '.gtop__center .capsule', src: 'vanilla', count: 1, rot: 'ok',
    note: '四态共用：`--prep` / `--combat`（+`--unite`）/ `--boss`；内含图标、标签、击杀数与漏怪标记。',
    stage: 'top', pick: '.capsule' },
  { id: 'top.lp', name: '生命塔', layer: 'top', path: 'center', sel: '.lp', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：塔身 + 数字 + 结算预扣的 −N，绕竖直轴压扁会让数字读不出来。', stage: 'top', pick: '.lp' },
  { id: 'top.misstag', name: '漏怪标记', layer: 'top', path: 'center', sel: '.misstag', src: 'vanilla', count: 1, rot: 'ok',
    note: '只在有漏怪数时出现（`is-clear` 是 0 时的样式）。', stage: 'top', pick: '.misstag' },
  { id: 'top.dpbox', name: '部署费用（DP）', layer: 'top', path: 'center', sel: '.dpbox', src: 'vanilla', count: 1, rot: 'ok',
    note: '战斗期才显示（DpCounter）；含图标 + 数字 + COST 小标。', stage: 'top', pick: '.dpbox' },
  { id: 'top.enemybtn', name: '🔍 敌方情报键', layer: 'top', path: 'center', sel: '.gtop__center .enemybtn', src: 'vanilla', count: 1, rot: 'ok',
    note: '休整期可点（`is-grey` 时禁用）；带 `▶▶` 箭头。', stage: 'top', pick: '.enemybtn' },
  { id: 'top.clock', name: '倒计时区', layer: 'top', path: 'right', sel: '.gtop__clock', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：倒计时数字条；暂停时换成带 PAUSED 标签的冻结读数。', stage: 'top', pick: '.gtop__clock' },
  { id: 'top.pause', name: '暂停按键', layer: 'top', path: 'right', sel: '.pausebtn', src: 'vanilla', count: 1, rot: 'ok',
    note: '仅单人局出现（g.pause）；暂停中换播放图标。', stage: 'top', pick: '.pausebtn' },
  { id: 'top.otwarn', name: '超时警告（DOT）', layer: 'top', path: 'right', sel: '.otwarn', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：一行文字（倒计时 / 每秒流失 / 已流失）；首领回合才有。', stage: 'top', pick: '.otwarn' },
  { id: 'top.right', name: '顶栏右区', layer: 'top', path: 'right', sel: '.gtop__right', src: 'vanilla', count: 1, rot: 'ok',
    note: '时钟 + 暂停 + 超时警告 + 准备区。', stage: 'top', pick: '.gtop__right' },
  { id: 'top.readywrap', name: '准备区', layer: 'top', path: 'right', sel: '.gtop__right .readywrap', src: 'vanilla', count: 1, rot: 'ok',
    note: '准备键 + 拒绝原因 + 已就绪计数三件的容器。', stage: 'top', pick: '.readywrap' },
  { id: 'top.readybtn', name: '准备就绪按键', layer: 'top', path: 'right', sel: '.gtop__right .readybtn', src: 'vanilla', count: 1, rot: 'ok',
    note: '休整期才出现；`is-on` = 已准备。含空格键提示 `kbd`。', stage: 'top', pick: '.readybtn' },
  { id: 'top.readycount', name: '已就绪计数', layer: 'top', path: 'right', sel: '.gtop__right .readywrap__count', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：`已就绪 N/M`；2 人以上才出现。', stage: 'top', pick: '.readywrap__count' },
  { id: 'top.readywhy', name: '准备被拒原因', layer: 'top', path: 'right', sel: '.gtop__right .readywrap__why', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：一行警示文字（临时整备区待处理 / 教鞭未选）。', stage: 'top', pick: '.readywrap__why' },

  // ============================ ③ 盟约带 ============================
  { id: 'bonds.wrap', name: '盟约带容器', layer: 'bonds', path: '', sel: '.gm__bonds', src: 'vanilla', count: 1, rot: 'no',
    note: '折叠键 + 列表的容器；转它会把折叠键一起带走（折叠键本身是可转的单件）。', stage: 'bonds', pick: '.gm__bonds' },
  { id: 'bonds.toggle', name: '盟约带折叠键', layer: 'bonds', path: 'head', sel: '.bonds-toggle', src: 'vanilla', count: 1, rot: 'ok',
    note: '展开/收起盟约条；无文字、只有一个箭头图标。', stage: 'bonds', pick: '.bonds-toggle' },
  { id: 'bonds.list', name: '盟约列表容器', layer: 'bonds', path: 'strip', sel: '.gm__bond-list', src: 'vanilla', count: 1, rot: 'ok',
    note: '`<div id="match-bond-strip">`，收起时带 hidden。', stage: 'bonds', pick: '.gm__bond-list' },
  { id: 'bonds.strip', name: '盟约条', layer: 'bonds', path: 'strip', sel: '.gm__bond-list .bstrip', src: 'vanilla', count: 1, rot: 'ok',
    note: '`role=list`；空态是 `bstrip--empty`（一行提示文字）。', stage: 'bonds', pick: '.bstrip' },
  { id: 'bonds.slot', name: '盟约图标槽（每个）', layer: 'bonds', path: 'strip', sel: '.gm__bond-list .bslot', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立：一个盟约一格（图标 + 层数角标）。这是 dj-models 里「每图标独立旋转」的那一类。',
    stage: 'bonds', pick: '.bslot' },
  { id: 'bonds.slotcount', name: '盟约层数角标', layer: 'bonds', path: 'strip', sel: '.gm__bond-list .bslot__count', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：一位数字（`is-max` 表示已满）。', stage: 'bonds', pick: '.bslot__count' },
  { id: 'bonds.more', name: '盟约溢出标记 +N', layer: 'bonds', path: 'strip', sel: '.gm__bond-list .bstrip__more', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：收不下的盟约数。', stage: 'bonds', pick: '.bstrip__more' },
  { id: 'bonds.owner', name: '盟约归属标记', layer: 'bonds', path: 'strip', sel: '.gm__bond-list .bstrip__owner', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：查看队友阵地时才出现的「XX 的盟约」。', stage: 'bonds', pick: '.bstrip__owner' },

  // ============================ ④ 左侧队伍列 ============================
  { id: 'team.panel', name: '队伍面板', layer: 'team', path: '', sel: '.team', src: 'vanilla', count: 1, rot: 'ok',
    note: '左列 `<aside>`；窄屏有 `team--compact`。', stage: 'team', pick: '.team' },
  { id: 'team.row', name: '成员行（每个）', layer: 'team', path: 'row', sel: '.team .team__row', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立；`is-self` / `is-team` / `is-watched` / `is-dead` / `is-open` 五态。',
    stage: 'team', pick: '.team__row' },
  { id: 'team.avatar', name: '玩家头像（每个）', layer: 'team', path: 'row', sel: '.team .pavatar', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立；底色由座位色相 `--seat-hue` 决定，没有美术时用名字首字兜底。',
    stage: 'team', pick: '.pavatar' },
  { id: 'team.frame', name: '头像框', layer: 'team', path: 'row', sel: '.team .team__frame', src: 'vanilla', count: 'n', rot: 'no',
    note: '套在头像上的装饰框（同队才画）；它**盖住**头像 ⇒ 跟着头像一起转才是对的，所以本身不单独转。',
    stage: 'team', pick: '.team__frame' },
  { id: 'team.info', name: '成员信息块', layer: 'team', path: 'row', sel: '.team .team__info', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：名字 + 生命/漏怪 + 状态一行文字。', stage: 'team', pick: '.team__info' },
  { id: 'team.name', name: '成员名字', layer: 'team', path: 'row', sel: '.team .team__name', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：文字。', stage: 'team', pick: '.team__name' },
  { id: 'team.line', name: '成员生命/漏怪行', layer: 'team', path: 'row', sel: '.team .team__line', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：数字行。', stage: 'team', pick: '.team__line' },
  { id: 'team.status', name: '成员状态标', layer: 'team', path: 'row', sel: '.team .team__status', src: 'vanilla', count: 'n', rot: 'ok',
    note: '在线 / 暂离 / 阵亡 / 离线；`is-<tone>` 决定颜色，有 sprite 时用 sprite。', stage: 'team', pick: '.team__status' },
  { id: 'team.ai', name: 'AI 标记', layer: 'team', path: 'row', sel: '.team .team__ai', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：两个字母的角标。', stage: 'team', pick: '.team__ai' },
  { id: 'team.you', name: '「你」标记', layer: 'team', path: 'row', sel: '.team .team__you', src: 'vanilla', count: 1, rot: 'ok',
    note: '只有自己那一行有。', stage: 'team', pick: '.team__you' },
  { id: 'team.eye', name: '正在查看标记', layer: 'team', path: 'row', sel: '.team .team__eye', src: 'vanilla', count: 1, rot: 'ok',
    note: '正在看某队友阵地时，那一行上的眼睛。', stage: 'team', pick: '.team__eye' },
  { id: 'team.bubble', name: '队友表情气泡', layer: 'team', path: 'row', sel: '.team .team__bubble', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立：队友发一条表情就在他那一行上冒一个气泡。', stage: 'team', pick: '.team__bubble' },
  { id: 'team.ob', name: '前往查看键', layer: 'team', path: 'row', sel: '.team .team__ob', src: 'vanilla', count: 1, rot: 'ok',
    note: '展开某队友时出现的按钮。', stage: 'team', pick: '.team__ob' },
  { id: 'team.back', name: '返回自己键', layer: 'team', path: 'row', sel: '.team .team__back', src: 'vanilla', count: 1, rot: 'ok',
    note: '查看队友时的返回按钮。', stage: 'team', pick: '.team__back' },

  // ============================ ⑤ 右侧效果列 ============================
  { id: 'effects.col', name: '效果列容器', layer: 'effects', path: '', sel: '.gm__effects', src: 'vanilla', count: 1, rot: 'ok',
    note: '右上角那一竖列（聊天面板按几何给它让位，见 cyanfish.chat 的 style.js）。', stage: 'effects', pick: '.gm__effects' },
  { id: 'effects.list', name: '效果列表', layer: 'effects', path: 'list', sel: '.effects', src: 'vanilla', count: 1, rot: 'ok',
    note: '`aria-label=生效中的效果`；最多显示 10 条。', stage: 'effects', pick: '.effects' },
  { id: 'effects.item', name: '生效效果图标（每个）', layer: 'effects', path: 'list', sel: '.gm__effects .effect', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立；`effect--<iconKind>` 决定着色。', stage: 'effects', pick: '.effect' },
  { id: 'effects.num', name: '效果计数角标', layer: 'effects', path: 'list', sel: '.gm__effects .effect__n', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：数字角标（层数/剩余次数）。', stage: 'effects', pick: '.effect__n' },

  // ============================ ⑥ 调度中心（商店） ============================
  { id: 'shop.bar', name: '调度中心整条', layer: 'shop', path: '', sel: '.shopbar', src: 'vanilla', count: 1, rot: 'no',
    note: '整条商店；转它会把卡片一起带走。要动的是下面那些单件。', stage: 'shop', pick: '.shopbar' },
  { id: 'shop.row', name: '商店行', layer: 'shop', path: 'tools', sel: '.shopbar .shopbar__row', src: 'vanilla', count: 1, rot: 'ok',
    note: '左侧工具列 + 右侧卡片区的横向排布。', stage: 'shop', pick: '.shopbar__row' },
  { id: 'shop.cards', name: '干员卡容器', layer: 'shop', path: 'cards', sel: '.shopbar .shopbar__cards', src: 'vanilla', count: 1, rot: 'ok',
    note: '第 4 行那张卡（可放置角色）所在的行。', stage: 'shop', pick: '.shopbar__cards' },
  { id: 'shop.scard', name: '商店干员卡（每张）', layer: 'shop', path: 'cards', sel: '.shopbar .scard', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：卡片里全是文字（名字 / 价格 / 盟约 / 技能），轴转会压到读不出来。',
    stage: 'shop', pick: '.scard' },
  { id: 'shop.scardart', name: '卡片立绘', layer: 'shop', path: 'cards', sel: '.shopbar .scard__art', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多张、每张独立：卡片上那块人像（唯一适合转的部分）。', stage: 'shop', pick: '.scard__art' },
  { id: 'shop.scardname', name: '卡片名字', layer: 'shop', path: 'cards', sel: '.shopbar .scard__name', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：文字。', stage: 'shop', pick: '.scard__name' },
  { id: 'shop.scardprice', name: '卡片价格徽章', layer: 'shop', path: 'cards', sel: '.shopbar .scard__price', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：六边形价格徽章 + 数字（`is-poor` 表示买不起）。', stage: 'shop', pick: '.scard__price' },
  { id: 'shop.scardbonds', name: '卡片盟约标签', layer: 'shop', path: 'cards', sel: '.shopbar .scard__bonds', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：一排「图标 + 盟约名」。', stage: 'shop', pick: '.scard__bonds' },
  { id: 'shop.scardpips', name: '已拥有进度点', layer: 'shop', path: 'cards', sel: '.shopbar .scard__pips', src: 'vanilla', count: 'n', rot: 'ok',
    note: '一排小菱形（已拥有 N/需要 M）—— 图形，可以转。', stage: 'shop', pick: '.scard__pips' },
  { id: 'shop.scardice', name: '卡片冻结图标', layer: 'shop', path: 'cards', sel: '.shopbar .scard__ice', src: 'vanilla', count: 'n', rot: 'ok',
    note: '被冻结的卡片右上角那枚雪花。', stage: 'shop', pick: '.scard__ice' },
  { id: 'shop.scardconfirm', name: '卡片二次确认', layer: 'shop', path: 'cards', sel: '.shopbar .scard__confirm', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：点一次之后浮出的「确认购买 / 再次点击」。', stage: 'shop', pick: '.scard__confirm' },
  { id: 'shop.lvcard', name: '调度中心升级卡', layer: 'shop', path: 'meta', sel: '.shopbar .lvcard', src: 'vanilla', count: 1, rot: 'ok',
    note: '左下那一枚「升级」大卡（等级 + 价格）；`is-max` 是满级态。', stage: 'shop', pick: '.lvcard' },
  { id: 'shop.funds', name: '资金显示', layer: 'shop', path: 'meta', sel: '.shopbar .funds', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：金币图标 + 数字 + 折叠键。', stage: 'shop', pick: '.funds' },
  { id: 'shop.remain', name: '剩余可放置数', layer: 'shop', path: 'meta', sel: '.shopbar .shopbar__remain', src: 'vanilla', count: 1, rot: 'ok',
    note: '这一轮还能放几个干员（数字会变红到 0）。', stage: 'shop', pick: '.shopbar__remain' },
  { id: 'shop.toolbtn', name: '冻结 / 刷新键', layer: 'shop', path: 'tools', sel: '.shopbar .toolbtn', src: 'vanilla', count: 2, rot: 'ok',
    note: '★ 两个独立目标（`.toolbtn--ice` 冻结 / 刷新）：工具键。', stage: 'shop', pick: '.toolbtn' },
  { id: 'shop.tools', name: '工具列容器', layer: 'shop', path: 'tools', sel: '.shopbar .shopbar__tools', src: 'vanilla', count: 1, rot: 'no',
    note: '工具键的容器；转它等于把两个键一起带走。', stage: 'shop', pick: '.shopbar__tools' },
  { id: 'shop.reward', name: '奖励卡组', layer: 'shop', path: 'reward', sel: '.shopbar .shopbar__reward', src: 'vanilla', count: 1, rot: 'no',
    note: '休整期一次性奖励（`is-items` 是道具奖励）；是一整块内容区，不整体转。', stage: 'shop', pick: '.shopbar__reward' },
  { id: 'shop.rwtag', name: '奖励标题条', layer: 'shop', path: 'reward', sel: '.shopbar .rwtag', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：标题 + 副标题 + 剩余数。', stage: 'shop', pick: '.rwtag' },
  { id: 'shop.tab', name: '商店收起标签', layer: 'shop', path: 'tab', sel: '.shopbar-tab', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：商店收起后底部那一条窄标签。', stage: 'shop', pick: '.shopbar-tab' },

  // ============================ ⑦ 左下角功能键 ============================
  { id: 'corner.wrap', name: '左下角容器', layer: 'corner', path: '', sel: '.gm__corner', src: 'vanilla', danger: true, count: 1, rot: 'no',
    note: '四个（+Mod 追加）功能键的容器；转它 = 把一排键一起带走。', stage: 'corner', pick: '.gm__corner' },
  { id: 'corner.emote', name: '表情开关键', layer: 'corner', path: 'keys', sel: '.gm__corner .ewheel__btn', src: 'vanilla', danger: true, count: 1, rot: 'ok',
    note: '「交流」按钮；点开是表情面板（面板本身另算）。', stage: 'corner', pick: '.ewheel__btn' },
  { id: 'corner.gear', name: '设置按键', layer: 'corner', path: 'keys', sel: '.gm__corner .gm__gear', src: 'vanilla', danger: true, count: 1, rot: 'ok',
    note: '★ 服主点名的那个「左下设置按钮」；只对 `.gm__gear` 第一个匹配项。', stage: 'corner', pick: '.gm__gear' },
  { id: 'corner.guide', name: '玩法说明按键', layer: 'corner', path: 'keys', sel: '.gm__corner .gm__guide', src: 'vanilla', danger: true, count: 1, rot: 'ok',
    note: '与设置键同一个 `.gm__gear` 类，另有 `.gm__guide` 区分。', stage: 'corner', pick: '.gm__guide' },
  { id: 'corner.fs', name: '全屏按键', layer: 'corner', path: 'keys', sel: '.gm__corner .gm__fs', src: 'vanilla', danger: true, count: 1, rot: 'ok',
    note: 'FullscreenButton 挂的类；真正的样式在 `devices.css`（`.fsbtn`）。', stage: 'corner', pick: '.gm__fs' },
  { id: 'corner.epanel', name: '表情面板', layer: 'corner', path: 'emote', sel: '.ewheel__panel', src: 'vanilla', danger: true, count: 1, rot: 'no',
    note: '展开的那块面板（分页 + 网格）；它是"要点的功能面"，只让它里面的条目转。', stage: 'corner', pick: '.ewheel__panel' },
  { id: 'corner.eitem', name: '表情条目（每个）', layer: 'corner', path: 'emote', sel: '.ewheel__panel .ewheel__item', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立；`data-emote=<id>`。', stage: 'corner', pick: '.ewheel__item' },
  { id: 'corner.edot', name: '表情分页点', layer: 'corner', path: 'emote', sel: '.ewheel__panel .ewheel__dot', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立；当前页 `is-on`。', stage: 'corner', pick: '.ewheel__dot' },

  // ============================ ⑧ 提示与状态 ============================
  { id: 'hint.ticker', name: '滚动提示（回合公告）', layer: 'hint', path: 'channel', sel: '.ticker', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：一行公告文字（宿主 ticker 已经占用了这一带；Mod 的弹幕按几何让位）。',
    stage: 'hint', pick: '.ticker' },
  { id: 'hint.toast', name: '顶部错误 / 操作提示', layer: 'hint', path: 'channel', sel: '.toast-host .toast', src: 'vanilla', count: 'n',
    global: true, rot: 'flat',
    note: '★ 宿主把它挂在 app 根（与战斗屏同级）⇒ 选择器在战斗屏之外，靠"在不在战斗中"门控；只宜平面内（文字）。',
    stage: 'hint', pick: '.toast' },
  { id: 'hint.watching', name: '正在查看队友阵地', layer: 'hint', path: 'status', sel: '.gm__watching', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：一行提示 + 返回按钮。', stage: 'hint', pick: '.gm__watching' },
  { id: 'hint.dead', name: '已被淘汰提示', layer: 'hint', path: 'status', sel: '.gm__dead', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：`gm__dead--spectator` 是观战版措辞。', stage: 'hint', pick: '.gm__dead' },
  { id: 'hint.phasebanner', name: '阶段横幅', layer: 'hint', path: 'transient', sel: '.pbanner', src: 'vanilla', count: 1, rot: 'no',
    note: '阶段切换时全屏闪过的标题（自带入场动画）⇒ 转它会与宿主动画抢 transform。', stage: 'hint', pick: '.pbanner' },
  { id: 'hint.resultdialog', name: '结算弹窗', layer: 'hint', path: 'transient', sel: '.rdialog', src: 'vanilla', count: 1, rot: 'no',
    note: '本局结果弹窗，自带入场动画；同 pbanner 的理由。', stage: 'hint', pick: '.rdialog' },

  // ============================ ⑨ 战斗覆盖层 ============================
  { id: 'combat.chud', name: '战斗 HUD 容器', layer: 'combat', path: '', sel: '.chud', src: 'vanilla', count: 1, rot: 'no',
    note: '作战期的整块覆盖（进度 + 消息 + 切换器）；是一整层，不整体转。', stage: 'combat', pick: '.chud' },
  { id: 'combat.progress', name: '队友作战进度', layer: 'combat', path: 'progress', sel: '.chud__progress', src: 'vanilla', count: 1, rot: 'ok',
    note: '`role=list`，一排进度条。', stage: 'combat', pick: '.chud__progress' },
  { id: 'combat.prog', name: '进度单条（每个）', layer: 'combat', path: 'progress', sel: '.chud__progress .chud__prog', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：头像 + 击杀计数文字（`is-done` 是 ✓）。', stage: 'combat', pick: '.chud__prog' },
  { id: 'combat.msg', name: '状态消息行', layer: 'combat', path: 'status', sel: '.chud__msg', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：等队友 / 观战中 / 已淘汰三句话。', stage: 'combat', pick: '.chud__msg' },
  { id: 'combat.vswitch', name: '战场切换器', layer: 'combat', path: 'status', sel: '.chud .vswitch', src: 'vanilla', count: 1, rot: 'ok',
    note: '多战场时的左右切换（`is-single` 表示只有一个）。', stage: 'combat', pick: '.vswitch' },
  { id: 'combat.awayov', name: 'AI 托管覆盖', layer: 'combat', path: 'overlay', sel: '.awayov', src: 'vanilla', count: 1, rot: 'no',
    note: '暂离（AI 托管）时的全屏提示框，`role=dialog`；功能面。', stage: 'combat', pick: '.awayov' },
  { id: 'combat.tempnote', name: '临时整备区提示', layer: 'combat', path: 'overlay', sel: '.tempnote', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：贴着棋盘画的一条提示（含 SVG 边框）。', stage: 'combat', pick: '.tempnote' },

  // ============================ ⑩ 部署交互 ============================
  { id: 'deploy.uframe', name: '部署底框（菱形框）', layer: 'deploy', path: 'frame', sel: '.uframe', src: 'vanilla', count: 1, rot: 'ok',
    note: '选中棋盘上的单位时，他脚下那张菱形框 + 三个动作键（它自己就有 SVG 边线，转起来很直观）。',
    stage: 'deploy', pick: '.uframe' },
  { id: 'deploy.retreat', name: '撤退键', layer: 'deploy', path: 'frame', sel: '.uframe .uframe__btn--retreat', src: 'vanilla', count: 1, rot: 'ok',
    note: '底框上的「撤退」按钮。', stage: 'deploy', pick: '.uframe__btn--retreat' },
  { id: 'deploy.sell', name: '出售键', layer: 'deploy', path: 'frame', sel: '.uframe .uframe__btn--sell', src: 'vanilla', count: 1, rot: 'ok',
    note: '底框上的「出售」按钮（带价格徽章）。', stage: 'deploy', pick: '.uframe__btn--sell' },
  { id: 'deploy.destroy', name: '销毁键', layer: 'deploy', path: 'frame', sel: '.uframe .uframe__btn--destroy', src: 'vanilla', count: 1, rot: 'ok',
    note: '底框上的「销毁」按钮（临时整备区里的单位才有）。', stage: 'deploy', pick: '.uframe__btn--destroy' },
  { id: 'deploy.fwheel', name: '朝向轮', layer: 'deploy', path: 'wheel', sel: '.fwheel', src: 'vanilla', count: 1, rot: 'no',
    note: '拖拽/点击选朝向的转盘；它**本身就是**一个方向交互（自己带旋转语义）⇒ 转它会与交互语义打架。',
    stage: 'deploy', pick: '.fwheel' },
  { id: 'deploy.fwheelx', name: '朝向轮取消键', layer: 'deploy', path: 'wheel', sel: '.fwheel .fwheel__x', src: 'vanilla', count: 1, rot: 'ok',
    note: '转盘中心的取消钮（美术缺失时是 ✕ 文字）。', stage: 'deploy', pick: '.fwheel__x' },
  { id: 'deploy.fwheeltip', name: '朝向轮提示', layer: 'deploy', path: 'wheel', sel: '.fwheel .fwheel__tip', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：一行「拖回中心区域取消」。', stage: 'deploy', pick: '.fwheel__tip' },

  // ============================ ⑪ 机变 / 教鞭选择 ============================
  { id: 'choice.spov', name: '选择覆盖层', layer: 'choice', path: '', sel: '.spov', src: 'vanilla', count: 1, rot: 'no',
    note: '机变阶段 / 教鞭选择的整块覆盖（含背板与栅格）；转它会把整页选择面一起转。', stage: 'choice', pick: '.spov' },
  { id: 'choice.spcard', name: '选择卡（每张）', layer: 'choice', path: 'cards', sel: '.spov__inner .spcard', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：每张卡有一整段描述文字。', stage: 'choice', pick: '.spcard' },
  { id: 'choice.spcardicon', name: '选择卡图标', layer: 'choice', path: 'cards', sel: '.spov__inner .spcard__icon', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多张、每张独立：卡片左上那枚图标。', stage: 'choice', pick: '.spcard__icon' },
  { id: 'choice.who', name: '决策顺序头像', layer: 'choice', path: 'head', sel: '.spov__order .spov__who', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立：`is-cur` 当前 / `is-done` 已选 / `is-self` 自己。', stage: 'choice', pick: '.spov__who' },
  { id: 'choice.pager', name: '分页点', layer: 'choice', path: 'head', sel: '.spov__pager .spov__pgdot', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立：卡多于一页时出现。', stage: 'choice', pick: '.spov__pgdot' },
  { id: 'choice.title', name: '选择层标题', layer: 'choice', path: 'head', sel: '.spov__title', src: 'vanilla', count: 1, rot: 'flat',
    note: '★ 只宜平面内：标题文字（`is-special` 是特殊措辞）。', stage: 'choice', pick: '.spov__title' },

  // ============================ ⑫ 详情窗格（默认不转） ============================
  { id: 'detail.panel', name: '详情面板', layer: 'detail', path: 'panel', sel: '.dpanel', src: 'vanilla', count: 1, rot: 'no',
    note: '★ 干员 / 敌方 / 地块详情。**默认不转**：它整块都是要读的文字与要点的按钮（dj-models 从 v1.3.0 起同此约定），' +
      '而且它自带滚动容器（转起来滚动条会跟着歪）。', stage: 'detail', pick: '.dpanel' },
  { id: 'detail.dhead', name: '详情头图', layer: 'detail', path: 'panel', sel: '.dpanel .dhead__art', src: 'vanilla', count: 1, rot: 'ok',
    note: '详情面板里那一块立绘（详情面板里**唯一**适合转的部分，控制页默认关）。', stage: 'detail', pick: '.dhead__art' },
  { id: 'detail.bpop', name: '盟约详情弹窗', layer: 'detail', path: 'bpop', sel: '.bpop', src: 'vanilla', count: 1, rot: 'no',
    note: '★ 默认不转：一整块可读内容 + 可点成员卡。', stage: 'bpop', pick: '.bpop' },
  { id: 'detail.bpopmember', name: '盟约成员卡', layer: 'detail', path: 'bpop', sel: '.bpop .bpop__member', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立（盟约弹窗里的成员头像格）。', stage: 'bpop', pick: '.bpop__member' },
  { id: 'detail.edrawer', name: '本局信息 / 敌方情报抽屉', layer: 'detail', path: 'edrawer', sel: '.edrawer', src: 'vanilla', count: 1, rot: 'no',
    note: '★ 默认不转：整块可读列表 + 可点行。', stage: 'edrawer', pick: '.edrawer' },
  { id: 'detail.erow', name: '敌人条目（每条）', layer: 'detail', path: 'edrawer', sel: '.edrawer .erow', src: 'vanilla', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：一行敌人（名字 + 标签 + 数量）。', stage: 'edrawer', pick: '.erow' },
  { id: 'detail.ibond', name: '禁用盟约条目', layer: 'detail', path: 'edrawer', sel: '.edrawer .ibond', src: 'vanilla', count: 'n', rot: 'ok',
    note: '★ 一屏多个、每个独立（本局信息页的盟约图标块）。', stage: 'edrawer', pick: '.ibond' },

  // ============================ ⑬ 弹窗 ============================
  { id: 'modal.box', name: '设置弹窗框', layer: 'modal', path: 'settings', sel: '.modal__box', src: 'vanilla', danger: true, count: 1, rot: 'no',
    note: '★ 默认不转：宿主给 `.modal__box` 自带入场动画（写着 transform）⇒ 我们再转就是抢 transform（dj-models 的 style.js 明确记过这条）。'
      + '这里的第一处匹配就是**设置弹窗**（战斗屏里唯一常驻的那个弹窗）。',
    stage: 'modal', pick: '.modal__box' },
  { id: 'modal.exit', name: '离开 / 暂离确认弹窗', layer: 'modal', path: 'exit', sel: '.modal__box--red', src: 'vanilla', count: 1, rot: 'no',
    note: '★ 默认不转：它也是居中铺满的整屏层 + 自带入场动画。', stage: 'modaldanger', pick: '.modal__box' },
  { id: 'modal.settings', name: '设置弹窗', layer: 'modal', path: 'settings', sel: '.set-list', src: 'vanilla', danger: true, count: 1, rot: 'no',
    note: '★ 默认不转：设置项本体（滑块 / 开关 / 输入框），转起来没法用。', stage: 'modal', pick: '.set-list' },
  { id: 'modal.setrow', name: '设置行', layer: 'modal', path: 'settings', sel: '.set-row', src: 'vanilla', danger: true, count: 'n', rot: 'no',
    note: '★ 默认不转：一行 = 标签 + 控件 + 读数。', stage: 'modal', pick: '.set-row' },
  { id: 'modal.settoggle', name: '设置开关', layer: 'modal', path: 'settings', sel: '.set-toggle', src: 'vanilla', danger: true, count: 'n', rot: 'no',
    note: '★ 默认不转：宿主现成的开关控件。', stage: 'modal', pick: '.set-toggle' },
  { id: 'modal.setseg', name: '设置分段控件', layer: 'modal', path: 'settings', sel: '.set-seg', src: 'vanilla', danger: true, count: 'n', rot: 'no',
    note: '★ 默认不转：宿主现成的分段控件。', stage: 'modal', pick: '.set-seg' },

  // ============================ ⑭ 场内画布对象（PIXI） ============================
  // ★ 这一层不是 DOM：它们没有选择器，引擎是**按分组改 PIXI 容器的 transform**（沿用 dj-models 的逐字段结论）。
  //   `sel` 留空，`stage: 'canvas'` 用示意图表示"它在画面的哪个位置"。
  { id: 'pixi.op', name: '干员模型（Spine 小人）', layer: 'canvas', path: 'unit', sel: '', src: 'vanilla', pixi: 'op', count: 'n', rot: 'pixi',
    note: '写 UnitView.body 的 scale/rotation（宿主从不写这两个字段）；模型没加载完的本帧不动。', stage: 'canvas', pick: '[data-pixi="op"]' },
  { id: 'pixi.enemy', name: '敌方模型', layer: 'canvas', path: 'unit', sel: '', src: 'vanilla', pixi: 'enemy', count: 'n', rot: 'pixi',
    note: '含预览栏（penViews）与首领（debug.leader，每帧现读）。', stage: 'canvas', pick: '[data-pixi="enemy"]' },
  { id: 'pixi.token', name: '召唤物', layer: 'canvas', path: 'unit', sel: '', src: 'vanilla', pixi: 'token', count: 'n', rot: 'pixi',
    note: 'kind === token 的 UnitView。', stage: 'canvas', pick: '[data-pixi="token"]' },
  { id: 'pixi.device', name: '装置箱体 / 炮台', layer: 'canvas', path: 'board', sel: '', src: 'vanilla', pixi: 'device', count: 'n', rot: 'pixi',
    note: '★ 必须绕装置自己的屏幕锚点（写 pivot + position），否则会被甩到画布角落；3D 底盘下只有 gfx 抓得到。',
    stage: 'canvas', pick: '[data-pixi="device"]' },
  { id: 'pixi.item', name: '装备 / 掉落物图标', layer: 'canvas', path: 'board', sel: '', src: 'vanilla', pixi: 'item', count: 'n', rot: 'pixi',
    note: '写 ItemView.plate；宿主每帧写 plate.scale ⇒ 用"除以我们上次系数"的写法。', stage: 'canvas', pick: '[data-pixi="item"]' },
  { id: 'pixi.hud', name: '场内血条 / SP 条 / 状态图标', layer: 'canvas', path: 'hud', sel: '', src: 'vanilla', pixi: 'hud', count: 'n', rot: 'pixi',
    note: '★ 服主点名的「干员血条」就在这里：每个单位头顶那个 hud 容器（血条 + SP 条 + 状态图标 + 换人环）；' +
      '宿主只写它的 visible/alpha ⇒ 可绕单位头顶锚点整体转。', stage: 'canvas', pick: '[data-pixi="hud"]' },
  { id: 'pixi.num', name: '伤害数字 / 浮动标签', layer: 'canvas', path: 'text', sel: '', src: 'vanilla', pixi: 'num', count: 'n', rot: 'pixi',
    note: '★ 这一组**恒为平面内旋转、绝不写 cos θ**（轴转会撕裂 24px 的 BitmapText 抗锯齿）—— dj-models v1.5.1 的结论，照搬。',
    stage: 'canvas', pick: '[data-pixi="num"]' },
  { id: 'pixi.fx', name: '其它特效（粒子 / 弹道 / 地面环 / 光环 / 喷火 / 锁定环 / 区域）', layer: 'canvas', path: 'fx', sel: '', src: 'vanilla', pixi: 'fx',
    count: 'n', rot: 'pixi',
    note: '逐句柄核对宿主写不写 rotation；粒子只做压缩（它的 rotation 是累加语义，赋值会破坏自转）。',
    stage: 'canvas', pick: '[data-pixi="fx"]' },
  { id: 'pixi.range', name: '攻击范围 / 部署提示高亮', layer: 'canvas', path: 'board', sel: '', src: 'vanilla', pixi: 'range', unavailable: '它是「哪儿能放」的信息：转起来会看错格子，所以本 Mod 不提供这个开关。', count: 'n', rot: 'pixi',
    note: '选中/拖拽时的格子高亮（tiles 层）。**默认不动**：它是"哪儿能放"的信息，转起来会看错格子。',
    stage: 'canvas', pick: '[data-pixi="range"]' },
  { id: 'pixi.beam', name: '光束（炎佑等）', layer: 'canvas', path: 'fx', sel: '', src: 'vanilla', pixi: 'beam', unavailable: '它的几何每一帧都用屏幕绝对坐标重画，容器上没有可旋转的局部坐标系，所以本 Mod 不提供这个开关。', count: 'n', rot: 'pixi',
    note: '★ **不做**：几何每帧用 moveTo/lineTo 以屏幕绝对坐标重画，容器上没有可旋转的局部坐标系（dj-models 的既有结论）。',
    stage: 'canvas', pick: '[data-pixi="beam"]' },

  // ============================ ⑮ Mod 新增（局内） ============================
  { id: 'mod.chat.tab', name: '聊天图标键（cyanfish.chat）', layer: 'mod', path: 'chat', sel: '.sp-chat__tab', src: 'cyanfish.chat', danger: true, count: 1, rot: 'no',
    note: '右上角一枚方块键，摆在官方「生效效果」列的正上方。★ 默认**不转**：它是 Mod 的唯一入口，转起来可能点不到；' +
      '（dj-models 的「保护设置入口」兜底同此口径）。', stage: 'mod', pick: '.sp-chat__tab' },
  { id: 'mod.chat.dot', name: '聊天未读红点（cyanfish.chat）', layer: 'mod', path: 'chat', sel: '.sp-chat__dot', src: 'cyanfish.chat', count: 1, rot: 'flat',
    note: '★ 只宜平面内：绝对定位的小圆点（跟着图标键的角落）。', stage: 'mod', pick: '.sp-chat__dot' },
  { id: 'mod.chat.box', name: '聊天面板（cyanfish.chat）', layer: 'mod', path: 'chat', sel: '.sp-chat__box', src: 'cyanfish.chat', count: 1, rot: 'no',
    note: '★ 默认不转：输入框 + 消息流，转起来没法打字（同设置面板的理由）。', stage: 'mod', pick: '.sp-chat__box' },
  { id: 'mod.chat.danmaku', name: '对局内聊天弹幕（cyanfish.chat）', layer: 'mod', path: 'chat', sel: '.sp-cm', src: 'cyanfish.chat', count: 1, rot: 'no',
    note: '★ 默认不转：它**自己就是一条自右向左的飞行动画**（逐次实测像素 + 每行独立 keyframes）；再叠加旋转会与它自己的位移打架。' +
      '要"动一条弹幕"的观感，应该关掉它的飞行、改用本 Mod 的旋转（后续版再给）。', stage: 'mod', pick: '.sp-cm' },
  { id: 'mod.chat.danmakurow', name: '弹幕单行（cyanfish.chat）', layer: 'mod', path: 'chat', sel: '.sp-cm .sp-cm__row', src: 'cyanfish.chat', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：一行「[聊] 名字 · 正文」；`is-static` 是减少动态效果时的静态短显。', stage: 'mod', pick: '.sp-cm__row' },
  { id: 'mod.banner.game', name: '对局内横幅（cyanfish.banner）', layer: 'mod', path: 'banner', sel: '.sp-bn--game', src: 'cyanfish.banner', count: 1, rot: 'no',
    note: '★ 默认不转：与聊天弹幕共用同一条通道，同样是**自己的飞行动画**。', stage: 'mod', pick: '.sp-bn--game' },
  { id: 'mod.banner.row', name: '横幅单行（cyanfish.banner）', layer: 'mod', path: 'banner', sel: '.sp-bn--game .sp-bn__row', src: 'cyanfish.banner', count: 'n', rot: 'flat',
    note: '★ 只宜平面内：一行公告文字（`is-warn` / `is-danger` 着色）。', stage: 'mod', pick: '.sp-bn__row' },
  { id: 'mod.dc.gear', name: '调试控制台键（cyanfish.debug-console）', layer: 'mod', path: 'dc', sel: '.gm__corner .sp-dc__gear', src: 'cyanfish.debug-console', danger: true,
    count: 1, rot: 'no',
    note: '左下角官方三键右侧那一格；只在单人 / 全 AI 局出现。★ 默认**不转**：它是唯一入口。', stage: 'mod', pick: '.sp-dc__gear' },
  { id: 'mod.dc.pane', name: '调试面板（cyanfish.debug-console）', layer: 'mod', path: 'dc', sel: '.sp-dc__pane', src: 'cyanfish.debug-console', count: 1, rot: 'no',
    note: '★ 默认不转：一整个表单面板。', stage: 'mod', pick: '.sp-dc__pane' },
  { id: 'mod.ms.embed', name: '模组设置栏（cyanfish.mod-settings）', layer: 'mod', path: 'ms', sel: '.sp-ms__embed', src: 'cyanfish.mod-settings', danger: true, count: 1, rot: 'no',
    note: '★ 默认不转：它渲染在**官方设置弹窗内**（宿主 UI_SLOTS.SETTINGS_SECTIONS），是一整块设置面板。',
    stage: 'modal', pick: '.sp-ms__embed' },
  { id: 'mod.ms.nav', name: '模组设置分栏导航', layer: 'mod', path: 'ms', sel: '.sp-ms__nav', src: 'cyanfish.mod-settings', danger: true, count: 1, rot: 'no',
    note: '★ 默认不转：一列可点的栏位标签。', stage: 'modal', pick: '.sp-ms__nav' },

  // ============================ ⑯ 附：局外（非战斗屏） ============================
  // ★ 这些不在 `#app .screen.gm` 里，本 Mod 的旋转范围**默认不含**它们（转标题屏 / 大厅没有意义）；
  //   列在这里是为了"所有可见元素"这句话有据可查，也为了让后续控制页能按 id 把它们显式关掉。
  { id: 'out.chat.panel', name: '聊天面板（大厅态，cyanfish.chat）', layer: 'outgame', path: 'chat', sel: '.sp-chat__box', src: 'cyanfish.chat', count: 1, rot: 'no',
    note: '同一个组件在非对局页也会挂（`inMatch` 为假时面板不出现，但根节点在）。', stage: 'mod', pick: '.sp-chat__box' },
  { id: 'out.banner.lobby', name: '首页横幅（cyanfish.banner）', layer: 'outgame', path: 'banner', sel: '.sp-bn', src: 'cyanfish.banner', count: 'n', rot: 'no',
    note: '首页顶栏下方那条静态横幅（插槽 `lobby.banners`）。', stage: 'mod', pick: '.sp-bn:not(.sp-bn--game)' },
  { id: 'out.online.chip', name: '在线人数（cyanfish.online）', layer: 'outgame', path: 'online', sel: '.sp-on', src: 'cyanfish.online', count: 1, rot: 'no',
    note: '房间页 / 大厅顶栏那一枚在线人数徽章（插槽 `lobby.topbar`）。', stage: 'outgame', pick: '.sp-on' },
  { id: 'out.announce.list', name: '更新公告列表（cyanfish.announce）', layer: 'outgame', path: 'announce', sel: '.sp-an', src: 'cyanfish.announce', count: 1, rot: 'no',
    note: '公告栏（大厅 / 设置页各一份），一整块可读列表。', stage: 'outgame', pick: '.sp-an' },
  { id: 'out.ms.gear', name: '模组设置入口键（cyanfish.mod-settings）', layer: 'outgame', path: 'ms', sel: '.sp-ms__gear', src: 'cyanfish.mod-settings', count: 1, rot: 'no',
    note: '干员调配顶栏那一枚齿轮（插槽 `loadout.topbar`）。', stage: 'outgame', pick: '.sp-ms__gear' },
  { id: 'out.sv.gear', name: '皮肤语音入口键（cyanfish.skinvoice）', layer: 'outgame', path: 'sv', sel: '.sp-sv__gear', src: 'cyanfish.skinvoice', count: 1, rot: 'no',
    note: '干员调配顶栏那枚「皮肤与语音」键；★ 战斗内那枚浮动键已由该 Mod 自行删除。', stage: 'outgame', pick: '.sp-sv__gear' },
  { id: 'out.sv.fab', name: '皮肤语音浮键（cyanfish.skinvoice）', layer: 'outgame', path: 'sv', sel: '.sp-sv__fab--loadout', src: 'cyanfish.skinvoice', count: 1, rot: 'no',
    note: '调配页左上那枚浮动键（`--loadout` 变体）。', stage: 'outgame', pick: '.sp-sv__fab--loadout' },
  { id: 'out.diy.note', name: '自选编队规则提示（cyanfish.diy-34）', layer: 'outgame', path: 'diy', sel: '[data-sp-diy-note]', src: 'cyanfish.diy-34', count: 1, rot: 'no',
    note: '★ 它**没有**自己的 class：挂点是基座留的中性空属性 `data-sp-diy-note`（该 Mod 自己声明的公开契约）；' +
      '`sp-diy__pulse` 是它的 keyframes 名，不是类名。', stage: 'outgame', pick: '[data-sp-diy-note]' },
  { id: 'out.loadout.io', name: '编队导入导出键（cyanfish.loadout-io）', layer: 'outgame', path: 'io', sel: '.loio-btn', src: 'cyanfish.loadout-io', count: 1, rot: 'no',
    note: '干员调配顶栏的导入/导出（插槽 `loadout.topbar`）；类名前缀 `.loio*`。', stage: 'outgame', pick: '.loio-btn' },
]);

/** id → 记录（运行时按 id 取值用）。 */
export const ELEMENT_BY_ID = Object.freeze(ELEMENTS.reduce((m, e) => { m[e.id] = e; return m; }, {}));

/** 层 id → 层（按 LAYERS 的顺序）。 */
export const LAYER_BY_ID = Object.freeze(LAYERS.reduce((m, l) => { m[l.id] = l; return m; }, {}));

/** 按层分组（目录 / 控制页渲染用）。 */
export function groupByLayer(list = ELEMENTS) {
  const out = [];
  for (const l of LAYERS) {
    const items = list.filter((e) => e.layer === l.id);
    if (items.length) out.push({ layer: l, items });
  }
  return out;
}

/** 本 Mod 的**旋转范围**（默认名单）：`rot !== 'no'` 的元素。 */
export const ROTATABLE = Object.freeze(ELEMENTS.filter((e) => e.rot === 'ok' || e.rot === 'flat' || e.rot === 'pixi').map((e) => e.id));

/** 归一化：把一条记录的缺省字段补齐（`pick` 缺省 = `sel`；`pad` 缺省 0.06）。 */
export function normalizeEntry(e) {
  return {
    id: e.id,
    name: e.name,
    layer: e.layer,
    path: e.path || '',
    sel: e.sel || '',
    global: e.global === true,
    /** ★ 危险元素（设置入口 / 含设置入口的整体 / 全屏容器）：切到非「关」要二次确认。 */
    danger: e.danger === true,
    /** ★ 画布对象（`rot:'pixi'`）的引擎分组键；DOM 元素为 `''`。 */
    pixi: e.pixi || '',
    /** ★ 非空 = **本 Mod 不提供**这个元素的开关（值是给玩家看的原因），设置页里显示为不可选。 */
    unavailable: e.unavailable || '',
    src: e.src || 'vanilla',
    count: e.count == null ? 1 : e.count,
    rot: e.rot || 'ok',
    note: e.note || '',
    stage: e.stage || 'shell',
    pick: e.pick || e.sel || '',
    pad: typeof e.pad === 'number' ? e.pad : 0.06,
  };
}

// ==================================================================================================
// ★★ 层级树（自动从 `layer` + `path` 建出来）
// ==================================================================================================
//
// 服主口径：「能够按照层级自动将战斗中的 UI 整理为可展开的目录列表（例如顶栏左区可展开子级
// 离开按键、延迟显示、观战席胶囊、难度标识），这样在游戏的 mod-setting 页中就可以方便地
// **独立选中元素或元素集合**配置其效果。」
//
// ⇒ 三层结构，全部由数据自动推出，**没有一处手写的树**：
//   · **层节点** `kind:'layer'`：来自 `LAYERS`（16 个）；
//   · **分组节点** `kind:'group'`：来自每条记录的 `path`（见下面的 `SUBGROUP_NAMES` 给中文名）；
//   · **叶子节点** `kind:'leaf'`：一条元素记录本身（`sel` 是它的选择器）。
//
// ★ 「选中元素集合」= 选分组节点：它的 `sel` 是**所有后代叶子选择器的并集**（去重、逗号拼接），
//   `memberIds` 是后代叶子 id —— 控制页据此"一次性把这一组都配上同一个效果"，也可以只在组上打开关。
// ★ 「选中元素」= 选叶子节点：它自己的 `sel` + 自己的参数。
// ★ 有些组里**同时**有"容器叶子"（例如 ② 顶栏 → 左区 里的 `top.left`「顶栏左区」本身）
//   —— 那是"把整块区域当**一个**对象转"，与"把区域里每一件**分别**转"是两件事，两者都在树里可选。

/** 分组键 → 中文名（键 = `层/组键`）。分组键本身写在各条记录的 `path` 里。 */
export const SUBGROUP_NAMES = Object.freeze({
  top: { left: '左区', center: '中区', right: '右区' },
  bonds: { head: '折叠与标题', strip: '盟约条' },
  team: { row: '成员行' },
  effects: { list: '效果列表' },
  shop: { tools: '工具列', cards: '卡片区', meta: '等级与资金', reward: '奖励卡组', tab: '收起标签' },
  corner: { keys: '四个功能键', emote: '表情面板' },
  hint: { channel: '顶部通道', status: '状态提示', transient: '瞬时覆盖层' },
  combat: { progress: '作战进度', status: '消息与战场切换', overlay: '覆盖提示' },
  deploy: { frame: '部署底框', wheel: '朝向轮' },
  choice: { head: '标题与决策顺序', cards: '选择卡' },
  detail: { panel: '详情面板', bpop: '盟约弹窗', edrawer: '情报抽屉' },
  modal: { settings: '设置弹窗', exit: '离开弹窗' },
  canvas: { unit: '单位模型', board: '棋盘对象', hud: '场内血条', text: '伤害数字', fx: '特效' },
  mod: { chat: 'cyanfish.chat', banner: 'cyanfish.banner', dc: 'cyanfish.debug-console', ms: 'cyanfish.mod-settings' },
  outgame: {
    chat: 'cyanfish.chat', banner: 'cyanfish.banner', online: 'cyanfish.online', announce: 'cyanfish.announce',
    ms: 'cyanfish.mod-settings', sv: 'cyanfish.skinvoice', diy: 'cyanfish.diy-34', io: 'cyanfish.loadout-io',
  },
});

/** 一个分组键的中文名（拿不到就退回键本身）。 */
export function subgroupName(layerId, key) {
  const m = SUBGROUP_NAMES[layerId];
  return (m && m[key]) || key;
}

/** 把若干选择器拼成一个并集（去重、保序、逗号分隔）。 */
function joinSel(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const t = String(s || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.join(', ');
}

/**
 * ★★ 建层级树（**纯函数**：同样的元素表永远建出同一棵树）。
 * 返回**层节点数组**（每个层节点下面挂它自己的直接叶子与分组）。
 * 节点形状：
 *   `{ id, kind:'layer'|'group'|'leaf', name, layer, path, children?, leafCount?, memberIds?, sel?, el? }`
 *   · `id`：`L:<层>` / `G:<层>/<组键>` / `E:<元素 id>`（**稳定**，可直接当控制页的键）
 *   · `sel`：layer/group 是"后代叶子选择器的并集"；leaf 是自己的 `sel`
 *   · `memberIds`：layer/group 的后代叶子 id（顺序 = 元素表顺序）
 */
export function buildTree(list = ELEMENTS) {
  const byLayer = new Map();
  for (const l of LAYERS) byLayer.set(l.id, { layer: l, direct: [], groups: new Map() });
  for (const e of list) {
    const n = normalizeEntry(e);
    const box = byLayer.get(n.layer) || byLayer.get(LAYERS[0].id);
    if (n.path) {
      if (!box.groups.has(n.path)) box.groups.set(n.path, []);
      box.groups.get(n.path).push(n);
    } else box.direct.push(n);
  }

  const leaf = (n) => ({
    id: 'E:' + n.id, kind: 'leaf', name: n.name, layer: n.layer, path: n.path,
    leafCount: 1, memberIds: [n.id], sel: n.sel, el: n,
    danger: n.danger === true,                 // ★ 危险叶子（设置入口 / 含设置入口的整体）
    pixi: n.pixi || '',                        // ★ 画布对象的引擎分组键（DOM 元素为 ''）
    unavailable: n.unavailable || '',          // ★ 非空 = 本 Mod 不提供这个开关（设置页显示为不可选）
  });

  const out = [];
  for (const l of LAYERS) {
    const box = byLayer.get(l.id);
    if (!box) continue;
    const children = [];
    for (const n of box.direct) children.push(leaf(n));
    for (const [key, items] of box.groups) {
      const kids = items.map(leaf);
      children.push({
        id: 'G:' + l.id + '/' + key, kind: 'group', name: subgroupName(l.id, key), layer: l.id, path: key,
        children: kids,
        leafCount: kids.reduce((a, k) => a + k.leafCount, 0),
        memberIds: kids.flatMap((k) => k.memberIds),
        sel: joinSel(kids.map((k) => k.sel)),
        danger: kids.some((k) => k.danger),      // ★ 自动传播：组里有危险元素 ⇒ 这一组也危险
      });
    }
    if (!children.length) continue;
    out.push({
      id: 'L:' + l.id, kind: 'layer', name: l.name, desc: l.desc, layer: l.id, path: '',
      children,
      leafCount: children.reduce((a, c) => a + c.leafCount, 0),
      memberIds: children.flatMap((c) => c.memberIds),
      sel: joinSel(children.map((c) => c.sel)),
      danger: children.some((c) => c.danger),    // ★ 同上：整层里有危险元素 ⇒ 这一层也危险
      dangerCount: children.reduce((a, c) => a + countDanger(c), 0),
    });
  }
  return out;
}

/** 一个节点底下有多少个危险叶子（层/组节点用；叶子自己就是 1 或 0）。 */
function countDanger(n) {
  if (n.kind === 'leaf') return n.danger ? 1 : 0;
  return (n.children || []).reduce((a, c) => a + countDanger(c), 0);
}

/** 建好的层级树（页面与设置页共用同一份）。 */
export const TREE = Object.freeze(buildTree());

/** 节点 id → 节点（`L:` / `G:` / `E:` 三种前缀）。 */
export const TREE_BY_ID = Object.freeze((function () {
  const m = {};
  const walk = (ns) => { for (const n of ns) { m[n.id] = n; if (n.children) walk(n.children); } };
  walk(TREE);
  return m;
})());

/** 取某个节点的"可作用选择器"（layer/group = 后代并集；leaf = 自己）。 */
export function treeSel(id) {
  const n = TREE_BY_ID[id];
  return n ? n.sel : '';
}

/** 层节点 / 分组节点的后代叶子 id 列表（leaf 节点返回它自己）。 */
export function treeMembers(id) {
  const n = TREE_BY_ID[id];
  return n ? n.memberIds.slice() : [];
}

/** 树里所有**分组类**节点（layer + group），给"集合"选择用的清单。 */
export function treeGroups() {
  const out = [];
  for (const n of TREE) {
    out.push(n);
    if (n.children) for (const c of n.children) if (c.kind === 'group') out.push(c);
  }
  return out;
}
