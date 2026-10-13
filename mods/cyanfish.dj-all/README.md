# 全局整活（所有可见元素可配置旋转）· `cyanfish.dj-all`

> 在**已归档**的 `cyanfish.dj-models` 之上重构：把「按 9 个粗分组一起动」换成
> **逐元素单独配置旋转 / 压缩**，覆盖局内所有可见元素 —— 原版的与我们的 Mod 新加的都在内。
>
> ★ 本文件描述**当前版本**。逐版变更见 `CHANGELOG.md`；**最近一版是 1.0.0**（2026-10-14，里程碑版）：
> ★★ **「随机偏移」的随机落到元素实例上** —— 画布对象按 `view.uid` **逐对象**（干员 A 与 B、**场上两个同名干员**都不同），
> DOM 元素用 `:nth-child(1..8)` **位置桶**（同为兄弟的重复实例各错各的）；DOM 侧 CSS 同时重写成
> "三条通用 keyframes + 每个实例自己的 `--sp-dja-m/--sp-dja-w`"（CSS 体积反而大幅下降）。
> 其余为 0.6.x 已交付项：① 二次确认是**本 Mod 自己的层**（不复用宿主弹窗）· ③ 目录滚动完全交给玩家 ·
> ⑤b 干员**转身换面（正/背）**（轴转模式按 `cos θ` 符号调 `setDir()`；★ 1.0.1 按服主实测改正：**横向永远用带符号的 `cos θ`**，
> 不再在挂背面时改成 `|cos θ|` —— 背面资产是**对称**的、并非「转过 180° 的那张图」⇒ 既换面又镜像）·
> ⚠ 危险标记只覆盖会连累设置键的那几处 · 浮窗标题栏有存活读数。

---

## 0. 一句话

**把战斗界面里的元素按目录层级一个个打开「转起来」** —— 逐元素、可分别配置旋转与压缩，
在「设置 → 模组设置 → DJ 整活」里操作；**默认每个元素都是「关」**，一个像素都不动。

```
元素表（149 个 / 16 层 / 46 组，id 稳定）      client/elements.js
   ↓ 建树
层级目录（可展开；可选元素，也可选一整组）      client/elements.js → TREE
   ↓ 配置（关 / 全局 / 独立 三档 × 5 个参数）
配置模型 + 编译                                 client/config.js
   ↓
引擎：DOM 侧注入一份 <style> · 画布侧每帧改容器 transform
   ↓                                          client/engine{,-dom,-pixi}.js
控制页（顶部配置区 + 下方目录）/ 独立预览页      client/section.js · settings-preview.html
```

**零痕迹**：关掉 / 卸载 ⇒ 摘 `<style>`（DOM 一个字节没被改过）+ 画布容器 transform 逐值还原。

---

## 1. 目录里有什么

| 文件 | 给谁 | 是什么 |
| --- | --- | --- |
| `mod.json` | 平台 | 清单（`gameVersion` 必须严格等于宿主版本） |
| `client/elements.js` | **运行时 + 工具** | ★★ **元素表（唯一真相）**：`LAYERS` 16 层 + `ELEMENTS` **149 条**（每条带 `path` 二级分组）+ **`TREE`**（从 layer+path **自动建出**的层级树：16 层 / 46 组 / 149 叶） |
| `client/index.js` | 宿主 | L4 入口：挂 `__SP_DJALL__`（清单 + **层级树** + 现场探针）并返回 dispose |
| `client/config.js` | 运行时 | **配置模型**：「关 / 全局 / 独立」三档 + 全局数值 + `sanitize` / 存储 / `compile()` |
| `client/panels.js` | 运行时 | **视图描述层**（纯函数）：`annotate()` / `headModel()` —— 真机与预览页**共用同一份** |
| `client/engine.js` · `engine-dom.js` · `engine-pixi.js` | 运行时 | **引擎**：装配 + DOM 侧（注入一份 CSS）+ 画布侧（每帧改 transform） |
| `client/section.js` · `style.js` · `registry.js` | 运行时 | **控制页**（htm+Preact）+ 面板样式（`.sp-dja__*`）+ 与 mod-settings 的注册表（逐字节同源） |
| `client/highlight.js` | 运行时 | ★③ **位置高亮**：选中元素时在画面上画黄框（`position:fixed` 只读层，不改宿主 DOM） |
| `client/fab.js` | 运行时 | ★② **局内入口**：可拖动的阿米娅图标键 + 它的半透明浮窗（懒加载 vendor preact，`setup` 仍同步返回） |
| `client/confirm.js` | 运行时 | ★① **本 Mod 自己的二次确认层**（挂 body、`z-index:10050`）—— 宿主的 `confirmDialog` 与游戏内设置弹窗同层（`--z-modal:80`），必然被局内浮窗压住，所以不复用它 |
| `client/frontback.js` | 运行时 | ★⑤b **转身换面（正/背）**：轴转模式下按 `cos θ` 符号调宿主 `view.setDir()`；死区迟滞、倒地/晕眩不碰、关闭时逐值还原（移植自归档的 `cyanfish.dj-models`） |
| `assets/amiya-spin.gif` | 资源 | 局内入口的图标：**真动图** 128×128 / 27 帧 / 117 KB（+ 素材源 `阿米娅旋转.gif`，不参与运行） |
| `SOURCE.md` | **合规** | 该素材的**定性（同人二创表情包 · 非官方）/ 出处 / sha1 / 使用限制 / 侵权联系即删**（`docs/MODS.md §7.4` 要求） |
| `catalog.html` | **人** | 逐元素预览页 + **左侧可展开层级目录**（**自包含**，540 KB；点预览可放大；按名字 / id / 选择器过滤） |
| `settings-preview.html` | **人** | ★ 控制页的**独立预览**（供审查；自包含，379 KB）——见 §9.3 |
| `ELEMENTS.md` | **人** | 生成出来的层级清单（§1 层级目录表 + §2 按树分组的逐元素表） |
| `tools/stages.js` | 工具 | 预览舞台（把元素按真实结构还原成 DOM 片段） |
| `tools/build-catalog.mjs` | 工具 | 从元素表生成 `catalog.html` + `ELEMENTS.md` |
| `tools/build-settings-preview.mjs` | 工具 | 生成 `settings-preview.html`（控制页独立预览） |

