# 修复 · 干员 · `cyanfish.fix-operator`

> **轴**：L3（`content/index.js`，**两端各一份** —— 服务器装载 + 浏览器装载同一个文件）。
> ★ `2.3.0` 起**不再带任何数据补丁**：原来的 L2 `data/garrisons.json`（`fartooth-dollswap` 的接缝旗标）已随该项停用
> 而**整体删除**，基座 `server/sim/content/garrisons/battle.js` 的那段接缝也已撤除（见 §4.0）。
> **基座**：`0.2.2`（`mod.json.gameVersion` 严格相等，见规范 §9.3）。★ `2.2.0` 之前为 `0.2.1`；两版的 `FIXES` 台账
> 与本文档都同时标注了 0.2.1 / 0.2.2 两个基座下的行号。
> **合并自**：`cyanfish.fix-thorn2-stack` @1.1.0、`cyanfish.fix-egir-bond` @1.2.0（两者目录保留，仅供历史与回滚）。
> **零**：零美术、零基座分叉。

---

## 1. FIXES 表（唯一台账）

**基底版本更新时，照这张表逐条排查「官方是否已经修了」，从而决定要不要停用对应部分。**

| id | 修什么 | 依据 | 基于基座 | 上游是否已修 | 默认启用 |
|---|---|---|---|---|---|
| `thorn2-stack` | 干员「引星棘刺」一技能的防御力加成：多个炼金单元范围重叠时应**叠加** | 《网页端bug清单v1.0》第④条；`data/chess.json` 一技能文案「使落点和周围8格的友方单位防御力+60，每秒回复相当于攻击力11%的生命值」——**无**「不叠加」字样（三技能才写「（不叠加）」） | `0.1.2` | **已修**：**`0.2.2`**（**GitHub #388**，报告者 @ChengCC0101）—— 上游把固定 key `thorn2:bastion` 改成按（干员, 该干员第几个炼金单元）唯一的 `thorn2:bastion:${unit.id}:${bastionSeq++}`（`server/sim/content/kits/ops/chess_char_5_15-thorn2.js`（0.2.2）`:70-73`；`CHANGELOG.md` 0.2.2 段第 54 条；`docs/history/0.2.2.md` §27.31） | **否**（`2.2.0` 起停用） |
| `egir-bond` | 【阿戈尔】盟约四件事：①协防开局吞噬链被「上一阶段被击倒」的中间干员截断 ②「待强制退场者」仍算标记者 ③<在场5名【阿戈尔】>的「前3名」复活名额口径 ④归溟幽灵鲨替身阶段被击倒时不该占名额 | 《网页端bug清单v1.0》第②条；`data/bonds.json` `egirShip.desc`「<在场5名不同【阿戈尔】干员>前3名【阿戈尔】干员首次被击倒时立刻复活」 | `0.1.2` | **已修**：`0.1.3` 起 `server/sim/content/bonds/core.js:366-369 egirDownAtStart` + `:409-419 downAtStart/opAt`（`:408` 注释「until 0.1.2 the forced exit came first and the chain broke」），`:503-507` 复活名额改为开局按位置取前 N 名（`egirReviveScan`） | **否** |
| `fartooth-dollswap` | 远牙（`garrison_148_a/b`）授予「同一行最右边一名干员」的 `garrison_108_a/b`（`<部署时>使已激活的【卡西米尔】【精准】层数+4/+8，每场作战至多24/48层`）：傀儡师本体↔替身切换也应算该干员的一次「部署时」 | 服主口径 **2026-10-09**（「傀儡师换体应当触发远牙的叠层」，且**只对远牙这一个干员**做单独适配）；`data/chess.json` 傀儡师特性原文「受到致命伤时**不撤退**，切换成<替身>作战（替身阻挡数为0），持续20秒后自身再次替换<替身>」；远牙 garrison 的 `effectKey` = `act2autochess_gar_event_onstart`（= 基座 `battle.on('deploy')` 那条） | `0.2.1` | ★★ **已修**：**`0.2.3`**（**GitHub #415 / PR #429**）—— 上游在**同一个安装器函数** `server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart` 里，按 `gid === 'garrison_108_a' \|\| it.gid === 'garrison_108_b'`（**同一对 garrison**）新增 `battle.on('dollSwap', …) → fireGain(battle, it)`（两个方向都算、沿用原 `fireGain` 数值与每场上限），并附 7 条回归用例 `test/content/fartooth-doll-swap.test.js`；`docs/history/0.2.3.md` §28.5；取证 `<开发期报告>/53-upstream-023-recon.md` §5.1 + `53h-garrisons.diff` | **否**（`2.3.0` 起停用；**接缝与 data/ 补丁也已撤除**，见 §4.0） |

