# 卫戍协议 · CyanFish 平台补丁与 Mod 集

> 给《明日方舟》限时玩法「卫戍协议：盟约」的**非官方同人复刻项目**（上游 **Stronghold Protocol 0.2.5**）做的
> **平台补丁 + 21 个 Mod**。仓库里**只有我们自己写的代码与文档**，**一个官方素材文件都没有**。

---

## ⚠ 先看这里（三句话）

1. **这里没有游戏本体，下载本仓库不能直接玩。** 它是一个**补丁 + Mod 集**：先自己准备好**官方 0.2.5 版本体与素材**，
   再把本仓的补丁与 `mods/` 叠上去（见 [docs/INSTALL.md](docs/INSTALL.md)）。
2. **仓库里所有美术、语音、音乐都不是我们的**，因此**一个素材文件都没放**。本仓只含我们自己编写的代码与文档。
3. **禁止任何形式的盈利**（收费开服、付费房间、广告、打赏、打包进收费产品）。仅供**学习、研究和个人非商业娱乐**。

本仓库与鹰角网络（Hypergryph）、Yostar **没有任何关联**，也未获授权或认可。
若你是权利人并认为本仓库有不妥内容，请提 Issue，我们会尽快删除或下架。

---

## 这是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 21 个 **Mod**（自足目录：`mod.json` + `client`/`content`/`data` + `README.md`） | ❌ 不是整合包，**不含** `public/assets/**`（约 270 MB 官方美术）、`public/fonts/**` |
| 一层 **平台覆盖层**（105 个文件 / 3.3 MB）：Mod 装载器、插槽宿主、设置页外壳、Mod 开发规范等 | ❌ 不是上游 0.2.5 的 fork 分支，也不改上游的许可证 |
| 两个 **安装/自检工具**：`tools/apply-overlay.mjs`（一键叠补丁 + 可回滚）、`tools/publish-scan.mjs`（发布前自检） | ❌ 不含任何令牌、服务器地址、部署脚本 |

★ **为什么必须叠覆盖层**：这 21 个 Mod 依赖我们改过的平台接缝（Mod 装载器与插槽宿主）。
**只在纯上游 0.2.5 上放 `mods/`，21 个 Mod 全部装不上。**

---

## 30 秒安装

```bash
# 0) 先自己准备好官方 0.2.5 本体（步骤见 docs/INSTALL.md）
# 1) 干跑：只报告，不写任何文件
node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5" --dry-run
# 2) 真跑：先备份，再逐文件叠补丁，并把 21 个 Mod 拷进 mods/
node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.5" --with-mods
# 3) 校验
cd "D:\Stronghold-Protocol-0.2.5" && node tools/mod.mjs validate
```

**第 3 步的预期输出**：`✓` 19 个 + `✗` 2 个（就是两个 DJ 整活 Mod 的 `gameVersion` 过时），
最后一行 `2/21 个 Mod 校验未通过`，**退出码 1**。

> ★ 这**是预期**，不是装坏了 —— 见下面的「版本过时提醒」一节。
> 想彻底看不到这两行：把两个 DJ Mod 停用（`node tools/mod.mjs disable cyanfish.dj-models` 等）。

第 2 步还会做一件与你有关的事：若 `mods/.state.json` **不存在**，它会写一份把 **7 个历史归档 Mod 停用**的状态
（与作者自己服务器的口径一致；想全部启用就删掉那个文件，或加 `--no-state` 让它别写）。
装完的默认状态 = **12 个正常装载 + 2 个被版本门槛跳过 + 7 个停用**。

不想要了：`node tools/apply-overlay.mjs --target "<同一个目录>" --rollback "<它打印给你的备份目录>"`。

---

## ★ 服主亮点：Mod 管理页 `/admin`

覆盖层里带了一个**单文件管理页**（`overlay/tools/mod-admin.html`，零外部依赖）与它的后端
（`overlay/server/admin.js`）。**本仓不含任何令牌** —— 你自己设一个环境变量就出现，
不设就整体 404、游戏行为与上游**完全一致**（默认关闭是设计，不是仓库少了文件）：

