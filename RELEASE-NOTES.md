# 首版发布说明（RELEASE NOTES）

**发布物**：卫戍协议 · CyanFish 平台补丁与 Mod 集 —— 首个开源版
**上游基线**：Stronghold Protocol **0.2.5**
**许可**：GPL-3.0-or-later（整仓）

---

## 这一版里有什么

| 组成 | 数量 | 体积 |
|---|---|---|
| **Mod** | **21 个目录 / 135 文件** | **1.10 MB** |
| **平台覆盖层**（Mod 平台本体 + 对上游 0.2.5 的改动） | **105 个文件** | **3.34 MB** |
| 工具 | `tools/apply-overlay.mjs`（一键叠补丁 · 可回滚）、`tools/publish-scan.mjs`（发布前自检） | — |
| 文档 | 本文件 + `README.md` + `docs/INSTALL.md` + `docs/MODS-LIST.md` + `docs/OUTDATED-MODS.md` + `NOTICE.md` + `THIRD-PARTY.md` + `LICENSE` | — |

**总计约 4.5 MB / 250+ 文件**，最大单文件 **331 KB**（覆盖层里的 `docs/MODS.md` —— 平台 Mod 开发规范），
**无任何单文件接近 GitHub 的 100 MB 上限，不需要 Git LFS**。

## 21 个 Mod = 12 个正常装载 + 2 个整活（被版本门槛跳过）+ 7 个历史归档（默认停用）

- **12 个正常装载**：`max-seats` · `diy-34` · `boss-pairing` · `online` · `chat` · `announce` · `banner` ·
  `mod-settings` · `fix-enemy` · `fix-mechanism` · `debug-console` · `demo`
- **2 个整活**：`dj-models` **v1.6.1** · `dj-bgm` **v1.0.1**（`gameVersion` 都是 **0.2.4**，当前 **0.2.5**）
- **7 个历史归档**（上游已修 / 已退役，默认停用）：`boss-hp` · `loadout-io` · `fix-operator` ·
  `fix-dsubrl-noattack` · `fix-targeting` · `fix-thorn2-stack` · `fix-egir-bond`

逐条清单见 [`docs/MODS-LIST.md`](docs/MODS-LIST.md)。

## ⚠ 已知问题 / 预期症状（不是 bug）

1. **两个 DJ 整活 Mod 版本过时**：在 0.2.5 上会**列表可见 + 一行「gameVersion=0.2.4 与当前游戏版本 0.2.5 不一致」+ `skipped` 跳过**，
   **不装载、不崩服**。`node tools/mod.mjs validate` 会因此报 **`2/21 个 Mod 校验未通过`** 并以退出码 1 结束 ——
   **这就是预期输出**。详见 [`docs/OUTDATED-MODS.md`](docs/OUTDATED-MODS.md)。
2. **`dj-bgm` 不带音频**：原归档那首第三方曲子未取得授权，本仓不随包发布（代码逐字节原样，曲目数据驱动，自己放）。
3. **7 个历史归档 Mod 默认停用**：`apply-overlay.mjs --with-mods` 在 `mods/.state.json` 不存在时会写一份停用它们的状态。
   为什么必须停用：其中 `boss-hp` 是**数据补丁**（会再次改写血池数值），`fix-targeting` / `fix-dsubrl-noattack` /
   `fix-thorn2-stack` / `fix-egir-bond` 会与上游已内建的修复**重复**，`fix-targeting` 自己的 README 还标了
   「会新增一处隐匿误伤」。它们仍然保留在仓里，供源码参考与回滚。
4. **没有游戏本体**：本仓**不含**任何官方素材（美术 / 语音 / 音乐 / 字体 / 官方数据表）。
   必须先自备官方 0.2.5 本体与素材，再叠本仓的覆盖层与 `mods/`。

## 安装（三条命令）

```bash
node tools/apply-overlay.mjs --target "<你的官方 0.2.5 目录>" --dry-run   # 只报告
node tools/apply-overlay.mjs --target "<你的官方 0.2.5 目录>" --with-mods # 先备份再写入
cd "<你的官方 0.2.5 目录>" && node tools/mod.mjs validate                # 期望 2/21 未通过（就是那两个 DJ）
```

完整步骤（含「怎么自备官方 0.2.5」与常见问题）见 [`docs/INSTALL.md`](docs/INSTALL.md)。

## 质量门禁（本版发布前实测）

| 门 | 结果 |
|---|---|
| `tools/publish-scan.mjs --repo`（机密 / 素材 / 体积自检） | **FAIL 0**（2 处已登记的上游原文误报降级为 WARN） |
| `tools/publish-scan.mjs --mods`（21 个 Mod 严格档） | **FAIL 0** |
| 21 个 Mod 的 `mod.json` 解析 / `apiVersion` / `gameVersion` | 21/21 通过 |
| 全部 Mod 的 `.js` 过 `node --check` | 56/56 通过 |
| **纯净 0.2.5 副本上真跑 `apply-overlay.mjs`** | `--dry-run` 105 可写 / 0 冲突；真跑 105/105 sha256 一致 |
| 应用结果 vs 线上覆盖层 | 105/105 一致（80 个逐字节相同，25 个仅差「清泄密点」的注释文字） |
| `--rollback` | 105/105 回到打补丁前状态 |
| 真跑装载器 | 21 个列表可见 · 12 个生效 · 7 个停用 · 2 个 DJ 跳过 · 无其它错误 |

## 与上一版（服务器私有版）的差别

- **首次公开**：此前只在作者自己的服务器上使用（私有）。
- **去掉**：所有内部工作区路径、内部工序报告链接、部署路径与内部基建引用（逐处改成中性表述，代码语义未变）。
- **不带**：`dj-bgm` 的第三方音频（未取得授权）。
- **不带**：自带官方 / 联动素材的 4 个 Mod（`skinvoice` / `collab-six` / `makoto` / `archetto-skin`）—— 版权原因，永久排除。
- **澄清**：7 个「上游已修 / 已退役」的 Mod 归入独立一节，并**默认停用**（免得有人以为装坏了，也免得真的重复修）。

## 许可证与致谢

- 整仓（覆盖层 + Mod + 文档）按 **GPL-3.0-or-later** 发布（覆盖层是上游 GPL 代码的派生作品 ⇒ copyleft）。
- 上游项目 **Stronghold Protocol**（`sganggs/Stronghold-Protocol`）的作者与贡献者；
  上游 `NOTICE.md` §1 的英文翻译署名 **@YuriRestia** 予以保留（见 [`THIRD-PARTY.md`](THIRD-PARTY.md)）。
- 《明日方舟》及「卫戍协议」相关的名称、角色、美术、模型、界面、音乐音效、文本与游戏数据，
  版权归上海鹰角网络科技有限公司及其授权方所有，**不在本仓、也不在 GPL 授权范围内**。
- **仅供学习、研究和个人非商业娱乐，禁止任何形式的盈利。** 完整条款见 [`NOTICE.md`](NOTICE.md)。