### 「默认启用 = 否」意味着什么（结构性保证）

`content/index.js` 里每个 L3 修复一个独立的 `addInstall` 钩子，钩子第一行是：

```js
if (!FIX_OF['<id>'].enabled) return;   // ★ 上游已修 ⇒ 默认一个钩子都不注册
```

⇒ 被关掉的那一项**一行生效代码都不执行**：不包 `battle.addBuff`、不包 `battle.retreat` / `loseHp` / `redeploy`、
不挂 `battleStart` / `death`。**装上本 Mod 也绝不会与官方实现打架。** 唯一的代价是
`modContentInfo().installs` 会多出一条（立刻 `return` 的空钩子，零副作用）—— 这是为了让「装了哪几项、哪几项被停用」
在诊断接口里可见。

---

## 2. `thorn2-stack`（**0.2.2 起上游已修 ⇒ 默认停用**）

### 2.0 ★ 0.2.2 上游已修同一条（GitHub #388）⇒ 本项 `2.2.0` 起 `enabled: false`

**停用依据（三条，逐条可复核）**：

1. **CHANGELOG**：`CHANGELOG.md` 0.2.2 段第 54 条 —— 「引星棘刺一技能「度算浪波」的防御力加成可以叠加了：
   两个炼金单元罩住同一名干员时防御力 +60 再 +60（精锐 +75），此前只算一个（治疗本来就会叠加）；
   同一名引星棘刺前后两次释放、两个炼金单元重叠的那几秒也一样叠加（PRTS 备注：效果均可叠加；**GitHub #388**，
   感谢 @ChengCC0101）」。
2. **设计记录**：`docs/history/0.2.2.md` §27.31「引星棘刺 S1 度算浪波: alchemy units add their DEF (GitHub #388,
   reported by @ChengCC0101)」—— **Cause** 逐字写着「every unit's DEF buff used one key (`thorn2:bastion`);
   addBuff replaces a same-key buff.」（= 我们这条修复的诊断），**Golden** 记录 `roster-033` / `roster-034` 两个基准随之变化。
3. **代码**：`server/sim/content/kits/ops/chess_char_5_15-thorn2.js`（0.2.2）`:70-73` ——
   原文件的注释与那两行（**为避免模板字面量里的反引号，下面把反引号模板改写成等价的字符串拼接写法**，语义逐字相同）：

```js
// one DEF buff per alchemy unit, so two units on one ally add up (+60 +60; PRTS 度算浪波 备注 「效果均可叠加」,
// GitHub #388 — one shared key let the last unit's buff replace the other's)
z.defKey ??= 'thorn2:bastion:' + unit.id + ':' + (unit.mem.bastionSeq = (unit.mem.bastionSeq ?? 0) + 1);
for (const a of allies) battle.addBuff(a, { key: z.defKey, duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
```

⇒ 每个**炼金单元实例**（逐个 `zone`，`z.defKey` 惰性固化）拿到**按（干员 id, 该干员第几个单元）唯一**的 buff key；
同名替换不再发生在两个单元之间 ⇒ 两个单元罩同一名干员时 +60 **再** +60（精锐 +75）。
**与我们这条修复的外部可观测结果一致**（叠加后的防御力），所以按纪律「**上游已修的项默认不生效**」，
本项自 `2.2.0` 起 `enabled: false`：`installThorn2Stack` 第一行立刻 `return`，**一个钩子都不注册、一行生效代码都不执行**
（唯一代价是 `modContentInfo().installs` 多一条空钩子，见第 1 节末）。