★ `tools/**` 与 `catalog.html` **不随包分发**（`.spmod` 的安装白名单只认 `mod.json` / `data/` / `content/` /
`client/` / `assets/` / 根目录 `.md`·`.txt`）—— 它们是**作者工具**，不影响任何实例的运行。

---

## 2. 元素表是怎么来的（口径，不是猜的）

16 层、148 条，逐条对源码：

| 层 | 出处 |
| --- | --- |
| ① 战斗屏骨架 | `public/js/screens/game.js:1444-1568` |
| ② 顶栏 | `public/js/ui/hud.js:384-425`（子件在 `ui/components.js` / `ui/gameComponents.js`） |
| ③ 盟约带 | `screens/game.js:1464-1479` + `ui/bondStrip.js` |
| ④ 左侧队伍列 | `ui/teamPanel.js:275-320` + `gameComponents.js` PlayerAvatar |
| ⑤ 右侧效果列 | `ui/effectsList.js:50-60` |
| ⑥ 调度中心（商店） | `ui/shopBar.js:100-205 / 267-390` |
| ⑦ 左下角功能键 | `screens/game.js:1514-1520` + `ui/emotes.js:310-333` |
| ⑧ 提示与状态 | `ui/ticker.js:156` · `ui/toasts.js:130` · `screens/game.js:1487-1510` · `ui/components.js` PhaseBanner/ResultDialog |
| ⑨ 战斗覆盖层 | `ui/combatHud.js:23-92` · `ui/matchChrome.js:111-117` · `ui/underframe.js:158-176` |
| ⑩ 部署交互 | `ui/underframe.js:90-115` · `ui/facingWheel.js:269-290` |
| ⑪ 机变 / 教鞭选择 | `ui/choiceOverlay.js:211-285` |
| ⑫ 详情窗格 | `ui/detailPanel.js:831`（`.dpanel`）· `ui/bondStrip.js:136`（`.bpop`）· `ui/enemyDrawer.js:103`（`.edrawer`） |
| ⑬ 弹窗 | `ui/components.js:456-468`（Modal）· `ui/settings.js:248-290` · `ui/matchChrome.js:94-104` |
| ⑭ 场内画布对象（PIXI） | `public/js/render/**` 的抓手，沿用 `dj-models` 的**逐字段**结论（宿主会不会覆写某个字段） |
| ⑮ Mod 新增（局内） | `mods/cyanfish.{chat,banner,debug-console,mod-settings}/client/**` |
| ⑯ 附：局外 | `mods/cyanfish.{chat,banner,online,announce,mod-settings,skinvoice,loadout-io,diy-34}/client/**` |

**选择器一律相对战斗屏根** `#app .screen.gm`（控制页在装的时候自动加前缀）；
唯一的例外是 `hint.toast` —— 宿主把 `.toast-host` 挂在 app 根上，与战斗屏同级，所以它标了
`global: true`，靠"现在在不在战斗中"做运行时门控（与 `dj-models` 的 `global: true` 同口径）。

### 2.1 可旋转性四档（`rot`）

| 值 | 条数 | 判据 |
| --- | --- | --- |
| `ok` | — | 形状对称或本来就是图形；绕竖直轴压扁不损失信息 |
| `flat` | — | **只宜平面内旋转**：里面是要读的文字 / 细长条（轴转到侧面压成 0 宽就读不出来） |
| `no` | — | **默认不转**：详情窗格 / 弹窗 / 输入框 / 唯一入口键这类"要读要点的功能面" |
| `pixi` | — | 画布对象（不是 DOM：引擎改 PIXI 容器的 transform） |

（准确条数见 `ELEMENTS.md` §0 —— 那是生成出来的，不在这里手抄，免得两边漂移。）

★ `no` 是**默认值**不是硬禁：控制页会给每个元素一个开关，出厂默认按这里的判定走。
「详情窗格 / 弹窗不该转」这条是 `dj-models` 从 v1.3.0 起就立的规矩，本 Mod 沿用。

---

## 3. 怎么看预览页

两种打开方式，任选：

