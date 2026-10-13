# cyanfish.chat — 对局内聊天（聊天窗 + 弹幕 + 设置页）

> 版本 1.0.0 · 基座 0.2.4 · 轴：**L4（界面）+ L2（一条数据补丁）+ 一个新协议动作**
> ★ 它是 `cyanfish.danmaku`（工序 90「观战者实时弹幕」）的**后继**。那一个**从未上线过任何实例**
> （`<开发期脚本>/deploy_base_024.py`：live 不上传 + test 不上传），其内容已整体并入本 Mod，
> 目录与测试文件随之删除。接缝由 `config.danmaku` 改名为 **`config.chat`**，发送权限由
> 「只有观战者」放宽为「**对局里的真人**」。

## 1. 它做什么

| # | 面 | 落点 | 内容 |
|---|---|---|---|
| ① | 右侧聊天窗 | **`<body>` 上的独立 Preact 根**（不是插槽） | 对局中画面右上角一条可收起的小窗：聊天记录 + 输入框 + 未读数 |
| ② | 弹幕 | 插槽 `game.banners`（**第二个生产者**） | 同一条消息在对局画面顶部飘过（自右向左、半透明、点击穿透、按 `p` 停住） |
| ③ | 设置页 | 插槽 `settings.sections` + `__SP_MODSETTINGS__` | 「对局聊天」一栏三项：对局内弹幕 / 弹幕速度 / 聊天字号 |

## 2. 为什么 ① 不走宿主插槽（本 Mod 唯一一个"非标准"的落点）

三条硬事实，缺一条这个设计都会变：

1. 宿主 `public/js/ui/extensions.js` 的 `UI_SLOTS`（10 个）里**没有**"对局内右侧常驻面板"这一格 ——
   最接近的两条是 `game.banners`（顶部那条 0.34rem 弹幕通道）与 `game.cornerActions`（左下角按钮排）。
2. Mod **不许自己往宿主受控子树里塞节点**（docs/MODS.md §6.4-3）：`screens/*` 是 Preact 组件，
   下一次渲染就把塞进去的节点冲掉。
3. 宿主可用的构建里**没有 `createPortal`**（§6.4-2）。

⇒ 唯一可行且**零改基座**的路：自己在 `<body>` 上开一个根，自己负责定位与指针事件。
**这不是本 Mod 发明的**：`cyanfish.mod-settings` 的顶栏齿轮面板、`cyanfish.skinvoice` 的兜底面板、
`cyanfish.debug-console` 的面板都走同一条路。

★ **为什么不为它开一条新插槽**：那要动 `public/js/ui/extensions.js` + `public/js/screens/game.js`
（两处宿主文件），而独立根已经能表达"右侧一条可收起的小窗"这个需求 —— §4.4 的施工清单要求
"新接缝必须是必要的"，这里不是。

## 3. 几何：面板让开了哪些官方元素

真机几何（1920×1080，`1rem = 100px`；出处 `public/css/screens/game.css` / `game-shop.css`）：

| 官方元素 | 占据 | 出处 |
|---|---|---|
| 顶栏 `.gtop` | y `0 ~ 1.0rem`（官方「回合」框也在里面） | `game.css:25-29` |
| 官方播报 `.ticker` | y `1.0 ~ 1.34rem`，宽 `7.6rem` | `game.css:523` |
| 盟约带 `.gm__bonds` | 从 `1.36rem` 起，`left:1.56rem` / **`right:5.2rem`** | `game.css:238` |
| 团队面板 `.team` | **贴左边**（`left:.22rem`），从 **`top:2.36rem`** 起 | `game.css:316-317` |
| **生效效果列 `.gm__effects`** | **`right:.3rem` / `top:2.4rem`**（只在有生效效果时渲染） | `game.css:444` |
| 商店条 `.shopbar` | `right:.26rem` / `bottom:.2rem`（卡 2.24rem + 工具行 .48rem） | `game-shop.css:7-8` |
| 左下角三键 `.gm__corner` | `left:.24rem` / `bottom:.24rem` | `game.css:464` |