### 2.1 原实现（0.2.1 的现象，已由上游修掉）

`server/sim/content/kits/ops/chess_char_5_15-thorn2.js:63-65`（**0.2.1 坐标**；0.2.2 起同一段被重写成 `:68-73`）：

```js
const inZone = (a) => Math.abs(a.tileR - z.r) <= 1 && Math.abs(a.tileC - z.c) <= 1;
const allies = battle.alliesFor(unit).filter(inZone);
for (const a of allies) battle.addBuff(a, { key: 'thorn2:bastion', duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
```

`key` 是**常量**；`server/sim/battle/status.js:19,42-46` 的同名 buff 默认**互相替换** ⇒ 两个炼金单元范围重叠时
只生效一份 `+60`（应为 `+120`）。★ 回血本来就是**按 zone 逐个** `battle.heal`（`thorn2.js:66-70`）⇒ 不叠加的只有防御力，
**本项只修防御力**；三技能（`thorn2:sea`，官方写明「不叠加」）一律不动。

### 2.2 做法

1. 包一层 `battle.addBuff`：凡是 `key === 'thorn2:bastion'`（基座固定 key）**吞掉不应用**，
   只把 `mods.defFlat` 记下来当作「单个炼金单元的加成值」。
2. 自己每 `0.25 s`（与基座同节奏、同 `0.5 s` 寿命）扫一遍引星棘刺的存活 `guard` 区，
   对每个友方算出**覆盖它的 zone 个数 n**，用独立 key `thorn2:bastion:stack` 发
   **一份合并后的** `defFlat = 单份 × n`。
3. 覆盖判据与基座逐字一致：`|Δrow| ≤ 1 && |Δcol| ≤ 1`。

> ★★ **本节的第 1 步只在「基座用固定 key」时成立**（即 0.2.1 及更早）：那时基座每个单元都发同一个
> `thorn2:bastion` ⇒ 本项吞掉它、改成自己那条合并 buff，净结果 = 基座 + 60n。
> **0.2.2 起基座自己就改成逐单元唯一 key**（§2.0）⇒ 本项这条 `buff.key === 'thorn2:bastion'` 判断**再也匹配不上**，
> 于是：**基座**的 n 份（各 +60，互相不同名 ⇒ 同时存在）+ **本项**自己按 `allyUnits` 扫出来的那一条合并
> `thorn2:bastion:stack`（+60n）⇒ 该干员拿到 **+120n**。这正是 §2.4 说「0.2.2 上没有理由打开它」的原因。

**≤N 等价**：场上没有引星棘刺 / 她的炼金单元没投出 ⇒ `seen` 恒 false ⇒ 一个 buff 都不发，与改动前逐值相同。

**已知可选加固**（非阻塞，移植时**未改**以保持与 1.1.0 一致）：基座 `status.js:14` 会拒绝对已倒地单位发 buff，
而本项的覆写在 `seen/perZone` 记账前没有做同样的 `alive` 检查。因 `perZone` 取自同一个 `bb.def`，观测影响可忽略。

### 2.4 回滚启用检查清单（**必须逐条做完再改 `enabled`**）

**先说清一个容易想错的地方**：在 0.2.2 基座上把本项打开**不会**变成「双重加倍」。理由是两边的 key 不同名，
而基座的 buff 是**同名替换**语义：基座自己发 n 份 `thorn2:bastion:…`（各 +60）落到同一名干员身上时，
只有**同名**的那一份会被替换 —— n 份不同名的会**同时存在**（上限？见下）；本项发的是另一条 key
`thorn2:bastion:stack`（一条，`defFlat = 单份 × n`）。**两条 key 各自算一份 defFlat，会相加** ⇒ 观测到 `+120n` 量级，
而不是「只算一条」。

1. 因此 0.2.2 基座上**没有理由**打开它：上游已把同一条修好（§2.0），打开只会让同一件事被算两遍。
   默认 `enabled: false` 是**唯一**与「上游已修默认不生效」纪律相容的状态。
