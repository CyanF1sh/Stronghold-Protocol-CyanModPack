# 修复 · 机制 · `cyanfish.fix-mechanism`

> **轴**：L2（`data/backups.json`，一条补丁）+ **L3（`content/index.js`，`leader-erosion`，1.1.0 新增）**。
> 服务器与浏览器吃的是**同一份**合并后的 `/data/backups.json`（server/http/static.js 的 `buildDataOverrides`
> 下发内存里的合并结果），L3 也**两端同装**（`registerModContent` 服务端 / 浏览器是同一个函数，规范 §1.2）。
> **基座**：`0.2.4`（`mod.json.gameVersion` 严格相等，见规范 §9.3）。
> **零**：零 `client/`、零美术、零基座「分叉」——L2 侧基座只多了一条**中性读取点**
> （`server/sim/mechanics.js`，缺省值 = 上游行为）；L3 侧**基座一行都没改**（包装 `battle.emit` 实例方法）。

---

## 1. FIXES 表（唯一台账）

| id | 修什么 | 依据 | 基于基座 | 上游是否已修 | 默认启用 | 落地轴 |
|---|---|---|---|---|---|---|
| `bond-copy-layers` | 变形同构体（转职球）授予「干员已经有的那个盟约」时，该盟约的所属条目**保留两份**：① 每个「自身所属盟约 / 身前一格干员所属盟约」的叠层来源按**条目**各付一次 ② `gainLayers` 的「每场作战至多 N 层」**每份各记一份** ③ 详情卡 / 盟约弹窗 / 成员表**显示两份** | 服主口径 2026-10-09（原话「按明日方舟原版确实是显示两份」）；`docs/research/02-bonds.md:63`「**「自身所属盟约」= every bond of that operator**」（按条目读，不是按去重后的 id 集合读）；`docs/research/02-bonds.md:50` / `docs/META.md:597-600` 只声明**计数**语义（once per operator），从没说重复条目要被删掉 | `0.2.1` | **未修**：`server/sim/content/support/index.js` 的 `unitBonds` / `server/sim/content/support/meta.js` 的 `withGrants` / `server/match/bondsMeta.js` 的 `pieceBonds` / `public/js/ui/gameLogic/bonds.js` 的 `grantedBonds` **四处**都写 `!out.includes(...)`（求并），`gainLayers` 的上限键是 `${capKey}\|${bondId}`（同一盟约共用一份预算） | **是** | L2 |
| `indom-raid-sp` | 【不屈】3 名不同干员（tier 2）的「地面干员被击倒时使场上所有干员技力+5」把**突袭飞走**（`death.reason === 'raid'`）也算作一次「被击倒」 | 服主口径 2026-10-09「**突袭飞走触发全队 +5 技力是原版正常逻辑**」 | `0.2.1` | **未修**：`server/sim/content/bonds/addon/battle.js` 的 `INDOM_EXITS = { killed, retreat, merchant }` 不含 `raid`，且 +5 SP 那支只认 `c.reason === 'killed'` | **是** | L2 |
| `leader-erosion` | **领袖（`isBoss`）也吃侵蚀损伤** —— 侵蚀值正常累积、到上限 2000 正常爆发（永久 DEF -120 + 5000 元素伤害进共享血池）、以侵蚀为主的干员（克莱门莎三技能「与海为敌」等）对领袖因此**变强** | ★★ **服主裁定（工序 host-006，2026-10-12 原话）**：「**A 做，领袖能吃别的损伤凭什么侵蚀损伤不吃。**」；背景 = 官方贴士「最终攻势中，敌方领袖不会受到侵蚀损伤」与「同一批领袖对灼燃 / 神经 / 凋亡 / 坏死照常吃」**不一致**（`docs/history/0.2.4.md` §29.4：十个最终领袖 × 五种损伤逐项比对，只有侵蚀被挡） | `0.2.4` | **不适用**（这不是上游 bug，是官方口径本身；本项就是**有意偏离**它） | **是** | **L3** |

