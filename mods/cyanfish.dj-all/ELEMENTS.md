# 局内元素目录（`cyanfish.dj-all`）

> ★ 本文件由 `tools/build-catalog.mjs` 从 `client/elements.js` **生成** —— 要改内容就改那份元素表，然后重跑：
> `node mods/cyanfish.dj-all/tools/build-catalog.mjs`。
> 配套的可视化预览页 = `catalog.html`（服务端从 `/mods/cyanfish.dj-all/catalog.html` 打开，或直接双击文件）。

## 0. 三十秒速览

| 项 | 值 |
|---|---|
| 元素总数 | **149** |
| 可转（`ok` + `flat` + `pixi`） | **105** |
| 默认不转（`no`） | **44** |
| 其中 Mod 新增 | **20** |
| 层级 | **16** 层 |

**可旋转性四档**（`rot`）：

| 值 | 含义 | 为什么 |
|---|---|---|
| `ok` | 与其它元素一视同仁（绕竖直轴 / 平面内都行） | 形状对称或本来就是图形，压扁不损失信息 |
| `flat` | **只宜平面内旋转** | 里面是要读的文字 / 细长条：绕竖直轴压窄到 0 宽时读不出来 |
| `no` | **默认不转** | 详情窗格 / 弹窗 / 输入框 / 唯一入口键这类"要读要点的功能面"（dj-models 从 v1.3.0 起立的规矩） |
| `pixi` | 画布对象 | 不是 DOM：引擎改 PIXI 容器的 transform，不走 CSS |

★ `no` 是**默认值**不是硬禁：控制页会给每个元素一个开关，但出厂默认按这里的判定走。

---

## 1. 层级目录（可展开的那棵树）

> 页面左侧那一栏就是它。**节点 id 是稳定键**：后续在「模组设置」里"选中某个元素或某个元素集合"存参数时，
> 存的就是这些 id（`L:` 层 / `G:` 组 / `E:` 元素）。选**组** = 对集合一次性配置；选**元素** = 单独配置。