```bash
# ① 起本地实例，浏览器里开（最忠实：CSS 与游戏同一份，走 /css/**）
npm start          # 在宿主仓根起游戏服务
#   → http://127.0.0.1:3000/mods/cyanfish.dj-all/catalog.html
#   ★ 看完停掉进程即可

# ② 直接双击 mods/cyanfish.dj-all/catalog.html（file:// 也能用）
```

> **本页零外部依赖**：游戏的那 7 份 CSS（`theme / components / game / game-shop / game-panels / emotes / devices`）
> 与 7 个 Mod 的 `client/style.js` 里的 CSS 都**原文内联**在 `catalog.html` 里（390 KB，无远程请求、无相对路径）。
> ⇒ 双击（`file://`）、由游戏自身服务（`/mods/<id>/…`）、或被只映射单个文件的静态预览托管，**三种形态都一样能看**。
> ★ 为什么内联：本工序实测踩过 —— 不同部署形态下 CSS 的站点路径不同（真服务器站点根是 `public/`，
> 走 `/css/**`；本地实例把 `public/` 也挂在根下 ⇒ 有 `/public/css/**`）；而用 `fetch` 探测哪套存在**会被
> 游戏的 Service Worker 拦成非 2xx**，反而误判。内联之后这些坑全都不存在。
> ★ 版权：内联的那 7 份 CSS 是上游（GPL-3.0-or-later）原文，逐字节照抄未改；`catalog.html` 不进 `.spmod`
> 分发白名单、也不进开源发布集。

进游戏后在浏览器控制台里：

```js
__SP_DJALL__.catalogUrl()     // 打印预览页地址
__SP_DJALL__.audit()          // 逐层汇总：这一层有几个元素、此刻页面上命中几个
__SP_DJALL__.probe()          // 逐元素命中数（只读）
__SP_DJALL__.elements()       // 元素表
__SP_DJALL__.tree()           // ★ 层级树（设置页要的那份，见 §4）
```

预览页的行为：每张卡片是一块 **19.2rem × 10.8rem 的真实舞台**（根字号固定 100px = 桌面 1920 时 1rem 的真实值），
脚本量出该元素的边框盒、把视窗裁到它周围并按可用空间缩放 ⇒ **元素改位置预览也不会错**。点预览可放大（250 → 520px）。

**页面是两栏的**：左边是**可展开的层级目录**（见 §4），右边是卡片。
* 点目录里的**组名 / 数字 / 那个「◎」**⇒ 右栏只留这一组（顶部出现一条"只看：…"的条，带**该组的集合选择器**，点「× 显示全部」还原）；
* 点目录里的**元素名** ⇒ 滚到它那张卡并高亮（若它不在当前筛选里会先自动清掉筛选）；
* 目录与搜索框、可旋转性筛选是**叠加**生效的（三者取交集）。
★ 页面**可以正常滚动**（这是本轮修的一个真 bug：本页内联了游戏 CSS，而游戏是固定画布 ⇒ 它的
`body{overflow:hidden}` 会被视口继承，导致预览页滚不动；现在 `PAGE_CSS` 放在所有内联 CSS **之后**
并显式恢复 `html,body{overflow-y:auto}`。实测 `canScroll: true` / 文档高 26277px）。
★ 侧栏在本页**吸顶**（`position:sticky`），长列表滚动时目录一直在。

### 3.1 预览的已知近似（如实登记）

| 近似 | 原因 |
| --- | --- |
| 七段数字（倒计时）用同尺寸等宽数字代替 | 真实 `.seg` 是每字符一组多边形 svg，对"看它在哪、多大"没有影响 |
| 图标用内联 SVG 代替官方 sprite | 本机没有 `public/assets`（它不进 git）；正式运行时走组件自己的兜底 |
| 立绘 / 头像 / 盟约图标用兜底字形 | 同上（这是**缺图**，不是结构差异） |
| 聊天弹幕 / 横幅**停在起点**、所有动画被停掉 | 那两条的 keyframes 是**运行时按实测像素逐次生成**的；预览要静止才看得清元素。为了让两条同屏可见，预览把 `.sp-bn--game` 下移了一格（运行时它们共用同一条通道、互斥） |
| 预览里 Mod 元素的 `position: fixed` 被改成 `absolute` | 否则它们会贴到**浏览器视口**而不是舞台 |

---

## 4. ★★ 层级目录树（可展开）—— 「选中元素 / 元素集合」的接口

预览页左侧那一栏、`ELEMENTS.md` §1 的表、以及 `__SP_DJALL__.tree()` 返回的，都是**同一棵树**
（由 `client/elements.js` 的 `buildTree()` 从 `layer` + `path` **自动建出来**，没有一处手写的树）。

```
① 战斗屏骨架
② 顶栏                        ← 层节点   L:top            （含 22 个元素）
   ├ 顶栏整条                  ← 叶子     E:top.bar
   ├ 左区                      ← 组节点   G:top/left       （含 5 个元素）
   │   ├ 顶栏左区              ← 叶子     E:top.left
   │   ├ 离开 / 暂离按键        ← 叶子     E:top.exit
   │   ├ 延迟显示              ← 叶子     E:top.ping
   │   ├ 观战席胶囊            ← 叶子     E:top.specpill
   │   └ 难度标识              ← 叶子     E:top.dtag
   ├ 中区 …（8 个）
   └ 右区 …（8 个）
…
```