> ★ **这三项都是「有意偏离上游」（owner's deviation），不是上游 bug。**
> 上一轮机制审查（`<开发期报告>/22-indom-trigger-matrix.md`）对 `indom-raid-sp` 的原文判定是
> 「**当前实现对「突袭移动」不生效 = 官方口径，不是 bug**」；服主随后明确拍板要它生效 ⇒ 本 Mod 是**按服主口径偏离**，
> 所以它**必须**是一个可整体停用的 Mod，而不是基座里的硬编码。
> ★★ `leader-erosion` 更进一步：它偏离的是**写在官方贴士里的规则**，所以它只可能是 Mod，绝不该进基座。

### 1.1 `leader-erosion` 的实现与影响面（L3，1.1.0）

**唯一的判定点（上游原文）**：`server/sim/content/bosses.js:267-268`

```js
battle.on('elementHit', (c) => { if (c.target && c.target.isBoss && c.dmg.element === 'erosion') c.dmg.cancel = true; }, { priority: 100 });
```

**唯一的下游消费者**：`server/sim/damage.js:445-448`（`applyElement`）——`emit` 之后 `if (dmg.cancel || …) return 0;`
⇒ 被挡时**连计量都不涨**，`damage.js:458` 的 `elementBurst` 自然永不触发 ⇒ 克莱门莎三技能
（`kits/ops/op-clemnt.js:224-228` 只在 `elementBurst` 且 `element === 'erosion'` 时打标记、`:129-149` 的 `bombard` 里才
`skill.ammoLeft--`）对**只有领袖**的场面一发都不掉。

**实现**（`content/index.js`）：`api.addInstall((battle) => …)` 里包装 `battle.emit` —— 只对
`elementHit` 且 `dmg.element === 'erosion'` 且 `target.isBoss` 的载荷，把 `dmg.cancel` 换成一个 **setter 为空的访问器**
（本次事件里任何 `cancel = true` 都写不进去），事件结束后把**原描述符原样装回去**（原本不存在就把临时属性删掉）。
⇒ 基座那条钩子**照常执行**（`LEADER_EROSION_STATE.swallowed` 记账），只是它的结论这一次不被采纳；
同一次事件里其它 `elementHit` 钩子（元素损伤倍率等）看到的 `cancel` 与「从来没有人写过」逐值同义（`undefined`）。

★ **为什么不用「挂钩子 + priority」**：`battle.on` 的列表按 priority **降序**、同 priority 按注册顺序
（`server/sim/battle/hooks.js:19-24`），而基座那条免疫是 **priority 100（最大）**，Mod 的 `addInstall` 又跑在
基座 domain modules **之后**（`server/sim/content/index.js:397-405`）⇒ 本 Mod 挂什么 priority 都排在它后面，
那时 `c.dmg.cancel` 已经是 `true` ⇒ 钩子侧无法反悔。只能包装 `emit`（也就是规范 §5.8 的「第五种 Mod 形态」）。

★★ **影响面（谁会受影响，逐条）**

| # | 谁 | 影响 |
|---|---|---|
| 1 | **领袖（`tag: 'boss'` 的单位）** | 侵蚀计量从「恒 0」变成正常累积（上限仍是 2000）、会爆发（永久 DEF -120 + 5000 元素伤害进共享血池）。**`kind: 'boss'` 与 `kind: 'hidden'` 都生效** —— 判据是 `isBoss`，与上游那一行**逐字相同** |
| 2 | **以侵蚀为主的干员** | 明显变强：克莱门莎三技能「与海为敌」对领袖会打【可轰炸标记】⇒ 掉弹药 ⇒ 三次舰船轰炸（物理 + 元素各 3 次）。这是本项的**目的**，不是副作用 |
| 3 | **领袖的镜像 / 双人房副本** | 同属 `tag: 'boss'`（`bosses.js:285` 的 `mirror`）⇒ 同样吃侵蚀 |
| 4 | **其它四种损伤（灼燃 / 神经 / 凋亡 / 坏死）** | **一个值都不变**：本项只在 `dmg.element === 'erosion'` 时装陷阱 |
| 5 | **普通敌人 / 我方单位** | **一个值都不变**：判据 `target.isBoss` 为假时直接走原来那一行（`installLeaderErosion(battle, false)` 与上游逐值相同，见回归用例） |
| 6 | **悬赏领袖** | **不受影响**：`server/match/waves.js:593` 只把 `tag: 'boss'` 记为 boss ⇒ 悬赏领袖本来就能被侵蚀爆发 |
| 7 | **基座 / 其它 Mod** | 零改动、零接缝：不装本 Mod 时 `MOD_INSTALLS` 为空 ⇒ 基座一行代码都不经过本项 |
| 8 | **官方自带回归用例** | `test/content/enemies_bosses.test.js:2367`（「最终攻势: leaders take no 侵蚀 (erosion) damage; other enemies do」）在**不装 Mod 时逐值不变**（它不装载任何 Mod） |

