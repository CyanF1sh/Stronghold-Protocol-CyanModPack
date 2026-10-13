# 卫戍协议 · CyanFish 平台补丁与 Mod 集

> 给《明日方舟》限时玩法「卫戍协议：盟约」的**非官方同人复刻项目**（上游 **Stronghold Protocol 0.2.6**）做的
> **平台补丁 + 14 个 Mod**。仓库里**只有我们自己写的代码与文档**，**不含任何官方素材**。
> ★ 唯一例外：`mods/cyanfish.dj-all/assets/amiya-spin.gif` —— 一张**同人二创表情包**（128×128 · 117 KB · 局内入口图标，**若侵权可联系删除**，见 [NOTICE.md](NOTICE.md) §5 与 [THIRD-PARTY.md](THIRD-PARTY.md) §5）。

---

## ⚠ 先看这里（三句话）

> **第一次来、想自己也跑一个？** 先看 **[docs/QUICKSTART.md](docs/QUICKSTART.md)** —— 它不讲命令，
> 只说清楚「**你要凑齐哪些文件**、**依次做哪几件事**」。

1. **这里没有游戏本体，下载本仓库不能直接玩。** 它是一个**补丁 + Mod 集**：先自己准备好**官方 0.2.6 版本体与素材**，
   再把本仓的补丁与 `mods/` 叠上去（见 [docs/INSTALL.md](docs/INSTALL.md)）。
2. **仓库里所有美术、语音、音乐都不是我们的**，因此**一个素材文件都没放**。本仓只含我们自己编写的代码与文档。
3. **禁止任何形式的盈利**（收费开服、付费房间、广告、打赏、打包进收费产品）。仅供**学习、研究和个人非商业娱乐**。

本仓库与鹰角网络（Hypergryph）、Yostar **没有任何关联**，也未获授权或认可。
若你是权利人并认为本仓库有不妥内容，请提 Issue，我们会尽快删除或下架。

---

## 这是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 14 个 **Mod**（自足目录：`mod.json` + `client`/`content`/`data` + `README.md`） | ❌ 不是整合包，**不含** `public/assets/**`（约 270 MB 官方美术）、`public/fonts/**` |
| 一层 **平台覆盖层**（105 个文件 / 3.3 MB）：Mod 装载器、插槽宿主、设置页外壳、Mod 开发规范等 | ❌ 不是上游 0.2.6 的 fork 分支，也不改上游的许可证 |
| 两个 **安装/自检工具**：`tools/apply-overlay.mjs`（一键叠补丁 + 可回滚）、`tools/publish-scan.mjs`（发布前自检） | ❌ 不含任何令牌、服务器地址、部署脚本 |

★ **为什么必须叠覆盖层**：这 14 个 Mod 依赖我们改过的平台接缝（Mod 装载器与插槽宿主）。
**只在纯上游 0.2.6 上放 `mods/`，14 个 Mod 全部装不上。**

---

## 30 秒安装

```bash
# 0) 先自己准备好官方 0.2.6 本体（步骤见 docs/INSTALL.md）
# 1) 干跑：只报告，不写任何文件
node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.6" --dry-run
# 2) 真跑：先备份，再逐文件叠补丁，并把 14 个 Mod 拷进 mods/
node tools/apply-overlay.mjs --target "D:\Stronghold-Protocol-0.2.6" --with-mods
# 3) 校验
cd "D:\Stronghold-Protocol-0.2.6" && node tools/mod.mjs validate
```

**第 3 步的预期输出**：`✓` **14 个全部通过 · 0 错误 · 退出码 0**。
装完的默认状态 = **14 个 Mod 全部启用**（覆盖层**不写** `mods/.state.json`）。

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

## 14 个 Mod 一览（一句话一个）

完整清单（版本号 / 轴 / 默认启停 / 每项开关）见 [docs/MODS-LIST.md](docs/MODS-LIST.md)。
**装完 = 14 个 Mod 全部启用。**

**玩法与界面**（7 个）
- `cyanfish.max-seats` —— 让房主自行设定**本房间**的联机人数，并按人数自动适配各项数值。
- `cyanfish.diy-34` —— 自选编队平衡性改造：只留一个 3 阶自选位；选了 5/6 阶干员后 3 阶位不生效。
- `cyanfish.online` —— 首页顶栏显示服务器当前在线人数与房间数（真值，默认 20 秒刷新）。
- `cyanfish.chat` —— 对局内一条可收起的聊天窗，消息同时以弹幕飘过。
- `cyanfish.announce` —— 玩家进服时自动弹出服主配置的公告，每条对同一玩家只显示一次。
- `cyanfish.banner` —— 服主发布的**实时**公告横幅，首页与对局内都会显示。
- `cyanfish.mod-settings` —— 所有 Mod 共用的设置外壳（别的 Mod 注册栏位，参数就出现在这一页）。

