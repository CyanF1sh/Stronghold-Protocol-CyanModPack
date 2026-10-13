# 第三方与署名（THIRD-PARTY）

本仓**不含**任何官方素材，也**不含**任何第三方二进制。这份文件记录**需要署名或需要说明授权状态**的第三方内容。

## 1. 上游项目（本仓的基础）

| 项 | 内容 |
|---|---|
| 项目 | **Stronghold Protocol** —— `sganggs/Stronghold-Protocol` |
| 本仓对照版本 | **0.2.5**（本仓的覆盖层就是按这一版逐字节对齐的） |
| 许可证 | **GPL-3.0-or-later**（见上游 `LICENSE` / `NOTICE.md` §1） |
| 我们的使用方式 | 覆盖层是它的**派生作品**（改动 + 新增平台代码），因此本仓整体沿用 GPL-3.0-or-later |

## 2. 英文翻译署名（来自上游，予以保留）

上游 `NOTICE.md` §1 载明：界面英文文本 `public/i18n/en.json` 与游戏文本的补充译文
`tools/i18n/fallback-pr70.json` 的翻译以 GitHub PR #70（分支 `en-translation`）中
**@YuriRestia** 的翻译为基础，经项目所有者决定署名沿用，并随项目以 GPL-3.0-or-later 发布。

★ 本仓的覆盖层**包含** `public/i18n/en.json`（我们改过它）。
因此这份署名在本仓**继续有效**：**@YuriRestia** 的英文翻译以 GPL-3.0-or-later 随本仓一同分发。

## 3. `cyanfish.dj-bgm`：那首第三方曲子（**本仓不带**）

| 项 | 内容 |
|---|---|
| 曲目 | B 站 `BV1hXbN6VEKV`「🥳kkr：⚡️朋友的酒🍺DJ 完整版⚡️」，UP 主 **活跃黑江乐** |
| 原归档文件 | `assets/bgm/friends-wine-dj.m4a`（4.41 MB，DASH 音频轨 30280） |
| 授权状态 | **未取得权利人授权**；该 Mod 自己的说明写着「音乐与视频的著作权归原 UP 主与相关权利人所有，**不适用** GPL，禁止任何形式的收费与商业分发」 |
| 本仓的处理 | **不随包发布**（一个音频文件都没有）。`assets/bgm/` 里只留一份「自己放 BGM」的说明 |
| 署名 | 在此**如实注明出处与 UP 主**，供读者了解原归档的来源；本仓不因该署名而获得任何授权 |

★ 该 Mod 的**代码**是数据驱动的、不依赖任何一首具体的歌 ⇒ 去掉音频后功能照常（`tracks` 为空时页面上零痕迹）。
自己放曲子的三步说明见 `mods/cyanfish.dj-bgm/OUTDATED.md`；**请只放你自己有权使用的音频**。

## 4. 其它

- **npm 第三方库**（PixiJS、pixi-spine、Preact、htm、three.js、ws 等）：随**官方本体**安装，各自保留原许可证，
  见上游的 `THIRD-PARTY-NOTICES.md`（本仓不分发这些库）。
- **Spine Runtimes（上游 `NOTICE.md` §1 的附加许可）**：上游以 GPL-3.0 第 7 条附加许可允许把本项目与
  pixi-spine 中的 Spine Runtimes 组合后再分发；Spine Runtimes 本身仍受其自己的许可证约束。
  本仓不额外分发 Spine Runtimes。
- **`tools/local-extract/aklz4.py`（来自 isHarryh/Ark-Unpacker，BSD-3-Clause）**：**不在本仓**（本仓的覆盖层不含
  `tools/local-extract/**`）。它随官方本体发布，授权照旧。
- **游戏数据与素材**：版权归上海鹰角网络科技有限公司及其授权方所有，**不在本仓**，也不在 GPL 范围内
  （详见 [NOTICE.md](NOTICE.md) §2）。