- ★ **`hidden`（隐秘核心）的口径**：官方贴士只写「最终攻势」，`hidden` 未给口径 ⇒ 本项按**与上游同一判据**
  （`target.isBoss`）处理，不另加 `battle.kind` 判断（另加反而会制造「同一个钩子两种语义」）。
- ★ **回退**：停用本 Mod（或把 `FIXES['leader-erosion']` 改掉 / 调 `installLeaderErosion(battle, false)`）⇒ 逐值等于上游。
- **证据**：`<开发期报告>/host-006-repro-leader-erosion.mjs` + `.txt`（OFF/ON 逐值对照）；
  回归用例 `test/mods/fix-mechanism-leader-erosion.test.js`（9 条）。

---

## 2. 两条 L2 接缝是什么（基座 / Mod 的分工）

> ★ **只讲 `bondCopyLayers` / `indomRaidSp` 这两项。** 第三项 `leader-erosion` **不是接缝**（L3，
> 包装 `battle.emit`，基座一行都没改），见 §1.1 —— 它不需要、也**不该有**一条基座读取点。

`server/sim/mechanics.js`（基座）定义并读取 `data/backups.json` 的 `mechanics` 一节：

```js
// server/sim/mechanics.js
export const MECHANICS_DEFAULTS = Object.freeze({ bondCopyLayers: false, indomRaidSp: false });
export function readMechanics(data) { … }   // 非法 / 缺省一律回默认（=== true 才算开）
```

本 Mod 只写一条数据补丁（`data/backups.json`）：

```json
{ "ops": [ { "op": "add", "path": "mechanics",
  "value": { "bondCopyLayers": true, "indomRaidSp": true } } ] }
```

| 开关 | 管什么（基座里的读取点） | 基座默认（**不装 Mod**） | 装本 Mod 后 |
|---|---|---|---|
| `bondCopyLayers` | ① `server/sim/content/support/index.js` `unitBonds`（战斗内所属盟约清单）② 同文件 `gainLayers` / `layersUsed`（每份各自的上限键）③ `server/sim/content/support/meta.js` `withGrants`（准备期派发清单）④ `server/match/bondsMeta.js` `pieceBonds`（房内 / 成员统计 / `ctx.pieceBonds`）⑤ `public/js/ui/gameLogic/bonds.js` `grantedBonds` + `pieceBondIds`（详情卡 / 弹窗 / 成员表） | **false**：四处清单一律**去重**，上限键 `${capKey}\|${bondId}`（同一盟约共用一份预算）。逐值等于上游 | **true**：清单保留重复条目；上限键 `${capKey}\|${bondId}#<第几份>`，`layersUsed` 把各份求和；详情卡 / 弹窗 / 成员表显示**两份** |
| `indomRaidSp` | `server/sim/content/bonds/addon/battle.js` 的 `death` 钩子（tier 2 的 +5 技力那一支） | **false**：`raid` 既**不**参与 tier 1 的「立刻重新部署」roll，也**不**补 +5 技力（上游的 `INDOM_EXITS` 不含 raid、+5 只认 `killed`） | **true**：`raid` 的退场补一次 tier 2 的 +5 技力（作用面不变：只给该盟约**归属方**在场上、有技能的干员）；**仍然不**参与 tier 1 的 roll |

### 「不装 Mod 为什么逐值等价」

1. `readMechanics` 的缺省对象是 `{ bondCopyLayers: false, indomRaidSp: false }`；`data/backups.json` 里**没有**
   `mechanics` 这一节（官方数据里没有，基座也**不**在 `data/**` 里写默认值）⇒ 两个开关都走默认分支。
