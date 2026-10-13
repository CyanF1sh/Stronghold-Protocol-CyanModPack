# cyanfish.diy-34 — 3 阶自选位（v1.2.0）

**一句话（v1.1.0 起）**：在「干员调配 → 自选编队」页里给 **3 阶**加**一个**自选干员位；
**4 阶位已取消**；**只要玩家在 5 阶或 6 阶自选了干员，这个 3 阶自选就不生效、不进入游戏内卡池**
—— 也就是「**要么选择多名后期高阶干员，要么选择单个前期护航干员，不可兼得**」。

★ **Mod 名（v1.2.0 起）**：**「3 阶自选位」**。旧名「3·4 阶自选位」是 v1.0.0 的形状（那时 3、4 阶各一格）；
v1.1.0 取消了 4 阶位之后旧名就与实物不符了 —— 当前这份数据里**只有 3 阶一个自选位**
（`diy.slots` 只有 `chess_char_3_diy1_a`。`id` 仍是 `cyanfish.diy-34`，改名不断部署清单与玩家认知）。

纯 **L2 数据**（零代码、零美术、零行为），两端自动生效：服务器合并后经 `/data/*.json` 下发，
**没装本 Mod 的玩家也看得到**。

| | |
|---|---|
| 最终格数 | **5 格** = III 阶 **1** + V 阶 **2** + VI 阶 **2** |
| 页面分段顺序 | **III → V → VI**（4 阶段不再出现） |
| 候选池（3 阶位） | 与 5 阶位**逐项相同**：`diy.prototypes["3"]`（15 名原型）+ `diy.ownedPool`（0.2.3 起 **72** 名持有 6★） = **87 名**（0.2.2 上曾是 71 + 15 = 86；0.2.3 的 `diy.ownedPool` 多了一个 `char_4231_clemnt` 克莱门莎） |
| ops 总数 | **5**（`data/chess.json` 2 + `data/backups.json` 3；v1.0.0 是 10） |

服主原话（验收口径）：「**① 取消 4 阶干员位，仅开放一个 3 阶干员自选位（原有 4 阶干员自选位记得清理，
避免仅逻辑删除而服务器仍然向其卡池中添加其原本选择的 4 阶干员）；② 且只要玩家 5/6 阶自选了干员，
其 3 阶自选将会被标注为无效，不进入游戏内卡池。也就是玩家要么选择多名后期高阶干员，要么选择单个前期护航干员，
不可兼得。**」

---

## ★ 页面上这两件事在哪说（v1.2.0，服主口径「限制条件要在常态说明；触发后的警告要在行标题右侧」）

| | 位置 | 文字 | 什么时候在 |
|---|---|---|---|
| **常态说明** | **「III阶」栏标题右侧**的带圈感叹号（`data-testid="diy-tier-note"`，挂在 `h3.own-tier__head` 的最后一格） | 「选择 V、VI 阶干员后，本项不生效」 | **一直**在（悬浮 / 点一下展开；文案由数据的 `voidedByTiers` 生成） |
| **触发后的警告** | **该行标题右侧**、紧跟常态小圈之后（同一处位置体系，`data-testid="diy-slot-voided"`） | 「已选择 5 / 6 阶自选：本项无效，不会进入卡池」 | 只在**限制被触发时**（5/6 阶有自选）出现 |

两条纪律：① **不在选择框里再放一遍** —— 卡片中间那块（操作区、干员信息）与「选择干员」按钮里都没有这条警告，
v1.1.0 那两处（`.diy-slot__body` 段落、选人器 `diy-pick__head` 下方段落）已经删掉；② 两处**不堆同一条信息**：
小圈讲**规则**（选 V/VI 阶会怎样），警告讲**此刻的结果**（你已经选了 X，所以本项无效）。

---

## ★ 4 阶位的「真清理」：老存档里那条选择**真的不进卡池**

服主特别点出的那个陷阱是：「**只从 UI 上把 4 阶位删掉，存档里那条记录还在 ⇒ 服务器仍然把它加进卡池**」。
本 Mod 的做法与证据：

