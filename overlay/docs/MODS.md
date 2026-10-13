# 卫戍协议 Mod 开发规范

> **镜像**：本文件在游戏仓库内同步为 `docs/MODS.md`（随 GPL 分发，方便拿到代码的人直接读）。两份内容一致，改一份记得同步另一份。
>
> **适用平台版本**：游戏 `0.2.4` · `MOD_API_VERSION = 1`（补丁/清单） · `CLIENT_MOD_API = 1`（界面扩展）/ `apiVersion = 1`（L3 行为）
>
> ★★ **工序 112（2026-10-12）· 统一页面注册规范**（服主口径：「为所有 mod 的注册内容编写一套统一的页面注册规范，例如排版规范、元素样式规范等」）：
> ① **新增 §4.12.9** —— 把「注册内容」的**五个注册面**（设置页栏位 / L4 插槽 / 管理页卡片 / 玩家公告 / 对局内 `game.banners` 通道）收成**一套**排版与元素样式口径：**类名空间分配表**（`sp-<缩写>__*`，一个 Mod 一个前缀）、**排版骨架**（宿主 `.set-row` 三列 grid 的实测值 / 单位规则：尺寸用 rem、**文字必须跟 `--t`**）、**元素样式表**、**跨面禁令**（`:has()` / `!important` / 硬编码颜色 / `data-tip` 与原生 `title` 并存 / 动画降级）、**验收清单与取证**；
> ② **可判定的部分做成了静态门禁**：`node <开发期脚本>/112-page-spec-audit.mjs`（R1..R11，**零硬编码清单** —— 宿主类名从 `public/css/**` 现读、实例启停从 `deploy_base_024.py` 四张表现读）；
> ③ **参考实现 = `cyanfish.mod-settings` 1.2.0**（它同时是设置页外壳的宿主）：只占 `.sp-ms__*`、只复用宿主控件、**字号改成 `calc(<比例> * var(--t))`** ⇒ 「设置 → 文字大小」对模组面板也生效（默认档 `--t = 1rem` ⇒ **逐值不变**）；
> ④ **顺带更正 1 处不准确的旧判据**：§4.12.1 排版第 3 条原写「宿主 `.set-row__label` 是 `white-space:nowrap`」—— 实测（`game.css:613-615`）是 `flex-wrap:wrap`，结论不变、判据换成「换行会把行高撑起来」（§4.12.9.9）。
>    ★ 另两处「`summary` > 50 字还有 4 个待整改」（§2.2 注 / §4.12.8.4 现状实测）**已在工序 111 改完**，本工序**不重复改**。
> ⑤ 逐条取证与「没做的那部分」见 `<开发期报告>/112-page-registration-spec.md`；静态清单 `112-page-audit.txt`；真机 `112-page-probe.txt` + `112-page-settings.png`。
>    ★ **编号说明**：工序 110 / 111 已被**同期开展的另两条线**占用（主管线工作台 + 文档真相），本工序按序取 **112**；
>    而**部署线同期也在用 112**（它的「任务 B：过时无效的 Mod 卸载」改的正是 `deploy_base_024.py` 的 live 三张表）
>    ⇒ **本工序的产物一律带主题前缀 `112-page-*`**（`<开发期报告>/112-page-*.md|txt|png` + `<开发期脚本>/112-page-*.mjs`），
>    与部署线的 `112-step-*` / `112-deploy-*` 不重名。**建议以后编号 + 主题双前缀**（同名覆盖已经在本工序真实发生过一次：
>    `112-nodetest.txt` 被两条线同时写过）。
>    ★★ **2026-10-12 起改用「前缀制」编号**（服主裁定：「管线名可以包含非数字 ⇒ mod 管线用 mod 名 + 独立编号」）：
>    **单 Mod 会话**写 `<mod 名去 cyanfish. 前缀>-<3 位序号>-<slug>.md`（**每个 mod 从 `001` 重新计数**，例 `diy-34-001-tier-note.md`）·
>    **主管线**（服务器 / 基底 / mod 重叠）写 `host-<3 位序号>-<slug>.md`（例 `host-001-doc-naming-convention.md`）；
>    **legacy 纯数字段 `01`–`117` 一律不改名**（被大量互相引用 + 是已冻结的证据）。⇒ 并行会话**不必再抢号、也不必再临时加主题前缀**。
>    规范正文见 `<开发期工作区>/WORKBENCH.md` §2.5「报告命名与编号规范」与 `<开发期工作区>/MOD-SESSION-STANDARD.md` §2；索引 `<开发期报告>/INDEX.md` 已按三组命名线分组展示。
>    ★ 相关数字的**时点**：本工序读 `deploy_base_024.py` 时 live = 8 启用 / 7 停用 / 8 不上传；部署线 01:24 改了那张表之后
>    复跑（01:32）= **8 / 1 / 14**（6 个过时 Mod 从「live 停用」挪到「live 不上传」）。本节的**规则与清单与这个三分无关**，
>    只有 `.dc__*` / `.loio__*` 两行的「玩家见不见得到」引用了它。
> ★★ **工序 108（2026-10-12）· 文档复盘 + 页面文案规范**（本工序只改文档，**没动任何源码、Mod 内容、部署脚本**）：
> ① **全篇版本口径统一到 `0.2.4`**（`gameVersion` 硬门槛 = `"0.2.4"`；`0.2.3` / `0.2.2` / `0.2.1` 只作历史）；
> ② **新增 §4.12.8「Mod 页面文案规范」** —— `summary` **≤ 50 字 · 一句话 · 不含细节**；`description` / 管理页长说明 / `README.md` / `CHANGELOG.md` / **设置页** 各自该放什么；**「有效设置项」三条判据**；**DJ mod 两条反例**与 7 组好/坏对照；多语言「只维护中日、缺键回落中文」；
> ③ 新增两份**工作区级**文档（**放在 `<开发期工作区>/` 而不是 `docs/`**，理由见前者 §0：加进 `BASE/docs/` 会把覆盖层从 97 变成 98、破坏工序 107 刚冻结的部署指纹，而且它不该随 GPL 分发）：
> `<开发期工作区>/STRUCTURE.md`（目录结构排查 / 必须保留·可清理·证据快照 / **容易踩坑的路径** / 建议清理清单）
> + `<开发期工作区>/MOD-SESSION-STANDARD.md`（**单 Mod 会话工作规范**：开工必读 / 红线 / 必跑门禁与基线 / 改接缝流程 / 真机自测 / ★ 可复制的「会话开场简报模板」/ §7 页面文案规范自洽版）；
> ④ **修正 §12 旧快照里的权威指认**：那几段还写着「权威仍是 `deploy_base_023.py` / `deploy_base_021.py`」—— **现在唯一的权威是 `<开发期脚本>/deploy_base_024.py`** 的四张表（`--check` 会打印对照；当前 `--check` = Mod 目录 **23** / 覆盖层 **97** 个文件（含 `test/`，正式服口径 **73**）/ 无未归类）；
> ⑤ **各节里以 `0.2.3` 为参照的 sha256 与「与上游 0.2.3 逐字节相同」是当时的取证**；工序 99 重缝对齐 0.2.4 后**同一批文件与上游 `v0.2.4` 逐字节相同**（已抽验：`server/sim/content/garrisons/battle.js` = `0dbb5f86…1a7d`、`server/sim/detmath.js` = `c4df1cb81b8049b8…`，两者都与 `<官方源码参照>/v0.2.4/Stronghold-Protocol-0.2.4` 逐字节相同）；
> ⑥ 全量对账见 `<开发期报告>/108-docs-and-mod-session-standard.md`。
> ★★ **工序 88（2026-10-11）· 平台补丁语义修订（同值幂等）**：① `add` / `clone` 增加**唯一的幂等豁免** —— 目标**已存在**且与本次要写的值**逐字节相同** ⇒ 不报错（= 一次同值重写，结果与先写成功完全一样）；② 跨 Mod 冲突判定改为**按值分档** —— 同一条路径被两条 Mod 写成**逐字节相同的值**不算冲突（只在后写者的 `row.warnings` 里出一条聚合提示），只有**写不同值**才整包回滚、必须拆键。⇒ **两条可以各自单独启用的 Mod 现在能各自 `add` 同一条记录**（`cyanfish.collab-six` × `cyanfish.makoto` 的 7 条 `data/assets.json` 正是这种），谁先谁后结果一样；值不同的路径冲突照旧（§3.6 / §11.3 已改写）。逐条证据与「为什么只改 `replace`/`deepMerge` 救不了」见 `<开发期报告>/88-patch-collision-and-redeploy.md`。
> ★★ **0.2.3 → 0.2.4（2026-10-11，工序 99）**：本次升级把 **25 个 Mod** 的 `gameVersion` 一起改成 `0.2.4`（硬门槛），
> 并按「逐文件重缝」把基座接缝重新对齐到 0.2.4（上游 0.2.4 动过 **129** 个文件，其中落进我们覆盖层的 **25** 个：
> **7** 个文件 / **9** 个冲突块逐行手工解、**14** 个文本三方合并干净、**4** 个 i18n 键级并集；覆盖层其余 **72** 个原样叠）。
> ⇒ **接缝清单、插槽口径、`MOD_API_VERSION` 全部不变**（仍是 `config.coop` / `mechanics` / `diyTiersOf` /
> `config.coop.ui.*` / 设置页注册 / `config.debug` / L4 插槽与 `ui.Tooltip`）。**唯一的口径变更**在 §4.3 第 5 条
> （`poolCopyMul` 改成接在官方新增的**同盟倍率**之后的第二层）。结论与逐条合法规格见
> `<开发期报告>/99-upgrade-024.md`；上游侧变更与交叉比对见 `<开发期报告>/99-recon-024.txt` +
> `99-overlap-diffs.txt`。
> ★ **新树 = 官方 0.2.4 + 我们的 97 文件覆盖层，逐字节成立**（三重独立验证：官方 `MANIFEST.json` 6474/6474、
> 官方全量包逐文件比对 532 相同 / 53 不同（= 覆盖层在发布子集里的那一部分）、`node tools/mod.mjs validate` 25/25）。
> ★ 官方 0.2.4 修掉了我们若干「修复型」Mod 的对象（共享卡池与装备库存按官方补齐、突袭复活选敌、克莱门莎 S2、
> 浊心斯卡蒂 × 坚守、松果 / 哈洛德 / 涤火杰西卡 / 家族徽章、香槟炸弹），逐条判定与处置见上述报告
> 「官方修了我们修过的项」一节。

> ★ **0.2.2 → 0.2.3（2026-10-10）**：本次升级把 **20 个 Mod** 的 `gameVersion` 一起改成 `0.2.3`，并按「逐文件重缝」把基座接缝重新对齐到 0.2.3（上游 0.2.3 动过我们覆盖层里的 **25** 个文件：**7** 个逐行重缝、其余机械合并 / i18n 键级并集；**13** 处接缝宿主 0.2.3 一个字节没动，逐文件与之**逐字节相同**）。结论与逐条合法规格见 `<开发期报告>/56-upgrade-023.md`；上游侧变更与交叉比对见 `<开发期报告>/53-upstream-023-recon.md`。★ 两条「上游后来做了同一件事」的重复（`cyanfish.fix-operator` 的 `fartooth-dollswap`、`cyanfish.skinvoice` 的「单干员语音语种」轴）已在**工序 54 / 55** 于 0.2.2 基座上先行解除（0.2.3 原生提供）。**0.2.3 上生效的接缝仍是** `config.coop` / `mechanics` / `diyTiersOf` / `config.coop.ui.*` / 设置页注册 / `config.debug` / L4 插槽与 `ui.Tooltip`。
> ★★ **工序 105（2026-10-11）· `config.coop` 新增第八个键 `aiCap`（单房间 AI 队友数上限）**：服主口径「AI 在服务端跑、
> 对服务器压力较大 ⇒ 限制单房间的 AI 数量，**以官方带名字的 AI 数量作为上限**」。⇒ `server/lobby.js` 的 `BOT_NAMES`
> 正好 **6** 个，Mod 出厂 `"aiCap": 6`。唯一的 AI 入口 `room.addBot` **服务端强制**：超限回 `ERR.AI_LIMIT`
> （用户可见「本房间的 AI 队友已达上限」+ 开发者 `detail`）。**缺键 ⇒ `aiCap = maxSeats`** ⇒ 不装 Mod 时 = 官方 4，
> 而 4 座房最多 4 个 AI ⇒ **上限恒不可达，基座与官方逐值相同**（连 `AI_LIMIT` 都发不出来）。逐条口径见 §4.3 第 7 条，
> 证据见 `<开发期报告>/105-ai-cap.md` + `105-ai-cap-equiv.txt`。
> ★★ **工序 101（2026-10-11）· `config.coop` 新增第五张表 `itemPoolMul`**：补上工序 99 在 §4.3 第 5 条末尾登记的**已知缺口**
> （官方**装备共享库存**不随人数放大 ⇒ >4 人房装备被稀释）。服主裁定「**仅大于 4 人时按我们的扩充逻辑把均值平衡至官方
> 4 人池水平**」⇒ N≤4 逐值等于官方、N>4 总库存 ×N/4（人均 = 官方 4 人房人均）。接缝仍是同一条 `config.coop`，
> 新增一个读取器 `itemPoolMulFor(players, coop)`；**不装 Mod 逐值等价**（倍率恒 1）。逐条口径见 §4.3 第 6 条，
> 证据见 `<开发期报告>/101-equip-stock-scaling.md` + `101-equip-equiv.txt`。
> ★ **0.2.1 → 0.2.2（2026-10-10）**：本次升级把 19 个 Mod 的 `gameVersion` 一起改成 `0.2.2`，并按「逐文件重缝」把基座接缝重新对齐到 0.2.2（含 5 个高风险重叠文件）。结论与逐条合法规格见 `<开发期报告>/36-upgrade-022.md`；其中 **`cyanfish.fix-operator` 的 `thorn2-stack` 因上游 0.2.2 已修同一条（GitHub #388）而默认停用**（`enabled:false`、零钩子），**接缝本身（`config.coop` / `diyTiersOf` / `mechanics` / `bb.doll_swap_deploy` / `config.coop.ui.*` / 设置页注册）的默认行为与上游等价性在 0.2.2 上重新证明过**（见 §4.3、§4.6、§4.9、§4.10 与 §10.2）。
> ★★ **工序 54 修订（2026-10-10）**：上一条列出的接缝里，**`bb.doll_swap_deploy` 那条已被撤除**（上游 0.2.3 自己在同一个安装器函数里内建了同一条，GitHub #415 / PR #429；并存会让傀儡师换体 `fireGain` 两次 ⇒ 远牙叠层翻倍）。⇒ `cyanfish.fix-operator` 的 `fartooth-dollswap` **停用**、`data/garrisons.json` **删除**、基座 `server/sim/content/garrisons/battle.js` **撤缝并回到与官方上游逐字节相同**（0.2.2 基座上 sha256 = `578f1e4a…7231`；★ **工序 56 升到 0.2.3 后 = `0dbb5f86…1a7d`，仍是上游原文**，退出覆盖层）。**现在生效的接缝只剩 `config.coop` / `mechanics` / `diyTiersOf` / `config.coop.ui.*` / 设置页注册 / `config.debug` / L4 插槽与 `ui.Tooltip`**。逐文件证据见 `<开发期报告>/54-stage0-dollswap.md` + `56-upgrade-023.md`，§4.10 已按「已撤销 / 上游已内建」改写。
> ★ **0.2.2 追加（2026-10-10，工序 42）**：新增 **§4.12「Mod 注册内容规范」** —— 设置页控件与文案的写法、受众分层（管理页 vs 玩家页）、禁止清单、版本日志入口；并据此把「可配置值写死进文案」的过时文案改成读真值或中性话（公告正文的「默认 6 人」→ 由 `config.coop.maxSeats` 渲染的 `{seats}` / `{ceiling}`，数据缺失时退化成中性话）。证据见 `<开发期报告>/42-console-spec.md`。
> **文档性质**：规范性文档。写着「必须 / 不得」的是**门禁**（`tools/mod.mjs lint|validate|pack` 会拒绝），写着「建议 / 推荐」的是风格约定。
> **读者**：所有要往本平台写 Mod 的人（并行开发、分发他人）。
> **配套文档**：`README.md`（游戏本体）、`docs/DESIGN.md` §14/§16/§23、`docs/DATA.md`（数据字典）、`docs/ASSETS.md`（美术寻址）、`docs/META.md`（数值口径）。
> ★★ **工作区级配套（放 `<开发期工作区>/`，不随 GPL 分发，理由见 `<开发期工作区>/STRUCTURE.md` §0）**：
> `<开发期工作区>/STRUCTURE.md` —— **目录结构排查**（必须保留 / 可清理 / 证据快照 · `<开发期工作区>/**` 逐项职责 · 覆盖层 97 的来历 · ★ **容易踩坑的路径** · 建议清理清单）；
> `<开发期工作区>/MOD-SESSION-STANDARD.md` —— **单 Mod 会话工作规范**（开工必读 / 红线 / 必跑门禁与基线 / 改接缝流程 / 真机自测 / ★ **可直接复制粘贴的「会话开场简报模板」** / §7 = 本文 §4.12.8 的自洽版）。
> `卫戍协议-Mod系统使用手册.md`（服主侧：装机/管理页）**是 v0.9 时期的历史手册、已过时**（停在「基座 = 官方 4 人版」）—— 现行口径以本文与上面两份为准。
> **合规基线**：代码 GPL-3.0-or-later；鹰角/Yostar 的美术与音频素材**不适用 GPL**，**严禁任何盈利形式**。

---

## 0. 三十秒速览

平台有 **四条落地轴**。选错轴是最常见的返工来源，先看这张表：

| 轴 | 目录 | 干什么 | 装在哪 | 写代码 | 典型需求 |
|---|---|---|---|---|---|
| **L1 纯数据** | `data/<target>.json` | 增删改干员 / 敌人 / 地图 / 波次 / 道具 / 特质 | **两端**（同一份 JSON 由服务器下发） | ✗ | 加一个干员、换皮肤指针 |
| **L2 规则参数** | `data/config.json`（`tuning.json`） | 经济 / 价格 / 时长 / ban / 座位上限 / 牌库与血池倍率 | **两端** | ✗ | 改人数上限、改商店概率 |
| **L3 战斗行为** | `content/index.js` | 技能行为 / 装备效果 / 盟约层数 / boss 机制 | **两端各一份**（★ 见 §1.2） | ✓ | 二段替身、起飞换攻击范围 |
| **L4 界面** | `client/index.js` | 在宿主界面的插槽里挂 UI（QoL） | **只在浏览器** | ✓ | 加一个导入导出按钮 |
| （美术） | `assets/**` | Mod 自带图片/音频 | 服务器下发，浏览器取 | ✗ | 立绘、小人、图标 |

**一句话规则**：**能只写数据就别写代码**。L1+L2 覆盖绝大多数需求，而且零代码意味着零崩溃面、零两端不一致风险。

**最小可用 Mod**（照抄「隐现」新增一名干员，全部文件）：

```
mods/cyanfish.mymod/
├─ mod.json
├─ data/chess.json         ← 干员本体
└─ data/bonds.json         ← 把他挂进盟约成员表
```

```json
// mods/cyanfish.mymod/mod.json
{
  "id": "cyanfish.mymod",
  "name": "我的干员包",
  "summary": "新增一名示例干员——写自己的 Mod 时从这份清单开始改就行",
  "version": "1.0.0",
  "apiVersion": 1,
  "gameVersion": "0.2.4",
  "author": "你的名字",
  "description": "照抄『隐现』新增一名干员（详细说明写这里，管理页默认收进「查看详情」）。",
  "loadAfter": []
}
```

```json
// mods/cyanfish.mymod/data/chess.json
{ "ops": [
  { "op": "clone", "from": "chess_char_1_01_a", "path": "cyanfish_mymod_a",
    "value": { "chessId": "cyanfish_mymod_a", "name": "我的干员",
               "identifier": 950, "isGolden": false, "baseId": "cyanfish_mymod_a",
               "goldenId": "cyanfish_mymod_b", "upgradeChessId": "cyanfish_mymod_b",
               "stats": { "atk": 520 } } },
  { "op": "clone", "from": "chess_char_1_01_b", "path": "cyanfish_mymod_b",
    "value": { "chessId": "cyanfish_mymod_b", "name": "我的干员",
               "identifier": 951, "isGolden": true, "baseId": "cyanfish_mymod_a",
               "goldenId": "cyanfish_mymod_b", "upgradeChessId": null,
               "stats": { "atk": 640 } } }
] }
```

```json
// mods/cyanfish.mymod/data/bonds.json   ★ 另一个数据文件必须另写一个补丁文件
{ "ops": [
  { "op": "append", "path": "lateranoShip.members",        "value": "cyanfish_mymod_a" },
  { "op": "append", "path": "lateranoShip.visibleMembers", "value": "cyanfish_mymod_a" }
] }
```

> ★ **一个补丁文件只作用于与它同名的那一个目标文件** —— `data/chess.json` 里的 `path` 是从 `chess` 的根开始解析的，
> 所以「往 `bonds` 挂成员」**必须**再写一个 `data/bonds.json`。写成 `data/chess.json` 里的一条
> `{"op":"append","path":"lateranoShip.members"}` 会报 `path 中间键 "lateranoShip" 不存在`。
> （★ 这条是实测踩出来的：本示例已过 `node tools/mod.mjs lint` = 0 错误 0 提示，
> 且过 `node tools/mod.mjs verify` = 「全部新增项均可在商店正常出现」，普通形态与金色形态都进了牌库。）
>
> **两条干员记录一起加**：`_a` 是普通形态、`_b` 是金色（三合一）形态。只加 `_a` 会在 `lint` 时报 warning
> `没有 goldenId → 无法三合一精英化`；指过去的 `_b` 不存在则是 **error**（Mod 会被整个跳过）。

```bash
node tools/mod.mjs lint   mods/cyanfish.mymod    # 必须 0 错误
node tools/mod.mjs verify                        # 真实引擎里实抽，确认新干员真能上商店
node tools/mod.mjs pack   cyanfish.mymod         # 产出 cyanfish.mymod-1.0.0.spmod 用来分发
```

---

## 1. 平台模型（动手前必须先懂的四件事）

### 1.1 数据流的两个加载点

```
官方数据 + docs/research
   → tools/build-data.mjs  →  data/*.json           ← 生成产物，**不要手改**（重跑会被覆盖）
   → 服务器：server/data.js 的 loadDataMerged()      ← Mod 合并发生在 deepFreeze **之前**
   → HTTP：  /data/<f>.json 下发**合并后的** JSON（ETag `"mod-<sha1>"`）
   → 浏览器：public/js/data.js 自己再 fetch 一遍 /data/*.json
```

**两个结论**：

1. **Mod 合并点只有一处**（`server/data.js`），所以一个 L1 Mod **自动对两端生效**，不需要在客户端做任何事。
2. 客户端的 `/data/*.json` 是**被补丁改写过的**，所以**没装 Mod 的玩家也能正确看到 Mod 的座位数、卡数、干员**。这是本平台的设计底线：**客户端拿到网址就能玩，不需要自己装 Mod**。

### 1.2 战斗在客户端本地跑 ⇒ L3 必须两端同装

服务端只做**验算**（DESIGN §14）。`content/index.js` 是战斗行为代码，因此：

- 服务端在 `listen` 之前用绝对 `file:` URL 装载一份；
- 浏览器在 `loadBrowserSim()` 里用 `/mods/<id>/content/index.js` 装载**同一个文件**；
- **少装一边 = 战斗结果分裂 = 服务端拒收战报。**

> 反过来，`client/index.js` 是**浏览器界面**代码，服务端**根本不加载**，所以它不可能影响战斗、数据或战报，也不增加服务端攻击面。**两条通道别混用：L3 放 `content/`，L4 放 `client/`。**

### 1.3 三条硬约束（违反即打回）

| # | 约束 | 判据 |
|---|---|---|
| 1 | **不装 Mod 时行为与官方逐值相同** | 未装 / 停用 / 装在后端出错回滚，三条路径都必须回到官方值 |
| 2 | **非法数据一律回官方值，绝不抛、绝不静默改名** | 写坏的 `maxSeats` 回 `4`（**绝不夹到 1**，那会把写错的服务端静默变单人房）；写坏的 `draftCards` 回官方发卡数（**绝不发 0 张**，那等于谁也拿不到） |
| 3 | **逐 Mod 原子性** | 一个 Mod 的任意一个 op 失败 ⇒ 该 Mod 的**全部**补丁回滚，其余 Mod 照常；服务器绝不因为一个坏 Mod 起不来 |

「**≤N 等价**」是全项目的验收口径：新出现的能力只允许在**触发条件成立时**生效，官方档位上必须逐格/逐字节相同。第四轴的做法见 §4。

### 1.4 四轴与「两端 / 一端」矩阵

| 轴 | 服务器加载 | 浏览器加载 | 停用后是否彻底消失 |
|---|---|---|---|
| `data/` | ✓（合并进单例） | ✓（吃合并后的 JSON） | ✓（`/data` 回到官方） |
| `content/` | ✓ | ✓ | ✓（`GET /mods` 不再下发该 URL） |
| `client/` | **✗** | ✓ | ✓（同上） |
| `assets/` | ✓（作为 `/assets/**` 兜底根） | 取服务器 | ✓（兜底根目录列表不含它） |

> ★ **界面文案**（例如大厅「模拟方式」那张同盟卡的正文）属于 **`data/` 轴** —— 文案写在 `data/config.json` 里，基座只留一个中性读取点。见 §4.6。

---

## 2. 目录结构与清单规范

### 2.1 目录树

```
<modsDir>/<mod-id>/                      ← 目录名必须与 mod.json 的 id 逐字符相同
├─ mod.json          清单（必需，唯一必需文件）
├─ data/<target>.json  L1/L2 数据补丁（0..N 个）
├─ content/index.js    L3 战斗行为（可选，0 或 1 个）
├─ client/index.js     L4 界面扩展（可选，0 或 1 个）
├─ assets/**           自带美术（可选）
└─ README.md / SOURCE.md / LICENSE.txt   根目录说明文档（可选，会随包分发）

<modsDir>/.state.json       本机启停状态（**不随 Mod 分发，不要放进包里**）
<modsDir>/_removed/<id>/    平台自己的回收站（`uninstall` 挪到这里，不直接删）
```

`.state.json` 形态（由 CLI 原子写，不要手改）：

```json
{ "version": 1, "disabled": ["some.mod"], "order": ["a.mod", "b.mod"] }
```

- 扫描时**跳过** `.` 与 `_` 开头的目录 —— 这正是 `.state.json` 与 `_removed/` 不会被当成坏 Mod 的原因。
- **未被列入 `disabled` 的 Mod 默认启用** ⇒ 丢进目录即可用（即插即用）。

### 2.2 `mod.json` 字段全表

| 字段 | 必填 | 类型 | 规则 / 说明 |
|---|:--:|---|---|
| `id` | **是** | string | `^[a-z0-9][a-z0-9._-]*$`；**必须等于目录名**。命名空间约定见 §2.5 |
| `name` | **是** | string | 给人看的名字（中文可以） |
| `version` | **是** | string | `x.y.z` 或 `x.y.z-pre`（semver 子集，正则 `^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$`） |
| `apiVersion` | **是** | number | 必须是 `1`。**不等于 1 直接判错并跳过该 Mod** |
| `gameVersion` | **是** | string | 必须与宿主 `package.json` 的 `version` **严格相等**（★ **当前 = `"0.2.4"`**；`"0.2.3"` / `"0.2.2"` / `"0.2.1"` 都是**历史值**，写错即被跳过）。不一致直接跳过（见 §9.3） |
| `author` | 建议 | string | 不给只出 warning，但分发时请务必写 |
| `summary` | 建议 | string | ★★ **管理页列表里只显示这一行**（`description` 收进「查看详情 ▾」）⇒ **必须是一句话、≤ 50 字、不含细节**（判据见 **§4.12.8**）。缺省时页面自动退化成 `description` 的**第一句**（在 `。；！？` 处断开，≤ 90 字）—— 但那样你就不控制「列表里显示哪一句」了，而且**第一句通常带着细节**，建议写。**写了 `description` 却没写 `summary` 会出一条建议性 warning**（不是错误） |
| `description` | 建议 | string | 完整说明，写清楚「改了什么」。管理页**默认折叠**（不在列表里铺开），展开后按原文换行渲染；搜索**同时**命中 `summary` 与 `description`。★ **换行分段**：**第 1 段 = 干什么 + 默认值**，之后每段一个话题（依赖 / 风险 / 上游状态 / 怎么改回去 / 要不要重启）。**详情不是开发者日志**，也**不许**把版本日志写进来（→ `CHANGELOG.md`）。分工表见 **§4.12.8** |
| `loadAfter` | 否 | string[] | 只放 **Mod id**。依赖拓扑排序用；指向不存在的 id 会报错（见 §11.3） |

> ★ `summary` / `description` 只影响**管理页与 CLI `list` 的展示**，不改任何游戏行为；`GET /mods`（玩家客户端读的那个）**只回** id/name/version/enabled/入口 URL，**不含** `summary`/`description` ⇒ 写多长都不会加大玩家侧的载荷。
> ★ 列表观感是硬需求：**一张卡只给一行核心文案 + 一个「查看详情」入口**。所以 `summary` 请写成**一句话**（★ 硬上限 **≤ 50 字**，软目标 ≤ 40 字；现状实测：23 个 Mod **全部 ≤ 50 字**，最长那个 **47 字**、> 50 字的 **0 个** —— 那一批曾列在待整改项里的长文案已全部改短；★ **工序 `host-012`（2026-10-12）复核**：`cyanfish.chat` 的 `summary` = **36 字**、**无 `；` / `。`**、一句话只讲一件事 ⇒ **已核通过**）。**「什么算细节」与「细节该搬去哪」的判据见 §4.12.8** —— 一句话：**列表里那一行是"索引"，不是"说明书"**。

**不要**在清单里写 `files` / `dependencies` 版本区间 / `main` 之类字段 —— 平台不读，写了只会误导别人。

### 2.3 校验时机

| 时机 | 行为 |
|---|---|
| 服务器启动 / 热重载 | `resolveMods()`：清单校验 → 拓扑排序 → 合并 → 记录级校验。**失败只跳过该 Mod** |
| `tools/mod.mjs lint <dir>` | 任意目录（不必在 `mods/` 下）。预打包门禁 |
| `tools/mod.mjs validate [id]` | `mods/` 下的 Mod。有错误时**退出码 1** |
| `tools/mod.mjs pack` | 先跑完整校验，**不通过拒绝打包**（`--force` 可强打，不要用） |
| 安装完 | `install` 立即再校验一遍，不通过会明确报出来 |
| 管理页「验证」按钮 / **仓库列表** | 服务器侧**同一份**校验：`server/admin.js: listMods()` 直接 **复用** `server/mods/loader.js: validateManifest`（不再自己手写一套）。⇒ **网页看到的错误/提示与 `mod.mjs validate` 逐条一致**（含 `id` 命名规则、semver、`loadAfter` 类型、`author`/`summary`/`description` 建议项） |

### 2.4 干员 id 与其它 key 的命名空间约定

**必须遵守**（否则会和别人的 Mod 撞）：

| 对象 | 约定 | 例 |
|---|---|---|
| Mod id | 作者前缀 + `.` + 功能名 | `cyanfish.max-seats` |
| 新增干员 id | 作者前缀 + `_` + 名字，**普通形态 `_a` / 金色（三合一）形态 `_b`** | `cyanfish_makoto_a` / `cyanfish_makoto_b` |
| 新增特质 / 盟约 / 敌人 / 地图 | 同上，作者前缀开头 | `cyanfish_my_buff` |
| `identifier`（干员编号） | 从 **900 起**取未占用号（官方占 1..~400，重复只出 warning 但**请换**） | 900 / 901 / 910 / 911 / 950 / 951 |

> **不要**复用官方的 id / identifier。`identifier` 撞号目前只出 warning（引擎暂不把它当唯一键），但**将来会**，所以现在就换。

---

## 3. L1 / L2 数据补丁规范

### 3.1 文件形态

`data/<target>.json` 的顶层**必须**是 `{ "ops": [ … ] }`：

```json
{ "ops": [ { "op": "replace", "path": "chess_char_1_01_a.stats.atk", "value": 520 } ] }
```

补丁的作用对象是 `data/<target>.json` 的**根对象**。一个目标文件一个补丁文件，一个补丁文件可含任意多个 op。

> ★ **`target` 由补丁文件的文件名决定**（`data/bonds.json` ⇒ `bonds`），所以 `path` **不能跨文件**。
> 「新增干员」这种要同时动 `chess` 和 `bonds` 的需求，**必须写两个补丁文件**（`data/chess.json` + `data/bonds.json`）。
> `clone` 的 `from` 同理，只在同一个目标文件内解析。

### 3.2 `target` 白名单

`data/` 下**已存在**的文件名主干才算合法 target（否则报 `目标文件在 data/ 里不存在`）。

| target | 顶层形态 | 常改什么 |
|---|---|---|
| `chess` | `{ "<chessId>": rec }` | 干员（★ 记录校验最严，见 §3.8） |
| `enemies` | `{ "<key>": rec }` | 敌人属性 |
| `bosses` | `{ "<key>": rec }` | 领袖机制参数 |
| `stages` | `{ "<id>": rec }` | 地图 |
| `waves` | `{ "<id>": rec }` | 波次 |
| `items` | `{ "<id>": rec }` | 道具 |
| `effects` | `{ "<id>": rec }` | 效果（含 `descRaw`） |
| `bonds` | `{ "<bondId>": { members, visibleMembers, … } }` | 盟约；**成员表用 `append`** |
| `garrisons` | `{ "<id>": rec }` | **特质**（可组合被动，不是 `trait`） |
| `tokens` | `{ "<id>": rec }` | 召唤物 |
| `config` | `{ modes, … }` | 模式 / 赛季 / **规则参数（`coop` 等）** |
| `tuning` | `{ … }` | 数值调参 |
| `choices` | `{ … }` | 机变（悬赏/战术/商店）口径 |
| `bands` `factions` `emotes` | `{ … }` | 乐队 / 阵营 / 表情 |
| `assets` | `{ … }` | **美术指针表**（改皮肤/立绘走这里，见 §7） |
| `local-assets` | `{ … }` | 本地美术清单（生成产物，一般别碰） |

### 3.3 `path` 语法

- 用 `.` 分隔；键里真有 `.` 时用 `\.` 转义。
- 容器是**数组**时，该段**必须**是整数下标：`modes.mode_multi_hard.rounds.3.template`。
- 空段（连续两个点）直接报错 —— 这是为了抓「手滑多打一个点」。
- 中间段必须已存在且是对象/数组；`add` / `clone` 只在**最后一段**做「不存在」检查。
- ★ **分段只能用 `.`；段里出现 `/` 会被当成普通字符**（`a/b` 就是「一个键名叫 `a/b`」）。
  引擎允许任意键名，所以这**不是错误**，但几乎每一次 `/` 都是「以为它是分隔符」的笔误：
  `{"op":"add","path":"diy.slots/<slotId>"}` 会**静默**在 `diy` 下写一个名叫 `slots/<slotId>` 的键 ——
  Mod 装上了、`ops` 数也对、`anyErrors` 是 false，**功能却整条没生效**（2026-10-08 实测踩到）。
  所以 `applyOps` 会对这种段产出一条**警告**（`server/mods/patch.js pathWarnings`，文案里给出 `.` 形式的建议写法），
  同时**语义一点不改**：补丁照旧按字面键生效，`ok` / `applied` / 冲突检测都不受影响。
  警告的去处：CLI `validate` / `lint` 的「提示」行、管理页「验证」按钮（同一份 `row.warnings`）、
  服务端启动日志 `[mods] <id>: …`。
  > 顺带：`clone` 的 `from` 也按同一套语法解析，**同样**会被查（warning 的 label 会写成 `from`）。


### 3.4 七个 op 的严格语义

> 设计取向是**刻意严格**：`add`/`clone` 要求不存在，`replace`/`remove`/`merge`/`deepMerge`/`append` 要求存在 —— 防止路径写错却静默成功。
>
> ★ **唯一的幂等豁免（工序 88，只对 `add`/`clone`）**：目标已存在、且与本次要写的值**逐字节相同**（`JSON.stringify` 完全相同，键序也算）⇒ **不报错**，照常记入 `applied`（= 一次同值重写）。判据刻意取「逐字节相同」而不是「深相等」，只放过真正的重复声明。

| op | 目标前置条件 | `value` 要求 | 语义 |
|---|---|---|---|
| `add` | 目标**不存在**（★ 例外：已存在且与 `value` **逐字节相同** ⇒ 幂等通过） | 任意 | 在 `path` 处新建 |
| `clone` | 目标**不存在**（★ 例外：已存在且与 **clone 算出来的结果**逐字节相同 ⇒ 幂等通过） | **对象** | 取 `from` 处记录 → **深克隆** → 用 `value` **深合并**覆盖 → 作为新键写入 `path` |
| `replace` | 目标**存在** | 任意 | 整体覆盖 |
| `remove` | 目标**存在** | **不需要** `value` | 删除（数组则 `splice`） |
| `merge` | 目标**存在且是对象** | 对象 | **浅**合并：只覆盖给出的键，其余保留 |
| `deepMerge` | 目标**存在且是对象** | 对象 | **深**合并：递归进对象；**数组整体替换**，不拼接 |
| `append` | 目标**存在且是数组** | 任意元素或数组 | 末尾追加，**已存在的元素跳过（幂等）** |

★ **`append` 是「成员表」的专用 op**。`deepMerge` 遇到数组是**整体替换**，会让 Mod 悄悄丢掉基座新加的成员。所以往 `bonds.<id>.members` / `.visibleMembers` 挂新干员时（★ 注意这段要写在 **`data/bonds.json`** 里，不是 `chess.json`）：

```json
{ "op": "append", "path": "lateranoShip.members",        "value": "cyanfish_mymod_a" }
{ "op": "append", "path": "lateranoShip.visibleMembers", "value": "cyanfish_mymod_a" }
```

幂等判据是元素的 `JSON.stringify` 指纹 —— 重复应用不会越加越多。

### 3.5 `clone` 细则

- `from` 与 `path` **必须在同一个目标文件内**解析（不能跨文件 clone）。
- `from` 必须解析到一个**对象**。
- 覆盖是**深合并**，所以 `"value": { "stats": { "atk": 520 } }` 只改 `atk`，其它 stat 保留。
- `clone` 之后**必须**改掉这几个字段，否则记录校验会报错或出 warning：
  - `chessId`（必须等于新键名）
  - 普通形态（`_a`）：`isGolden: false`、`baseId` = 自身 id、`goldenId` = 金色形态 id、`upgradeChessId` = 金色形态 id
  - 金色形态（`_b`）：`isGolden: true`、`baseId` = 普通形态 id、`upgradeChessId: null`（给了只出 warning）；
    `goldenId` 上游写的是**自身 id**（校验不检查它，但保持与上游一致）
  - `identifier`（撞号出 warning，**请换**）

### 3.6 原子性与冲突检测

| 级别 | 行为 |
|---|---|
| 一个 op 失败 | **该补丁文件剩余 op 不再执行**，整个补丁文件报错（要么整包生效，要么不生效） |
| 一个 Mod 失败 | 该 Mod 触碰过的目标文件**整体回滚**到应用前快照，并把它的路径占用记录撤销。`row.skipped = true`；其余 Mod 不受影响 |
| 跨 Mod 抢同一路径（**写不同值**） | `add`/`replace`/… 的 `path` 若已被**另一个** Mod 改过、且这次写进去的值与已有值**不同** ⇒ 报 `与其它 Mod 冲突: … 已被 "X" 改过`，该 Mod 整体回滚。**解决方式是拆开路径 / 改用不同的键**（顺序解决不了：判定只看「有没有第二个 Mod 碰过同一路径」，不看谁先谁后） |
| 跨 Mod 同路径**写相同值**（工序 88） | **不算冲突**：两边的 op 都生效（后写者是一次同值重写），只在**后写者**的 `row.warnings` 里出一条聚合提示 `与 "X" 重复写入 N 条相同路径（值逐字节相同 ⇒ 按幂等处理，不算冲突）` | 无需处理。★ 这正是「两条可以各自单独启用的 Mod 都声明同一条数据」的合法姿势（`add` 同一条记录、值逐字节相同）；**值一旦不同就必须拆键** |

> 同一 Mod 内部对同一路径多次修改**不算冲突**。
>
> ★ 「值」的判据是 `JSON.stringify` **逐字节相同**（键序不同即算不同 ⇒ 报冲突，去把两边的字面量对齐）。取不到值的一侧（新增 / 删除 / 路径消失）一律算「变了」⇒ 报冲突（保守，不放过真抢路径）。

### 3.7 干员记录校验（`validateChessRecord`，新增/替换都要过）

**Error（直接判坏，Mod 被跳过）**

| 检查 | 说明 |
|---|---|
| 记录是对象 | — |
| `chessId === 键名` | 不一致即错 |
| `name` 非空 string | — |
| `tier` 是 `1..6` 的整数 | — |
| `profession` ∈ `PIONEER/WARRIOR/TANK/SNIPER/CASTER/MEDIC/SUPPORT/SPECIAL` | — |
| `stats` 是对象 | — |
| `isDiy === true` **禁止** | 引擎会把 `isDiy` 的干员过滤出商店（`gamedata.visibleChess` 与协议都过滤），必须写 `false` |
| 金色形态：`baseId` 指向**普通形态 id** 且该记录存在 | — |
| 普通形态：`baseId === 自身 id` | — |
| 普通形态：`goldenId` 指向的记录存在且 `isGolden === true` | — |
| `bonds[]` 每项在 `bonds` 里存在 | — |
| `garrisonIds[]` 每项在 `garrisons` 里存在 | — |
| 所有 `*TokenKey` 引用的 token 在 `tokens` 里存在 | 递归扫全部 `xxxTokenKey` 字段 |

**Warning（能装，但请处理）**

- `visible === false` → 不进商店；未写 `visible` → 建议显式 `"visible": true`
- `isHidden === true` → 不进商店
- `identifier` 与别人重复
- 金色形态的 `upgradeChessId` 建议 `null`
- 普通形态缺 `goldenId` → 无法三合一

> **自检**：`node tools/mod.mjs verify` 会在**真实引擎**上构造 `GameData + SharedPool` 实抽 20 万次，把「理论份额 / 实测出现次数」打出来。**新干员必须过这一关**（只改数值的 Mod 会提示「无可验证的新增项」）。

### 3.8 六个常用配方

**① 只改数值（最小改动）**

```json
{ "ops": [ { "op": "replace", "path": "chess_char_1_01_a.stats.atk", "value": 500 } ] }
```

**② 改一条记录的多个字段（其余保留）**

```json
{ "ops": [ { "op": "merge", "path": "enemies.enemy_1005_yokai", "value": { "hp": 9000, "atk": 700 } } ] }
```

**③ 删掉一个官方敌人**

```json
{ "ops": [ { "op": "remove", "path": "enemies.enemy_1005_yokai" } ] }
```

**④ 改地图某一轮的模板（数组下标）**

```json
{ "ops": [ { "op": "replace", "path": "modes.mode_multi_hard.rounds.3.template", "value": "act1autochess_tr07" } ] }
```

**⑤ 新增一条纯数据特质（零代码）** —— 挑一个**已有**的 `effectKey`，填对 `bb`：

```json
{ "ops": [ { "op": "add", "path": "cyanfish_my_buff", "value": {
  "id": "cyanfish_my_buff", "name": "我的特质", "desc": "…",
  "effectKey": "已有某个 effectKey", "bb": { "…": 1 } } } ] }
```

**⑥ 加一条规则参数接缝** —— 见 §4。

---

## 4. ★ 数据接缝规范（新增「规则参数」的唯一正确姿势）

### 4.1 什么是接缝，为什么不允许 Mod 改代码

「改游戏规则」（人数上限、倍率、禁用表、发卡数…）如果让 Mod 去改基座代码，就会**打破 §1.2 的两端同构**：Mod 的作者得同时改服务端与浏览器的逻辑，还得自己处理合并顺序、缓存、非法值。这是不可维护的。

所以平台的做法是：**基座先留一条中性的缝**，缝的默认值 = 官方行为；Mod **只提供数据**。

```js
// server/match/coop.js —— 这就是一条接缝的样子
export const COOP_DEFAULTS = Object.freeze({
  maxSeats: 4, seatCeiling: 4, aiCap: null, poolCopyMul: null, itemPoolMul: null, bossPoolMul: null, bans: null, draftCards: null,
});
export function readCoop(config)                 // 八键归一化；非法一律回官方值，绝不抛（aiCap 缺键/非法 ⇒ maxSeats）
export function poolCopyMulFor(players, coop)    // 默认 1（按**入座人数**）
export function itemPoolMulFor(players, coop)    // 默认 1（按**入座人数**；装备共享库存的第二层）
export function bossPoolMulFor(aliveCount, coop) // 默认 null（按 **boss 回合实际存活人数**）
export function coopBansFor(players, coop)       // → { core, addon } | null（默认 null ⇒ 官方 ban 表）
export function draftCardCountFor(players, coop) // → number | null（默认 null ⇒ 官方卡数）
export const SEAT_CEILING = 12;                  // 防呆上限（座位数与 aiCap 共用同一个上限常量）
// 房内调整（2026-10-07 起）：房主可用 `room.setSeats` 把**单个房间**的容量调到 [seatMin, seatMax]。
// 基座（没把 maxSeats 抬过官方 4）下 seatMin === seatMax === 4 ⇒ 改不动，room.state 也不下发这两个字段。
// ★ 单房 AI 上限（2026-10-11，工序 105）：`readCoop().aiCap` 由 `server/index.js` 落成 `Lobby.opts.aiCap`，
//   唯一的 AI 入口 `Lobby.addBot` 用它判 `已入座 AI 数 >= min(aiCap, room.maxSeats)` ⇒ 回 `ERR.AI_LIMIT`。
```

### 4.2 三条铁律

1. **表是「计数 → 值」的查表，不是公式。** 数据里**不出现表达式**（没有 `base * n`、没有 `+2`）。理由：数据要能被非程序员读懂、被管理页直接编辑、被其它语言实现。
2. **非法值一律回官方值，绝不抛、绝不夹到一个会改变语义的数。**
   - 「计数」类（`maxSeats`）：非法 ⇒ 官方 `4`。**绝不夹到 1**（静默变单人房比忽略笔误更糟）。
   - 「张数/倍率」类：非法（0 / 负 / 小数 / 字符串 / 缺值）⇒ 回官方口径。**绝不发 0 张**（等于谁也拿不到）。
   - 只对**范围**做防呆夹取（`maxSeats` 夹 `SEAT_CEILING=12`；`draftCards` 夹 `MAX_DRAFT_CARDS=24`），且上限常量放 `shared/constants.js`，**两端共用同一个值**。
3. **官方档位不写进表里，靠 `default` 回落。** 例：4 人档**不写** `"4"` 这一行，让 `default` 把它兜住；表外任何计数（如 13）也走 `default`。

### 4.3 现有接缝：`config.coop` 的五张倍率表 + 三个标量（两个容量 + 一个 AI 上限）

**★ 五张表的键都是「计数」，但查表用的那个计数分了**两类**——别记混：**

| 表 | 查表输入 | 何时定格 |
|---|---|---|
| `poolCopyMul` / `itemPoolMul` / `bans` / `draftCards` | **入座人数**（`Match.seatCount`） | **开局时定格**，中途淘汰/退出不重算 |
| **`bossPoolMul`** | **boss 回合开始时的实际存活人数**（`alive.length`） | **每进一次 boss 回合取一次**（R14 最终攻势 / R15 隐秘核心各取一次） |

| 键 | 含义 | 不装 Mod 的基座默认 | 装 `cyanfish.max-seats` 后 |
|---|---|---|---|
| `maxSeats` | 新房间的**默认**座位容量 | `4` | `6`（Mod 现值；1..12 皆可，越界夹到 `SEAT_CEILING`） |
| `seatCeiling` | 房主可用 `room.setSeats` 调到的**上限** | `4` ⇒ 房主**改不动**容量 | `12`（`maxSeats` 一抬过官方 4 就放开） |
| **`aiCap`** | **单房间 AI 队友数上限**（工序 105，★ **标量**、不是表） | 缺键 ⇒ **`= maxSeats`** = `4` ⇒ 4 座房最多 4 个 AI ⇒ **上限恒不可达** | **`6`**（= 官方具名 AI 数 `BOT_NAMES.length`；1..12 皆可，越界夹到 `SEAT_CEILING`；见下面第 7 条） |
| `poolCopyMul` | 商店牌库份数倍率（**入座数**） | `null` ⇒ 恒 1 | 5..12 = **1.25/1.5/1.6/1.83/2.06/2.29/2.52/2.75**（5/6 人 = `人数÷4`；★ **7 人起**低于 `人数÷4` —— 那时 ban 位从官方的 3+4 降到 2+3，池子种类变多，倍率要**回收一点**；实测（200 seed 均值、按真实 ban 抽取）人均 551.1 vs 官方 4 人房 542.2 = **+1.6%**）。★ 0.2.4 起这是**第二层**，乘在官方新增的同盟倍率之后（见下面第 5 条） |
| **`itemPoolMul`** | **装备共享库存**份数倍率（**入座数**，工序 101） | `null` ⇒ 恒 1 | 5..12 = **`人数 ÷ 4`** = 1.25/1.5/1.75/2/2.25/2.5/2.75/3（官方装备库存**不随人数放大** ⇒ 只有 >4 人时补足，使**人均回到官方 4 人房水平**；见下面第 6 条） |
| **`bossPoolMul`** | 共享领袖血池倍率（**存活数**） | `null` ⇒ 恒 1 | 1..12 = **`存活 / 4`** = 0.25/0.5/0.75/1/1.25/1.5/1.75/2/2.25/2.5/2.75/3（**每人 1 份，满编以上不封顶**） |
| `bans` | 禁用表放宽 `{ core, addon }` | `null` ⇒ 官方默认 | 2+3 / 2+3 / 2+2 / 2+2 / 1+2 / 1+2 / 1+1 / 1+1 |
| `draftCards` | 机变一轮**发几张卡**（总数，不是增量） | `null` ⇒ 官方 6（solo 3） | 5..12 → 7..14（= 人数 + 2，由官方 `4 → 6` 推广而来） |

**必须知道的口径**（编号沿用旧文，别按序号数）：

0. ★★ **`bossPoolMul` 按「存活人数」查表，值 = 存活 / 4**（2026-10-07 服主勘误，**别改回去**）。含义是「**每个还活着的博士各出 1 份血**」：4 人满编 = 1 倍（= 官方 `bloodPoint`）、6 人全活 = 1.5 倍、**6 人房只剩 3 人活着 = 0.75 倍**。**不是**按入座人数、**不是**「战场数 ⌈n/2⌉ ÷ 2」（旧表 ×1.5/×1.5/×2/×2/×2.5/×2.5/×3/×3 已废弃）。
   - 实现是 **Mod 命中时直接接管（替换）`share`**，**不**乘在官方 `bossPoolShare` 上 —— 否则双重缩放。
   - 表缺失 / 非法 ⇒ `bossPoolMulFor` 返回 `null` ⇒ 回官方 `bossPoolShare`（官方口径：**敌方领袖的总生命值不变**，与存活人数无关）。
   - 官方 `bossHpScale.aliveScaling` 本可做同一件事，但它是 `min(alive, aliveFull = 4) / 4`，**在 4 人处封顶**（6 人全活只能得 1.0）⇒ 4 人以上的房间用不了；官方数据里 `aliveScaling` 也一律 `false`（NORMAL/HARD/ABYSS 均未开启）。
   - 调用链 `Match._startBossRound` → `finalAssault.bossPoolHp(gd, bossId, aliveCount)` / `audit.js` 同一处；`GameData.bossPoolHp(bossId, aliveCount)` 与 `finalAssault.bossPoolHp(gd, bossId, aliveCount)` **都没有 `players` 参数** ⇒ 结构上不可能按入座数缩放。
1. **牌库/ban/发卡数按「入座人数」，血池按「存活人数」，场上格子数另由「存活人数」驱动**（`pairPlayers`）。血池的存活口径见上一条。
2. **`draftCards` 命中即覆盖**官方 `choices.format.cards` **与** `schedule[*].rounds[*].cards` 的固定值。
3. **发卡数 > 6 时，客户端把卡组分页显示**（`SP_PER_PAGE = 6`，官方 3×2 一页）。官方 ≤6 张时**不渲染分页条、不改变任何 class、返回原数组引用** ⇒ DOM/CSS 逐节点与改动前相同。
5. ★★ **0.2.4 口径变更：`poolCopyMul` 是「第二层」，官方同盟倍率是第一层**（工序 99）。官方 0.2.4 把
   `GameData.poolCopies` 改成官方实测口径：`base = poolCopiesOverrides[baseId] ?? poolCopies[tier] ?? DEFAULTS[tier]`，
   然后 `× (isSolo || isDiy ? 1 : economy.coopPoolMultiplier)`（0.2.4 数据里 = **2**）——**与队伍人数无关，
   而且连 `poolCopiesOverrides` 一起放大**。我们的 `config.coop.poolCopyMul` 只作**第二层**乘在它后面，
   因此：**4 人及以下与官方逐值相同**（表里 1..4 与 `default` 都是 1 ⇒ 第二层 ×1），
   **>4 人**恢复本 Mod 的既有口径「人均池份数与官方 4 人持平」（官方 4 人 = 2×/4 = 0.5 份/人；6 人 = 2×1.5 = 3× = 0.5 份/人）。
   ★ **撤销的旧口径**：0.2.3 时我们写的是「`poolCopiesOverrides` 是内容设定、**不放大**」——0.2.4 起跟随官方
   **一起放大**（同一层倍率，覆盖与档位一视同仁）。单测 `test/match/coop.test.js` 已按新口径重钉
   （两条：无表时逐值等于官方 0.2.4；有表时 4 人 = 官方、6 人 = 官方 × 1.5，并显式断言覆盖那条路径**真的被走到**）。
   ★ DIY 私有库存不受影响：`initDiyStock` 调 `gd.poolCopies(slotId)`（**不带 `players`**）⇒ 第二层 ×1，
   与官方「Private DIY stock keeps its per-player 8/5 capacities」逐值一致。
6. ★★ **补上工序 99 登记的已知缺口：装备共享库存也按人数补足（工序 101，服主口径）**。
   官方 `GameData.itemPoolCopies(id)`（`gamedata.js`）**完全不看人数** —— 它只做
   `itemPoolCopiesOverrides[baseId] ?? itemPoolCopies[tier]`（0.2.4 数据里 = 4/6/7/8/7/3 + 8 件逐件覆盖），
   **连官方自己的同盟倍率都不乘**（对比：干员牌库在同盟里是 ×2）⇒ **单人房 / 4 人房 / 6 人房的总装备份数一模一样**
   （51 件合计 288 份）⇒ 4 人以上人均被稀释。
   服主裁定原文：「**可以仅大于 4 人时按照我们的扩充逻辑，将均值平衡至官方的 4 人池水平**」⇒
   - **N ≤ 4**：第二层 ×1（表里不写 1..4，靠 `default: 1` 兜住）⇒ **逐值等于官方**；
   - **N > 4**：`round(官方份数 × N/4)` ⇒ **总库存 ×N/4、人均 = 官方 4 人房人均**（51 件合计：5 人 288→372、
     6 人 288→448；人均 57.6→74.4 / 48.0→74.67，官方 4 人房人均 = 72.0）。
   ★ **取整沿用 `poolCopies` 的同一约定**：单点 `Math.round`（逐件取整），没有第二套「余数分配」规则 ⇒ 人数头
   每件最多 ±0.5 份，人均偏差 ≤3.7%（5/6 人）、>6 人 ≤2.3%。
   ★ **与 `poolCopyMul` 互不冲突、可叠加**：一个管干员牌库（官方同盟 ×2 之后的第二层）、一个管装备共享库存
   （官方那一层之后），是**两份独立库存**，两头都在同一次 `Match` 构造里按 `Match.seatCount` 定格。
   ★ **落位**：`GameData.itemPoolCopies(id, players = 0)`（`server/match/gamedata.js`，第二层）
   ← `SharedItemPool.cap(id)` 传 `this.seats`（`server/match/pool.js`）
   ← `new SharedItemPool(this.gd, () => this.order, this.seatCount)`（`server/match/Match.js`）。
   唯一读点是 `SharedItemPool`（`left` / `canGain` / `held` / 商店与机变的 `soldOut` 全走它）⇒ **服务端单边改动，
   客户端不需要同装**（不同于 L3 战斗行为）。
   ★ **不装 Mod 为什么逐值等价**：表缺失 / 类型写错 / 该人数没列到 ⇒ `itemPoolMulFor` 恒回 `1` ⇒
   `Math.round(count × 1)` **就是官方原值**；`players` 缺省 0 也走这一条（老调用点 / 单测直调都安全）。
   证据：`test/match/coop.test.js` 两条新用例（无表时 51 件 × 13 个人数逐值等于官方；有表时 4 人 = 官方、
   5/6 人 = 官方 × 1.25 / × 1.5，且真开 6 座 / 4 座 / 不装 Mod 的 6 座三局逐一比对 `m.itemPool.cap`）
   + `<开发期报告>/101-equip-equiv.txt`（21/21：官方基线 / 停用该 Mod / 装全部 / 真一局）。
4. **★ `seatCeiling` 只在 `maxSeats` 被抬过官方 4 时才 > 4。** 不装 Mod 的服务器上房主**改不动容量**：`room.setSeats` 是空操作、协议边界仍停在 4（客户端走同一张表 ⇒ 连「想调到 6」都发不出去）、`room.state` 也**不**多出 `seatMin`/`seatMax` 两个字段（客户端因此不渲染人数选择器）—— 原版界面逐节点不变。抬过之后，房主可在 `[1, SEAT_CEILING]` 内调**本房间**容量（只影响这一间，其它房间互不影响）；缩容**不得低于已占用深度**（座位可以不连续：中间的 AI 被移走会留空洞 ⇒ 下限是「1 + 最高已占用下标」，**不是**人数），开局后不可再调。
7. ★★ **单房间的 AI 队友数上限 `aiCap`（工序 105，服主口径）。** 服主原话：「**既然 AI 对服务器压力较大，后续需要限制单房间的 AI 数量以保证单房间不会对服务器造成过大压力（例如以官方带名字的 AI 数量作为上限）**」。
   - **默认上限的取值来源 = 官方具名 AI 名录**：`server/lobby.js` 的 `BOT_NAMES` **恰好 6 个**
     （`AI·华法琳` / `AI·阿米娅` / `AI·惊蛰` / `AI·杜宾` / `AI·凯尔希` / `AI·可露希尔`，无重名）
     ⇒ `cyanfish.max-seats` 出厂 `"aiCap": 6`，逐值等于 `BOT_NAMES.length`。
   - **它管什么**：`已入座 AI 数 >= min(aiCap, 本房间座位数)` 时拒绝**再加 AI**。AI 是**服务端**在跑的
     （`server/match/bot.js`：每个 bot 每回合排练布阵 + 跑真战斗）⇒ 单房 AI 越多，单房 CPU 越重。**真人不受限**。
   - **唯一的入口就是 `room.addBot`**（`server/lobby.js` 的 `addBot`，消息表 `case 'room.addBot'`）——
     全仓 `isBot: true` 只有那一处（`grep -n "isBot: true" server/`），`Match` 只**收** `seats` 而从不造 AI
     （`Match.js` 头注释：「Seats may be all bots (tools/matchrun.mjs); the lobby always has ≥ 1 human」），
     `finalAssault.pairPlayers` 只在**既有**存活玩家上重排分组、不产生新 AI
     （`server/match/bossPairing.js` + `server/match/finalAssault.js` 的 `bossPairGroups`——工序 60 的「boss 回合随机队友」
     接缝因此**不在本上限的入口清单里**）。⇒ 一处强制即全覆盖。
   - **服务端强制 + 拒绝有明确原因**：`ERR.AI_LIMIT`（`shared/constants.js`），用户可见文案
     `ERR_TEXT.AI_LIMIT` = 「本房间的 AI 队友已达上限」（**四个语言包都有译文**：`public/i18n/{en,ja,ko,zh-TW}.json`），
     同一帧带开发者 `detail`（`AI teammate cap 6 reached (6 of 6)`，`server/net.js errorMsg` 截到 120 字）。
     ⇒ 客户端**不需要**任何改动：`public/js/net.js` 的 `errorText` 按 `ERR_TEXT` 查表、`ui/toasts.js` 的
     `toastError` 弹出它。**不是一个只藏按钮的 UI 限制**（直接发 WS 帧也会被拒）。
   - **判据顺序（等价性的关键）**：`addBot` 里**先看空座、再看上限** ⇒ 空座判据（`ROOM_FULL`）永远是先到的那个。
     于是"基座（缺键 ⇒ `aiCap = maxSeats`）"这条路径**根本走不到** `AI_LIMIT`
     ⇒ 4 座房第 5 次 `room.addBot` 仍回 `ROOM_FULL`、与改造前**错误码逐值相同**（`test/lobby.test.js` 的既有用例未动、仍绿）。
   - **边界口径（对服主最安全的一种）**：上限 < 座位数时**房间允许开局**，不要求满员 —— 真人可随时坐到任何空位
     （官方 `room.start` 只看"真人连没连、准没准备好"，从不要求坐满；`server/lobby.js start` 里唯一的座位判据是
     `solo` 房的 `humans !== 1 || bots > 0`）。理由：把"AI 用满 + 座位留白"当作正常状态，**压力有上限**而**玩家不受损**；
     反过来要求满员会让 6 座房在上限 6 时**必须**满 6 人才能开，反而逼服主把上限调大。
   - **`aiCap` 永远不能突破座位容量**：服务端取 `Math.min(aiCap, room.maxSeats)`，且 `room.setSeats` 缩容不得低于
     已占用深度（`Room.setCapacity`）⇒ 一个房间的 AI 数恒 ≤ 座位数。
   - **不装 Mod 为什么逐值等价**：`config.coop` 段整个缺失 ⇒ `readCoop` 返回 `aiCap = maxSeats = 4`
     （`COOP_DEFAULTS.aiCap = null` 是"数据里没写"的哨兵，`readCoop` 只在这一处把它落成 `maxSeats`）
     ⇒ 官方 4 座房最多也只能坐 4 个 ⇒ 上限**恒不可达**，连 `AI_LIMIT` 都发不出来。
     停用 `cyanfish.max-seats`（装 25 个其余 Mod）⇒ `readCoop` 的结果与"一个都不装"**逐键逐值相同**。
   - **落位链路**：`config.coop.aiCap`（Mod 数据）→ `readCoop()`（`server/match/coop.js`）
     → `lobbyOpts.aiCap`（`server/index.js`，与 `maxSeats` / `seatCeiling` 同一段）→ `Lobby.opts.aiCap`
     （经 `server/http/config.js` 的 `LOBBY_OPTION_KEYS` 白名单 + `server/http/websocket.js lobbyOptionsFrom`）
     → `Lobby.addBot`。★ 与 `maxSeats` 一样是**启动时**读入 ⇒ 改数据要重启进程。
   - 证据：`test/lobby.test.js`（新 `describe`，4 条：加满到上限 / 第 K+1 个 = `AI_LIMIT` 且文案与 `detail` 正确 /
     真人仍可入座且不必满员就能开局 / `NOT_HOST`·`ROOM_STARTED` 的优先顺序不变 + 6 座房"缺键 ⇒ 上限 = 座位数"1 条）、
     `test/match/coop.test.js`（`readCoop` 的 `aiCap` 定义域 2 条）、
     `<开发期报告>/105-ai-cap-equiv.txt`（44/44：官方基线 / 停用该 Mod / 装全部 / 真 Lobby + 真 Room 的强制 /
     4 个语言包 / 上游对照）。

### 4.4 新增一条接缝的施工清单

| # | 动作 | 文件 | 要点 |
|---|---|---|---|
| 1 | 定义默认值与读取器 | 新建 `server/match/<name>.js` | `*_DEFAULTS` 冻结对象 + `read<Name>(config)` 归一化 + 每个语义一个 `xxxFor(count, x)`。★ `count` 是**哪个计数由语义决定**（入座人数 / 存活人数 / 回合号…），参数名要跟着写清楚，别一律叫 `players` |
| 2 | 加防呆上限常量 | `shared/constants.js` | **两端共用**；只做范围夹取 |
| 3 | 接进调用点 | 服务端 | 只调读取器，**不要**在调用点自己判非法值 |
| 4 | 前端读取同一份数据 | `public/js/ui/**` | 数据来自被补丁的 `/data/*.json`，**不要**另写一份默认值 |
| 5 | 两端各夹一次 | 服务端 + 客户端 | 客户端 `normalizeXxx` 也夹一次，否则异常数据只在一端被拦 |
| 6 | 文档 | `docs/DESIGN.md`（新一节）/`docs/META.md`（口径）/`docs/DATA.md`（字典） | 写清「按入座还是按存活」「表外行为」 |
| 7 | 单测 | `test/match/<name>.test.js` | ① 不装 Mod 时逐值等于官方 ② 表命中/表外/`default` ③ 非法值回落 ④ ≤N 等价 |
| 8 | 端到端验收 | 独立脚本（见 §10.2） | 真开一局，比对 ≤N 的指纹 |
| 9 | **等价性证明** | 隔离仓库 on/off 对照 | 见 §10.2。**必须**有，否则不许合并 |
| 10 | **写进接缝清单** | 本节 + 该接缝的详节 | 新接缝**必须**在 §4.4 的表里留一行、并在 **§4.6..§4.20** 里给一节：**它管什么 / 基座默认 / 装 Mod 后 / 「不装 Mod 为什么逐字节等价」**。已落地的有：`config.coop`（§4.3；★ 新键/新表也算，见 §4.3 第 6 条的 `itemPoolMul`、第 7 条的 `aiCap`）、`config.coop.ui.*` 文案（§4.6）、跨 Mod 内容包（§4.7）、设置页注册（§4.8）、**自选位的阶数（§4.9）**、**战斗机制 `data/backups.json mechanics`（§4.10；同节的~~特质旗标 `bb.doll_swap_deploy`~~ 已于工序 54 撤除）**、**测试服调试控制台的 `config.debug` + `g.debug`（§4.11；★ 工序 115 在同一个接缝里追加了 `setEnemyAttr` / `setLayers` / `setWaveList` 三个动作、`GameData.debugAttrMul` 运行时格、`m.public.debugScale` 只读读数与 `g.debug.list` 协议字段 —— 都是"缺省 ⇒ 等于上游"的形状）**、**Mod 注册内容规范（控件 / 文案 / 受众 / 版本日志 / ★★ 页面文案，§4.12）**、**L4 客户端 UI 句柄的纯加成 `ui.Tooltip` / `ui.TooltipLayer`（§4.12.2 三 / §6.2，工序 46）**、**boss 回合的队友配对 `config.bossPairing`（§4.13，工序 60）**、**实时文档通道 `<mod>/live.json` + `/admin/api/live`（§4.14，工序 61）**、**自选位闸门把已装载 Mod 的 kit 也算进来（§4.15，工序 63）**、**L3 宿主句柄的确定性数学出口 `api.detmath = { sin, hypot }`（§4.16，工序 63）**、**管理员只读的房间明细 `GET /admin/api/rooms`（§4.17，工序 69）**、**管理面 CORS 白名单 `SP_ADMIN_ORIGIN`（§4.18，工序 73）**、**眼睑裁剪兜底判据（§4.19，工序 81）**、**对局内聊天 `config.chat` + `g.danmaku` / `m.danmaku`（§4.20 —— ★ 它取代了工序 90 的「观战者实时弹幕」：接缝由 `config.danmaku` 改名为 `config.chat`、发送权限由「只有观战者」放宽为「对局里的真人」，线格式消息名与通道让位契约**逐值不变**）**、**管理面只读的趋势指标 `GET /admin/api/metrics` + 1 分钟采样器（§4.21，工序 114）** |
| ★ | **新增一个「标量」而不是表时**（工序 105 的 `aiCap` 就是这么加的） | `server/match/coop.js` + `server/index.js` + 调用点 | 标量**没有** `xxxFor(count, x)` 这一层：`readCoop` 里直接归一化成一个数，再由 `server/index.js` 落成 `Lobby.opts.*`（记得加进 `server/http/config.js` 的 `LOBBY_OPTION_KEYS`，否则 `startServer({...})` 传不进去）。判据放在**唯一的业务入口**（本例 `Lobby.addBot`），并在里面再夹一次与房间状态的耦合（`min(aiCap, room.maxSeats)`）。★ **等价性靠"不可达"而不是靠"分支"**：缺键 ⇒ 回落成"座位数"，让旧错误码先命中（先看空座、再看上限）。 |

### 4.5 反例清单（不要这么写）

- ✗ 把公式写进数据：`"poolCopyMul": { "6": "1.5 * seats" }`
- ✗ 让 4 人档也进表：`{ "4": 1 }` —— 应该靠 `default`，否则以后改官方默认值会分裂
- ✗ 非法值夹到最近合法值：`maxSeats: 0 → 1`（应该回 4）
- ✗ 在基座里 `if (seats > 4)` 硬编码 —— 那就是旧的 6 人分叉版，已被废弃
- ✗ 客户端自己写一份默认表 —— 两端一定会漂移

### 4.6 ★ 界面文案也是接缝：`config.coop.ui.*`（Mod 化而非改原版）

有些文案在基座里是**模块级常量**（例如大厅同盟卡那句「与至多 3 名博士组成同盟」）。Mod 不许碰代码 ⇒ 想要「只有在装了这个 Mod 时才换措辞」，唯一正确姿势仍然是**基座留一条只读数据的缝、文案写进 Mod 数据**。

| 位置 | 读取的键 | 覆盖什么 |
|---|---|---|
| 大厅「模拟方式」卡（同盟那张） | `config.coop.ui.coop.desc` / `.points[]` | 同盟卡的正文与要点列表（`desc`、`points` 各自独立回落） |

**基座侧（`public/js/screens/lobby.js`，含 0 句新文案）**：

```js
function coopCardOverride() {
  const t = getConfig()?.coop?.ui?.coop;
  const desc = typeof t?.desc === 'string' && t.desc.trim() ? t.desc.trim() : null;
  const points = Array.isArray(t?.points)
    ? t.points.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : null;
  return desc || (points && points.length) ? { desc, points } : null;
}

export function modeCards() {                 // ★ 渲染时求值（不是模块级 const）
  const over = coopCardOverride();
  return [
    { id: 'solo', /* … 官方原文 … */ },
    { id: 'coop',
      desc: over?.desc || `与至多 ${MAX_SEATS - 1} 名博士组成同盟，…`,   // ← 官方原文，逐字不改
      points: over?.points || [`1–${MAX_SEATS} 名博士 · 可由 AI 队友补位`, '联防阶段 · 最终攻势合并生命值'] },
  ];
}
```

**Mod 侧（`mods/<id>/data/config.json`，一条补丁）**：

```json
{ "op": "add", "path": "coop.ui", "value": { "coop": {
  "desc": "与多名博士组成同盟，共享干员池，联防协作抵御敌潮。",
  "points": ["人数由创建者在同盟内自行设定", "联防阶段 · 最终攻势合并生命值"]
} } }
```

**四条纪律**：

1. **基座里一个新文案都不许出现。** 缝的代码只做「数据有没有 → 有就用、没有就用官方」，`grep` 基座应**搜不到** Mod 写的那句话。
2. **不装 Mod 逐字相同**：`getConfig().coop` 缺失 ⇒ `over === null` ⇒ 走官方原文；`desc` 与 `points` 各写坏了也各自独立回落到官方，不会把另一条也带崩。
3. **★ 时序坑**：`MODE_CARDS` 原本是**未 export 的模块级 `const`** ⇒ 模板串在**模块加载时**就定死了；而 `config` 是**异步**加载的（`LobbyScreen` 靠 `useData('config')` 重渲染）⇒ 必须改成**渲染时求值的函数**，否则数据到了文案也不会变。
4. **★ 客户端 Mod 没有任何文案接缝**：`public/js/ui/extensions.js` 的宿主 API 原话是「Nothing here can reach the server or the sim」，唯一扩展机制 = **命名插槽**（`UI_SLOTS`，见 §6.3），文件头专门解释了「why a slot registry rather than the mod injecting DOM itself」（Preact 重渲染会把 Mod 塞的 DOM 冲掉）。⇒ 要改宿主 UI 文案，**只能**走数据缝，别去 `MutationObserver` + 字符串匹配（脆、且方向与基座设计相反）。

> 一句话：「**Mod 化而非改原版**」= 基座提供**中性读取点** + 内容**全在 Mod 数据里**。凡是要「仅在装某个 Mod 时才变」的东西，都按这个形状做。

### 4.7 ★ 跨 Mod 内容包：一份数据 + 可选依赖

「A 给 B 的内容做贡献」**不许**靠 A 去改 B 的文件（作者之间会耦合，没装 B 的服主还会拿到一份被改过的表）。
约定形状：**贡献方在自己目录里放一份固定名的数据文件**，消费方**装着才读、不装就完全惰性**。

| 项 | 约定 |
|---|---|
| 文件名 / 位置 | `skinvoice-pack.json`（固定名），贡献方 **Mod 根目录** |
| 消费方 | `cyanfish.skinvoice` ≥ 0.5.0（`client/packs.js`） |
| 读取 | 装载时读 `GET /mods` 快照 → 只对**别的**、**已启用**、**未跳过**的 Mod 发 `fetch` |
| 失败 | 404 / 坏 JSON / 网络错一律**静默**（不抛错、不阻断其余 Mod） |
| 合并 | **只加不改**：同 `id` 不覆盖；数组按 URL / `id` 并集去重；消费方的数据表**零改写**（只改内存） |
| 卸载语义 | 贡献方被停用 / 删除 ⇒ 界面上那份内容**自然消失**，没有残留状态 |

**★ 三条纪律**：

1. **不许写「Mod 依赖」**。宿主**没有这个概念** —— `mod.json` 的 `requires` / `dependencies`
   **不被识别**（见 §1 的平台模型）。要表达「我要 A」只能靠**消费方主动发现**（拉 `GET /mods` 再过滤）。
2. **★ 消费方必须自己按 `enabled && !skipped` 过滤**。`/mods/` 是**整目录静态挂载**
   （`server/index.js`）⇒ 停用 Mod 的文件照样 200；但 `/assets/` 的回退根**只收已启用且未跳过的 Mod**
   （`modAssetDirsOf`）⇒ 拿了停用 Mod 的素材路径就是**破图**。**「取得到」≠「能用」。**
3. **★ 贡献方零可执行文件 = 「没装消费方就静默丢弃」的结构性保证。**
   贡献方只出**数据**（`json` / `png` / `skel` / `atlas`）：`mod.json` 不带 `client`、目录里没有 `client/`。
   宿主的 `extensions.js` 只 import 有 `client` 字段的 Mod ⇒ 没装消费方时那份包
   **不会被请求、不会被求值**。★ 别写成「先 import 再判断有没有消费方」—— 那就有了执行面，违反本条。

**包格式**（`packVersion` / `operators[charId].skins[] / voices{CN,JP}{pick,deploy,battle}`）、
`battle` 的**「要么完整要么不要」**（`hasSpine: true` 但缺 `atlas`/`anims` ⇒ 消费方就地摘掉 `battle`，
否则统计会虚高）、以及**战斗小人必须是本服同源 `/assets/…`**（§7 的 `validSpine` 硬门槛）——
逐条见 `mods/cyanfish.skinvoice/README.md` 的「跨 Mod 皮肤/语音包」一节。
现成贡献方 = `mods/cyanfish.makoto/skinvoice-pack.json`（结城理的时装与日文语音）。

---

### 4.8 ★ 跨 Mod 设置页注册协议（`globalThis.__SP_MODSETTINGS__`）

**要解决的问题**：多个 Mod 各自造一个设置弹窗 ⇒ 玩家要记住「哪个参数在哪个 Mod 的哪个按钮里」；
而且每个 Mod 都得自己写一遍「Modal + 分栏 + 行控件」的样板。

**约定**：设置页的**外壳**由独立 Mod `cyanfish.mod-settings` 提供（顶栏齿轮 + 两栏面板），
别的 Mod 只**注册一个栏位**。联动走 `globalThis` 上的一份**幂等注册表**。

| 项 | 约定 |
|---|---|
| 全局键 | `globalThis.__SP_MODSETTINGS__`（`SETTINGS_KEY`），`apiVersion = 1` |
| 引导文件 | `client/registry.js` —— **每个联动方在自己的 `client/` 里各放一份，且必须逐字节相同** |
| 注册 | `settingsRegistry().register({ id, title, order?, micro?, render })` → 返回 `dispose()` |
| 外壳句柄 | `reg.host = { open(sectionId?), close(), available }`；`null` = 没装外壳 / 面板不可用 |
| 排序 | `order` 升序；同 `order` 按注册先后；同 `id` 重复注册 = **就地覆盖**（不堆叠） |
| 失败 | 缺 `id` / 缺 `render` ⇒ `register` **抛错**（让调用方在 setup 里就炸出来，不是静默吞） |

**★ 三条纪律**：

1. **不许 `import` 外壳的模块**。宿主**没有 Mod 依赖概念**（§1），外壳被停用时那条 import 直接 404。
   走 `globalThis` 的 `||=` 幂等引导：谁先跑谁建，后跑的拿到同一个对象 ⇒ **加载顺序无关**。
2. **★ 各放一份副本，但要防漂移**。副本是"零依赖"的必然代价。验收里必须有
   **逐字节断言**（现由 `<开发期脚本>/verify_skinvoice.mjs` 提供：
   `mod-settings/client/registry.js === skinvoice/client/registry.js`）。加第三个联动方时照抄，一个字别改。
3. **★ 外壳必须对「没人注册」和「拿不到 preact」都成立**。没注册方 ⇒ 面板显示「暂无模组设置项。」；
   拿不到 `/vendor/preact.module.js` ⇒ `host.available = false`，但**注册表照常工作**
   （别的 Mod 的 `register` 不报错）。**联动方的降级必须只依赖 `host` 是否为 null**，不要依赖 `available`。

**`render` 是零参组件函数**（注册方在闭包里带上自己的 `cfg` / `api` / 回调）—— 这是零耦合的关键：
外壳完全不需要知道栏位内容依赖什么。

**★ 与 §4.7 的区别**：4.7 传的是**内容数据**（json + 素材，贡献方零可执行文件）；
4.8 传的是**界面片段**（双方都有 `client/`，靠 `globalThis` 会合）。两者都**不声明依赖**。

参考实现：`mods/cyanfish.mod-settings/`（外壳）与 `mods/cyanfish.skinvoice/client/section.js`（栏位内容）。
★★ **栏位里放什么、文案怎么写、哪一段给谁看** —— 一律按 **§4.12（Mod 注册内容规范）**：短标签 + 「？」长提示、
受众分层（管理页 vs 玩家页）、版本日志另有入口。

---

### 4.9 ★ 自选位（DIY）的**阶数由数据决定**（新增阶自选位的唯一正确姿势）

**要解决的问题**：自选编队原本写死「5 阶两个、6 阶两个」—— 阶数在基座里是**模块级常量**
`shared/diy.js DIY_TIERS = [5, 6]`，而页面分段顺序又等于 `diy.slots` 的**数据出现顺序**。
「给某个阶也加一个自选位」这种需求如果让 Mod 去改基座代码，同样会打破 §1.2 的两端同构。

**接缝的形状**（2026-10-08 起，随 `cyanfish.diy-34` 落地）：**阶数完全由 `data/backups.json` 的
`diy.slots` 决定**，基座不再用 `DIY_TIERS` 当闸门。

| 项 | 基座默认（不装 Mod） | 装 Mod 后（`cyanfish.diy-34` v1.1.0 的现值） |
|---|---|---|
| `diyTiersOf(data)` | `[5, 6]`（= 数据里 `diy.slots` 出现过的阶，升序去重） | `[3, 5, 6]`（v1.0.0 时代是 `[3, 4, 5, 6]`；v1.1.0 起 4 阶位已移除） |
| `diyPool(tier, …)` 的闸门 | 「该阶在 `diy.slots` 里存在」 | 同上（3 阶拿到 `diy.prototypes[3]` + `ownedPool`，与 5 阶位候选池**逐项相同**） |
| `diySlotIds(data)` 的顺序 | **按 (tier, id) 升序** ⇒ 5 阶在前、6 阶在后（与官方数据顺序**恰好相同**） | `[3, 5, 6]` ⇒ 页面分段 III → V → VI |
| 候选池口径 | `diy.prototypes[该阶]` + `diy.ownedPool` + `diy.locked[该阶]` | 与官方阶**完全同一套规则**，`ownedPool` / `prototypes` 一个字都不改 |
| `DIY_TIERS` 常量 | **保留** `[5, 6]` | 仍然是 `[5, 6]`（**它只是「官方数据里出现的阶」的文档性常量**，不许当闸门） |
| 库存 | `gamedata.poolCopies`（`{1:12,2:14,3:18,4:16,5:8,6:5}` 按**阶**） | 新阶自动拿该阶份数（3 阶位 18 份）⇒ **不需要**改任何库存数字 |
| 调度中心等级 | `diy.slots[id].shopLevel`（缺省回落 `tier`） | 新键自己写 `shopLevel`（3 阶位写 3） |
| ★ **作废**（v1.1.0 新增）`diy.slots[id].voidedByTiers` | 官方**没有任何 slot** 写这个键 ⇒ `diyVoidedByTiers` / `diyVoidedSlots` **恒为空**，`validateDiyPicks` / `checkDiyPicks` 里那条新分支**走不到** | 3 阶位写 `[5, 6]`：5/6 阶**任意一格**有自选 ⇒ 该格作废（不进商店、不进卡池、不参战），页面同时标「无效」 |
| ★★ **提示**（v1.3.1 新增）`diy.slots[id].voidedNote` | 官方**没有任何 slot** 写这个键 ⇒ 读取器恒为 `null`，小圈的文案 / 样式 / 中性挂点**一个都不生效**（页面与加这条缝之前逐节点相同） | 3 阶位写 `{enabled, text, style}`：栏标题右侧小圈说这句提示、穿这身皮肤；Mod 的 `client/**` 再用挂点叠气泡材质与动效（见下面 §4.9 的「三层分工」） |
| ★ **干员记录校验**（`server/mods/loader.js validateChessRecord`） | 自选位记录**按 `diy.slots` 判**：成员只需 `isDiy: true`，跳过 `profession` / `stats`（它们由被选中的干员在运行期提供，官方那 8 条记录自己就是 `profession:null` + `stats:null`） | 同上；**不装 Mod ⇒ `diy.slots` 只有官方 4 键 ⇒ 任何记录都走旧的严格分支，逐字相同** |
| 头部计数器 `已选 n / N` | `N = diySlotList(diyData()).length`（官方 4），`n` 数的是存档里的 picks | 5（分母随数据的槽位数）；`n` 只数**当前数据里真实存在的槽位** ⇒ 老存档里「已经不存在的那一格」不再算一个自选名额（服务器同样会丢掉它） |

> ★ **为什么干员记录校验也算这条接缝的一部分**：`validateChessRecord` 原先对**任何** `isDiy: true` 的记录直接判 error
> （外加强制 `profession` 合法 + `stats` 是对象），而官方 4 个自选位的 8 条记录**天生就是** `profession: null` + `stats: null`
> + `isDiy: true` —— 实测（`<开发期报告>/20-validator-probe.mjs`）官方自己那 8 条在该校验下**每条 3 errors**。
> 也就是说：**在看这条接缝之前，任何 L2 补丁都不可能新增自选位**（Mod 会被整体跳过）。判据取 `diy.slots`
> 而不是「id 长什么样」或「`isDiy` 自证」，是为了保住原来那条防线：`isDiy: true` 却不在 `diy.slots` 里的**半成品记录**
> 仍然判 error（它会被 `visibleChess` / `checkNotOwned` / `loadoutRecord` 静默踢出商店，正是原校验要防的），
> 而 `diy.slots` 里的记录少了 `isDiy: true` 也判 error（`shared/diy.js diyRecordOf` 唯一的守卫就是它）。

**Mod 侧只需两条 L2 补丁**（`data/chess.json` 加 `_a`/`_b` 两条记录 + `data/backups.json` 加 `diy.slots` 两条），
零代码、零美术。样板见 `mods/cyanfish.diy-34/`（`README.md` 逐字段说明了每个字段意味着什么、平衡旋钮在哪）。

**★ v1.1.0 起同一条接缝还管「作废」**（2026-10-10，服主「diy-34 平衡性改造」；样板仍是 `mods/cyanfish.diy-34/`）：

`diy.slots[slotId].voidedByTiers`（可选，整数数组）= 「**这些阶里任意一格被填了自选，本格就作废**」。
读它的是两条纯函数（`shared/diy.js`）：

| 函数 | 语义 |
|---|---|
| `diyVoidedByTiers(data, slotId)` | 该 slot 声明的阶（升序去重）；没写 / 非法 ⇒ `[]` |
| `diyVoidedSlots(data, picks)` | `picks`（`{slotId: pick}`）里**被判作废**的 slot id：自己名叫 `voidedByTiers` 的列表里、有另一个**已填**的 slot 属于其中某一阶。数据里没有的 slot、`null` 的格一律不作废 |

**两个读取点（必须一致，且都只读数据）**：

1. **服务端卡池闸门 `shared/protocol.js checkDiyPicks`** —— 在逐格校验**之前**先把作废格扣掉（计入 `dropped`），
   再走原来的 `validateDiyPicks` 增量流程。**为什么必须在循环之前**：`diySlotIds` 是升序，低阶位先被校验；
   若等它进了 `kept` 再回头删，同一个 owned 干员先占作废格时会**连带**把高阶位那条判冲突（`an owned operator
   fills one slot`），玩家会白丢一格。`PlayerState.setDiy`（→ `diyStock` → 商店抽取）读的就是它的结果。
2. **`shared/diy.js validateDiyPicks`** —— 同样把作废格**当空位**（不参与校验、不进结果、**不报错**）。
   `test/diy.test.js` 的官方用例直接调它。

**客户端**读的是同一批函数（`public/js/screens/loadout.js` 的 `diyVoidedSlots` + `sanitizeDiyPicks`）：
`DiyPanel` 的 `voided` 参数（缺省 `[]`）把作废格标成「无效」并写出原因，玩家在页面上去掉 5/6 阶自选**立刻**恢复。
⇒ 页面显示与服务器卡池由**同一份数据 + 同一对函数**决定，不存在两端漂移。

**四条纪律**：

1. **不许在基座里写 `if (tier === 3)` / 改 `DIY_TIERS` 的值。** 想加阶就**只加数据**；
   `DIY_TIERS` 留着是为了让「官方口径」有一个可读的落点（`test/diy.test.js` 钉着 `[5, 6]`），
   谁把它当闸门，谁就把「加阶」重新变成「改基座」。
2. **`shopLevel` 与 `requirement` 由数据说了算。** `requirement` 是**候选池口径**（`TIER_6` = 沿用官方
   「持有的 6★ + 原型干员」），不是阶数；新阶想换候选池才动它（那不是本接缝的事）。
3. **`identifier` 全表唯一、`shopSortId` 是「每阶内排序」。** 新增干员记录照旧走 §3.7 的记录校验 +
   §2.4 的 id/identifier 约定；`shopSortId` 惯例是「排在该阶现有最大值之后」，同一自选位的 `_a`/`_b` **共用**同一个值。
4. **顺序 = 阶升序，由基座一处保证。** 页面分段读的就是 `diySlotIds`；**不要**去改
   `public/js/screens/diy.js` 的排序逻辑（那会把「一处数据源」变成两处，两端又会漂移）。
5. **作废规则也只能由数据说。** 想「低阶护航位让位给高阶」就在**那个 slot** 的数据里写 `voidedByTiers`，
   **不要**在基座里按 id / 阶数写判断；写名字里的阶数字也必须**同时**列进数组（基座只认数组里的数）。
   ★ **删一个自选位 = 从 `diy.slots` 里删键**（外加删掉它的 `chess.json` 两条记录与 `prototypes` / `locked` 表）；
   已经在玩家存档里的旧选择**不需要**任何迁移代码：它不是本份数据的 slot ⇒ `diySlotIds` / `checkDiyPicks` /
   `diyRecord` 三处都不认它，服务器不会把它加进卡池（`cyanfish.diy-34` v1.1.0 删 4 阶位就是这么做的，
   证据见 `<开发期报告>/41-02-legacy.mjs`：同一份老存档在 v1.0.0 数据上会拿到 16 份库存并刷出那名干员，
   在 v1.1.0 数据上 `dropped` 且库存/商店里都没有）。

**「不装 Mod 为什么逐字节等价」**：`diyTiersOf` 从**同一份** `diy.slots` 里读阶，
官方数据的 `diy.slots` 恰好只有 5 / 6 ⇒ 闸门对 5 / 6 放行、对其余阶一律 `[]`，与 `DIY_TIERS.includes(tier)` **逐值相同**；
`diySlotIds` 的 (tier, id) 升序在官方数据上**不改变任何一项的位置**（原本就是 5 阶在前）⇒ 函数返回值与改动前
`Object.keys(diy.slots)` **逐元素相同**。两条都只依赖**已有数据**，不引入任何新的默认值。
★ **作废那条同理**：官方**没有任何一个 slot** 写 `voidedByTiers` ⇒ `diyVoidedByTiers` / `diyVoidedSlots` 恒为 `[]`，
`validateDiyPicks` 的 `if (voided.has(slotId)) continue;` 与 `checkDiyPicks` 的 `if (voided.has(slotId)) { dropped++; continue; }`
**一次也进不去**，循环体与改动前逐字相同；客户端 `DiyPanel` 的 `voided` 缺省 `[]`（渲染不变）。
`<开发期报告>/41-06-nomod.mjs` 在官方数据上把这三条逐值比对过（`diyPool` 8 阶 × 5 种 kitted = 40 组）。

**★★ v1.3.1 起同一条接缝还管「小圈说什么、长什么样」**（2026-10-12，工序 113，服主口径：
「不装载该 Mod 时原游戏完全无影响」+「更新 0.2.5 等后续版本时本 Mod 只需小修改 / 无修改」）：

**要解决的问题**：那句常态说明原先**硬编码在基座**（`public/js/screens/diy.js` 的
`t('选择 {tiers} 阶干员后，本项不生效')`），还占了 **5 个语言包各一条 msgid**。于是「换个说法 / 换个警告风格」
= 改基座 + 改 5 个语言包，而且**每次平台升级重缝都要接同一处的 i18n 键冲突** —— 与「Mod 化而非改原版」（§4.6）
正好相反：连**文案**都写进了基座。⇒ 把它也变成**数据说了算**。

**接缝的形状**（`diy.slots[slotId].voidedNote`，可选）：

| 字段 | 类型 | 语义 | 缺了会怎样 |
|---|---|---|---|
| `enabled` | `true`（**必须严格等于 `true`**） | 显式开关。写 `1` / `"true"` / 不写 ⇒ 整个键不生效 | 走基座原来那条路径 |
| `text` | 非空字符串 | 小圈与它的 `data-tip` / `aria-label` 的**原文**。允许内嵌换行（气泡用 `white-space: pre-line`） | 同上 |
| `style` | 对象（可选） | **追加**在小圈骨架内联样式之后的 CSS 声明；键须匹配 `^[a-z-]+$`（含 `--*`），值须是字符串或数字，坏键/坏值**逐个丢弃** | 只有骨架（与不装 Mod 时同一个字符串） |

**三层分工**（为什么是三层而不是一层）：

1. **骨架（基座，中性）**：尺寸 `max(.17rem,11px)`、`position:relative`、气泡的定位与 `::after`
   （`content:attr(data-tip)`）、`tabindex="0"` + `aria-label`、气泡宽 `3.1rem`、文字跟 `var(--t)`。
   **基座里没有 Mod 的任何一个颜色值，也没有 Mod 的那句话。**
2. **皮肤（Mod 数据，`style`）**：颜色 / 圆角 / 描边 / 发光这类**内联样式能表达**的声明。
3. **特效（Mod 客户端，`client/**`）**：气泡材质、`hover`/`focus` 两态、`@keyframes`、`prefers-reduced-motion`
   降级 —— 这些**内联样式表达不了**，必须由 Mod 自己注入一份 CSS（`cyanfish.diy-34` v1.3.1 起第一次有 `client/`）。
   ★ 基座为此挂了一个**中性空属性** `data-sp-diy-note`（基座自己不读它）：Mod 用
   `[data-sp-diy-note]` 选择器叠加，**不必去猜基座的类名**（类名是宿主实现细节，改版就断）。

**读取点（一个纯函数，基座里唯一读这个键的地方）**：

| 函数 | 语义 |
|---|---|
| `voidedNoteOf(data, slotId)`（`public/js/screens/diy.js`，**已导出**给测试用） | 返回 `{ text, style }`；键缺失 / `enabled !== true` / `text` 不是非空字符串 ⇒ `null`；`style` 只收合法声明（空表 ⇒ `''`） |

**★ i18n 口径**：数据给了 `text` 就**照原文渲染**（多语言由 Mod 自己负责，基座不替它拼阶数）；
没给才回落到基座那句 `t('选择 {tiers} 阶干员后，本项不生效')`。⇒ **基座对这句提示零新文案**，
平台升级时不需要再动 `public/i18n/**`。

**「不装 Mod 为什么逐字节等价」**：
① `voidedNoteOf` 对官方数据恒为 `null`（官方**没有任何 slot** 写 `voidedNote`）；
② `null` ⇒ 文案走原来那句 `t(...)`、`style` 就是原来那一整串（**一个字符都不多**）、
   `data-sp-diy-note=${marker ? '' : undefined}` 渲染成 `undefined` ⇒ **属性不落 DOM**；
③ `DIYTIp_CSS` 里新增的那一条是 `.diy-tier-note[data-sp-diy-note]::after`（`pre-line` + 气泡下移 `8px`）——
   **只在挂点存在时命中**，官方页面一个节点都没有这个属性 ⇒ 那条规则一次都不会命中；
④ Mod 的 `client/**` 没装就不会被请求（宿主只 import 有 `client/index.js` 的已启用 Mod）。
⇒ 官方页面 = 加这条缝之前**逐节点、逐属性、逐字符**相同（判据见 `test/ui/49-verify-3-diy.test.js` 的
「③-113 缝的回落」一节，与 `<开发期报告>/113-*.md` 的差分取证）。

★ **工序 117（2026-10-12）· 这段 CSS 的中文注释已挪出模板字面量（`diy.js` 的 `DIYTIP_CSS`）**：
工序 113 把「这一条为什么独立成一条」的 5 行说明**写在了模板字面量内部**（当成 CSS 注释注入）——
模板正文里有中文 ⇒ `tools/i18n.mjs` 把整条模板判成"未包裹的中文 UI 文案"（`test/i18n.test.js:135` 那条红，
`line` 取模板起始行）。现在这 5 行的**内容一字不减**地移到了 `const DIYTIP_CSS` 上方那段 JSDoc 里
（并补一句"中文注释不许写回模板里"的理由：既会被 i18n 扫描器报出来、又离反引号截断只差一个字符），
**模板里只剩 CSS** ⇒ 扫描器 `literals=[]`，结构性消失（以后再往这段 CSS 写中文也不会复发）。
★ **规则一个字节都没变**：真机取证（`<开发期报告>/117-run/117-diy-probe-{before,after}.txt`，
起 3485 本地实例、进自选编排页、`document.styleSheets` 里该 sheet）两态都是 **4 条 `CSSStyleRule`**、
逐条 `cssText` 相同、**去掉注释后的 CSS 正文 sha256 都是 `e622d17cfc…a7b8`**（注入的 `<style>` 文本只是
少了那 5 行注释：1488 → 838 字节）；小圈形状（`role="img"` / `tabindex="0"` / `aria-label` / `data-tip`）与
挂了 `data-sp-diy-note` 时的 `white-space: pre-line` + `top: 8px` 也逐值相同。

**★ 与前一条（作废）互不绑定**：`voidedByTiers` 管「**哪几阶**有小圈」，`voidedNote` 管「小圈**说什么**」。
两个键各自可选 ⇒ 只写前者 = 老行为（说基座那句话），只写后者 = 不渲染（因为没有阶触发）。

---

### 4.10 ★ 战斗机制接缝：`mechanics`（`data/backups.json`）

> ★★ **2026-10-10（工序 54）撤销登记**：本节原来还登记了**第三条接缝** —— 特质自己数据上的一枚旗标
> `bb.doll_swap_deploy`（`data/garrisons.json` 的 `<garrisonId>.bb.doll_swap_deploy`，由基座
> `server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart` 安装器读；「写了旗标的特质实例在
> 傀儡师 `<本体> ⇄ <替身>` 切换时也按『部署时』结算一次」，`cyanfish.fix-operator` 的 `fartooth-dollswap` 打开它）。
> **该接缝已整体撤销**，理由与处置如下（判定依据：`<开发期报告>/53-upstream-023-recon.md` §5.1 + `53h-garrisons.diff`）：
>
> | 项 | 内容 |
> |---|---|
> | **为什么撤** | 上游 **0.2.3** 自己在**同一个安装器函数**（`act2autochess_gar_event_onstart`）里、按**同一对** `garrison_108_a` / `garrison_108_b`、用**同一个** `battle.on('dollSwap', …) → fireGain(battle, it)` 实现了同一条（**GitHub #415 / PR #429**，附 7 条回归用例 `test/content/fartooth-doll-swap.test.js`；`docs/history/0.2.3.md` §28.5）。两边并存 ⇒ 傀儡师换体 `fireGain` **两次** ⇒ 远牙叠层翻倍 |
> | **撤了什么** | ① `cyanfish.fix-operator` 的 `FIXES.fartooth-dollswap`：`enabled: false`、`upstreamFixedIn: '0.2.3（#415 / PR #429）'`；② `mods/cyanfish.fix-operator/data/garrisons.json` **删除**（`data/` 目录随之消失 ⇒ 该 Mod **不再有 L2 轴**）；③ 基座 `server/sim/content/garrisons/battle.js` 的那段接缝**移除** —— 该文件回到与 `<官方源码参照>/v0.2.3` 对应文件**逐字节相同**（sha256 `0dbb5f8617cf0c9ebf85ec44acd4c0fec02e480bfe44d244474fd5271bcd1a7d`；0.2.2 基座上是 `578f1e4a…7231`），**退出我们的覆盖层** |
> | **现在的等价性** | 该文件与上游 0.2.3 **逐字节相同**、不含任何本项代码路径、也不再读 `bb.doll_swap_deploy` ⇒ 「装 / 不装 `cyanfish.fix-operator`」在 0.2.3 上都与**纯净上游 0.2.3 逐值相同**（傀儡师换体**会**触发远牙的 `<部署时>` 叠层 —— 这是**上游 0.2.3 的内建行为**，与本 Mod 无关；两边并存才会 `fireGain` 两次） |
> | **证据与回归** | `<开发期报告>/54-stage0-dollswap.md`；`test/content/audit-indom-deploy-triggers.test.js` 那条用例已由「【接缝开】换体也算一次」改写为「**把旗标写回数据也不再生效**」的护栏用例；`test/content/mechanics-seam-mods.test.js` 改为断言「官方数据无旗标 + 本 Mod 无 `data/`」 |
>
> ★ 下面这条 `mechanics`（`data/backups.json`）接缝**不受影响**，仍然只有两个开关。

> ★★ **2026-10-12（工序 host-006）追加登记：本 Mod 新增的 `leader-erosion` 项走的是 L3，不是接缝。**
> 服主裁定「A 做，领袖能吃别的损伤凭什么侵蚀损伤不吃」⇒ 要修掉「官方贴士写『最终攻势中，敌方领袖不会受到侵蚀损伤』，
> 而同一批领袖对灼燃 / 神经 / 凋亡 / 坏死照常吃」这个**不一致**（**有意偏离官方贴士**）。
> 实现落在 `mods/cyanfish.fix-mechanism/content/index.js`（包 `battle.emit`，在基座那条免疫钩子**写 `cancel` 之前**
> 把 `dmg.cancel` 换成 setter 为空的访问器，事件结束后把原描述符装回去）—— 与 `fix-targeting` / `fix-egir-bond` /
> `fix-thorn2-stack` 同属 **§5.8「第五种 Mod 形态：包装 battle 实例方法」**。
> **为什么这里不新增接缝**：本条判据是 `target.isBoss`（不是任何可配置的参数），开关就是「装不装这个 Mod」，
> 而 L3 的 `addInstall(fn)` 本来就是平台给 Mod 的包装出口 ⇒ 加一条 base 接缝只会多一份等价性举证负担、收益为零。
> 等价性：不装本 Mod 时 `MOD_INSTALLS` 为空（`server/sim/content/index.js:403`）⇒ 基座一行代码都不经过本项；
> 官方自带回归用例 `test/content/enemies_bosses.test.js:2367`（「最终攻势: leaders take no 侵蚀 (erosion) damage;
> other enemies do」）在**不装 Mod 时逐值不变**。回归用例：`test/mods/fix-mechanism-leader-erosion.test.js`（9 条）。

**要解决的问题**：有些「机制」的判据在基座代码里（`support.unitBonds` 的所属盟约清单、`gainLayers` 的上限键、
不屈的 `death` 触发面、特质的 `<部署时>` 挂点）。Mod 拿到的引擎句柄是 **ESM 命名空间**
（`server/sim/content/index.js` 的 `modHostApi`）—— 命名空间对象的绑定是**只读**的，
**包不了、也换不掉** `unitBonds` / `gainLayers`。⇒ 只能由基座留一条**中性数据缝**，Mod 用 L2 数据补丁把开关打开。

**接缝的形状**（2026-10-09 落地，随 `cyanfish.fix-mechanism`；★ 原来还随 `cyanfish.fix-operator`，见上面的撤销登记）：

| 接缝 | 读哪里 | 基座读取点 | 基座默认（**不装 Mod**） | 装 Mod 后 |
|---|---|---|---|---|
| `mechanics.bondCopyLayers` | `data/backups.json` 的 `mechanics`（`server/sim/mechanics.js` 归一化） | ① `server/sim/content/support/index.js` `unitBonds` ② 同文件 `gainLayers` / `layersUsed` ③ `server/sim/content/support/meta.js` `withGrants` ④ `server/match/bondsMeta.js` `pieceBonds` ⑤ `public/js/ui/gameLogic/bonds.js` `grantedBonds` / `pieceBondIds` | `false`：四处清单**去重**（`!out.includes(...)`），上限键 `${capKey}\|${bondId}`（同一盟约**共用一份**预算） | `true`：清单保留重复条目；上限键 `${capKey}\|${bondId}#<第几份>`、`layersUsed` 各份求和；详情卡 / 弹窗 / 成员表**显示两份**。`cyanfish.fix-mechanism` 打开 |
| `mechanics.indomRaidSp` | 同上 | `server/sim/content/bonds/addon/battle.js` 的 `death` 钩子（tier 2 的 +5 技力那一支） | `false`：`raid`（突袭「保留技力立即再部署」的退场）既不 roll tier 1、也不补 +5 技力 | `true`：`raid` 的退场补一次 tier 2 的 +5 技力（作用面不变：只给该盟约**归属方**在场上、有技能的干员）；**仍然不**参与 tier 1 的 roll。`cyanfish.fix-mechanism` 打开 |
| ~~`bb.doll_swap_deploy`~~（**特质自身的数据**，不是 `mechanics` 里的名单） | ~~`data/garrisons.json` 的 `<garrisonId>.bb.doll_swap_deploy`~~ | ~~`server/sim/content/garrisons/battle.js` 的 `act2autochess_gar_event_onstart` 安装器~~ | ★★ **已撤销（工序 54，2026-10-10）**：接缝已从基座移除、`cyanfish.fix-operator/data/garrisons.json` 已删除 ⇒ **该文件与未加接缝的纯净上游 0.2.3 逐字节相同**，旗标写在哪都不会被读 | —（不再存在「装 Mod 后」这一列；能力由上游 **0.2.3** 内建，见上面的撤销登记） |

★ **（历史）第三个接缝为什么曾做成「特质自己数据上的一枚旗标」而不是一份全局名单**：名单写在**特质记录**里，
就天然是「**只影响这一条特质**」，不需要一个中心表，也不会在 Mod 之间抢同一路径；
`cyanfish.fix-mechanism`（`data/backups.json`）与 `cyanfish.fix-operator`（当年的 `data/garrisons.json`）**互不冲突**。
★ **那条旗标已在工序 54 撤除**（见上面的撤销登记）—— 结论：**它确实做到了「只影响那一条特质」，但没能避免
「与上游内建实现重复」**；上游 0.2.3 在同一函数里内建之后，唯一的干净解是撤缝而不是留缝。
★ `bondCopyLayers` **on** 时的一个连带面（诚实登记）：`server/match/bondsMeta.pieceBonds` 同时是准备期
`ctx.pieceBonds` 的实现（`server/match/effectsMeta.js:505`），它的一批道具 / 策略 meta 消费者
（`server/match/builtinMeta.js:73/103/150/169`）会按**条目**各付一次 —— 这正是「四个实现同时受控」的含义
（否则展示与后台会各说一套）。用 `new Set(...)` / `rollSameBond` 收口的几处（`server/sim/content/items/meta.js:93`、
`builtinMeta.js:143/195`）不受影响。**默认 off 时一条都不变。**

**★ 为什么接缝不放在 `data/config.json`**（两条以实际代码为准的理由）：

1. **浏览器读不到 `config.json`。** 客户端本地跑战斗（DESIGN §14；`public/js/battle/runner.js` 的 `loadBrowserSim`）
   只取 `SIM_DATA_FILES` 那 11 个文件：`chess, enemies, tokens, stages, waves, bonds, items, garrisons, bands,
   effects, **backups**` —— **不含 config**；而 `/data.js` 的浏览器替身（`server/http/static.js` 的 `DATA_SHIM_JS`）
   把基座 sim 的 `getData()` 接到 `/sim/simdata.js` 的 `getSimData()`（就是那 11 个文件）上。
   ⇒ 挂在 `config.json` 的开关在**浏览器 sim 里永远是缺省**，同一场战斗会算出两个结果（服务端拒收战报）。
2. **部署层不部署 `data/`。** `<开发期脚本>/deploy_base_024.py` 的 `SKIP_PREFIXES` 含 `data/`（逐字：`public/vendor/`、`public/fonts/`、`public/assets/`、`node_modules/`、`data/`、`mods/`、`.git/`）：线上 app 目录的
   `data/*.json` 是**官方整合包**那一份。⇒ 基座**不能**靠仓库 `data/` 里的默认值提供接缝（写了也上不了线，
   还会造成「本地有、线上没有」的分裂）。**接缝必须缺省即上游**，由 Mod 自己 `add` 进去
   —— 与 `cyanfish.max-seats` 往 `config.json` 里 `add coop` 完全同一个姿势。

**「不装 Mod 为什么逐字节等价」**：`server/sim/mechanics.js` 的缺省对象是
`{ bondCopyLayers: false, indomRaidSp: false }`，官方 `data/backups.json` **没有** `mechanics` 一节
（基座也**不**在 `data/**` 里写默认值）。两条默认分支与上游**逐行同义**：
`(keepCopies || !out.includes(...))` 在 `false` 时就是原来的写法；上限键 `perCopy ? \`…|${b}#${copy}\` : \`…|${b}\``
在 `false` 时逐字符等于旧键、`occ` 也不建；`layersUsed` 在 `false` 时就是上游那一行 `m.get(…|bondId) ?? 0`；
`if (raidSp && c.reason === 'raid') …` 在 `false` 时**永不执行**。复现脚本逐值比对见
`<开发期报告>/23-fix-mechanism-off.json` 对 `21-repro-before.json`：**`OFF == upstream ? true`**。
★ 原来这里还有第三条（`bb.doll_swap_deploy`）的等价性论述 —— **工序 54 起不再需要**：接缝已从基座整体移除，
`server/sim/content/garrisons/battle.js` 与 `<官方源码参照>/v0.2.3` 对应文件**逐字节相同**（sha256 `0dbb5f86…1a7d`），
等价性是**逐字节级**的，而不是「默认分支同义」级的。

**四条纪律**（与本文件其它接缝一致）：

1. **基座里不出现任何 Mod 的具体值**，只做「数据有没有 → 有就用、没有就用官方」。
2. **非法值一律回上游**：`bondCopyLayers` / `indomRaidSp` 只认 `=== true`（字符串 `"true"`、数字 `1` 都不算开）。
   （★ 工序 54 之前还有半句「旗标用 `S.num(...) > 0`（缺值 = 0 = 关）」—— 那条随 `bb.doll_swap_deploy` 一起撤除了。）
3. **两端各夹一次**：服务端是 `server/sim/mechanics.js`，客户端是 `public/js/ui/gameLogic/bonds.js` 里同义的
   `bondCopyLayersSeam()`（读**同一份**被补丁改写过的 `/data/backups.json`；两端口径由
   `test/content/morph-dual-bonds.test.js` + `test/ui/morph-bonds.test.js` 的对读断言钉住）。
4. **不许把「机制开关」与「成员人数」混在一起**：盟约人数永远按**干员**去重（`bondsMeta.membership` 的干员 Set、
   `rawCount` 的 `Set.size`、客户端成员行一行一个干员）—— 两条接缝都**没有**碰它们。

**取证**：`<开发期报告>/23-fix-mechanism.mjs`（真 sim + 真 Match 准备期 + **真 Mod 数据补丁**）、
`23-fix-mechanism.txt`、`23-fix-mechanism.md`；回归用例
`test/content/morph-dual-bonds.test.js`（off/on 两侧）、`test/content/mechanics-seam-mods.test.js`（真实补丁引擎；
★ 工序 54 起其中 `cyanfish.fix-operator` 那一支改为「无 `data/` 补丁」的护栏用例）、
`test/content/audit-indom-deploy-triggers.test.js`（★ 工序 54 起 `doll_swap_deploy` 那一支改为「旗标写回数据也无效」的
护栏用例）、`test/ui/morph-bonds.test.js`（客户端）。**撤缝取证**：`<开发期报告>/54-stage0-dollswap.md`。

### 4.11 ★ 测试服专用接缝：`config.debug`（局内调试控制台，`g.debug`）

**它管什么**：给**测试服**一个**类《杀戮尖塔》的局内调试控制台**的服务端那一半 —— 把「测试一件东西」从"手动刷商店 /
刷回合"变成一条命令。**15 个动作**（全部落在**引擎已有的**落地路径上；★ 前 12 个是工序 87 的，后 3 个是工序 115 的）：

| 动作 | 参数 | 落地路径（`文件:行`） | 生效范围 |
|---|---|---|---|
| `setRound` | `value` = 回合号 | `Match.startRound(n)`（`server/match/match/phases.js:255`）—— 重建本波、跑每人的 `onRoundStart`、`recompute` | 本局 |
| `setFunds` | `value` = 资金 | `ps.addFunds(n - ps.funds)`（`server/match/player/economy.js:12`）+ `recompute()` | 本人 |
| `setLp` | `value` = 目标生命 | 服务端权威字段 `ps.lp` + `dirty()` + `recompute()`（★ 引擎没有 setLp 入口；**淘汰判定仍归** `match/settle.js:76-83`） | 本人 |
| `addLayers` | `id` = 盟约 id，`value` = 层数 | `ps.addLayers(...)`（`player/economy.js:42`，自己夹 `BOND_LAYER_CAP` + `recompute` + `dispatch('onLayers')`） | 本人 |
| `grantChess` | `id` = 干员 id，`value` = 个数 | `ps.acquireChess(id)`（`player/acquire.js:39`）★ 内部 `poolOf(base).take` ⇒ **共享池账本守恒** | 本人 |
| `grantItem` | `id` = 装备 id，`value` = 个数 | `ps.acquireItem(id)`（`player/acquire.js:285`） | 本人 |
| `equipItem` | `id` = 装备 id，`value` = 目标单位 uid | `ps.acquireItem`（手上没有就先发一件）+ `ps.equip(...)`（`player/items.js:21`，含 `_gate` / 合并 / 满槽替换） | 本人 |
| `setWave` | `id` = 敌人 key，`value` = 个数 | `Match.debugSetWaveSpawns`（`server/match/match/combat.js`）—— 改 `this.wave.spawns`，`_normalOpts` 组的 spec 就是它 | 本局（**只这一波**，下一回合自动恢复官方波次） |
| `setEnemyScale` | `value` = 百分比（100 = ×1） | 每局 `GameData.debugScaleMul`（`server/match/gamedata.js` 的 `enemyScale(r)` 是唯一读它的地方）+ 重建本波 | 本局 |
| `rebuildWave` | 无 | 官方 `buildNormalWave`（`waves.js:367`）/ `_planBossWaves`（`phases.js:295`）—— `setWave` 的"撤销" | 本局 |
| `applyChoice` | `id` = 悬赏 / 战术决策卡 id | `applyCard(m, ps, card)`（`server/match/choices.js:446`）—— **与"玩家在悬赏回合选了那张卡"逐字同一条路**（`choice:<id>` 的 content handler 优先，否则家族默认） | 照官方：`team` 卡发给本人 + 所有存活队友；悬赏卡只给本人 |
| `clearChoice` | `id` = 卡 id（缺省 = 清掉全部调试卡） | 摘掉该卡的常驻 EffectRef（= `effectsMeta.ctx.removeEffect` 的同一件事）+ 悬赏条目 + 它带进来的布防设备别名，然后 `recompute()` | 同上（扫描所有玩家） |
| `setEnemyAttr` ★115 | `id` = `hp` / `atk` / `def` / `res` / `speed` / `aspd`，`value` = 千分比（`0` = 还原这一项） | 每局 `GameData.debugAttrMul`（`server/match/gamedata.js`，`enemyScale(r)` 是唯一读它的地方）+ 重建本波 | 本局（**绝对**倍率，替换该属性的有效值；对本波所有敌人生效） |
| `setLayers` ★115 | `id` = 盟约 id，`value` = 目标层数（`0` = 归零） | `ps.setLayers(...)`（`server/match/player/economy.js`）—— 与 `addLayers` **同一组副作用**（夹 `BOND_LAYER_CAP` + `recompute()` + `dispatch('onLayers')`），只把"只增"换成"设成给定值" | 本人 |
| `setWaveList` ★115 | `list` = `["<enemyKey>:<count>", …]` | `Match.debugSetWaveList`（`server/match/match/combat.js`）—— 与工序 87 的 `setWave` **同一段落点逻辑**（改 `this.wave.spawns`），同波可以有多种敌人 | 本局（**只这一波**，下一回合自动恢复官方波次） |

★ 1.4.1 的一处追加（不新增动作，只把既有动作的边界说准）：`DEBUG_LIMITS` 的 `maxCount` 天花板 20 → 200
（旧值会把数据里的 30 **静默夹掉** —— 见下面 config.json 样例之后的★★段）。
★★★★ **0.2.5 重缝口径变更（host-016）—— 上面那条 1.4.3 的"不吃库存"已按上游收敛：**

上游 0.2.5 的 `docs/history/0.2.5.md` **§30.1** 由维护者 2026-10-11 裁定：
「equipment from any source occupies stock … gifts still occupy stock, but **exhaustion must never prevent the gift**」，
并且**明确否掉了"非商店来源零占用"的模型**（原文 "The proposed PR's zero-occupancy model was **not adopted**"）。
豁免面只有 **5 个 `SERVER_GAIN_EQUIP` 固定赠品家族**（卡涅利安 / 蜜蜡 / 缪尔赛思 / 耶拉 / 诗怀雅）
**以及变形者集群发放的同一件**（`GameData.isUnlimitedGiftItem` + `requirePool: false`）。

⇒ **现行口径**（本树 = 0.2.5）：
- **每一件**产出的装备都照旧占 1 / 2 份（`piece.poolCopies = need(id)`，无条件）——包括超发的固定赠品；
- 能不能产出由 `canGain` 闸门决定，**只有固定赠品**能绕过它（`acquireItem` 的 `unlimitedGift`）；
- 因此 **`grantItem`（控制台，`source: 'debug'`）照旧吃商店份额、也会被库存挡住** —— 与 1.4.3 那句相反。
  `intents.js:_debugGrant` 一件都发不出去时回 `HAND_FULL + "debug: no room for the item"`（与"格子满"同一条，两个原因都不改账本）。

| 项 | 0.2.4 树（工序 118·服主特批） | **0.2.5 树（现行·上游口径）** |
|---|---|---|
| 占份额 | 只有商店购买（`STOCK_SOURCES = {'buy'}`） | **每一件都占**（`need(id)`） |
| 能否产出 | 只有商店购买过闸门 | **固定赠品**（5 家族 + 变形者集群）不过闸门 |
| 控制台 `grantItem` | 不吃库存、发得出去就发得出去 | **吃库存、会被挡住** |
| 依据 | 服主 2026-10-12 特批 | 维护者 2026-10-11（§30.1，有路标月报实证） |

★ **怎么切回服主一刀切口径（一行）**：`server/match/player/acquire.js` 里把
`const STOCK_SOURCES = new Set();` 改成 `new Set(['buy'])`，并把 `chargeStock` 恢复成
`STOCK_SOURCES.size > 0 ? STOCK_SOURCES.has(source) : !unlimitedGift`（现文件里就是这条式子），
再把 `newPiece(...)` 的 `poolCopies` 改成 `chargeStock ? need(itemId) : 0`。
★ 受影响的门禁：`test/match/shared-stock.test.js`（已直取官方 0.2.5 版）·
`test/match/debug-seam.test.js`（那一条已按新口径重钉）· `test/match/community-round30.test.js`（**官方新增**，正是为这条修复写的）。

**基座默认（= 不装 Mod 的服务器）**：`server/match/debug.js` 的

```js
export const DEBUG_DEFAULTS = Object.freeze({ enabled: false, actions: null, maxRound: null, maxFunds: null,
                                              maxLp: null, maxLayers: null, maxCount: null, enemyScaleOverride: null });
export function readDebug(config)      // config.debug 缺失 / 非法 / enabled !== true ⇒ 逐值等于 DEBUG_DEFAULTS，绝不抛
export function debugAllowed(match)    // match.loneHuman === true（开局恰好 1 个真人座位）
export function debugActionAllowed(debug, action)
export function debugEnemyScale(override, round)  // 纯读：override 为 null ⇒ null（调用点直接返回上游值）
```

`shared/protocol.js` 的 `C2S` 里有**一条** `'g.debug' { action, value?, id?, list? }`（协议层只做结构校验：`action` 非空短字符串、
`value` 是 `0..1e7` 的整数、`id` 是 ≤128 字符的非空串、`list` 是 ≤ `DEBUG_WAVE_MAX`（`shared/constants.js`）条
`"<enemyKey>:<count>"` 的字符串数组 ⇒ 不认识的动作名要能在意图层回一个**带 detail 的**
`WRONG_PHASE`，而不是 `BAD_MSG`）。`server/match/match/intents.js` 的 `case 'g.debug'` 是**双重闸门**（顺序有意）：

1. `if (!debugAllowed(this)) return fail(ERR.WRONG_PHASE, 'debug: not a lone-human match')` —— **仅单人 / 全 AI**
   （先例：`g.pause` 的 "solo matches only, co-op ⇒ WRONG_PHASE"）。`Match.loneHuman` 同时覆盖「solo 房」与
   「同盟房只有 1 名真人 + AI 队友」，**开局定格**、观战者不计入、掉线托管不改变它；
2. `if (!readDebug(this.gd.config).enabled) return fail(ERR.WRONG_PHASE, 'debug: config.debug.enabled is not true')`。

两个都过之后才看 ③ 动作名在 `actions` 白名单里、④ 每个动作自己的参数（`$optional: ['value','id','list']` 让"这个动作要不要
`value` / `id` / `list`"由意图层判：`setRound` 要 `value`、`grantChess` 要 `id` 不要 `value`、`rebuildWave` 三个都不要）。
`setRound` / `setWave` / `setWaveList` / `setEnemyScale` / `setEnemyAttr` / `rebuildWave` 只在 `PHASE.PREP` / `PHASE.ROUND_START`
允许（39 号报告 §8 第 6 条：COMBAT 中途强调 `startRound` 可能留下未取消的 field timer）。**绝不**绕过引擎的账本与闸门：发干员走
`SharedPool.take`、盟约走 `addLayers` / `setLayers`、装备走 `equip`、悬赏走 `applyCard`。唯一的直接赋值是 `ps.lp`（引擎里**没有**
任何 setLp 入口）· `GameData.debugScaleMul` / `GameData.debugAttrMul`（每局私有的两个调试格，见下）· `ps.layers[bondId]`
（在 `ps.setLayers` 里，与 `addLayers` 同一组副作用，见下）。

**★ 工序 87 新增的两条接缝**（都是"默认不存在 ⇒ 等于上游"的形状）：

1. **数据接缝 `config.debug.enemyScaleOverride`** —— 按回合的敌人属性加成覆盖：键是回合号字符串、`"*"` = 所有回合，
   值是 `{ hpMul, atkMul, speedMul }` 的**倍率**（与官方 `config.modes[*].enemyScale` 同义，不是"加多少"）。
   读它的是 `GameData.enemyScale(r)`（`server/match/gamedata.js`）：**缺省 ⇒ 直接 `return baseEnemyScale(r)`**
   （不做乘法、不加键）⇒ 9 个模式 × 15 回合**逐值等于上游**（取证 `87-run-seam.txt` 的 B1–B11）。表里写坏一个键
   只丢那一项。★ 它与 `config.coop` 的四张倍率表同构：**Mod 提供数据，基座留缝**。
2. **运行时格 `GameData.debugScaleMul`** —— `setEnemyScale` 的落点。**它住在这里是因为 `GameData` 是每局一个实例**
   （`server/match/Match.js:245`），所以不会漏到别的房间；`enemyScale(r)` 是唯一读它的地方，数据层与运行时**逐项相乘**。
   `setEnemyScale 100` 会把它设回 `null` ⇒ 又回到"直接 return 上游值"的那条路。

**★★ 工序 115 追加的三个动作 + 两处扩展**（同样的"默认不存在 ⇒ 等于上游"的形状）：

1. **运行时格 `GameData.debugAttrMul`** —— `setEnemyAttr` 的落点，形状 `{ hpMul?, atkMul?, defMul?, resMul?, speedMul?, aspdMul? }`。
   与 `debugScaleMul` 的**关键差别**：它是**绝对**倍率（面板上显示什么、敌人就吃那个数），在 `enemyScale(r)` 里**替换**
   该属性的有效值，而不是再乘一层 ⇒ 面板的「还原」= 删掉那一项 ⇒ 回到本回合官方值。**缺省（`null`）⇒ `enemyScale(r)`
   仍然直接 `return baseEnemyScale(r)`**，一个键都不多、一个数字都不变。
   ★ 官方回合表只有 `hp / atk / speed` 三档 ⇒ `defMul` / `resMul` / `aspdMul` 这三个键**只在被显式设过时才出现**在
   `enemyScale(r)` 的返回值里（`waves.js roundMods` 只在非 `null` 时透传），所以"默认等于上游"仍是结构性的。
   `aspdMul` 落在 `server/sim/battle/spawns.js` 的 spawn mods（`aspd: def.aspd × (m.aspdMul ?? 1)`，缺省 ×1 = 上游）；
   `def` / `res` / `speed` 本来就在 spawn mods 里（`defMul` / `resMul` / `speedMul`）。
   ★ 只改了**本波**的 spec：下一回合 `startRound` 整波重建时按新的加成算，覆盖本身仍在（和 `setEnemyScale` 一样）。
2. **只读读数 `m.public.debugScale`** —— `GameData.enemyScaleView(r)`，六个属性一个不缺 + `base`（本回合官方那一档）。
   **只在 `config.debug.enabled` 时**由 `Match.publicView()` 挂上去 ⇒ 不装 Mod 的房间里 `m.public` **逐键相同**。
   它是「强度」页的唯一数据来源（面板不自己算倍率，避免第二份真相）。
3. **`PlayerState.setLayers(bondId, n)`**（`server/match/player/economy.js`）—— 盟约层数的**绝对设置**（含归零）。
   为什么必须新开一条：官方只有 `addLayers`（`layerGainRoom` 只夹增益、只增不减）⇒ "归零 / 减层"在引擎里**没有**任何
   落地路径（本节旧版的「明确不做」就登记着这一条）。`setLayers` 复刻 `addLayers` 的**全部副作用**（夹 `BOND_LAYER_CAP`
   - `recompute()` + `dispatch('onLayers')`），只把"只增"换成"设成给定值"；`invariants.js` 只要求 `0 ≤ layers ≤ cap`
   且 `ps.bonds` 等于重算值（**不要求单调**），所以归零之后不变量照旧成立。上界 = `min(BOND_LAYER_CAP, config.debug.maxLayers)`。
4. **`g.debug.list`（协议层）** —— `setWaveList` 的整波敌人清单，`["<enemyKey>:<count>", …]`，条数上限
   `DEBUG_WAVE_MAX = 16`（`shared/constants.js`，两端共用）。**可选字段** ⇒ 其余 14 个动作不带它，线格式与工序 115 之前
   **逐字节相同**。落点 `Match.debugSetWaveList`（`server/match/match/combat.js`）与工序 87 的 `debugSetWaveSpawns`
   共用同一段逻辑（后者是 `[{ enemyKey, count }]` 的特例）⇒ 同波可以有多种敌人、逐条数量，空清单 = 这一波没有敌人。

**装 Mod 后**：Mod 用一条**纯数据**补丁开它（`mods/cyanfish.debug-console/data/config.json`）：

```json
{ "ops": [ { "op": "add", "path": "debug", "value": {
    "enabled": true,
    "actions": ["setRound", "setFunds", "setLp", "addLayers", "setLayers", "grantChess", "grantItem", "equipItem",
                "setWave", "setWaveList", "setEnemyScale", "setEnemyAttr", "rebuildWave", "applyChoice", "clearChoice"],
    "maxRound": 15, "maxFunds": 999, "maxLp": 99, "maxLayers": 999, "maxCount": 30 } } ] }
```

`enemyScaleOverride` **故意不写**（缺省 = 不覆盖 ⇒ 装了 Mod 也不改数值；要改由控制台的 `setEnemyScale` / `setEnemyAttr` 当场改）。
★ `maxLayers` 工序 115 起写成 999（= `BOND_LAYER_CAP`）：「盟约」页的 `MAX` 按钮送的就是这个上界；`maxCount` 从 10 放宽到 30
（「敌人」页的行内数量与 `+5` 按钮要能加到两位数）。

★★ **`DEBUG_LIMITS` 是「天花板」，必须高于数据 —— 工序 115 的 1.4.1 专门修过这条**（`115-debug-console-v140.md` §8）：

- `readDebug` 用 `posIntOrNull(数据, 天花板) = Math.min(数据, 天花板)` 归一化 ⇒ **数据超过天花板会被静默夹掉**。
  1.4.0 的数据把 `maxCount` 写成 30，而当时的天花板是 20 ⇒ 服务端实际按 **20** 算，而客户端读的是**原始合并 JSON**
  ⇒ 面板显示 30、输 30 被悄悄改成 20（用户看到的"敌人数量上限 20" **不是官方限制，是我们自己的防呆**）。
- 1.4.1 的修法：① `DEBUG_LIMITS.maxCount` **20 → 200**（与 `maxRound: 100`（数据 15）同一种量级 = 只防"数据写坏"）；
  ② 客户端 `FALLBACK.maxCount` 同步 200（契约：**哪一端的兜底都不许低于另一端会接受的值**）；
  ③ 加一条单测 `test/match/debug-seam.test.js` 的 **"数据 ≤ 天花板且逐值生效"**，把这类静默夹取永久钉死
  （新数据写超天花板 = 当场红，而不是上线后才发现）。
- ★★ 另外登记一条**引擎侧的规则**（工序 118 立的题，**0.2.5 重缝时按上游收敛**；**不是本接缝的行为**）：
  **官方共享装备库存怎么记账、谁能超发** —— 现行（0.2.5）口径 = 上游 `docs/history/0.2.5.md` **§30.1**：
  * 「equipment from any source occupies stock … gifts still occupy stock, but **exhaustion must never
    prevent the gift**」+「The proposed PR's **zero-occupancy model was not adopted**」。
  * `PlayerState.acquireItem` **无条件**写 `piece.poolCopies = need(id)`（普通 1 / 精锐 2）——
    **每一件**产出的装备都占份额，**包括超发的固定赠品**；
  * 能不能产出由闸门决定：`const unlimitedGift = !requirePool && gd.isUnlimitedGiftItem(itemId)`；
    **只有 5 个 `SERVER_GAIN_EQUIP` 固定赠品家族**（卡涅利安 / 蜜蜡 / 缪尔赛思 / 耶拉 / 诗怀雅）
    **+ 变形者集群发放的同一件**能绕过 `canGain`；其余来源（策略 / 效果 / 道具卡 / 盟约 / 复制 / **调试**）照旧受库存约束。
    ★ 注意：策略发放也传 `requirePool: false`，但它们**不在** `isUnlimitedGiftItem` 里 ⇒ 仍受库存约束
    （官方新增的 `test/match/community-round30.test.js` 第二条专门钉这一点，例：商业包装方案）。
  * `SharedItemPool` 保留工序 118 的**逐件记账骨架**：`copiesOf(piece)` = `piece.poolCopies`
    （缺失 ⇒ 回旧的 1/2 口径）+ `held()` 累加它 ⇒ 退还 / 出售 / 淘汰精确回到原来那几份。
    `_mergeItem` 把被吃掉几件的标记**相加**；`upgradeItem`（整备，由 `onBuy` 触发）写满 `need(gid)`。
  * 被修掉的恶性 bug（两边都修了）：策略「变形者集群」每 5 回合发一个「变形同构体」（6 阶只有 3 份）
    ⇒ 15 回合必顶满 ⇒ 之后商店 / 干员 / 机变全都发不出这件装备。
    ★ **官方 0.2.5 §30.1 明确把「变形者集群发放的同一件」列进了豁免面** ⇒ 这条 bug 上游已修。
  * 文档：`docs/design/match.md`（规则）+ `docs/history/0.2.4.md` §29.8.1（工序 118 的原始取证）
    + `docs/history/0.2.5.md` §30.1（**现行口径的第一手依据**）+ `docs/DATA.md` 的 `itemPoolCopies` 行；
    测试：`test/match/shared-stock.test.js`（**已直取官方 0.2.5 版**）+ 官方新增的
    `test/match/community-round30.test.js`（18 条，专为这条修复写的）；golden：**零移动**。
  * 与"非商店项（MAGIC / `shopExcluded`）"的关系：那些件本来 `itemPoolCopies()` 就返回 `null`（无份数上限），
    本条规则管的是**有份数的商店件**在**非豁免来源**下照旧记账、在**豁免来源**下可超发。
  * **干员那边一直是同一形状**：`acquireChess` 用 `take(..., { overdraw: true })`，效果里 `ctx.grantChess`
    还提供 `requirePool: false`（例：画卷 `chess_item_6_02_m` 复制干员时用它）⇒ 干员本来就"能超发"。
  * ★ **与 0.2.4 树的差别**（供溯源 / 回退）：0.2.4 树上是服主 2026-10-12 特批的一刀切口径
    `STOCK_SOURCES = new Set(['buy'])`（除商店购买外全部不占库存、也不被挡）。**本树已按上游收敛**；
    切回去的一行改法见本节上面的 ★★★★ 段。

面板本体是 L4：`mods/cyanfish.debug-console/client/index.js` 把入口注册进宿主插槽 **`game.cornerActions`**
（对局内左下角「设置 / 玩法说明 / 全屏」三个官方键的**右侧**，**不需要新插槽、宿主 0 改动**；v1.0.0 曾挂在
`settings.sections`，v1.1.0 起独立入口）。面板按**分类**组织（状态 / 基础 / 干员 / 装备 / 敌人 / 强度 / 盟约 / 悬赏），
干员 / 装备 / 敌人 / 盟约 / 悬赏条目都是**从 `/data/*.json` 现读的全量列表**（不硬编码任何一份清单），
数值有快捷档；危险动作走 `confirmDialog`；文案照 §4.12（短标签 ≤ 14 全角字、长说明收进「？」小圈、
**无英文 eyebrow / `micro`**）。★ 工序 115 的界面要点：**每一行的两个按钮直接发"普通 / 精锐"**（干员走 `_a` / `_b`，
装备同）；「敌人」页与「盟约」页的**顶部固定栏 + 行内点选**是同一个交互（先点一行选中，再用顶栏改）；「悬赏」页用
**开关**（宿主 `.set-toggle`）而不是"施加"按钮，且只列会给敌人 / 我方干员上**常驻**效果的战术卡（判据取自
`effects.json` 的 `buffs[]`；地图卡只在当前地图就是它改的那张时出现）。显示条件用与服务端**同口径**的
`m.public.players.filter(p => !p.isBot).length === 1`（只为了避免"按钮在但点了被拒"；**它不是权限** —— 手改 DOM
硬发请求照样被服务端拒）。
`action` 白名单是**白名单而不是黑名单**：数据写错 / 将来加动作时只会"少开一个"，不会"多开一个"。
★ 客户端那份 `hasAction` 与服务端 `debugActionAllowed` **口径逐字相同**：`actions` 缺失 / 空数组 ⇒ 一个动作都不显示
（fail-closed），**不许**反过来说"表为空 = 全放行"。

**「不装 Mod 为什么逐字节等价」**：

- 服务端：`config.debug` 不存在 ⇒ `readDebug` 返回冻结的 `DEBUG_DEFAULTS` ⇒ `g.debug` **一律 `WRONG_PHASE`**
  （detail = `config.debug.enabled is not true`），状态零变化；`enemyScale(r)` 直接返回上游值（B1/B2 逐值取证）。
  `test/match/fuzz.test.js` 也把 `g.debug` 纳入了随机意图：默认关时这一路永远走被拒分支。
  ★ 工序 115 之后这一条**仍然是结构性的**：`config.debug` 缺省 ⇒ `debugScaleMul === null`、`debugAttrMul === null`
  ⇒ `enemyScale(r)` 走 `if (!over && !live && !attr) return base`（**连 `out` 对象都不建**）；`publicView` 不挂
  `debugScale`；`debugSetWaveList` / `setLayers` 在闸门处就返回，一行都不执行。单测
  `test/match/debug-seam.test.js` 逐值比对 9 个模式 × 15 回合的 `enemyScale(r)` 与 `baseEnemyScale(r)`。
- 客户端：`game.cornerActions` 插槽为空 ⇒ 宿主 `UiSlot` 渲染 `null` ⇒ 左下角那一排按键的 DOM 逐字符不变
  （真机：装 Mod 实例摘掉控制台入口后 `.gm__corner` 与纯净实例**逐字符相同**，见 §取证）。

**★ 明确不做**（诚实登记）：

- **对局内干员血量**不在本接缝里 —— 那是**客户端权威**（`public/js/battle/runner.js`；服务端只在 `b.result` 里做区间
  校验），服务端改不动它。本接缝只动**目标生命 LP**（`ps.lp`）。★ 活着的玩家 `lp <= 0` 是**不变量违规**
  （`server/match/invariants.js:61`）⇒ `setLp` 的下界是 **1**，想淘汰只能让敌人漏进来。
- **盟约减层**：工序 115 起由 `setLayers` 提供（绝对设置，含 0）—— 旧版这条写着"引擎没有减层入口"，那是
  `addLayers` 的性质；新的入口不绕过账本（`recompute` + `onLayers` 一样走），但**只有调试动作能到它**。
- **`applyChoice` 的"立刻结算"部分不可撤销**：发装备 / 加层 / 加钱 / 免费刷新 / 发干员 / 改布防设备在官方语义里就是
  一次性的；`clearChoice` 只摘**常驻效果**（EffectRef）与悬赏条目 —— 面板的「？」里如实写明，不假装能回滚。
  ★ 工序 115 的「悬赏」页因此**只列常驻效果卡**（判据取自 `effects.json` 的 `buffs[]`，见下）。
- **`setWaveList` 只改"这一波"**：下一回合 `startRound` 整波重建 ⇒ 覆盖自动失效（要立刻还原按「还原本波」）。
  boss / 隐秘核心回合的波次来自 `_planBossWaves`，另有一套结构 ⇒ 与 `setWave` 一样只对**普通回合**可用。
- **按属性倍率不区分敌人**：`setEnemyAttr` 改的是**本波所有敌人**共用的那一档（`GameData.debugAttrMul` 是每局一格的
  状态，不是 per-spawn / per-enemy 的覆盖）—— 服主 2026-10-12 的口径就是这个（"当前阶段不做单独修改某种 / 某个敌人
  属性的方法"）。领袖单位另有一条官方规则（"领袖单位于服务器的生命值加成不受上述加成影响"）⇒ boss 回合的领袖只吃
  `atkMul` / `speedMul`（`waves.js` 的 boss 分支没动）。

**取证**：`<开发期报告>/40-debug-console-mvp.md`（MVP：服务端 71 项 + 浏览器实机 solo/coop/multi + 不装 Mod 的
逐字符对照）· **`<开发期报告>/87-debug-console-full.md`**（全量：服务端 150 项 `87-run-seam.txt`；浏览器实机
solo 47 / multi 14 / clean 10 项 `87-run-{solo,multi,clean}.txt` + 截图 `87-*.png`）· **`<开发期报告>/115-debug-console-v140.md`**
（工序 115：三条新动作 + 面板重做；单测 `test/match/debug-seam.test.js` 12 条，含"不装 Mod 逐值等于上游"）。
脚本：`<开发期脚本>/verify_debug_console_{seam,e2e}.mjs`（MVP，0.2.2 树）与
`verify_debug_console_{full,full_e2e}.mjs`（全量，0.2.3 树）。★ **部署纪律**：这个 Mod 工序 112 起**已在正式服**
（`LIVE_MODS_ENABLED`，见 `deploy_base_024.py`），测试服同样启用；旧口径的「只挂测试服 / 进 `LIVE_MODS_EXCLUDED`」
不再是现状。

### 4.12 ★★ Mod 注册内容规范（设置页控件 / 文案 / 受众）

**要解决的问题**（服主口径，issue 清单 v1.3「待更新⑥」）：`cyanfish.mod-settings` 让每个 Mod 往**同一页**
注册自己的栏位与控件，但**各 Mod 的页面文本与排版风格不一致**；而且**谁读哪一段文字**从来没有写清楚
（写给服主的、写给玩家的、写给开发者的混在一张卡里）。
⇒ 本节是**门禁级约定**：从本节起，新写 / 改写的设置栏位按它验收；存量 Mod 的整改走「待更新⑦」那一批。

**适用对象**：所有往设置页注册栏位的 Mod（**当前 2 家**：`skinvoice` / `announce`；提供外壳的是 `mod-settings` 自己，它不注册业务栏位）、
以及所有写管理页文案与**任何展示给玩家的文案**的 Mod。
> ★ 工序 106（2026-10-11）：本节原文写的是「当前 4 家：`skinvoice` / `dj-bgm` / `announce` / `dj-models`」。
> `dj-bgm` / `dj-models` 已从 `mods/` **移出并单独归档**（见 §12 的工序 106 说明）⇒ 这行改成现状的 2 家。

#### 4.12.1 控件层：注册写法与排版约定

**每个 Mod 一栏**：`register({ id, title, order, render })`（契约见 §4.8）。**一栏之内只放本 Mod 自己的参数**；
要第二栏就再 `register` 一次（**不同 id**；同 id = 就地覆盖，见 §4.8）。`title` ≤ 6 个全角字，与其它栏位并列。

| 语义 | 用什么 | 注册 / 排版约定 |
|---|---|---|
| 开关（布尔） | `button.set-toggle`（`role="switch"` + `aria-checked` + `.is-on`） | 一行一项；**开关的可见文字只有「开启 / 关闭」**，不要在开关里写选项名（名字在左边的短标签里） |
| 动作（按钮） | `Button` 组件（`variant="secondary" size="sm"`）| 动作行 = **短标签 + 按钮**；按钮文案 ≤ 6 字（「立即随机」「导出 JSON」「导入 JSON」「撤销」）。**一次点击只做一件事**；危险动作要 `confirmDialog` |
| 数值（连续） | `input.set-range`（`type="range"`）| 必须有 `min` / `max` / `step`，**并且把当前值渲染在行尾**（`.set-row__val num`）。`style="--pct:N%"` 控制填充长度 ⇒ 滑块**必须**是宿主那一套 class，否则观感立刻不一致 |
| 枚举（2~4 档） | `div.set-seg`（`role="radiogroup"`，每个 `button role="radio"`） | **每档 ≤ 2 个全角字**（宿主 `.set-seg button` 是 `min-width:.8rem` 且**不带 nowrap** ⇒ 3 个字起会在按钮内换行、被裁掉）。选项之和 ≤ 4 档；更多就用下拉 |
| 数值（离散 / 精确） | `input[type=number]` | 必须写清 **范围 + 步长 + 单位**（单位写在标签里或行尾读数里）；非数字 / 空输入**不许写进配置**、越界夹回范围 |
| 文本 / 长文 | `TextField`，或 `textarea` | 输入内容**不落进**共享数据（只在本机）；`maxLength` 必填；**不要**把富文本编辑器塞进设置行 |
| 文件 | 隐藏 `input[type=file]` + 一个按钮触发 | 文件名 / 大小在**同一行**回报；解析失败只 toast，不要弹整屏 |
| 下拉（超过 4 档 / 长清单） | 宿主 `select` 风格（`.lo-select` 那套） | 下拉**不承载说明**；说明走 §4.12.2 的「？」小圈 |

**排版四条**（判据是「肉眼一眼看不出这是两个 Mod 画的」）：

1. **一行一个控件**（`.set-row` 的三列 = 3.3rem 标签 / 1fr 控件 / auto 读数）。不要自造两列 / 三列布局。
2. **图标统一走标签**：`${iconVNode(html, '名字')}` 放标签最左；图标颜色 / 尺寸由宿主 `.set-row__label .icon` 定，别自己写。
3. **短标签不换行**：标签长了会**把行高撑起来**（宿主 `.set-row__label` 是 `minmax(0,3.3rem)` 的**一列**且
   `flex-wrap:wrap`，长标签在**列内**折行、不挤走控件列）—— 宁可缩短标签，说明放小圈。
   ★ **更正（工序 112）**：本节原文写的是「宿主 `.set-row__label` 是 `white-space:nowrap`」——
   实测（`public/css/screens/game.css:613-615`）**没有这条**，它只有 `flex-wrap:wrap`；
   结论（标签要短）不变，**判据换成上面这条**（换行 → 行高变、与相邻行的观感立刻不一致）。
4. **分组用中文小标题**（`.sp-sv__groupname` 那类），分组之间留一个 gap；**不要**用英文 eyebrow / `micro`（服主口径：一律清掉）。

#### 4.12.2 文案层（最关键）

**一、短标签**（设置行左边那句）

- **一行、能一眼看懂**，**≤ 14 个全角字**（实测本服最长的是「每局开始时随机」7 字、「同时播放上限」6 字）。
- 用**玩家的话**，不用代码词：写「同时播放上限」，不写 `maxConcurrent`；写「声道模式」，不写 `channel`。
- **兜底口径**：一段文字若 > 14 字，**不许**挤进标签 —— 拆成「短标签 + ？小圈」（下一条）。

**二、长说明一律收进「？」小圈**（点击 / 悬浮展开）

- **禁止**把长段落平铺在设置行里（`.set-hint` / `.micro` / 自造的 `.xxx__hint` 段落都算）。**唯一的例外**是
  **状态读数**：会随数据 / 状态变化的**短**实时值（例：`随机范围：… 173 名有时装可选的干员参与 …`）
  允许一行、`--text-dim`、≤ 40 个全角字，**且必须**带一个 `data-*` 标记便于取证（`skinvoice` 用 `data-sp-sv-randhint`）。
  状态读数与说明的分界：**读数会变**（人数、帧数、版本），**说明不会变**（这个开关是什么）。
- 小圈实现：`HintDot({ html, text })` ——**规范形状**（照抄这一行，一个字别改）：

  ```js
  html`<span class="sp-sv__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`
  ```

  - `.sp-sv__info` 是**纯 CSS 弹出**（`::after { content: attr(data-tip) }`，hover / `:focus` 才出）；
    `tabindex="0"` 让**触屏点一下也能看**（点一下就 focus ⇒ `:focus::after` 弹出来；没有 hover 的环境里
    原生 `title` 本来也没有显示时机）。
  - ★★ **2026-10-10（工序 52）从规范形状里删掉了原生 `title`**（原形状是 `aria-label title data-tip` 三个属性
    逐字相同）。**病因**：`title` 与 `data-tip` 同时存在 ⇒ 浏览器悬停弹**原生气泡**（白底黑字、样式不可控）、
    我们的 `::after` 弹**自有面板**，**两套框重合**（服主口径「diy-34 的带圈感叹号悬停时两套文本框重合」）。
    ⇒ **纪律**：**任何带自有气泡（`data-tip` / `.tooltip` / 宿主 `ui.Tooltip`）的元素，一律不许再设原生 `title`。**
    无障碍与触屏由 `aria-label` + `tabindex="0"` + `:focus::after` 承担；**代价**（诚实登记）：桌面端**长按**
    也看不到原生气泡了 —— 但自有气泡悬停即出，这一条不影响任何一条真实使用路径。
  - **样式口径**（与宿主 `public/js/ui/components.js` 的 `.tooltip` 同观感）：
    圆形 `.17rem` / 描边 `--line-3` / `border-radius:50%` / `cursor:help`；hover 与 focus 时描边 `--mint-500`、文字 `--mint-400`；
    弹出面板 `--bg-2` 底 + `--line-2` 描边 + 2px 圆角 + 深阴影，宽 `3.1rem`、`white-space:normal`。
  - **位置**：小圈只挂**短标签的最右**（`.set-row__label` 的最后一个子元素），**不要**单独成列、**不要**挂到控件或说明段落上
    （面板窄时标签列会换行，挂在控件旁会被挤出可视区）。
  - **文案**：≤ 160 个全角字；**一句一档 / 一句一义**，用 `。` 分隔；档位顺序与控件顺序一致；**不写实现细节**
    （不提变量名 / 定时器 / 文件路径 —— 那些写在代码注释与 README 里）。
  - ★ **宿主 `ui.Tooltip` 优先（0.2.2 起已暴露，服主已批准"加"）—— 但有一个实测出来的层叠限制**：宿主已把**它自己那套**
    悬浮提示（`public/js/ui/components.js` 的 `Tooltip` / `TooltipLayer`）暴露成 `ui.Tooltip` / `ui.TooltipLayer`（§6.2）。
    **只有一个 `Tooltip` 组件、没有 `TooltipLayer` 也照样能用** —— `TooltipLayer` 由宿主 `UiHosts` 常驻挂载。
    ★★ **限制（真机像素证据，工序 46）**：`TooltipLayer` 渲染在宿主 `.app-root` 里，而 `.app-root` 上有
    `isolation: isolate`（`public/css/theme.css:228`）⇒ 它在根层叠上下文里只是一个**没有 z-index 的**盒子；
    任何挂在 `<body>` 的**独立 Preact 根弹窗**（`mods/cyanfish.mod-settings` 的顶栏齿轮弹窗、skinvoice 的兜底面板
    都是这种）里的 `.modal` 带 `--z-modal: 80`，会**整块盖在 `.app-root` 之上** ⇒ `.tooltip`（`--z-tooltip: 95`，
    被困在 `.app-root` 内部）**画不出来**（`.app-root` **内部**的弹窗 —— 官方设置弹窗 `ui/settings.js` 的
    SettingsModal —— 不受影响，正常可见）。
    - ⇒ **用了它、又把内容画在"独立根弹窗"里的 Mod，必须在自己的弹窗子树里再渲染一份 `ui.TooltipLayer`**
      （这样它落在那个更高的层叠上下文里）。★ 这条路**没有实测过**，别照抄 —— 而且宿主那份 `TooltipLayer`
      仍在（同一个 tipState 会渲染两处），有"幽灵弹层"风险的场合要自己确认。
    - 参考实现（**已回滚、只作对照**）：`mods/cyanfish.skinvoice/client/panels.js` 的 `HintDot` 曾接过
      可选 `Tooltip` prop + `client/style.js` 的 `.sp-sv__info.is-host::after{content:none}`；
      **回滚的理由就是上面那条限制**（同一栏位既在官方设置弹窗里、也在独立根齿轮弹窗里）。
  - ★ **已知取舍（诚实登记，工序 46 已实测复现）**：**纯 CSS** 小圈**不做视口夹取** —— 标签列很长 / 面板很窄 /
    矮视口下把这一行滚到内容区顶边时，弹出面板的**顶**会被 overflow 祖先（宿主 `.modal__body` 是 `overflow:auto`）截掉。
    实测配方与两张同区域截图的像素比对见 `<开发期报告>/46-testid-tooltip.md` §②（380×420 视口下，
    兜底弹出框 `top=15` vs 祖先 `top=54` ⇒ 顶部被裁 39px；同一时刻宿主 `ui.Tooltip` 那条路四周仍在视口内）。
    **所以我们继续用纯 CSS 那份**：**长度上限依然是防裁的手段**。要走宿主那条路，先解决上面的层叠限制。

**三、「？」小圈的三条实现路线**（选用顺序）

| 路线 | 什么时候用 | 代价 |
|---|---|---|
| **纯 CSS 小圈**（`::after` + `data-tip`） | **默认**。设置行内、短说明 | 不做视口夹取；触屏靠 `tabindex` + `:focus` |
| **原生 `title`** | **只在"没有任何自有气泡"的普通元素上**当后备（例：按钮 / 图标键的短说明，见 §4.12.2 五） | **不许**单独撑场：触屏没有显示时机、样式不可控；★ 更**不许**与自有气泡并存（会重合，见上面那条纪律） |
| **宿主 `ui.Tooltip` / `TooltipLayer`** | ★ **已可用（0.2.2 起，服主批准"加"）** —— `ui` 句柄里有 `Tooltip`（`TooltipLayer` 由宿主 `UiHosts` 常驻挂载）。**首选**：一份实现到处用 + `fixed` + 视口夹取。★ **但只在 `.app-root` 内部的弹窗里可见**（独立 Preact 根弹窗里画不出来，见上面那条限制） | ① 老宿主 / 静态托管上没有这个成员 ⇒ 必须写**兜底**（上面的纯 CSS 小圈）；② 独立根弹窗里要在自己的子树里再渲染一份 `ui.TooltipLayer`（**未实测**） |
| **状态读数**（一行小字） | 会随数据变化的短实时值 | ≤ 40 全角字、`--text-dim`、带 `data-*`；**不许**变成第二段说明 |

**五、原生 `title` 的合法用途（工序 52 全库审计结论）**

- **宿主既有的做法**：`public/js/**` 里**约 200 处**普通元素（按钮 / 图标键 / 头像角标 / `<option>` / 商店卡角标 /
  血条 / 盟约条 / 结果页奖章）**只用原生 `title`、没有任何自有气泡**。它们**不算重合** ——
  只是观感与宿主 `ui.Tooltip` 不统一（**本工序不改**：那是宿主既有风格，量太大且不属于本条口径）。
  ⇒ **Mod 侧要把一个普通元素加提示时：先用宿主 `ui.Tooltip`**（`.app-root` 内部的界面里可见），
  老宿主没有该成员时退回**纯 CSS 小圈**（`data-tip`），**不要**再补一个原生 `title`。
- **判据表**（做一次自查）：`title` 与自有气泡**都有** ⇒ **重合，必须去掉 `title`**（本次修的那一类）；
  **只有 `title`** ⇒ 不算重合（但样式不统一，能换 `ui.Tooltip` 就换）；**只有自有气泡** ⇒ **正确**。
- 取证：`<开发期报告>/52-tooltip-audit.md`（真机逐页扫描 + 逐处清单）。

**四、★ 实时值与「过时文案」禁令**（服主口径「待修复⑨」）

- **不许**把**可配置 / 会变的值写死进任何**展示给玩家或服主的文案、日志、控制台、管理页。
  真值来源就是**宿主已有的那一个**，不要另造第二份真相（§4.6 纪律 1 的同一条道理）。
- 宿主侧现成的真值来源（用例）：

  | 事实 | 真值来源 | 谁在读 |
  |---|---|---|
  | 新房间的座位容量 | `config.coop.maxSeats`（合并后的 `/data/config.json`） | `server/index.js` → `Lobby.opts.maxSeats`；`/healthz.maxSeats`；公告 Mod 的 `{seats}` 占位符 |
  | 房主在房内可调的座位上限 | `readCoop(config).seatCeiling`（基座规范化出来的**函数值**，数据里**没有**这个键） | `room.state.seatMin / seatMax` → 等待室的人数选择器 |
  | 游戏版本号 | `shared/constants.js APP_VERSION`（= `package.json` 的 `version`） | 启动横幅、`/healthz.version`、`gameVersion` 门禁 |
  | 干员 / 时装 / 参战人数 | `/data/*.json` 与运行态（`room.state`、`m.public`） | 界面读它，**不要**在 Mod 里写死一份 |

- **文本占位符**：正文要引用这类数值时，写 `{名字}`，**在渲染那一刻**从数据取值替换。
  参考实现：`mods/cyanfish.announce/client/plan.js` 的 `fillParams` / `seatPhrase` / `readSeatInfo`
  （公告正文写 `（默认 {seats} 人；房主可在房间内把本房间调到最多 {ceiling} 人）`，渲染时变成
  「默认 9 人；房主可在房间内把本房间调到最多 12 人」——本工序实测截图见 `42-console-spec.md`）。
  数据缺失 / 非法 ⇒ `seatPhrase` 退化成**不带数字的中性话**（「默认人数由服务器配置决定」），**绝不**显示一个猜的数。
- 反例（本次修掉的那一处）：公告正文写死「默认 6 人」——真实上限是**可配置的**
  （`config.coop.maxSeats` 接缝 + `cyanfish.max-seats`；房主还能用 `room.setSeats` 改**本房间**）。
- ★ **只能早打印的场合**：启动横幅这类在数据就绪**之前**输出的行，**要么**延后到数据就绪之后再打
  （`server/index.js` 的 `[mods] …` 就是数据合并**之后**才打的），**要么**明说「默认值」并给出真值入口
  （例：`boot.js` 打的是 `APP_VERSION` 这个常量，而座位数从来不进启动横幅 —— 它由 `/healthz` 与等待室界面回答）。

#### 4.12.3 受众分层：写给**管理人员**的 vs 写给**玩家**的

**同一条信息不许两边都堆。** 判据一句话：**读的人要拿它做什么决定**。

| 受众 | 在哪读 | 该写什么 | 不该写什么 |
|---|---|---|---|
| **管理人员（服主 / 维护者，非开发）** | **Mod 管理页**（`tools/mod-admin.html`，走 `server/admin.js` 的 `/admin/api/snapshot`）：列表 = 每卡**一行** `summary`，展开 = `description`（`mod.json`） | ① 这个 Mod **干什么**（一句话）；② **基于哪个基座版本**；③ **上游是否已修**（修复型 Mod 必写，见 §5.8）；④ **开关默认值**；⑤ **依赖与风险**（会不会改数据 / 要不要重启 / 影响哪些模式）；⑥ `loadAfter` 这类顺序约束 | 玩家该知道的操作步骤（那是设置页的活）；实现细节；版本日志（另有入口，见 §4.12.5） |
| **玩家** | **设置页的一条目**（`settings.sections` 里那一栏）与**公告页的一条** | ① 这个开关**对他意味着什么**；② 他**会看到什么变化**；③ 怎么**撤回**（「撤销」「全部标记为已读」这类出口）；④ 该选哪一档（默认档说明） | 服主关心的部署 / 版本 / 上游修复状态；代码层实现；其它 Mod 的内情 |

两条硬约定：

1. **`summary` 是一行、≤ 50 字、一句话、不含细节**（管理页列表只显示它，见 §2.2 与 **§4.12.8** 的分工表与好/坏对照；★ 超了页面仍整行显示，但观感立刻变差；**只有缺 `summary` 时**才退化成 `description` 的第一句）。
2. **`description` 用换行分段**（管理页按原文换行渲染）：**第一段 = 干什么 + 默认值**，之后每段一个话题
   （依赖 / 风险 / 上游状态 / 怎么改回去）。**详情不是开发者日志**：写「读者要做决定所需的信息」，不是「我改了哪些行」。

#### 4.12.4 禁止清单（照服主原话）

- ✗ **不许把「每次给 AI 反馈的问题」全盘写进详情**（需求原话）。详情不是工作流水账；只留**对管理员和玩家有效**的信息。
- ✗ **不许把代码层实现细节全盘搬进详情** —— **仅在必须处**说明（例：「必须与 `X` 成对使用，否则少 4 倍」这种会影响
  服主决定的实现约束；「我把 `if (a)` 改成了 `if (a || b)`」不写）。
- ✗ **不许把版本更新日志混进功能说明** —— 另有专门入口（§4.12.5）。
- ✗ **不许把同一条信息同时堆在管理页与玩家页**（§4.12.3）。
- ✗ **不许把长说明平铺成设置行里的小字段落**（§4.12.2）；`micro` 英文副标题一律不要（§4.8 / §4.12.1 第 4 条）。
- ✗ **不许把可配置值写死**（§4.12.2 四）。
- ✗★ **不许在设置页摆没有真实生效配置的条目**（展示行 / 分隔行 / 占位旋钮 / 与别处重复的第二个控件 / "高级但没人会调"的实验项）—— **判据与自查表见 §4.12.8**。这是一条**门禁级**约定：**「把它从 A 调到 B，玩家会看到什么不同？」答不出具体一句 ⇒ 无效内容，删**（改成只读状态读数，或搬进 `README.md`）。

#### 4.12.5 版本更新日志入口（「待更新③」的前置约定）

| 项 | 约定 |
|---|---|
| **放哪** | `mods/<mod-id>/CHANGELOG.md`（**每个 Mod 自己目录里**，随包分发、与 `README.md` 并列） |
| **格式** | 每版一个 `## <version> — <YYYY-MM-DD>` 小标题（**新的在最上面**），其下 `-` 开头的一条一条；未发布的改动放最上面的 `## 未发布`；`version` 与 `mod.json` 的 `version` 逐字符一致 |
| **写什么** | **只写对读者有用的**：玩家会看到的变化 / 管理员要做的动作（要不要重启、要不要重载）。**一条一行、≤ 40 字**，一版通常 1~3 条 |
| **不写什么** | 内部重构与文件名、「每次给 AI 反馈的问题」、其他 Mod 的日志、与上一版无差别的重复句 |
| **谁读** | ① **管理页**的「版本更新日志」入口（「待更新③」要加的面板：读 `CHANGELOG.md` 的最近 N 版）——**尚未实现**；② **玩家**侧的公告（`cyanfish.announce` 的 `data/config.json`）是一条独立通道：公告 = 面向玩家的时间线，`CHANGELOG.md` = 按版本的完整记录。**同一件事只在一处详细写**，另一处一句话带过 |
| ★ 与 `mod.json` 的关系 | **`mod.json` 里不写更新日志**：`summary` / `description` 是**当前状态**的功能说明（§2.2），日志是**历史**。两者混写会让管理页列表又变成流水账 |

#### 4.12.6 示例（点名示范：`cyanfish.skinvoice` 的「声道模式」）

服主点名的例子：「皮肤与语音」的「声道模式」说明，规范前后应当像这样收进「？」小圈：

| | 改法 |
|---|---|
| **改前** | 设置行里只有短标签「声道模式」+ 三档，说明以小字平铺 / 或小圈文案混着实现词；同一栏另有长段小字（随机范围） |
| **改后** | 行里只剩 `声道模式` 四个字 + `ⓘ` 小圈 + `[全局][独立][叠加]`；小圈文案 = 99 个全角字、**一句一档**、零实现细节 |
| **实现** | `mods/cyanfish.skinvoice/client/section.js`（`CHANNEL_TIP` + `SetSeg` 的 `tip`）、`client/panels.js`（`HintDot` 规范形状）、`client/style.js`（`.sp-sv__info` 规范 CSS） |
| **判据** | 真机：悬浮 / 点一下小圈弹出，行高与其它设置行**逐值相同**；`?` 小圈数量 = 3（声道模式 / 素材上游 / 配置备份）；页面 0 异常 |

**取证**：`<开发期报告>/42-console-spec.md`（改前 / 改后截图 + DOM 逐项实测 + 真机控制台原文）。

★★ **历史说明（工序 48 / 51 / 55）**：示例里那个「声道模式」小圈**已经随那一组设置一起退场**（0.15.0 把语音播放整体交给官方，
见 `mods/cyanfish.skinvoice/CHANGELOG.md`）⇒ **这一小节现在只作「怎么写小圈」的范例**，字符串与实现路径都不在了。
那一栏现在的 `?` 小圈是 **3** 个：**每局开始时随机 / 素材上游 / 配置备份**（工序 51 按服主口径把「每局开始时随机」
的说明新增进小圈，同时删掉「立即随机」那一行右边的平铺小字）。
★ **工序 55（skinvoice 0.17.0）**：`panels.js` 的 `HintDot` 也按 §4.12.2 二那条纪律**删掉了原生 `title`**
（原先它被 §4.12 审计列为"已知例外、登记不改"）⇒ 本 Mod 的三个小圈此后与规范形状**逐字相同**；
同一次改动把「单干员语音语种」那条轴整体删除（上游 0.2.3 原生提供，见 `client/officialroute.js` 文件头）。
现行证据：`<开发期报告>/51-skinvoice-ui.md`、`<开发期报告>/55-stage0-voice-axis.md`。

★ **本节落地时没有新增任何宿主接缝**：小圈是 **Mod 自带**的（§4.12.2 三），宿主侧唯一想加的是
「把 `ui.Tooltip` 暴露给 Mod」这一条（见同一节的"三条实现路线"表）。
★★ **2026-10-10（工序 46）该条已由服主批准"加"并落地**：`public/js/ui/extensions.js` 的 `makeHostApi().ui`
现在多了 `Tooltip` / `TooltipLayer` 两个成员（**一行级纯加成**，见 §6.2）。★ 这条**没有**动 §4.12.1/§4.12.2 的
控件语义与文案口径，也**没有**动任何既有字段 —— 不装 / 不用它时宿主行为逐值不变（真机证据：一个最小 Mod 读到
`typeof ui.Tooltip === "function"`、既有字段齐全、`ui` 仍 frozen，且悬浮真的弹出宿主提示）。
★★ **但 `cyanfish.skinvoice` 的「？」小圈最后**没有**换成它**：真机像素级实测发现 `.tooltip` 画不到
**独立 Preact 根弹窗**之上（`.app-root` 的 `isolation:isolate` 把它困住了，详见 §4.12.2 二那条限制），
而那一栏位在官方设置弹窗与独立根齿轮弹窗里**都会**被渲染 ⇒ 换过去会变成"一处能弹、一处彻底不弹"。
⇒ 按"做不动就别硬改"的口径**回滚**，只把这条接缝与它的限制**登记在案**。
证据：`<开发期报告>/46-testid-tooltip.md`。

#### 4.12.7 ★★ 改宿主设置的**默认值**：判"玩家设过没有"的唯一姿势

**要解决的问题**（服主口径，issue 清单 v1.3「待修复⑧」）：「本 Mod 启用后，把官方『干员音效』的
**默认值**设为 0（初次进入网页端的玩家无需手动调整）」，而且**玩家手动调过就要尊重他**。
这是「默认值层面的改动」，比换一句文案难：写得不好会**每次加载都把玩家掰回 0**，
或者变成「界面显示 0.8、实际播 0」的假象。

**四条纪律**（参考实现：`mods/cyanfish.skinvoice/client/officialvoice.js`）：

1. **"设过没有"只能看宿主的存储形态，不许猜。** 宿主设置是**一个整体对象**
   （`sp.pref.settings`，见 `public/js/store.js` 的 `loadPref/savePref`；`ui/settings.js:31` 读它），
   而**首次打开页面时那个键根本不存在** —— `loadPref('settings', null)` 拿到 null ⇒ 走
   `ui/gameLogic/settings.js` 的 `DEFAULT_SETTINGS`（内存值），只有玩家**真的动过任何一个设置**时
   宿主自己的订阅者才 `savePref` 把它落盘。
   ⇒ 判据 = **那个键在不在**：不在 ⇒ 玩家从来没用过设置界面，可以按新默认值生效；存在 ⇒ 里面有一个
   玩家确认过的值，**尊重它**。
   ★ **反面**：先读合并后的配置（它永远带着默认值）去判"这是不是默认值"是**错的** ——
   分不出"默认 0.8"与"玩家自己选的 0.8"，会把真在意这一项的玩家静默改掉。
2. **生效必须落盘、且只有一条真相。** 写的时候走宿主**自己的**设置 API
   （`ui/settings.js` 的 `settingsStore.set({…})`；宿主设置弹窗用的是同一个），
   不要只写 localStorage 副本、也不要只调 `audio.setVolumes` ——
   前者界面读不到（显示 0.8 实际 0），后者不落盘（下次加载就丢）。
   ⇒ 内存、localStorage、界面三处由**同一个 API** 一起变。
3. **明确档位与"按默认"是两件事，不许合成一个布尔。** 至少三态：
   **按默认 / 明确要新值 / 跟随宿主原本的行为**。合成布尔会让"玩家明确要新值"在下一次加载时
   被"尊重玩家"的逻辑吃掉（= 静默失效）。
4. **判过一次就记住，并且要能还原。** 把"已经判过"与新默认值本身分开记（本 Mod 用
   `sp.pref.skinvoice.officialvoice` 存 `{ snapshot, chosen, lastWrote }`）；
   随后玩家自己把它调回去 ⇒ **不再掰**。还原走同一个设置 API 写回快照值，
   并在卸载（停用 Mod）时执行；标记一并清掉。
   ★ **写的时候先记账再写**：设置 store 的订阅者会**同步**回调（`public/js/store.js:38-42`），
   我们自己也订阅了同一个 store ⇒ 一次写入会回到自己的对账函数；
   若不先把"这个值是我写的"记下来，就会把**自己写的值**当成"玩家自己的偏好"存进快照，
   还原时把 0 写回去 —— 那是"没尊重玩家"的反向事故。所以对账函数还要带**重入保护**。

**★ 为什么不能"每次加载都强制 0"**：服主原话是「玩家**手动调过**（有自己的偏好）⇒ **尊重玩家**，
不许每次加载都强制回 0」。纪律 1 与 4 就是这句话的可执行形式。

**★ 与"同一功能在宿主已有档位"共存**（例：0.2.2 的 `voiceLang` cn/jp，**没有"关闭"档**）：
我们的默认值只改**音量**（`volumes.voice`），不改宿主那一轴自己的档位；
但要在文档里写清"音量 = 0 之后这一路由谁播"——**压掉宿主就必须自己播**，
否则整段变哑（宿主 `public/js/audio.js:907` 的 `voice()` 第一行就是
`volumes.voice <= 0 → return false`）。判"该谁播"要用**探针**（此刻音量是不是 0），
不要用配置项 —— 玩家把音量调回来时，探针立刻为假、权限立刻交还宿主。

#### 4.12.8 ★★ Mod 页面文案规范（分工 · 判据 · 反例；工序 108）

**要解决的问题**（服主口径）：不能像之前的 DJ mod 一样 ① **在设置注册页有大量的无效内容**、② **在 mod 管理页错误的把大量详情信息写在「功能简述」中**。
⇒ 本节是 §4.12 的**收口**：§4.12.1 管控件与排版、§4.12.2 管文案写法、§4.12.3 管受众分层、§4.12.4 管禁止清单，**本节管「哪一句话该放哪个字段」，并给出可判定的「有效 / 无效」标准**。
本节是**门禁级约定**：新写 / 改写的 Mod 文案按它验收；存量整改按 §4.12.8.5 的对照表逐条走。

##### 4.12.8.1 两条反例（**不许重犯**）

| # | 反例 | 证据 | 病在哪 |
|---|---|---|---|
| **①** | **设置注册页塞大量无效内容** | `cyanfish.dj-models` 往设置页注册了**一栏超大清单**：9 个分组开关 + 4 个旋转参数 + 界面三档 + 换面 + 换面死区 + 混乱模式 + 性能预算 + 「保护设置入口」兜底……（现已随该 Mod **移出归档**，见 §12 工序 106） | **多数条目对读者没有决策价值**：能调但调了看不出差别、"高级"旋钮、"总开关 + 每项同名开关"两处都能实现同一效果、长说明以小字**平铺**在设置行里 |
| **②** | **管理页把大量详情写进「功能简述」** | 同两个 Mod 的 `description` 分别 **1251 字** / **786 字**，且把分组清单、参数区间、两种旋转模式的取舍全铺在「当前状态的功能说明」里 | 列表那一行本该是**索引**，被当成了**说明书**；读者在扫列表时被迫读实现口径 |

★ **另有一条已被修正、但必须留作标本的反面例子**：`cyanfish.fix-egir-bond` 的 `summary` 曾经是
「修复【阿戈尔】盟约协防阶段不复活、吞噬链断链丢失数值的问题；**一并修复了**干员归溟幽灵鲨被击倒的问题」
—— **58 字、含分号、把两件事挤成一句**，正是「详情写进了功能简述」。它现在的文案是 **40 字、一件事一句话**：
「修复【阿戈尔】盟约协防阶段不复活、吞噬链断链丢失数值，并修归溟幽灵鲨被击倒的问题」。
⇒ **一句话**：**列表里那一行是"索引"，不是"说明书"。**

##### 4.12.8.2 分工表（谁读 · 放哪 · 多长 · 不许放什么）

| 字段 / 位置 | 谁读 | 该放什么 | 字数 / 格式 | **不许放什么** |
|---|---|---|---|---|
| ★ `mod.json` 的 **`summary`**（管理页列表**唯一的**那一行 = 「功能简述」） | 扫列表的服主（**停留 1~2 秒**） | **一句话**：这个 Mod **干什么**（必要时补一句"默认关 / 只在测试服"） | ★★ **≤ 50 字 · 一句话 · 不含细节**（软目标 ≤ 40 字）。**不换行、不用 `；`/`。` 分段、不带 Markdown 标记** | 实现细节 · 参数清单 · 依赖与风险 · 上游是否已修 · 版本日志 · **第二件事** |
| ★ `mod.json` 的 **`description`**（管理页「查看详情 ▾」里） | 服主 / 维护者在**做决定**前 | **换行分段**：**第 1 段 = 干什么 + 默认值**；之后**每段一个话题**（依赖 / 风险 / 上游状态 / 怎么改回去 / 要不要重启） | 段落化，**一段一话题** | 玩家操作步骤（→ 设置页）· 「我改了哪些行」的流水账 · 版本日志（→ §4.12.5 的 `CHANGELOG.md`）· 与 `summary` 重复的那一句 |
| `mods/<id>/README.md` | **作者与维护者** | 架构与实现、为什么这么写、已知坑、取证路径、怎么本地复现 | 不限，**可以长** | — |
| `mods/<id>/CHANGELOG.md` | 服主 + 玩家 | **按版本**的完整记录（格式见 §4.12.5） | **一条 ≤ 40 字**，一版 1~3 条 | 内部重构与文件名 · 「每次给 AI 反馈的问题」 · 与上一版无差别的重复句 |
| **设置页**（`config` 的 UI 元数据；经 `globalThis.__SP_MODSETTINGS__` 注册，见 §4.8 / §4.12.1） | **玩家** | ① 这个开关**对他意味着什么**；② 他会**看到什么变化**；③ 怎么**撤回**；④ 该选哪一档 | **行内只放短标签**（≤ 14 全角字）+ 控件 + 行尾读数；**长说明一律收进「？」小圈**（`HintDot`，≤ 160 全角字、一句一档、零实现细节） | ★ **没有真实生效配置的条目**（见 4.12.8.3）· 服主关心的部署 / 版本 / 上游修复状态 · 代码词（写「同时播放上限」不写 `maxConcurrent`）· 英文 eyebrow / `micro` 副标题 · 长段落平铺成设置行小字 |
| 玩家公告（`cyanfish.announce` 的 `data/config.json`） | **玩家** | 面向玩家的**时间线**，一件事一句话 | 要引用数值时**必须**用占位符（`{seats}` / `{ceiling}`），**渲染那一刻**取真值 | ★ **把可配置的值写死**（例：写死「默认 6 人」） |

**两条收口纪律**：① **同一条信息只在一个地方详细写**，另一处一句话带过（§4.12.3 / §4.12.5）；② **`summary` / `description` 只影响管理页与 CLI 展示**（`GET /mods` 不含它们，§2.2）⇒ **不用为"省载荷"而压缩，要为"省读者时间"而压缩**。

##### 4.12.8.3 ★「有效设置项 vs 无效内容」的判定标准

**一个条目可以出现在设置页，当且仅当三条同时成立**：

1. **有真实生效的配置**：它对应一个**真的被读**的键（`mod.json` 的 `config` / Mod 的 `data/config.json` / 本机 `sp.pref.*`）。**不是**展示行、分隔行、标题行。
2. **改变它会改变可观察的结果**：⇒ 自检问句 **「把它从 A 调到 B，玩家会看到什么不同？」** —— **答不出具体的一句 ⇒ 无效内容，删**。
3. **它有撤回路径**：能回到默认（关掉开关 / 「恢复默认」/ 「跟随官方」/ 撤销）。**只能开不能关**的条目不配上。

| 情况 | 判定 |
|---|---|
| 值被代码里某个分支 / 表查询真的读了，且改它可见地改变行为 | ✅ **有效** |
| 只是把一段说明 / 一个数字**摆出来**，没有可写的配置 | ❌ **无效** ⇒ 改成只读**状态读数**（短 · 会变 · 带 `data-*` 标记），或直接删 |
| 同一件事在**两处**各有一个"能实现同一效果"的控件（总开关 + 每项同名开关） | ❌ **重复** ⇒ 只留一处 |
| 默认档 = "和没装一样"，且**没有任何玩家会去改它** | ❌ **占位项** ⇒ 删（写进 `README.md` 即可） |
| 「高级 / 实验性」旋钮，但没有实测证据说明它值得暴露 | ❌ **删**（在报告里诚实登记为「没做的那部分」） |
| 会随状态变化的**短**实时值（人数 / 帧数 / 版本） | ✅ 一行、`--text-dim`、**≤ 40 全角字**、带一个 `data-*` 标记便于取证（§4.12.2 二） |
| 会变的值**写死**在文案里 | ❌ **禁止** ⇒ 用占位符渲染时取真值；取不到就退化成**不带数字的中性话**，**绝不**显示猜的数（§4.12.2 四） |

##### 4.12.8.4 好 / 坏对照（用本仓真实文案）

> ★ **历史基线说明**：下表第 1~3 行是**工序 108 当时**的坏文案（banner 74 字 / fix-enemy 67 字 / max-seats 66 字）；
> **这三个 `summary` 后来都已被改短**（现行 22 / 26 / 28 字，见本小节末尾的现状实测）⇒
> **表里的坏例只作「怎么把细节从列表那一行搬走」的判据，不是现存的待整改项**（现行 > 50 字 = **0 个**）。

| # | ❌ 坏 | ✅ 好 | 差在哪 |
|---|---|---|---|
| 1 | `cyanfish.banner`：**74 字**「首页一条静态横幅 + 对局内一条弹幕（同一份公告，飘过 / 半透明 / 点击穿透）；服主在 Mod 管理页发布与撤回，按持续时间到点自动消失」 | 建议：「服主发布的实时横幅公告，首页与对局内都会显示」 | 括号里的**实现口径**（半透明 / 点击穿透）是给维护者看的 ⇒ 搬 `description`；"发布与撤回"是管理页的活，不该占列表那一行 |
| 2 | `cyanfish.fix-enemy`：**67 字**，把**四项**修复逐项列进「功能简述」 | 建议：「敌人侧四项修复的合并包（每项一个开关，默认只开两项）」 | 四项清单是**详情**；列表那一行只回答"这是什么" |
| 3 | `cyanfish.max-seats`：**66 字**，把「人数上限 / AI 上限 / 牌库 / 装备库存 / 发卡数」五件事串成一句 | 建议：「让房主自行设定本房间的联机人数，并按人数自动适配各项数值」 | 前件是**主干**（留），后件那**五个名词**是实现清单 ⇒ 搬 `description` |
| 4 ✅ | — | `cyanfish.collab-six`：**30 字**「把 7 名联动六星做进 5/6 阶自选位（技能·天赋·模组）」 | 一句话里有"多少 / 在哪 / 含什么"，零实现细节 |
| 5 ✅ | — | `cyanfish.demo`：**39 字**「新增一名示例干员「隐现·改」—— 想自己写 Mod 的话，从这个包开始读最省事」 | 干什么 + 给谁用，正好压在一行内 |
| 6 ✅ | — | `cyanfish.diy-34`：**41 字**「自选编队平衡性改造：只留一个 3 阶自选位；选了 5/6 阶干员后 3 阶位不生效」 | 用**冒号**分开「主题 + 规则」，仍是一句话；★ 但**分号已经是上限**，再好一点可以把它拆进 `description` |
| 7 ✅ | DJ 的 9 组开关 + 4 参数 + 三档全平铺在设置行里 | `cyanfish.skinvoice` 现行那一栏：**行内只有短标签 + 控件**，`?` 小圈**正好 3 个**（每局开始时随机 / 素材上游 / 配置备份），页面 0 异常（§4.12.6） | **行内零说明、说明全进小圈**，而且小圈数量**可数、可取证** |

**现状实测（工序 111，23 个 Mod）**：`summary` 长度最小 **22** / 最大 **47** / 中位 **39**；**> 50 字的 0 个**（最长的是 `cyanfish.online` 47 字），> 40 字的 8 个。★ 上面第 1~3 行那三个（`banner` 74→**22**、`fix-enemy` 67→**26**、`max-seats` 66→**28**）已经在工序 108 之后改短 ⇒ **存量整改量为 0，第 1~3 行只剩「怎么改」的教学价值**（工序 108 当时的记录是「最小 30 / 最大 74 / 中位 41、> 50 字 4 个」，已作废）。
★ **工序 `host-012`（2026-10-12）复核（同一棵树，23 个 Mod）**：最小 **22** / 最大 **47** / 中位 **38**；**> 50 字的 0 个** / > 40 字的 **7** 个；`cyanfish.chat` = **36 字**（`summary`：「对局内一条可收起的聊天窗：收起是右上角一枚聊天图标键，消息同时以弹幕飘过」）—— **一句话、含一个冒号、无 `；` / `。`** ⇒ 按 4.12.8.2「`summary` 不换行、不用 `；`/`。` 分段、不带 Markdown 标记」**已核通过**（与第 6 行 `diy-34` 的写法同型）。

##### 4.12.8.5 多语言

- 界面字符串走 `t('…')`，语言包 = `public/i18n/{en,ja,ko,zh-TW}.json` + **中文原文**。
- ★★ **服主口径：只维护中日，其它语种不补。** ⇒ 新加字符串**至少给中文与日文**；`en` / `ko` / `zh-TW` 允许缺失。
- **缺键会回落到中文**（`zh` 原文是兜底）⇒ 缺键**不是 bug**；**不许**把中文原文写成「待翻译」占位符，缺就缺、让回落机制干活。
- **不要**在 Mod 里自造第二套语言机制；改 `public/i18n/**` 属于**改基座**（`public/**` = 平台维护者领地）⇒ Mod 作者**只提需求**。

##### 4.12.8.6 取证与落地

- 自洽版（新会话直接照做，含「会话开场简报模板」）：`<开发期工作区>/MOD-SESSION-STANDARD.md` §7。
- 本工序对账报告：`<开发期报告>/108-docs-and-mod-session-standard.md`。
- 落地方式：**存量 Mod 只改 `mod.json` 的 `summary` / `description`**（不动任何行为代码）⇒ 按 §4.12.5 同时 `version` +1 并在 `CHANGELOG.md` 写一条；**设置页整改**按 4.12.8.3 的自查表逐条删/搬。

---

#### 4.12.9 ★★ 统一页面注册规范（注册面 · 排版 · 元素样式 · 命名空间；工序 112）

**要解决的问题**（服主口径：「为所有 mod 的注册内容编写一套统一的页面注册规范，例如排版规范、元素样式规范等」）：
§4.12.1 管**设置页控件**的写法、§4.12.2~§4.12.8 管**文案**；但一个 Mod 往页面里放东西**不止设置页那一个面** ——
L4 插槽（§6.3）、管理页卡片（§2.2）、玩家公告（§4.14）、对局内的 `game.banners` 通道都是「注册面」，
而它们此前**没有共同的排版与元素样式口径**：谁能占哪个类名、字号跟谁走、px 能不能写、动画要不要降级，
只能各自照抄邻居。⇒ 本节把这些收成**一套**，并把可判定的部分做成**静态门禁**（4.12.9.7）。

★ **一处详细写**：设置页的**控件语义与文案**仍以 §4.12.1 / §4.12.2 / §4.12.8 为准，**本节不重复**；
本节管**跨注册面**的排版骨架、元素样式、类名空间与验收规则。

##### 4.12.9.1 「注册内容」的五个面（完整清单）

| # | 面 | 页面属于谁 | 契约（在哪读） | 本节对它的额外要求 |
|---|---|---|---|---|
| ① | **设置页栏位** | 外壳 Mod `cyanfish.mod-settings`（+ 官方设置弹窗） | `globalThis.__SP_MODSETTINGS__` 的 `register({ id, title, order, render })`（§4.8） | 4.12.9.3 的三列行 / 4.12.9.4 的元素表；`title` ≤ 6 全角字；**不传 `micro`** |
| ② | **L4 插槽** | 宿主 `public/js/ui/extensions.js`（`UI_SLOTS`，10 个） | `api.slots.register(api.slots.names.X, render)`（§6.3 / §6.4） | 名字只能取自 `slots.names`；**不许自己往 DOM 塞节点**；空插槽必须渲染 `null` |
| ③ | **管理页卡片** | 宿主 `tools/mod-admin.html` | `mod.json` 的 `summary` / `description`（§2.2 / §4.12.8.2） | 字数与分层按 §4.12.8，本节不改 |
| ④ | **玩家公告** | `cyanfish.announce` 的 `data/config.json` | `items[]` + `{占位符}`（§4.12.2 四 / §4.14） | 数值**必须**渲染时取真值，取不到退化成不带数字的中性话 |
| ⑤ | **对局内通道** | 宿主 `game.banners`（**多生产者**插槽） | 后来者按几何**让位**（§6.3 工序 90 契约） | 自带**全部** CSS；**必须** `pointer-events:none`；通道宽 ≤ 官方 ticker 的 7.6rem；动效必须有降级 |

##### 4.12.9.2 类名空间（**唯一可以占名的地方**）

| 规则 | 内容 | 级别 |
|---|---|---|
| **R1** | 自造类名**必须**是 `sp-<缩写>__<元素>` 或 `sp-<缩写>--<变体>`；缩写 ≤ 6 字符、**一个 Mod 一个**（下表登记）。宿主 CSS 里**已经存在**的类名 = 宿主类，**照用不算占名** | **硬** |
| — | **状态修饰固定用 `is-*`**（`.is-on` / `.is-active` / `.is-warn`），与宿主同写法，**不参与命名空间分配** | — |
| — | **宿主已有的控件照用、不许照抄**：能用 `.set-row` / `.set-toggle` / `.set-seg` / `.set-range` / `.lo-select` / `ui.Button` 就用；**再画一套长得一样的**会让同一页出现两种观感 | 硬（§6.4-3/4） |
| — | ★ **公共类名即契约**：跨 Mod 读别人的类名做判据（例：`cyanfish.danmaku` 读 `.sp-bn--game .sp-bn__row` 的**几何**来决定让位；`cyanfish.skinvoice` 组合 `.sp-ms__pane` 收紧外壳内容列）**必须在下面这张表里登记**，否则对方一次改名就会静默打断你 | 硬 |
| — | 宿主**根状态类**（`.sp-coarse` 触屏 / `.sp-in-match` / `.sp-reduced-motion` / `.sp-loadout-open` / `.sp-stats-open` / `.sp-standalone` / `.sp-conn`）**只读**，Mod 不许写、不许自己加 | 硬 |

**现有分配表**（工序 112 实测，登记处 = 各自的 `client/style.js`；`node <开发期脚本>/112-page-spec-audit.mjs` 会重算这张表）：

| 前缀 | 属主 Mod | 用在哪 | 备注 |
|---|---|---|---|
| `.sp-ms__*` | `cyanfish.mod-settings` | 设置页外壳（栏位 nav / 内容区 / 独立弹窗 / 内嵌形态） | ★ `.sp-ms__pane` 是**跨 Mod 契约**（skinvoice 组合它） |
| `.sp-sv__*` | `cyanfish.skinvoice` | 设置栏 + `loadout.topbar` / `rowActions` / `detailVoice` / `diySlotActions` | — |
| `.sp-an__*` | `cyanfish.announce` | 公告卡片（设置栏「回看」+ 未读弹窗） | — |
| `.sp-bn__*` / `.sp-bn--game` | `cyanfish.banner` | `lobby.banners` + `game.banners` | ★ `.sp-bn--game .sp-bn__row` 是**跨 Mod 契约**（danmaku 读它） |
| `.sp-dm__*` | `cyanfish.danmaku` | `game.banners`（第二个生产者）+ `game.cornerActions` | 与 `.sp-bn--game` **共用一条通道**，靠几何让位 |
| `.sp-on__*` | `cyanfish.online` | `lobby.topbar` 的在线读数 | — |
| `.sp-dc__*`（`.sp-dc`） | `cyanfish.debug-console` | `game.cornerActions` 的调试控制台入口 + 面板 | ★ **工序 115 整改完成**：类名从 `.dc*` 改成 `.sp-dc__*`（R1 硬规则），入口键的修饰类从 `.gm__gear.gm__console` 改成 `.gm__gear.sp-dc__gear`（宿主的 `.gm__gear` 照用），字号全部改成 `max(calc(n * var(--t)), <px>)`（R5 软规则）⇒ 审计里本 Mod **0 硬 0 软**（`112-page-audit` 工序 115 实测） |
| ★ `.loio__*`（`.loio` / `.loio-btn`） | `cyanfish.loadout-io` | `loadout.topbar` | **不合规**（同上）；该 Mod **已退役**（正式服不上传、测试服停用），未整改 |

##### 4.12.9.3 排版骨架（尺寸 · 间距 · 单位）

**一行一个控件**（判据是「肉眼一眼看不出这是两个 Mod 画的」）：

| 规则 | 内容 | 级别 |
|---|---|---|
| **R6** | **尺寸 / 间距 / 圆角一律 rem**。px 只许出现在三处：① `max(<rem>, <px>)` 的极窄视口下限；② `border*` / `outline` / `box-shadow` / `border-radius` 的头发丝；③ `@media` 断点 | 软 |
| ★ | **文字字号一律 `calc(<比例> * var(--t))`**（见 4.12.9.5），**布局值一律不读 `--t`** —— 这条不是我定的，是宿主自己的口径（`public/js/ui/settings.js:41`：文字根 `--t`「every readable font-size reads; **no layout value does**」） | 硬（R5） |
| ★ | **行 = 宿主 `.set-row`**：`grid-template-columns: minmax(0, 3.3rem) minmax(0, 1fr) auto; gap: .18rem; min-height: .44rem`（`public/css/screens/game.css:610`）。**不要自造两列 / 三列布局** | 硬 |
| ★ | **内容列预算**：标签列固定 `3.3rem` ⇒ 控件只拿到「面板宽 − 3.3rem − 2 × .18rem」。三档 `.set-seg` 至少需要 `3 × .8rem` ⇒ **外壳的独立弹窗宽度 = `9rem`**（`cyanfish.mod-settings` 实测：7.4rem 时内容列只剩 113.5px，第三档被裁到**点不到**） | 硬 |
| ★ | **分组用中文小标题**（`.sp-<abbr>__groupname`），组间留一个 gap；**不要**英文 eyebrow / `micro`（服主口径：一律清掉） | 硬（R8） |
| ★ | **窄屏 / 内嵌要折叠**：`≤767px` 或**画在官方设置弹窗里**时，外壳把「左竖排栏位」折成**顶部横排**（`.sp-ms__box--embed`），内容列整宽 —— 与手机端同一套规则 | — |

**真机实测**（工序 112，1600×900，1rem ≈ 74.26px；`112-page-probe.txt`）：三列 = **245.047 / 231.219 / 0 px**、
`min-height` = **32.6741px**、`column-gap` = **13.3667px**、`.set-seg button` `min-width` = **59.4074px** / `min-height` = **28.2185px**
—— 与 `3.3rem` / `.44rem` / `.18rem` / `.8rem` / `.38rem` **逐值一致**（第三列 0 = 那一行没有行尾读数）。

##### 4.12.9.4 元素样式表（用什么 · 多大 · 多少字）

控件**语义 → 用什么**的部分**以 §4.12.1 为准**（开关 / 动作 / 数值 / 枚举 / 文本 / 文件 / 下拉七行表）；
这里是**跨面**的补充，尺寸列写的是宿主现值（用 rem 或 `calc(n * var(--t))`）：

| 元素 | 用什么 | 尺寸 / 字号的规范形状 | 文字上限 | 不许 |
|---|---|---|---|---|
| **行容器** | 宿主 `.set-row` | 见 4.12.9.3 | 标签 ≤ 14 全角字 | 自造列布局 / 行内平铺说明 |
| **分组标题** | `.sp-<abbr>__groupname` | `calc(.13 * var(--t))` · `letter-spacing: .14em` · `--text-dim` | ≤ 8 全角字 | 英文 eyebrow |
| **开关** | 宿主 `.set-toggle`（`role="switch"` + `aria-checked` + `.is-on`） | `grid-column: 2 / 4` · 高 `.38rem` | 开关里只有「开启 / 关闭」 | 开关里写选项名 |
| **分段（2~4 档）** | 宿主 `.set-seg`（`role="radiogroup"`） | 每档 `min-width: .8rem` · `min-height: .38rem` | **每档 ≤ 2 全角字**、总档数 ≤ 4 | 3 字档（会折行被裁） |
| **滑块** | 宿主 `.set-range` + `style="--pct:N%"` | 必须给 `min` / `max` / `step`；当前值走行尾 `.set-row__val` | — | 自造滑块外观 |
| **动作按钮** | `ui.Button`（`variant="secondary" size="sm"`） | 与宿主的 `btn--sm` 同高 | 按钮文案 ≤ 6 字 | 自画按钮；一次点击做两件事 |
| **下拉（> 4 档）** | 宿主 `.lo-select` 那一套 | 高度 `max(.4rem, 24px)` | — | 下拉里承载说明 |
| **文本 / 长文** | `ui.TextField` 或 `textarea` | `maxLength` 必填；`min-height ≥ .6rem`（多行） | — | 富文本编辑器 |
| **「？」小圈** | `.sp-<abbr>__info` + `::after` + `data-tip`（`HintDot` 规范形状见 §4.12.2 二） | 圆 `.17rem` · 描边 `--line-3` · 圆角 50% · 弹出宽 `3.1rem` | ≤ 160 全角字、一句一档 | 与原生 `title` 并存（R7） |
| **状态读数** | `.sp-<abbr>__hint` 那类（一行小字） | `--text-dim` · `calc(.13 * var(--t))` | ≤ 40 全角字 · **带 `data-*` 标记** | 变成第二段说明 |
| **空态** | `.sp-<abbr>__empty` | 居中一行 · `calc(.16 * var(--t))` · `--text-lo` | 一句话 | — |
| **图标** | 宿主 `.icon` 或自绘 inline svg（`currentColor`） | `.16 ~ .2rem`；颜色由容器定 | — | 写死尺寸 / 颜色 |
| **颜色** | **只用宿主 token**（`--mint-400/500/700`、`--mint-a10`、`--text-hi/lo/dim`、`--line`、`--line-2/3`、`--bg-1/2`、`--amber`、`--red-premium`） | — | — | 硬编码 `#RRGGBB` / `rgb()`（R4；宿主确实没有该透明度时才写 `rgba()`，并在同一行注明理由） |
| **动效** | `@keyframes` + `transition`（`--ease-out`） | **同一 Mod 的 `client/**` 里必须有 `@media (prefers-reduced-motion: reduce)` 分支**（R10） | — | 无降级的动效 |
| **覆盖层通道** | 面 ⑤ 自己全权负责 | **`pointer-events: none !important`**（`!important` 唯一合法用途，R3）；宽 ≤ 7.6rem | — | 拦掉底下任何点击 |

##### 4.12.9.5 ★ 文字必须跟随「文字大小」（`--t`）

**判据出处**：`public/css/theme.css:139-142` 定义文字根 `--t`（`:root { --t: 1rem }`，`[data-text="md|lg|xl"]` 抬下限），
`public/js/ui/settings.js:41` 写明它**只给可读文字用**（「every readable font-size reads; **no layout value does**」）。

| 做法 | 判定 |
|---|---|
| `font-size: calc(.17 * var(--t))` | ✅ **规范形状**（默认档 `--t = 1rem` ⇒ 与 `.17rem` **逐值相同**） |
| `font-size: max(calc(.15 * var(--t)), 11px)` | ✅ 需要极窄视口下限时的**唯一**写法（保留下限，同时让「文字大小」生效） |
| `font-size: .17rem` / `max(.17rem, 11px)` | ❌ 玩家把「设置 → 文字大小」调大时**模组这一页不跟着变大** —— 与官方设置页并排看就是两套观感 |
| `width` / `height` / `padding` / `gap` 写 `calc(n * var(--t))` | ❌ 反过来错：**布局值不该跟文字走**，用 rem |

★ 真机判据（工序 112）：把 `<html data-text>` 从 `sm` 改成 `lg`，`.sp-ms__tab` 的 `font-size` 必须**变大**
（实测 12.6241px → 14.5177px，比值 = `--t` 的 1.15 倍；`112-page-probe.txt` ⑤）。

##### 4.12.9.6 跨面禁令（除 §4.12.4 的文案禁令之外）

| # | 禁令 | 为什么 |
|---|---|---|
| **R2** | **禁用 `:has()`** | Firefox ESR 115 / Safari < 15.4 不支持（`test/client-static.test.js` 有静态审计；宿主自己 `loadout.css` 里那几处是**既有例外**） |
| **R3** | **`!important` 只许用来压 `pointer-events`** | 全仓唯一的正当用法是覆盖层通道压过宿主 `.gm__hud > *` 的 `auto` |
| **R7** | **`data-tip` / 自有气泡**不许与**原生 `title`** 并存 | 两套气泡重合（工序 52 的真机结论，§4.12.2 二） |
| **R10** | 有 `@keyframes` 就必须有 `prefers-reduced-motion` 降级 | 眩晕 / 无障碍；走廊里两条弹幕都做了 |
| **R11** | 注册 `game.banners` 的一方**必须** `pointer-events:none` | 一条盖满整幅宽的通道不写它会**拦掉底下所有点击** |
| — | **不许自己往 DOM 里塞节点**；不许 import 别的 Mod 的模块（§6.4-1/2、§4.8 纪律 1） | 宿主是 Preact 受控子树；宿主没有 Mod 依赖概念 |
| — | **零痕迹**：没有注册方时插槽渲染 `null`、面板显示空态 ⇒ DOM 与「没装这个 Mod」逐字符相同 | §6.3 的硬约束 |

##### 4.12.9.7 验收（门禁 + 取证）

```bash
# 静态门禁（只读；R1..R11 一次跑完，输出 = 登记表 + 硬/软违规清单）
node <开发期脚本>/112-page-spec-audit.mjs            # → 112-page-audit.txt

# 真机（在**工作区根**跑；无头浏览器默认静音，flag 只从 lib/browser-flags.mjs 取）
node <开发期脚本>/start-local.mjs
node <开发期脚本>/112-page-probe.mjs <port>          # → 112-page-probe.txt + 112-page-settings.png
node <开发期脚本>/start-local.mjs --stop             # ★ 必须收尾
```

**真机 checklist**（每一条都要能在 `112-page-probe.txt` 里指出来）：① 面板出现且**零 console error / 零未捕获异常**；
② `<html data-text>` `sm → lg` 前后字号**确实变大**（4.12.9.5）；③ 面板里**没有** `.micro` / `.sp-*__tabmicro`（无英文 eyebrow）；
④ 「？」小圈**可数**（皮肤栏 = 3）且**没有**原生 `title`；⑤ 面板里**没有无主的全局类**（4.12.9.2 表的闭合性）；
⑥ 三列 grid / 分段控件的实测值与宿主 CSS **逐值一致**（4.12.9.3）。

**现状实测与存量清单**（工序 112 实测 + **工序 115 复算**，`112-page-audit.txt`；★ 这些**不在本工序的改动范围内** ——
一个 Mod 一个会话；工序 115 只整改了自己那一个，见下表的 ★ 行）。
口径：**行** = 一条规则在一个文件里命中一次（脚本打印的"N 处"）；括号里是**声明条数**。

| 级别 | 命中 | 位置 | 处置 |
|---|---|---|---|
| **硬 R1** | **1 行**（14 个类名） | `cyanfish.loadout-io`（`.loio*` 14 个，**已退役**） | 各自会话改前缀 + 同步 `client/**` 里的用法；退役那个建议随「是否删该目录」一并决定 |
| **软 R5** | **3 行**（29 条声明） | `announce` 8 · `loadout-io` 5 · `skinvoice` 16 | 按 4.12.9.5 改成 `calc(n * var(--t))`；本来带 px 下限的改成 `max(calc(n * var(--t)), <px>)` |
| **软 R4** | **4 行**（7 条声明） | `banner` 4（`rgba(78,216,175,…)` 那一族 / 渐变底衬）· `danmaku` 1 · `loadout-io` 1 · `skinvoice` 1 | 能用 `--mint-a10/a20/a35` 就用；宿主确实没有该档才写 `rgba()` + 同行注明理由 |
| **软 R6** | **2 行**（3 条声明） | `skinvoice` 2（`min-height:30px` 等）· `loadout-io` 1 | 改成 rem |
| ★ **工序 115 已整改** | — | **`cyanfish.debug-console` 1.4.0**（`.dc*`→`.sp-dc__*` 27 个类名 + 14 条字号跟 `--t`） | 本 Mod 现在 **0 硬 0 软**；`.gm__gear.gm__console` → `.gm__gear.sp-dc__gear` |
| ✅ **R1~R11 全绿** | — | **`cyanfish.mod-settings` 1.2.0**（工序 112 改完 = 参考实现） | 照它抄 |

★ **改这些一律按 §4.12.5**：动 `client/**` ⇒ 该 Mod `version` +1 + `CHANGELOG.md` 一条；
**本工序只登记清单，不改别人的 `mods/**`**（判据：§11.5 一个 Mod 一个目录一次提交）。

##### 4.12.9.8 参考实现（照它抄，别照抄它的业务）

`cyanfish.mod-settings` **1.2.0**（= 设置页外壳的宿主，所以它同时是「页面的提供方」与「规范的第一份实现」）：

| 规范条目 | 它怎么做的 |
|---|---|
| R1 类名空间 | 只占 `.sp-ms__*`；`client/style.js` 的文件头写明「只加 `.sp-ms__*` 前缀的新类」 |
| 复用宿主控件 | 内容区 `class="sp-ms__panel set-list sp-ms__pane"`；行 / 开关 / 分段全部是宿主的 `.set-row` / `.set-toggle` / `.set-seg` |
| R5 字号 | `calc(.17 * var(--t))` / `calc(.12 * var(--t))` / `calc(.16 * var(--t))`（v1.2.0 从写死 rem 改过来） |
| R4 颜色 | 只用 token（`--mint-a10` 等），零硬编码颜色 |
| 零痕迹 | 没有栏位 ⇒ 「暂无模组设置项。」；外壳停用 ⇒ 注册表照常、别的 Mod 功能不变 |
| 内嵌 / 窄屏折叠 | `.sp-ms__box--embed`（官方弹窗里）与 `@media (max-width:767px)` 各自折成横排 |

##### 4.12.9.9 本节的更正与取证

- **更正 1（本节附带）**：§4.12.1 排版第 3 条原写「宿主 `.set-row__label` 是 `white-space:nowrap`」——
  实测 `public/css/screens/game.css:613-615` **没有这条**，它只有 `flex-wrap:wrap` + `minmax(0, 3.3rem)` 的列宽
  ⇒ 长标签是在**列内折行**（后果是行高变），不是「把控件挤出面板」。结论（标签要短）不变。
- **已由工序 111 改完、本节不重复**：§2.2 注与 §4.12.8.4 的「`summary` > 50 字还有 4 个待整改」。
- **取证**：`<开发期报告>/112-page-registration-spec.md`（本工序报告）· `112-page-audit.txt`（静态登记表 + 违规清单）·
  `112-page-probe.txt` + `112-page-settings.png`（真机）· `112-page-golden.txt` / `112-page-validate.txt` /
  `112-page-nodetest.txt` / `112-page-docs-tests.txt`（门禁原始输出）。
- ★ **没做的那部分**（诚实登记）：① 存量清单（4.12.9.7 的硬/软两类）**一处未改**（不属本会话领地）；
  ② 真机只测了**内嵌形态**（官方设置弹窗）在 1600×900 下的几何，**独立弹窗（9rem）与手机视口没测**；
  ③ `R5` 的「`max(calc(n * var(--t)), <px>)` 形状」在**真机极窄视口**下没验（只验了 `--t` 生效）。

---

### 4.13 ★★ boss 回合的队友配对：`config.bossPairing`（工序 60）—— ★★ **已于 0.2.5 撤项**

> ## ★★ 撤项登记（host-016 · 随 0.2.5 重缝）
>
> **上游 0.2.5 把这条接缝想做的事做成了基座行为**：`docs/history/0.2.5.md` **§30.12**「Random boss partners,
> retained for Hidden Core」——维护者要求「首领改为每局随机配对」，并明确选择**隐藏首领沿用同局分组**。
> 落地形状：
>
> | 项 | 上游 0.2.5 的落点 |
> |---|---|
> | 配对函数 | `server/match/finalAssault.js` 的 `pairPlayers(alive, rng, previous = null)` —— `rng` 洗一遍、`previous` = 上一回合已定的对子（队友退出时**保持完整对子**、落单的再两两配） |
> | 抽取时机 | **每局抽一次**，在最终攻势**准备期之前**（`match/phases.js:_planBossWaves`，`deriveSeed(seed, 'boss-pairs')` 派生流，不消耗任何既有随机流） |
> | 跨回合保持 | `Match.bossPairs`（`match/bossRounds.js:startFinalAssault` 传 `this.bossPairs` 进去）+ 客户端 `m.public.bossPairs` |
> | 复核 | `match/audit.js` 改成**校验覆盖 / 与准备期一致 / 与实际战场一致**（不再重算座位对子） |
>
> **为什么撤项而不是并存**：上游是「**每局**抽一次 + 隐藏首领沿用」；本接缝是「**每个 boss 回合**各抽一次、
> 不跨回合保持」。两者是**两条不同的语义**，同时存在会让 `audit.js` / `m.public.bossPairs` 互相打架。
> 官方那版还**多做**了「队友中途退出后保持完整对子」——本接缝没有这个能力。⇒ 采纳上游，本接缝退出接活。
>
> **登记 `upstreamFixedIn: 0.2.5`**（`mods/cyanfish.boss-pairing/mod.json` + 该 Mod 的 CHANGELOG）。
>
> ★★ **服主已批准撤项（2026-10-12）** —— 服主原话「**撤**」（对应本报告 §「三个指令」第 2 条）。
> 撤项登记自此**生效**；★ `mods/cyanfish.boss-pairing/**` **保留目录与文件，本轮不删**（代码清理留待下一次，做法见下方「下一次清理」）。
>
> **现状（过渡态，未删代码）**：基座两处调用点（`phases.js:_planBossWaves`、`bossRounds.js:startFinalAssault`）
> **已改走官方路径**；`finalAssault.bossPairGroups` 与 `server/match/bossPairing.js` **保留但已无调用者**，
> `config.bossPairing` 数据表**不再被读取 ⇒ `cyanfish.boss-pairing` 是 no-op**。
> `test/match/boss-pairing.test.js` 仍是旧语义的测试（**预期会红**）。
> ★ 下一次清理：删掉 `server/match/bossPairing.js`、`finalAssault.bossPairGroups` 与那个测试文件，
> 并把本节的正文一并删除。
> ★ **对正式服零影响**：`cyanfish.boss-pairing` 在 `LIVE_MODS_EXCLUDED` 里（连目录都不上传）。
>
> —— 以下为**撤项前的原文**（保留作溯源；其中"基座默认 = 官方按座位配对"已不成立）——

**要解决的问题**（服主 issue 清单 v1.3「待更新①」原文）：「boss 回合的队友固定为按照从上到下两两配队的方式。
需要更新为**随机挑选队友**。」⇒ 基座必须留一条缝：**默认 = 官方按座位配对**，想随机的人用**数据**把它切过去。

| 问题 | 答案 |
|---|---|
| **它管什么** | 最终攻势（同盟 R14 / 独立标准为 R9）与隐秘核心（R15）的**战场分组**：哪两位博士进同一个战场、谁守左半边。**只管分组**，不管战场数、不管波次内容、不管血池 |
| **基座默认**（= 官方） | `server/match/bossPairing.js` 的 `BOSS_PAIRING_DEFAULTS = { pairing: null }` ⇒ `bossPairGroups()` 直接返回官方 `pairPlayers(alive)`：存活玩家按 `seat` 升序、`(1,2) (3,4) …` 两两成组，组内第一人 = LEFT、第二人 = 镜像的 RIGHT（奇数人时最后一位单独占一个战场，用 `_s` 模板） |
| **装 Mod 后** | `cyanfish.boss-pairing` 往 `data/config.json` 加**一条** `{ "op": "add", "path": "bossPairing", "value": { "default": "random" } }` ⇒ 每个 boss 回合开始时按**当时的实际存活人数**查表；命中 `"random"` 就用 `deriveSeed(matchSeed, 'bossPair:<round>')` **派生**一条独立随机流把存活列表洗一遍再两两成组 |
| **不装 Mod 为什么逐字节等价** | 表缺失 ⇒ `bossPairingFor()` 恒 `null` ⇒ **连那条派生流都不创建**、一次洗牌都不做；`pairPlayers` 里官方那行 `alive.slice().sort((a, b) => a.seat - b.seat)` 一字未改（`rng == null` 时新增的"组内按 seat 排序"对已排序的两元组是**恒等操作**）。`test/match/boss-pairing.test.js` ① 在 0/1/2/3/4/5/6/9/12 人 × 4 个种子 × 两个回合号上与 `pairPlayers` 逐值对比；⑤ 在真局（6 人房）上比对**波次内容逐字节相同**、只有分组不同 |

**口径三条**（都写进了 `server/match/bossPairing.js` 的文件头，改之前先读）：

1. **随机的是「谁和谁一队」，不是「组内谁是 LEFT」。** 洗完之后**每组内部仍按 `seat` 升序** ⇒ 组内座位靠前的那位照样守左半边；
   2 人房的"队友"本来就无从选择 ⇒ 这条保证它**连左右都不会被翻**（`boss-pairing.test.js` ② 有 32 个种子的断言）。
2. **不消耗本局任何既有随机流。** 随机数只来自派生流 ⇒ 打开接缝时**波次 / 商店 / 机变 / 机器人逐值不动**
   （`boss-pairing.test.js` ④ 直接量 `rngWaves` / `rngDraft` / `rngMeta` / `rngShop` / `rngBots` 的位置指纹）。
   ★ 这一条是**用派生流而不是复用 `rngWaves` 的唯一理由**：复用会让"配对随机"顺带改掉波次，等于一个开关改两件事。
3. **查表计数 = boss 回合开始时的实际存活人数**（`Match.startFinalAssault` 的 `alive.length`），与配对本身的集合一致；
   命中 / 表外走 `default`；**非法值（`"seat"` / 布尔 / 数字 / 大小写不同的 `"RANDOM"` / 非对象）一律 ⇒ `null` = 回官方**，
   绝不自造第三种策略（§4.2 铁律 2）。

**★ 为什么是独立的顶层键 `bossPairing`，而不是塞进 `config.coop`**：平台的补丁语言里 `add` **要求目标不存在**
（`server/mods/patch.js` 的 `applyOps`，`creates && s.has` 分支；工序 88 起唯一的例外是**两边写的值逐字节相同**），
而 `cyanfish.max-seats` 已经用 `add coop` 占住了 `coop` 这个键。
第二个 Mod 再 `add coop` / `add coop.bossPairing`，在**没装 max-seats 时**会因"中间键不存在"整包失败
（`patch.js` 的原子性：宁可整包拒绝，也不写半个补丁）。两个**可以各自单独开关**的 Mod 不能共用同一条 `add`
去写**不同的值** ⇒ 本接缝自成一个顶层键（与 `config.coop` / `config.debug` / `config.announce` 同一种做法）。
`gameVersion` 与 `apiVersion` 不变（**不是**破坏性变更：新键在基座里默认不存在、读取器默认值 = 官方行为）。

**施工清单（§4.4 十步逐条对照）**

| # | 动作 | 本接缝的落点 |
|---|---|---|
| 1 | 默认值 + 读取器 | **新文件** `server/match/bossPairing.js`：`BOSS_PAIRING_DEFAULTS`（冻结）+ `readBossPairing(config)` + `bossPairingFor(aliveCount, bp)` |
| 2 | 防呆上限常量 | 不需要（这条缝没有数值，只有一个策略名；非法值一律回官方） |
| 3 | 接进调用点 | `finalAssault.bossPairGroups(gd, seed, round, alive)` 是**唯一入口**；调用点三处：`match/phases.js:_planBossWaves`（预备期预览）、`match/bossRounds.js:startFinalAssault`（真开战）、`match/audit.js`（复核**用同一个入口重算**，所以不需要自己再抄一遍规则） |
| 4 | 前端读取同一份数据 | 不需要：客户端拿的是服务器算好的 `bossWaves`（`match/infra.js:bossGroupOf`），**没有第二处实现** |
| 5 | 两端各夹一次 | 不适用（无客户端实现、无客户端输入） |
| 6 | 文档 | 本节（接缝清单 + 详节）+ `docs/META.md` 的「Deploy field」那一段（口径行：配对来自 `bossWaves`，可由 `config.bossPairing` 随机化；本接缝只管分组、不改部署半场规则） |
| 7 | 单测 | `test/match/boss-pairing.test.js`（① 不装 Mod 逐值等于官方 ② 命中随机且左右不变 ③ 非法值回落 ④ 不污染其它随机流 ⑤ 真局波次逐字节相同 ⑥ 真 Mod 的补丁形状） |
| 8 | 端到端验收 | `<开发期脚本>/verify_boss_pairing.mjs`（真开 6 人局 / 真服务端 / 真 WS 建房；含"不装 Mod 的 4 人局指纹逐字节相同"） |
| 9 | **等价性证明** | `boss-pairing.test.js` ① 的全定义域对照 + ⑤ 的"波次逐字节相同"；另见 `<开发期报告>/60-a-*.md` |
| 10 | 写进接缝清单 | 本节 + §4.4 第 10 行 |

---

### 4.14 ★ 实时文档通道：`<mod>/live.json` + `GET|POST /admin/api/live`（工序 61）

**要解决的问题**（服主口径，issue 清单 v1.3「待更新④」）：服主要能在 **Mod 管理页**发一条横幅公告
（「服务器 22:00 要重启」），**几分钟内**通知到玩家，还能**随时撤回**。而 Mod 的内容通道只有
`data/<file>.json` 补丁 —— 它要合并进 `/data/*.json`、要让所有客户端跟上同一份数据，**必然**要走
「重载 / 重启」（`revision` 一动，已连接的客户端拿的还是旧数据）。横幅是**纯展示**的东西，为一个文件
去动全局数据是大炮打蚊子。⇒ 平台补一条**只读运行态**的缝。

| 项 | 约定 |
|---|---|
| 文件名 / 位置 | `live.json`（固定名），**Mod 根目录**（**不是** `data/`：那一层是分发内容，这一层是本机运行态） |
| 写 | `POST /admin/api/live?id=<mod>`，body = **整份 JSON 文档**（必须是一个对象，≤ `MAX_LIVE` = 64 KB） |
| 读（管理侧） | `GET /admin/api/live?id=<mod>` → `{ id, file, present, bytes, savedAt, doc, url }`（文件不在**不是错**：`present:false, doc:null`） |
| 读（消费方 / 浏览器） | `GET /mods/<id>/live.json` —— 走宿主**已有**的 `/mods/` 静态挂载（整目录只读），**没有新增对外端点** |
| 鉴权 | 与既有管理 API **同一套**守门（`Authorization: Bearer` / `X-SP-Admin-Token`，**只走请求头**；未设 `SP_ADMIN_TOKEN` 时整段 404） |
| id 安全 | 走 `safeId`（`/^[a-z0-9][a-z0-9._-]*$/`）⇒ 结构上不可能穿出 `modsDir`（`../` 直接被拒）；目标必须有 `mod.json`，否则 404 |
| 落盘 | 同目录临时文件 + `rename`（读方永远看到完整的一份）；`Content-Length` 先校验、超限就地 `destroy` |
| ★ 分发语义 | **本机状态**：`tools/mod.mjs pack` 时**强制替换成空文档**（`LIVE_SEED`，逐字节固定）；安装白名单放行它 ⇒ 别人拿到的是空文档，不会继承你这台服务器发布过的横幅 |
| 能力位 | `GET /admin/api/ping` 的 `capabilities.live`（老前端据此灰掉那一栏）；`ADMIN_API_VERSION` 抬到 **3**（纯加成） |

**四条纪律**：

1. **结构由消费方定义，平台不认业务字段。** 平台只保证「一个 JSON 对象、≤ 64 KB、原子落盘、能被
   `GET /mods/<id>/live.json` 读到」。`cyanfish.banner` 的 `{ items: [{ id, text, level, from, mins, to, href }] }`
   是**它自己的**约定，写在 `mods/cyanfish.banner/client/plan.js` 里。
   ★ 1.1.0（工序 75）起时间窗是 **`from`（开始时刻）+ `mins`（持续多少分钟）**，`to`（绝对结束时刻）
   降级为**只为旧客户端保留的镜像**；`mins` 缺失时仍按 `to` 判断（**老数据不变坏**）。两种写法的
   唯一汇合点是 `plan.js` 的 `itemWindow()` —— 平台侧一个字都没改。
2. **消费方必须自己降级。** 404 / 坏 JSON / 形状不认识 ⇒ 回落到 `data/` 补丁里的默认值；
   **一次网络抖动不许把界面清空**（`parseLive().ok === false` ⇒ 保留上一份）。
3. **发布不需要重载、不需要重启、不写 `data/`。** 这条缝的价值就在于「一个文件 + 一次轮询」；
   要改的是**分发的静态内容**，仍然走 §4.4 的数据补丁。
4. **不装 / 停用 / 文件缺失三条路径都必须无声。** 参考实现：客户端组件在这些情况下返回 `null`
   （Preact 的 null 不产生节点），样式也只在真的要画时才注入。

**「不装 Mod 为什么逐字节等价」**：

- 服务端：没有 `SP_ADMIN_TOKEN` ⇒ `createModAdmin` 返回 `null` ⇒ `/admin/api/*` 与 `/admin` **整体 404**，
  与加这条缝之前逐值相同（`_61_verify_banner_online.mjs` 的 `[E]` 段实测）；
- 有令牌但没人调用 `/admin/api/live` ⇒ 磁盘上什么都不多出来（Mod 自带的 `live.json` 只是一份随包分发的**空文档**数据）；
- 浏览器：消费方是 L4 模块，不装 / 停用 ⇒ `extensions.js` 根本不 import 它 ⇒ 不轮询、不注入样式、插槽渲染 `null`。

**取证**：`<开发期报告>/61-announce-stats-and-audit.md`（A 节）与
`<开发期脚本>/_61_verify_banner_online.mjs`（`[E]`/`[E2]` 段：鉴权 / 上限 / 路径安全 / 原子落盘 /
打包替换成空文档 / 安装白名单，逐项**真 HTTP** 实测）。

#### 4.14.1 ★★ 「结束时间」→「持续时间」（工序 75，服主口径 + 一次真实事故）

**服主口径**：「横幅公告不应使用『结束时间』而是使用『持续时间』，因为临时的提醒内容一般不会持续太久。」
**同一句里的第二问**：「我在测试服发布了一条测试公告，但无论是对局中还是对局外都没看见。」

**事故的根因**（一句话）：那条公告的 `to`（结束时间）= **发布的那一分钟** ⇒ 客户端 `isActive()` 判 false
⇒ `active = []` ⇒ 组件返回 `null`，**一条都不渲染**；而对局内本来就没做过（宿主对局侧只有
`settings.sections` / `game.cornerActions` 两格，没有横幅带）。

| 环 | 状态 | 证据 |
|---|---|---|
| ① 服主发布成功了吗 | ✅ 成功 | `GET /admin/api/live?id=cyanfish.banner` = 200，`present:true`、两条条目、`savedAt`=落盘时刻 |
| ② 写入真落盘了吗（EACCES？） | ✅ 落了 | 静态 `GET /mods/cyanfish.banner/live.json` = 200，`Last-Modified` 与 `savedAt` 逐秒吻合；工序 75 探针又发了一条，HTTP 200（同目录 `write+rename` 没报 EACCES） |
| ③ 客户端取得到 / 轮询吗 | ✅ 取到且真轮询 | 首页实测每 **20 秒**一次 `live.json`（22 秒里 1→2 次），无 404 / 无失败 |
| ④ 为什么还是看不见 | ❌ **断在这里** | 两条 `to` 分别 = 21:56:00 / 21:57:00，`savedAt` = 21:56:22 ⇒ 第 1 条**落盘时已过期 22.6 秒**、第 2 条只剩 37.4 秒；`now > to` ⇒ 不显示 |
| ⑤ 宿主支持在测试服上吗 | ✅ 在 | 测试服的 `lobby.js` 与本地 **sha1 相同**；`extensions.js` 里 `LOBBY_BANNERS: 'lobby.banners'` 在（与本地只差工序 72 那几处无关改动） |
| ⑥ 对局内呢 | ⛔ **从来就没做过**（★ 工序 77 已补上，见本节末） | 本 Mod 只注册 `lobby.banners`；`screens/game.js` 只渲染 `GAME_CORNER_ACTIONS`。真机：对局界面里 `lobby.banners` 有注册者但 `.sp-bn__row` = **0** |
| ⑦ 真机反证 | ✅ 同一份代码，只把 `to` 换成未来时刻 | 探针公告在 **17 秒**内出现在首页（不刷新页面），到点后自动消失 —— 整条链是好的，唯一的问题就是那个绝对时刻 |

**⇒ 教训（写进规范的理由）**：`<input type="datetime-local">` 一打开就带「现在」的日期时间 ⇒
**一次点选就能写出一个已经过去的结束时刻**，而失败方式是**静默的**（玩家端一条都不画，服主与管理页都看不到任何错误）。
「持续时间」把这件事从「你必须算对两个绝对时刻的先后」变成「填一个正数」——**结构上不可能写出一个已经过期的窗口**
（锚点 `from` 由管理页在发布那一刻取 `Date.now()`）。

**落地**：`mods/cyanfish.banner` **1.1.0**（`from` + `mins`，显示判断 `now < from + mins*60000`；
`to` 兼容读取 + 反向镜像），管理页控件按 §4.12 的形状改成 **短标签「持续」+ ？小圈 + 常用档下拉**
（30 分钟 / 2 小时 / 6 小时 / 1 天 / 3 天 / 不过期 / 自定义分钟数 1 ~ 43200），并把
「开始填在过去」「选了自定义却没填分钟数」两条当场拦下。逐环原始输出、改前/改后截图与老数据兼容实测见
`<开发期报告>/75-banner-duration.md`（脚本 `<开发期脚本>/_75_banner_probe.mjs`）。

★ **仍未做 → 已做**（**工序 77**，2026-10-12，服主口径「对局中也要能看到」→「类似弹幕的从靠顶部的右侧飘过 + 半透明 +
点击穿透」）：对局内那条横幅**已经落地** —— 宿主新开插槽 `game.banners`（`.gm__hud` 直接子节点、官方顶栏之后），
`cyanfish.banner` 升到 **1.2.0** 并把同一个 `Banner` 组件再注册一次进去（同一份 `live.json` + 同一个 `itemWindow`
判据），对局内形态是**弹幕**：自右向左单次 9 秒、每 45 秒再飘一次、半透明、整层点击穿透。
★ 为什么不做成常驻横幅带（真机量过）：顶栏与盟约带之间的那条 0.3rem 通道已经给了官方 `.ticker`，
放常驻横幅要么压 `.gm__bonds`（实测 17px）、要么压「回合」框（12~24px）—— 弹幕把遮挡变成瞬时的
（任一固定点单次只被覆盖 ≈1.9 秒）。四视口矩形 / 点击穿透 / 零痕迹 / 到点消失与撤回的取证见
`<开发期报告>/77-inmatch-banner-and-token.md`（脚本 `<开发期脚本>/_77_inmatch_probe.mjs`）。
★ 与上面第 ⑥ 行不冲突：工序 75 的结论是「**当时**宿主没有那条插槽，所以本工序没动它」，不是"做不到"。

---

### 4.15 ★ 自选位闸门把**已装载 Mod 的 kit** 也算进来（工序 63）

**它管什么**：自选位（5 / 6 阶）「谁可以被选」的那一个集合。全仓一共**三处闸门**读它，
**三个都必须接**，少一个就会出现「选择器列得出来、服务端也收得下，但一开局就被丢掉」：

| # | 闸门 | 位置 | 工序 63 时 | 现在 |
|---|---|---|---|---|
| ① | `room.diy`（保存自选编队）的 `checkDiyPicks` | `server/lobby.js` 的 `room.diy` | 已接 | 已接 |
| ② | `welcome.diyKitted`（客户端选择器拿它列候选） | `server/lobby.js` 的 `welcomeInfo()` | 已接 | 已接 |
| ③ | **开局重建 `PlayerState` 时的 `setDiy` 默认门** | `server/match/player/diy.js` 的 `setDiy(picks, { kitted = kittedChars() })`（由 `server/match/PlayerState.js:183` 的 `this.setDiy(seat.diy)` 走到） | **未接** | ★ **工序 84 已接** |

★ 工序 84 为什么必须补 ③：①② 放行只决定「存得下、列得出」，而**每一局开局**都会用 `seats[].diy`
重新 `setDiy` 一次；③ 还是基座门时，那 4 条 pick 会在开局被**整条丢掉**（`this.diy = {}` ⇒ `diyStock` 空
⇒ 商店永远刷不出该干员）。真机实测（`<开发期报告>/84-live-probe.txt` 的 `[K]` 段）：
基座门留 0 / 丢 4，宽门留 4 / 丢 0；接上 ③ 之后进程内直读 `PlayerState` 得到
`diy` 4 条、`_diyRecords=8`、`diyStock` 非空 ⇒ 商店真的能刷出这 4 名。

**接缝的形状**（同一条表达式出现在两个模块，见下）：

| 接缝 | 读哪里 | 基座读取点 | 基座默认（**不装 Mod**） | 装 Mod 后 |
|---|---|---|---|---|
| `kittedChars()` = 基座 `KITTED_CHARS` + `modContentInfo().kits` | `server/sim/content/index.js` 的 `MOD_KITS` 键（内存，L3 装载时登记） | `server/lobby.js` 的 `room.diy`（`checkDiyPicks` 的 `kitted`）与 `welcomeInfo()`（`diyKitted`）；`server/match/player/diy.js` 的 `setDiy` 默认门 | `modContentInfo().kits` = `[]` ⇒ **三处**取值**逐值等于** `KITTED_CHARS`，与上游 0.2.3 相同 | 自选池里多出「该 Mod 提供了 kit 的干员」（它的 `diy.ownedPool` 条目同时要存在才真的可选，见 §4.9） |

★ **为什么是两个同名的 `kittedChars()`**：`server/match/player/diy.js` 不能从 `server/lobby.js` import
（`lobby.js` → `match/Match.js` → `PlayerState.js` → `player/diy.js`，反向 import 成环），所以那里保留了
**同一行推导**；`test/mods/lobby-kitted.test.js` 断言两者**逐值相等**，防漂移。

**为什么需要它**：`KITTED_CHARS`（`sim/content/kits/index.js`）是从**基座**的 `OPERATOR_KIT_FILES` 算出来的，
**看不到 Mod 注册的 kit**。⇒ 一个只带 L2 数据 + L3 kit 的 Mod 无法让一名干员进自选池：数据进得了 `diy.ownedPool`、
战斗里 `content/index.js kitOf` 也能按 charId 命中 Mod 的 kit，但**选择器不列她、服务端拒绝选入**。
`modContentInfo()` 是平台**本来就有的**出口（`GET /mods` 的诊断快照），此前没有任何业务调用方。

**「不装 Mod 为什么逐字节等价」**：`modContentInfo().kits` 只由 **L3 装载成功**的 Mod 决定
（`registerModContent` 的 `MOD_KITS`）；没有带 kit 的 Mod、或它们被停用 / 安装失败 / 无 `content/` 时它是 `[]`
⇒ `kittedChars()` 与 `KITTED_CHARS` 是同内容的数组（顺序也相同：基座在前、Mod 在后），
`checkDiyPicks` / `diyPool` 只做**集合成员判断**（`shared/diy.js kittedTest`）⇒ 判定结果逐值相同。
**证据**：`<开发期报告>/63-collab-six.md` 的「§R 接缝等价性」一节（`_63_seam_equiv.mjs` 的
「无 Mod / 有 Mod / 停用」三组对照 + 两实例 `welcome` 与 `room.diy` 的差分）。

**开销**：`kittedChars()` 在**每条 `welcome`**（入座 / 入房一次）、**每条 `room.diy`**（保存自选编队时一次）
以及**每局开局重建 `PlayerState` 时一次**调用，内部只读内存数组并新建一个
≤ (基座 kit 数 + Mod kit 数) 的小数组 —— **不扫盘、不解析 JSON、不重算注册表**。

**纪律**：Mod 作者**不需要**做任何事（L3 注册成功即生效）；一个 key 被两个 Mod 抢会在
`registerModContent` 阶段就整体回滚（`addKit` 抛错），不会让闸门出现半截集合。

---

### 4.16 ★ L3 宿主句柄的确定性数学出口：`api.detmath = { sin, hypot }`（工序 63）

**它管什么**：给 **L3（`content/`）行为代码**一个（且只有一个）能拿到 **确定性三角函数 / 平方根**的出口。
`server/sim/detmath.js` 是基座自己用来保证「同一份输入在任何符合规范的 JS 引擎上得到同样的位」的数学实现
（ECMA-262 允许 `Math.sin` / `Math.hypot` 返回「实现近似值」，V8 / SpiderMonkey / JavaScriptCore 的末位不同
⇒ **模拟器里禁止直接用 `Math.sin` 之类**，`eslint.config.js` 与 `test/sim/detmath.test.js` 会拦）。
而 Mod 的 `content/index.js` **不能 import 任何引擎路径**（§5.3：Mod 目录可能在游戏仓库之外、两端相对根不同）
⇒ 需要这条缝。

**为什么之前没人需要它**：现有 Mod 的 L3 内容只用 `api.support / targeting / dir / body / damage / constants`
就能表达（`body.js` 恰好 import 了 `hypot`，但 ESM 命名空间**不转发** import ⇒ 拿不到）。
工序 63 的自选干员「丰川祥子」（`char_4182_oblvns`）的音符是**逐 tick 自驱的弹道**
（「扩张正弦」+ 归航），第一个真的需要 `sin`。

**接缝的形状**（`server/sim/content/index.js` 的 `modHostApi`）：

| 接缝 | 读哪里 | 基座读取点 | 基座默认（**不装 Mod**） | 装 Mod 后 |
|---|---|---|---|---|
| `api.detmath` = `Object.freeze({ sin, hypot })` | `server/sim/detmath.js` 的两个导出（**同一函数引用**，不是副本 / 包装） | **没有**任何引擎代码读它（只有 Mod 的 `content/` 会读） | 无 Mod ⇒ 没人读 ⇒ 引擎结果只由 `detmath.js` 决定，与上游**逐值相同** | Mod 可以写确定性弹道 / 角度数学而不违反「不许 `Math.sin`」；**不用它的 Mod 一行都不用改** |

**「不装 Mod 为什么逐字节等价」**（三层，缺一不可）：

1. **`server/sim/detmath.js` 与上游 0.2.3 逐字节相同**（sha256 `c4df1cb81b8049b8…`，11,523 B）
   —— 引擎的数学实现**一个字节没动**（这条缝只是**多一个句柄键**，不改任何函数）。
2. **它是纯加法**：`modHostApi` 返回对象的键集合只比上游多 `detmath` 一个
   （其余 14 个键：`_undo / apiVersion / id / log / data / support / targeting / dir / body / damage / constants /
   addKit / addInstall / addMeta`），且 `Object.isFrozen(api.detmath) === true`。
3. **引擎里没有任何代码路径读它**：全仓 `server/** + shared/** + public/** + tools/**` 对 `.detmath` 的引用
   只有**定义处那一行**（`server/sim/content/index.js` 的 `detmath: Object.freeze({ sin, hypot }),`）
   —— 没有任何 if / 分支 / 默认值会因为它而变化 ⇒ 装了 Mod 但没人用，行为与上游**逐值相同**。

**证据**（真跑，不靠嘴说）：`<开发期脚本>/_63_detmath_seam.mjs` → `<开发期报告>/63-gen/detmath-seam.json`：

- `[1]` `detmath.js` 与上游逐字节比对（sha256 / 字节数）；
- `[2]` 用一个**探针 Mod**（`data:` URL，只读 `api`）打印真实句柄的键集合与 `sin`/`hypot` 的**引用相等**；
- `[3]` 全仓扫描 `.detmath` 的读取点（引擎其它位置必须为 **0**）；
- `[4]` **22 组采样逐位比对**（`Object.is`）：`sin` 覆盖 0 / ±1 / ±0.5 / ±π / ±1e6 / ±1e300 / ±1e-300 等，
  `hypot` 覆盖 `(3,4) / (-3,-4) / 1e300 / 1e-300 / (0,0) / (1e6,-1e6) / (0.1,0.2)` —— 探针 Mod 经 `api.detmath`
  拿到的值与**直接 import `detmath.js`** 的结果**逐位相同**。

**开销**：`Object.freeze({ sin, hypot })` 在 `modHostApi()` 里建一次小对象（每个 Mod 一次），
`MOD_KITS` / `MOD_INSTALLS` / 战斗循环**都不碰它** —— 零热路径成本。

**纪律**：① 只放**已经存在**的 `detmath` 函数，**不要**在这条缝里新写数学（新数学属于 `detmath.js` 本身，
要按「引擎改动」走）；② 需要更多函数时**逐个追加**并在本节登记（当前只有 `sin` / `hypot`），
不要图省事把整个 `import * as DETMATH` 递过去 —— 那会让「这条缝有多大」不可读；
③ Mod 侧**仍然不许**用 `Math.sin` / `Math.hypot`（确定性红线与基座同一条）。

---

### 4.17 ★ 管理员只读的「房间 / 在线明细」：`GET /admin/api/rooms`（工序 69）

**要解决的问题**（服主口径）：服主要能回答「**什么时候好推横幅公告、什么时候好推更新**」。原来能看房间与在线
人数的地方只有 `/healthz` 的五个计数（`rooms / matches / humans / bots / spectators`）与 `cyanfish.online`
那枚首页胶囊 —— 它们**回答不了**「这几个人是在等待室还是在打第几回合」「这局开了多久」「房间里是谁」。

| 项 | 约定 |
|---|---|
| 端点 | `GET /admin/api/rooms`（**只读**；`HEAD` 同样可用）。响应 = `{ ok, admin: 4, ts, summary, rooms[] }` |
| 鉴权 | 与既有管理 API **同一套**守门（`Authorization: Bearer` / `X-SP-Admin-Token`，**只走请求头**；未设 `SP_ADMIN_TOKEN` ⇒ 整个管理面 404）。★ 未鉴权 / 错令牌 ⇒ `401 {"ok":false,"error":"unauthorized"}`，**响应体里没有任何房间码或玩家 id** |
| 顶层汇总 `summary` | `rooms / matches / humans / bots / spectators / maxSeats` **直接取 `lobby.stats()`**（= `/healthz` 的同一份，逐值相同）+ **`safeToRestart`** + `blockers[]` / `blockersText[]` |
| ★ `safeToRestart` | ★ **工序 73 收紧**：`humans === 0 && spectators === 0 && matches === 0` ⇒ 「现在重启 / 推更新最安全」。原来观战者**不算**（"重启只让他们重连一次，不打断任何对局"），但服主是拿这个布尔决定「**能不能推更新 / 重启**」，而重启**同样会把观战者踢下线** ⇒ 改成保守口径：座位上有人、有对局在跑、或有人在看，都**不算**安全。判据只有一处：`blockers` 为空 ⇔ 可以推（不再另写一份布尔表达式） |
| ★ `blockers[]` / `blockersText[]` | 挡着 `safeToRestart` 的原因，**同一处生成**：`blockers` = **机器可读代码**（`"humans"` / `"matches"` / `"spectators"`；空数组 = 可以推。★ 字段名与取值都没变，只是**多了 `spectators` 一种** ⇒ 按 `"humans"` / `"matches"` 判断的老前端照常工作）；`blockersText` = 同一份原因的**带数量说法**（`"2 humans"` / `"1 match"` / `"3 spectators"`，单复数各一档），面板直接显示，老前端忽略即可 |
| 每房间 `rooms[]` | `code`（房号 = 官方界面里的「房间」）、`mode`、`difficulty`、`hostId`、`createdAt` + `ageSec`、`capacity`、`seatRange{min,max}`、`seats{capacity,occupied,humans,bots,empty}`、`inMatch`、`matchCount`（本房累计开过几局）、`attending[]`、`spectators[]`、`match` |
| 每人一行 | `seat / playerId / name / isBot / connected / left / alive / ready`。★ 「在座」的判据与 `stats()` 同一条：`connected && !left`；`alive` 只在**对局里**有（等待室的座位对象没有 ⇒ `null`），`ready` 只在**等待室**里有（对局的 `PlayerState` 没有 ⇒ `null`） |
| 对局 `match` | `matchNo / mode / difficulty / isSolo / seed / stageId / startedAt + elapsedSec / round / phase + phaseName / deadline / paused / ended / seatCount / players[] / spectators[]`。`phaseName` 取自 `shared/constants.js` 的 `PHASE_NAMES`（**单一真相**，界面不自己维护一份中英映射） |
| 能力位 / 版本 | `GET /admin/api/ping` 的 `capabilities.rooms`（老前端据此不显示入口）；`ADMIN_API_VERSION` 抬到 **4**（**纯加成**：既有端点与字段一个都没动） |
| 缓存 | `Cache-Control: no-store`（要轮询实时值） |

**四条纪律**：

1. **单一真相**：字段全部来自运行中的 `Room` / `Match` 实例（`server/match/roomDetail.js` 只读不存），
   本模块**不新增任何状态**；汇总不自己加总，而是取 `lobby.stats()` ⇒ 与 `/healthz` 永远同一份数。
2. **拿不到就写 `null`**（面板显示「不可得」），**绝不**拿默认值冒充真值。例：等待室的座位没有 `alive`、
   对局的 `PlayerState` 没有 `ready`、`match.spectators` 里是 Match 的替身（**没有昵称**，面板用同一房间的
   `room.spectators` 按 playerId 补名字，补不到就显示「无昵称」）。
3. **绝不抛**：逐房间 `try/catch`，坏掉的那个房间降级成 `{ code, error }`，其余照常（管理页要能一直轮询）。
4. **它只挂在 `tools/mod-admin.html`**：那是「本地单文件 + 手填令牌」的管理页 —— 令牌只存在服主自己的浏览器里、
   只走请求头，**永远不进游戏页面**。★ 明细含玩家 ID / 昵称 ⇒ **绝不能**放进玩家可见的界面（`cyanfish.online`
   那枚首页胶囊只读 `/healthz` 的计数，**不含任何明细**，本工序一个字节都没动它）。

**面板（`tools/mod-admin.html`）**：「运行状态」卡里显示房间与在线人数的**那一行**变成可点击的入口
（`房间明细 ▾`），展开后是一张只读面板：顶层 `safeToRestart` 横幅（绿=可以推 / 琥珀=建议等一等）+ 汇总行 +
每房间一张卡（标签 + 键值行 + 玩家表）。刷新：**手动按钮 + 15 秒自动轮询**（可在面板上关掉）。
★ 琥珀条按服务端给的 `blockers` **逐条**翻成人话（「N 名真人在座 · N 局进行中 · N 名观战者在看」）——
面板不自己算判据，只把服务端给的原因排版出来（工序 73 起观战者也在其中）。
★ 间隔的理由写在面板上：推公告 / 推更新是**分钟级**决策（横幅发布后玩家端最迟 20 秒可见，重启本身只要 1~2 秒），
15 秒足够看到「有人进房 / 开局 / 打完」；**面板收起、页签切到后台时一律不轮询**（回到前台补一次）。

**「不装 / 无令牌为什么逐字节等价」**：

- 没有 `SP_ADMIN_TOKEN` ⇒ `createModAdmin` 返回 `null` ⇒ `/admin/api/rooms` 与 `/admin` **整体 404**；
- `server/index.js` 新增的只有**一行管道** `getRooms: () => roomDetailSnapshot(lobby)`（与既有的 `getGameInfo` /
  `reload` 同一形状），只在管理请求里被求值 ⇒ 管理面未挂载时是**永不执行的死代码**；
- 浏览器侧：本工序**没有**碰 `public/**`、`mods/**`、`public/i18n/**` 的任何一个字节（证据见下）。

**取证**：`<开发期脚本>/_69_verify_admin_rooms.mjs` → `<开发期报告>/69-verify-admin-rooms.txt`
（41/41 通过：鉴权 / 不泄漏 / 字段 / 掉线与重连 / 观战 / 真跑一局 / 与 `/healthz` 逐值相同 / 无令牌 404 /
`public/**` 25 个覆盖层文件逐字节一致 / 真机面板 6 张截图），脱敏样例 `69-api-rooms-sample-masked.json`，
CORS 复现 `<开发期脚本>/_69_cors_probe.mjs` → `69-cors-probe.txt`。完整报告见
`<开发期报告>/69-admin-room-detail.md`（含 **CORS 反射是否需要收紧**的方案与影响评估：**已给出、未改**）。
★ **工序 73 落地了那套方案 A，并收紧了 `safeToRestart` 的口径**：同一套 41 项在端口 3447 复跑
（`<开发期脚本>/_73_verify_admin_rooms.mjs` → `73-verify-admin-rooms.txt`），CORS 矩阵与三情形见
`<开发期脚本>/_73_probe_cors_restart.mjs` → `73-cors-probe.txt`，报告 `73-admin-cors.md`。

---

### 4.18 ★ 管理面 CORS 白名单：`SP_ADMIN_ORIGIN`（工序 73）

**它管什么**：`/admin/api/*`（`server/admin.js`）与 `/admin` 的**跨源读取**。工序 61 的安全审计把
「`cors()` 把 `req.headers.origin` **原样反射**回去」列为高风险 R2，工序 69 实测复现（预检 204 反射、
**401 也带反射头**），工序 73 按方案 A 收紧。

| 项 | 约定 |
|---|---|
| 白名单 | **基线（永远在）** = **同源** + 字面量 `null`；**外加**环境变量 `SP_ADMIN_ORIGIN`（逗号分隔，可多值，可写 `null`） |
| 同源怎么判 | `Origin` 的 host 与本请求的 `Host` **逐字相同**（scheme 不参与：反代做 TLS 终止时拿 scheme 判会**假阴性**，把正经的同源管理页关掉） |
| 命中 | 只回**那一个** Origin：`Access-Control-Allow-Origin: <它自己>` + `Allow-Methods: GET, POST, OPTIONS` + `Allow-Headers: authorization, content-type, x-sp-admin-token` + `Max-Age: 600` + `Expose-Headers: content-disposition` |
| ★ 不命中 | **一个 `Access-Control-Allow-*` / `Access-Control-Expose-Headers` 头都不发** —— `200` / **`401`** / `404` / **预检 204** 全都一样（`401` 也发反射头正是工序 73 要修的点；`Vary: Origin` 保留，它是缓存区分信号、不是 `Access-Control-*`） |
| 默认白名单为什么含 `null` | 服主现在的用法是**用 `file://` 打开 `tools/mod-admin.html` 连远端实例**，那种页面发的就是 `Origin: null` ⇒ 默认放行，老用法一行都不用改。★ 代价如实登记：`null` 也是沙箱 iframe / `data:` 页面的 Origin，它们同样在名单里 —— **令牌（`SP_ADMIN_TOKEN`）仍是唯一的守门**，这里只是"不额外拦它" |
| 不设 `SP_ADMIN_ORIGIN` 时 | 只剩基线（同源 + `null`）；`SP_ADMIN_ORIGIN` 只**增加**例外，**不覆盖**基线（否则一次手滑会把同源管理页一起关掉） |
| 不受影响的调用方 | **不带 `Origin`** 的客户端（`curl`、Node 验收脚本、服务端到服务端）；**同源**管理页（从 `/admin` 打开、地址填当前站点）；`/healthz` 等非管理端点（本来就不发 CORS 头） |
| 例 | `SP_ADMIN_ORIGIN=https://ops.example,http://192.168.1.9:8080`（把管理页放到另一个域 / 另一个端口时）。★ 写**源**（`scheme://host[:port]`），**不要带路径或结尾斜杠** —— `Origin` 是逐字节比较的，写错的唯一后果是"不放行"（fail-safe，不会放宽） |

**为什么是"不发头"而不是"回 403"**：CORS 是**浏览器**的读取闸门，不是鉴权 —— 服务端照常处理请求
（真值仍由 `SP_ADMIN_TOKEN` 守），只是**不告诉浏览器"可以读"** ⇒ 恶意页面的 `fetch` 抛 TypeError、一个字节都进不了 JS。
实测（真 Chrome，`73-cors-probe.txt` 的 `[C]` 段）：别的源上的页面**带着真令牌**去读 ⇒ `Failed to fetch`；
同源页面的阳性对照 ⇒ `200 + ok:true`。

**「不装 / 不设令牌为什么逐字节等价」**：本节的改动只在 `createModAdmin` **已经挂载**（设了 `SP_ADMIN_TOKEN`）时才有意义；
没设令牌 ⇒ 整个管理面 404 ⇒ 与上游逐字节相同。★ 不设 `SP_ADMIN_ORIGIN` 时也**不是**"全关"：同源 + `null` 照常。

**取证**：`<开发期脚本>/_73_probe_cors_restart.mjs` → `<开发期报告>/73-cors-probe.txt`
（49/49：7 个 Origin × 4 类请求 + 无 Origin 对照 + 两实例基线对照 + 真浏览器跨源/同源对照），
报告 `<开发期报告>/73-admin-cors.md`。

★ 它不是 Mod 接缝（因此**不在** §4.4 的施工清单里）：编号挨着 §4.17 只是为了和「房间明细」一起读 ——
两者都挂在同一个管理面上。

---

### 4.19 ★ 眼睑裁剪兜底的判据：按「开口覆盖率」扣藏，而不是按顶点均值（工序 81）

**它管什么**：`public/js/render/spine.js` 的 `_eyeMaskFallback()`。模板遮罩（stencil）被关掉时
（`render/app.js pickClipping()`：画质不是 `high`，**或**场上带裁剪的活骨架 ≥ 2），这条兜底要**自己**
把「被眼睑盖住」的槽整槽藏起来，模拟遮罩的裁切。

**原来的判据（上游 0.2.3）**：问「该槽**世界顶点的算术平均**落不落在裁剪多边形里」。
这个代理与「开口真正盖住这层多少」无关，两个方向都会错：
- 开口只盖住一层的一部分、顶点均值却落在开口上方的眼睑上 ⇒ **整层被藏**；
- 开口**塌到眼睛上**（击倒 / 闭眼）而顶点均值仍在里面 ⇒ **该层留着** ⇒ 眼珠从闭着的眼睑里透出来
  —— 就是 GitHub #177，`char_1040_blaze2` / `char_614_acsupo` 上当时仍然活着。

**现在的判据（工序 81）**：`slotCoverage(slot, att, buf, pn)` 量「开口盖住该层绘制表面的**比例**」
（把该层的每个三角形对开口多边形做半平面裁切；开口非凸时先耳切成三角形再逐块裁切，面积相加），
`COVERAGE_HIDE = 0.35` 以下才藏。

| 项 | 值 | 依据 |
|---|---|---|
| 改动文件 | `public/js/render/spine.js`（36373 B → 45924 B）、`test/render/eyemask.test.js`（8585 B → 15216 B） | `<开发期报告>/84-spine-diff.txt` |
| 阈值标定 | 以**模板遮罩为地面真值**，官方 35 个带裁剪骨架 × 6 帧 = 210 帧：总分 0.20→245597、0.25→175444、**0.35→159013**、0.50→168285、0.65→332377（修复前 223377） | `81-score2-c35.json` / `81-score2-c50.json` / `81-score-c25.json` / `81-score-c65.json` |
| 回归 | **17 帧变好 / 1 帧变坏 / 192 帧相同**；唯一变坏的是 `char_4162_cathy Die t=0.25`（1181→2125，覆盖率卡 0.35 边界） | 逐骨架表见 `81-eyemask-fix.md` |
| 真·闭眼 | 佩佩 / 仇白 / 隐德来希 / 琳琅诗怀雅 / blaze2 / acsupo 全部继续正确隐藏；`node --test test/render/eyemask.test.js` 10/10 | `84-eyemask-test.txt` |
| 覆盖层 | `public/js/render/spine.js` **新进覆盖层**：含 `test/` **89 → 90**，正式服口径（不含 `test/`）**68 → 69** | `<开发期脚本>/_84_overlay_count.mjs` |
| ★ 遗留 | 荣光时装的**虹膜暗层 `F_Eye_*_5`（686 px/帧）仍被兜底整槽拿掉**，修复前/后/上游三者完全一样；单一阈值治不了它（其覆盖率 0.16–0.26 与真闭眼眼珠的 ~0.21 重叠） | `81-attribution.json` |
| ★ 证伪 | `F_Eye_*_6`（工序 80 认为的"被误藏的眼白"）在 mask / before / after **三条路径上都是 0 像素** ⇒ 藏不藏它对屏幕毫无影响 | `81-attribution.json` |

**注意**：这条不是 Mod 接缝，而是**宿主自身**的一处渲染判据修复（Mod 只是提供了「带裁剪的非默认皮肤」
这个触发条件）。登记的目的一是留档，二是提醒：**任何改这条判据的提交都要重跑 `81-score*` 那套
以遮罩为真值的像素回归**（现成脚本见 `81-eyemask-fix.md` §7）。

**报告**：`<开发期报告>/81-eyemask-fix.md`（含逐骨架表、荣光 mask↔兜底 逐帧像素、
逐槽像素归因、复现命令、已知代价与遗留）。

---

### 4.20 ★★ 对局内聊天（聊天窗 + 弹幕）：`config.chat` + `g.danmaku` / `m.danmaku`（工序 90 → 本工序改名扩权）

**要解决的问题**（服主原话）：「在游戏内战斗房间右侧出现可收起的聊天小窗，可在 mod-setting 中注册页面调整该 mod 的设置，是否开启弹幕、弹幕速度、字体大小等设置」。

**接缝（唯一一处协议动作，★ 线格式消息名从工序 90 沿用，没有改）**：

| 方向 | 消息 | 结构（`shared/protocol.js`） |
|---|---|---|
| C2S | `g.danmaku { text }` | `text` = 非空字符串，长度 ≤ **`DANMAKU_MAX_LEN` = 120**（UTF-16 单元）—— **只是线格式上限** |
| S2C | `m.danmaku { playerId, text }` | **广播**给该对局的所有客户端（在座玩家 + 观战席，含发送者自己） |

★ **为什么不改名**：`g.danmaku` / `m.danmaku` 是**协议常量**，改名要同时动 `shared/protocol.js` 的 C2S / S2C 两张表、
`server/lobby.js` 与 `server/match/match/platform.js` 的放行判据、以及所有客户端 —— 收益只是好看。
**语义**已是「对局内聊天」（弹幕只是它的一个**显示形态**），所以本节把这件事写清楚，而不去动线格式。

**规则接缝**：`server/match/chat.js`（`readChat(config)`）。★ 它是**工序 90 的 `server/match/danmaku.js` 的接缝改名** ——
那一版只放行观战者、且 `cyanfish.danmaku` **从未上线过任何实例**（`deploy_base_024.py`：live 不上传 + test 不上传）；
现在发送权限按服主口径放宽为「**对局里的真人**」。旧的 `server/match/danmaku.js` 保留为一个**兼容转发层**
（把 `readDanmaku` / `DANMAKU_*` 等旧名字转出到 `chat.js`，好让工序 90 的历史报告仍然读得通），**不再承载任何逻辑**。

```json
{ "op": "add", "path": "chat", "value": {
    "enabled": true, "maxLen": 60, "cooldownMs": 2000, "burst": 5, "burstWindowMs": 20000,
    "roomBurst": 12, "roomWindowMs": 30000, "denyRooms": [], "blockWords": [] } }
```

**七道闸门（全部在服务端，顺序有意）**：

1. `config.chat.enabled === true` —— **管理员口径的「全局关闭」**。缺省 / 非字面 `true` ⇒ 关。
2. `denyRooms` 命中本房间码 —— 管理员口径的「按房间关闭」。
3. `chatSenderAllowed(ps)` —— **这局里的真人**：在座玩家（**含房主**）、已被淘汰但仍在局的玩家、观战席。
   **AI（`isBot`）、已离开的人（`left`）、没有 `playerId` 的人一律拒绝。**
4. `sanitizeChatText()` —— 控制字符 → 空格、零宽/双向控制字符（U+200B/200C/200E/200F/U+202A–202E/
   U+2066–2069/U+FEFF）→ **删除**（★ **保留 ZWJ U+200D**：emoji 组合序列要用它）、空白折叠、两端去空白；
   空 / 纯空白 ⇒ `BAD_MSG`。
5. `chatLength(body) <= maxLen`（**码位**数，一个 emoji 算 1）⇒ 超长 `BAD_MSG`。
6. `chatBlocked(body, blockWords)` ⇒ `BAD_MSG`。**词表默认空 = 不过滤**；拒绝原因**不回显**命中了哪个词。
7. 频率：同一发送者的滑动窗口（`cooldownMs` + `burst`/`burstWindowMs`）+ **整间房**的滑动窗口
   （`roomBurst`/`roomWindowMs`）⇒ `RATE`。**只有被接受的那一条才记时间戳。**

**★★ 默认等于上游（结构性）**：`readChat()` 在 `config.chat` 缺失 / `enabled !== true` 时返回**冻结的**
`CHAT_DEFAULTS`（`enabled: false`）⇒ `MatchIntents.chat()` **第一条闸门就 return**。基座没有任何一条
路径能在缺配置时给出这条能力（fail-closed）。★ **它比工序 90 更严格地成立**：那一版的测试只断言"观战者也被拒"，
本版断言**三路人马（观战席 / 在座 / 已被淘汰）都发不出去**（`test/match/chat.test.js`）。
协议层那一格与 `server/lobby.js` / `platform.js` 的两行放行**一个字没动** ⇒ 缺配置时它们的行为与上游逐值相同。

**★★ 谁能发（本工序按服主口径裁定）**：**对局里的真人**。与工序 90 的「只有观战者」**有意不同** ——
一个聊天频道如果只让看客说话、把正在打的人排除在外，它是"弹幕"而不是"聊天"。在座玩家已有的官方表情
（`g.emote`，36 个、短、无正文、有官方轮盘约束）是**另一件事**，不构成重复。★ AI 仍然不发（机器人没有
"想说话"这回事，放它进来只会造垃圾消息）。

**★ 为什么 `g.danmaku` 必须穿过 `server/lobby.js` 的那道闸**（`routeGame` 原先写的是「观战者只能发 `g.watch`」）：
观战席的发送者**只可能是观战者**，不放过这一层就根本到不了 `match.handle()`。★ 在座玩家走的是**正常路径**
（那一道判据只对 `room.spectatorOf(...)` 为真的人生效）⇒ **本工序没有为"让玩家能发"改任何一行路由**。

**★★ 不做持久化**：本动作只 `broadcast` 一次 —— **不写盘、不入存档、不进 `m.public` / `m.result`**、
不参与重连重放（`ctx.lastPublic` / `ctx.results` 都不碰它）。断线重连的人与中途进场的观战者**不会**补收历史。

**★ 名字不在帧里**：观战席的 stand-in（`server/match/match/watch.js` 的 `_spectator()`）是 `Object.freeze`
的、**没有 `name`**；而客户端本来就有权威来源（`room.state.spectators` / `m.public.players` / `me`）⇒ 帧里只带
`playerId`（§4.6 纪律 1：不要为同一个事实造第二份真相）。客户端那份解析在
`mods/cyanfish.chat/client/plan.js` 的 `nameOf()`，**查不到就返回空串**（退化成不带名字的一句，绝不显示猜的名字）。

**★★ 用户生成内容（UGC）三条口径**：

1. **绝不把正文当 HTML**：正文只出现在 Preact 的**文本子节点**位置（`html` 模板里 `<span>${text}</span>`
   那一格；宿主 `ui.html` 对字符串子节点走 `createTextNode`）；`mods/cyanfish.chat/client/**` 里没有、
   也不允许出现 `innerHTML` / `dangerouslySetInnerHTML` / 任何 HTML 解析路径。⇒ 写 `<script>` 只会看到字面文字。
2. **长度 / 频率 / 空白全部由服务端强制**；客户端那一份（`client/plan.js` 的 `sanitizeText` / `clampMaxLen`）
   **只是体验**，用于输入框的 `maxLength` 与"别送一个注定被拒的东西"。
3. **关键词过滤做成服务端开关，默认不启用**（`config.chat.blockWords`，默认 `[]`）。服主往数据里加词即生效，
   不需要改代码、不需要新协议。★ 本工序**没有**内建任何中文敏感词表（那会引入误伤与维护成本，且需要服主口径裁定）。

**★ 客户端三个注册面（全部落在**已有**的宿主契约上，没有新开任何插槽）**：

| 面 | 落点 | 干什么 |
|---|---|---|
| ① 对局内通道 | `game.banners`（**多生产者**插槽，第二个生产者） | 弹幕**飘过**（自右向左、半透明、点击穿透、按 `p` 停住） |
| ② 设置页栏位 | `settings.sections` + `globalThis.__SP_MODSETTINGS__`（§4.8） | 「对局聊天」一栏三项：对局内弹幕 / 弹幕速度 / 聊天字号 |
| ③ 右侧聊天面板 | **`<body>` 上的独立 Preact 根**（不是插槽） | 可收起的聊天窗（记录 + 输入 + 未读数） |

★★ **为什么 ③ 不走插槽**：宿主 `UI_SLOTS` 里**没有**"对局内右侧常驻面板"这一格；Mod **不许自己往宿主受控子树里
塞节点**（§6.4-3，下一次渲染就冲掉）；宿主可用的构建里**没有 `createPortal`**（§6.4-2）。⇒ 与 `cyanfish.mod-settings`
的顶栏齿轮面板走**同一条路**（`mod-settings` / `skinvoice` / `debug-console` 都有先例）。
**本工序没有为它开新的宿主插槽** —— 那需要改 `public/js/ui/extensions.js` + `screens/game.js`，而独立根本来就够用。

**★ 面板的几何让位（真机几何，1920×1080，1rem = 100px）**：官方顶栏 `.gtop` 占 0 ~ 1.0rem、官方 `.ticker`
占 1.0 ~ 1.34rem、盟约带 `.gm__bonds` 从 1.36rem 起（右边界 5.2rem，团队面板在**左**侧）、商店条
`right:.26rem; bottom:.2rem`（卡牌 2.24rem + 工具行 .48rem）⇒ 屏幕**右上角那条竖带是空的**：**展开**的面板落
`right:.96rem; top:1.42rem; width:3.6rem`，高度 `min(5.4rem, calc(100vh - 4.1rem))`。
★ 根节点铺满视口但 **`pointer-events: none`**（只有面板 / 窄标签开 `auto`）⇒ 面板之外点击照常落到战场上。
★★ **右边界为什么是 `.96rem` 而不是与商店条同一个 `.26rem`**（真机实测撞出来的）：
官方 `.gm__effects`（**生效效果那一列**，`game.css:444` 的 `right:.3rem; top:2.4rem`）与面板同在右上角那条竖带，
真机量到它占 `x 1828.2 ~ 1890`（宽 61.8px）⇒ 面板若停在 `.26rem`（右缘 1894）会**盖住整列图标**。
★ 为什么不改宿主那一列的 `right`：`game.css:445-447` 的注释写明它是**故意**「跟着就绪数往下让」
（`has-readywhy` 时下移 `max(.3rem,16px)`，手机上防止撞到就绪计数）⇒ **该让位的是我们**。
⇒ 面板右缘退到 `x 1824`（`.96rem`），真机 `getBoundingClientRect` 复核**不再相交**。

**★★ 收起态 = 右上角一枚方块图标键（与官方「生效效果」那一列同尺寸、并摆在它正上方）**（服主口径：
「聊天框现在在右侧的 EFFECTS 单独一个框很奇怪，我的建议是收起时只显示一个框 + 聊天 SVG 图标
（风格类似左下的设置栏），大小与右侧 EFFECTS 单框相同，置于 EFFECTS 栏的上方」）：
`right:.3rem; top:1.72rem; width:.5rem; height:.5rem` ——
· `.5rem × .5rem` = 官方 `.effect` 的尺寸（`game.css:449-450`）⇒ 与 EFFECTS 单框**同大**；
· `right:.3rem` = 官方 `.gm__effects` 的 `right`（`game.css:444`）⇒ **与那一列右对齐**（真机实测两者右缘都是 1890）；
  ★ 刻意**不跟** `.gm__gear` 的 `.24rem` / `bottom:.24rem`：那是**左下角**那一排的边距，跟着它反而与 EFFECTS 错开 6px；
· `top:1.72rem` = 让"图标键 + 它对下那一个框"正好落在 EFFECTS 列的顶边（`2.4rem`）之上
  （算式：2.4 − .5 − .12 − .06 = 1.72；真机实测底边 222 < 列顶 240）。
★ **只有一个 SVG 图标、没有文字**（外观照 `.gm__gear`：同背景/描边/hover，图标 `.28rem`）。
★ 图标是**自绘 inline SVG**（`client/panel.js` 的 `chatIcon()`）：宿主 `ui.Icon` 的 `ICONS` 表里**没有"聊天"这个键**
（核过 `public/js/ui/components.js`），硬塞语义相近的会渲染成 `null` ⇒ 收起态变成"一个空框"。
★ 历史更正（本工序三次改口径，全部记在案）：① 第一版把收起态放屏幕**左上角**（误读"面板自己的收起键"为"屏幕角"）⇒
服主更正「错误的挂靠在了屏幕**左侧**而非右侧」；② 第二版改成**右上角竖排窄标签**（`.56rem × 1.5rem` 长条 + 竖排文字）⇒
服主指出"单独一个框很奇怪"；③ **现在是方块图标键**。单测里有**正向**断言盯着这一版的三条硬性质
（贴右 / `.5rem` 方块 / 在 EFFECTS 上方），并断言"不许再用 left 挂靠""不许再有文字标签类"。

**★★ 未读提示 = 一颗红点，且只在「弹幕关着 + 面板收起」时出现**（服主口径：
「未读消息数显示**仅在弹幕功能关闭且收起时**显示，且**仅显示一个提示红点不显示数字**」）：
① 弹幕开着时新消息已经在屏幕顶部飘过一条（玩家已经看到了）⇒ 再点红点就是重复提示，故**不点**；
② 面板开着 ⇒ 消息就在眼前，**不点**；③ 自己发的不算未读；④ 打开面板 / 把弹幕打开 ⇒ 红点立刻清掉；
⑤ 提示本身是**一个布尔**（`unreadDot`），**不累计条数** ⇒ 窄标签里不再出现数字
（`.sp-chat__dot`，`.16rem` 圆、宿主 `--red-premium`，绝对定位在窄标签右上角；旧的数字徽标类
`.sp-chat__tabcount` **已删除**）。真机实测窄标签文字 = `"聊天"`（不是「聊天 3」）。

**★ 设置页那一栏不摆行尾倍率读数**（服主口径：「设置页不用显示 ×1 的具体倍率」）：
「选了哪一档」由分段控件自己的高亮（`.is-on`）表达；内部倍率（`1×` / `1.25×`）是**实现细节**，
对玩家没有决策价值（§4.12.8.3 的自查问句："把它从 A 调到 B，玩家会看到什么不同？"
答案在**文字变大 / 飘得更快**，不在"倍率从 1 变成 1.25"）。⇒ 那一栏只剩：**3 行控件 + 3 个「？」小圈 +
1 行状态读数**（"当前：约 N 秒飘完"—— 会变、且是玩家能感知的量，用真值算出来）。

**★ 渲染形态（与「实时横幅公告」共用插槽 `game.banners`）**：**不叠加、只让位**。判据只有一处
（`mods/cyanfish.chat/client/plan.js` 的 `canStartPass()`）：横幅**此刻不在屏上**（几何判据 —— 那个根节点
在 45 秒空档里也挂着，行只是被 `translateX` 挪到屏外）**且**我们的这一轮能在它**下一次起飞前**跑完
（实测周期 + `LANE_MARGIN_MS` 边距）。⇒ 两条弹幕**永远**不会同时压在这条通道上。形态参数与横幅**同值**
（`top:1.0rem`、高 `.34rem`、自右向左、行 `opacity:.78`、整层 `pointer-events:none !important`、
`prefers-reduced-motion` 降级、按 `p` 停住），但**可区分**：本 Mod 加 `[聊]` 方标 + 说话人名字 + `--mint-500` 描边。
★ 跨 Mod 读 `.sp-bn--game .sp-bn__row` 的**几何**是本仓库登记过的公共类名契约（§4.12.9.2 的分配表）。

**★★ 本工序相对工序 90 的两条新性质（都在单测里点了名）**：

1. **「弹幕速度」由玩家设置，并且**真的参与**通道仲裁**：时长 = `speedToMs(speed, busyMul)` =
   `9000 / clamp(speed, 0.5, 2) × busyMul`（慢 0.7 ≈ 12.9 秒 / 标准 1 = 9 秒 / 快 1.5 = 6 秒；
   队列里还有人在等时 ×0.7 让吞吐追上服务端允许的流入）。⇒ **同一条通道、同一个时刻，三档给出三种
   "能不能起跑"的结论**（快档可用的窗口最长）—— `test/match/chat.test.js` 的仲裁器用例逐值断言了三个封口线。
2. **「聊天字号」只缩放**可读文字**，不动布局**：`--sp-chat-fs` / `--sp-cm-fs` 乘进 `font-size`，
   宽 / 高 / 间距仍然是 rem（§4.12.9.5 的宿主口径：「every readable font-size reads; **no layout value does**」）。

**★ 零痕迹（不装本 Mod）**：服务端第 1 条闸门（见上）；客户端连文件都不会被下载。本 Mod **没有改
`public/js/**` 与 `public/css/**` 的任何一行** —— 它只用一个**已有**的插槽（`game.banners`，第二个生产者）、
一个**已有**的注册面（`settings.sections` / §4.8）与两个既有先例的全局（`globalThis.__SP__.store` / `.net`，
§6.4 纪律 5 的边界内：没有服务端副作用，客户端只是读状态 + 发一条已有通道上的消息）。
客户端那份本机偏好走 `sp.pref.chat`（`public/js/store.js` 的 `sp.pref.*` 口径）——
★ 它与服务器那份 `config.chat` **分工明确、互不覆盖**：服务端管**规则**（能不能发 / 多长 / 多快 / 屏蔽），
本机管**玩家自己怎么看**（飘不飘 / 多快 / 字多大）。

**★ 本工序同时删除了 `cyanfish.danmaku`（工序 90 的 Mod 目录）**：它从未上线过任何实例，内容整体并入
`cyanfish.chat`。`<开发期脚本>/deploy_base_024.py` 的四张表随之更新（`cyanfish.danmaku` 三个出现处全部移除；
`cyanfish.chat` 进 `LIVE_MODS_EXCLUDED` + `TEST_MODS_ENABLED` ⇒ **先在测试服验收**，正式服连目录都不传，
与 `banner` / `online` / `boss-pairing` 同一条口径）。`TEST_MODS_NOT_UPLOADED` 因此**清空**。

**验收证据**：`<开发期报告>/chat-001-battle-chat.md`（本工序报告 —— ★ **含真机取证**：无头 Chrome 走完
标题页→大厅→建同盟→加 AI→开始模拟→简报→选人→**对局中**，真宿主 + 真服务器下 23 条断言全绿，并因此抓出
**两个真 bug**：① 自己发的一条消息在面板里出现两遍；② 面板盖住官方 `.gm__effects` 生效效果列）·
`<开发期产物>/chat-001-battle-chat/`（**单独网页预览** + 4 个可重跑探针 + 静态审计 + 几何原始 JSON）·
单测 `test/match/chat.test.js`（37 条，取代工序 90 的 `test/match/danmaku.test.js`；
★ 含把本轮踩到的坑做成的**常设门禁**：CSS 模板字面量里不许有反引号 / `!important` 只压 pointer-events /
收起标签在左与展开面板在右 / 未读是红点且没有数字 / `[hidden]{display:none}` 兜底 /
记录并入 `reconcileIncoming` 的防重复）；
fuzz 用例 `test/match/fuzz.test.js` 的 `case 'g.danmaku'`。
★ 工序 90 的历史证据（`<开发期报告>/90-spectator-danmaku.md`、`77-inmatch-banner-and-token.md`）**不动** ——
它们记录的"观战者弹幕 / 通道让位"仍然读得通，因为让位契约与形态参数逐值沿用。

### 4.21 ★ 管理面只读的趋势指标：`GET /admin/api/metrics` + 1 分钟采样器（工序 114）

**要解决的问题**（服主口径）：服主原话「我们 mod 控制台的**查房功能**技术栈应该够实现一个**绘制玩家数/AI数/
游戏中房间数/服务器关键性能参数的折线图**的功能了吧（**原查房功能不变，新功能单开一栏可收起**）」，
随后两次收口：① 「不用 5s 1 点，**1 分钟 1 点**就够了，保留 **3 日**内数据，可调节显示范围（按**过去 X 小时**），
当前主要是想**实测人数对服务器的性能压力**」；② 「CPU% 除均值外还应显示**分钟内峰值**（按之前测试的口径，
**AI 计算时会产生瞬时的高压**）」。

| 项 | 约定 |
|---|---|
| 采样间隔 | 默认 **60 秒 1 点**（`SP_ADMIN_METRICS_INTERVAL`，5..3600）。★ 峰值另有一条高频子采样：**窗口内每 2 秒**（`SP_ADMIN_METRICS_PEAK_SEC`，1..10）取一次瞬时 CPU%；子采样间隔被夹到 ≤ 窗口的一半 ⇒ 每个窗口至少 2 次 |
| 容量 / 回溯 | 环形缓冲默认 **4320 点**（`SP_ADMIN_METRICS_MAX`，120..43200）= 60 s × 4320 = **72 小时 = 3 日**。★ 内存 = 4320 × 18 列 × 8 B = **622,080 B ≈ 607 KiB**（`Float64Array` 定长，**不随时间增长**）。★ 容量是**点数**上限 ⇒ 改间隔要同时改容量才能保持 3 日（本地验收用 5 s 间隔 ⇒ 同一容量只回溯 6 小时） |
| 每点 18 列 | `ts` · `humans` · `bots` · `matches` · `rooms` · `spectators` · **`cpuMean`** · **`cpuPeak`** · `rssMB` · **`elMeanMs` / `elMaxMs` / `elP99Ms`** · `sockets` · `load1` · `memFreeMB` · **`peakBots` / `peakHumans` / `peakAtSec`**（顺序 = 环形缓冲列序 = 落盘 JSONL 每行的数组序，**单一真相**） |
| ★ 峰值口径 | `cpuMean` = 窗口 CPU 增量 ÷ **实际墙钟**（WORKBENCH 坑 14）；`cpuPeak` = 同一窗口内子采样的**最大瞬时值**；`peakBots / peakHumans / peakAtSec` = **取到峰值那一刻**的 AI 数 / 真人数 / 窗口内秒偏移 ⇒ 直接回答「**几个 AI 造成了多大的瞬间压力**」。★ 本机真负载实测：均值峰值 14.4% vs **瞬时峰值 775%**（≈7.75 核）—— 均值会把这条高压完全抹平 |
| event-loop | `perf_hooks.monitorEventLoopDelay` —— ★ **必须显式 `enable()`**（不 enable 时 `count` 恒 0、`mean` 恒 `NaN`，实测阻塞事件循环 220 ms 也读不到任何样本）；读 `mean / max / p99` 后 `reset()` ⇒ 三个数都是**本窗口**的统计 |
| 系统读数 | Linux 读 `/proc/loadavg` 与 `/proc/meminfo` 的 `MemAvailable`；★ **非 Linux 优雅降级**：Windows 的 `os.loadavg()` 恒为 `[0,0,0]`（那不是「负载 0」而是「没有这个数」）⇒ `load1 = null`（面板显示「不可得」），可用内存回落 `os.freemem()` |
| 端点 | `GET /admin/api/metrics?since=&until=&step=&raw=`（**只读**；`HEAD` 同）。`since/until` = ms epoch；`step` = 降采样步长（秒，缺省按窗口自动选、**桶数 ≤ 720**）；`raw=1` = 不降采样（导出 CSV / JSON 用）。响应 = `{ ok, admin: 5, sampling, query, ts[], charts[], readouts[], series[], latest }` |
| 降采样 | 每个桶：计数 / 均值类 `avg`；**峰值类 `max`**（`cpuPeak` / `elMaxMs` / `elP99Ms` —— 用均值降采样会把瞬时高压抹平）；峰值现场三列 `atMax`（取本桶 `cpuPeak` 最大那一点的值） |
| 窗口 / 边界 | 界面给「过去 **1 / 3 / 6 / 12 / 24 / 72 小时**」（默认 6）；空桶 `null` ⇒ 折线断开；`since` 早于缓冲区最老点 ⇒ 自动贴到最老点（刚起服时不会算出荒谬步长）；0 点 / 只有 1 点 / 全部系列被关掉 ⇒ 画一句人话，不抛不崩 |
| 鉴权 / 404 | 与既有管理 API **同一套**（`Authorization: Bearer` / `X-SP-Admin-Token`，**只走请求头**）。★ **采样器本身也只在管理面挂载后才存在**：`createMetricsSampler(...)` 写在 `if (!modsDir || !token) return null;` **之后** ⇒ 没设 `SP_ADMIN_TOKEN` 时**连对象都不会建**（没有定时器、没有 `perf_hooks` 直方图、没有磁盘写入），`/admin` 与 `/admin/api/metrics` 一起 404。`caps.metrics` 供老前端判断入口 |
| ★ 可选落盘 | **设了 `SP_ADMIN_METRICS_DIR` 才落盘**（默认**一个字节都不写**）。格式 = JSONL，每行 = 定长数组（18 列）。**上限**：单文件 `SP_ADMIN_METRICS_FILE_MB`（默认 4 MB）× 最多 `SP_ADMIN_METRICS_KEEP` 个（默认 3）= **≤ 12 MB**；满了 `metrics.jsonl → .1 → .2 …` 轮转、最老的删掉。启动时把最近几个文件的点读回环形缓冲（**重启不丢历史**，实测「已从磁盘恢复 42 点」）。★ **磁盘纪律**：可用空间 < **5 GB** ⇒ 自动停写并在面板写明原因（每小时复核一次，恢复即续写） |
| 磁盘占用 | 实测一行 ≈ 150 B ⇒ 1 分钟 1 点 ≈ **213 KB/日** ⇒ 3 日 ≈ **0.63 MB**（单文件 4 MB 够装 ≈19 天） |
| 缓存 | `Cache-Control: no-store` |

**面板（`tools/mod-admin.html`）**：新增**独立的一栏、默认收起**（入口在「运行状态」卡里：
`趋势采样 1 分钟 1 点 趋势图 ▾`），**原「房间明细」那一栏一行没动**（两个面板各有自己的开关 / 轮询 / 收起状态，
可同时展开）。图 = **手写 Canvas**（**无 CDN、无 vendored 图表库**）：四张图**上下叠放、共享同一条时间轴** +
一条跨图十字线（人数 / 房间 / CPU / 延迟+内存），CPU 那张把**均值画实线、峰值画虚线并填一条阴影带**，
说明行写清 **「判断容量看峰值那条」**；12 个系列各有一个**真开关**（chip 上显示窗口内最后值），悬停气泡给
时间 + 各系列数值 + **峰值现场**；窗口 chip 六档；**导出 CSV / 导出 JSON**（拉 `raw=1` 的原始点，CSV 列含
`cpuMean` 与 `cpuPeak` 两列）；可选**散点视图**（人数 × CPU 峰值 / 人数 × 延迟均值）。
★ **文字大小跟随官方**：读**同源** `localStorage` 的 `sp.pref.settings`（= 游戏「设置 → 文字大小」那把钥匙，
见 `public/js/ui/settings.js`）⇒ `<html data-text>` ⇒ 与 `public/css/theme.css` **逐字相同的 `--t` 阶梯**；
Canvas 读不到 CSS 变量，另用**同阶梯的无量纲 `--tscale`**（sm/md = 1 · lg = 1.15 · xl = 1.3）。
★ **深 / 浅色**：本页原来是 `color-scheme: dark`（浏览器永远报 dark）⇒ 本次改成 `dark light` 并补一套
`@media (prefers-color-scheme: light)` token，**图表色 / 网格 / 气泡底色也各有两套**（`--ch-N` / `--grid` /
`--ch-band` / `--ch-tip-bg`）⇒ 页面与图一起跟着系统走。

**「不装 / 不设令牌为什么逐字节等价」**：新代码全部落在 `server/admin.js` 内部，且**唯一**的启动点
`createMetricsSampler(...)` 在 `createModAdmin` 的 `if (!modsDir || !token) return null;` **之后** ⇒
没设 `SP_ADMIN_TOKEN` 时没有任何新对象、没有任何定时器、没有任何磁盘写入，`/admin` 与 `/admin/api/*` 一起 404；
`server/index.js`、`public/**`、`mods/**`、`tools/mod.mjs` 本工序**一个字节都没动**。

**取证**（产物全在 `<开发期报告>/`）：`_114_verify_metrics.mjs`（**43 项**：形状 /
鉴权 / **真负载采样语义**（真 2 房 6 AI）/ 边界（0 点 · 1 点 · 环形回绕 · 落盘恢复 · 磁盘门禁）/ 无令牌等价 /
真机 9 张截图）→ `114-verify-metrics.txt` + `114-evidence.json` + `114-*.png`；部署 `_114_deploy.py` →
`114-step-*.txt`；报告 `114-admin-metrics-charts.md`。
★ 线上默认 60 s 1 点；本地验收用 `SP_ADMIN_METRICS_INTERVAL=5`（旋钮）在几分钟内造出真实曲线。

★ 它不是 Mod 接缝（因此**不在** §4.4 施工清单的"必须给一节"那类里）：编号挨着 §4.17 / §4.18 只是为了跟
「房间明细」「管理面 CORS」一起读 —— 三者都挂在同一个管理面上。

---

### 4.22 ★ 管理面只读的「官方 release 追踪 + 更新提示」：`GET /admin/api/upstream-release` + 定期轮询（工序 host-024）

**要解决的问题**（服主口径，2026-10-13）：服主原话「为了避免以后再次出现**未跟上官方 github 进度**的问题，
能够在 mod 管理页直接**部署一个定期追踪官方 release 版本和更新说明**，并在管理页**给出对应的更新提示**的小组件吗」。

**★ 为什么必须走 API 而不是网页**（2026-10-13 在正式服 `s10-2` 上的**只读**实测）：
`curl -sS -m 8 -o /dev/null -w '%{http_code} %{time_total}' https://api.github.com/repos/sganggs/Stronghold-Protocol/releases/latest`
⇒ **`200 0.803`**（带 UA 再测 `200 1.234`；`api.github.com/zen` 也通）；同一台机上 `https://github.com/`
⇒ **8 秒超时（curl exit 28，只收到 555776 B 首页 HTML）**。⇒ **只有 API 这一条路**，服务端自己出网即可，
不需要任何本机侧脚本、更不需要把 Release 页面抄下来。

| 项 | 约定 |
|---|---|
| 端点 | `GET /admin/api/upstream-release`（**只读**；`HEAD` 同）。`?refresh=1` = 管理页「立即检查」：**触发**一次检查但**不阻塞响应**（响应里带 `checking` 供前端回读） |
| ★ 轮询间隔 | 默认 **60 分钟**（`SP_ADMIN_UPSTREAM_INTERVAL`，**夹到 30..1440** —— 未认证的 GitHub API 限额是 **60 次/小时**，30 分钟是硬下限）。★ 另有**最小重试间隔 60 秒**：`?refresh=1` 也**不破**这个闸，响应里用 `retryAfterSec` 如实告诉前端还要等多久 |
| ★ ETag / 304 | 每次请求带上次的 `If-None-Match`；**304 只更新 `checkedAt` / `okAt`**，正文一个字节都不重解析（`stats.notModified` 记数） |
| 超时 / 降级 | 单次请求超时 **≤10 s**（`SP_ADMIN_UPSTREAM_TIMEOUT`，1000..10000）；**失败只填 `error`**，`latest` 与 `etag` **原样保留**（面板继续显示上次成功的结果）⇒ 不影响任何现有功能 |
| 响应 | `{ ok, admin: 6, enabled, repo, url, source: "github-api", checkedAt, okAt, ok, error, cached, etag, intervalMin, timeoutMs, nextCheckAt, retryAfterSec, current: {deployedApp, treeVersion}, latest: {tag, name, publishedAt, url, prerelease, draft, bodySummary, body, bodyChars, bodyTruncated, assets:[{name,size,digest}], missing[]}, behind, behindCount, versionCheck, stats, persist, checking }` |
| ★ 当前版本 | `current.deployedApp` = **`/healthz` 的 `app`**（= 本进程实际跑的版本，也就是"线上是哪一版"）；`current.treeVersion` = 本仓库 `package.json` 的 `version`（= "我们这一版"）。两者各自单列 ⇒ 切换部署的前后都能说清 |
| ★ 比对口径 | 官方 tag **去掉 v 前缀**后与我们逐段比大小（`v0.2.5` vs `0.2.5` 相等；`0.2.4` vs `v0.2.5` ⇒ `behind:true` / `behindCount:1`）。**奇怪 tag 不崩**：`v0.2.5-hotfix` ⇒ 同版本 + `note`；**认不出来的（`nightly` / 日期 `2026-10-12` / 单段 `v2`）⇒ 不判定**（`behind:false` + `warning`）—— ★ **宁可不说，也不误报有新版本**（日期 tag 若按单段解析会被当成"2026"，得出"落后 2024 个版本"这种荒谬结论） |
| 资产 | **只报** `name` / `size` / `digest`（GitHub 的 `sha256:…`；老资产没有就如实 `null`，**不伪造**）。★ **不下载任何资产**、不写 app / mods / 金标准 |
| ★ 可选落盘 | **设了 `SP_ADMIN_UPSTREAM_DIR` 才落盘**（`upstream-release.json`，缺省**一个字节都不写**，与 §4.21 的 `SP_ADMIN_METRICS_DIR` 同一风格）；同一套磁盘纪律（可用空间 < 5 GB 就停写）。启动时读回上次成功结果 ⇒ **重启不丢**，离线也有东西可展示（`cached:true`） |
| 关掉 | `SP_ADMIN_UPSTREAM=0|off|false|no` ⇒ 整块关掉：**不起定时器、不出网**，接口仍在但回 `enabled:false`，`caps.upstream=false` ⇒ 前端不显示这一栏 |
| 鉴权 / 404 | 与既有管理 API **同一套**（`Authorization: Bearer` / `X-SP-Admin-Token`，**只走请求头**）；未带 ⇒ 401；非 GET/HEAD ⇒ **405**（`/upstream-release` 与 `/upstream-release/<更多段>` 都算同一资源）。★ **没设 `SP_ADMIN_TOKEN` ⇒ `createUpstreamPoller(...)` 在 `return null` 之后 ⇒ 连对象都不建、一个定时器都不会起**，`/admin` 与 `/admin/api/*` 一起 404（与上游逐字节等价） |
| ★ 凭据 | **零凭据**：不认证即可。可选 `SP_ADMIN_UPSTREAM_TOKEN`（将来限流用）**只从环境变量读进内存**，绝不落盘 / 进响应 / 进报告 |
| 缓存 | `Cache-Control: no-store` |
| 版本号 | `ADMIN_API_VERSION` **5 → 6**（纯加成；老前端只认 `>= 1`），`caps()` 多一个 `upstream: true` |

**面板（`tools/mod-admin.html`）**：新增**独立的一栏「更新追踪」、默认收起**（入口在「运行状态」卡新增的
「官方版本」那一行里，与「房间明细 ▾」「趋势图 ▾」同一个写法），**原查房面板一行没动**。
两处提示：① 页面顶部**一句话横幅**（`★ 官方已发布 v0.2.5（2026-10-12），当前 线上 0.2.4，落后 1 个版本。`
—— **只有真的落后时才出现**，可关闭；关闭选择记在本机 `localStorage`，且**与官方 tag 绑定**：官方再发新版，
横幅会重新出现，免得关一次以后永远看不见）；② 「运行状态」里的**角标**（落后 = 琥珀色数字，不是落后 = 灰色 ✓）。
栏里显示：当前版本（写明是部署版还是本树）/ 官方最新 / 落后几个 / 发布时间 / **上次检查时间 + 数据来源 + 是否缓存** /
官方更新说明**摘要**（超 700 字截断 + 「展开全文 ▾」看完整正文）/ **资产清单（名 / 大小 / sha256）** /
**「立即检查」按钮** + 自动刷新（5 分钟）；失败时只写**一行错误摘要**，不刷屏。
★ **文字大小**读**同源** `localStorage['sp.pref.settings']`（= 游戏「设置 → 文字大小」那把钥匙）⇒ `<html data-text>` ⇒
与 `public/css/theme.css` 逐字相同的 `--t` 阶梯；**深 / 浅色**沿用 §4.21 那一套 `--ch-*` token；**零依赖**（不引第三方库）。

**「不装 / 不设令牌为什么逐字节等价」**：新代码全部落在 `server/admin.js` 内部，且**唯一**的启动点
`createUpstreamPoller(...)` 在 `createModAdmin` 的 `if (!modsDir || !token) return null;` **之后** ⇒
没设 `SP_ADMIN_TOKEN` 时没有任何新对象、没有任何定时器、没有任何出网、没有任何磁盘写入，
`/admin` 与 `/admin/api/*` 一起 404；`server/index.js`、`public/**`、`mods/**`、`tools/mod.mjs` **一个字节都没动**。
★ 定时器一律 `unref()` ⇒ 不会把进程钉住（与 §4.21 的采样器同一条纪律）。

**取证**（产物全在 `<开发期报告>/`）：`host024_verify.mjs`（**69 项真机**：契约 / 真出网 / 401 / 405 /
真机浏览器 17 项 / **落后场景（CDP 请求拦截造出"线上 0.2.4 vs 官方 v0.2.5"）12 项** / 故障退化 14 项 /
无令牌等价 7 项）→ `host024-verify.txt` + `host024-http.json` + `host024-degraded-http.json` + `host024-*.png`（8 张）·
`host024_probe_github.py` → `host024-probe-remote.txt`（只读探活原始输出）·
`test/admin-upstream-release.test.js`（20 条离线单测）· 报告 `host-024-upstream-release-widget.md`。

★ 它与 §4.21 同一类（**不是 Mod 接缝**，因此不在 §4.4 施工清单的"必须给一节"那类里）：编号挨着 §4.17 / §4.18 / §4.21
只是为了跟「房间明细」「管理面 CORS」「趋势指标」一起读 —— 四者都挂在同一个管理面上。

---

## 5. L3 战斗行为规范（`content/`）

### 5.1 入口与签名

```js
// <mod>/content/index.js
export default function setup(api) { /* 注册 kit / 每局钩子 / 元数据 */ }
// 也可以：export function setup(api) {} 或 export function install(api) {}
// 允许 async（可以自己 fetch 资源）
```

- 装载顺序：服务端 `applyModContent()` 在 `listen` **之前** `await` 一次；浏览器在 `loadBrowserSim()` 里 `fetch('/mods')` 之后。
- **两端装载同一个文件**（服务器 `file:` URL / 浏览器 `/mods/...`），两端都必须能跑。

### 5.2 `hostApi`（L3）全表

```js
function setup(api) {
  api.apiVersion   // 1
  api.id           // 你的 Mod id
  api.log          // 宿主 logger
  api.data()       // 合并后的游戏数据（单例）；**只读，不得改写**
  api.support      // server/sim/content/support/index.js
  api.targeting    // server/sim/targeting.js
  api.dir          // server/sim/dir.js
  api.body         // server/sim/body.js
  api.damage       // server/sim/damage.js
  api.constants    // server/sim/constants.js
  api.addKit(baseChessId, fn)  // 注册一个干员 kit
  api.addInstall(fn)           // 注册每局钩子 (battle) => void
  api.addMeta(fn)              // 注册预置侧 registerMeta(registry)（服务端启动时调用一次）
}
```

| 方法 | 规则 |
|---|---|
| `addKit(baseChessId, fn)` | `baseChessId` 非空字符串、`fn` 是函数。**同一 id 被两个 Mod 抢 ⇒ 后者抛错并整体回滚** |
| `addInstall(fn)` | 运行时机在**基座 domain modules 之后**、`extra` 之前 |
| `addMeta(fn)` | 只在**服务端**跑（预置界面元数据）。浏览器端不会调用 |

### 5.3 为什么不能 `import` 引擎路径

Mod 目录可能**不在**游戏仓库内（测试实例：`本地部署目录/mod/mods`，应用在 `本地部署目录/mod/app`），相对路径不可达；而且两端（Node / 浏览器）的相对根**不一样**。

⇒ **Mod 的 `content/index.js` 只依赖 `api`，不 import 任何引擎路径。** 引擎模块由宿主句柄交过去（且是**同一个模块实例**，所以状态是共享的）。

### 5.4 Kit 契约与优先级

```js
api.addKit('cyanfish_mymod_a', (bb, chess, def) => ({
  skill:  { … },                       // 默认技能的 spec
  skills: { '<skillId>': { … } },       // 按技能 id 分别给 spec
  talents: [ … ],                       // 天赋
  trait:   { … },                       // 特性
  install(battle, unit) { /* 每局安装 */ },
}));
```

- 解析顺序：`battle.opts.kits`（测试/沙箱）> **Mod 注册的 kit** > 基座手写 kit > `genericKit` 兜底。
- 技能 spec 选择：`kit.skills[选中的技能 id]` → `kit.skill`（**仅当**选中的是默认技能）→ 该技能的 generic spec（generic 的 `install` 会被**串在** kit 的 `install` 之后）。
- kit 的 `talents` / `trait` / `install` **总是生效**。
- 一个 kit 抛错 ⇒ 只记 `battle._handlerError('kit:<id>', …)`，该单位退回 generic，**战斗不崩**。

### 5.5 装载时序与 mtime 破缓存

- 服务端用 `pathToFileURL(file).href + '?mtime=<ms>'` 作 specifier。**原因**：Node 的 ESM 注册表按 URL 缓存 —— 若 URL 恒定，作者改了 `content/index.js` 再「重载」会命中旧模块，**静默跑旧代码**（最难查的一类 bug）。挂 mtime 之后：文件没动 ⇒ 命中缓存（快）；文件改了 ⇒ 重新求值。
- 浏览器端统一 `/mods/<id>/content/index.js`，靠 HTTP 缓存头（`no-cache` 重验证）保证新鲜。
- **热重载**（管理页「重载」/`POST /admin/api/reload`）会重新合并数据、重装 L3、重扫美术根，**不需要重启进程**。但**已连接的客户端拿的还是旧数据** —— 客户端本地跑战斗，两端必须一致 ⇒ 重载后**必须让玩家刷新页面**。

### 5.6 错误隔离（写代码时的义务）

- 你的 `install`/`addInstall` 回调抛错 ⇒ 宿主 `try/catch` 住，写 `battle._handlerError('modContent:<id>', …)`，**只影响你自己**。
- 你的 `setup(api)` 抛错 ⇒ `api._undo()` **整体回滚你注册过的所有东西**，其余 Mod 照常。
- **所以：不要在 `setup` 顶层做会失败的事**（读文件、假设某个数据键存在）。要做就用 `addInstall` 在每局里做，并用 try/catch 包住。

### 5.7 骨架

```js
// mods/cyanfish.mymod/content/index.js
export default function setup(api) {
  const { damage, targeting } = api;

  // 1) 这个干员的技能行为
  api.addKit('cyanfish_mymod_a', (bb, chess, def) => ({
    skill: { duration: bb.duration ?? 10 },
    install(battle, unit) {
      unit.on?.('skillEnd', () => { /* … */ });
    },
  }));

  // 2) 每局一次的东西（boss 机制、全局规则）
  api.addInstall((battle) => {
    battle.on?.('roundStart', () => { /* … */ });
  });
}
```

### 5.8 ★ 第五种 Mod 形态：修复型 Mod（包装 `battle` **实例方法**）

前面几节讲的都是「**加**东西」（加干员、加 kit、加界面）。还有一种同样常见、但官方文档里没单列的需求：
**基座行为与官方数据/文案不一致，要把它掰回去** —— 典型来源是玩家报的 bug 清单。

这类 Mod 的硬要求通常是「**不许碰基座**」（碰了就会波及所有对局，也会让基座偏离官方发布版），
所以只能用运行时的手段。**`addInstall(fn)` 回调拿到的是一个普通对象 `battle`，它的实例方法可以直接包一层：**

```js
api.addInstall((battle) => {
  // ── 手法 A：包装实例方法（在调用原函数前后插逻辑） ──────────────────────────
  const orig = battle.redeploy.bind(battle);
  battle.redeploy = (u, o) => {
    if (shouldBlock(u)) return false;     // ★ 直接伪造基座期待的成功/失败返回值
    return orig(u, o);
  };

  // 同一招对 addBuff / dealDamage / heal / retreat 都成立
  const origAdd = battle.addBuff.bind(battle);
  battle.addBuff = (unit, buff, ...rest) => {
    if (buff?.key === 'some:fixed:key') return undefined;   // 吞掉，由我按新语义重发
    return origAdd(unit, buff, ...rest);
  };

  // ── 手法 B：挂钩子，用 priority 决定「我跑在基座之前还是之后」 ─────────────
  battle.on('battleStart', () => { /* priority -50 ⇒ 晚于基座的 priority 0 */ }, { priority: -50 });
  battle.on('death',       () => { /* … */ }, { priority: 12 });
});
```

**四条纪律**（违反会变成比原 bug 更难查的问题）：

1. **`bind` 原函数再存**。`const orig = battle.foo.bind(battle)` —— 直接存 `battle.foo` 会丢 `this`。
2. **幂等**。`battle.on` 的同一个 handler 可能因为你自己的包装被重复触发；改动前先判断「需不需要改」，
   **不需要就一个 buff 都不发**（例：`cyanfish.fix-egir-bond` 的兜底路径在「全员都在场」时直接 `return`，一个 buff 都不发）。
3. **`priority` 是唯一的话语权。** 列表按 `priority` **降序**（大者先跑），同 priority 按注册顺序 FIFO。
   实测基座与已有 content 用到 −1000 / −500 / −100 / −50 / 0 / 10 / 11 / 12 / 50；
   **想要"最后说话"取 < −500**（`cyanfish.fix-targeting` 用 **−700**；
   `cyanfish.fix-egir-bond` 要把「强制退场」推迟到**所有** `battleStart` 钩子之后，直接取 **−9e8**）。
   ★ **另有两个「清场」用的极小值**：`−1e6`（`death` 钩子里清除本 Mod 的临时标志位，保证它只覆盖本次事件）。
4. **不要用 `ctx.stopPropagation` 吃掉别人的钩子**，除非你的意图就是「只准我改」。
   更安全的做法是**校验别人的结果**：如果目标集里出现了「按我的规则算不出来的单位」（说明别的 content 改写过），
   **一律让路**，不要覆盖（见 `cyanfish.fix-targeting` 的安全闸）。

★ 还有一条**非技术**的纪律：修复型 Mod 很容易「顺手多修」。
**只修用户点名的那一件事**，其余一律写进代码注释里的「有意不做」。
★ 但**「不修」的边界必须向用户确认**，别自己替用户决定 —— 有个真实的教训：
第一轮做阿戈尔修复时，我判断「用户只说了『攻击力计算』」⇒ 有意**不补**【吞噬】那 5000 点物理流失；
用户随后明确纠正：「**『吞噬』过程仍需进行，只是结算顺序不同**，应结算 部署 → 吞噬 → 击倒 → 按顺序复活」。
**教训：用户描述的往往是「现象」，不是「完整的期望」；拿不准就问，别用「只做被点名的那一件」当挡箭牌。**

**可对照的四个实体**（全部零数据补丁、零美术、零基座改动）：

| Mod | 手段 | 关键 priority |
|---|---|---|
| `mods/cyanfish.fix-targeting/` | 挂 `beforeAttack` 重排目标 | −700（压过基座 50） |
| `mods/cyanfish.fix-egir-bond/` | 挂 `battleStart`/`death` + **包装 `battle.retreat` / `battle.loseHp` / `battle.redeploy`** | **−9e8（推迟强制退场）** / 100 / −50 / 12 / −1e6 |
| `mods/cyanfish.fix-dsubrl-noattack/` | 置 `profile.noAttack` + `battle.every` 自驱动光环 | —（不挂钩子，纯定时） |
| `mods/cyanfish.fix-thorn2-stack/` | **包装 `battle.addBuff`** + `battle.every` 按覆盖数重发 | —（自吞自补） |

★ **多层包装同一个实例方法时，要记清调用顺序**：`fix-egir-bond` 里 `installForcedExitOrder` 先包 `loseHp`（L1），
`installChainThroughDown` 后包（L2 → L1 → 原函数）⇒ L2 的「记账」发生在 L1 的「吞掉」**之前**，
所以被 L1 吞掉的那一次也照样被 L2 记进 `done` —— 这正好是想要的语义（基座确实「结算过」它）。

★★ **判断「修对了没有」最硬的判据：与对照战场逐值相同。** 别只看"数值变对了"。
`cyanfish.fix-egir-bond` 第二轮就是这样收尾的：修复版 `g1.atk` 已经等于对照的 1413，
但杂兵 HP 是 **11800** 而对照是 **15900** —— 差的那一份来自「被我人为保活的『待强制退场者』
作为标记者多发出的一次【吞噬】」。根因是基座的一条规则
`for (const [m, t] of marks) { if (knocked(t) || !m.alive) continue; }`：**标记者不在场 ⇒ 不再产生标记**。
修好之后 **`g1.atk` / 吞噬额 / 杂兵 HP 三项全等**，才敢说"官方口径"。

**怎么验**：`test/helpers/battleHarness.js` 的 **`extraContent`** 与平台的 **`MOD_INSTALLS`** 是**同一条安装路径**
（`server/sim/content/index.js: installContent` 里两者都是 `try { m.install(battle) }`），
所以可以零侵入地用 harness 实证 Mod 行为，不必先装进服务器。
★ 唯一的坑：`extraContent` 的元素是**每局钩子**（`{ install(battle) }`），**不是** `setup(api)`；
需要先造一个同形宿主句柄跑 `setup(api)` 收集 `addInstall` 的 fn（工作区里现成的是 `<开发期脚本>/_modhost.mjs`）。

---

### 5.9 ★ 已知坑与边界（L3 行为代码）

**① 坑：`deploy` 事件早于同一 tick 的 `enemySpawn` ⇒ 「部署时对范围内敌人做事」的钩子取不到敌人**
（工序 63 在自选干员「灰烬」的天赋一上实测；**任何 kit 都可能踩**）

- **现象**：`battle.on('deploy', …)` 里读 `unit.rangeKeys` / `battle.enemiesInKeys(...)`，**敌人的位置与范围都对**，
  却一个都取不到 —— 天赋静默失效（不报错、`b.errors` 为 0，只有玩家看得出「部署后没触发」）。
- **实测三个数字**（`<开发期报告>/63-gen/probe-ash.mjs`，灰烬在 (10,5) 面向 RIGHT、敌人 `enemy_walk` 在 (10,8)）：
  `unit.rangeKeys.length = 12`（范围正常）· 该敌人**确实在范围内**（`enemiesInKeys(rangeKeys, unit, {canHitFly:true}) = 1`）·
  但在部署钩子跑的那一刻 `battle.enemies` 里**还没有这个敌人**（它在本 tick 的 `enemySpawn` 才入场）。
- **为什么**：tick 的固定顺序是「先 `_deploy`（发 `deploy`）→ 后 `_spawn`（发 `enemySpawn`）」，
  所以战斗开始那一 tick 的部署钩子看到的是一个**还没有敌人**的战场。战斗中途的部署（复活 / 再部署）通常看不出这个坑。
- **推荐做法**：把要做的事**延后约 2 tick**：`battle.after(0.05, () => …)`（`battle.after` 是引擎的确定性调度器；
  0.05 s ≈ 2 tick @30 Hz，观感仍是「部署后立即」）。不要用 `setTimeout` / 微任务。
- **反例**：在 `deploy` 钩子里直接 `applyStatus` / `dealDamage` / `spawnToken` —— 战斗开始那一 tick 全部落空。

**② 坑：instant / charges 技能的「pending attack」窗口在攻击结算**之前**就先 `end()`**
（工序 63 在自选干员「焰狐龙梓兰」的刚射上实测；**依赖该窗口的技能都会踩**）

- **现象**：把 `hitsFn` / `dmgMul` / `onHit` 写进 `SkillSpec.attack`，期待「下一次攻击」按它结算，
  结果这些回调要么拿不到 `onStart` 里设的状态、要么整段倍率没生效 —— 但**不报错**（`b.errors = 0`）。
- **实测四个数字**（`mods/cyanfish.collab-six/tools/verify-operator.mjs char_1048_orchd2 --skill 0 --debug` 的诊断计数）：
  `starts 5` / `ends 4`（技能在攻击结算前就结束了）、`onStart` 里读到的 `charges` 是 `2`（说明 `onStart` 确实跑了）、
  而 `attack.onHit` 触发时 `onStart` 设的标志**已被 `onEnd` 清掉**（`boosted 0`）。
- **为什么**：`skills.js activate()` 对非 `isTimed` 的技能走 `pending = !!spec.attack` 分支（:546-551），
  但这条 pending 窗口在本场景里会先被 `end()` 收掉（`onEnd` 早于攻击解析）⇒ 写在 `attack` 里的东西用不上。
- **推荐做法**：这类「发射 N 支箭矢 / 立刻多段结算」的技能，照基座 `kits/ops/op-makoto.js` 的人格面具那样
  **在 `onStart` 里直接 `dealDamage` 逐段结算**（段数 / 倍率 / 伤害类型 / 附带概率与官方逐值一致），
  不写 `attack`（`kind: 'charges'` + 无 `attack` 会立刻 `end('instant')`，正合这类「一发即走」的技能）。
  ★ 需要「攻击力提升至 X%」这种**乘法**语义时，`dmgMul` 的函数形式在 `isTimed` 技能里是正常的（见上面灰烬 S2）。
- **不受影响的对照**：`duration` / `ammo` 这类 `isTimed` 技能**没有**这个问题 —— `attack.dmgMul` / `hitsFn` /
  `onHit` 都正常生效（工序 63 实测：灰烬 S2 的「攻击被晕眩目标时攻击力提高至 210%」按 `dmgMul` 函数生效；
  麒麟R夜刀 S1 鬼人化的 `hitsFn` 二连击 / 六连击按 `hitsFn` 生效）。写 `isTimed` 技能时照常写 `attack`。
- **反例**：把一个「充能 N 次、每发多段」的 instant/charges 技能的段数与倍率写进 `attack` 里，然后依赖
  `onStart` 设的标志去选倍率 —— 段数与倍率会静默退回基座默认值。

**③ 边界：部署费用（`runtime_cost` / `cost`）在本模式里基本无处生效**

- 基座**只在 `redeploy(unit, { free: false })` 里扣 DP**（`server/sim/battle/deploy.js:213-219` 的 `const cost = unit.base.cost`）；
  **首次部署（`_deploy({ initial: true })`）一分不扣** ⇒ 官方的「**首次**部署时部署费用 -N」（`bb.runtime_cost`）
  在**本模式里是空操作**。基座同族先例已在代码注释里写明：`kits/ops/op-siege.js:21`（模组 SOL-Y「首次部署时部署费用-4」）
  —— “the first deployment of a battle costs nothing in this mode ⇒ no effect”，`op-saga.js:17` 同。
- `runtime_cost` **没有通用读取器**：全仓唯一的手工读取是 `kits/ops/chess_char_6_11-mlyss.js:307-310`（缪尔赛思 开源节流，
  她把 `runtime_cost` 当作「该玩家**第一个**莱茵生命干员的额外减免」自己加进 `base.cost`）—— 那是**她那条天赋的语义**，
  不是引擎的通用规则。`op-siege.js:60` / `op-saga.js:96` 读到它时都注明 “(no effect)”。
- ⇒ 写自选 / 补位干员的 kit 时：**不要**以为写了 `runtime_cost` 就生效；要真的改部署费用，就照
  `chess_char_2_12-gravel.js:71` / `op-sleach.js:307` / `chess_char_5_14-svash2.js:48` 那样**直接改 `unit.base.cost`**
  （并想清「首次部署本来就免费」这件事）。「不提高部署费用」（再部署费用递增）同理：本模式**没有**递增模型。
- 同类边界的另一例：干员的「再部署时间」（`respawn_time`）由 `tiles.js` 的倒地计时读取，改 `base.respawnTime` 才是它的通道。

**④ 坑：`profile.noAttack` 的单位的 `unit.atkCd` **永远不会递减** ⇒ 不能用它当自驱动节拍**
（工序 63 在自选干员「丰川祥子」的「持续攻击」上实测；**任何自驱攻击的 kit 都会踩**）

- **现象一**：想「自己有节拍地打」而写 `unit.atkCd = unit.s.interval`，结果攻击只发生一次、再也不来 ——
  `ai.js updateAlly` 的第一句 `if (u.atkCd > 0 && u.canAct) u.atkCd = attackCountdown(u.atkCd, dt);` **照样跑**，
  但第 97 行 `if (prof.noAttack) return;` 让 `u.atkCd = Math.max(u.atkCd, u.s.interval)`（第 120 行，攻击后置）
  **永远不执行** ⇒ 写进去的值没有递减者。
- **现象二（更隐蔽）**：`unit.s` 是 **getter**（`units.js:124` `get s() { if (this._dirty) this._recalc(); return this._s; }`）
  ⇒ `unit.s.atkCd = x` **静默无效**（写在 `_recalc()` 新建的临时对象上，下一帧就被丢掉）。
- **推荐做法**：自驱动节拍**自己在 `unit.mem` 里记账**（`unit.mem.xxxNextAt = battle.time + unit.s.interval`），
  **不要**碰 `unit.atkCd`。驱动源用 `battle.every(0.05, …)` —— 注意 `noAttack` 的单位**不会**进 `skills.js` 的
  tick 分支（`skills.js:411` 的 `prof.noAttack` 那支只在有技能 spec 时有效），所以别把节拍挂在 `onTick` 上。
- **反例**：把自驱攻击的节拍写成 `unit.s.atkCd = …` 或 `unit.atkCd = …`，两者都会静默失效。
- **实测**（`mods/cyanfish.collab-six/content/oblvns.js`）：修好之前祥子 S1 一场打出 **674,500** 伤害 / **899** 次
  伤害事件（节拍被压成每 tick 一次）；改成 `unit.mem.oblvnsNextAt` 记账后 = **8** 次充能释放 / **63,799**。

**⑤ 边界：`api` 的 ESM 命名空间**不转发**子模块的 import**

- **现象**：`api.body` 是 `server/sim/body.js` 的命名空间，而 `body.js` **确实** `import { hypot } from './detmath.js'`
  —— 但 ESM 命名空间**只导出自己 `export` 的东西** ⇒ `api.body.hypot === undefined`。
  `api.targeting` / `api.dir` / `api.damage` / `api.constants` 同理，都不含 `detmath` 的任何函数。
- **推论**：Mod 想用**确定性数学**（`sin` / `cos` / `atan2` / `hypot` / `powi`）**只能**靠一条显式的宿主句柄缝
  ——工序 63 新增的 `api.detmath = { sin, hypot }`（§4.16）。「反正某个模块 import 过」**不是**可用通道。
- **实测**：`<开发期脚本>/_63_detmath_seam.mjs` 的 `[2]` 段（探针 Mod 打印真实句柄键）与 `[3]` 段（全仓扫描）。

---

## 6. L4 界面扩展规范（`client/`）

### 6.1 入口与签名

```js
// <mod>/client/index.js
export default function setup(hostApi) { /* 注册插槽 */ }
// 也可以：export function setup(hostApi) {}
// 可以返回一个 dispose 函数（卸载时清理）
```

服务器**不加载**这个文件。它只在玩家浏览器里跑。

### 6.2 `hostApi`（L4）全表

```js
function setup(hostApi) {
  hostApi.apiVersion                    // 1（CLIENT_MOD_API）
  hostApi.mod                           // { id, name, version, author }（冻结）
  hostApi.snapshot                      // 整个 GET /mods 负载（静态托管时可能是 null）
  hostApi.getMods()                     // 重新 fetch 一次 /mods
  hostApi.ui                            // { html, Icon, Button, MicroLabel, TextField, Modal,
                                        //   confirmDialog, alertDialog, toast, toastError,
                                        //   Tooltip, TooltipLayer, hooks }
                                        //   ★ Tooltip / TooltipLayer = 宿主的悬浮提示（0.2.2 起，§4.12.2 三）；
                                        //   TooltipLayer 已由宿主 UiHosts 常驻挂载 ⇒ Mod 只用 Tooltip 即可
  hostApi.slots.register(slot, render)  // → dispose
  hostApi.slots.names                   // UI_SLOTS（可用插槽名）
  hostApi.loadout                       // { store, getEntries, setEntries, subscribe,
                                        //   model, isSlot, sanitize, toStored, parseStored }
  hostApi.data                          // 客户端数据单例（只读）
  hostApi.log
}
```

`hostApi.ui.hooks` = `{ useState, useRef, useEffect, useMemo, useCallback }` —— 这是**宿主的** Preact hooks，必须用它。

### 6.3 插槽注册表

> 以 `public/js/ui/extensions.js` 的 `UI_SLOTS` 为**唯一权威**（运行时可用 `hostApi.slots.names` 读）；
> 下表是 2026-10-08 的快照。

| 插槽 | 位置 | props | 状态 |
|---|---|---|---|
| `loadout.topbar` | 干员调配顶栏右侧，**紧挨「已同步」左侧** | — | 首个插槽。★ **0.2.3 · 工序 72 起：本 Mod 的皮肤入口不再挂这里**（`cyanfish.skinvoice` 0.19.0 只在这一格放"没装「模组设置」时的兜底设置齿轮"，装了则返回 `null`）⇒ 顶栏里同一时刻只有一个「设置」入口 |
| `settings.sections` | **官方设置弹窗**（战斗内左下角 `.gm__gear` 打开的那个 `SettingsModal`）的内容列**末尾**，在「快捷键」之后、结尾提示行之前 | — | 2026-10-08 新增（服主口径：模组设置要与官方设置**同一入口**） |
| `loadout.diySlotActions` | 「干员调配 → **自选编队**」页里，**每个已填充槽位**的操作区 `.diy-slot__acts` 末尾（官方「更换 / 清空」**之后**） | `{ slotId, charId, tier, elite }` | 2026-10-08 新增（服主口径：自选编队的皮肤选择要在自选页面单独做 UI） |
| `loadout.rowActions` | 「干员调配」名单**每一行的最右侧那一格**（`.lo-card` 的直接子节点，紧跟官方第 4 列「潜能 · 练度」之后）。表头 `RosterHead` 的同一格走**同一个插槽**（`props.head === true`） | `{ head: boolean, chess?, m?, charId?, golden?, level?, ops?, selected? }`（表头那一格只有 `head`） | 2026-10-10 新增（工序 48；「就地按行换肤/换语音」）。★ **条件式第 5 列**：宿主 CSS 只在 **≥1600px 且真有注册者**（`.lo-list:has(> .lo-list__rows > .lo-card > .lo-arow:not(:empty))`）时打开第 5 轨，且那一轨的下限用 `max-content`（不是 0）⇒ 控件不会被压扁。★ 现行唯一注册者 `cyanfish.skinvoice` 0.17.0 起在这一格只放**一个**控件（皮肤下拉；「单干员语音」那件已随语种轴删除），宿主 CSS 与断点**未改** |
| `loadout.detailActions` | 「干员调配」**详情面板** `.lo-detail__body`，紧跟官方「潜能与练度」那一段（`CultivationSection`）之后 | `{ m, chess, charId, golden, level, ops, notOwned }` | 2026-10-10 新增（工序 48；与 `loadout.rowActions` **成对**：窄屏放不下时注册方把控件降级到这里）。★ **0.2.3 · 工序 72 起降为"老宿主降级口"** —— 现行落点是下面那条 `loadout.detailVoice`（官方语音的下一行），注册方**只在没有新插槽时**才用这一条（两条不会同时有人注册 ⇒ 详情面板里永远只有一个控件） |
| `loadout.detailVoice` | 「干员调配」**详情面板** `.lo-detail__body` 里，**紧跟在官方「此干员语音」控件（`ui/operatorVoice.js` 的 `OperatorVoice`，0.2.3 新增，是该容器的第一个子节点）之后** —— 也就是「语音配置的**下一行**」 | `{ m, chess, charId, golden, level, ops, notOwned, standIn }` | ★★ 2026-10-11 新增（**0.2.3 · 工序 72**；服主裁定「把干员时装放在干员独立语音配置下一行」）。★ 为什么不能再复用 `loadout.detailActions`：那一条在官方 **`CultivationSection`（潜能与练度）之后**，与语音控件之间隔着一整段，真机实测 1920×1080 时语音底 **464.5** / 旧落点顶 **693.5**（相距 229px）、1280×800 时 313.9 / 499.3 —— **不是"下一行"**，而位置本身就是本工序的需求。★ 与 `loadout.rowActions` **并列**（而不再是"窄屏降级"）：**宽屏也画**，因为详情面板本来就开着 |
| `lobby.topbar` | **首页**（`screens/lobby.js` 的 `.topbar__left`）**紧随官方 `<PingPill>` 之后** —— 状态读数那一族（连接状态 / 延迟 / 在线人数） | — | 2026-10-11 新增（工序 61；「待更新⑤」首页在线人数）。★ 为什么是左组：`.topbar__right` 是按钮组，往里塞读数会把它挤到换行 |
| `lobby.banners` | **首页**「顶栏之下、`.lobby-body` 之上的整条横幅带」（`.screen` 这个 flex 纵向容器的**直接子节点**，插在 `</header>` 与 `.lobby-body` 之间） | — | 2026-10-11 新增（工序 61；「待更新④」实时横幅公告）。★ 注册方自己的根节点负责 `flex: none` 与宽度对齐（`.lobby-body` 是 `max-width:19.2rem` + 水平居中），宿主**不为它写任何 CSS** |
| `game.banners` | **对局内**「靠顶部的一条**弹幕通道**」（`screens/game.js` 的 `.gm__hud` 的**直接子节点**，紧跟官方 `<header class="gtop">` 之后、`.gm__bonds` 之前；注册方把通道放在 `top:1.0rem`，即官方 `.ticker` 用的那条带） | — | ★ 2026-10-12 新增（**0.2.3 · 工序 77**；服主口径「**对局中也要能看到**」→「横幅公告可以做成**类似弹幕的从靠顶部的右侧飘过 + 半透明 + 点击穿透**，这样就不用太考虑遮挡问题」，`cyanfish.banner` 1.2.0）。★ 为什么对局内只能用"飘过"：对局界面全是绝对定位（战场 `inset:0` + HUD 各面板各自 `absolute`），**没有流内空行**；顶栏 `.gtop` 占 0 ~ 0.82rem、官方 `.ticker` 占 1.0 ~ 1.3rem、盟约带 `.gm__bonds` 从 1.36rem 起、官方「回合」框在顶栏正中（1920 时 y 39 ~ 83）⇒ 工序 77 真机试过两种**常驻**落点：放 ticker 那条带与 `.gm__bonds` **交叠 17px**；放顶部整幅窄带与「回合」框 **交叠 12~24px**（且常驻 = 长期占用关键信息）。⇒ 唯一"能显示又不长期占位"的形态就是**飘过**：真机实测任一固定点（「回合框」中心）单次只被覆盖 **≈1.9 秒**，单次飘过 9 秒、每 45 秒再飘一次。★ 契约：注册方自带**全部** CSS（通道位置、半透明、`@keyframes` 动画、`prefers-reduced-motion` 降级），并**必须** `pointer-events: none`（宿主 `.gm__hud > *` 是 `auto` ⇒ 注册方要用 `!important` 压过，否则一条盖满整幅宽的通道会拦掉底下所有点击）；宽度不超过官方 ticker 的 7.6rem。宿主**不为它写任何 CSS**。真机四视口矩形 / 点击穿透（`elementFromPoint` + 真鼠标）/ 零痕迹证据见 `<开发期报告>/77-inmatch-banner-and-token.md`。★★ **0.2.3 · 工序 90 起这条插槽有第二个生产者**（`cyanfish.danmaku` 的观战者弹幕）：两者**共用同一条通道**，后来者按下面那条「多生产者」契约**让位**，两条弹幕永不重叠（判据 `mods/cyanfish.danmaku/client/plan.js` 的 `canStartPass()`；证据 `<开发期报告>/90-spectator-danmaku.md`） |

- 名字**必须**取自 `hostApi.slots.names`；**未知插槽会直接抛错**（拼错名字不会静默失败 —— 这是故意的，否则作者会一直找「为什么我的按钮不出现」）。
- ★★ **`game.banners` 是一条"多生产者"插槽：注册方必须**自己**在这条通道上排队**（工序 90 立的契约）。
  对局内**没有第二条可用通道**（真机几何：官方顶栏 0 ~ 1.0rem、官方 `.ticker` 1.0 ~ 1.34rem、盟约带从 1.36rem 起
  ⇒ 100~136px 那条窄带已经给了这条插槽），两个注册者若各自把根节点放在 `top:1.0rem` 就会**完全重叠**。
  ⇒ 第二个注册者（`cyanfish.danmaku` 的观战弹幕）**不叠加、只让位**：它的 `canStartPass()` 读
  `.sp-bn--game .sp-bn__row` 的**几何**（不是"节点在不在" —— 横幅那个根节点在 45 秒空档里也挂着），
  要求「此刻不在屏上 **且** 最近 12 秒内没见它飘过」才起一轮。★ 后来者请照这个形状办（读对方的公共类名做
  几何判据 + 让位），**不要**用 `:has()`（本库禁用它，见 §6.4 与 `test/client-static.test.js` 的静态审计）——
  那条禁令是有意的：`:has()` 在 Firefox ESR 115 / Safari < 15.4 上不可用。
- **必须走插槽注册，不得自己往 DOM 里塞节点**：宿主的界面是 Preact 组件，塞进去的节点会被下一次渲染冲掉（干员调配每次改选择都会重渲染）。**宿主拥有「放哪」，Mod 拥有「放什么」。**
- 多个 Mod 注册同一插槽 ⇒ 按 `/mods` 顺序（即加载顺序）依次渲染为**兄弟节点**（不加外层 wrapper，所以宿主的 flex gap 对它一样生效）。
- **没装任何 Mod ⇒ `<UiSlot>` 渲染 `null`**，DOM 与改动前完全相同。
  ★ 这一条是**硬约束**，新增插槽必须自证：`loadout.diySlotActions` 落地时的证据是三次抓取
  （上游原版 `diy.js` + 0 Mod / 改动后 + 0 Mod / 改动后 + 装 Mod）里每个槽位操作区的 `outerHTML`
  **逐字节相同（780 字节）**，空槽位两边都根本不渲染操作区；`settings.sections` 同理
  （0 Mod 实例的 `SettingsModal.outerHTML` 5865 字符，装 Mod 后摘掉模组子树仍逐字符相同）。
  ★ `loadout.rowActions` / `loadout.detailActions`（工序 48）的自证在
  `<开发期报告>/48-skinvoice-adapt.md`：11 个视口逐一体检 + 窄屏 `/assets/audio` 等实测；
  两条插槽的"空"判据由 `UiSlot` 的 `null` 本身保证（`null` 不进 DOM），第 5 轨另外还要求
  **≥1600px**（`@media (max-width:1599.98px){ .lo-arow{display:none} }`）⇒ 两个条件任一不成立，
  行与表头的列数、DOM 与像素都与加这个插槽之前**逐值相同**。
  ★ `loadout.detailVoice`（工序 72）的自证在 `<开发期报告>/72-skin-detailrow.md`：
  「不装 Mod」与「装了但停用 skinvoice」两个实例的 `.lo-detail__body` 子节点列表 + `outerHTML`
  **逐字节相同**（归一化动态 id 后），且 1920 / 1600 / 1280 / 844×390 四视口下控件矩形与命中证据齐全。
- ★★ **插槽的"零痕迹"只是最低要求；位置本身也是契约**（工序 72 的教训）：`loadout.detailActions` 与
  `loadout.detailVoice` 都在同一个容器里、`UiSlot` 都渲染 `null`，但**差着 200~400px 的位置**
  ⇒ 「再开一条」是正当的（复用它反而会让"放哪儿"这个需求无处表达）。新增插槽时把**位置**写进这一列。
- ★★ **撤除的插槽要在此登记**（工序 72 撤了 `loadout.topbarLeft`，工序 64 为 `cyanfish.skinvoice`
  0.18.0 的顶栏皮肤入口加的）：服主裁定「顶栏左侧的皮肤控件不用留」之后它**没有任何注册者**
  ⇒ 留着就是死插槽（空插槽虽然零节点，但会误导下一个人以为"顶栏左组是给 Mod 留的"）。
  撤除同时删掉了 `screens/loadout.js` 的 `<UiSlot name=${UI_SLOTS.LOADOUT_TOPBAR_LEFT} />`
  （`.lo-top__left` 回到官方原样：只有「返回」一个按钮）。★ 纪律：删插槽要**连带**删宿主侧的
  `<UiSlot>` 与 `loadout.js` 里的那一个节点，只删常量会留下一个"永远不会有人注册"的渲染点。
- ★ **插槽是只增不改的契约**：给已有插槽加 props 属于破坏性变更（老 Mod 收不到新字段），要么新开插槽，要么把新字段做成可选并写进本节。

★★ **历史更正（工序 72）：皮肤控件**可以**放详情面板 —— 早期"放不进详情页"的论断已作废。**
早期分析（`卫戍协议-皮肤与语音Mod化分析.md` §0.2「代价：控件的位置必须变」）写的是
「详情头（「恢复默认」左侧）**无法在不改基座的前提下插入**」⇒ 控件只能落顶栏。这句话里
**对的是边界、错的是推广**：
- **至今成立**：Mod **自己往宿主屏幕里塞 DOM** 一定是死路（`screens/*` 是 Preact 组件，下一次渲染就冲掉；
  `.lo-card` / `.lo-detail__body` 都是受控子树）⇒ 这条纪律（6.4 第 1/3 条与本节"不得自己塞节点"）不变。
- **已经作废**：把它读成"详情页**装不下**这类控件"。真实约束只是"**宿主当时没有在详情页开插槽**"，
  而插槽是**宿主侧随时可以加的一行**：0.2.2 宿主自己就开了 `loadout.detailActions`（详情面板内），
  0.2.3 官方更是把逐干员语音控件 `<OperatorVoice>` **摆进了同一个容器**（`.lo-detail__body` 第一个子节点）。
  ⇒ **结论：详情面板完全容得下按干员的控件**，缺的只是宿主给它一格（本工序补的就是这一格）。
- **判据**：真机 1920×1080 下官方 `.lo-voice` 与我们的 `.sp-sv__vrow` **垂直相邻、水平对齐**，
  且该行在**四个视口**（1920 / 1600 / 1280 / 844×390）都可见、可点、不溢出
  （矩形 + `elementFromPoint` 命中见 `<开发期报告>/72-skin-detailrow.md`）。

### 6.4 五条硬性禁令

1. **必须用 `hostApi.ui.html` 与 `hostApi.ui.hooks.*`** —— 用你自己 bundle 的 preact 会得到另一棵 vnode 树。
2. **可用的 preact 构建里没有 `createPortal`。** 要弹窗就走 `hostApi.ui.alertDialog({ text: <Panel/> })`：`text` 可以是一个组件元素，它渲染在应用根部 —— 这就是「没有 portal 也能显示富面板」的办法。
3. **不要写全局 CSS 选择器。** 需要样式就用宿主已有的 class，或给根节点加一个你自己的前缀（如 `mymod__`）。
4. **风格统一靠公共 props**：`variant="secondary" size="sm"` + `hostApi.ui.Button` / `MicroLabel` / `TextField` / `Icon`。不要自己画按钮。
5. **不得有服务端副作用 / 不得依赖服务端状态。** 这个文件服务器根本不加载；任何「我要在服务器上也做点什么」的想法都属于 L3，请放 `content/`。

### 6.5 `chessIds` 与「未安装 / 未启用」归因

`GET /mods` 的每个 Mod 都带 `chessIds: string[]` —— 它**声明**要新建的干员 id（读 `data/chess.json` 里 `add` / `clone` 的顶层键）：

- **与启用状态无关**：**停用的 Mod 也照常下发**。理由：玩家最常见的困惑是「我装了这个包但忘了启用」。
- 判断别人分享的配置里某个干员为什么没有：

| 现象 | 归因 |
|---|---|
| 干员在本服数据里存在 | 正常 |
| 干员在某个 Mod 的 `chessIds` 里，且该 Mod `enabled: false` | 「来自已停用的 Mod X」 |
| 干员在某个 Mod 的 `chessIds` 里，但该 Mod **不在** `/mods` 列表里 | 「来自未安装的 Mod X」 |
| 干员在某个 Mod 的 `chessIds` 里，且该 Mod `skipped: true` | 「来自有问题的 Mod X」 |

**不要**把「配置里出现未知干员」直接显示成「未知干员」—— 一定要按上表细化。

### 6.6 失败降级（无声但一致）

任何失败都**无声降级**成「没有界面扩展」，绝不拖垮页面：

- 取不到 `/mods`（静态托管 / 老服务器 / 离线）⇒ `null` ⇒ 没有扩展；
- 模块 `import` 失败 / 没有默认导出 / `setup` 抛错 ⇒ 该 Mod 记 `failed`，**它已经注册的插槽会被撤销**（不留半个注册），其余 Mod 照常。

⇒ **不要指望你的 `setup` 抛错会有人看见**：请在 `setup` 里自己 try/catch 并 `hostApi.log.warn` 出来。

### 6.7 骨架（干员调配顶栏按钮 + 富面板）

```js
// mods/cyanfish.mymod/client/index.js
export default function setup(hostApi) {
  const { html, Button, alertDialog, hooks } = hostApi.ui;
  const { useState } = hooks;

  function Panel() {
    const [n, setN] = useState(0);
    return html`<div class="mymod__panel">
      <p>点了 ${n} 次</p>
      <${Button} variant="secondary" size="sm" onClick=${() => setN(n + 1)}>加一</${Button}>
    </div>`;
  }

  const dispose = hostApi.slots.register('loadout.topbar', () => html`
    <${Button} variant="secondary" size="sm" onClick=${() => alertDialog({ text: html`<${Panel} />`, title: '我的面板' })}>
      我的按钮
    </${Button}>`);

  return dispose;   // 卸载时清理
}
```

---

## 7. 美术规范（`assets/`）

### 7.1 `/assets/**` 的查找顺序

```
GET /assets/<path>
  1. public/assets/<path>                    ← **优先**
  2. 每个启用 Mod 的 <mod>/assets/<path>      ← 兜底；两个 Mod 撞同一相对路径 ⇒ 按 Mod 顺序**先到先得**
  3. 都没有 ⇒ 404
```

### 7.2 ★ 同名覆盖**无效** ⇒ 必须「新文件名 + 改数据指针」

因为 `public/assets` **优先**，往 Mod 里放一个与官方同名的文件**永远不会被用到**。

把新文件放进 `assets/`，改名为**未被占用**的名字，然后**改数据里的指针**：

```json
// data/assets.json 里把某个字段指向你的新文件
{ "ops": [ { "op": "replace", "path": "<某条记录>.<某字段>", "value": "mod_assets/archetto_sale14/portrait.png" } ] }
```

### 7.3 需要改指针的典型位置

| 想换什么 | 改哪里 |
|---|---|
| 干员头像 / 立绘 | `data/chess.json` 里该干员的头像/立绘字段 |
| 战斗小人 | 同上（spine / 动画资源引用） |
| 技能图标 | 该干员的 `skillIndices` 相关口径（技能 icon 索引） |
| 物品/效果图标 | `data/items.json` / `data/effects.json` |
| 通用资源 | `data/assets.json`（**美术指针表**） |

> 具体字段名以 `docs/ASSETS.md` 为准（那里是美术寻址的权威口径）。

### 7.4 出处与授权（**必须**）

自带美术的 Mod **必须**在根目录放一个 `SOURCE.md`（或写进 `README.md`），至少包含：

- 每个文件的**官方出处**（干员 / 时装编号 / 图鉴页）
- **sha1**（便于别人核对没有被替换）
- 声明「素材版权属鹰角网络/Yostar，不适用 GPL，本 Mod 免费分发且**不用于任何盈利形式**」

### 7.5 体积

`assets/` 会随 `.spmod` 一起分发（白名单里有它）。发布前用 `du -sh assets/` 看一眼；单包十几 MB 是正常的（立绘+小人），但别把源文件（.psd / 未压缩 .png）打进去。

---

## 8. 打包与分发（`.spmod`）

### 8.1 包格式

`.spmod` 就是一个**普通 ZIP**（文件名后缀不同）。平台自带零依赖 ZIP 读写（`server/mods/zip.js`），只支持最小子集：**无 zip64 / 无加密 / 无分卷**，文件名 UTF-8，`store` 与 `deflate` 都支持。

⇒ 单文件、可分发、**任何解压工具都能打开**（便于别人审查）。

### 8.2 安装白名单（唯一合法的包内条目集）

`install` 时**只落盘**下面这些，其余一律跳过并计数报出：

| 条目 | 说明 |
|---|---|
| `mod.json` | 必需 |
| `data/**` | 数据补丁 |
| `content/**` | L3 行为代码 |
| `client/**` | L4 界面扩展 |
| `assets/**` | 自带美术 |
| 根目录 `*.md` / `*.txt`（文件名 `^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|txt)$`） | README / SOURCE / LICENSE |

- 会**跳过**：隐藏文件、其它目录、`.state.json`（本机状态）。
- 会**拒绝**越界路径（防 zip-slip）。

> **★ 最常见的打包事故**：以为 `assets/` / `client/` 不在白名单里。它们**在** —— 但如果你把美术放在 `art/`、`img/` 之类的目录名下，它会**被静默跳过**，装完「一个美术文件都不剩」（皮肤/立绘全 404），而 `data/` 补丁照常生效，于是现象非常迷惑。**目录名必须是 `data/` `content/` `client/` `assets/`。**

### 8.3 CLI 命令全表

```bash
node tools/mod.mjs <command> [args] [--mods <dir>] [--json]
```

| 命令 | 作用 | 退出码 |
|---|---|---|
| `list` | 列出 Mod（含启用状态、校验结果、**落地轴一览** `数据×N+行为+界面+美术`） | 有错误 1 |
| `validate [<id>]` | 校验（默认全部） | 有错误 1 |
| `lint <dir>` | 校验**任意**目录（不必在 `mods/` 下）—— 预打包门禁 | 有错误 1 |
| `pack <id> [-o out.spmod]` | 打包（**先校验，不通过拒绝**；`--force` 强打，别用） | 0 / 1 |
| `install <file.spmod>` | 安装到 `mods/<id>/`（装完立即再校验） | 0 / 1 |
| `uninstall <id>` | 移到 `mods/_removed/`（**不直接删**） | 0 / 1 |
| `enable <id>` / `disable <id>` | 启停（**重启游戏服务后生效**） | 0 / 1 |
| `verify [--mode <modeId>] [--rolls N]` | **真实引擎**实抽，验证新增干员真进了抽卡池 | 0 / 1 |

通用选项：`--mods <dir>`（默认 `<repo>/mods`，其次环境变量 `SP_MODS`）、`--json`。
退出码约定：`0` 成功 / `1` 校验或业务失败 / `2` 用法错误。

### 8.4 分发 / 安装流程

```
作者：  lint → verify → pack  →  xxx-1.0.0.spmod
对方：  install 该 .spmod  →  默认启用  →  重启游戏服务  →  完成
```

**玩家不需要装任何东西**：数据与界面扩展都由服务器在 `/data/*.json` 与 `/mods` 里下发，玩家拿到网址就能玩。

### 8.5 上线到服务器

| 路径 | 适用 | 做法 |
|---|---|---|
| **管理页**（推荐） | 日常装/停/重载 | 打开该实例的 `/admin`，连上后上传 `.spmod` 安装；「重载」按钮可**不重启**生效（拿旧数据的客户端需刷新） |
| 热重载 API | 自动化 | `POST /admin/api/reload`（需令牌，**只走请求头**） |
| 手工 | 首次装机/救援 | 把 Mod 目录放进 `$SP_MODS`，`node tools/mod.mjs enable <id> --mods <dir>`，然后重启服务 |

> `$SP_MODS` 未设置 ⇒ **纯原版**，行为与没有 Mod 系统时完全一致。

---

## 9. 版本与兼容

### 9.1 三个版本号，别混

| 名字 | 在哪 | 含义 | 谁升 |
|---|---|---|---|
| `apiVersion`（= `MOD_API_VERSION`） | `mod.json` | **补丁语法 / 清单字段集 / 四条通道契约**的版本 | **平台维护者** |
| `gameVersion` | `mod.json` | 目标游戏版本 | Mod 作者，跟着游戏版本走 |
| `CLIENT_MOD_API` | 代码常量 | L4 `hostApi` 的形状版本 | 平台维护者 |
| L3 `api.apiVersion` | 代码常量 | L3 `hostApi` 的形状版本 | 平台维护者 |

### 9.2 什么时候**必须**升 `apiVersion`

- 新增/改变/删除补丁 op 的语义
- 清单字段的必填性或含义变化
- `content/` 或 `client/` 的入口约定、`hostApi` 形状变化
- `/mods` 或 `/data` 的对外负载结构变化

**升了之后**：所有 `apiVersion !== 1` 的 Mod 会被**判错并跳过**（这是刻意的：宁可报错也不要用错的语义跑起来）。

### 9.3 `gameVersion` 是**严格相等**

清单里 `gameVersion` 与当前游戏版本不一致 ⇒ 该 Mod 被跳过（`lint` / `validate` 也报错）。

★ **当前宿主版本 = `0.2.4`**（`shared/constants.js` 的 `APP_VERSION` = `package.json` 的 `version`，`tools/mod.mjs` 从后者读）。全仓 23 个 `mod.json` 的 `gameVersion` 现在**都是 `"0.2.4"`**。
**自检命令**（一条就能看出宿主版本与门禁口径）：`node tools/mod.mjs validate` —— 通过的 Mod 数应等于 `mods/` 下的目录数（当前 **23**）。

⇒ **游戏打版本号时，所有 Mod 必须一起改**。这是刻意的门禁：数据文件的形状会随版本变化，跨版本硬跑会得到**静默错误**而不是崩溃。

### 9.4 破坏性变更流程

1. 在 `docs/` 与本文档记录变更；
2. `MOD_API_VERSION += 1`；
3. `lint` 全量跑一遍，列出所有将被跳过的 Mod；
4. 通知每个 Mod 作者升级（本次变更给出迁移要点）。

---

## 10. 验收与自检（**提交前必做**）

### 10.1 五道门

| # | 门 | 命令 | 通过判据 |
|---|---|---|---|
| 1 | 目录自检 | `node tools/mod.mjs lint mods/<id>` | 0 错误 |
| 2 | 全仓校验 | `node tools/mod.mjs list` | 你的 Mod 是 `● 启用`，无 `错误:` |
| 3 | 真引擎实抽 | `node tools/mod.mjs verify` | `全部新增项均可在商店正常出现` |
| 4 | 打包 | `node tools/mod.mjs pack <id>` | 产出 `.spmod`，文件数与你预期一致（**数一下 `assets/` 有没有进包**） |
| 5 | 对局验收 | 你的验收脚本（见下） | 装/不装的 ≤N 指纹一致 |

**★ 平台级门禁（改动触及基座 / 文档 / 部署，或交报告之前必跑）** —— 数字是 **2026-10-12 的基线**，动了就说明你改了东西：

| # | 门 | 命令 | 当前基线 | 判据 |
|---|---|---|---|---|
| P1 | 全仓清单校验 | `node tools/mod.mjs validate` | **23 个目录全部通过，0 错误** | 通过数 = `mods/` 目录数 |
| P2 | **golden 回归** | `node tools/golden.mjs` | **287/287 零 digest 漂移**（`roster 49 + bonds 46 + fields 22 + matches 20 + standins 10 + diy 140`） | ★ **要动 `test/golden/*.json` 必须点名场景**；没点名 = 回归 |
| P3 | 全量单测 | `node --test`（重定向到日志再统计） | `tests 6146 · pass 6116 · fail 8 · skipped 22` | **比 `not ok` 的集合，别比总数**；8 条既有红的身份见 `<开发期工作区>/MOD-SESSION-STANDARD.md` §3 |
| P4 | 语法 | `node --check <每个改过的 .js>` | 0 输出 | — |
| P5 | 卫生 | LF / 无 BOM / 模板字面量里无嵌套反引号 | — | 见 `MOD-SESSION-STANDARD.md` §2 红线 |

### 10.2 ★ 等价性证明的做法（L2 数值 Mod 必须做）

只跑单测不够：必须**真开一局**，比对**状态与每一帧广播**的指纹。

**关键做法（踩过坑）**：

1. **必须建「只装本 Mod 的隔离仓库」**再对照。
   拿整个 `mods/` 目录做 on/off 对照是**错的** —— 里面还有别的 Mod（示例干员/结城理/空弦皮肤/导入导出），它们会新增干员，于是「装了 Mod 的 4 人 vs 没装 Mod 的 4 人」必然不同。**那是别人的 Mod 在起作用。**
2. 在**同一进程**里装三套独立 ESM 模块图（`import(pathToFileURL(...))` 并清掉 `SP_MODS`），比：
   - 全定义域逐值（牌库份数 × 每个计数、血池倍率、ban 表、发卡数）
   - **定种子真对局**的状态指纹 + 每一帧广播指纹
   - **房间级**（`room.setSeats` 这类接口）：两间房各自调容量**互不影响**；缩容不得低于**已占用深度**；不装 Mod 时 `room.state` 的**键集合**与改动前逐键相同、协议边界不变
3. 判据：**上游 ≡ 基座 = 0 格差异**；装了 Mod 的 ≤N 与不装的 **逐字节相同**。
4. 顺带证明「对上游是**纯插入**」（上游每一行都还在、按序保留，新增行数可数）——这条判据比「看 diff 眼熟」硬。

### 10.3 环境坑（会误导你判断「是不是我改坏了」）

| 现象 | 真相 |
|---|---|
| `client-static.test.js` 大批 `EBUSY errno -4082` | `spawnSync(process.execPath, …)` 在本机会话恒失败。**环境性**，与你的改动无关 |
| 性能/benchmark 测试红 | 绝对阈值基准，机器负载相关。**环境性** |
| `fs.cpSync` 拷大目录树**静默 127 退出** | 换成逐文件 `readFileSync`/`writeFileSync` |
| 同一份代码不同会话里 EBUSY 的有无不同 | ⇒ **比 `not ok` 的集合，别比总数** |
| `node --test` 全量很慢 | 用后台任务跑，**读日志文件统计**，别依赖退出码 |

### 10.4 提交前 Checklist

- [ ] `lint` 0 错误、`list` 里是 `● 启用`
- [ ] 新干员过 `verify`（真引擎实抽）
- [ ] 没装 / 停用 / 装坏 三条路径都回到官方行为
- [ ] 非法数据全部回落官方值，**没有**任何一条会把服务器或房间变成不可玩状态
- [ ] 补丁用的是 `add`/`clone`/`replace`/… 中**语义正确**的那个（别用 `replace` 干 `add` 的事）
- [ ] 成员表用 `append`，**没有**用 `deepMerge` 覆盖数组
- [ ] `identifier` / 干员 id 都带了作者前缀，没撞官方
- [ ] 美术是**新文件名** + 改了数据指针，并带 `SOURCE.md`
- [ ] `.spmod` 里数过 `assets/` 的文件数
- [ ] 等价性证明（L2）或 ≤N 无影响证明（L1）
- [ ] 新增接缝（若有）**不装 Mod 时是空操作**：同一份输入下 `room.state` 键集合、协议边界、界面文案逐字逐节点与改动前相同
- [ ] `gameVersion` 与宿主 `package.json` 的 `version` **逐字符相同**（★ 当前 = **`0.2.4`**）
- [ ] ★ `summary` **一句话 ≤ 50 字、不含细节**；`description` 按话题分段；**设置页没有无效项**（§4.12.8）
- [ ] ★ 新增/改动的**文本文件是 LF、无 BOM**；**JS 模板字面量里没有嵌套反引号**（`MOD-SESSION-STANDARD.md` §2）
- [ ] 只在**测试实例**上跑过，没碰正式服

---

## 11. 并行开发约定

### 11.1 命名空间分配

多人并行开发时，**每个作者独占一个前缀**：

| 资源 | 分配方式 | 例 |
|---|---|---|
| Mod id | `<作者>.<功能>` | `cyanfish.max-seats` |
| 新干员 id | `<作者>_<名>_a`（普通）/ `_b`（金色） | `cyanfish_makoto_a` / `cyanfish_makoto_b` |
| 新敌人 / 地图 / 特质 / 盟约 key | `<作者>_<名>` | `cyanfish_volcano` |
| 干员 `identifier` | 从 900 起，**报备后独占** | 900 / 901 / 910 / 911 / 950 |
| 美术相对路径 | `<作者>/<mod>/…` | `mod_assets/archetto_sale14/…` |
| 插槽名（新增插槽时） | 由平台维护者分配（见 §6.3；现有 `loadout.topbar` / `settings.sections` / `loadout.diySlotActions` / `loadout.rowActions` / `loadout.detailActions` / **`loadout.detailVoice`** / `lobby.topbar` / `lobby.banners` / **`game.banners`**；★ `loadout.topbarLeft` 已于工序 72 撤除） | — |

### 11.2 谁能改基座

| 区域 | 谁可以改 |
|---|---|
| `mods/<你的 id>/**` | **所有 Mod 作者**（这是你的领地） |
| `data/*.json` | **谁都不许手改**（是 `build-data.mjs` 的生成产物，重跑会被覆盖） |
| `shared/**`、`server/**`、`public/js/ui/**` | **只有平台维护者**。理由：多处改动会互相踩，且必须同时维持 §1.3 的三条硬约束 |
| `public/css/**` | **只有平台维护者**。CSS 是**全局作用域**（没有模块边界、没有命名空间），一条选择器就能波及全站 ⇒ 与 `public/js/**` 同待遇。★ 但**纯布局加固**（不动 DOM、不动 JS）有一条便宜的取证路径：**几何逐值 + 渲染出的 DOM `outerHTML` 逐字节相同 + 面板区域没有任何 Δ>4 的像素** ⇒ 足以证明「不溢出时零影响」。见 §11.5 与第六批队友列表滚动（`<开发期脚本>/verify_team_scroll.mjs`）。★ 若这条加固**需要配套 JS**（例：第六批的「鼠标按住拖动」，浏览器没有这个原生行为），那段 JS 走 `public/js/**` 的常规路径（单测或等价性脚本 + 服务器实装记录），**并且**「哪些区域可交互」这件事必须在两侧用**同一个量**表达（第六批：CSS 的命中片 `1.02rem` ↔ JS 的 `zoneRight()` = 头像按钮右缘，验收里专门断言两者一致）——否则会悄悄变成两套尺寸 |
| 要「改基座的能力」怎么办 | **提接缝需求**（§4.4 施工清单）→ 平台维护者加一条中性读取器 → 你用数据落地 |

### 11.3 冲突的三种情形

| 情形 | 表现 | 处理 |
|---|---|---|
| **抢同一数据路径** | ① 两边写的值**不同** ⇒ `与其它 Mod 冲突: X 已被 "Y" 改过`，该 Mod 整体回滚；② 两边写的值**逐字节相同**（工序 88）⇒ **不算冲突**，只出一条聚合 warning `与 "Y" 重复写入 N 条相同路径（值逐字节相同 ⇒ 按幂等处理，不算冲突）` | ① 拆开路径、或一方改用不同的键（**冲突判定不看顺序，只看有没有第二个 Mod 碰过同一路径且值不同** ⇒ 顺序解决不了）; ② 不用动。★ 想彻底消掉提示：让**一方**声明这条数据（另一方不必重复声明） |
| **抢同一 `addKit` id** | `addKit: X 已被 "Y" 注册`，后者整体回滚 | 一个干员只能有一个 kit。要「叠加效果」请用 `addInstall` 做全局钩子 |
| **加载顺序敏感** | 补丁结果依赖先后 | 用 `loadAfter: ["other.mod"]` 声明；无 `loadAfter` 时按 `state.order`（管理页排序）→ 再按 id 字典序 |

`loadAfter` 指向**不存在的 Mod** 会报错；**成环**会报错并退回「按 id 字典序」。

### 11.4 灰度纪律

> **所有在开发中的 Mod 只在测试实例上运行与测试。** 正式服保持现状，直到该 Mod 验收通过并有人明确拍板迁移。

两台实例的端口、仓库路径、`SP_ADMIN_TOKEN` **各自独立**（令牌不是全局账号，一台泄漏不殃及另一台）。

### 11.5 提交纪律

- 一个 Mod = 一个目录 = 一次提交（不要在一个提交里混两个 Mod）
- 提交信息写清「装/不装的行为差异」与「等价性证明的方式」
- 涉及基座改动时必须附：单测 + 等价性脚本 + 服务器实装记录
  - **纯 CSS 布局加固**（不引入 JS、不动 DOM 结构）可以免单测，但等价性脚本必须给出三条：
    ① 相关元素的 `getBoundingClientRect` 与改动前**逐值相同**（< 0.02px）；
    ② 渲染出的 DOM `outerHTML` **逐字节相同**；
    ③ 改动触及的像素区域**没有任何 Δ>4 的像素**（Δ≤4 是"元素变成合成层"带来的栅格化舍入，物理上不可分辨 —— ★ 实测：**合成层的栅格化不是逐字节确定的**，同一套 CSS 连挂两次也会随机抖 ≤2/255，所以判据不能写成"截图逐字节相同"）。
  - ★ 上面这条**只覆盖 CSS**。第六批那类「布局 + 一小段配套 JS」的加固（`public/css/**` + `public/js/ui/**` 各改一处）：
    三条仍然要给，**另外**要给的还有 ① 输入面逐类实测（滚轮 / 鼠标拖动 / 触屏拖动 / 单击，各自「必滚 / 必不滚」都要量）、
    ② 每次输入之后**不该发生的事**也要断言（例：拖动松手**不得**误触查看 —— 用 `onWatch` 计数）、
    ③ 命中链（`document.elementFromPoint`）证明「哪些点属于面板、哪些点属于战场」。
  - 另外必须显式记下**「没做的那部分」**与**拿不到的取证**。第六批的写法可直接抄：
    「鼠标拖动只认头像列、触屏原生 panning 覆盖整行（要限制它就得 `touch-action: none`，会把拖动一起关掉）」
    「静默滚动条 ⇒ 没有滑块可拖」；取证侧则是「`Input.synthesizeScrollGesture` 在无头 Edge 里不生效 ⇒ 触屏手势
    必须手搓 `Input.dispatchTouchEvent`，并附一个**阳性对照**（同一手势打在普通 `overflow` 容器上必须能滚）」。

---

## 12. 现有 Mod 清单（截至 2026-10-12 · 仓库共 23 个）

| id | 名称 | 版本 | 轴 | 落地内容 |
|---|---|---|---|---|
| `cyanfish.demo` | 示例干员包 | 1.1.0 | L1 | 照抄「隐现」新增「隐现·改」（atk 399→450→520）；`identifier` 900/901。**看代码从它开始** |
| `cyanfish.makoto` | 结城理 | **1.2.0** | L1+L3+美术+**内容包** | **5 阶** SPECIAL/傀儡师，盟约【拉特兰】【不屈】；特质（`data/garrisons.json` 910/911）+ **L3 二段替身 + 三人格面具 + 天赋一/二** + 13 个美术文件。★ **1.1.0** 另带 `skinvoice-pack.json`（时装「见证荣光」+ 8 条日文语音 + 6 个同源战斗小人），供 `cyanfish.skinvoice` 可选消费 —— **纯数据、零可执行文件**，见 §4.7。★★ **工序 host-020（2026-10-13）起这一份已被 `cyanfish.collab-six` 1.2.0 整套搬入**（素材 + 登记 + 语音）⇒ 只有 `cyanfish.collab-six` 时结城理也有可选时装；本 Mod 的这份**一字未改、原地保留**便于对照 |
| `cyanfish.archetto-skin` | 空弦·时装「至虔者荣光」 | 1.1.0 | L1+美术 | **纯数据 5 条 `replace`** + 8 个美术文件（约 1.8 MB），零代码。含 `SOURCE.md`（出处 + sha1） |
| `cyanfish.max-seats` | 联机人数上限突破 | **1.8.1** | **L2** | **纯数据**：`data/config.json` **1 条补丁**（`add coop`），五张倍率表（`poolCopyMul`/`itemPoolMul`/`bans`/`draftCards` + `bossPoolMul` 的历史语义）+ `bossHpScale.aliveFull: 6` + `maxSeats: 6`（据此自动放开房内可调到 `SEAT_CEILING`=12）+ **`aiCap: 6`（单房间 AI 队友数上限，工序 105；默认值 = 官方具名 AI 数 `BOT_NAMES.length`）** + `ui.coop` 大厅文案；房主在房内用 `room.setSeats` 调**本房间**人数。★ **1.3.0 勘误**：`bossPoolMul` 改按 **boss 回合实际存活人数**（每人 1 份，值 = 存活/4），旧表（按入座数、值 = 战场数÷2）已废弃（该表 1.5.0 起撤除，交回基座）。★ **1.7.0（工序 101）**：新增 `itemPoolMul` —— **装备共享库存**的按人数补足（≤4 人逐值等于官方；>4 人 = 官方 × N/4，人均回到官方 4 人房水平；§4.3 第 6 条）。★ **1.8.0（工序 105）**：新增 `aiCap` —— 单房 AI 上限，`room.addBot` 超限回 `ERR.AI_LIMIT`（缺键 ⇒ = maxSeats ⇒ 不装本 Mod 恒不可达；§4.3 第 7 条）。零代码零美术。见 §4.3 / §4.6 |
| `cyanfish.loadout-io` | 干员调配·配置导入导出 | 1.1.0 | **L4** | 纯界面：`client/index.js` + `client/format.js`；顶栏按钮 + 导入时按 `chessIds` 点名丢弃未安装 Mod 的干员 |
| `cyanfish.diy-34` | 3·4 阶自选位 | **1.3.1** | **L2** | **纯数据**：`data/chess.json` **2 条 `add`**（`chess_char_3_diy1_a`/`_b`：tier 3、`identifier` 266/267、`shopSortId` 22、`price` 3、`sellPrice` 1）+ `data/backups.json` **3 条 `add`**（`diy.slots` 的 3 阶键 `shopLevel: 3` + `voidedByTiers: [5, 6]`、`diy.prototypes["3"]`、`diy.locked["3"]`，`requirement` 仍 `TIER_6` ⇒ **候选池与 5 阶位完全相同**）。页面因此变成 **III → V → VI（5 格）**。★ **1.1.0 平衡性改造**（服主口径）：① **取消 4 阶位**（`diy.slots` 删键 + `chess.json` 删 `chess_char_4_diy1_a`/`_b` + 删 `prototypes["4"]`/`locked["4"]`；`identifier` 268/269 留空号不回收）——老存档里那条 4 阶自选**不进卡池**（不是本份数据的 slot）；② 3 阶位写 `voidedByTiers: [5, 6]`：**5/6 阶任意一格有自选 ⇒ 3 阶位无效**（页面标「无效」+ 原因，服务器 `checkDiyPicks` 里当空位扣掉），页面上取消 5/6 阶自选后**当场恢复**。**平衡旋钮** = `chess_char_3_diy1_b` 的 `status`（`equipLevel` / `level` / `skillLevel`）。零代码零美术；库存走 `gamedata.poolCopies`（3 阶 18），**不需要**改任何数字。见 **§4.9** |
| `cyanfish.mod-settings` | 模组设置（设置外壳） | **1.2.0** | **L4** | **纯界面外壳，自己零业务参数**：顶栏齿轮 + 两栏面板（左栏位 / 右内容）。栏位由别的 Mod 经 `globalThis.__SP_MODSETTINGS__` 注册（§4.8）。无 `data/`、无 `content/`、无 `assets/`（约 15 KB）。参考实现见 `mods/cyanfish.mod-settings/README.md` |
| `cyanfish.skinvoice` | 皮肤与语音（全干员） | **0.19.0** | **L4** | 皮肤**只局外** + 语音**局外/局内**；按玩家、按干员配置，可导入导出。接缝全在 `client/`，**零改基座**。战斗小人随包发布（0.11.0 口径：**271 套时装**全带同源战斗小人，多源：PRTS 优先 + fexli 兜底），与皮肤**不可拆**。★ 演进：**0.5.0** 跨 Mod 内容包（§4.7）· **0.6.0** 皮肤下拉只列当前干员 + 设置项搬进 `cyanfish.mod-settings`（§4.8）· **0.15.0**（工序 48）**语音播放整体交回官方**（`public/js/audio.js`），本 Mod 只保留"该用哪份语音资源"这一层 + 单干员语种；语音七项设置与旧播放器（`voice.js` / `hostvoice.js` / `officialvoice.js`）全部删除，**不改任何官方默认设置** · **0.16.0**（工序 51，服主实测反馈）① 行内两个下拉与左侧「潜能 / 练度」**逐值同款**（`.lo .lo-cult .lo-select` 复刻到 `.sp-sv__lo`）、**取消两个小图标**（那一行不做"收成小图标"的展示，窄屏走顶部兜底 / 详情面板降级）、**焦点绿框包住整个控件**；② **取消局内的「立即为所有干员随机皮肤」**（局内换肤时战斗里已建好的 spine 小人不会变 ⇒ 只保留局外，`isInMatch()` 用宿主 `selectRoute` 判据；「每局开始时随机」不受影响）；③ 「立即随机」的平铺小字删除、「每局开始时随机」的说明收进「？」小圈（§4.12.2）；④ **素材上游设置保留**（真机实测：立绘 / 头像 100% 走上游，`auto` 反代、`raw` 直连逐档可切）。零代码零美术增量；证据 `<开发期报告>/51-skinvoice-ui.md` · **0.17.0**（工序 55）**删掉「单干员语种」轴**（上游 0.2.3 原生提供，两份并存会互相吞设置；§4.12.6）· **0.18.0**（工序 64）顶栏入口左移（右簇余量为 0）· ★★ **0.19.0**（**工序 72**，服主裁定）**皮肤控件移到「右侧干员详情页 · 官方『此干员语音』的下一行」**（新宿主插槽 `loadout.detailVoice`，§6.3；**宽屏也在**，不再只是窄屏降级）+ **顶栏皮肤入口摘除**（顶栏只留一个和官方相同的「设置」入口；连带撤除工序 64 的死插槽 `loadout.topbarLeft`）+ 干员调配浮动入口不再挂；**行内那一格（`loadout.rowActions`）一字未动**。★ 该版同时**更正**了早期"皮肤控件放不进详情页"的论断（§6.3 的「历史更正」）。证据 `<开发期报告>/72-skin-detailrow.md` |

| `cyanfish.boss-pairing` | 最终攻势 · 随机配队 | **1.0.0** | **L2** | **纯数据**：`data/config.json` **1 条补丁**（`add bossPairing` = `{ "default": "random" }`）。最终攻势（R14）/ 隐秘核心（R15）的队友改为**每局按当时存活人数随机挑选**（服主 issue v1.3「待更新①」）；随机的只是"谁和谁一队"，组内左右仍按座位（2 人房连左右都不变），随机走 `deriveSeed(seed,'bossPair:<round>')` 的**派生流** ⇒ 波次 / 商店 / 机变 / 机器人逐值不变。零代码零美术；与 `cyanfish.max-seats` **无依赖、可各自单独开关**（不写 `config.coop`，理由见 §4.13）。见 **§4.13** |
| `cyanfish.banner` | 实时横幅公告 | **1.2.1** | **L4 + 一条数据补丁** | **首页一条静态横幅 + 对局内一条弹幕（同一份公告）**：服主在 **Mod 管理页**「实时横幅公告」栏发布/撤回（`POST /admin/api/live`，§4.14），玩家端每 **20 秒**轮询 `GET /mods/cyanfish.banner/live.json`，**不刷新页面**最迟 20 秒可见、刷新立刻可见；**持续时间**（`from` + `mins`，显示判断 `now < from + mins*60000`；常用档 30 分钟 / 2 小时 / 6 小时 / 1 天 / 3 天 / 不过期 / 自定义 1~43200 分钟）、三档配色（info/warn/danger）、可选外链（只放行 http/https）。**老数据兼容**：只写了 `to`（绝对结束时刻）的条目照旧读（`mins` 缺失时以 `to` 为准），`mins` 存在时以 `mins` 为准、`to` 只是给旧客户端的镜像。常驻条目也可以写在 `data/config.json` 的 `banner.items`（与实时文档**同 id 时实时那条赢**）。零改游戏逻辑；插槽 **`lobby.banners` + `game.banners`**（两处共用同一个 `Banner` 组件、同一份 `live.json` 与同一个 `itemWindow` 判据 —— 没有第二套时间判断）。★ 1.1.0（工序 75，服主口径）把「结束时间」换成「持续时间」—— 病因见 **§4.14.1**（服主那条公告的结束时间=发布的那一分钟，落盘即过期 ⇒ 玩家端一条都不画）。★★ 1.2.0（**工序 77**，服主口径「对局中也要能看到」→「类似弹幕的从靠顶部的右侧飘过 + 半透明 + 点击穿透」）：宿主新开插槽 `game.banners`（`.gm__hud` 直接子节点、顶栏之后；注册方把一条**弹幕**放在官方 `.ticker` 用的那条 0.34rem 通道里，自右向左单次 9 秒、每 45 秒再飘一次，行 `opacity:.78`，整层 `pointer-events:none` ⇒ 点击/拖拽全穿透，真机实测任一固定点单次只被覆盖 ≈1.9 秒）；宿主**没有为它写任何 CSS**；不装该 Mod 时对局内 DOM 与上游**逐字节相同**（空插槽零节点）。★ 服主裁定：**只上测试服，正式服待批准**（见 `<开发期报告>/61-announce-stats-and-audit.md`） |
| `cyanfish.online` | 首页在线人数 | **1.0.0** | **L4 + 一条数据补丁** | 首页顶栏左组（延迟胶囊旁）一枚读数胶囊「在线 N · 房间 M ·（对局 K）」，悬浮看完整拆解（连接 / 会话 / 座位上的真人 / AI / 观战 / 人数上限 / 运行时长）。数据取自宿主**已有的** `GET /healthz`（`sessions`/`rooms`/`matches`…），**没有新增端点、没有第二份真相**；默认 **20 秒**一次（`online.pollSec` 夹在 5~300），页签隐藏即停、切回立刻补一次，连续 3 个周期失败只变暗不显示猜测值，**从未读到就整枚不渲染**。插槽 `lobby.topbar`。★ 服主裁定：**只上测试服，正式服待批准** |
| `cyanfish.chat` | 对局内聊天 | **1.2.0** | **L4 + 一条数据补丁 + 一个新协议动作** | **对局画面右上角一条可收起的聊天窗**（收起 = 一枚 `.5rem` 方块图标键，与官方「生效效果」列同尺寸并摆在它正上方；展开 = 记录 + 输入 + 未读红点），同一条消息还可以在画面顶部**飘过**；设置页注册一栏三项（对局内弹幕 / 弹幕速度 / 聊天字号，存本机 `sp.pref.chat`）。协议：C2S `g.danmaku { text }` → S2C `m.danmaku { playerId, text }` 广播给该对局的所有人（含发送者自己）—— **线格式消息名从工序 90 沿用**。**服务端强制**（`server/match/chat.js`，接缝 `config.chat`，**基座默认关闭**）：**对局里的真人**都能发（在座玩家**含房主** + 已被淘汰仍在局的 + 观战席；AI 与已离开的人拒绝）· 每条 ≤ **60 个字符**（码位）· 同一人 **≥2 秒/条、20 秒内 ≤5 条** · **整间房 30 秒内 ≤12 条** · 空/纯空白/控制字符归一化后为空一律拒绝 · 关键词屏蔽**默认不过滤**。**不做持久化**（不写盘、不入存档、不重放）。面板挂在自己开的**独立 Preact 根**（宿主没有"对局内右侧面板"这一格；§4.20），落 `right:.26rem / top:1.42rem / 3.6rem` 并 `pointer-events:none` 让开战场点击；弹幕复用横幅那条通道（`game.banners`）但**让位**（几何判据 + 实测周期）⇒ 两条永不互相盖住。★ UGC 口径：正文只作**纯文本节点**渲染（零 `innerHTML` 路径）。★★ 它是 `cyanfish.danmaku` 的**后继**（那一个从未上线、目录已删），接缝改名 + 发送权限放宽；详见 **§4.20** |
| `cyanfish.fix-targeting` | **修复型** · 索敌空间优先序 | 2.0.0 | **L3** | 包 `beforeAttack`（priority **−700**）⇒ 阻挡者 → 嘲讽 → **最右列 → 同列内最下方** |
| `cyanfish.fix-mechanism` | **修复型** · 机制（双转职叠层 / 不屈突袭 +5 技力 / **领袖吃侵蚀**） | **1.1.0** | **L2 + L3** | **L2**：`data/backups.json` **1 条补丁**（`add mechanics`）打开两条规则接缝（§4.10）——`bondCopyLayers`（变形同构体「双转职」按条目叠层：所属盟约清单保留两份、每场上限**每份各自**、详情卡显示两份；人数仍按干员去重）与 `indomRaidSp`（不屈 tier 2 的 +5 技力也吃突袭飞走，只补技力、**不**参与 tier 1 的 roll）。**L3**（1.1.0 新增，工序 host-006）：`content/index.js` 的 `leader-erosion` —— 领袖（`isBoss`）也吃侵蚀损伤（计量 / 爆发 / 克莱门莎三技能掉弹药），修掉与其它四种损伤的不一致。**三项都是服主口径的有意偏离**（`leader-erosion` 更是**有意偏离官方贴士**），关掉即回上游。零基座改动零美术 |
| `cyanfish.fix-egir-bond` | **修复型** · 阿戈尔盟约（协防时序 / 复活名额） | **2.0.0** | **L3** | 包 `battleStart`(**−9e8**/100) + `retreat`/`loseHp`/`redeploy`；把「强制退场」推迟到吞噬之后，复活改**列主序**。见 §5.8 |
| `cyanfish.fix-dsubrl-noattack` | **修复型** · 巢涌者无普攻 | 2.0.0 | **L3** | `profile.noAttack` + `battle.every` 1 s 自驱动 ⇒ 改回**持续光环** |
| `cyanfish.fix-thorn2-stack` | **修复型** · 引星棘刺一技能叠加 | 2.0.0 | **L3** | 包 `addBuff` 吞固定 key，按覆盖数 n 重发（只修 DEF；回血本来就叠加） |
| `cyanfish.fix-enemy` | **修复型** · 敌人（索敌 / 巢涌者光环 / 元核孽生者 / **铳攻速下限**） | **2.1.1** | **L3** | `fix-targeting` + `fix-dsubrl-noattack` 的合并体，并新增两项；**四项各一个开关，默认只开「元核孽生者神经损伤不叠加」与「假想敌：铳 攻速（含首击即 1 层）」**——索敌顺序与巢涌者持续光环 0.1.3 起已由基座内建，默认关、**一个钩子都不注册**。四处 `addInstall`（targeting / dsubrl / nexusNeural / gunAspd），零改基座。★ 工序 98 的「铳攻速首层」修正即本 Mod 的 `gunAspd` 项；★ 工序 99 已核对：**官方 0.2.4 未动这一条**（`server/sim/content/kits/ops/chess_char_*` 与 `items/battle.js` 的改动与假想敌：铳无关）⇒ **保留**。见 §4.10、`<开发期报告>/98-aspd-floor-fix.md` |
| `cyanfish.fix-operator` | **修复型** · 干员（引星棘刺叠加 / 阿戈尔盟约 / 傀儡师换体×远牙） | **2.3.1** | **L3** | `fix-thorn2-stack` + `fix-egir-bond` 的合并体，并新增 `fartooth-dollswap`。**三项当前全部默认不生效**（各自的接缝上游已内建：thorn2-stack ← 上游 0.2.2 #388；fartooth-dollswap ← 上游 0.2.3 #415/PR #429）。留作**台账 + 可回退钩子**。★ 工序 99 已核对：官方 0.2.4 未修我们这三条中剩下的任何一条 ⇒ **保留（默认关）** |
| `cyanfish.announce` | 服务器公告 | **1.6.0** | **L2（纯数据）** | 玩家进服自动弹服主配的公告，**每条对同一玩家只弹一次**（「看过没有」按公告 id 记在玩家浏览器本地存储），并可在「模组设置」里回看。服主只改 `mods/cyanfish.announce/data/config.json` 的 `announce.items`（`id`/`title`/`body`/`date`/`level`）。零代码。★ 正式服启用（要公告玩家） |
| `cyanfish.collab-six` | 联动六星（**私有**自选池） | **1.2.0** | **L2 + L3 + 美术 + 内容包** | 把 **7 名联动六星**补进 5/6 阶自选池（灰烬 `char_456_ash`、麒麟R夜刀 `char_1029_yato2`、艾拉 `char_4123_ela`、玛露西尔 `char_4141_marcil`、丰川祥子 `char_4182_oblvns`、结城理 `char_4217_makoto`、焰狐龙梓兰 `char_1048_orchd2`）：`data/assets.json` 49 ops + `data/backups.json` 23 ops + 7 个 `addKit` + 美术。<br>★★ **1.2.0（工序 host-020，2026-10-13）**：把结城理「见证荣光」（p3r）的时装 + 8 条日文语音**从 `cyanfish.makoto` 搬进本 Mod**（`skinvoice-pack.json` 现登记 **7 名**，指针全指本 Mod 自己的 `assets/`）⇒ **只启用本 Mod 时 7 名都有默认美术、结城理也有可选时装**，`cyanfish.makoto` 可归档 / 停用（那份登记原地保留、未改；两份同 id ⇒ 消费方「先来的赢」）。素材（p3r 小人 6 个文件）与 makoto **同相对路径、逐字节同值**。<br>★★ **仅本服使用、暂不对外发布**（依据 `docs/DATA.md:723` 的版权决定）。★ **工序 host-019 起随正式服上传并启用**（`LIVE_MODS_ENABLED`；旧口径「正式服连目录都不传 / `LIVE_MODS_EXCLUDED`」已作废）。★ 它与 `cyanfish.makoto` 有 **7 条同路径同值** 的 `add`（`assets.chars/skills/skillsById`）⇒ 靠工序 88 的平台「同值幂等」规则共存（§3.6 / §11.3）。见 §4.15 |
| `cyanfish.boss-hp` | Boss 血量修复（每人份口径） | **1.2.0** | **L2（纯数据）** | 把 10 个 boss × 4 档难度的 `bloodPoint` 整体 **×4**（不改行为代码、不加新键）⇒ 全队共享血量 = 表值 × 存活人数。★ **0.2.1 起已退役**（官方内建「血量随人数缩放」）⇒ ★ **工序 112 起正式服连目录都不上传**（`LIVE_MODS_EXCLUDED`，不再是 `LIVE_MODS_DISABLED`）+ 测试侧照旧**停用**（`TEST_MODS_DISABLED`），目录保留供历史与回退 |
| `cyanfish.debug-console` | 调试控制台（**测试服专用**） | **1.4.3** | **L4 + L3 + 一条数据补丁** | 局内左下角那一排官方三键（设置 / 玩法说明 / 全屏）**右侧**多一个同款方键（插槽 `game.cornerActions`），点开是「分类 + 可搜索」的调试面板：状态只读 / 回合 / 资金 / 生命 / 盟约层数 / 干员（可搜索，直发到手上）/ 装备（可搜索，直发或直接装到指定干员）/ 本波敌人；数据接缝 `config.debug`（**基座默认关闭**，§4.11），运行时倍率住每局一个的 `GameData` 实例上。★ **工序 112 起正式服也启用**（`LIVE_MODS_ENABLED`；旧口径「只挂测试服 / 进 `LIVE_MODS_EXCLUDED`」已作废，见 §4.11）；正式服上只由第一道闸门（单人房 = 开局恰好 1 个真人座位）放行 ⇒ 多人房与观战席在功能层与 UI 层都不出现 |

> ★★ **工序 106（2026-10-11，服主裁定）§12 收口 · 25 → 23**：`cyanfish.dj-models`（1.6.1）与
> `cyanfish.dj-bgm`（1.0.1）**已从本表删除**，因为这两个目录**已从树的 `mods/` 移出、单独归档**到
> `<归档目录>/`（服主口径：这两个后续可能**完全重新设计**，**不要因为这两个 Mod 影响其它内容的判定**
> ⇒ **不禁用，而是移出 Mod 列表**）。归档目录内 `README.md` 写明原版本号 / 移出时间 / 怎么用回来。
> ⇒ 本表覆盖仓库里**全部 23 个**目录；四张表侧同步把这两个 id 从 `LIVE_MODS_DISABLED` 里删除
> （不是「停用」也不是「不上传」，而是**不存在**），`--check` = 23 个目录、无未归类。
> 逐条清单与「哪个实例装了什么」以 `<开发期脚本>/deploy_base_024.py` 的 `LIVE_MODS_*` / `TEST_MODS_*`
> 四张表为**唯一权威**；本工序报告 `<开发期报告>/106-archive-dj-mods.md`。

> ★★ **工序 99（2026-10-11）§12 收口**：补齐了此前缺行的 **8 个 Mod**（`cyanfish.fix-enemy`、`cyanfish.fix-operator`、
> `cyanfish.announce`、`cyanfish.collab-six`、`cyanfish.boss-hp`、`cyanfish.debug-console`、`cyanfish.dj-models`、
> `cyanfish.dj-bgm`）⇒ 本表当时覆盖仓库里**全部 25 个**目录（★ 工序 106 起 `cyanfish.dj-models` / `cyanfish.dj-bgm`
> 已移出归档 ⇒ 现为 23 个）。`cyanfish.fix-enemy` 那一行是**工序 98 点名**的既有缺口；
> `cyanfish.collab-six` 那一行是**工序 88** 点名的缺口。本表只是快照，**权威仍是**
> `<开发期脚本>/deploy_base_024.py` 的 `LIVE_MODS_*` / `TEST_MODS_*` 四张表（`--check` 会打印对照并做覆盖自检）。
> ★ 同一节下面那些「22 / 23 个 Mod」的旧快照段落**原样保留**（历史），不要拿它们当现状。

> ★ **工序 60（2026-10-10）新增 `cyanfish.boss-pairing`**（最终攻势随机配队，纯 L2 数据，见 §4.13）。
> 同一棵树上并行的另外两条线也各自新增了一个 Mod（`cyanfish.banner` / `cyanfish.online`）⇒ 此刻
> `node tools/mod.mjs validate` = **23 个全部通过**（0 错误）。**「哪个实例装了什么」的权威**当时写的是
> `<开发期脚本>/deploy_base_023.py` 的 `LIVE_MODS_*` / `TEST_MODS_*` 四张表（本节的表只是快照）。
> ★★ **工序 108 更正：那份权威现在是 `<开发期脚本>/deploy_base_024.py`**（`deploy_base_023.py` / `deploy_base_021.py` 只作历史）。

> **★ 上面那张表与下面这段是 0.1.2 时期的快照**（当时 11 个 Mod）。**当前状态（2026-10-11 起）见本行下方**：
> 仓库共 **22 个 Mod**、`node tools/mod.mjs validate` = **22 个全部通过**（0 错误）；
> ★ 工序 61 新增两个（`cyanfish.banner` / `cyanfish.online`）—— 服主裁定**只上测试服**，正式服待批准：
> **正式服** 6 启用 / 9 停用 / 2 移出（`cyanfish.fix-mechanism` 明确**不在**正式服启用清单里）、
> **测试实例** 10 启用 / 7 停用；
> 逐条清单与「哪个实例装了什么」以 `<开发期脚本>/deploy_base_021.py` 的
> `LIVE_MODS_*` / `TEST_MODS_*` 四张表为**唯一权威**（`go_live.py --check` 会打印对照）。
> ★★ **工序 108 更正**：这段的**数字（22 个 / 6 启用 / 10 启用）与权威路径都已过时** ——
> 现在唯一权威 = **`<开发期脚本>/deploy_base_024.py`** 的四张表；现状 = **23 个目录**，
> **正式服（新机 `s10-2`）8 启用 / 1 停用 / 14 不上传**（★ **工序 112 起**；这里原先写的 `8 / 7 / 8` 是更早那张表的旧值 —— **别再据此判断**）、**测试实例 14 启用 / 9 停用**，
> `deploy_base_024.py --check` = Mod 目录 **23** / 覆盖层 **97**（正式服口径 **73**）/ 无未归类（exit 0）。

**（历史快照 · 0.1.2 时期）当前测试实例**（`Stronghold-Protocol-v0.1.2` 基座 = 官方 4 人版）：以上 **11 个全启用**，`/healthz.maxSeats = 6`；`node tools/mod.mjs validate` = **11 个 Mod 全部通过**；`verify_admin_api.mjs` **151 通过 / 0 失败**
（真实 `startServer` + 真实 CLI + 真实 ZIP）；四个修复型各自 `verify_fix_*.mjs` = 29/37/14/10，
生产加载链路冒烟 `smoke_fix_mods_live.mjs` = 24/0；
`cyanfish.skinvoice` 单元 **356/0** + 浏览器 E2E **99/0**。

> ★ 本表是**展示给管理页的那份**：每条的 `mod.json` 都带 `summary`（列表里显示的那一行）。
> ★★ **工序 108 更正（此处原文把一句"反面文案"当成了范例）**：原文引用的是 `cyanfish.fix-egir-bond` 的旧 `summary` ——
> ~~「修复【阿戈尔】盟约协防阶段不复活、吞噬链断链丢失数值的问题；一并修复了干员归溟幽灵鲨被击倒的问题」~~（**58 字、含分号、两件事挤一句**）。
> 它**正是** §4.12.8 反例②「把大量详情信息写进功能简述」的标本，**不是范例**。该 Mod 现文案（**40 字、一件事一句**）：
> 「修复【阿戈尔】盟约协防阶段不复活、吞噬链断链丢失数值，并修归溟幽灵鲨被击倒的问题」。
> **正面例子请用** `cyanfish.collab-six`（30 字）或 `cyanfish.demo`（39 字），见 **§4.12.8.4**。

> ★ **基座本身的改动**（不属于任何 Mod）按 `CHANGELOG.md` 的批次登记（第一 ~ 第六批都在这一份里）。
> 最近一批（**第六批**）＝ 战斗内左侧队友列表**人多时可滚动**：**静默滚动条**（不画、不占位）＋ 最左「头像列」
> 滚轮 / 触屏拖动 / 鼠标按住拖动 都能滚 ＋ 单击它展开「前往查看」。改动两处：`public/css/screens/game.css`
> （对上游 1 删 / 47 增）与 `public/js/ui/teamPanel.js`（+68 行 `useLeftDrag`）。跟人数自然生效、**4 人房零影响**。
> 取证路径与"没做的那部分"见 §11.2 / §11.5；本地手感页 `<开发期产物>/team-scroll-demo.html`。

---

## 附录 A：`data/` 目标文件与含义

| 文件 | 顶层 | 备注 |
|---|---|---|
| `assets.json` | 对象 | **美术指针表** |
| `bands.json` | 对象 | 乐队 |
| `bonds.json` | `{ bondId: { members, visibleMembers, identifier, … } }` | 盟约。**成员表用 `append`** |
| `bosses.json` | `{ key: rec }` | 领袖 |
| `chess.json` | `{ chessId: rec }` | 干员（记录校验最严） |
| `choices.json` | 对象 | 机变：`format.cards`（官方 6）、`schedule[*].rounds[*].cards` |
| `config.json` | `{ season, modes, … }` | 模式 / 赛季 / **规则参数（`coop`）** |
| `effects.json` | `{ id: rec }` | 效果（含 `descRaw` 富文本） |
| `emotes.json` | 对象 | 表情 |
| `enemies.json` | `{ key: rec }` | 敌人 |
| `factions.json` | 对象 | 阵营 |
| `garrisons.json` | `{ id: rec }` | **特质**（可组合被动；`effectKey` + `bb`） |
| `items.json` | `{ id: rec }` | 道具（`shopExcluded` 表示商店不出售） |
| `local-assets.json` | 对象 | 本地美术清单（生成产物） |
| `stages.json` | `{ id: rec }` | 地图 |
| `tokens.json` | `{ id: rec }` | 召唤物 |
| `tuning.json` | 对象 | 数值调参 |
| `waves.json` | `{ id: rec }` | 波次 |

## 附录 B：错误信息速查

| 错误 | 原因 | 怎么办 |
|---|---|---|
| `缺少 mod.json` | 目录里没有清单 | 补 |
| `id "X" 与目录名 "Y" 不一致` | 二者必须相同 | 改目录名或改 id |
| `apiVersion=2，本平台只支持 1` | 版本不符 | 改成 1 |
| `gameVersion=0.2.3 与当前游戏版本 0.2.4 不一致` | 严格相等门禁 | 改清单（★ **23 个一起改**，见 §9.3） |
| `data/x.json 的目标文件在 data/ 里不存在（可用：…）` | target 拼错 | 对照附录 A |
| `顶层必须是 { "ops": [ … ] }` | JSON 结构写错 | 补 `ops` |
| `op=add 要求目标不存在，但 "p" 已存在（要覆盖请用 replace）` | op 选错，或那条路径已被**别的 Mod 用不同值**占住 | 换 `replace`/`merge`/`deepMerge`；★ 若两条 Mod **本该**声明同一条数据，把两边的值写成**逐字节相同**即可（工序 88 起同值不算冲突，见 §3.6） |
| `op=replace 要求目标存在，但 "p" 不存在` | op 选错或路径错 | 换 `add`/`clone`，或核对路径 |
| `append 的目标必须是数组（当前 object）` | 挂错了地方 | 挂到 `members` 之类的数组上 |
| `path 中间键 "a.b" 不存在` | 路径中途断了 | 逐段核对 |
| `path 存在空段（多余的点？）` | 多打了一个点 | 修 |
| `clone 的 from "x" 不存在` | `from` 指向不存在的记录 | 核对 `from` |
| `与其它 Mod 冲突: p 已被 "x" 改过` | 抢路径（两条写的是**不同的值**） | 拆键（见 §11.3） |
| `与 "x" 重复写入 N 条相同路径（值逐字节相同 ⇒ 按幂等处理，不算冲突）`（warning） | 两条 Mod 都声明了同一条数据、且值一致 —— **不是问题** | 不用动；想消掉提示就让**一方**声明（工序 88，见 §3.6） |
| `addKit: X 已被 "y" 注册` | 抢干员 kit | 一个干员一个 kit |
| `identifier=950 与 "x" 重复`（warning） | 撞号 | 换号 |
| `没有 goldenId → 无法三合一精英化`（warning） | 缺金色形态 | 一起加 `_b` 记录 |
| `unknown UI slot "xxx"` | 插槽名拼错 | 用 `hostApi.slots.names` |
| `模块既没有默认导出的 setup 函数，也没有具名 setup` | L4 入口形状错 | `export default function setup(hostApi){}` |
| `内容模块没有默认导出安装函数`（L3） | 同上 | `export default function setup(api){}` |
| 装完 `一个美术文件都不剩` | `assets/` 目录名或路径不对（被白名单跳过） | 目录名必须是 `assets/` |

## 附录 C：文件索引（改哪里找哪里）

| 关注点 | 文件 |
|---|---|
| 清单校验 / 扫描 / 拓扑排序 / 合并 / 干员记录校验 | `server/mods/loader.js` |
| 补丁引擎（7 个 op） | `server/mods/patch.js` |
| `.spmod` ZIP 读写 | `server/mods/zip.js` |
| L3 服务端装载（specifier / mtime 破缓存） | `server/mods/content.js` |
| L3 注册层 + `modHostApi` + kit 优先级 | `server/sim/content/index.js` |
| L4 通道 URL | `server/mods/client.js` |
| L4 插槽宿主 + `makeHostApi` + `loadClientMods` | `public/js/ui/extensions.js` |
| CLI | `tools/mod.mjs` |
| 管理页（可分发单文件） | `tools/mod-admin.html` |
| 管理 API | `server/admin.js`（`/admin/api/{ping,snapshot,changelog,download,verify,reload,restart,install}`；★ 工序 61 新增**实时文档** `GET|POST /admin/api/live?id=<mod>`，见 §4.14；★ 工序 69 新增**管理员只读的房间明细** `GET /admin/api/rooms`，见 §4.17；★ 工序 73 把整段管理面的 **CORS 收成白名单**（新增环境变量 `SP_ADMIN_ORIGIN`，默认只放行同源 + `null`），见 §4.18） |
| 房间明细快照（只读，`/admin/api/rooms` 的数据源） | `server/match/roomDetail.js`（`roomDetailSnapshot(lobby)`；由 `server/index.js` 以 `getRooms` 注入 `server/admin.js`） |
| 数据合并入口 | `server/data.js`（`loadDataMerged`） |
| `/data` 下发合并 JSON + `/mods` + `/mods/` 静态 + `/assets/**` 兜底 | `server/index.js` |
| **数据接缝示例** | `server/match/coop.js` + `server/match/choices.js` + `shared/constants.js`；**战斗机制接缝** `server/sim/mechanics.js`（`data/backups.json` 的 `mechanics`，§4.10）。★ 同节原登记的 `server/sim/content/garrisons/battle.js` 的 `bb.doll_swap_deploy` **已于工序 54 撤除**（该文件现与上游 0.2.3 逐字节相同） |
| 客户端分页（卡组 > 6） | `public/js/ui/choiceOverlay.js`（`SP_PER_PAGE` / `spPages`） |
| 客户端座位布局（一排 4 / 超过加 `.seats--many`） | `public/css/screens/room.css` + `public/js/screens/room.js` |