| 节点 id | 名称 | 含元素 | 集合选择器（该组所有元素的选择器并集，截断） |
|---|---|---|---|
| `L:shell` | **① 战斗屏骨架** | 5 | `#app .screen.gm, .gm__field, .gm__vignette, .gm__loading, .gm__hud` |
| `L:top` | **② 顶栏** | 22 | `.gtop, .gtop__left, .gtop__left .gtop__exit, .gtop__left .ping, .specpill, .gtop__meta .dtag, .gtop__center, .…` |
| `G:top/left` | ↳ 左区 | 5 | `.gtop__left, .gtop__left .gtop__exit, .gtop__left .ping, .specpill, .gtop__meta .dtag` |
| `G:top/center` | ↳ 中区 | 8 | `.gtop__center, .gtop__center .gtop__iconbtn, .roundbox, .gtop__center .capsule, .lp, .misstag, .dpbox, .gtop__…` |
| `G:top/right` | ↳ 右区 | 8 | `.gtop__clock, .pausebtn, .otwarn, .gtop__right, .gtop__right .readywrap, .gtop__right .readybtn, .gtop__right …` |
| `L:bonds` | **③ 盟约带** | 8 | `.gm__bonds, .bonds-toggle, .gm__bond-list, .gm__bond-list .bstrip, .gm__bond-list .bslot, .gm__bond-list .bslo…` |
| `G:bonds/head` | ↳ 折叠与标题 | 1 | `.bonds-toggle` |
| `G:bonds/strip` | ↳ 盟约条 | 6 | `.gm__bond-list, .gm__bond-list .bstrip, .gm__bond-list .bslot, .gm__bond-list .bslot__count, .gm__bond-list .b…` |
| `L:team` | **④ 左侧队伍列** | 14 | `.team, .team .team__row, .team .pavatar, .team .team__frame, .team .team__info, .team .team__name, .team .team…` |
| `G:team/row` | ↳ 成员行 | 13 | `.team .team__row, .team .pavatar, .team .team__frame, .team .team__info, .team .team__name, .team .team__line,…` |
| `L:effects` | **⑤ 右侧效果列** | 4 | `.gm__effects, .effects, .gm__effects .effect, .gm__effects .effect__n` |
| `G:effects/list` | ↳ 效果列表 | 3 | `.effects, .gm__effects .effect, .gm__effects .effect__n` |
| `L:shop` | **⑥ 调度中心（底部）** | 19 | `.shopbar, .shopbar .shopbar__row, .shopbar .toolbtn, .shopbar .shopbar__tools, .shopbar .shopbar__cards, .shop…` |
| `G:shop/tools` | ↳ 工具列 | 3 | `.shopbar .shopbar__row, .shopbar .toolbtn, .shopbar .shopbar__tools` |
| `G:shop/cards` | ↳ 卡片区 | 9 | `.shopbar .shopbar__cards, .shopbar .scard, .shopbar .scard__art, .shopbar .scard__name, .shopbar .scard__price…` |
| `G:shop/meta` | ↳ 等级与资金 | 3 | `.shopbar .lvcard, .shopbar .funds, .shopbar .shopbar__remain` |
| `G:shop/reward` | ↳ 奖励卡组 | 2 | `.shopbar .shopbar__reward, .shopbar .rwtag` |
| `G:shop/tab` | ↳ 收起标签 | 1 | `.shopbar-tab` |
| `L:corner` | **⑦ 左下角功能键** | 8 | `.gm__corner, .gm__corner .ewheel__btn, .gm__corner .gm__gear, .gm__corner .gm__guide, .gm__corner .gm__fs, .ew…` |
| `G:corner/keys` | ↳ 四个功能键 | 4 | `.gm__corner .ewheel__btn, .gm__corner .gm__gear, .gm__corner .gm__guide, .gm__corner .gm__fs` |
| `G:corner/emote` | ↳ 表情面板 | 3 | `.ewheel__panel, .ewheel__panel .ewheel__item, .ewheel__panel .ewheel__dot` |
| `L:hint` | **⑧ 提示与状态** | 6 | `.ticker, .toast-host .toast, .gm__watching, .gm__dead, .pbanner, .rdialog` |
| `G:hint/channel` | ↳ 顶部通道 | 2 | `.ticker, .toast-host .toast` |
| `G:hint/status` | ↳ 状态提示 | 2 | `.gm__watching, .gm__dead` |
| `G:hint/transient` | ↳ 瞬时覆盖层 | 2 | `.pbanner, .rdialog` |
| `L:combat` | **⑨ 战斗覆盖层** | 7 | `.chud, .chud__progress, .chud__progress .chud__prog, .chud__msg, .chud .vswitch, .awayov, .tempnote` |
| `G:combat/progress` | ↳ 作战进度 | 2 | `.chud__progress, .chud__progress .chud__prog` |
| `G:combat/status` | ↳ 消息与战场切换 | 2 | `.chud__msg, .chud .vswitch` |
| `G:combat/overlay` | ↳ 覆盖提示 | 2 | `.awayov, .tempnote` |
| `L:deploy` | **⑩ 部署交互** | 7 | `.uframe, .uframe .uframe__btn--retreat, .uframe .uframe__btn--sell, .uframe .uframe__btn--destroy, .fwheel, .f…` |
| `G:deploy/frame` | ↳ 部署底框 | 4 | `.uframe, .uframe .uframe__btn--retreat, .uframe .uframe__btn--sell, .uframe .uframe__btn--destroy` |
| `G:deploy/wheel` | ↳ 朝向轮 | 3 | `.fwheel, .fwheel .fwheel__x, .fwheel .fwheel__tip` |
| `L:choice` | **⑪ 机变 / 教鞭选择** | 6 | `.spov, .spov__inner .spcard, .spov__inner .spcard__icon, .spov__order .spov__who, .spov__pager .spov__pgdot, .…` |
| `G:choice/cards` | ↳ 选择卡 | 2 | `.spov__inner .spcard, .spov__inner .spcard__icon` |
| `G:choice/head` | ↳ 标题与决策顺序 | 3 | `.spov__order .spov__who, .spov__pager .spov__pgdot, .spov__title` |
| `L:detail` | **⑫ 详情窗格** | 7 | `.dpanel, .dpanel .dhead__art, .bpop, .bpop .bpop__member, .edrawer, .edrawer .erow, .edrawer .ibond` |
| `G:detail/panel` | ↳ 详情面板 | 2 | `.dpanel, .dpanel .dhead__art` |
| `G:detail/bpop` | ↳ 盟约弹窗 | 2 | `.bpop, .bpop .bpop__member` |
| `G:detail/edrawer` | ↳ 情报抽屉 | 3 | `.edrawer, .edrawer .erow, .edrawer .ibond` |
| `L:modal` | **⑬ 弹窗** | 6 | `.modal__box, .set-list, .set-row, .set-toggle, .set-seg, .modal__box--red` |
| `G:modal/settings` | ↳ 设置弹窗 | 5 | `.modal__box, .set-list, .set-row, .set-toggle, .set-seg` |
| `G:modal/exit` | ↳ 离开弹窗 | 1 | `.modal__box--red` |
| `L:canvas` | **⑭ 场内画布对象（PIXI）** | 10 | `` |
| `G:canvas/unit` | ↳ 单位模型 | 3 | `` |
| `G:canvas/board` | ↳ 棋盘对象 | 3 | `` |
| `G:canvas/hud` | ↳ 场内血条 | 1 | `` |
| `G:canvas/text` | ↳ 伤害数字 | 1 | `` |
| `G:canvas/fx` | ↳ 特效 | 2 | `` |
| `L:mod` | **⑮ Mod 新增（局内）** | 11 | `.sp-chat__tab, .sp-chat__dot, .sp-chat__box, .sp-cm, .sp-cm .sp-cm__row, .sp-bn--game, .sp-bn--game .sp-bn__ro…` |
| `G:mod/chat` | ↳ cyanfish.chat | 5 | `.sp-chat__tab, .sp-chat__dot, .sp-chat__box, .sp-cm, .sp-cm .sp-cm__row` |
| `G:mod/banner` | ↳ cyanfish.banner | 2 | `.sp-bn--game, .sp-bn--game .sp-bn__row` |
| `G:mod/dc` | ↳ cyanfish.debug-console | 2 | `.gm__corner .sp-dc__gear, .sp-dc__pane` |
| `G:mod/ms` | ↳ cyanfish.mod-settings | 2 | `.sp-ms__embed, .sp-ms__nav` |
| `L:outgame` | **⑯ 附：局外（非战斗屏）** | 9 | `.sp-chat__box, .sp-bn, .sp-on, .sp-an, .sp-ms__gear, .sp-sv__gear, .sp-sv__fab--loadout, [data-sp-diy-note], .…` |
| `G:outgame/chat` | ↳ cyanfish.chat | 1 | `.sp-chat__box` |
| `G:outgame/banner` | ↳ cyanfish.banner | 1 | `.sp-bn` |
| `G:outgame/online` | ↳ cyanfish.online | 1 | `.sp-on` |
| `G:outgame/announce` | ↳ cyanfish.announce | 1 | `.sp-an` |
| `G:outgame/ms` | ↳ cyanfish.mod-settings | 1 | `.sp-ms__gear` |
| `G:outgame/sv` | ↳ cyanfish.skinvoice | 2 | `.sp-sv__gear, .sp-sv__fab--loadout` |
| `G:outgame/diy` | ↳ cyanfish.diy-34 | 1 | `[data-sp-diy-note]` |
| `G:outgame/io` | ↳ cyanfish.loadout-io | 1 | `.loio-btn` |

---

## 2. 逐元素表（按上面那棵树分组）

### ① 战斗屏骨架（5 个）

> 层节点 `L:shell` · 战斗屏根与两层容器（画布层 / HUD 层）

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shell.screen` | ⚠ 战斗屏根 | `#app .screen.gm` | 原版 | 单件 | 默认不转 | 整个战斗屏的容器；它是所有其它元素的父节点，转它等于转全屏（本 Mod 不提供）。 |

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shell.field` | 战场画布层 | `.gm__field` | 原版 | 单件 | 默认不转 | PIXI 画布挂在这个 div 里（render/app.js）；CSS 转它只会让画布整体倾斜，不能旋转画布里的对象。 |

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shell.vignette` | 战场暗角 | `.gm__vignette` | 原版 | 单件 | 默认不转 | 纯装饰的径向渐变遮罩，`aria-hidden`；转它没有观感意义。 |

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shell.loading` | 战场加载层 | `.gm__loading` | 原版 | 单件 | 默认不转 | 只在 viewKind === loading 时存在（转场那几帧）。 |

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shell.hud` | ⚠ HUD 层（所有 DOM UI 的父容器） | `.gm__hud` | 原版 | 单件 | 默认不转 | 顶栏 / 盟约 / 队伍 / 效果 / 商店 / 左下角 / 提示全在它里面（public/js/screens/game.js:1453）；转它 = 转所有 UI。 |