1. **删的是数据闸门本身。** `diy.slots` 里没有 `chess_char_4_diy1_a` 这个键了 ⇒
   `shared/diy.js diySlot / diyRecord` 认不出它（页面不渲染）、`shared/diy.js diySlotIds` 不再列它、
   `shared/protocol.js checkDiyPicks` 的「不在 `diySlotIds` 里的键一律计入 `dropped`」这一条会把它丢掉。
   **服务器手里的 `PlayerState.diy` / `diyStock` 里不会有它** ⇒ 商店抽不到、也不会被加进卡池。
2. **玩家那份选择仍然留在本机 localStorage 里**（`sp.pref.diy`）—— 我们**不动**玩家的浏览器存储，
   但它在**任何一条生效路径上都已经不是一个自选位**：页面不渲染、计数器不数它（见下）、
   发给服务器的 `room.diy` 会被服务器丢掉。
3. **页面的「已选 n / N」只数本份数据里真实存在的槽位**（`public/js/screens/loadout.js` 的 `knownDiyPicks`）：
   老存档 4 条 pick 在 v1.1.0 下显示 **已选 3/5**（3 阶 + 5 阶 + 6 阶），**不会是 4/5 或 6/5**。
4. **可复现的对照实验**（`<开发期报告>/41-02-legacy.mjs`）：同一份老存档
   `{3 阶: 推进之王, 4 阶: 煌, 5 阶: Sharp, 6 阶: Sharp}` 分别跑 v1.0.0 形状与 v1.1.0 形状的真实
   `loadDataMerged` → `checkDiyPicks` → `PlayerState.setDiy` → `initDiyStock` → `rollShop`：

   | | v1.0.0 形状（对照） | v1.1.0（现在） |
   |---|---|---|
   | `checkDiyPicks` | 4 条全留、`dropped=0` | 只留 5/6 阶两条、`dropped=2` |
   | `diyStock` | `{3 阶:18, 4 阶:16, 5 阶:8, 6 阶:5}` | `{5 阶:8, 6 阶:5}` |
   | 400 次刷新出过的自选位 | `3 阶, 4 阶, 5 阶, 6 阶` | 只有 `5 阶, 6 阶` |
   | 4 阶位选的那名干员（煌） | **真的进了商店** | **一次都没出现** |
   | `acquireChess(4 阶位)` | 返回棋子 | `null` |

   ⇒ 「老存档里那条 4 阶自选**不进卡池**」是实测，不是推论。

---

## ★ 新规则：5/6 阶有自选 ⇒ 3 阶自选不生效（不进池）

**语义（服主字面口径 = 任意）**：`diy.slots.chess_char_3_diy1_a` 多了一个键 **`voidedByTiers: [5, 6]`**：

> **5 阶或 6 阶的任意一个自选位被填了**，3 阶位就**不生效**（不进商店、不进卡池、不参战）。
> 反过来说：想去掉这个限制，就把 5/6 阶的自选清空 —— **页面上当场恢复**。

- **两处一致**：服务器卡池（`shared/protocol.js checkDiyPicks` → `PlayerState.diy` → `diyStock`）与
  「自选编队」页的显示（`public/js/screens/diy.js` 的 `voided` → 常态小圈 + 行标题右侧的琥珀色警告）
  读的是**同一份数据 + 同一对函数**（`shared/diy.js diyVoidedByTiers` / `diyVoidedSlots`）⇒ 不存在两端漂移。
- **实时**：去掉 5/6 阶自选 ⇒ 3 阶位库存回来（3 阶 18 份）、商店又能刷出它、页面上的「无效」标记消失；
  再加回去 ⇒ 立刻又无效。真机来回切换的证据见 `<开发期报告>/41-probe/41-03*.png` 与 `41-04-browser.json`。
- ★ **「任意」而不是「全部」**：我们按服主的字面实现 —— **只填了 5 阶两个位里的一个**，3 阶位就已经无效。
  （另一种可能的口径是「5/6 阶全部填满才无效」，那会让 3 阶位在大多数局面下仍然生效、等于没改；
  实测表格见 `41-03-rule.txt` 的 F1/F2/F3。）