2. 若真要回滚到 0.2.2 之前的行为，正确做法是**整棵基座回到 0.2.1**，而不是在本项上开开关
   （本项的实现依赖「基座用固定 key `thorn2:bastion`」这个前提，见 §2.2 第 1 条）。
3. 若确要在 0.2.2 基座上临时启用（例如排查「上游那条修复在某场景下没生效」），验收判据必须是：
   **同一名干员的 `def` 相对裸装只 +60 × n**（n = 覆盖它的炼金单元个数；精锐 +75 × n）。
   同时用 `modContentInfo().installs` 确认 `thorn2-stack` 的钩子确实注册了（`enabled:false` 时它立刻 `return`）。
   一旦观测到「比上游单独的 n 份之外还多出一份」，立即改回 `false`。
4. **本项与上游是互斥的两条实现路径**：上游 = 逐单元唯一 key；本项 = 吞掉基座 buff、按覆盖数合并成一条。
   不要试图让它们在同一个基座上共存。

> ★ 本次施工（`2.2.0`，2026-10-10）**没有**启用 —— 按纪律「上游已修的项默认不生效」，代码逐字保留，
> 只把台账里的 `upstreamFixedIn` / `enabled` 与本节写清。

---

## 3. `egir-bond`（默认不生效 —— 启用前必须先改代码）

### 3.1 为什么默认关闭

上游 0.1.3 已把用户报的现象**按官方重写**（见 §1 表中的行号），本实现成了多余；更关键的是它源自 0.1.2，
在 0.2.1 上**直接启用会出错**。port-03 复核（`<开发期报告>/03-sim-l3.md` §3.2，211-289 行）列出两处必须改代码：

| # | 位置（本文件） | 0.2.1 的现实 | 后果 |
|---|---|---|---|
| ① | `egirTopUpDevour()` 里 `num(cur.mods.atkFlat, 0)`（两处） | 0.2.x 改成了**最终加算** `atkFinal`（`content/bonds/core.js:441 if (atk > 0) mods.atkFinal = atk;`） | `cur.mods.atkFlat` 永远不存在 ⇒ 差额 = 整条链的基础攻击力之和 ⇒ 在 `bond:egir:devour:fix` 上**再补一份** ⇒ **ATK 双计**（只在 `deferForcedExit` 关掉时才暴露） |
| ② | 复活白名单的 `egirOfficialOrder`（`(boardCol a - boardCol b) \|\| (b.tileR - a.tileR)`） | 基座 `egirReviveScan` 同列内是 `a.tileR - b.tileR`，**方向相反** | 「前 3 名」取到的人不同 |

另外 `deferForcedExit` 也已与基座分叉（基座在 devour 期间自己把「开局即强制退场者」当作在场者处理）：
逐项差异表见退役目录 `mods/cyanfish.fix-egir-bond/README.md` 的 §①（含「待退场者仍会作为标记者拿到 persist devour buff」
与「对『待退场者作为目标』也会发 devour fx 而本项只吞 `loseHp`」两条）。

### 3.2 回滚启用检查清单（**必须逐条做完再改 `enabled`**）

1. 把 `egirTopUpDevour()` 里两处 `atkFlat` 改成 `atkFinal`，并把差额语义写成「对 `atkFinal` 的差额」；
2. 决定「前 3 名」的口径：接受基座 `egirReviveScan`，还是保留本项的 `egirOfficialOrder`（两者只能选一个）；
3. 若保留 `deferForcedExit`，补上「待退场者不产生 devour fx」与「待退场者不拿 persist devour buff」两处对齐；
4. 重跑 `<开发期脚本>/probe_bug_fixes.mjs` 的 P1 / P2 与 `verify_fix_egir_bond.mjs`（判据：`g1.atk` / 吞噬额 /
   杂兵 HP 三项与「全员在场」的对照逐值相同）；
5. 才把 `FIXES` 里 `egir-bond` 的 `enabled` 改成 `true`。

> ★ 本次施工（2026-10-08）**未做上述改动** —— 按纪律「上游已修的默认不生效」，代码**逐字保留** @1.2.0 的实现，
> 并把上面这张清单写进 `mod.json.description` 与本 README，避免日后有人直接开开关。