### ② 顶栏（22 个）

> 层节点 `L:top` · 回合 / 阶段 / 生命 / 延迟 / 准备 / 倒计时 / 暂停

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `top.bar` | 顶栏整条 | `.gtop` | 原版 | 单件 | 可转（轴转 / 平面内） | 三段式 header（左 / 中 / 右）。 |

#### 左区（5 个）· 组节点 `G:top/left`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `top.left` | 顶栏左区 | `.gtop__left` | 原版 | 单件 | 可转（轴转 / 平面内） | 退出键 + 延迟/观战席 + 难度标识。 |
| `top.exit` | ⚠ 离开 / 暂离按键 | `.gtop__left .gtop__exit` | 原版 | 单件 | 可转（轴转 / 平面内） | 官方 Button（danger/lg/square）挂的类；是一个要点的功能键 ⇒ 与 DOM 组同一套角度上限。 |
| `top.ping` | 延迟显示 | `.gtop__left .ping` | 原版 | 单件 | 可转（轴转 / 平面内） | 图标 + 数字 + 单位，四档着色（low/medium/high/off）。 |
| `top.specpill` | 观战席胶囊 | `.specpill` | 原版 | 单件 | 可转（轴转 / 平面内） | 只在房间有观战席时出现；点开是观战席弹窗。 |
| `top.dtag` | 难度标识 | `.gtop__meta .dtag` | 原版 | 单件 | 可转（轴转 / 平面内） | 图标 + 难度名；颜色由 `--d-color` 决定。 |

#### 中区（8 个）· 组节点 `G:top/center`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `top.center` | 顶栏中区 | `.gtop__center` | 原版 | 单件 | 可转（轴转 / 平面内） | 回合框 / 阶段胶囊 / 生命塔 / 漏怪 / 费用 / 两个 🔍 键。 |
| `top.iconbtn` | 🔍 本局信息键 | `.gtop__center .gtop__iconbtn` | 原版 | 单件 | 可转（轴转 / 平面内） | 有官方 sprite 时是整张图（`has-sprite`），没有时是图标 + 箭头兜底。 |
| `top.roundbox` | 回合框 | `.roundbox` | 原版 | 单件 | 可转（轴转 / 平面内） | 「回合」标签 + 数字；隐藏回合显示 `??`。 |
| `top.capsule` | 阶段胶囊 | `.gtop__center .capsule` | 原版 | 单件 | 可转（轴转 / 平面内） | 四态共用：`--prep` / `--combat`（+`--unite`）/ `--boss`；内含图标、标签、击杀数与漏怪标记。 |
| `top.lp` | 生命塔 | `.lp` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：塔身 + 数字 + 结算预扣的 −N，绕竖直轴压扁会让数字读不出来。 |
| `top.misstag` | 漏怪标记 | `.misstag` | 原版 | 单件 | 可转（轴转 / 平面内） | 只在有漏怪数时出现（`is-clear` 是 0 时的样式）。 |
| `top.dpbox` | 部署费用（DP） | `.dpbox` | 原版 | 单件 | 可转（轴转 / 平面内） | 战斗期才显示（DpCounter）；含图标 + 数字 + COST 小标。 |
| `top.enemybtn` | 🔍 敌方情报键 | `.gtop__center .enemybtn` | 原版 | 单件 | 可转（轴转 / 平面内） | 休整期可点（`is-grey` 时禁用）；带 `▶▶` 箭头。 |

#### 右区（8 个）· 组节点 `G:top/right`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `top.clock` | 倒计时区 | `.gtop__clock` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：倒计时数字条；暂停时换成带 PAUSED 标签的冻结读数。 |
| `top.pause` | 暂停按键 | `.pausebtn` | 原版 | 单件 | 可转（轴转 / 平面内） | 仅单人局出现（g.pause）；暂停中换播放图标。 |
| `top.otwarn` | 超时警告（DOT） | `.otwarn` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：一行文字（倒计时 / 每秒流失 / 已流失）；首领回合才有。 |
| `top.right` | 顶栏右区 | `.gtop__right` | 原版 | 单件 | 可转（轴转 / 平面内） | 时钟 + 暂停 + 超时警告 + 准备区。 |
| `top.readywrap` | 准备区 | `.gtop__right .readywrap` | 原版 | 单件 | 可转（轴转 / 平面内） | 准备键 + 拒绝原因 + 已就绪计数三件的容器。 |
| `top.readybtn` | 准备就绪按键 | `.gtop__right .readybtn` | 原版 | 单件 | 可转（轴转 / 平面内） | 休整期才出现；`is-on` = 已准备。含空格键提示 `kbd`。 |
| `top.readycount` | 已就绪计数 | `.gtop__right .readywrap__count` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：`已就绪 N/M`；2 人以上才出现。 |
| `top.readywhy` | 准备被拒原因 | `.gtop__right .readywrap__why` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：一行警示文字（临时整备区待处理 / 教鞭未选）。 |

### ③ 盟约带（8 个）

> 层节点 `L:bonds` · 左上角的盟约图标条与折叠键

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `bonds.wrap` | 盟约带容器 | `.gm__bonds` | 原版 | 单件 | 默认不转 | 折叠键 + 列表的容器；转它会把折叠键一起带走（折叠键本身是可转的单件）。 |

#### 折叠与标题（1 个）· 组节点 `G:bonds/head`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `bonds.toggle` | 盟约带折叠键 | `.bonds-toggle` | 原版 | 单件 | 可转（轴转 / 平面内） | 展开/收起盟约条；无文字、只有一个箭头图标。 |

