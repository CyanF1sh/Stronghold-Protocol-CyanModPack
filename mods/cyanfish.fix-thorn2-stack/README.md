> # ⛔ 已并入 `cyanfish.fix-operator`（2026-10-08），目录保留仅供历史与回滚
>
> （★ 本块是本次追加的迁移说明；该 Mod 在 0.2.1 上**仍然是对症的修复**，上游截至 0.2.1 未修。）
>
> 本 Mod 的**实现代码已迁入** `mods/cyanfish.fix-operator/`（项 id = `thorn2-stack`，在该 Mod 的
> `FIXES` 表里默认 **`enabled: true`** —— 与 0.2.1 服务器的启用状态一致）；同时并入的还有原
> `cyanfish.fix-egir-bond`（上游已修 ⇒ 默认不生效）。
> 版本抬到 **2.0.0**，`content/index.js` 与 `mod.json` 除版本号外零改动。
> 部署脚本请**不要再分发本目录**（`mods/cyanfish.fix-operator` 是唯一在跑的干员侧修复）。

# 修复 · 引星棘刺一技能范围可叠加 · cyanfish.fix-thorn2-stack

> # ✅ 0.2.1 上**可以原样加载与运行**（本次施工仅抬版本号，代码零改动）
>
> 与同批另外三个 `fix-*` 不同，这个 Mod 的修复目标在 0.2.1 里**仍然存在**，而且它依赖的宿主 API 逐个成立。
>
> **① bug 仍在，Mod 依然对症。** 0.2.1 的 `server/sim/content/kits/ops/chess_char_5_15-thorn2.js:65`：
> ```js
> for (const a of allies) battle.addBuff(a, { key: 'thorn2:bastion', duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
> ```
> `key` 仍是**常量** `'thorn2:bastion'`（= 本 Mod 的 `BASE_KEY`），而同文件 `:195` 的三技能仍是
> `'thorn2:sea'`（官方文案明确「不叠加」）⇒ 「修 S1、不修 S3」的判断**依旧成立**；回血仍按 zone 逐个 `battle.heal`
> （本来就叠加），本 Mod 只动防御力 ✅。
>
> **② 依赖逐个成立**（逐条证据见 `<开发期报告>/03-sim-l3.md` §3.4 第 350-359 行）：
> `battle.addBuff` 的实例覆写有效（`server/sim/battle/status.js:13`）、`battle.every(0.25)` ✅、
> `battle.alliesFor(t)` ✅、`t.mem.zones` + `z.type === 'guard'` ✅、覆盖判据 `|Δr| ≤ 1 && |Δc| ≤ 1` 与基座逐字相同 ✅。
>
> **③ 唯一值得加固的一处（非阻塞，可选）。** 0.2.1 的 `addBuff` 第一行是
> `server/sim/battle/status.js:14` → `if (!unit || (!unit.alive && !b.allowDead)) return null;`，
> 而本 Mod 的覆写（`content/index.js:60-68`）在吞掉之前**不检查 `unit.alive`**。
> 因为 `perZone` 取自同一个 `bb.def`，观测影响可忽略；若要严格对齐，可在 `:61` 后补
> `if (!unit || (!unit.alive && !buff.allowDead)) return orig(unit, buff, ...rest);`。
> ★ 本次施工**未做**这处加固（属 L3 代码适配面）。
>
> **证据行号**：`<开发期报告>/03-sim-l3.md` §3.4（第 336-366 行）；第 15 行汇总
> （「`fix-thorn2-stack` 与 `cyanfish.makoto` 可以基本原样跑」）。

---

## 原始说明（0.1.2 时代，保留供追溯）

修《网页端bug清单v1.0》第④条。引星棘刺一技能「度算浪波」写的是「使落点和周围8格的友方单位防御力+60，
每秒回复相当于攻击力11%的生命值」，官方文案**没有**「不叠加」字样（三技能「我的海疆」才明确写了「（不叠加）」）
—— 但基座的防御力加成用了**固定的 buff key**（`thorn2:bastion`），同名 buff 默认互相替换
⇒ 两个炼金单元范围重叠时只有一个生效（实测防御力只 +60，应为 +120）。本 Mod 把固定 key 上的加成改为按
「覆盖该友方的炼金单元个数」发一份**合并后**的加成，从而正确叠加；三技能（不叠加）与回血逻辑一律不动。

纯 L3 行为 Mod，无数据补丁、无美术。仅在战场上存在引星棘刺且她一技能已投出时才会介入。

> **版本记录**
> - `1.1.0`（适配基座 0.2.1）：`gameVersion` 由 `0.1.2` 抬到 `0.2.1`（规范 §9.3 严格相等，否则整个 Mod 被跳过）；
>   **新增本文档**。代码与数据**零改动**。
> - `1.0.0`：首个版本（面向基座 0.1.2）。