### 3.3 有意不做（保持原样）

不补盟约层数（`S.gainLayers` 在联防 / boss / 隐藏关本来就受 `battle.flags.layerGainsEnabled` 限制）；
依赖基座仍在用 `bond:egir:devour` 这个 buff key（基座改 key ⇒ 本项静默失效，不报错、不误伤）。

---

## 4. `fartooth-dollswap`（**已停用；接缝与数据补丁已撤除** —— 上游 0.2.3 已内建同一条）

### 4.0 ★★ 停用与撤缝（`2.3.0`，2026-10-10，工序 54）

**停用依据（三条，逐条可复核）**：

1. **上游做了同一条，而且是同一个函数、同一对 garrison、同一个 hook**：`0.2.3` 的
   `server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart` 里新增
   `const farTooth = byUnit(list.filter((it) => it.gid === 'garrison_108_a' || it.gid === 'garrison_108_b'));`
   ＋ `battle.on('dollSwap', ({ unit }) => … fireGain(battle, it))`（GitHub **#415** / **PR #429**）。
   逐行 diff：`<开发期报告>/53h-garrisons.diff`；判定：`53-upstream-023-recon.md` §5.1。
2. **两边并存会翻倍**：我们的接缝（基座读特质自己的 `bb.doll_swap_deploy` + 本 Mod 用 `data/garrisons.json`
   打开它）与上游硬编码的那条**会同时对同一个 `dollSwap` 事件 `fireGain` 一次** ⇒ **换体叠层翻倍**。
3. **上线用例**：上游附了 7 条回归用例 `test/content/fartooth-doll-swap.test.js`（两个傀儡师 × 普通/精锐、
   自然返回、S2 结束返回、共享上限、重复授予者、未激活盟约、无关计时窗口）；`docs/history/0.2.3.md` §28.5。

**撤了什么（三处，同一批）**：

| # | 对象 | 处置 | 证据 |
|---|---|---|---|
| ① | `FIXES` 的 `fartooth-dollswap` | `enabled: false` + `defaultEnabled: false` + `upstreamFixedIn: '0.2.3（#415 / PR #429）…'` | `content/index.js` 顶部台账 + `FIXES` 表 |
| ② | `mods/cyanfish.fix-operator/data/garrisons.json`（194 B，两条 `merge` 打 `bb.doll_swap_deploy`） | **删除文件**（清空后 `ops` 为空 ⇒ 无可保留的内容）；`data/` 目录随之删除 ⇒ **本 Mod 现在没有 L2 轴** | `node tools/mod.mjs validate` = 20 全过；`(0 ops)` |
| ③ | 基座 `server/sim/content/garrisons/battle.js` 里我们加的那段接缝 | **移除**，该文件回到与 `<官方源码参照>/v0.2.2` 对应文件**逐字节相同**（sha256 `578f1e4ad21c24e8cb1f4727a12bdc37a1d745dc888727dbd1e616788fcb7231`）⇒ **退出我们的覆盖层** | 见 `<开发期报告>/54-stage0-dollswap.md` |

★ **本项在 `0.2.2` 基座上现在没有任何实现路径**：接缝已不在基座里，安装器不再读 `bb.doll_swap_deploy`，
`data/` 补丁也已删除 ⇒ 即使有人把 `enabled` 改成 `true`，行为也**逐值等于未加接缝的纯净上游 0.2.2**
（换体不叠层）。`installFartoothDollSwap` 与 `installThorn2Stack` 同形状地保留下来（只把自检的提示文案改成
「接缝已撤除」），但 `enabled: false` ⇒ 第一行 `return`，一个钩子都不注册。
⇒ **这里的纪律与 §2 的 `thorn2-stack` 不同**：`thorn2-stack` 是「只关不改」（打开会双计），
`fartooth-dollswap` 是「关 + 撤缝」（打开也无效果，能力已整体交还上游）。

### 4.1 现象与依据（历史记录）

远牙（`chess_char_4_20_a`，`garrison_148_a/b`，`effectKey: 'ADD_BOND'`）在战斗开始时把
`garrison_108_a`（精锐 `_b`）授予**同一行最右边**一名干员：