在启动游戏服务端**之前**设一个环境变量 `SP_ADMIN_TOKEN`（**>= 16 字符**，你自己想一串长口令即可；
它**只走环境变量**，我们**绝不要求你写进任何文件**，仓里也不会出现你设的值）。

然后浏览器打开 **`http://localhost:3000/admin`**。这一页是**服主专用**（玩家游戏界面没有任何入口）：

- **Mod 管理**：列表 / 校验 / 上传 / 启停 / 卸载 / 热重载 / 版本日志 / 实时文档；校验**复用**
  `server/mods/loader.js` 的同一份实现 ⇒ 网页上看到的提示与 `node tools/mod.mjs validate` **逐条一致**；
- **房间 / 在线明细**（只读）：每房间的房号 / 是否开局 / 回合 / 阶段 / 座位 / 真人 / AI / 观战 / 每人状态，
  外加 `safeToRestart`（0 真人 0 对局 0 观战时才建议重启）；
- **趋势图**（只读）：服务端**默认 1 分钟采一点、环形缓冲保留 3 日**，页面用手写 Canvas 画人数与
  CPU（**均值 + 峰值**）· 内存 · 事件循环延迟，可切窗口 / 系列 / 散点，可导出 CSV / JSON；
- **官方 release 追踪**（只读）：服务端每 **60 分钟**带 ETag 查一次**上游** GitHub 的 latest release，
  显示「当前版本 vs 官方最新」、发布时间、说明摘要与官方资产的体积 / sha256。**只读、只走
  `api.github.com`，不下载任何文件、不自动更新**。

安全口径：令牌**只走请求头**（`Authorization: Bearer …` / `X-SP-Admin-Token: …`），**绝不接受 query string**；
CORS 是**白名单**（基线 = 同源 + 字面量 `null`，可用 `SP_ADMIN_ORIGIN` 另加；其余 Origin 一个头都不发）；
响应里**不回显**任何部署细节（绝对路径 / 内网地址 / 实例名都只回一个显示用标签）。

---

## 21 个 Mod 一览（一句话一个）

完整清单（版本号 / 默认启停 / 每个 Mod 的细节）见 [docs/MODS-LIST.md](docs/MODS-LIST.md)。
**装完的默认状态** = **12 个正常装载** + **2 个 DJ 整活被版本门槛跳过** + **7 个历史归档停用**（共 21 个目录）。

**玩法与界面**（5 个）
- `cyanfish.max-seats` —— 让房主自行设定本房间的联机人数，并按人数自动适配各项数值。
- `cyanfish.diy-34` —— 自选编队平衡性改造：只留一个 3 阶自选位；选了 5/6 阶干员后 3 阶位不生效。
- `cyanfish.boss-pairing` —— 最终攻势的队友改为每局随机挑选，不再固定按座位两两配队。
- `cyanfish.loadout-io` —— 在「干员调配」右上角加导入 / 导出按钮，把技能与模组配置存成 JSON 分享。
- `cyanfish.online` —— 首页顶栏显示服务器当前在线人数与房间数（真值，默认 20 秒刷新）。

**沟通与公告**（4 个）
- `cyanfish.chat` —— 对局内一条可收起的聊天窗，消息同时以弹幕飘过。
- `cyanfish.announce` —— 玩家进服时自动弹出服主配置的公告，每条对同一玩家只显示一次。
- `cyanfish.banner` —— 服主发布的实时公告横幅，首页与对局内都会显示。
- `cyanfish.mod-settings` —— 所有 Mod 共用的设置外壳（别的 Mod 注册栏位，参数就出现在这一页）。

**Bug 修复**（8 个；★ 其中 7 个属于「历史归档 / 上游已修」，见独立一节）
- `cyanfish.fix-enemy` —— 敌人侧四项修复的合并包（索敌 / 巢涌者光环 / 元核孽生者神经毒素 / 铳攻速下限），每项一个开关。
- `cyanfish.fix-targeting` —— 修复敌人索敌挑错目标：应先打「最右一列里最靠下的干员」。
- `cyanfish.fix-mechanism` —— 机制侧三项修正（双转职叠层 / 不屈吃突袭 / 领袖也吃侵蚀）。
- `cyanfish.fix-operator` —— 干员侧三项修复的合并包（三项默认都不生效，因为上游已各自内建）。
- `cyanfish.fix-thorn2-stack` —— 修复引星棘刺一技能加防御效果在多个炼金单元范围重叠时只生效一份。
- `cyanfish.boss-hp` —— 把最终攻势与隐秘核心的共享血池按「每人份」重算。
- `cyanfish.fix-egir-bond` —— 修复【阿戈尔】盟约协防不复活、吞噬链断链丢数值等问题。
- `cyanfish.fix-dsubrl-noattack` —— 修复敌人「巢涌者」本应没有普攻却会抬手被打断的问题。

