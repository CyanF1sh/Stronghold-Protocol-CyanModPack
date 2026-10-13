# 修复 · 敌人 · `cyanfish.fix-enemy`

> **轴**：L3（`content/index.js`，**两端各一份** —— 服务器装载 + 浏览器装载同一个文件）。
> **基座**：`0.2.1`（`mod.json.gameVersion` 严格相等，见规范 §9.3）。
> **合并自**：`cyanfish.fix-targeting` @1.1.0、`cyanfish.fix-dsubrl-noattack` @1.1.0（两者目录保留，仅供历史与回滚）。
> **新增**：元核孽生者神经损伤不叠加（《网页端bug清单v1.1》待修复③）。
> **2.1.0 新增**：假想敌：铳 的攻速下限写法 + 「首击即 ≥1 层」（PRTS 天赋「每次成功攻击前判定，至少生效1层增益」；工序 98）。
> **零**：零数据补丁、零美术、零基座改动。

---

## 1. FIXES 表（唯一台账）

**基底版本更新时，照这张表逐条排查「官方是否已经修了」，从而决定要不要停用对应部分。**

| id | 修什么 | 依据 | 基于基座 | 上游是否已修 | 默认启用 |
|---|---|---|---|---|---|
| `targeting-spatial` | 敌人（未被阻挡、且无嘲讽差异时）挑目标的空间第一顺位 | 《网页端bug清单v1.0》第①条 | `0.1.2` | **已修**：`0.1.3` 起开局改为列主序部署（`server/sim/battle/lifecycle.js:20,25`）+ `server/sim/targeting.js:224-232 sortAllyTargets` | **否** |
| `dsubrl-noattack` | 「巢涌者」（普通 / 富营养）本应没有普攻，只有每秒一次的持续光环 | 《网页端bug清单v1.0》第③条；`data/enemies.json` `acType=DOT`、`skills=[]`、desc「持续对周围造成法术伤害和神经损伤；抵抗，且移动速度不会降低」 | `0.1.2` | **已修**：`0.1.3` 起 `server/sim/content/enemies/dot.js:36-54 kitDsubrl` 内建（`:40 noAttack`、`:44 iv=1`、`:45-53` 逐秒 `hurt(...,'arts')`） | **否** |
| `nexus-neural-no-stack` | 「元核孽生者」能力1 的【孽生者的神经毒素】不应随敌人数量叠加 | 《网页端bug清单v1.1》待修复③（原文引 PRTS：「半径2.5范围内的所有我方单位受到【孽生者的神经毒素】效果影响：每秒受到元核孽生者攻击力10%的神经损伤（无视迷彩，**同名效果不叠加**，来源为元核孽生者）」） | `0.2.1` | **截至 0.2.1 仍未修**（`server/sim/content/enemies/element.js:172-179 kitNucleus`） | **是** |
| `gun-aspd-first-layer` | 「假想敌：铳」的攻速斜坡：① 「攻击速度下限 20」应只作为**对最终攻速的钳位**（不参与 buff 求和）；② **每一次成功攻击（含第一次、含换目标后的第一次）在结算前已生效 ≥1 层 +80** | PRTS 假想敌：铳（管/弦 同句）天赋原文：「基础攻击速度为0（※攻击速度的数值下限为20）」+「攻击相同目标时每次攻击使自身攻击速度+80，最多叠加5层，切换目标后失去所有层数（每次成功攻击前判定，至少生效1层增益，持续时间无限）」；PRTS 游戏数据基础 攻速公式 + 数值范围 `ATTACK_SPEED`（下限 20 / 默认 100）；服主裁定（工序 98） | `0.2.1` | **截至 0.2.3 仍未修**（`server/sim/content/bosses.js:326-330 aspdFloor` 的 `Math.max(ASPD_FLOOR, rawAspd + extra) - e.base.aspd`，配 `:588-592 kitGun().attack` 的 `P.n = 0`） | **是** |