- **不生效 ≠ 非法**：这条 pick 本身仍然是合法 pick（单独看照样通过校验），只是**这一局不生效**；
  所以页面**不会把它抹掉**，玩家看得见自己当初选的是谁，只是被标了「无效」。

---

## 它加了什么（v1.1.0 的 5 条 op）

| 文件 | 补丁 | 内容 |
|---|---|---|
| `data/chess.json` | **2 条 `add`** | `chess_char_3_diy1_a` / `_b` —— 3 阶自选位的两条记录（`_a` 普通形态、`_b` 精锐/三合一形态），字段全部写死在补丁里 |
| `data/backups.json` | **3 条 `add`** | ① `diy.slots.chess_char_3_diy1_a` —— 「这个 id 是一个自选位」的唯一登记处（含 `voidedByTiers: [5, 6]`）；② `diy.prototypes["3"]` / ③ `diy.locked["3"]` —— 3 阶的候选池表（= 官方 5 阶那两张表的静态副本） |

合计 **5 条 op**，`node tools/mod.mjs validate` 里显示的就是 `(5 ops)`。

### v1.1.0 删掉了什么

| 位置 | v1.0.0 | v1.1.0 |
|---|---|---|
| `data/chess.json` | `chess_char_3_diy1_a/_b` + `chess_char_4_diy1_a/_b` | 只剩 `chess_char_3_diy1_a/_b` |
| `data/backups.json` → `diy.slots` | `chess_char_3_diy1_a` + `chess_char_4_diy1_a` | 只剩 `chess_char_3_diy1_a` |
| `data/backups.json` → `diy.prototypes` / `diy.locked` | `"3"` 与 `"4"` 两张表 | 只剩 `"3"` |

### `identifier` 266–269 怎么处理的

- **3 阶位那一对没动**：`_a = 266`、`_b = 267`（与 v1.0.0 逐字节相同）。
- **4 阶位原本占的 268 / 269 随记录一起作废、不回收**：不复用给别的干员、也不把 266/267 重排。
  官方全表 `0..265` 已占满，所以本 Mod 现在用到的号是 **{266, 267}**，**268/269 是空号**。
- 为什么留空号：`identifier` 在引擎里**不是唯一键**（只是人工核对用的编号），重排只会让 v1.0.0 的存档 / 文档
  对不上号；留空号没有任何副作用。校验结果：**全表无重复号、无悬空引用**（`41-01-checks.txt`）。

---

## 逐字段：3 阶位这两条记录意味着什么

### `data/chess.json`（模板 = 官方 `chess_char_5_diy1_a`，只改必要字段）