⇒ **收起态 = 右上角一枚方块图标键**（`.5rem × .5rem`，`right:.3rem / top:1.72rem`，只有一个聊天 SVG 图标、
没有文字；外观照左下角 `.gm__gear`）；**展开的面板**在它下方那条竖带（`right:.96rem; top:1.42rem; width:3.6rem`；
真机实测 `x 1464 ~ 1824`）。

★★ **收起态为什么是"与 EFFECTS 同尺寸、摆在它正上方"的方块图标键**（服主口径第三轮：
「聊天框现在在右侧的 EFFECTS 单独一个框很奇怪 …… 收起时只显示一个框 + 聊天 SVG 图标（风格类似左下的设置栏），
大小与右侧 EFFECTS 单框相同，置于 EFFECTS 栏的上方」）：

| 参数 | 值 | 出处 / 算式 |
|---|---|---|
| 尺寸 | `.5rem × .5rem` | = 官方 `.effect`（`game.css:449-450`）⇒ 与 EFFECTS 单框**同大** |
| 右边界 | `.3rem` | = 官方 `.gm__effects` 的 `right`（`game.css:444`）⇒ **右对齐**（真机实测两者右缘都是 1890） |
| 顶点 | `1.72rem` | 2.4（效果列顶）− .5（自己）− .12（gap）− .06（视觉间隙）= 1.72；真机实测底边 222 < 列顶 240 |
| 图标 | `.28rem` | = 官方 `.gm__gear .icon`（`game.css:469`）；颜色走 `currentColor` |

★ 刻意**不跟** `.gm__gear` 的 `.24rem` / `bottom:.24rem`：那是**左下角**那一排的边距，跟着它反而与 EFFECTS 错开 6px。
★ 图标**自绘 inline SVG**（`client/panel.js` 的 `chatIcon()`）：宿主 `ui.Icon` 的 `ICONS` 表里**没有"聊天"这个键**
（核过 `public/js/ui/components.js`）⇒ 硬塞语义相近的会渲染成 `null`，收起态就变成"一个空框"。
★ 三次口径变更全部记在案：左上角（误读）→ 右上角竖排窄标签 → **右上角方块图标键**（现在这一版）。

★★ **右边界为什么是 `.96rem` 而不是与商店条同一个 `.26rem`** —— 这是**真机实测撞出来的**：
`.gm__effects` 那一列实测占 `x 1828.2 ~ 1890`；面板停在 `.26rem`（右缘 1894）会**盖住整列图标**。
★ 不能改它：`game.css:445-447` 的注释写明那一列是**故意**「跟着就绪数往下让」的（手机上防止撞到就绪计数）
⇒ **该让位的是我们**。⇒ 面板右缘退到 `1824`，真机 `getBoundingClientRect` 复核**不再相交**。

★★ **指针事件**：根节点 `.sp-chat` 铺满视口但 **`pointer-events: none`**，
只有真正的面板块（`.sp-chat__box`）与收起态的窄标签（`.sp-chat__tab`）开 `auto`
⇒ **面板之外的地方点击照常落到战场上**（真机 `elementFromPoint` 实测：战场中心 / 面板左侧 / 面板上方
三处命中的都是官方节点或 canvas，没有一个是 Mod 节点）。这是本文件最容易踩的一条。

## 3.1 未读提示（服主口径）

**只在「对局内弹幕 = 关」且「面板 = 收起」时**，窄标签右上角点**一颗红点**（`.sp-chat__dot`，
`.16rem` 圆、宿主 `--red-premium`）。**不显示数字**。

- 弹幕开着 ⇒ **不点**：新消息已经在对局画面顶部飘过一条，玩家已经看到了，再点红点就是重复提示；
- 面板开着 ⇒ **不点**：消息就在眼前；
- 自己发的不算未读；打开面板 / 把弹幕打开 ⇒ 红点立刻清掉。

★ 实现上提示只是**一个布尔**（`unreadDot`，不累计条数）⇒ 窄标签里**永远不会出现数字**；
旧的数字徽标类 `.sp-chat__tabcount` 已删除。★ 这条口径已经写进常设单测（防回退）。