### 「默认启用 = 否」意味着什么（结构性保证）

`content/index.js` 里每个修复一个独立的 `addInstall` 钩子，钩子第一行是：

```js
if (!FIX_OF['<id>'].enabled) return;   // ★ 上游已修 ⇒ 默认一个钩子都不注册
```

⇒ 被关掉的那一项**一行生效代码都不执行**：不挂 `beforeAttack`、不包 `battle.dealDamage`、不改 `profile.noAttack`。
**装上本 Mod 也绝不会与官方实现打架。** 唯一的代价是：`modContentInfo().installs` 会多出一条
（那是个立刻 `return` 的空钩子，零副作用）—— 这是为了让「装了哪几项、哪几项被停用」在诊断接口里可见。

### 想在 0.2.1 上回滚启用「上游已修」的那两项？

- `targeting-spatial`：**先**给 `candidatePool()` 补上 0.2.x 的 `blockFree` 判据（本文件已补：
  `const blockFree = !!profile.blockFree; const blocker = blockFree ? null : e.blockedBy;`），
  再重跑一次「隐匿阻挡者 + `blockFree` 敌人」的用例，然后才把 `enabled` 改成 `true`。
  ★ 即使这样，它也只是**重复**基座已经给出的顺序 ⇒ 没有收益，只有风险。
- `dsubrl-noattack`：**不要**启用。0.2.1 已内建同一套脉冲，同时启用 = 每 1 秒拍两次、法术伤害与神经损伤各 ×2，
  且本项那份伤害绕过基座的闪避与 `hidden` 判定（见退役目录 `mods/cyanfish.fix-dsubrl-noattack/README.md` 的逐项对照表）。

---

## 2. `nexus-neural-no-stack`（本次唯一的**新**修复）

### 2.1 原实现（0.2.1）

`server/sim/content/enemies/element.js:172-179`：

```js
function kitNucleus(ab) {
  return [{
    taken(c, b, e, a) { if (a.on) return; a.on = true; b.addBuff(e, { key: 'ab:combat', persist: true, visible: true, mods: { moveMul: T(ab, '0.move_speed') ?? 1 } }); },
    iv: T(ab, '1.interval') ?? 1,
    // 【孽生者的神经毒素】 "（无视迷彩，同名效果不叠加…）": an area selection (no unblocking 隐匿 ally)
    tick(b, e, a) { if (!a.on) return; for (const u of areaAllies(b, e, e.x, e.y, T(ab, '1.range_radius') ?? 0)) elem(b, e, u, 'neural', e.s.atk * (T(ab, '1.ep_damage_ratio') ?? 0)); },
  }];
}
```

注册点 `:201-202`：`enemy_1439_dslntf`（元核孽生者）、`enemy_1439_dslntf_2`（异光体孽生者）。

数据（`data/enemies.json`）：

| key | 名称 | `atk` | `1.interval` | `1.range_radius` | `1.ep_damage_ratio` |
|---|---|---|---|---|---|
| `enemy_1439_dslntf` | 元核孽生者 | 400 | 1 | 2.5 | **0.05** |
| `enemy_1439_dslntf_2` | 异光体孽生者 | 600 | 1 | 2.5 | **0.10** |

★ 注意：`enemy_1439_dslntf_2` 的 `1.ep_damage_ratio` 是 **0.10**（正好等于服主引的那句「攻击力10%」），
而 `enemy_1439_dslntf` 是 **0.05**。**两者都受本项管辖**，但本项不写死任何比例 —— 它照抄基座算出来的数值。

### 2.2 为什么会「随敌人数量增多而叠加」

1. `kitNucleus` 给**每一只**元核孽生者各挂一条 `iv = 1` 的能力；
   `server/sim/content/enemies.js:247-257` 给**每条能力各一个**独立累加器 `a._acc`（互不同步，只看自己的相位）。