| 字段 | 3 阶位 `_a` | 3 阶位 `_b` | 含义 |
|---|---|---|---|
| `chessId` / `baseId` | `chess_char_3_diy1_a` / 自身 | `…_b` / `…_3_diy1_a` | 普通形态 `baseId` = 自身；精锐指向普通形态（记录校验要求） |
| `goldenId` | `chess_char_3_diy1_b` | 自身（跟随上游写法） | 三合一的目标形态 |
| `isGolden` | `false` | `true` | 普通 / 精锐 |
| `tier` | **3** | **3** | 商店阶。**这一位决定页面分段、库存份数与 `shopLevel` 的默认值** |
| `identifier` | **266** | **267** | 干员编号（268/269 留空号，见上） |
| `shopSortId` | **22** | **22** | **每阶内**的排序号；惯例 = 排在该阶现有最大值之后（tier3 现 max 21）。**同一自选位的 `_a`/`_b` 共用同一个值** |
| `isDiy` | `true` | `true` | ★ **必需**：`shared/diy.js diyRecordOf` 唯一的守卫就是它；`gamedata.visibleChess` / `isLoadoutSlot` / `checkNotOwned` 又都靠它把这个 id 排除出商店与「干员持有」列表。**不能写 false** |
| `visible` / `isHidden` | `false` / `false` | 同 | 官方自选位同款（`isDiy` 已经保证不进普通牌库） |
| `chessType` | `"DIY"` | 同 | 与官方自选位同款 |
| `backup` | `{charId:null, tmplId:null, skillIndex:0, uniEquipId:null, potRank:0}` | 同 | 自选位自己没有补位干员（人是玩家选的） |
| `name` | `"甄选干员"` | 同 | 商店/详情卡在**未选人**时显示的名字（选完由干员自己的名字覆盖） |
| `appellation` / `rarity` / `profession` / `subProfession*` / `position` / `nationId` / `trait` / `skill` / `stats` / `rangeId` … | `null`（`talents`/`tokens` 为 `[]`） | 同 | ★ **必须留空**：这些全部来自被选中的干员（`composeUnitRecord` 在运行期填），与官方 8 条自选位记录逐字段同形 |
| `bonds` / `garrisonIds` | `[]` / `[]` | 同 | 自选位自己不带盟约与特质：盟约按干员实际阵营分配、「没有特质」（官方口径） |
| `price` | **3** | **3** | 买入价 = **3 资金**（服主核对官方价目：tier 3/4 = 3、tier 5/6 = 4） |
| `sellPrice` | `1` | `1` | 卖价全阶都是 1 |
| `upgradeNum` | `3` | `0` | 普通形态 3 张合一；精锐不参与三合一 |
| `upgradeChessId` | 指向 `_b` | `null` | 同官方 |
| `status` | `{phase:2, level:1, skillLevel:4, equipLevel:0}` | `{phase:2, level:60, skillLevel:7, equipLevel:1}` | ★★ **平衡旋钮**，见下 |
| `diyRequirement` | `"TIER_6"` | 同 | **候选池口径**（不是阶数）：沿用官方「持有的 6★ + 原型干员」 |

### `data/backups.json` → `diy.slots.chess_char_3_diy1_a`

| 字段 | 值 | 含义 |
|---|---|---|
| `tier` | `3` | 与 `chess.json` 的 `tier` 一致；**页面分段顺序、`diyPool` 的候选阶、`gd.tierOf` 都读它** |
| `goldenId` | `chess_char_3_diy1_b` | 精锐形态（`diySlot()` 靠它把 `_b` 认回同一格） |
| `shopLevel` | `3` | 该位在**调度中心几级**开始出现在你自己的商店里 |
| `requirement` | `"TIER_6"` | 与官方一致 ⇒ **候选池与 5 阶位一个字都不改** |
| ★ `voidedByTiers` | `[5, 6]` | **v1.1.0 新增**：5/6 阶任意一格有自选 ⇒ 本格作废（不进商店、不进卡池、页面标「无效」） |

**库存不用配**：`initDiyStock` 走 `gd.poolCopies(slotId)`，而 `economy.poolCopies` 是
`{1:12, 2:14, 3:18, 4:16, 5:8, 6:5}`（按**阶**）⇒ 3 阶位自动拿 **18** 份。**本 Mod 不含任何库存数字。**

---

## ★★ 平衡旋钮在哪

**`data/chess.json` 里 `chess_char_3_diy1_b`（精锐形态）的 `status`**：

| 旋钮 | 默认 | 效果 |
|---|---|---|
| `status.equipLevel` | `1` | 精锐形态的**模组等级**：`0` = 不带模组、`1` = 模组一阶段（默认，官方 5 阶位同款）、**`3` = 模组三阶段 = 官方 6 阶位的强度** |
| `status.level` | `60` | 精锐形态等级（技能与面板按它取值） |
| `status.skillLevel` | `7` | 精锐形态技能等级 |
| `_a` 的 `status` | `{phase:2, level:1, skillLevel:4, equipLevel:0}` | 普通形态（官方口径：精二 1 级、技能 4 级、无模组） |

**另一个旋钮是那条作废规则本身**：把 `diy.slots.chess_char_3_diy1_a.voidedByTiers` 改成 `[]`（或删掉这个键）
⇒ 3 阶位永远有效（回到「3 阶 + 5/6 阶可以同时带」）；改成 `[5]` ⇒ 只有 5 阶会顶掉它。

