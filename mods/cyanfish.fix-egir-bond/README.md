> # ⛔ 已并入 `cyanfish.fix-operator`（2026-10-08），目录保留仅供历史与回滚
>
> 本 Mod 的**实现代码已迁入** `mods/cyanfish.fix-operator/`（项 id = `egir-bond`，在该 Mod 的
> `FIXES` 表里默认 **`enabled: false`** —— 上游 0.1.3 已按官方重写，且本实现源自 0.1.2，
> 直接启用会 ATK 双计并与基座复活扫描口径相反，**代码逐字保留**，回滚启用前必须先读
> `mods/cyanfish.fix-operator/README.md` §3.2 的检查清单）；同时并入的还有原
> `cyanfish.fix-thorn2-stack`（上游未修 ⇒ 默认生效）。
> 版本抬到 **2.0.0**，`content/index.js` 与 `mod.json` 除版本号外零改动。
> 部署脚本请**不要再分发本目录**（`mods/cyanfish.fix-operator` 是唯一在跑的干员侧修复）。
>
> ---
>
> # ⛔ 已停用（2026-10-08 服主拍板）
>
> **上游已内建本 Mod 的主诉修复**（0.2.1：server/sim/content/bonds/core.js:366-369 的 egirDownAtStart
> 与 :409-419 的复活扫描；阿戈尔吞噬链与协防复活都已按官方重写）。
> 继续启用还会**算错攻击力**：本 Mod 读旧字段 cur.mods.atkFlat，而 0.2.1 改成了 mods.atkFinal
> （onds/core.js:441）⇒ 该分支恒为 0，会在新 key 上重发整条 atk 链（ATK 双计）。
> 另外本 Mod 的「列主序复活」与基座 egirReviveScan（core.js:351）方向相反。
> ⇒ 两台实例都把它列进 mods/.state.json 的 disabled，**默认不装**。
>
> 取证：<开发期报告>/03-sim-l3.md。

# 修复 · 阿戈尔盟约（协防时序 / 复活名额）· cyanfish.fix-egir-bond