2. `elem()` → `damage.js:396 applyElement`：元素损伤只是**纯累加** `target.elem[el] += amt`；
   引擎**没有**任何「同名来源去重」的机制（去重只存在于 buff 层：`battle/status.js:19,42-46` 的「同名替换」）。
3. ⇒ 同一目标被 N 只元核孽生者盖住 ⇒ 每秒被 `elem()` 调用 N 次 ⇒ 神经损伤 **×N（线性增长）**。

### 2.3 本项的做法

1. 包一层 `battle.dealDamage`：凡是「`source` ∈ {元核孽生者两个 key} 且 `type='element'` 且
   `element='neural'` 且 `tags` 含 `enemyAbility`」的那一次**不立即结算**，只登记进
   `pending: target → { amount, dmg, source, next }`。
2. **① 同名效果不叠加**：同一窗口内**只保留 `amount` 最大的一份**（`if (amt > cur.amount) …`）——
   不是求和，也不是「取第一只」。窗口长度 = 该来源自己的 `1.interval`（缺省 1 秒），
   用「来源自己的节拍」而不是全局常量，基座换 interval 也不会跑偏。
3. **② 每秒剂量 = 该来源的 `攻击力 × 1.ep_damage_ratio`**：直接复用被抑制的那次调用里的**同一个 `amount`**
   （不重算、不近似），`mul` / `ignoreSelect` / `tags` 原样透传，`source` 仍是该敌人 ⇒ 元素爆发的击杀归属不变。
4. 补发时机：`next = 本窗口第一次被抑制的时刻 + interval`，由 `battle.every(1/30, …)` 检查；
   与基座 `a._acc`（先 `+= dt` 再结算）落在同一帧或次一帧 ⇒ **单只场景下逐值等于官方**（见 §4 的实测）。

### 2.4 ≤N 等价 / 边界

- **场上没有元核孽生者** ⇒ `isNexusNeural()` 恒 false ⇒ 包层一次都不介入（只多一次函数调用），逐值等于官方。
- **只有 1 只** ⇒ 每窗口恰好补发一份，数值 = 基座算出的那一份 ⇒ 逐值等于官方（实测见 §5）。
- **多只** ⇒ 仍然每窗口一份，取最强 ⇒ 符合官方「同名效果不叠加」。
- 有意**不**做：不合并不同元素的损伤；不碰元素爆发（burst）逻辑；不改 `e.s.atk` 侧任何乘区；
  不动其它敌人（含巢涌者）的神经损伤；不改「无视迷彩」的可达性（`areaAllies` 判据原样保留，损伤仍带 `ignoreSelect` 语义）。
- 已知偏差：补发比原实现晚 **0～1 帧（≤1/30 s）**。总量不变，只在「同一帧内刚好触发元素爆发 / 击倒」的极端时序上可能有 1 帧差。

---

## 3. `gun-aspd-first-layer`（2.1.0 新增）

### 3.1 原实现（0.2.3；0.2.1 上同一函数在 `:325-330`）

`server/sim/content/bosses.js`（行号 = 0.2.3）：

```js
// :137
const ASPD_FLOOR = 20, CHARGE_RADIUS = 0.35;
// :326-330
function aspdFloor(b, e, extra = 0) {
  const rawAspd = e.def.raw && e.def.raw.stats ? Number(e.def.raw.stats.aspd) : NaN;
  if (!(rawAspd === 0)) return;
  b.addBuff(e, { key: 'boss:aspd', persist: true, mods: { aspd: Math.max(ASPD_FLOOR, rawAspd + extra) - e.base.aspd } });
}
// :588-592（kitGun 的 attack 钩子）
attack(c, b2) {
  const t = c.targets[0];
  if (t === P.last) P.n = Math.min(maxN, P.n + 1); else { P.last = t; P.n = 0; }
  setAspd(b2);
}
```