**开发与整活**（4 个）
- `cyanfish.debug-console` —— 局内调试控制台：只在单人 / 纯 AI 对局出现，可改资金、回合并发干员装备。
- `cyanfish.demo` —— 一名示例干员「隐现·改」；想自己写 Mod 的话，从这个包开始读最省事。
- `cyanfish.dj-models` —— ★ **整活**：让干员、敌人、特效与战斗界面反复上下压缩并原地转圈（纯视觉，默认关）。
- `cyanfish.dj-bgm` —— ★ **整活**：把游戏默认背景音乐换成自选曲目（**本仓不带任何音频**，曲子自己放）。

★ 上面这些里有 **7 个是「历史归档」**（上游后来自己修了同一件事，或实现被并进了别的 Mod）：
`boss-hp` · `loadout-io` · `fix-operator` · `fix-dsubrl-noattack` · `fix-targeting` · `fix-thorn2-stack` · `fix-egir-bond`。
它们**默认被停用**（与作者自己服务器的口径一致），仍然保留在仓里供源码参考。
**逐条理由 + 「强行启用会怎样」见 [docs/MODS-LIST.md](docs/MODS-LIST.md) 第三节。**

---

## ⚠ 两个整活 Mod 的版本过时提醒（独立一节）

这两个 Mod 是**按归档原样**发布的，**尚未适配 0.2.5**：

| Mod | 版本 | 声明的游戏版本 | 当前游戏版本 |
|---|---|---|---|
| `cyanfish.dj-models` | **v1.6.1** | **0.2.4** | **0.2.5** |
| `cyanfish.dj-bgm` | **v1.0.1** | **0.2.4** | **0.2.5** |

**装到 0.2.5 上会发生什么（预期症状，不是坏了）**：装载器会**严格校验** `gameVersion`，
版本不一致时这两个 Mod **仍然出现在 `/mods` 列表里**，但**带一行错误**：

> gameVersion=0.2.4 与当前游戏版本 0.2.5 不一致

并被标记为 **`skipped: true`（跳过，不装载）**。**不会崩服**，其它 Mod 照常工作。

`node tools/mod.mjs validate` 也会对它们各报一条同样的错误 ⇒ 最后一行是
`2/21 个 Mod 校验未通过`、**退出码 1**。**这就是预期输出**（正好是这两个 Mod 的版本门槛在起作用）。

**这意味着**：想用这两个整活 Mod，要么等作者更新（作者会更新），要么把它们的 `mod.json` 里
`gameVersion` 改成 `0.2.5` 自己试（**不保证效果**，因为 0.2.4 → 0.2.5 之间有基座改动）。
把它们当**源码参考**看是最稳的用法。细节见 [docs/OUTDATED-MODS.md](docs/OUTDATED-MODS.md)，
以及两个 Mod 各自的 `OUTDATED.md`。

`cyanfish.dj-bgm` 另外一件事：**本仓不随包发布任何音频**（那一首曲子没有取得权利人授权）。
该 Mod 的代码本身不依赖任何一首具体的歌 —— 把音频丢进 `mods/cyanfish.dj-bgm/assets/bgm/`
并在 `client/bgm.json` 的 `tracks` 里加一条即可；`tracks` 为空时它**在页面上零痕迹**（不注册栏位、不压官方 BGM）。

---

## 兼容性：为什么必须 0.2.5