```
garrison_148_a  <战斗开始时>使同一行最右边一名干员获得特质"<部署时>使已激活的【卡西米尔】【精准】层数+4（每场作战至多24层）"
                bb: {}   bbStr: { give_garrison_id: "garrison_108_a" }
garrison_108_a  bb: { bond_add_count: 4, max_add_count_per_battle: 24 }
                bbStr: { key: "act2autochess_gar_event_onstart", bond_type: "bond_by_id",
                         bond_id: "kazimierzShip,preciShip", bond_add_type: "by_count" }
```

`garrison_108_a/b` 的 `effectKey` 就是 `act2autochess_gar_event_onstart` ⇒ 基座
`server/sim/content/garrisons/battle.js` 的安装器只挂 `battle.on('deploy')`（`:315-321`）。
而傀儡师的「本体 ⇄ 替身」切换在 `server/sim/professions.js` 的 `installDollkeeper`（`:205-289`）里
只 `emit('dollSwap', …)`（`:247`、`:269`）、**全程不 emit `deploy`** ⇒ 换体不叠层。

**服主口径 2026-10-09：换体应当触发远牙的这条叠层。**（上一轮审查 `22-indom-trigger-matrix.md` §2 的原文判定是
「不是 bug」，服主随后拍板要它生效 ⇒ 这是一次**有意偏离**，所以它必须做成可整体停用的 Mod。）

依据还有两条（写进 `FIXES.basis`）：`data/chess.json` 傀儡师特性原文「受到致命伤时**不撤退**，切换成<替身>作战
（替身阻挡数为0），持续20秒后自身再次替换<替身>」；以及远牙 garrison 的 `effectKey` 与
`data/garrisons.json` 的 `bbStr`（上表）。

### 4.2 做法（**已撤除**：基座的最小接缝 + 本项的一条数据补丁）

> ★★ 下面这两段是 `2.1.0`–`2.2.0` 期间的实现原样，**已在 `2.3.0`（工序 54）整体撤除**：基座那 9 行注释 + 6 行代码
> 已从 `server/sim/content/garrisons/battle.js` 移除（该文件现与 `<官方源码参照>/v0.2.2` **逐字节相同**），
> `data/garrisons.json` 已删除。保留在此**只作历史与回滚背景**，不要再按它部署。

**基座**（`server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart` 安装器）当时留下一条最小接缝：

```js
// ★ 接缝（不是「换体 = 一次通用部署」）：只有**自己数据上写了** bb.doll_swap_deploy 的特质实例，
//   才在傀儡师 <本体> ⇄ <替身> 切换时也按「部署时」结算一次（dollSwap，两个方向都算）。
const swaps = list.filter((it) => S.num(it.bb.doll_swap_deploy, 0) > 0);
if (!swaps.length) return;                       // 默认一枚旗标都没有 ⇒ 一个钩子都不挂，逐值等于上游
battle.on('dollSwap', ({ unit }) => { for (const it of swaps) if (it.unit === unit) fireGain(battle, it); });
```

**本 Mod**（`data/garrisons.json`，一条 `merge` 两条；**该文件已删除**）：

```json
{ "ops": [ { "op": "merge", "path": "garrison_108_a.bb", "value": { "doll_swap_deploy": 1 } },
           { "op": "merge", "path": "garrison_108_b.bb", "value": { "doll_swap_deploy": 1 } } ] }
```

| 项 | 基座默认（不装本 Mod） | 装本 Mod 后（**`2.2.0` 及以前**；`2.3.0` 起已撤除） |
|---|---|---|
| `garrison_108_a/b` 的换体响应 | 旗标不存在 ⇒ 安装器一个 `dollSwap` 钩子都不挂；换体不叠层 | 旗标 = 1 ⇒ 受益者（拿到达两条特质的那名干员）**每次换体**（本体→替身、替身→本体各一次）按「部署时」结算一次：卡西米尔 +4、精准 +4（精锐 +8/+8），仍受 `max_add_count_per_battle` 每场上限（24/48）约束。★ `2.3.0` 起**这一列不再存在**（本 Mod 无数据补丁、基座也不读这枚旗标） |
| 别的 `<部署时>` 消费者 | — | **一个都看不到换体**：基座 `deploy` 事件的产生点没改，`battle.on('deploy')` 的其它约 190 处照旧（这条与 0.2.3 上游的实现一致） |