#### 盟约条（6 个）· 组节点 `G:bonds/strip`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `bonds.list` | 盟约列表容器 | `.gm__bond-list` | 原版 | 单件 | 可转（轴转 / 平面内） | `<div id="match-bond-strip">`，收起时带 hidden。 |
| `bonds.strip` | 盟约条 | `.gm__bond-list .bstrip` | 原版 | 单件 | 可转（轴转 / 平面内） | `role=list`；空态是 `bstrip--empty`（一行提示文字）。 |
| `bonds.slot` | 盟约图标槽（每个） | `.gm__bond-list .bslot` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立：一个盟约一格（图标 + 层数角标）。这是 dj-models 里「每图标独立旋转」的那一类。 |
| `bonds.slotcount` | 盟约层数角标 | `.gm__bond-list .bslot__count` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：一位数字（`is-max` 表示已满）。 |
| `bonds.more` | 盟约溢出标记 +N | `.gm__bond-list .bstrip__more` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：收不下的盟约数。 |
| `bonds.owner` | 盟约归属标记 | `.gm__bond-list .bstrip__owner` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：查看队友阵地时才出现的「XX 的盟约」。 |

### ④ 左侧队伍列（14 个）

> 层节点 `L:team` · 队友头像 / 状态 / 表情气泡

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `team.panel` | 队伍面板 | `.team` | 原版 | 单件 | 可转（轴转 / 平面内） | 左列 `<aside>`；窄屏有 `team--compact`。 |

#### 成员行（13 个）· 组节点 `G:team/row`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `team.row` | 成员行（每个） | `.team .team__row` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立；`is-self` / `is-team` / `is-watched` / `is-dead` / `is-open` 五态。 |
| `team.avatar` | 玩家头像（每个） | `.team .pavatar` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立；底色由座位色相 `--seat-hue` 决定，没有美术时用名字首字兜底。 |
| `team.frame` | 头像框 | `.team .team__frame` | 原版 | 一屏多个（各自独立） | 默认不转 | 套在头像上的装饰框（同队才画）；它**盖住**头像 ⇒ 跟着头像一起转才是对的，所以本身不单独转。 |
| `team.info` | 成员信息块 | `.team .team__info` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：名字 + 生命/漏怪 + 状态一行文字。 |
| `team.name` | 成员名字 | `.team .team__name` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：文字。 |
| `team.line` | 成员生命/漏怪行 | `.team .team__line` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：数字行。 |
| `team.status` | 成员状态标 | `.team .team__status` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | 在线 / 暂离 / 阵亡 / 离线；`is-<tone>` 决定颜色，有 sprite 时用 sprite。 |
| `team.ai` | AI 标记 | `.team .team__ai` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：两个字母的角标。 |
| `team.you` | 「你」标记 | `.team .team__you` | 原版 | 单件 | 可转（轴转 / 平面内） | 只有自己那一行有。 |
| `team.eye` | 正在查看标记 | `.team .team__eye` | 原版 | 单件 | 可转（轴转 / 平面内） | 正在看某队友阵地时，那一行上的眼睛。 |
| `team.bubble` | 队友表情气泡 | `.team .team__bubble` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立：队友发一条表情就在他那一行上冒一个气泡。 |
| `team.ob` | 前往查看键 | `.team .team__ob` | 原版 | 单件 | 可转（轴转 / 平面内） | 展开某队友时出现的按钮。 |
| `team.back` | 返回自己键 | `.team .team__back` | 原版 | 单件 | 可转（轴转 / 平面内） | 查看队友时的返回按钮。 |

### ⑤ 右侧效果列（4 个）

> 层节点 `L:effects` · 当前生效的 effect 图标

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `effects.col` | 效果列容器 | `.gm__effects` | 原版 | 单件 | 可转（轴转 / 平面内） | 右上角那一竖列（聊天面板按几何给它让位，见 cyanfish.chat 的 style.js）。 |

#### 效果列表（3 个）· 组节点 `G:effects/list`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `effects.list` | 效果列表 | `.effects` | 原版 | 单件 | 可转（轴转 / 平面内） | `aria-label=生效中的效果`；最多显示 10 条。 |
| `effects.item` | 生效效果图标（每个） | `.gm__effects .effect` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立；`effect--<iconKind>` 决定着色。 |
| `effects.num` | 效果计数角标 | `.gm__effects .effect__n` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：数字角标（层数/剩余次数）。 |

### ⑥ 调度中心（底部）（19 个）

> 层节点 `L:shop` · 干员卡 / 升级卡 / 资金 / 冻结刷新 / 奖励卡

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shop.bar` | 调度中心整条 | `.shopbar` | 原版 | 单件 | 默认不转 | 整条商店；转它会把卡片一起带走。要动的是下面那些单件。 |

#### 工具列（3 个）· 组节点 `G:shop/tools`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shop.row` | 商店行 | `.shopbar .shopbar__row` | 原版 | 单件 | 可转（轴转 / 平面内） | 左侧工具列 + 右侧卡片区的横向排布。 |
| `shop.toolbtn` | 冻结 / 刷新键 | `.shopbar .toolbtn` | 原版 | 单件 | 可转（轴转 / 平面内） | ★ 两个独立目标（`.toolbtn--ice` 冻结 / 刷新）：工具键。 |
| `shop.tools` | 工具列容器 | `.shopbar .shopbar__tools` | 原版 | 单件 | 默认不转 | 工具键的容器；转它等于把两个键一起带走。 |

#### 卡片区（9 个）· 组节点 `G:shop/cards`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shop.cards` | 干员卡容器 | `.shopbar .shopbar__cards` | 原版 | 单件 | 可转（轴转 / 平面内） | 第 4 行那张卡（可放置角色）所在的行。 |
| `shop.scard` | 商店干员卡（每张） | `.shopbar .scard` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：卡片里全是文字（名字 / 价格 / 盟约 / 技能），轴转会压到读不出来。 |
| `shop.scardart` | 卡片立绘 | `.shopbar .scard__art` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多张、每张独立：卡片上那块人像（唯一适合转的部分）。 |
| `shop.scardname` | 卡片名字 | `.shopbar .scard__name` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：文字。 |
| `shop.scardprice` | 卡片价格徽章 | `.shopbar .scard__price` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：六边形价格徽章 + 数字（`is-poor` 表示买不起）。 |
| `shop.scardbonds` | 卡片盟约标签 | `.shopbar .scard__bonds` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：一排「图标 + 盟约名」。 |
| `shop.scardpips` | 已拥有进度点 | `.shopbar .scard__pips` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | 一排小菱形（已拥有 N/需要 M）—— 图形，可以转。 |
| `shop.scardice` | 卡片冻结图标 | `.shopbar .scard__ice` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | 被冻结的卡片右上角那枚雪花。 |
| `shop.scardconfirm` | 卡片二次确认 | `.shopbar .scard__confirm` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：点一次之后浮出的「确认购买 / 再次点击」。 |

