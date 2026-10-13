> # ⛔ 已并入 `cyanfish.fix-enemy`（2026-10-08），目录保留仅供历史与回滚
>
> 本 Mod 的**实现代码已迁入** `mods/cyanfish.fix-enemy/`（项 id = `targeting-spatial`，在该 Mod 的
> `FIXES` 表里默认 `enabled: false`）；同时并入的还有原 `cyanfish.fix-dsubrl-noattack`，
> 以及新增的「元核孽生者神经损伤不叠加」。
> 版本抬到 **2.0.0**，`content/index.js` 与 `mod.json` 除版本号外零改动。
> 部署脚本请**不要再分发本目录**（`mods/cyanfish.fix-enemy` 是唯一在跑的敌人侧修复）。
>
> ---
>
> # ⛔ 已停用（2026-10-08 服主拍板）
>
> **上游 0.1.3 就已内建等价口径**：开局按列部署（列从左到右、列内自上而下），
> 所以「最后部署」天然就是用户要的「最右列 → 同列最下方」（0.2.1：server/sim/battle/lifecycle.js:14-25，
> 基座 sortAllyTargets 自动给出）。此外 0.2.1 新增了 lockFree 概念，本 Mod 的 candidatePool
> 没有它 ⇒ 对 lockFree + radius>0 时会把阻挡者强塞进目标池，**可能攻击隐匿干员**。
> ⇒ 两台实例都把它列进 mods/.state.json 的 disabled，**默认不装**。
>
> 取证：<开发期报告>/03-sim-l3.md。

# 修复 · 敌人索敌的空间优先序 · cyanfish.fix-targeting

> # ⚠️ 风险：0.2.1 已由上游顺带解决，且会**新增一处隐匿误伤** —— 建议不装载
>
> **① 它修的东西，0.2.1 的基座自己已经给出正确顺序。**
> 本 Mod 的根因是「0.1.2 的 `Battle.start()` 开局部署是**行主序**」，于是「最后部署者」落到
> 「最下方一排的最右侧」。0.2.1 把部署顺序**改成了列主序**：
>
> - `server/sim/battle/lifecycle.js:20`：`// … Until 0.1.3 the top row came first (row-major).`
> - `server/sim/battle/lifecycle.js:25`：排序键 `(ps.mirror ? b.homeC - a.homeC : a.homeC - b.homeC) || b.homeR - a.homeR || a.id - b.id`
>   ⇒ 全局最后部署者 = **最右列的最下方那一个**，正是本 Mod 想要的口径。
> - `server/sim/targeting.js:220-229` 的 `sortAllyTargets` / `aggroCmp`（阻挡 → 嘲讽 → `aggroSeq` = 最后部署）
>   因此**无需本 Mod** 就给出该顺序。
>
> **② 叠加会新增一处 0.2.1 才有的误伤：`blockFree`。**
> `blockFree`（「索敌不受阻挡影响」，如自制投石机）是 **0.2.x 新增**，基座在两处生效：
> `server/sim/ai.js:742`、`server/sim/targeting.js:226`。
> 而本 Mod 的 `candidatePool()`（`content/index.js:62-93`）没有这个概念 ——
> `:68 if (e.blockedBy)` 分支会**无条件**把阻挡者塞进候选池；它的安全闸只校验「引擎给的 `cur` 是否落在重算池里」
> ⇒ 圆 ⊆ Mod 池，**闸门照样通过**，于是本 Mod 用一个「包含基座判定为不可选中（隐匿 / 迷彩）的阻挡者」的池子
> 覆盖了 `c.targets` ⇒ **敌人可能攻击一个它本不该看见的隐匿干员**。
>
> **③ 即使不谈 `blockFree`，还有一处与基座分叉。**
> 本 Mod 用**战场坐标** `tileR/tileC` 排序；基座用 `aggroSeq`（= `deploySeq`）。
> `battle/deploy.js`、`battle/tiles.js`、`battle/summons.js` 在再部署时都会把 `aggroSeq` 刷新为新的 `deploySeq`
> ⇒ **再部署过的干员基座排它第一，本 Mod 按棋盘位置排**。
>
> **0.2.1 证据汇总**：`<开发期报告>/03-sim-l3.md` **§3.1（第 162-209 行）**，
> 以及第 13-14 行、第 433 行（汇总表第 6 条）。
>
> **结论 / 处置建议**
> - 只想「不改就跑」：**能装、不抛错**，但会引入 ③ 的分叉与 ② 的隐匿误伤 ⇒ **不建议**。
> - 推荐：**从 0.2.1 的默认装配里摘掉**（本 Mod 的 `KEY`/`OPTIONS` 里没有开关，只能靠不装载）。
> - 若一定要留：必须改 `content/index.js:68`（`blockFree` 判据）与 `:85-91`（排序里的阻挡者权重），
>   改完要重跑「隐匿阻挡者 + `blockFree` 敌人」用例。**本次施工未做该改动**（L3 代码适配属别人的施工面）。
>
> **适用范围提醒**：在 **0.1.2** 基座上它仍然是对症的修复；本文档只说明「0.2.1 上启用它的后果」。

---

## 原始说明（0.1.2 时代，保留供追溯）

修《网页端bug清单v1.0》第①条。敌人（未被阻挡时、且无嘲讽差异时）挑选目标的第一顺位，
当前是「最下方一排里最靠右的那个」，应为「最靠右的一列里最靠下的那个」。基座只按「最后部署的优先」排序
（`targeting.js aggroCmp`），而开局部署是行主序（`Battle.start`：从上到下、每行从左到右），
于是「最后部署」恰好落成「最下方一排的最右侧」—— 实测 2×2 方阵的优选序为 BR → BL → TR → TL。
本 Mod 把决定顺位的那一段换成显式的空间规则：右列优先、同列内下方优先（BR → TR → BL → TL），
「阻挡者」与「嘲讽等级」仍然优先于一切，另外提供 `axisOrder` 开关可切回基座的行主序口径。

纯 L3 行为 Mod，无数据补丁、无美术。

> **版本记录**
> - `1.1.0`（适配基座 0.2.1）：`gameVersion` 由 `0.1.2` 抬到 `0.2.1`（规范 §9.3 严格相等，否则整个 Mod 被跳过）；
>   **新增本文档顶部的风险说明**。代码与数据**零改动**。
> - `1.0.0`：首个版本（面向基座 0.1.2）。
