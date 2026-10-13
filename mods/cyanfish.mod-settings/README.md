# 模组设置（`cyanfish.mod-settings`）

**给全服所有 Mod 共用的一页设置。** 它自己**一个业务参数都没有** —— 只有一个顶栏齿轮 + 一个两栏面板
（左边一列「栏位」，右边是当前栏位的内容）。栏位由**别的 Mod 自己注册**。

- 轴：**L4 客户端界面**（`client/`）。没有 `data/` 补丁、没有 `content/` 战斗行为、**没有 `assets/`**
  （全 Mod 体积 ≈ 15 KB）。
- 依赖：宿主 `CLIENT_MOD_API = 1` 的插槽机制（`loadout.topbar` + `settings.sections`）+ `/vendor/preact.module.js`。
- **不改基座**。
- 版本：**1.2.0**。

> **v1.2.0 改了什么**：① 栏位文字的字号从写死的 rem 改成 `calc(<比例> * var(--t))`，
> 于是「设置 → 文字大小」对模组这一页也生效（**默认档逐值不变**，见下「统一页面注册规范」）；
> ② `mod.json` 的 `description` 按 §4.12.8.2 收口并登记规范位置；③ 本文件补规范一节。
> **行为代码零改动**（`client/index.js` 一行未动，`registry.js` 逐字节未动）。
> ★ 遗留风险（**未处理**）：本 Mod 与 `cyanfish.skinvoice` / `cyanfish.announce` 的联动走
> `globalThis` 上那份幂等注册表（`client/registry.js`，各联动方各一份逐字节相同的副本），
> 该机制依赖「客户端 Mod 脚本的加载时序」；0.2.1 的加载器（`server/mods/client.js`）是否仍按同序注入
> **尚未实测**（属 L4 客户端施工面）。

> ★ 用户口径（2026-10-08）：*「设置页面内容过于繁琐。我希望将设置页面独立为一个『模组设置』的 mod，
> 其他 mod 通过联动该 mod 实现修改对应参数，例如 skinvoice mod 仅单独列一个『皮肤与语音』的栏位。」*
> ⇒ 这就是本 Mod 的全部职责：**把"设置页"这个容器从各个功能 Mod 里抽出来**，功能 Mod 只负责出内容。

---

## 现状：谁在用这一页

| 注册方 | 栏位 id | 栏位名 | `order` | 内容 |
|---|---|---|---|---|
| `cyanfish.skinvoice` | `skinvoice` | 皮肤与语音 | 20 | 随机皮肤 2 项 + 其他 2 项（语音那一整组已随官方能力退场） |
| `cyanfish.announce` | `announce` | 公告 | 60 | 「回看」已发公告（含「全部标记为已读」） |

没装任何注册方时，面板照常能开，右侧显示一行「暂无模组设置项。」。
★ 两家的 `title` 都 ≤ 6 个全角字、都**不传** `micro`（英文 eyebrow 一律清掉，见 §4.12.1 第 4 条）。

---

## 界面

```
┌─ 模组设置                                        ✕ ─┐
│ ┌─────────────┬──────────────────────────────────┐ │
│ │ 皮肤与语音  │  （该栏位的内容，由注册方渲染）    │ │
│ │             │                                  │ │
│ │             │                                  │ │
│ └─────────────┴──────────────────────────────────┘ │
├────────────────────────────────────────────────────┤
│                                         [✓ 完成]   │
└────────────────────────────────────────────────────┘
```

| 元素 | class | 说明 |
|---|---|---|
| 齿轮按钮 | `.sp-ms__gear` | 顶栏插槽里，**只有图标**（无文字），`title/aria-label="模组设置"` |
| 弹窗根 | `.sp-ms__modal`（挂 `#sp-mod-cyanfish.mod-settings`） | 宿主的 `ui.Modal`，`width="9rem"`（**不是** 7.4rem：宿主 `.set-row` 的标签列固定 3.3rem，7.4rem 下三档分段控件会被裁到点不到，实测见 `client/index.js` 的注释） |
| 内嵌形态 | `.sp-ms__embed` / `.sp-ms__box--embed` | 挂在**官方设置弹窗**里时的形态（更新①）：栏位折成**顶部横排**、没有 Modal、没有固定宽度 |
| 两栏容器 | `.sp-ms__box` | flex；栏位列固定 `1.62rem` + 内容 `1 1 auto` |
| 栏位列 | `.sp-ms__nav` / `.sp-ms__tab[role=tab]` / `.is-active` | 竖排 `role="tablist"`，带 `aria-selected`；窄屏（≤767px）与内嵌形态都折成横排 |
| 内容区 | `.sp-ms__panel`（同时挂宿主的 `set-list`） | 注册方**直接复用宿主 `.set-row / .set-range / .set-toggle / .set-seg`** |
| 空态 | `.sp-ms__empty` | 「暂无模组设置项。」 |
| 栏位副标题 | `.sp-ms__tabmicro` | **只在注册方真的传了 `micro` 时才渲染** —— 用户口径是「英文 eyebrow 一律清掉」；★ 规范 §4.12.9 起 `micro` **整个字段已弃用**，新栏位一律不传 |