## 4. 通道让位（与 `cyanfish.banner` 共用一个插槽）

`game.banners` 是一条**多生产者**插槽，而对局内**没有第二条可用通道**（真机几何见上表：100~136px
那条窄带已经给了「实时横幅公告」）。⇒ 本 Mod **不叠加、只让位**，判据只有一处
（`client/plan.js` 的 `canStartPass()`）：

- 横幅**此刻不在屏上** —— ★ **几何**判据（读 `.sp-bn--game .sp-bn__row` 的矩形），
  不是"节点在不在"：那个根节点在 45 秒空档里也挂着，行只是被 `translateX` 挪到屏外；
- **且**我们这一轮能在它**下一次起飞前**跑完（实测周期 + `LANE_MARGIN_MS` = 1s 边距）；
- **且**万一还是撞上 ⇒ **横幅赢**（每 120ms 的节拍会撤掉我们的行并放回队首，不丢）。

★ 跨 Mod 读 `.sp-bn--game .sp-bn__row` 是**登记过的公共类名契约**（docs/MODS.md §4.12.9.2 的分配表）。
★ 这一条**只在 `cyanfish.banner` 真的装了的时候**才有意义：没装 ⇒ `bannerRootPresent() === false` ⇒ 仲裁器恒放行。

## 5. 设置项：为什么是这三项（有效设置项自查）

| 条目 | 真实生效的键 | 改了会看到什么 | 撤回路径 |
|---|---|---|---|
| 对局内弹幕 | `sp.pref.chat.danmaku` | 画面上那条飘过的弹幕出现 / 消失（聊天窗照常） | 开关本身就是撤回（默认**开**） |
| 弹幕速度 | `sp.pref.chat.speed` | 同一条消息飘过屏幕用的时间：慢 ≈12.9 秒 / 标准 9 秒 / 快 6 秒 | 「标准」档 |
| 聊天字号 | `sp.pref.chat.font` | 聊天窗里的名字与正文变大 / 变小（**只有可读文字，不改布局**） | 「标准」档 |

★ 三项都**有真值、有可观察差别、有撤回**（判据 = docs/MODS.md §4.12.8.3）。
★ **没有**"开关 + 每项同名开关"这种重复控件，也**没有**摆出来不生效的展示行。
★ **速度这一档不是装饰**：它算出来的时长**真的参与通道仲裁**（见 §4 的第 2 条判据），
所以同一个时刻慢 / 标准 / 快会给出**三种**"能不能起跑"的结论 —— 单测逐值断言了三个封口线。
★ **本机 vs 服务端的分工不许混**：
- `sp.pref.chat`（本机）= 玩家自己**怎么看**；
- `config.chat`（服务器 `data/config.json`）= **规则**（能不能发 / 多长 / 多快 / 屏蔽 / 按房间关）。
两者**互不覆盖**：本机设置改不动服务端规则，服务端的规则也不因玩家调了字号而变。

## 6. 服务端七道闸门（`server/match/chat.js`）

顺序有意（先"这台服开没开"、再"这间房开没开"、再"你是谁"、最后才是内容与频率）：

1. `config.chat.enabled === true` —— 缺省 / 非字面 `true` ⇒ **关**（`CHAT_DEFAULTS`，fail-closed）。
2. `denyRooms` 命中本房间码。
3. `chatSenderAllowed(ps)` —— **对局里的真人**：在座（含房主）/ 已被淘汰仍在局的 / 观战席。
   AI（`isBot`）、已离开（`left`）、没有 `playerId` 的拒绝。
4. `sanitizeChatText()` —— 控制字符 → 空格；零宽/双向控制字符 → 删除（**保留 ZWJ**）；空白折叠；
   空 / 纯空白 ⇒ `BAD_MSG`。