数据（`data/enemies.json`）：`enemy_9017_achunt(_2)` = `bat 4.5` / `stats.aspd 0` / `2.attack_speed 80` / `2.max_stack_cnt 5`；
`server/sim/simdata.js:301` 把 `aspd 0` 归一化成 `base.aspd 100`（`|| 100` 兜底）——基座那条 `−80` 就是为这个兜底配的。

### 3.2 两处为什么偏离官方

| # | 位置 | 现象（实测，探针 98） |
|---|---|---|
| ① | `aspdFloor` 把「下限 20」写进**加法修正** | 0 层那一帧 `max(20, 0) − 100 = −80` ⇒ 它**恰好落在下限上**；官方是 `clamp(基础 + Σ修正, 20, 600)`（`server/sim/units.js:146` 本来就有一处 clamp），下限**只钳最终值**、不参与求和 |
| ② | `attack` 在命中**新目标**时 `P.n = 0` | 第 1 次攻击之后 interval 仍是 **22.5 s**；**每次换目标后又掉回 22.5 s**（官方「每次成功攻击前判定，至少生效1层增益」⇒ 命中即 5.625 s） |

⇒ 官方模型（`bat 4.5`）：0 层 `clamp(0) = 20` → **22.5 s（只该出现在出场显示上）**；1 层 80 → 5.625 s；2 层 160 → 2.8125 s；
3 层 240 → 1.875 s；4 层 320 → 1.40625 s；5 层 400 → 1.125 s。

★ 「下限参与求和」在 `n ≥ 1` 时与官方**逐值相同**（`80n ≥ 80 > 20`），所以 ① 自己的可见后果只有两处：
把 0 层那一帧钉死在下限上、以及让「0 层 + 别的正向攻速 buff」多算了下限那 20 点（见 §3.4）。真正让间隔掉回 22.5 s 的是 ②。

### 3.3 本项的做法（零基座改动）

接管基座写的那条 `boss:aspd`（同名 buff 默认 `refresh:'replace'` ⇒ **谁最后写谁说了算**）：

1. `enemySpawn`（priority **−700**，晚于基座 `content/enemies.js:139` 的 100 与 `content/bosses.js:266` 的 90）：
   记下该铳的黑板（`e.mem.ab.t` 的 `2.attack_speed` / `2.max_stack_cnt`，回退 `e.def.talent`）与 `raw` / `base`，
   并把 0 层那一帧写成 `raw + 0 − base`（= −100）⇒ **下限不再参与求和**；这一帧仍是 `clamp(0) = 20` ⇒
   **出场显示 22.5 s 逐值不变**。
2. `attack`（priority **−700**，晚于基座的 50）：立刻重写同一条 buff 为 `raw + step·n − base`，
   `n = (命中同一目标 ? min(maxN, n + 1) : 1)` ⇒ **命中即 ≥1 层**（5.625 s）。
   引擎在同一次攻击里的顺序是 `beforeAttack`（`ai.js:894-899`）→ 伤害（`:911-923`）→ `attack`（`:924`）→ `e.atkCd = e.s.interval`（`:925`），
   所以在 `attack` 里改写，冷却读到的就是新值；而 `attack` 与「真正命中了一发」一一对应（被麻痹打断的攻击两个钩子都不发）。
3. 出场那 22.5 s **不决定任何一次攻击**：每只敌人的 `atkCd` 出生时是 0（`battle/spawns.js:137`），第一发由抬手（wind-up）触发。

### 3.4 等价性 / 边界

- **不装本 Mod、关掉本项、或场上没有 `enemy_9017_achunt(_2)`** ⇒ 一个钩子都不注册 / 一行都不介入 ⇒ **逐值等于上游**。
- **管 / 弦**（同 `aspd=0`、无加攻速天赋）**不在管辖内**：仍是基座的 `max(20, raw + extra) − base` ⇒ 逐值不变
  （服主口径：它们慢是正常的）。