★ 弹窗**不传 `micro`**：宿主的 `Modal({micro})` 会渲染出一个英文 eyebrow（`<span class="micro">`），
用户明确要求删掉。所以 `Modal` 调用里根本没有这个字段，`.micro` 在面板里恒为 0 个。

★ 窄屏（`max-width: 767px`）下两栏塌成一栏：栏位列表横排到顶上、内容在下。

---

## ★★ 统一页面注册规范（规范正文 = `docs/MODS.md` §4.12.9；本外壳是**第一份参考实现**）

「注册内容」= 一个 Mod 往**别人拥有的页面**里放东西。当前有五个注册面，**排版与元素样式只有一套**：

| # | 注册面 | 谁拥有页面 | 契约 |
|---|---|---|---|
| ① | **设置页栏位** | 本 Mod（外壳）+ 官方设置弹窗 | `globalThis.__SP_MODSETTINGS__.register({ id, title, order, render })`（§4.8） |
| ② | **L4 插槽** | 宿主 `public/js/ui/extensions.js` | `api.slots.register(api.slots.names.X, render)`（§6.3） |
| ③ | **管理页卡片** | 宿主 `tools/mod-admin.html` | `mod.json` 的 `summary`（一行索引）/ `description`（一段一话题）（§4.12.8.2） |
| ④ | **玩家公告** | `cyanfish.announce` 的 `data/config.json` | 数值**必须**用 `{占位符}` 在渲染时取真值（§4.12.2 四） |
| ⑤ | **对局内通道** | 宿主 `game.banners`（多生产者） | 后来者**让位**、自带全部 CSS、必须 `pointer-events:none`（§6.3 工序 90 契约） |

**本外壳自己怎么合规**（这四条就是注册方要照做的最小集；全文见 §4.12.9）：

1. **类名空间**：本外壳只占 `.sp-ms__*`（`__` 元素 / `--` 变体），**不发明任何无前缀的全局类**；
   状态修饰固定用宿主的 `is-*`（`.is-active`）。宿主已有的类**照用**（`.set-list` / `.set-row` /
   `.set-toggle` / `.set-seg` / `.modal`）—— 注册方也**不许**另画一套一样的控件。
2. **文字跟随「文字大小」**：字号一律 `calc(<比例> * var(--t))`（`--t` 是宿主文字根，
   `public/js/ui/settings.js:41` 的原话是「every readable font-size reads; **no layout value does**」），
   需要极窄视口的下限就写 `max(calc(<比例> * var(--t)), <px>)`。**尺寸 / 间距 / 圆角仍用 rem**，不跟文字走。
   默认档 `--t: 1rem` ⇒ 与写死 rem **逐值相同**（v1.2.0 的改动就是这条，默认观感零变化）。
3. **一行一个控件**：用宿主的 `.set-row` 三列 grid（`3.3rem / 1fr / auto`），
   短标签 ≤ 14 全角字、长说明收进「？」小圈（`HintDot`）、绝不把说明平铺成行内小字。
4. **零痕迹**：没有注册方时 `<UiSlot>` 渲染 `null` / 面板显示「暂无模组设置项。」——
   DOM 与"没装这个 Mod"逐字符相同（§6.3 的硬约束）。

**静态门禁**（工序 112 新增，只读）：

```bash
node <开发期脚本>/112-page-spec-audit.mjs        # 全 Mod 登记表 + 硬/软违规清单
```

它把上面四条做成可判定的规则（R1 类名前缀 / R2 禁 `:has()` / R3 `!important` 只许压 `pointer-events` /
R4 颜色走 token / R5 字号跟随 `--t` / R6 裸 px / R7 `data-tip` 不与 `title` 并存 /
R8 `title` ≤ 6 全角字且不传 `micro` / R9 `summary` ≤ 50 字 / R10 动画要有 `prefers-reduced-motion` /
R11 `game.banners` 必须 `pointer-events:none`），实测输出见 `<开发期报告>/112-page-audit.txt`。

---