**节点 id 是稳定键**（在「模组设置」里存参数就存它）：

| 前缀 | 是什么 | 选它意味着什么 | 关键字段 |
|---|---|---|---|
| `L:<层>` | 16 个层节点 | 整个层一起配 | `sel` = 全层选择器并集 · `memberIds` = 层内元素 id |
| `G:<层>/<组>` | **46 个分组节点** | **元素集合一起配** | 同上 |
| `E:<元素 id>` | 149 个元素（叶子） | 单独配这一个 | `sel` = 它自己的选择器 |

★ **「集合」与「容器」是两件事**，都在树里：例如 ② 顶栏 → 左区 这个**组**（`G:top/left`，`sel` = 那 5 条并集）
说的是"把这 5 件**各自**都配上"；而组里的 `E:top.left`（`sel` = `.gtop__left`）说的是"把**这一整块区域**当成
一个对象转"。想"整个左区一起转"就用后者，想"左区里每一件独立转"就用前者。

★ 实测（本地实例）：`node -e` 里读 `__SP_DJALL__.node('G:top/left')` 得到
`{ name:'左区', count:5, sel:'.gtop__left, .gtop__left .gtop__exit, .gtop__left .ping, .specpill, .gtop__meta .dtag' }`，
`members('G:top/left')` = `['top.left','top.exit','top.ping','top.specpill','top.dtag']`；
在预览页里点「左区」那一行 ⇒ 列表只留那 5 张卡（原始输出见报告 §1.5 与 `dj-all-001-file.txt`）。

★ 在设置页里怎么用（下一版的接法）：`L:` / `G:` / `E:` 三种 id 都存在同一个键空间里，
`sp.pref.djAll` 里一格 = 一个节点 id ⇒ **"选中元素集合配置效果"与"选中元素配置效果"是同一套代码路径**，
只有"作用选择器是一串还是一个"这一点不同（`__SP_DJALL__.selOf(id)` 直接给出）。

---

## 5. 改元素表 / 重新生成

```bash
# 1) 改 client/elements.js（加元素 / 改选择器 / 改备注）
# 2) 重新生成两份产物（在主力树根目录跑）
node mods/cyanfish.dj-all/tools/build-catalog.mjs
#   ✓ 生成 catalog.html …  /  ✓ 生成 ELEMENTS.md …
```

★ **改 id = 改玩家存档里那一格的名字**：id 一旦随版本发布就**不许再改**（改了等于把别人的设置丢掉）。
要调整分组就改 `layer`，要换选择器就改 `sel` —— 这两样不影响 id。

★ 预览舞台（`tools/stages.js`）与元素表是**两份文件**：加元素时若它的舞台里还没有那个结构，
要**先在 `tools/stages.js` 对应的舞台块里补上它**（否则预览页量不到目标、会退化成"整块舞台"）。

★ **加元素时记得给 `path`**：它是层级树的**二级分组键**（`''` = 直接挂在层下）。取值必须是
`SUBGROUP_NAMES` 里该层已经登记过的键（新增键就把中文名一起加进 `SUBGROUP_NAMES`）
—— 树是**自动**建的，`path` 一改，`TREE` / 页面侧栏 / `ELEMENTS.md` 三处同时跟着变，没有第二处要改。

### 5.1 复核清单（改完之后）

```bash
# 元素表里凡是非空 sel，都应该能在运行中的战斗屏里命中：
#   开一局 → 控制台 → __SP_DJALL__.audit()   （present / absent 的分布就是判据）
# 静态自检：
node --check mods/cyanfish.dj-all/client/elements.js
node --check mods/cyanfish.dj-all/client/index.js
node --check mods/cyanfish.dj-all/tools/stages.js
node --check mods/cyanfish.dj-all/tools/build-catalog.mjs
```

`absent` 里有一批是**正常**的（取决于当时局面 / 阶段）：详情窗格、弹窗、机变覆盖、
部署底框、朝向轮、超时警告、暂停键、准备区…… 只有"**本来该在场却常年 absent**"才是选择器过期。

---

## 6. 依赖与风险

* **宿主**：只需要 `public/js/ui/extensions.js` 的 `loadClientMods()` 这套（装载 / 卸载 / 返回同步 dispose）。
  本 Mod 不注册插槽、不 import 宿主内部模块、不发网络请求、不读 localStorage。
* **`gameVersion` 硬门槛**：必须严格等于宿主 `package.json` 的 `version`，否则**整包被跳过**（不报错、不崩服）。
* **风险：几乎没有**。本版是零痕迹的只读模块。真正有观感风险的是下一版的旋转引擎（默认关、逐元素开关）。
* **合规**：
  * 代码 GPL-3.0-or-later；`catalog.html` 内联的那 7 份上游 CSS 也是上游原文（不适用 GPL 的那部分仅指素材，见下）。
  * ★ **本 Mod 带一个美术资源**：局内入口的图标 —— **同人二创表情包（梗图）素材**（角色「阿米娅」，由服主提供）。
    **它不是官方素材**（不是鹰角发布的资源，也不是官方客户端转储），而是社区流通的同人二创表情包；
    它**不适用**本仓库的 GPL 授权，素材版权归原作者；角色形象版权仍归鹰角网络 / Yostar。
    **素材出处 / 哈希 / 使用限制 / 侵权联系即删** = 见 **[SOURCE.md](SOURCE.md)**（按 `docs/MODS.md §7.4` 写）。
  * 预览页（`catalog.html` / `settings-preview.html`）里的图标是**自绘 SVG**，与上面那份素材无关。
  * 本 Mod **完全免费**、**不用于任何盈利形式**。

