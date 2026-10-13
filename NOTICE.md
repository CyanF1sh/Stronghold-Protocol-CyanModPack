# 版权与使用声明（NOTICE）

**本仓 = 卫戍协议 · CyanFish 平台补丁与 Mod 集**：给《明日方舟》限时玩法「卫戍协议：盟约」的
**非官方同人复刻项目**（上游 **Stronghold Protocol 0.2.5**）做的**平台覆盖层 + 21 个 Mod**。

与上海鹰角网络科技有限公司（Hypergryph）、Yostar 及其关联方**没有任何关联**，也未获得其授权或认可。

---

## 1. 本仓的代码许可证：GPL-3.0-or-later

Copyright (C) 2026 CyanFish（本仓覆盖层、Mod 与文档的作者）

- 本仓自己编写的源代码与文档文字（**覆盖层 105 个文件**、`mods/**` 的 21 个 Mod、本仓 `docs/**` 与根级文档）
  以 **GNU 通用公共许可证第 3 版或（由你选择）任何更新版本**（**GPL-3.0-or-later**）发布，全文见 [LICENSE](LICENSE)。
- **为什么整仓是 GPL**：覆盖层是**上游 GPL 代码的派生作品**（copyleft）⇒ 我们没有选 MIT / Apache-2.0 的余地。
  Mod 目录与覆盖层同仓分发，边界无法逐文件切干净，因此**整仓统一 GPL-3.0-or-later**。
- 你可以按该许可证的条件使用、修改和再分发这些代码。

## 2. 上游项目与它的口径

- **上游**：Stronghold Protocol（`sganggs/Stronghold-Protocol`），本仓基于其 **0.2.5** 版本；
  上游自身以 **GPL-3.0-or-later** 发布，并在其 `NOTICE.md` §1 里给出同样的许可证声明
  （Copyright (C) 2026 Stronghold-Protocol contributors）。
- **上游 `NOTICE.md` §2 的原文口径**（同样适用于本仓，逐条照录其含义）：
  《明日方舟》及「卫戍协议」相关的全部**名称、角色、美术、Spine 模型、界面图、音乐音效、文本与游戏数据**，
  版权归上海鹰角网络科技有限公司及其授权方（Yostar 等）所有。具体包括 Release 完整包中的
  `public/assets/**`（含从官方客户端本地提取的模型与贴图）与 `public/fonts/**`、由官方数据表生成的
  `data/*.json` 与 `data/i18n/*.json`、游戏截图、以及 `docs/` 中引用的社区页面文字。
  这些内容**不在 GPL-3.0 授权范围内**，上游与本仓都无权就它们向任何人授予任何权利。
- **上游 `NOTICE.md` §3 的原文口径**：仅供**学习、研究和个人非商业娱乐**；包含或依赖这些素材的一切内容
  —— Release 完整包、架设的服务器、截图、录像与直播等 —— 都**不得用于任何形式的盈利**
  （出售或付费分发、收费开服 / 付费房间 / 会员、植入广告、与项目挂钩的打赏或众筹、打包进收费产品）。
  **GPL 本身允许商业使用代码**，上述限制针对的是不属于本项目的游戏素材与数据。
- 上游还有一条硬规则，本仓照做：**No game art in git.**

## 3. 本仓**不含**什么（可自查）

| 不含 | 说明 |
|---|---|
| 官方美术 / 模型 / 界面图 | `public/assets/**` 一个文件都没有 |
| 官方语音 / 音乐 / 音效 | 一个音频文件都没有（含 `cyanfish.dj-bgm` 那首第三方曲子，见 [THIRD-PARTY.md](THIRD-PARTY.md)） |
| 官方字体 | `public/fonts/**` 一个文件都没有 |
| 官方数据表拷贝 | 没有 `data/*.json` 拷贝；Mod 里的 `data/*.json` 是**我们写的局部补丁**（只写要改的键） |
| 游戏本体 | 本仓是**补丁 + Mod**，游玩需自备官方 0.2.5 本体与素材 |

自查命令：`node tools/publish-scan.mjs --repo .`（会检查素材文件、令牌、真实主机名、本地绝对路径、体积）。

## 4. 仅限非商业用途

- 本项目仅供**学习、研究和个人非商业娱乐**。
- 游戏素材与数据的权利人没有授权本项目或其使用者进行任何商业使用 ⇒ 包含或依赖这些素材的一切内容
  （架设的服务器、截图、录像与直播等）都**不得用于任何形式的盈利**。
- 再分发本仓时，请保留本声明、[LICENSE](LICENSE) 与 [THIRD-PARTY.md](THIRD-PARTY.md)，并同样注明非官方、非商业。

## 5. 权利人通知与删除

如果你是相关权利人，认为本仓的任何内容不妥，请在本仓提交 Issue，我们会尽快删除相关内容或下架本仓。

## 6. 免责声明

- 本仓按「原样」提供，**不附带任何明示或暗示的担保**（见 LICENSE 第 15、16 条）。
- 使用、架设或公开本仓内容的风险（网络安全、第三方联机工具与服务、当地法律法规）由使用者自行承担。
- 本仓**不需要也不会索取**任何游戏账号；`apply-overlay.mjs` **不联网**，只在你指定的本地目录里读写文件。

---

**English summary.** Unofficial, non-commercial fan project: a **platform patch layer plus 21 mods** for the
unofficial Stronghold Protocol remake, targeting upstream **0.2.5**. Our own code and docs are
**GPL-3.0-or-later** (the overlay is a derivative of upstream GPL code). All Arknights names, art, models,
audio and data are © Hypergryph / Yostar and their licensors, are **not** included in this repository and are
**not** covered by the GPL. Study and personal non-commercial use only: no selling, paid distribution, paid
hosting, ads, donations or any other monetisation. Rights holders can request removal through an issue.