改完生效方式：管理页点「重载」（或 `POST /admin/api/reload`）——**已连接的客户端需要刷新页面**
（数据在浏览器侧记忆化）。改 `data/` 里的 `tier` / `price` / `shopLevel` 之类也是同一套流程。

---

## 依赖的基座接缝（不装本 Mod 时为什么基座行为不变）

本 Mod 只用数据，但「阶数」与「作废」原本在基座里没有落点。全部由数据决定（`docs/MODS.md` §4.9）：

1. **`shared/diy.js diyTiersOf(data)`** = 本份数据 `diy.slots` 里出现过的阶，升序去重。
   官方数据 ⇒ `[5, 6]`；装本 Mod ⇒ `[3, 5, 6]`。
2. **`shared/diy.js diyPool()` 的闸门** 是「该阶在 `diy.slots` 里存在」（不是 `DIY_TIERS.includes`）。
   ⇒ 3 阶位拿到 `diy.prototypes["3"]`（**本 Mod add 了这张表，15 名**）+ `diy.ownedPool` = **与 5 阶位逐项相同的 87 名**（0.2.3 起；0.2.2 上曾是 86 名）。
3. **`shared/diy.js diySlotIds()` 的顺序** 按 **(tier, id) 升序** ⇒ 页面分段 III → V → VI。
4. **`server/mods/loader.js validateChessRecord()`** 对自选位记录按 **`diy.slots`** 判定
   （自选位只需 `isDiy: true`，跳过 `profession` / `stats`）—— 没有这条，任何 L2 补丁都加不了自选位。
5. ★ **`shared/diy.js diyVoidedByTiers` / `diyVoidedSlots`（v1.1.0 新增）** =
   `diy.slots[slotId].voidedByTiers` 的读取器。`shared/diy.js validateDiyPicks` 与
   `shared/protocol.js checkDiyPicks` 都按它把作废格**当空位**；`public/js/screens/{diy,loadout}.js` 用它标「无效」。

**不装 Mod 逐值等价**：官方 `diy.slots` 只有 5 / 6 ⇒ 闸门对 5 / 6 放行、对其余阶一律 `[]`，与改动前
`DIY_TIERS.includes(tier)` 逐值相同；`diySlotIds` 的 (tier, id) 升序在官方数据上**不改变任何一项的位置**；
官方**没有任何 slot** 写 `voidedByTiers` ⇒ 两条作废函数恒为 `[]`、新加的 `continue` 一次都进不去，
客户端 `DiyPanel` 的 `voided` 缺省 `[]`。
（实测：`<开发期报告>/41-06-nomod.mjs`，`diyPool` 在 8 阶 × 5 种 kitted 共 40 组上逐值相同。）

---

## 版本更新日志

### 1.3.0（0.2.3 基座适配 · 纯文档/清单，无行为改动）

- **`gameVersion` 0.2.2 → 0.2.3**（硬门禁；本 Mod 代码与数据一字未改）。
- **候选池数字随上游数据自动 +1**：0.2.3 的 `diy.ownedPool` 由 **71 → 72**（新增 6★ 本源近卫
  `char_4231_clemnt` 克莱门莎）⇒ 3 阶位候选池 = 15 原型 + 72 持有 = **87 名**（0.2.2 上曾是 **86**）。
  ★ 本 Mod 的候选池是**从数据推导**的（`requirement: "TIER_6"`，见 `data/backups.json`），
  **不存在硬编码** ⇒ 代码零改动；只有 `mod.json` 描述串与本 README 里那两处写死的数字需要跟着改。
- 证据：`<开发期报告>/56-upgrade-023.md`（0.2.2→0.2.3 升级工序报告）；
  上游侧 `diy.ownedPool` 71→72 的逐键证据见 `<开发期报告>/53-upstream-023-recon.md` §4.1。

### 1.1.0（平衡性改造）