5. `chatLength(body) <= maxLen`（**码位**，一个 emoji 算 1）⇒ 超长 `BAD_MSG`。
6. `chatBlocked(body, blockWords)` ⇒ `BAD_MSG`（**不回显**命中了哪个词）。
7. 同一人的滑动窗口（`cooldownMs` + `burst`/`burstWindowMs`）+ **整间房**的窗口
   （`roomBurst`/`roomWindowMs`）⇒ `RATE`。**只有被接受的那一条才记时间戳。**

★★ **默认等于上游是结构性的**：`readChat()` 在 `config.chat` 缺失 / `enabled !== true` 时返回冻结的
`CHAT_DEFAULTS`，调用点第一条闸门就 `return`。**协议层那一格与 `server/lobby.js` /
`server/match/match/platform.js` 的两行放行一个字没动** ⇒ 缺配置时它们的行为与上游逐值相同。

★ **`server/match/danmaku.js` 现在是一个兼容转发层**（把 `readDanmaku` / `DANMAKU_*` 等旧名字转出到
`chat.js`），好让工序 90 的历史报告仍然读得通；它**不再承载任何逻辑**，也不再有 `danmakuSenderAllowed`。
**新代码一律 import `server/match/chat.js` 的 `CHAT_*` 名字。**

## 7. 落地清单（一个文件一件事）

```
mods/cyanfish.chat/
├─ mod.json                     清单（summary 37 字 / description 分段）
├─ CHANGELOG.md                 按版本的记录
├─ README.md                    本文件
├─ data/config.json             L2：一条 add chat（出厂值 = server/match/chat.js 的 CHAT_FALLBACK）
└─ client/
   ├─ registry.js               ★ 与 cyanfish.mod-settings/client/registry.js **逐字节相同**
   │                              （跨 Mod 设置页注册表；`client/` 只 import 自己这一份）
   ├─ index.js                  入口：订阅 m.danmaku + 挂面板根 + 注册弹幕层 + 注册设置栏
   ├─ plan.js                   **纯逻辑**（无 DOM / 无 hostApi）：配置镜像 / 文本归一化 / 名字解析 /
   │                             能不能发 / 偏好夹取 / 速度→时长 / 通道仲裁器
   ├─ state.js                  宿主胶水：net 收发 / store 快照 / 本机记录 / sp.pref.chat
   ├─ store.js                  本机偏好的**唯一真相**（三个消费者共享：面板 / 弹幕层 / 设置栏）
   ├─ panel.js                  右侧面板组件（展开态 + 收起态窄标签）
   ├─ danmaku.js                弹幕层组件（通道让位 + 注入唯一关键帧）
   ├─ section.js                设置页那一栏（宿主 .set-row / .set-toggle / .set-seg）
   └─ style.js                  样式（只占 .sp-chat__* / .sp-cm__*）
```

## 8. 五个消费方怎么共用同一份偏好

同一份 `sp.pref.chat` 有**三个消费者**（面板 / 弹幕层 / 设置栏），而设置栏画在**官方设置弹窗**里、
面板挂在 `<body>` 的**另一个 Preact 根**上 —— 不在同一棵组件树里。
⇒ `client/store.js` 是一个**共享的可订阅单例**（`getPrefs` / `setPrefs` / `subscribe`）。
★ 三处各自 `loadPrefs()` 一份会得到三份真相（改一处另两处不跟）—— 这正是当初要避免的。

## 9. 已知坑（踩过的，别再踩）

1. **模板字面量里不许出现反引号**（红线）。`style.js` 的 CSS 是模板字面量 ⇒ **CSS 注释里也不许写
   反引号**。本工序被 `node --check` 抓到 **4 次**（`` `left` `` / `` `animation-play-state` `` /
   `` `--red-premium` `` / `` `game.css:444` ``）。★ **第 4 次最严重**：`style.js` 直接**加载失败**
   ⇒ `index.js` 的 import 抛 ⇒ 真机上表现为「**聊天面板整个不见**」（排查方向会被误导到"面板没挂上"）。
   ⇒ 在 CSS 注释里提到属性名 / 变量名时**不要加反引号**；
   ★ 现在有**常设单测**盯着（`导出的 CSS 文本里不许有反引号`），不再只靠记得跑 `node --check`。