## ★★ 联动通道：`globalThis` 上的一份幂等注册表

### 为什么不是宿主插槽 / 也不是 `import`

1. **宿主没有「Mod 依赖」概念** —— `extensions.js` 只按 `GET /mods` 的顺序 `import()` 每个有
   `client` 字段的 Mod，谁都不知道别人在不在，也没有 `requires` / `dependencies` 可声明。
   从设置 Mod 里 `import` 一份公共模块 ⇒ 设置 Mod 被停用时**直接 404**，联动方跟着挂。
2. **宿主没有多余的 UI 插槽** —— `UI_SLOTS` 只有 `loadout.topbar`（实测）。
   设置页内部的"分栏"必须由 Mod 自己造。
3. 所以走 `globalThis.__SP_MODSETTINGS__`：**谁先跑谁建，后跑的拿到同一个对象**。
   加载顺序无关；停用任意一方都不影响另一方。

### 契约（`apiVersion = 1`）

```js
import { settingsRegistry } from './registry.js';   // 每个联动方**各放一份**
const reg = settingsRegistry();

const dispose = reg.register({
  id: 'skinvoice',          // 必填、非空字符串；同 id 重复注册 = **就地覆盖**（不堆叠）
  title: '皮肤与语音',       // 栏位名（必填，缺了退化用 id）
  order: 20,                // 排序权重；缺省 0；同 order 按注册先后
  micro: '',                // 副标题；**建议不传**（英文 eyebrow 观感差）
  render: () => html`…`,    // 必填的**零参组件函数**，由设置 Mod 渲染
});
```

| 成员 | 说明 |
|---|---|
| `apiVersion` | 恒 `1`。设置 Mod 启动时校验，不符只 warn，不阻断 |
| `sections` | 已注册栏位的**排序后数组**（`order` 升序） |
| `register(section)` | 注册；返回 `dispose()`。缺 `id` / `render` 抛错（让调用方在 setup 里就炸出来，不是静默） |
| `subscribe(fn)` | 栏位或 host 变化时回调 `fn(sections)`；**订阅时立刻回调一次**；返回 unsubscribe |
| `host` | 设置 Mod 挂载后置位的句柄 `{ open(sectionId?), close(), available }`；`null` = 没装设置 Mod / 面板不可用 |
| `setHost(h)` | **只由设置 Mod 调用**。传非对象 ⇒ 归一成 `null` |

★ **`render` 是零参的**：注册方在自己的闭包里带上依赖（`cfg`、`api`、回调），
设置 Mod 完全不需要知道这些依赖是什么 —— 这是"零耦合"的关键。

★ **`host` 是联动方判断"要不要自己兜底"的开关**。例：`cyanfish.skinvoice` 的顶栏齿轮组件
`FallbackGear` 订阅 `reg`，`host` 一置位就返回 `null` ⇒ 两个齿轮绝不会同时出现；
`host` 被清空（设置 Mod 被停用）⇒ 兜底齿轮自动回来。**加载顺序无关。**

★ **`host.open(sectionId)` 支持点名栏位**：`cyanfish.skinvoice` 战斗中的浮动入口就是
`host.open('skinvoice')`，直接跳到自己那一栏，而不是让玩家自己找。

### ★ 为什么 `registry.js` 要"每个联动方各放一份"

这是**唯一**能在"宿主不认 Mod 依赖"的前提下做到两边都不依赖对方做法的办法。
代价是**副本会漂移** ⇒ `<开发期脚本>/verify_skinvoice.mjs` 里有一条
**逐字节断言**：`cyanfish.mod-settings/client/registry.js` 与
`cyanfish.skinvoice/client/registry.js` 必须 `fileA === fileB`。

**加第三个联动方时，照抄这份文件、一个字都别改**，否则那条断言会红。

---

## 它怎么做到的（零改基座的两处接缝）

### 1. 面板渲染进挂在 `<body>` 的独立 Preact 根

顶栏插槽在 `.lo` 覆盖层**内部**，`Modal` 在插槽里渲染会被那个层叠上下文夹住；
宿主可用的构建里也**没有 `createPortal`**（规范 §6.4-2）。

所以照 `cyanfish.skinvoice` 已经验证过的老办法：`import('/vendor/preact.module.js')`
（同源同 URL ⇒ ESM 单例 ⇒ 与宿主**同一个** Preact 实例），把面板 `render` 进一个
`document.createElement('div')` 并挂到 `<body>` —— 它在宿主 root 之外，宿主怎么重渲染都擦不掉。