- 本项写入的公式在 `n ≥ 1` 时与基座**逐值相同**（`80n > 20`），所以它与基座的分歧只在「0 层那一帧」与「n 该算几」这两点上。
- 别的攻速来源照旧参与求和（活性源石 +20、沼泽 −5/层…）：结果是 `clamp(raw + step·n + Σ其它, 20, 600)`，与官方公式一致
  （例：0 层 + 活性源石 +20 ⇒ `clamp(0+20) = 20`，而上游给 40 —— 这是 ① 的第二个可见后果）。
- **显示层不动**：详情卡照旧显示实时 `5.63 s` / 基础 `4.50 s` / Δ `+1.13` 这类数字；出场那一帧仍是 `22.5 s` 配红字 `+18.00`
  （服主口径：那是判断流程的正常呈现，不改显示）。

### 3.5 实测（探针 `98-probe-aspd-floor.mjs`，改前 / 改后）

| 情形 | 改前（上游） | 改后（装上本项） |
|---|---|---|
| 出场（0 层） | `aspd 20` / **22.5 s**（显示） | `aspd 20` / **22.5 s**（显示，逐值不变） |
| **第 1 次攻击之后** | `aspd 20` / **22.5 s** | `aspd 80` / **5.625 s** |
| 第 2 / 3 / 4 / 5 次之后 | 5.625 / 2.8125 / 1.875 / 1.4063 | 2.8125 / 1.875 / 1.4063 / **1.125** |
| 第 6 次及以后（5 层封顶） | 1.125 | 1.125 |
| **切换目标后的第一次攻击之后** | **22.5 s**（掉回去了） | **5.625 s** |
| 0 层 + 活性源石 +20 | `aspd 40` | `aspd 20`（= 官方 `clamp(0 + 20)`） |

★ **全库 249 只敌人**逐只对照（0 层 + 前 6 次攻击的间隔）：**只有 `enemy_9017_achunt` 与 `enemy_9017_achunt_2` 变化**，
其余 247 只（**含管 / 管_2 / 弦**）**逐值不变**。原始输出：
`<开发期报告>/98-probe-before.txt` / `98-probe-after.txt`（带 `hash` 与 `--mod` 开关，可复现）。
回归用例：`test/mods/fix-enemy-gun-aspd.test.js`（4 项：首击即 1 层 · 换目标仍是 1 层 · 不装本 Mod 逐值等于上游 · 管/弦 不变）。

---

## 4. 版本记录

- `2.1.0`（2026-10-12）：新增 `gun-aspd-first-layer`（假想敌：铳 的攻速下限写法 + 首击即 ≥1 层；PRTS 天赋口径 + 服主裁定）。
  仍**零基座改动**：接管基座写的 `boss:aspd`（同名 replace）+ 自己的层数计数，管 / 弦 与其余 247 只敌人逐值不变。
- `2.0.0`（2026-10-08）：由 `cyanfish.fix-targeting@1.1.0` + `cyanfish.fix-dsubrl-noattack@1.1.0` 合并，
  并新增 `nexus-neural-no-stack`。引入 `FIXES` 表 + 逐项 `enabled` 开关；上游已修的两项默认不注册钩子。
  `targeting-spatial` 顺带补上了 0.2.x 的 `blockFree` 判据（回滚启用时才生效）。

## 5. 取证

- 分析报告：`<开发期报告>/03-sim-l3.md` §3.1（162-209 行）、§3.3（290-334 行）。
- 本次施工报告（含**实跑数字**的装/不装对比）：`<开发期报告>/10-fixsplit-enemy-operator.md`。
- 端到端装载证明：`<开发期报告>/10-fixsplit-load.mjs`；
  真实 Battle 对比：`<开发期报告>/10-fixsplit-nexus.mjs`。
- `gun-aspd-first-layer`（工序 98）：施工报告 `<开发期报告>/98-aspd-floor-fix.md`；
  改前/改后逐值对照 `<开发期报告>/98-probe-before.txt` / `98-probe-after.txt`（探针 `98-probe-aspd-floor.mjs`，`--mod` 装载本 Mod）。