### 4.3 为什么不做成「换体 = 通用部署事件」

`server/sim/professions.js` 的 `enter()` / `leave()` 里补发 `emit('deploy', …)` 只要 ~2 行，但副作用面很大
（`22-indom-trigger-matrix.md` §2 的清单）：

- 卡西米尔盟约的「每次有干员部署时攻击力+20%」计数、叙拉古（每次部署给攻速 / 隐匿）；
- `迅捷作战粮`（每次部署 +3 技力）、`独行`（部署后 +15 技力）、`歌利亚头盔`、`突袭手雷`（每次部署后 10/15 秒窗口重新上膛）、
  `卡西米尔竞技旗`（部署后 15 秒增伤）；
- **`坚固维式重锤`的「首次受到致命伤害时生命值不低于 1」窗口是按部署计**（`deploymentOf`）—— 换体算部署就会结束 / 重置
  这个不死窗口，是玩家看得见的偏差；
- 换体一个 20 秒周期发生**两次** ⇒ 任何叠层效果都会变成 2 倍速。

⇒ 本项只放行**远牙授予的那两条特质实例**（数据旗标），其余一律看不见换体。

### 4.4 `content/index.js` 里的 `installFartoothDollSwap` 做什么（**已退役的死路径**）

**不产生任何效果**，只做一次「接缝是否武装」的自检（`battle.on('battleStart', …)`，priority −100，每局最多报一次）：
`api.support.garrisonRecord('garrison_108_a'|'garrison_108_b')?.bb?.doll_swap_deploy` 都没打开时，用 `api.log.warn`
报出「接缝未武装」。历史上理由是本项的开关是**数据**（`axis: 'L2'`），而「Mod 装上了、功能没生效」必须有可见的归因。
★ **`2.3.0` 起**：`enabled: false` ⇒ 这个钩子**一行都不执行**（第一行 `return`）；即使有人改成 `true`，因为接缝已从
基座撤除、这枚旗标已无处可打，自检会报「基座接缝已撤除（上游 0.2.3 已内建同一条）」—— 那正是现在的**正确**状态。

### 4.5 现在的等价性：0.2.2 上「装 / 不装本 Mod」都逐值等于**未加接缝的纯净上游 0.2.2**

- **基座侧**：撤缝后的 `server/sim/content/garrisons/battle.js` 与 `<官方源码参照>/v0.2.2` 的对应文件
  **逐字节相同**（sha256 `578f1e4a…7231`）⇒ 该文件**不存在任何「本项」的代码路径**，也不再读 `bb.doll_swap_deploy`。
- **Mod 侧**：`data/garrisons.json` 已删除 ⇒ 没有数据补丁可打；`enabled: false` ⇒ 零钩子注册。
- **行为**：傀儡师 `本体 ⇄ 替身` 切换**不再**触发远牙授予的 `<部署时>` 叠层（0.2.2 上本来就没有这条能力；
  上游 **0.2.3** 才内建，见 §4.0）。`dollSwap` 事件本身照旧发出（基座的 `battle.hasHook('dollSwap')` 只影响
  「有没有人来听」，不屈的换体 roll 与归溟幽灵鲨 `garrison_40` 照常）。
- **对照证据**：`<开发期报告>/54-stage0-dollswap.md`（撤前 vs 撤后逐值对照：换体后卡西米尔 / 精准层数
  `29/28 → 25/24`）+ `test/content/audit-indom-deploy-triggers.test.js` 里已改写的那条用例（接缝旗标现在**无效**）。

---

## 5. 版本记录