2. 默认分支的代码路径与上游**逐行同义**：
   - 清单：`(keepCopies || !out.includes(...))` 在 `keepCopies === false` 时就是原来的 `!out.includes(...)`；
   - 上限键：`perCopy ? \`${capKey}|${b}#${copy}\` : \`${capKey}|${b}\`` ⇒ false 时逐字符等于旧键，`occ` 也不建；
   - `layersUsed`：false 时直接 `m.get(\`${capKey}|${bondId}\`) ?? 0`（上游那一行）；
   - 不屈：`if (raidSp && c.reason === 'raid') gainIndomSp(st0);` 在 `raidSp === false` 时**永不执行**；
     `stOf(u)` 从「调用两次」改成「算一次」（纯函数，同值）；`+5` 那支抽成 `gainIndomSp(st)`，条件与上游逐字相同。
3. 复现脚本逐值比对（见 §4）与 `<开发期报告>/23-fix-mechanism-off.json` 对 `21-repro-before.json`：
   `OFF == upstream ? true`。

### ★ 为什么接缝不放在 `data/config.json`（施工任务的原建议）——以实际代码为准

两条实测理由（不是风格偏好）：

1. **浏览器读不到 `config.json`。** 客户端本地跑战斗（DESIGN §14，`public/js/battle/runner.js` 的 `loadBrowserSim`）
   只取 `SIM_DATA_FILES` 那 11 个文件：`chess, enemies, tokens, stages, waves, bonds, items, garrisons, bands,
   effects, backups` —— **不含 config**；`/data.js` 的浏览器替身（`server/http/static.js` 的 `DATA_SHIM_JS`）把基座 sim 的
   `getData()` 接到 `/sim/simdata.js` 的 `getSimData()`（就是那 11 个文件）上。⇒ 挂在 `config.json` 的开关在**浏览器 sim
   里永远是缺省**，服务器按「开」算、浏览器按「关」算 ⇒ **同一场战斗两个结果，服务端拒收战报**。
   sim（`server/sim/**`）是两端共享的代码，它的读取点必须在两端拿到同一个值。
2. **部署层不部署 `data/`。** `<开发期脚本>/deploy_base_021.py` 的 `SKIP_PREFIXES` 含 `data/`：线上 app 目录的
   `data/*.json` 是**官方整合包**（`本地部署目录/_release-v0.2.1/Stronghold-Protocol/data`）那一份。
   ⇒ 基座**不能**靠仓库 `data/` 里的默认值提供接缝（写了也上不了线，还会造成「本地有、线上没有」的分裂）。
   接缝必须**缺省即上游**，由 Mod 用 `{"op":"add","path":"mechanics",…}` 自己加进去
   —— 与 `cyanfish.max-seats` 往 `config.json` 里 `add coop` 完全同一个姿势。
3. `data/backups.json` 同时是 Node sim（`server/data.js`）、浏览器 sim（`SIM_DATA_FILES`）、`server/match`
   （`GameData.raw`）与客户端界面（`public/js/data.js` 的 `data.get('backups')`）四者都读到的那一份
   —— 与规范 §4.9 的 `diy.slots` 接缝同一个落点。

---

## 3. 上限口径（服主确认，2026-10-09）

| 场景 | 每份上限 | 每份每次 | 结果 |
|---|---|---|---|
| 瑕光（普通）+ 变形同构体 + 突袭手雷 | 12 | +4 | 部署 4 次：**8 / 16 / 24 / 24** |
| 瑕光（精锐 `_b`）+ 变形同构体 + 突袭手雷 | 24 | +8 | 部署 4 次：**16 / 32 / 48 / 48** |
| 锏（原生 `garrison_155_a`，只有一份） | 24 | +8 | 部署 4 次：**8 / 16 / 24 / 24**（对照组，开关前后逐值不变） |
| 史尔特尔（`bond_by_id` 点名【突袭】） | 50 | +8 | 部署 4 次：**8 / 16 / 24 / 32**（负场景：**绝不**双倍） |

即：**每份各自算**（合计 = 2 × 单份），且**只有「所属盟约」类来源**（`bond_self`、`SERVER_ADD_BOND_POSITION`、
`SERVER_ADD_BOND_CHESS_ALL`、`SERVER_ADD_BOND_IN_HAND`、`round_start_bond_check_gain_layer`）会按条目各付一次；
自己点名盟约的来源（`bond_by_id` / `bond_actived_maxstack`）**一行不改**。