> # ⚠️ 风险：0.2.1 上**必须改代码**才能启用 —— 现状（原样加载）会**凭空多发一遍全链攻击力**
>
> 本次施工（port-03）按纪律**未改动 `content/index.js`**，只保证它仍能通过校验与加载。
> 在代码改好之前，**不要在 0.2.1 上启用本 Mod**。下面逐条列出「必须改的点 + 证据行号」。
>
> ## ① (a) `deferForcedExit` 已被上游内建 —— 现在不但多余，还会制造分叉
>
> 0.2.1 的 `devour` 明确处理了「联防开局被强制退场的成员」：
> `server/sim/content/bonds/core.js:366` `egirDownAtStart(battle, u)`，
> `:408` 注释逐字写着 `until 0.1.2 the forced exit came first and the chain broke`，
> `:409` `const downAtStart = (u) => egirDownAtStart(battle, u);`。
>
> 本 Mod 的 `installForcedExitOrder`（`content/index.js:167-208`）把退场推迟到 `battleStart` 优先级 `-9e8`，
> 于是 devour 期间该干员**是活的**。逐项后果：
>
> | 基座（装了本 Mod 后） | 与「无 Mod」的差异 |
> |---|---|
> | `order` 里该成员改走 `S.onField` 分支 | 集合相同 |
> | `core.js:443` 待退场者**仍会作为标记者**拿到 persist 的 devour buff | 本 Mod `:203` 显式把它剔除 ⇒ **与基座分叉** |
> | `core.js:459` 对「待退场者作为目标」也会发 `devour` fx | 本 Mod 只吞 `loseHp`（`:185-195`）、**没吞 fx** ⇒ 客户端出现多余吞噬特效 |
> | `members.every(onField)` 变为 **true** | **掩盖**了下面 (b) 的破坏性分支（一旦关掉 (a) 就立刻暴露） |
>
> ## ② (b) `chainThroughDown` 会凭空把整条链的攻击力再加一遍 —— **最严重**
>
> 0.1.2 基座写的是 `mods.atkFlat = atk`；**0.2.x 改成了最终加算 `atkFinal`**：
> `server/sim/content/bonds/core.js:441` → `if (atk > 0) mods.atkFinal = atk; // 最终加算 (units.js _recalc)`。
>
> 本 Mod 的 `topUpDevour`（`content/index.js:307-313`）读的是**旧字段**：
> `const dAtk = atk - num(cur && cur.mods && cur.mods.atkFlat, 0);` ⇒ `cur.mods.atkFlat` 在 0.2.x 里
> **永远不存在** ⇒ `dAtk = 全链基础攻击力之和` ⇒ 在 `bond:egir:devour:fix` 这个新 key 上**又加一份同样大小的值**，
> 而基座的 `atkFinal` 还在 ⇒ **ATK 双计**（只在 (a) 关闭时才暴露，所以很容易漏测）。
>
> **必须改的点**：`content/index.js:307` 与 `:311` 的 `atkFlat` 全部改成 `atkFinal`，
> 并把 `dAtk` 的语义写成「对 `atkFinal` 的差额」。
>
> ## ③ ② 的复活名额口径与 0.2.1 基座**逐项冲突**
>
> 本 Mod 冻结白名单用的 `officialOrder`（`content/index.js:117` 与 `:214-246`）与基座
> `egirReviveScan` 的方向相反（同列内 `b.tileR - a.tileR` vs `a.tileR - b.tileR`），
> 且 0.2.x 整体重写了「前 3 名」的时序语义 ⇒ 需要一次**口径决策**（接受基座口径，还是保留 `officialOrder`）。
>
> ## ④ 附带修的那条（归溟幽灵鲨）依赖基座实现细节
>
> `:307` 一带的兜底层依赖「前 3 名的排序口径」，与 ③ 同源。
>
> ---
>
> **0.2.1 证据汇总**：`<开发期报告>/03-sim-l3.md` **§3.2（第 211-289 行）**，
> 以及第 14-15 行、第 429 行（汇总表第 2 条：`content/index.js:307`、`:311`）、
> 第 432 行（汇总表第 5 条：`:117` + `:214-246`）、第 437-440 行（风险 1/2/3）。
> ★ 报告 03 写的是 0.2.0 的路径 `content/bonds/core.js`、`server/sim/status.js`；
> 在 **0.2.1** 里实际是 `server/sim/content/bonds/core.js`、`server/sim/battle/status.js`（文件名行号一致，前缀多一层）。
>
> **适用范围提醒**：在 **0.1.2** 基座上本 Mod 是对症的修复；本文档只说明「0.2.1 上启用它的后果」。

---

## 原始说明（0.1.2 时代，保留供追溯）

修《网页端bug清单v1.0》第②条，四个子问题。①协防（最终攻势 / 联防）阶段开局时，【阿戈尔】的吞噬链遇到
「上一阶段被击倒、正处于强制退场状态」的干员就整条断掉 —— 该干员身后所有阿戈尔的攻击力加成全部归零
（实测 g1.atk 1413 → 348、吞噬事件 2 → 0）。本 Mod 按官方结算顺序「部署 → 吞噬 → 击倒（含吞噬击倒与原本击倒）
→ 按顺序复活」处理。②「待强制退场者」= 已经「原本击倒」。③<在场5名【阿戈尔】>的「前3名干员首次被击倒时
立刻复活」原本按「谁先被击倒」发名额，本 Mod 改为按官方「从左到右、从上到下」（列主序）取最前 3 名（可切回基座口径）。
④随之修掉：归溟幽灵鲨在替身阶段被击倒时本不该占复活名额。

纯 L3 行为 Mod，无数据补丁、无美术，两端同装。逐条开关见 `content/index.js` 顶部的 `OPTIONS`。

> **版本记录**
> - `1.2.0`（适配基座 0.2.1）：`gameVersion` 由 `0.1.2` 抬到 `0.2.1`（规范 §9.3 严格相等，否则整个 Mod 被跳过）；
>   **新增本文档顶部的风险说明与「必须改的点 + 行号」清单**。代码与数据**零改动**（改代码属 L3 施工面）。
> - `1.1.0`：0.1.2 时代的复活名额口径收敛。