#### 等级与资金（3 个）· 组节点 `G:shop/meta`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shop.lvcard` | 调度中心升级卡 | `.shopbar .lvcard` | 原版 | 单件 | 可转（轴转 / 平面内） | 左下那一枚「升级」大卡（等级 + 价格）；`is-max` 是满级态。 |
| `shop.funds` | 资金显示 | `.shopbar .funds` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：金币图标 + 数字 + 折叠键。 |
| `shop.remain` | 剩余可放置数 | `.shopbar .shopbar__remain` | 原版 | 单件 | 可转（轴转 / 平面内） | 这一轮还能放几个干员（数字会变红到 0）。 |

#### 奖励卡组（2 个）· 组节点 `G:shop/reward`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shop.reward` | 奖励卡组 | `.shopbar .shopbar__reward` | 原版 | 单件 | 默认不转 | 休整期一次性奖励（`is-items` 是道具奖励）；是一整块内容区，不整体转。 |
| `shop.rwtag` | 奖励标题条 | `.shopbar .rwtag` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：标题 + 副标题 + 剩余数。 |

#### 收起标签（1 个）· 组节点 `G:shop/tab`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `shop.tab` | 商店收起标签 | `.shopbar-tab` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：商店收起后底部那一条窄标签。 |

### ⑦ 左下角功能键（8 个）

> 层节点 `L:corner` · 表情 / 设置 / 玩法说明 / 全屏（+ Mod 追加键）

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `corner.wrap` | ⚠ 左下角容器 | `.gm__corner` | 原版 | 单件 | 默认不转 | 四个（+Mod 追加）功能键的容器；转它 = 把一排键一起带走。 |

#### 四个功能键（4 个）· 组节点 `G:corner/keys`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `corner.emote` | ⚠ 表情开关键 | `.gm__corner .ewheel__btn` | 原版 | 单件 | 可转（轴转 / 平面内） | 「交流」按钮；点开是表情面板（面板本身另算）。 |
| `corner.gear` | ⚠ 设置按键 | `.gm__corner .gm__gear` | 原版 | 单件 | 可转（轴转 / 平面内） | ★ 服主点名的那个「左下设置按钮」；只对 `.gm__gear` 第一个匹配项。 |
| `corner.guide` | ⚠ 玩法说明按键 | `.gm__corner .gm__guide` | 原版 | 单件 | 可转（轴转 / 平面内） | 与设置键同一个 `.gm__gear` 类，另有 `.gm__guide` 区分。 |
| `corner.fs` | ⚠ 全屏按键 | `.gm__corner .gm__fs` | 原版 | 单件 | 可转（轴转 / 平面内） | FullscreenButton 挂的类；真正的样式在 `devices.css`（`.fsbtn`）。 |

#### 表情面板（3 个）· 组节点 `G:corner/emote`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `corner.epanel` | ⚠ 表情面板 | `.ewheel__panel` | 原版 | 单件 | 默认不转 | 展开的那块面板（分页 + 网格）；它是"要点的功能面"，只让它里面的条目转。 |
| `corner.eitem` | 表情条目（每个） | `.ewheel__panel .ewheel__item` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立；`data-emote=<id>`。 |
| `corner.edot` | 表情分页点 | `.ewheel__panel .ewheel__dot` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立；当前页 `is-on`。 |

### ⑧ 提示与状态（6 个）

> 层节点 `L:hint` · 滚动提示 / 顶部 toast / 观战提示 / 淘汰提示

#### 顶部通道（2 个）· 组节点 `G:hint/channel`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `hint.ticker` | 滚动提示（回合公告） | `.ticker` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：一行公告文字（宿主 ticker 已经占用了这一带；Mod 的弹幕按几何让位）。 |
| `hint.toast` | 顶部错误 / 操作提示 | `.toast-host .toast`（战斗屏之外） | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 宿主把它挂在 app 根（与战斗屏同级）⇒ 选择器在战斗屏之外，靠"在不在战斗中"门控；只宜平面内（文字）。 |

#### 状态提示（2 个）· 组节点 `G:hint/status`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `hint.watching` | 正在查看队友阵地 | `.gm__watching` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：一行提示 + 返回按钮。 |
| `hint.dead` | 已被淘汰提示 | `.gm__dead` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：`gm__dead--spectator` 是观战版措辞。 |

#### 瞬时覆盖层（2 个）· 组节点 `G:hint/transient`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `hint.phasebanner` | 阶段横幅 | `.pbanner` | 原版 | 单件 | 默认不转 | 阶段切换时全屏闪过的标题（自带入场动画）⇒ 转它会与宿主动画抢 transform。 |
| `hint.resultdialog` | 结算弹窗 | `.rdialog` | 原版 | 单件 | 默认不转 | 本局结果弹窗，自带入场动画；同 pbanner 的理由。 |

### ⑨ 战斗覆盖层（7 个）

> 层节点 `L:combat` · 作战进度 / 等待 / 战场切换 / AI 托管 / 临时整备区

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `combat.chud` | 战斗 HUD 容器 | `.chud` | 原版 | 单件 | 默认不转 | 作战期的整块覆盖（进度 + 消息 + 切换器）；是一整层，不整体转。 |

#### 作战进度（2 个）· 组节点 `G:combat/progress`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `combat.progress` | 队友作战进度 | `.chud__progress` | 原版 | 单件 | 可转（轴转 / 平面内） | `role=list`，一排进度条。 |
| `combat.prog` | 进度单条（每个） | `.chud__progress .chud__prog` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：头像 + 击杀计数文字（`is-done` 是 ✓）。 |

#### 消息与战场切换（2 个）· 组节点 `G:combat/status`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `combat.msg` | 状态消息行 | `.chud__msg` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：等队友 / 观战中 / 已淘汰三句话。 |
| `combat.vswitch` | 战场切换器 | `.chud .vswitch` | 原版 | 单件 | 可转（轴转 / 平面内） | 多战场时的左右切换（`is-single` 表示只有一个）。 |

#### 覆盖提示（2 个）· 组节点 `G:combat/overlay`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `combat.awayov` | AI 托管覆盖 | `.awayov` | 原版 | 单件 | 默认不转 | 暂离（AI 托管）时的全屏提示框，`role=dialog`；功能面。 |
| `combat.tempnote` | 临时整备区提示 | `.tempnote` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：贴着棋盘画的一条提示（含 SVG 边框）。 |