拿不到 vendor preact ⇒ `panel.available = false`，齿轮点击发一条 warn toast，
**注册表照常工作**（别的 Mod 的 `register` 不报错、`host.open` 不崩），其余功能不受影响。

### 2. 齿轮：同一个插槽里的**兄弟节点**

插槽的 registry 是 `Map<slot, [{modId, render}]>` —— **所有注册者作为兄弟节点渲染**。
所以设置 Mod 的齿轮（`.sp-ms__gear`）与 skinvoice 的 `.sp-sv__top` 是 `.lo-top__right` 里的**平级子项**：

```
.lo-top__right  (实测，1600x900)
├── button.loio-btn               导入/导出            （cyanfish.loadout-io）
├── button.sp-ms__gear            模组设置齿轮          （本 Mod）        ← 45px
├── div.sp-sv__top                皮肤下拉 (+语音下拉)   （cyanfish.skinvoice）
├── span.lo-sync.is-ok            已同步               （宿主）
├── span.lo-count                 已调整 0/114          （宿主）
└── button                        全部恢复默认          （宿主）
```

★★ **这条结构事实有一个容易踩的连带后果**：skinvoice 的顶栏余量算法会把
"右簇里除自己以外的所有子项宽度"减掉（`others`）—— 齿轮**本来就在里面**了。
所以 skinvoice 在算档位阈值时**不能再预留一次齿轮宽度**，否则就是重复扣减。
v0.6.0 已修（`MIN_BUDGET(rem, ownGear)`：只在"齿轮由我们自己画"时才加它），
实证：1600x900 余量 173px，修前被误判成 `skin`（白丢一个语音下拉），修后正确判成 `full`。

---

## 静默回退（明确的行为约定）

- 拿不到 `/vendor/preact.module.js` ⇒ 面板不可用（齿轮点了给一条 warn toast），
  `host.available = false`，**注册表照常**。
- 注册了栏位但**设置 Mod 没装** ⇒ 栏位"没人画出来"，功能完全不受影响
  （联动方按 `reg.host` 决定要不要自己兜底）。
- 栏位里 `render` 抛错 ⇒ 只影响右侧内容区这一次渲染，弹窗与齿轮不受影响
  （`register` 的入参校验在**注册时**抛，渲染时的异常由 `draw()` 的 `try/catch` 吃掉）。
- 点名 `host.open('不存在的一栏')` ⇒ 面板打开，右侧退到 `sections[0]`；一栏都没有 ⇒ 显示「暂无模组设置项。」。
- 注册的栏位后来被 `dispose()` 掉 ⇒ 若正停在该栏，自动退到第一栏。

---

## 文件清单（`client/` 3 个 + `mod.json` + 本文件）

```
mods/cyanfish.mod-settings/
├── mod.json                 清单（summary 一行 + description）
├── README.md                本文件
└── client/
    ├── index.js             入口：mountPanel（挂 <body> 的独立 Preact 根）+ 顶栏齿轮 + setHost
    ├── registry.js          ★★ 共享注册表（幂等引导；联动方各放一份**逐字节相同**的副本）
    └── style.js             .sp-ms__* 前缀的 CSS（两栏 grid + 窄屏塌成一栏）
```

★ **本 Mod 没有 `assets/`、没有 `data/`、没有 `content/`、不 import 任何宿主内部模块。**

---

## 校验

```bash
cd "Stronghold-Protocol-v0.2.4(mod)/Stronghold-Protocol"   # 0.2.4 起只有这一棵主力树

# 仓库自带契约检查（★ 注意两个子命令的参数形态不同：lint 收**目录**，validate 收 mod id）
node tools/mod.mjs lint mods/cyanfish.mod-settings     # 校验通过 (0 ops)
node tools/mod.mjs validate cyanfish.mod-settings      # 1 个 Mod 全部通过

# 注册表 + 面板单元断言（含"两份 registry.js 逐字节相同"）
node <开发期脚本>/verify_skinvoice.mjs             # 逐字节断言两份 registry.js

# 统一页面注册规范的静态门禁（全 Mod 登记表 + 硬/软违规清单）
node <开发期脚本>/112-page-spec-audit.mjs

# 真机（在**工作区根**跑；无头浏览器默认静音，测完必须 --stop）
node <开发期脚本>/start-local.mjs
node <开发期脚本>/112-page-probe.mjs <port>
node <开发期脚本>/start-local.mjs --stop
```

---

## 版权

Mod 自身代码沿用本仓库的 **GPL-3.0-or-later**。本 Mod **不含任何官方素材**。
仅供学习与同好间**免费**共享，**禁止任何形式的收费**与商业分发。