**Bug 修复**（2 个；合并包，**每项一个开关**）
- `cyanfish.fix-enemy` —— 敌人侧四项：索敌 / 巢涌者光环 / 元核孽生者神经毒素 / 铳攻速下限。
- `cyanfish.fix-mechanism` —— 机制侧三项：双转职叠层 / 不屈突袭 +5 技力 / 领袖也吃侵蚀。

**开发**（2 个）
- `cyanfish.debug-console` —— 局内调试控制台：只在单人 / 纯 AI 对局出现，可改资金、回合并发干员装备。
- `cyanfish.demo` —— **样例包**：一名示例干员「隐现·改」；想自己写 Mod 的话，从这个包开始读最省事。

★ **本仓只收已经上线的 Mod**（外加**样例包** `demo`）：未部署的实验性 Mod、以及**素材版权受限**的 Mod
（皮肤与语音包等，自带官方 / 联动素材副本）**都不在本仓**。
完整清单（含未发布内容）见覆盖层里的 `overlay/docs/MODS.md` **§12** —— **那是作者树的快照，不是本仓的发布清单**；
逐条理由见 [docs/MODS-LIST.md](docs/MODS-LIST.md)。

---

## 兼容性：为什么必须 0.2.6

- **14 个 Mod 的 `mod.json` 全部**写 `gameVersion: "0.2.6"`；
- **装载器要求 `gameVersion` 与本版游戏版本严格相等**，否则**整包被跳过**；
- 所以**游戏本体必须是官方 0.2.6**（上游 `package.json` 的 `"version": "0.2.6"`）。
  用 0.2.4 或更早：**14 个 Mod 会被整批拒装**。

覆盖层是按官方 **0.2.6** 逐字节对齐的（见 `overlay/ORIGIN.sha256`）：它记录了**每个文件在你那棵官方 0.2.6 上
应有的 sha256**，`apply-overlay.mjs` 会先核对再写 —— 只要你的本体是干净的 0.2.6，这一步不会失败。

---

## 目录结构

```
.
├─ README.md · RELEASE-NOTES.md · LICENSE · NOTICE.md · THIRD-PARTY.md · .gitignore
├─ docs/
│   ├─ INSTALL.md          # step-by-step 安装（含「自备正版 0.2.6 本体与素材」）
│   └─ MODS-LIST.md         # 14 个 Mod 逐条清单
├─ overlay/                # ★ 平台补丁层：105 个文件，目录层次与上游一致
│   ├─ MANIFEST.sha256      # 本仓每个覆盖层文件的 sha256（完整性校验）
│   ├─ ORIGIN.sha256        # 你那边官方原版应有的 sha256（原样性校验；上游没有的记 ABSENT）
│   ├─ tools/mod-admin.html # ★ 单文件 Mod 管理页（服主专用；见上面「Mod 管理页」一节）
│   └─ server/ shared/ public/ docs/ tools/ test/ scripts/
├─ mods/                   # 14 个 Mod（每个自足：mod.json + client/content/data + README.md）
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

**Q：能商用吗？**
A：不能。代码是 GPL-3.0-or-later（GPL 本身允许商用**代码**），但**游戏素材与数据**不归我们，也不在授权范围内：
收费开服、付费房间、广告、打赏、打包进收费产品都不允许。

**Q：能不能只发 `mods/`、不叠覆盖层？**
A：那样 14 个 Mod 在纯上游 0.2.6 上**全部装不上**。

---

## 许可与致谢

- 本仓（覆盖层 + Mod + 文档）整体按 **GNU GPL v3 或任何更新版本（GPL-3.0-or-later）** 发布，全文见 [LICENSE](LICENSE)。
  **为什么必须是 GPL**：覆盖层是上游 GPL 代码的**派生作品**（copyleft）⇒ 没有选 MIT 的余地。
- 上游项目：**Stronghold Protocol**（`sganggs/Stronghold-Protocol`，GPL-3.0-or-later），本仓基于其 **0.2.6**。
- 上游 `NOTICE.md` 的完整口径（哪些属于上游、哪些属于鹰角/Yostar、非商业限制）见本仓 [NOTICE.md](NOTICE.md)。
- 第三方与署名（英文翻译 **@YuriRestia**、上游第三方库等）见 [THIRD-PARTY.md](THIRD-PARTY.md)。

**致谢**：上游 Stronghold Protocol 的作者与贡献者；「卫戍协议：盟约」的攻略与数据社区（PRTS 等）；
以及所有把 bug 报回来的人。