2. **`!important` 只许用来压 `pointer-events`**（§4.12.9.6 的 R3）。最初给 `.sp-cm__row` 写了
   `animation-play-state: paused !important` 与降级用的 `left: 50% !important`
   ⇒ 被 `112-page-spec-audit.mjs` 判**硬违规**。改法：**走行内样式**（行内样式本来就压过类）。
3. **`[hidden]` 不生效**（预览页暴露的坑）：作者样式 `.sp-chat__tab { display:flex }` 压过 UA 样式表的
   `[hidden]{display:none}` ⇒ `el.hidden = true` **没用**，收起标签会与展开的面板**同时**挂屏。
   ⇒ 样式里必须显式写 `.sp-chat__tab[hidden], .sp-chat__box[hidden], .sp-chat__dot[hidden] { display:none }`。
   （本 Mod 自己的渲染层走 Preact 条件渲染、不依赖 `hidden`；这条是给宿主 / 预览页兜底。）
4. **乐观占位的替换必须"一步完成"**（真机 bug）：先 `feed = dropPending(...)` 再 `pushFeed(item)` 会
   **状态回退**（`pushFeed` 返回的新数组没接住 ⇒ 占位复活 ⇒ 同一条消息出现两遍）。
   ⇒ 用 `plan.js` 的 `reconcileIncoming(feed, item)`（撤占位 + 追加一步完成），且 `state.js` 把 `feed`
   的写入收敛到**唯一**的 `setFeed()`。
5. **匹配占位不要引入第二个可能为空的字段**（真机 bug）：第二版给占位匹配加了 `playerId` 相等，
   而 `pushPending` 写下的 `playerId` 取自 `state.me.playerId`，在**刚进对局 / 重连之后**可能是空的 ⇒
   **永远匹配不上**，重复照旧。⇒ 判据只用「`pending` 标记 + 正文」。
6. **右上角有一条官方的「生效效果列」**：`.gm__effects`（`right:.3rem; top:2.4rem`，只在有生效效果时渲染）
   实测占 `x 1828.2 ~ 1890` ⇒ 面板右缘必须退到 `.96rem`（`x 1824`）。
   ★ 别去改它的 `right`：宿主注释写明它是**故意**跟着就绪数往下让的。
7. **`.set-toggle` 是 `grid-column: 2 / 4`**（`game.css:624`）⇒ 开关行**不能**再放行尾读数（会互相压住）。
   宿主自己做的是**两格**行（`public/js/ui/settings.js:87-93`）；分段控件（`.set-seg`，同为 `2 / 4`）
   在多列行里照用。
8. **`spawn EPERM` / browser 起不来**：本机的 DSH 沙箱里 `node --test`（默认 per-file 子进程 + 管道）
   与无头浏览器**都起不来**（Chrome 死在 `mojo platform_channel.cc: 拒绝访问 (0x5)`）。
   ⇒ 在本机跑全量单测要 `node --test --experimental-test-isolation=none`；
   但 `--experimental-test-isolation=none` 会把 6000+ 条塞一个堆里**跑到 OOM** ⇒ 全量只能靠默认隔离
   （需要放开沙箱）。★ 浏览器要在**放开沙箱**后才起得来。
9. **别按"节点在不在"判通道占用**：横幅那个根节点在 45 秒空档里也挂着。判据必须是**几何**
   （`laneBusy` 读矩形与视口的横向交集）。

## 10. 本地复现 / 验收