---

## 7. 自省句柄（dev / E2E）

装载后 `globalThis.__SP_DJALL__` 可用（卸载时摘掉）：

| 成员 | 说明 |
| --- | --- |
| `version` | 本 Mod 版本号 |
| `elements()` / `element(id)` | 元素表（全部 / 一条） |
| `layers()` / `layer(id)` / `grouped()` | 层清单 / 某一层 / 按层分组 |
| ★ `tree()` | **层级树**（`L:` / `G:` / `E:` 三层节点，只读快照；设置页要的就是它） |
| ★ `node(id)` | 一个树节点（`node('G:top/left')` ⇒ 左区那一组） |
| ★ `groups()` | 树里所有**集合类**节点（层 + 组，共 62 个）—— 要列"可批量选的组"时用它 |
| ★ `selOf(id)` / `members(id)` | 某个节点的**可作用选择器**（组 = 后代并集）/ 底下的元素 id 列表 |
| `rotatable()` | **旋转范围**默认名单（`rot !== 'no'` 的 id） |
| `probe(only?)` | 逐元素命中数（只读；`only` 是 id 数组） |
| `audit()` | 逐层汇总：`total / present / absent / noSel / errors` |
| `inMatch()` | 现在算不算"在战斗中" |
| `catalogUrl()` / `indexPath()` | 预览页 / 清单的地址 |
| ★ `config()` / `modeOf(id)` / `valuesOf(id)` | 当前配置（深拷贝）/ 某节点档位 / 某节点此刻生效的数值 |
| ★ `setMode(id,m)` / `setGlobal(patch)` / `setOwn(id,patch)` / `reset()` | 写入口（**与面板同一套语义**；面板上危险元素的二次确认在 UI 层，这里直接切，给 E2E 用） |
| ★ `engineStats()` / `sync()` / `domCss()` / `compile()` / `resolveGroups(items)` | 引擎读数 / 立刻重编译注入 / 会注入的 CSS 原文 / 配置→作用项的纯函数复算 / 画布分组去重 |
| ★ `probeGroup(gid)` / `step()` | 某个画布分组此刻会被动的目标数 / 手动跑一帧（dev） |
| ★ `settingsPreview()` | 控制页**独立预览**的地址（§9.3） |
| ★ `rnd()` / `setRnd(patch)` / `randomOf(id)` / `rndKeys()` | 随机偏移的配置 / 写入口 / **纯函数复算某个节点实际拿到的数值** / 参与随机的参数键（§10.3） |
| ★ `fab()` / `setFab(patch)` / `fabStats()` / `fabAsset()` / `fabElementId` | 局内入口的配置 / 写入口（含位置、不透明度、显示开关）/ 运行读数 / 图标 URL / 按钮 id（§10.1） |
| ★ `openWindow()` | 手动开 / 关局内半透明浮窗（真机上是点那颗图标键） |
| ★ `hlStats()` / `hlShow(items,extra)` / `hlClear()` / `hlRepaint()` | 位置高亮的读数 / 手动高亮一组作用项 / 清除 / 立刻重画（§10.2） |
| `__dispose()` | 卸载本 Mod（等价于宿主 `unloadClientMods` 走到本支） |

---

## 8. 已归档的 `cyanfish.dj-models` 与本 Mod 的关系

`cyanfish.dj-models`（v1.6.1）**已归档**（不在本仓；口径：后续可能需要完全重新设计）。
本 Mod 是它的**重构继承者**，直接继承并**照搬**了它的三条硬结论（照搬处都写了出处）：

1. **`num`（伤害数字）恒为平面内旋转、绝不写 `cos θ`** —— 轴转会撕裂 24 px `BitmapText` 的抗锯齿（v1.5.1）。
2. **晕眩 / 冻结 / 沉睡期间不碰模型选择** —— 宿主的晕眩是 `spine.js` 的动画模式，与"挂正面还是背面骨架"正交（v1.6.0）。
3. **「详情窗格 / 弹窗 / 输入框不该转」**（v1.3.0）· **角度硬上限的必要性**（正交投影下 `θ = 90°` 时投影宽度归零 ⇒ 那一刻点不到）。

同时**丢掉**了它被点名的两处问题（`MOD-SESSION-STANDARD.md` §7.1 的反例）：
`description` 1251 字、设置栏塞满"能调但调了没意义"的旋钮。本版**一个设置项都不注册**。

| dj-models | dj-all |
| --- | --- |
| 9 个**粗分组**开关（干员 / 敌方 / 召唤物 / 装置 / 物品 / 血条 / 数字 / 特效 / DOM） | **逐元素**（148 条 × 各自参数） |
| DOM 组按 11 类选择器批处理 | 同样的选择器，但**每类、每个**都在表里各占一行 |
| 全屏一个总开关 + 4 个全局旋转参数 | 计划：逐元素参数 + 少量"全局默认"（见 §8） |
| 已归档 | 本 Mod（0.1.0 起） |