### ⑩ 部署交互（7 个）

> 层节点 `L:deploy` · 部署底框（撤退 / 出售 / 销毁）与朝向轮

#### 部署底框（4 个）· 组节点 `G:deploy/frame`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `deploy.uframe` | 部署底框（菱形框） | `.uframe` | 原版 | 单件 | 可转（轴转 / 平面内） | 选中棋盘上的单位时，他脚下那张菱形框 + 三个动作键（它自己就有 SVG 边线，转起来很直观）。 |
| `deploy.retreat` | 撤退键 | `.uframe .uframe__btn--retreat` | 原版 | 单件 | 可转（轴转 / 平面内） | 底框上的「撤退」按钮。 |
| `deploy.sell` | 出售键 | `.uframe .uframe__btn--sell` | 原版 | 单件 | 可转（轴转 / 平面内） | 底框上的「出售」按钮（带价格徽章）。 |
| `deploy.destroy` | 销毁键 | `.uframe .uframe__btn--destroy` | 原版 | 单件 | 可转（轴转 / 平面内） | 底框上的「销毁」按钮（临时整备区里的单位才有）。 |

#### 朝向轮（3 个）· 组节点 `G:deploy/wheel`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `deploy.fwheel` | 朝向轮 | `.fwheel` | 原版 | 单件 | 默认不转 | 拖拽/点击选朝向的转盘；它**本身就是**一个方向交互（自己带旋转语义）⇒ 转它会与交互语义打架。 |
| `deploy.fwheelx` | 朝向轮取消键 | `.fwheel .fwheel__x` | 原版 | 单件 | 可转（轴转 / 平面内） | 转盘中心的取消钮（美术缺失时是 ✕ 文字）。 |
| `deploy.fwheeltip` | 朝向轮提示 | `.fwheel .fwheel__tip` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：一行「拖回中心区域取消」。 |

### ⑪ 机变 / 教鞭选择（6 个）

> 层节点 `L:choice` · 全屏选择覆盖层与卡片

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `choice.spov` | 选择覆盖层 | `.spov` | 原版 | 单件 | 默认不转 | 机变阶段 / 教鞭选择的整块覆盖（含背板与栅格）；转它会把整页选择面一起转。 |

#### 选择卡（2 个）· 组节点 `G:choice/cards`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `choice.spcard` | 选择卡（每张） | `.spov__inner .spcard` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：每张卡有一整段描述文字。 |
| `choice.spcardicon` | 选择卡图标 | `.spov__inner .spcard__icon` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多张、每张独立：卡片左上那枚图标。 |

#### 标题与决策顺序（3 个）· 组节点 `G:choice/head`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `choice.who` | 决策顺序头像 | `.spov__order .spov__who` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立：`is-cur` 当前 / `is-done` 已选 / `is-self` 自己。 |
| `choice.pager` | 分页点 | `.spov__pager .spov__pgdot` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立：卡多于一页时出现。 |
| `choice.title` | 选择层标题 | `.spov__title` | 原版 | 单件 | 只宜平面内 | ★ 只宜平面内：标题文字（`is-special` 是特殊措辞）。 |

### ⑫ 详情窗格（7 个）

> 层节点 `L:detail` · 干员 / 敌方 / 地块 / 盟约详情（**默认不转**）

#### 详情面板（2 个）· 组节点 `G:detail/panel`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `detail.panel` | 详情面板 | `.dpanel` | 原版 | 单件 | 默认不转 | ★ 干员 / 敌方 / 地块详情。**默认不转**：它整块都是要读的文字与要点的按钮（dj-models 从 v1.3.0 起同此约定），而且它自带滚动容器（转起来滚动条会跟着歪）。 |
| `detail.dhead` | 详情头图 | `.dpanel .dhead__art` | 原版 | 单件 | 可转（轴转 / 平面内） | 详情面板里那一块立绘（详情面板里**唯一**适合转的部分，控制页默认关）。 |

#### 盟约弹窗（2 个）· 组节点 `G:detail/bpop`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `detail.bpop` | 盟约详情弹窗 | `.bpop` | 原版 | 单件 | 默认不转 | ★ 默认不转：一整块可读内容 + 可点成员卡。 |
| `detail.bpopmember` | 盟约成员卡 | `.bpop .bpop__member` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立（盟约弹窗里的成员头像格）。 |

#### 情报抽屉（3 个）· 组节点 `G:detail/edrawer`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `detail.edrawer` | 本局信息 / 敌方情报抽屉 | `.edrawer` | 原版 | 单件 | 默认不转 | ★ 默认不转：整块可读列表 + 可点行。 |
| `detail.erow` | 敌人条目（每条） | `.edrawer .erow` | 原版 | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：一行敌人（名字 + 标签 + 数量）。 |
| `detail.ibond` | 禁用盟约条目 | `.edrawer .ibond` | 原版 | 一屏多个（各自独立） | 可转（轴转 / 平面内） | ★ 一屏多个、每个独立（本局信息页的盟约图标块）。 |

### ⑬ 弹窗（6 个）

> 层节点 `L:modal` · 设置 / 离开 / 玩法说明

#### 设置弹窗（5 个）· 组节点 `G:modal/settings`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `modal.box` | ⚠ 设置弹窗框 | `.modal__box` | 原版 | 单件 | 默认不转 | ★ 默认不转：宿主给 `.modal__box` 自带入场动画（写着 transform）⇒ 我们再转就是抢 transform（dj-models 的 style.js 明确记过这条）。这里的第一处匹配就是**设置弹窗**（战斗屏里唯一常驻的那个弹窗）。 |
| `modal.settings` | ⚠ 设置弹窗 | `.set-list` | 原版 | 单件 | 默认不转 | ★ 默认不转：设置项本体（滑块 / 开关 / 输入框），转起来没法用。 |
| `modal.setrow` | ⚠ 设置行 | `.set-row` | 原版 | 一屏多个（各自独立） | 默认不转 | ★ 默认不转：一行 = 标签 + 控件 + 读数。 |
| `modal.settoggle` | ⚠ 设置开关 | `.set-toggle` | 原版 | 一屏多个（各自独立） | 默认不转 | ★ 默认不转：宿主现成的开关控件。 |
| `modal.setseg` | ⚠ 设置分段控件 | `.set-seg` | 原版 | 一屏多个（各自独立） | 默认不转 | ★ 默认不转：宿主现成的分段控件。 |