- `2.3.0`（2026-10-10）：**停用 `fartooth-dollswap` 并撤掉它的接缝** —— 上游 **`0.2.3`** 在同一个安装器函数
  （`server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart`）里、按**同一对**
  `garrison_108_a/b`、用**同一个** `battle.on('dollSwap', …) → fireGain` 实现了**同一条**（**GitHub #415 / PR #429**，
  附 7 条回归用例；`docs/history/0.2.3.md` §28.5；取证 `53-upstream-023-recon.md` §5.1 + `53h-garrisons.diff`）。
  两边并存会让换体 `fireGain` **两次**（远牙叠层翻倍）⇒ 三处一起动：① `FIXES` 里 `enabled`/`defaultEnabled` 置 `false`、
  `upstreamFixedIn` 填 `0.2.3（#415 / PR #429）`；② `data/garrisons.json` **删除**（`data/` 目录一并不再存在 ⇒
  本 Mod 从此**没有 L2 轴**）；③ 基座那 9 行注释 + 6 行代码**移除**，该文件回到与 `<官方源码参照>/v0.2.2`
  **逐字节相同**（sha256 `578f1e4a…7231`）⇒ **退出我们的覆盖层**。★ 与 `2.2.0` 的 `thorn2-stack` 不同：那一项是
  「只关不改」（打开会双计），本项是「关 + 撤缝」（打开也无效果）。施工报告：`<开发期报告>/54-stage0-dollswap.md`。
- `2.2.0`（2026-10-10）：**停用 `thorn2-stack`** —— 上游 `0.2.2` 已修同一条（**GitHub #388**；`CHANGELOG.md` 0.2.2 段
  第 54 条 + `docs/history/0.2.2.md` §27.31 + `kits/ops/chess_char_5_15-thorn2.js`（0.2.2）`:70-73`：固定 key
  `thorn2:bastion` 改成按（干员, 第几个炼金单元）唯一的 `thorn2:bastion:<unit.id>:<seq>`）⇒ 按纪律「上游已修的项
  默认不生效」，`FIXES` 里 `thorn2-stack` 的 `enabled` 置 `false`、`upstreamFixedIn` 填 `0.2.2`，并补 §2.0（停用依据）
  与 §2.4（回滚启用检查清单）。**只关不改**：`installThorn2Stack` / `installEgirBond` / `installFartoothDollSwap`
  三段的生效代码**逐字未动**（`egir-bond` 仍 `false`、`fartooth-dollswap` 仍 `true`）。同时随 0.2.2 基座把
  `mod.json.gameVersion` 改成 `0.2.2`。
- `2.1.0`（2026-10-09）：新增 `fartooth-dollswap`（轴 L2，`data/garrisons.json` 一条补丁 + 一个接缝自检钩子），
  按服主口径让傀儡师换体触发远牙的 `<部署时>` 叠层。**只加不改**：`thorn2-stack` / `egir-bond` 逐字未动。
- `2.0.0`（2026-10-08）：由 `cyanfish.fix-thorn2-stack@1.1.0` + `cyanfish.fix-egir-bond@1.2.0` 合并。
  引入 `FIXES` 表 + 逐项 `enabled` 开关；上游已修的 `egir-bond` 默认不注册钩子；移植方式为「逐字搬运 + 把宿主句柄
  从模块级闭包改成按 `install` 传参」（行为不变）。

## 6. 取证

- ★ **本次施工**（`2.3.0`，停用 + 撤缝）：`<开发期报告>/54-stage0-dollswap.md`（sha256 相等证据、撤前/撤后行为对照、
  `validate` 与 `node --test` 数字）；上游判定：`<开发期报告>/53-upstream-023-recon.md` §5.1、
  `53h-garrisons.diff`（0.2.2 → 0.2.3 的逐行 diff）。
- 分析报告：`<开发期报告>/03-sim-l3.md` §3.2（211-289 行）、§3.4（336-366 行）。
- 早期施工报告（含实跑数字）：`<开发期报告>/10-fixsplit-enemy-operator.md`、`23-fix-mechanism.md`。
- 端到端装载证明：`<开发期报告>/10-fixsplit-load.mjs`；`fartooth-dollswap`（当年）的取证见 `23-fix-mechanism.mjs`
  §4（对照：卡西米尔盟约的部署计数在换体前后**逐值不变**）。