---

## 9. ★★ 控制页与引擎（v0.2.0 已实现）

### 9.1 控制页（`client/section.js` → 「模组设置 → DJ 整活」）

★★ **v0.4.0 起这一栏分成两处摆放**（服主口径：「窗口设置和说明放在固定的 mod 设置页面，元素设置放在可拖动入口设置界面，
二者功能不重叠」）——**固定设置页 `scope="full"`**：说明 · 运行读数 · 整个 Mod 的总开关 · 局内（入口显示 / 位置 /
浮窗不透明度 / 位置高亮开关）· 恢复出厂；**局内浮窗 `scope="elements"`**：元素配置（三档 + 五参数 + ⚠）· 随机偏移 ·
元素目录 · 元素恢复默认。详见 §12。

（下面这段是"元素配置"那一半的语义，两处共用同一套实现。）

| 档位 | 参数区显示 | 改一个参数会发生什么 |
| --- | --- | --- |
| **关**（出厂默认） | **留空**，且不可输入 / 不可拖动 | 什么都不发生（这个元素不参与效果） |
| **全局** | 显示**当前全局数值** | **改的是全局数值** ⇒ 所有选「全局」的元素一起变 |
| **独立** | **默认显示当前全局数值**（读时回落，不落盘） | **只改这一个元素自己**的数值 |

★ 「独立」档第一次改之前，存档里**不写数值**（`{ m:'own' }`），所以它天然显示"当时的全局值"。
★ 分组节点（`L:` / `G:`）与元素节点（`E:`）**走同一套 UI**：选一整组 = 一次给集合里每个元素写同一个档位与数值。

**危险元素**（设置入口 / 包含设置入口的整体 / 全屏容器，共 **18 个叶子 + 12 个自动继承的集合节点**）：
目录里有 **⚠** 标记、选中时顶部有警示条；**从「关」切到「全局 / 独立」时先弹二次确认**
（`api.ui.confirmDialog`，真机；预览页有自己的同文案确认框）。确认文案里给了兜底：
浏览器控制台执行 `__SP_DJALL__.reset()` 一键关掉全部效果。
★ 危险标记是**自动传播**的：`elements.js` 里只标了 18 个叶子，`buildTree()` 会让"含危险元素的组 / 层"自动带上 ⚠
（实测 12 个集合节点）。

★ **角度硬上限**：DOM 侧旋转角 ≤ **60°**（正交投影下最窄仍有 50% 宽 ⇒ 任何相位都点得开设置）。

### 9.2 引擎（两侧）

| 侧 | 文件 | 干什么 | 退出 |
| --- | --- | --- | --- |
| DOM | `engine-dom.js` | 把配置编译成**一份 `<style>`** 注入 `<head>`（`@property` + 两条独立动画：旋转一条、压缩一条） | 摘掉那**一个**节点（DOM 一个字节没被改过） |
| 画布 | `engine-pixi.js` | 每帧按分组改 PIXI 容器的 `scale` / `rotation`（`__SP_VIEW__.debug` 的只读抓手） | 逐值还原（`MODE_FREE` 写回原值 / `MODE_DIV` 除回系数） |

* **一个启用节点 = 一到两条作用项**：DOM 元素一条 CSS 规则；画布对象一条分组项。
  含"屏外元素"（只有 `hint.toast`）的组会自动**拆成两条**（作用域不同）。
* **画布分组去重**：同一个分组被多个节点指向时**更具体的节点优先**（叶子 > 组 > 层）。
* **伤害数字（`num`）恒为平面内旋转**：不写 `cos θ`（轴转会撕裂 24px BitmapText 的抗锯齿）——`dj-models` 的既有结论。
* **本轮没做**（如实登记）：转身换面（正/背）、混乱模式、逐元素错相、每帧预算的参数化（固定 400）；
  `pixi.range` / `pixi.beam` 在元素表里标了 `unavailable`（本 Mod 不提供开关，控制页显示为不可选 + 原因）。

### 9.3 控制页的**独立预览**（供审查）

```bash
node mods/cyanfish.dj-all/tools/build-settings-preview.mjs      # 生成 settings-preview.html（379 KB，自包含）
```
打开：直接双击 `mods/cyanfish.dj-all/settings-preview.html`，或由游戏服务打开
`http://<实例>/mods/cyanfish.dj-all/settings-preview.html`（控制台 `__SP_DJALL__.settingsPreview()` 会打印它）。
★ 它把 `elements.js` / `config.js` / `panels.js` 三个纯函数模块打成**经典脚本**内联（`file://` 下 ESM 会被 CORS 挡），
用一个**纯 DOM 渲染器**产出与真机**逐条对齐的类名与结构**，并自带一个同文案的二次确认框（真机上由 `api.ui.confirmDialog` 承担）。
两种渲染器读的是**同一份描述**（`panels.js`），所以"哪些行 / 什么控件 / 什么值 / 可不可改 / 什么文案"不会漂。

## 10. ★ 局内入口 / 位置高亮 / 随机偏移（v0.3.0）