#### 离开弹窗（1 个）· 组节点 `G:modal/exit`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `modal.exit` | 离开 / 暂离确认弹窗 | `.modal__box--red` | 原版 | 单件 | 默认不转 | ★ 默认不转：它也是居中铺满的整屏层 + 自带入场动画。 |

### ⑭ 场内画布对象（PIXI）（10 个）

> 层节点 `L:canvas` · 不是 DOM：单位 / 血条 / 伤害数字 / 特效

#### 单位模型（3 个）· 组节点 `G:canvas/unit`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `pixi.op` | 干员模型（Spine 小人） | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | 写 UnitView.body 的 scale/rotation（宿主从不写这两个字段）；模型没加载完的本帧不动。 |
| `pixi.enemy` | 敌方模型 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | 含预览栏（penViews）与首领（debug.leader，每帧现读）。 |
| `pixi.token` | 召唤物 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | kind === token 的 UnitView。 |

#### 棋盘对象（3 个）· 组节点 `G:canvas/board`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `pixi.device` | 装置箱体 / 炮台 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | ★ 必须绕装置自己的屏幕锚点（写 pivot + position），否则会被甩到画布角落；3D 底盘下只有 gfx 抓得到。 |
| `pixi.item` | 装备 / 掉落物图标 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | 写 ItemView.plate；宿主每帧写 plate.scale ⇒ 用"除以我们上次系数"的写法。 |
| `pixi.range` | 攻击范围 / 部署提示高亮 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | 选中/拖拽时的格子高亮（tiles 层）。**默认不动**：它是"哪儿能放"的信息，转起来会看错格子。 **（本 Mod 不提供开关：它是「哪儿能放」的信息：转起来会看错格子，所以本 Mod 不提供这个开关。）** |

#### 场内血条（1 个）· 组节点 `G:canvas/hud`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `pixi.hud` | 场内血条 / SP 条 / 状态图标 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | ★ 服主点名的「干员血条」就在这里：每个单位头顶那个 hud 容器（血条 + SP 条 + 状态图标 + 换人环）；宿主只写它的 visible/alpha ⇒ 可绕单位头顶锚点整体转。 |

#### 伤害数字（1 个）· 组节点 `G:canvas/text`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `pixi.num` | 伤害数字 / 浮动标签 | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | ★ 这一组**恒为平面内旋转、绝不写 cos θ**（轴转会撕裂 24px 的 BitmapText 抗锯齿）—— dj-models v1.5.1 的结论，照搬。 |

#### 特效（2 个）· 组节点 `G:canvas/fx`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `pixi.fx` | 其它特效（粒子 / 弹道 / 地面环 / 光环 / 喷火 / 锁定环 / 区域） | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | 逐句柄核对宿主写不写 rotation；粒子只做压缩（它的 rotation 是累加语义，赋值会破坏自转）。 |
| `pixi.beam` | 光束（炎佑等） | —（画布对象） | 原版 | 一屏多个（各自独立） | 画布对象（引擎接管） | ★ **不做**：几何每帧用 moveTo/lineTo 以屏幕绝对坐标重画，容器上没有可旋转的局部坐标系（dj-models 的既有结论）。 **（本 Mod 不提供开关：它的几何每一帧都用屏幕绝对坐标重画，容器上没有可旋转的局部坐标系，所以本 Mod 不提供这个开关。）** |

### ⑮ Mod 新增（局内）（11 个）

> 层节点 `L:mod` · cyanfish.chat / banner / debug-console / mod-settings

#### cyanfish.chat（5 个）· 组节点 `G:mod/chat`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `mod.chat.tab` | ⚠ 聊天图标键（cyanfish.chat） | `.sp-chat__tab` | cyanfish.chat | 单件 | 默认不转 | 右上角一枚方块键，摆在官方「生效效果」列的正上方。★ 默认**不转**：它是 Mod 的唯一入口，转起来可能点不到；（dj-models 的「保护设置入口」兜底同此口径）。 |
| `mod.chat.dot` | 聊天未读红点（cyanfish.chat） | `.sp-chat__dot` | cyanfish.chat | 单件 | 只宜平面内 | ★ 只宜平面内：绝对定位的小圆点（跟着图标键的角落）。 |
| `mod.chat.box` | 聊天面板（cyanfish.chat） | `.sp-chat__box` | cyanfish.chat | 单件 | 默认不转 | ★ 默认不转：输入框 + 消息流，转起来没法打字（同设置面板的理由）。 |
| `mod.chat.danmaku` | 对局内聊天弹幕（cyanfish.chat） | `.sp-cm` | cyanfish.chat | 单件 | 默认不转 | ★ 默认不转：它**自己就是一条自右向左的飞行动画**（逐次实测像素 + 每行独立 keyframes）；再叠加旋转会与它自己的位移打架。要"动一条弹幕"的观感，应该关掉它的飞行、改用本 Mod 的旋转（后续版再给）。 |
| `mod.chat.danmakurow` | 弹幕单行（cyanfish.chat） | `.sp-cm .sp-cm__row` | cyanfish.chat | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：一行「[聊] 名字 · 正文」；`is-static` 是减少动态效果时的静态短显。 |

#### cyanfish.banner（2 个）· 组节点 `G:mod/banner`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `mod.banner.game` | 对局内横幅（cyanfish.banner） | `.sp-bn--game` | cyanfish.banner | 单件 | 默认不转 | ★ 默认不转：与聊天弹幕共用同一条通道，同样是**自己的飞行动画**。 |
| `mod.banner.row` | 横幅单行（cyanfish.banner） | `.sp-bn--game .sp-bn__row` | cyanfish.banner | 一屏多个（各自独立） | 只宜平面内 | ★ 只宜平面内：一行公告文字（`is-warn` / `is-danger` 着色）。 |

#### cyanfish.debug-console（2 个）· 组节点 `G:mod/dc`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `mod.dc.gear` | ⚠ 调试控制台键（cyanfish.debug-console） | `.gm__corner .sp-dc__gear` | cyanfish.debug-console | 单件 | 默认不转 | 左下角官方三键右侧那一格；只在单人 / 全 AI 局出现。★ 默认**不转**：它是唯一入口。 |
| `mod.dc.pane` | 调试面板（cyanfish.debug-console） | `.sp-dc__pane` | cyanfish.debug-console | 单件 | 默认不转 | ★ 默认不转：一整个表单面板。 |

