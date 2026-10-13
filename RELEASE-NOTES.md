# 首版发布说明（RELEASE NOTES）

**发布物**：卫戍协议 · CyanFish 平台补丁与 Mod 集 —— 首个开源版
**上游基线**：Stronghold Protocol **0.2.5**
**许可**：GPL-3.0-or-later（整仓）

---

## 这一版里有什么

| 组成 | 数量 | 体积 |
|---|---|---|
| **Mod** | **14 个目录 / 132 文件** | **3.8 MB** |
| **平台覆盖层**（Mod 平台本体 + 对上游 0.2.5 的改动） | **105 个文件** | **3.34 MB** |
| 工具 | `tools/apply-overlay.mjs`（一键叠补丁 · 可回滚）、`tools/publish-scan.mjs`（发布前自检） | — |
| **服主管理页** | `overlay/tools/mod-admin.html`（单文件 · 零外部依赖）+ `overlay/server/admin.js`（后端 API） | — |
| 文档 | 本文件 + `README.md` + `docs/INSTALL.md` + `docs/MODS-LIST.md` + `NOTICE.md` + `THIRD-PARTY.md` + `LICENSE` | — |

**总计约 7.3 MB / 251 文件**，最大单文件 **1.34 MB**（`mods/cyanfish.skinvoice/client/skinvoice.json` —— 皮肤 / 语音目录清单），
**无任何单文件接近 GitHub 的 100 MB 上限，不需要 Git LFS**。

## 平台亮点（覆盖层里我们新写的 38 个文件）

- **Mod 平台本体**：`server/mods/{loader,client,content,patch,zip}.js` —— 清单校验 / `apiVersion` / `loadAfter` /
  内容分层（L1..L4）/ 打包；开发规范 **`docs/MODS.md`**；CLI **`tools/mod.mjs`**。
- **客户端插槽宿主**：`public/js/ui/extensions.js`。
- **服主管理页**：`tools/mod-admin.html` + `server/admin.js` + `server/match/roomDetail.js`
  —— 查房明细 / 趋势图 / 官方 release 追踪（用法与安全口径见 [`README.md`](README.md) 的「Mod 管理页」一节）。
- **一键安装器**：`tools/apply-overlay.mjs`（`--dry-run` / 先备份 / 逐文件报告 / `--rollback`）
  与 **发布前自检** `tools/publish-scan.mjs`。

## 14 个 Mod（**已上线为主** + 样例包 + 三类例外）

`max-seats` · `diy-34` · `announce` · `online` · `chat` · `banner` · `mod-settings` ·
`debug-console` · `fix-enemy` · `fix-mechanism` · **`demo`（样例包）**

★ 收录口径：以**已在作者正式服上线的 Mod** 为主，另有三类例外：
1. **样例包** `cyanfish.demo`（它不是线上 Mod，但它是「想自己写 Mod 从哪开始读」的唯一入口）；
2. **代码进仓、官方素材自取**：`cyanfish.skinvoice` —— 随包**只有代码与目录**，**官方皮肤 / 语音素材请自行准备**（本仓**不含**任何官方素材副本）；
3. **作者亲自收录、尚未上线**：`cyanfish.dj-all`（纯界面整活）· `cyanfish.music-overlay`（音效替换，音频由玩家**自己上传**）。
未部署的实验性 Mod（只在测试实例跑的、退役的、上游已自行修复的）与归档的整活 Mod **整体移出本仓**；
**自带官方 / 联动素材副本**的 Mod **不在本仓**（★ 例：`cyanfish.dj-all` 原包 `assets/` 下两张第三方角色动图**未随本仓分发**；随包的只有 1 张 **128×128 同人二创表情包** `amiya-spin.gif`（局内入口图标），见该目录 `assets/图标说明.md` 与 [THIRD-PARTY.md](THIRD-PARTY.md) §5 —— **若侵权可联系删除**）。

逐条清单见 [`docs/MODS-LIST.md`](docs/MODS-LIST.md)；完整 Mod 清单（含未发布内容）见覆盖层 `overlay/docs/MODS.md` **§12**（作者树快照）。

## ⚠ 已知问题 / 预期症状（不是 bug）