- 21 个 Mod 的 `mod.json` 里，19 个写 `gameVersion: "0.2.5"`、2 个 DJ 写归档原值 `"0.2.4"`；
- **装载器要求 `gameVersion` 与本版游戏版本严格相等**，否则整包被跳过（上面那一节）；
- 所以**游戏本体必须是官方 0.2.5**（上游 `package.json` 的 `"version": "0.2.5"`）。
  用 0.2.4 或更早：19 个核心 Mod 会被整批拒装。

覆盖层是按官方 **0.2.5** 逐字节对齐的（见 `overlay/ORIGIN.sha256`）：它记录了**每个文件在你那棵官方 0.2.5 上
应有的 sha256**，`apply-overlay.mjs` 会先核对再写 —— 只要你的本体是干净的 0.2.5，这一步不会失败。

---

## 目录结构

```
.
├─ README.md · RELEASE-NOTES.md · LICENSE · NOTICE.md · THIRD-PARTY.md · .gitignore
├─ docs/
│   ├─ INSTALL.md          # step-by-step 安装（含「自备正版 0.2.5 本体与素材」）
│   ├─ MODS-LIST.md         # 21 个 Mod 逐条清单（含 7 个「上游已修」的分节）
│   └─ OUTDATED-MODS.md     # 两个整活 Mod 的版本过时说明
├─ overlay/                # ★ 平台补丁层：105 个文件，目录层次与上游一致
│   ├─ MANIFEST.sha256      # 本仓每个覆盖层文件的 sha256（完整性校验）
│   ├─ ORIGIN.sha256        # 你那边官方原版应有的 sha256（原样性校验；上游没有的记 ABSENT）
│   ├─ tools/mod-admin.html # ★ 单文件 Mod 管理页（服主专用；见上面「Mod 管理页」一节）
│   └─ server/ shared/ public/ docs/ tools/ test/ scripts/
├─ mods/                   # 21 个 Mod（每个自足；含两个 DJ 整活 Mod 的 OUTDATED.md）
└─ tools/
    ├─ apply-overlay.mjs    # ★ 一键叠补丁：--dry-run / 先备份 / 逐文件报告 / --rollback
    └─ publish-scan.mjs     # 发布前自检（令牌 / 素材 / 真实主机 / 本地路径 / 体积）
```

---

## 常见问题

**Q：下载下来发现没有 `public/assets/`，是不是没下全？**
A：不是。官方美术与字体**不在本仓**（上游规则：No game art in git）。请用官方 `tools/setup.mjs` 自取素材。

**Q：`apply-overlay.mjs` 报「冲突」，说我的文件和官方原版不一致？**
A：说明那个文件你（或别的 Mod）改过。脚本默认**拒绝覆盖**。确认要覆盖就加 `--force`（会先备份）。

**Q：装完 `/mods` 里两个 DJ Mod 显示一行错误？**
A：**预期行为**，见上一节。它们不装载、不崩服。

**Q：能商用吗？**
A：不能。代码是 GPL-3.0-or-later（GPL 本身允许商用**代码**），但**游戏素材与数据**不归我们，也不在授权范围内：
收费开服、付费房间、广告、打赏、打包进收费产品都不允许。

**Q：能不能只发 `mods/`、不叠覆盖层？**
A：那样 21 个 Mod 在纯上游 0.2.5 上**全部装不上**。

---

## 许可与致谢

- 本仓（覆盖层 + Mod + 文档）整体按 **GNU GPL v3 或任何更新版本（GPL-3.0-or-later）** 发布，全文见 [LICENSE](LICENSE)。
  **为什么必须是 GPL**：覆盖层是上游 GPL 代码的**派生作品**（copyleft）⇒ 没有选 MIT 的余地。
- 上游项目：**Stronghold Protocol**（`sganggs/Stronghold-Protocol`，GPL-3.0-or-later），本仓基于其 **0.2.5**。
- 上游 `NOTICE.md` 的完整口径（哪些属于上游、哪些属于鹰角/Yostar、非商业限制）见本仓 [NOTICE.md](NOTICE.md)。
- 第三方与署名（英文翻译 **@YuriRestia**、上游第三方库等）见 [THIRD-PARTY.md](THIRD-PARTY.md)。

**致谢**：上游 Stronghold Protocol 的作者与贡献者；「卫戍协议：盟约」的攻略与数据社区（PRTS 等）；
以及所有把 bug 报回来的人。