### 10.1 ② 局内独立入口（`client/fab.js` + `assets/amiya-spin.jpg`）

* **图标**：`assets/amiya-spin.gif`（随包分发）—— **真动图**，128×128 / 27 帧 / 10 fps / 2.70 s / 循环 / 带透明通道 / **117 KB**。
  ★ 它是从服主给的素材 `assets/阿米娅旋转.gif`（960×960 · 27 帧 · **1.8 MB**）**只做缩放与调色板优化**得到的
  （`ffmpeg -vf scale=128:128 …,palettegen,paletteuse`）：帧率 / 时长 / 循环 / 透明都原样保留。
  **原件不参与运行**，留在 `assets/` 当素材源（确认后可删，能省 1.8 MB）。
  ★ **动图自己会动 ⇒ 图标上没有 CSS 自转**（否则叠成双倍转速）。将来换成**静态图**时：
  把 `client/fab.js` 的 `ASSET_ANIMATED` 改成 `false`，会自动加上 `--spin` 修饰类用 CSS 匀速自转。
  URL 用 `new URL('../assets/…', import.meta.url)` 取，不写死 `/mods/<id>/…` ⇒ 挂在任何基址都对。
  ★ **素材定性与出处**（同人二创表情包 · 非官方素材 · 含 sha1 与侵权联系即删）= **[SOURCE.md](SOURCE.md)**。
* **位置可配置**：**拖动即配置**（位置存**视口宽高的比例** 0~1 ⇒ 换分辨率不会跑出屏幕）；
  面板「局内 → 入口位置」显示读数、「回到默认位置」一键复位。拖动阈值 4px：小于它算点击（开窗）。
* **可在设置中关闭**：`cfg.fab.on`。关掉 ⇒ 摘掉按钮与浮窗（**不留空壳**，真机验过 `elementGone: true`）。
* **半透明浮窗**：不用宿主 `Modal`（它的遮罩会把战场压暗，正好挡住要看的东西）；自己开一个 `<body>` 根、
  用 **vendor preact** 渲染一扇非模态浮窗，内容**复用同一个 `DjAllSection`** ⇒ 与设置页里那一栏逐像素一致，
  没有第二套渲染器。不透明度可调（35%~100%，默认 72%）。
  ★ vendor 只在**玩家真点开浮窗**时才 `await import` ⇒ `setup()` 仍然同步返回（L4 纪律 ①）。

### 10.2 ③ 元素位置高亮（`client/highlight.js`）

选中目录里的元素 ⇒ 取它**全部后代叶子**的选择器（不按档位过滤 —— 高亮回答的是"它在哪"，与开不开无关），
在画面上给每个命中元素画一圈**黄框**（2px `#ffd54a` + 深色描边，亮/暗战场都看得见），并给每个元素 id 的第一个框挂标签。

* 实现是 `position:fixed` + `pointer-events:none` 的**只读层**（`#sp-dja-hl`）：**不改宿主任何元素**（不加 class、不写内联样式），
  `clear()` 摘掉整层 ⇒ 零残留；框随滚动 / 窗口变化 / 400ms 心跳更新（战场里的元素会走动）。
* **画布对象（`pixi.*`）没有 DOM 位置** ⇒ 画不出框，面板会用一行字说明（`不假装标了`）。
* 开关在「局内 → 选中元素时在画面上标黄框」，默认开。

### 10.3 ④ 随机偏移（`client/config.js` 的 `rnd` 块）

「配置新增随机偏移行，可展开设置**对于全局/独立均生效**的随机偏移的开关和范围（**除周期外**）」——逐条：

* 作用对象：**压缩强度** 与 **横向补偿**（`RND_KEYS`）；**两个周期不参与**（那是对齐音乐用的量）。
* **对「全局」与「独立」两档都生效**：它是**整份配置**的性质，不挂在某个档位上 ⇒ 在 `compile()` 里统一施加。
* **确定性**：偏移的种子 = `节点 id + 参数名`（FNV-1a 哈希）⇒ 同一个元素永远得到同一个偏移，
  重开面板 / 刷新页面 / 改别的参数都不会让幅度乱跳；只有**改范围**才会整体重算。实测 `stable: true`。
* 范围 = 幅度 `k ∈ [最小幅度, 最大幅度] %`（0~50%），实际系数是 `1 ± k`（正负号也由哈希决定）。
  例：幅度 20~30% 时，`E:top.roundbox` 得到 74%/138%、`E:top.lp` 得到 44%/100%（周期都还是 67/38）。
* 「可展开」= 原生 `<details>`，标题右侧的徽章显示档位（关 或 ±a~b%）。

---

## 11. 未做 / 已知偏差（如实列）

**0.2.0 新增的三条**
1. **引擎里没做**（都在 `dj-models` 里实现过，但本轮规格没要求）：转身换面（正/背）、混乱模式（逐目标错相 + 幅度游走）、
   逐元素相位（DOM 侧同一个选择器命中的多个元素相位完全同步）、每帧预算的参数化（固定 400）。