**服主需求**：「取消 4 阶干员位，仅开放一个 3 阶干员自选位（原有 4 阶干员自选位记得清理，避免仅逻辑删除而服务器
仍然向其卡池中添加其原本选择的 4 阶干员）；且只要玩家 5/6 阶自选了干员，其 3 阶自选将会被标注为无效，不进入
游戏内卡池。也就是玩家要么选择多名后期高阶干员，要么选择单个前期护航干员，不可兼得。」

- **4 阶位整位取消**：`diy.slots` 删键、`chess.json` 删两条记录、`diy.prototypes["4"]` / `diy.locked["4"]` 删除。
  ⇒ 自选名额从 **6 格变 5 格**（III 1 / V 2 / VI 2），页面分段从 III → IV → V → VI 变成 **III → V → VI**。
- **老存档里那条 4 阶自选不清理、但绝不进卡池**（详见上文「4 阶位的『真清理』」）。
- **新增 `voidedByTiers`**：5/6 阶任意一格有自选 ⇒ 3 阶位无效（服务端不进卡池 + 页面标「无效」并写出原因，
  取消 5/6 阶自选后当场恢复）。
- **3 阶位的候选池、价格、库存、`shopLevel`、平衡旋钮全部不变**（与 v1.0.0 逐字段相同）；
  `identifier` 266/267 不动，268/269 留空号不回收。
- 基座新增一条只读接缝（`diyVoidedByTiers` / `diyVoidedSlots` + 两个读取点），**默认等于上游**（`docs/MODS.md` §4.9）。
- 四个语言表各补一条 msgid：`已选择 {tiers} 阶自选：本项无效，不会进入卡池`
  （只在装了本 Mod 且 3 阶位被顶掉时才渲染 ⇒ 官方数据下界面逐字节不变）。
- 验收证据：`<开发期报告>/41-probe/41-01-checks.txt`（静态 + 数值）、`41-02-legacy.txt`（老存档真清理 / 前后对照）、
  `41-03-rule.txt`（4 种组合 + 任意口径边界 + 实时来回切换 7 轮）、`41-04-browser.json` + `41-probe/41-0*.png`（真机）、
  `41-05-wire.txt`（真 WebSocket 端到端）、`41-06-nomod.txt` + `41-07-vs-upstream.txt`（不装 Mod 与上游逐值等价）、
  `<开发期报告>/41-diy34-rebalance.md`（工序报告）、`41-08-perf-and-reds.md`（`node --test` 红项对照）。

### 1.0.0

- 3 / 4 阶各加一个自选位（页面 III → IV → V → VI，共 6 格）；候选池与 5 阶位逐项相同（86 名）；
  10 条 op。落地时发现并修好了基座 `validateChessRecord` 的自选位口径（`docs/MODS.md` §4.9）。

---

## ★ 上线状态（本轮最重要的一句）

本 Mod 目前 **两个实例都在跑**（**线上实例 8：启用；测试实例 11：启用**）
⇒ **这次平衡性改造是影响线上玩家的改动**（4 阶位会消失、3 阶位可能被判无效）。
**是否上线、什么时候上线，另行决定**；上线前建议先在测试实例上让玩家确认「老存档的 4 阶位不见了，
但没有任何一名干员从 4 阶位溜进卡池」。

---

## 验证

```bash
# 1) 平台侧：20 个 Mod 全过（含本 Mod：5 ops）
node tools/mod.mjs validate
node tools/mod.mjs lint mods/cyanfish.diy-34

# 2) 不装 Mod 的等价性（默认隔离；**不要**加 --test-isolation=none）
node --test test/diy.test.js test/ui/diy-ui.test.js test/backups.test.js test/golden-diy.test.js test/lobby-diy.test.js

# 3) i18n 门禁（新增了一条 msgid）
node --test test/i18n.test.js test/i18n-data.test.js test/i18n-packs.test.js test/i18n-server.test.js

# 4) 装了 Mod 的行为自检（工序 41 的六件套，原始输出写在 <开发期报告>/41-probe/）
node <开发期报告>/41-01-checks.mjs        # 静态 + 数值
node <开发期报告>/41-02-legacy.mjs        # 老存档 4 阶位不进卡池（含 v1.0.0 对照）
node <开发期报告>/41-03-rule.mjs          # 新规则 4 种组合 + 任意口径 + 实时来回切换
node <开发期报告>/41-05-wire.mjs          # 真 WebSocket 端到端
node <开发期报告>/41-06-nomod.mjs         # 不装 Mod 逐值等价的构造式证明
node <开发期报告>/41-07-vs-upstream.mjs   # 与上游 0.2.2 源码的差分（最强等价性证据）
node <开发期报告>/41-04-browser.mjs       # 真机（需先起本地实例）
```