**人数永远按干员去重**：`server/match/bondsMeta.js` 的 `membership()`（干员 Set）与 `rawCount()` 的 `Set.size`
一个字都没动 —— 「两个人 + 一份重复盟约」仍然算 2 人（不是 3）。

---

## 4. 取证

- 复现 + 验收脚本：`<开发期报告>/23-fix-mechanism.mjs`
- 原始输出：`<开发期报告>/23-fix-mechanism.txt`（人读）、`23-fix-mechanism.json`（机器读）
- `23-fix-mechanism-off.json` 对 `21-repro-before.json`：`OFF == upstream ? true`（**开关关着逐值等于上游**）
- ★ `leader-erosion`（1.1.0）的前后对照：`<开发期报告>/host-006-repro-leader-erosion.mjs` + `.txt`
  （S1 真领袖 `enemy_9021_acduml`：OFF 侵蚀 0 / 爆发 0 / 血池掉 0 → ON 侵蚀 2000 / 爆发 1 / 血池掉 5000；
  S4 克莱门莎三技能：OFF 弹药 10 → ON 9、轰炸命中领袖 6 次；其余四种元素与普通敌人 OFF == ON）
- ★ `leader-erosion` 的施工报告：`<开发期报告>/host-006-erosion-on-leaders.md`
- 回归测试：`test/content/morph-dual-bonds.test.js`（off/on 两侧）、`test/content/mechanics-seam.test.js`、
  `test/content/audit-indom-deploy-triggers.test.js`（off 侧）、`test/content/indom-raid-sp.test.js`（on 侧）、
  `test/ui/morph-bonds.test.js`（客户端的关 / 开）、★ `test/mods/fix-mechanism-leader-erosion.test.js`（9 条：off / on / 只动侵蚀 / 只动领袖 / 幂等）
- 施工报告：`<开发期报告>/23-fix-mechanism.md`

## 5. 回退

1. **只停这一项**：把 `mods/cyanfish.fix-mechanism/data/backups.json` 里对应字段删掉（或改成 `false`），
   或整目录移出 Mod 仓库 —— 两个开关都回上游。
2. **只停一项**（不停整个 Mod）：`data/backups.json` 的值改成 `{ "bondCopyLayers": true }`（只留双转职）之类；
   ★ `leader-erosion` **不在**这份数据里（它是 L3）—— 要单独停它就把 `content/index.js` 的
   `FIXES['leader-erosion']` 改成 `false`（或删掉 `content/` 目录），两项 L2 开关不受影响。
3. **`indomRaidSp` 的上游口径**（如果上游哪天自己修了）：判据是
   `server/sim/content/bonds/addon/battle.js` 的 `INDOM_EXITS` 是否含 `'raid'`、`+5` 那支是否认 `raid`；
   若上游把 raid 也算进 **tier 1 的 roll**，那与服主口径（只补技力、不 roll）**不同义**，届时需要重新拍板。
4. **`bondCopyLayers` 的上游口径**：判据是上面四处 `!out.includes(...)` 是否还在、`gainLayers` 的键是否变成
   `${capKey}|${bondId}#<n>`。若上游自己改成了「保留重复」，本 Mod 的 `bondCopyLayers: true` 会**变成幂等的**
   （同样的行为被表达两次，不会双倍），但仍建议删掉这一项以免语义漂移。
5. `cyanfish.fix-operator` 的 `fartooth-dollswap` 当年用的是**另一条接缝**（`garrison_108_a/b.bb.doll_swap_deploy`，
   见规范 §4.10），与本 Mod 的 `mechanics` 键**互不影响**（`data/backups.json` vs `data/garrisons.json`）。
   ★ **工序 54（2026-10-10）起那条接缝已整体撤除**：上游 0.2.3 自己在同一个安装器函数里内建了同一条
   （GitHub #415 / PR #429），故 `fartooth-dollswap` 停用、`mods/cyanfish.fix-operator/data/garrisons.json` 删除、
   基座 `server/sim/content/garrisons/battle.js` 回到与 `<官方源码参照>/v0.2.2` 逐字节相同。
   ⇒ **本 Mod 的两个 `mechanics` 开关不受影响**，仍然照上表工作。