2. **画布侧只在"真对局 + 有 `__SP_VIEW__`"时才有效**：标题屏 / 大厅没有画面抓手 ⇒ 控制页照常能配，但看不到效果（符合预期）。
   本轮的画布侧**没有在真对局里逐值验证过**（那需要真的进对局部署干员）—— 见报告 §「没做的那部分」。
3. **「独立」档与「全局」档同时存在时**，同一个元素的档位是**互斥**的（一个元素只有一个档位），
   没有"继承父组 + 自己覆盖"的层级语义 —— 这里与你可能的直觉不同，特此写明（分组与元素各自独立存一个档位）。

**0.1.0 起就有的**
4. **不在清单里的东西**（详见 `ELEMENTS.md` 附 B）：`fx.pops`（升格提示的 BitmapText）· 3D 底盘下的装置箱体（句柄被闭包藏着）。
5. **`pixi.range` / `pixi.beam` 本 Mod 不提供开关**（元素表里 `unavailable`，控制页显示为不可选 + 原因）。
6. **预览是静态的**：`catalog.html` 里舞台内所有动画都被停掉；`settings-preview.html` 不接引擎（不真的转起来）。

---

## 12. ★★ v0.4.0：本轮七条实测问题的处置

| # | 服主反馈 | 根因 | 处置 |
| --- | --- | --- | --- |
| ① | 疑似只做了设置页注册+选区，**旋转压缩没应用上去** | ★ **`engine-dom.js` 里 keyframes 名对不上**：keyframes 按参数指纹生成的是 `sp-dja-r<i>` / `sp-dja-q<i>`，而 `animation` 简写写的是不带序号的 `sp-dja-r` ⇒ 动画指向一个**不存在的 keyframes**（样式注入了、选择器也匹配了、`animation-name` 读得出来，但数值一动不动） | 一行修：`animation:sp-dja-r<i> …`。**真对局实测**：`--sp-dja-r` 在 ±60° 之间变化、transform 矩阵同步变化（`dj-all-014`） |
| ② | 没有整个 mod 功能的**总控开关** | 从未做（当时列为"待拍板"） | 新增 `cfg.on`（缺省开）+ `compile()` 早退；面板「总开关」一栏（**固定设置页**）。真机实测：关 ⇒ 作用项 0、`<style>` 摘掉、元素 `transform` 回到 `none` |
| ③ | 「？」说明框**不超出外框**，超出部分看不见 | 气泡是 `.sp-dja__info::after`（`position:absolute`）⇒ 被**祖先的 `overflow`** 裁掉（弹窗滚动容器 + 我们的目录容器） | 新增 `client/tips.js`：画在**挂在 `<body>` 的 fixed 层**（事件委托 + 视口夹取）。预览页实测 340×63 全在视口内 |
| ④ | 浮窗应**只含元素配置 + 元素目录**，与固定页不重叠，且要有**独立的恢复默认** | 原来两处渲染同一份全量面板 | `section.js` 加 `scope`：`full` / `elements`；新增 `store.resetElements()`（只清元素相关，不动局内入口）。真机实测浮窗 `data-dja-section="elements"`、有目录/随机偏移/元素恢复默认、**没有**总开关与局内设置 |
| ⑤ | 目录**点展开后视角回到顶部** | ① 展开走了 `setState` ⇒ 重绘；② 预览页渲染器更是整棵重建 | `<details>` 改成**不受控**（不传 `open`、不 `preventDefault`、不 toggle 状态）+ 额外"保 `scrollTop`"。实测：展开 62 个 + 滚到 90 ⇒ 重画后仍 90、仍开着 |
| ⑥ | 浮窗拖动**向左上偏移半个长宽** | 窗口靠 `left:50%;top:50% + transform:translate(-50%,-50%)` 居中，而拖动写的是 `left/top` —— 不归一化就多偏半个身位 | 拖动开始时先把定位归一化（量 rect → 写死 `left/top` → `transform:none`）。真机实测：指针移 120/60 ⇒ 窗口移 **120/60**（精确相等） |
| ⑦ | 危险元素的**二次确认被浮窗盖住** | 宿主的 `confirmDialog` 画在 `.app-root` 里（`isolation:isolate`），而我们的浮窗挂在 `<body>` ⇒ 永远在它上面 | 弹确认前后调 `onModalOpen/onModalClose` ⇒ 浮窗先让开（`.is-modal`）；固定设置页在弹窗内部，本来就没这个问题 |

★ 另外顺手修了一处**易踩的静默失效**：`modeOf/valuesOf/setMode/setOwnValues/sanitize` 现在接受**裸元素 id**
（`top.roundbox`）并自动补 `E:` 前缀 —— 0.4.0 的探针就是拿元素 id 调 `setMode` 才写出"效果没生效"的假象（真因见 ①）。

★ 本轮最大的方法学收获：**此前三轮的客户端取证只在标题屏与独立预览页做过**（当时如实登记为"没做的那部分"）。
这次用页面里现成的 `__SP__.net.request(...)` **自己开一局**（`enterSession` → 建房 → 加 5 个 AI → `room.start`
→ `g.infoReady` → `g.bandSkip`），第一次在**真战斗屏**上量到了 `audit.present = 52~55/149 · errors 0` 与动画是否真在跑。
配方与坑都写进了 `out/adapt/dj-all-014-inmatch-effect.mjs` 的文件头。

---