```bash
# 清单与语法
node tools/mod.mjs validate          # 期望：23 个 Mod 全部通过
node tools/mod.mjs lint mods/cyanfish.chat
node --check mods/cyanfish.chat/client/*.js server/match/chat.js

# 本 Mod 的单测（37 条：服务端闸门 + 客户端纯逻辑 + 通道仲裁 + 记录并入 + 红线/形态静态门）
node --test --experimental-test-isolation=none test/match/chat.test.js

# 单独网页预览（不需要服务器，双击即可）
<开发期产物>/chat-001-battle-chat/index.html

# 真机（在**工作区根**跑；无头浏览器默认静音；看完必须 --stop）
node <开发期脚本>/start-local.mjs
#   ├─ 真机探针（需要能起 Chrome；★ 静音 flag 只从 lib/browser-flags.mjs 取）
#   ├─ node <开发期产物>/chat-001-battle-chat/tools/chat-ingame-probe.mjs 3465    # 形态/几何/穿透
#   ├─ node <开发期产物>/chat-001-battle-chat/tools/chat-ingame-probe2.mjs 3465   # 消息/设置页/字号
#   └─ node <开发期产物>/chat-001-battle-chat/tools/chat-preview-probe.mjs        # 预览页三场景
node <开发期脚本>/start-local.mjs --stop
```

★ 设置页那一栏建议在**官方设置弹窗**里看（对局内左下角齿轮 →「模组设置」→「对局聊天」）：
它依赖外壳 Mod `cyanfish.mod-settings` 提供栏位宿主；外壳不在时注册表照常工作（只是没人画出来）。
★ 官方弹窗的内容列是**可滚动**的，而模组设置栏位在**最末尾**（快捷键之后）⇒ 要**滚到底**才看得见。

## 11. 没做的那部分（诚实登记）

1. **多客户端实况没取到**：真机只有**一个**浏览器实例（自己发、自己收）⇒ "**别人**发的消息"
   这条支路在真机上**没验**（单测用桩帧覆盖）。同理"弹幕关 + 收起时因为**别人的**消息而点红点"
   只在**预览页**实测，真机只验了"弹幕开着 ⇒ 收起时**不**点红点"这一半。
2. **真机没验的还有**：`denyRooms` / `blockWords` / 频率上限的拒绝路径（单测覆盖）·
   `prefers-reduced-motion` 降级 · 844×390 等窄视口（只测了 1920×1080）。
3. **房主在房内的一键关闭没做**：那需要把房主身份带进对局（`server/lobby.js` 组装 match 选项处），
   超出本接缝范围。房主现有两条零新协议的等效路径：① 请管理员把房间码写进 `denyRooms`；
   ② 官方「观战席」胶囊只能管观战者，管不了在座玩家 —— 这是**已知缺口**。
4. **不做历史补收**：断线重连 / 中途进场的人不会看到之前的消息（服务端只 `broadcast` 一次、不落盘）。
   这是**有意为之**（与工序 90 同口径），不是缺功能。
5. **没有内容审查**：`blockWords` 默认空表。本工序没有内建任何敏感词表（需要服主口径裁定）。
6. **没有 i18n**：新字符串只有中文原文。`en`/`ko`/`zh-TW` 缺 = 允许；★ 但**日文也缺** ⇒
   严格按"至少中日"口径这是**未完成项**（改 `public/i18n/**` 属改基座，本会话只提需求）。
7. **`game.cornerActions` 那一格没用**：展开 / 收起只在面板顶栏与键盘 `Escape` 上
   （少一处注册 = 少一处与官方三键排的耦合）。★ 收起态是**右上角**那枚窄标签，入口不会找不到。
8. **收起态的口径改了三次**（都记在案）：① 屏幕**左上角**（误读"面板自己的收起键"为"屏幕角"）；
   ② 右上角**竖排窄标签**（`.56rem × 1.5rem` 长条 + 竖排文字）；③ **右上角方块图标键**（与 EFFECTS 单框同尺寸、
   摆在它正上方，只有一个 SVG 图标）—— 现在这一版。★ 教训：遇到**方位 / 形态口径**先确认说的是
   **屏幕角**、**控件在容器里的位置**，还是**要与谁同尺寸 / 对齐**，别自己替对方补全。
9. **宿主 `ui.Icon` 的 `ICONS` 表里没有"聊天"**：硬塞一个语义相近的键会渲染成 `null` ⇒ 收起态变成
   "一个空框"（而且不报错，很难查）。⇒ 自绘 inline SVG，颜色走 `currentColor`。