1. **没有游戏本体**：本仓**不含**任何官方素材（美术 / 语音 / 音乐 / 字体 / 官方数据表）。
   必须先自备官方 0.2.5 本体与素材，再叠本仓的覆盖层与 `mods/`。
2. **14 个 Mod 全部要求 `gameVersion = 0.2.5`**：游戏本体不是 0.2.5 ⇒ **整批拒装**（设计如此，不是 bug）。

## 安装（三条命令）

```bash
node tools/apply-overlay.mjs --target "<你的官方 0.2.5 目录>" --dry-run   # 只报告
node tools/apply-overlay.mjs --target "<你的官方 0.2.5 目录>" --with-mods # 先备份再写入
cd "<你的官方 0.2.5 目录>" && node tools/mod.mjs validate                # 期望 14 个全部通过 · 0 错误
```

完整步骤（含「怎么自备官方 0.2.5」与常见问题）见 [`docs/INSTALL.md`](docs/INSTALL.md)。

## 质量门禁（本版发布前实测）

| 门 | 结果 |
|---|---|
| `tools/publish-scan.mjs --repo`（机密 / 素材 / 体积自检） | **FAIL 0**（WARN 全为上游原文误报 / 已打码的 IP 类） |
| `tools/publish-scan.mjs --mods`（白名单 Mod 严格档） | **FAIL 0**（★ 现有 1 条「白名单 Mod 缺失：`cyanfish.skinvoice`」WARN —— 它已裁定改造、尚未进仓，属**预期提醒**） |
| 14 个 Mod 的 `mod.json` 解析 / `apiVersion` / `gameVersion` | **14/14 通过**（`apiVersion` 全 `1` · `gameVersion` 全 `0.2.5`） |
| 全部 Mod 的 `.js` 过 `node --check` | **32/32 通过** |
| 两个工具脚本 `node --check` | `apply-overlay.mjs` · `publish-scan.mjs` 通过 |
| 真跑装载器（装完 `node tools/mod.mjs validate`） | 期望 **14 个全部通过 · 0 错误 · 退出码 0** |

> ★ 上表**本版（收窄后）已重跑**。以下三行是**首版（工序 host-028）实测**、本次**未重跑** —— 它们只与**覆盖层**有关，
> 而覆盖层本次**一个字节未改**：`apply-overlay.mjs` 在纯净 0.2.5 副本上的 dry-run / 真跑（105 可写 · 0 冲突 · 105/105 sha256 一致）·
> 应用结果 vs 线上覆盖层 105/105 一致 · `--rollback` 105/105 复原。

## 与上一版（服务器私有版）的差别

- **首次公开**：此前只在作者自己的服务器上使用（私有）。
- **去掉**：所有内部工作区路径、内部工序报告链接、部署路径与内部基建引用（逐处改成中性表述，代码语义未变）。
- **不带**：自带官方 / 联动素材的 Mod（`collab-six` / `makoto` / `archetto-skin`）—— 版权原因。
  ★ `cyanfish.skinvoice` 已裁定改造为「**代码进仓 / 官方素材由玩家自取**」（`host-037`），改造完成后加入下一版。
- **收窄（2026-10-13）**：本仓**只收已上线的 Mod** + 样例包 `demo` ⇒ Mod 目录 **21 → 11**；
  未部署的实验性 / 退役 Mod 与归档的整活 Mod **整体移出本仓**（它们仍在上游工作区里，只是不进本仓）。

## 许可证与致谢

- 整仓（覆盖层 + Mod + 文档）按 **GPL-3.0-or-later** 发布（覆盖层是上游 GPL 代码的派生作品 ⇒ copyleft）。
- 上游项目 **Stronghold Protocol**（`sganggs/Stronghold-Protocol`）的作者与贡献者；
  上游 `NOTICE.md` §1 的英文翻译署名 **@YuriRestia** 予以保留（见 [`THIRD-PARTY.md`](THIRD-PARTY.md)）。
- 《明日方舟》及「卫戍协议」相关的名称、角色、美术、模型、界面、音乐音效、文本与游戏数据，
  版权归上海鹰角网络科技有限公司及其授权方所有，**不在本仓、也不在 GPL 授权范围内**。
- **仅供学习、研究和个人非商业娱乐，禁止任何形式的盈利。** 完整条款见 [`NOTICE.md`](NOTICE.md)。