真机：`PORT=3416 SP_MODS=<repo>/mods node server/index.js`，走「大厅 → 干员调配 → 自选编队」，
应看到 **5 个槽位**、分段 **III → V → VI**、**没有 4 阶段**；在 5/6 阶各选一名干员后，3 阶位出现
「**已选择 5 / 6 阶自选：本项无效，不会进入卡池**」；把 5/6 阶的自选清空，它**立刻**恢复有效。
截图见 `<开发期报告>/41-probe/41-01-diy-5slots-legacy-save.png`（含老存档注入）等。

---

## 回滚

1. **停用**（推荐，立即、可逆）：管理页关闭 `cyanfish.diy-34`，或
   `node tools/mod.mjs disable cyanfish.diy-34`（然后重启服务 / 管理页「重载」）。
   ⇒ `diy.slots` 回到官方 4 条、`chess.json` 回到官方 266 条，页面回到 V / VI 两段。
   **不需要动基座、不需要回滚数据。**
2. **回到 v1.0.0 的 6 格形态**：把 `<开发期报告>/cyanfish.diy-34-1.0.0.spmod` 重新装回去
   （注意它的 `mod.json` 写的是 `gameVersion 0.2.1`，在 0.2.2 树上会被整体跳过 —— 需要把这一行改成 `0.2.2`）。
3. **只回滚作废规则**：把 `diy.slots.chess_char_3_diy1_a` 的 `voidedByTiers` 删掉（3 阶位永远有效），
   其余（5 格）不变。
4. **顺便回滚基座那 5 处接缝**：`diyPool` 闸门换回 `DIY_TIERS.includes(tier)`、`diySlotIds` 换回
   `Object.keys(diy.slots)`、删掉 `diyTiersOf`、删掉 `diyVoidedByTiers` / `diyVoidedSlots` 与两个读取点里的分支、
   去掉 `server/mods/loader.js` 的 `isDiySlot` 分支。**—— 不必要**：它们在「官方数据」上逐值/逐字节等价（见上）。
5. 玩家的浏览器**必须刷新页面**：`/data/*.json` 在客户端是记忆化的，停用后不刷新仍会看到旧数据。

---

## 有意不做的事

- **不清玩家的浏览器存档**：`sp.pref.diy` 里那条 4 阶自选留着（不写迁移代码、不悄悄改玩家的本地数据）——
  它在所有生效路径上都已经不是一个自选位，服务器与页面都不会用它。
- **不复用 / 不重排 `identifier` 268–269**（留空号，理由见上）。
- **不给作废格写「自动改选」**：3 阶位被顶掉时**不动**玩家的选择，只标「无效」，玩家自己决定清谁。
- **不动 `public/js/ui/diyModel.js` 的候选池 / 校验口径**：作废只加在 `loadout.js` 与 `diy.js` 两个屏幕层 +
  `shared/diy.js` / `shared/protocol.js` 两处判定。
- **不动库存数字**（走 `gamedata.poolCopies` 的按阶查表，3 阶 18）。
- **不放宽 `shared/diy.js` 的原型规则**：原型照样**按阶锁技能**（`isPrototypePick` / `lockedSelection` 一行未改）。
- **不改 3 阶位的价格 / 阶数 / 调度中心等级**：价格 3、`shopLevel` 3、三合一 3 张（与 v1.0.0 相同）。