#### cyanfish.mod-settings（2 个）· 组节点 `G:mod/ms`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `mod.ms.embed` | ⚠ 模组设置栏（cyanfish.mod-settings） | `.sp-ms__embed` | cyanfish.mod-settings | 单件 | 默认不转 | ★ 默认不转：它渲染在**官方设置弹窗内**（宿主 UI_SLOTS.SETTINGS_SECTIONS），是一整块设置面板。 |
| `mod.ms.nav` | ⚠ 模组设置分栏导航 | `.sp-ms__nav` | cyanfish.mod-settings | 单件 | 默认不转 | ★ 默认不转：一列可点的栏位标签。 |

### ⑯ 附：局外（非战斗屏）（9 个）

> 层节点 `L:outgame` · 标题 / 大厅 / 干员调配 / 结算上的 Mod 元素（默认不在旋转范围）

#### cyanfish.chat（1 个）· 组节点 `G:outgame/chat`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.chat.panel` | 聊天面板（大厅态，cyanfish.chat） | `.sp-chat__box` | cyanfish.chat | 单件 | 默认不转 | 同一个组件在非对局页也会挂（`inMatch` 为假时面板不出现，但根节点在）。 |

#### cyanfish.banner（1 个）· 组节点 `G:outgame/banner`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.banner.lobby` | 首页横幅（cyanfish.banner） | `.sp-bn` | cyanfish.banner | 一屏多个（各自独立） | 默认不转 | 首页顶栏下方那条静态横幅（插槽 `lobby.banners`）。 |

#### cyanfish.online（1 个）· 组节点 `G:outgame/online`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.online.chip` | 在线人数（cyanfish.online） | `.sp-on` | cyanfish.online | 单件 | 默认不转 | 房间页 / 大厅顶栏那一枚在线人数徽章（插槽 `lobby.topbar`）。 |

#### cyanfish.announce（1 个）· 组节点 `G:outgame/announce`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.announce.list` | 更新公告列表（cyanfish.announce） | `.sp-an` | cyanfish.announce | 单件 | 默认不转 | 公告栏（大厅 / 设置页各一份），一整块可读列表。 |

#### cyanfish.mod-settings（1 个）· 组节点 `G:outgame/ms`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.ms.gear` | 模组设置入口键（cyanfish.mod-settings） | `.sp-ms__gear` | cyanfish.mod-settings | 单件 | 默认不转 | 干员调配顶栏那一枚齿轮（插槽 `loadout.topbar`）。 |

#### cyanfish.skinvoice（2 个）· 组节点 `G:outgame/sv`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.sv.gear` | 皮肤语音入口键（cyanfish.skinvoice） | `.sp-sv__gear` | cyanfish.skinvoice | 单件 | 默认不转 | 干员调配顶栏那枚「皮肤与语音」键；★ 战斗内那枚浮动键已由该 Mod 自行删除。 |
| `out.sv.fab` | 皮肤语音浮键（cyanfish.skinvoice） | `.sp-sv__fab--loadout` | cyanfish.skinvoice | 单件 | 默认不转 | 调配页左上那枚浮动键（`--loadout` 变体）。 |

#### cyanfish.diy-34（1 个）· 组节点 `G:outgame/diy`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.diy.note` | 自选编队规则提示（cyanfish.diy-34） | `[data-sp-diy-note]` | cyanfish.diy-34 | 单件 | 默认不转 | ★ 它**没有**自己的 class：挂点是基座留的中性空属性 `data-sp-diy-note`（该 Mod 自己声明的公开契约）；`sp-diy__pulse` 是它的 keyframes 名，不是类名。 |

#### cyanfish.loadout-io（1 个）· 组节点 `G:outgame/io`

| 稳定 id | 中文名 | 选择器 | 来源 | 单件/多个 | 可旋转性 | 备注 |
|---|---|---|---|---|---|---|
| `out.loadout.io` | 编队导入导出键（cyanfish.loadout-io） | `.loio-btn` | cyanfish.loadout-io | 单件 | 默认不转 | 干员调配顶栏的导入/导出（插槽 `loadout.topbar`）；类名前缀 `.loio*`。 |

---

## 附 A · 选择器的口径

* 表里的 `sel` **一律相对战斗屏根** `#app .screen.gm`（控制页在装的时候会自动加这个前缀）。
* 唯一的例外是标了「战斗屏之外」的 `hint.toast`：宿主把 `.toast-host` 挂在 app 根上，与战斗屏同级 ⇒
  它靠"现在在不在战斗中"做**运行时门控**（与 dj-models 的 `global: true` 同口径）。
* `shell.screen` 自带 `#app` 前缀（它自己就是那一层）。

## 附 B · 已知没有纳入清单的东西（如实登记）

1. **`fx.pops`**（升格 / 入场提示的 `BitmapText`，`public/js/render/fx/arrivals.js:95`）——
   dj-models 时代就"不在任何分组里"，本目录同样不列它；要纳进来得先给它一个引擎分组。
2. **光束（`fx.beams`）**：列进清单但**标了不做**（几何每帧以屏幕绝对坐标重画，容器上没有可旋转的局部坐标系）。
3. **3D 底盘下的装置箱体**：句柄被 `scene.createDevice` 的闭包藏着（`h.mesh` 恒 `null`），抓不到。
4. **官方美术相关**：本机没有 `public/assets`，预览里的立绘 / 头像 / 盟约图标一律走组件的兜底字形 ——
   这是"预览的缺图"，不是结构差异。

## 附 C · 怎么复核这份清单

```
# ① 元素表里凡是非空的 sel，都应该能在运行中的战斗屏里命中：
#    打开一局 → 控制台粘贴（结果里 count=0 的就是"当时不在场上"，或选择器过期了）
await import("/mods/cyanfish.dj-all/client/elements.js").then(m => {
  const root = document.querySelector("#app .screen.gm") || document;
  const rows = m.ELEMENTS.filter(e => e.sel).map(e => [e.id, e.global ? 0 : root.querySelectorAll(e.sel).length]);
  console.table(rows.filter(r => !r[1]).map(r => ({ id: r[0], count: r[1] })));
});
```

> 或者直接用本 Mod 的自省句柄：`__SP_DJALL__.audit()`（见 `README.md`）。
